import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';
import { app } from 'electron';

/**
 * DatabaseManager - Singleton for SQLite database management
 */
class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = null;
  }

  /**
   * Initialize database connection and run schema migrations.
   * @returns {Promise<boolean>}
   */
  async initialize() {
    try {
      const userDataPath = app.getPath('userData');
      this.dbPath = path.join(userDataPath, 'ebay-titles.db');

      await fs.ensureDir(userDataPath);

      const dbExists = await fs.pathExists(this.dbPath);
      const isFirstRun = !dbExists;

      this.db = new Database(this.dbPath, {
        verbose: null,
        fileMustExist: false
      });

      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');

      await this.runMigrations();

      if (isFirstRun) {
        console.log('[Database] First run - database created successfully');
      } else {
        console.log('[Database] Database loaded successfully');
      }

      await this.verifyDatabase();
      return true;
    } catch (error) {
      console.error('[Database] Initialization error:', error);
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  /**
   * Load and execute schema.sql
   */
  async runMigrations() {
    try {
      const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
      const schemaPath = path.join(appRoot, 'database', 'schema.sql');

      if (!(await fs.pathExists(schemaPath))) {
        throw new Error(`Schema file not found at: ${schemaPath}`);
      }

      const schema = await fs.readFile(schemaPath, 'utf-8');

      // Pre-migration: ensure columns that schema.sql indexes depend on exist BEFORE
      // exec(schema) runs. On existing DBs the tables already exist with old schema
      // (no sku/item_number), so CREATE TABLE IF NOT EXISTS is a no-op — but the
      // subsequent CREATE INDEX statements reference sku/item_number and would fail.
      const preMigrate = [
        { table: 'generated_titles',   column: 'sku',         type: 'TEXT' },
        { table: 'generated_titles',   column: 'item_number', type: 'TEXT' },
        { table: 'extracted_elements', column: 'sku',         type: 'TEXT' },
        { table: 'extracted_elements', column: 'item_number', type: 'TEXT' }
      ];
      for (const { table, column, type } of preMigrate) {
        const exists = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
        ).get(table);
        if (exists) this.ensureColumn(table, column, type);
      }

      this.db.exec(schema);
      this.ensureColumn('products', 'session_id', 'TEXT');
      this.ensureColumn('products', 'raw_query_data', 'TEXT');
      this.ensureColumn('products', 'sold_count', 'INTEGER');
      this.ensureColumn('products', 'suggested_price', 'REAL');
      this.ensureColumn('products', 'price_adjustment', 'TEXT');
      this.ensureColumn('products', 'price_update_status', 'TEXT');
      this.ensureColumn('price_history', 'title_snapshot', 'TEXT');
      this.ensureColumn('generated_titles', 'session_id', 'TEXT');
      this.ensureColumn('generated_titles', 'marketplace', 'TEXT');
      this.ensureColumn('generated_titles', 'sku', 'TEXT');
      this.ensureColumn('generated_titles', 'item_number', 'TEXT');
      this.ensureColumn('title_history', 'session_id', 'TEXT');
      this.backfillGeneratedTitleKeys();
      this.ensureExtractedElementsSchema();
      this.ensureProductsAllowDuplicates();
      this.ensureTitleHistoryDestinationFlex();
      console.log('[Database] Schema migration completed');
    } catch (error) {
      console.error('[Database] Migration error:', error);
      throw error;
    }
  }

  ensureColumn(tableName, columnName, columnType) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some((c) => c.name === columnName);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
    }
  }

  ensureExtractedElementsSchema() {
    // If the table has a product_id column (old schema), it must be dropped and
    // recreated. extracted_elements is a cache — data loss is acceptable.
    const columns = this.db.prepare('PRAGMA table_info(extracted_elements)').all();
    const hasProductId = columns.some((c) => c.name === 'product_id');
    const hasSku = columns.some((c) => c.name === 'sku');

    if (hasProductId || !hasSku) {
      this.db.exec('DROP TABLE IF EXISTS extracted_elements');
      this.db.exec(`
        CREATE TABLE extracted_elements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT NOT NULL,
          item_number TEXT NOT NULL,
          original_title TEXT,
          category TEXT,
          cartridge_models TEXT,
          brand TEXT,
          product_brand TEXT,
          printer_brand TEXT,
          series TEXT,
          printer_models TEXT,
          bracket_codes TEXT,
          kompatibel TEXT,
          set_of TEXT,
          qty TEXT,
          color TEXT,
          extra TEXT,
          verification_status TEXT,
          verification_confidence INTEGER,
          verification_issues TEXT,
          variation_set_of TEXT,
          variation_color TEXT,
          variation_printer_model TEXT,
          extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(sku, item_number)
        )
      `);
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_extracted_elements_sku ON extracted_elements(sku)');
      console.log('[Database] extracted_elements recreated with correct schema');
      return;
    }

    // Existing table with correct base schema — add variation columns if missing
    const varCols = ['variation_set_of', 'variation_color', 'variation_printer_model'];
    for (const col of varCols) {
      if (!columns.some((c) => c.name === col)) {
        this.db.exec(`ALTER TABLE extracted_elements ADD COLUMN ${col} TEXT`);
        console.log(`[Database] extracted_elements: added column ${col}`);
      }
    }
  }

  backfillGeneratedTitleKeys() {
    this.db.exec(`
      UPDATE generated_titles
      SET
        sku = COALESCE(NULLIF(sku, ''), (
          SELECT p.sku FROM products p WHERE p.id = generated_titles.product_id
        )),
        item_number = COALESCE(NULLIF(item_number, ''), (
          SELECT p.item_number FROM products p WHERE p.id = generated_titles.product_id
        ))
      WHERE (sku IS NULL OR sku = '' OR item_number IS NULL OR item_number = '');
    `);
  }

  ensureProductsAllowDuplicates() {
    const indexes = this.db.prepare('PRAGMA index_list(products)').all();
    const uniqueIndex = indexes.find((idx) => {
      if (!idx.unique) return false;
      const cols = this.db.prepare(`PRAGMA index_info(${idx.name})`).all().map((c) => c.name);
      return cols.length === 1 && cols[0] === 'item_number';
    });
    if (!uniqueIndex) return;

    const columns = this.db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
    const hasSessionId = columns.includes('session_id');

    this.db.exec('PRAGMA foreign_keys = OFF');
    this.db.exec('BEGIN');
    this.db.exec(`
      CREATE TABLE products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_number TEXT NOT NULL,
        sku TEXT NOT NULL,
        original_title TEXT NOT NULL,
        category TEXT,
        brand TEXT,
        category_model TEXT,
        ebay_category_name TEXT,
        price REAL,
        quantity INTEGER,
        sold_count INTEGER,
        suggested_price REAL,
        price_adjustment TEXT,
        price_update_status TEXT,
        raw_query_data TEXT,
        source TEXT CHECK(source IN ('excel', 'google_sheets', 'jtl')),
        session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const selectColumns = [
      'id',
      'item_number',
      'sku',
      'original_title',
      'category',
      'brand',
      'category_model',
      'ebay_category_name',
      'price',
      'quantity',
      columns.includes('sold_count') ? 'sold_count' : 'NULL AS sold_count',
      columns.includes('suggested_price') ? 'suggested_price' : 'NULL AS suggested_price',
      columns.includes('price_adjustment') ? 'price_adjustment' : 'NULL AS price_adjustment',
      columns.includes('price_update_status') ? 'price_update_status' : 'NULL AS price_update_status',
      columns.includes('raw_query_data') ? 'raw_query_data' : 'NULL AS raw_query_data',
      'source',
      hasSessionId ? 'session_id' : "NULL AS session_id",
      'created_at',
      'updated_at'
    ];
    this.db.exec(`
      INSERT INTO products_new (
        id, item_number, sku, original_title, category, brand, category_model,
        ebay_category_name, price, quantity, sold_count, suggested_price, price_adjustment,
        price_update_status, raw_query_data, source, session_id, created_at, updated_at
      )
      SELECT ${selectColumns.join(', ')} FROM products;
    `);
    this.db.exec('DROP TABLE products');
    this.db.exec('ALTER TABLE products_new RENAME TO products');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_products_item_number ON products(item_number)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_products_source ON products(source)');
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_product_timestamp
      AFTER UPDATE ON products
      BEGIN
        UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
    this.db.exec('COMMIT');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  ensureTitleHistoryDestinationFlex() {
    const tableSqlRow = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='title_history'")
      .get();
    const tableSql = String(tableSqlRow?.sql || '').toLowerCase();
    if (!tableSql.includes('destination text check')) {
      return;
    }

    this.db.exec('PRAGMA foreign_keys = OFF');
    this.db.exec('BEGIN');
    this.db.exec(`
      CREATE TABLE title_history_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        generated_title_id INTEGER,
        action TEXT NOT NULL CHECK(action IN ('imported', 'generated', 'exported', 'deleted')),
        destination TEXT,
        export_filename TEXT,
        metadata TEXT,
        session_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (generated_title_id) REFERENCES generated_titles(id)
      );
    `);
    this.db.exec(`
      INSERT INTO title_history_new (
        id, product_id, generated_title_id, action, destination, export_filename, metadata, session_id, created_at
      )
      SELECT id, product_id, generated_title_id, action, destination, export_filename, metadata, session_id, created_at
      FROM title_history;
    `);
    this.db.exec('DROP TABLE title_history');
    this.db.exec('ALTER TABLE title_history_new RENAME TO title_history');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_history_product ON title_history(product_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_history_action ON title_history(action)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_history_date ON title_history(created_at)');
    this.db.exec('COMMIT');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  /**
   * Verify required tables exist
   */
  async verifyDatabase() {
    const requiredTables = [
      'products',
      'generated_titles',
      'title_history',
      'language_settings',
      'app_settings',
      'extracted_elements',
      'sku_import_counts',
      'price_history'
    ];

    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((t) => t.name);

    for (const table of requiredTables) {
      if (!tables.includes(table)) {
        throw new Error(`Required table '${table}' not found in database`);
      }
    }

    console.log('[Database] Verification passed - all tables present');
  }

  /**
   * Clear working data (products + generated titles) but keep history
   */
  clearWorkingData() {
    try {
      const db = this.getDatabase();
      db.exec('PRAGMA foreign_keys = OFF');
      db.prepare('DELETE FROM generated_titles').run();
      db.prepare('DELETE FROM products').run();
      db.prepare("UPDATE app_settings SET value = '' WHERE key = 'current_session_id'").run();
      db.exec('PRAGMA foreign_keys = ON');
    } catch (error) {
      console.error('[Database] Clear working data error:', error);
    }
  }

  /**
   * Get database instance
   */
  getDatabase() {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a query safely
   */
  executeQuery(query, params = []) {
    try {
      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (error) {
      console.error('[Database] Query error:', error);
      console.error('[Database] Query:', query);
      console.error('[Database] Params:', params);
      throw error;
    }
  }

  /**
   * Execute a single insert
   */
  insert(query, params = []) {
    try {
      const stmt = this.db.prepare(query);
      const result = stmt.run(...params);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('[Database] Insert error:', error);
      throw error;
    }
  }

  /**
   * Execute multiple inserts in a transaction
   */
  insertMany(query, dataArray) {
    try {
      const stmt = this.db.prepare(query);
      const insertMany = this.db.transaction((data) => {
        for (const params of data) {
          stmt.run(...params);
        }
      });

      insertMany(dataArray);
      return dataArray.length;
    } catch (error) {
      console.error('[Database] Batch insert error:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[Database] Connection closed');
    }
  }

  /**
   * Get database file path
   */
  getPath() {
    return this.dbPath;
  }

  /**
   * Get database statistics
   */
  getStats() {
    try {
      const db = this.getDatabase();
      return {
        products: db.prepare('SELECT COUNT(*) as count FROM products').get().count,
        generatedTitles: db.prepare('SELECT COUNT(*) as count FROM generated_titles').get().count,
        history: db.prepare('SELECT COUNT(*) as count FROM title_history').get().count,
        databaseSize: fs.statSync(this.dbPath).size,
        databasePath: this.dbPath
      };
    } catch (error) {
      console.error('[Database] Stats error:', error);
      return null;
    }
  }
}

export default new DatabaseManager();
