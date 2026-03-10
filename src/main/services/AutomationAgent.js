import DatabaseManager from '../database/sqlite.js';
import MssqlSource from '../sources/MssqlSource.js';
import PipelineRunner from '../pipeline/PipelineRunner.js';
import ExportRunner from '../pipeline/ExportRunner.js';
import { decryptText } from '../utils/secureCrypto.js';

const CHECK_INTERVAL_MS = 60 * 1000; // check every minute so custom minute/hour schedules work

class AutomationAgent {
  constructor() {
    this.timer = null;
    this.started = false;
    this.statusEmitter = null;
    this.progressEmitter = null;
    this.status = {
      mode: 'manual',
      enabled: false,
      running: false,
      scheduleMode: 'days',
      intervalDays: 3,
      customEvery: 1,
      customUnit: 'hour',
      lastRunAt: null,
      nextRunAt: null,
      lastResult: '',
      sessionId: null
    };
  }

  setStatusEmitter(fn) {
    this.statusEmitter = fn;
  }

  setProgressEmitter(fn) {
    this.progressEmitter = fn;
  }

  emitStatus() {
    if (typeof this.statusEmitter === 'function') {
      this.statusEmitter({ ...this.status });
    }
  }

  emitProgress(payload) {
    if (typeof this.progressEmitter === 'function') {
      this.progressEmitter(payload);
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

  logEvent({ level = 'info', event, message, details = null, sessionId = null }) {
    const db = DatabaseManager.getDatabase();
    db.prepare(
      `INSERT INTO app_logs (level, event, message, details, session_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(level, event, message, details ? JSON.stringify(details) : null, sessionId || null);
  }

  getConfig() {
    const mode = (this.readSetting('automation_mode', 'manual') || 'manual').trim().toLowerCase();
    const scheduleModeRaw = (this.readSetting('automation_schedule_mode', 'days') || 'days')
      .trim()
      .toLowerCase();
    const intervalRaw = Number(this.readSetting('automation_interval_days', '3'));
    const intervalDays = Number.isFinite(intervalRaw) && intervalRaw >= 1 ? Math.floor(intervalRaw) : 3;
    const customEveryRaw = Number(this.readSetting('automation_custom_every', '1'));
    const customEvery =
      Number.isFinite(customEveryRaw) && customEveryRaw >= 1 ? Math.floor(customEveryRaw) : 1;
    const customUnitRaw = (this.readSetting('automation_custom_unit', 'hour') || 'hour')
      .trim()
      .toLowerCase();
    const customUnit = ['minute', 'hour', 'day'].includes(customUnitRaw) ? customUnitRaw : 'hour';
    const lastRunAt = this.readSetting('automation_last_run_at', '') || null;
    const scheduleMode = scheduleModeRaw === 'custom' ? 'custom' : 'days';
    return {
      mode: mode === 'automated' ? 'automated' : 'manual',
      enabled: mode === 'automated',
      scheduleMode,
      intervalDays,
      customEvery,
      customUnit,
      lastRunAt
    };
  }

  computeIntervalMs(cfg) {
    if (cfg?.scheduleMode === 'custom') {
      const every = Number.isFinite(cfg.customEvery) && cfg.customEvery >= 1 ? cfg.customEvery : 1;
      const unit = cfg.customUnit || 'hour';
      if (unit === 'minute') return every * 60 * 1000;
      if (unit === 'day') return every * 24 * 60 * 60 * 1000;
      return every * 60 * 60 * 1000;
    }
    const days = Number.isFinite(cfg?.intervalDays) && cfg.intervalDays >= 1 ? cfg.intervalDays : 3;
    return days * 24 * 60 * 60 * 1000;
  }

  computeNextRunAt(lastRunAt, cfg) {
    if (!lastRunAt) return new Date().toISOString();
    const base = new Date(lastRunAt).getTime();
    if (!Number.isFinite(base)) return new Date().toISOString();
    return new Date(base + this.computeIntervalMs(cfg)).toISOString();
  }

  async updateStatusFromConfig() {
    const cfg = this.getConfig();
    this.status.mode = cfg.mode;
    this.status.enabled = cfg.enabled;
    this.status.scheduleMode = cfg.scheduleMode;
    this.status.intervalDays = cfg.intervalDays;
    this.status.customEvery = cfg.customEvery;
    this.status.customUnit = cfg.customUnit;
    this.status.lastRunAt = cfg.lastRunAt;
    this.status.nextRunAt = this.computeNextRunAt(cfg.lastRunAt, cfg);
    this.emitStatus();
  }

  isDueNow() {
    const cfg = this.getConfig();
    if (!cfg.enabled) return false;
    if (!cfg.lastRunAt) return true;
    const last = new Date(cfg.lastRunAt).getTime();
    if (!Number.isFinite(last)) return true;
    const dueAt = last + this.computeIntervalMs(cfg);
    return Date.now() >= dueAt;
  }

  async runAutomationOnce(trigger = 'scheduled') {
    if (this.status.running) {
      return { success: false, error: 'Automation already running' };
    }

    this.status.running = true;
    this.status.lastResult = '';
    this.emitStatus();

    const { profiles, activeProfileId } = this.getProfilesState();
    const profile = profiles.find((p) => p.id === activeProfileId);
    if (!profile) {
      this.status.running = false;
      this.status.lastResult = 'No active database profile selected';
      this.emitStatus();
      return { success: false, error: this.status.lastResult };
    }

    const sessionId = `auto_${Date.now()}`;
    this.status.sessionId = sessionId;
    this.writeSetting('current_session_id', sessionId, 'string');

    try {
      this.emitProgress({ scope: 'automation', percent: 5, message: 'Importing from database' });
      const importResult = await MssqlSource.importWithProfile(profile, sessionId);

      this.emitProgress({ scope: 'automation', percent: 40, message: 'Generating titles' });
      const generateResult = PipelineRunner.generateTitlesForSession({
        sessionId,
        language: 'de',
        autoDetect: false,
        onProgress: (data) => this.emitProgress({ ...data, scope: 'automation' })
      });
      if (!generateResult.success) {
        throw new Error(generateResult.error || 'Generation failed');
      }

      this.emitProgress({ scope: 'automation', percent: 70, message: 'Saving CSV export' });
      const csvExportResult = await ExportRunner.exportCsvToStorage({
        language: 'de',
        sessionId,
        directProductCsv: true,
        onProgress: (data) => this.emitProgress({ ...data, scope: 'automation' })
      });

      const now = new Date().toISOString();
      this.writeSetting('automation_last_run_at', now, 'string');
      this.status.lastRunAt = now;
      this.status.nextRunAt = this.computeNextRunAt(now, {
        scheduleMode: this.status.scheduleMode,
        intervalDays: this.status.intervalDays,
        customEvery: this.status.customEvery,
        customUnit: this.status.customUnit
      });
      this.status.lastResult = `OK (${trigger})`;
      this.logEvent({
        event: 'automation.run',
        message: 'Automated pipeline completed',
        details: {
          trigger,
          sessionId,
          imported: importResult.inserted || 0,
          generated: generateResult.data?.generatedCount || 0,
          csvExportPath: csvExportResult.filePath
        },
        sessionId
      });
      this.emitProgress({ scope: 'automation', percent: 100, message: 'Automation complete' });
      return {
        success: true,
        data: {
          sessionId,
          importResult,
          generateResult: generateResult.data,
          csvExportResult
        }
      };
    } catch (error) {
      this.status.lastResult = error.message || 'Automation failed';
      this.logEvent({
        level: 'error',
        event: 'automation.run_failed',
        message: 'Automated pipeline failed',
        details: { trigger, error: this.status.lastResult },
        sessionId
      });
      return { success: false, error: this.status.lastResult };
    } finally {
      this.status.running = false;
      this.emitStatus();
    }
  }

  async refreshNow() {
    await this.updateStatusFromConfig();
    if (this.isDueNow()) {
      await this.runAutomationOnce('scheduled');
      await this.updateStatusFromConfig();
    }
    return this.getStatus();
  }

  reschedule() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.timer = setInterval(() => {
      this.refreshNow().catch(() => {});
    }, CHECK_INTERVAL_MS);
  }

  async start() {
    if (this.started) {
      await this.refreshNow();
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

  async setMode(mode) {
    const next = String(mode || 'manual').trim().toLowerCase() === 'automated' ? 'automated' : 'manual';
    this.writeSetting('automation_mode', next, 'string');
    if (next === 'manual') {
      this.status.lastResult = 'Manual mode enabled';
    }
    await this.refreshNow();
    return this.getStatus();
  }

  async setIntervalDays(days) {
    const raw = Number(days);
    const safe = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 3;
    this.writeSetting('automation_schedule_mode', 'days', 'string');
    this.writeSetting('automation_interval_days', safe, 'number');
    await this.refreshNow();
    return this.getStatus();
  }

  async setCustomSchedule({ every, unit }) {
    const rawEvery = Number(every);
    const safeEvery = Number.isFinite(rawEvery) && rawEvery >= 1 ? Math.floor(rawEvery) : 1;
    const safeUnit = ['minute', 'hour', 'day'].includes(String(unit || '').toLowerCase())
      ? String(unit).toLowerCase()
      : 'hour';
    this.writeSetting('automation_schedule_mode', 'custom', 'string');
    this.writeSetting('automation_custom_every', safeEvery, 'number');
    this.writeSetting('automation_custom_unit', safeUnit, 'string');
    await this.refreshNow();
    return this.getStatus();
  }

  async runNow() {
    const result = await this.runAutomationOnce('manual-trigger');
    await this.updateStatusFromConfig();
    return result;
  }
}

let instance = null;
export function getAutomationAgent() {
  if (!instance) instance = new AutomationAgent();
  return instance;
}
