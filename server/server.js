// server.js - 完整版，包含购物车 API


import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';


const PORT = process.env.PORT || 3001;
// ==================== 修复：手动加载 .env.local ====================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取并解析 .env.local 文件
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  
  console.log('📂 尝试加载 .env.local...');
  console.log('📍 路径:', envPath);
  
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️ .env.local 文件不存在');
    console.warn('💡 请在项目根目录创建 .env.local 文件');
    return;
  }

  try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    console.log('✅ 已读取 .env.local 文件');

    // 逐行解析
    envContent.split('\n').forEach(line => {
      // 跳过空行和注释
      if (!line.trim() || line.startsWith('#')) {
        return;
      }

      // 解析 KEY=VALUE
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();

      if (key && value) {
        process.env[key.trim()] = value;
        console.log(`  ✓ 加载: ${key.trim()}`);
      }
    });

    console.log('✅ 环境变量加载完成\n');
  } catch (error) {
    console.error('❌ 读取 .env.local 失败:', error.message);
  }
}

// 加载环境变量
loadEnvFile();

// ==================== 导入路由 ====================
import { handleAuthRoute } from './routes/auth.js';
import { handleCartRoute } from './routes/cart.js';
import { handleProfileRoute } from './routes/profile.js';
import { handleDraftsRoute } from './routes/drafts.js';
import { handleOrdersRoute } from './routes/orders.js';
import { handleLibraryRoute } from './routes/library.js';
// import { handleBooksRoute } from './routes/books.js';
// ==================== 初始化 Supabase 客户端 ====================

let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('当前环境变量状态:');
      console.error('SUPABASE_URL:', process.env.SUPABASE_URL ? '已设置' : '未设置');
      console.error('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '已设置（部分隐藏）' : '未设置');
      throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    }

    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );
    console.log('✅ Supabase 客户端已初始化');
  }

  return supabase;
}

// ==================== 初始化数据库连接池 ====================

let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL 环境变量未设置');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });

    pool.on('error', (err) => {
      console.error('❌ 连接池错误:', err);
    });
  }

  return pool;
}

// ==================== 验证 Token 中间件 ====================

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

// ==================== 辅助函数 ====================

// 设置 CORS 响应头
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24小时
  res.setHeader('Content-Type', 'application/json');
}

// 发送 JSON 响应
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(data, null, 2));
}

// 读取请求体
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

// ==================== 创建服务器 ====================

const server = http.createServer(async (req, res) => {
  // 解析 URL
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // 记录详细请求信息
  console.log('\n========== 新请求 ==========');
  console.log('📨 方法:', req.method);
  console.log('📍 路径:', pathname);
  console.log('🔍 查询参数:', query);
  console.log('📋 请求头:', {
    'authorization': req.headers.authorization ? '存在' : '不存在',
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent']
  });
  console.log('=============================\n');

  // 设置 CORS 头
  setCorsHeaders(res);

   // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    console.log('处理 OPTIONS 请求:', pathname);
    return sendJson(res, 200, { status: 'ok' });
  }

  console.log(`${req.method} ${pathname}`);


    // ==================== 认证路由 ====================
try {
    // ==================== 认证路由 ====================

    // 1️⃣ 认证路由
    if (pathname.startsWith('/api/auth/')) {
        console.log('  → 路由到 Auth Handler');
        const authResult = await handleAuthRoute(pathname, req, res);
        if (authResult !== null) {
            return;
        }
    }

    // 2️⃣ Profile 路由（必须在 /api/profile/... 之前）
    if (pathname === '/api/profile/info' || pathname.startsWith('/api/profile/')) {
        console.log('  → 路由到 Profile Handler');
        const result = await handleProfileRoute(pathname, req, res);
        if (result !== null) {
            return;
        }
    }

 if (pathname.startsWith('/api/books/')) {
    console.log('  → 路由到 Books Handler');
    const result = await handleBooksRoute(pathname, req, res);
    if (result !== null) {
        console.log('  ✅ Books 路由已处理');
        return;
    }
}

    // 4️⃣ Library 路由（检查 /api/library 和 /api/library/...）
    if (pathname === '/api/library' || pathname.startsWith('/api/library/')) {
        console.log('  → 路由到 Library Handler');
        console.log('  📍 详细路径:', pathname);
        const result = await handleLibraryRoute(pathname, req, res);
        if (result !== null) {
            console.log('  ✅ Library 路由已处理');
            return;
        }
    }

    // 5️⃣ Drafts 路由（检查 /api/drafts 和 /api/drafts/...）
    if (pathname === '/api/drafts' || pathname.startsWith('/api/drafts/')) {
        console.log('  → 路由到 Drafts Handler');
        const result = await handleDraftsRoute(pathname, req, res);
        if (result !== null) {
            return;
        }
    }

    // 6️⃣ Orders 路由
    if (pathname === '/api/orders' || pathname.startsWith('/api/orders/')) {
        console.log('  → 路由到 Orders Handler');
        const result = await handleOrdersRoute(pathname, req, res);
        if (result !== null) {
            return;
        }
    }

    // 7️⃣ Cart 路由
    if (pathname.startsWith('/api/cart/')) {
        console.log('  → 路由到 Cart Handler');
        const cartResult = await handleCartRoute(pathname, req, res);
        if (cartResult !== null) {
            return;
        }
        }

    // ==================== 旧的端点（保持不变）====================

    // 测试数据库连接
    if (pathname === '/api/test-db' && req.method === 'GET') {
      if (!process.env.DATABASE_URL) {
        return sendJson(res, 400, {
          status: 'error',
          message: '❌ DATABASE_URL 环境变量未设置',
          hint: '请在 .env.local 中设置 DATABASE_URL',
          envPath: path.join(__dirname, '.env.local')
        });
      }

      try {
        console.log('📡 正在连接 Pooler...');
        
        const pool = getPool();
        const client = await pool.connect();
        console.log('✅ 客户端连接成功');

        const result = await client.query('SELECT NOW() as current_time, version() as db_version');
        
        client.release();

        return sendJson(res, 200, {
          status: 'success',
          message: '✅ Pooler 连接成功！',
          data: {
            currentTime: result.rows[0].current_time,
            dbVersion: result.rows[0].db_version,
            host: process.env.DATABASE_URL.split('@')[1]?.split(':')[0],
            connectionType: 'Pooler'
          }
        });

      } catch (error) {
        console.error('❌ 连接失败:', error.message);
        
        let hint = '';
        if (error.message.includes('password')) {
          hint = '密码错误 - 检查 DATABASE_URL 中的密码';
        } else if (error.code === 'ECONNREFUSED') {
          hint = '连接被拒绝 - 检查主机地址和端口';
        } else if (error.code === 'ENOTFOUND') {
          hint = '无法找到主机 - 检查网络连接';
        } else if (error.message.includes('FATAL')) {
          hint = '数据库错误 - 检查用户名、密码或数据库名称';
        }

        return sendJson(res, 500, {
          status: 'error',
          message: '❌ Pooler 连接失败',
          error: error.message,
          code: error.code,
          hint: hint,
          dbUrl: process.env.DATABASE_URL?.split('@')[0] + '@****'
        });
      }
    }

    // 健康检查
    if (pathname === '/api/health' && req.method === 'GET') {
      try {
        const pool = getPool();
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();

        return sendJson(res, 200, {
          status: 'ok',
          message: 'Server is running',
          database: 'connected',
          time: new Date().toISOString()
        });
      } catch (error) {
        return sendJson(res, 500, {
          status: 'error',
          message: 'Database connection failed',
          error: error.message
        });
      }
    }


    // 获取 Drafts 批量端点
    if (pathname === '/api/drafts/batch' && req.method === 'GET') {
      console.log('\n🔵 ================================================');
      console.log('🔵 请求来了！路径:', pathname);
      console.log('🔵 查询参数:', query);
      console.log('🔵 ================================================\n');
      
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        console.log('❌ 【drafts/batch】没有 token');
        return sendJson(res, 401, { error: '未授权：缺少 token' });
      }

      try {
        const auth = await verifyToken(token);
        if (!auth.valid) {
          console.log('❌ 【drafts/batch】Token 验证失败:', auth.error);
          return sendJson(res, 401, { error: auth.error });
        }

        const idsString = query.ids || '';
        const ids = idsString.split(',').filter(id => id.trim());
        
        console.log('📋 【drafts/batch】要查询的 IDs:', ids);

        if (ids.length === 0) {
          console.log('✅ 【drafts/batch】没有 IDs，返回空数组');
          return sendJson(res, 200, []);
        }

        const supabase = getSupabaseClient();

        console.log('🔍 【drafts/batch】开始查询 Supabase...');
        
        const { data: drafts, error } = await supabase
          .from('drafts')
          .select('*')
          .in('id', ids);

        if (error) {
          console.error('❌ 【drafts/batch】Supabase 查询错误:', error);
          return sendJson(res, 400, { error: error.message });
        }

        console.log('✅ 【drafts/batch】查询成功，返回', drafts?.length || 0, '条记录');
        return sendJson(res, 200, drafts || []);

      } catch (error) {
        console.error('❌ 【drafts/batch】异常错误:', error);
        return sendJson(res, 500, { error: error.message });
      }
    }
 
    // ==================== 404 ====================
    return sendJson(res, 404, {
      error: 'Not found',
      path: pathname,
      availableEndpoints: [
          'GET /api/health',
        'GET /api/test-db',
        'GET /api/profile/info',
        'PATCH /api/profile/manifesto',
        'POST /api/profile/address',
        'PATCH /api/profile/address/:index',
        'DELETE /api/profile/address/:index',
        'PATCH /api/profile/shipping',
        'GET /api/drafts',
        'GET /api/drafts/:id',
        'POST /api/drafts',
        'PATCH /api/drafts/:id',
        'DELETE /api/drafts/:id',
        'PATCH /api/drafts/:id/update-sizes',
        'GET /api/orders',
        'GET /api/orders/:id',
        'POST /api/orders',
        'PATCH /api/orders/:id',
        'PATCH /api/orders/:id/cancel',
        'PATCH /api/orders/:id/tracking',
        'GET /api/library',
        'POST /api/library/notes',
        'GET /api/library/notes/:noteId',
        'PATCH /api/library/notes/:noteId',
        'DELETE /api/library/notes/:noteId',
        'POST /api/library/notes/:noteId/annotations',
        'DELETE /api/library/annotations/:annotationId',
        'POST /api/library/book-wants',
        'DELETE /api/library/book-wants/:bookId',
        'POST /api/library/book-readings',
        'DELETE /api/library/book-readings/:bookId'
      ]
    });

  } catch (error) {
    console.error('Server error:', error);
    return sendJson(res, 500, { error: error.message });
  }
});

// ==================== 启动服务器 ====================

server.listen(PORT, () => {
  console.log(`\n✅ 服务器运行在 http://localhost:${PORT}`);
  console.log(`\n📚 可用的 API 端点:`);
  console.log(`  测试: http://localhost:${PORT}/api/test-db`);
  console.log(`  健康检查: http://localhost:${PORT}/api/health`);
  console.log(`\n🔐 认证 API:`);
  console.log(`  POST /api/auth/login - 登录`);
  console.log(`  POST /api/auth/signup - 注册`);
  console.log(`  POST /api/auth/password-reset - 密码重置`);
  console.log(`  POST /api/auth/update-password - 更新密码`);
  console.log(`  POST /api/auth/logout - 登出`);
  console.log(`  GET /api/auth/verify-token - 验证 Token`);
  console.log(`\n🛒 购物车 API:`);
  console.log(`  POST /api/cart/add - 添加到购物车`);
  console.log(`  GET /api/cart/count - 获取数量`);
  console.log(`  GET /api/cart/items - 获取商品`);
  console.log(`  GET /api/cart/total - 获取总价`);
  console.log(`  DELETE /api/cart/items/:id - 删除商品`);
  console.log(`  PATCH /api/cart/items/:id - 更新数量\n`);
   console.log(`   GET  /api/library (with token)`);
  console.log(`   GET  /api/profile/info (with token)`);
  console.log(`   GET  /api/drafts (with token)`);
  console.log(`   GET  /api/orders (with token)`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/cart/add (with token)\n`);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

export default server;