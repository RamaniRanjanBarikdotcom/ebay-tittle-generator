import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import DatabaseManager from '../database/sqlite.js';
import AppSqlStore from './AppSqlStore.js';

const TOKEN_EXPIRY = '30d';

function readSetting(key, fallback = '') {
  const db = DatabaseManager.getDatabase();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row?.value ?? fallback;
}

function writeSetting(key, value, valueType = 'string') {
  const db = DatabaseManager.getDatabase();
  db.prepare(
    `INSERT INTO app_settings (key, value, value_type)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type`
  ).run(key, String(value), valueType);
}

function getJwtSecret() {
  let secret = readSetting('auth_jwt_secret', '');
  if (!secret) {
    secret = `jwt_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    writeSetting('auth_jwt_secret', secret, 'string');
  }
  return secret;
}

export default class AuthService {
  static async ensureAuthReady() {
    const profile = AppSqlStore.getActiveProfile();
    if (!profile) {
      throw new Error('No active App SQL profile selected in Settings');
    }
    await AppSqlStore.ensureSchema(profile);

    const defaultAdminUsername = readSetting('default_admin_username', 'admin');
    const defaultAdminPassword = readSetting('default_admin_password', 'admin123');

    await AppSqlStore.withClient(profile, async ({ dialect, mssql, pool, conn }) => {
      let exists = false;
      if (dialect === 'mysql') {
        const [rows] = await conn.query('SELECT id FROM app_users WHERE username = ? LIMIT 1', [defaultAdminUsername]);
        exists = Array.isArray(rows) && rows.length > 0;
      } else {
        const result = await pool
          .request()
          .input('username', mssql.NVarChar(120), defaultAdminUsername)
          .query('SELECT id FROM dbo.app_users WHERE username = @username');
        exists = Boolean(result.recordset?.length);
      }

      if (exists) return;
      const hash = await bcrypt.hash(defaultAdminPassword, 10);

      if (dialect === 'mysql') {
        await conn.query(
          'INSERT INTO app_users (username, password_hash, role, is_active) VALUES (?, ?, ?, 1)',
          [defaultAdminUsername, hash, 'admin']
        );
      } else {
        await pool
          .request()
          .input('username', mssql.NVarChar(120), defaultAdminUsername)
          .input('password_hash', mssql.NVarChar(255), hash)
          .input('role', mssql.NVarChar(20), 'admin')
          .query(
            `INSERT INTO dbo.app_users (username, password_hash, role, is_active)
             VALUES (@username, @password_hash, @role, 1)`
          );
      }
    });
  }

  static signToken(user) {
    const secret = getJwtSecret();
    return jwt.sign(
      {
        sub: String(user.id),
        username: user.username,
        role: user.role || 'user'
      },
      secret,
      { expiresIn: TOKEN_EXPIRY }
    );
  }

  static verifyToken(token) {
    const secret = getJwtSecret();
    return jwt.verify(token, secret);
  }

  static async login(username, password) {
    const profile = AppSqlStore.getActiveProfile();
    if (!profile) {
      const defaultAdminUsername = readSetting('default_admin_username', 'admin');
      const defaultAdminPassword = readSetting('default_admin_password', 'admin123');
      const u = String(username || '').trim();
      const p = String(password || '');
      if (u !== defaultAdminUsername || p !== defaultAdminPassword) {
        throw new Error('Invalid username or password');
      }
      const user = { id: 0, username: defaultAdminUsername, role: 'admin' };
      return { token: this.signToken(user), user };
    }

    await this.ensureAuthReady();
    const cleanUsername = String(username || '').trim();

    return AppSqlStore.withClient(profile, async ({ dialect, mssql, pool, conn }) => {
      let user = null;
      if (dialect === 'mysql') {
        const [rows] = await conn.query(
          `SELECT id, username, password_hash, role, is_active
           FROM app_users
           WHERE username = ?
           LIMIT 1`,
          [cleanUsername]
        );
        user = rows?.[0] || null;
      } else {
        const result = await pool
          .request()
          .input('username', mssql.NVarChar(120), cleanUsername)
          .query(
            `SELECT TOP 1 id, username, password_hash, role, is_active
             FROM dbo.app_users
             WHERE username = @username`
          );
        user = result.recordset?.[0] || null;
      }

      if (!user || !Number(user.is_active)) {
        throw new Error('Invalid username or password');
      }

      const ok = await bcrypt.compare(String(password || ''), user.password_hash || '');
      if (!ok) throw new Error('Invalid username or password');

      const token = this.signToken(user);
      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role || 'user'
        }
      };
    });
  }

  static async listUsers() {
    await this.ensureAuthReady();
    const profile = AppSqlStore.getActiveProfile();
    return AppSqlStore.withClient(profile, async ({ dialect, pool, conn }) => {
      if (dialect === 'mysql') {
        const [rows] = await conn.query(
          `SELECT id, username, role, is_active, created_at, updated_at
           FROM app_users
           ORDER BY created_at DESC`
        );
        return rows || [];
      }

      const result = await pool.request().query(
        `SELECT id, username, role, is_active, created_at, updated_at
         FROM dbo.app_users
         ORDER BY created_at DESC`
      );
      return result.recordset || [];
    });
  }

  static async createUser({ username, password, role = 'user' }) {
    await this.ensureAuthReady();
    const cleanUsername = String(username || '').trim();
    const cleanRole = String(role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
    if (!cleanUsername) throw new Error('Username is required');
    if (String(password || '').length < 6) throw new Error('Password must be at least 6 characters');

    const profile = AppSqlStore.getActiveProfile();
    return AppSqlStore.withClient(profile, async ({ dialect, mssql, pool, conn }) => {
      if (dialect === 'mysql') {
        const [existsRows] = await conn.query('SELECT id FROM app_users WHERE username = ? LIMIT 1', [cleanUsername]);
        if (existsRows?.length) throw new Error('Username already exists');
        const hash = await bcrypt.hash(String(password), 10);
        await conn.query(
          'INSERT INTO app_users (username, password_hash, role, is_active) VALUES (?, ?, ?, 1)',
          [cleanUsername, hash, cleanRole]
        );
        return true;
      }

      const exists = await pool
        .request()
        .input('username', mssql.NVarChar(120), cleanUsername)
        .query('SELECT id FROM dbo.app_users WHERE username = @username');
      if (exists.recordset?.length) throw new Error('Username already exists');

      const hash = await bcrypt.hash(String(password), 10);
      await pool
        .request()
        .input('username', mssql.NVarChar(120), cleanUsername)
        .input('password_hash', mssql.NVarChar(255), hash)
        .input('role', mssql.NVarChar(20), cleanRole)
        .query(
          `INSERT INTO dbo.app_users (username, password_hash, role, is_active)
           VALUES (@username, @password_hash, @role, 1)`
        );
      return true;
    });
  }

  static async deleteUser({ id }) {
    await this.ensureAuthReady();
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid user id');

    const profile = AppSqlStore.getActiveProfile();
    return AppSqlStore.withClient(profile, async ({ dialect, mssql, pool, conn }) => {
      if (dialect === 'mysql') {
        await conn.query('DELETE FROM app_users WHERE id = ?', [userId]);
        return true;
      }
      await pool
        .request()
        .input('id', mssql.Int, userId)
        .query('DELETE FROM dbo.app_users WHERE id = @id');
      return true;
    });
  }

  static async updateUser({ id, role, isActive, password }) {
    await this.ensureAuthReady();
    const userId = Number(id);
    if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid user id');

    const profile = AppSqlStore.getActiveProfile();
    return AppSqlStore.withClient(profile, async ({ dialect, mssql, pool, conn }) => {
      if (dialect === 'mysql') {
        const updates = [];
        const params = [];

        if (role !== undefined) {
          const cleanRole = String(role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
          updates.push('role = ?');
          params.push(cleanRole);
        }
        if (isActive !== undefined) {
          updates.push('is_active = ?');
          params.push(isActive ? 1 : 0);
        }
        if (password !== undefined && String(password)) {
          if (String(password).length < 6) throw new Error('Password must be at least 6 characters');
          const hash = await bcrypt.hash(String(password), 10);
          updates.push('password_hash = ?');
          params.push(hash);
        }
        if (!updates.length) throw new Error('Nothing to update');

        params.push(userId);
        await conn.query(`UPDATE app_users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        return true;
      }

      const updates = [];
      const req = pool.request().input('id', mssql.Int, userId);

      if (role !== undefined) {
        const cleanRole = String(role || 'user').trim().toLowerCase() === 'admin' ? 'admin' : 'user';
        req.input('role', mssql.NVarChar(20), cleanRole);
        updates.push('role = @role');
      }
      if (isActive !== undefined) {
        req.input('is_active', mssql.Bit, Boolean(isActive));
        updates.push('is_active = @is_active');
      }
      if (password !== undefined && String(password)) {
        if (String(password).length < 6) throw new Error('Password must be at least 6 characters');
        const hash = await bcrypt.hash(String(password), 10);
        req.input('password_hash', mssql.NVarChar(255), hash);
        updates.push('password_hash = @password_hash');
      }
      if (!updates.length) throw new Error('Nothing to update');

      await req.query(
        `UPDATE dbo.app_users
         SET ${updates.join(', ')}, updated_at = SYSUTCDATETIME()
         WHERE id = @id`
      );
      return true;
    });
  }
}
