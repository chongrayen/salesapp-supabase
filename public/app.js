// Supabase Auth Configuration
const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';
const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Initialize Supabase client for auth
let supabaseAuth = null;
let currentUser = null;

if (AUTH_ENABLED) {
  // Dynamically load Supabase JS client
  supabaseAuth = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
}

// DOM Elements for Auth
const loginOverlay = document.getElementById('loginOverlay');
const appContent = document.getElementById('appContent');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const loginError = document.getElementById('loginError');
const loginMessage = document.getElementById('loginMessage');
const toggleAuthModeBtn = document.getElementById('toggleAuthMode');
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');

// State for auth mode toggle
let isLoginMode = true;

// Check authentication state on load
async function checkAuth() {
  if (!AUTH_ENABLED) {
    // No auth configured, show app directly
    showApp();
    return;
  }

  if (!supabaseAuth) {
    // Supabase client not loaded, try loading it
    await loadSupabaseClient();
    if (!supabaseAuth) {
      console.warn('Supabase client could not be loaded. Showing app without auth.');
      showApp();
      return;
    }
  }

  // Check for existing session
  const { data: { session }, error } = await supabaseAuth.auth.getSession();

  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    showLogin();
  }

  // Listen for auth state changes
  supabaseAuth.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      showApp();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showLogin();
    }
  });
}

async function loadSupabaseClient() {
  if (window.supabase) {
    supabaseAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return;
  }

  // Load Supabase from CDN
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
      if (window.supabase) {
        supabaseAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve();
      } else {
        reject(new Error('Supabase client not available after loading'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Supabase client'));
    document.head.appendChild(script);
  });
}

function showLogin() {
  loginOverlay.hidden = false;
  appContent.hidden = true;
}

function showApp() {
  loginOverlay.hidden = true;
  appContent.hidden = false;

  // Show user info if authenticated
  if (currentUser && userInfo) {
    userInfo.style.display = 'flex';
    userEmail.textContent = currentUser.email || 'User';
  }

  // Load data only when app is shown
  if (!window.__dataLoaded) {
    loadData();
    window.__dataLoaded = true;
  }
}

function showError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
  setTimeout(() => { loginError.hidden = true; }, 5000);
}

function showMessage(message) {
  loginMessage.textContent = message;
  loginMessage.hidden = false;
  setTimeout(() => { loginMessage.hidden = true; }, 5000);
}

// Handle login
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!supabaseAuth) {
    showError('Authentication is not configured');
    return;
  }

  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showError(error.message);
      return;
    }

    if (data.user) {
      currentUser = data.user;
      showApp();
    }
  } catch (err) {
    showError('An unexpected error occurred');
  }
}

// Handle signup
async function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!supabaseAuth) {
    showError('Authentication is not configured');
    return;
  }

  try {
    const { data, error } = await supabaseAuth.auth.signUp({
      email,
      password
    });

    if (error) {
      showError(error.message);
      return;
    }

    showMessage('Account created! Please check your email to confirm your account.');
    // Switch back to login mode
    isLoginMode = true;
    toggleAuthMode();
    signupForm.reset();
  } catch (err) {
    showError('An unexpected error occurred');
  }
}

// Toggle between login and signup
function toggleAuthMode() {
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    loginForm.hidden = false;
    signupForm.hidden = true;
    toggleAuthModeBtn.textContent = 'Need an account? Sign up';
  } else {
    loginForm.hidden = true;
    signupForm.hidden = false;
    toggleAuthModeBtn.textContent = 'Already have an account? Sign in';
  }
  loginError.hidden = true;
  loginMessage.hidden = true;
}

// Logout function (accessible globally)
async function logout() {
  if (supabaseAuth) {
    await supabaseAuth.auth.signOut();
  }
  currentUser = null;
  showLogin();
}

// Event listeners for auth
loginForm.addEventListener('submit', handleLogin);
signupForm.addEventListener('submit', handleSignup);
toggleAuthModeBtn.addEventListener('click', toggleAuthMode);

// ==========================================
// MAIN APP LOGIC (unchanged from original)
// ==========================================

const state = {
  raw: [],
  filtered: [],
  summary: {
    totalRecords: 0,
    uniqueParts: 0,
    totalSpend: 0
  },
  selectedId: null
};

const API_BASE = (window.__SALESAPP_API__ || '').replace(/\/$/, '');
const apiFetch = (path, options) => fetch(`${API_BASE}${path}`, options);

// Open Data Folder button setup
const openDataFolderBtn = document.getElementById('openDataFolderBtn');
if (openDataFolderBtn && window.__SHARED_FOLDER_URL__) {
  openDataFolderBtn.href = window.__SHARED_FOLDER_URL__;
  openDataFolderBtn.style.display = 'inline-flex';
}

const listEl = document.getElementById('partList');
const detailEl = document.getElementById('detailPanel');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const totalRecordsEl = document.getElementById('totalRecords');
const uniquePartsEl = document.getElementById('uniqueParts');
const totalSpendEl = document.getElementById('totalSpend');
const cardTemplate = document.getElementById('partCardTemplate');
const toggleEntryFormBtn = document.getElementById('toggleEntryForm');
const entryForm = document.getElementById('entryForm');
const entryStatusEl = document.getElementById('entryStatus');
const cancelEntryBtn = document.getElementById('cancelEntryBtn');

const currency = (value) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 }).format(value || 0);

const formatRemark = (item) => {
  const type = item.transactionType && item.transactionType !== 'N/A' ? item.transactionType : null;
  const remarkText = item.remark || 'No remark available';
  return type ? `${type} • ${remarkText}` : remarkText;
};

async function loadData() {
  const response = await apiFetch('/api/parts');
  if (!response.ok) {
    const { error } = await response.json();
    throw new Error(error || 'Unable to load data');
  }
  const payload = await response.json();
  state.raw = payload.data || [];
  state.summary.totalRecords = payload.total || state.raw.length;
  state.summary.uniqueParts = payload.distinctParts || new Set(state.raw.map((item) => item.partNo)).size;
  state.summary.totalSpend = state.raw.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
  state.filtered = [...state.raw];
  applySort();
  render();
}

function render() {
  renderList();
  renderSummary();
  if (state.selectedId) {
    const current = state.filtered.find((item) => item.id === state.selectedId) || state.raw.find((item) => item.id === state.selectedId);
    if (current) {
      renderDetail(current);
    }
  }
}

function renderSummary() {
  totalRecordsEl.textContent = state.summary.totalRecords.toLocaleString();
  uniquePartsEl.textContent = state.summary.uniqueParts.toLocaleString();
  totalSpendEl.textContent = currency(state.summary.totalSpend);
}

function renderList() {
  listEl.innerHTML = '';
  if (!state.filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No records match your filter yet.';
    listEl.appendChild(empty);
    return;
  }

  state.filtered.forEach((item, index) => {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = item.id;
    card.querySelector('.part-number').textContent = item.partNo || 'Unknown part';
    card.querySelector('.po').textContent = item.po || '—';
    card.querySelector('.date').textContent = item.date;
    card.querySelector('.qty').textContent = `${item.qty} pcs`;
    card.querySelector('.price').textContent = `Unit: ${currency(item.price)}`;
    card.querySelector('.total').textContent = `Total: ${currency(item.totalPrice)}`;
    card.querySelector('.remark').textContent = formatRemark(item);
    card.querySelector('.supplier-badge').textContent = item.supplier || 'Unknown supplier';

    if (item.id === state.selectedId || (!state.selectedId && index === 0)) {
      card.classList.add('selected');
      state.selectedId = item.id;
      renderDetail(item);
    }

    card.addEventListener('click', () => {
      state.selectedId = item.id;
      renderDetail(item);
      document.querySelectorAll('.part-card').forEach((node) => node.classList.remove('selected'));
      card.classList.add('selected');
    });

    listEl.appendChild(card);
  });
}

function renderDetail(item) {
  detailEl.innerHTML = `
    <h2>${item.partNo}</h2>
    <section class="detail-remark">
      <h3>Remark</h3>
      <p>${formatRemark(item)}</p>
    </section>
    <div class="detail-grid">
      ${detailTile('Supplier', item.supplier || '—')}
      ${detailTile('Date', item.date)}
      ${detailTile('PO', item.po || '—')}
      ${detailTile('Quantity', `${item.qty} pcs`)}
      ${detailTile('Unit price', currency(item.price))}
      ${detailTile('Total price', currency(item.totalPrice))}
      ${detailTile('Transaction type', item.transactionType || '—')}
      ${detailTile('Source', item.source || 'Workbook')}
    </div>
  `;
}

function detailTile(label, value) {
  return `
    <div class="tile">
      <span class="label">${label}</span>
      <div class="value">${value}</div>
    </div>
  `;
}

function applyFilter() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    state.filtered = [...state.raw];
    applySort();
    renderList();
    return;
  }

  state.filtered = state.raw.filter((item) => {
    return [item.partNo, item.po, item.remark, item.supplier]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(query));
  });
  applySort();
  renderList();
}

function applySort() {
  const mode = sortSelect.value;
  const sorter = {
    'date-desc': (a, b) => new Date(b.dateRaw.split('/').reverse().join('-')) - new Date(a.dateRaw.split('/').reverse().join('-')),
    'date-asc': (a, b) => new Date(a.dateRaw.split('/').reverse().join('-')) - new Date(b.dateRaw.split('/').reverse().join('-')),
    'price-desc': (a, b) => (b.price || 0) - (a.price || 0),
    'price-asc': (a, b) => (a.price || 0) - (b.price || 0)
  };

  const sortFn = sorter[mode] || sorter['date-desc'];
  state.filtered.sort(sortFn);
}

function toggleEntryForm(show) {
  const shouldShow = typeof show === 'boolean' ? show : entryForm.hasAttribute('hidden');
  if (shouldShow) {
    entryForm.removeAttribute('hidden');
    entryStatusEl.textContent = '';
    entryStatusEl.classList.remove('error', 'success');
  } else {
    entryForm.setAttribute('hidden', 'hidden');
    entryStatusEl.textContent = '';
    entryStatusEl.classList.remove('error', 'success');
  }
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  entryStatusEl.textContent = '';
  entryStatusEl.classList.remove('error', 'success');

  const formData = new FormData(entryForm);
  const payload = {
    supplier: formData.get('supplier')?.trim(),
    date: formData.get('date'),
    partNo: formData.get('partNo')?.trim(),
    po: formData.get('po')?.trim(),
    qty: formData.get('qty'),
    price: formData.get('price'),
    remark: formData.get('remark')?.trim()
  };

  if (!payload.supplier || !payload.date || !payload.partNo) {
    entryStatusEl.textContent = 'Supplier, date and part number are required.';
    entryStatusEl.classList.add('error');
    return;
  }

  try {
    const response = await apiFetch('/api/parts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error || 'Unable to save entry');
    }

    entryStatusEl.textContent = 'Entry saved!';
    entryStatusEl.classList.add('success');
    entryForm.reset();
    await loadData();
    setTimeout(() => entryStatusEl.classList.remove('success'), 2500);
  } catch (error) {
    entryStatusEl.textContent = error.message;
    entryStatusEl.classList.add('error');
  }
}

searchInput.addEventListener('input', () => {
  applyFilter();
});

sortSelect.addEventListener('change', () => {
  applySort();
  renderList();
});

toggleEntryFormBtn.addEventListener('click', () => {
  const isHidden = entryForm.hasAttribute('hidden');
  toggleEntryForm(isHidden);
});
if (cancelEntryBtn) {
  cancelEntryBtn.addEventListener('click', () => {
    entryForm.reset();
    toggleEntryForm(false);
  });
}

entryForm.addEventListener('submit', handleEntrySubmit);

// Initialize auth check
checkAuth().catch((error) => {
  console.error('Auth initialization error:', error);
  // Show app even on auth error
  showApp();
});