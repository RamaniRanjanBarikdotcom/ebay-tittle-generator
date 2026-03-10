import ExcelJS from 'exceljs';
import Product from '../database/models/Product.js';
import DatabaseManager from '../database/sqlite.js';
import { calculatePriceAdjustment } from '../pricing/PriceAdjuster.js';
import { fixMojibakeText } from '../utils/textEncoding.js';

const HEADER_ALIASES = {
  item_number: [
    'item number',
    'item no',
    'item #',
    'itemnumber',
    'ebay item number',
    'angebotsnummer'
  ],
  sku: [
    'custom label (sku)',
    'custom label sku',
    'custom label',
    'sku',
    'artiklenummer (sku)',
    'artikelnummer (sku)',
    'artikelnummer',
    'artiklenummer'
  ],
  original_title: ['title', 'original title', 'angebotstitel', 'artiklename'],
  ebay_category_name: ['ebay category 1 name', 'ebay category name', 'category'],
  quantity: ['available quantity', 'quantity', 'qty'],
  current_price: ['current price', 'current_price', 'price', 'preis'],
  start_price: ['start price', 'start_price', 'startprice', 'startpreis', 'angebotspreis'],
  auction_buy_it_now_price: ['auction buy it now price', 'buy it now price', 'buy_it_now_price'],
  price: [
    'current price',
    'current_price',
    'price',
    'preis',
    'start price',
    'start_price',
    'startprice',
    'startpreis',
    'angebotspreis'
  ],
  sold_count: [
    'sold',
    'sold count',
    'sold quantity',
    'sold_quantity',
    'quantity sold',
    'quantity_sold',
    'sold qty',
    'sold_qty',
    'verkauft',
    'verkaufte menge'
  ]
};

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function mapHeaders(headerRow) {
  const map = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(header)) {
        map[key] = colNumber;
      }
    }
  });
  return map;
}

function collectRawHeaders(headerRow) {
  const seen = new Map();
  const headers = [];
  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.value || '').trim();
    if (!raw) return;
    const count = (seen.get(raw) || 0) + 1;
    seen.set(raw, count);
    const key = count === 1 ? raw : `${raw}_${count}`;
    headers.push({ colNumber, key });
  });
  return headers;
}

function getCell(row, colIndex) {
  if (!colIndex) return null;
  const cell = row.getCell(colIndex);
  if (cell == null) return null;
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (value.text) return value.text;
    if (value.result !== undefined && value.result !== null) return value.result;
    if (value.richText && Array.isArray(value.richText)) {
      return value.richText.map((x) => x.text || '').join('');
    }
    if (value.hyperlink && value.text) return value.text;
  }
  return value;
}

// Keywords that identify valid printer consumable products.
// Any title matching at least one of these is allowed through.
const PRINTER_CONSUMABLE_KEYWORDS = [
  // German
  'tintenpatrone',
  'druckerpatrone',
  'toner',
  'tonerkartusche',
  'trommel',
  'trommeleinheit',
  'druckerpatrone',
  'patrone',
  'kartusche',
  'druckkartusche',
  'kompatibel',   // "Kompatibel für HP ..." is always a printer consumable context
  // English
  'ink cartridge',
  'toner cartridge',
  'drum unit',
  'drum cartridge',
  'inkjet',
  'laser cartridge'
];

const PRINTER_CONSUMABLE_RE = new RegExp(
  PRINTER_CONSUMABLE_KEYWORDS.map((k) => k.replace(/\s+/g, '\\s+')).join('|'),
  'i'
);

function isPrinterConsumable(title) {
  return PRINTER_CONSUMABLE_RE.test(title);
}

function isZeroSoldCount(value) {
  if (value === 0 || value === '0') return true;
  const normalized = String(value ?? '').trim().replace(/[^\d.,\-+]/g, '');
  if (!normalized) return false;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) && parsed === 0;
}

function parseLooseNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let text = String(value).trim();
  if (!text) return NaN;

  text = text.replace(/[^\d.,\-+]/g, '');
  if (!text) return NaN;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = text.split(',');
    if (parts.length === 2 && parts[1].length <= 3) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function pickPriceValue(row, headerMap) {
  const candidates = [
    getCell(row, headerMap.current_price),
    getCell(row, headerMap.price),
    getCell(row, headerMap.start_price),
    getCell(row, headerMap.auction_buy_it_now_price)
  ];
  for (const raw of candidates) {
    if (raw === null || raw === undefined) continue;
    if (String(raw).trim() === '') continue;
    if (!Number.isNaN(parseLooseNumber(raw))) return raw;
  }
  return null;
}

export default class ExcelImporter {
  static async importFile(filePath, sessionId) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error('No worksheet found in Excel file');
    }

    const headerRow = sheet.getRow(1);
    const headerMap = mapHeaders(headerRow);
    const rawHeaders = collectRawHeaders(headerRow);

    if (!headerMap.item_number || !headerMap.sku || !headerMap.original_title) {
      throw new Error('Missing required headers: item number, sku, title');
    }

    const products = [];
    const errors = [];
    let skippedSoldNotZero = 0;
    let skippedNonPrinter = 0;
    const db = DatabaseManager.getDatabase();
    const getPreviousZeroSoldAdjustment = db.prepare(
      `SELECT price_adjustment
       FROM products
       WHERE item_number = ?
         AND sku = ?
         AND (
           price_adjustment LIKE 'decrease-0-sold%'
           OR price_adjustment LIKE 'increase-0-sold%'
         )
         AND price_adjustment IS NOT NULL
       ORDER BY id DESC
       LIMIT 1`
    );

    for (let i = 2; i <= sheet.rowCount; i += 1) {
      const row = sheet.getRow(i);
      const item_number = String(getCell(row, headerMap.item_number) || '').trim();
      const sku = String(getCell(row, headerMap.sku) || '').trim();
      const original_title = fixMojibakeText(getCell(row, headerMap.original_title) || '').trim();

      if (!item_number || !sku || !original_title) {
        if (item_number || sku || original_title) {
          errors.push({ row: i, error: 'Missing required fields' });
        }
        continue;
      }

      // Skip non-printer-consumable products (not toner / trommel / tintenpatrone etc.)
      if (!isPrinterConsumable(original_title)) {
        skippedNonPrinter += 1;
        continue;
      }

      const ebay_category_name = getCell(row, headerMap.ebay_category_name) || null;
      const quantity = Number(getCell(row, headerMap.quantity) || 0) || null;
      const previousAdjustment = getPreviousZeroSoldAdjustment.get(item_number, sku)?.price_adjustment || '';
      const priceValue = pickPriceValue(row, headerMap);
      const pricing = calculatePriceAdjustment(
        priceValue,
        getCell(row, headerMap.sold_count),
        { previousAdjustment }
      );
      if (!isZeroSoldCount(pricing.soldCount)) {
        skippedSoldNotZero += 1;
        continue;
      }
      const rawRow = {};
      rawHeaders.forEach(({ colNumber, key }) => {
        const value = getCell(row, colNumber);
        rawRow[key] = value ?? null;
      });
      let rawQueryData = null;
      try {
        rawQueryData = JSON.stringify(rawRow);
      } catch {
        rawQueryData = null;
      }

      products.push({
        item_number,
        sku,
        original_title,
        ebay_category_name,
        quantity,
        price: pricing.price,
        sold_count: pricing.soldCount,
        suggested_price: pricing.suggestedPrice,
        price_adjustment: pricing.adjustment,
        price_update_status: pricing.updateStatus,
        raw_query_data: rawQueryData,
        source: 'excel',
        session_id: sessionId || null
      });
    }

    const result = Product.createManyIgnore(products);
    if (!result.success) {
      throw new Error(result.error || 'Import failed');
    }
    return {
      total: sheet.rowCount > 1 ? sheet.rowCount - 1 : 0,
      inserted: result.data?.inserted || 0,
      skipped: (result.data?.skipped || 0) + skippedSoldNotZero + skippedNonPrinter,
      skippedNonPrinter,
      errors
    };
  }
}
