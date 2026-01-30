/**
 * routes/cart.js - 购物车相关 API 路由（✅ 兼容版：支持新旧两种格式）
 */

import { getSupabaseClient } from '../config/supabase.js';

// ==================== 辅助函数 ====================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req) {
  if (req.body && Object.keys(req.body).length > 0) {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
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

  // 1. 添加到购物车（✅ 兼容版：支持新旧两种格式）
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
      const body = await readBody(req);

      console.log('📦 收到的请求数据:', JSON.stringify(body, null, 2));

      let cartItemData = null;

      // ✅ 方式1：新格式 - 直接传 cartItemData
      if (body.cartItemData) {
        cartItemData = { ...body.cartItemData };
        console.log('✅ 使用新格式：cartItemData');
      }
      // ✅ 方式2：旧格式 - draftId + sizeQuantities
      else if (body.draftId && body.sizeQuantities) {
        console.log('✅ 使用旧格式：draftId + sizeQuantities');

        const { draftId, sizeQuantities, productInfo, unitPrice } = body;
        let itemType = null;
        let searchKey = null;
        let itemData = {};
        let finalPrice = 29.99;

        // 处理不同类型的商品
        if (draftId.startsWith('blank-')) {
          const color = draftId.replace('blank-', '');
          itemType = 'blank-tshirt';
          searchKey = `blank-tshirt-${color}`;
          itemData = { type: 'blank-tshirt', color };
          finalPrice = 69;

        } else if (draftId.startsWith('console-')) {
          itemType = 'console-product';
          searchKey = draftId;

          if (productInfo) {
            itemData = {
              type: draftId,
              productName: productInfo.productName,
              productImage: productInfo.productImage,
              productYear: productInfo.productYear,
              productCategory: productInfo.productCategory,
              productType: productInfo.productType || 'retro-console',
              variantKey: productInfo.variantKey,
              variantName: productInfo.variantName,
              variantDescription: productInfo.variantDescription
            };
          }

          if (unitPrice && typeof unitPrice === 'number') {
            finalPrice = unitPrice;
          }

        } else {
          itemType = 'custom-design';
          searchKey = `draft-${draftId}`;
          itemData = { type: 'custom-design' };

          if (unitPrice && typeof unitPrice === 'number') {
            finalPrice = unitPrice;
          }
        }

        const totalQuantity = Object.values(sizeQuantities).reduce((a, b) => a + b, 0);

        // 构造完整的 cartItemData
        cartItemData = {
          user_id: userId,
          type: searchKey,
          price: finalPrice,
          quantity: totalQuantity,
          total_price: finalPrice * totalQuantity,
          sizes: sizeQuantities,
          draft_id: itemType === 'custom-design' ? draftId : null,
          item_data: itemData,
          added_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

      } else {
        return sendJson(res, 400, { error: '缺少必要参数：需要 cartItemData 或 (draftId + sizeQuantities)' });
      }

      // ✅ 确保 user_id 正确
      cartItemData.user_id = userId;

      console.log(`🛒 用户 ${userId} 添加商品:`, cartItemData.type);
      console.log('📋 最终 cartItemData:', JSON.stringify(cartItemData, null, 2));

      const supabase = getSupabaseClient();
      let existingItem = null;

      // 检查是否已存在相同 type 的商品
      const { data: existingItems } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', userId)
        .eq('type', cartItemData.type)
        .limit(1);

      if (existingItems && existingItems.length > 0) {
        existingItem = existingItems[0];
      }

      let result;

      if (existingItem) {
        // ✅ 更新现有商品
        console.log('✅ 更新现有商品:', existingItem.id);

        const currentQty = existingItem.quantity || 0;
        const newQty = currentQty + (cartItemData.quantity || 1);

        // 合并 sizes
        const mergedSizes = { ...existingItem.sizes };
        for (const [size, qty] of Object.entries(cartItemData.sizes || { 'default': 1 })) {
          mergedSizes[size] = (mergedSizes[size] || 0) + qty;
        }

        const { data, error } = await supabase
          .from('cart_items')
          .update({
            quantity: newQty,
            sizes: mergedSizes,
            total_price: cartItemData.price * newQty,
            item_data: cartItemData.item_data,
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
          quantity: newQty
        };
      } else {
        // ✅ 添加新商品
        console.log('➕ 添加新商品到购物车');

        const { data, error } = await supabase
          .from('cart_items')
          .insert([cartItemData])
          .select()
          .single();

        if (error) {
          console.error('插入失败:', error);

          // 如果 item_data 字段有问题，尝试不带该字段插入
          if (error.message && error.message.includes('item_data')) {
            console.log('⚠️ item_data 字段问题，尝试不带 item_data 插入...');
            const cartItemDataNoItemData = { ...cartItemData };
            delete cartItemDataNoItemData.item_data;

            const { data: retryData, error: retryError } = await supabase
              .from('cart_items')
              .insert([cartItemDataNoItemData])
              .select()
              .single();

            if (retryError) {
              console.error('重试插入失败:', retryError);
              return sendJson(res, 400, { error: '添加失败: ' + retryError.message });
            }

            console.log('✅ 插入成功（无 item_data）:', retryData);
            result = {
              success: true,
              action: 'added',
              itemId: retryData.id,
              quantity: retryData.quantity
            };
          } else {
            console.error('插入失败:', error);
            return sendJson(res, 400, { error: '添加失败: ' + error.message });
          }
        } else {
          console.log('✅ 插入成功:', data);
          result = {
            success: true,
            action: 'added',
            itemId: data.id,
            quantity: data.quantity
          };
        }
      }

      return sendJson(res, 200, result);

    } catch (error) {
      console.error('购物车操作失败:', error);
      return sendJson(res, 500, { error: '服务器错误: ' + error.message });
    }
  }

  // ============================================
  // 其他路由保持不变
  // ============================================

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
    console.log('删除购物车项目 ID:', cartItemId);

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
    console.log('更新购物车项目 ID:', cartItemId);

    if (!token) {
      return sendJson(res, 401, { error: '未授权：缺少 token' });
    }

    try {
      const auth = await verifyToken(token);
      if (!auth.valid) {
        return sendJson(res, 401, { error: auth.error });
      }

      const userId = auth.user.id;
      const body = await readBody(req);
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

      const totalPrice = (existingItem?.price || 29.99) * totalQuantity;

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
