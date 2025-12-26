/**
 * routes/cart.js - 购物车相关 API 路由
 */

import { getSupabaseClient } from '../config/supabase.js';

// ==================== 辅助函数 ====================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
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

// ==================== 购物车路由处理 ====================

export async function handleCartRoute(pathname, req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  // 1. 添加到购物车
  if (pathname === '/api/cart/add' && req.method === 'POST') {
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
       
      const { draftId, sizeQuantities } = body;

      if (!draftId || !sizeQuantities) {
        return sendJson(res, 400, { error: '缺少必要参数' });
      }

      console.log(`🛒 用户 ${userId} 添加商品: ${draftId}`);

      let itemType = null;
      let searchKey = null;
      let itemData = {};

      if (draftId.startsWith('blank-')) {
        const color = draftId.replace('blank-', '');
        itemType = 'blank-tshirt';
        searchKey = `blank-tshirt-${color}`;
        itemData = { type: 'blank-tshirt', color };
      } else if (draftId.startsWith('console-')) {
        itemType = 'console-product';
        searchKey = draftId;
        itemData = { type: draftId };
      } else {
        itemType = 'custom-design';
        searchKey = `draft-${draftId}`;
        itemData = { type: 'custom-design' };
      }

      const totalQuantity = Object.values(sizeQuantities).reduce((a, b) => a + b, 0);
      
      if (totalQuantity === 0) {
        return sendJson(res, 400, { error: '请选择尺码和数量' });
      }

      const unitPrice = 29.99;
      const totalPrice = unitPrice * totalQuantity;

      const supabase = getSupabaseClient();
      let existingItem = null;
      
      if (itemType === 'custom-design') {
        const { data: items } = await supabase
          .from('cart_items')
          .select('*')
          .eq('user_id', userId)
          .eq('draft_id', draftId);
        
        existingItem = items?.[0] || null;
      } else {
        const { data: items } = await supabase
          .from('cart_items')
          .select('*')
          .eq('user_id', userId)
          .eq('type', searchKey);
        
        existingItem = items?.[0] || null;
      }

      let result;

      if (existingItem) {
        console.log('✅ 更新现有商品:', existingItem.id);
        
        const mergedSizes = { ...existingItem.sizes };
        for (const [size, qty] of Object.entries(sizeQuantities)) {
          mergedSizes[size] = (mergedSizes[size] || 0) + qty;
        }
        
        const newTotalQuantity = Object.values(mergedSizes).reduce((a, b) => a + b, 0);
        const newTotalPrice = unitPrice * newTotalQuantity;

        const { data, error } = await supabase
          .from('cart_items')
          .update({
            sizes: mergedSizes,
            quantity: newTotalQuantity,
            total_price: newTotalPrice,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingItem.id)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) {
          console.error('更新失败:', error);
          return sendJson(res, 400, { error: '更新失败: ' + error.message });
        }

        result = {
          success: true,
          action: 'updated',
          itemId: data.id,
          quantity: newTotalQuantity,
          totalPrice: newTotalPrice
        };
      } else {
        console.log('➕ 添加新商品到购物车');
        
        const { data, error } = await supabase
          .from('cart_items')
          .insert([{
            user_id: userId,
            type: searchKey,
            price: unitPrice,
            quantity: totalQuantity,
            total_price: totalPrice,
            sizes: sizeQuantities,
            draft_id: itemType === 'custom-design' ? draftId : null,
            item_data: itemData,
            added_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) {
          console.error('插入失败:', error);
          return sendJson(res, 400, { error: '添加失败: ' + error.message });
        }

        result = {
          success: true,
          action: 'added',
          itemId: data.id,
          quantity: totalQuantity,
          totalPrice: totalPrice
        };
      }

      return sendJson(res, 200, result);

    } catch (error) {
      console.error('购物车操作失败:', error);
      return sendJson(res, 500, { error: '服务器错误: ' + error.message });
    }
  }

  // 2. 获取购物车数量
  if (pathname === '/api/cart/count' && req.method === 'GET') {
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('user_id', userId);

      if (error) {
        return sendJson(res, 400, { error: error.message });
      }

      const count = data.reduce((sum, item) => sum + (item.quantity || 0), 0);
      return sendJson(res, 200, { count });

    } catch (error) {
      console.error('获取购物车数量失败:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }

  // 3. 获取购物车商品
  if (pathname === '/api/cart/items' && req.method === 'GET') {
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
      const supabase = getSupabaseClient();

      const { data: cartItems, error } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });

      if (error) {
        return sendJson(res, 400, { error: error.message });
      }

      return sendJson(res, 200, cartItems);

    } catch (error) {
      console.error('获取购物车失败:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }

  // 4. 获取购物车总价
  if (pathname === '/api/cart/total' && req.method === 'GET') {
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('cart_items')
        .select('total_price')
        .eq('user_id', userId);

      if (error) {
        return sendJson(res, 400, { error: error.message });
      }

      const total = data.reduce((sum, item) => sum + (item.total_price || 0), 0);
      return sendJson(res, 200, { total });

    } catch (error) {
      console.error('计算总价失败:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }

  // 5. 删除购物车项目
  if (pathname.startsWith('/api/cart/items/') && req.method === 'DELETE') {
    const cartItemId = pathname.split('/')[4];
    console.log('删除购物车项目 ID:', cartItemId, '路径:', pathname);
    
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
      const supabase = getSupabaseClient();

      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('id')
        .eq('id', cartItemId)
        .eq('user_id', userId)
        .single();

      if (!existingItem) {
        return sendJson(res, 404, { error: '购物车项目不存在' });
      }

      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', cartItemId)
        .eq('user_id', userId);

      if (error) {
        return sendJson(res, 400, { error: error.message });
      }

      return sendJson(res, 200, { 
        success: true,
        message: '删除成功',
        itemId: cartItemId 
      });

    } catch (error) {
      console.error('删除购物车失败:', error);
      return sendJson(res, 500, { 
        error: error.message || '删除失败' 
      });
    }
  }

  // 6. 更新购物车项目数量
  if (pathname.startsWith('/api/cart/items/') && req.method === 'PATCH') {
    const cartItemId = pathname.split('/')[4];
    console.log('更新购物车项目 ID:', cartItemId, '路径:', pathname);
    
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
       
      const { newSizes } = body;

      if (!newSizes) {
        return sendJson(res, 400, { error: '缺少 newSizes 参数' });
      }

      console.log('更新尺码数据:', newSizes);

      const totalQuantity = Object.values(newSizes).reduce((a, b) => a + b, 0);
      const supabase = getSupabaseClient();

      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('id, price')
        .eq('id', cartItemId)
        .eq('user_id', userId)
        .single();

      if (!existingItem) {
        return sendJson(res, 404, { error: '购物车项目不存在' });
      }

      if (totalQuantity === 0) {
        const { error } = await supabase
          .from('cart_items')
          .delete()
          .eq('id', cartItemId)
          .eq('user_id', userId);

        if (error) {
          return sendJson(res, 400, { error: error.message });
        }

        return sendJson(res, 200, { 
          success: true, 
          action: 'removed',
          itemId: cartItemId 
        });
      }

      const { data: item } = await supabase
        .from('cart_items')
        .select('price')
        .eq('id', cartItemId)
        .eq('user_id', userId)
        .single();

      const totalPrice = (item?.price || 29.99) * totalQuantity;

      const { data, error } = await supabase
        .from('cart_items')
        .update({
          quantity: totalQuantity,
          sizes: newSizes,
          total_price: totalPrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', cartItemId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('更新失败:', error);
        return sendJson(res, 400, { error: '更新失败: ' + error.message });
      }

      return sendJson(res, 200, { 
        success: true, 
        data,
        totalQuantity,
        totalPrice 
      });

    } catch (error) {
      console.error('更新购物车失败:', error);
      return sendJson(res, 500, { 
        error: error.message || '更新失败' 
      });
    }
  }

  // 7. 清空购物车
  if (pathname === '/api/cart/clear' && req.method === 'DELETE') {
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', userId);

      if (error) {
        return sendJson(res, 400, { error: error.message });
      }

      return sendJson(res, 200, {
        success: true,
        message: '购物车已清空'
      });

    } catch (error) {
      console.error('清空购物车失败:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }

  // 8. 创建订单
  if (pathname === '/api/orders' && req.method === 'POST') {
    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
      const orderData = await readBody(req);

      if (orderData.user_id !== userId) {
        return sendJson(res, 403, { error: '用户 ID 不匹配' });
      }

      const supabase = getSupabaseClient();

      console.log('📦 创建订单:', orderData.order_id);

      const { data: order, error } = await supabase
        .from('orders')
        .insert([orderData])
        .select()
        .single();

      if (error) {
        console.error('❌ 订单插入错误:', error);
        return sendJson(res, 400, { 
          error: '创建订单失败: ' + error.message,
          code: error.code
        });
      }

      console.log('✅ 订单创建成功:', order.order_id);

      return sendJson(res, 200, order);

    } catch (error) {
      console.error('❌ 创建订单异常:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }

  return null;
}