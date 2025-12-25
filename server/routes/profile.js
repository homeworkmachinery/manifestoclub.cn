import { getSupabaseClient } from '../config/supabase.js';
const supabase = getSupabaseClient();

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

// 处理用户资料相关路由
export async function handleProfileRoute(pathname, req, res) {
  const supabase = getSupabaseClient();
  
  // 检查客户端是否初始化
  if (!supabase) {
    console.error('❌ Supabase 客户端未初始化');
    return sendJson(res, 500, { 
      error: '服务器配置错误',
      message: 'Supabase 客户端未正确初始化，请检查环境变量'
    });
  }

  try {
    // GET /api/profile/info - 获取用户资料
    if (pathname === '/api/profile/info' && req.method === 'GET') {
      console.log('🔵 获取用户资料');
      
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return sendJson(res, 401, { error: '未授权：缺少 token' });
      }
      
      const supabase = getSupabaseClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return sendJson(res, 401, { error: 'Token 无效或已过期' });
      }
      
      // 从 profiles 表获取用户资料
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('manifesto, shipping_addresses')
        .eq('user_id', user.id)
        .single();
      
      if (profileError && profileError.code !== 'PGRST116') {
        console.error('查询用户资料失败:', profileError);
        return sendJson(res, 400, { error: '获取用户资料失败' });
      }
      
      return sendJson(res, 200, profile || {});
    }
    
    // PATCH /api/profile/manifesto - 更新宣言
    else if (pathname === '/api/profile/manifesto' && req.method === 'PATCH') {
      console.log('🔵 更新宣言');
      
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
      const { manifesto } = body;
      
      if (!manifesto || typeof manifesto !== 'string') {
        return sendJson(res, 400, { error: '无效的宣言内容' });
      }
      
      // 检查 profiles 表中是否有该用户的记录
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .single();
      
      let result;
      try {
        if (existingProfile) {
          // 更新现有记录 - 不包含 updated_at
          result = await supabase
            .from('profiles')
            .update({ manifesto })
            .eq('user_id', user.id);
        } else {
          // 插入新记录 - 不包含 updated_at
          result = await supabase
            .from('profiles')
            .insert({
              user_id: user.id,
              manifesto,
              shipping_addresses: []
            });
        }
        
        if (result.error) {
          console.error('❌ 更新宣言失败:', result.error);
          console.error('❌ 错误详情:', {
            message: result.error.message,
            code: result.error.code,
            details: result.error.details
          });
          return sendJson(res, 400, { 
            error: '更新宣言失败',
            details: result.error.message
          });
        }
        
        console.log('✅ 宣言更新成功');
        return sendJson(res, 200, { success: true, manifesto });
        
      } catch (err) {
        console.error('❌ 宣言更新异常:', err);
        return sendJson(res, 500, { 
          error: '服务器错误',
          details: err.message
        });
      }
    }
    
    // POST /api/profile/address - 添加新地址
    else if (pathname === '/api/profile/address' && req.method === 'POST') {
      console.log('🔵 添加新地址');
      
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
      const newAddress = {
        fullName: body.fullName,
        phone: body.phone,
        email: body.email,
        address1: body.address1,
        address2: body.address2 || '',
        city: body.city,
        state: body.state,
        zipCode: body.zipCode,
        country: body.country,
        isDefault: body.isDefault || false
      };
      
      // 验证必填字段
      const requiredFields = ['fullName', 'phone', 'email', 'address1', 'city', 'state', 'zipCode', 'country'];
      for (const field of requiredFields) {
        if (!newAddress[field]) {
          return sendJson(res, 400, { error: `缺少必填字段: ${field}` });
        }
      }
      
      // 获取当前地址列表
      const { data: profile } = await supabase
        .from('profiles')
        .select('shipping_addresses')
        .eq('user_id', user.id)
        .single();
      
      let addresses = profile?.shipping_addresses || [];
      
      // 如果设置为默认，清除其他地址的默认状态
      if (newAddress.isDefault) {
        addresses = addresses.map(addr => ({ ...addr, isDefault: false }));
      }
      
      // 如果是第一个地址，自动设为默认
      if (addresses.length === 0) {
        newAddress.isDefault = true;
      }
      
      addresses.push(newAddress);
      
      // 更新数据库 - 不包含 updated_at
      const { error } = await supabase
        .from('profiles')
        .update({ shipping_addresses: addresses })
        .eq('user_id', user.id);
      
      if (error) {
        console.error('添加地址失败:', error);
        return sendJson(res, 400, { error: '添加地址失败' });
      }
      
      return sendJson(res, 200, { success: true, addresses });
    }
    
    // PATCH /api/profile/address/:index - 编辑地址
    else if (pathname.match(/^\/api\/profile\/address\/\d+$/) && req.method === 'PATCH') {
      console.log('🔵 编辑地址');
      
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return sendJson(res, 401, { error: '未授权：缺少 token' });
      }
      
      const supabase = getSupabaseClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return sendJson(res, 401, { error: 'Token 无效或已过期' });
      }
      
      const index = parseInt(pathname.split('/').pop());
      const body = await readBody(req);
      const updatedAddress = {
        fullName: body.fullName,
        phone: body.phone,
        email: body.email,
        address1: body.address1,
        address2: body.address2 || '',
        city: body.city,
        state: body.state,
        zipCode: body.zipCode,
        country: body.country,
        isDefault: body.isDefault || false
      };
      
      // 获取当前地址列表
      const { data: profile } = await supabase
        .from('profiles')
        .select('shipping_addresses')
        .eq('user_id', user.id)
        .single();
      
      let addresses = profile?.shipping_addresses || [];
      
      if (index < 0 || index >= addresses.length) {
        return sendJson(res, 404, { error: '地址不存在' });
      }
      
      // 如果设置为默认，清除其他地址的默认状态
      if (updatedAddress.isDefault) {
        addresses = addresses.map(addr => ({ ...addr, isDefault: false }));
      }
      
      addresses[index] = updatedAddress;
      
      // 更新数据库 - 不包含 updated_at
      const { error } = await supabase
        .from('profiles')
        .update({ shipping_addresses: addresses })
        .eq('user_id', user.id);
      
      if (error) {
        console.error('更新地址失败:', error);
        return sendJson(res, 400, { error: '更新地址失败' });
      }
      
      return sendJson(res, 200, { success: true, addresses });
    }
    
    // PATCH /api/profile/address/:index/default - 设为默认地址
    else if (pathname.match(/^\/api\/profile\/address\/\d+\/default$/) && req.method === 'PATCH') {
      console.log('🔵 设为默认地址');
      
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return sendJson(res, 401, { error: '未授权：缺少 token' });
      }
      
      const supabase = getSupabaseClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return sendJson(res, 401, { error: 'Token 无效或已过期' });
      }
      
      const index = parseInt(pathname.split('/')[4]);
      
      // 获取当前地址列表
      const { data: profile } = await supabase
        .from('profiles')
        .select('shipping_addresses')
        .eq('user_id', user.id)
        .single();
      
      let addresses = profile?.shipping_addresses || [];
      
      if (index < 0 || index >= addresses.length) {
        return sendJson(res, 404, { error: '地址不存在' });
      }
      
      // 清除所有默认状态，然后设置新的默认地址
      addresses = addresses.map((addr, i) => ({
        ...addr,
        isDefault: i === index
      }));
      
      // 更新数据库 - 不包含 updated_at
      const { error } = await supabase
        .from('profiles')
        .update({ shipping_addresses: addresses })
        .eq('user_id', user.id);
      
      if (error) {
        console.error('设置默认地址失败:', error);
        return sendJson(res, 400, { error: '设置默认地址失败' });
      }
      
      return sendJson(res, 200, { success: true, addresses });
    }
    
    // DELETE /api/profile/address/:index - 删除地址
    else if (pathname.match(/^\/api\/profile\/address\/\d+$/) && req.method === 'DELETE') {
      console.log('🔵 删除地址');
      
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return sendJson(res, 401, { error: '未授权：缺少 token' });
      }
      
      const supabase = getSupabaseClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (userError || !user) {
        return sendJson(res, 401, { error: 'Token 无效或已过期' });
      }
      
      const index = parseInt(pathname.split('/').pop());
      
      // 获取当前地址列表
      const { data: profile } = await supabase
        .from('profiles')
        .select('shipping_addresses')
        .eq('user_id', user.id)
        .single();
      
      let addresses = profile?.shipping_addresses || [];
      
      if (index < 0 || index >= addresses.length) {
        return sendJson(res, 404, { error: '地址不存在' });
      }
      
      const deletedAddress = addresses[index];
      addresses.splice(index, 1);
      
      // 如果删除的是默认地址且还有其他地址，将第一个地址设为默认
      if (deletedAddress?.isDefault && addresses.length > 0) {
        addresses[0].isDefault = true;
      }
      
      // 更新数据库 - 不包含 updated_at
      const { error } = await supabase
        .from('profiles')
        .update({ shipping_addresses: addresses })
        .eq('user_id', user.id);
      
      if (error) {
        console.error('删除地址失败:', error);
        return sendJson(res, 400, { error: '删除地址失败' });
      }
      
      return sendJson(res, 200, { success: true, addresses });
    }
    
    return null; // 让其他路由处理
    
  } catch (error) {
    console.error('Profile route error:', error);
    return sendJson(res, 500, { error: error.message });
  }
}