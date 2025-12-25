// sessionManager.js
class EnhancedSessionManager {
  constructor(supabase) {
    this.supabase = supabase;
    this.isRestoring = false;
    this.lastRestoreTime = 0;
    this.restoreRetryCount = 0;
    
    this.init();
  }

  init() {
    console.log('🔧 初始化增强 Session 管理器');
    
    // 页面加载时恢复 session
    this.restoreSessionOnLoad();
    
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.handlePageResume();
      }
    });
    
    // 监听 storage 变化（其他标签页登录/登出）
    window.addEventListener('storage', (event) => {
      if (event.key && event.key.includes('auth-token')) {
        console.log('📢 检测到其他标签页的 auth 变化');
        setTimeout(() => this.restoreSession(), 300);
      }
    });
  }

  // 页面加载时恢复 session
  async restoreSessionOnLoad() {
    // 等待页面完全加载
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('🔄 页面加载，尝试恢复 session...');
    
    // 检查是否有存储的 token
    const storedToken = this.getStoredToken();
    if (!storedToken) {
      console.log('📭 没有存储的 token');
      return;
    }
    
    // 如果已经有活跃 session，先检查有效性
    const { data: { session: currentSession } } = await this.supabase.auth.getSession();
    
    if (currentSession && this.isSessionValid(currentSession)) {
      console.log('✅ 已有活跃 session，用户:', currentSession.user?.email);
      return;
    }
    
    // 执行完整的 session 恢复
    await this.restoreSession();
  }

  // 完整的 session 恢复流程
  async restoreSession() {
    if (this.isRestoring) {
      console.log('⏳ Session 恢复已在进行中');
      return;
    }
    
    // 防止过于频繁的恢复
    const now = Date.now();
    if (now - this.lastRestoreTime < 5000) {
      console.log('⏰ 距离上次恢复时间太短，跳过');
      return;
    }
    
    this.isRestoring = true;
    this.lastRestoreTime = now;
    
    try {
      console.log('🔄 执行完整 session 恢复...');
      
      // 步骤1：获取存储的 token
      const storedToken = this.getStoredToken();
      if (!storedToken) {
        console.log('❌ 没有找到存储的 token');
        return;
      }
      
      // 步骤2：检查 token 是否有效
      if (!this.isTokenValid(storedToken)) {
        console.log('❌ 存储的 token 已过期');
        await this.clearInvalidToken();
        return;
      }
      
      // 步骤3：设置 session 到 Supabase
      console.log('🔐 设置 session 到 Supabase...');
      const { data: setSessionData, error: setSessionError } = await this.supabase.auth.setSession({
        access_token: storedToken.access_token,
        refresh_token: storedToken.refresh_token
      });
      
      if (setSessionError) {
        console.error('❌ 设置 session 失败:', setSessionError.message);
        throw setSessionError;
      }
      
      // 步骤4：验证 session 是否真的生效
      console.log('✅ Session 已设置，验证有效性...');
      await this.verifySession();
      
      this.restoreRetryCount = 0;
      console.log('🎉 Session 恢复成功');
      
    } catch (error) {
      console.error('❌ Session 恢复失败:', error);
      
      this.restoreRetryCount++;
      if (this.restoreRetryCount <= 3) {
        // 指数退避重试
        const delay = Math.min(1000 * Math.pow(2, this.restoreRetryCount), 10000);
        console.log(`⏳ ${delay}ms 后重试 (${this.restoreRetryCount}/3)`);
        
        setTimeout(() => {
          this.isRestoring = false;
          this.restoreSession();
        }, delay);
      } else {
        console.error('❌ 达到最大重试次数，放弃恢复');
        await this.clearInvalidToken();
      }
    } finally {
      if (this.restoreRetryCount <= 3) {
        this.isRestoring = false;
      }
    }
  }

  // 获取存储的 token
  getStoredToken() {
    try {
      // 尝试从 Supabase 的标准存储位置获取
      const storageKey = `sb-${this.supabase.supabaseUrl.replace(/https?:\/\//, '')}-auth-token`;
      const stored = localStorage.getItem(storageKey);
      
      if (!stored) {
        // 尝试从可能的其他位置获取
        const keys = Object.keys(localStorage).filter(key => 
          key.includes('auth') && key.includes('token')
        );
        
        for (const key of keys) {
          const item = localStorage.getItem(key);
          try {
            const parsed = JSON.parse(item);
            if (parsed.currentSession?.access_token) {
              return parsed.currentSession;
            }
          } catch (e) {
            // 继续尝试下一个
          }
        }
        
        return null;
      }
      
      const parsed = JSON.parse(stored);
      return parsed.currentSession;
      
    } catch (error) {
      console.error('获取存储的 token 失败:', error);
      return null;
    }
  }

  // 检查 token 是否有效
  isTokenValid(token) {
    if (!token?.access_token || !token.expires_at) {
      return false;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = token.expires_at;
    
    // 添加30秒的缓冲时间
    return expiresAt > now + 30;
  }

  // 检查 session 是否有效
  isSessionValid(session) {
    if (!session?.access_token) {
      return false;
    }
    
    const now = Math.floor(Date.now() / 1000);
    return session.expires_at > now;
  }

  // 验证 session 是否真的生效
  async verifySession() {
    try {
      // 方法1：获取用户信息
      const { data: { user }, error: userError } = await this.supabase.auth.getUser();
      
      if (userError) {
        console.warn('验证失败: 获取用户信息错误', userError.message);
        throw userError;
      }
      
      if (!user) {
        console.warn('验证失败: 没有用户信息');
        throw new Error('No user found');
      }
      
      console.log('👤 验证成功，用户:', user.email);
      
      // 方法2：执行一个简单的查询确认权限
      const { error: queryError } = await this.supabase
        .from('profiles')
        .select('id')
        .limit(1)
        .maybeSingle();
      
      if (queryError && queryError.code !== 'PGRST116') {
        console.warn('验证警告: 查询失败', queryError.message);
        // 不抛出错误，因为用户信息已成功获取
      }
      
      return true;
      
    } catch (error) {
      console.error('❌ Session 验证失败:', error);
      throw error;
    }
  }

  // 处理页面恢复
  async handlePageResume() {
    console.log('👁️ 页面恢复，检查 session 状态');
    
    // 等待页面完全恢复
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      // 检查当前 session
      const { data: { session } } = await this.supabase.auth.getSession();
      
      if (!session) {
        console.log('⚠️ 页面恢复时没有 session，尝试恢复');
        await this.restoreSession();
        return;
      }
      
      // 检查 session 是否有效
      if (!this.isSessionValid(session)) {
        console.log('⚠️ Session 已过期，刷新');
        await this.refreshSession();
        return;
      }
      
      // 检查是否需要提前刷新（5分钟内过期）
      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at - now < 300) {
        console.log('⏰ Session 即将过期，提前刷新');
        await this.refreshSession();
        return;
      }
      
      console.log('✅ Session 状态正常');
      
    } catch (error) {
      console.error('页面恢复检查失败:', error);
    }
  }

  // 刷新 session
  async refreshSession() {
    try {
      console.log('🔄 刷新 session...');
      
      const { data, error } = await this.supabase.auth.refreshSession();
      
      if (error) {
        console.error('❌ 刷新 session 失败:', error.message);
        
        // 如果刷新失败，尝试完整恢复
        if (error.message.includes('expired') || error.message.includes('invalid')) {
          console.log('🔐 Refresh token 无效，尝试完整恢复');
          await this.restoreSession();
        }
        return;
      }
      
      if (data.session) {
        console.log('✅ Session 刷新成功');
      }
      
    } catch (error) {
      console.error('刷新 session 异常:', error);
    }
  }

  // 清理无效的 token
  async clearInvalidToken() {
    try {
      console.log('🧹 清理无效的 token...');
      
      // 登出 Supabase
      await this.supabase.auth.signOut();
      
      // 清理 localStorage 中的相关项
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.includes('auth') || key.includes('supabase') || key.includes('token')
      );
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      console.log('✅ 无效 token 已清理');
      
    } catch (error) {
      console.error('清理 token 失败:', error);
    }
  }

  // 获取当前 session 状态（用于调试）
  async getSessionStatus() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const { data: { user } } = await this.supabase.auth.getUser();
      
      return {
        hasSession: !!session,
        hasUser: !!user,
        userEmail: user?.email,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toLocaleTimeString() : null,
        expiresIn: session?.expires_at ? Math.floor((session.expires_at * 1000 - Date.now()) / 1000) : null,
        isValid: session ? this.isSessionValid(session) : false
      };
    } catch (error) {
      return {
        error: error.message
      };
    }
  }
}

export default EnhancedSessionManager;