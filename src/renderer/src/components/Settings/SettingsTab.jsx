import React, { useState, useEffect } from 'react';
import { Card, Switch, Select, Space, Input, Button, Tabs, message, Progress } from 'antd';

export default function SettingsTab({
  t,
  systemLanguage,
  onSystemLanguageChange,
  currentUser
}) {
  const jtlImportQuery = `SELECT
    ei.ItemID                                 AS Angebotsnummer,
    MAX(a.cArtNr)                             AS SKU,
    MAX(ei.Title)                             AS Angebotstitel,
    MAX(ei.StartPrice)                         AS Preis,
    COALESCE(SUM(et.QuantityPurchased), 0)     AS Verkauft
FROM dbo.ebay_item ei
LEFT JOIN dbo.tArtikel a
    ON a.kArtikel = ei.kArtikel
LEFT JOIN dbo.ebay_transaction et
    ON et.ItemID = ei.ItemID
GROUP BY
    ei.ItemID
ORDER BY
    ei.ItemID DESC;`;
  const [dbProfiles, setDbProfiles] = useState([]);
  const [activeDbProfileId, setActiveDbProfileId] = useState('');
  const [editingProfileId, setEditingProfileId] = useState('');
  const [dbAgentStatus, setDbAgentStatus] = useState(null);
  const [dbAgentEnabled, setDbAgentEnabled] = useState(false);
  const [dbAgentInterval, setDbAgentInterval] = useState(60);
  const [dbAgentUpdating, setDbAgentUpdating] = useState(false);
  const [dbTesting, setDbTesting] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbDeleting, setDbDeleting] = useState(false);
  const [dbForm, setDbForm] = useState({
    id: '',
    name: '',
    server: '',
    database: '',
    authentication: 'sql',
    port: '',
    user: '',
    password: '',
    encrypt: true,
    trustServerCertificate: true,
    query: jtlImportQuery
  });
  const [appDbProfiles, setAppDbProfiles] = useState([]);
  const [activeAppDbProfileId, setActiveAppDbProfileId] = useState('');
  const [editingAppDbProfileId, setEditingAppDbProfileId] = useState('');
  const [appDbTesting, setAppDbTesting] = useState(false);
  const [appDbSaving, setAppDbSaving] = useState(false);
  const [appDbDeleting, setAppDbDeleting] = useState(false);
  const [appDbForm, setAppDbForm] = useState({
    id: '',
    name: '',
    dbType: 'mssql',
    server: '',
    database: '',
    authentication: 'sql',
    port: '',
    user: '',
    password: '',
    encrypt: true,
    trustServerCertificate: true
  });
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [kbFilePath, setKbFilePath] = useState('');
  const [kbImporting, setKbImporting] = useState(false);
  const [kbSummary, setKbSummary] = useState(null);
  const [kbProgress, setKbProgress] = useState(null);

  const [automationMode, setAutomationMode] = useState('manual');
  const [automationScheduleMode, setAutomationScheduleMode] = useState('days');
  const [automationIntervalDays, setAutomationIntervalDays] = useState(3);
  const [automationCustomEvery, setAutomationCustomEvery] = useState(1);
  const [automationCustomUnit, setAutomationCustomUnit] = useState('hour');
  const [automationStatus, setAutomationStatus] = useState(null);
  const [automationUpdating, setAutomationUpdating] = useState(false);
  const [automationRunningNow, setAutomationRunningNow] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [dbProfilesResult, appDbProfilesResult] = await Promise.all([
        window.api.getDbProfiles(),
        window.api.getAppDbProfiles()
      ]);
      if (dbProfilesResult.success && dbProfilesResult.data) {
        const profiles = dbProfilesResult.data.profiles || [];
        const activeId = dbProfilesResult.data.activeProfileId || '';
        setDbProfiles(profiles);
        setActiveDbProfileId(activeId);
        const selected = profiles.find((p) => p.id === activeId) || profiles[0];
        if (selected) {
          setEditingProfileId(selected.id);
          setDbForm((prev) => ({ ...prev, ...selected, query: jtlImportQuery }));
        }
      }
      if (appDbProfilesResult.success && appDbProfilesResult.data) {
        const profiles = appDbProfilesResult.data.profiles || [];
        const activeId = appDbProfilesResult.data.activeProfileId || '';
        setAppDbProfiles(profiles);
        setActiveAppDbProfileId(activeId);
        const selected = profiles.find((p) => p.id === activeId) || profiles[0];
        if (selected) {
          setEditingAppDbProfileId(selected.id);
          setAppDbForm((prev) => ({ ...prev, ...selected }));
        }
      }
      const agentStatusResult = await window.api.getDbAgentStatus();
      if (agentStatusResult.success && agentStatusResult.data) {
        setDbAgentStatus(agentStatusResult.data);
        setDbAgentEnabled(Boolean(agentStatusResult.data.enabled));
        setDbAgentInterval(Number(agentStatusResult.data.retryIntervalSec || 60));
      }
      const autoStatusResult = await window.api.getAutomationStatus();
      if (autoStatusResult.success && autoStatusResult.data) {
        setAutomationStatus(autoStatusResult.data);
        setAutomationMode(autoStatusResult.data.mode || 'manual');
        setAutomationScheduleMode(autoStatusResult.data.scheduleMode || 'days');
        setAutomationIntervalDays(Number(autoStatusResult.data.intervalDays || 3));
        setAutomationCustomEvery(Number(autoStatusResult.data.customEvery || 1));
        setAutomationCustomUnit(autoStatusResult.data.customUnit || 'hour');
      }
      if (currentUser?.role === 'admin') {
        await refreshUsers();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  useEffect(() => {
    if (!window.api?.onDbAgentStatus) return undefined;
    const cleanup = window.api.onDbAgentStatus((status) => {
      setDbAgentStatus(status);
      setDbAgentEnabled(Boolean(status?.enabled));
      setDbAgentInterval(Number(status?.retryIntervalSec || 60));
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (!window.api?.onAutomationStatus) return undefined;
    const cleanup = window.api.onAutomationStatus((status) => {
      setAutomationStatus(status);
      setAutomationMode(status?.mode || 'manual');
      setAutomationScheduleMode(status?.scheduleMode || 'days');
      setAutomationIntervalDays(Number(status?.intervalDays || 3));
      setAutomationCustomEvery(Number(status?.customEvery || 1));
      setAutomationCustomUnit(status?.customUnit || 'hour');
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (!window.api?.onProgress) return undefined;
    const cleanup = window.api.onProgress((data) => {
      if (data?.scope !== 'kb-import') return;
      setKbProgress({
        percent: Number(data?.percent || 0),
        message: data?.message || ''
      });
    });
    return cleanup;
  }, []);

  const handleSelectProfile = (id) => {
    setEditingProfileId(id || '');
    const selected = dbProfiles.find((p) => p.id === id);
    if (selected) {
      setDbForm({
        id: selected.id || '',
        name: selected.name || '',
        server: selected.server || '',
        database: selected.database || '',
        authentication: selected.authentication || 'sql',
        port: selected.port || '',
        user: selected.user || '',
        password: selected.password || '',
        encrypt: Boolean(selected.encrypt),
        trustServerCertificate: selected.trustServerCertificate !== false,
        query: jtlImportQuery
      });
    }
  };

  const handleNewProfile = () => {
    setEditingProfileId('');
    setDbForm({
      id: '',
      name: '',
      server: '',
      database: '',
      authentication: 'sql',
      port: '',
      user: '',
      password: '',
    encrypt: true,
      trustServerCertificate: true,
      query: jtlImportQuery
    });
  };

  const handleSaveDbProfile = async () => {
    setDbSaving(true);
    try {
      const result = await window.api.saveDbProfile(
        {
          ...dbForm,
          id: editingProfileId || undefined
        },
        true
      );
      if (!result.success) {
        message.error(result.error || t('settings.dbSaveFailed'));
        return;
      }
      setDbProfiles(result.data.profiles || []);
      setActiveDbProfileId(result.data.activeProfileId || '');
      setEditingProfileId(result.data.id || '');
      message.success(t('settings.dbSaveSuccess'));
    } catch (error) {
      message.error(error.message || t('settings.dbSaveFailed'));
    } finally {
      setDbSaving(false);
    }
  };

  const handleDeleteDbProfile = async () => {
    if (!editingProfileId) return;
    setDbDeleting(true);
    try {
      const result = await window.api.deleteDbProfile(editingProfileId);
      if (!result.success) {
        message.error(result.error || t('settings.dbDeleteFailed'));
        return;
      }
      setDbProfiles(result.data.profiles || []);
      setActiveDbProfileId(result.data.activeProfileId || '');
      handleNewProfile();
      message.success(t('settings.dbDeleteSuccess'));
    } catch (error) {
      message.error(error.message || t('settings.dbDeleteFailed'));
    } finally {
      setDbDeleting(false);
    }
  };

  const handleSetActiveDbProfile = async (id) => {
    setActiveDbProfileId(id || '');
    await window.api.setActiveDbProfile(id || '');
  };

  const handleSetDbAgentEnabled = async (enabled) => {
    setDbAgentEnabled(enabled);
    setDbAgentUpdating(true);
    try {
      const result = await window.api.setDbAgentEnabled(enabled);
      if (result.success) setDbAgentStatus(result.data);
      else message.error(result.error || t('settings.dbAgentUpdateFailed'));
    } catch (error) {
      message.error(error.message || t('settings.dbAgentUpdateFailed'));
    } finally {
      setDbAgentUpdating(false);
    }
  };

  const handleSetDbAgentInterval = async (value) => {
    setDbAgentInterval(Number(value || 60));
    setDbAgentUpdating(true);
    try {
      const result = await window.api.setDbAgentInterval(Number(value || 60));
      if (result.success) setDbAgentStatus(result.data);
      else message.error(result.error || t('settings.dbAgentUpdateFailed'));
    } catch (error) {
      message.error(error.message || t('settings.dbAgentUpdateFailed'));
    } finally {
      setDbAgentUpdating(false);
    }
  };

  const handleRefreshDbAgent = async () => {
    setDbAgentUpdating(true);
    try {
      const result = await window.api.refreshDbAgent();
      if (result.success) setDbAgentStatus(result.data);
      else message.error(result.error || t('settings.dbAgentUpdateFailed'));
    } catch (error) {
      message.error(error.message || t('settings.dbAgentUpdateFailed'));
    } finally {
      setDbAgentUpdating(false);
    }
  };

  const handleTestDbProfile = async () => {
    setDbTesting(true);
    try {
      const result = await window.api.testDbProfile(dbForm);
      if (!result.success) {
        message.error(result.error || t('settings.dbTestFailed'));
        return;
      }
      message.success(t('settings.dbTestSuccess'));
    } catch (error) {
      message.error(error.message || t('settings.dbTestFailed'));
    } finally {
      setDbTesting(false);
    }
  };

  const handleSelectAppDbProfile = (id) => {
    setEditingAppDbProfileId(id || '');
    const selected = appDbProfiles.find((p) => p.id === id);
    if (selected) {
      setAppDbForm({
        id: selected.id || '',
        name: selected.name || '',
        dbType: selected.dbType || 'mssql',
        server: selected.server || '',
        database: selected.database || '',
        authentication: selected.authentication || 'sql',
        port: selected.port || '',
        user: selected.user || '',
        password: selected.password || '',
        encrypt: selected.encrypt !== false,
        trustServerCertificate: selected.trustServerCertificate !== false
      });
    }
  };

  const handleNewAppDbProfile = () => {
    setEditingAppDbProfileId('');
    setAppDbForm({
      id: '',
      name: '',
      dbType: 'mssql',
      server: '',
      database: '',
      authentication: 'sql',
      port: '',
      user: '',
      password: '',
      encrypt: true,
      trustServerCertificate: true
    });
  };

  const handleSaveAppDbProfile = async () => {
    setAppDbSaving(true);
    try {
      const result = await window.api.saveAppDbProfile(
        { ...appDbForm, id: editingAppDbProfileId || undefined },
        true
      );
      if (!result.success) {
        message.error(result.error || 'Failed to save App SQL profile');
        return;
      }
      setAppDbProfiles(result.data.profiles || []);
      setActiveAppDbProfileId(result.data.activeProfileId || '');
      setEditingAppDbProfileId(result.data.id || '');
      message.success('App SQL profile saved');
    } catch (error) {
      message.error(error.message || 'Failed to save App SQL profile');
    } finally {
      setAppDbSaving(false);
    }
  };

  const handleDeleteAppDbProfile = async () => {
    if (!editingAppDbProfileId) return;
    setAppDbDeleting(true);
    try {
      const result = await window.api.deleteAppDbProfile(editingAppDbProfileId);
      if (!result.success) {
        message.error(result.error || 'Failed to delete App SQL profile');
        return;
      }
      setAppDbProfiles(result.data.profiles || []);
      setActiveAppDbProfileId(result.data.activeProfileId || '');
      handleNewAppDbProfile();
      message.success('App SQL profile deleted');
    } catch (error) {
      message.error(error.message || 'Failed to delete App SQL profile');
    } finally {
      setAppDbDeleting(false);
    }
  };

  const handleSetActiveAppDbProfile = async (id) => {
    setActiveAppDbProfileId(id || '');
    await window.api.setActiveAppDbProfile(id || '');
  };

  const handleTestAppDbProfile = async () => {
    setAppDbTesting(true);
    try {
      const result = await window.api.testAppDbProfile(appDbForm);
      if (!result.success) {
        message.error(result.error || 'App SQL connection failed');
        return;
      }
      message.success('App SQL connection successful');
    } catch (error) {
      message.error(error.message || 'App SQL connection failed');
    } finally {
      setAppDbTesting(false);
    }
  };

  const refreshUsers = async () => {
    if (currentUser?.role !== 'admin') return;
    setLoadingUsers(true);
    try {
      const result = await window.api.listUsers();
      if (result.success) setUsers(result.data || []);
      else message.error(result.error || 'Failed to load users');
    } catch (error) {
      message.error(error.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      const result = await window.api.createUser({
        username: newUsername,
        password: newPassword,
        role: newRole
      });
      if (!result.success) {
        message.error(result.error || 'Failed to create user');
        return;
      }
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      message.success('User created');
      refreshUsers();
    } catch (error) {
      message.error(error.message || 'Failed to create user');
    }
  };

  const handleSetAutomationMode = async (mode) => {
    setAutomationUpdating(true);
    try {
      const result = await window.api.setAutomationMode(mode);
      if (!result.success) {
        message.error(result.error || 'Failed to update automation mode');
        return;
      }
      setAutomationStatus(result.data);
      setAutomationMode(result.data.mode || 'manual');
      message.success('Automation mode updated');
    } catch (error) {
      message.error(error.message || 'Failed to update automation mode');
    } finally {
      setAutomationUpdating(false);
    }
  };

  const handleSetAutomationIntervalDays = async (days) => {
    setAutomationUpdating(true);
    try {
      const result = await window.api.setAutomationIntervalDays(Number(days || 3));
      if (!result.success) {
        message.error(result.error || 'Failed to update automation interval');
        return;
      }
      setAutomationStatus(result.data);
      setAutomationIntervalDays(Number(result.data.intervalDays || 3));
      message.success('Automation interval updated');
    } catch (error) {
      message.error(error.message || 'Failed to update automation interval');
    } finally {
      setAutomationUpdating(false);
    }
  };

  const handleSetAutomationCustomSchedule = async (every, unit) => {
    setAutomationUpdating(true);
    try {
      const safeEvery = Number.isFinite(Number(every)) && Number(every) >= 1 ? Math.floor(Number(every)) : 1;
      const safeUnit = ['minute', 'hour', 'day'].includes(String(unit || '').toLowerCase())
        ? String(unit).toLowerCase()
        : 'hour';
      const result = await window.api.setAutomationCustomSchedule(safeEvery, safeUnit);
      if (!result.success) {
        message.error(result.error || 'Failed to update custom automation schedule');
        return;
      }
      setAutomationStatus(result.data);
      setAutomationScheduleMode(result.data.scheduleMode || 'custom');
      setAutomationCustomEvery(Number(result.data.customEvery || safeEvery));
      setAutomationCustomUnit(result.data.customUnit || safeUnit);
      message.success('Custom automation schedule updated');
    } catch (error) {
      message.error(error.message || 'Failed to update custom automation schedule');
    } finally {
      setAutomationUpdating(false);
    }
  };

  const handleRunAutomationNow = async () => {
    setAutomationRunningNow(true);
    try {
      const result = await window.api.runAutomationNow();
      if (!result.success) {
        message.error(result.error || 'Automation run failed');
        return;
      }
      message.success('Automation run completed');
      const status = await window.api.getAutomationStatus();
      if (status.success) setAutomationStatus(status.data);
    } catch (error) {
      message.error(error.message || 'Automation run failed');
    } finally {
      setAutomationRunningNow(false);
    }
  };

  const handlePickKnowledgeBaseFile = async () => {
    const path = await window.api.openExcelDialog();
    if (path) setKbFilePath(path);
  };

  const handleImportKnowledgeBase = async () => {
    if (!kbFilePath) {
      message.warning('Select an Excel file first');
      return;
    }
    setKbImporting(true);
    setKbProgress({ percent: 0, message: 'Preparing import' });
    try {
      const result = await window.api.importKnowledgeBase(kbFilePath);
      if (!result.success) {
        message.error(result.error || 'Knowledge base import failed');
        return;
      }
      setKbSummary(result.data || null);
      message.success('Knowledge base imported successfully');
    } catch (error) {
      message.error(error.message || 'Knowledge base import failed');
    } finally {
      setKbImporting(false);
      setTimeout(() => setKbProgress(null), 1500);
    }
  };

  return (
    <div className="panel">
      <h2>{t('settings.title')}</h2>
      <p className="panel-subtext">{t('settings.subtitle')}</p>

      <Tabs
        items={[
          {
            key: 'general',
            label: t('settings.tabGeneral'),
            children: (
              <div className="grid-two">
                <Card title={t('settings.language')} variant="outlined">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Select
                      value={systemLanguage}
                      onChange={(value) => {
                        onSystemLanguageChange(value);
                        window.api.updateSetting({ key: 'default_language', value });
                      }}
                      options={[
                        { value: 'de', label: 'German (Deutsch)' },
                        { value: 'en', label: 'English' }
                      ]}
                    />
                    <div>{t('settings.marketNote')}</div>
                  </Space>
                </Card>

                <Card title={t('settings.appearance')} variant="outlined">
                  <Space direction="vertical" size={12}>
                    <div>
                      {t('settings.lightTheme')} <Switch defaultChecked />
                    </div>
                  </Space>
                </Card>
                <Card title="Execution Mode" variant="outlined">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        Mode
                      </label>
                      <Select
                        value={automationMode}
                        onChange={handleSetAutomationMode}
                        options={[
                          { value: 'manual', label: 'Manual' },
                          { value: 'automated', label: 'Automated' }
                        ]}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        Schedule Type
                      </label>
                      <Select
                        value={automationScheduleMode}
                        onChange={(value) => {
                          setAutomationScheduleMode(value);
                          if (value === 'custom') {
                            handleSetAutomationCustomSchedule(automationCustomEvery, automationCustomUnit);
                          } else {
                            handleSetAutomationIntervalDays(automationIntervalDays);
                          }
                        }}
                        options={[
                          { value: 'days', label: 'By Days' },
                          { value: 'custom', label: 'Custom' }
                        ]}
                        disabled={automationMode !== 'automated'}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        Automated interval (days)
                      </label>
                      <Select
                        value={automationIntervalDays}
                        onChange={handleSetAutomationIntervalDays}
                        options={[
                          { value: 1, label: 'Every 1 day' },
                          { value: 2, label: 'Every 2 days' },
                          { value: 3, label: 'Every 3 days' },
                          { value: 7, label: 'Every 7 days' },
                          { value: 14, label: 'Every 14 days' },
                          { value: 30, label: 'Every 30 days' }
                        ]}
                        disabled={automationMode !== 'automated' || automationScheduleMode !== 'days'}
                      />
                    </div>
                    {automationScheduleMode === 'custom' ? (
                      <div className="grid-two">
                        <div>
                          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            Every
                          </label>
                          <Input
                            type="number"
                            min={1}
                            value={automationCustomEvery}
                            onChange={(e) => setAutomationCustomEvery(Number(e.target.value || 1))}
                            onBlur={() =>
                              handleSetAutomationCustomSchedule(automationCustomEvery, automationCustomUnit)
                            }
                            disabled={automationMode !== 'automated'}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            Unit
                          </label>
                          <Select
                            value={automationCustomUnit}
                            onChange={(value) => {
                              setAutomationCustomUnit(value);
                              handleSetAutomationCustomSchedule(automationCustomEvery, value);
                            }}
                            options={[
                              { value: 'minute', label: 'Minute(s)' },
                              { value: 'hour', label: 'Hour(s)' },
                              { value: 'day', label: 'Day(s)' }
                            ]}
                            disabled={automationMode !== 'automated'}
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="empty-state" style={{ marginBottom: 0 }}>
                      {automationStatus
                        ? `Status: ${automationStatus.running ? 'Running' : 'Idle'} | Last run: ${automationStatus.lastRunAt || '-'} | Next run: ${automationStatus.nextRunAt || '-'} | Schedule: ${automationStatus.scheduleMode === 'custom' ? `Every ${automationStatus.customEvery || 1} ${automationStatus.customUnit || 'hour'}(s)` : `Every ${automationStatus.intervalDays || 3} day(s)`} | Result: ${automationStatus.lastResult || '-'}`
                        : 'No automation status yet'}
                    </div>
                    <Button
                      loading={automationRunningNow}
                      disabled={automationUpdating}
                      onClick={handleRunAutomationNow}
                    >
                      Run Automation Now
                    </Button>
                  </Space>
                </Card>
              </div>
            )
          },
          {
            key: 'database',
            label: t('settings.tabDatabase'),
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Card title="JTL SQL (Read-Only)" variant="outlined">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div className="grid-two">
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbProfiles')}
                      </label>
                      <Select
                        value={editingProfileId || undefined}
                        placeholder={t('settings.dbSelectProfile')}
                        onChange={handleSelectProfile}
                        options={dbProfiles.map((p) => ({
                          value: p.id,
                          label: `${p.name || p.server}${p.id === activeDbProfileId ? ' (Active)' : ''}`
                        }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbActiveProfile')}
                      </label>
                      <Select
                        value={activeDbProfileId || undefined}
                        placeholder={t('settings.dbSetActive')}
                        onChange={handleSetActiveDbProfile}
                        options={dbProfiles.map((p) => ({ value: p.id, label: p.name || p.server }))}
                      />
                    </div>
                  </div>

                  <div className="grid-two">
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbProfileName')}
                      </label>
                      <Input
                        value={dbForm.name}
                        onChange={(e) => setDbForm({ ...dbForm, name: e.target.value })}
                        placeholder="JTL Production"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbAuthentication')}
                      </label>
                      <Select
                        value={dbForm.authentication}
                        onChange={(value) => setDbForm({ ...dbForm, authentication: value })}
                        options={[
                          { value: 'sql', label: t('settings.dbAuthSql') },
                          { value: 'windows', label: t('settings.dbAuthWindows') }
                        ]}
                      />
                    </div>
                  </div>

                  <div className="grid-two">
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbServer')}
                      </label>
                      <Input
                        value={dbForm.server}
                        onChange={(e) => setDbForm({ ...dbForm, server: e.target.value })}
                        placeholder="localhost\\SQLEXPRESS"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbDatabase')}
                      </label>
                      <Input
                        value={dbForm.database}
                        onChange={(e) => setDbForm({ ...dbForm, database: e.target.value })}
                        placeholder="JTL_Analytics_App"
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                      {t('settings.dbPort')}
                    </label>
                    <Input
                      value={dbForm.port}
                      onChange={(e) => setDbForm({ ...dbForm, port: e.target.value })}
                      placeholder="1433"
                    />
                  </div>

                  <div className="grid-two">
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbUser')}
                      </label>
                      <Input
                        value={dbForm.user}
                        onChange={(e) => setDbForm({ ...dbForm, user: e.target.value })}
                        placeholder="sa"
                        disabled={dbForm.authentication === 'windows'}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbPassword')}
                      </label>
                      <Input.Password
                        value={dbForm.password}
                        onChange={(e) => setDbForm({ ...dbForm, password: e.target.value })}
                        placeholder="••••••"
                        disabled={dbForm.authentication === 'windows'}
                      />
                    </div>
                  </div>


                  <Space wrap>
                    <Button onClick={handleNewProfile}>{t('settings.dbNew')}</Button>
                    <Button loading={dbTesting} onClick={handleTestDbProfile}>
                      {t('settings.dbTest')}
                    </Button>
                    <Button type="primary" loading={dbSaving} onClick={handleSaveDbProfile}>
                      {t('settings.dbSave')}
                    </Button>
                    <Button danger loading={dbDeleting} onClick={handleDeleteDbProfile} disabled={!editingProfileId}>
                      {t('settings.dbDelete')}
                    </Button>
                  </Space>
                  <Card
                    title={t('settings.dbAgentTitle')}
                    variant="outlined"
                    style={{ width: '100%', marginTop: 8 }}
                  >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <div className="grid-two">
                        <div>
                          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            {t('settings.dbAgentEnabled')}
                          </label>
                          <Switch checked={dbAgentEnabled} onChange={handleSetDbAgentEnabled} />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            {t('settings.dbAgentInterval')}
                          </label>
                          <Select
                            value={dbAgentInterval}
                            onChange={handleSetDbAgentInterval}
                            options={[
                              { value: 30, label: '30s' },
                              { value: 60, label: '60s' },
                              { value: 120, label: '120s' },
                              { value: 300, label: '300s' }
                            ]}
                          />
                        </div>
                      </div>
                      <div className="empty-state" style={{ marginBottom: 0 }}>
                        {dbAgentStatus
                          ? `${t('settings.dbAgentStatus')}: ${dbAgentStatus.connected ? t('settings.dbAgentConnected') : t('settings.dbAgentDisconnected')} | ${t('settings.dbAgentMessage')}: ${dbAgentStatus.message || '-'}`
                          : t('settings.dbAgentNoStatus')}
                      </div>
                      <Button onClick={handleRefreshDbAgent} loading={dbAgentUpdating}>
                        {t('settings.dbAgentRefresh')}
                      </Button>
                    </Space>
                  </Card>
                  <div className="panel-subtext">{t('settings.dbHint')}</div>
                  </Space>
                </Card>

                <Card title="App SQL Database (CRUD + Storage)" variant="outlined">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div className="grid-two">
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                          Saved profiles
                        </label>
                        <Select
                          value={editingAppDbProfileId || undefined}
                          placeholder="Select App DB profile"
                          onChange={handleSelectAppDbProfile}
                          options={appDbProfiles.map((p) => ({
                            value: p.id,
                            label: `${p.name || p.server}${p.id === activeAppDbProfileId ? ' (Active)' : ''}`
                          }))}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                          Active profile
                        </label>
                        <Select
                          value={activeAppDbProfileId || undefined}
                          placeholder="Set active profile"
                          onChange={handleSetActiveAppDbProfile}
                          options={appDbProfiles.map((p) => ({ value: p.id, label: p.name || p.server }))}
                        />
                      </div>
                    </div>

                    <div className="grid-two">
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Profile name</label>
                        <Input
                          value={appDbForm.name}
                          onChange={(e) => setAppDbForm({ ...appDbForm, name: e.target.value })}
                          placeholder="App SQL Production"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Database Type</label>
                        <Select
                          value={appDbForm.dbType}
                          onChange={(value) => setAppDbForm({ ...appDbForm, dbType: value })}
                          options={[
                            { value: 'mysql', label: 'MySQL' },
                            { value: 'mssql', label: 'SQL Server' }
                          ]}
                        />
                      </div>
                    </div>
                    <div className="grid-two">
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                          {t('settings.dbAuthentication')}
                        </label>
                        <Select
                          value={appDbForm.authentication}
                          onChange={(value) => setAppDbForm({ ...appDbForm, authentication: value })}
                          options={[
                            { value: 'sql', label: t('settings.dbAuthSql') },
                            { value: 'windows', label: t('settings.dbAuthWindows') }
                          ]}
                        />
                      </div>
                    </div>

                    <div className="grid-two">
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                          {t('settings.dbServer')}
                        </label>
                        <Input
                          value={appDbForm.server}
                          onChange={(e) => setAppDbForm({ ...appDbForm, server: e.target.value })}
                          placeholder="localhost\\SQLEXPRESS"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                          {t('settings.dbDatabase')}
                        </label>
                        <Input
                          value={appDbForm.database}
                          onChange={(e) => setAppDbForm({ ...appDbForm, database: e.target.value })}
                          placeholder="ebay_title_generator"
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        {t('settings.dbPort')}
                      </label>
                      <Input
                        value={appDbForm.port}
                        onChange={(e) => setAppDbForm({ ...appDbForm, port: e.target.value })}
                        placeholder="1433"
                      />
                    </div>

                    <div className="grid-two">
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                          {t('settings.dbUser')}
                        </label>
                        <Input
                          value={appDbForm.user}
                          onChange={(e) => setAppDbForm({ ...appDbForm, user: e.target.value })}
                          placeholder="sa"
                          disabled={appDbForm.authentication === 'windows'}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                          {t('settings.dbPassword')}
                        </label>
                        <Input.Password
                          value={appDbForm.password}
                          onChange={(e) => setAppDbForm({ ...appDbForm, password: e.target.value })}
                          placeholder="••••••"
                          disabled={appDbForm.authentication === 'windows'}
                        />
                      </div>
                    </div>

                    <Space wrap>
                      <Button onClick={handleNewAppDbProfile}>New profile</Button>
                      <Button loading={appDbTesting} onClick={handleTestAppDbProfile}>
                        Test connection
                      </Button>
                      <Button type="primary" loading={appDbSaving} onClick={handleSaveAppDbProfile}>
                        Save profile
                      </Button>
                      <Button
                        danger
                        loading={appDbDeleting}
                        onClick={handleDeleteAppDbProfile}
                        disabled={!editingAppDbProfileId}
                      >
                        Delete profile
                      </Button>
                    </Space>
                    <div className="panel-subtext">
                      This database stores app data, generated titles, history, exports, logs, and users.
                    </div>
                  </Space>
                </Card>

                <Card title="Title Knowledge Base" variant="outlined">
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <div className="panel-subtext">
                      Import an Excel file with manual extraction columns (Old title, Cartridge model, Types, Printer Brand, Printer model, Set of, Farbe). The app stores it in local DB and syncs to App SQL DB.
                    </div>
                    <Space wrap>
                      <Button onClick={handlePickKnowledgeBaseFile}>Select KB Excel</Button>
                      <Button type="primary" loading={kbImporting} onClick={handleImportKnowledgeBase}>
                        Import to Knowledge Base
                      </Button>
                    </Space>
                    <div className="empty-state" style={{ marginBottom: 0 }}>
                      {kbFilePath || 'No file selected'}
                    </div>
                    {kbSummary ? (
                      <div className="empty-state" style={{ marginBottom: 0 }}>
                        Total rows: {kbSummary.total || 0} | Imported: {kbSummary.imported || 0} | Skipped: {kbSummary.skipped || 0} | Remote sync: {kbSummary.remoteSync?.synced ? `ok (${kbSummary.remoteSync?.counts?.knowledgeBase || 0})` : `failed${kbSummary.remoteSync?.error ? ` - ${kbSummary.remoteSync.error}` : ''}`}
                      </div>
                    ) : null}
                    {kbProgress ? (
                      <div style={{ width: '100%' }}>
                        <Progress percent={kbProgress.percent || 0} status="active" />
                        <div className="panel-subtext" style={{ marginBottom: 0 }}>{kbProgress.message}</div>
                      </div>
                    ) : null}
                  </Space>
                </Card>

                {currentUser?.role === 'admin' ? (
                  <Card title="Users (Admin)" variant="outlined">
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div className="grid-two">
                        <Input
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          placeholder="New username"
                        />
                        <Input.Password
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password"
                        />
                      </div>
                      <div className="grid-two">
                        <Select
                          value={newRole}
                          onChange={setNewRole}
                          options={[
                            { value: 'user', label: 'User' },
                            { value: 'admin', label: 'Admin' }
                          ]}
                        />
                        <Space>
                          <Button onClick={handleCreateUser}>Create user</Button>
                          <Button onClick={refreshUsers} loading={loadingUsers}>
                            Refresh
                          </Button>
                        </Space>
                      </div>
                      <div className="panel-subtext">Existing users</div>
                      <div className="empty-state" style={{ marginBottom: 0 }}>
                        {users.map((u) => `${u.username} (${u.role})${u.is_active ? '' : ' [disabled]'}`).join(' | ') ||
                          'No users'}
                      </div>
                    </Space>
                  </Card>
                ) : null}
              </Space>
            )
          }
        ]}
      />
    </div>
  );
}
