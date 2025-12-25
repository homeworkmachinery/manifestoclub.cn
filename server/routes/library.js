import { getSupabaseClient } from '../config/supabase.js';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
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

// ==================== 主处理函数 ====================

// 处理图书馆相关路由
export async function handleLibraryRoute(pathname, req, res) {
    try {
        // GET /api/library - 获取用户图书馆数据
        if (pathname === '/api/library' && req.method === 'GET') {
            console.log('🔵 获取图书馆数据');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            // 并行获取所有数据
            const [
                wantBooksResult,
                readingBooksResult,
                userNotesResult
            ] = await Promise.all([
                // 获取想读书籍
                supabase
                    .from('book_wants')
                    .select('book_id, created_at')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false }),
                
                // 获取在读书籍
                supabase
                    .from('book_readings')
                    .select('book_id, created_at')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false }),
                
                // 获取用户笔记
                supabase
                    .from('book_notes')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
            ]);
            
            if (wantBooksResult.error) {
                console.error('获取想读书籍失败:', wantBooksResult.error);
                throw wantBooksResult.error;
            }
            
            if (readingBooksResult.error) {
                console.error('获取在读书籍失败:', readingBooksResult.error);
                throw readingBooksResult.error;
            }
            
            if (userNotesResult.error) {
                console.error('获取用户笔记失败:', userNotesResult.error);
                throw userNotesResult.error;
            }
            
            const wantBooks = wantBooksResult.data || [];
            const readingBooks = readingBooksResult.data || [];
            const userNotes = userNotesResult.data || [];
            
            // 按书籍ID分组笔记并获取注解
            const notesByBook = {};
            const noteAnnotationsPromises = [];
            
            if (userNotes.length > 0) {
                for (const note of userNotes) {
                    if (!notesByBook[note.book_id]) {
                        notesByBook[note.book_id] = [];
                    }
                    notesByBook[note.book_id].push(note);
                    
                    // 获取该笔记的注解
                    noteAnnotationsPromises.push(
                        supabase
                            .from('note_annotations')
                            .select('*')
                            .eq('note_id', note.id)
                            .order('display_order', { ascending: true })
                            .then(({ data: annotations }) => {
                                note.annotations = annotations || [];
                                return note;
                            })
                    );
                }
                
                // 等待所有注解获取完成
                await Promise.all(noteAnnotationsPromises);
            }
            
            return sendJson(res, 200, {
                wantBooks,
                readingBooks,
                userNotes,
                notesByBook
            });
        }
        
        // GET /api/library/notes/:noteId - 获取单个笔记详情
       else if (pathname.match(/^\/api\/library\/notes\/[^\/]+$/) && req.method === 'GET') {
    const noteId = pathname.split('/').pop();
    console.log(`🔵 处理: GET /api/library/notes/${noteId}`);
    
    // 这里是关键修复：使用 verifyToken 函数而不是直接 supabase.auth.getUser
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    // 使用 verifyToken 函数验证
    const authResult = await verifyToken(token);
    if (!authResult.valid) {
        return sendJson(res, 401, { error: authResult.error });
    }
    
    const user = authResult.user;
            
            // 获取笔记详情
            const supabase = getSupabaseClient();
            const { data: note, error: noteError } = await supabase
                .from('book_notes')
                .select('*')
                .eq('id', noteId)
                .eq('user_id', user.id)
                .single();
            
            if (noteError) {
                console.error('获取笔记失败:', noteError);
                if (noteError.code === 'PGRST116') { // 没有找到记录
                    return sendJson(res, 404, { error: '笔记不存在' });
                }
                return sendJson(res, 400, { error: '获取笔记失败' });
            }
            
            console.log(`✅ 找到笔记: ${note.id}`);
            
            // 获取笔记注解
            const { data: annotations } = await supabase
                .from('note_annotations')
                .select('*')
                .eq('note_id', noteId)
                .order('display_order', { ascending: true });
            
            note.annotations = annotations || [];
            
            return sendJson(res, 200, note);
        }
        
        // PATCH /api/library/notes/:noteId - 更新笔记
        else if (pathname.match(/^\/api\/library\/notes\/[^\/]+$/) && req.method === 'PATCH') {
            console.log('🔵 更新笔记');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const noteId = pathname.split('/').pop();
            const body = await readBody(req);
            
            // 验证笔记是否存在且属于该用户
            const { data: existingNote } = await supabase
                .from('book_notes')
                .select('id')
                .eq('id', noteId)
                .eq('user_id', user.id)
                .single();
            
            if (!existingNote) {
                return sendJson(res, 404, { error: '笔记不存在或无权限编辑' });
            }
            
            // 准备更新数据
            const updateData = {
                content: body.content,
                page_start: parseInt(body.page_start) || null,
                page_end: body.page_end ? parseInt(body.page_end) : null,
                updated_at: new Date().toISOString()
            };
            
            // 更新笔记
            const { error: updateError } = await supabase
                .from('book_notes')
                .update(updateData)
                .eq('id', noteId);
            
            if (updateError) {
                console.error('更新笔记失败:', updateError);
                return sendJson(res, 400, { error: '更新笔记失败' });
            }
            
            return sendJson(res, 200, { success: true, noteId });
        }
        
        // DELETE /api/library/notes/:noteId - 删除笔记
        else if (pathname.match(/^\/api\/library\/notes\/[^\/]+$/) && req.method === 'DELETE') {
            console.log('🔵 删除笔记');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const noteId = pathname.split('/').pop();
            
            // 验证笔记是否存在且属于该用户
            const { data: existingNote } = await supabase
                .from('book_notes')
                .select('id')
                .eq('id', noteId)
                .eq('user_id', user.id)
                .single();
            
            if (!existingNote) {
                return sendJson(res, 404, { error: '笔记不存在或无权限删除' });
            }
            
            // 先删除该笔记的所有注解
            await supabase
                .from('note_annotations')
                .delete()
                .eq('note_id', noteId);
            
            // 删除笔记
            const { error: deleteError } = await supabase
                .from('book_notes')
                .delete()
                .eq('id', noteId);
            
            if (deleteError) {
                console.error('删除笔记失败:', deleteError);
                return sendJson(res, 400, { error: '删除笔记失败' });
            }
            
            return sendJson(res, 200, { success: true, noteId });
        }
        
        // POST /api/library/book-wants - 添加想读书籍
        else if (pathname === '/api/library/book-wants' && req.method === 'POST') {
            console.log('🔵 添加想读书籍');
            
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
            const { book_id } = body;
            
            if (!book_id) {
                return sendJson(res, 400, { error: '缺少书籍ID' });
            }
            
            // 检查是否已经存在
            const { data: existing } = await supabase
                .from('book_wants')
                .select('id')
                .eq('user_id', user.id)
                .eq('book_id', book_id)
                .single();
            
            if (existing) {
                return sendJson(res, 200, { success: true, message: '已在想读书籍中' });
            }
            
            // 添加到想读书籍
            const { error } = await supabase
                .from('book_wants')
                .insert({
                    user_id: user.id,
                    book_id,
                    created_at: new Date().toISOString()
                });
            
            if (error) {
                console.error('添加想读书籍失败:', error);
                return sendJson(res, 400, { error: '添加想读书籍失败' });
            }
            
            return sendJson(res, 200, { success: true });
        }
        
        // DELETE /api/library/book-wants/:bookId - 移除想读书籍
        else if (pathname.match(/^\/api\/library\/book-wants\/[^\/]+$/) && req.method === 'DELETE') {
            console.log('🔵 移除想读书籍');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const bookId = pathname.split('/').pop();
            
            const { error } = await supabase
                .from('book_wants')
                .delete()
                .eq('user_id', user.id)
                .eq('book_id', bookId);
            
            if (error) {
                console.error('移除想读书籍失败:', error);
                return sendJson(res, 400, { error: '移除想读书籍失败' });
            }
            
            return sendJson(res, 200, { success: true });
        }
        
        // POST /api/library/book-readings - 添加在读书籍
        else if (pathname === '/api/library/book-readings' && req.method === 'POST') {
            console.log('🔵 添加在读书籍');
            
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
            const { book_id } = body;
            
            if (!book_id) {
                return sendJson(res, 400, { error: '缺少书籍ID' });
            }
            
            // 检查是否已经存在
            const { data: existing } = await supabase
                .from('book_readings')
                .select('id')
                .eq('user_id', user.id)
                .eq('book_id', book_id)
                .single();
            
            if (existing) {
                return sendJson(res, 200, { success: true, message: '已在在读书籍中' });
            }
            
            // 添加到在读书籍
            const { error } = await supabase
                .from('book_readings')
                .insert({
                    user_id: user.id,
                    book_id,
                    created_at: new Date().toISOString()
                });
            
            if (error) {
                console.error('添加在读书籍失败:', error);
                return sendJson(res, 400, { error: '添加在读书籍失败' });
            }
            
            return sendJson(res, 200, { success: true });
        }
        
        // DELETE /api/library/book-readings/:bookId - 移除在读书籍
        else if (pathname.match(/^\/api\/library\/book-readings\/[^\/]+$/) && req.method === 'DELETE') {
            console.log('🔵 移除在读书籍');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const bookId = pathname.split('/').pop();
            
            const { error } = await supabase
                .from('book_readings')
                .delete()
                .eq('user_id', user.id)
                .eq('book_id', bookId);
            
            if (error) {
                console.error('移除在读书籍失败:', error);
                return sendJson(res, 400, { error: '移除在读书籍失败' });
            }
            
            return sendJson(res, 200, { success: true });
        }
        
        // POST /api/library/notes - 创建新笔记
        else if (pathname === '/api/library/notes' && req.method === 'POST') {
            console.log('🔵 创建新笔记');
            
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
            const { book_id, content, page_start, page_end } = body;
            
            if (!book_id || !content) {
                return sendJson(res, 400, { error: '缺少书籍ID或笔记内容' });
            }
            
            if (!page_start) {
                return sendJson(res, 400, { error: '请填写起始页码' });
            }
            
            // 创建笔记
            const { data: note, error: insertError } = await supabase
                .from('book_notes')
                .insert({
                    user_id: user.id,
                    book_id,
                    content,
                    page_start: parseInt(page_start),
                    page_end: page_end ? parseInt(page_end) : null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (insertError) {
                console.error('创建笔记失败:', insertError);
                return sendJson(res, 400, { error: '创建笔记失败' });
            }
            
            return sendJson(res, 201, { success: true, note });
        }
        

        
        return null; // 让其他路由处理
        
    } catch (error) {
        console.error('Library route error:', error);
        return sendJson(res, 500, { error: error.message });
    }
}

