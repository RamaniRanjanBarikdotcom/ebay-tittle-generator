import DatabaseManager from '../database/sqlite.js';
import { normalizeProductRecord } from './normalizeProduct.js';

export default class DatabaseSource {
  static getSessionProducts(sessionId) {
    if (!sessionId) return [];
    const db = DatabaseManager.getDatabase();
    return db
      .prepare('SELECT * FROM products WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId);
  }

  static getSessionProductsNormalized(sessionId) {
    return this.getSessionProducts(sessionId).map((row) => normalizeProductRecord(row));
  }
}
