import React, { useEffect, useMemo, useState } from 'react';
import { Button, Layout, Menu, Select, Space } from 'antd';
import {
  InboxOutlined,
  ThunderboltOutlined,
  FileSearchOutlined,
  ExportOutlined,
  HistoryOutlined,
  SettingOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  DashboardOutlined,
  MoonFilled,
  SunFilled
} from '@ant-design/icons';

import DashboardTab from './components/Dashboard/DashboardTab.jsx';
import ImportTab from './components/Import/ImportTab.jsx';
import GenerateTab from './components/Generate/GenerateTab.jsx';
import ReviewTab from './components/Review/ReviewTab.jsx';
import ExportTab from './components/Export/ExportTab.jsx';
import HistoryTab from './components/History/HistoryTab.jsx';
import SettingsTab from './components/Settings/SettingsTab.jsx';
import LogsTab from './components/Logs/LogsTab.jsx';
import DBViewerTab from './components/DBViewer/DBViewerTab.jsx';
import { getTranslator } from './i18n.js';
import LoginScreen from './components/Auth/LoginScreen.jsx';

const { Header, Sider, Content } = Layout;

export default function App() {
  const [activeKey, setActiveKey] = useState('dashboard');
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light');
  const [systemLanguage, setSystemLanguage] = useState('de');
  const [automationMode, setAutomationMode] = useState('manual');
  const [auth, setAuth] = useState({ loading: true, token: '', user: null });
  const t = useMemo(() => getTranslator(systemLanguage), [systemLanguage]);
  const isAdmin = auth.user?.role === 'admin';

  const menuItems = [
    { key: 'dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: 'import', icon: <InboxOutlined />, label: t('menu.import') },
    { key: 'generate', icon: <ThunderboltOutlined />, label: t('menu.generate') },
    { key: 'review', icon: <FileSearchOutlined />, label: t('menu.review') },
    { key: 'export', icon: <ExportOutlined />, label: t('menu.export') },
    { key: 'history', icon: <HistoryOutlined />, label: t('menu.history') },
    { key: 'logs', icon: <FileTextOutlined />, label: t('menu.logs') },
    ...(isAdmin
      ? [
          { key: 'dbviewer', icon: <DatabaseOutlined />, label: 'DB Viewer' },
          { key: 'settings', icon: <SettingOutlined />, label: t('menu.settings') }
        ]
      : [])
  ];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!window.api || typeof window.api.getSettings !== 'function') return;
    window.api.getSettings().then((result) => {
      if (result.success && result.data) {
        if (typeof result.data.default_language === 'string') {
          setSystemLanguage(result.data.default_language);
        }
        if (typeof result.data.automation_mode === 'string') {
          setAutomationMode(result.data.automation_mode);
        }
      }
    });
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('auth_token') || '';
      if (!token) {
        setAuth({ loading: false, token: '', user: null });
        return;
      }
      const result = await window.api.authVerify(token);
      if (!result.success) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setAuth({ loading: false, token: '', user: null });
        return;
      }
      setAuth({ loading: false, token, user: result.data });
    };
    initAuth();
  }, []);

  if (auth.loading) return null;
  if (!auth.user) {
    return (
      <LoginScreen
        onLoginSuccess={({ token, user }) => {
          setAuth({ loading: false, token, user });
        }}
      />
    );
  }

  return (
    <Layout className="app-layout">
      <Sider width={220} className="app-sider" breakpoint="lg" collapsedWidth="0">
        <div className="app-brand">{t('appTitle')}</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeKey]}
          items={menuItems}
          onClick={(e) => setActiveKey(e.key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-header-title">
            {menuItems.find((m) => m.key === activeKey)?.label}
          </div>
          <div className="app-header-right">
            <Space size={16}>
              <Select
                size="middle"
                value={automationMode}
                onChange={async (value) => {
                  setAutomationMode(value);
                  if (window.api?.setAutomationMode) {
                    const result = await window.api.setAutomationMode(value);
                    if (result?.success && result.data?.mode) {
                      setAutomationMode(result.data.mode);
                    }
                  }
                }}
                options={[
                  { value: 'manual', label: 'Manual' },
                  { value: 'automated', label: 'Automated' }
                ]}
              />
              <Select
                className="language-select"
                size="middle"
                value={systemLanguage}
                onChange={setSystemLanguage}
                options={[
                  { value: 'de', label: 'German (Deutsch)' },
                  { value: 'en', label: 'English' }
                ]}
              />
              <div className="theme-toggle-wrap">
                <button
                  type="button"
                  className={`theme-toggle ${theme === 'dark' ? 'is-dark' : ''}`}
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  title={theme === 'dark' ? t('header.light') : t('header.dark')}
                  aria-label={theme === 'dark' ? t('header.light') : t('header.dark')}
                >
                  <span className="theme-toggle-track">
                    <SunFilled className="theme-toggle-sun" />
                    <MoonFilled className="theme-toggle-moon" />
                    <span className="theme-toggle-thumb">
                      {theme === 'dark' ? <MoonFilled /> : <SunFilled />}
                    </span>
                  </span>
                </button>
              </div>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                background: 'var(--surface-soft)',
                border: '1px solid var(--border)',
                borderRadius: 9,
                padding: '5px 12px',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--brand), var(--brand-2))',
                  flexShrink: 0
                }} />
                {auth.user?.username}
                <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 12 }}>
                  · {auth.user?.role}
                </span>
              </div>
              <Button
                onClick={async () => {
                  await window.api.authLogout();
                  localStorage.removeItem('auth_token');
                  localStorage.removeItem('auth_user');
                  setAuth({ loading: false, token: '', user: null });
                }}
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--muted)',
                  fontWeight: 600,
                  fontSize: 13,
                  height: 34
                }}
              >
                Logout
              </Button>
            </Space>
          </div>
        </Header>
        <Content className="app-content">
          {activeKey === 'dashboard' && <DashboardTab t={t} />}
          {activeKey === 'import' && <ImportTab t={t} />}
          {activeKey === 'generate' && (
            <GenerateTab
              t={t}
              systemLanguage={systemLanguage}
              onViewReview={() => setActiveKey('review')}
            />
          )}
          {activeKey === 'review' && <ReviewTab t={t} />}
          {activeKey === 'export' && <ExportTab t={t} systemLanguage={systemLanguage} />}
          {activeKey === 'history' && <HistoryTab t={t} />}
          {activeKey === 'logs' && <LogsTab t={t} isAdmin={isAdmin} />}
          {activeKey === 'dbviewer' && isAdmin && <DBViewerTab isAdmin={isAdmin} />}
          {activeKey === 'settings' && isAdmin && (
            <SettingsTab
              t={t}
              systemLanguage={systemLanguage}
              onSystemLanguageChange={setSystemLanguage}
              currentUser={auth.user}
            />
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
