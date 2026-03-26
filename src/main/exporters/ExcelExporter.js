import ExcelJS from 'exceljs';
import DatabaseManager from '../database/sqlite.js';

function isZeroSoldCount(value) {
  if (value === 0 || value === '0') return true;
  const cleaned = String(value ?? '').trim().replace(/[^\d.,\-+]/g, '');
  if (!cleaned) return false;
  const parsed = Number(cleaned.replace(',', '.'));
  return Number.isFinite(parsed) && parsed === 0;
}

export default class ExcelExporter {
  static async exportGeneratedTitles(filePath, language = 'de', sessionId = null, marketplace = 'ebay') {
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

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Generated Titles');

    sheet.addRow([
      'item_number',
      'sku',
      'updated_price',
      'new_title'
    ]);
    for (const item of grouped.values()) {
      const title = item.titles[0] || '';
      const updatedPrice = item.suggested_price ?? item.price ?? '';
      sheet.addRow([
        item.item_number,
        item.sku,
        updatedPrice,
        title
      ]);
    }

    await workbook.xlsx.writeFile(filePath);
    return { success: true, filePath, count: grouped.size };
  }
}
