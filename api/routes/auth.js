/**
 * routes/auth.js - 认证相关 API 路由
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

// ==================== 登录接口 ====================

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
   
    const { emailOrManifesto, password } = body;

    if (!emailOrManifesto || !password) {
      return sendJson(res, 400, { error: 'Email/Manifesto and password are required' });
    }

    let email = emailOrManifesto;

    if (!emailOrManifesto.includes('@')) {
      console.log(`🔍 查询 manifesto: ${emailOrManifesto}`);
      
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('manifesto', emailOrManifesto)
        .single();

      if (error || !data) {
        console.log('❌ Manifesto 未找到');
        return sendJson(res, 404, { error: 'Manifesto not found' });
      }

      email = data.email;
    }

    console.log(`🔐 用户登录尝试: ${email}`);

    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authError) {
      console.error('❌ 认证失败:', authError.message);
      
      if (authError.message.includes('Invalid login credentials')) {
        return sendJson(res, 401, { error: 'Invalid email or password' });
      } else if (authError.message.includes('Email not confirmed')) {
        return sendJson(res, 403, { error: 'Email not verified' });
      }
      
      return sendJson(res, 401, { error: authError.message });
    }

    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, email, manifesto, barcode')
      .eq('email', email)
      .single();

    if (profileError) {
      console.error('❌ 获取用户资料失败:', profileError);
      return sendJson(res, 500, { error: 'Failed to fetch user profile' });
    }

    console.log('✅ 登录成功:', email);

    return sendJson(res, 200, {
      token: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      user: {
        id: authData.user.id,
        email: userProfile.email,
        manifesto: userProfile.manifesto,
        barcode: userProfile.barcode
      }
    });

  } catch (error) {
    console.error('❌ 登录异常:', error);
    return sendJson(res, 500, { error: error.message });
  }
}

// ==================== 注册接口 ====================

async function handleSignup(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
 
    const { email, password, manifesto, barcode } = body;

    if (!email || !password || !manifesto || !barcode) {
      return sendJson(res, 400, { error: 'Missing required fields' });
    }

    console.log(`📝 新用户注册: ${email}`);

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          manifesto: manifesto,
          barcode: barcode
        }
      }
    });

    if (error) {
      console.error('❌ 注册失败:', error.message);
      return sendJson(res, 400, { error: error.message });
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: data.user.id,
        email: email,
        manifesto: manifesto,
        barcode: barcode,
        created_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('❌ 创建资料失败:', profileError);
      return sendJson(res, 400, { error: 'Failed to create user profile' });
    }

    console.log('✅ 注册成功:', email);

    return sendJson(res, 200, {
      message: 'User registered successfully',
      user: {
        id: data.user.id,
        email: email,
        manifesto: manifesto
      }
    });

  } catch (error) {
    console.error('❌ 注册异常:', error);
    return sendJson(res, 500, { error: error.message });
  }
}

// ==================== 密码重置接口 ====================

async function handlePasswordReset(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email } = body;

    if (!email) {
      return sendJson(res, 400, { error: 'Email is required' });
    }

    console.log(`🔄 密码重置请求: ${email}`);

    const supabase = getSupabaseClient();

    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', email)
      .single();

    if (checkError || !existingUser) {
      console.log('❌ 邮箱未找到');
      return sendJson(res, 200, {
        message: 'If the email exists, a reset link has been sent'
      });
    }

    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/?type=password_update&email=${encodeURIComponent(email)}`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

    if (error) {
      console.error('❌ 发送邮件失败:', error);
      return sendJson(res, 500, { error: 'Failed to send reset email' });
    }

    console.log('✅ 密码重置邮件已发送:', email);

    return sendJson(res, 200, {
      message: 'If the email exists, a reset link has been sent'
    });

  } catch (error) {
    console.error('❌ 密码重置异常:', error);
    return sendJson(res, 500, { error: error.message });
  }
}

// ==================== 更新密码接口 ====================

async function handleUpdatePassword(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return sendJson(res, 401, { error: 'Missing token' });
    }

    const auth = await verifyToken(token);
    if (!auth.valid) {
      return sendJson(res, 401, { error: auth.error });
    }

 
    const { password } = body;

    if (!password || password.length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
    }

    console.log(`🔐 更新用户密码: ${auth.user.id}`);

    const supabase = getSupabaseClient();

    const { error } = await supabase.auth.admin.updateUserById(auth.user.id, {
      password: password
    });

    if (error) {
      console.error('❌ 更新密码失败:', error);
      return sendJson(res, 400, { error: error.message });
    }

    console.log('✅ 密码已更新');

    return sendJson(res, 200, {
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('❌ 更新密码异常:', error);
    return sendJson(res, 500, { error: error.message });
  }
}

// ==================== 登出接口 ====================

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return sendJson(res, 401, { error: 'Missing token' });
    }

    const auth = await verifyToken(token);
    if (!auth.valid) {
      return sendJson(res, 401, { error: auth.error });
    }

    console.log(`👋 用户登出: ${auth.user.id}`);

    return sendJson(res, 200, {
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ 登出异常:', error);
    return sendJson(res, 500, { error: error.message });
  }
}

// ==================== 验证 Token 接口 ====================

async function handleVerifyToken(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return sendJson(res, 401, { error: 'Missing token' });
    }

    const auth = await verifyToken(token);
    if (!auth.valid) {
      return sendJson(res, 401, { error: auth.error });
    }

    return sendJson(res, 200, {
      valid: true,
      user: auth.user
    });

  } catch (error) {
    console.error('❌ Token 验证异常:', error);
    return sendJson(res, 500, { error: error.message });
  }
}

// ==================== 路由处理函数 ====================

export async function handleAuthRoute(pathname, req, res) {
  if (pathname === '/api/auth/login') {
    return await handleLogin(req, res);
  }
  
  if (pathname === '/api/auth/signup') {
    return await handleSignup(req, res);
  }
  
  if (pathname === '/api/auth/password-reset') {
    return await handlePasswordReset(req, res);
  }
  
  if (pathname === '/api/auth/update-password') {
    return await handleUpdatePassword(req, res);
  }
  
  if (pathname === '/api/auth/logout') {
    return await handleLogout(req, res);
  }
  
  if (pathname === '/api/auth/verify-token') {
    return await handleVerifyToken(req, res);
  }





  return null;
}