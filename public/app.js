// Supabase Auth Configuration
const SUPABASE_URL = window.__SUPABASE_URL__ || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';
const AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Initialize Supabase client for auth
let supabaseAuth = null;
let currentUser = null;
let authInitialized = false;
let authInitializing = false;

// DOM Elements for Auth
const loginOverlay = document.getElementById('loginOverlay');
const appContent = document.getElementById('appContent');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginMessage = document.getElementById('loginMessage');
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');

// Get or initialize Supabase client
async function getSupabaseClient() {
  if (!AUTH_ENABLED) {
    return null;
  }

  if (supabaseAuth) {
    return supabaseAuth;
  }

  // Check if Supabase is already loaded
  if (window.supabase) {
    supabaseAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseAuth;
  }

  // Load Supabase from CDN
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
      if (window.supabase) {
        supabaseAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve(supabaseAuth);
      } else {
        reject(new Error('Supabase client not available after loading'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Supabase client from CDN'));
    document.head.appendChild(script);
  });
}

// Check authentication state on load
async function checkAuth() {
  if (!AUTH_ENABLED) {
    // No auth configured, show app directly
    console.log('Auth not enabled, showing app');
    showApp();
    return;
  }

  try {
    supabaseAuth = await getSupabaseClient();
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    console.warn('Showing app without auth due to client initialization failure');
    showApp();
    return;
  }

  if (!supabaseAuth) {
    console.warn('Supabase client is null, showing app without auth');
    showApp();
    return;
  }

  // Check for existing session
  try {
    const { data: { session }, error } = await supabaseAuth.auth.getSession();

    if (error) {
      console.error('Error getting session:', error);
    }

    if (session) {
      currentUser = session.user;
      console.log('User logged in:', currentUser.email);
      showApp();
    } else {
      console.log('No active session, showing login');
      showLogin();
    }

    // Listen for auth state changes
    supabaseAuth.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        showApp();
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        showLogin();
      }
    });
  } catch (error) {
    console.error('Error during auth check:', error);
    showApp();
  }
}

function showLogin() {
  if (loginOverlay) loginOverlay.hidden = false;
  if (appContent) appContent.hidden = true;
  console.log('Showing login screen');
}

function showApp() {
  console.log('showApp called, currentUser:', currentUser ? currentUser.email : 'null');
  
  if (loginOverlay) {
    loginOverlay.hidden = true;
    console.log('Login overlay hidden');
  }
  
  if (appContent) {
    appContent.hidden = false;
    console.log('App content shown');
  }

  // Show user info if authenticated
  if (currentUser && userInfo) {
    userInfo.style.display = 'flex';
    userEmail.textContent = currentUser.email || 'User';
    console.log('User info displayed:', currentUser.email);
  }

  // Load data only when app is shown
  if (!window.__dataLoaded) {
    console.log('Loading data for first time');
    loadData();
    window.__dataLoaded = true;
  }
}

function showError(message) {
  console.error('Login error:', message);
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
  
  console.log('Login attempt started');
  
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showError('Please enter both email and password');
    return;
  }

  if (!AUTH_ENABLED) {
    showError('Authentication is not configured. Please contact the administrator.');
    return;
  }

  // Ensure we have a Supabase client
  if (!supabaseAuth) {
    console.log('Supabase client not ready, initializing...');
    try {
      supabaseAuth = await getSupabaseClient();
    } catch (error) {
      console.error('Failed to get Supabase client:', error);
      showError('Authentication service is unavailable. Please try again later.');
      return;
    }
  }

  console.log('Signing in with email:', email);

  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Login error:', error);
      showError(error.message || 'Invalid login credentials');
      return;
    }

    if (data.user) {
      console.log('Login successful:', data.user.email);
      currentUser = data.user;
      showApp();
    } else {
      showError('Login failed: no user data received');
    }
  } catch (err) {
    console.error('Unexpected error during login:', err);
    showError('An unexpected error occurred. Please try again.');
  }
}

// Logout function (accessible globally)
async function logout() {
  console.log('Logout requested');
  if (supabaseAuth) {
    try {
      await supabaseAuth.auth.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }
  currentUser = null;
  showLogin();
}

// Event listeners for auth
loginForm.addEventListener('submit', handleLogin);

// Make logout available globally
window.logout = logout;

// ==========================================
// MAIN APP LOGIC
// ==========================================

const state = {
  raw: [],
  filtered: [],
  summary: {
    totalRecords: 0,
    uniqueParts: 0,
    totalSpend: 0
  },
  selectedId: null,
  files: []
};

const API_BASE = (window.__SALESAPP_API__ || '').replace(/\/$/, '');
const apiFetch = (path, options) => fetch(`${API_BASE}${path}`, options);

// Open Data Folder button setup
const openDataFolderBtn = document.getElementById('openDataFolderBtn');
if (openDataFolderBtn && window.__SHARED_FOLDER_URL__) {
  openDataFolderBtn.href = window.__SHARED_FOLDER_URL__;
  openDataFolderBtn.style.display = 'inline-flex';
}

// DOM Elements
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

// Upload elements
const toggleUploadFormBtn = document.getElementById('toggleUploadForm');
const uploadForm = document.getElementById('uploadForm');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const uploadStatusEl = document.getElementById('uploadStatus');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const uploadBtn = document.getElementById('uploadBtn');

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

// File upload functionality
let selectedFile = null;

function toggleUploadForm(show) {
  const shouldShow = typeof show === 'boolean' ? show : uploadForm.hasAttribute('hidden');
  if (shouldShow) {
    uploadForm.removeAttribute('hidden');
    uploadStatusEl.textContent = '';
    uploadStatusEl.classList.remove('error', 'success');
    resetUploadZone();
    loadFiles(); // Load file list when opening upload form
  } else {
    uploadForm.setAttribute('hidden', 'hidden');
    uploadStatusEl.textContent = '';
    uploadStatusEl.classList.remove('error', 'success');
  }
}

function resetUploadZone() {
  selectedFile = null;
  uploadBtn.disabled = true;
  if (uploadZone) {
    uploadZone.innerHTML = `
      <div class="upload-content">
        <div class="upload-icon">📄</div>
        <p>Drag & drop your Excel file here</p>
        <p class="upload-hint">or click to browse</p>
        <input type="file" id="fileInput" accept=".xlsx" hidden />
      </div>
    `;
    // Reattach event listeners to the new file input
    const newFileInput = document.getElementById('fileInput');
    if (newFileInput) {
      newFileInput.addEventListener('change', handleFileSelect);
    }
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      uploadStatusEl.textContent = 'Only .xlsx files are allowed';
      uploadStatusEl.classList.add('error');
      selectedFile = null;
      uploadBtn.disabled = true;
      return;
    }
    
    selectedFile = file;
    uploadStatusEl.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
    uploadStatusEl.classList.remove('error');
    uploadBtn.disabled = false;
    
    // Update upload zone to show file info
    uploadZone.innerHTML = `
      <div class="upload-content">
        <div class="upload-icon">📄</div>
        <p><strong>${file.name}</strong></p>
        <p class="upload-hint">${formatFileSize(file.size)} • Click to change file</p>
        <input type="file" id="fileInput" accept=".xlsx" hidden />
      </div>
    `;
    // Reattach event listener
    const newFileInput = document.getElementById('fileInput');
    if (newFileInput) {
      newFileInput.addEventListener('change', handleFileSelect);
    }
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function handleFileUpload(event) {
  event.preventDefault();
  
  if (!selectedFile) {
    uploadStatusEl.textContent = 'Please select a file first';
    uploadStatusEl.classList.add('error');
    return;
  }
  
  uploadBtn.disabled = true;
  uploadStatusEl.textContent = 'Uploading...';
  
  try {
    const arrayBuffer = await selectedFile.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString('base64');
    
    const response = await apiFetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: selectedFile.name,
        content: base64Content,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
    });
    
    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error || 'Upload failed');
    }
    
    const result = await response.json();
    uploadStatusEl.textContent = `✓ Uploaded ${selectedFile.name} successfully!`;
    uploadStatusEl.classList.add('success');
    
    // Reset form
    selectedFile = null;
    uploadBtn.disabled = true;
    
    // Reload data and file list after a short delay
    setTimeout(async () => {
      await loadData();
      await loadFiles();
      resetUploadZone();
    }, 1000);
    
  } catch (error) {
    uploadStatusEl.textContent = `Upload failed: ${error.message}`;
    uploadStatusEl.classList.add('error');
    uploadBtn.disabled = false;
  }
}

async function loadFiles() {
  try {
    const response = await apiFetch('/api/files');
    if (!response.ok) {
      throw new Error('Failed to load files');
    }
    const { files } = await response.json();
    state.files = files || [];
    renderFileList();
  } catch (error) {
    console.error('Error loading files:', error);
  }
}

function renderFileList() {
  // Remove existing file list if present
  const existingList = document.getElementById('fileList');
  if (existingList) {
    existingList.remove();
  }
  
  if (state.files.length === 0) {
    return;
  }
  
  const fileList = document.createElement('div');
  fileList.id = 'fileList';
  fileList.className = 'file-list';
  
  state.files.forEach(file => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';
    
    const fileName = document.createElement('div');
    fileName.className = 'file-name';
    fileName.textContent = file.name;
    fileName.title = file.name;
    
    const fileMeta = document.createElement('div');
    fileMeta.className = 'file-meta';
    fileMeta.textContent = `${formatFileSize(file.size)} • ${new Date(file.updated).toLocaleDateString()}`;
    
    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileMeta);
    
    const fileActions = document.createElement('div');
    fileActions.className = 'file-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'ghost-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.color = '#f87171';
    deleteBtn.style.borderColor = 'rgba(248, 113, 113, 0.4)';
    deleteBtn.addEventListener('click', () => deleteFile(file.name));
    
    fileActions.appendChild(deleteBtn);
    
    fileItem.appendChild(fileInfo);
    fileItem.appendChild(fileActions);
    fileList.appendChild(fileItem);
  });
  
  // Insert file list after upload form
  uploadForm.parentNode.insertBefore(fileList, uploadForm.nextSibling);
}

async function deleteFile(fileName) {
  if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
    return;
  }
  
  try {
    const response = await apiFetch(`/api/files/${encodeURIComponent(fileName)}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
    
    // Reload files and data
    await loadFiles();
    await loadData();
  } catch (error) {
    console.error('Error deleting file:', error);
    uploadStatusEl.textContent = `Delete failed: ${error.message}`;
    uploadStatusEl.classList.add('error');
    setTimeout(() => {
      uploadStatusEl.textContent = '';
      uploadStatusEl.classList.remove('error');
    }, 3000);
  }
}

// Event listeners
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

// Upload event listeners
toggleUploadFormBtn.addEventListener('click', () => {
  const isHidden = uploadForm.hasAttribute('hidden');
  toggleUploadForm(isHidden);
});

if (cancelUploadBtn) {
  cancelUploadBtn.addEventListener('click', () => {
    uploadForm.reset();
    toggleUploadForm(false);
  });
}

uploadForm.addEventListener('submit', handleFileUpload);

// Drag and drop functionality
uploadZone.addEventListener('click', () => {
  fileInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      uploadStatusEl.textContent = 'Only .xlsx files are allowed';
      uploadStatusEl.classList.add('error');
      return;
    }
    
    // Simulate file selection
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    
    // Trigger file select handler
    handleFileSelect({ target: fileInput });
  }
});

// Initialize auth check
checkAuth().catch((error) => {
  console.error('Auth initialization error:', error);
  // Show app even on auth error
  showApp();
});