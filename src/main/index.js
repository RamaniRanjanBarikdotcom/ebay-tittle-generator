import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseManager from './database/sqlite.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { getSqlServerAgent } from './services/SqlServerAgent.js';
import { getAutomationAgent } from './services/AutomationAgent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const isDev = !app.isPackaged;
  const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5181/';

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // electron-vite emits the preload bundle as CommonJS (index.cjs).
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    console.log('[App] Loading renderer URL:', devUrl);
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const filePath = path.join(__dirname, '../renderer/index.html');
    console.log('[App] Loading renderer file:', filePath);
    win.loadFile(filePath);
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[App] Renderer failed to load:', code, desc, url);
    if (isDev) {
      const fallbackUrl = 'http://127.0.0.1:5181/';
      console.log('[App] Retrying renderer URL:', fallbackUrl);
      win.loadURL(fallbackUrl);
    }
  });

  win.webContents.on('did-finish-load', () => {
    console.log('[App] Renderer loaded');
    if (isDev) {
      win.webContents
        .executeJavaScript(
          "(() => { const el = document.getElementById('root'); return el ? (el.innerText || el.innerHTML || 'root-empty') : 'root-missing'; })();"
        )
        .then((value) => {
          console.log('[App] Renderer root:', value);
        })
        .catch((err) => {
          console.error('[App] Renderer inspection failed:', err);
        });
    }
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[App] Renderer process gone:', details);
  });

  return win;
}

// Global reference to main window for IPC handlers
let mainWindow = null;
let handlersRegistered = false;

app.whenReady().then(() => {
  DatabaseManager.initialize()
    .then(() => {
      // Keep history, but clear previous session data on app start
      DatabaseManager.clearWorkingData();

      // Create window (this starts loading asynchronously)
      mainWindow = createWindow();

      // Register IPC handlers only once
      if (!handlersRegistered) {
        registerIpcHandlers(mainWindow);
        handlersRegistered = true;
        console.log('[App] IPC handlers registered');
      }

      return mainWindow;
    })
    .catch((error) => {
      console.error('[App] Database initialization failed:', error);
      app.quit();
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      if (!handlersRegistered) {
        registerIpcHandlers(mainWindow);
        handlersRegistered = true;
        console.log('[App] IPC handlers registered (activate)');
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  getSqlServerAgent().stop();
  getAutomationAgent().stop();
  DatabaseManager.close();
});
 