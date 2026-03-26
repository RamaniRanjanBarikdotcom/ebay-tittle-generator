import DatabaseManager from '../database/sqlite.js';
import { fixMojibakeText } from '../utils/textEncoding.js';

const CSV_DELIMITER = ';';
const DE_PRICE_FORMATTER = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function escapeCsv(value, delimiter = CSV_DELIMITER) {
  if (value === null || value === undefined) return '';
  const stringValue = fixMojibakeText(value);
  if (stringValue.includes(delimiter) || /[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function parseLooseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/[^\d.,\-+]/g, '');
  if (!text) return null;

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

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPriceForCsv(value) {
  const num = parseLooseNumber(value);
  if (num === null) return '';
  return DE_PRICE_FORMATTER.format(num);
}

function isZeroSoldCount(value) {
  if (value === 0 || value === '0') return true;
  const cleaned = String(value ?? '').trim().replace(/[^\d.,\-+]/g, '');
  if (!cleaned) return false;
  const parsed = Number(cleaned.replace(',', '.'));
  return Number.isFinite(parsed) && parsed === 0;
}

export default class CsvExporter {
  static getGroupedRows(language = 'de', sessionId = null, marketplace = 'ebay') {
    const db = DatabaseManager.getDatabase();
    const rows = sessionId
      ? db
          .prepare(
            `SELECT p.id as product_id, p.item_number, p.sku, p.original_title,
                    p.price, p.sold_count, p.suggested_price, p.price_adjustment,
                    gt.title, gt.variation_number, gt.language
             FROM products p
             LEFT JOIN generated_titles gt
               ON gt.product_id = p.id
              AND gt.session_id = ?
              AND COALESCE(gt.marketplace, 'ebay') = ?
             WHERE p.session_id = ?
             ORDER BY p.id,
                      CASE WHEN gt.language = ? THEN 0 ELSE 1 END,
                      gt.variation_number,
                      gt.created_at DESC`
          )
          .all(sessionId, marketplace, sessionId, language)
      : [];

    const grouped = new Map();
    for (const row of rows) {
      if (!isZeroSoldCount(row.sold_count)) continue;
      const key = row.product_id;
      if (!grouped.has(key)) {
        grouped.set(key, {
          product_id: row.product_id,
          item_number: row.item_number,
          sku: row.sku,
          original_title: row.original_title,
          price: row.price,
          sold_count: row.sold_count,
          suggested_price: row.suggested_price,
          price_adjustment: row.price_adjustment,
          titles: []
        });
      }
      if (row.title) {
        grouped.get(key).titles.push(row.title);
      }
    }

    return grouped;
  }

  static buildCsvContent(language = 'de', sessionId = null, marketplace = 'ebay') {
    const grouped = this.getGroupedRows(language, sessionId, marketplace);

    const header = ['item_number', 'sku', 'updated_price', 'new_title'];

    const lines = [header.map((v) => escapeCsv(v)).join(CSV_DELIMITER)];

    for (const item of grouped.values()) {
      const title = item.titles[0] || '';
      const updatedPrice = formatPriceForCsv(item.suggested_price ?? item.price ?? '');

      const row = [
        item.item_number || '',
        item.sku || '',
        updatedPrice,
        title
      ];
      lines.push(row.map((v) => escapeCsv(v)).join(CSV_DELIMITER));
    }

    return { csvContent: `${lines.join('\n')}\n`, count: grouped.size };
  }

  static buildDirectSessionCsvContent(language = 'de', sessionId = null, marketplace = 'ebay') {
    const db = DatabaseManager.getDatabase();
    const rows = sessionId
      ? db
          .prepare(
            `SELECT p.id as product_id, p.item_number, p.sku, p.original_title, p.price, p.sold_count, p.suggested_price, p.price_adjustment,
                    COALESCE(
                      (
                        SELECT gt.title
                        FROM generated_titles gt
                        WHERE gt.product_id = p.id
                          AND gt.session_id = p.session_id
                          AND COALESCE(gt.marketplace, 'ebay') = ?
                        ORDER BY CASE WHEN gt.language = ? THEN 0 ELSE 1 END, gt.variation_number ASC, gt.created_at DESC
                        LIMIT 1
                      ),
                      p.original_title,
                      ''
                    ) AS title
             FROM products p
             WHERE p.session_id = ?
             ORDER BY p.id ASC`
          )
          .all(marketplace, language, sessionId)
          .filter((row) => isZeroSoldCount(row.sold_count))
      : [];

    const header = ['item_number', 'sku', 'updated_price', 'new_title'];
    const lines = [header.map((v) => escapeCsv(v)).join(CSV_DELIMITER)];

    rows.forEach((row) => {
      const updatedPrice = formatPriceForCsv(row.suggested_price ?? row.price ?? '');
      const line = [
        row.item_number || '',
        row.sku || '',
        updatedPrice,
        row.title || ''
      ];
      lines.push(line.map((v) => escapeCsv(v)).join(CSV_DELIMITER));
    });

    return { csvContent: `${lines.join('\n')}\n`, count: rows.length };
  }

  static async exportGeneratedTitles(filePath, language = 'de', sessionId = null, marketplace = 'ebay') {
    const { csvContent, count } = this.buildCsvContent(language, sessionId, marketplace);
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, `\uFEFF${csvContent}`, 'utf8');
    return { success: true, filePath, count };
  }
}
