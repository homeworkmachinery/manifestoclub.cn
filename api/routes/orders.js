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


// 处理订单相关路由
export async function handleOrdersRoute(pathname, req, res) {
    try {
        // GET /api/orders - 获取用户所有订单
        if (pathname === '/api/orders' && req.method === 'GET') {
            console.log('🔵 获取用户订单列表');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            // 获取用户的所有订单
            const { data: orders, error } = await supabase
                .from('orders')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('获取订单列表失败:', error);
                return sendJson(res, 400, { error: '获取订单列表失败' });
            }
            
            // 处理 items 字段
            const processedOrders = orders.map(order => {
                try {
                    // 如果 items 是字符串，尝试解析为 JSON
                    if (typeof order.items === 'string') {
                        order.items = JSON.parse(order.items);
                    }
                    // 如果 items 不是数组，确保它是一个数组
                    if (!Array.isArray(order.items)) {
                        console.log('Items is not an array for order:', order.order_id, order.items);
                        order.items = [];
                    }
                } catch (e) {
                    console.error('Error processing items for order:', order.order_id, e);
                    order.items = [];
                }
                return order;
            });
            
            return sendJson(res, 200, processedOrders || []);
        }
        
        // GET /api/orders/:id - 获取单个订单
        else if (pathname.match(/^\/api\/orders\/[^\/]+$/) && req.method === 'GET') {
            console.log('🔵 获取单个订单');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const orderId = pathname.split('/').pop();
            
            // 获取订单详情
            const { data: order, error } = await supabase
                .from('orders')
                .select('*')
                .eq('order_id', orderId)
                .eq('user_id', user.id)
                .single();
            
            if (error) {
                console.error('获取订单失败:', error);
                return sendJson(res, 404, { error: '订单不存在或无权限访问' });
            }
            
            // 处理 items 字段
            try {
                if (typeof order.items === 'string') {
                    order.items = JSON.parse(order.items);
                }
                if (!Array.isArray(order.items)) {
                    order.items = [];
                }
            } catch (e) {
                console.error('Error processing items:', e);
                order.items = [];
            }
            
            return sendJson(res, 200, order);
        }
        
        // PATCH /api/orders/:id/cancel - 取消订单
        else if (pathname.match(/^\/api\/orders\/[^\/]+\/cancel$/) && req.method === 'PATCH') {
                console.log('🔵 取消订单请求:', pathname);
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            console.log('🔵 Token:', token ? '已提供' : '未提供');
            
            if (!token) {
                console.log('❌ 缺少 token');
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            // 🔧 修复：验证token的有效性
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                console.log('❌ Token 验证失败:', userError?.message);
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            console.log('🔵 用户验证成功:', user.id);
            
            const orderId = pathname.split('/')[3];
            console.log('🔵 尝试取消订单:', orderId);
            
            try {
                // 🔧 修复：先验证订单是否存在且属于该用户
                console.log('🔵 查询订单是否存在...');
                const { data: existingOrder, error: queryError } = await supabase
                    .from('orders')
                    .select('order_id, status, user_id, created_at')
                    .eq('order_id', orderId)
                    .eq('user_id', user.id) // 确保订单属于当前用户
                    .single();
                
                if (queryError) {
                    console.log('❌ 查询订单失败:', queryError.message);
                    console.log('❌ 错误代码:', queryError.code);
                    
                    if (queryError.code === 'PGRST116') {
                        return sendJson(res, 404, { 
                            error: '订单不存在或无权限取消',
                            details: '找不到该订单或您无权限访问此订单'
                        });
                    }
                    
                    return sendJson(res, 400, { 
                        error: '查询订单失败',
                        details: queryError.message
                    });
                }
                
                if (!existingOrder) {
                    console.log('❌ 订单不存在或无权限取消');
                    return sendJson(res, 404, { 
                        error: '订单不存在或无权限取消',
                        details: '未找到匹配的订单'
                    });
                }
                
                console.log('🔵 订单状态:', existingOrder.status);
                console.log('🔵 订单用户ID:', existingOrder.user_id);
                console.log('🔵 当前用户ID:', user.id);
                
                // 检查订单状态是否可以取消
                const cancelableStatuses = ['awaiting_verification', 'verified'];
                if (!cancelableStatuses.includes(existingOrder.status)) {
                    console.log('❌ 订单状态不可取消:', existingOrder.status);
                    return sendJson(res, 400, { 
                        error: '订单无法取消',
                        message: '只有待审核或已确认的订单可以取消',
                        currentStatus: existingOrder.status
                    });
                }
                
                // 🔧 修复：更新订单状态为已取消，同时更新时间戳
                console.log('🔵 正在取消订单...');
                const { error: updateError } = await supabase
                    .from('orders')
                    .update({ 
                        status: 'cancelled',
                        cancelled_at: new Date().toISOString() // 添加取消时间戳
                    })
                    .eq('order_id', orderId)
                    .eq('user_id', user.id); // 双重检查权限
                
                if (updateError) {
                    console.error('❌ 取消订单失败:', updateError);
                    return sendJson(res, 400, { 
                        error: '取消订单失败',
                        details: updateError.message
                    });
                }
                
                console.log('✅ 订单已成功取消:', orderId);
                return sendJson(res, 200, { 
                    success: true, 
                    orderId,
                    message: '订单已成功取消',
                    cancelledAt: new Date().toISOString()
                });
                
            } catch (error) {
                console.error('❌ 取消订单异常:', error);
                return sendJson(res, 500, { 
                    error: '服务器错误',
                    details: error.message
                });
            }
        }
        
        
        // PATCH /api/orders/:id/tracking - 更新订单追踪信息
        else if (pathname.match(/^\/api\/orders\/[^\/]+\/tracking$/) && req.method === 'PATCH') {
            console.log('🔵 更新订单追踪信息');
            
            const token = req.headers.authorization?.replace('Bearer ', '');
            if (!token) {
                return sendJson(res, 401, { error: '未授权：缺少 token' });
            }
            
            const supabase = getSupabaseClient();
            const { data: { user }, error: userError } = await supabase.auth.getUser(token);
            
            if (userError || !user) {
                return sendJson(res, 401, { error: 'Token 无效或已过期' });
            }
            
            const orderId = pathname.split('/')[3];
            const body = await readBody(req);
            const { tracking_number, courier, status } = body;
            
            if (!tracking_number || !courier) {
                return sendJson(res, 400, { error: '缺少追踪号码或快递公司' });
            }
            
            // 验证订单是否存在且属于该用户
            const { data: existingOrder } = await supabase
                .from('orders')
                .select('order_id')
                .eq('order_id', orderId)
                .eq('user_id', user.id)
                .single();
            
            if (!existingOrder) {
                return sendJson(res, 404, { error: '订单不存在或无权限更新' });
            }
            
            // 更新订单追踪信息 - 不包含 updated_at
            const updateData = {
                tracking_number,
                courier
            };
            
            if (status) {
                updateData.status = status;
            }
            
            const { error: updateError } = await supabase
                .from('orders')
                .update(updateData)
                .eq('order_id', orderId);
            
            if (updateError) {
                console.error('更新订单追踪信息失败:', updateError);
                return sendJson(res, 400, { error: '更新订单追踪信息失败' });
            }
            
            return sendJson(res, 200, { 
                success: true, 
                orderId,
                tracking_number,
                courier
            });
        }
        
        // POST /api/orders - 创建新订单
        else if (pathname === '/api/orders' && req.method === 'POST') {
            console.log('🔵 创建新订单');
            
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
            const { 
                order_id,
                items,
                amount,
                shipping_cost,
                tax_amount,
                payment_method,
                shipping_address,
                manifesto
            } = body;
            
            if (!order_id || !items || !Array.isArray(items) || items.length === 0) {
                return sendJson(res, 400, { error: '缺少订单ID或商品信息' });
            }
            
            if (!amount || !shipping_address) {
                return sendJson(res, 400, { error: '缺少订单金额或配送地址' });
            }
            
            // 生成订单ID（如果前端没有提供）
            const finalOrderId = order_id || generateOrderId();
            
            // 创建订单 - 不包含 updated_at
            const { data: order, error: insertError } = await supabase
                .from('orders')
                .insert({
                    order_id: finalOrderId,
                    user_id: user.id,
                    items: items,
                    status: 'awaiting_verification',
                    amount: parseFloat(amount) || 0,
                    shipping_cost: parseFloat(shipping_cost) || 0,
                    tax_amount: parseFloat(tax_amount) || 0,
                    payment_method: payment_method || 'pending',
                    shipping_address: shipping_address,
                    manifesto: manifesto || null,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (insertError) {
                console.error('创建订单失败:', insertError);
                return sendJson(res, 400, { error: '创建订单失败' });
            }
            
            return sendJson(res, 201, { success: true, order });
        }
        
        return null; // 让其他路由处理
        
    } catch (error) {
        console.error('Orders route error:', error);
        return sendJson(res, 500, { error: error.message });
    }
}


// 生成订单ID（如果需要）
function generateOrderId() {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `ORD${timestamp}${random}`;
}