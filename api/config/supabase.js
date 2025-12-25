// config/supabase.js

import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;
let isInitialized = false;

export function getSupabaseClient() {
  // 检查是否已经初始化
  if (!isInitialized) {
    console.log('🔄 正在初始化 Supabase 客户端...');
    
    // 检查环境变量
    if (!process.env.SUPABASE_URL) {
      console.error('❌ SUPABASE_URL 未设置');
      console.log('💡 提示：请等待 server.js 加载环境变量后再调用此函数');
      console.log('💡 或者确保 .env.local 文件存在且格式正确');
      return null; // 返回 null 而不是抛出错误
    }
    
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY 未设置');
      return null;
    }
    
    try {
      supabaseClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );
      isInitialized = true;
      console.log('✅ Supabase 客户端初始化成功');
    } catch (error) {
      console.error('❌ 创建 Supabase 客户端失败:', error.message);
      return null;
    }
  }
  
  return supabaseClient;
}

// 可选的：手动初始化函数
export function initSupabase(url, serviceRoleKey) {
  if (supabaseClient) {
    console.log('Supabase 已初始化，跳过重复初始化');
    return supabaseClient;
  }
  
  supabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  isInitialized = true;
  console.log('✅ Supabase 手动初始化成功');
  return supabaseClient;
}