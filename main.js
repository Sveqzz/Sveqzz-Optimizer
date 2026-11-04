'use strict';
const { app, BrowserWindow, ipcMain, shell, globalShortcut, screen, Menu, dialog } = require('electron');
const path = require('path');
const { create, APP } = require('./src/engine');

app.setAppUserModelId('com.sveqzz.optimizer');
// Si Windows nos abrió sin administrador, nos relanzamos elevados (una sola vez).
function ensureAdmin() {
  if (process.platform !== 'win32' || process.env.SVQ_MOCK === '1' || process.argv.includes('--elevated')) return true;
  const { execFileSync, spawn } = require('child_process');
  try { execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true }); return true; } catch { /* sin admin */ }
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  try { spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath ${q(exe)} -ArgumentList '--elevated' -Verb RunAs`], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); return false; } catch { return true; }
}

let engine, win = null, overlay = null, overlayTimer = null, overlayManual = null;
const ICON = path.join(__dirname, 'build', 'icon.png');
const PRELOAD = path.join(__dirname, 'preload.js');
const send = (w, ch, ...a) => { if (w && !w.isDestroyed()) w.webContents.send(ch, ...a); };

function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 880, minWidth: 1080, minHeight: 700, show: false,
    backgroundColor: '#07080d', title: APP, icon: ICON,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#07080d', symbolColor: '#aab2c5', height: 38 },
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; hideOverlay(); });
}

// ───────── overlay (FPS, ping, CPU, GPU) ─────────
function overlayPos(corner) {
  const wa = screen.getPrimaryDisplay().workArea, w = 262, h = 118, m = 14;
  const x = corner.includes('r') ? wa.x + wa.width - w - m : wa.x + m;
  const y = corner.includes('b') ? wa.y + wa.height - h - m : wa.y + m;
  return { x, y, width: w, height: h };
}
function showOverlay() {
  if (overlay && !overlay.isDestroyed()) return;
  const corner = engine.state.data.settings.overlayCorner || 'tl';
  overlay = new BrowserWindow({
    ...overlayPos(corner), transparent: true, frame: false, resizable: false, movable: false, focusable: false, skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true, icon: ICON,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay && overlay.showInactive());
  overlay.on('closed', () => { overlay = null; clearInterval(overlayTimer); overlayTimer = null; });
  let busy = false;
  overlayTimer = setInterval(async () => {
    if (busy || !overlay) return; busy = true;
    try { send(overlay, 'overlay-data', await engine.api.overlayData()); } catch { /* siguiente tick */ } finally { busy = false; }
  }, 1000);
  send(win, 'ev', 'overlay', true);
}
function hideOverlay() {
  clearInterval(overlayTimer); overlayTimer = null;
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = null; send(win, 'ev', 'overlay', false);
}
const overlayOpen = () => !!(overlay && !overlay.isDestroyed());
function toggleOverlay() { overlayManual = !overlayOpen(); overlayOpen() ? hideOverlay() : showOverlay(); }

// ───────── arranque ─────────
const elevated = ensureAdmin();
if (!elevated || !app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(() => {
  if (!elevated) return;
  Menu.setApplicationMenu(null);
  engine = create(app.getPath('userData'), { mock: process.env.SVQ_MOCK === '1' });

  ipcMain.handle('api', async (_e, method, args) => {
    const fn = engine.api[method];
    if (typeof fn !== 'function') return { __error: `Método desconocido: ${method}` };
    try { return await fn(...(Array.isArray(args) ? args : [])); } catch (err) { return { __error: String(err.message || err) }; }
  });
  ipcMain.handle('cmd', async (_e, name, arg) => {
    switch (name) {
      case 'overlay:toggle': toggleOverlay(); return overlayOpen();
      case 'overlay:state': return overlayOpen();
      case 'overlay:corner': if (overlayOpen()) overlay.setBounds(overlayPos(String(arg))); return true;
      case 'pickExe': { const r = await dialog.showOpenDialog(win, { title: 'Elige el .exe del juego', properties: ['openFile'], filters: [{ name: 'Programas', extensions: ['exe'] }] }); return r.canceled ? null : r.filePaths[0]; }
      case 'open': if (/^https:\/\/(discord\.com|github\.com|www\.nvidia\.com|www\.amd\.com|www\.intel\.com|www\.realtek\.com|support\.microsoft\.com)\//.test(String(arg))) shell.openExternal(String(arg)); return true;
      default: return false;
    }
  });

  engine.events.on('game-start', (g) => {
    send(win, 'ev', 'game-start', g);
    if (engine.state.data.settings.overlayAuto && overlayManual !== false) showOverlay();
  });
  engine.events.on('game-end', (g) => {
    send(win, 'ev', 'game-end', g);
    if (!engine.sessions.size) { overlayManual = null; hideOverlay(); }
  });
  engine.events.on('game-update', (g) => send(win, 'ev', 'game-update', g));
  engine.events.on('settings', (s) => { if (overlayOpen()) overlay.setBounds(overlayPos(s.overlayCorner || 'tl')); });

  createWindow();
  globalShortcut.register('CommandOrControl+Shift+O', toggleOverlay);
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (engine) engine.dispose(); });
app.on('window-all-closed', () => { app.quit(); });
