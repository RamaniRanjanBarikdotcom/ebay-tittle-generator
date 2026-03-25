-- ================================================================
-- eBay Title Generator Database Schema
-- Version: 1.0.0
-- SQLite Database
-- ================================================================

-- Settings table (no dependencies)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  value_type TEXT DEFAULT 'string',
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Language settings table (no dependencies)
CREATE TABLE IF NOT EXISTS language_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language_code TEXT UNIQUE NOT NULL,
  language_name TEXT NOT NULL,
  compatible_word TEXT NOT NULL,
  toner_word TEXT,
  ink_word TEXT,
  drum_word TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Products table (no dependencies)
CREATE TABLE IF NOT EXISTS products (
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

-- Generated titles table (depends on products)
CREATE TABLE IF NOT EXISTS generated_titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  sku TEXT,
  item_number TEXT,
  title TEXT NOT NULL,
  title_hash TEXT UNIQUE NOT NULL,
  language TEXT DEFAULT 'de',
  variation_number INTEGER CHECK(variation_number IN (1, 2, 3)),
  model_rotation TEXT,
  char_length INTEGER,
  is_active BOOLEAN DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  last_used_at DATETIME,
  session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Title history table (depends on products and generated_titles)
CREATE TABLE IF NOT EXISTS title_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  generated_title_id INTEGER,
  action TEXT NOT NULL CHECK(action IN ('imported', 'generated', 'exported', 'deleted')),
  destination TEXT CHECK(destination IN ('excel', 'google_sheets', 'jtl', NULL)),
  export_filename TEXT,
  metadata TEXT,
  session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (generated_title_id) REFERENCES generated_titles(id)
);

-- App logs table
CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Extracted elements cache — written once per SKU, never re-extracted
CREATE TABLE IF NOT EXISTS extracted_elements (
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
);

-- Import count per SKU — tracks odd/even for price toggle
CREATE TABLE IF NOT EXISTS sku_import_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  item_number TEXT NOT NULL,
  import_count INTEGER DEFAULT 0,
  last_imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sku, item_number)
);

-- Price history — full audit trail of every price change
CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  item_number TEXT NOT NULL,
  import_number INTEGER,
  price_before REAL,
  price_after REAL,
  price_action TEXT,
  sold_qty REAL,
  reason TEXT,
  session_id TEXT,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CSV exports archive table
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

-- ================================================================
-- INDEXES (Create after tables for best performance)
-- ================================================================

-- Products indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_item_number ON products(item_number);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);

-- Generated titles indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_title_hash ON generated_titles(title_hash);
CREATE INDEX IF NOT EXISTS idx_product_titles ON generated_titles(product_id);
CREATE INDEX IF NOT EXISTS idx_generated_titles_sku ON generated_titles(sku);
CREATE INDEX IF NOT EXISTS idx_generated_titles_item_number ON generated_titles(item_number);
CREATE INDEX IF NOT EXISTS idx_active_titles ON generated_titles(is_active);
CREATE INDEX IF NOT EXISTS idx_language ON generated_titles(language);

-- History indexes
CREATE INDEX IF NOT EXISTS idx_history_product ON title_history(product_id);
CREATE INDEX IF NOT EXISTS idx_history_action ON title_history(action);
CREATE INDEX IF NOT EXISTS idx_history_date ON title_history(created_at);
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_csv_exports_session ON csv_exports(session_id);
CREATE INDEX IF NOT EXISTS idx_csv_exports_created_at ON csv_exports(created_at);
CREATE INDEX IF NOT EXISTS idx_extracted_elements_sku ON extracted_elements(sku);
CREATE INDEX IF NOT EXISTS idx_sku_import_counts_sku ON sku_import_counts(sku);
CREATE INDEX IF NOT EXISTS idx_price_history_sku ON price_history(sku);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);

-- ================================================================
-- DEFAULT DATA
-- ================================================================

-- Insert default languages
INSERT OR IGNORE INTO language_settings
(language_code, language_name, compatible_word, toner_word, ink_word, drum_word)
VALUES
('de', 'Deutsch', 'kompatibel für', 'Toner', 'Tinte', 'Bildtrommel'),
('en', 'English', 'compatible with', 'Toner', 'Ink', 'Drum'),
('fr', 'Français', 'compatible avec', 'Toner', 'Encre', 'Tambour'),
('es', 'Español', 'compatible con', 'Tóner', 'Tinta', 'Tambor'),
('it', 'Italiano', 'compatibile con', 'Toner', 'Inchiostro', 'Tamburo');

-- Insert default app settings
INSERT OR IGNORE INTO app_settings (key, value, value_type, description) VALUES
('default_language', 'de', 'string', 'Default language for title generation'),
('max_title_length', '80', 'number', 'Maximum eBay title length in characters'),
('variations_per_product', '3', 'number', 'Number of title variations to generate per product'),
('auto_detect_language', 'true', 'boolean', 'Automatically detect language from original title'),
('theme', 'light', 'string', 'UI theme (light or dark)'),
('last_import_path', '', 'string', 'Last used import file path'),
('google_refresh_token', '', 'string', 'Google OAuth refresh token (encrypted)'),
('jtl_connection_string', '', 'string', 'JTL database connection string (encrypted)');

-- ================================================================
-- TRIGGERS (Optional - for auto-updating timestamps)
-- ================================================================

CREATE TRIGGER IF NOT EXISTS update_product_timestamp
AFTER UPDATE ON products
BEGIN
  UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_settings_timestamp
AFTER UPDATE ON app_settings
BEGIN
  UPDATE app_settings SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;
