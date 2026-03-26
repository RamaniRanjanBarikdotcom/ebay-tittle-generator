import DatabaseManager from '../database/sqlite.js';
import DatabaseSource from '../sources/DatabaseSource.js';
import LanguageDetector from '../title-engine/LanguageDetector.js';
import RuleEngine from '../title-engine/RuleEngine.js';
import TitleSanitizer from '../title-engine/TitleSanitizer.js';
import TitleGenerator from '../title-engine/TitleGenerator.js';
import { hashTitle } from '../../shared/utils/hash.js';
import TitleHistory from '../database/models/TitleHistory.js';
import KnowledgeBaseStore from '../services/KnowledgeBaseStore.js';
import { parseVariation, extractVariationDetails } from '../services/variationParser.js';

const MARKETPLACES = ['ebay', 'amazon', 'kaufland', 'otto'];
const PRICE_DELTA = 0.02;

// Bump this string whenever RuleEngine extraction logic changes.
// All cached extracted_elements rows with a different version will be re-extracted.
const EXTRACTION_CACHE_VERSION = 'v10-2026-03-26';

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
    text = text.replace(/,/g, '.');
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeKompatibelConnector(title) {
  let out = TitleSanitizer.sanitize(title || '');
  if (!out) return out;
  if (/kompatibel\s+für/i.test(out)) return out;
  if (/kompatibel/i.test(out)) {
    return out.replace(/\bkompatibel\b/i, 'Kompatibel für');
  }
  if (/\bfür\b/i.test(out)) {
    return out.replace(/\bfür\b/i, 'Kompatibel für');
  }
  return out;
}

function isSoldCountZero(value) {
  if (value === 0 || value === '0') return true;
  const n = parseLooseNumber(value);
  return Number.isFinite(n) && n === 0;
}

function parseSoldQty(value) {
  const n = parseLooseNumber(value);
  return Number.isFinite(n) ? n : null;
}

function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseLooseNumber(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Calculate suggested price based on import_count (odd→decrease, even→increase).
 * Returns { suggestedPrice, priceAction, delta }.
 */
function calcPriceFromImportCount(price, importCount, soldQty) {
  if (price === null || soldQty === null || soldQty > 0) {
    return { suggestedPrice: price, priceAction: 'no_change', delta: 0 };
  }
  const action = importCount % 2 !== 0 ? 'decrease' : 'increase';
  const delta = action === 'decrease' ? -PRICE_DELTA : PRICE_DELTA;
  const suggestedPrice = Math.max(0, Number((price + delta).toFixed(2)));
  return { suggestedPrice, priceAction: action, delta: PRICE_DELTA };
}

/**
 * Serialize RuleEngine elements to JSON strings for DB storage.
 */
function serializeElements(elements) {
  return {
    category: elements.category || null,
    cartridge_models: elements.cartridgeModels?.length ? JSON.stringify(elements.cartridgeModels) : null,
    brand: elements.brand || null,
    product_brand: elements.productBrand || null,
    printer_brand: elements.printerBrand || null,
    series: elements.series || null,
    printer_models: elements.printerModels?.length ? JSON.stringify(elements.printerModels) : null,
    bracket_codes: elements.bracketCodes?.length ? JSON.stringify(elements.bracketCodes) : null,
    kompatibel: elements.kompatibel || null,
    set_of: elements.setOf || null,
    qty: elements.qty || null,
    color: elements.color || null,
    extra: JSON.stringify({ _v: EXTRACTION_CACHE_VERSION, data: elements.extra || null }),
    verification_status: elements.verification?.status || null,
    verification_confidence: elements.verification?.confidence ?? null,
    verification_issues: elements.verification?.issues?.length ? JSON.stringify(elements.verification.issues) : null,
    variation_set_of: elements.variationSetOf || null,
    variation_color: elements.variationColor || null,
    variation_printer_model: elements.variationPrinterModel || null
  };
}

/**
 * Deserialize stored extracted_elements row back into RuleEngine elements shape.
 */
function deserializeElements(row) {
  const parse = (v) => { try { return v ? JSON.parse(v) : []; } catch { return []; } };
  return {
    category: row.category,
    cartridgeModels: parse(row.cartridge_models),
    brand: row.brand,
    productBrand: row.product_brand,
    printerBrand: row.printer_brand,
    series: row.series,
    printerModels: parse(row.printer_models),
    bracketCodes: parse(row.bracket_codes),
    kompatibel: row.kompatibel,
    setOf: row.set_of,
    qty: row.qty,
    color: row.color,
    extra: (() => { try { const p = JSON.parse(row.extra); return p?.data ?? null; } catch { return row.extra; } })(),
    verification: {
      status: row.verification_status,
      confidence: row.verification_confidence,
      issues: parse(row.verification_issues)
    },
    variationSetOf: row.variation_set_of || null,
    variationColor: row.variation_color || null,
    variationPrinterModel: row.variation_printer_model || null
  };
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function compactToken(value) {
  return normalizeComparableText(value).replace(/[^A-Z0-9]/g, '');
}

function isCachedExtractionStale(cachedRow, product) {
  if (!cachedRow) return true;

  // Version check: if the cached extraction was built with an older RuleEngine, re-extract.
  try {
    const extraData = cachedRow.extra ? JSON.parse(String(cachedRow.extra)) : {};
    if (extraData._v !== EXTRACTION_CACHE_VERSION) return true;
  } catch {
    return true; // unparseable extra → stale
  }

  const liveTitle = normalizeComparableText(product?.original_title || '');
  const cachedTitle = normalizeComparableText(cachedRow?.original_title || '');
  if (!cachedTitle || cachedTitle !== liveTitle) return true;

  const cachedPrinterBrand = normalizeComparableText(cachedRow?.printer_brand || '');
  if (cachedPrinterBrand && !liveTitle.includes(cachedPrinterBrand)) return true;

  let cachedModels = [];
  try {
    const parsed = JSON.parse(String(cachedRow?.printer_models || '[]'));
    if (Array.isArray(parsed)) cachedModels = parsed;
  } catch {
    cachedModels = [];
  }

  if (cachedModels.length) {
    const liveToken = compactToken(liveTitle);
    const hasAnyModelToken = cachedModels.some((model) => {
      const token = compactToken(model);
      return token && liveToken.includes(token);
    });
    if (!hasAnyModelToken) return true;
  }

  return false;
}

export default class PipelineRunner {
  static generateTitlesForSession({ sessionId, language = 'de', autoDetect = false, onProgress }) {
    const db = DatabaseManager.getDatabase();
    const products = DatabaseSource.getSessionProducts(sessionId);
    const zeroSoldProducts = products.filter(
      (product) =>
        isSoldCountZero(product.sold_count) &&
        RuleEngine.isSupportedProduct(product.original_title || '')
    );

    if (!products.length) {
      return { success: false, data: null, error: 'No products found' };
    }
    if (!zeroSoldProducts.length) {
      return {
        success: true,
        data: { generatedCount: 0, productCount: 0, priceAdjustedCount: 0 },
        error: null
      };
    }

    KnowledgeBaseStore.ensureSchema();
    zeroSoldProducts.forEach((product) => {
      KnowledgeBaseStore.upsertFromRawQueryData(
        product.raw_query_data,
        product.original_title || '',
        product.sku || '',
        'manual_import'
      );
    });
    const kbEntries = KnowledgeBaseStore.getAllEntries();

    let generatedCount = 0;
    let productCount = 0;
    let priceAdjustedCount = 0;
    const historyEntries = [];

    // ── Prepared statements ────────────────────────────────────────────────

    const insertTitle = db.prepare(
      `INSERT OR IGNORE INTO generated_titles
       (product_id, sku, item_number, title, title_hash, language, variation_number, model_rotation, char_length, is_active, session_id, marketplace)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    );

    // Delete stale titles for this product+marketplace before inserting fresh ones.
    // This ensures re-running the pipeline always replaces old titles rather than
    // accumulating duplicates via INSERT OR IGNORE.
    const deleteHistoryForProduct = db.prepare(
      `DELETE FROM title_history
       WHERE generated_title_id IN (
         SELECT id FROM generated_titles
         WHERE product_id = ? AND marketplace = ? AND session_id IS ?
       )`
    );

    const deleteStaleForProduct = db.prepare(
      'DELETE FROM generated_titles WHERE product_id = ? AND marketplace = ? AND session_id IS ?'
    );

    const updatePriceAnalysis = db.prepare(
      `UPDATE products
       SET suggested_price = ?, price_adjustment = ?, price_update_status = ?
       WHERE id = ?`
    );

    // extracted_elements cache
    const getExtracted = db.prepare(
      'SELECT * FROM extracted_elements WHERE sku = ? AND item_number = ? LIMIT 1'
    );
    const insertExtracted = db.prepare(
      `INSERT OR REPLACE INTO extracted_elements
       (sku, item_number, original_title, category, cartridge_models, brand, product_brand,
        printer_brand, series, printer_models, bracket_codes, kompatibel, set_of, qty, color,
        extra, verification_status, verification_confidence, verification_issues,
        variation_set_of, variation_color, variation_printer_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // import_count tracking (odd→decrease, even→increase)
    const upsertImportCount = db.prepare(
      `INSERT INTO sku_import_counts (sku, item_number, import_count, last_imported_at)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(sku, item_number) DO UPDATE SET
         import_count = import_count + 1,
         last_imported_at = CURRENT_TIMESTAMP`
    );
    const getImportCount = db.prepare(
      'SELECT import_count FROM sku_import_counts WHERE sku = ? AND item_number = ? LIMIT 1'
    );

    // price_history audit
    const insertPriceHistory = db.prepare(
      `INSERT INTO price_history (sku, item_number, import_number, price_before, price_after, price_action, sold_qty, reason, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // ── Transaction ────────────────────────────────────────────────────────

    const runTx = db.transaction((rows) => {
      rows.forEach((product, index) => {
        const percent = Math.min(95, Math.round(((index + 1) / rows.length) * 95));
        if (onProgress) {
          onProgress({ scope: 'generate', percent, message: `Generating ${index + 1}/${rows.length}` });
        }

        const resolvedLanguage = autoDetect
          ? LanguageDetector.detect(product.original_title) || language
          : language;

        // ── 1. Resolve extraction elements (cache-first) ──────────────────
        let elements = null;
        const cachedRow = getExtracted.get(product.sku || '', product.item_number || '');
        const shouldRefreshExtraction = isCachedExtractionStale(cachedRow, product);

        if (!shouldRefreshExtraction && cachedRow) {
          elements = deserializeElements(cachedRow);
        } else {
          const generated = RuleEngine.generate({
            title: product.original_title,
            sku: product.sku || ''
          });
          const rectified = KnowledgeBaseStore.rectifyElementsByKnowledgeBase(
            product.original_title || '',
            generated.elements,
            kbEntries,
            { sku: product.sku || '', itemNumber: product.item_number || '' }
          );
          elements = rectified.corrected ? rectified.elements : generated.elements;

          // Parse variation_details from raw_query_data and attach overrides to elements
          const variationDetails = extractVariationDetails(product.raw_query_data);
          if (variationDetails) {
            const variation = parseVariation(variationDetails);
            elements = {
              ...elements,
              variationSetOf: variation.set_of || null,
              variationColor: variation.color || null,
              variationPrinterModel: variation.printer_model || null
            };
          }

          // Save refreshed extraction cache for this SKU+item_number.
          if (product.sku && product.item_number) {
            const s = serializeElements(elements);
            insertExtracted.run(
              product.sku, product.item_number, product.original_title || '',
              s.category, s.cartridge_models, s.brand, s.product_brand,
              s.printer_brand, s.series, s.printer_models, s.bracket_codes,
              s.kompatibel, s.set_of, s.qty, s.color, s.extra,
              s.verification_status, s.verification_confidence, s.verification_issues,
              s.variation_set_of, s.variation_color, s.variation_printer_model
            );
          }
        }

        // ── 2. Compose titles for all marketplaces ────────────────────────
        productCount += 1;
        let usedFallback = false;

        for (const marketplace of MARKETPLACES) {
          const composed = RuleEngine.composeTitle(elements, product.original_title || '', { marketplace });
          let candidates = composed.candidates || [];

          const originalNormalized = TitleSanitizer
            .sanitize(product.original_title || '')
            .trim()
            .toLowerCase();

          candidates = candidates.filter((c) => (c || '').trim().toLowerCase() !== originalNormalized);

          if (!candidates.length && marketplace === 'ebay') {
            let fallback = normalizeKompatibelConnector(product.original_title || '');
            if (fallback.length > 80) fallback = TitleGenerator.truncateTitle(fallback, 80);
            if (fallback) {
              candidates = [fallback];
              usedFallback = true;
            }
          }

          // For eBay: "Kompatibel für" is mandatory in EVERY stored variation.
          // Filter out any candidate that lacks it; do not inject synthetic words.
          if (marketplace === 'ebay' && candidates.length > 0) {
            const hasKompatibel = (c) => /kompatibel\s+für/i.test(c);
            const validCandidates = candidates.filter(hasKompatibel);
            if (validCandidates.length !== candidates.length) {
              candidates = validCandidates;
            }
          }
          if (marketplace === 'ebay' && !candidates.length) {
            let fallback = normalizeKompatibelConnector(product.original_title || '');
            if (fallback.length > 80) fallback = TitleGenerator.truncateTitle(fallback, 80);
            if (fallback && /kompatibel\s+für/i.test(fallback)) {
              candidates = [fallback];
              usedFallback = true;
            }
          }

          // For non-eBay: use best single title (no fallback needed)
          if (!candidates.length && marketplace !== 'ebay') {
            candidates = composed.newTitle ? [composed.newTitle] : [];
          }

          if (!candidates.length) continue;

          // For eBay store up to 3 variations; for other markets store 1 best
          const titlesToInsert = marketplace === 'ebay' ? candidates.slice(0, 3) : [candidates[0]];

          // Delete stale titles for this product+marketplace so re-runs always
          // replace old titles rather than leaving duplicates via INSERT OR IGNORE.
          deleteHistoryForProduct.run(product.id, marketplace, sessionId || null);
          deleteStaleForProduct.run(product.id, marketplace, sessionId || null);

          titlesToInsert.forEach((title, idx) => {
            const titleHash = hashTitle(`${title}||${marketplace}||${product.id}||${idx}`);
            const res = insertTitle.run(
              product.id,
              product.sku || null,
              product.item_number || null,
              title,
              titleHash,
              resolvedLanguage,
              idx + 1,
              usedFallback ? 'fallback' : (composed.debug?.printerModelsUsed || []).join(','),
              title.length,
              sessionId || null,
              marketplace
            );

            if (res.changes === 1 && marketplace === 'ebay') {
              generatedCount += 1;
              historyEntries.push({
                product_id: product.id,
                generated_title_id: res.lastInsertRowid,
                action: 'generated',
                metadata: {
                  language: resolvedLanguage,
                  variation: idx + 1,
                  fallback: usedFallback,
                  marketplace
                },
                session_id: sessionId || null
              });
            } else if (res.changes === 1) {
              generatedCount += 1;
            }
          });
        }

        // ── 3. Price adjustment (import_count based) ──────────────────────
        const sku = product.sku || '';
        const itemNumber = product.item_number || '';

        if (sku && itemNumber) {
          upsertImportCount.run(sku, itemNumber);
          const countRow = getImportCount.get(sku, itemNumber);
          const importCount = countRow?.import_count ?? 1;

          const price = parsePrice(product.price);
          const soldQty = parseSoldQty(product.sold_count);
          const { suggestedPrice, priceAction } = calcPriceFromImportCount(price, importCount, soldQty);

          const priceChanged = price !== null && suggestedPrice !== price;
          if (priceChanged) priceAdjustedCount += 1;

          const adjustmentLabel = priceAction === 'decrease'
            ? 'decrease-0-sold'
            : priceAction === 'increase'
            ? 'increase-0-sold-repeat'
            : 'unchanged';

          updatePriceAnalysis.run(
            suggestedPrice,
            adjustmentLabel,
            priceChanged ? 'pending' : 'not-required',
            product.id
          );

          // Write price_history audit entry
          if (price !== null) {
            insertPriceHistory.run(
              sku, itemNumber, importCount,
              price, suggestedPrice, priceAction,
              soldQty,
              `sold_qty=${soldQty}, import #${importCount} (${importCount % 2 !== 0 ? 'odd' : 'even'}) → ${priceAction}`,
              sessionId || null
            );
          }
        }
      });
    });

    runTx(zeroSoldProducts);

    if (historyEntries.length) {
      TitleHistory.createMany(historyEntries);
    }

    if (onProgress) {
      onProgress({ scope: 'generate', percent: 100, message: 'Generation complete' });
    }

    return {
      success: true,
      data: { generatedCount, productCount, priceAdjustedCount },
      error: null
    };
  }
}
