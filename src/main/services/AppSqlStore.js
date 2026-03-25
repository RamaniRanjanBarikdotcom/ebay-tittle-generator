import DatabaseManager from '../database/sqlite.js';
import { decryptText } from '../utils/secureCrypto.js';
import { parsePort, preflightSqlTcp } from '../utils/sqlNetCheck.js';

function normalizeAuth(value) {
  return String(value || 'sql').trim().toLowerCase() === 'windows' ? 'windows' : 'sql';
}

function inferDbType(profile = {}) {
  const explicit = String(profile?.dbType || profile?.db_type || '').trim().toLowerCase();
  if (explicit === 'mysql') return 'mysql';
  if (explicit === 'mssql') return 'mssql';

  const port = Number(profile?.port);
  if (port === 3306) return 'mysql';
  if (port === 1433) return 'mssql';

  const host = String(profile?.server || '').toLowerCase();
  if (host.includes('your-database.de') || host.includes('your-server.de') || host.includes('mysql')) {
    return 'mysql';
  }
  return 'mssql';
}

function parseServerEndpoint(rawServer, rawPort) {
  const serverRaw = String(rawServer || '').trim();
  const [serverWithPort, instanceName] = serverRaw.split('\\');
  let serverHost = serverWithPort || serverRaw;
  let portFromServer = null;

  if (serverWithPort && serverWithPort.includes(',')) {
    const parts = serverWithPort.split(',');
    serverHost = parts[0].trim();
    const parsedPort = Number(parts[1]);
    if (!Number.isNaN(parsedPort) && parsedPort > 0) portFromServer = parsedPort;
  } else if (serverWithPort && serverWithPort.includes(':')) {
    const lastColon = serverWithPort.lastIndexOf(':');
    const maybePort = Number(serverWithPort.slice(lastColon + 1));
    if (!Number.isNaN(maybePort) && maybePort > 0) {
      serverHost = serverWithPort.slice(0, lastColon).trim();
      portFromServer = maybePort;
    }
  }

  const port = portFromServer ?? Number(rawPort);
  return {
    serverHost,
    instanceName,
    port: !Number.isNaN(port) && port > 0 ? port : null
  };
}

function validateServerHostOrThrow(serverValue) {
  const raw = String(serverValue || '').trim();
  if (!raw) throw new Error('Server name is required');
  const lower = raw.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    throw new Error('Server must be hostname/IP only, without http:// or https://');
  }
}

function toBool(v, fallback = true) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return fallback;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function normalizeTimestampValue(value) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function safeTextJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default class AppSqlStore {
  static readSetting(db, key, fallback = '') {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value ?? fallback;
  }

  static writeSetting(db, key, value, valueType = 'string') {
    db.prepare(
      `INSERT INTO app_settings (key, value, value_type)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type`
    ).run(key, String(value), valueType);
  }

  static getProfilesState() {
    const db = DatabaseManager.getDatabase();
    const profilesRaw = this.readSetting(db, 'app_db_profiles', '[]');
    const activeProfileId = this.readSetting(db, 'active_app_db_profile_id', '');
    let profiles = [];
    try {
      const parsed = JSON.parse(profilesRaw || '[]');
      if (Array.isArray(parsed)) profiles = parsed;
    } catch {
      profiles = [];
    }
    const normalized = profiles.map((p) => ({
      ...p,
      server: decryptText(p.server || ''),
      database: decryptText(p.database || ''),
      user: decryptText(p.user || ''),
      port: decryptText(p.port || ''),
      password: decryptText(p.password || '')
    }));
    return { profiles: normalized, activeProfileId };
  }

  static getActiveProfile() {
    const { profiles, activeProfileId } = this.getProfilesState();
    return profiles.find((p) => p.id === activeProfileId) || null;
  }

  static resolvePassword(profile) {
    return decryptText(profile?.password || '');
  }

  static getDbType(profile) {
    return inferDbType(profile);
  }

  static async loadMssqlModule() {
    const mod = await import('mssql');
    return mod?.default || mod;
  }

  static async loadMysqlModule() {
    const mod = await import('mysql2/promise');
    return mod?.default || mod;
  }

  static buildConfig(profile) {
    validateServerHostOrThrow(profile?.server);
    const dbType = this.getDbType(profile);
    const authentication = normalizeAuth(profile?.authentication);
    const { serverHost, instanceName, port } = parseServerEndpoint(profile?.server, profile?.port);

    if (dbType === 'mysql') {
      const useSsl = toBool(profile?.encrypt, false);
      const trustServerCertificate = toBool(profile?.trustServerCertificate, true);
      return {
        host: serverHost || String(profile?.server || '').trim(),
        port: parsePort(port, 3306),
        user: String(profile?.user || ''),
        password: this.resolvePassword(profile),
        database: String(profile?.database || ''),
        connectTimeout: Number(profile?.connectionTimeoutMs) || 30000,
        multipleStatements: true,
        ssl: useSsl
          ? {
              rejectUnauthorized: !trustServerCertificate
            }
          : undefined
      };
    }

    const config = {
      server: serverHost || String(profile?.server || '').trim(),
      database: profile?.database,
      connectionTimeout: Number(profile?.connectionTimeoutMs) || 30000,
      requestTimeout: Number(profile?.requestTimeoutMs) || 30000,
      options: {
        encrypt: toBool(profile?.encrypt, true),
        trustServerCertificate: toBool(profile?.trustServerCertificate, true),
        enableArithAbort: true
      }
    };

    if (instanceName) config.options.instanceName = instanceName;
    if (port) config.port = port;

    if (authentication === 'sql') {
      config.user = String(profile?.user || '');
      config.password = this.resolvePassword(profile);
    } else {
      config.options.trustedConnection = true;
    }

    return config;
  }

  static validateProfile(profile) {
    validateServerHostOrThrow(profile?.server);
    if (!profile?.database || !String(profile.database).trim()) throw new Error('Database name is required');

    const dbType = this.getDbType(profile);
    const auth = normalizeAuth(profile.authentication);

    if (dbType === 'mysql' || auth === 'sql') {
      if (!profile?.user || !String(profile.user).trim()) throw new Error('User is required');
      if (!this.resolvePassword(profile)) throw new Error('Password is required');
    }
  }

  static async withClient(profile, fn) {
    this.validateProfile(profile);
    const config = this.buildConfig(profile);

    if (this.getDbType(profile) === 'mysql') {
      const mysql = await this.loadMysqlModule();
      const conn = await mysql.createConnection(config);
      try {
        return await fn({ dialect: 'mysql', conn, mysql, config });
      } finally {
        await conn.end();
      }
    }

    const mssql = await this.loadMssqlModule();
    const pool = new mssql.ConnectionPool(config);
    try {
      await pool.connect();
    } catch (error) {
      const msg = String(error?.message || '');
      if (/Unable to process incoming packet/i.test(msg)) {
        throw new Error(
          'Protocol mismatch: this endpoint looks like MySQL. Set App DB `Database Type` to `MySQL` and port `3306`.'
        );
      }
      throw error;
    }
    try {
      return await fn({ dialect: 'mssql', pool, mssql, config });
    } finally {
      await pool.close();
    }
  }

  static async ensureSchema(profile) {
    return this.withClient(profile, async ({ dialect, pool, conn }) => {
      if (dialect === 'mysql') {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS app_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(120) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            session_id VARCHAR(64) NOT NULL,
            item_number VARCHAR(255) NULL,
            sku VARCHAR(255) NULL,
            original_title LONGTEXT NULL,
            category VARCHAR(255) NULL,
            brand VARCHAR(255) NULL,
            category_model VARCHAR(255) NULL,
            ebay_category_name VARCHAR(255) NULL,
            price DECIMAL(18,2) NULL,
            quantity INT NULL,
            sold_count INT NULL,
            suggested_price DECIMAL(18,2) NULL,
            price_adjustment VARCHAR(100) NULL,
            price_update_status VARCHAR(50) NULL,
            raw_query_data LONGTEXT NULL,
            source VARCHAR(50) NULL,
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            INDEX ix_app_products_session (session_id)
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_generated_titles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            session_id VARCHAR(64) NOT NULL,
            product_local_id INT NULL,
            sku VARCHAR(255) NULL,
            item_number VARCHAR(255) NULL,
            title LONGTEXT NULL,
            title_hash VARCHAR(255) NULL,
            language VARCHAR(20) NULL,
            variation_number INT NULL,
            model_rotation VARCHAR(255) NULL,
            char_length INT NULL,
            is_active TINYINT(1) NULL,
            used_count INT NULL,
            last_used_at DATETIME NULL,
            marketplace VARCHAR(50) NULL,
            created_at DATETIME NULL,
            INDEX ix_app_generated_titles_session (session_id)
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_title_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            session_id VARCHAR(64) NULL,
            product_id INT NULL,
            generated_title_id INT NULL,
            action VARCHAR(50) NULL,
            destination VARCHAR(100) NULL,
            export_filename VARCHAR(500) NULL,
            metadata LONGTEXT NULL,
            created_at DATETIME NULL,
            INDEX ix_app_title_history_session (session_id)
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_csv_exports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            session_id VARCHAR(64) NULL,
            language VARCHAR(20) NULL,
            folder_path VARCHAR(500) NULL,
            file_name VARCHAR(255) NULL,
            file_path VARCHAR(500) NULL,
            row_count INT NULL,
            csv_content LONGTEXT NULL,
            created_at DATETIME NULL,
            INDEX ix_app_csv_exports_session (session_id)
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            session_id VARCHAR(64) NULL,
            level VARCHAR(20) NULL,
            event VARCHAR(120) NULL,
            message LONGTEXT NULL,
            details LONGTEXT NULL,
            created_at DATETIME NULL,
            INDEX ix_app_logs_session (session_id)
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_settings (
            setting_key VARCHAR(120) PRIMARY KEY,
            setting_value LONGTEXT NULL,
            value_type VARCHAR(20) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_title_knowledge_base (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            normalized_title VARCHAR(1000) NOT NULL,
            title LONGTEXT NULL,
            item_number VARCHAR(255) NULL,
            sku VARCHAR(255) NULL,
            category VARCHAR(255) NULL,
            cartridge_models LONGTEXT NULL,
            printer_brand VARCHAR(255) NULL,
            series VARCHAR(255) NULL,
            printer_models LONGTEXT NULL,
            set_of VARCHAR(100) NULL,
            qty VARCHAR(50) NULL,
            color VARCHAR(100) NULL,
            extra VARCHAR(255) NULL,
            confidence INT NULL,
            source VARCHAR(100) NULL,
            usage_count INT NULL,
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            UNIQUE KEY uq_app_title_kb_normalized_title (normalized_title(255))
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_extracted_elements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            sku VARCHAR(255) NOT NULL,
            item_number VARCHAR(255) NOT NULL,
            original_title LONGTEXT NULL,
            category VARCHAR(255) NULL,
            cartridge_models LONGTEXT NULL,
            brand VARCHAR(255) NULL,
            product_brand VARCHAR(255) NULL,
            printer_brand VARCHAR(255) NULL,
            series VARCHAR(255) NULL,
            printer_models LONGTEXT NULL,
            bracket_codes LONGTEXT NULL,
            kompatibel VARCHAR(255) NULL,
            set_of VARCHAR(100) NULL,
            qty VARCHAR(50) NULL,
            color VARCHAR(100) NULL,
            extra VARCHAR(255) NULL,
            verification_status VARCHAR(50) NULL,
            verification_confidence INT NULL,
            verification_issues LONGTEXT NULL,
            variation_set_of VARCHAR(255) NULL,
            variation_color VARCHAR(255) NULL,
            variation_printer_model LONGTEXT NULL,
            extracted_at DATETIME NULL,
            UNIQUE KEY uq_app_extracted_sku_item (sku(191), item_number(191)),
            INDEX ix_app_extracted_sku (sku)
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_sku_import_counts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            sku VARCHAR(255) NOT NULL,
            item_number VARCHAR(255) NOT NULL,
            import_count INT DEFAULT 0,
            last_imported_at DATETIME NULL,
            UNIQUE KEY uq_app_sku_import (sku(191), item_number(191)),
            INDEX ix_app_sku_import_sku (sku)
          ) ENGINE=InnoDB;

          CREATE TABLE IF NOT EXISTS app_price_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            local_id INT NULL,
            sku VARCHAR(255) NULL,
            item_number VARCHAR(255) NULL,
            import_number INT NULL,
            price_before DECIMAL(18,2) NULL,
            price_after DECIMAL(18,2) NULL,
            price_action VARCHAR(50) NULL,
            sold_qty DECIMAL(18,2) NULL,
            reason LONGTEXT NULL,
            session_id VARCHAR(64) NULL,
            recorded_at DATETIME NULL,
            INDEX ix_app_price_history_sku (sku)
          ) ENGINE=InnoDB;

          ALTER TABLE app_generated_titles ADD COLUMN IF NOT EXISTS sku VARCHAR(255) NULL;
          ALTER TABLE app_generated_titles ADD COLUMN IF NOT EXISTS item_number VARCHAR(255) NULL;
          ALTER TABLE app_generated_titles ADD COLUMN IF NOT EXISTS model_rotation VARCHAR(255) NULL;
          ALTER TABLE app_generated_titles ADD COLUMN IF NOT EXISTS marketplace VARCHAR(50) NULL;
          ALTER TABLE app_generated_titles ADD COLUMN IF NOT EXISTS last_used_at DATETIME NULL;
          ALTER TABLE app_title_knowledge_base ADD COLUMN IF NOT EXISTS item_number VARCHAR(255) NULL;
        `);
        return true;
      }

      await pool.request().query(`
        IF OBJECT_ID('dbo.app_users', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_users (
            id INT IDENTITY(1,1) PRIMARY KEY,
            username NVARCHAR(120) NOT NULL UNIQUE,
            password_hash NVARCHAR(255) NOT NULL,
            role NVARCHAR(20) NOT NULL DEFAULT 'user',
            is_active BIT NOT NULL DEFAULT 1,
            created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        END;
        IF OBJECT_ID('dbo.app_products', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_products (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            session_id NVARCHAR(64) NOT NULL,
            item_number NVARCHAR(255) NULL,
            sku NVARCHAR(255) NULL,
            original_title NVARCHAR(MAX) NULL,
            category NVARCHAR(255) NULL,
            brand NVARCHAR(255) NULL,
            category_model NVARCHAR(255) NULL,
            ebay_category_name NVARCHAR(255) NULL,
            price DECIMAL(18,2) NULL,
            quantity INT NULL,
            sold_count INT NULL,
            suggested_price DECIMAL(18,2) NULL,
            price_adjustment NVARCHAR(100) NULL,
            price_update_status NVARCHAR(50) NULL,
            raw_query_data NVARCHAR(MAX) NULL,
            source NVARCHAR(50) NULL,
            created_at DATETIME2 NULL,
            updated_at DATETIME2 NULL
          );
          CREATE INDEX IX_app_products_session ON dbo.app_products(session_id);
        END;
        IF OBJECT_ID('dbo.app_generated_titles', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_generated_titles (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            session_id NVARCHAR(64) NOT NULL,
            product_local_id INT NULL,
            sku NVARCHAR(255) NULL,
            item_number NVARCHAR(255) NULL,
            title NVARCHAR(MAX) NULL,
            title_hash NVARCHAR(255) NULL,
            language NVARCHAR(20) NULL,
            variation_number INT NULL,
            model_rotation NVARCHAR(255) NULL,
            char_length INT NULL,
            is_active BIT NULL,
            used_count INT NULL,
            last_used_at DATETIME2 NULL,
            marketplace NVARCHAR(50) NULL,
            created_at DATETIME2 NULL
          );
          CREATE INDEX IX_app_generated_titles_session ON dbo.app_generated_titles(session_id);
        END;
        IF OBJECT_ID('dbo.app_title_history', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_title_history (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            session_id NVARCHAR(64) NULL,
            product_id INT NULL,
            generated_title_id INT NULL,
            action NVARCHAR(50) NULL,
            destination NVARCHAR(100) NULL,
            export_filename NVARCHAR(500) NULL,
            metadata NVARCHAR(MAX) NULL,
            created_at DATETIME2 NULL
          );
          CREATE INDEX IX_app_title_history_session ON dbo.app_title_history(session_id);
        END;
        IF OBJECT_ID('dbo.app_csv_exports', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_csv_exports (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            session_id NVARCHAR(64) NULL,
            language NVARCHAR(20) NULL,
            folder_path NVARCHAR(500) NULL,
            file_name NVARCHAR(255) NULL,
            file_path NVARCHAR(500) NULL,
            row_count INT NULL,
            csv_content NVARCHAR(MAX) NULL,
            created_at DATETIME2 NULL
          );
          CREATE INDEX IX_app_csv_exports_session ON dbo.app_csv_exports(session_id);
        END;
        IF OBJECT_ID('dbo.app_logs', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_logs (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            session_id NVARCHAR(64) NULL,
            level NVARCHAR(20) NULL,
            event NVARCHAR(120) NULL,
            message NVARCHAR(MAX) NULL,
            details NVARCHAR(MAX) NULL,
            created_at DATETIME2 NULL
          );
          CREATE INDEX IX_app_logs_session ON dbo.app_logs(session_id);
        END;
        IF OBJECT_ID('dbo.app_settings', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_settings (
            [key] NVARCHAR(120) PRIMARY KEY,
            [value] NVARCHAR(MAX) NULL,
            value_type NVARCHAR(20) NULL,
            updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
          );
        END;
        IF OBJECT_ID('dbo.app_title_knowledge_base', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_title_knowledge_base (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            normalized_title NVARCHAR(1000) NOT NULL UNIQUE,
            title NVARCHAR(MAX) NULL,
            item_number NVARCHAR(255) NULL,
            sku NVARCHAR(255) NULL,
            category NVARCHAR(255) NULL,
            cartridge_models NVARCHAR(MAX) NULL,
            printer_brand NVARCHAR(255) NULL,
            series NVARCHAR(255) NULL,
            printer_models NVARCHAR(MAX) NULL,
            set_of NVARCHAR(100) NULL,
            qty NVARCHAR(50) NULL,
            color NVARCHAR(100) NULL,
            extra NVARCHAR(255) NULL,
            confidence INT NULL,
            source NVARCHAR(100) NULL,
            usage_count INT NULL,
            created_at DATETIME2 NULL,
            updated_at DATETIME2 NULL
          );
        END;
        IF OBJECT_ID('dbo.app_extracted_elements', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_extracted_elements (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            sku NVARCHAR(255) NOT NULL,
            item_number NVARCHAR(255) NOT NULL,
            original_title NVARCHAR(MAX) NULL,
            category NVARCHAR(255) NULL,
            cartridge_models NVARCHAR(MAX) NULL,
            brand NVARCHAR(255) NULL,
            product_brand NVARCHAR(255) NULL,
            printer_brand NVARCHAR(255) NULL,
            series NVARCHAR(255) NULL,
            printer_models NVARCHAR(MAX) NULL,
            bracket_codes NVARCHAR(MAX) NULL,
            kompatibel NVARCHAR(255) NULL,
            set_of NVARCHAR(100) NULL,
            qty NVARCHAR(50) NULL,
            color NVARCHAR(100) NULL,
            extra NVARCHAR(255) NULL,
            verification_status NVARCHAR(50) NULL,
            verification_confidence INT NULL,
            verification_issues NVARCHAR(MAX) NULL,
            variation_set_of NVARCHAR(255) NULL,
            variation_color NVARCHAR(255) NULL,
            variation_printer_model NVARCHAR(MAX) NULL,
            extracted_at DATETIME2 NULL,
            CONSTRAINT uq_app_extracted_sku_item UNIQUE (sku, item_number)
          );
          CREATE INDEX IX_app_extracted_sku ON dbo.app_extracted_elements(sku);
        END;
        IF OBJECT_ID('dbo.app_sku_import_counts', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_sku_import_counts (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            sku NVARCHAR(255) NOT NULL,
            item_number NVARCHAR(255) NOT NULL,
            import_count INT DEFAULT 0,
            last_imported_at DATETIME2 NULL,
            CONSTRAINT uq_app_sku_import UNIQUE (sku, item_number)
          );
          CREATE INDEX IX_app_sku_import_sku ON dbo.app_sku_import_counts(sku);
        END;
        IF OBJECT_ID('dbo.app_price_history', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.app_price_history (
            id INT IDENTITY(1,1) PRIMARY KEY,
            local_id INT NULL,
            sku NVARCHAR(255) NULL,
            item_number NVARCHAR(255) NULL,
            import_number INT NULL,
            price_before DECIMAL(18,2) NULL,
            price_after DECIMAL(18,2) NULL,
            price_action NVARCHAR(50) NULL,
            sold_qty DECIMAL(18,2) NULL,
            reason NVARCHAR(MAX) NULL,
            session_id NVARCHAR(64) NULL,
            recorded_at DATETIME2 NULL
          );
          CREATE INDEX IX_app_price_history_sku ON dbo.app_price_history(sku);
        END;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.app_generated_titles') AND name = 'sku')
          ALTER TABLE dbo.app_generated_titles ADD sku NVARCHAR(255) NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.app_generated_titles') AND name = 'item_number')
          ALTER TABLE dbo.app_generated_titles ADD item_number NVARCHAR(255) NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.app_generated_titles') AND name = 'model_rotation')
          ALTER TABLE dbo.app_generated_titles ADD model_rotation NVARCHAR(255) NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.app_generated_titles') AND name = 'marketplace')
          ALTER TABLE dbo.app_generated_titles ADD marketplace NVARCHAR(50) NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.app_generated_titles') AND name = 'last_used_at')
          ALTER TABLE dbo.app_generated_titles ADD last_used_at DATETIME2 NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.app_title_knowledge_base') AND name = 'item_number')
          ALTER TABLE dbo.app_title_knowledge_base ADD item_number NVARCHAR(255) NULL;
      `);
      return true;
    });
  }

  static async testConnection(profile) {
    const config = this.buildConfig(profile);
    const dbType = this.getDbType(profile);
    const host = dbType === 'mysql' ? config.host : config.server;
    const port = dbType === 'mysql' ? parsePort(config.port, 3306) : parsePort(config.port, 1433);
    await preflightSqlTcp(host, port, 5000);

    return this.withClient(profile, async ({ dialect, pool, conn }) => {
      if (dialect === 'mysql') {
        await conn.query('SELECT 1 AS ok');
      } else {
        await pool.request().query('SELECT 1 AS ok');
      }
      return { ok: 1 };
    });
  }

  static hasLocalTable(db, tableName) {
    const row = db
      .prepare("SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name = ?")
      .get(tableName);
    return Boolean(row?.ok);
  }

  static ensureLocalKnowledgeBaseSchema(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS title_knowledge_base (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        normalized_title TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        item_number TEXT,
        sku TEXT,
        category TEXT,
        cartridge_models TEXT,
        printer_brand TEXT,
        series TEXT,
        printer_models TEXT,
        set_of TEXT,
        qty TEXT,
        color TEXT,
        extra TEXT,
        confidence INTEGER DEFAULT 95,
        source TEXT DEFAULT 'manual',
        usage_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const cols = db.prepare('PRAGMA table_info(title_knowledge_base)').all().map((c) => c.name);
    if (!cols.includes('item_number')) {
      db.exec('ALTER TABLE title_knowledge_base ADD COLUMN item_number TEXT');
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_title ON title_knowledge_base(normalized_title)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_source ON title_knowledge_base(source)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_sku ON title_knowledge_base(sku)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_title_kb_item ON title_knowledge_base(item_number)');
  }

  static async restoreFromRemote(options = {}) {
    const force = Boolean(options?.force);
    const profile = this.getActiveProfile();
    if (!profile) return { synced: false, reason: 'No active app SQL profile' };
    try {
      this.validateProfile(profile);
    } catch (error) {
      return { synced: false, reason: error.message };
    }

    const localDb = DatabaseManager.getDatabase();
    const localCount = localDb.prepare('SELECT COUNT(*) as c FROM products').get()?.c || 0;
    if (localCount > 0 && !force) {
      return { synced: false, reason: 'Local data already present', localProducts: localCount };
    }

    await this.ensureSchema(profile);

    const remote = await this.withClient(profile, async ({ dialect, pool, conn }) => {
      if (dialect === 'mysql') {
        const safeSelectAll = async (table, orderBy = 'id') => {
          try {
            const [rows] = await conn.query(`SELECT * FROM \`${table}\` ORDER BY ${orderBy} ASC`);
            return Array.isArray(rows) ? rows : [];
          } catch (error) {
            if (/Unknown column 'id' in 'ORDER BY'/i.test(String(error?.message || ''))) {
              const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
              return Array.isArray(rows) ? rows : [];
            }
            throw error;
          }
        };

        const [products, titles, history, csv, logs, kb] = await Promise.all([
          safeSelectAll('app_products'),
          safeSelectAll('app_generated_titles'),
          safeSelectAll('app_title_history'),
          safeSelectAll('app_csv_exports'),
          safeSelectAll('app_logs'),
          safeSelectAll('app_title_knowledge_base')
        ]);
        const [settings] = await conn.query(
          'SELECT setting_key AS `key`, setting_value AS `value`, value_type FROM app_settings ORDER BY updated_at DESC, setting_key ASC'
        );
        const [currentSessionRows] = await conn.query(
          "SELECT setting_value FROM app_settings WHERE setting_key = 'current_session_id' LIMIT 1"
        );

        const fetchOptional = async (tableName) => {
          try {
            return await safeSelectAll(tableName);
          } catch {
            return [];
          }
        };

        const extractedElements = await fetchOptional('app_extracted_elements');
        const skuImportCounts = await fetchOptional('app_sku_import_counts');
        const priceHistory = await fetchOptional('app_price_history');

        return {
          products: products || [],
          titles: titles || [],
          history: history || [],
          csv: csv || [],
          logs: logs || [],
          settings: settings || [],
          knowledgeBase: kb || [],
          extractedElements,
          skuImportCounts,
          priceHistory,
          currentSessionId: currentSessionRows?.[0]?.setting_value || null
        };
      }

      const safeSelectAllMssql = async (tableName) => {
        try {
          const result = await pool.request().query(`SELECT * FROM ${tableName} ORDER BY id ASC`);
          return result.recordset || [];
        } catch (error) {
          if (/Invalid column name 'id'/i.test(String(error?.message || ''))) {
            const result = await pool.request().query(`SELECT * FROM ${tableName}`);
            return result.recordset || [];
          }
          throw error;
        }
      };

      const [productsRes, titlesRes, historyRes, csvRes, logsRes, kbRes] = await Promise.all([
        safeSelectAllMssql('dbo.app_products'),
        safeSelectAllMssql('dbo.app_generated_titles'),
        safeSelectAllMssql('dbo.app_title_history'),
        safeSelectAllMssql('dbo.app_csv_exports'),
        safeSelectAllMssql('dbo.app_logs'),
        safeSelectAllMssql('dbo.app_title_knowledge_base')
      ]);
      const settingsRes = await pool
        .request()
        .query('SELECT [key] AS [key], [value] AS [value], value_type FROM dbo.app_settings ORDER BY updated_at DESC, [key] ASC');
      const currentSessionRes = await pool
        .request()
        .query("SELECT TOP 1 [value] AS setting_value FROM dbo.app_settings WHERE [key] = 'current_session_id'");

      const fetchOptionalMssql = async (query) => {
        try {
          const result = await pool.request().query(query);
          return result.recordset || [];
        } catch {
          return [];
        }
      };

      const extractedElements = await fetchOptionalMssql('SELECT * FROM dbo.app_extracted_elements ORDER BY id ASC');
      const skuImportCounts = await fetchOptionalMssql('SELECT * FROM dbo.app_sku_import_counts ORDER BY id ASC');
      const priceHistory = await fetchOptionalMssql('SELECT * FROM dbo.app_price_history ORDER BY id ASC');

      return {
        products: productsRes || [],
        titles: titlesRes || [],
        history: historyRes || [],
        csv: csvRes || [],
        logs: logsRes || [],
        settings: settingsRes.recordset || [],
        knowledgeBase: kbRes || [],
        extractedElements,
        skuImportCounts,
        priceHistory,
        currentSessionId: currentSessionRes.recordset?.[0]?.setting_value || null
      };
    });

    const hasAnyRemoteData =
      remote.products.length ||
      remote.titles.length ||
      remote.history.length ||
      remote.csv.length ||
      remote.logs.length ||
      remote.settings.length ||
      remote.knowledgeBase.length ||
      remote.extractedElements.length ||
      remote.skuImportCounts.length ||
      remote.priceHistory.length;

    if (!hasAnyRemoteData) {
      return { synced: false, reason: 'No remote app data found' };
    }

    this.ensureLocalKnowledgeBaseSchema(localDb);

    const hasExtracted = this.hasLocalTable(localDb, 'extracted_elements');
    const hasSkuCounts = this.hasLocalTable(localDb, 'sku_import_counts');
    const hasPriceHistory = this.hasLocalTable(localDb, 'price_history');

    const tx = localDb.transaction(() => {
      localDb.exec('PRAGMA foreign_keys = OFF');
      try {
        localDb.prepare('DELETE FROM title_history').run();
      localDb.prepare('DELETE FROM generated_titles').run();
      localDb.prepare('DELETE FROM products').run();
      localDb.prepare('DELETE FROM csv_exports').run();
      localDb.prepare('DELETE FROM app_logs').run();
      localDb.prepare('DELETE FROM title_knowledge_base').run();
      if (hasExtracted) localDb.prepare('DELETE FROM extracted_elements').run();
      if (hasSkuCounts) localDb.prepare('DELETE FROM sku_import_counts').run();
      if (hasPriceHistory) localDb.prepare('DELETE FROM price_history').run();

      const insProduct = localDb.prepare(
        `INSERT INTO products (
          id, item_number, sku, original_title, category, brand, category_model, ebay_category_name,
          price, quantity, sold_count, suggested_price, price_adjustment, price_update_status,
          raw_query_data, source, session_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const insTitle = localDb.prepare(
        `INSERT INTO generated_titles (
          id, product_id, sku, item_number, title, title_hash, language, variation_number,
          model_rotation, char_length, is_active, used_count, last_used_at, session_id, created_at, marketplace
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const insHistory = localDb.prepare(
        `INSERT INTO title_history (
          id, product_id, generated_title_id, action, destination, export_filename, metadata, session_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const insCsv = localDb.prepare(
        `INSERT INTO csv_exports (
          id, session_id, language, folder_path, file_name, file_path, row_count, csv_content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const insLog = localDb.prepare(
        `INSERT INTO app_logs (
          id, level, event, message, details, session_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      const upsertSetting = localDb.prepare(
        `INSERT INTO app_settings (key, value, value_type)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type`
      );

      const insKb = localDb.prepare(
        `INSERT OR REPLACE INTO title_knowledge_base (
          id, normalized_title, title, item_number, sku, category, cartridge_models,
          printer_brand, series, printer_models, set_of, qty, color, extra,
          confidence, source, usage_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const insExtracted = hasExtracted
        ? localDb.prepare(
            `INSERT OR REPLACE INTO extracted_elements (
              id, sku, item_number, original_title, category, cartridge_models, brand, product_brand,
              printer_brand, series, printer_models, bracket_codes, kompatibel, set_of, qty, color,
              extra, verification_status, verification_confidence, verification_issues,
              variation_set_of, variation_color, variation_printer_model, extracted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
        : null;

      const insSkuCount = hasSkuCounts
        ? localDb.prepare(
            `INSERT OR REPLACE INTO sku_import_counts (
              id, sku, item_number, import_count, last_imported_at
            ) VALUES (?, ?, ?, ?, ?)`
          )
        : null;

      const insPriceHistory = hasPriceHistory
        ? localDb.prepare(
            `INSERT OR REPLACE INTO price_history (
              id, sku, item_number, import_number, price_before, price_after,
              price_action, sold_qty, reason, session_id, recorded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
        : null;

      const productIdMap = new Map();
      const titleIdMap = new Map();

      for (const row of remote.products) {
        const id = row.local_id ?? row.id ?? null;
        insProduct.run(
          id,
          row.item_number || null,
          row.sku || null,
          row.original_title || null,
          row.category || null,
          row.brand || null,
          row.category_model || null,
          row.ebay_category_name || null,
          row.price ?? null,
          row.quantity ?? null,
          row.sold_count ?? null,
          row.suggested_price ?? null,
          row.price_adjustment || null,
          row.price_update_status || null,
          row.raw_query_data || null,
          row.source || null,
          row.session_id || null,
          normalizeTimestampValue(row.created_at),
          normalizeTimestampValue(row.updated_at)
        );
        const key = row.local_id ?? row.id;
        if (key !== undefined && key !== null) productIdMap.set(Number(key), id ?? Number(key));
      }

      for (const row of remote.titles) {
        const id = row.local_id ?? row.id ?? null;
        const remoteProductId = row.product_local_id ?? row.product_id ?? null;
        const localProductId =
          productIdMap.get(Number(remoteProductId)) ??
          (remoteProductId === null || remoteProductId === undefined ? null : Number(remoteProductId));
        const fallbackHash = `remote_${id || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        insTitle.run(
          id,
          localProductId,
          row.sku || null,
          row.item_number || null,
          row.title || null,
          row.title_hash || fallbackHash,
          row.language || 'de',
          row.variation_number ?? null,
          row.model_rotation || null,
          row.char_length ?? null,
          row.is_active ?? 1,
          row.used_count ?? 0,
          normalizeTimestampValue(row.last_used_at),
          row.session_id || null,
          normalizeTimestampValue(row.created_at),
          row.marketplace || null
        );

        const key = row.local_id ?? row.id;
        if (key !== undefined && key !== null) titleIdMap.set(Number(key), id ?? Number(key));
      }

      for (const row of remote.history) {
        const id = row.local_id ?? row.id ?? null;
        const productId =
          productIdMap.get(Number(row.product_id)) ??
          (row.product_id === null || row.product_id === undefined ? null : Number(row.product_id));
        const generatedTitleId =
          titleIdMap.get(Number(row.generated_title_id)) ??
          (row.generated_title_id === null || row.generated_title_id === undefined
            ? null
            : Number(row.generated_title_id));

        insHistory.run(
          id,
          productId,
          generatedTitleId,
          row.action || null,
          row.destination || null,
          row.export_filename || null,
          safeTextJson(row.metadata),
          row.session_id || null,
          normalizeTimestampValue(row.created_at)
        );
      }

      for (const row of remote.csv) {
        const id = row.local_id ?? row.id ?? null;
        insCsv.run(
          id,
          row.session_id || null,
          row.language || null,
          row.folder_path || null,
          row.file_name || null,
          row.file_path || null,
          row.row_count ?? null,
          row.csv_content || '',
          normalizeTimestampValue(row.created_at)
        );
      }

      for (const row of remote.logs) {
        const id = row.local_id ?? row.id ?? null;
        insLog.run(
          id,
          row.level || null,
          row.event || null,
          row.message || null,
          safeTextJson(row.details),
          row.session_id || null,
          normalizeTimestampValue(row.created_at)
        );
      }

      for (const row of remote.settings || []) {
        upsertSetting.run(row.key || '', row.value ?? null, row.value_type || 'string');
      }

      for (const row of remote.knowledgeBase) {
        const id = row.local_id ?? row.id ?? null;
        insKb.run(
          id,
          row.normalized_title || null,
          row.title || null,
          row.item_number || null,
          row.sku || null,
          row.category || null,
          row.cartridge_models || null,
          row.printer_brand || null,
          row.series || null,
          row.printer_models || null,
          row.set_of || null,
          row.qty || null,
          row.color || null,
          row.extra || null,
          row.confidence ?? null,
          row.source || null,
          row.usage_count ?? null,
          normalizeTimestampValue(row.created_at),
          normalizeTimestampValue(row.updated_at)
        );
      }

      if (insExtracted) {
        for (const row of remote.extractedElements || []) {
          const id = row.local_id ?? row.id ?? null;
          insExtracted.run(
            id,
            row.sku || null,
            row.item_number || null,
            row.original_title || null,
            row.category || null,
            row.cartridge_models || null,
            row.brand || null,
            row.product_brand || null,
            row.printer_brand || null,
            row.series || null,
            row.printer_models || null,
            row.bracket_codes || null,
            row.kompatibel || null,
            row.set_of || null,
            row.qty || null,
            row.color || null,
            row.extra || null,
            row.verification_status || null,
            row.verification_confidence ?? null,
            row.verification_issues || null,
            row.variation_set_of || null,
            row.variation_color || null,
            row.variation_printer_model || null,
            normalizeTimestampValue(row.extracted_at)
          );
        }
      }

      if (insSkuCount) {
        for (const row of remote.skuImportCounts || []) {
          const id = row.local_id ?? row.id ?? null;
          insSkuCount.run(
            id,
            row.sku || null,
            row.item_number || null,
            row.import_count ?? 0,
            normalizeTimestampValue(row.last_imported_at)
          );
        }
      }

      if (insPriceHistory) {
        for (const row of remote.priceHistory || []) {
          const id = row.local_id ?? row.id ?? null;
          insPriceHistory.run(
            id,
            row.sku || null,
            row.item_number || null,
            row.import_number ?? null,
            row.price_before ?? null,
            row.price_after ?? null,
            row.price_action || null,
            row.sold_qty ?? null,
            row.reason || null,
            row.session_id || null,
            normalizeTimestampValue(row.recorded_at)
          );
        }
      }

      const localCurrentSession =
        remote.currentSessionId ||
        remote.products
          .map((r) => String(r.session_id || '').trim())
          .filter(Boolean)
          .pop() ||
        '';

      if (localCurrentSession) {
        localDb.prepare(
          `INSERT INTO app_settings (key, value, value_type)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type`
        ).run('current_session_id', localCurrentSession, 'string');
      }
      } finally {
        localDb.exec('PRAGMA foreign_keys = ON');
      }
    });

    tx();

    return {
      synced: true,
      counts: {
        products: remote.products.length,
        titles: remote.titles.length,
        history: remote.history.length,
        csv: remote.csv.length,
        logs: remote.logs.length,
        knowledgeBase: remote.knowledgeBase.length,
        extractedElements: remote.extractedElements.length,
        skuImportCounts: remote.skuImportCounts.length,
        priceHistory: remote.priceHistory.length
      }
    };
  }

  static async syncSession(sessionId) {
    if (!sessionId) return { synced: false, reason: 'No session id' };
    const profile = this.getActiveProfile();
    if (!profile) return { synced: false, reason: 'No active app SQL profile' };

    await this.ensureSchema(profile);

    const db = DatabaseManager.getDatabase();
    const products = db.prepare('SELECT * FROM products WHERE session_id = ?').all(sessionId);
    const titles = db.prepare('SELECT * FROM generated_titles WHERE session_id = ?').all(sessionId);
    const history = db.prepare('SELECT * FROM title_history WHERE session_id = ?').all(sessionId);
    const csv = db.prepare('SELECT * FROM csv_exports WHERE session_id = ?').all(sessionId);
    const logs = db.prepare('SELECT * FROM app_logs WHERE session_id = ?').all(sessionId);
    const settings = db.prepare('SELECT [key], value, value_type FROM app_settings').all();
    const kbTableExists = db
      .prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'title_knowledge_base'")
      .get();
    const knowledgeBase = kbTableExists
      ? db.prepare('SELECT * FROM title_knowledge_base ORDER BY id ASC').all()
      : [];
    const extractedElements = db.prepare('SELECT * FROM extracted_elements ORDER BY id ASC').all();
    const skuImportCounts = db.prepare('SELECT * FROM sku_import_counts ORDER BY id ASC').all();
    const priceHistory = db.prepare('SELECT * FROM price_history ORDER BY id ASC').all();

    return this.withClient(profile, async ({ dialect, pool, conn, mssql }) => {
      if (dialect === 'mysql') {
        await conn.beginTransaction();
        try {
          await conn.query('DELETE FROM app_generated_titles WHERE session_id = ?', [sessionId]);
          await conn.query('DELETE FROM app_products WHERE session_id = ?', [sessionId]);
          await conn.query('DELETE FROM app_title_history WHERE session_id = ?', [sessionId]);
          await conn.query('DELETE FROM app_csv_exports WHERE session_id = ?', [sessionId]);
          await conn.query('DELETE FROM app_logs WHERE session_id = ?', [sessionId]);

          for (const row of products) {
            await conn.query(
              `INSERT INTO app_products (
                local_id, session_id, item_number, sku, original_title, category, brand, category_model,
                ebay_category_name, price, quantity, sold_count, suggested_price, price_adjustment,
                price_update_status, raw_query_data, source, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null,
                row.session_id || '',
                row.item_number || null,
                row.sku || null,
                row.original_title || null,
                row.category || null,
                row.brand || null,
                row.category_model || null,
                row.ebay_category_name || null,
                row.price ?? null,
                row.quantity ?? null,
                row.sold_count ?? null,
                row.suggested_price ?? null,
                row.price_adjustment || null,
                row.price_update_status || null,
                row.raw_query_data || null,
                row.source || null,
                toDate(row.created_at),
                toDate(row.updated_at)
              ]
            );
          }

          for (const row of titles) {
            await conn.query(
              `INSERT INTO app_generated_titles (
                local_id, session_id, product_local_id, sku, item_number, title, title_hash, language,
                variation_number, model_rotation, char_length, is_active, used_count, last_used_at, marketplace, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null,
                row.session_id || '',
                row.product_id ?? null,
                row.sku || null,
                row.item_number || null,
                row.title || null,
                row.title_hash || null,
                row.language || null,
                row.variation_number ?? null,
                row.model_rotation || null,
                row.char_length ?? null,
                row.is_active ?? null,
                row.used_count ?? null,
                toDate(row.last_used_at),
                row.marketplace || null,
                toDate(row.created_at)
              ]
            );
          }

          for (const row of history) {
            await conn.query(
              `INSERT INTO app_title_history (
                local_id, session_id, product_id, generated_title_id, action,
                destination, export_filename, metadata, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null,
                row.session_id || null,
                row.product_id ?? null,
                row.generated_title_id ?? null,
                row.action || null,
                row.destination || null,
                row.export_filename || null,
                row.metadata || null,
                toDate(row.created_at)
              ]
            );
          }

          for (const row of csv) {
            await conn.query(
              `INSERT INTO app_csv_exports (
                local_id, session_id, language, folder_path, file_name, file_path,
                row_count, csv_content, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null,
                row.session_id || null,
                row.language || null,
                row.folder_path || null,
                row.file_name || null,
                row.file_path || null,
                row.row_count ?? null,
                row.csv_content || null,
                toDate(row.created_at)
              ]
            );
          }

          for (const row of logs) {
            await conn.query(
              `INSERT INTO app_logs (
                local_id, session_id, level, event, message, details, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null,
                row.session_id || null,
                row.level || null,
                row.event || null,
                row.message || null,
                row.details || null,
                toDate(row.created_at)
              ]
            );
          }

          for (const row of settings) {
            await conn.query(
              `INSERT INTO app_settings (setting_key, setting_value, value_type)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), value_type = VALUES(value_type), updated_at = CURRENT_TIMESTAMP`,
              [row.key || '', row.value || null, row.value_type || null]
            );
          }

          await conn.query('DELETE FROM app_title_knowledge_base');
          for (const row of knowledgeBase) {
            await conn.query(
              `INSERT INTO app_title_knowledge_base (
                 local_id, normalized_title, title, item_number, sku, category, cartridge_models, printer_brand,
                 series, printer_models, set_of, qty, color, extra, confidence, source, usage_count,
                 created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null,
                row.normalized_title || null,
                row.title || null,
                row.item_number || null,
                row.sku || null,
                row.category || null,
                row.cartridge_models || null,
                row.printer_brand || null,
                row.series || null,
                row.printer_models || null,
                row.set_of || null,
                row.qty || null,
                row.color || null,
                row.extra || null,
                row.confidence ?? null,
                row.source || null,
                row.usage_count ?? null,
                toDate(row.created_at),
                toDate(row.updated_at)
              ]
            );
          }

          await conn.query('DELETE FROM app_extracted_elements');
          for (const row of extractedElements) {
            await conn.query(
              `INSERT INTO app_extracted_elements (
                local_id, sku, item_number, original_title, category, cartridge_models, brand, product_brand,
                printer_brand, series, printer_models, bracket_codes, kompatibel, set_of, qty, color,
                extra, verification_status, verification_confidence, verification_issues,
                variation_set_of, variation_color, variation_printer_model, extracted_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null, row.sku || null, row.item_number || null, row.original_title || null,
                row.category || null, row.cartridge_models || null, row.brand || null, row.product_brand || null,
                row.printer_brand || null, row.series || null, row.printer_models || null, row.bracket_codes || null,
                row.kompatibel || null, row.set_of || null, row.qty || null, row.color || null,
                row.extra || null, row.verification_status || null, row.verification_confidence ?? null,
                row.verification_issues || null, row.variation_set_of || null, row.variation_color || null,
                row.variation_printer_model || null, toDate(row.extracted_at)
              ]
            );
          }

          await conn.query('DELETE FROM app_sku_import_counts');
          for (const row of skuImportCounts) {
            await conn.query(
              `INSERT INTO app_sku_import_counts (local_id, sku, item_number, import_count, last_imported_at)
               VALUES (?, ?, ?, ?, ?)`,
              [row.id ?? null, row.sku || null, row.item_number || null, row.import_count ?? 0, toDate(row.last_imported_at)]
            );
          }

          await conn.query('DELETE FROM app_price_history');
          for (const row of priceHistory) {
            await conn.query(
              `INSERT INTO app_price_history (
                local_id, sku, item_number, import_number, price_before, price_after,
                price_action, sold_qty, reason, session_id, recorded_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                row.id ?? null, row.sku || null, row.item_number || null, row.import_number ?? null,
                row.price_before ?? null, row.price_after ?? null, row.price_action || null,
                row.sold_qty ?? null, row.reason || null, row.session_id || null, toDate(row.recorded_at)
              ]
            );
          }

          await conn.commit();
          return {
            synced: true,
            sessionId,
            counts: {
              products: products.length,
              titles: titles.length,
              history: history.length,
              csv: csv.length,
              logs: logs.length,
              settings: settings.length,
              knowledgeBase: knowledgeBase.length,
              extractedElements: extractedElements.length,
              skuImportCounts: skuImportCounts.length,
              priceHistory: priceHistory.length
            }
          };
        } catch (error) {
          await conn.rollback();
          throw error;
        }
      }

      const tx = new mssql.Transaction(pool);
      await tx.begin();
      try {
        const delReq = new mssql.Request(tx);
        delReq.input('sessionId', mssql.NVarChar(64), String(sessionId));
        await delReq.query(`
          DELETE FROM dbo.app_generated_titles WHERE session_id = @sessionId;
          DELETE FROM dbo.app_products WHERE session_id = @sessionId;
          DELETE FROM dbo.app_title_history WHERE session_id = @sessionId;
          DELETE FROM dbo.app_csv_exports WHERE session_id = @sessionId;
          DELETE FROM dbo.app_logs WHERE session_id = @sessionId;
        `);

        for (const row of products) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('session_id', mssql.NVarChar(64), row.session_id || '');
          r.input('item_number', mssql.NVarChar(255), row.item_number || null);
          r.input('sku', mssql.NVarChar(255), row.sku || null);
          r.input('original_title', mssql.NVarChar(mssql.MAX), row.original_title || null);
          r.input('category', mssql.NVarChar(255), row.category || null);
          r.input('brand', mssql.NVarChar(255), row.brand || null);
          r.input('category_model', mssql.NVarChar(255), row.category_model || null);
          r.input('ebay_category_name', mssql.NVarChar(255), row.ebay_category_name || null);
          r.input('price', mssql.Decimal(18, 2), row.price ?? null);
          r.input('quantity', mssql.Int, row.quantity ?? null);
          r.input('sold_count', mssql.Int, row.sold_count ?? null);
          r.input('suggested_price', mssql.Decimal(18, 2), row.suggested_price ?? null);
          r.input('price_adjustment', mssql.NVarChar(100), row.price_adjustment || null);
          r.input('price_update_status', mssql.NVarChar(50), row.price_update_status || null);
          r.input('raw_query_data', mssql.NVarChar(mssql.MAX), row.raw_query_data || null);
          r.input('source', mssql.NVarChar(50), row.source || null);
          r.input('created_at', mssql.DateTime2, toDate(row.created_at));
          r.input('updated_at', mssql.DateTime2, toDate(row.updated_at));
          await r.query(`
            INSERT INTO dbo.app_products (
              local_id, session_id, item_number, sku, original_title, category, brand, category_model,
              ebay_category_name, price, quantity, sold_count, suggested_price, price_adjustment,
              price_update_status, raw_query_data, source, created_at, updated_at
            ) VALUES (
              @local_id, @session_id, @item_number, @sku, @original_title, @category, @brand, @category_model,
              @ebay_category_name, @price, @quantity, @sold_count, @suggested_price, @price_adjustment,
              @price_update_status, @raw_query_data, @source, @created_at, @updated_at
            )
          `);
        }

        for (const row of titles) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('session_id', mssql.NVarChar(64), row.session_id || '');
          r.input('product_local_id', mssql.Int, row.product_id ?? null);
          r.input('sku', mssql.NVarChar(255), row.sku || null);
          r.input('item_number', mssql.NVarChar(255), row.item_number || null);
          r.input('title', mssql.NVarChar(mssql.MAX), row.title || null);
          r.input('title_hash', mssql.NVarChar(255), row.title_hash || null);
          r.input('language', mssql.NVarChar(20), row.language || null);
          r.input('variation_number', mssql.Int, row.variation_number ?? null);
          r.input('model_rotation', mssql.NVarChar(255), row.model_rotation || null);
          r.input('char_length', mssql.Int, row.char_length ?? null);
          r.input('is_active', mssql.Bit, row.is_active ?? null);
          r.input('used_count', mssql.Int, row.used_count ?? null);
          r.input('last_used_at', mssql.DateTime2, toDate(row.last_used_at));
          r.input('marketplace', mssql.NVarChar(50), row.marketplace || null);
          r.input('created_at', mssql.DateTime2, toDate(row.created_at));
          await r.query(`
            INSERT INTO dbo.app_generated_titles (
              local_id, session_id, product_local_id, sku, item_number, title, title_hash, language,
              variation_number, model_rotation, char_length, is_active, used_count, last_used_at, marketplace, created_at
            ) VALUES (
              @local_id, @session_id, @product_local_id, @sku, @item_number, @title, @title_hash, @language,
              @variation_number, @model_rotation, @char_length, @is_active, @used_count, @last_used_at, @marketplace, @created_at
            )
          `);
        }

        for (const row of history) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('session_id', mssql.NVarChar(64), row.session_id || null);
          r.input('product_id', mssql.Int, row.product_id ?? null);
          r.input('generated_title_id', mssql.Int, row.generated_title_id ?? null);
          r.input('action', mssql.NVarChar(50), row.action || null);
          r.input('destination', mssql.NVarChar(100), row.destination || null);
          r.input('export_filename', mssql.NVarChar(500), row.export_filename || null);
          r.input('metadata', mssql.NVarChar(mssql.MAX), row.metadata || null);
          r.input('created_at', mssql.DateTime2, toDate(row.created_at));
          await r.query(`
            INSERT INTO dbo.app_title_history (
              local_id, session_id, product_id, generated_title_id, action,
              destination, export_filename, metadata, created_at
            ) VALUES (
              @local_id, @session_id, @product_id, @generated_title_id, @action,
              @destination, @export_filename, @metadata, @created_at
            )
          `);
        }

        for (const row of csv) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('session_id', mssql.NVarChar(64), row.session_id || null);
          r.input('language', mssql.NVarChar(20), row.language || null);
          r.input('folder_path', mssql.NVarChar(500), row.folder_path || null);
          r.input('file_name', mssql.NVarChar(255), row.file_name || null);
          r.input('file_path', mssql.NVarChar(500), row.file_path || null);
          r.input('row_count', mssql.Int, row.row_count ?? null);
          r.input('csv_content', mssql.NVarChar(mssql.MAX), row.csv_content || null);
          r.input('created_at', mssql.DateTime2, toDate(row.created_at));
          await r.query(`
            INSERT INTO dbo.app_csv_exports (
              local_id, session_id, language, folder_path, file_name, file_path,
              row_count, csv_content, created_at
            ) VALUES (
              @local_id, @session_id, @language, @folder_path, @file_name, @file_path,
              @row_count, @csv_content, @created_at
            )
          `);
        }

        for (const row of logs) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('session_id', mssql.NVarChar(64), row.session_id || null);
          r.input('level', mssql.NVarChar(20), row.level || null);
          r.input('event', mssql.NVarChar(120), row.event || null);
          r.input('message', mssql.NVarChar(mssql.MAX), row.message || null);
          r.input('details', mssql.NVarChar(mssql.MAX), row.details || null);
          r.input('created_at', mssql.DateTime2, toDate(row.created_at));
          await r.query(`
            INSERT INTO dbo.app_logs (
              local_id, session_id, level, event, message, details, created_at
            ) VALUES (
              @local_id, @session_id, @level, @event, @message, @details, @created_at
            )
          `);
        }

        for (const row of settings) {
          const r = new mssql.Request(tx);
          r.input('key', mssql.NVarChar(120), row.key || '');
          r.input('value', mssql.NVarChar(mssql.MAX), row.value || null);
          r.input('value_type', mssql.NVarChar(20), row.value_type || null);
          await r.query(`
            MERGE dbo.app_settings AS t
            USING (SELECT @key AS [key], @value AS [value], @value_type AS value_type) AS s
            ON t.[key] = s.[key]
            WHEN MATCHED THEN
              UPDATE SET t.[value] = s.[value], t.value_type = s.value_type, t.updated_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
              INSERT ([key], [value], value_type, updated_at)
              VALUES (s.[key], s.[value], s.value_type, SYSUTCDATETIME());
          `);
        }

        await new mssql.Request(tx).query('DELETE FROM dbo.app_title_knowledge_base;');
        for (const row of knowledgeBase) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('normalized_title', mssql.NVarChar(1000), row.normalized_title || null);
          r.input('title', mssql.NVarChar(mssql.MAX), row.title || null);
          r.input('item_number', mssql.NVarChar(255), row.item_number || null);
          r.input('sku', mssql.NVarChar(255), row.sku || null);
          r.input('category', mssql.NVarChar(255), row.category || null);
          r.input('cartridge_models', mssql.NVarChar(mssql.MAX), row.cartridge_models || null);
          r.input('printer_brand', mssql.NVarChar(255), row.printer_brand || null);
          r.input('series', mssql.NVarChar(255), row.series || null);
          r.input('printer_models', mssql.NVarChar(mssql.MAX), row.printer_models || null);
          r.input('set_of', mssql.NVarChar(100), row.set_of || null);
          r.input('qty', mssql.NVarChar(50), row.qty || null);
          r.input('color', mssql.NVarChar(100), row.color || null);
          r.input('extra', mssql.NVarChar(255), row.extra || null);
          r.input('confidence', mssql.Int, row.confidence ?? null);
          r.input('source', mssql.NVarChar(100), row.source || null);
          r.input('usage_count', mssql.Int, row.usage_count ?? null);
          r.input('created_at', mssql.DateTime2, toDate(row.created_at));
          r.input('updated_at', mssql.DateTime2, toDate(row.updated_at));
          await r.query(`
            INSERT INTO dbo.app_title_knowledge_base (
              local_id, normalized_title, title, item_number, sku, category, cartridge_models, printer_brand,
              series, printer_models, set_of, qty, color, extra, confidence, source, usage_count,
              created_at, updated_at
            ) VALUES (
              @local_id, @normalized_title, @title, @item_number, @sku, @category, @cartridge_models, @printer_brand,
              @series, @printer_models, @set_of, @qty, @color, @extra, @confidence, @source, @usage_count,
              @created_at, @updated_at
            )
          `);
        }

        await new mssql.Request(tx).query('DELETE FROM dbo.app_extracted_elements;');
        for (const row of extractedElements) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('sku', mssql.NVarChar(255), row.sku || null);
          r.input('item_number', mssql.NVarChar(255), row.item_number || null);
          r.input('original_title', mssql.NVarChar(mssql.MAX), row.original_title || null);
          r.input('category', mssql.NVarChar(255), row.category || null);
          r.input('cartridge_models', mssql.NVarChar(mssql.MAX), row.cartridge_models || null);
          r.input('brand', mssql.NVarChar(255), row.brand || null);
          r.input('product_brand', mssql.NVarChar(255), row.product_brand || null);
          r.input('printer_brand', mssql.NVarChar(255), row.printer_brand || null);
          r.input('series', mssql.NVarChar(255), row.series || null);
          r.input('printer_models', mssql.NVarChar(mssql.MAX), row.printer_models || null);
          r.input('bracket_codes', mssql.NVarChar(mssql.MAX), row.bracket_codes || null);
          r.input('kompatibel', mssql.NVarChar(255), row.kompatibel || null);
          r.input('set_of', mssql.NVarChar(100), row.set_of || null);
          r.input('qty', mssql.NVarChar(50), row.qty || null);
          r.input('color', mssql.NVarChar(100), row.color || null);
          r.input('extra', mssql.NVarChar(255), row.extra || null);
          r.input('verification_status', mssql.NVarChar(50), row.verification_status || null);
          r.input('verification_confidence', mssql.Int, row.verification_confidence ?? null);
          r.input('verification_issues', mssql.NVarChar(mssql.MAX), row.verification_issues || null);
          r.input('variation_set_of', mssql.NVarChar(255), row.variation_set_of || null);
          r.input('variation_color', mssql.NVarChar(255), row.variation_color || null);
          r.input('variation_printer_model', mssql.NVarChar(mssql.MAX), row.variation_printer_model || null);
          r.input('extracted_at', mssql.DateTime2, toDate(row.extracted_at));
          await r.query(`
            INSERT INTO dbo.app_extracted_elements (
              local_id, sku, item_number, original_title, category, cartridge_models, brand, product_brand,
              printer_brand, series, printer_models, bracket_codes, kompatibel, set_of, qty, color,
              extra, verification_status, verification_confidence, verification_issues,
              variation_set_of, variation_color, variation_printer_model, extracted_at
            ) VALUES (
              @local_id, @sku, @item_number, @original_title, @category, @cartridge_models, @brand, @product_brand,
              @printer_brand, @series, @printer_models, @bracket_codes, @kompatibel, @set_of, @qty, @color,
              @extra, @verification_status, @verification_confidence, @verification_issues,
              @variation_set_of, @variation_color, @variation_printer_model, @extracted_at
            )
          `);
        }

        await new mssql.Request(tx).query('DELETE FROM dbo.app_sku_import_counts;');
        for (const row of skuImportCounts) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('sku', mssql.NVarChar(255), row.sku || null);
          r.input('item_number', mssql.NVarChar(255), row.item_number || null);
          r.input('import_count', mssql.Int, row.import_count ?? 0);
          r.input('last_imported_at', mssql.DateTime2, toDate(row.last_imported_at));
          await r.query(`
            INSERT INTO dbo.app_sku_import_counts (local_id, sku, item_number, import_count, last_imported_at)
            VALUES (@local_id, @sku, @item_number, @import_count, @last_imported_at)
          `);
        }

        await new mssql.Request(tx).query('DELETE FROM dbo.app_price_history;');
        for (const row of priceHistory) {
          const r = new mssql.Request(tx);
          r.input('local_id', mssql.Int, row.id ?? null);
          r.input('sku', mssql.NVarChar(255), row.sku || null);
          r.input('item_number', mssql.NVarChar(255), row.item_number || null);
          r.input('import_number', mssql.Int, row.import_number ?? null);
          r.input('price_before', mssql.Decimal(18, 2), row.price_before ?? null);
          r.input('price_after', mssql.Decimal(18, 2), row.price_after ?? null);
          r.input('price_action', mssql.NVarChar(50), row.price_action || null);
          r.input('sold_qty', mssql.Decimal(18, 2), row.sold_qty ?? null);
          r.input('reason', mssql.NVarChar(mssql.MAX), row.reason || null);
          r.input('session_id', mssql.NVarChar(64), row.session_id || null);
          r.input('recorded_at', mssql.DateTime2, toDate(row.recorded_at));
          await r.query(`
            INSERT INTO dbo.app_price_history (
              local_id, sku, item_number, import_number, price_before, price_after,
              price_action, sold_qty, reason, session_id, recorded_at
            ) VALUES (
              @local_id, @sku, @item_number, @import_number, @price_before, @price_after,
              @price_action, @sold_qty, @reason, @session_id, @recorded_at
            )
          `);
        }

        await tx.commit();
        return {
          synced: true,
          sessionId,
          counts: {
            products: products.length,
            titles: titles.length,
            history: history.length,
            csv: csv.length,
            logs: logs.length,
            settings: settings.length,
            knowledgeBase: knowledgeBase.length,
            extractedElements: extractedElements.length,
            skuImportCounts: skuImportCounts.length,
            priceHistory: priceHistory.length
          }
        };
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    });
  }

  static async syncSettings() {
    const profile = this.getActiveProfile();
    if (!profile) return { synced: false, reason: 'No active app SQL profile' };
    try {
      this.validateProfile(profile);
    } catch (error) {
      return { synced: false, reason: error.message };
    }

    await this.ensureSchema(profile);
    const db = DatabaseManager.getDatabase();
    const settings = db.prepare('SELECT [key], value, value_type FROM app_settings').all();

    return this.withClient(profile, async ({ dialect, pool, conn, mssql }) => {
      if (dialect === 'mysql') {
        await conn.beginTransaction();
        try {
          for (const row of settings) {
            await conn.query(
              `INSERT INTO app_settings (setting_key, setting_value, value_type)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), value_type = VALUES(value_type), updated_at = CURRENT_TIMESTAMP`,
              [row.key || '', row.value || null, row.value_type || null]
            );
          }
          await conn.commit();
        } catch (error) {
          await conn.rollback();
          throw error;
        }
        return { synced: true, count: settings.length };
      }

      const tx = new mssql.Transaction(pool);
      await tx.begin();
      try {
        for (const row of settings) {
          const r = new mssql.Request(tx);
          r.input('key', mssql.NVarChar(120), row.key || '');
          r.input('value', mssql.NVarChar(mssql.MAX), row.value || null);
          r.input('value_type', mssql.NVarChar(20), row.value_type || null);
          await r.query(`
            MERGE dbo.app_settings AS t
            USING (SELECT @key AS [key], @value AS [value], @value_type AS value_type) AS s
            ON t.[key] = s.[key]
            WHEN MATCHED THEN
              UPDATE SET t.[value] = s.[value], t.value_type = s.value_type, t.updated_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
              INSERT ([key], [value], value_type, updated_at)
              VALUES (s.[key], s.[value], s.value_type, SYSUTCDATETIME());
          `);
        }
        await tx.commit();
        return { synced: true, count: settings.length };
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    });
  }

  static async syncKnowledgeBase(onProgress = null) {
    const profile = this.getActiveProfile();
    if (!profile) return { synced: false, reason: 'No active app SQL profile' };

    await this.ensureSchema(profile);
    const db = DatabaseManager.getDatabase();
    const kbTableExists = db
      .prepare("SELECT 1 as ok FROM sqlite_master WHERE type = 'table' AND name = 'title_knowledge_base'")
      .get();
    const knowledgeBase = kbTableExists
      ? db.prepare('SELECT * FROM title_knowledge_base ORDER BY id ASC').all()
      : [];
    if (onProgress) {
      onProgress({
        percent: 72,
        message: `sending to App SQL 0/${knowledgeBase.length} (72%)`
      });
    }

    return this.withClient(profile, async ({ dialect, pool, conn, mssql }) => {
      if (dialect === 'mysql') {
        await conn.beginTransaction();
        try {
          await conn.query('DELETE FROM app_title_knowledge_base');
          const chunks = chunkArray(knowledgeBase, 500);
          let processed = 0;
          for (const chunk of chunks) {
            const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
            const params = [];
            chunk.forEach((row) => {
              params.push(
                row.id ?? null,
                row.normalized_title || null,
                row.title || null,
                row.item_number || null,
                row.sku || null,
                row.category || null,
                row.cartridge_models || null,
                row.printer_brand || null,
                row.series || null,
                row.printer_models || null,
                row.set_of || null,
                row.qty || null,
                row.color || null,
                row.extra || null,
                row.confidence ?? null,
                row.source || null,
                row.usage_count ?? null,
                toDate(row.created_at),
                toDate(row.updated_at)
              );
            });
            await conn.query(
              `INSERT INTO app_title_knowledge_base (
                 local_id, normalized_title, title, item_number, sku, category, cartridge_models, printer_brand,
                 series, printer_models, set_of, qty, color, extra, confidence, source, usage_count,
                 created_at, updated_at
               ) VALUES ${placeholders}`,
              params
            );
            processed += chunk.length;
            if (onProgress) {
              const remotePercent = 72 + Math.round((processed / Math.max(1, knowledgeBase.length)) * 27);
              const pct = Math.min(99, remotePercent);
              onProgress({
                percent: pct,
                message: `sending to App SQL ${processed}/${knowledgeBase.length} (${pct}%)`
              });
            }
          }
          await conn.commit();
          return { synced: true, counts: { knowledgeBase: knowledgeBase.length } };
        } catch (error) {
          await conn.rollback();
          throw error;
        }
      }

      const tx = new mssql.Transaction(pool);
      await tx.begin();
      try {
        await new mssql.Request(tx).query('DELETE FROM dbo.app_title_knowledge_base;');
        const chunks = chunkArray(knowledgeBase, 1000);
        let processed = 0;
        for (const chunk of chunks) {
          const table = new mssql.Table('dbo.app_title_knowledge_base');
          table.create = false;
          table.columns.add('local_id', mssql.Int, { nullable: true });
          table.columns.add('normalized_title', mssql.NVarChar(1000), { nullable: true });
          table.columns.add('title', mssql.NVarChar(mssql.MAX), { nullable: true });
          table.columns.add('item_number', mssql.NVarChar(255), { nullable: true });
          table.columns.add('sku', mssql.NVarChar(255), { nullable: true });
          table.columns.add('category', mssql.NVarChar(255), { nullable: true });
          table.columns.add('cartridge_models', mssql.NVarChar(mssql.MAX), { nullable: true });
          table.columns.add('printer_brand', mssql.NVarChar(255), { nullable: true });
          table.columns.add('series', mssql.NVarChar(255), { nullable: true });
          table.columns.add('printer_models', mssql.NVarChar(mssql.MAX), { nullable: true });
          table.columns.add('set_of', mssql.NVarChar(100), { nullable: true });
          table.columns.add('qty', mssql.NVarChar(50), { nullable: true });
          table.columns.add('color', mssql.NVarChar(100), { nullable: true });
          table.columns.add('extra', mssql.NVarChar(255), { nullable: true });
          table.columns.add('confidence', mssql.Int, { nullable: true });
          table.columns.add('source', mssql.NVarChar(100), { nullable: true });
          table.columns.add('usage_count', mssql.Int, { nullable: true });
          table.columns.add('created_at', mssql.DateTime2, { nullable: true });
          table.columns.add('updated_at', mssql.DateTime2, { nullable: true });

          chunk.forEach((row) => {
            table.rows.add(
              row.id ?? null,
              row.normalized_title || null,
              row.title || null,
              row.item_number || null,
              row.sku || null,
              row.category || null,
              row.cartridge_models || null,
              row.printer_brand || null,
              row.series || null,
              row.printer_models || null,
              row.set_of || null,
              row.qty || null,
              row.color || null,
              row.extra || null,
              row.confidence ?? null,
              row.source || null,
              row.usage_count ?? null,
              toDate(row.created_at),
              toDate(row.updated_at)
            );
          });

          const r = new mssql.Request(tx);
          await r.bulk(table);
          processed += chunk.length;
          if (onProgress) {
            const remotePercent = 72 + Math.round((processed / Math.max(1, knowledgeBase.length)) * 27);
            const pct = Math.min(99, remotePercent);
            onProgress({
              percent: pct,
              message: `sending to App SQL ${processed}/${knowledgeBase.length} (${pct}%)`
            });
          }
        }
        await tx.commit();
        return { synced: true, counts: { knowledgeBase: knowledgeBase.length } };
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    });
  }

  static async replaceKnowledgeBaseEntries(entries = [], onProgress = null) {
    const profile = this.getActiveProfile();
    if (!profile) return { synced: false, reason: 'No active app SQL profile' };

    const safeEntries = Array.isArray(entries)
      ? entries.filter((e) => e && e.normalizedTitle)
      : [];
    const deduped = new Map();
    for (const entry of safeEntries) {
      // De-dupe by normalized title so MySQL unique constraint never fails
      deduped.set(entry.normalizedTitle, entry);
    }
    const uniqueEntries = Array.from(deduped.values());
    if (!uniqueEntries.length) {
      return { synced: false, reason: 'No knowledge base entries to sync' };
    }

    await this.ensureSchema(profile);
    if (onProgress) {
      onProgress({
        percent: 72,
        message: `sending to App SQL 0/${uniqueEntries.length} (72%)`
      });
    }

    return this.withClient(profile, async ({ dialect, pool, conn, mssql }) => {
      if (dialect === 'mysql') {
        await conn.beginTransaction();
        try {
          await conn.query('DELETE FROM app_title_knowledge_base');
          const chunks = chunkArray(uniqueEntries, 500);
          let processed = 0;
          for (const chunk of chunks) {
            const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
            const params = [];
            const now = new Date();
            chunk.forEach((entry) => {
              params.push(
                null,
                entry.normalizedTitle,
                entry.title || null,
                entry.itemNumber || null,
                entry.sku || null,
                entry.category || null,
                JSON.stringify(entry.cartridgeModels || []),
                entry.printerBrand || null,
                entry.series || null,
                JSON.stringify(entry.printerModels || []),
                entry.setOf || null,
                entry.qty || null,
                entry.color || null,
                entry.extra || null,
                Number(entry.confidence || 95),
                entry.source || null,
                0,
                now,
                now
              );
            });
            await conn.query(
              `INSERT INTO app_title_knowledge_base (
                 local_id, normalized_title, title, item_number, sku, category, cartridge_models, printer_brand,
                 series, printer_models, set_of, qty, color, extra, confidence, source, usage_count,
                 created_at, updated_at
               ) VALUES ${placeholders}`,
              params
            );
            processed += chunk.length;
            if (onProgress) {
              const remotePercent = 72 + Math.round((processed / Math.max(1, uniqueEntries.length)) * 27);
              const pct = Math.min(99, remotePercent);
              onProgress({
                percent: pct,
                message: `sending to App SQL ${processed}/${uniqueEntries.length} (${pct}%)`
              });
            }
          }
          await conn.commit();
          return { synced: true, counts: { knowledgeBase: uniqueEntries.length } };
        } catch (error) {
          await conn.rollback();
          throw error;
        }
      }

      const tx = new mssql.Transaction(pool);
      await tx.begin();
      try {
        await new mssql.Request(tx).query('DELETE FROM dbo.app_title_knowledge_base;');
        const chunks = chunkArray(uniqueEntries, 1000);
        let processed = 0;
        for (const chunk of chunks) {
          const table = new mssql.Table('dbo.app_title_knowledge_base');
          table.create = false;
          table.columns.add('local_id', mssql.Int, { nullable: true });
          table.columns.add('normalized_title', mssql.NVarChar(1000), { nullable: true });
          table.columns.add('title', mssql.NVarChar(mssql.MAX), { nullable: true });
          table.columns.add('item_number', mssql.NVarChar(255), { nullable: true });
          table.columns.add('sku', mssql.NVarChar(255), { nullable: true });
          table.columns.add('category', mssql.NVarChar(255), { nullable: true });
          table.columns.add('cartridge_models', mssql.NVarChar(mssql.MAX), { nullable: true });
          table.columns.add('printer_brand', mssql.NVarChar(255), { nullable: true });
          table.columns.add('series', mssql.NVarChar(255), { nullable: true });
          table.columns.add('printer_models', mssql.NVarChar(mssql.MAX), { nullable: true });
          table.columns.add('set_of', mssql.NVarChar(100), { nullable: true });
          table.columns.add('qty', mssql.NVarChar(50), { nullable: true });
          table.columns.add('color', mssql.NVarChar(100), { nullable: true });
          table.columns.add('extra', mssql.NVarChar(255), { nullable: true });
          table.columns.add('confidence', mssql.Int, { nullable: true });
          table.columns.add('source', mssql.NVarChar(100), { nullable: true });
          table.columns.add('usage_count', mssql.Int, { nullable: true });
          table.columns.add('created_at', mssql.DateTime2, { nullable: true });
          table.columns.add('updated_at', mssql.DateTime2, { nullable: true });

          const now = new Date();
          chunk.forEach((entry) => {
            table.rows.add(
              null,
              entry.normalizedTitle,
              entry.title || null,
              entry.itemNumber || null,
              entry.sku || null,
              entry.category || null,
              JSON.stringify(entry.cartridgeModels || []),
              entry.printerBrand || null,
              entry.series || null,
              JSON.stringify(entry.printerModels || []),
              entry.setOf || null,
              entry.qty || null,
              entry.color || null,
              entry.extra || null,
              Number(entry.confidence || 95),
              entry.source || null,
              0,
              now,
              now
            );
          });

          const r = new mssql.Request(tx);
          await r.bulk(table);
          processed += chunk.length;
          if (onProgress) {
            const remotePercent = 72 + Math.round((processed / Math.max(1, uniqueEntries.length)) * 27);
            const pct = Math.min(99, remotePercent);
            onProgress({
              percent: pct,
              message: `sending to App SQL ${processed}/${uniqueEntries.length} (${pct}%)`
            });
          }
        }
        await tx.commit();
        return { synced: true, counts: { knowledgeBase: uniqueEntries.length } };
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    });
  }
}
