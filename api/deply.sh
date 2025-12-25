#!/bin/bash

echo "🚀 开始部署后端到 Vercel..."

# 确保在 server 目录
if [ ! -f "server.js" ]; then
  echo "❌ 请在 server/ 目录中运行此脚本"
  exit 1
fi

# 创建 api 目录（如果不存在）
mkdir -p api

# 创建核心 API 文件
echo "📝 创建 api/index.js..."
cat > api/index.js << 'EOF'
// 这是调用你所有 routes/ 的主文件
import { handleAuthRoute } from '../routes/auth.js';
import { handleCartRoute } from '../routes/cart.js';
import { handleProfileRoute } from '../routes/profile.js';
import { handleDraftsRoute } from '../routes/drafts.js';
import { handleOrdersRoute } from '../routes/orders.js';
import { handleLibraryRoute } from '../routes/library.js';
import { handleBooksRoute } from '../routes/books.js';

// 设置 CORS
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export default async function handler(req, res) {
  console.log(\`Vercel: \${req.method} \${req.url}\`);
  
  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    const url = new URL(req.url, \`http://\${req.headers.host}\`);
    const pathname = url.pathname;
    
    // 创建适配的请求对象
    const adaptedReq = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: Object.fromEntries(url.searchParams.entries())
    };
    
    // 创建适配的响应对象
    const adaptedRes = {
      setHeader: (key, value) => res.setHeader(key, value),
      writeHead: (status) => {
        res.status(status);
        return adaptedRes;
      },
      end: (data) => res.end(data),
      json: (data) => res.json(data)
    };
    
    // 路由分发
    if (pathname.startsWith('/api/auth/')) {
      const result = await handleAuthRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    if (pathname.startsWith('/api/cart/')) {
      const result = await handleCartRoute(pathname, adaptedReq, adaptedRes);
      if (result !== null) return;
    }
    
    // 健康检查
    if (pathname === '/api/health') {
      return res.status(200).json({
        status: 'ok',
        message: '后端已部署到 Vercel',
        timestamp: new Date().toISOString()
      });
    }
    
    // 404
    return res.status(404).json({ error: 'Not found', path: pathname });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
EOF

# 创建 vercel.json
echo "⚙️ 创建 vercel.json..."
cat > vercel.json << 'EOF'
{
  "version": 2,
  "builds": [
    {
      "src": "api/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api"
    }
  ]
}
EOF

# 安装必要依赖
echo "📦 安装依赖..."
npm install @vercel/node --save-dev

# 部署
echo "🚚 部署到 Vercel..."
echo ""
echo "📝 第一次部署需要设置环境变量："
echo "  1. npx vercel env add DATABASE_URL"
echo "  2. npx vercel env add SUPABASE_URL"
echo "  3. npx vercel env add SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "按回车继续部署..."
read

npx vercel --prod

echo ""
echo "✅ 部署完成！"
echo "🌐 你的后端地址：https://你的项目.vercel.app"
echo ""
echo "📱 手机测试地址："
echo "  https://你的项目.vercel.app/api/health"
echo ""
echo "💡 前端需要连接的 API 地址："
echo "  const API_URL = 'https://你的项目.vercel.app';"