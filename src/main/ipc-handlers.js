import { dialog, ipcMain } from 'electron';
import DatabaseManager from './database/sqlite.js';
import { hashTitle } from '../shared/utils/hash.js';
import GeneratedTitle from './database/models/GeneratedTitle.js';
import ExcelSource from './sources/ExcelSource.js';
import DatabaseSource from './sources/DatabaseSource.js';
import MssqlSource from './sources/MssqlSource.js';
import PipelineRunner from './pipeline/PipelineRunner.js';
import ExportRunner from './pipeline/ExportRunner.js';
import TitleHistory from './database/models/TitleHistory.js';
import { getSqlServerAgent } from './services/SqlServerAgent.js';
import { getAutomationAgent } from './services/AutomationAgent.js';
import RuleEngine from './title-engine/RuleEngine.js';
import AppSqlStore from './services/AppSqlStore.js';
import AuthService from './services/AuthService.js';
import { encryptText, decryptText } from './utils/secureCrypto.js';
import KnowledgeBaseImporter from './importers/KnowledgeBaseImporter.js';
import KnowledgeBaseStore from './services/KnowledgeBaseStore.js';

function parseLooseNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

  let text = String(value).trim();
  if (!text) return NaN;
  text = text.replace(/[^\d.,\-+]/g, '');
  if (!text) return NaN;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    text = text.replace(/,/g, '.');
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isSoldCountZero(value) {
  if (value === 0 || value === '0') return true;
  const parsed = parseLooseNumber(value);
  return Number.isFinite(parsed) && parsed === 0;
}

function normalizePrinterModelsForView(series, printerModels, bracketCodes = []) {
  const src = Array.isArray(printerModels) ? printerModels : [];
  const baseSeries = String(series || '').trim();
  let cleanModels = src.map((m) => String(m || '').replace(/\s+/g, ' ').trim()).filter(Boolean);

  // Samsung: when both SL-Mxxxx and Mxxxx exist, keep SL-Mxxxx only.
  const slMKeys = new Set(
    cleanModels
      .map((m) => m.match(/\bSL-([CM]?\d{3,4}[A-Z]{0,4})\b/i))
      .filter(Boolean)
      .map((m) => String(m[1] || '').toUpperCase())
  );
  if (slMKeys.size) {
    cleanModels = cleanModels.filter((m) => {
      const bare = m.match(/\b([CM]?\d{3,4}[A-Z]{0,4})\b/i);
      const isSl = /\bSL-[CM]?\d{3,4}/i.test(m);
      if (isSl) return true;
      if (!bare) return true;
      return !slMKeys.has(String(bare[1] || '').toUpperCase());
    });
  }

  const canonical = [];
  if (baseSeries) {
    // For compound series like 'MFC-L / DCP-L / HL-L', check against each segment.
    const seriesSegments = baseSeries.includes('/')
      ? baseSeries.split('/').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : [baseSeries.toLowerCase()];
    const isPrefixed = (m) => seriesSegments.some((seg) => m.toLowerCase().startsWith(seg));

    const prefixed = cleanModels.filter(isPrefixed);
    const raw = cleanModels.filter((m) => !isPrefixed(m));

    if (prefixed.length) {
      canonical.push(...prefixed);
      for (const m of raw) {
        const key = m.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const has = prefixed.some((p) => p.replace(/[^A-Z0-9]/gi, '').toUpperCase().endsWith(key));
        if (!has) canonical.push(m);
      }
    } else if (raw.length) {
      // Combine ALL raw models with the series prefix into one entry.
      canonical.push(`${baseSeries} ${raw.join(' ')}`.replace(/\s+/g, ' ').trim());
    } else {
      canonical.push(baseSeries);
    }
  } else {
    canonical.push(...cleanModels);
  }

  // Keep only most specific variants.
  const scored = canonical.map((model) => {
    const clean = model.replace(/\s+/g, ' ').trim();
    return { clean, key: clean.replace(/[^A-Z0-9]/gi, '').toUpperCase(), len: clean.length };
  });
  const keep = scored.filter((current, i) => !scored.some((other, j) => {
    if (i === j) return false;
    return other.key.length >= current.key.length && other.key.endsWith(current.key) && other.len >= current.len;
  })).map((x) => x.clean);

  const unique = [...new Set(keep)];

  // Collapse repeated series prefixes for readability:
  // DeskJet 2620, DeskJet 2630, DeskJet 3760 -> DeskJet 2620, 2630, 3760
  const compact = [];
  let lastPrefix = '';
  for (const model of unique) {
    const clean = String(model || '').trim();
    if (!clean) continue;

    const tokens = clean.split(/\s+/);
    let splitAt = 0;
    while (splitAt < tokens.length && !/\d/.test(tokens[splitAt])) splitAt += 1;

    if (splitAt > 0 && splitAt < tokens.length) {
      const prefix = tokens.slice(0, splitAt).join(' ');
      const rest = tokens.slice(splitAt).join(' ');
      const prefixKey = prefix.toLowerCase();
      if (compact.length && prefixKey === lastPrefix) {
        compact.push(rest);
      } else {
        compact.push(clean);
        lastPrefix = prefixKey;
      }
    } else {
      compact.push(clean);
      lastPrefix = '';
    }
  }

  const bracket = Array.isArray(bracketCodes) && bracketCodes.length ? String(bracketCodes[0] || '').trim() : '';
  if (bracket && compact.length && !compact[0].includes(bracket)) {
    compact[0] = `${compact[0]} ${bracket}`.replace(/\s+/g, ' ').trim();
  }
  return compact;
}

export function registerIpcHandlers(mainWindow) {
  ipcMain.removeHandler('app:ping');
  ipcMain.removeHandler('dialog:openExcel');
  ipcMain.removeHandler('dialog:saveExcel');
  ipcMain.removeHandler('data:importExcel');
  ipcMain.removeHandler('data:importDatabase');
  ipcMain.removeHandler('data:importJtlData');
  ipcMain.removeHandler('data:getProducts');
  ipcMain.removeHandler('data:extractElements');
  ipcMain.removeHandler('data:generateTitles');
  ipcMain.removeHandler('data:getGeneratedTitles');
  ipcMain.removeHandler('data:updateGeneratedTitle');
  ipcMain.removeHandler('data:exportExcel');
  ipcMain.removeHandler('data:exportCsv');
  ipcMain.removeHandler('data:getStats');
  ipcMain.removeHandler('data:getDashboardStats');
  ipcMain.removeHandler('data:getHistory');
  ipcMain.removeHandler('data:getLogs');
  ipcMain.removeHandler('data:resetSession');
  ipcMain.removeHandler('data:importKnowledgeBase');
  ipcMain.removeHandler('db:getProfiles');
  ipcMain.removeHandler('db:saveProfile');
  ipcMain.removeHandler('db:deleteProfile');
  ipcMain.removeHandler('db:setActiveProfile');
  ipcMain.removeHandler('db:testProfile');
  ipcMain.removeHandler('db:agent:getStatus');
  ipcMain.removeHandler('db:agent:refresh');
  ipcMain.removeHandler('db:agent:setEnabled');
  ipcMain.removeHandler('db:agent:setInterval');
  ipcMain.removeHandler('db:app:getProfiles');
  ipcMain.removeHandler('db:app:saveProfile');
  ipcMain.removeHandler('db:app:deleteProfile');
  ipcMain.removeHandler('db:app:setActiveProfile');
  ipcMain.removeHandler('db:app:testProfile');
  ipcMain.removeHandler('db:app:restoreRemote');
  ipcMain.removeHandler('auth:login');
  ipcMain.removeHandler('auth:verify');
  ipcMain.removeHandler('auth:logout');
  ipcMain.removeHandler('auth:listUsers');
  ipcMain.removeHandler('auth:createUser');
  ipcMain.removeHandler('auth:updateUser');
  ipcMain.removeHandler('auth:deleteUser');
  ipcMain.removeHandler('db:local:getTables');
  ipcMain.removeHandler('db:local:getTableData');
  ipcMain.removeHandler('db:local:deleteRows');
  ipcMain.removeHandler('db:app:getTables');
  ipcMain.removeHandler('db:app:getTableData');
  ipcMain.removeHandler('data:clearLogs');
  ipcMain.removeHandler('data:getSettings');
  ipcMain.removeHandler('data:updateSetting');
  ipcMain.removeHandler('automation:getStatus');
  ipcMain.removeHandler('automation:setMode');
  ipcMain.removeHandler('automation:setIntervalDays');
  ipcMain.removeHandler('automation:setCustomSchedule');
  ipcMain.removeHandler('automation:runNow');
  const sendProgress = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('progress', payload);
    }
  };
  const sendDbAgentStatus = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('db-agent-status', payload);
    }
  };
  const sendAutomationStatus = (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('automation-status', payload);
    }
  };

  const sqlAgent = getSqlServerAgent();
  sqlAgent.setStatusEmitter(sendDbAgentStatus);
  sqlAgent.start().catch(() => {});
  const automationAgent = getAutomationAgent();
  automationAgent.setStatusEmitter(sendAutomationStatus);
  automationAgent.setProgressEmitter(sendProgress);
  automationAgent.start().catch(() => {});

  const getCurrentSessionId = (db) => {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = 'current_session_id'")
      .get();
    return row?.value || null;
  };

  const resolveSessionId = (db) => getCurrentSessionId(db);
  let authSession = null;

  const getSettingValue = (db, key, fallback = '') => {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value ?? fallback;
  };

  const setSettingValue = (db, key, value, type = 'string') => {
    db.prepare(
      `INSERT INTO app_settings (key, value, value_type)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type`
    ).run(key, String(value), type);
  };

  const ensurePrimaryAppDbSetting = (db) => {
    const current = getSettingValue(db, 'app_db_primary', '');
    if (!current) {
      setSettingValue(db, 'app_db_primary', 'mysql', 'string');
      return 'mysql';
    }
    return current === 'sqlite' ? 'sqlite' : 'mysql';
  };

  const getAppDbPrimaryMode = () => {
    try {
      const db = DatabaseManager.getDatabase();
      return ensurePrimaryAppDbSetting(db);
    } catch {
      return 'mysql';
    }
  };

  const getActiveAppDbProfile = () => {
    try {
      return AppSqlStore.getActiveProfile();
    } catch {
      return null;
    }
  };

  const isPrimaryMysqlActive = () => {
    const profile = getActiveAppDbProfile();
    if (!profile) return false;
    if (getAppDbPrimaryMode() !== 'mysql') return false;
    return AppSqlStore.getDbType(profile) === 'mysql';
  };

  const logEvent = (db, { level = 'info', event, message, details = null, sessionId = null }) => {
    db.prepare(
      `INSERT INTO app_logs (level, event, message, details, session_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(level, event, message, details ? JSON.stringify(details) : null, sessionId || null);
  };

  const getJtlDbProfilesState = (db) => {
    const profilesRaw = getSettingValue(db, 'jtl_db_profiles', getSettingValue(db, 'db_profiles', '[]'));
    const activeProfileId = getSettingValue(
      db,
      'active_jtl_db_profile_id',
      getSettingValue(db, 'active_db_profile_id', '')
    );
    let profiles = [];
    try {
      const parsed = JSON.parse(profilesRaw || '[]');
      if (Array.isArray(parsed)) profiles = parsed;
    } catch {
      profiles = [];
    }
    const normalized = profiles.map((p) => ({
      ...p,
      password: decryptText(p.password || '')
    }));
    const nextActive = normalized.some((p) => p.id === activeProfileId) ? activeProfileId : '';
    return { profiles: normalized, activeProfileId: nextActive };
  };

  const persistJtlProfilesState = (db, profiles, activeProfileId) => {
    const encryptedProfiles = (profiles || []).map((p) => ({
      ...p,
      password: p?.password ? encryptText(p.password) : ''
    }));
    setSettingValue(db, 'jtl_db_profiles', JSON.stringify(encryptedProfiles), 'string');
    setSettingValue(db, 'active_jtl_db_profile_id', activeProfileId || '', 'string');
    // backward compatibility for existing services
    setSettingValue(db, 'db_profiles', JSON.stringify(encryptedProfiles), 'string');
    setSettingValue(db, 'active_db_profile_id', activeProfileId || '', 'string');
  };

  const pendingSyncSessions = new Set();
  const queueSessionSync = (sessionId) => {
    if (!sessionId || pendingSyncSessions.has(sessionId)) return;
    pendingSyncSessions.add(sessionId);
    setTimeout(async () => {
      try {
        await AppSqlStore.syncSession(sessionId);
      } catch (error) {
        console.error('[AppSqlSync] Failed:', error.message);
      } finally {
        pendingSyncSessions.delete(sessionId);
      }
    }, 0);
  };

  // Push all local sessions to MySQL — used when a profile is first configured on a system with existing data
  const queueAllLocalSessionsSync = () => {
    try {
      const db = DatabaseManager.getDatabase();
      const localCount = db.prepare('SELECT COUNT(*) as c FROM products').get()?.c || 0;
      if (localCount > 0) {
        const sessions = db
          .prepare("SELECT DISTINCT session_id FROM products WHERE session_id IS NOT NULL AND session_id != ''")
          .all();
        for (const { session_id } of sessions) {
          queueSessionSync(session_id);
        }
        console.log(`[AppSqlSync] Queued ${sessions.length} local session(s) for push to App DB`);
        return true;
      }
    } catch (e) {
      console.error('[AppSqlSync] queueAllLocalSessionsSync error:', e.message);
    }
    return false;
  };

  let remoteRestorePromise = null;
  let remoteRestoreTimer = null;
  const queueRemoteRestore = (options = {}) => {
    if (remoteRestorePromise) return remoteRestorePromise;
    remoteRestorePromise = (async () => {
      try {
        const db = DatabaseManager.getDatabase();
        const primaryMode = ensurePrimaryAppDbSetting(db);
        const profile = getActiveAppDbProfile();
        const isPrimaryMysql = primaryMode === 'mysql' && profile && AppSqlStore.getDbType(profile) === 'mysql';
        const force = Boolean(options?.force) || isPrimaryMysql;
        const result = await AppSqlStore.restoreFromRemote({ ...options, force });
        if (result?.synced) {
          console.log('[AppSqlSync] Restored local data from App DB', result.counts || {});
        } else if (isPrimaryMysql && result?.reason === 'No remote app data found') {
          const pushed = queueAllLocalSessionsSync();
          try {
            await AppSqlStore.syncKnowledgeBase();
          } catch (error) {
            console.error('[AppSqlSync] Knowledge base sync failed:', error.message);
          }
          if (pushed) {
            console.log('[AppSqlSync] Remote empty; pushed local data to App DB');
          }
        }
        return result;
      } catch (error) {
        console.error('[AppSqlSync] Restore failed:', error.message);
        return { synced: false, reason: error.message };
      } finally {
        remoteRestorePromise = null;
      }
    })();
    return remoteRestorePromise;
  };

  const scheduleRemoteRestore = () => {
    if (remoteRestoreTimer) {
      clearInterval(remoteRestoreTimer);
      remoteRestoreTimer = null;
    }
    if (!isPrimaryMysqlActive()) return;
    remoteRestoreTimer = setInterval(() => {
      queueRemoteRestore({ force: true }).catch(() => {});
    }, 5 * 60 * 1000);
  };

  setTimeout(() => {
    queueRemoteRestore().catch(() => {});
    scheduleRemoteRestore();
  }, 50);

  ipcMain.handle('app:ping', async () => 'pong');

  ipcMain.handle('dialog:openExcel', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });


  ipcMain.handle('dialog:saveExcel', async (_event, defaultPath) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultPath || 'Generated_Titles.xlsx',
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('data:importExcel', async (_event, filePath) => {
    if (!filePath) return { success: false, error: 'No file path provided' };
    try {
      const sessionId = `s_${Date.now()}`;
      const db = DatabaseManager.getDatabase();
      db.prepare(
        `INSERT INTO app_settings (key, value, value_type)
         VALUES ('current_session_id', ?, 'string')
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(sessionId);
      sendProgress({ scope: 'import', percent: 5, message: 'Reading Excel' });
      const result = await ExcelSource.importIntoSession(filePath, sessionId);
      if (result.total > 0) {
        TitleHistory.create({
          product_id: 1,
          action: 'imported',
          destination: 'excel',
          export_filename: filePath,
          metadata: { inserted: result.inserted, skipped: result.skipped, total: result.total },
          session_id: sessionId
        });
      }
      queueSessionSync(sessionId);
      sendProgress({ scope: 'import', percent: 100, message: 'Import complete' });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:importDatabase', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const { profiles, activeProfileId } = getJtlDbProfilesState(db);
      const profile = profiles.find((p) => p.id === activeProfileId);
      if (!profile) {
        return { success: false, data: null, error: 'No active database profile selected' };
      }

      const sessionId = `s_${Date.now()}`;
      setSettingValue(db, 'current_session_id', sessionId, 'string');

      sendProgress({ scope: 'import', percent: 10, message: 'Connecting to database' });
      const result = await MssqlSource.importWithProfile(profile, sessionId);

      if (result.total > 0) {
        TitleHistory.create({
          product_id: 1,
          action: 'imported',
          destination: 'database',
          export_filename: profile.name || profile.server,
          metadata: {
            inserted: result.inserted,
            skipped: result.skipped,
            total: result.total,
            profile_id: profile.id
          },
          session_id: sessionId
        });
      }
      queueSessionSync(sessionId);

      sendProgress({ scope: 'import', percent: 100, message: 'Database import complete' });
      logEvent(db, {
        event: 'import.database',
        message: 'Database import completed',
        details: { total: result.total, inserted: result.inserted, skipped: result.skipped },
        sessionId
      });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:importJtlData', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const { profiles, activeProfileId } = getJtlDbProfilesState(db);
      const profile = profiles.find((p) => p.id === activeProfileId);
      if (!profile) {
        return { success: false, data: null, error: 'No active database profile selected' };
      }

      const sessionId = `s_${Date.now()}`;
      setSettingValue(db, 'current_session_id', sessionId, 'string');

      sendProgress({ scope: 'import', percent: 10, message: 'Connecting to database' });
      const result = await MssqlSource.importJtlData(profile, sessionId);

      if (result.total > 0) {
        TitleHistory.create({
          product_id: 1,
          action: 'imported',
          destination: 'jtl',
          export_filename: profile.name || profile.server,
          metadata: {
            inserted: result.inserted,
            skipped: result.skipped,
            total: result.total,
            profile_id: profile.id
          },
          session_id: sessionId
        });
      }
      queueSessionSync(sessionId);

      sendProgress({ scope: 'import', percent: 100, message: 'JTL import complete' });
      logEvent(db, {
        event: 'import.jtl',
        message: 'JTL import completed',
        details: { total: result.total, inserted: result.inserted, skipped: result.skipped },
        sessionId
      });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });


  ipcMain.handle('data:getProducts', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      const data = sessionId
        ? db
            .prepare(
              `SELECT id as __preview_id, item_number, sku, original_title, sold_count, price, suggested_price, source
               FROM products
               WHERE session_id = ?
               ORDER BY id DESC`
            )
            .all(sessionId)
            .filter((row) => isSoldCountZero(row.sold_count))
        : [];
      return { success: true, data, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:extractElements', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      const products = DatabaseSource.getSessionProducts(sessionId).filter((row) => isSoldCountZero(row.sold_count));
      if (!products.length) {
        return { success: false, data: null, error: 'No products found' };
      }
      const kbEntries = KnowledgeBaseStore.getAllEntries();

      const extracted = [];
      for (let i = 0; i < products.length; i += 1) {
        const product = products[i];
        const autoElements = RuleEngine.extractComponents(product.original_title || '', product.sku || '');
        const rectified = KnowledgeBaseStore.rectifyElementsByKnowledgeBase(
          product.original_title || '',
          autoElements,
          kbEntries
        );
        const elements = rectified.elements;
        const printerModels = normalizePrinterModelsForView(
          elements.series,
          elements.printerModels || [],
          elements.bracketCodes || []
        );
        extracted.push({
          id: product.id,
          item_number: product.item_number,
          sku: product.sku,
          old_title: product.original_title,
          category: elements.category,
          brand: elements.brand,
          printer_brand: elements.printerBrand || '',
          kompatibel: elements.kompatibel || '',
          cartridge_models: (elements.cartridgeModels || []).join(', '),
          printer_models: printerModels.join(', '),
          set_of: elements.setOf || '',
          qty: elements.qty || '',
          color: elements.color || '',
          extra: elements.extra || '',
          verification_status: elements.verification?.status || 'ok',
          verification_confidence: Number(elements.verification?.confidence ?? 100),
          verification_issues: (elements.verification?.issues || []).join(', ')
        });
        if ((i + 1) % 200 === 0 || i === products.length - 1) {
          sendProgress({
            scope: 'generate',
            percent: Math.min(95, Math.round(((i + 1) / products.length) * 95)),
            message: `Extracting ${i + 1}/${products.length}`
          });
        }
      }
      sendProgress({ scope: 'generate', percent: 100, message: 'Extraction complete' });

      return {
        success: true,
        data: {
          total: extracted.length,
          extracted
        },
        error: null
      };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:generateTitles', async (_event, payload) => {
    const language = payload?.language || 'de';
    const autoDetect = payload?.autoDetect || false;
    try {
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      const result = PipelineRunner.generateTitlesForSession({
        sessionId,
        language,
        autoDetect,
        onProgress: sendProgress
      });
      if (result.success) {
        logEvent(db, {
          event: 'generate.titles',
          message: 'Title generation completed',
          details: result.data,
          sessionId
        });
        queueSessionSync(sessionId);
      }
      return result;
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:getSettings', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const rows = db.prepare('SELECT key, value, value_type FROM app_settings').all();
      const settings = {};
      rows.forEach((row) => {
        if (row.value_type === 'boolean') settings[row.key] = row.value === 'true';
        else if (row.value_type === 'number') settings[row.key] = Number(row.value);
        else settings[row.key] = row.value;
      });
      return { success: true, data: settings, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:updateSetting', async (_event, payload) => {
    const { key, value } = payload || {};
    if (!key) return { success: false, error: 'Missing key' };
    try {
      const db = DatabaseManager.getDatabase();
      const valueType =
        typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string';
      db.prepare(
        `INSERT INTO app_settings (key, value, value_type)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, value_type = excluded.value_type`
      ).run(key, String(value), valueType);
      return { success: true, data: { key, value }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:getProfiles', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const { profiles, activeProfileId } = getJtlDbProfilesState(db);
      return { success: true, data: { profiles, activeProfileId }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:saveProfile', async (_event, payload) => {
    try {
      const fixedQuery = MssqlSource.getJtlImportQuery();
      const db = DatabaseManager.getDatabase();
      const { profiles, activeProfileId } = getJtlDbProfilesState(db);
      const profile = payload?.profile || {};
      const id = profile.id || `db_${Date.now()}`;
      const nextProfile = {
        id,
        name: profile.name || profile.server || id,
        dbType: (profile.dbType || 'mssql').toLowerCase() === 'mysql' ? 'mysql' : 'mssql',
        server: profile.server || '',
        database: profile.database || '',
        authentication: profile.authentication || 'sql',
        user: profile.user || '',
        password: profile.password || '',
        port: profile.port || '',
        encrypt: profile.encrypt !== false,
        trustServerCertificate: profile.trustServerCertificate !== false,
        query: fixedQuery,
        priceUpdateQuery:
          profile.priceUpdateQuery ||
          'UPDATE your_table SET price = @new_price WHERE item_number = @item_number AND sku = @sku'
      };
      const idx = profiles.findIndex((p) => p.id === id);
      if (idx >= 0) profiles[idx] = nextProfile;
      else profiles.push(nextProfile);

      const nextActive = payload?.setActive ? id : activeProfileId || id;
      persistJtlProfilesState(db, profiles, nextActive);
      sqlAgent.refreshNow().catch(() => {});
      return { success: true, data: { id: nextProfile.id, profiles, activeProfileId: nextActive }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:deleteProfile', async (_event, payload) => {
    try {
      const db = DatabaseManager.getDatabase();
      const { profiles, activeProfileId } = getJtlDbProfilesState(db);
      const id = payload?.id;
      const nextProfiles = profiles.filter((p) => p.id !== id);
      const nextActive = activeProfileId === id ? (nextProfiles[0]?.id || '') : activeProfileId;
      persistJtlProfilesState(db, nextProfiles, nextActive);
      sqlAgent.refreshNow().catch(() => {});
      return { success: true, data: { profiles: nextProfiles, activeProfileId: nextActive }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:setActiveProfile', async (_event, payload) => {
    try {
      const db = DatabaseManager.getDatabase();
      const { profiles } = getJtlDbProfilesState(db);
      persistJtlProfilesState(db, profiles, payload?.id || '');
      sqlAgent.refreshNow().catch(() => {});
      return { success: true, data: { activeProfileId: payload?.id || '' }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:testProfile', async (_event, payload) => {
    try {
      const profile = payload?.profile;
      if (!profile) return { success: false, data: null, error: 'Missing profile payload' };
      const result = await MssqlSource.testConnection(profile);
      return { success: true, data: result.data, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:getProfiles', async () => {
    try {
      const { profiles, activeProfileId } = AppSqlStore.getProfilesState();
      const sanitized = (profiles || []).map((p) => ({
        ...p,
        dbType: AppSqlStore.getDbType(p),
        password: p?.password ? decryptText(p.password) : ''
      }));
      return { success: true, data: { profiles: sanitized, activeProfileId }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:saveProfile', async (_event, payload) => {
    try {
      const db = DatabaseManager.getDatabase();
      const state = AppSqlStore.getProfilesState();
      const profile = payload?.profile || {};
      const id = profile.id || `appdb_${Date.now()}`;
      const nextProfile = {
        id,
        name: profile.name || profile.server || id,
        dbType: AppSqlStore.getDbType(profile),
        server: profile.server || '',
        database: profile.database || '',
        authentication: profile.authentication || 'sql',
        user: profile.user || '',
        password: profile.password ? encryptText(profile.password) : '',
        port: profile.port || '',
        encrypt: profile.encrypt !== false,
        trustServerCertificate: profile.trustServerCertificate !== false
      };
      const nextProfiles = [...(state.profiles || [])];
      const idx = nextProfiles.findIndex((p) => p.id === id);
      if (idx >= 0) nextProfiles[idx] = nextProfile;
      else nextProfiles.push(nextProfile);

      setSettingValue(db, 'app_db_profiles', JSON.stringify(nextProfiles), 'string');
      const nextActive = payload?.setActive ? id : state.activeProfileId || id;
      setSettingValue(db, 'active_app_db_profile_id', nextActive, 'string');
      if (nextActive) {
        // If local already has data → push all sessions to MySQL; otherwise pull from MySQL
        const pushed = queueAllLocalSessionsSync();
        if (!pushed) queueRemoteRestore().catch(() => {});
        scheduleRemoteRestore();
      }
      const responseProfiles = nextProfiles.map((p) => ({ ...p, password: decryptText(p.password || '') }));
      return {
        success: true,
        data: { id, profiles: responseProfiles, activeProfileId: nextActive },
        error: null
      };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:deleteProfile', async (_event, payload) => {
    try {
      const db = DatabaseManager.getDatabase();
      const state = AppSqlStore.getProfilesState();
      const id = payload?.id;
      const nextProfiles = (state.profiles || []).filter((p) => p.id !== id);
      setSettingValue(db, 'app_db_profiles', JSON.stringify(nextProfiles), 'string');
      const nextActive = state.activeProfileId === id ? nextProfiles[0]?.id || '' : state.activeProfileId;
      setSettingValue(db, 'active_app_db_profile_id', nextActive, 'string');
      if (nextActive) {
        const pushed = queueAllLocalSessionsSync();
        if (!pushed) queueRemoteRestore().catch(() => {});
        scheduleRemoteRestore();
      }
      const responseProfiles = nextProfiles.map((p) => ({ ...p, password: decryptText(p.password || '') }));
      return { success: true, data: { profiles: responseProfiles, activeProfileId: nextActive }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:setActiveProfile', async (_event, payload) => {
    try {
      const db = DatabaseManager.getDatabase();
      setSettingValue(db, 'active_app_db_profile_id', payload?.id || '', 'string');
      if (payload?.id) {
        const pushed = queueAllLocalSessionsSync();
        if (!pushed) queueRemoteRestore().catch(() => {});
        scheduleRemoteRestore();
      }
      return { success: true, data: { activeProfileId: payload?.id || '' }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:testProfile', async (_event, payload) => {
    try {
      const profile = payload?.profile;
      if (!profile) return { success: false, data: null, error: 'Missing profile payload' };
      await AppSqlStore.testConnection({
        ...profile,
        password: profile.password ? encryptText(profile.password) : ''
      });
      return { success: true, data: { ok: 1 }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:restoreRemote', async (_event, payload) => {
    try {
      const result = await queueRemoteRestore({ force: Boolean(payload?.force) });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('auth:login', async (_event, payload) => {
    try {
      const username = payload?.username || '';
      const password = payload?.password || '';
      const result = await AuthService.login(username, password);
      authSession = { token: result.token, user: result.user };
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('auth:verify', async (_event, payload) => {
    try {
      const token = payload?.token || '';
      const decoded = AuthService.verifyToken(token);
      authSession = {
        token,
        user: { id: Number(decoded.sub), username: decoded.username, role: decoded.role || 'user' }
      };
      return { success: true, data: authSession.user, error: null };
    } catch {
      authSession = null;
      return { success: false, data: null, error: 'Invalid session token' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    authSession = null;
    return { success: true, data: true, error: null };
  });

  ipcMain.handle('auth:listUsers', async () => {
    try {
      if (!authSession?.user || authSession.user.role !== 'admin') {
        return { success: false, data: null, error: 'Admin access required' };
      }
      const users = await AuthService.listUsers();
      return { success: true, data: users, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('auth:createUser', async (_event, payload) => {
    try {
      if (!authSession?.user || authSession.user.role !== 'admin') {
        return { success: false, data: null, error: 'Admin access required' };
      }
      await AuthService.createUser(payload || {});
      return { success: true, data: true, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('auth:updateUser', async (_event, payload) => {
    try {
      if (!authSession?.user || authSession.user.role !== 'admin') {
        return { success: false, data: null, error: 'Admin access required' };
      }
      await AuthService.updateUser(payload || {});
      return { success: true, data: true, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('auth:deleteUser', async (_event, payload) => {
    try {
      if (!authSession?.user || authSession.user.role !== 'admin') {
        return { success: false, data: null, error: 'Admin access required' };
      }
      await AuthService.deleteUser(payload || {});
      const db = DatabaseManager.getDatabase();
      logEvent(db, {
        level: 'info',
        event: 'auth.deleteUser',
        message: `User deleted: id=${payload?.id}`,
        details: { targetId: payload?.id },
        sessionId: resolveSessionId(db)
      });
      return { success: true, data: true, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:local:getTables', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all();
      const result = tables.map((t) => {
        try {
          const count = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get().count;
          return { name: t.name, count };
        } catch {
          return { name: t.name, count: 0 };
        }
      });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:local:getTableData', async (_event, payload) => {
    try {
      const tableName = payload?.table;
      if (!tableName) return { success: false, data: null, error: 'No table specified' };
      const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
      const page = Math.max(1, Number(payload?.page) || 1);
      const pageSize = Math.min(500, Math.max(10, Number(payload?.pageSize) || 50));
      const offset = (page - 1) * pageSize;
      const db = DatabaseManager.getDatabase();
      const cols = db.prepare(`PRAGMA table_info("${safeTable}")`).all().map((c) => c.name);
      const total = db.prepare(`SELECT COUNT(*) as count FROM "${safeTable}"`).get().count;
      const rows = db
        .prepare(`SELECT * FROM "${safeTable}" ORDER BY rowid DESC LIMIT ? OFFSET ?`)
        .all(pageSize, offset);
      return { success: true, data: { rows, total, columns: cols }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:local:deleteRows', async (_event, payload) => {
    try {
      if (!authSession?.user || authSession.user.role !== 'admin') {
        return { success: false, data: null, error: 'Admin access required' };
      }
      const tableName = payload?.table;
      const ids = payload?.ids;
      if (!tableName || !Array.isArray(ids) || !ids.length) {
        return { success: false, data: null, error: 'Missing table or ids' };
      }
      const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
      const db = DatabaseManager.getDatabase();
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM "${safeTable}" WHERE id IN (${placeholders})`).run(...ids);
      logEvent(db, {
        level: 'info',
        event: 'db.viewer.delete',
        message: `Admin deleted ${result.changes} row(s) from table: ${safeTable}`,
        details: { table: safeTable, ids, deletedCount: result.changes },
        sessionId: resolveSessionId(db)
      });
      return { success: true, data: { deleted: result.changes }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:getTables', async () => {
    try {
      const profile = AppSqlStore.getActiveProfile();
      if (!profile) return { success: false, data: null, error: 'No active App SQL profile configured' };
      const result = await AppSqlStore.withClient(profile, async ({ dialect, conn, pool }) => {
        if (dialect === 'mysql') {
          const dbName = profile.database || '';
          const [rows] = await conn.query(
            `SELECT TABLE_NAME as name, TABLE_ROWS as approx_count
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
             ORDER BY TABLE_NAME`,
            [dbName]
          );
          return (rows || []).map((r) => ({ name: r.name, count: Number(r.approx_count) || 0 }));
        } else {
          const res = await pool.request().query(
            `SELECT t.name, SUM(p.rows) AS approx_count
             FROM sys.tables t
             JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
             GROUP BY t.name ORDER BY t.name`
          );
          return (res.recordset || []).map((r) => ({ name: r.name, count: Number(r.approx_count) || 0 }));
        }
      });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:app:getTableData', async (_event, payload) => {
    try {
      const profile = AppSqlStore.getActiveProfile();
      if (!profile) return { success: false, data: null, error: 'No active App SQL profile configured' };
      const tableName = payload?.table;
      if (!tableName) return { success: false, data: null, error: 'No table specified' };
      const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
      const page = Math.max(1, Number(payload?.page) || 1);
      const pageSize = Math.min(500, Math.max(10, Number(payload?.pageSize) || 50));
      const offset = (page - 1) * pageSize;

      const result = await AppSqlStore.withClient(profile, async ({ dialect, conn, pool }) => {
        if (dialect === 'mysql') {
          const [[{ total }]] = await conn.query(`SELECT COUNT(*) as total FROM \`${safeTable}\``);
          const [rows] = await conn.query(`SELECT * FROM \`${safeTable}\` ORDER BY id DESC LIMIT ? OFFSET ?`, [pageSize, offset]);
          const cols = rows.length ? Object.keys(rows[0]) : [];
          return { rows, total: Number(total), columns: cols };
        } else {
          const countRes = await pool.request().query(`SELECT COUNT(*) as total FROM [${safeTable}]`);
          const total = Number(countRes.recordset[0]?.total) || 0;
          const dataRes = await pool.request().query(
            `SELECT * FROM [${safeTable}] ORDER BY id DESC OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`
          );
          const rows = dataRes.recordset || [];
          const cols = rows.length ? Object.keys(rows[0]) : [];
          return { rows, total, columns: cols };
        }
      });
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:clearLogs', async () => {
    try {
      if (!authSession?.user || authSession.user.role !== 'admin') {
        return { success: false, data: null, error: 'Admin access required' };
      }
      const db = DatabaseManager.getDatabase();
      const result = db.prepare('DELETE FROM app_logs').run();
      return { success: true, data: { deleted: result.changes }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:agent:getStatus', async () => {
    try {
      return { success: true, data: sqlAgent.getStatus(), error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:agent:refresh', async () => {
    try {
      const status = await sqlAgent.refreshNow();
      return { success: true, data: status, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:agent:setEnabled', async (_event, payload) => {
    try {
      const status = await sqlAgent.setEnabled(Boolean(payload?.enabled));
      return { success: true, data: status, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('db:agent:setInterval', async (_event, payload) => {
    try {
      const status = await sqlAgent.setRetryIntervalSec(payload?.retryIntervalSec);
      return { success: true, data: status, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('automation:getStatus', async () => {
    try {
      const status = await automationAgent.refreshNow();
      return { success: true, data: status, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('automation:setMode', async (_event, payload) => {
    try {
      const status = await automationAgent.setMode(payload?.mode);
      return { success: true, data: status, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('automation:setIntervalDays', async (_event, payload) => {
    try {
      const status = await automationAgent.setIntervalDays(payload?.intervalDays);
      return { success: true, data: status, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('automation:setCustomSchedule', async (_event, payload) => {
    try {
      const status = await automationAgent.setCustomSchedule({
        every: payload?.every,
        unit: payload?.unit
      });
      return { success: true, data: status, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('automation:runNow', async () => {
    try {
      const result = await automationAgent.runNow();
      return { success: result.success, data: result.data || null, error: result.error || null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:getGeneratedTitles', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      const rows = sessionId
        ? db
            .prepare(
              `SELECT gt.id, gt.product_id, gt.title, gt.language, gt.variation_number,
                      COALESCE(gt.marketplace, 'ebay') AS marketplace,
                      COALESCE(gt.item_number, p.item_number) AS item_number,
                      COALESCE(gt.sku, p.sku) AS sku,
                      p.original_title, p.price, p.sold_count, p.suggested_price
               FROM generated_titles gt
               JOIN products p ON p.id = gt.product_id
               WHERE gt.session_id = ?
               ORDER BY gt.created_at DESC, gt.variation_number ASC`
            )
            .all(sessionId)
        : [];
      return { success: true, data: rows, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:updateGeneratedTitle', async (_event, payload) => {
    const { id, title } = payload || {};
    if (!id || !title) return { success: false, error: 'Missing id or title' };
    try {
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      const row = db.prepare('SELECT product_id, session_id FROM generated_titles WHERE id = ?').get(id);
      const productId = row?.product_id || '';
      const sessionSalt = row?.session_id || sessionId || '';
      const titleHash = hashTitle(`${title}||${sessionSalt}||${productId}`);
      const result = GeneratedTitle.updateTitle(id, title, titleHash, title.length);
      if (!result.success) return result;
      queueSessionSync(sessionSalt);
      return { success: true, data: result.data, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:exportExcel', async (_event, payload) => {
    const filePath = payload?.filePath;
    const language = payload?.language || 'de';
    try {
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      const result = await ExportRunner.exportExcelToFile({
        filePath,
        language,
        sessionId,
        onProgress: sendProgress
      });
      logEvent(db, {
        event: 'export.excel',
        message: 'Excel export completed',
        details: { filePath, count: result.count || 0 },
        sessionId
      });
      queueSessionSync(sessionId);
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:exportCsv', async (_event, payload) => {
    const language = payload?.language || 'de';
    try {
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      const result = await ExportRunner.exportCsvToStorage({
        language,
        sessionId,
        onProgress: sendProgress
      });
      logEvent(db, {
        event: 'export.csv',
        message: 'CSV export completed',
        details: { filePath: result.filePath, count: result.count || 0, exportId: result.exportId || null },
        sessionId
      });
      queueSessionSync(sessionId);
      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:getStats', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const products = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
      const titles = db.prepare('SELECT COUNT(*) as count FROM generated_titles').get().count;
      return { success: true, data: { products, titles }, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:getDashboardStats', async () => {
    try {
      const db = DatabaseManager.getDatabase();

      const totalSkus = db.prepare('SELECT COUNT(DISTINCT sku) as c FROM extracted_elements').get()?.c ?? 0;
      const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get()?.c ?? 0;

      const today = new Date().toISOString().slice(0, 10);
      const newSkusToday = db.prepare(
        "SELECT COUNT(DISTINCT sku) as c FROM extracted_elements WHERE date(extracted_at) = ?"
      ).get(today)?.c ?? 0;

      const titlesGenerated = db.prepare('SELECT COUNT(*) as c FROM generated_titles').get()?.c ?? 0;
      const titlesGeneratedToday = db.prepare(
        "SELECT COUNT(*) as c FROM generated_titles WHERE date(created_at) = ?"
      ).get(today)?.c ?? 0;

      const priceDecreased = db.prepare(
        "SELECT COUNT(*) as c FROM price_history WHERE price_action = 'decrease' AND date(recorded_at) = ?"
      ).get(today)?.c ?? 0;
      const priceIncreased = db.prepare(
        "SELECT COUNT(*) as c FROM price_history WHERE price_action = 'increase' AND date(recorded_at) = ?"
      ).get(today)?.c ?? 0;

      // Marketplace breakdown of generated titles
      const marketplaceRows = db.prepare(
        `SELECT COALESCE(marketplace, 'ebay') as marketplace, COUNT(*) as c
         FROM generated_titles GROUP BY marketplace`
      ).all();
      const byMarketplace = {};
      for (const r of marketplaceRows) byMarketplace[r.marketplace] = r.c;

      // Pending price updates
      const pendingPriceUpdates = db.prepare(
        "SELECT COUNT(*) as c FROM products WHERE price_update_status = 'pending'"
      ).get()?.c ?? 0;

      const exportedToday = db.prepare(
        "SELECT COUNT(*) as c FROM title_history WHERE action = 'exported' AND date(created_at) = ?"
      ).get(today)?.c ?? 0;

      return {
        success: true,
        data: {
          totalSkus,
          totalProducts,
          newSkusToday,
          titlesGenerated,
          titlesGeneratedToday,
          priceDecreased,
          priceIncreased,
          pendingPriceUpdates,
          exportedToday,
          byMarketplace
        },
        error: null
      };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:getHistory', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const rows = db
        .prepare(
          `SELECT th.id, th.product_id, th.generated_title_id, th.action, th.destination,
                  th.export_filename, th.metadata, th.created_at,
                  p.item_number, p.sku, p.original_title,
                  p.price, p.sold_count, p.suggested_price, p.price_adjustment, p.price_update_status,
                  gt.title AS new_title
           FROM title_history th
           LEFT JOIN products p ON p.id = th.product_id
           LEFT JOIN generated_titles gt ON gt.id = th.generated_title_id
           ORDER BY datetime(th.created_at) DESC
           LIMIT 500`
        )
        .all();
      return { success: true, data: rows, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:getLogs', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const rows = db
        .prepare(
          `SELECT id, level, event, message, details, session_id, created_at
           FROM app_logs
           ORDER BY datetime(created_at) DESC
           LIMIT 1000`
        )
        .all();
      return { success: true, data: rows, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:resetSession', async () => {
    try {
      const db = DatabaseManager.getDatabase();
      const previousSessionId = resolveSessionId(db);
      db.prepare('DELETE FROM generated_titles').run();
      db.prepare('DELETE FROM products').run();
      db.prepare("UPDATE app_settings SET value = '' WHERE key = 'current_session_id'").run();
      queueSessionSync(previousSessionId);
      return { success: true, data: true, error: null };
    } catch (error) {
      return { success: false, data: null, error: error.message };
    }
  });

  ipcMain.handle('data:importKnowledgeBase', async (_event, payload) => {
    const filePath = payload?.filePath || '';
    if (!filePath) return { success: false, data: null, error: 'No file path provided' };
    try {
      sendProgress({ scope: 'kb-import', percent: 1, message: 'reading Excel' });
      const primaryMysql = isPrimaryMysqlActive();
      const result = await KnowledgeBaseImporter.importFile(filePath, (progress) => {
        sendProgress({
          scope: 'kb-import',
          percent: progress?.percent ?? 0,
          message: progress?.message || 'saving local DB'
        });
      }, { collectEntries: primaryMysql });
      const db = DatabaseManager.getDatabase();
      const sessionId = resolveSessionId(db);
      let remoteSync = { synced: false };
      try {
        if (primaryMysql && Array.isArray(result?.entries)) {
          remoteSync = await AppSqlStore.replaceKnowledgeBaseEntries(result.entries, (progress) => {
            sendProgress({
              scope: 'kb-import',
              percent: progress?.percent ?? 75,
              message: progress?.message || 'sending to App SQL'
            });
          });
        } else {
          remoteSync = await AppSqlStore.syncKnowledgeBase((progress) => {
            sendProgress({
              scope: 'kb-import',
              percent: progress?.percent ?? 75,
              message: progress?.message || 'sending to App SQL'
            });
          });
        }
      } catch (error) {
        remoteSync = { synced: false, error: error.message };
      }
      logEvent(db, {
        event: 'knowledge_base.import',
        message: 'Knowledge base imported from Excel',
        details: { ...result, remoteSync },
        sessionId
      });
      if (sessionId) queueSessionSync(sessionId);
      sendProgress({ scope: 'kb-import', percent: 100, message: 'Knowledge base import complete' });
      return { success: true, data: { ...result, remoteSync }, error: null };
    } catch (error) {
      sendProgress({ scope: 'kb-import', percent: 100, message: 'Knowledge base import failed' });
      return { success: false, data: null, error: error.message };
    }
  });

}
