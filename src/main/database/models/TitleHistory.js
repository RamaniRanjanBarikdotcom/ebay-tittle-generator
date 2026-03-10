import DatabaseManager from '../sqlite.js';

/**
 * TitleHistory Model
 */
class TitleHistory {
  static create(historyData) {
    const db = DatabaseManager.getDatabase();
    const {
      product_id,
      generated_title_id,
      action,
      destination,
      export_filename,
      metadata
    } = historyData;

    const query = `
      INSERT INTO title_history (
        product_id, generated_title_id, action, destination, export_filename, metadata, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const stmt = db.prepare(query);
      const result = stmt.run(
        product_id,
        generated_title_id || null,
        action,
        destination || null,
        export_filename || null,
        metadata ? JSON.stringify(metadata) : null,
        historyData.session_id || null
      );
      return { success: true, data: result.lastInsertRowid, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }

  static createMany(entries) {
    const db = DatabaseManager.getDatabase();
    const query = `
      INSERT INTO title_history (
        product_id, generated_title_id, action, destination, export_filename, metadata, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const stmt = db.prepare(query);
    const insertMany = db.transaction((rows) => {
      for (const entry of rows) {
        stmt.run(
          entry.product_id,
          entry.generated_title_id || null,
          entry.action,
          entry.destination || null,
          entry.export_filename || null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.session_id || null
        );
      }
    });

    try {
      insertMany(entries);
      return { success: true, data: entries.length, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }

  static findByProductId(productId, limit = 100) {
    const db = DatabaseManager.getDatabase();
    try {
      const rows = db
        .prepare(
          'SELECT * FROM title_history WHERE product_id = ? ORDER BY created_at DESC LIMIT ?'
        )
        .all(productId, limit);
      return { success: true, data: rows, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }

  static findRecent(limit = 100) {
    const db = DatabaseManager.getDatabase();
    try {
      const rows = db
        .prepare('SELECT * FROM title_history ORDER BY created_at DESC LIMIT ?')
        .all(limit);
      return { success: true, data: rows, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }
}

export default TitleHistory;
