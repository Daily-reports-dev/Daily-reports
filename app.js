import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==================== Firebase Configuration ====================
const firebaseConfig = {
  apiKey: "AIzaSyAdJpXXA0U68hTiCee5Yvmn5isa2MWRmVg",
  authDomain: "daily-reports-5d85d.firebaseapp.com",
  projectId: "daily-reports-5d85d",
  storageBucket: "daily-reports-5d85d.firebasestorage.app",
  messagingSenderId: "531833916190",
  appId: "1:531833916190:web:652f12cdb41a74b381970f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==================== Constants ====================
const DISEASES = [
  { id: 'malaria', name: 'ئاکەڵی', icon: '🦟', color: '#E85D24' },
  { id: 'typhoid', name: 'تیفۆیید', icon: '🌡️', color: '#BA7517' },
  { id: 'tb', name: 'سل', icon: '🫁', color: '#534AB7' },
  { id: 'cholera', name: 'کولێرا', icon: '💧', color: '#0F6E56' },
  { id: 'bloody', name: 'دیاریای خوێناوی', icon: '🩸', color: '#A32D2D' },
  { id: 'hepatitisA', name: 'هەپاتایتس A', icon: '🩺', color: '#185FA5' },
  { id: 'covid', name: 'کۆڤید-١٩', icon: '🦠', color: '#3B6D11' },
  { id: 'measles', name: 'قیژنە', icon: '🤒', color: '#993556' }
];

const AGE_GROUPS = [
  { id: 'lt1', label: '<١', sub: 'کەمتر لە ساڵ' },
  { id: 'a1_4', label: '١-٤', sub: 'ساڵ' },
  { id: 'a5_14', label: '٥-١٤', sub: 'ساڵ' },
  { id: 'a15_24', label: '١٥-٢٤', sub: 'ساڵ' },
  { id: 'a25_44', label: '٢٥-٤٤', sub: 'ساڵ' },
  { id: 'a45_64', label: '٤٥-٦٤', sub: 'ساڵ' },
  { id: 'gte65', label: '٦٥+', sub: 'ساڵ و زیاتر' }
];


// ==================== User Registry ====================
// یوزەرەکان لێرە زیاد بکە: { username, password, hospitalName, isAdmin }
const USER_REGISTRY = [
  { username: 'admin',   password: 'admin123',  hospitalName: 'ئەدمین — هەموو نەخۆشخانەکان', isAdmin: true  },
  { username: 'fatih',   password: '123456',    hospitalName: 'مەڵبەندی تەندروستی شەهید فاتیح', isAdmin: false },
  // یوزەری تر زیاد بکە وەک ئەمە
];

function findUser(username, password) {
  return USER_REGISTRY.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  ) || null;
}

function getHospitalName(username) {
  const u = USER_REGISTRY.find(u => u.username.toLowerCase() === username.toLowerCase());
  return u ? u.hospitalName : 'نەخۆشخانەی نەناسراو';
}

function isAdminUser(username) {
  const u = USER_REGISTRY.find(u => u.username.toLowerCase() === username.toLowerCase());
  return u ? u.isAdmin : false;
}

// ==================== State ====================
let currentUser = null;
let currentHospitalName = '';
let currentPage = 'daily';
let todayRecords = [];
let weekRecords = [];
let monthRecords = [];
let yearRecords = [];
let selectedDate = new Date();
let selectedDisease = null;
let savedReports = [];
let isLoading = false;
let isAdmin = false;

// ==================== Helper Functions ====================
function formatDate(date) {
  const months = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠', '١١', '١٢'];
  return `${date.getDate()}/${months[date.getMonth()]}`;
}

function formatDateWithYear(date) {
  const months = ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠', '١١', '١٢'];
  return `${date.getDate()}/${months[date.getMonth()]}/${date.getFullYear()}`;
}

function formatDateLong(date) {
  const months = [
    'کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران',
    'تەممووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateShort(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// CDC Epi Week: هەفتە لە دووشەممە دەستپێدەکات، بە یەکشەممە کۆتایی دێت
function getFirstDayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=یەکشەممە, 1=دووشەممە, ..., 6=شەممە
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekRange(date) {
  const firstDay = getFirstDayOfWeek(date);
  const lastDay = new Date(firstDay);
  lastDay.setDate(firstDay.getDate() + 6); // یەکشەممە
  return { firstDay, lastDay };
}

// CDC Epi Week Number
function getWeekNumber(date) {
  const monday = getFirstDayOfWeek(date);
  const jan4 = new Date(monday.getFullYear(), 0, 4);
  const firstMonday = getFirstDayOfWeek(jan4);
  if (monday < firstMonday) {
    return getWeekNumber(new Date(monday.getFullYear() - 1, 11, 31));
  }
  const weekNum = Math.floor((monday - firstMonday) / (7 * 86400000)) + 1;
  return weekNum;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function showModal(title, content) {
  const modal = document.getElementById('modal');
  const modalContent = document.getElementById('modalContent');
  modalContent.innerHTML = `
    <h3 style="margin-bottom:16px;color:var(--primary)">${title}</h3>
    ${content}
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="action-btn primary" style="flex:1" onclick="closeModal()">داخستن</button>
    </div>
  `;
  modal.classList.add('show');
}

window.closeModal = function() {
  document.getElementById('modal').classList.remove('show');
};

// ==================== Authentication ====================
function login() {
  const username = document.getElementById('loginUsername')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!username || !password) {
    showToast('تکایە ناو و پاسۆرد بنووسە', 'error');
    return;
  }
  const user = findUser(username, password);
  if (!user) {
    showToast('ناو یان پاسۆرد هەڵەیە', 'error');
    return;
  }
  // Save session
  currentUser = { uid: username, displayName: user.hospitalName, username: username };
  isAdmin = user.isAdmin;
  currentHospitalName = user.hospitalName;
  localStorage.setItem('loggedInUser', JSON.stringify({ username, hospitalName: user.hospitalName, isAdmin: user.isAdmin }));
  loadData();
  showToast(`بەخێربێیت — ${currentHospitalName}`, 'success');
}

function logout() {
  currentUser = null;
  isAdmin = false;
  currentHospitalName = '';
  localStorage.removeItem('loggedInUser');
  showToast('بە سەرکەوتوویی چوویتە دەرەوە', 'success');
  renderPage();
}

// ==================== Data Loading ====================
async function loadData() {
  // نیشاندانی ناوی نەخۆشخانە فەوری
  if (currentUser) {
    const titleEl = document.querySelector('.app-title');
    if (titleEl) {
      titleEl.innerHTML = '🏥 ' + currentHospitalName +
        '<span style="font-size:11px;background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:10px;margin-right:8px">' +
        currentUser.username + '</span>';
    }
  }

  if (!currentUser) {
    renderPage();
    return;
  }
  
  isLoading = true;
  renderPage(); // Show loading state
  
  try {
    const todayStr = formatDateShort(selectedDate);
    
    // Load today's records
    const year = selectedDate.getFullYear();
    const { firstDay: wFirst, lastDay: wLast } = getWeekRange(selectedDate);
    const weekStartStr = formatDateShort(wFirst);
    const weekEndStr = formatDateShort(wLast);

    let todayQ, weekQ, monthQ, yearQ;
    if (isAdmin) {
      // ئەدمین — هەموو داتای هەموو نەخۆشخانەکان
      todayQ = query(collection(db, 'daily_records'), where('date', '==', todayStr));
      weekQ  = query(collection(db, 'daily_records'), where('date', '>=', weekStartStr), where('date', '<=', weekEndStr));
      monthQ = query(collection(db, 'daily_records'), where('month', '==', selectedDate.getMonth() + 1), where('year', '==', year));
      yearQ  = query(collection(db, 'daily_records'), where('year', '==', year));
    } else {
      // نەخۆشخانە — تەنها داتای خۆی
      todayQ = query(collection(db, 'daily_records'), where('date', '==', todayStr), where('userId', '==', currentUser.uid));
      weekQ  = query(collection(db, 'daily_records'), where('date', '>=', weekStartStr), where('date', '<=', weekEndStr), where('userId', '==', currentUser.uid));
      monthQ = query(collection(db, 'daily_records'), where('month', '==', selectedDate.getMonth() + 1), where('year', '==', year), where('userId', '==', currentUser.uid));
      yearQ  = query(collection(db, 'daily_records'), where('year', '==', year), where('userId', '==', currentUser.uid));
    }

    todayRecords = (await getDocs(todayQ)).docs.map(d => ({ id: d.id, ...d.data() }));
    weekRecords  = (await getDocs(weekQ)).docs.map(d => ({ id: d.id, ...d.data() }));
    monthRecords = (await getDocs(monthQ)).docs.map(d => ({ id: d.id, ...d.data() }));
    yearRecords  = (await getDocs(yearQ)).docs.map(d => ({ id: d.id, ...d.data() }));

    // Load saved reports
    await loadSavedReports();

    isLoading = false;
    updateStats();
    renderPage();
  } catch (error) {
    console.error('Error loading data:', error);
    isLoading = false;
    showToast('هەڵە لە بارکردنی داتا', 'error');
    renderPage();
  }
}

async function loadSavedReports() {
  if (!currentUser) return;
  
  try {
    const reportsQuery = query(
      collection(db, 'saved_reports'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    const reportsSnapshot = await getDocs(reportsQuery);
    savedReports = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading reports:', error);
    savedReports = [];
  }
}

function updateStats() {
  document.getElementById('todayTotal').textContent = todayRecords.length;
  document.getElementById('weekTotal').textContent = weekRecords.length;
  document.getElementById('monthTotal').textContent = monthRecords.length;
  document.getElementById('yearTotal').textContent = yearRecords.length;
  document.getElementById('currentDateDisplay').textContent = formatDateWithYear(selectedDate);
  // نیشاندانی ناوی نەخۆشخانە و یوزەر لە هێدەر
  const titleEl = document.querySelector('.app-title');
  if (titleEl && currentUser) {
    titleEl.innerHTML = '🏥 ' + currentHospitalName +
      '<span style="font-size:11px;background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:10px;margin-right:8px">' +
      currentUser.username + '</span>';
  }
}

// ==================== Page Rendering ====================
function renderPage() {
  const main = document.getElementById('mainContent');
  
  if (!currentUser) {
    main.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px 20px;text-align:center;max-width:320px;margin:0 auto">
        <span style="font-size:56px">🏥</span>
        <h2 style="color:var(--primary);font-size:18px">تۆماری نەخۆشی</h2>
        <div style="width:100%;background:var(--bg-secondary);border-radius:var(--radius-lg);padding:20px;border:1px solid var(--border-light)">
          <div style="margin-bottom:12px;text-align:right">
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">👤 ناوی بەکارهێنەر</label>
            <input type="text" id="loginUsername" placeholder="ناوت بنووسە" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-light);font-size:14px;font-family:inherit" onkeydown="if(event.key==='Enter')document.getElementById('loginPassword').focus()">
          </div>
          <div style="margin-bottom:16px;text-align:right">
            <label style="font-size:13px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">🔒 پاسۆرد</label>
            <input type="password" id="loginPassword" placeholder="پاسۆردت بنووسە" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-light);font-size:14px;font-family:inherit" onkeydown="if(event.key==='Enter')login()">
          </div>
          <button class="action-btn primary" onclick="login()" style="width:100%;padding:12px;font-size:15px;border-radius:10px">
            🔑 چوونەژوورەوە
          </button>
        </div>
      </div>
    `;
    return;
  }
  
  if (isLoading) {
    main.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px">
        <div class="spinner"></div>
        <p style="color:var(--text-secondary)">تکایە چاوەڕێ بکە ...</p>
      </div>
    `;
    return;
  }
  
  try {
    switch(currentPage) {
      case 'daily':
        main.innerHTML = renderDailyPage();
        break;
      case 'dashboard':
        main.innerHTML = renderDashboardPage();
        break;
      case 'weekly':
        main.innerHTML = renderWeeklyPage();
        break;
      case 'monthly':
        main.innerHTML = renderMonthlyPage();
        break;
      case 'analytics':
        main.innerHTML = renderAnalyticsPage();
        break;
      case 'reports':
        main.innerHTML = renderReportsPage();
        break;
      case 'settings':
        main.innerHTML = renderSettingsPage();
        break;
      default:
        main.innerHTML = renderDailyPage();
    }
  } catch (error) {
    console.error('Render error:', error);
    main.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--danger)">
        <span style="font-size:48px">⚠️</span>
        <p>هەڵە لە پیشاندانی پەڕە</p>
        <button class="action-btn" onclick="loadData()" style="margin-top:16px">هەوڵدانەوە</button>
      </div>
    `;
  }
}

function renderDailyPage() {
  return `
    <!-- Disease Grid -->
    <div class="disease-grid">
      ${DISEASES.map(d => {
        const count = todayRecords.filter(r => r.disease === d.id).length;
        return `
          <div class="disease-card ${selectedDisease === d.id ? 'active' : ''}" 
               onclick="selectDisease('${d.id}')">
            <span class="disease-icon">${d.icon}</span>
            <div class="disease-info">
              <div class="disease-name">${d.name}</div>
              <div class="disease-count">${count} تۆمار</div>
            </div>
            ${count > 0 ? `<span class="disease-badge">${count}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>

    ${selectedDisease ? renderAgeSection(selectedDisease) : ''}

    <!-- Today's Log -->
    <div class="log-section">
      <div class="log-header">
        <span class="log-title">📋 تۆمارەکانی ئەمڕۆ</span>
        <span class="log-total">${todayRecords.length}</span>
      </div>
      <div class="log-list" id="todayLogList">
        ${renderTodayLog()}
      </div>
    </div>
  `;
}

function renderAgeSection(diseaseId) {
  const disease = DISEASES.find(d => d.id === diseaseId);
  if (!disease) return '';
  
  return `
    <div class="age-section">
      <div class="selected-header">
        <span class="selected-icon">${disease.icon}</span>
        <div class="selected-info">
          <h3>${disease.name}</h3>
        </div>
        <button class="close-btn" onclick="selectDisease(null)">✕</button>
      </div>

      <div class="age-grid">
        ${AGE_GROUPS.map(age => {
          const maleCount = todayRecords.filter(r => 
            r.disease === diseaseId && r.ageGroup === age.id && r.gender === 'male'
          ).length;
          const femaleCount = todayRecords.filter(r => 
            r.disease === diseaseId && r.ageGroup === age.id && r.gender === 'female'
          ).length;
          
          return `
            <div class="age-item">
              <div class="age-header">
                <span class="age-label">${age.label}</span>
                <span class="age-sub">${age.sub}</span>
              </div>
              
              <!-- Male -->
              <div class="gender-row">
                <div class="gender-badge">
                  <span class="gender-icon male">👨</span>
                  <span class="gender-count" id="count-${diseaseId}-${age.id}-male">${maleCount}</span>
                </div>
                <div class="gender-controls">
                  <button class="ctrl-btn" onclick="addRecord('${diseaseId}', '${age.id}', 'male')">+</button>
                  <button class="ctrl-btn" onclick="decrementCount('${diseaseId}', '${age.id}', 'male')">-</button>
                </div>
              </div>

              <!-- Female -->
              <div class="gender-row">
                <div class="gender-badge">
                  <span class="gender-icon female">👩</span>
                  <span class="gender-count" id="count-${diseaseId}-${age.id}-female">${femaleCount}</span>
                </div>
                <div class="gender-controls">
                  <button class="ctrl-btn" onclick="addRecord('${diseaseId}', '${age.id}', 'female')">+</button>
                  <button class="ctrl-btn" onclick="decrementCount('${diseaseId}', '${age.id}', 'female')">-</button>
                </div>
              </div>

              <!-- Total -->
              <div class="age-total">
                <span>کۆی گشتی</span>
                <span class="total-value" id="total-${diseaseId}-${age.id}">${maleCount + femaleCount}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderTodayLog() {
  if (todayRecords.length === 0) {
    return '<div class="text-center" style="padding:30px;color:var(--text-secondary)">هیچ تۆمارێک نیە</div>';
  }

  // Group records by disease, age, and gender
  const grouped = {};
  todayRecords.forEach(record => {
    const key = `${record.disease}-${record.ageGroup}-${record.gender}`;
    if (!grouped[key]) {
      const disease = DISEASES.find(d => d.id === record.disease);
      const ageGroup = AGE_GROUPS.find(a => a.id === record.ageGroup);
      if (!disease || !ageGroup) return;
      
      grouped[key] = {
        disease: disease,
        ageGroup: ageGroup,
        gender: record.gender,
        count: 0
      };
    }
    grouped[key].count++;
  });

  return Object.values(grouped).map(group => `
    <div class="log-item">
      <div class="log-item-info">
        <span class="log-dot" style="background:${group.disease.color}"></span>
        <span>${group.disease.icon} ${group.disease.name}</span>
        <span class="gender-badge ${group.gender}">${group.gender === 'male' ? '👨' : '👩'}</span>
        <span>${group.ageGroup.label}</span>
      </div>
      <span class="log-count">${group.count}</span>
    </div>
  `).join('');
}

function renderDashboardPage() {
  const totalDiseases = todayRecords.length;
  const maleCount = todayRecords.filter(r => r.gender === 'male').length;
  const femaleCount = todayRecords.filter(r => r.gender === 'female').length;
  
  // Disease stats
  const diseaseStats = {};
  todayRecords.forEach(record => {
    if (!diseaseStats[record.disease]) {
      const disease = DISEASES.find(d => d.id === record.disease);
      if (!disease) return;
      diseaseStats[record.disease] = {
        disease: disease,
        count: 0
      };
    }
    diseaseStats[record.disease].count++;
  });

  return `
    <div class="dashboard-grid">
      <div class="dashboard-card">
        <div class="dashboard-icon">📊</div>
        <div class="dashboard-value">${totalDiseases}</div>
        <div class="dashboard-label">کۆی گشتی</div>
      </div>
      <div class="dashboard-card">
        <div class="dashboard-icon">👨</div>
        <div class="dashboard-value">${maleCount}</div>
        <div class="dashboard-label">نێر</div>
      </div>
      <div class="dashboard-card">
        <div class="dashboard-icon">👩</div>
        <div class="dashboard-value">${femaleCount}</div>
        <div class="dashboard-label">مێ</div>
      </div>
      <div class="dashboard-card">
        <div class="dashboard-icon">📅</div>
        <div class="dashboard-value">${weekRecords.length}</div>
        <div class="dashboard-label">تۆماری هەفتە</div>
      </div>
    </div>

    <div class="summary-card">
      <h4 style="margin-bottom:12px">🔝 نەخۆشییە باوەکان</h4>
      <div class="log-list">
        ${Object.values(diseaseStats).sort((a,b) => b.count - a.count).slice(0,5).map(stat => `
          <div class="log-item">
            <div class="log-item-info">
              <span class="log-dot" style="background:${stat.disease.color}"></span>
              <span>${stat.disease.icon} ${stat.disease.name}</span>
            </div>
            <span class="log-count">${stat.count}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="log-section">
      <div class="log-header">
        <span class="log-title">🔝 پێنج تۆماری دوایی</span>
      </div>
      <div class="log-list">
        ${todayRecords.slice(0, 5).map(record => {
          const disease = DISEASES.find(d => d.id === record.disease);
          if (!disease) return '';
          return `
            <div class="log-item">
              <div class="log-item-info">
                <span class="log-dot" style="background:${disease.color}"></span>
                <span>${disease.icon} ${disease.name}</span>
                <span class="gender-badge ${record.gender}">${record.gender === 'male' ? '👨' : '👩'}</span>
                <span>${record.ageLabel}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderWeeklyPage() {
  const weekDays = ['دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە', 'یەکشەممە'];
  const { firstDay, lastDay } = getWeekRange(selectedDate);
  
  const weekStartStr = formatDateShort(firstDay);
  const weekEndStr = formatDateShort(lastDay);
  const weekNumber = getWeekNumber(firstDay);
  
  // Create week options dropdown
  const weekOptions = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - (i * 7));
    const { firstDay: fDay, lastDay: lDay } = getWeekRange(date);
    const weekNum = getWeekNumber(fDay);
    const startStr = formatDateShort(fDay);
    const endStr = formatDateShort(lDay);
    
    weekOptions.push({
      weekNum: weekNum,
      startDate: fDay,
      endDate: lDay,
      display: `Week ${weekNum} - ${startStr} - ${endStr}`
    });
  }
  
  let weekHtml = `
    <div class="summary-card" style="margin-bottom:16px">
      <div style="margin-bottom:12px">
        <label style="display:block;font-size:12px;color:var(--text-secondary);margin-bottom:4px">ماوەی هەفتە</label>
        <select id="weekSelect" style="width:100%;padding:10px;border-radius:var(--radius-md);border:1px solid var(--border-light);background:white" onchange="changeWeekBySelect(this.value)">
          ${weekOptions.map(opt => `
            <option value="${opt.weekNum}" ${opt.weekNum === weekNumber ? 'selected' : ''}>
              هەفتە ${opt.weekNum} - ${opt.startDate.toISOString().slice(0,10)} - ${opt.endDate.toISOString().slice(0,10)}
            </option>
          `).join('')}
        </select>
      </div>
      
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <button class="action-btn" onclick="changeWeek(-1)" style="flex:1;margin-left:4px">‹ هەفتەی پێشوو</button>
        <button class="action-btn" onclick="changeWeek(1)" style="flex:1">هەفتەی داهاتوو ›</button>
      </div>
    </div>
  `;
  
  // Week days display with stats like in the image
  weekHtml += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:16px">';
  
  // Day names row
  weekDays.forEach(day => {
    weekHtml += `<div style="text-align:center;font-size:11px;color:var(--text-secondary);padding:4px">${day}</div>`;
  });
  
  // Stats for each day like in the image (16/3 with 15, etc.)
  for (let i = 0; i < 7; i++) {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + i);
    const dateStr = formatDateShort(date);
    const displayDate = `${date.getDate()}/${date.getMonth()+1}`;
    
    // Use monthRecords for accurate day counts (weekRecords may miss days outside current week load)
    const dayRecords = monthRecords.filter(r => r.date === dateStr);
    const dayTotal = dayRecords.length;
    
    // Get male/female count for this day
    const maleCount = dayRecords.filter(r => r.gender === 'male').length;
    const femaleCount = dayRecords.filter(r => r.gender === 'female').length;
    
    weekHtml += `
      <div class="week-day ${dayTotal > 0 ? 'has-data' : ''}" onclick="showDayDetails('${dateStr}')" style="cursor:pointer">
        <div style="font-size:14px;font-weight:600;color:var(--primary)">${displayDate}</div>
        ${dayTotal > 0 ? 
          `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;margin-top:4px">
            <span style="font-size:12px;font-weight:700">${dayTotal}</span>
            <div style="display:flex;gap:8px;font-size:10px">
              <span style="color:var(--male)">👨 ${maleCount}</span>
              <span style="color:var(--female)">👩 ${femaleCount}</span>
            </div>
          </div>` : 
          '<div style="height:36px"></div>'
        }
      </div>
    `;
  }
  
  weekHtml += '</div>';

  // Collect all records for this specific week from monthRecords (accurate source)
  const weekDatesSet = new Set();
  for (let i = 0; i < 7; i++) {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() + i);
    weekDatesSet.add(formatDateShort(d));
  }
  const thisWeekRecords = monthRecords.filter(r => weekDatesSet.has(r.date));

  // Total stats like in the image
  const totalWeek = thisWeekRecords.length;
  const maleTotal = thisWeekRecords.filter(r => r.gender === 'male').length;
  const femaleTotal = thisWeekRecords.filter(r => r.gender === 'female').length;

  weekHtml += `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
      <div class="summary-card" style="margin-bottom:0;text-align:center">
        <div style="font-size:24px;font-weight:800;color:var(--primary)">${totalWeek}</div>
        <div style="font-size:12px">کۆی گشتی</div>
      </div>
      <div class="summary-card" style="margin-bottom:0;text-align:center">
        <div style="font-size:24px;font-weight:800;color:var(--male)">${maleTotal}</div>
        <div style="font-size:12px">نێر</div>
      </div>
      <div class="summary-card" style="margin-bottom:0;text-align:center">
        <div style="font-size:24px;font-weight:800;color:var(--female)">${femaleTotal}</div>
        <div style="font-size:12px">مێ</div>
      </div>
    </div>
  `;

  // Disease breakdown
  const diseaseStats = {};
  thisWeekRecords.forEach(record => {
    if (!diseaseStats[record.disease]) {
      const disease = DISEASES.find(d => d.id === record.disease);
      if (!disease) return;
      diseaseStats[record.disease] = {
        disease: disease,
        male: 0,
        female: 0,
        total: 0
      };
    }
    diseaseStats[record.disease].total++;
    if (record.gender === 'male') diseaseStats[record.disease].male++;
    else diseaseStats[record.disease].female++;
  });

  weekHtml += `
    <div class="log-section">
      <div class="log-header">
        <span class="log-title">📋 پێکهاتەی نەخۆشییەکان</span>
        <span class="log-total">${thisWeekRecords.length}</span>
      </div>
      <div class="log-list" style="max-height:300px">
  `;
  
  if (Object.values(diseaseStats).length === 0) {
    weekHtml += '<div class="text-center" style="padding:30px">هیچ تۆمارێک نیە</div>';
  } else {
    Object.values(diseaseStats).forEach(stat => {
      weekHtml += `
        <div class="log-item">
          <div class="log-item-info">
            <span class="log-dot" style="background:${stat.disease.color}"></span>
            <span>${stat.disease.icon} ${stat.disease.name}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="gender-badge male">👨 ${stat.male}</span>
            <span class="gender-badge female">👩 ${stat.female}</span>
            <span class="log-count">${stat.total}</span>
          </div>
        </div>
      `;
    });
  }
  
  weekHtml += '</div></div>';

  return weekHtml;
}

// Function to show day details modal (like in the image)
window.showDayDetails = function(dateStr) {
  // Use monthRecords as primary source (most complete for any day in the month).
  // Fall back to merging all caches only if the date is outside the current month.
  const selectedMonth = selectedDate.getMonth() + 1;
  const selectedYear = selectedDate.getFullYear();
  const [dYear, dMonth] = dateStr.split('-').map(Number);
  let sourceRecords;
  if (dYear === selectedYear && dMonth === selectedMonth) {
    sourceRecords = monthRecords;
  } else {
    const recordMap = new Map();
    [...todayRecords, ...weekRecords, ...monthRecords, ...yearRecords].forEach(r => recordMap.set(r.id, r));
    sourceRecords = [...recordMap.values()];
  }
  const dayRecords = sourceRecords.filter(r => r.date === dateStr);
  
  if (dayRecords.length === 0) {
    showToast('هیچ تۆمارێک نیە', 'info');
    return;
  }
  
  const date = new Date(dateStr);
  const formattedDate = formatDate(date);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Group by disease
  const diseaseStats = {};
  dayRecords.forEach(record => {
    if (!diseaseStats[record.disease]) {
      const disease = DISEASES.find(d => d.id === record.disease);
      if (!disease) return;
      diseaseStats[record.disease] = {
        disease: disease,
        male: 0,
        female: 0
      };
    }
    if (record.gender === 'male') diseaseStats[record.disease].male++;
    else diseaseStats[record.disease].female++;
  });
  
  // Group by age
  const ageStats = {};
  AGE_GROUPS.forEach(age => {
    ageStats[age.id] = {
      label: age.label,
      male: 0,
      female: 0
    };
  });
  
  dayRecords.forEach(record => {
    if (ageStats[record.ageGroup]) {
      if (record.gender === 'male') ageStats[record.ageGroup].male++;
      else ageStats[record.ageGroup].female++;
    }
  });
  
  let detailsHtml = `
    <div style="margin-bottom:16px">
      <h4 style="color:var(--primary)">${day}/${month}/${year}</h4>
      <p style="font-size:14px">کۆی گشتی: <strong>${dayRecords.length}</strong> حاڵەت</p>
    </div>
    
    <div style="margin-bottom:16px">
      <h5 style="margin-bottom:8px">📊 بەپێی نەخۆشی:</h5>
      <div style="max-height:200px;overflow-y:auto">
        ${Object.values(diseaseStats).map(stat => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-light)">
            <span><span class="log-dot" style="background:${stat.disease.color};display:inline-block;margin-left:6px"></span> ${stat.disease.icon} ${stat.disease.name}</span>
            <span>
              <span style="color:var(--male);margin-left:8px">👨 ${stat.male}</span>
              <span style="color:var(--female)">👩 ${stat.female}</span>
            </span>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div>
      <h5 style="margin-bottom:8px">📊 بەپێی تەمەن:</h5>
      <div style="max-height:200px;overflow-y:auto">
        ${Object.values(ageStats).filter(age => age.male > 0 || age.female > 0).map(age => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-light)">
            <span>تەمەن ${age.label}</span>
            <span>
              <span style="color:var(--male);margin-left:8px">👨 ${age.male}</span>
              <span style="color:var(--female)">👩 ${age.female}</span>
            </span>
          </div>
        `).join('')}
      </div>
    </div>
    
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="action-btn" style="flex:1" onclick="editDayRecords('${dateStr}')">✏️ دەستکاری</button>
    </div>
  `;
  
  showModal(`وردەکاری ڕۆژ ${formattedDate}`, detailsHtml);
};

function renderMonthlyPage() {
  const months = [
    'کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران',
    'تەممووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'
  ];
  
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 6 ? 0 : firstDay + 1;
  
  // Collect daily totals
  const dailyTotals = {};
  monthRecords.forEach(record => {
    dailyTotals[record.date] = (dailyTotals[record.date] || 0) + 1;
  });

  let monthHtml = `
    <div class="summary-card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="color:var(--primary)">${months[month]} ${year}</h4>
        <div style="font-size:14px;background:var(--primary-light);padding:4px 12px;border-radius:20px">
          ${monthRecords.length} تۆمار
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:8px">
        <button class="action-btn" onclick="changeMonth(-1)" style="flex:1">‹ مانگی پێشوو</button>
        <button class="action-btn" onclick="changeMonth(1)" style="flex:1">مانگی داهاتوو ›</button>
      </div>
    </div>
    
    <div class="month-grid">
  `;
  
  // Day names
  const weekDaysShort = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ه'];
  weekDaysShort.forEach(day => {
    monthHtml += `<div style="text-align:center;font-size:11px;color:var(--text-secondary);padding:4px">${day}</div>`;
  });
  
  // Empty cells before first day
  for (let i = 0; i < startOffset; i++) {
    monthHtml += '<div></div>';
  }
  
  // Month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = formatDateShort(date);
    const count = dailyTotals[dateStr] || 0;
    
    monthHtml += `
      <div class="week-day ${count > 0 ? 'has-data' : ''}" onclick="showDayDetails('${dateStr}')" style="cursor:pointer">
        <div style="font-size:14px;font-weight:600">${d}</div>
        ${count > 0 ? 
          `<div style="font-size:10px;background:var(--primary-light);color:var(--primary);padding:2px 4px;border-radius:10px;margin-top:2px">${count}</div>` : 
          '<div style="height:16px"></div>'
        }
      </div>
    `;
  }
  
  monthHtml += '</div>';

  // Disease stats
  const diseaseStats = {};
  monthRecords.forEach(record => {
    if (!diseaseStats[record.disease]) {
      const disease = DISEASES.find(d => d.id === record.disease);
      if (!disease) return;
      diseaseStats[record.disease] = {
        disease: disease,
        count: 0
      };
    }
    diseaseStats[record.disease].count++;
  });

  const maleCount = monthRecords.filter(r => r.gender === 'male').length;
  const femaleCount = monthRecords.filter(r => r.gender === 'female').length;

  monthHtml += `
    <div class="summary-card" style="margin-top:16px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--primary)">${monthRecords.length}</div>
          <div style="font-size:11px">کۆی گشتی</div>
        </div>
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--male)">${maleCount}</div>
          <div style="font-size:11px">نێر</div>
        </div>
        <div>
          <div style="font-size:20px;font-weight:800;color:var(--female)">${femaleCount}</div>
          <div style="font-size:11px">مێ</div>
        </div>
      </div>
    </div>
  `;

  monthHtml += `
    <div class="log-section">
      <div class="log-header">
        <span class="log-title">📊 پوختەی مانگ</span>
        <span class="log-total">${monthRecords.length}</span>
      </div>
      <div class="log-list" style="max-height:300px">
  `;
  
  if (Object.values(diseaseStats).length === 0) {
    monthHtml += '<div class="text-center" style="padding:30px">هیچ تۆمارێک نیە</div>';
  } else {
    Object.values(diseaseStats).sort((a, b) => b.count - a.count).forEach(stat => {
      monthHtml += `
        <div class="log-item">
          <div class="log-item-info">
            <span class="log-dot" style="background:${stat.disease.color}"></span>
            <span>${stat.disease.icon} ${stat.disease.name}</span>
          </div>
          <span class="log-count">${stat.count}</span>
        </div>
      `;
    });
  }
  
  monthHtml += '</div></div>';
  
  return monthHtml;
}

function renderAnalyticsPage() {
  // Last 30 days data
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentRecords = monthRecords.filter(r => {
    const recordDate = new Date(r.date);
    return recordDate >= thirtyDaysAgo;
  });
  
  const total = recentRecords.length;
  const maleCount = recentRecords.filter(r => r.gender === 'male').length;
  const femaleCount = recentRecords.filter(r => r.gender === 'female').length;
  const malePercent = total > 0 ? Math.round(maleCount/total*100) : 0;
  const femalePercent = total > 0 ? Math.round(femaleCount/total*100) : 0;
  
  // Disease stats
  const diseaseStats = {};
  recentRecords.forEach(record => {
    if (!diseaseStats[record.disease]) {
      const disease = DISEASES.find(d => d.id === record.disease);
      if (!disease) return;
      diseaseStats[record.disease] = {
        disease: disease,
        count: 0
      };
    }
    diseaseStats[record.disease].count++;
  });
  
  const topDiseases = Object.values(diseaseStats).sort((a, b) => b.count - a.count).slice(0, 5);

  return `
    <div class="summary-card">
      <h4 style="margin-bottom:12px">📊 شیکردنەوەی ٣٠ ڕۆژی ڕابردوو</h4>
      <p>کۆی گشتی: <strong>${total}</strong> حاڵەت</p>
      <p>تێکڕای ڕۆژانە: <strong>${Math.round(total / 30)}</strong></p>
    </div>

    <div class="dashboard-grid" style="margin-bottom:16px">
      <div class="dashboard-card" style="background:var(--male-light)">
        <div class="dashboard-icon">👨</div>
        <div class="dashboard-value">${maleCount}</div>
        <div class="dashboard-label">نێر ${malePercent}%</div>
      </div>
      <div class="dashboard-card" style="background:var(--female-light)">
        <div class="dashboard-icon">👩</div>
        <div class="dashboard-value">${femaleCount}</div>
        <div class="dashboard-label">مێ ${femalePercent}%</div>
      </div>
    </div>

    <div class="summary-card">
      <h4 style="margin-bottom:12px">🔝 پێنج نەخۆشی باو</h4>
      <div class="log-list">
        ${topDiseases.map((disease, index) => `
          <div class="log-item">
            <div class="log-item-info">
              <span style="width:24px;font-weight:700">#${index+1}</span>
              <span class="log-dot" style="background:${disease.disease.color}"></span>
              <span>${disease.disease.icon} ${disease.disease.name}</span>
            </div>
            <span class="log-count">${disease.count}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="summary-card">
      <h4 style="margin-bottom:12px">📊 پێکهاتەی تەمەنەکان</h4>
      <div class="log-list">
        ${AGE_GROUPS.map(age => {
          const count = recentRecords.filter(r => r.ageGroup === age.id).length;
          if (count === 0) return '';
          const percentage = total > 0 ? Math.round(count/total*100) : 0;
          return `
            <div class="log-item">
              <span>${age.label} ${age.sub}</span>
              <span class="log-count">${count} (${percentage}%)</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderReportsPage() {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="color:var(--primary)">📋 ڕاپۆرتە پاشەکەوتکراوەکان</h3>
      <button class="action-btn primary" onclick="createNewReport()" style="padding:8px 12px">
        <span>➕ نوێ</span>
      </button>
    </div>

    <div class="report-list" id="reportsList">
      ${savedReports.length === 0 ? `
        <div style="text-align:center;padding:40px;color:var(--text-secondary)">
          <span style="font-size:48px;display:block;margin-bottom:16px">📭</span>
          <p>هیچ ڕاپۆرتێک پاشەکەوت نەکراوە</p>
          <button class="action-btn primary" onclick="createNewReport()" style="margin-top:16px;padding:12px 24px">
            دروستکردنی یەکەم ڕاپۆرت
          </button>
        </div>
      ` : savedReports.map(report => `
        <div class="report-item">
          <div class="report-info" onclick="viewReport('${report.id}')">
            <h4>${report.title || 'ڕاپۆرت'}</h4>
            <p>${report.date || formatDate(new Date())} · ${report.count || 0} تۆمار</p>
          </div>
          <div style="display:flex;gap:8px">
            <span class="report-icon" onclick="downloadReport('${report.id}')">📥</span>
            <span class="report-icon" onclick="deleteReport('${report.id}')">🗑️</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSettingsPage() {
  const settings = JSON.parse(localStorage.getItem('appSettings')) || {
    theme: 'light',
    notifications: true,
    sound: true
  };

  return `
    <div class="settings-list">
      <div class="setting-item">
        <span class="setting-label">🏥 نەخۆشخانە</span>
        <span class="setting-value">${currentHospitalName}</span>
      </div>
      <div class="setting-item">
        <span class="setting-label">👤 ناوی بەکارهێنەر</span>
        <span class="setting-value">${currentUser?.displayName || 'بەکارهێنەر'}</span>
      </div>
      <div class="setting-item">
        <span class="setting-label">📧 ئیمەیل</span>
        <span class="setting-value">${currentUser?.email || '-'}</span>
      </div>
      
      <div class="setting-item" onclick="toggleSetting('theme')">
        <span class="setting-label">🌙 ڕەنگی ڕووکار</span>
        <span class="setting-value">${settings.theme === 'dark' ? 'تاریک' : 'ڕووناک'}</span>
      </div>
      
      <div class="setting-item" onclick="toggleSetting('notifications')">
        <span class="setting-label">🔔 ئاگادارکردنەوە</span>
        <span class="setting-value">${settings.notifications ? 'چالاک' : 'ناچالاک'}</span>
      </div>
      
      <div class="setting-item" onclick="toggleSetting('sound')">
        <span class="setting-label">🔊 دەنگ</span>
        <span class="setting-value">${settings.sound ? 'چالاک' : 'ناچالاک'}</span>
      </div>
      
      <div class="setting-item" onclick="exportAllData()">
        <span class="setting-label">📤 هەناردەی هەموو داتاکان</span>
        <span class="setting-value">⬇️</span>
      </div>
      
      <div class="setting-item" style="color:var(--danger)" onclick="logout()">
        <span class="setting-label">🚪 دەرچوون</span>
        <span class="setting-value"></span>
      </div>
    </div>
  `;
}

// ==================== Actions ====================
window.selectDisease = function(diseaseId) {
  selectedDisease = diseaseId;
  renderPage();
};

window.addRecord = async function(diseaseId, ageGroupId, genderId) {
  if (!currentUser) {
    showToast('تکایە سەرەتا بچۆرە ژوورەوە', 'error');
    return;
  }

  const disease = DISEASES.find(d => d.id === diseaseId);
  const ageGroup = AGE_GROUPS.find(a => a.id === ageGroupId);
  
  if (!disease || !ageGroup) {
    showToast('داتا نادروستە', 'error');
    return;
  }
  
  const record = {
    disease: diseaseId,
    diseaseName: disease.name,
    ageGroup: ageGroupId,
    ageLabel: ageGroup.label,
    gender: genderId,
    date: formatDateShort(selectedDate),
    week: getWeekNumber(selectedDate),
    month: selectedDate.getMonth() + 1,
    year: selectedDate.getFullYear(),
    savedAt: new Date().toISOString(),
    userId: currentUser.uid,
    userName: currentUser.displayName,
    hospitalName: currentHospitalName
  };

  try {
    const docRef = await addDoc(collection(db, 'daily_records'), record);
    record.id = docRef.id;
    todayRecords.push(record);
    weekRecords.push(record);
    monthRecords.push(record);
    yearRecords.push(record);

    updateGenderCount(diseaseId, ageGroupId, genderId);
    updateStats();
    renderPage();

    showToast(`✓ زیادکرا`, 'success');
  } catch (error) {
    console.error('Error adding record:', error);
    showToast('هەڵە لە تۆمارکردن', 'error');
  }
};

window.decrementCount = async function(diseaseId, ageGroupId, genderId) {
  const recordsToDelete = todayRecords
    .filter(r => r.disease === diseaseId && r.ageGroup === ageGroupId && r.gender === genderId)
    .slice(-1);

  if (recordsToDelete.length === 0) return;

  try {
    await deleteDoc(doc(db, 'daily_records', recordsToDelete[0].id));
    
    todayRecords = todayRecords.filter(r => r.id !== recordsToDelete[0].id);
    weekRecords = weekRecords.filter(r => r.id !== recordsToDelete[0].id);
    monthRecords = monthRecords.filter(r => r.id !== recordsToDelete[0].id);
    yearRecords = yearRecords.filter(r => r.id !== recordsToDelete[0].id);

    updateGenderCount(diseaseId, ageGroupId, genderId);
    updateStats();
    renderPage();

    showToast('✓ سڕایەوە', 'success');
  } catch (error) {
    console.error('Error deleting record:', error);
    showToast('هەڵە لە سڕینەوە', 'error');
  }
};

function updateGenderCount(diseaseId, ageGroupId, genderId) {
  const count = todayRecords.filter(r => 
    r.disease === diseaseId && r.ageGroup === ageGroupId && r.gender === genderId
  ).length;

  const countEl = document.getElementById(`count-${diseaseId}-${ageGroupId}-${genderId}`);
  if (countEl) countEl.textContent = count;

  const maleCount = todayRecords.filter(r => r.disease === diseaseId && r.ageGroup === ageGroupId && r.gender === 'male').length;
  const femaleCount = todayRecords.filter(r => r.disease === diseaseId && r.ageGroup === ageGroupId && r.gender === 'female').length;
  const totalEl = document.getElementById(`total-${diseaseId}-${ageGroupId}`);
  if (totalEl) totalEl.textContent = maleCount + femaleCount;
}

// ==================== Navigation ====================
window.changePage = function(page, clickedEl) {
  currentPage = page;
  selectedDisease = null;
  
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if (clickedEl) {
    clickedEl.classList.add('active');
  }
  
  renderPage();
};

window.changeDate = function(delta) {
  selectedDate.setDate(selectedDate.getDate() + delta);
  selectedDisease = null;
  loadData();
};

window.changeWeek = function(delta) {
  selectedDate.setDate(selectedDate.getDate() + (delta * 7));
  selectedDisease = null;
  loadData();
};

window.changeWeekBySelect = function(weekNum) {
  // Find a date in that week
  const year = selectedDate.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const daysOffset = (weekNum - 1) * 7;
  const approxDate = new Date(year, 0, 1 + daysOffset);
  
  // Adjust to get the correct week
  const { firstDay } = getWeekRange(approxDate);
  selectedDate = new Date(firstDay);
  selectedDate.setDate(firstDay.getDate() + 3); // Set to middle of week
  
  selectedDisease = null;
  loadData();
};

window.changeMonth = function(delta) {
  selectedDate.setMonth(selectedDate.getMonth() + delta);
  selectedDisease = null;
  loadData();
};

window.editDayRecords = function(dateStr) {
  // Parse date string (YYYY-MM-DD)
  const parts = dateStr.split('-');
  selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  
  // Change to daily page
  currentPage = 'daily';
  selectedDisease = null;
  
  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const navItems = document.querySelectorAll('.nav-item');
  if (navItems.length > 0) {
    navItems[0].classList.add('active');
  }
  
  // Reload data and render
  loadData();
  
  showToast(`ڕۆژ ${formatDate(selectedDate)}`, 'success');
};

// ==================== Export Functions ====================
window.exportCurrent = function() {
  // نیشاندانی مۆدالی هەناردە
  showExportModal();
};

window.showExportModal = function() {
  const { firstDay, lastDay } = getWeekRange(selectedDate);
  const weekNum = getWeekNumber(selectedDate);
  showModal('📥 هەناردەی ڕاپۆرت', `
    <div style="display:grid;gap:10px">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">
        هەفتە ${weekNum}: ${formatDateShort(firstDay)} - ${formatDateShort(lastDay)}
      </p>
      <button class="action-btn primary" style="padding:14px;font-size:14px" onclick="exportWeeklyExcel()">
        📊 هەناردەی Excel — فۆرمی وەزارەت
      </button>
      <button class="action-btn" style="padding:14px;font-size:14px" onclick="exportWeeklyPDF()">
        📄 هەناردەی PDF — فۆرمی وەزارەت
      </button>
      <button class="action-btn" style="padding:14px;font-size:14px" onclick="exportCSV()">
        📋 هەناردەی CSV — داتای خام
      </button>
    </div>
  `);
};

// Helper: build the weekly ministry report matrix
function buildWeeklyMatrix(records) {
  // AGE_GROUPS x GENDER for each disease
  // Returns { disease_id: { age_id: { male: N, female: N } } }
  const matrix = {};
  DISEASES.forEach(d => {
    matrix[d.id] = {};
    AGE_GROUPS.forEach(a => {
      matrix[d.id][a.id] = { male: 0, female: 0 };
    });
  });
  records.forEach(r => {
    if (matrix[r.disease] && matrix[r.disease][r.ageGroup]) {
      if (r.gender === 'male') matrix[r.disease][r.ageGroup].male++;
      else matrix[r.disease][r.ageGroup].female++;
    }
  });
  return matrix;
}

window.exportCSV = function() {
  let records = currentPage === 'weekly' ? weekRecords :
                currentPage === 'monthly' ? monthRecords :
                currentPage === 'daily' ? todayRecords : weekRecords;
  const csv = convertToCSV(records);
  const weekNum = getWeekNumber(selectedDate);
  downloadFile(csv, `week${weekNum}-${selectedDate.getFullYear()}.csv`);
  closeModal();
  showToast('✓ CSV هەناردە کرا', 'success');
};

window.exportWeeklyExcel = function() {
  const { firstDay, lastDay } = getWeekRange(selectedDate);
  const weekNum = getWeekNumber(selectedDate);
  // فلتەرکردنی داتا بەپێی ماوەی هەفتەکە لە monthRecords (زیاتر دروستە)
  const weekDates = new Set();
  for (let i = 0; i < 7; i++) {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() + i);
    weekDates.add(formatDateShort(d));
  }
  const weekFilteredRecords = monthRecords.filter(r => weekDates.has(r.date));
  const matrix = buildWeeklyMatrix(weekFilteredRecords);
  const hospitalTitle = isAdmin ? 'هەموو نەخۆشخانەکان' : currentHospitalName;

  // Build CSV in ministry format
  const dateFrom = formatDateShort(firstDay);
  const dateTo = formatDateShort(lastDay);
  
  let rows = [];
  // Header rows
  rows.push(['فۆرمی تۆماری نەخۆشی هەفتانە - وەزارەتی تەندروستی']);
  rows.push([`نەخۆشخانە: ${hospitalTitle}`, '', `هەفتە: ${weekNum}`, '', `لە: ${dateFrom}`, `بۆ: ${dateTo}`]);
  rows.push([]);
  
  // Column headers: disease | <1M | <1F | 1-4M | 1-4F | 5-14M | 5-14F | 15-24M | 15-24F | 25-44M | 25-44F | 45-64M | 45-64F | 65+M | 65+F | Total
  const ageHeaders = [];
  AGE_GROUPS.forEach(a => { ageHeaders.push(`${a.label} ن`); ageHeaders.push(`${a.label} م`); });
  rows.push(['نەخۆشی', ...ageHeaders, 'کۆی گشتی نێر', 'کۆی گشتی مێ', 'کۆی گشتی']);
  
  // Data rows per disease
  DISEASES.forEach(d => {
    const row = [d.name];
    let totalMale = 0, totalFemale = 0;
    AGE_GROUPS.forEach(a => {
      const cell = matrix[d.id][a.id];
      row.push(cell.male);
      row.push(cell.female);
      totalMale += cell.male;
      totalFemale += cell.female;
    });
    row.push(totalMale);
    row.push(totalFemale);
    row.push(totalMale + totalFemale);
    rows.push(row);
  });
  
  // Totals row
  const totalsRow = ['کۆی گشتی'];
  let grandMale = 0, grandFemale = 0;
  AGE_GROUPS.forEach(a => {
    let ageMale = 0, ageFemale = 0;
    DISEASES.forEach(d => { ageMale += matrix[d.id][a.id].male; ageFemale += matrix[d.id][a.id].female; });
    totalsRow.push(ageMale); totalsRow.push(ageFemale);
    grandMale += ageMale; grandFemale += ageFemale;
  });
  totalsRow.push(grandMale); totalsRow.push(grandFemale); totalsRow.push(grandMale + grandFemale);
  rows.push(totalsRow);
  
  const csv = rows.map(r => r.join(',')).join('\n');
  downloadFile(csv, `weekly-report-week${weekNum}-${selectedDate.getFullYear()}.csv`);
  closeModal();
  showToast('✓ Excel هەناردە کرا', 'success');
};

window.exportWeeklyPDF = function() {
  const { firstDay, lastDay } = getWeekRange(selectedDate);
  const weekNum = getWeekNumber(selectedDate);
  // فلتەرکردنی داتا بەپێی ماوەی هەفتەکە لە monthRecords
  const weekDates2 = new Set();
  for (let i = 0; i < 7; i++) {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() + i);
    weekDates2.add(formatDateShort(d));
  }
  const weekFilteredRecords2 = monthRecords.filter(r => weekDates2.has(r.date));
  const matrix = buildWeeklyMatrix(weekFilteredRecords2);
  const hospitalTitle = isAdmin ? 'هەموو نەخۆشخانەکان' : currentHospitalName;
  const dateFrom = formatDateShort(firstDay);
  const dateTo = formatDateShort(lastDay);

  // Age headers
  const ageHeadersHtml = AGE_GROUPS.map(a =>
    `<th colspan="2" style="background:#0f6e56;color:white;padding:4px;font-size:10px;border:1px solid #ccc">${a.label}</th>`
  ).join('');
  const ageSubHeadersHtml = AGE_GROUPS.map(() =>
    `<th style="background:#185fa5;color:white;padding:3px;font-size:9px;border:1px solid #ccc">ن</th>
     <th style="background:#b33a6a;color:white;padding:3px;font-size:9px;border:1px solid #ccc">م</th>`
  ).join('');

  // Disease rows
  const diseaseRowsHtml = DISEASES.map(d => {
    let totalM = 0, totalF = 0;
    const cells = AGE_GROUPS.map(a => {
      const c = matrix[d.id][a.id];
      totalM += c.male; totalF += c.female;
      return `<td style="text-align:center;padding:3px;border:1px solid #ddd;font-size:10px">${c.male||''}</td>
              <td style="text-align:center;padding:3px;border:1px solid #ddd;font-size:10px">${c.female||''}</td>`;
    }).join('');
    return `<tr>
      <td style="padding:4px 6px;border:1px solid #ddd;font-weight:600;font-size:11px">${d.icon} ${d.name}</td>
      ${cells}
      <td style="text-align:center;font-weight:700;color:#185fa5;border:1px solid #ddd;font-size:11px">${totalM||''}</td>
      <td style="text-align:center;font-weight:700;color:#b33a6a;border:1px solid #ddd;font-size:11px">${totalF||''}</td>
      <td style="text-align:center;font-weight:800;color:#0f6e56;border:1px solid #ddd;font-size:11px">${(totalM+totalF)||''}</td>
    </tr>`;
  }).join('');

  // Totals
  let gM = 0, gF = 0;
  const totalCells = AGE_GROUPS.map(a => {
    let aM = 0, aF = 0;
    DISEASES.forEach(d => { aM += matrix[d.id][a.id].male; aF += matrix[d.id][a.id].female; });
    gM += aM; gF += aF;
    return `<td style="text-align:center;font-weight:700;background:#f0f9f5;border:1px solid #ddd;font-size:10px">${aM||''}</td>
            <td style="text-align:center;font-weight:700;background:#f0f9f5;border:1px solid #ddd;font-size:10px">${aF||''}</td>`;
  }).join('');

  const html = `<!DOCTYPE html><html dir="rtl"><head>
    <meta charset="UTF-8">
    <style>
      body { font-family: 'Segoe UI', Tahoma, sans-serif; margin: 10px; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; }
      .header-box { background: #0f6e56; color: white; padding: 10px 16px; border-radius: 8px; margin-bottom: 10px; }
      @media print { .no-print { display: none; } }
    </style>
  </head><body>
    <div class="header-box">
      <div style="font-size:16px;font-weight:700">🏥 وەزارەتی تەندروستی — فۆرمی تۆماری نەخۆشی هەفتانە</div>
      <div style="margin-top:6px;font-size:12px">
        <span style="margin-left:24px">📍 ${hospitalTitle}</span>
        <span style="margin-left:24px">📅 هەفتە ${weekNum}</span>
        <span style="margin-left:24px">لە: ${dateFrom}</span>
        <span>بۆ: ${dateTo}</span>
      </div>
    </div>
    <button class="no-print" onclick="window.print()" style="margin-bottom:10px;padding:8px 20px;background:#0f6e56;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ چاپکردن</button>
    <table>
      <thead>
        <tr>
          <th rowspan="2" style="background:#0a4d3b;color:white;padding:6px;border:1px solid #ccc;min-width:100px">نەخۆشی</th>
          ${ageHeadersHtml}
          <th style="background:#185fa5;color:white;padding:4px;font-size:10px;border:1px solid #ccc">کۆ ن</th>
          <th style="background:#b33a6a;color:white;padding:4px;font-size:10px;border:1px solid #ccc">کۆ م</th>
          <th style="background:#0f6e56;color:white;padding:4px;font-size:10px;border:1px solid #ccc">کۆی گشتی</th>
        </tr>
        <tr>${ageSubHeadersHtml}<th></th><th></th><th></th></tr>
      </thead>
      <tbody>
        ${diseaseRowsHtml}
        <tr style="background:#e8f5e9">
          <td style="font-weight:800;padding:4px 6px;border:1px solid #ddd">کۆی گشتی</td>
          ${totalCells}
          <td style="text-align:center;font-weight:800;color:#185fa5;border:1px solid #ddd">${gM||''}</td>
          <td style="text-align:center;font-weight:800;color:#b33a6a;border:1px solid #ddd">${gF||''}</td>
          <td style="text-align:center;font-weight:900;color:#0f6e56;border:1px solid #ddd">${gM+gF||''}</td>
        </tr>
      </tbody>
    </table>
    <div style="margin-top:12px;font-size:10px;color:#888">دروستکراوە لە: ${new Date().toLocaleDateString('ar-IQ')}</div>
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    downloadFile(html, `weekly-report-week${weekNum}.html`);
  }
  closeModal();
  showToast('✓ PDF ئامادەیە — چاپی بکە', 'success');
};

window.exportAllData = function() {
  if (!currentUser) {
    showToast('تکایە سەرەتا بچۆرە ژوورەوە', 'error');
    return;
  }
  const allRecords = [...new Map([...todayRecords, ...weekRecords, ...monthRecords, ...yearRecords].map(r => [r.id, r])).values()];
  if (allRecords.length === 0) {
    showToast('هیچ داتایەک نیە', 'info');
    return;
  }
  const csv = convertToCSV(allRecords);
  downloadFile(csv, `all-data-${formatDateShort(new Date())}.csv`);
  showToast('✓ هەموو داتاکان هەناردە کران', 'success');
};

function convertToCSV(records) {
  const headers = ['ڕێکەوت', 'نەخۆشی', 'تەمەن', 'ڕەگەز', 'کات'];
  const rows = records.map(r => [
    r.date,
    r.diseaseName,
    r.ageLabel,
    r.gender === 'male' ? 'نێر' : 'مێ',
    r.savedAt ? new Date(r.savedAt).toLocaleTimeString() : ''
  ]);
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadFile(content, fileName) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}

// ==================== Quick Entry Modal ====================
window.showQuickEntryModal = function() {
  showModal('⚡ تۆماری خێرا', `
    <select id="quickDisease">
      ${DISEASES.map(d => `<option value="${d.id}">${d.icon} ${d.name}</option>`).join('')}
    </select>
    <select id="quickAge">
      ${AGE_GROUPS.map(a => `<option value="${a.id}">${a.label} ${a.sub}</option>`).join('')}
    </select>
    <select id="quickGender">
      <option value="male">👨 نێر</option>
      <option value="female">👩 مێ</option>
    </select>
    <input type="number" id="quickCount" value="1" min="1" max="10">
    <button class="action-btn primary" style="width:100%;margin-top:8px" onclick="quickAddRecords()">زیادکردن</button>
  `);
};

window.quickAddRecords = function() {
  const disease = document.getElementById('quickDisease')?.value;
  const age = document.getElementById('quickAge')?.value;
  const gender = document.getElementById('quickGender')?.value;
  const count = parseInt(document.getElementById('quickCount')?.value || '1');

  if (!disease || !age || !gender) {
    showToast('تکایە هەموو خانەکان پڕبکەوە', 'error');
    return;
  }

  for (let i = 0; i < count; i++) {
    addRecord(disease, age, gender);
  }
  closeModal();
};

// ==================== Report Functions ====================
window.createNewReport = function() {
  const reportTypes = [
    { id: 'daily', name: 'ڕاپۆرتی ڕۆژانە', icon: '📋' },
    { id: 'weekly', name: 'ڕاپۆرتی هەفتانە', icon: '📅' },
    { id: 'monthly', name: 'ڕاپۆرتی مانگانە', icon: '📈' },
    { id: 'custom', name: 'ڕاپۆرتی تایبەت', icon: '⚙️' }
  ];
  
  showModal('دروستکردنی ڕاپۆرتی نوێ', `
    <div style="display:grid;gap:8px">
      ${reportTypes.map(type => `
        <button class="action-btn" style="justify-content:flex-start;padding:12px;width:100%" onclick="selectReportType('${type.id}')">
          <span style="font-size:20px;margin-left:10px">${type.icon}</span>
          ${type.name}
        </button>
      `).join('')}
    </div>
  `);
};

window.selectReportType = function(type) {
  closeModal();
  
  let records = [];
  let title = '';
  
  if (type === 'daily') {
    records = todayRecords;
    title = `ڕاپۆرتی ڕۆژانە - ${formatDateWithYear(selectedDate)}`;
  } else if (type === 'weekly') {
    records = weekRecords;
    const { firstDay, lastDay } = getWeekRange(selectedDate);
    title = `ڕاپۆرتی هەفتانە - هەفتەی ${getWeekNumber(selectedDate)} (${formatDateShort(firstDay)} - ${formatDateShort(lastDay)})`;
  } else if (type === 'monthly') {
    records = monthRecords;
    title = `ڕاپۆرتی مانگانە - ${selectedDate.getMonth()+1}/${selectedDate.getFullYear()}`;
  } else {
    records = todayRecords;
    title = `ڕاپۆرتی تایبەت - ${formatDateWithYear(new Date())}`;
  }
  
  saveReport(title, records);
};

async function saveReport(title, records) {
  if (!currentUser) return;
  
  try {
    const report = {
      title: title,
      date: formatDateWithYear(new Date()),
      count: records.length,
      data: records.slice(0, 100),
      userId: currentUser.uid,
      createdAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, 'saved_reports'), report);
    await loadSavedReports();
    renderPage();
    showToast('✓ ڕاپۆرت پاشەکەوت کرا', 'success');
  } catch (error) {
    console.error('Error saving report:', error);
    showToast('هەڵە لە پاشەکەوتکردن', 'error');
  }
}

window.viewReport = function(reportId) {
  const report = savedReports.find(r => r.id === reportId);
  if (!report) return;
  
  let detailsHtml = `<h3 style="margin-bottom:12px">${report.title}</h3>`;
  detailsHtml += `<p style="margin-bottom:16px">ڕێکەوت: ${report.date} | کۆی تۆمار: ${report.count}</p>`;
  
  if (report.data && report.data.length > 0) {
    detailsHtml += '<div class="log-list" style="max-height:300px">';
    
    // Group by disease
    const diseaseCounts = {};
    report.data.forEach(record => {
      const diseaseName = record.diseaseName || record.disease;
      diseaseCounts[diseaseName] = (diseaseCounts[diseaseName] || 0) + 1;
    });
    
    Object.entries(diseaseCounts).forEach(([disease, count]) => {
      detailsHtml += `
        <div class="log-item">
          <span>${disease}</span>
          <span class="log-count">${count}</span>
        </div>
      `;
    });
    
    detailsHtml += '</div>';
  }
  
  showModal('پیشاندانی ڕاپۆرت', detailsHtml);
};

window.downloadReport = function(reportId) {
  const report = savedReports.find(r => r.id === reportId);
  if (!report || !report.data) return;
  
  const csv = convertToCSV(report.data);
  downloadFile(csv, `report-${reportId}.csv`);
  showToast('✓ داونلۆد کرا', 'success');
};

window.deleteReport = async function(reportId) {
  if (!confirm('دڵنیایت دەتەوێت ئەم ڕاپۆرتە بسڕیتەوە؟')) return;
  
  try {
    await deleteDoc(doc(db, 'saved_reports', reportId));
    await loadSavedReports();
    renderPage();
    showToast('✓ ڕاپۆرت سڕایەوە', 'success');
  } catch (error) {
    console.error('Error deleting report:', error);
    showToast('هەڵە لە سڕینەوە', 'error');
  }
};

// ==================== Settings Functions ====================
window.toggleSetting = function(setting) {
  const settings = JSON.parse(localStorage.getItem('appSettings')) || {
    theme: 'light',
    notifications: true,
    sound: true
  };
  
  if (setting === 'theme') {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', settings.theme);
  } else if (setting === 'notifications') {
    settings.notifications = !settings.notifications;
  } else if (setting === 'sound') {
    settings.sound = !settings.sound;
  }
  
  localStorage.setItem('appSettings', JSON.stringify(settings));
  showToast('✓ ڕێکخستنەکان نوێکرانەوە', 'success');
  renderPage();
};

// ==================== Initialize ====================
// Restore session from localStorage
(function restoreSession() {
  const saved = localStorage.getItem('loggedInUser');
  if (saved) {
    try {
      const u = JSON.parse(saved);
      currentUser = { uid: u.username, displayName: u.hospitalName, username: u.username };
      isAdmin = u.isAdmin;
      currentHospitalName = u.hospitalName;
      loadData();
    } catch(e) {
      localStorage.removeItem('loggedInUser');
      renderPage();
    }
  } else {
    renderPage();
  }
})();

// Make all functions global
window.login = login;
window.logout = logout;