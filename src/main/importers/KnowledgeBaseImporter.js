import ExcelJS from 'exceljs';
import KnowledgeBaseStore from '../services/KnowledgeBaseStore.js';

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function mapHeaders(headerRow) {
  const map = {};
  headerRow.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    map[header] = colNumber;
  });
  return map;
}

function getCell(row, colIndex) {
  if (!colIndex) return null;
  const cell = row.getCell(colIndex);
  if (!cell) return null;
  const value = cell.value;
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (value.text) return value.text;
    if (value.result !== undefined && value.result !== null) return value.result;
    if (value.richText && Array.isArray(value.richText)) {
      return value.richText.map((x) => x.text || '').join('');
    }
  }
  return value;
}

function getFirstCell(row, headerMap, candidates) {
  for (const key of candidates) {
    const col = headerMap[normalizeHeader(key)];
    const value = getCell(row, col);
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

export default class KnowledgeBaseImporter {
  static async importFile(filePath, onProgress, options = {}) {
    if (!filePath) throw new Error('No file path provided');
    if (onProgress) onProgress({ percent: 2, message: 'reading Excel' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('No worksheet found in Excel file');

    KnowledgeBaseStore.ensureSchema();
    const headerMap = mapHeaders(sheet.getRow(1));

    const collectEntries = Boolean(options?.collectEntries);
    const entries = collectEntries ? new Map() : null;
    let total = 0;
    let imported = 0;
    let skipped = 0;
    const errors = [];
    const totalRows = Math.max(0, sheet.rowCount - 1);
    if (onProgress) onProgress({ percent: 8, message: `saving local DB 0/${totalRows}` });

    for (let i = 2; i <= sheet.rowCount; i += 1) {
      const row = sheet.getRow(i);
      const title = getFirstCell(row, headerMap, [
        'Old title', 'Artiklename', 'Artikelname', 'Title', 'original_title', 'Angebotstitel', 'name'
      ]);
      const sku = getFirstCell(row, headerMap, [
        'SKU', 'Artiklenummer (SKU)', 'Artikelnummer (SKU)', 'Custom label (SKU)', 'sku', 'Artikelnummer', 'cArtNr'
      ]);
      const itemNumber = getFirstCell(row, headerMap, [
        'Item number', 'item_number', 'ebay item number', 'Angebotsnummer', 'ItemID', 'item_id'
      ]);
      if (!title) {
        skipped += 1;
        continue;
      }
      total += 1;

      const built = KnowledgeBaseStore.buildEntryFromSpreadsheetRow({
        itemNumber,
        sku,
        title,
        source: 'kb_excel',
        fields: {
          cartridgeModels: getFirstCell(row, headerMap, [
            'Cartridge model', 'cartridge_model', 'Cartridge mode', 'Cartridge Model', 'Tintenpatrone', 'Tonermodell'
          ]),
          category: getFirstCell(row, headerMap, [
            'Types', 'Type', 'Category', 'category', 'Kategorie', 'typ'
          ]),
          printerBrand: getFirstCell(row, headerMap, [
            'Printer Brand', 'printer_brand', 'Druckermarke', 'Hersteller'
          ]),
          series: getFirstCell(row, headerMap, ['Series', 'series', 'Serie', 'Produktserie']),
          printerModels: getFirstCell(row, headerMap, [
            'Printer model', 'printer_model', 'Printer models', 'Drucker', 'Druckermodell'
          ]),
          setOf: getFirstCell(row, headerMap, ['Set of', 'set_of', 'Set', 'Packung']),
          qty: getFirstCell(row, headerMap, ['Qty', 'Quantity', 'qty', 'Menge', 'Anzahl']),
          color: getFirstCell(row, headerMap, ['Farbe', 'Color', 'color', 'Colour', 'Tinte'])
        }
      });
      if (!built) {
        skipped += 1;
        continue;
      }
      try {
        const ok = KnowledgeBaseStore.upsertEntry(built);
        if (ok) imported += 1;
        else skipped += 1;
        if (entries) {
          // De-dupe by normalized title for remote sync (last entry wins)
          entries.set(built.normalizedTitle, built);
        }
      } catch (error) {
        errors.push({ row: i, error: error.message });
      }

      if (onProgress && totalRows > 0 && ((i - 1) % 200 === 0 || i === sheet.rowCount)) {
        const processed = i - 1;
        const localPercent = 8 + Math.round((processed / totalRows) * 62);
        const pct = Math.min(70, localPercent);
        onProgress({
          percent: pct,
          message: `saving local DB ${Math.min(processed, totalRows)}/${totalRows} (${pct}%)`
        });
      }
    }

    return {
      total,
      imported,
      skipped,
      errors,
      entries: entries ? Array.from(entries.values()) : undefined
    };
  }
}
