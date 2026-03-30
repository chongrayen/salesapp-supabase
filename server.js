const express = require('express');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MANUAL_STORE = path.join(DATA_DIR, 'manual-entries.json');
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

function loadManualEntries() {
  ensureDataDir();
  if (!fs.existsSync(MANUAL_STORE)) {
    fs.writeFileSync(MANUAL_STORE, JSON.stringify([]));
    return [];
  }

  try {
    const content = fs.readFileSync(MANUAL_STORE, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Unable to read manual entries. Resetting file.', error);
    fs.writeFileSync(MANUAL_STORE, JSON.stringify([]));
    return [];
  }
}

function saveManualEntries(entries) {
  ensureDataDir();
  fs.writeFileSync(MANUAL_STORE, JSON.stringify(entries, null, 2));
}

function deriveSupplierFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  if (base.includes('-')) {
    return base.split('-').pop().trim();
  }
  return base;
}

async function listSupabaseExcelFiles() {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list('', {
    limit: 1000,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' }
  });

  if (error) {
    throw error;
  }

  return (data || []).filter((item) => item.name && item.name.toLowerCase().endsWith('.xlsx'));
}

async function downloadSupabaseFileToBuffer(fileName) {
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(fileName);
  if (error) {
    throw error;
  }
  const arrayBuffer = await data.arrayBuffer();
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
let manualEntries = sortEntries(loadManualEntries());
let cachedEntries = combineEntries(excelEntries, manualEntries);

async function initializeWorkbooks() {
  try {
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
      res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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
