// server/api/index.js
// 这个文件会调用你所有的 routes/ 模块

import { handleAuthRoute } from '../routes/auth.js';
import { handleCartRoute } from '../routes/cart.js';
import { handleProfileRoute } from '../routes/profile.js';
import { handleDraftsRoute } from '../routes/drafts.js';
import { handleOrdersRoute } from '../routes/orders.js';
import { handleLibraryRoute } from '../routes/library.js';
// import { handleBooksRoute } from '../routes/books.js';

// 设置 CORS 的辅助函数
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// 读取请求体（复用你 server.js 中的逻辑）
async function readBody(req) {
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

// Vercel API Routes 的主处理器
export default async function handler(req, res) {
  console.log(`\n📨 Vercel API: ${req.method} ${req.url}`);
  
  // 设置 CORS
  setCorsHeaders(res);
  
  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    console.log('处理 OPTIONS 预检请求');
    return res.status(200).end();
  }
  
  try {
    // 解析 URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());
    
    console.log('解析路径:', pathname);
    console.log('查询参数:', query);
    
    // 创建适配的 request 对象（模拟你 server.js 中的 req）
    const adaptedReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: query,
      body: null
    };
    
    // 如果有请求体，读取它
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      try {
        adaptedReq.body = await readBody(req);
        console.log('请求体:', adaptedReq.body);
      } catch (error) {
        console.log('读取请求体失败:', error);
      }
    }
    
    // 创建适配的 response 对象
    const adaptedRes = {
      setHeader: (key, value) => res.setHeader(key, value),
      writeHead: (status) => {
        res.status(status);
        return adaptedRes;
      },
      end: (data) => {
        if (data) {
          res.end(data);
        } else {
          res.end();
        }
      },
      status: (statusCode) => {
        res.status(statusCode);
        return adaptedRes;
      },
      json: (data) => {
        res.json(data);
      }
    };
    
    // 调用你现有的路由处理器
    // 1. 认证路由
    if (pathname.startsWith('/api/auth/')) {
      console.log('路由到 handleAuthRoute');
      const result = await handleAuthRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    // 2. Profile 路由
    if (pathname === '/api/profile/info' || pathname.startsWith('/api/profile/')) {
      console.log('路由到 handleProfileRoute');
      const result = await handleProfileRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    // 3. Books 路由
    // if (pathname.startsWith('/api/books/')) {
    //   console.log('路由到 handleBooksRoute');
    //   const result = await handleBooksRoute(pathname, adaptedReq, adaptedRes);
    //   if (result !== null) return;
    // }
    
    // 4. Library 路由
    if (pathname === '/api/library' || pathname.startsWith('/api/library/')) {
      console.log('路由到 handleLibraryRoute');
      const result = await handleLibraryRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    // 5. Drafts 路由
    if (pathname === '/api/drafts' || pathname.startsWith('/api/drafts/')) {
      console.log('路由到 handleDraftsRoute');
      const result = await handleDraftsRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    // 6. Orders 路由
    if (pathname === '/api/orders' || pathname.startsWith('/api/orders/')) {
      console.log('路由到 handleOrdersRoute');
      const result = await handleOrdersRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    // 7. Cart 路由
    if (pathname.startsWith('/api/cart/')) {
      console.log('路由到 handleCartRoute');
      const result = await handleCartRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    // 8. 健康检查
    if (pathname === '/api/health' && req.method === 'GET') {
      console.log('处理健康检查');
      return res.status(200).json({
        status: 'ok',
        message: 'API is running on Vercel',
        timestamp: new Date().toISOString(),
        routes: ['auth', 'cart', 'profile', 'drafts', 'orders', 'library']
      });
    }
    
    // 9. 测试数据库
    if (pathname === '/api/test-db' && req.method === 'GET') {
      console.log('处理数据库测试');
      // 这里可以直接调用你的数据库逻辑
      try {
        const { getPool } = await import('../lib/pooler.js');
        const pool = getPool();
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        
        return res.status(200).json({
          status: 'success',
          message: '数据库连接成功',
          time: result.rows[0].now
        });
      } catch (error) {
        return res.status(500).json({
          status: 'error',
          message: '数据库连接失败',
          error: error.message
        });
      }
    }
    
    // 404 - 没有匹配的路由
    console.log('❌ 未找到路由:', pathname);
    return res.status(404).json({
      error: 'Not found',
      path: pathname,
      availableRoutes: [
        '/api/health',
        '/api/test-db',
        '/api/auth/*',
        '/api/cart/*',
        '/api/profile/*',
        // '/api/books/*',
        '/api/drafts/*',
        '/api/orders/*',
        '/api/library/*'
      ]
    });
    
  } catch (error) {
    console.error('❌ API 处理错误:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}