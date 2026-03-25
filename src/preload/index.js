const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('app:ping'),
  openExcelDialog: () => ipcRenderer.invoke('dialog:openExcel'),
  saveExcelDialog: (defaultPath) => ipcRenderer.invoke('dialog:saveExcel', defaultPath),
  importExcel: (filePath) => ipcRenderer.invoke('data:importExcel', filePath),
  importDatabase: () => ipcRenderer.invoke('data:importDatabase'),
  importJtlData: () => ipcRenderer.invoke('data:importJtlData'),
  getProducts: () => ipcRenderer.invoke('data:getProducts'),
  extractElements: () => ipcRenderer.invoke('data:extractElements'),
  generateTitles: (payload) => ipcRenderer.invoke('data:generateTitles', payload),
  getGeneratedTitles: () => ipcRenderer.invoke('data:getGeneratedTitles'),
  updateGeneratedTitle: (payload) => ipcRenderer.invoke('data:updateGeneratedTitle', payload),
  exportExcel: (payload) => ipcRenderer.invoke('data:exportExcel', payload),
  exportCsv: (payload) => ipcRenderer.invoke('data:exportCsv', payload),
  importKnowledgeBase: (filePath) => ipcRenderer.invoke('data:importKnowledgeBase', { filePath }),
  getSettings: () => ipcRenderer.invoke('data:getSettings'),
  updateSetting: (payload) => ipcRenderer.invoke('data:updateSetting', payload),
  getStats: () => ipcRenderer.invoke('data:getStats'),
  getDashboardStats: () => ipcRenderer.invoke('data:getDashboardStats'),
  getHistory: () => ipcRenderer.invoke('data:getHistory'),
  getLogs: () => ipcRenderer.invoke('data:getLogs'),
  getAmeiseLogs: () => ipcRenderer.invoke('ameise:getLogs'),
  resetSession: () => ipcRenderer.invoke('data:resetSession'),
  getDbProfiles: () => ipcRenderer.invoke('db:getProfiles'),
  saveDbProfile: (profile, setActive = true) =>
    ipcRenderer.invoke('db:saveProfile', { profile, setActive }),
  deleteDbProfile: (id) => ipcRenderer.invoke('db:deleteProfile', { id }),
  setActiveDbProfile: (id) => ipcRenderer.invoke('db:setActiveProfile', { id }),
  testDbProfile: (profile) => ipcRenderer.invoke('db:testProfile', { profile }),
  getDbAgentStatus: () => ipcRenderer.invoke('db:agent:getStatus'),
  refreshDbAgent: () => ipcRenderer.invoke('db:agent:refresh'),
  setDbAgentEnabled: (enabled) => ipcRenderer.invoke('db:agent:setEnabled', { enabled }),
  setDbAgentInterval: (retryIntervalSec) =>
    ipcRenderer.invoke('db:agent:setInterval', { retryIntervalSec }),
  getAppDbProfiles: () => ipcRenderer.invoke('db:app:getProfiles'),
  saveAppDbProfile: (profile, setActive = true) =>
    ipcRenderer.invoke('db:app:saveProfile', { profile, setActive }),
  deleteAppDbProfile: (id) => ipcRenderer.invoke('db:app:deleteProfile', { id }),
  setActiveAppDbProfile: (id) => ipcRenderer.invoke('db:app:setActiveProfile', { id }),
  testAppDbProfile: (profile) => ipcRenderer.invoke('db:app:testProfile', { profile }),
  authLogin: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  authVerify: (token) => ipcRenderer.invoke('auth:verify', { token }),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
  listUsers: () => ipcRenderer.invoke('auth:listUsers'),
  createUser: (payload) => ipcRenderer.invoke('auth:createUser', payload),
  updateUser: (payload) => ipcRenderer.invoke('auth:updateUser', payload),
  deleteUser: (payload) => ipcRenderer.invoke('auth:deleteUser', payload),
  getLocalDbTables: () => ipcRenderer.invoke('db:local:getTables'),
  getLocalDbTableData: (payload) => ipcRenderer.invoke('db:local:getTableData', payload),
  deleteLocalDbRows: (payload) => ipcRenderer.invoke('db:local:deleteRows', payload),
  getAppDbTables: () => ipcRenderer.invoke('db:app:getTables'),
  getAppDbTableData: (payload) => ipcRenderer.invoke('db:app:getTableData', payload),
  clearLogs: () => ipcRenderer.invoke('data:clearLogs'),
  getAutomationStatus: () => ipcRenderer.invoke('automation:getStatus'),
  setAutomationMode: (mode) => ipcRenderer.invoke('automation:setMode', { mode }),
  setAutomationIntervalDays: (intervalDays) =>
    ipcRenderer.invoke('automation:setIntervalDays', { intervalDays }),
  setAutomationCustomSchedule: (every, unit) =>
    ipcRenderer.invoke('automation:setCustomSchedule', { every, unit }),
  runAutomationNow: () => ipcRenderer.invoke('automation:runNow'),
  onDbAgentStatus: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('db-agent-status', listener);
    return () => ipcRenderer.removeListener('db-agent-status', listener);
  },
  onProgress: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },
  onAutomationStatus: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on('automation-status', listener);
    return () => ipcRenderer.removeListener('automation-status', listener);
  }
});
