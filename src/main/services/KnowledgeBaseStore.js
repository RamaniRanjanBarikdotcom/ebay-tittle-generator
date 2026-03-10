import DatabaseManager from '../database/sqlite.js';
import RuleEngine from '../title-engine/RuleEngine.js';

export function normalizeKnowledgeTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function splitList(value) {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/[|,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function splitCodeList(value) {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/[|,;/]+/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function getRawField(raw, candidates = []) {
  if (!raw || typeof raw !== 'object') return '';
  const entries = Object.entries(raw);
  for (const key of candidates) {
    const hit = entries.find(([k]) => String(k).trim().toLowerCase() === String(key).trim().toLowerCase());
    if (hit && hit[1] !== null && hit[1] !== undefined && String(hit[1]).trim() !== '') {
      return String(hit[1]).trim();
    }
  }
  return '';
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function toCleanList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((x) => String(x || '').trim()).filter(Boolean))];
  }
  return [...new Set(splitCodeList(value).map((x) => String(x || '').trim()).filter(Boolean))];
}

function mergeSeriesWithPrinterModels(series, printerModels) {
  const baseSeries = String(series || '').trim();
  const models = splitList(Array.isArray(printerModels) ? printerModels.join(',') : printerModels);
  if (!baseSeries) return [...new Set(models)];

  const merged = [...models];
  if (!models.length) merged.push(baseSeries);
  for (const model of models) {
    const m = String(model || '').trim();
    if (!m) continue;
    if (m.toLowerCase().startsWith(baseSeries.toLowerCase())) continue;
    merged.push(`${baseSeries} ${m}`);
  }
  return [...new Set(merged.map((x) => String(x).trim()).filter(Boolean))];
}

function toElements(row) {
  if (!row) return null;
  const printerModels = mergeSeriesWithPrinterModels(
    row.series || '',
    safeJsonParse(row.printer_models, [])
  );
  return {
    itemNumber: row.item_number || '',
    sku: row.sku || '',
    category: row.category || 'Toner',
    cartridgeModels: safeJsonParse(row.cartridge_models, []),
    brand: '',
    productBrand: '',
    printerBrand: row.printer_brand || '',
    series: row.series || '',
    printerModels,
    bracketCodes: [],
    kompatibel: 'Kompatibel Für',
    setOf: row.set_of || '',
    qty: row.qty || '',
    color: row.color || '',
    extra: row.extra || '',
    knowledgeBaseMatches: ['db_knowledge_base'],
    verification: {
      status: 'ok',
      confidence: Number(row.confidence || 95),
      issues: []
    }
  };
}

function normalizeToken(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function overlapScore(a = [], b = []) {
  const left = new Set((a || []).map((x) => normalizeToken(x)).filter(Boolean));
  const right = new Set((b || []).map((x) => normalizeToken(x)).filter(Boolean));
  if (!left.size || !right.size) return 0;
  let inter = 0;
  left.forEach((x) => {
    if (right.has(x)) inter += 1;
  });
  return inter / Math.max(left.size, right.size);
}

export default class KnowledgeBaseStore {
  static ensureSchema() {
    const db = DatabaseManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS title_knowledge_base (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_title TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        item_number TEXT,
        sku TEXT,
        category TEXT,
        cartridge_models TEXT,
        printer_brand TEXT,
        series TEXT,
        printer_models TEXT,
        set_of TEXT,
        qty TEXT,
        color TEXT,
        extra TEXT,
        confidence INTEGER DEFAULT 95,
        source TEXT DEFAULT 'manual',
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const cols = db.prepare('PRAGMA table_info(title_knowledge_base)').all().map((c) => c.name);
    if (!cols.includes('item_number')) {
      db.exec('ALTER TABLE title_knowledge_base ADD COLUMN item_number TEXT');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_title ON title_knowledge_base(normalized_title)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_source ON title_knowledge_base(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_sku ON title_knowledge_base(sku)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_item ON title_knowledge_base(item_number)');
  }

  static getSeedElementsByIdentifiers({ itemNumber = '', sku = '', title = '' } = {}) {
    const db = DatabaseManager.getDatabase();
    const hasProducts = db
      .prepare("SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name='products'")
      .get();
    if (!hasProducts) return null;

    const trimmedItem = String(itemNumber || '').trim();
    const trimmedSku = String(sku || '').trim();
    const trimmedTitle = String(title || '').trim();

    let row = null;
    if (trimmedItem && trimmedSku) {
      row = db.prepare(
        `SELECT raw_query_data, item_number, sku, original_title
         FROM products
         WHERE item_number = ? AND sku = ?
         ORDER BY id DESC LIMIT 1`
      ).get(trimmedItem, trimmedSku);
    }
    if (!row && trimmedSku) {
      row = db.prepare(
        `SELECT raw_query_data, item_number, sku, original_title
         FROM products
         WHERE sku = ?
         ORDER BY id DESC LIMIT 1`
      ).get(trimmedSku);
    }
    if (!row && trimmedTitle) {
      row = db.prepare(
        `SELECT raw_query_data, item_number, sku, original_title
         FROM products
         WHERE original_title = ?
         ORDER BY id DESC LIMIT 1`
      ).get(trimmedTitle);
    }
    if (!row) return null;

    let raw = {};
    try {
      const parsed = JSON.parse(String(row.raw_query_data || '{}'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = {};
    }

    return {
      itemNumber: row.item_number || '',
      sku: row.sku || '',
      title: row.original_title || '',
      category: getRawField(raw, ['types', 'type', 'category']),
      cartridgeModels: toCleanList(
        getRawField(raw, ['cartridge model', 'cartridge_model', 'cartridge mode'])
      ),
      printerBrand: getRawField(raw, ['printer brand', 'printer_brand']),
      series: getRawField(raw, ['series']),
      printerModels: toCleanList(getRawField(raw, ['printer model', 'printer_model'])),
      setOf: getRawField(raw, ['set of', 'set_of']),
      qty: getRawField(raw, ['qty', 'quantity']),
      color: getRawField(raw, ['farbe', 'color'])
    };
  }

  static buildEntryFromSpreadsheetRow({
    itemNumber = '',
    sku = '',
    title = '',
    fields = {},
    source = 'kb_excel'
  } = {}) {
    const normalizedTitle = normalizeKnowledgeTitle(title);
    if (!normalizedTitle) return null;

    const seed = this.getSeedElementsByIdentifiers({ itemNumber, sku, title }) || {};
    const extracted = RuleEngine.extractComponents(title, sku);

    const pick = (...vals) => {
      for (const v of vals) {
        if (v === null || v === undefined) continue;
        const s = String(v).trim();
        if (s) return s;
      }
      return '';
    };
    const pickList = (...vals) => {
      for (const v of vals) {
        const list = toCleanList(v);
        if (list.length) return list;
      }
      return [];
    };

    const category = pick(fields.category, seed.category, extracted.category, 'Toner');
    const printerBrand = pick(fields.printerBrand, seed.printerBrand, extracted.printerBrand);
    const series = pick(fields.series, seed.series, extracted.series);
    const cartridgeModels = pickList(fields.cartridgeModels, seed.cartridgeModels, extracted.cartridgeModels);
    const printerModels = mergeSeriesWithPrinterModels(
      series,
      pickList(fields.printerModels, seed.printerModels, extracted.printerModels)
    );
    const setOf = pick(fields.setOf, seed.setOf, extracted.setOf);
    const qty = pick(fields.qty, seed.qty, extracted.qty);
    const color = pick(fields.color, seed.color, extracted.color);

    // Require at least one meaningful field to avoid completely empty entries
    if (
      !cartridgeModels.length &&
      !printerBrand &&
      !printerModels.length &&
      !category &&
      !color &&
      !setOf
    ) {
      return null;
    }

    return {
      normalizedTitle,
      title: String(title || '').trim(),
      itemNumber: pick(itemNumber, seed.itemNumber),
      sku: pick(sku, seed.sku),
      category,
      cartridgeModels,
      printerBrand,
      series,
      printerModels,
      setOf,
      qty,
      color,
      extra: '',
      confidence: 99,
      source
    };
  }

  static buildEntryFromRaw(rawQueryData, title = '', sku = '', source = 'manual') {
    let raw = null;
    try {
      raw = JSON.parse(String(rawQueryData || ''));
    } catch {
      return null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

    const cartridgeModels = splitList(getRawField(raw, ['cartridge model', 'cartridge_model']));
    const category = getRawField(raw, ['types', 'type', 'category']);
    const printerBrand = getRawField(raw, ['printer brand', 'printer_brand']);
    const series = getRawField(raw, ['series']);
    const printerModels = mergeSeriesWithPrinterModels(
      series,
      splitList(getRawField(raw, ['printer model', 'printer_model']))
    );
    const setOf = getRawField(raw, ['set of', 'set_of']);
    const qty = getRawField(raw, ['qty', 'quantity']);
    const color = getRawField(raw, ['farbe', 'color']);

    if (!cartridgeModels.length && !category && !printerBrand && !printerModels.length && !setOf && !color) {
      return null;
    }

    const normalizedTitle = normalizeKnowledgeTitle(title);
    if (!normalizedTitle) return null;

    return {
      normalizedTitle,
      title: String(title || '').trim(),
      sku: String(sku || '').trim(),
      category: category || 'Toner',
      cartridgeModels,
      printerBrand,
      series,
      printerModels,
      setOf,
      qty,
      color,
      extra: '',
      confidence: 98,
      source
    };
  }

  static upsertEntry(entry) {
    if (!entry?.normalizedTitle) return false;
    this.ensureSchema();
    const db = DatabaseManager.getDatabase();
    db.prepare(
      `INSERT INTO title_knowledge_base (
         normalized_title, title, item_number, sku, category, cartridge_models, printer_brand, series,
         printer_models, set_of, qty, color, extra, confidence, source, usage_count, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
       ON CONFLICT(normalized_title) DO UPDATE SET
         title = excluded.title,
         item_number = excluded.item_number,
         sku = excluded.sku,
         category = excluded.category,
         cartridge_models = excluded.cartridge_models,
         printer_brand = excluded.printer_brand,
         series = excluded.series,
         printer_models = excluded.printer_models,
         set_of = excluded.set_of,
         qty = excluded.qty,
         color = excluded.color,
         extra = excluded.extra,
         confidence = excluded.confidence,
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`
    ).run(
      entry.normalizedTitle,
      entry.title || '',
      entry.itemNumber || '',
      entry.sku || '',
      entry.category || 'Toner',
      JSON.stringify(entry.cartridgeModels || []),
      entry.printerBrand || '',
      entry.series || '',
      JSON.stringify(entry.printerModels || []),
      entry.setOf || '',
      entry.qty || '',
      entry.color || '',
      entry.extra || '',
      Number(entry.confidence || 95),
      entry.source || 'manual'
    );
    return true;
  }

  static upsertFromRawQueryData(rawQueryData, title = '', sku = '', source = 'manual') {
    const entry = this.buildEntryFromRaw(rawQueryData, title, sku, source);
    if (!entry) return false;
    return this.upsertEntry(entry);
  }

  static getByTitles(titles = []) {
    this.ensureSchema();
    const normalized = [...new Set((titles || []).map((t) => normalizeKnowledgeTitle(t)).filter(Boolean))];
    if (!normalized.length) return new Map();
    const db = DatabaseManager.getDatabase();
    const placeholders = normalized.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT normalized_title, title, item_number, sku, category, cartridge_models, printer_brand, series,
                printer_models, set_of, qty, color, extra, confidence
         FROM title_knowledge_base
         WHERE normalized_title IN (${placeholders})`
      )
      .all(...normalized);

    const map = new Map();
    rows.forEach((row) => {
      map.set(row.normalized_title, toElements(row));
    });
    return map;
  }

  static getAllEntries() {
    this.ensureSchema();
    const db = DatabaseManager.getDatabase();
    const rows = db.prepare(
      `SELECT normalized_title, title, item_number, sku, category, cartridge_models, printer_brand, series,
              printer_models, set_of, qty, color, extra, confidence
       FROM title_knowledge_base
       ORDER BY updated_at DESC, id DESC`
    ).all();
    return rows.map((row) => toElements(row)).filter(Boolean);
  }

  static rectifyElementsByKnowledgeBase(title, extracted, entries = null) {
    const titleNorm = normalizeKnowledgeTitle(title);
    const source = Array.isArray(entries) ? entries : this.getAllEntries();
    if (!source.length) return { elements: extracted, corrected: false, reason: 'kb_empty', score: 0 };

    let best = null;
    let bestScore = 0;
    let bestMeta = null;
    for (const entry of source) {
      let score = 0;
      const entryTitleNorm = normalizeKnowledgeTitle(entry?.title || '');
      const exactTitleMatch = Boolean(entryTitleNorm && entryTitleNorm === titleNorm);
      if (exactTitleMatch) score += 100;

      const cartOverlap = overlapScore(extracted?.cartridgeModels || [], entry?.cartridgeModels || []);
      score += Math.round(cartOverlap * 45);

      if (
        extracted?.printerBrand &&
        entry?.printerBrand &&
        String(extracted.printerBrand).toLowerCase() === String(entry.printerBrand).toLowerCase()
      ) {
        score += 20;
      }
      const modelOverlap = overlapScore(extracted?.printerModels || [], entry?.printerModels || []);
      score += Math.round(modelOverlap * 30);

      // Prevent wrong KB row takeover when cartridge+brand are same but printer models differ.
      const hasExtractedModels = (extracted?.printerModels || []).length > 0;
      const hasEntryModels = (entry?.printerModels || []).length > 0;
      if (!exactTitleMatch && hasExtractedModels && hasEntryModels && modelOverlap === 0) {
        continue;
      }

      if (extracted?.color && entry?.color && String(extracted.color).toLowerCase() === String(entry.color).toLowerCase()) {
        score += 5;
      }

      if (score > bestScore) {
        bestScore = score;
        best = entry;
        bestMeta = { exactTitleMatch, modelOverlap };
      }
    }

    if (!best || bestScore < 60) {
      return { elements: extracted, corrected: false, reason: 'no_strong_match', score: bestScore };
    }

    const allowModelOverride = Boolean(
      bestMeta?.exactTitleMatch || (bestMeta?.modelOverlap || 0) > 0
    );

    const corrected = {
      ...extracted,
      category: best.category || extracted.category,
      cartridgeModels: (best.cartridgeModels || []).length ? best.cartridgeModels : (extracted.cartridgeModels || []),
      printerBrand: best.printerBrand || extracted.printerBrand,
      series: best.series || extracted.series,
      printerModels: allowModelOverride && (best.printerModels || []).length
        ? best.printerModels
        : (extracted.printerModels || []),
      setOf: best.setOf || extracted.setOf,
      qty: best.qty || extracted.qty,
      color: best.color || extracted.color,
      verification: {
        status: 'ok',
        confidence: Math.min(100, 85 + Math.round(Math.min(15, bestScore / 5))),
        issues: [],
        correctedByKnowledgeBase: true
      },
      knowledgeBaseMatches: ['db_rectification']
    };
    return { elements: corrected, corrected: true, reason: 'kb_rectified', score: bestScore };
  }
}
