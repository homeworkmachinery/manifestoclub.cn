// auth-supabase-manager.js (优化版)
// 核心优化：连接复用、智能缓存、并行加载

import { createClient } from '@supabase/supabase-js';

// ==================== 安全的环境变量获取 ====================

const getConfig = () => {
  // ⭐ 修复 1：安全地检查环境变量
  // 如果在浏览器中运行，process 不存在
  // 如果在 Node.js 中运行，process 存在

  // 方式 1：推荐 - 使用 NEXT_PUBLIC_* 前缀（前端可见）
  const supabaseUrl = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : "https://diydajlvfdvujiogryte.supabase.co";

  const supabaseAnonKey = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpeWRhamx2ZmR2dWppb2dyeXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNjc0MDMsImV4cCI6MjA4MDg0MzQwM30.dqqhQ2QT5aUnweLAEQrfilsrkqdCj096oDUeg92TqNs";

  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    storageKey: 'manifesto-auth-data'
  };
};

const SUPABASE_CONFIG = getConfig();

console.log('✅ Supabase 配置加载:', {
  url: SUPABASE_CONFIG.url,
  hasKey: !!SUPABASE_CONFIG.anonKey
});

// ==================== 优化的连接管理 ====================
let supabaseSession = null;
let sessionCheckTime = 0;
let sessionCheckInterval = 5 * 60 * 1000; // 5分钟检查一次
let connectionCheckInterval = null;

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: 'pkce',
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    }
  },
  global: {
    headers: {
  //  'Content-Type': 'application/json'
    }
  }
});

// 优化的 session 恢复 - 使用缓存避免重复调用
async function restoreSupabaseSession(force = false) {
  const now = Date.now();
  
  // 如果距上次检查不超过30秒且不是强制刷新，直接返回
  if (!force && supabaseSession && (now - sessionCheckTime) < 30000) {
    console.log('⏭️ Session 缓存有效，跳过检查');
    return true;
  }

  if (!window.authManager) {
    console.log('⚠️ AuthManager 未加载');
    return false;
  }
  
  if (!window.authManager.isAuthenticated()) {
    console.log('⏭️ 用户未登录');
    return false;
  }
  
  const token = window.authManager.getToken();
  const user = window.authManager.getCurrentUser();
  
  if (!token || !user) {
    console.log('❌ 无效的认证数据');
    return false;
  }
  
  try {
    const { error } = await supabase.auth.setSession({
      access_token: token,
      refresh_token: window.authManager.refreshToken || '',
      expires_at: window.authManager.expiresAt || 0,
      token_type: 'bearer',
      user: user
    });
    
    if (error) {
      console.error('❌ 设置 session 失败:', error);
      return false;
    }
    
    supabaseSession = { user, token, timestamp: now };
    sessionCheckTime = now;
    console.log('✅ Supabase session 恢复成功');
    startConnectionMonitor();
    return true;
  } catch (error) {
    console.error('❌ 恢复 session 时出错:', error);
    return false;
  }
}

// 轻量级连接监控
function startConnectionMonitor() {
  if (connectionCheckInterval) clearInterval(connectionCheckInterval);
  
  connectionCheckInterval = setInterval(async () => {
    if (document.hidden) return;
    
    try {
      const { error } = await supabase.auth.getSession();
      if (error && window.authManager?.isAuthenticated()) {
        console.log('⚠️ 连接断开，尝试恢复');
        await restoreSupabaseSession(true);
      }
    } catch (error) {
      console.warn('⚠️ 连接检查异常:', error);
    }
  }, 5 * 60 * 1000);
}

// ==================== AuthManager 类 ====================
class AuthManager {
  constructor() {
    this.user = null;
    this.token = null;
    this.refreshToken = null;
    this.expiresAt = null;
    this.storageKey = SUPABASE_CONFIG.storageKey;
    this.isInitialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      console.log('🚀 AuthManager 初始化中');
      this.loadFromStorage();
      
      if (this.token && this.isTokenExpired()) {
        try {
          await this.refreshAccessToken();
        } catch (error) {
          console.error('初始刷新失败:', error);
          this.logout();
        }
      }
      
      // 触发事件
      setTimeout(() => {
        if (this.user) {
          document.dispatchEvent(new CustomEvent('authStateChanged', {
            detail: { user: this.user, isAuthenticated: this.isAuthenticated() }
          }));
        }
        
        document.dispatchEvent(new CustomEvent('authReady', {
          detail: { authManager: this, isReady: true }
        }));
        console.log('✅ AuthManager 初始化完成');
      }, 100);
      
      this.isInitialized = true;
      return this;
    })();
    
    return this.initPromise;
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return false;
      
      const data = JSON.parse(stored);
      const daysPassed = (Date.now() - (data.savedAt || 0)) / (1000 * 60 * 60 * 24);
      
      if (daysPassed > 7) {
        localStorage.removeItem(this.storageKey);
        return false;
      }
      
      this.user = data.user;
      this.token = data.token;
      this.refreshToken = data.refreshToken;
      this.expiresAt = data.expiresAt;
      console.log('📂 从存储加载认证数据');
      return true;
    } catch (error) {
      console.error('加载失败:', error);
      try { localStorage.removeItem(this.storageKey); } catch (e) {}
      return false;
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        user: this.user,
        token: this.token,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
        savedAt: Date.now()
      }));
      return true;
    } catch (error) {
      console.error('保存失败:', error);
      return false;
    }
  }

  isTokenExpired() {
    if (!this.expiresAt) return true;
    const now = Math.floor(Date.now() / 1000);
    return (this.expiresAt - 60) < now;
  }

  isAuthenticated() {
    return this.token && !this.isTokenExpired();
  }

  async onLoginSuccess(supabaseResponse) {
    if (supabaseResponse.data?.session) {
      const { session, user } = supabaseResponse.data;
      this.user = user;
      this.token = session.access_token;
      this.refreshToken = session.refresh_token;
      this.expiresAt = session.expires_at;
      this.saveToStorage();
      
      console.log('✅ 登录成功');
      
      // 并行触发事件
      Promise.all([
        restoreSupabaseSession(true),
        new Promise(r => {
          document.dispatchEvent(new CustomEvent('authStateChanged', {
            detail: { user, isAuthenticated: true, source: 'login' }
          }));
          document.dispatchEvent(new CustomEvent('loginSuccess', { detail: { user } }));
          r();
        })
      ]);
      
      return true;
    }
    return false;
  }

  async onSignupSuccess(supabaseResponse) {
    if (supabaseResponse.data?.user) {
      const { user, session } = supabaseResponse.data;
      if (session) {
        return this.onLoginSuccess(supabaseResponse);
      } else {
        this.user = user;
        this.token = null;
        this.refreshToken = null;
        this.expiresAt = null;
        console.log('✅ 注册成功（待邮箱验证）');
        
        document.dispatchEvent(new CustomEvent('signupSuccess', { detail: { user } }));
        return true;
      }
    }
    return false;
  }

  logout() {
    const oldUser = this.user;
    this.user = null;
    this.token = null;
    this.refreshToken = null;
    this.expiresAt = null;
    supabaseSession = null;
    
    try {
      localStorage.removeItem(this.storageKey);
      localStorage.removeItem('supabase.auth.token');
    } catch (e) {}
    
    document.dispatchEvent(new CustomEvent('authStateChanged', {
      detail: { user: null, isAuthenticated: false, source: 'logout', oldUser }
    }));
    document.dispatchEvent(new CustomEvent('logout', { detail: { oldUser } }));
    console.log('✅ 已登出');
  }

  getCurrentUser() { return this.user; }
  getToken() { return this.token; }

  getAuthHeaders() {
    const headers = {
      'apikey': SUPABASE_CONFIG.anonKey,
      'Content-Type': 'application/json'
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  async refreshAccessToken() {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(
        'https://diydajlvfdvujiogryte.supabase.co/auth/v1/token?grant_type=refresh_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_CONFIG.anonKey
          },
          body: JSON.stringify({ refresh_token: this.refreshToken })
        }
      );

      if (!response.ok) {
        if (response.status === 400) this.logout();
        return false;
      }

      const data = await response.json();
      this.token = data.access_token;
      this.refreshToken = data.refresh_token;
      this.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
      this.saveToStorage();
      
      document.dispatchEvent(new CustomEvent('tokenRefreshed', {
        detail: { user: this.user, expiresAt: this.expiresAt }
      }));
      
      console.log('✅ Token 已刷新');
      return true;
    } catch (error) {
      console.error('刷新失败:', error);
      return false;
    }
  }

 async supabaseRequest(endpoint, options = {}) {
  try {
    const headers = this.getAuthHeaders();
    
    // REST API 请求需要 Content-Type
    if (options.method && ['POST', 'PATCH', 'PUT'].includes(options.method)) {
      headers['Content-Type'] = 'application/json';
    }
    
    Object.assign(headers, options.headers || {});
    const url = `https://diydajlvfdvujiogryte.supabase.co/rest/v1/${endpoint}`;
    
    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.token}`;
        response = await fetch(url, { ...options, headers });
      }
    }

    return response;
  } catch (error) {
    console.error('请求失败:', error);
    throw error;
  }
}

  async getUserProfile() {
    if (!this.user) return null;
    try {
      const response = await this.supabaseRequest(
        `profiles?user_id=eq.${this.user.id}&select=*`,
        { method: 'GET' }
      );
      if (response.ok) {
        const profiles = await response.json();
        return profiles[0] || null;
      }
    } catch (error) {
      console.error('获取资料失败:', error);
    }
    return null;
  }

  async updateUserProfile(profileData) {
    if (!this.user) return null;
    return this.supabaseRequest(
      `profiles?user_id=eq.${this.user.id}`,
      { method: 'PATCH', body: JSON.stringify(profileData) }
    );
  }
}

// ==================== SupabaseManager 类（简化版）====================
class SupabaseManager {
  constructor() {
    this.isConnected = false;
  }

  async ensureConnection() {
    if (this.isConnected) return true;
    
    if (window.authManager?.isAuthenticated()) {
      const restored = await restoreSupabaseSession();
      this.isConnected = restored;
    } else {
      this.isConnected = true; // 匿名连接
    }
    
    return this.isConnected;
  }

  disconnect() {
    this.isConnected = false;
    supabaseSession = null;
  }

  handleVisibilityChange() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.ensureConnection().catch(console.error);
      }
    });
  }
}

// ==================== PageScriptManager 类 ====================
class PageScriptManager {
  constructor() {
    this.loadedScripts = new Set();
  }

  async loadScript(scriptName) {
    if (this.loadedScripts.has(scriptName)) return;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `/js/${scriptName}`;
      script.async = false;
      script.onload = () => {
        this.loadedScripts.add(scriptName);
        console.log(`✅ ${scriptName} 加载完成`);
        resolve();
      };
      script.onerror = () => {
        console.warn(`⚠️ ${scriptName} 加载失败`);
        resolve();
      };
      document.body.appendChild(script);
    });
  }
}

// ==================== 全局初始化 ====================
let authManager = null;
let supabaseManager = null;
let pageScriptManager = null;

function initAuthManager() {
  if (!authManager) {
    authManager = new AuthManager();
    if (typeof window !== 'undefined') window.authManager = authManager;
    authManager.init();
  }
  return authManager;
}

function initSupabaseManager() {
  if (!supabaseManager) {
    supabaseManager = new SupabaseManager();
    if (typeof window !== 'undefined') {
      window.supabaseManager = supabaseManager;
      supabaseManager.handleVisibilityChange();
    }
  }
  return supabaseManager;
}

function initPageScriptManager() {
  if (!pageScriptManager) {
    pageScriptManager = new PageScriptManager();
    if (typeof window !== 'undefined') window.pageScriptManager = pageScriptManager;
  }
  return pageScriptManager;
}

async function initAuthAndSupabase() {
  console.log('🚀 初始化认证和Supabase');
  
  initAuthManager();
  initSupabaseManager();
  initPageScriptManager();
  
  if (typeof window !== 'undefined') {
    window.supabase = supabase;
    window.restoreSupabaseSession = restoreSupabaseSession;
    
    // 快速更新 Supabase Auth
    window.updateSupabaseAuth = function() {
      if (window.authManager?.isAuthenticated()) {
        const token = window.authManager.getToken();
        supabase.auth.setSession({
          access_token: token,
          refresh_token: window.authManager.refreshToken || '',
          expires_at: window.authManager.expiresAt || 0,
          token_type: 'bearer',
          user: window.authManager.getCurrentUser()
        }).catch(error => console.error('更新失败:', error));
        supabaseSession = { token, user: window.authManager.getCurrentUser(), timestamp: Date.now() };
      } else {
        supabase.auth.setSession(null);
        supabaseSession = null;
      }
    };
  }

  // 监听认证变化
  document.addEventListener('authStateChanged', () => {
    if (window.updateSupabaseAuth) window.updateSupabaseAuth();
  });

  // 页面恢复时检查连接
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.authManager?.isAuthenticated()) {
      restoreSupabaseSession().catch(console.error);
    }
  });

  console.log('✅ 初始化完成');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthAndSupabase);
} else {
  initAuthAndSupabase();
}

export { 
  supabase, 
  restoreSupabaseSession,
  AuthManager,
  SupabaseManager,
  PageScriptManager,
  initAuthAndSupabase
};

