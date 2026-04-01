require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MANUAL_STORE_JSON = path.join(DATA_DIR, 'manual-entries.json');
const MANUAL_STORE_XLSX = path.join(DATA_DIR, 'manual-entries.xlsx');
const DEFAULT_WORKBOOK_DIR = path.join(__dirname, 'workbooks');
const WORKBOOKS_DIR = (() => {
  const customPath = process.env.WORKBOOKS_DIR;
  if (!customPath) {
    return DEFAULT_WORKBOOK_DIR;
  }
  if (path.isAbsolute(customPath)) {
    return customPath;
  }
  return path.join(__dirname, customPath);
})();
const ALLOWED_CORS_ORIGINS = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : null;
const SHARED_FOLDER_URL = process.env.SHARED_FOLDER_URL || '';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || '';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_BUCKET);
const USE_AUTH = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));

console.log('=== Configuration ===');
console.log('SUPABASE_URL:', SUPABASE_URL || 'NOT SET');
console.log('SUPABASE_BUCKET:', SUPABASE_BUCKET || 'NOT SET');
console.log('USE_SUPABASE:', USE_SUPABASE);
console.log('======================');

const PART_PATTERN = /^[A-Za-z0-9\-]+$/;
const REQUIRED_FIELDS = ['date', 'product', 'memo', 'quantity', 'rate', 'amount'];
const COLUMN_ALIASES = {
  date: ['transaction date', 'date'],
  transactionType: ['transaction type', 'type'],
  po: ['number', 'no', 'po', 'po number', 'reference'],
  product: ['product/service full name', 'product/service', 'product name', 'product', 'item', 'item description'],
  memo: ['memo/description', 'memo', 'description'],
  quantity: ['quantity', 'qty'],
  rate: ['rate', 'price', 'unit price', 'unit cost', 'cost'],
  amount: ['amount', 'total', 'total amount', 'line total'],
  balance: ['balance', 'running balance']
};
const DATE_CELL_PATTERN = /\d{2}\/\d{2}\/\d{4}/;

const supabase = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

function normalizeHeader(value = '') {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const NORMALIZED_COLUMN_ALIASES = Object.fromEntries(
  Object.entries(COLUMN_ALIASES).map(([key, variants]) => [
    key,
    variants.map((variant) => normalizeHeader(variant))
  ])
);

function formatDate(value) {
  if (!value) return '';
  const [day, month, year] = value.split('/');
  if (!day || !month || !year) return value;
  const isoString = `${year}-${month}-${day}`;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function cleanValue(value = '') {
  if (typeof value === 'string') return value.trim();
  return value;
}

function buildColumnMap(headerRow) {
  const normalizedRow = headerRow.map((cell) => normalizeHeader(cell));
  const map = {};

  Object.entries(NORMALIZED_COLUMN_ALIASES).forEach(([key, variants]) => {
    const columnIndex = normalizedRow.findIndex((cell) => variants.includes(cell));
    if (columnIndex !== -1) {
      map[key] = columnIndex;
    }
  });

  return map;
}

function locateHeaderRow(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const columnMap = buildColumnMap(rows[i]);
    const missing = REQUIRED_FIELDS.filter((field) => columnMap[field] === undefined);

    if (missing.length === 0) {
      return { headerIndex: i, columnMap };
    }
  }

  throw new Error('Unable to locate a header row with all required fields.');
}

function toCanonicalRow(cells, columnMap) {
  return Object.keys(COLUMN_ALIASES).reduce((acc, key) => {
    const idx = columnMap[key];
    acc[key] = idx !== undefined ? cells[idx] : '';
    return acc;
  }, {});
}

function extractPartNumber(row) {
  const memo = cleanValue(row.memo);
  const product = cleanValue(row.product);

  if (memo && PART_PATTERN.test(memo)) {
    return memo;
  }

  if (product && typeof product === 'string' && product.includes(':')) {
    const candidate = product.split(':').pop().trim();
    if (PART_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  if (product && PART_PATTERN.test(product)) {
    return product;
  }

  return '';
}

function buildRemark(row, partNo) {
  const memo = cleanValue(row.memo);
  const product = cleanValue(row.product);
  const transactionType = cleanValue(row.transactionType);

  if (memo && memo !== partNo) {
    return memo;
  }

  if (product && (!partNo || !product.includes(partNo))) {
    return product;
  }

  return transactionType;
}

function isAdjustmentRow(row) {
  const memoRaw = cleanValue(row.memo);
  const productRaw = cleanValue(row.product);
  const memo = typeof memoRaw === 'string' ? memoRaw.toLowerCase() : '';
  const hasProduct = typeof productRaw === 'string' ? productRaw.length > 0 : Boolean(productRaw);
  const rate = Number(row.rate) || 0;
  const amount = Number(row.amount) || 0;

  if (memo.includes('exchange gain or loss')) {
    return true;
  }

  const looksLikeTaxLine = !hasProduct && !memo && rate > 0 && rate <= 0.1 && amount < 0;
  return looksLikeTaxLine;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureWorkbookDir() {
  if (!fs.existsSync(WORKBOOKS_DIR)) {
    fs.mkdirSync(WORKBOOKS_DIR, { recursive: true });
  }
}

// Excel column headers for manual entries
const MANUAL_ENTRY_HEADERS = [
  'Transaction Date',
  'Transaction Type',
  'PO Number',
  'Product/Service Full Name',
  'Memo/Description',
  'Quantity',
  'Rate',
  'Amount',
  'Supplier',
  'Source'
];

function parseManualEntriesFromData(data) {
  // Skip header row and convert to entry objects
  const entries = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.length === 0) continue; // Skip completely empty rows
    
    // Check if at least some data exists (not just empty strings)
    const hasAnyData = row.some(cell => cell !== '' && cell !== null && cell !== undefined);
    if (!hasAnyData) continue;
    
    // Parse and validate date - use fallback if missing or invalid
    let dateRaw = row[0] || '';
    if (!dateRaw) {
      dateRaw = '01/01/2000'; // Default date for incomplete entries
    }
    
    // Parse product name with fallbacks
    let product = row[3] || '';
    if (!product) {
      product = row[4] || row[8] || 'Unknown Product';
    }
    
    // Parse quantity with fallback
    let qty = Number(row[5]);
    if (!qty || isNaN(qty) || qty <= 0) {
      qty = 0; // Will be marked as needing attention
    }
    
    // Parse price/rate with fallback
    let price = Number(row[6]);
    if (!price || isNaN(price) || price <= 0) {
      price = 0; // Will be marked as needing attention
    }
    
    // Parse total price with fallback
    let totalPrice = Number(row[7]);
    if (!totalPrice || isNaN(totalPrice)) {
      totalPrice = qty * price; // Calculate if missing
      if (!totalPrice || totalPrice === 0) {
        totalPrice = 0; // Still zero, needs attention
      }
    }
    
    const entry = {
      id: `manual-${i}-${Date.now()}`,
      dateRaw: dateRaw,
      date: formatDate(dateRaw),
      transactionType: (row[1] || 'MANUAL').toUpperCase(),
      po: row[2] || 'To be filled',
      product: product,
      memo: row[4] || 'To be filled',
      qty: qty,
      price: price,
      totalPrice: totalPrice,
      supplier: row[8] || 'Unknown Supplier',
      source: 'manual',
      needsReview: !dateRaw || dateRaw === '01/01/2000' || !product || product === 'Unknown Product' || qty === 0 || price === 0
    };
    
    // Always include the entry, even if incomplete
    entries.push(entry);
  }
  
  return entries;
}

function loadManualEntriesFromLocalFile() {
  ensureDataDir();
  
  // Try loading from Excel first, then fall back to JSON
  if (fs.existsSync(MANUAL_STORE_XLSX)) {
    try {
      const workbook = XLSX.readFile(MANUAL_STORE_XLSX);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      const entries = parseManualEntriesFromData(data);
      console.log(`Loaded ${entries.length} manual entries from local Excel`);
      return entries;
    } catch (error) {
      console.error('Error loading manual entries from local Excel:', error.message);
    }
  }
  
  // Fall back to JSON if Excel doesn't exist or failed to load
  if (fs.existsSync(MANUAL_STORE_JSON)) {
    try {
      const content = fs.readFileSync(MANUAL_STORE_JSON, 'utf-8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Unable to read manual entries JSON. Resetting.', error);
    }
  }
  
  return [];
}

async function loadManualEntriesFromSupabase() {
  if (!supabase) {
    console.log('Supabase client not available for loading manual entries');
    return null;
  }
  
  console.log(`Attempting to load manual-entries.xlsx from bucket: ${SUPABASE_BUCKET}`);
  
  try {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .download('manual-entries.xlsx');
    
    if (error) {
      // File might not exist yet
      if (error.message.includes('The resource was not found') || error.message.includes('not found')) {
        console.log('manual-entries.xlsx not found in Supabase bucket (this is normal for first run)');
        return null;
      }
      console.error('Error downloading manual entries from Supabase:', error.message);
      return null;
    }
    
    if (!data) {
      console.log('No data returned from Supabase download');
      return null;
    }
    
    console.log('Downloaded manual-entries.xlsx from Supabase, size:', data.size || 'unknown');
    
    try {
      const arrayBuffer = await data.arrayBuffer();
      console.log('ArrayBuffer size:', arrayBuffer.byteLength);
      
      const buffer = Buffer.from(arrayBuffer);
      console.log('Buffer created, length:', buffer.length);
      
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      console.log('Workbook sheets:', workbook.SheetNames);
      
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      console.log('Excel data rows (including header):', excelData.length);
      console.log('Header row:', excelData[0]);
      console.log('First data row:', excelData[1]);
      
      const entries = parseManualEntriesFromData(excelData);
      console.log(`Parsed ${entries.length} valid manual entries from Supabase`);
      
      if (entries.length > 0) {
        console.log('Sample entry:', JSON.stringify(entries[0], null, 2));
      }
      
      return entries;
    } catch (parseError) {
      console.error('Error parsing Excel file from Supabase:', parseError.message);
      console.error('Parse error stack:', parseError.stack);
      return null;
    }
  } catch (error) {
    console.error('Error loading manual entries from Supabase:', error.message);
    console.error('Load error stack:', error.stack);
    return null;
  }
}

async function loadManualEntries() {
  // If Supabase is configured, try loading from there first
  if (USE_SUPABASE) {
    const supabaseEntries = await loadManualEntriesFromSupabase();
    if (supabaseEntries && supabaseEntries.length > 0) {
      // Also save locally for faster subsequent loads
      saveManualEntriesToLocalFile(supabaseEntries);
      return supabaseEntries;
    }
  }
  
  // Fall back to local file
  return loadManualEntriesFromLocalFile();
}

function saveManualEntriesToLocalFile(entries) {
  ensureDataDir();
  
  // Convert entries to Excel format
  const rows = [MANUAL_ENTRY_HEADERS]; // Header row
  
  entries.forEach((entry, index) => {
    rows.push([
      entry.dateRaw || '',
      entry.transactionType || 'MANUAL',
      entry.po || '',
      entry.product || '',
      entry.remark || entry.memo || '',
      entry.qty || 0,
      entry.price || 0,
      entry.totalPrice || 0,
      entry.supplier || 'Manual entry',
      entry.source || 'manual'
    ]);
  });
  
  // Create workbook and write to file
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Manual Entries');
  XLSX.writeFile(workbook, MANUAL_STORE_XLSX);
  
  console.log(`Saved ${entries.length} manual entries to local Excel`);
  
  // Also save JSON backup for compatibility
  try {
    fs.writeFileSync(MANUAL_STORE_JSON, JSON.stringify(entries, null, 2));
  } catch (error) {
    console.error('Warning: Could not save JSON backup:', error.message);
  }
}

async function saveManualEntriesToSupabase(entries) {
  if (!supabase) {
    console.error('Cannot save to Supabase: not configured');
    return false;
  }
  
  try {
    // Convert entries to Excel format
    const rows = [MANUAL_ENTRY_HEADERS]; // Header row
    
    entries.forEach((entry, index) => {
      rows.push([
        entry.dateRaw || '',
        entry.transactionType || 'MANUAL',
        entry.po || '',
        entry.product || '',
        entry.remark || entry.memo || '',
        entry.qty || 0,
        entry.price || 0,
        entry.totalPrice || 0,
        entry.supplier || 'Manual entry',
        entry.source || 'manual'
      ]);
    });
    
    // Create workbook in memory
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Manual Entries');
    
    // Convert to buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    // Upload to Supabase storage
    const fileName = 'manual-entries.xlsx';
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(fileName, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true // Overwrite if exists
      });
    
    if (error) {
      console.error('Failed to upload manual entries to Supabase:', error.message);
      return false;
    }
    
    console.log(`Saved ${entries.length} manual entries to Supabase bucket`);
    return true;
  } catch (error) {
    console.error('Error saving to Supabase:', error.message);
    return false;
  }
}

function saveManualEntries(entries) {
  // Save to local file
  saveManualEntriesToLocalFile(entries);
  
  // Try to save to Supabase if configured
  if (USE_SUPABASE) {
    saveManualEntriesToSupabase(entries).catch(err => {
      console.error('Failed to save to Supabase:', err.message);
    });
  }
}

function deriveSupplierFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  if (base.includes('-')) {
    return base.split('-').pop().trim();
  }
  return base;
}

async function listSupabaseExcelFiles() {
  console.log(`Listing files in Supabase bucket: ${SUPABASE_BUCKET}`);
  
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list('', {
    limit: 1000,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' }
  });

  if (error) {
    console.error('Error listing files from Supabase:', error);
    throw error;
  }

  const excelFiles = (data || []).filter((item) => item.name && item.name.toLowerCase().endsWith('.xlsx'));
  console.log(`Found ${excelFiles.length} Excel files in bucket`);
  return excelFiles;
}

async function downloadSupabaseFileToBuffer(fileName) {
  console.log(`Downloading ${fileName} from Supabase bucket`);
  
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(fileName);
  if (error) {
    console.error(`Failed to download ${fileName}:`, error);
    throw error;
  }
  const arrayBuffer = await data.arrayBuffer();
  console.log(`Downloaded ${fileName}, size: ${arrayBuffer.byteLength} bytes`);
  return Buffer.from(arrayBuffer);
}

function parseWorkbookFromBuffer(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const { headerIndex, columnMap } = locateHeaderRow(matrix);
  const dataRows = matrix.slice(headerIndex + 1);
  const fallbackSupplier = deriveSupplierFromFilename(filename);

  let activeSupplier = fallbackSupplier;
  const entries = [];

  dataRows.forEach((cells, dataIndex) => {
    const supplierCandidate = typeof cells[0] === 'string' ? cells[0].trim() : '';
    const hasOtherValues = cells.slice(1).some((value) => {
      if (value === '' || value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    });

    if (supplierCandidate && !hasOtherValues) {
      if (!supplierCandidate.toLowerCase().startsWith('total for')) {
        activeSupplier = supplierCandidate;
      }
      return;
    }

    const row = toCanonicalRow(cells, columnMap);
    const dateCell = cleanValue(row.date);

    if (!DATE_CELL_PATTERN.test(dateCell)) return;
    if (isAdjustmentRow(row)) return;

    const partNo = extractPartNumber(row);
    if (!partNo) return;

    const qty = Number(row.quantity) || 0;
    const price = Number(row.rate) || 0;
    const total = Number(row.amount) || 0;
    const po = cleanValue(row.po);
    const transactionType = cleanValue(row.transactionType).toUpperCase();
    const sourceIndex = headerIndex + 1 + dataIndex;

    entries.push({
      id: `${filename}-${po || 'ROW'}-${sourceIndex}`,
      dateRaw: dateCell,
      date: formatDate(dateCell),
      partNo,
      price,
      qty,
      totalPrice: total,
      po,
      remark: buildRemark(row, partNo),
      transactionType: transactionType || 'N/A',
      supplier: activeSupplier || fallbackSupplier,
      source: filename
    });
  });

  return entries;
}

function parseWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const { headerIndex, columnMap } = locateHeaderRow(matrix);
  const dataRows = matrix.slice(headerIndex + 1);
  const fallbackSupplier = deriveSupplierFromFilename(filePath);

  let activeSupplier = fallbackSupplier;
  const entries = [];

  dataRows.forEach((cells, dataIndex) => {
    const supplierCandidate = typeof cells[0] === 'string' ? cells[0].trim() : '';
    const hasOtherValues = cells.slice(1).some((value) => {
      if (value === '' || value === null) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    });

    if (supplierCandidate && !hasOtherValues) {
      if (!supplierCandidate.toLowerCase().startsWith('total for')) {
        activeSupplier = supplierCandidate;
      }
      return;
    }

    const row = toCanonicalRow(cells, columnMap);
    const dateCell = cleanValue(row.date);

    if (!DATE_CELL_PATTERN.test(dateCell)) return;
    if (isAdjustmentRow(row)) return;

    const partNo = extractPartNumber(row);
    if (!partNo) return;

    const qty = Number(row.quantity) || 0;
    const price = Number(row.rate) || 0;
    const total = Number(row.amount) || 0;
    const po = cleanValue(row.po);
    const transactionType = cleanValue(row.transactionType).toUpperCase();
    const sourceIndex = headerIndex + 1 + dataIndex;

    entries.push({
      id: `${path.basename(filePath)}-${po || 'ROW'}-${sourceIndex}`,
      dateRaw: dateCell,
      date: formatDate(dateCell),
      partNo,
      price,
      qty,
      totalPrice: total,
      po,
      remark: buildRemark(row, partNo),
      transactionType: transactionType || 'N/A',
      supplier: activeSupplier || fallbackSupplier,
      source: path.basename(filePath)
    });
  });

  return entries;
}

async function parseAllWorkbooks() {
  if (USE_SUPABASE) {
    try {
      const files = await listSupabaseExcelFiles();
      const allEntries = [];
      for (const file of files) {
        try {
          const buffer = await downloadSupabaseFileToBuffer(file.name);
          const entries = parseWorkbookFromBuffer(buffer, file.name);
          allEntries.push(...entries);
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error.message);
        }
      }
      return allEntries;
    } catch (error) {
      console.error('Supabase workbook fetch failed:', error);
      return [];
    }
  }

  ensureWorkbookDir();
  const files = fs
    .readdirSync(WORKBOOKS_DIR)
    .filter((file) => file.toLowerCase().endsWith('.xlsx'))
    .map((file) => path.join(WORKBOOKS_DIR, file));

  return files.flatMap((file) => {
    try {
      return parseWorkbook(file);
    } catch (error) {
      console.error(`Failed to parse ${file}:`, error.message);
      return [];
    }
  });
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    const aTime = new Date(a.dateRaw.split('/').reverse().join('-')).getTime();
    const bTime = new Date(b.dateRaw.split('/').reverse().join('-')).getTime();
    return bTime - aTime;
  });
}

function combineEntries(excelData, manualData) {
  return sortEntries([...excelData, ...manualData]);
}

function formatManualDate(dateInput) {
  if (!dateInput) {
    return '';
  }
  const [year, month, day] = dateInput.split('-');
  if (!year || !month || !day) {
    return '';
  }
  return `${day}/${month}/${year}`;
}

function buildManualEntry(payload) {
  const { date, supplier, partNo, qty, price, po, remark } = payload;
  const dateRaw = formatManualDate(date);
  if (!DATE_CELL_PATTERN.test(dateRaw)) {
    throw new Error('Please provide a valid date (YYYY-MM-DD).');
  }

  if (!partNo) {
    throw new Error('Part number is required.');
  }

  const quantity = Number(qty || 0);
  const unitPrice = Number(price || 0);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    throw new Error('Enter valid numbers for quantity and unit price.');
  }

  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dateRaw,
    date: formatDate(dateRaw),
    partNo: partNo.trim(),
    price: unitPrice,
    qty: quantity,
    totalPrice: Number((quantity * unitPrice).toFixed(2)),
    po: po ? po.trim() : '',
    remark: remark ? remark.trim() : 'Manual entry',
    transactionType: 'MANUAL',
    supplier: supplier ? supplier.trim() : 'Manual entry',
    source: 'manual'
  };
}

let excelEntries = [];
let manualEntries = [];
let cachedEntries = combineEntries(excelEntries, manualEntries);

async function initializeWorkbooks() {
  try {
    // Load manual entries (async for Supabase)
    manualEntries = sortEntries(await loadManualEntries());
    console.log(`Loaded ${manualEntries.length} manual entries`);
    
    // Load workbook entries
    excelEntries = await parseAllWorkbooks();
    refreshCache();
    console.log(`Loaded ${excelEntries.length} workbook entries`);
  } catch (error) {
    console.error('Failed to load workbooks:', error);
  }
}

function refreshCache() {
  cachedEntries = combineEntries(excelEntries, manualEntries);
}

app.use(express.json());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const originAllowed = !ALLOWED_CORS_ORIGINS || ALLOWED_CORS_ORIGINS.includes(origin);
    if (originAllowed) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(originAllowed ? 204 : 403);
    }
    if (!originAllowed) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
  } else if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', supabase: USE_SUPABASE, bucket: SUPABASE_BUCKET || null });
});

app.get('/api/parts', (req, res) => {
  const distinctParts = new Set(cachedEntries.map((item) => item.partNo)).size;
  res.json({
    total: cachedEntries.length,
    distinctParts,
    data: cachedEntries
  });
});

app.post('/api/parts', (req, res) => {
  try {
    const entry = buildManualEntry(req.body || {});
    manualEntries.push(entry);
    manualEntries = sortEntries(manualEntries);
    saveManualEntries(manualEntries);
    refreshCache();
    res.status(201).json({ saved: true, entry });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// File management APIs
app.get('/api/files', async (req, res) => {
  if (!supabase) {
    console.error('GET /api/files failed: Supabase not configured');
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    console.log(`Listing files in bucket: ${SUPABASE_BUCKET}`);
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list('', {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) {
      console.error('Supabase list error:', error);
      throw error;
    }

    const files = (data || []).filter(item => item.name && item.name.toLowerCase().endsWith('.xlsx'));
    console.log(`Found ${files.length} Excel files`);
    res.json({ files: files.map(f => ({ name: f.name, size: f.metadata?.size || f.size || 0, updated: f.updated_at })) });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', async (req, res) => {
  console.log('Upload request received:', { fileName: req.body?.fileName, contentType: req.body?.contentType });
  
  if (!supabase) {
    console.error('Upload failed: Supabase not configured. SUPABASE_URL:', SUPABASE_URL, 'SUPABASE_BUCKET:', SUPABASE_BUCKET);
    return res.status(500).json({ error: 'Supabase not configured. Please check SUPABASE_URL and SUPABASE_BUCKET environment variables.' });
  }

  const { fileName, content, contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } = req.body;

  if (!fileName || !content) {
    console.error('Upload failed: Missing fileName or content');
    return res.status(400).json({ error: 'fileName and content are required' });
  }

  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    console.error(`Upload failed: Invalid file type - ${fileName}`);
    return res.status(400).json({ error: 'Only .xlsx files are allowed' });
  }

  try {
    // Convert base64 to buffer
    let buffer;
    try {
      buffer = Buffer.from(content, 'base64');
    } catch (parseError) {
      console.error('Failed to parse base64 content:', parseError.message);
      return res.status(400).json({ error: 'Invalid base64 content' });
    }

    console.log(`Uploading ${fileName} (${buffer.length} bytes) to bucket: ${SUPABASE_BUCKET}`);

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(fileName, buffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error('Supabase upload error:', error.message, error);
      return res.status(500).json({ error: `Upload failed: ${error.message}` });
    }

    console.log(`✓ Successfully uploaded ${fileName} to Supabase bucket. Path: ${data?.path || fileName}`);
    res.json({ success: true, fileName, size: buffer.length, path: data?.path });
  } catch (error) {
    console.error('Unexpected error during upload:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/files/:fileName', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { fileName } = req.params;

  try {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove([fileName]);

    if (error) {
      throw error;
    }

    console.log(`Deleted ${fileName} from Supabase bucket`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reload', async (req, res) => {
  try {
    excelEntries = await parseAllWorkbooks();
    refreshCache();
    res.json({ refreshed: true, total: cachedEntries.length, sources: excelEntries.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
     const indexPath = path.join(__dirname, 'public', 'index.html');
     fs.readFile(indexPath, 'utf8', (err, html) => {
       if (err) {
         console.error('Failed to read index.html:', err);
         return res.status(500).send('Error loading page');
       }

       // Inject environment variables for frontend
       const sharedFolderInjection = `\n<script>window.__SHARED_FOLDER_URL__ = ${JSON.stringify(SHARED_FOLDER_URL)};</script>\n`;

       // Inject Supabase auth config for frontend
       const authConfigInjection = USE_AUTH
         ? `\n<script>window.__SUPABASE_URL__ = ${JSON.stringify(SUPABASE_URL)}; window.__SUPABASE_ANON_KEY__ = ${JSON.stringify(SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY)};</script>\n`
         : '';

       const modifiedHtml = html
         .replace('</body>', `${sharedFolderInjection}${authConfigInjection}</body>`);
       res.send(modifiedHtml);
     });
   });

initializeWorkbooks().catch(console.error);

app.listen(PORT, () => {
  console.log(`Sales app ready on http://localhost:${PORT}`);
});