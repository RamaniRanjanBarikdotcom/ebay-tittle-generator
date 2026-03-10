import DatabaseManager from '../sqlite.js';

/**
 * GeneratedTitle Model
 */
class GeneratedTitle {
  static create(titleData) {
    const db = DatabaseManager.getDatabase();
    const {
      product_id,
      title,
      title_hash,
      language,
      variation_number,
      model_rotation,
      char_length,
      is_active
    } = titleData;

    const query = `
      INSERT INTO generated_titles (
        product_id, title, title_hash, language, variation_number,
        model_rotation, char_length, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const stmt = db.prepare(query);
      const result = stmt.run(
        product_id,
        title,
        title_hash,
        language || 'de',
        variation_number ?? null,
        model_rotation || null,
        char_length ?? title.length,
        is_active ?? 1
      );
      return { success: true, data: result.lastInsertRowid, error: null };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return { success: false, data: null, error: 'Duplicate title hash' };
      }
      return { success: false, data: null, error: error.message };
    }
  }

  static createMany(titles) {
    const db = DatabaseManager.getDatabase();
    const query = `
      INSERT INTO generated_titles (
        product_id, title, title_hash, language, variation_number,
        model_rotation, char_length, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = db.prepare(query);
    const insertMany = db.transaction((rows) => {
      for (const t of rows) {
        stmt.run(
          t.product_id,
          t.title,
          t.title_hash,
          t.language || 'de',
          t.variation_number ?? null,
          t.model_rotation || null,
          t.char_length ?? t.title.length,
          t.is_active ?? 1
        );
      }
    });

    try {
      insertMany(titles);
      return { success: true, data: titles.length, error: null };
    } catch (error) {
      console.error('[GeneratedTitle Model] Batch insert error:', error);
      return { success: false, data: null, error: error.message };
    }
  }

  static findById(id) {
    const db = DatabaseManager.getDatabase();
    const result = db.prepare('SELECT * FROM generated_titles WHERE id = ?').get(id) || null;
    return { success: true, data: result, error: null };
  }

  static findByProductId(productId) {
    const db = DatabaseManager.getDatabase();
    const rows = db
      .prepare('SELECT * FROM generated_titles WHERE product_id = ? ORDER BY variation_number ASC')
      .all(productId);
    return { success: true, data: rows, error: null };
  }

  static markUsed(id) {
    const db = DatabaseManager.getDatabase();
    try {
      const result = db
        .prepare(
          'UPDATE generated_titles SET used_count = used_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .run(id);
      return { success: true, data: result.changes, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }

  static deactivate(id) {
    const db = DatabaseManager.getDatabase();
    try {
      const result = db
        .prepare('UPDATE generated_titles SET is_active = 0 WHERE id = ?')
        .run(id);
      return { success: true, data: result.changes, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }

  static updateTitle(id, title, title_hash, char_length) {
    const db = DatabaseManager.getDatabase();
    try {
      const result = db
        .prepare(
          'UPDATE generated_titles SET title = ?, title_hash = ?, char_length = ? WHERE id = ?'
        )
        .run(title, title_hash, char_length, id);
      return { success: true, data: result.changes, error: null };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return { success: false, data: null, error: 'Duplicate title hash' };
      }
      return { success: false, data: null, error: error.message };
    }
  }
}

export default GeneratedTitle;
