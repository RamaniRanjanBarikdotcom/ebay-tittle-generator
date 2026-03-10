import DatabaseManager from '../sqlite.js';

/**
 * Product Model
 */
class Product {
  static create(productData) {
    const db = DatabaseManager.getDatabase();
    const {
      item_number,
      sku,
      original_title,
      category,
      brand,
      category_model,
      ebay_category_name,
      price,
      quantity,
      sold_count,
      suggested_price,
      price_adjustment,
      price_update_status,
      raw_query_data,
      source
    } = productData;

    const query = `
      INSERT INTO products (
        item_number, sku, original_title, category, brand,
        category_model, ebay_category_name, price, quantity, sold_count, suggested_price,
        price_adjustment, price_update_status, raw_query_data, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      const stmt = db.prepare(query);
      const result = stmt.run(
        item_number,
        sku,
        original_title,
        category || null,
        brand || null,
        category_model || null,
        ebay_category_name || null,
        price ?? null,
        quantity ?? null,
        sold_count ?? null,
        suggested_price ?? null,
        price_adjustment || null,
        price_update_status || null,
        raw_query_data || null,
        source || 'excel'
      );

      return { success: true, data: result.lastInsertRowid, error: null };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return {
          success: false,
          data: null,
          error: `Product with item number ${item_number} already exists`
        };
      }
      return { success: false, data: null, error: error.message };
    }
  }

  static createMany(products) {
    const db = DatabaseManager.getDatabase();
    const query = `
      INSERT INTO products (
        item_number, sku, original_title, category, brand,
        category_model, ebay_category_name, price, quantity, sold_count, suggested_price,
        price_adjustment, price_update_status, raw_query_data, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = db.prepare(query);
    const insertMany = db.transaction((rows) => {
      for (const product of rows) {
        stmt.run(
          product.item_number,
          product.sku,
          product.original_title,
          product.category || null,
          product.brand || null,
          product.category_model || null,
          product.ebay_category_name || null,
          product.price ?? null,
          product.quantity ?? null,
          product.sold_count ?? null,
          product.suggested_price ?? null,
          product.price_adjustment || null,
          product.price_update_status || null,
          product.raw_query_data || null,
          product.source || 'excel'
        );
      }
    });

    try {
      insertMany(products);
      return { success: true, data: products.length, error: null };
    } catch (error) {
      console.error('[Product Model] Batch insert error:', error);
      return { success: false, data: null, error: error.message };
    }
  }

  static createManyIgnore(products) {
    const db = DatabaseManager.getDatabase();
    const query = `
      INSERT INTO products (
        item_number, sku, original_title, category, brand,
        category_model, ebay_category_name, price, quantity, sold_count, suggested_price,
        price_adjustment, price_update_status, raw_query_data, source, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = db.prepare(query);
    let inserted = 0;

    const insertMany = db.transaction((rows) => {
      for (const product of rows) {
        stmt.run(
          product.item_number,
          product.sku,
          product.original_title,
          product.category || null,
          product.brand || null,
          product.category_model || null,
          product.ebay_category_name || null,
          product.price ?? null,
          product.quantity ?? null,
          product.sold_count ?? null,
          product.suggested_price ?? null,
          product.price_adjustment || null,
          product.price_update_status || null,
          product.raw_query_data || null,
          product.source || 'excel',
          product.session_id || null
        );
        inserted += 1;
      }
    });

    try {
      insertMany(products);
      return { success: true, data: { inserted, skipped: 0 }, error: null };
    } catch (error) {
      console.error('[Product Model] Batch insert error:', error);
      return { success: false, data: null, error: error.message };
    }
  }

  static findById(id) {
    const db = DatabaseManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
    const result = stmt.get(id) || null;
    return { success: true, data: result, error: null };
  }

  static findByItemNumber(itemNumber) {
    const db = DatabaseManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM products WHERE item_number = ?');
    const result = stmt.get(itemNumber) || null;
    return { success: true, data: result, error: null };
  }

  static findAll(filters = {}) {
    const db = DatabaseManager.getDatabase();
    const conditions = [];
    const params = [];

    if (filters.source) {
      conditions.push('source = ?');
      params.push(filters.source);
    }
    if (filters.brand) {
      conditions.push('brand = ?');
      params.push(filters.brand);
    }
    if (filters.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM products ${whereClause} ORDER BY created_at DESC`;

    try {
      const rows = db.prepare(query).all(...params);
      return { success: true, data: rows, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }

  static update(id, updates) {
    const db = DatabaseManager.getDatabase();
    const allowedFields = [
      'original_title',
      'category',
      'brand',
      'category_model',
      'ebay_category_name',
      'price',
      'quantity'
    ];

    const fields = [];
    const values = [];

    for (const key of allowedFields) {
      if (key in updates) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (!fields.length) {
      return { success: false, data: null, error: 'No valid fields to update' };
    }

    const query = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    try {
      const result = db.prepare(query).run(...values);
      return { success: true, data: result.changes, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }

  static delete(id) {
    const db = DatabaseManager.getDatabase();
    try {
      const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
      return { success: true, data: result.changes, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  }
}

export default Product;
