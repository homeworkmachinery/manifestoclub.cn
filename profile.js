// 页面路由系统
const routes = {
    'home': {
        title: 'Home',
        render: renderHomePage
    },
    'profile': {
        title: 'Profile',
        render: renderProfilePage
    }
};

let currentRoute = 'home';


// 渲染个人资料页面
function renderProfilePage() {
    return `
        <div class="profile-content">
            <h1>User Profile</h1>
            <div class="profile-section">
                <h2>Basic Information</h2>
                <div class="profile-field">
                    <label>Username:</label>
                    <span id="username">Loading...</span>
                </div>
                <div class="profile-field">
                    <label>Email:</label>
                    <span id="email">Loading...</span>
                </div>
            </div>
            <div class="profile-section">
                <h2>Preferences</h2>
                <div class="profile-field">
                    <label>Theme:</label>
                    <select id="theme-select">
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                </div>
            </div>
            <button onclick="saveProfile()" class="save-btn">Save Changes</button>
        </div>
    `;
}

//导航到指定页面
function navigateTo(routeName) {
    if (routes[routeName]) {
        currentRoute = routeName;
        const mainContent = document.getElementById('main-content');
        mainContent.innerHTML = routes[routeName].render();
        
        // 更新浏览器历史记录（可选）
        history.pushState({ route: routeName }, routes[routeName].title, `#${routeName}`);
        
        // 页面切换后的初始化
        if (routeName === 'profile') {
            loadUserProfile();
        }
    }
}



//跳转到profile页面
function goToProfile() {
    navigateTo('profile');
    // 关闭下拉菜单
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// 返回首页
function goToHome() {
    navigateTo('home');
}

// 加载用户资料
async function loadUserProfile() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            document.getElementById('username').textContent = user.user_metadata?.username || 'Not set';
            document.getElementById('email').textContent = user.email;
        }
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

保存用户资料
async function saveProfile() {
    try {
        const theme = document.getElementById('theme-select').value;
        // 这里添加保存逻辑
        console.log('Saving profile with theme:', theme);
        alert('Profile saved successfully!');
    } catch (error) {
        console.error('Failed to save profile:', error);
    }
}

// 处理浏览器后退/前进按钮
window.addEventListener('popstate', function(event) {
    if (event.state && event.state.route) {
        navigateTo(event.state.route);
    }
});

// 初始化路由
document.addEventListener('DOMContentLoaded', function() {
    // 检查URL hash来确定初始页面
    const hash = window.location.hash.substring(1);
    if (hash && routes[hash]) {
        navigateTo(hash);
    } else {
        navigateTo('home');
    }
    
    updateAuthUI();
});