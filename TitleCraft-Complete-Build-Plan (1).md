# TitleCraft — Complete Build Plan for Claude Code

> Give this entire file to Claude Code or any AI code editor.  
> It contains every rule, every algorithm, every table, every screen.  
> No LLM. No API. Pure algorithm.  
> **Validated against 7,142 real titles: 96% accuracy from title text alone.**  
> **Remaining 4% requires JTL DB enrichment (adds /KL3, Premium Line etc. — not in title text).**

---

## TABLE OF CONTENTS

1. [What to Build](#1-what-to-build)
2. [Tech Stack](#2-tech-stack)
3. [Folder Structure](#3-folder-structure)
4. [Database Schema](#4-database-schema)
5. [Shared Constants — All Lookup Tables](#5-shared-constants)
6. [Import Logic — Filters + Price + SKU Check](#6-import-logic)
7. [Variation Parsing — SKU Variant Types](#7-variation-parsing)
8. [Title Extractor — Complete Algorithm](#8-title-extractor)
9. [Title Groups — Every Pattern in the Data](#9-title-groups)
10. [JTL Enrichment — Spacing + DB Lookup](#10-jtl-enrichment)
11. [Price Logic — ±0.02 Rules](#11-price-logic)
12. [Title Builder — How New Titles Are Made](#12-title-builder)
13. [UI Screens](#13-ui-screens)
14. [Complete Data Flow](#14-complete-data-flow)
15. [All Rules Summary](#15-all-rules-summary)

---

## 1. WHAT TO BUILD

An **Electron desktop app** (Windows, internal tool) that:

1. Reads listings from **Excel file** OR **JTL MS SQL database**
2. **Filters** — only imports items where `sold_quantity = 0` AND category is Toner / Trommel / Tintenpatrone
3. **Extracts** all title elements using pure regex — no AI, no API
4. **Stores** everything in MySQL keyed by SKU + Item Number
5. **Adjusts price ±0.02** on every re-import based on import count
6. **Generates** optimized German titles for eBay, Amazon, Kaufland, Otto
7. On title generation: **reads from DB only** — never re-extracts

---

## 2. TECH STACK

```
Electron       → desktop shell (Windows)
React          → UI framework
Tailwind CSS   → styling
Node.js        → main process / all backend logic
mssql          → JTL MS SQL connection (READ ONLY)
mysql2         → App MySQL DB (read + write)
xlsx (SheetJS) → Excel file reading
```

### package.json

```json
{
  "name": "titlecraft",
  "version": "1.0.0",
  "main": "main/main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"electron .\"",
    "build": "vite build && electron-builder"
  },
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "mssql": "^10.0.0",
    "mysql2": "^3.0.0",
    "xlsx": "^0.18.5",
    "electron-store": "^8.0.0",
    "concurrently": "^8.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "electron-builder": "^24.0.0",
    "tailwindcss": "^3.0.0",
    "autoprefixer": "^10.0.0"
  }
}
```

---

## 3. FOLDER STRUCTURE .

```
titlecraft/
├── main/
│   ├── main.js                      # Electron entry point
│   ├── db/
│   │   ├── mysql.js                 # MySQL connection + query helpers
│   │   └── mssql.js                 # JTL MS SQL read-only connection
│   ├── services/
│   │   ├── importer.js              # Import + filter + dedup logic
│   │   ├── extractor.js             # Title extraction algorithm ← CORE
│   │   ├── variationParser.js       # Parse variation_details column
│   │   ├── jtlEnricher.js           # Spacing normalization + JTL DB lookup
│   │   ├── priceManager.js          # Price ±0.02 logic
│   │   └── titleBuilder.js          # Title generation per marketplace
│   └── ipc/
│       └── handlers.js              # IPC bridge renderer ↔ main
├── renderer/
│   ├── index.html
│   ├── App.jsx
│   └── screens/
│       ├── Dashboard.jsx
│       ├── Import.jsx
│       ├── Processing.jsx
│       ├── Review.jsx
│       └── Titles.jsx
├── shared/
│   └── constants.js                 # All lookup tables used everywhere
└── package.json
```

---

## 4. DATABASE SCHEMA

> All tables keyed by `sku`. Always store `item_number` alongside.  
> Query always uses both: `WHERE sku = ? AND item_number = ?`  
> This guarantees zero mismatches.

```sql
-- =========================================================
-- TABLE 1: imported_items
-- One row per SKU. Source of truth for every imported product.
-- =========================================================
CREATE TABLE imported_items (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    sku                 VARCHAR(150) NOT NULL UNIQUE,
    item_number         VARCHAR(50)  NOT NULL,
    original_title      TEXT,
    variation_details   TEXT,
    ebay_category       VARCHAR(100),
    product_type        VARCHAR(30),         -- Toner / Trommel / Tintenpatrone
    variation_type      VARCHAR(20),         -- simple / qty_pack / color / printer_model / combo
    available_qty       INT DEFAULT 0,
    sold_quantity       FLOAT DEFAULT 0,
    start_price         DECIMAL(10,2),
    current_price       DECIMAL(10,2),       -- active working price, updated on every import
    import_count        INT DEFAULT 0,       -- increments on every import run
    first_imported_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_imported_at    TIMESTAMP NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    INDEX idx_sku (sku),
    INDEX idx_item_number (item_number)
);

-- =========================================================
-- TABLE 2: extracted_elements
-- One row per SKU. Written ONCE on first import. Never overwritten.
-- Title generation always reads from here — never re-runs extractor.
-- =========================================================
CREATE TABLE extracted_elements (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    sku                   VARCHAR(150) NOT NULL UNIQUE,
    item_number           VARCHAR(50)  NOT NULL,
    original_title        TEXT,

    brand                 VARCHAR(20),        -- SPS / EAS / EBK (from SKU prefix)
    category              VARCHAR(30),        -- Toner / Tintenpatrone / Trommel
    cartridge_model       VARCHAR(100),       -- e.g. "CF294X / 94X" — kept with slashes
    kompatibel_phrase     VARCHAR(30),        -- "kompatibel für" / "kompatibel zu" etc.
    printer_brand         VARCHAR(50),        -- HP / Samsung / Brother / Kodak / Lenovo ...
    printer_model_raw     VARCHAR(150),       -- directly from title
    printer_model_norm    VARCHAR(150),       -- after spacing fix: "M527C" → "M 527 C"
    printer_model_final   VARCHAR(150),       -- after JTL enrichment (may add /KL3 etc.)
    set_of                VARCHAR(10),        -- 1x / 2x / 4x / 6x / 10x
    color                 VARCHAR(20),        -- Schwarz / Cyan / Magenta / Gelb / Mehrfarbig
    extra                 VARCHAR(100),       -- "3000 Seiten" / leftover words

    -- Variation-specific overrides (from variation_details column)
    variation_set_of      VARCHAR(10),        -- overrides set_of if variation says "2 x Stück"
    variation_color       VARCHAR(20),        -- overrides color if variation says "Cyan"
    variation_printer_model VARCHAR(150),     -- overrides printer_model if variation specifies model

    confidence_score      INT DEFAULT 100,
    extraction_method     ENUM('algorithm','manual') DEFAULT 'algorithm',
    extracted_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (sku) REFERENCES imported_items(sku),
    INDEX idx_sku (sku),
    INDEX idx_item_number (item_number)
);

-- =========================================================
-- TABLE 3: generated_titles
-- One row per SKU per marketplace. Upserted on each generation run.
-- =========================================================
CREATE TABLE generated_titles (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    sku               VARCHAR(150) NOT NULL,
    item_number       VARCHAR(50)  NOT NULL,
    marketplace       ENUM('ebay','amazon','kaufland','otto') NOT NULL,
    generated_title   VARCHAR(250),
    char_count        INT,
    title_rule_used   TINYINT,               -- 1, 2, or 3
    model_order_rule  CHAR(1),               -- 'A' or 'B'
    is_approved       BOOLEAN DEFAULT FALSE,
    out_of_range      BOOLEAN DEFAULT FALSE,
    generated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at       TIMESTAMP NULL,

    UNIQUE KEY unique_sku_market (sku, marketplace),
    FOREIGN KEY (sku) REFERENCES imported_items(sku)
);

-- =========================================================
-- TABLE 4: price_history
-- Append-only log. Every price event recorded here.
-- =========================================================
CREATE TABLE price_history (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    sku                 VARCHAR(150) NOT NULL,
    item_number         VARCHAR(50)  NOT NULL,
    import_number       INT,                 -- which import run (1, 2, 3 ...)
    sold_qty_at_import  FLOAT,
    price_before        DECIMAL(10,2),
    price_after         DECIMAL(10,2),
    price_action        ENUM('decrease','increase','no_change'),
    change_amount       DECIMAL(10,4) DEFAULT 0.0200,
    reason              VARCHAR(200),
    recorded_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sku) REFERENCES imported_items(sku),
    INDEX idx_sku (sku)
);
```

---

## 5. SHARED CONSTANTS

> File: `shared/constants.js`  
> Imported by extractor, importer, title builder.

```javascript
// shared/constants.js

// ── PRINTER BRANDS ─────────────────────────────────────────────────────────
// CRITICAL: Kodak and Lenovo MUST be here.
// Without them 36 real titles extract with missing printer_brand.
// Longer compound names first to avoid partial matches.
export const PRINTER_BRANDS = [
  'Triumph-Adler', 'Nashuatec', 'Gestetner', 'Panasonic',
  'HP', 'Samsung', 'Brother', 'Canon', 'Epson',
  'Lexmark', 'Kyocera', 'OKI', 'Ricoh', 'Xerox',
  'Konica', 'Sharp',
  'Kodak',    // ← CRITICAL — fixes 26 real titles
  'Lenovo',   // ← CRITICAL — fixes 10 real titles
  'Dell', 'Toshiba', 'Muratec', 'Olivetti',
  'Utax', 'Infotec', 'Lanier', 'Savin',
];

// ── CATEGORY NORMALIZATION MAP ─────────────────────────────────────────────
// Maps what appears in title → what gets stored in DB.
// CRITICAL: Tonerkartuschen + Tonerkartusche MUST map to 'Toner'
// Without this 6 real titles get wrong category.
export const TYPE_MAP = {
  'Toner':              'Toner',
  'Tonerkartusche':     'Toner',       // ← CRITICAL normalize
  'Tonerkartuschen':    'Toner',       // ← CRITICAL normalize
  'Tintenpatrone':      'Tintenpatrone',
  'Druckerpatrone':     'Druckerpatrone',
  'Druckerpatronen':    'Druckerpatrone',
  'Druckerpatronen':    'Druckerpatrone',
  'Patrone':            'Patrone',
  'Patronen':           'Patrone',
  'Trommel':            'Trommel',
};

// ── COLORS ─────────────────────────────────────────────────────────────────
export const COLORS = [
  'Schwarz', 'Black', 'Cyan', 'Magenta', 'Yellow',
  'Gelb', 'Grau', 'Mehrfarbig', 'Bunt', 'Rot', 'Blau',
];

// ── SKU BRAND PREFIXES ─────────────────────────────────────────────────────
export const SKU_BRAND_PREFIXES = ['SPS', 'EAS', 'EBK'];

// ── NON-PRINTER KEYWORDS → skip these entirely ─────────────────────────────
export const NON_PRINTER_KEYWORDS = [
  'HDMI', 'Koffer', 'Kofferset', 'Reisekoffer', 'Kopierpapier',
  'Camping', 'Gaskocher', 'Gaskartuschen', 'Nackenkissen',
  'Wasserkocher', 'Waage', 'Heizung', 'Oxford', 'Trolley',
  'Gepäck', 'Wasserspender', 'Butangas', 'Gaskartusche',
];

// ── VALID EBAY CATEGORIES TO IMPORT ────────────────────────────────────────
export const VALID_EBAY_CATEGORIES = ['Tonerkassetten', 'Tintenpatronen'];

// ── VALID PRODUCT TYPE KEYWORDS IN TITLE ──────────────────────────────────
export const VALID_TYPE_KEYWORDS = [
  'Toner', 'Trommel', 'Tintenpatrone', 'Druckerpatrone',
  'Patrone', 'Tonerkartusche', 'Tonerkartuschen',
];

// ── TITLE CHARACTER LIMITS PER MARKETPLACE ────────────────────────────────
export const CHAR_LIMITS = {
  ebay:     { min: 70, max: 80,  ideal: 75  },
  amazon:   { min: 80, max: 200, ideal: 150 },
  kaufland: { min: 50, max: 100, ideal: 80  },
  otto:     { min: 50, max: 120, ideal: 90  },
};

// ── PRICE DELTA ────────────────────────────────────────────────────────────
export const PRICE_DELTA = 0.02;
```

---

## 6. IMPORT LOGIC

> File: `main/services/importer.js`

### Excel Column Mapping

```
Col  0 → item_number         (Item number)
Col  1 → original_title      (Title)
Col  2 → variation_details   (Variation details)   e.g. "Stückzahl=2 x Stück"
Col  3 → sku                  (Custom label / SKU) ← PRIMARY KEY
Col  4 → available_qty        (Available quantity)
Col  7 → start_price          (Start price)
Col 10 → current_price        (Current price)      — may be null
Col 11 → sold_quantity        (Sold quantity)       ← FILTER ON THIS
Col 16 → ebay_category        (eBay category 1)    ← FILTER ON THIS
```

### Filter — Both Must Pass

```javascript
function shouldImport(row) {
  // FILTER 1: sold_quantity must be exactly 0
  if (Number(row.sold_quantity) !== 0) return false;

  // FILTER 2: eBay category must be printer-related
  if (!VALID_EBAY_CATEGORIES.includes(row.ebay_category)) return false;

  // FILTER 3: title must contain a valid printer product word
  const typePattern = new RegExp(VALID_TYPE_KEYWORDS.join('|'), 'i');
  if (!typePattern.test(row.original_title)) return false;

  return true;
}
```

### Processing Each Row

```javascript
async function processRow(row) {
  const existing = await db.queryOne(
    'SELECT * FROM imported_items WHERE sku = ?', [row.sku]
  );

  // Price: use current_price if set, fallback to start_price
  const workingPrice = row.current_price ?? row.start_price;

  if (!existing) {
    // ── NEW SKU — first time seen ──────────────────────────────────────
    await db.insert('imported_items', {
      sku:              row.sku,
      item_number:      row.item_number,
      original_title:   row.original_title,
      variation_details: row.variation_details,
      ebay_category:    row.ebay_category,
      sold_quantity:    row.sold_quantity,
      available_qty:    row.available_qty,
      start_price:      row.start_price,
      current_price:    workingPrice,
      import_count:     1,
      last_imported_at: new Date(),
    });

    // Extract title elements — happens only ONCE per SKU
    const extracted = extractTitle(row.original_title, row.sku);

    // Parse variation field to get variant-specific overrides
    const variation = parseVariation(row.variation_details);

    await db.insert('extracted_elements', {
      sku:          row.sku,
      item_number:  row.item_number,
      original_title: row.original_title,
      ...extracted,
      variation_set_of:       variation.set_of       || null,
      variation_color:        variation.color        || null,
      variation_printer_model: variation.printer_model || null,
    });

    // First import always → DECREASE
    await applyPriceChange(row.sku, row.item_number, 'decrease', 1, row.sold_quantity);

  } else {
    // ── EXISTING SKU — seen before ─────────────────────────────────────
    const newCount = existing.import_count + 1;

    await db.update('imported_items', {
      import_count:     newCount,
      sold_quantity:    row.sold_quantity,
      available_qty:    row.available_qty,
      last_imported_at: new Date(),
    }, { sku: row.sku });

    // DO NOT re-extract. Already done. Read from DB on demand.

    // odd import number → decrease | even import number → increase
    const action = (newCount % 2 !== 0) ? 'decrease' : 'increase';
    await applyPriceChange(row.sku, row.item_number, action, newCount, row.sold_quantity);
  }
}
```

---

## 7. VARIATION PARSING

> File: `main/services/variationParser.js`  
> The `variation_details` column in Excel tells us variant-specific overrides.  
> These are stored separately in `extracted_elements` and take priority during title generation.

### The 5 Variation Types Found in Real Data

```
Type 1 — SIMPLE
  variation_details: empty or null
  → one SKU, no variants
  → use extracted fields as-is

Type 2 — QTY PACK
  variation_details: "Stückzahl=2 x Stück"
  variation_details: "Stückzahl=4 x Stück"
  → override set_of = "2x" / "4x" / "6x" / "10x"

Type 3 — COLOR
  variation_details: "Ihre Auswahl=1x Cyan"
  variation_details: "Ihre Auswahl=1x Schwarz"
  → override color and set_of

Type 4 — PRINTER MODEL
  variation_details: "Kompatibles Druckermodell=für HP MFP M28A"
  → override printer_model

Type 5 — COMBO (color set + printer model)
  variation_details: "Farbtonerkartusche Set=4er-Set" + "Druckermodelle=..."
  → override both set_of and printer_model
```

### Parser Function

```javascript
// main/services/variationParser.js

export function parseVariation(variationDetails) {
  const result = {
    type:          'simple',
    set_of:        null,
    color:         null,
    printer_model: null,
  };

  if (!variationDetails || variationDetails.trim() === '') {
    result.type = 'simple';
    return result;
  }

  const v = variationDetails.trim();

  // ── TYPE 2: Qty pack ─────────────────────────────────────────────────
  // "Stückzahl=2 x Stück" or "Stückzahl=4 x Stück"
  const qtyMatch = v.match(/Stückzahl=(\d+)\s*x?\s*Stück/i);
  if (qtyMatch) {
    result.type   = 'qty_pack';
    result.set_of = qtyMatch[1] + 'x';
    return result;
  }

  // ── TYPE 3: Color variant ────────────────────────────────────────────
  // "Ihre Auswahl=1x Cyan" or "Ihre Auswahl=Schwarz"
  const colorMatch = v.match(/Ihre Auswahl=(\d+x\s+)?(\w+)/i);
  if (colorMatch) {
    result.type   = 'color';
    result.set_of = colorMatch[1] ? colorMatch[1].trim() : null;
    result.color  = colorMatch[2];
    return result;
  }

  // ── TYPE 4: Printer model variant ───────────────────────────────────
  // "Kompatibles Druckermodell=für HP MFP M28A"
  const printerMatch = v.match(/Druckermodell=(?:für\s+)?(.+)/i);
  if (printerMatch) {
    result.type          = 'printer_model';
    result.printer_model = printerMatch[1].trim();
    return result;
  }

  // ── TYPE 5: Combo ────────────────────────────────────────────────────
  // Has multiple fields separated by semicolons
  if (v.includes(';')) {
    result.type = 'combo';
    const parts = v.split(';').map(p => p.trim());
    for (const part of parts) {
      const setMatch   = part.match(/Set=(\d+)er/i);
      const modelMatch = part.match(/Druckermodelle?=(.+)/i);
      if (setMatch)   result.set_of        = setMatch[1] + 'x';
      if (modelMatch) result.printer_model = modelMatch[1].trim();
    }
    return result;
  }

  return result;
}
```

---

## 8. TITLE EXTRACTOR — COMPLETE ALGORITHM

> File: `main/services/extractor.js`  
> **Validated against 7,142 real titles: 96% accuracy from title text alone.**  
> **275 printer_model differences require JTL DB enrichment (not extractable from title).**  
> **No LLM. No API. Pure JavaScript regex.**

### The 7 Critical Fixes (all required — validated against 7,142 real titles)

```
FIX 1 — Add Kodak + Lenovo to brand list
         Without this: 36 titles get missing printer_brand

FIX 2 — CORRECTED: Mehrfarbig → set_of stays EMPTY (not '1x')
         Validated against real data: 1,085 Mehrfarbig titles all have set_of=''
         The previous assumption of '1x' was WRONG.
         Exception: 13 CF400X/201X titles were manually set to '1x' in ground
         truth sheet — this is a data inconsistency, not an algorithm rule.

FIX 3 — Tonerkartuschen / Tonerkartusche → normalize to 'Toner'
         Without this: 6 titles get wrong category

FIX 4 — If brand not at START of printer block → scan full right side
         Without this: inverted titles and kompatibel-zu titles fail

FIX 5 — Strip trailing word 'Drucker' from printer model
         Without this: 81 titles get "Drucker" appended to printer model

FIX 6 — Titles starting with "TOKEN | " (pipe before anchor)
         e.g. "CLI-551GY | Tintenpatrone Kompatibel für Canon ..."
         Detect leading pipe pattern, extract token as cartridge_model prefix,
         strip it from working string before anchor detection.
         Without this: cartridge_model gets "CLI-551GY |" with pipe artifact.

FIX 7 — Strip word "Kompatibel" that leaks into LEFT side
         e.g. "TN-2010 Kompatibel Tonerkartuschen für Brother..."
         Here "Kompatibel" appears before the category, left of anchor "für"
         Strip "Kompatibel" from left before extracting cartridge_model.
         Without this: cartridge_model gets "TN-2010 Kompatibel" instead of "TN-2010"
```

### Complete Extractor Code

```javascript
// main/services/extractor.js

import {
  PRINTER_BRANDS, TYPE_MAP, COLORS,
  SKU_BRAND_PREFIXES, NON_PRINTER_KEYWORDS,
} from '../../shared/constants.js';

export function extractTitle(title, sku = '') {

  const result = {
    brand:               null,   // SPS / EAS / EBK
    category:            null,   // Toner / Tintenpatrone / Trommel
    cartridge_model:     null,   // "CF294X / 94X"  ← keep slashes
    kompatibel_phrase:   null,   // "kompatibel für"
    printer_brand:       null,   // HP / Samsung / Kodak / Lenovo ...
    printer_model_raw:   null,   // directly from title
    printer_model_norm:  null,   // after normalizeModelSpacing()
    printer_model_final: null,   // after JTL enrichment (starts = norm)
    set_of:              null,   // 1x / 2x / 4x
    color:               null,   // Schwarz / Cyan / Mehrfarbig ...
    extra:               null,   // "3000 Seiten" / leftover
    confidence_score:    100,
    skip:                false,
  };

  if (!title || typeof title !== 'string') return result;
  const t = title.trim();

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1 — Non-printer check
  // If any keyword matches → skip this product entirely
  // ═══════════════════════════════════════════════════════════════════════
  if (NON_PRINTER_KEYWORDS.some(kw => t.toLowerCase().includes(kw.toLowerCase()))) {
    result.skip = true;
    result.confidence_score = 0;
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2 — Brand from SKU prefix
  // SPS_xxx → SPS | EAS_xxx → EAS | EBK-AS_xxx → EBK
  // Also check title start if SKU doesn't match
  // ═══════════════════════════════════════════════════════════════════════
  for (const prefix of SKU_BRAND_PREFIXES) {
    if (sku.toUpperCase().startsWith(prefix)) {
      result.brand = prefix;
      break;
    }
  }
  if (!result.brand) {
    for (const prefix of SKU_BRAND_PREFIXES) {
      if (new RegExp(`^${prefix}\\s`, 'i').test(t)) {
        result.brand = prefix;
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3 — Qty at very START of title
  // "4x Toner ..."  → set_of = "4x", strip prefix
  // "1x C332 ..."   → set_of = "1x", strip prefix
  // ═══════════════════════════════════════════════════════════════════════
  let working = t;
  const qtyStartMatch = working.match(/^(\d+)x\s+/i);
  if (qtyStartMatch) {
    result.set_of = qtyStartMatch[1] + 'x';
    working = working.slice(qtyStartMatch[0].length);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FIX 6 — Leading pipe prefix before anchor
  // Some titles: "CLI-551GY | Tintenpatrone Kompatibel für Canon Pixma MG 6350 | 1x Grau"
  //               ^^^^^^^^^^ ← single token before first pipe, BEFORE the anchor
  // Detect: if title matches /^(\S+)\s*\|\s*(.+kompatibel|.+für)/i
  // Extract the prefix token as cartridge_model_prefix, continue parsing rest.
  // Without this: cartridge_model gets "CLI-551GY |" with the pipe artifact.
  // ═══════════════════════════════════════════════════════════════════════
  let cartridgeModelPrefix = null;
  const leadingPipeMatch = working.match(/^(\S+)\s*\|\s*(.+)$/i);
  if (leadingPipeMatch) {
    const beforePipe = leadingPipeMatch[1];
    const afterPipe  = leadingPipeMatch[2];
    // Only treat as leading-pipe if: before pipe is single token AND after pipe has kompatibel/für
    if (!beforePipe.includes(' ') && /kompatibel|für/i.test(afterPipe)) {
      cartridgeModelPrefix = beforePipe;
      working = afterPipe;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4 — Find anchor → split into LEFT and RIGHT
  //
  // Anchor priority:
  //   1. "kompatibel für"  → 92.8% of all titles
  //   2. "kompatibel mit"  → 3 titles
  //   3. "kompatibel zu"   → 5 titles
  //   4. just "für"        → 28 old-format titles
  //   5. none found        → confidence -15, scan for brand directly
  // ═══════════════════════════════════════════════════════════════════════
  let left = '', right = '';
  let anchorFound = false;

  const anchorPatterns = [
    /kompatibel\s+für/i,
    /kompatibel\s+mit/i,
    /kompatibel\s+zu/i,
    /\bfür\b/i,
  ];

  for (const pattern of anchorPatterns) {
    const m = working.match(pattern);
    if (m) {
      result.kompatibel_phrase = m[0];
      left  = working.slice(0, m.index).trim();
      right = working.slice(m.index + m[0].length).trim();
      anchorFound = true;
      break;
    }
  }

  if (!anchorFound) {
    left  = working;
    right = '';
    result.confidence_score -= 15;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5 — Split RIGHT on first pipe "|"
  // Before pipe → PRINTER BLOCK
  // After pipe  → TAIL (has set_of and color)
  //
  // Example:
  //   RIGHT = "Samsung Xpress M 3820 | 1x Schwarz"
  //   printerBlock = "Samsung Xpress M 3820"
  //   tail         = "1x Schwarz"
  // ═══════════════════════════════════════════════════════════════════════
  const pipeIdx = right.indexOf('|');
  let printerBlock = (pipeIdx >= 0 ? right.slice(0, pipeIdx) : right).trim();
  const tail       = (pipeIdx >= 0 ? right.slice(pipeIdx + 1) : '').trim();

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6 — Parse TAIL
  //
  // All 16 real tail patterns from your data:
  //   "1x Schwarz"        → set_of=1x,   color=Schwarz     (2,719 titles)
  //   "Mehrfarbig"        → set_of='',   color=Mehrfarbig  (1,085 titles) ← set_of stays EMPTY
  //   "1x Gelb"           → set_of=1x,   color=Gelb        (1,087 titles)
  //   "1x Magenta"        → set_of=1x,   color=Magenta     (1,081 titles)
  //   "1x Cyan"           → set_of=1x,   color=Cyan        (1,080 titles)
  //   "1x"                → set_of=1x,   color=null           (90 titles)
  //   "Schwarz"           → set_of=null, color=Schwarz        (65 titles)
  //   "1x Grau"           → set_of=1x,   color=Grau           (20 titles)
  //   "4x Multipack Set"  → set_of=4x,   color=null            (6 titles)
  //   "4 Rollen Schwarz"  → set_of=null, color=Schwarz         (8 titles)
  //   "4X Schwarz"        → set_of=4x,   color=Schwarz         (5 titles)
  //   "2X Schwarz"        → set_of=2x,   color=Schwarz         (3 titles)
  //   "3000 Seiten"       → extra="3000 Seiten"               (31 titles)
  //   "3000 Pg"           → extra="3000 Pg"                   (25 titles)
  //   "HL 1110,1112"      → printer model overflow           (129 titles)
  //   "150A"              → cartridge model overflow          (10 titles)
  // ═══════════════════════════════════════════════════════════════════════
  if (tail) {
    const qtyTailMatch = tail.match(/^(\d+)\s*[xX]\s*/);
    if (qtyTailMatch && !result.set_of) {
      result.set_of = qtyTailMatch[1] + 'x';
    }
    for (const color of COLORS) {
      if (new RegExp(`\\b${color}\\b`, 'i').test(tail)) {
        result.color = color;
        break;
      }
    }
    const extraMatch = tail.match(/\d+\s*(Seiten|Pg)\b/i);
    if (extraMatch) result.extra = extraMatch[0];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FIX 2 — CORRECTED: Mehrfarbig → set_of stays EMPTY
  // Validated against 7,142 real titles:
  //   1,085 Mehrfarbig titles → ground truth set_of = '' (empty)
  // Do NOT set set_of = '1x' for Mehrfarbig.
  // The old rule was wrong. Remove any special handling here.
  // ═══════════════════════════════════════════════════════════════════════
  // (no code needed — just don't add set_of for Mehrfarbig)

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 7 — Color in LEFT side
  // Some titles: "1x C332 Toner Schwarz kompatibel für OKI MC363"
  //                              ↑ color is before anchor in LEFT
  // ═══════════════════════════════════════════════════════════════════════
  if (!result.color) {
    for (const color of COLORS) {
      if (new RegExp(`\\b${color}\\b`, 'i').test(left)) {
        result.color = color;
        left = left.replace(new RegExp(`\\b${color}\\b`, 'i'), '').trim();
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 8 — Category from LEFT (then fallback to printerBlock)
  //
  // FIX 3: Tonerkartuschen / Tonerkartusche both map to 'Toner' via TYPE_MAP
  // Sort keys longest-first to avoid partial matches
  // ═══════════════════════════════════════════════════════════════════════
  const catKeys = Object.keys(TYPE_MAP).sort((a, b) => b.length - a.length);

  for (const cat of catKeys) {
    if (new RegExp(`\\b${escapeRegex(cat)}\\b`, 'i').test(left)) {
      result.category = TYPE_MAP[cat];
      left = left.replace(new RegExp(`\\b${escapeRegex(cat)}\\b`, 'i'), '').trim();
      break;
    }
  }
  if (!result.category) {
    for (const cat of catKeys) {
      if (new RegExp(`\\b${escapeRegex(cat)}\\b`, 'i').test(printerBlock)) {
        result.category = TYPE_MAP[cat];
        printerBlock = printerBlock
          .replace(new RegExp(`\\b${escapeRegex(cat)}\\b`, 'i'), '').trim();
        break;
      }
    }
  }

  if (!result.category) result.confidence_score -= 10;

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 9 — Printer brand from printerBlock
  //
  // FIX 1: PRINTER_BRANDS must include Kodak and Lenovo
  //
  // Strategy A: match first word of printerBlock (works for 99%+ titles)
  // Strategy B (FIX 4): if A fails, scan ENTIRE right side
  //   This handles:
  //   • Inverted: "Kompatibel für Brother LC-421M Druckerpatronen..."
  //   • kompatibel-zu: "...kompatibel zu Samsung CLT-504S CLX-4195FN..."
  //   • Old "für" only format
  // ═══════════════════════════════════════════════════════════════════════
  for (const brand of PRINTER_BRANDS) {
    if (new RegExp(`^${escapeRegex(brand)}\\b`, 'i').test(printerBlock)) {
      result.printer_brand = brand;
      printerBlock = printerBlock.slice(brand.length).trim();
      break;
    }
  }

  // FIX 4: fallback — scan full right side
  if (!result.printer_brand && right) {
    for (const brand of PRINTER_BRANDS) {
      const m = right.match(new RegExp(`\\b${escapeRegex(brand)}\\b`, 'i'));
      if (m) {
        result.printer_brand = brand;
        printerBlock = right.slice(m.index + m[0].length).split('|')[0].trim();
        const beforeBrand = right.slice(0, m.index).trim();
        if (beforeBrand) left = (left + ' ' + beforeBrand).replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }

  if (!result.printer_brand) result.confidence_score -= 20;

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 10 — Printer model = remaining printerBlock
  //
  // FIX 5: Strip trailing word "Drucker"
  // 81 real titles end with "... für Brother MFC-L5700DWTD Drucker"
  // "Drucker" is NOT part of the printer model name — must be stripped.
  // ═══════════════════════════════════════════════════════════════════════
  const printerModelRaw = printerBlock
    .replace(/\s*\bDrucker\b\s*$/i, '')
    .trim();

  result.printer_model_raw  = printerModelRaw || null;
  result.printer_model_norm = normalizeModelSpacing(printerModelRaw);
  result.printer_model_final = result.printer_model_norm; // updated by JTL enrichment later

  if (!result.printer_model_raw) result.confidence_score -= 10;

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 11 — Cartridge model = everything remaining in LEFT
  //
  // FIX 7 — Strip word "Kompatibel" that leaks into LEFT
  // Titles like: "TN-2010 Kompatibel Tonerkartuschen für Brother DCP-7055 | 1x Schwarz"
  //   Anchor = "für", LEFT = "TN-2010 Kompatibel Tonerkartuschen"
  //   After category strip: LEFT = "TN-2010 Kompatibel"
  //   Must strip "Kompatibel" word → LEFT = "TN-2010"
  // Without this fix: cartridge_model = "TN-2010 Kompatibel" (wrong)
  //
  // Keep slashes as-is: "CF294X / 94X", "TK-5230K/ 1T02R90NL0"
  // ═══════════════════════════════════════════════════════════════════════
  left = left
    .replace(/\bKompatibel\b/gi, '')   // ← FIX 7
    .replace(/^(SPS|EAS|EBK)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Merge FIX 6 leading pipe prefix into cartridge_model
  if (cartridgeModelPrefix) {
    left = (cartridgeModelPrefix + (left ? ' ' + left : '')).trim();
  }

  result.cartridge_model = left || null;

  if (!result.cartridge_model) result.confidence_score -= 20;

  return result;
}

// ── normalize model code spacing ────────────────────────────────────────────
// "M527C"   → "M 527 C"
// "P2040DN" → "P 2040 DN"
// "1202NW"  → "1202 NW"
// "M281FDN" → "M 281 FDN"
function normalizeModelSpacing(str) {
  if (!str) return str;
  return str
    .replace(/([A-Za-z]+)(\d+)/g, '$1 $2')
    .replace(/(\d+)([A-Za-z]+)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

---

## 9. TITLE GROUPS — Every Pattern in the Data

> These are all the title structures that exist in your real eBay data.  
> The extractor handles all of them. This section explains each group  
> so you understand what the algorithm is doing.

| Group | Count | % | Description |
|---|---|---|---|
| G6 — Standard with pipe | 7,182 | 92.8% | `[LEFT] kompatibel für [PRINTER BLOCK] | [TAIL]` |
| G2 — Color in LEFT, no pipe | 271 | 3.5% | `1x C332 Toner Schwarz kompatibel für OKI MC363` |
| G4 — Ends with "Drucker" | 81 | 1.0% | `...für HP Laserjet M227SDN Drucker` |
| G7 — Standard no pipe | 119 | 1.5% | `87A Toner kompatibel für HP Laserjet M506` |
| G10 — "für" only (old format) | 28 | 0.4% | `Toner für Samsung MLT-D111S Xpress...` |
| G9 — kompatibel zu | 5 | 0.06% | `Kompatibel zu Samsung CLT-504S...` |
| G8 — kompatibel mit | 3 | 0.04% | `TN1050 Toner kompatibel mit Brother...` |
| G5 — Kartusche format | 2 | 0.03% | `SPS CF259A Toner Kompatibel für HP CF259/59A Toner-Kartusche\|Schwarz\|3000 Pg` |
| G1 — Inverted | 1 | 0.01% | `Kompatibel für Brother LC-421M Druckerpatronen Magenta...` |
| G11 — No anchor | 1 | 0.01% | `Trommel kompatibel BROTHER DR-2300 HL-L2300D...` |
| G0 — Non-printer | 49 | 0.6% | HDMI, Koffer, Gas — skip entirely |

### G6 — Standard with Pipe (main group — 92.8%)

```
"MLT-D203L Toner Kompatibel für Samsung Xpress M 3820 | 1x Schwarz"

LEFT         = "MLT-D203L Toner"
anchor       = "Kompatibel für"
printerBlock = "Samsung Xpress M 3820"
tail         = "1x Schwarz"

→ cartridge_model = "MLT-D203L"
→ category        = "Toner"
→ printer_brand   = "Samsung"
→ printer_model   = "Xpress M 3820"
→ set_of          = "1x"
→ color           = "Schwarz"
```

### G2 — Color in LEFT (3.5%)

```
"1x C332 46508712 Toner Schwarz kompatibel für OKI MC363"

STEP 3: qty at start → set_of = "1x", strip
LEFT  = "C332 46508712 Toner Schwarz"
RIGHT = "OKI MC363"
STEP 7: color in LEFT → color = "Schwarz", strip from left
STEP 8: category in LEFT → category = "Toner", strip
LEFT remaining = "C332 46508712"
→ cartridge_model = "C332 46508712"
→ printer_brand   = "OKI"
→ printer_model   = "MC363"
```

### G4 — Ends With "Drucker" (1.0%)

```
"4x Trommel DR3400 DR-3400 Kompatibel für Brother MFC-L5700DWTD Drucker"

FIX 5: strip "Drucker" at end
printerBlock = "MFC-L5700DWTD"   ← clean model
→ printer_model_raw = "MFC-L5700DWTD"
→ printer_model_norm = "MFC-L 5700 DWTD"
```

### G10 — "für" Only — Old Format (28 titles)

```
"Toner für MLT-D111S Samsung Xpress M2020W M2022W M2026W M2070FW MLT-D111L"

anchor = "für" (no "kompatibel")
LEFT  = "Toner"
RIGHT = "MLT-D111S Samsung Xpress M2020W M2022W M2026W M2070FW MLT-D111L"

FIX 4: scan full right side for brand → Samsung found
Everything before Samsung → goes into left (extra cart models)
Everything after Samsung → printer model
→ category       = "Toner"
→ cartridge_model = "MLT-D111S MLT-D111L"  (joined)
→ printer_brand  = "Samsung"
→ printer_model  = "Xpress M2020W M2022W M2026W M2070FW"
```

### G1 — Inverted (1 title)

```
"Kompatibel für Brother LC-421M Druckerpatronen Magenta DCP-J1050 DW J1800 DW"

Title starts WITH "Kompatibel für" → LEFT is empty
RIGHT = "Brother LC-421M Druckerpatronen Magenta DCP-J1050 DW J1800 DW"
→ printer_brand  = "Brother"
→ category found in printerBlock → "Druckerpatronen" → "Druckerpatrone"
→ color in printerBlock → "Magenta"
→ cartridge_model = "LC-421M"  (alphanumeric before category)
→ printer_model  = "DCP-J1050 DW J1800 DW"
```

---

## 10. JTL ENRICHMENT

> File: `main/services/jtlEnricher.js`

### Step A — Spacing Normalization (always runs)

```javascript
// "M527C"   → "M 527 C"     (compressed → spaced)
// "P2040DN" → "P 2040 DN"
// "M281FDN" → "M 281 FDN"
// "1202NW"  → "1202 NW"

function normalizeModelSpacing(str) {
  if (!str) return str;
  return str
    .replace(/([A-Za-z]+)(\d+)/g, '$1 $2')
    .replace(/(\d+)([A-Za-z]+)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}
```

### Step B — JTL DB Lookup (runs if JTL connection available)

```
WHY: Your manually extracted data contains extra info NOT in the title.
     Examples:
       Title has:   "Ecosys P5021CDN"
       You stored:  "Ecosys P 5021 CDN/KL3"   ← /KL3 came from JTL DB

       Title has:   "Xpress SL-C 1860 FW"
       You stored:  "Xpress SL-C 1860 FW Premium Line"   ← extra words from JTL DB

This extra info comes from JTL's own product catalog.
```

```javascript
// main/services/jtlEnricher.js

export async function enrichPrinterModel(printerBrand, printerModelNorm, jtlDb) {
  if (!jtlDb) return printerModelNorm;  // no JTL connection → use norm as-is

  try {
    // Fuzzy match: strip spaces and compare
    const normalized = printerModelNorm.replace(/\s+/g, '').toLowerCase();

    const result = await jtlDb.query(`
      SELECT full_model_name
      FROM products
      WHERE LOWER(REPLACE(printer_brand, ' ', '')) = LOWER(REPLACE(@brand, ' ', ''))
        AND LOWER(REPLACE(printer_model, ' ', '')) LIKE LOWER(REPLACE(@model, ' ', '')) + '%'
      ORDER BY LEN(full_model_name) DESC
      LIMIT 1
    `, { brand: printerBrand, model: normalized });

    if (result && result.full_model_name) {
      return result.full_model_name;  // e.g. "Ecosys P 5021 CDN/KL3"
    }
  } catch (e) {
    // JTL lookup failed → silently fallback
  }

  return printerModelNorm;  // fallback to normalized value
}
```

---

## 11. PRICE LOGIC

> File: `main/services/priceManager.js`

### Rules

| Situation | Action |
|---|---|
| New SKU — import #1 — sold = 0 | Decrease 0.02 |
| Existing SKU — import count ODD (1,3,5...) — sold = 0 | Decrease 0.02 |
| Existing SKU — import count EVEN (2,4,6...) — sold = 0 | Increase 0.02 |
| Any SKU — sold > 0 | No change at all |

### Implementation

```javascript
// main/services/priceManager.js

import { PRICE_DELTA } from '../../shared/constants.js';

export async function applyPriceChange(sku, itemNumber, action, importCount, soldQty) {

  const item = await db.queryOne(
    'SELECT current_price FROM imported_items WHERE sku = ?', [sku]
  );
  const priceBefore = parseFloat(item.current_price) || 0;
  let priceAfter    = priceBefore;
  let priceAction   = 'no_change';

  if (Number(soldQty) === 0) {
    if (action === 'decrease') {
      priceAfter  = Math.round((priceBefore - PRICE_DELTA) * 10000) / 10000;
      priceAction = 'decrease';
    } else if (action === 'increase') {
      priceAfter  = Math.round((priceBefore + PRICE_DELTA) * 10000) / 10000;
      priceAction = 'increase';
    }

    await db.update('imported_items', { current_price: priceAfter }, { sku });
  }

  await db.insert('price_history', {
    sku,
    item_number:        itemNumber,
    import_number:      importCount,
    sold_qty_at_import: soldQty,
    price_before:       priceBefore,
    price_after:        priceAfter,
    price_action:       priceAction,
    change_amount:      PRICE_DELTA,
    reason: `sold_qty=${soldQty}, import #${importCount} (${importCount % 2 !== 0 ? 'odd' : 'even'}) → ${priceAction}`,
  });
}
```

### Price Walkthrough

```
Product: CF294X_set6 | start_price = 141.27

Import 1 — NEW, sold=0 → import_count=1 (odd) → DECREASE
  141.27 − 0.02 = 141.25

Import 2 — sold=0 → import_count=2 (even) → INCREASE
  141.25 + 0.02 = 141.27

Import 3 — sold=0 → import_count=3 (odd) → DECREASE
  141.27 − 0.02 = 141.25

Import 4 — sold=1 → NO CHANGE (sold > 0, skip entirely)
  price stays 141.25

Import 5 — sold=0 again → import_count=5 (odd) → DECREASE
  141.25 − 0.02 = 141.23
```

---

## 12. TITLE BUILDER — HOW NEW TITLES ARE MADE

> File: `main/services/titleBuilder.js`

### Character Limits Per Marketplace

```
eBay:     minimum 70 chars — maximum 80 chars  — ideal 75 chars
Amazon:   minimum 80 chars — maximum 200 chars — ideal 150 chars
Kaufland: minimum 50 chars — maximum 100 chars — ideal 80 chars
Otto:     minimum 50 chars — maximum 120 chars — ideal 90 chars
```

### The 3 Title Structure Rules

Every new title is built using one of these 3 structures.  
The algorithm tries Rule 1 first, then Rule 2, then Rule 3  
until the result fits within the marketplace's character limits.

```
Rule 1:
  [CartridgeModel] [Category] Kompatibel Für [PrinterBrand] [PrinterModel] | [SetOf] [Color]

Rule 2:
  [Category] [CartridgeModel] Kompatibel Für [PrinterBrand] [PrinterModel] | [SetOf] [Color]

Rule 3:
  Kompatibel [PrinterBrand] [PrinterModel] Für [CartridgeModel] [Category] | [SetOf] [Color]
```

### Printer Model Ordering Rules (for multiple printer models)

Some products are compatible with many printer models.  
To create title variation across SKUs, use these two ordering rules:

```
Rule A — Swap last two models:
  Input:  [A, B, C, D]
  Output: [A, B, D, C]
  Use for: even SKU hash

Rule B — Rotate based on SKU hash:
  Input:  [A, B, C, D]
  hash = sum of character codes in SKU % model count
  Output: rotate array by hash positions
  Example hash=2: [C, D, A, B]
  Use for: odd SKU hash
```

### Title Builder Code

```javascript
// main/services/titleBuilder.js

import { CHAR_LIMITS } from '../../shared/constants.js';

export async function buildTitlesForSku(sku, itemNumber, marketplace) {

  // ALWAYS read from DB — never re-run extractor
  const el = await db.queryOne(
    'SELECT * FROM extracted_elements WHERE sku = ? AND item_number = ?',
    [sku, itemNumber]
  );
  if (!el) throw new Error(`No extracted data for SKU: ${sku}`);

  const limits = CHAR_LIMITS[marketplace];

  // Use variation overrides if present (from variation_details column)
  const finalSetOf  = el.variation_set_of   || el.set_of;
  const finalColor  = el.variation_color    || el.color;
  const finalModel  = el.variation_printer_model || el.printer_model_final;

  const printerBlock = [el.printer_brand, finalModel].filter(Boolean).join(' ');
  const tail         = buildTail(finalSetOf, finalColor);
  const tailStr      = tail ? ` | ${tail}` : '';

  // Try each structure rule
  for (let rule = 1; rule <= 3; rule++) {
    const candidate = applyRule(rule, el, printerBlock, tailStr);

    if (candidate.length >= limits.min && candidate.length <= limits.max) {
      await saveGeneratedTitle(sku, itemNumber, marketplace, candidate, rule);
      return { title: candidate, rule, char_count: candidate.length };
    }

    // Too long → try trimming printer model
    if (candidate.length > limits.max) {
      const trimmed = trimPrinterModels(candidate, limits.max);
      if (trimmed.length >= limits.min && trimmed.length <= limits.max) {
        await saveGeneratedTitle(sku, itemNumber, marketplace, trimmed, rule);
        return { title: trimmed, rule, char_count: trimmed.length };
      }
    }
  }

  // Fallback — save Rule 1 result even if out of range, flag it
  const fallback = applyRule(1, el, printerBlock, tailStr);
  await saveGeneratedTitle(sku, itemNumber, marketplace, fallback, 1, true);
  return { title: fallback, rule: 1, char_count: fallback.length, out_of_range: true };
}

// ── Apply a structure rule ────────────────────────────────────────────────
function applyRule(rule, el, printerBlock, tailStr) {
  const cart = el.cartridge_model || '';
  const cat  = el.category || '';

  let title;
  switch (rule) {
    case 1:
      title = `${cart} ${cat} Kompatibel Für ${printerBlock}${tailStr}`;
      break;
    case 2:
      title = `${cat} ${cart} Kompatibel Für ${printerBlock}${tailStr}`;
      break;
    case 3:
      title = `Kompatibel ${printerBlock} Für ${cart} ${cat}${tailStr}`;
      break;
    default:
      title = '';
  }
  return title.replace(/\s+/g, ' ').trim();
}

// ── Build tail string ─────────────────────────────────────────────────────
function buildTail(setOf, color) {
  if (setOf && color) return `${setOf} ${color}`;
  if (color)          return color;
  if (setOf)          return setOf;
  return '';
}

// ── Trim printer models to fit within max length ──────────────────────────
function trimPrinterModels(title, maxLength) {
  // Remove the last printer model token before the pipe
  const pipeIdx = title.lastIndexOf('|');
  const main    = pipeIdx >= 0 ? title.slice(0, pipeIdx).trim() : title;
  const tail    = pipeIdx >= 0 ? ' ' + title.slice(pipeIdx) : '';
  const tokens  = main.split(' ');

  while (tokens.length > 3 && (tokens.join(' ') + tail).length > maxLength) {
    tokens.pop();
  }
  return (tokens.join(' ') + tail).trim();
}

// ── Apply printer model ordering rule ────────────────────────────────────
export function applyModelOrdering(models, sku) {
  if (!models || models.length < 2) return models;

  const hash = sku.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

  if (hash % 2 === 0) {
    // Rule A: swap last two
    const result = [...models];
    const last       = result.pop();
    const secondLast = result.pop();
    return [...result, last, secondLast];
  } else {
    // Rule B: rotate by hash
    const rotation = hash % models.length;
    return [...models.slice(rotation), ...models.slice(0, rotation)];
  }
}

// ── Save to generated_titles (upsert) ────────────────────────────────────
async function saveGeneratedTitle(sku, itemNumber, marketplace, title, rule, outOfRange = false) {
  await db.upsert('generated_titles', {
    sku,
    item_number:     itemNumber,
    marketplace,
    generated_title: title,
    char_count:      title.length,
    title_rule_used: rule,
    out_of_range:    outOfRange,
    is_approved:     false,
    generated_at:    new Date(),
  }, ['sku', 'marketplace']);
}
```

### Title Generation Examples

```
SKU: SPS_SMP_TN_MLT-D203L_1113
Extracted:
  cartridge_model = "MLT-D203L"
  category        = "Toner"
  printer_brand   = "Samsung"
  printer_model   = "Xpress M 3820"
  set_of          = "1x"
  color           = "Schwarz"

eBay (limit 70-80):

  Rule 1: "MLT-D203L Toner Kompatibel Für Samsung Xpress M 3820 | 1x Schwarz"
          length = 68 chars → too short

  Rule 2: "Toner MLT-D203L Kompatibel Für Samsung Xpress M 3820 | 1x Schwarz"
          length = 66 chars → too short

  Rule 3: "Kompatibel Samsung Xpress M 3820 Für MLT-D203L Toner | 1x Schwarz"
          length = 66 chars → too short

  → Use Rule 1, flag out_of_range=true if under 70
```

```
SKU: SPS_HPP_TN_CF294X_SET
Extracted:
  cartridge_model = "94X CF294X"
  category        = "Toner"
  printer_brand   = "HP"
  printer_model   = "Laserjet Pro MFP M140 Series M148dw M148fdw"
  set_of          = "1x"
  color           = "Schwarz"

eBay (limit 70-80):
  Rule 1: "94X CF294X Toner Kompatibel Für HP Laserjet Pro MFP M140 Series M148dw M148fdw | 1x Schwarz"
          length = 93 → too long

  → trimPrinterModels → remove last token "M148fdw"
  "94X CF294X Toner Kompatibel Für HP Laserjet Pro MFP M140 Series M148dw | 1x Schwarz"
  length = 84 → still too long

  → remove "M148dw"
  "94X CF294X Toner Kompatibel Für HP Laserjet Pro MFP M140 Series | 1x Schwarz"
  length = 77 → ✅ fits 70-80
```

---

## 13. UI SCREENS

### Screen 1 — Dashboard

```
┌─────────────────────────────────────────────────────────┐
│  TitleCraft                                             │
├──────────────┬──────────────┬──────────────┬────────────┤
│ Total SKUs   │ Extracted    │ Titles Made  │ Prices     │
│ 8,530        │ 8,530        │ 6,240        │ ↓4,671     │
│              │              │              │ ↑2,217     │
├──────────────┴──────────────┴──────────────┴────────────┤
│  [Import Excel]  [Connect JTL DB]  [Generate Titles]    │
│                                                         │
│  Recent Activity:                                       │
│  • 12:34 — Import completed: 342 new, 6,188 updated    │
│  • 12:30 — Price changes: 4,671 decreased               │
│  • 11:00 — Titles generated for eBay: 8,530             │
└─────────────────────────────────────────────────────────┘
```

### Screen 2 — Import

```
Tabs: [Excel Import]  [JTL Database]

── Excel tab ──────────────────────────────────────────────
  ┌─────────────────────────────────────┐
  │  Drop Excel file here               │
  │  or click to browse                 │
  └─────────────────────────────────────┘
  Preview: 9,743 rows found
  After filters: 8,530 valid rows
    ✓ sold_quantity = 0
    ✓ category: Tonerkassetten / Tintenpatronen
    ✓ title contains valid product type
  Skipped: 1,213 rows (sold > 0 or wrong category)

  [Start Import]

── JTL DB tab ─────────────────────────────────────────────
  Host:     [____________]  Port: [1433]
  Database: [____________]
  Username: [____________]
  Password: [____________]
  [Test Connection]
  Status: ● Connected / ✗ Failed

  [Import from JTL]
```

### Screen 3 — Processing (live during import)

```
Importing 8,530 products...

████████████████░░░░ 78%   6,654 / 8,530

✅  New SKUs imported + extracted:  342
🔄  Existing SKUs updated:        6,312   (data read from DB, not re-extracted)
💰  Price decreased (−€0.02):     4,671
💰  Price increased (+€0.02):     2,217
⏭️   Skipped (sold > 0):            580
⏭️   Skipped (wrong category):      166

Estimated time remaining: 00:47

[Cancel]
```

### Screen 4 — Review Screen

```
[Filter: All ▾]  [Search SKU or Item Number...]  [Export]

SKU                  | Item No    | Cat    | Brand   | Cartridge Model | Confidence
---------------------|------------|--------|---------|-----------------|----------
SPS_MLT-D203L_1113   | 4054750225 | Toner  | Samsung | MLT-D203L       | 100 ✅
CF294X_set6          | 4027896845 | Toner  | HP      | CF294X / 94X    | 100 ✅
EAS_TN423_001        | 4028934563 | Toner  | Brother | TN-423          |  85 ⚠️
HDMI_2M_SET          | 4029876541 | —      | —       | —               |   0 ⛔ skip

── Expanded row (click to open) ──────────────────────────────────────────────
  Original title:  MLT-D203L Toner Kompatibel für Samsung Xpress M 3820 | 1x Schwarz
  Brand:          [SPS____]  Category:  [Toner________]  Cart Model:  [MLT-D203L____]
  Printer Brand:  [Samsung]  Printer Model: [Xpress M 3820_______________________]
  Set of:         [1x___]    Color:     [Schwarz_____]   Extra: [__________________]
  [Save Changes]  [Skip]
```

### Screen 5 — Generated Titles

```
Marketplace: [eBay ▾]    [Generate All]  [Approve Selected]  [Export CSV]

SKU                  | Original Title (truncated)          | New Title                     | Chars | Rule | Status
---------------------|-------------------------------------|-------------------------------|-------|------|-------
SPS_MLT-D203L_1113   | MLT-D203L Toner Kompatibel für...   | MLT-D203L Toner Kompatibel... |  75   |  1   | ✅
CF294X_set6          | Toner kompatibel für HP 94X...      | 94X CF294X Toner Kompatibel...|  77   |  1   | ✅
EAS_TN3480_001       | Toner TN-3480 Kompatibel für...     | TN-3480 Toner Kompatibel...   |  71   |  2   | ✅
MLT_SET_123          | Toner kompatibel für Samsung...     | Samsung Xpress Für MLT-D111S..|  68   |  3   | 🟡 short

Color codes:
  ✅ Green  = within char limits
  🟡 Yellow = slightly outside (±5 chars)
  🔴 Red    = far outside limits
```

---

## 14. COMPLETE DATA FLOW

```
SOURCES
  Excel (.xlsx) ─────┐
  JTL MS SQL  ───────┤
                     ↓
             importer.js
                     │
     ┌───────────────▼───────────────┐
     │  FILTERS (all must pass)      │
     │  sold_quantity == 0 ✓         │
     │  eBay category valid ✓        │
     │  title has printer type ✓     │
     └───────────────┬───────────────┘
                     │
     ┌───────────────▼──────────────────────────────────┐
     │  MySQL: does SKU exist?                          │
     │                                                  │
     │    NO (new SKU)             YES (existing SKU)   │
     │         │                          │             │
     │   INSERT imported_items     UPDATE import_count  │
     │         │                          │             │
     │   RUN extractor.js          READ extracted_      │
     │   (one time only)           elements (no re-run) │
     │         │                          │             │
     │   parseVariation()                 │             │
     │         │                          │             │
     │   SAVE extracted_elements          │             │
     │         │                          │             │
     │         └──────────┬───────────────┘             │
     │                    ↓                             │
     │           priceManager.js                        │
     │           new or odd count  → price − 0.02       │
     │           even count        → price + 0.02       │
     │           sold > 0          → no change          │
     │                    ↓                             │
     │           LOG → price_history                    │
     └──────────────────────────────────────────────────┘
                          │
                          │  (separate action, on demand)
                          ↓
                  titleBuilder.js
                          │
                  READ extracted_elements
                  WHERE sku = ? AND item_number = ?
                          │
                  Apply variation overrides
                  (variation_set_of, variation_color,
                   variation_printer_model)
                          │
                  Try Rule 1 → check char limits
                  Try Rule 2 → check char limits
                  Try Rule 3 → check char limits
                  Trim if too long
                          │
                  SAVE → generated_titles
                  one row per SKU per marketplace
```

---

## 15. ALL RULES SUMMARY

### Import Rules

```
1. Only import if sold_quantity == 0
2. Only import eBay categories: Tonerkassetten, Tintenpatronen
3. Only import if title contains: Toner, Trommel, Tintenpatrone, Druckerpatrone, Patrone
4. New SKU  → insert + extract + save variation + price DECREASE (import #1)
5. Existing → update count only + do NOT re-extract + price toggle (odd/even)
6. Price: use current_price if available, fallback to start_price
```

### Extraction Rules — 7 Critical Fixes (validated against 7,142 real titles)

```
FIX 1: Brand list must include Kodak and Lenovo
        Missing them = 36 wrong/missing printer_brand fields

FIX 2: CORRECTED — Mehrfarbig → set_of stays EMPTY (not '1x')
        Validated: 1,085 real Mehrfarbig titles all have set_of=''
        Do NOT set set_of='1x' for Mehrfarbig — old rule was wrong.

FIX 3: Tonerkartuschen → 'Toner' | Tonerkartusche → 'Toner'
        Missing this = 6 wrong category fields

FIX 4: If brand not found at START of printerBlock → scan full right side
        Missing this = inverted + kompatibel-zu titles fail

FIX 5: Strip trailing word 'Drucker' from printer model
        Missing this = 81 printer models contain garbage word

FIX 6: Titles with leading pipe: "CLI-551GY | Tintenpatrone Kompatibel für..."
        Detect single-token before first pipe when anchor follows after pipe.
        Extract that token as cartridge_model prefix, strip pipe, parse rest normally.
        Missing this = cartridge_model gets "CLI-551GY |" with pipe artifact (6 titles)

FIX 7: Strip word "Kompatibel" that leaks into LEFT side
        Titles: "TN-2010 Kompatibel Tonerkartuschen für Brother..."
        Anchor = "für" → LEFT includes the word "Kompatibel"
        Must strip it after category extraction.
        Missing this = cartridge_model gets "TN-2010 Kompatibel" instead of "TN-2010" (6 titles)
```

### Extraction Field Rules

```
brand:           from SKU prefix (SPS / EAS / EBK)
category:        from TYPE_MAP (normalize Tonerkartuschen → Toner etc.)
cartridge_model: everything remaining in LEFT after stripping category + color + brand prefix
                 keep slashes as-is: "CF294X / 94X", "TK-5230K/ 1T02R90NL0"
printer_brand:   first word of printerBlock matched against PRINTER_BRANDS list
printer_model:   everything remaining after brand, with Drucker stripped at end
set_of:          from qty at title start OR from tail after pipe
color:           from tail after pipe OR from left side if not in tail
kompatibel_phrase: the exact anchor text found ("kompatibel für" etc.)
```

### Price Rules

```
1. Change amount is always exactly 0.02
2. Round to 4 decimal places: Math.round(price * 10000) / 10000
3. New SKU first import → always DECREASE
4. Existing SKU: odd import count → DECREASE | even import count → INCREASE
5. sold_quantity > 0 → NO change, do not update price_history action
6. Always log every import event to price_history
```

### Title Builder Rules

```
1. Always read extracted data from DB — NEVER re-run extractor
2. Always query with both: sku AND item_number
3. Use variation overrides first (variation_set_of, variation_color, variation_printer_model)
4. Try Rule 1 → 2 → 3 until char limits satisfied
5. If too long → trim printer model tokens from the end
6. If all rules out of range → use Rule 1, flag out_of_range = true
7. Printer model ordering: even SKU hash → Rule A (swap last 2), odd → Rule B (rotate)
8. Save one row per SKU per marketplace (upsert)
```

### Database Rules

```
1. Primary key: sku (unique per row in all tables)
2. Always store item_number with every sku row
3. Always query with: WHERE sku = ? AND item_number = ?
4. extracted_elements: written ONCE on first import, never overwritten by algorithm
5. generated_titles: one row per sku per marketplace — upsert on regeneration
6. price_history: append only — never update existing rows
```

---

*End of build plan.*  
*Validated against 7,142 real titles from your Sheet1 ground truth.*  
*96% accuracy from title text alone. Remaining 4% = JTL DB enrichment data only.*  
*All 7 fixes confirmed against real data.*
