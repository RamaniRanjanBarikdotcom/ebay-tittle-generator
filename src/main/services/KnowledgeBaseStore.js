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

// Like splitCodeList but does NOT split on '/' — used for printer models where
// '/' is part of the model variant suffix (e.g. "SL-M 2825 DW/SEE"), not a separator.
function splitModelList(value) {
  if (value === null || value === undefined) return [];
  return String(value)
    .split(/[|,;]+/g)
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

// Like toCleanList but uses splitModelList — preserves '/' within printer model names.
function toCleanModelList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((x) => String(x || '').trim()).filter(Boolean))];
  }
  return [...new Set(splitModelList(value).map((x) => String(x || '').trim()).filter(Boolean))];
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
    title: row.title || '',
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
  // Use min(left, right) so that partial matches aren't penalized when one side has extra items.
  // e.g. extracted=["0263B002"] vs KB=["FX-10","0263B002"] → 1/min(1,2) = 1.0 instead of 0.5
  return inter / Math.min(left.size, right.size);
}

// Strip variant info after "|" from title — matches what KnowledgeBaseImporter does during import.
function normalizeKnowledgeTitleForMatch(value) {
  let s = String(value || '');
  if (s.includes('|')) s = s.split('|')[0];
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
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
    // Printer models must not split on '/' (e.g. "SL-M 2825 DW/SEE" is one model, not two)
    const pickModelList = (...vals) => {
      for (const v of vals) {
        const list = toCleanModelList(v);
        if (list.length) return list;
      }
      return [];
    };

    const category = pick(fields.category, seed.category, extracted.category);
    const printerBrand = pick(fields.printerBrand, seed.printerBrand, extracted.printerBrand);
    const series = pick(fields.series, seed.series, extracted.series);
    const cartridgeModels = pickList(fields.cartridgeModels, seed.cartridgeModels, extracted.cartridgeModels);
    const printerModels = mergeSeriesWithPrinterModels(
      series,
      pickModelList(fields.printerModels, seed.printerModels, extracted.printerModels)
    );
    const setOf = pick(fields.setOf, seed.setOf, extracted.setOf);
    const qty = pick(fields.qty, seed.qty, extracted.qty);
    const color = pick(fields.color, seed.color, extracted.color);

    // Require at least one printer-specific field — non-printer products are excluded
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

  static rectifyElementsByKnowledgeBase(title, extracted, entries = null, identifiers = null) {
    // Strip "|" variant suffix for matching — KB importer does the same during import.
    const titleNorm = normalizeKnowledgeTitleForMatch(title);
    const source = Array.isArray(entries) ? entries : this.getAllEntries();
    if (!source.length) return { elements: extracted, corrected: false, reason: 'kb_empty', score: 0 };

    // ── Identifier-based matching (SKU / item_number) ──────────────────
    // If the product has a SKU or item_number that matches a KB entry, use it directly.
    const prodSku = normalizeToken(identifiers?.sku || extracted?.sku || '');
    const prodItem = normalizeToken(identifiers?.itemNumber || extracted?.itemNumber || '');
    let identifierMatch = null;
    if (prodSku || prodItem) {
      for (const entry of source) {
        const entrySku = normalizeToken(entry?.sku || '');
        const entryItem = normalizeToken(entry?.itemNumber || '');
        if (prodSku && entrySku && prodSku === entrySku) { identifierMatch = entry; break; }
        if (prodItem && entryItem && prodItem === entryItem) { identifierMatch = entry; break; }
      }
    }

    // Series-only names: these are NOT real specific printer models — just series/family names.
    // Used to decide whether extraction actually found concrete models or just bare series names.
    const SERIES_ONLY_NAMES = new Set([
      'MFC', 'DCP', 'HL', 'FAX', 'MFC-L', 'DCP-L', 'HL-L',
      'DESKJET', 'ENVY', 'PIXMA', 'LASER', 'ECOSYS', 'LASER MFP',
      'OFFICEJET', 'OFFICEJET PRO', 'PHOTOSMART', 'PHOTOSMART PREMIUM',
      'LASERJET', 'LASERJET PRO', 'COLOR LASERJET', 'COLOR LASERJET PRO'
    ]);

    // Check if extracted models are all just series names (no real specific models with digits)
    const extractedOnlySeriesNames = (extracted?.printerModels || []).length > 0 &&
      (extracted?.printerModels || []).every((m) => {
        const upper = String(m || '').trim().toUpperCase();
        return !upper || SERIES_ONLY_NAMES.has(upper) || !/\d/.test(upper);
      });

    let best = null;
    let bestScore = 0;
    let bestMeta = null;

    // If we found an identifier match, use it as the best with a guaranteed high score.
    if (identifierMatch) {
      best = identifierMatch;
      bestScore = 200;
      bestMeta = { exactTitleMatch: false, modelOverlap: 0, identifierMatch: true };
    }

    // Still run scoring loop — a higher-scoring entry (e.g. exact title match) can override identifier match.
    for (const entry of source) {
      let score = 0;
      const entryTitleNorm = normalizeKnowledgeTitleForMatch(entry?.title || '');
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
      // BUT: don't skip if extracted only has series names (e.g. "OfficeJet Pro") — KB needs to fill real models.
      const hasExtractedModels = (extracted?.printerModels || []).length > 0;
      const hasEntryModels = (entry?.printerModels || []).length > 0;
      if (!exactTitleMatch && hasExtractedModels && !extractedOnlySeriesNames && hasEntryModels && modelOverlap === 0) {
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

    if (!best || bestScore < 40) {
      return { elements: extracted, corrected: false, reason: 'no_strong_match', score: bestScore };
    }

    const PADDING_MODEL_WORDS = new Set(['DRUCKERMODELL', 'DRUCKERPATRONE', 'DRUCKERMODELLE']);
    // Check if extraction found REAL specific models (with digits), not just series names
    const extractedRealModels = (extracted.printerModels || []).filter((m) => {
      const upper = String(m || '').trim().toUpperCase();
      return upper && !SERIES_ONLY_NAMES.has(upper) && /\d/.test(upper);
    });
    const extractedHasRealModels = extractedRealModels.length > 0;
    // Allow KB models when:
    // 1. Exact title match (KB entry matches this product's title exactly), OR
    // 2. There's model overlap between extracted and KB models, OR
    // 3. Extraction has NO real models (just series names) — KB fills the gap, OR
    // 4. Identifier match (SKU/item_number) — trusted direct match
    const allowModelOverride = Boolean(
      bestMeta?.exactTitleMatch ||
      bestMeta?.identifierMatch ||
      (bestMeta?.modelOverlap || 0) > 0 ||
      !extractedHasRealModels
    );

    // Build cartridge suffix set from both extracted and KB cartridge models
    const allCartridges = [
      ...(extracted.cartridgeModels || []),
      ...(best.cartridgeModels || [])
    ];
    const cartSuffixSet = new Set();
    for (const c of allCartridges) {
      const s = String(c || '').trim().toUpperCase();
      if (!s) continue;
      // Extract numeric+letter suffix: "LC-223Y" → "223Y", "LC-223BK" → "223BK"
      const m = s.match(/(\d{2,4}[A-Z]{0,3})$/);
      if (m) cartSuffixSet.add(m[1]);
      // Also add the stripped alphanumeric form
      cartSuffixSet.add(s.replace(/[^A-Z0-9]/g, ''));
    }

    // Filter out KB printer models that are padding words, have no digits, or are cartridge suffixes
    const cleanKbModels = (best.printerModels || []).filter((m) => {
      const upper = String(m || '').trim().toUpperCase();
      if (!upper) return false;
      if (PADDING_MODEL_WORDS.has(upper)) return false;
      if (!/\d/.test(upper)) return false;
      // Reject models that are just a cartridge suffix (e.g. "223Y DW", "223BK")
      const core = upper.replace(/\s+[A-Z]{1,3}$/, ''); // "223Y DW" → "223Y"
      if (cartSuffixSet.has(core)) return false;
      return true;
    });

    // Prefer extracted category; only fall back to KB if extracted is empty
    // Normalize "Tinte" → "Tintenpatrone"
    let correctedCategory = extracted.category || best.category || '';
    if (/^tinte$/i.test(correctedCategory)) correctedCategory = 'Tintenpatrone';

    const corrected = {
      ...extracted,
      category: correctedCategory,
      cartridgeModels: (best.cartridgeModels || []).length ? best.cartridgeModels : (extracted.cartridgeModels || []),
      printerBrand: best.printerBrand || extracted.printerBrand,
      series: best.series || extracted.series,
      printerModels: allowModelOverride && cleanKbModels.length
        ? cleanKbModels
        : (extracted.printerModels || []),
      setOf: best.setOf || extracted.setOf,
      qty: best.qty || extracted.qty,
      color: extracted.color || best.color || '',
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
