import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import DatabaseManager from '../database/sqlite.js';
import ExcelExporter from '../exporters/ExcelExporter.js';
import CsvExporter from '../exporters/CsvExporter.js';
import TitleHistory from '../database/models/TitleHistory.js';

const CSV_EXPORT_FOLDER = 'New generated tittles';

export default class ExportRunner {
  static formatTimestamp(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
      date.getHours()
    )}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }

  static getExportableCount(sessionId) {
    if (!sessionId) return 0;
    const db = DatabaseManager.getDatabase();
    const rows = db
      .prepare('SELECT sold_count FROM products WHERE session_id = ?')
      .all(sessionId);
    return rows.filter((row) => {
      const value = row?.sold_count;
      if (value === 0 || value === '0') return true;
      const cleaned = String(value ?? '').trim().replace(/[^\d.,\-+]/g, '');
      if (!cleaned) return false;
      const parsed = Number(cleaned.replace(',', '.'));
      return Number.isFinite(parsed) && parsed === 0;
    }).length;
  }

  static resolveSessionForExport(preferredSessionId) {
    const db = DatabaseManager.getDatabase();
    const hasTitles = (sid) => {
      if (!sid) return false;
      const row = db.prepare(
        'SELECT 1 FROM generated_titles WHERE session_id IS ? LIMIT 1'
      ).get(sid);
      return Boolean(row);
    };

    if (preferredSessionId && hasTitles(preferredSessionId)) {
      return { sessionId: preferredSessionId, source: 'current' };
    }

    const latest = db.prepare(
      `SELECT session_id
       FROM generated_titles
       WHERE session_id IS NOT NULL AND session_id != ''
       ORDER BY datetime(created_at) DESC
       LIMIT 1`
    ).get();
    if (latest?.session_id) {
      return { sessionId: latest.session_id, source: preferredSessionId ? 'fallback_latest' : 'latest' };
    }

    return { sessionId: preferredSessionId || null, source: 'none' };
  }

  static assertHasExportableRows(sessionId) {
    if (!sessionId) {
      throw new Error('No session available for export');
    }
    const count = this.getExportableCount(sessionId);
    if (!count) {
      throw new Error('No rows to export');
    }
    const db = DatabaseManager.getDatabase();
    const hasTitles = db.prepare(
      'SELECT COUNT(*) as c FROM generated_titles WHERE session_id IS ?'
    ).get(sessionId)?.c || 0;
    if (!hasTitles) {
      throw new Error('No generated titles to export');
    }
  }

  static findHistoryProductId(sessionId) {
    const db = DatabaseManager.getDatabase();
    const row = sessionId
      ? db.prepare('SELECT id FROM products WHERE session_id = ? ORDER BY id ASC LIMIT 1').get(sessionId)
      : db.prepare('SELECT id FROM products ORDER BY id ASC LIMIT 1').get();
    return row?.id || null;
  }

  static recordHistory({ destination, exportFilename, language, sessionId, metadata = {} }) {
    const productId = this.findHistoryProductId(sessionId);
    if (!productId) return;
    TitleHistory.create({
      product_id: productId,
      action: 'exported',
      destination,
      export_filename: exportFilename,
      metadata: { language, ...metadata },
      session_id: sessionId || null
    });
  }

  static ensureCsvExportsTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS csv_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        language TEXT DEFAULT 'de',
        folder_path TEXT,
        file_name TEXT,
        file_path TEXT,
        row_count INTEGER DEFAULT 0,
        csv_content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const columns = db.prepare('PRAGMA table_info(csv_exports)').all().map((c) => c.name);
    const ensure = (name, typeDef) => {
      if (!columns.includes(name)) {
        db.exec(`ALTER TABLE csv_exports ADD COLUMN ${name} ${typeDef}`);
      }
    };
    ensure('session_id', 'TEXT');
    ensure('language', "TEXT DEFAULT 'de'");
    ensure('folder_path', 'TEXT');
    ensure('file_name', 'TEXT');
    ensure('file_path', 'TEXT');
    ensure('row_count', 'INTEGER DEFAULT 0');
    ensure('csv_content', 'TEXT');
    ensure('created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  }

  static saveCsvInDatabase({ sessionId, language, folderPath, fileName, filePath, csvContent, count }) {
    const db = DatabaseManager.getDatabase();
    this.ensureCsvExportsTable(db);

    const result = db
      .prepare(
        `INSERT INTO csv_exports (
          session_id, language, folder_path, file_name, file_path, row_count, csv_content
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(sessionId || null, language || 'de', folderPath, fileName, filePath, count || 0, csvContent || '');

    return result.lastInsertRowid;
  }

  static async resolveCsvExportPath() {
    const basePath = app.getPath('documents');
    const folderPath = path.join(basePath, CSV_EXPORT_FOLDER);
    await fs.mkdir(folderPath, { recursive: true });

    const timestamp = this.formatTimestamp(new Date());
    const fileName = `Generated_Titles_${timestamp}.csv`;
    const filePath = path.join(folderPath, fileName);

    return { folderPath, fileName, filePath };
  }

  static async exportExcelToFile({ filePath, language = 'de', sessionId, onProgress }) {
    if (!filePath) {
      throw new Error('No file path provided');
    }
    const resolved = this.resolveSessionForExport(sessionId);
    this.assertHasExportableRows(resolved.sessionId);

    if (onProgress) {
      onProgress({ scope: 'export', percent: 10, message: 'Writing Excel file' });
    }

<<<<<<< HEAD
    const result = await ExcelExporter.exportGeneratedTitles(filePath, language, resolved.sessionId);
=======
    const result = await ExcelExporter.exportGeneratedTitles(filePath, language, sessionId, 'ebay');
>>>>>>> new-fix
    this.recordHistory({
      destination: 'excel',
      exportFilename: filePath,
      language,
      sessionId: resolved.sessionId,
      metadata: { format: 'xlsx', count: result.count || 0 }
    });

    if (onProgress) {
      onProgress({ scope: 'export', percent: 100, message: 'Export complete' });
    }

    return { ...result, sessionId: resolved.sessionId, sessionSource: resolved.source };
  }

  static async exportCsvToStorage({ language = 'de', sessionId, onProgress, directProductCsv = false }) {
    const resolved = this.resolveSessionForExport(sessionId);
    this.assertHasExportableRows(resolved.sessionId);

    if (onProgress) {
      onProgress({ scope: 'export', percent: 10, message: 'Preparing CSV export location' });
    }

    const { folderPath, fileName, filePath } = await this.resolveCsvExportPath();

    if (onProgress) {
      onProgress({ scope: 'export', percent: 40, message: 'Building CSV content' });
    }

    const { csvContent, count } = directProductCsv
<<<<<<< HEAD
      ? CsvExporter.buildDirectSessionCsvContent(language, resolved.sessionId)
      : CsvExporter.buildCsvContent(language, resolved.sessionId);
=======
      ? CsvExporter.buildDirectSessionCsvContent(language, sessionId, 'ebay')
      : CsvExporter.buildCsvContent(language, sessionId, 'ebay');
>>>>>>> new-fix

    if (onProgress) {
      onProgress({ scope: 'export', percent: 70, message: 'Saving CSV file and archiving in database' });
    }

    await fs.writeFile(filePath, `\uFEFF${csvContent}`, 'utf8');
    const exportId = this.saveCsvInDatabase({
      sessionId: resolved.sessionId,
      language,
      folderPath,
      fileName,
      filePath,
      csvContent,
      count
    });

    this.recordHistory({
      destination: 'csv',
      exportFilename: filePath,
      language,
      sessionId: resolved.sessionId,
      metadata: {
        format: 'csv',
        count,
        export_id: exportId,
        folder_path: folderPath,
        file_name: fileName,
        storage: 'file_and_database'
      }
    });

    if (onProgress) {
      onProgress({ scope: 'export', percent: 100, message: 'CSV export complete' });
    }

    return {
      success: true,
      exportId,
      filePath,
      folderPath,
      fileName,
      count,
      sessionId: resolved.sessionId,
      sessionSource: resolved.source
    };
  }
}
