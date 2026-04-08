import Product from '../database/models/Product.js';
import DatabaseManager from '../database/sqlite.js';
import { calculatePriceAdjustment } from '../pricing/PriceAdjuster.js';
import { fixMojibakeText } from '../utils/textEncoding.js';
import { preflightSqlTcp, parsePort } from '../utils/sqlNetCheck.js';
import { isPrinterConsumable } from '../utils/printerConsumable.js';

function normalizeAuthentication(value) {
  const mode = String(value || 'sql').trim().toLowerCase();
  return mode === 'windows' ? 'windows' : 'sql';
}

function parseServerEndpoint(rawServer, rawPort) {
  const serverRaw = String(rawServer || '').trim();
  const [serverWithPort, instanceName] = serverRaw.split('\\');
  let serverHost = serverWithPort || serverRaw;
  let portFromServer = null;

  if (serverWithPort && serverWithPort.includes(',')) {
    const parts = serverWithPort.split(',');
    serverHost = parts[0].trim();
    const parsedPort = Number(parts[1]);
    if (!Number.isNaN(parsedPort) && parsedPort > 0) {
      portFromServer = parsedPort;
    }
  } else if (serverWithPort && serverWithPort.includes(':')) {
    const lastColon = serverWithPort.lastIndexOf(':');
    const maybePort = Number(serverWithPort.slice(lastColon + 1));
    if (!Number.isNaN(maybePort) && maybePort > 0) {
      serverHost = serverWithPort.slice(0, lastColon).trim();
      portFromServer = maybePort;
    }
  }

  const port = portFromServer ?? Number(rawPort);
  return {
    serverHost,
    instanceName,
    port: !Number.isNaN(port) && port > 0 ? port : null
  };
}

function validateServerHostOrThrow(serverValue) {
  const raw = String(serverValue || '').trim();
  if (!raw) throw new Error('Server name is required');
  const lower = raw.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    throw new Error('Server must be hostname/IP only, without http:// or https://');
  }
}

function firstNonEmpty(obj, keys) {
  const normalized = new Map();
  Object.keys(obj || {}).forEach((key) => {
    normalized.set(String(key).trim().toLowerCase(), obj[key]);
  });
  for (const key of keys) {
    const value = Object.prototype.hasOwnProperty.call(obj, key)
      ? obj[key]
      : normalized.get(String(key).trim().toLowerCase());
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function isZeroSoldCount(value) {
  if (value === 0 || value === '0') return true;
  const normalized = String(value ?? '').trim().replace(/[^\d.,\-+]/g, '');
  if (!normalized) return false;
  const parsed = Number(normalized.replace(',', '.'));
  return Number.isFinite(parsed) && parsed === 0;
}

function parseFlexibleNumber(input) {
  if (input === null || input === undefined) return NaN;
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;

  let text = String(input).trim();
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
  } else if (hasDot) {
    const parts = text.split('.');
    if (parts.length > 2) {
      const last = parts.pop();
      text = `${parts.join('')}.${last}`;
    }
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function normalizeTitleSnapshot(title) {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function mapRowToProduct(row, sessionId, pricingResolver) {
  const itemNumber = String(
    firstNonEmpty(row, [
      'item_number',
      'itemnumber',
      'item number',
      'Item number',
      'Itemnumber',
      'offer_number',
      'offer number',
      'Offer number',
      'angebotsnummer',
      'Angebotsnummer'
    ])
  ).trim();
  const sku = String(
    firstNonEmpty(row, ['sku', 'SKU', 'custom_label_sku', 'custom label (sku)', 'custom_lebel_sku'])
  ).trim();
  const originalTitle = fixMojibakeText(
    firstNonEmpty(row, [
      'original_title',
      'title',
      'Title',
      'offer_title',
      'offer title',
      'Offer title',
      'old_title',
      'old title',
      'angebotstitel',
      'Angebotstitel'
    ])
  ).trim();

  if (!itemNumber || !sku || !originalTitle) return null;

  const quantityRaw = firstNonEmpty(row, ['quantity', 'qty', 'Quantity']);
  const priceRaw = firstNonEmpty(row, [
    'price',
    'Price',
    'preis',
    'Preis',
    'current price',
    'current_price',
    'start price',
    'start_price',
    'startprice',
    'startpreis',
    'angebotspreis'
  ]);
  const soldCountRaw = firstNonEmpty(row, [
    'sold_count',
    'soldcount',
    'sold quantity',
    'sold_quantity',
    'sold',
    'quantity sold',
    'quantity_sold',
    'sold qty',
    'sold_qty',
    'quantity purchased',
    'quantity_purchased',
    'quantitypurchased',
    'verkauft',
    'Verkauft'
  ]);
  const quantity = quantityRaw === '' ? null : Number(quantityRaw);
  const pricing = pricingResolver
    ? pricingResolver({ priceRaw, soldCountRaw, itemNumber, sku, originalTitle })
    : calculatePriceAdjustment(priceRaw, soldCountRaw, { previousAdjustment: '' });
  let rawQueryData = null;
  try {
    rawQueryData = JSON.stringify(row || {});
  } catch {
    rawQueryData = null;
  }

  return {
    item_number: itemNumber,
    sku,
    original_title: originalTitle,
    category: firstNonEmpty(row, ['category', 'Category', 'product_category']) || null,
    brand: firstNonEmpty(row, ['brand', 'Brand', 'manufacturer']) || null,
    category_model: firstNonEmpty(row, ['category_model', 'model', 'Model']) || null,
    ebay_category_name: firstNonEmpty(row, ['ebay_category_name', 'category', 'Category']) || null,
    quantity: Number.isNaN(quantity) ? null : quantity,
    price: pricing.price,
    sold_count: pricing.soldCount,
    suggested_price: pricing.suggestedPrice,
    price_adjustment: pricing.adjustment,
    price_update_status: pricing.updateStatus,
    raw_query_data: rawQueryData,
    source: 'jtl',
    session_id: sessionId || null
  };
}

function stripLeadingSqlComments(sql) {
  let text = String(sql || '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (text.startsWith('--')) {
      const nl = text.indexOf('\n');
      text = nl === -1 ? '' : text.slice(nl + 1).trimStart();
      changed = true;
    }
    if (text.startsWith('/*')) {
      const end = text.indexOf('*/');
      text = end === -1 ? '' : text.slice(end + 2).trimStart();
      changed = true;
    }
  }
  return text.trim();
}

function isReadOnlyQuery(sql) {
  let cleaned = stripLeadingSqlComments(sql);
  if (!cleaned) return false;

  // Allow optional trailing semicolon, but block multi-statement payloads.
  cleaned = cleaned.replace(/;\s*$/, '').trim();
  if (cleaned.includes(';')) return false;

  const lower = cleaned.toLowerCase();
  const mutatingKeywords =
    /\b(insert|update|delete|drop|alter|create|truncate|merge|exec|execute|grant|revoke|deny|backup|restore)\b/i;
  if (mutatingKeywords.test(lower)) return false;

  // Only allow SELECT or CTE query forms.
  if (!/^(select|with)\b/i.test(cleaned)) return false;
  if (/^with\b/i.test(cleaned) && !/\bselect\b/i.test(cleaned)) return false;

  return true;
}

function isSingleUpdateQuery(sql) {
  let cleaned = stripLeadingSqlComments(sql);
  if (!cleaned) return false;
  cleaned = cleaned.replace(/;\s*$/, '').trim();
  if (cleaned.includes(';')) return false;
  if (!/^update\b/i.test(cleaned)) return false;
  const blocked =
    /\b(insert|delete|drop|alter|create|truncate|merge|exec|execute|grant|revoke|deny|backup|restore)\b/i;
  return !blocked.test(cleaned);
}

export default class MssqlSource {
  static getJtlImportQuery() {
    return `SELECT
    ei.ItemID                                 AS Angebotsnummer,
    MAX(a.cArtNr)                             AS SKU,
    MAX(ei.Title)                             AS Angebotstitel,
    MAX(ei.StartPrice)                         AS Preis,
    COALESCE(SUM(et.QuantityPurchased), 0)     AS Verkauft
FROM dbo.ebay_item ei
LEFT JOIN dbo.tArtikel a
    ON a.kArtikel = ei.kArtikel
LEFT JOIN dbo.ebay_transaction et
    ON et.ItemID = ei.ItemID
GROUP BY
    ei.ItemID
ORDER BY
    ei.ItemID DESC;`;
  }

  static async loadMssqlModule() {
    try {
      const mod = await import('mssql');
      return mod?.default || mod;
    } catch {
      throw new Error('mssql package is not installed. Run: npm install mssql');
    }
  }

  static buildConfig(profile) {
    validateServerHostOrThrow(profile?.server);
    const authentication = normalizeAuthentication(profile.authentication);
    const { serverHost, instanceName, port } = parseServerEndpoint(profile.server, profile.port);
    const config = {
      server: serverHost || String(profile.server || '').trim(),
      database: profile.database,
      connectionTimeout: Number(profile?.connectionTimeoutMs) || 30000,
      requestTimeout: Number(profile?.requestTimeoutMs) || 30000,
      options: {
        encrypt: profile.encrypt !== false,
        trustServerCertificate: profile.trustServerCertificate !== false,
        readOnlyIntent: true
      }
    };
    if (instanceName) {
      config.options.instanceName = instanceName;
    }

    if (port) config.port = port;

    if (authentication === 'sql') {
      config.user = profile.user || '';
      config.password = profile.password || '';
    } else {
      config.options.trustedConnection = true;
    }

    return config;
  }

  static validateProfile(profile) {
    validateServerHostOrThrow(profile?.server);
    if (!profile?.database || !String(profile.database).trim()) {
      throw new Error('Database name is required');
    }
    const auth = normalizeAuthentication(profile.authentication);
    if (auth === 'sql') {
      if (!profile?.user || !String(profile.user).trim()) {
        throw new Error('User is required for SQL authentication');
      }
      if (!profile?.password || !String(profile.password).trim()) {
        throw new Error('Password is required for SQL authentication');
      }
    }
    if (!profile?.query || !String(profile.query).trim()) {
      throw new Error('Query is required');
    }
    if (!isReadOnlyQuery(profile.query)) {
      throw new Error(
        'Only read-only SELECT queries are allowed. Write/delete/update/DDL statements are blocked.'
      );
    }
  }

  static async testConnection(profile) {
    const query = this.getJtlImportQuery();
    this.validateProfile({ ...profile, query });
    const config = this.buildConfig(profile);
    await preflightSqlTcp(config.server, parsePort(config.port, 1433), 5000);
    const mssql = await this.loadMssqlModule();
    const pool = new mssql.ConnectionPool(config);
    try {
      await pool.connect();
      const result = await pool.request().query('SELECT 1 AS ok');
      return { success: true, data: result.recordset?.[0] || { ok: 1 }, error: null };
    } finally {
      await pool.close();
    }
  }

  static async importWithProfile(profile, sessionId) {
    this.validateProfile(profile);
    const mssql = await this.loadMssqlModule();
    const pool = new mssql.ConnectionPool(this.buildConfig(profile));
    try {
      await pool.connect();
      const result = await pool.request().query(profile.query);
      const rows = result.recordset || [];

      const mapped = [];
      const errors = [];
      let skippedSoldNotZero = 0;
      let skippedNonPrinter = 0;
      const db = DatabaseManager.getDatabase();
      const getLastHistory = db.prepare(
        `SELECT price_before, price_after, title_snapshot
         FROM price_history
         WHERE sku = ? AND item_number = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1`
      );
      const getNextImportNumber = db.prepare(
        `SELECT COALESCE(MAX(import_number), 0) + 1 AS next_num
         FROM price_history
         WHERE sku = ? AND item_number = ?`
      );
      const insertPriceHistory = db.prepare(
        `INSERT INTO price_history (
          sku, item_number, import_number, price_before, price_after,
          price_action, sold_qty, reason, title_snapshot, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const historyEntries = [];
      const resolvePricing = ({ priceRaw, soldCountRaw, itemNumber, sku, originalTitle }) => {
        const price = parseFlexibleNumber(priceRaw);
        const soldCount = parseFlexibleNumber(soldCountRaw);
        if (!Number.isFinite(price)) {
          return calculatePriceAdjustment(priceRaw, soldCountRaw, { previousAdjustment: '' });
        }

        const normalizedTitle = normalizeTitleSnapshot(originalTitle);
        if (Number.isFinite(soldCount) && soldCount === 0) {
          const last = getLastHistory.get(sku, itemNumber);
          const lastNew = parseFlexibleNumber(last?.price_after);
          const lastOld = parseFlexibleNumber(last?.price_before);
          const lastTitle = normalizeTitleSnapshot(last?.title_snapshot);
          const titleChanged = lastTitle && normalizedTitle && lastTitle !== normalizedTitle;
          const priceMatchesLastNew =
            Number.isFinite(lastNew) && Math.abs(price - lastNew) < 0.0001;

          let suggestedPrice = price;
          let priceAction = 'unchanged';
          let reason = '';
          let record = false;

          if (!last || titleChanged || !priceMatchesLastNew) {
            suggestedPrice = Math.max(0, Number((price - 0.02).toFixed(2)));
            priceAction = 'decrease';
            reason = !last
              ? 'first zero-sales decrease'
              : titleChanged
              ? 'title changed; reset decrease'
              : `price mismatch (${price} != ${Number.isFinite(lastNew) ? lastNew : 'n/a'}); reset decrease`;
            record = suggestedPrice !== price;
          } else if (Number.isFinite(lastOld)) {
            suggestedPrice = Number(lastOld.toFixed(2));
            priceAction = 'swap';
            reason = 'swap old/new (zero sales)';
            record = suggestedPrice !== price;
          } else {
            suggestedPrice = Math.max(0, Number((price - 0.02).toFixed(2)));
            priceAction = 'decrease';
            reason = 'missing prior old price; decrease';
            record = suggestedPrice !== price;
          }

          const adjustment =
            priceAction === 'decrease'
              ? 'decrease-0-sold'
              : priceAction === 'swap'
              ? 'swap-0-sold'
              : 'unchanged';

          return {
            price,
            soldCount,
            suggestedPrice,
            adjustment,
            updateStatus: suggestedPrice !== price ? 'pending' : 'not-required',
            __history: record
              ? {
                  priceBefore: price,
                  priceAfter: suggestedPrice,
                  priceAction,
                  soldQty: soldCount,
                  reason,
                  titleSnapshot: normalizedTitle
                }
              : null
          };
        }

        return {
          price,
          soldCount: Number.isFinite(soldCount) ? soldCount : null,
          suggestedPrice: price,
          adjustment: 'unchanged',
          updateStatus: 'not-required'
        };
      };
      rows.forEach((row, index) => {
        const product = mapRowToProduct(row, sessionId, resolvePricing);
        if (!product) {
          errors.push({ row: index + 1, error: 'Missing required fields: item_number, sku, original_title' });
          return;
        }
        const history = product.__history;
        delete product.__history;
        if (!isPrinterConsumable(product.original_title)) {
          skippedNonPrinter += 1;
          return;
        }
        if (!isZeroSoldCount(product.sold_count)) {
          skippedSoldNotZero += 1;
          return;
        }
        mapped.push(product);
        if (history) {
          historyEntries.push({
            sku: product.sku,
            item_number: product.item_number,
            ...history
          });
        }
      });

      const insertResult = Product.createManyIgnore(mapped);
      if (!insertResult.success) {
        throw new Error(insertResult.error || 'Database import failed');
      }
      if (historyEntries.length) {
        for (const entry of historyEntries) {
          const nextNum = getNextImportNumber.get(entry.sku, entry.item_number)?.next_num ?? 1;
          insertPriceHistory.run(
            entry.sku,
            entry.item_number,
            nextNum,
            entry.priceBefore,
            entry.priceAfter,
            entry.priceAction,
            entry.soldQty ?? null,
            entry.reason || null,
            entry.titleSnapshot || null,
            sessionId || null
          );
        }
      }

      return {
        total: rows.length,
        inserted: insertResult.data?.inserted || 0,
        skipped: (insertResult.data?.skipped || 0) + skippedSoldNotZero + skippedNonPrinter,
        skippedNonPrinter,
        errors
      };
    } finally {
      await pool.close();
    }
  }

  static async applyPriceUpdates(profile, updates) {
    if (!Array.isArray(updates) || !updates.length) {
      return { updated: 0, failed: 0, failures: [] };
    }
    const query = String(profile?.priceUpdateQuery || '').trim();
    if (!query) {
      throw new Error('Price update query is required in active database profile');
    }
    if (!isSingleUpdateQuery(query)) {
      throw new Error('Price update query must be a single UPDATE statement');
    }

    const mssql = await this.loadMssqlModule();
    const config = this.buildConfig(profile);
    config.options = { ...(config.options || {}), readOnlyIntent: false };
    const pool = new mssql.ConnectionPool(config);
    const failures = [];
    let updated = 0;

    try {
      await pool.connect();
      for (const row of updates) {
        try {
          const request = pool.request();
          request.input('item_number', mssql.NVarChar, String(row.item_number || ''));
          request.input('sku', mssql.NVarChar, String(row.sku || ''));
          request.input('new_price', mssql.Decimal(18, 2), Number(row.suggested_price));
          request.input('old_price', mssql.Decimal(18, 2), Number(row.price));
          request.input('sold_count', mssql.Int, Number(row.sold_count || 0));
          const res = await request.query(query);
          const affected = Array.isArray(res.rowsAffected)
            ? res.rowsAffected.reduce((acc, n) => acc + n, 0)
            : 0;
          if (affected > 0) {
            updated += 1;
          } else {
            failures.push({
              item_number: row.item_number,
              sku: row.sku,
              error: 'No rows affected'
            });
          }
        } catch (error) {
          failures.push({
            item_number: row.item_number,
            sku: row.sku,
            error: error.message
          });
        }
      }
    } finally {
      await pool.close();
    }

    return {
      updated,
      failed: failures.length,
      failures
    };
  }

  static async importJtlData(profile, sessionId) {
    const query = this.getJtlImportQuery();
    const requestProfile = { ...profile, query };
    this.validateProfile(requestProfile);
    const mssql = await this.loadMssqlModule();
    const pool = new mssql.ConnectionPool(this.buildConfig(requestProfile));
    try {
      await pool.connect();
      const result = await pool.request().query(query);
      const rows = result.recordset || [];

      const mapped = [];
      const errors = [];
      let skippedSoldNotZero = 0;
      let skippedNonPrinter = 0;
      const db = DatabaseManager.getDatabase();
      const getLastHistory = db.prepare(
        `SELECT price_before, price_after, title_snapshot
         FROM price_history
         WHERE sku = ? AND item_number = ?
         ORDER BY recorded_at DESC, id DESC
         LIMIT 1`
      );
      const getNextImportNumber = db.prepare(
        `SELECT COALESCE(MAX(import_number), 0) + 1 AS next_num
         FROM price_history
         WHERE sku = ? AND item_number = ?`
      );
      const insertPriceHistory = db.prepare(
        `INSERT INTO price_history (
          sku, item_number, import_number, price_before, price_after,
          price_action, sold_qty, reason, title_snapshot, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const historyEntries = [];
      const resolvePricing = ({ priceRaw, soldCountRaw, itemNumber, sku, originalTitle }) => {
        const price = parseFlexibleNumber(priceRaw);
        const soldCount = parseFlexibleNumber(soldCountRaw);
        if (!Number.isFinite(price)) {
          return calculatePriceAdjustment(priceRaw, soldCountRaw, { previousAdjustment: '' });
        }

        const normalizedTitle = normalizeTitleSnapshot(originalTitle);
        if (Number.isFinite(soldCount) && soldCount === 0) {
          const last = getLastHistory.get(sku, itemNumber);
          const lastNew = parseFlexibleNumber(last?.price_after);
          const lastOld = parseFlexibleNumber(last?.price_before);
          const lastTitle = normalizeTitleSnapshot(last?.title_snapshot);
          const titleChanged = lastTitle && normalizedTitle && lastTitle !== normalizedTitle;
          const priceMatchesLastNew =
            Number.isFinite(lastNew) && Math.abs(price - lastNew) < 0.0001;

          let suggestedPrice = price;
          let priceAction = 'unchanged';
          let reason = '';
          let record = false;

          if (!last || titleChanged || !priceMatchesLastNew) {
            suggestedPrice = Math.max(0, Number((price - 0.02).toFixed(2)));
            priceAction = 'decrease';
            reason = !last
              ? 'first zero-sales decrease'
              : titleChanged
              ? 'title changed; reset decrease'
              : `price mismatch (${price} != ${Number.isFinite(lastNew) ? lastNew : 'n/a'}); reset decrease`;
            record = suggestedPrice !== price;
          } else if (Number.isFinite(lastOld)) {
            suggestedPrice = Number(lastOld.toFixed(2));
            priceAction = 'swap';
            reason = 'swap old/new (zero sales)';
            record = suggestedPrice !== price;
          } else {
            suggestedPrice = Math.max(0, Number((price - 0.02).toFixed(2)));
            priceAction = 'decrease';
            reason = 'missing prior old price; decrease';
            record = suggestedPrice !== price;
          }

          const adjustment =
            priceAction === 'decrease'
              ? 'decrease-0-sold'
              : priceAction === 'swap'
              ? 'swap-0-sold'
              : 'unchanged';

          return {
            price,
            soldCount,
            suggestedPrice,
            adjustment,
            updateStatus: suggestedPrice !== price ? 'pending' : 'not-required',
            __history: record
              ? {
                  priceBefore: price,
                  priceAfter: suggestedPrice,
                  priceAction,
                  soldQty: soldCount,
                  reason,
                  titleSnapshot: normalizedTitle
                }
              : null
          };
        }

        return {
          price,
          soldCount: Number.isFinite(soldCount) ? soldCount : null,
          suggestedPrice: price,
          adjustment: 'unchanged',
          updateStatus: 'not-required'
        };
      };
      rows.forEach((row, index) => {
        const product = mapRowToProduct(row, sessionId, resolvePricing);
        if (!product) {
          errors.push({ row: index + 1, error: 'Missing required fields: item_number, sku, original_title' });
          return;
        }
        const history = product.__history;
        delete product.__history;
        if (!isPrinterConsumable(product.original_title)) {
          skippedNonPrinter += 1;
          return;
        }
        if (!isZeroSoldCount(product.sold_count)) {
          skippedSoldNotZero += 1;
          return;
        }
        mapped.push(product);
        if (history) {
          historyEntries.push({
            sku: product.sku,
            item_number: product.item_number,
            ...history
          });
        }
      });

      const insertResult = Product.createManyIgnore(mapped);
      if (!insertResult.success) {
        throw new Error(insertResult.error || 'Database import failed');
      }
      if (historyEntries.length) {
        for (const entry of historyEntries) {
          const nextNum = getNextImportNumber.get(entry.sku, entry.item_number)?.next_num ?? 1;
          insertPriceHistory.run(
            entry.sku,
            entry.item_number,
            nextNum,
            entry.priceBefore,
            entry.priceAfter,
            entry.priceAction,
            entry.soldQty ?? null,
            entry.reason || null,
            entry.titleSnapshot || null,
            sessionId || null
          );
        }
      }

      return {
        total: rows.length,
        inserted: insertResult.data?.inserted || 0,
        skipped: (insertResult.data?.skipped || 0) + skippedSoldNotZero + skippedNonPrinter,
        skippedNonPrinter,
        errors
      };
    } finally {
      await pool.close();
    }
  }
}
