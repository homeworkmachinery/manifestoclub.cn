// 在 lib/cors.js 中更新
export function setCorsHeaders(res) {
  // 允许所有来源（生产环境应限制具体域名）
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // 允许的 HTTP 方法
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  
  // 允许的请求头
  res.setHeader('Access-Control-Allow-Headers', 
    'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control'
  );
  
  // 允许携带凭证（如果需要）
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // 预检请求缓存时间
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Vary 头，避免 CDN 缓存问题
  res.setHeader('Vary', 'Origin');
}