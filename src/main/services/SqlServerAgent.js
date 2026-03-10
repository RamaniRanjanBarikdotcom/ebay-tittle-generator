import DatabaseManager from '../database/sqlite.js';
import MssqlSource from '../sources/MssqlSource.js';
import { decryptText } from '../utils/secureCrypto.js';

class SqlServerAgent {
  constructor() {
    this.timer = null;
    this.started = false;
    this.statusEmitter = null;
    this.status = {
      enabled: false,
      connected: false,
      running: false,
      message: 'SQL Server agent is disabled',
      activeProfileId: '',
      activeProfileName: '',
      lastCheckedAt: null,
      retryIntervalSec: 60
    };
  }

  setStatusEmitter(fn) {
    this.statusEmitter = fn;
  }

  emitStatus() {
    if (typeof this.statusEmitter === 'function') {
      this.statusEmitter({ ...this.status });
    }
  }

  getStatus() {
    return { ...this.status };
  }

  readSetting(key, fallback = '') {
    const db = DatabaseManager.getDatabase();
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value ?? fallback;
  }

  writeSetting(key, value, valueType = 'string') {
    const db = DatabaseManager.getDatabase();
    db.prepare(
      `INSERT INTO app_settings (key, value, value_type)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type`
    ).run(key, String(value), valueType);
  }

  getProfilesState() {
    const profilesRaw = this.readSetting('jtl_db_profiles', this.readSetting('db_profiles', '[]'));
    const activeProfileId = this.readSetting(
      'active_jtl_db_profile_id',
      this.readSetting('active_db_profile_id', '')
    );
    let profiles = [];
    try {
      const parsed = JSON.parse(profilesRaw || '[]');
      if (Array.isArray(parsed)) profiles = parsed;
    } catch {
      profiles = [];
    }
    return {
      profiles: profiles.map((p) => ({ ...p, password: decryptText(p.password || '') })),
      activeProfileId
    };
  }

  getAgentConfig() {
    const enabledRaw = this.readSetting('db_agent_enabled', 'false');
    const intervalRaw = this.readSetting('db_agent_retry_interval_sec', '60');
    const interval = Number(intervalRaw);
    return {
      enabled: enabledRaw === 'true',
      retryIntervalSec: Number.isFinite(interval) && interval >= 10 ? interval : 60
    };
  }

  async refreshNow() {
    const { enabled, retryIntervalSec } = this.getAgentConfig();
    const { profiles, activeProfileId } = this.getProfilesState();
    const activeProfile = profiles.find((p) => p.id === activeProfileId);

    this.status.enabled = enabled;
    this.status.retryIntervalSec = retryIntervalSec;
    this.status.running = true;
    this.status.activeProfileId = activeProfileId || '';
    this.status.activeProfileName = activeProfile?.name || '';

    if (!enabled) {
      this.status.connected = false;
      this.status.message = 'SQL Server agent is disabled';
      this.status.lastCheckedAt = new Date().toISOString();
      this.status.running = false;
      this.emitStatus();
      return this.getStatus();
    }

    if (!activeProfile) {
      this.status.connected = false;
      this.status.message = 'No active database profile selected';
      this.status.lastCheckedAt = new Date().toISOString();
      this.status.running = false;
      this.emitStatus();
      return this.getStatus();
    }

    try {
      await MssqlSource.testConnection(activeProfile);
      this.status.connected = true;
      this.status.message = `Connected (${activeProfile.name || activeProfile.server})`;
      this.status.lastCheckedAt = new Date().toISOString();
    } catch (error) {
      this.status.connected = false;
      this.status.message = error.message || 'Connection failed';
      this.status.lastCheckedAt = new Date().toISOString();
    } finally {
      this.status.running = false;
      this.emitStatus();
    }

    return this.getStatus();
  }

  reschedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const { enabled, retryIntervalSec } = this.getAgentConfig();
    if (!enabled) return;
    this.timer = setInterval(() => {
      this.refreshNow().catch(() => {});
    }, retryIntervalSec * 1000);
  }

  async start() {
    if (this.started) {
      await this.refreshNow();
      this.reschedule();
      return;
    }
    this.started = true;
    await this.refreshNow();
    this.reschedule();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
  }

  async setEnabled(enabled) {
    this.writeSetting('db_agent_enabled', enabled ? 'true' : 'false', 'boolean');
    await this.start();
    return this.getStatus();
  }

  async setRetryIntervalSec(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 10 ? Math.floor(n) : 60;
    this.writeSetting('db_agent_retry_interval_sec', String(safe), 'number');
    await this.start();
    return this.getStatus();
  }
}

let instance = null;
export function getSqlServerAgent() {
  if (!instance) instance = new SqlServerAgent();
  return instance;
}
