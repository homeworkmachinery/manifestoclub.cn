
//------------


// 初始化条形码（页面加载时）
window.addEventListener("load", () => {
    generateBarcode("MANIFESTOCLUB");
    
    // 为输入框添加实时监听
    setupBarcodeGeneration();
  });
  

  function setupBarcodeGeneration() {
    const manifestoInput = document.getElementById("manifesto");
    
    // 监听输入事件
    const handleInput = debounce(async function() {
      const text = this.value.trim();
      if (text) {
        await generateBarcode(text);
      } else {
        await generateBarcode("MANIFESTOCLUB"); // 默认值
      }
    }, 300); // 防抖300ms
  
    manifestoInput.addEventListener("input", handleInput);
  }
  
  // 防抖函数（避免频繁生成）
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this, args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
  }
  


  async function generateBarcode(inputText, targetElementId = "barcode") {
    // 默认显示文本
    let displayText = "ManifestoClub";
    let barcodeValue = "MANIFESTOCLUB"; // 默认条形码值
    
    // 处理用户输入
    if (inputText && inputText !== "MANIFESTOCLUB") {
      const hash = await generateHash(inputText);
      displayText = hash.slice(0, 15); // 显示15位哈希值
      barcodeValue = hash; // 使用完整哈希作为条形码值
    } else {
      // 使用默认值生成哈希（但不显示哈希）
      barcodeValue = await generateHash("MANIFESTOCLUB");
    }
  
    try {
      const barcodeElement = document.getElementById(targetElementId);
      barcodeElement.innerHTML = ""; // 清除现有条形码
      
 // 检查 JsBarcode 是否可用
 if (typeof JsBarcode === 'undefined') {
  console.error('JsBarcode 库未加载');
}

      JsBarcode(barcodeElement, barcodeValue, {
        format: "CODE128",
        displayValue: true,
        text: displayText, // 动态设置显示文本
        font: '"Lucida Console"',
        width: 2,
        height: 80,
        margin: 0,
      });
      
      barcodeElement.setAttribute("data-barcode", barcodeValue);

    } catch (e) {
      console.error("生成条形码失败:", e);
    }
  }

  
// 修复后的Hash生成函数 - 支持HTTP和HTTPS环境
async function generateHash(text) {
  // 检查是否支持 crypto.subtle
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      return hashHex.slice(0, 15);
    } catch (error) {
      console.warn('crypto.subtle 不可用，使用备用哈希方法');
      return generateFallbackHash(text);
    }
  } else {
    // 备用哈希方法（适用于HTTP环境）
    return generateFallbackHash(text);
  }
}

// 备用哈希函数 - 简单但有效的哈希算法
function generateFallbackHash(text) {
  let hash = 0;
  const str = text + "MANIFESTOCLUB_SALT"; // 添加盐值增加唯一性
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  
  // 转换为正数并生成15位十六进制字符串
  const positiveHash = Math.abs(hash);
  let hexHash = positiveHash.toString(16).padStart(8, '0');
  
  // 如果不足15位，重复并截取
  while (hexHash.length < 15) {
    hexHash += positiveHash.toString(16);
  }
  
  return hexHash.slice(0, 15);
}


// -------------




// -----------------
async function checkManifesto() {
  const input = document.getElementById("manifesto");
  const checkIcon = document.querySelector(".check-manifesto");
  const errorText = document.getElementById("manifesto-error");

  // 清空之前的提示和图标
  errorText.style.display = "none";
  checkIcon.innerHTML = "";

  // 空内容处理
  if (!input.value.trim()) {
    errorText.textContent = "Please enter your manifesto";
    errorText.style.display = "block";
    return false;
  }

  // 检查 Manifesto 是否可用
  const isAvailable = await validateManifesto(input.value);

  // 创建或更新图标
  let iconImg = checkIcon.querySelector("img");
  if (!iconImg) {
    iconImg = document.createElement("img");
    iconImg.alt = isAvailable ? "Valid" : "Invalid";
    checkIcon.appendChild(iconImg);
  }

  // 根据验证结果更新UI
  if (isAvailable) {
    iconImg.src = "yes.png";
    errorText.style.display = "none";
  } else {
    iconImg.src = "no.png";
    errorText.textContent = "This manifesto already exists";
    errorText.style.display = "block";
  }

  return isAvailable;
}


  
  async function validateManifesto(manifestoText) {
    if (!manifestoText.trim()) return false; // 空内容直接返回不可用
  
    const { data, error } = await supabase
      .from('profiles')
      .select('manifesto')
      .eq('manifesto', manifestoText); // 检查 manifesto 列
  
    if (error) {
      console.error('Supabase error:', error);
      return false;
    }
  
    return data.length === 0; // true = 可用，false = 重复
  }




  async function checkEmail() {
    const input = document.getElementById("signup-email");
    const checkIcon = document.querySelector(".check-email");
    const errorText = document.getElementById("email-error");
  
    // 清空现有内容
    checkIcon.innerHTML = "";
    errorText.style.display = "none";
  
    const validation = await validateEmail(input.value);
  
    if (!validation.valid) {
      // 根据不同的错误原因显示不同的提示
      switch(validation.reason) {
        case "empty":
          return false;
        case "invalid_format":
          errorText.textContent = "Please enter a valid email address";
          break;
        case "registered":
          errorText.textContent = "This email is already registered";
          break;
        default:
          errorText.textContent = "Validation error";
      }
      errorText.style.display = "block";
      checkIcon.innerHTML = '<img src="no.png" alt="Invalid">';
      return false;
    }
  
    checkIcon.innerHTML = '<img src="yes.png" alt="Valid">';
    return true;
  }


  
  async function validateEmail(emailText) {
    // 检查是否为空
    if (!emailText.trim()) {
      return {
        valid: false,
        reason: "empty"
      };
    }
  
    // 检查Email格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailText)) {
      return {
        valid: false,
        reason: "invalid_format"
      };
    }
  
    // 检查是否已注册
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', emailText);
  
    if (error) {
      console.error('Supabase error:', error);
      return {
        valid: false,
        reason: "error"
      };
    }
  
    return {
      valid: data.length === 0,
      reason: data.length === 0 ? "available" : "registered"
    };
  }




  async function checkPassword() {
    const input = document.getElementById("signup-password");
    const checkIcon = document.querySelector(".check-password");
    const errorText = document.getElementById("password-error");
  
    // 清空现有内容
    checkIcon.innerHTML = "";
    errorText.style.display = "none";
  
    // 获取密码并移除首尾空格
    const password = input.value.trim();
  
    // 检查是否为空
    if (password.length === 0) {
      return false;
    }
  
    // 检查密码长度
    const isValid = password.length >= 8;
  
    // 更新图标和错误提示
    if (isValid) {
      checkIcon.innerHTML = '<img src="yes.png" alt="Valid">';
    } else {
      checkIcon.innerHTML = '<img src="no.png" alt="Invalid">';
      errorText.textContent = "Password must be longer than 8 characters";
      errorText.style.display = "block";
    }
  
    return isValid;
  }




  async function signup() {
    // 执行所有检查
    const [isManifestoValid, isEmailValid, isPasswordValid] = await Promise.all([
      checkManifesto(),
      checkEmail(),
      checkPassword()
    ]);
  
    // 如果有未通过的检查，显示对应错误并阻止注册
    if (!isManifestoValid || !isEmailValid || !isPasswordValid) {
      // 闪现错误提示（先隐藏再显示）
      const showError = (element) => {
        element.style.display = "none";
        setTimeout(() => element.style.display = "block", 10);
      };
  
      if (!isManifestoValid) {
        showError(document.getElementById("manifesto-error"));
        document.getElementById("manifesto").focus();
      }
      if (!isEmailValid) {
        showError(document.getElementById("email-error"));
        document.getElementById("signup-email").focus();
      }
      if (!isPasswordValid) {
        showError(document.getElementById("password-error"));
        document.getElementById("signup-password").focus();
      }
  
      return; // 阻止注册
    }
  
    // 所有检查通过，继续注册流程
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    const manifesto = document.getElementById("manifesto").value;
    const barcodeValue = await generateBarcode(manifesto);

  // 使用Supabase Auth进行注册
  const { data, error  } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        manifesto: manifesto,
        barcode: barcodeValue
      }
    }
  });

  // 4. 处理注册结果
  if (error) throw error;
  
  // 5. 插入profiles表（确保RLS允许）
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      user_id: data.user.id,
      email: email,
      manifesto: manifesto,
      barcode: barcodeValue,
      created_at: new Date()
    });

  if (profileError) throw profileError;

  
  showSuccessForm({
    email: email,
    manifesto: manifesto
  });

} 



//-----

function showSuccessForm(userData) {
    // Hide all other auth forms
    document.querySelector('.auth-modal-header').style.display = 'none';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('password-reset-form').style.display = 'none';
    
    // Show and populate success form
    const successForm = document.getElementById('signup-success-form');
    successForm.style.display = 'block';
    
    const manifestoCodeElement = document.getElementById('manifesto-code');
    manifestoCodeElement.textContent = userData.manifesto;

    // Set user email
    const emailSpan = document.getElementById('success-email');
    emailSpan.textContent = userData.email;
    
    generateBarcode(userData.manifesto, "barcode-success");
    
 
}

// Resend verification email
async function resendVerificationEmail() {
    const email = document.getElementById('success-email').textContent;
    const resendBtn = document.getElementById('resend-button');
    try {
      
      resendBtn.disabled = true;
      resendBtn.textContent = 'Sending...';

      await new Promise(resolve => setTimeout(resolve, 50));

        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: email
        });
        
        if (error) throw error;
        
        resendBtn.textContent = '✓ Email Resent';
          
        
    } catch (error) {
        console.error("Failed to resend verification:", error);
        resendBtn.textContent = 'Resend Verification Email';
        resendBtn.disabled = false;
    }
}





function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
    
    // Reset forms for next time
    resetAuthForms();
}

// Helper function to reset all auth forms
function resetAuthForms() {
    // Reset form displays
    document.querySelector('.auth-modal-header').style.display = 'block';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('signup-success-form').style.display = 'none';
    document.getElementById('password-reset-form').style.display = 'none';
    
    // Clear form inputs
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('manifesto').value = '';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    
    
    // Reset any validation icons
    document.querySelectorAll('.check-icon').forEach(icon => {
        icon.innerHTML = '';
    });
    
    // Reset error messages
    document.querySelectorAll('.error-message').forEach(error => {
        error.style.display = 'none';
    });
    
    // Reset barcode to default
    generateBarcode("MANIFESTOCLUB");
}


  function showPasswordReset() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('password-reset-form').style.display = 'block';
  }


  function openAuthModal() {
    
    const authModal = document.getElementById('auth-modal');
    if (!authModal) return;
    
    authModal.style.display = 'block';
    
    // Check for password reset parameters
    const resetEmail = sessionStorage.getItem('resetEmail');
    const urlParams = new URLSearchParams(window.location.search);
    const isPasswordUpdate = urlParams.get('type') === 'password_update';
    const email = urlParams.get('email');
    
    // Handle password reset flow
    if (isPasswordUpdate && email) {
      showUpdatePasswordForm(decodeURIComponent(email));
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } 
    else if (resetEmail) {
      showUpdatePasswordForm(resetEmail);
    }
    // Check for login parameter
    else if (urlParams.has('login')) {
      showLoginForm();
    }
  }


  
  function showLoginForm() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('password-reset-form').style.display = 'none';
    document.getElementById('update-password-form').style.display = 'none';
  }
  
  function showSignupForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = 'block';
  }

  
  function handleModalClick(event) {
    // 如果点击的是模态框背景（不是内容区域）
    if (event.target === document.getElementById('auth-modal')) {
      document.getElementById('auth-modal').style.display = 'none';
      resetAuthForms();
    }
  }


// ----
let resetEmail = sessionStorage.getItem('resetEmail') || '';

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  // Check for authentication callback in URL hash
  const hash = window.location.hash;
  
  if (hash.includes('access_token') || hash.includes('refresh_token')) {
    try {
      // This will automatically handle the session from URL hash
      const { data, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error("Session recovery failed:", error.message);
      } else if (data.session) {
        console.log("Session recovered successfully", data.session);
        
        // Check if this is a password reset flow
        const urlParams = new URLSearchParams(window.location.search);
        const isPasswordUpdate = urlParams.get('type') === 'password_update';
        const email = urlParams.get('email');
        
        if (isPasswordUpdate && email) {
          showUpdatePasswordForm(decodeURIComponent(email));
        }
      }
    } catch (error) {
      console.error("Authentication callback error:", error);
    }
    
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
  }
  
  // Initialize other components
  initPasswordReset();
  setupPasswordListeners();
});

function initPasswordReset() {
  const urlParams = new URLSearchParams(window.location.search);
  const email = urlParams.get('email');
  const isPasswordUpdate = urlParams.get('type') === 'password_update';

  if (email && isPasswordUpdate) {
    resetEmail = decodeURIComponent(email);
    sessionStorage.setItem('resetEmail', resetEmail);
    showUpdatePasswordForm(resetEmail);
    
    // 清除URL参数
    window.history.replaceState({}, '', window.location.pathname);
  }
}




async function sendResetLink() {
  const email = document.getElementById('reset-email').value.trim();
  const resetBtn = document.getElementById('reset-link');
  const errorText = document.getElementById('reset-error');
  
  // Clear error messages
  errorText.style.display = 'none';
  errorText.textContent = '';

  // Validate email format
  if (!email) {
    errorText.textContent = 'Please enter your email address';
    errorText.style.display = 'block';
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errorText.textContent = 'Please enter a valid email address';
    errorText.style.display = 'block';
    return;
  }

  try {
    resetBtn.disabled = true;
    resetBtn.textContent = 'Sending...';
    
    // Check if email is registered
    const { data, error: checkError } = await supabase
      .from('profiles')
      .select('email')
      .eq('email', email)
      .single();

    if (checkError || !data) {
      errorText.textContent = 'This email is not registered';
      errorText.style.display = 'block';
      throw new Error('Email not registered');
    }

    // Send password reset email with proper redirect URL
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}?type=password_update&email=${encodeURIComponent(email)}`
    });

    if (error) throw error;
    
    resetBtn.textContent = '✓ Email Sent';
    
    // Store email for later use
    sessionStorage.setItem('resetEmail', email);
    
    setTimeout(() => {
      resetBtn.textContent = 'SEND RESET LINK';
      resetBtn.disabled = false;
    }, 3000);
    
  } catch (error) {
    console.error('Password reset error:', error);
    errorText.textContent = 'Failed to send reset link. Please try again.';
    errorText.style.display = 'block';
    resetBtn.textContent = 'SEND RESET LINK';
    resetBtn.disabled = false;
  }
}


// -----
// 密码验证函数
function showUpdatePasswordForm(email) {
  // 隐藏所有表单
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('signup-form').style.display = 'none';
  document.getElementById('password-reset-form').style.display = 'none';

  document.getElementById('update-password-form').style.display = 'block';
  
  // 设置邮箱显示
  const emailDisplay = document.getElementById('reset-email-display');
  emailDisplay.value = email;
  
  // 重置表单状态
  document.getElementById('new-password').value = '';
  document.getElementById('confirm-password').value = '';
  document.getElementById('update-password-error').style.display = 'none';
  document.getElementById('confirm-password-error').style.display = 'none';
  
  // 更新按钮状态
  checkPasswordStrength();
 
}


function showError(element, message) {
  element.textContent = message;
  element.style.display = 'block';
}


// Password validation function
function checkPasswordStrength() {
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const newPasswordIcon = document.querySelector('.check-new-password');
  const confirmPasswordIcon = document.querySelector('.check-confirm-password');
  const updatePasswordError = document.getElementById('update-password-error');
  const confirmPasswordError = document.getElementById('confirm-password-error');
  const updateBtn = document.getElementById('update-password');

  // Clear all errors and icons
  updatePasswordError.style.display = 'none';
  confirmPasswordError.style.display = 'none';
  newPasswordIcon.innerHTML = '';
  confirmPasswordIcon.innerHTML = '';

  let isValid = true;

  // Validate password length
  if (newPassword.length > 0 && newPassword.length < 8) {
      showValidationState(newPasswordIcon, false);
      updatePasswordError.textContent = 'Password must be at least 8 characters';
      updatePasswordError.style.display = 'block';
      isValid = false;
  } else if (newPassword.length >= 8) {
      showValidationState(newPasswordIcon, true);
  }

  // Validate password match
  if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      showValidationState(confirmPasswordIcon, false);
      confirmPasswordError.textContent = 'Passwords do not match';
      confirmPasswordError.style.display = 'block';
      isValid = false;
  } else if (confirmPassword && newPassword === confirmPassword) {
      showValidationState(confirmPasswordIcon, true);
  }

  // Update button state
  updateBtn.disabled = !isValid;
  return isValid;
}

// Show validation state icon
function showValidationState(iconElement, isValid) {
  iconElement.innerHTML = '';
  const iconImg = document.createElement('img');
  iconImg.src = isValid ? 'yes.png' : 'no.png';
  iconImg.alt = isValid ? 'Valid' : 'Invalid';
  iconElement.appendChild(iconImg);
}




// Update password function
async function updatePassword() {
  if (!checkPasswordStrength()) return;

  const newPassword = document.getElementById('new-password').value;
  const updateBtn = document.getElementById('update-password');
  const updatePasswordError = document.getElementById('update-password-error');

  try {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating...';

    // Check if we have a valid session first
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      throw new Error('Your password reset link has expired. Please request a new one.');
    }

    // Update the password
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;

    updateBtn.textContent = '✓ Password Updated';
    
    // Clear stored email
    sessionStorage.removeItem('resetEmail');
    
    // Show success and redirect to login
    setTimeout(() => {
      showLoginForm();
      // Clear form
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
      alert('Password updated successfully! Please log in with your new password.');
    }, 1500);

  } catch (error) {
    console.error('Update error:', error);
    updatePasswordError.textContent = error.message.includes('expired') || error.message.includes('Auth session missing')
      ? 'Your password reset link has expired. Please request a new one.'
      : `Error: ${error.message}`;
    updatePasswordError.style.display = 'block';
    updateBtn.textContent = 'UPDATE PASSWORD';
    updateBtn.disabled = false;
  }
}


let debounceTimer;
function setupPasswordListeners() {
  document.getElementById('new-password').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkPasswordStrength, 300);
  });
  
  document.getElementById('confirm-password').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkPasswordStrength, 300);
  });
}

// -----


  
async function login() {
  const loginInput = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const loginError = document.getElementById('login-error');

  // Clear previous errors
  hideLoginError();

  // Basic validation
  if (!loginInput || !password) {
    showLoginError('Please enter both email/manifesto and password');
    return;
  }

  try {
    let email = loginInput;
    
    // Check if input looks like an email (contains @)
    if (!loginInput.includes('@')) {
      // Input is likely a manifesto, find the corresponding email
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('manifesto', loginInput)
        .single();
      
      if (error || !data) {
        showLoginError('Manifesto not found. Please check your manifesto or use your email instead.');
        return;
      }
      
      email = data.email;
    }
    
    // Attempt login with the email
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (authError) {
      // Provide more specific error messages
      if (authError.message.includes('Invalid login credentials')) {
        showLoginError('Invalid credentials. Please check your password.');
      } else if (authError.message.includes('Email not confirmed')) {
        showLoginError('Please verify your email address first.');
      } else {
        showLoginError('Login failed: ' + authError.message);
      }
    } else {
      // Login successful
      hideLoginError(); // Clear any previous errors
      closeAuthModal();
      updateAuthUI();
    }
    
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('An error occurred during login. Please try again.');
  }
}

// Helper functions to show/hide login errors
function showLoginError(message) {
  const loginError = document.getElementById('login-error');
  if (loginError) {
    loginError.textContent = message;
    loginError.style.display = 'block';
    
    // Optional: Add a fade-in effect
    loginError.style.opacity = '0';
    setTimeout(() => {
      loginError.style.opacity = '1';
    }, 10);
  }
}

function hideLoginError() {
  const loginError = document.getElementById('login-error');
  if (loginError) {
    loginError.style.display = 'none';
    loginError.textContent = '';
  }
}

// Enhanced validation function for login input
function validateLoginInput(input) {
  if (!input.trim()) {
    return { valid: false, message: 'Please enter your email or manifesto' };
  }
  
  // If it contains @, validate as email
  if (input.includes('@')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input)) {
      return { valid: false, message: 'Please enter a valid email address' };
    }
  }
  
  return { valid: true };
}

// Updated real-time validation for login form
function setupLoginValidation() {
  const loginInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  
  if (loginInput) {
    loginInput.addEventListener('blur', function() {
      const validation = validateLoginInput(this.value);
      if (!validation.valid && this.value.trim()) {
        showLoginError(validation.message);
      }
    });
    
    loginInput.addEventListener('input', function() {
      // Hide error as user types
      hideLoginError();
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', function() {
      // Hide error when user starts typing password
      hideLoginError();
    });
  }
}

// Alternative login function (also updated to use error display)
async function loginAlternative() {
  const loginInput = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  // Clear previous errors
  hideLoginError();
  
  if (!loginInput || !password) {
    showLoginError('Please enter both email/manifesto and password');
    return;
  }
  
  try {
    let email = loginInput;
    
    // If input doesn't look like email, try to find it in manifesto
    if (!loginInput.includes('@')) {
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('manifesto', loginInput)
        .single();
      
      if (error || !data) {
        showLoginError('Manifesto not found.');
        return;
      }
      
      email = data.email;
    } else {
      // If it looks like email, verify it exists
      const { data, error } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', loginInput)
        .single();
      
      if (error || !data) {
        showLoginError('Email not found.');
        return;
      }
    }
    
    // Proceed with authentication
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        showLoginError('Invalid password. Please check your password and try again.');
      } else if (authError.message.includes('Email not confirmed')) {
        showLoginError('Please verify your email address first. Check your inbox for the verification link.');
      } else {
        showLoginError('Login failed: ' + authError.message);
      }
    } else {
      hideLoginError(); // Clear any previous errors
      closeAuthModal();
      updateAuthUI();
    }
    
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('An error occurred during login. Please try again.');
  }
}

// Initialize login validation when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  setupLoginValidation();
});

// Optional: Clear errors when modal opens
function showLoginForm() {
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('signup-form').style.display = 'none';
  document.getElementById('password-reset-form').style.display = 'none';
  
  // Clear any previous login errors
  hideLoginError();
}


// ----------------

async function updateAuthUI() {
  const { data: { user } } = await supabase.auth.getUser();
  const loginItem = document.querySelector('.header__nav li:last-child');
  
  if (user) {
      // 创建用户菜单HTML，基于现有的li结构
      loginItem.innerHTML = `
          <div class="user-menu">
              <span onclick="toggleUserMenu()" class="user-menu-trigger">(ME)</span>
              <div class="user-dropdown" id="user-dropdown" style="display: none;">
                  <div class="user-info">
                  <span class="profile" onclick="goToProfile()">Profile</span>
                  </div>
                  <div class="user-actions">
                      <span onclick="logout()" class="logout-btn">LOGOUT</span>
                  </div>
              </div>
          </div>
      `;
//       const userMenu = loginItem.querySelector('.user-menu');
// const dropdown = loginItem.querySelector('#user-dropdown');

// userMenu.addEventListener('mouseenter', () => {
//     dropdown.style.display = 'block';
// });

// userMenu.addEventListener('mouseleave', () => {
//     dropdown.style.display = 'none';
// });
  } else {
      // 保持原有的Login结构
      loginItem.innerHTML = `<span onclick="openAuthModal()">Login</span>`;
  }
}



// 切换用户下拉菜单显示状态
function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown.style.display === 'none' || dropdown.style.display === '') {
      dropdown.style.display = 'block';
  } else {
      dropdown.style.display = 'none';
  }
}

// 点击其他地方关闭下拉菜单
document.addEventListener('click', function(event) {
  const userMenu = document.querySelector('.user-menu');
  const dropdown = document.getElementById('user-dropdown');
  
  if (userMenu && !userMenu.contains(event.target) && dropdown) {
      dropdown.style.display = 'none';
  }
});

// 退出登录函数
async function logout() {
  try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      await updateAuthUI();
      
      
  } catch (error) {
      console.error('退出登录失败:', error.message);
  }
}

// 初始化检查登录状态
document.addEventListener('DOMContentLoaded', updateAuthUI);