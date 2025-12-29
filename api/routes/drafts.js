import { getSupabaseClient } from '../config/supabase.js';
const supabase = getSupabaseClient();

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req) {
  // 如果 req.body 已经有内容（Vercel 环境），直接返回
  if (req.body && Object.keys(req.body).length > 0) {
    return req.body;
  }
  
  // 本地开发环境：从流中读取
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({}); // 解析失败返回空对象
      }
    });
    req.on('error', reject);
  });
}
async function verifyToken(token) {
  try {
    if (!token) {
      return { valid: false, error: '缺少 token' };
    }

    const supabase = getSupabaseClient(); 
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { valid: false, error: 'Token 无效或已过期' };
    }

    return { valid: true, user };
  } catch (error) {
    console.error('Token 验证失败:', error);
    return { valid: false, error: error.message };
  }
}


// 处理草稿相关路由
export async function handleDraftsRoute(pathname, req, res) {
    try {
        // GET /api/drafts - 获取用户所有草稿
        if (pathname === '/api/drafts' && req.method === 'GET') {
            console.log('🔵 获取用户草稿列表');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            // 获取用户的所有草稿
            const { data: drafts, error } = await supabase
                .from('drafts')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('获取草稿列表失败:', error);
                return sendJson(res, 400, { error: '获取草稿列表失败' });
            }
            
            return sendJson(res, 200, drafts || []);
        }
        
        // GET /api/drafts/:id - 获取单个草稿
        else if (pathname.match(/^\/api\/drafts\/[^\/]+$/) && req.method === 'GET') {
            console.log('🔵 获取单个草稿');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const draftId = pathname.split('/').pop();
            
            // 获取草稿详情
            const { data: draft, error } = await supabase
                .from('drafts')
                .select('*')
                .eq('id', draftId)
                .eq('user_id', user.id)
                .single();
            
            if (error) {
                console.error('获取草稿失败:', error);
                return sendJson(res, 404, { error: '草稿不存在或无权限访问' });
            }
            
            return sendJson(res, 200, draft);
        }
        
        // DELETE /api/drafts/:id - 删除草稿
        else if (pathname.match(/^\/api\/drafts\/[^\/]+$/) && req.method === 'DELETE') {
            console.log('🔵 删除草稿');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const draftId = pathname.split('/').pop();
            
            // 先获取草稿信息，以便删除相关文件
            const { data: draft, error: fetchError } = await supabase
                .from('drafts')
                .select('*')
                .eq('id', draftId)
                .eq('user_id', user.id)
                .single();
            
            if (fetchError || !draft) {
                console.error('获取草稿信息失败:', fetchError);
                return sendJson(res, 404, { error: '草稿不存在或无权限删除' });
            }
            
            console.log('准备删除草稿:', draft.id, draft.type);
            const filesToDelete = [];
            
            // 从URL中提取文件路径的辅助函数
            const extractFileNameFromUrl = (url) => {
                if (!url || typeof url !== 'string') return null;
                
                // 检查是否是Supabase Storage URL
                const storageUrlPattern = /\/storage\/v1\/object\/public\/design-files\/(.+)/;
                const match = url.match(storageUrlPattern);
                return match ? match[1] : null;
            };

            // 根据草稿类型处理不同的删除逻辑
            if (draft.type === 'svg') {
                console.log('处理SVG草稿删除...');
                
                // 1. 删除SVG文件本身
                if (draft.data) {
                    // 从data中获取Storage URL
                    if (draft.data.storageUrl) {
                        const svgFileName = extractFileNameFromUrl(draft.data.storageUrl);
                        if (svgFileName) {
                            filesToDelete.push(svgFileName);
                            console.log('添加SVG文件到删除列表:', svgFileName);
                        }
                    }
                    
                    // 或者从fileName字段获取
                    if (draft.data.fileName) {
                        if (!filesToDelete.includes(draft.data.fileName)) {
                            filesToDelete.push(draft.data.fileName);
                            console.log('添加SVG文件到删除列表(从fileName):', draft.data.fileName);
                        }
                    }
                }
                
                // 2. 删除SVG预览图
                if (draft.front_preview_image) {
                    // 如果预览图是Storage URL
                    const previewFileName = extractFileNameFromUrl(draft.front_preview_image);
                    if (previewFileName && !filesToDelete.includes(previewFileName)) {
                        filesToDelete.push(previewFileName);
                        console.log('添加SVG预览图到删除列表:', previewFileName);
                    }
                }
                
            } else if (draft.type === 'tshirt') {
                console.log('处理T恤草稿删除...');
                const designData = draft.data;
                
                if (designData) {
                    // 1. 收集正面设计图片文件
                    if (designData.frontImages && Array.isArray(designData.frontImages)) {
                        designData.frontImages.forEach((img, index) => {
                            if (img.storageFile) {
                                if (img.storageFile.fileName) {
                                    filesToDelete.push(img.storageFile.fileName);
                                    console.log(`添加正面图片${index}:`, img.storageFile.fileName);
                                }
                                // 也检查publicUrl
                                else if (img.storageFile.publicUrl) {
                                    const fileName = extractFileNameFromUrl(img.storageFile.publicUrl);
                                    if (fileName && !filesToDelete.includes(fileName)) {
                                        filesToDelete.push(fileName);
                                        console.log(`添加正面图片${index}(从URL):`, fileName);
                                    }
                                }
                            }
                        });
                    }
                    
                    // 2. 收集背面设计图片文件
                    if (designData.backImages && Array.isArray(designData.backImages)) {
                        designData.backImages.forEach((img, index) => {
                            if (img.storageFile) {
                                if (img.storageFile.fileName) {
                                    filesToDelete.push(img.storageFile.fileName);
                                    console.log(`添加背面图片${index}:`, img.storageFile.fileName);
                                }
                                // 也检查publicUrl
                                else if (img.storageFile.publicUrl) {
                                    const fileName = extractFileNameFromUrl(img.storageFile.publicUrl);
                                    if (fileName && !filesToDelete.includes(fileName)) {
                                        filesToDelete.push(fileName);
                                        console.log(`添加背面图片${index}(从URL):`, fileName);
                                    }
                                }
                            }
                        });
                    }
                    
                    // 3. 处理预览文件（如果存储在Storage中）
                    if (designData.frontPreviewFile && designData.frontPreviewFile.fileName) {
                        filesToDelete.push(designData.frontPreviewFile.fileName);
                        console.log('添加正面预览文件:', designData.frontPreviewFile.fileName);
                    }
                    
                    if (designData.backPreviewFile && designData.backPreviewFile.fileName) {
                        filesToDelete.push(designData.backPreviewFile.fileName);
                        console.log('添加背面预览文件:', designData.backPreviewFile.fileName);
                    }
                }

                // 4. 检查数据库字段中的预览图URL
                if (draft.front_preview_image) {
                    const frontPreviewFileName = extractFileNameFromUrl(draft.front_preview_image);
                    if (frontPreviewFileName && !filesToDelete.includes(frontPreviewFileName)) {
                        filesToDelete.push(frontPreviewFileName);
                        console.log('添加正面预览图(从数据库字段):', frontPreviewFileName);
                    }
                }

                if (draft.back_preview_image) {
                    const backPreviewFileName = extractFileNameFromUrl(draft.back_preview_image);
                    if (backPreviewFileName && !filesToDelete.includes(backPreviewFileName)) {
                        filesToDelete.push(backPreviewFileName);
                        console.log('添加背面预览图(从数据库字段):', backPreviewFileName);
                    }
                }
            }

            // 去重
            const uniqueFilesToDelete = [...new Set(filesToDelete)];
            console.log('准备删除的文件总数:', uniqueFilesToDelete.length);
            console.log('文件列表:', uniqueFilesToDelete);

            // 批量删除Storage文件
            if (uniqueFilesToDelete.length > 0) {
                console.log('开始删除Storage文件...');
                
                // Supabase Storage的remove方法可以批量删除
                const { data: deleteResult, error: storageError } = await supabase.storage
                    .from('design-files')
                    .remove(uniqueFilesToDelete);
                
                if (storageError) {
                    console.error('删除Storage文件失败:', storageError);
                    // 不中断流程，继续删除数据库记录
                } else {
                    console.log('Storage文件删除成功:', deleteResult);
                }
            }

            // 删除数据库记录
            console.log('删除数据库记录...');
            const { error: deleteError } = await supabase
                .from('drafts')
                .delete()
                .eq('id', draftId);

            if (deleteError) {
                console.error('删除数据库记录失败:', deleteError);
                return sendJson(res, 400, { error: '删除草稿失败' });
            }

            return sendJson(res, 200, { 
                success: true, 
                message: '草稿删除成功',
                filesDeleted: uniqueFilesToDelete.length
            });
            
        }
        
        // POST /api/drafts - 创建新草稿
        else if (pathname === '/api/drafts' && req.method === 'POST') {
            console.log('🔵 创建新草稿');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const body = await readBody(req);
            const { type, title, data, front_preview_image, back_preview_image, sizes } = body;
            
            if (!type || !title) {
                return sendJson(res, 400, { error: '缺少草稿类型或标题' });
            }
            
            // 创建草稿
            const { data: draft, error: insertError } = await supabase
                .from('drafts')
                .insert({
                    user_id: user.id,
                    type,
                    title,
                    data: data || {},
                    front_preview_image: front_preview_image || null,
                    back_preview_image: back_preview_image || null,
                    sizes: sizes || {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (insertError) {
                console.error('创建草稿失败:', insertError);
                return sendJson(res, 400, { error: '创建草稿失败' });
            }
            
            return sendJson(res, 201, { success: true, draft });
        }
        
        // PATCH /api/drafts/:id - 更新草稿
        else if (pathname.match(/^\/api\/drafts\/[^\/]+$/) && req.method === 'PATCH') {
            console.log('🔵 更新草稿');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const draftId = pathname.split('/').pop();
            const body = await readBody(req);
            
            // 验证草稿是否存在且属于该用户
            const { data: existingDraft } = await supabase
                .from('drafts')
                .select('id')
                .eq('id', draftId)
                .eq('user_id', user.id)
                .single();
            
            if (!existingDraft) {
                return sendJson(res, 404, { error: '草稿不存在或无权限编辑' });
            }
            
            // 准备更新数据
            const updateData = {
                updated_at: new Date().toISOString()
            };
            
            // 只更新提供的字段
            if (body.title !== undefined) updateData.title = body.title;
            if (body.data !== undefined) updateData.data = body.data;
            if (body.front_preview_image !== undefined) updateData.front_preview_image = body.front_preview_image;
            if (body.back_preview_image !== undefined) updateData.back_preview_image = body.back_preview_image;
            if (body.sizes !== undefined) updateData.sizes = body.sizes;
            
            // 更新草稿
            const { error: updateError } = await supabase
                .from('drafts')
                .update(updateData)
                .eq('id', draftId);
            
            if (updateError) {
                console.error('更新草稿失败:', updateError);
                return sendJson(res, 400, { error: '更新草稿失败' });
            }
            
            return sendJson(res, 200, { success: true, draftId });
        }
        
        // PATCH /api/drafts/:id/update-sizes - 更新草稿尺码信息
        else if (pathname.match(/^\/api\/drafts\/[^\/]+\/update-sizes$/) && req.method === 'PATCH') {
            console.log('🔵 更新草稿尺码信息');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const draftId = pathname.split('/')[3]; // 注意：pathname是 /api/drafts/:id/update-sizes
            const body = await readBody(req);
            const { sizeQuantities } = body;
            
            if (!sizeQuantities || typeof sizeQuantities !== 'object') {
                return sendJson(res, 400, { error: '无效的尺码数据' });
            }
            
            // 验证草稿是否存在且属于该用户
            const { data: existingDraft } = await supabase
                .from('drafts')
                .select('id, data')
                .eq('id', draftId)
                .eq('user_id', user.id)
                .single();
            
            if (!existingDraft) {
                return sendJson(res, 404, { error: '草稿不存在或无权限编辑' });
            }
            
            // 更新草稿数据和尺码
            const updatedDraftData = {
                ...existingDraft.data,
                sizeQuantities: sizeQuantities
            };
            
            const { error: updateError } = await supabase
                .from('drafts')
                .update({
                    data: updatedDraftData,
                    sizes: sizeQuantities,
                    updated_at: new Date().toISOString()
                })
                .eq('id', draftId);
            
            if (updateError) {
                console.error('更新草稿尺码失败:', updateError);
                return sendJson(res, 400, { error: '更新草稿尺码失败' });
            }
            
            return sendJson(res, 200, { success: true, draftId });
        }
        
        return null; // 让其他路由处理
        
    } catch (error) {
        console.error('Drafts route error:', error);
        return sendJson(res, 500, { error: error.message });
    }
}

