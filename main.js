const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SUPPORTED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm']);
let controlWindow;
let displayWindow;
let displayId;

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PLAYLIST_FILE)) fs.writeFileSync(PLAYLIST_FILE, '[]');
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ rules: [], defaultFit: 'contain', loopPlaylist: true }, null, 2));
}

function displays() {
  return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `Tela ${i + 1} · ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' · principal' : ''}` }));
}

function createDisplay(targetId) {
  const all = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  const target = all.find(d => String(d.id) === String(targetId)) || all.find(d => d.id !== primary.id) || primary;
  displayId = String(target.id);
  if (displayWindow && !displayWindow.isDestroyed()) displayWindow.destroy();
  const hasSecond = all.length > 1;
  displayWindow = new BrowserWindow({
    x: target.bounds.x, y: target.bounds.y,
    width: hasSecond ? target.bounds.width : 960,
    height: hasSecond ? target.bounds.height : 540,
    fullscreen: hasSecond, frame: !hasSecond, backgroundColor: '#000000',
    show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  displayWindow.loadFile(path.join(__dirname, 'src', 'display.html'));
  displayWindow.once('ready-to-show', () => displayWindow.show());
  displayWindow.on('closed', () => { displayWindow = null; });
}

function createWindows() {
  controlWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1080, minHeight: 680,
    backgroundColor: '#11110f', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  controlWindow.loadFile(path.join(__dirname, 'src', 'control.html'));
  createDisplay();
}

app.whenReady().then(() => {
  ensureData(); createWindows();
  screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
  screen.on('display-removed', () => controlWindow?.webContents.send('displays-changed', displays()));
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindows(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('files:choose', async () => {
  const result = await dialog.showOpenDialog(controlWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Imagens e vídeos', extensions: [...SUPPORTED].map(x => x.slice(1)) }] });
  return result.canceled ? [] : result.filePaths;
});
ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
ipcMain.handle('files:open', async (_e, filePath) => {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false, error: 'Arquivo nao encontrado' };
  const error = await shell.openPath(filePath);
  return error ? { ok: false, error } : { ok: true };
});
ipcMain.handle('files:showInFolder', (_e, filePath) => {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false, error: 'Arquivo nao encontrado' };
  shell.showItemInFolder(filePath);
  return { ok: true };
});
ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
ipcMain.handle('displays:list', () => displays());
ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));
ipcMain.on('control:status', (_e, payload) => controlWindow?.webContents.send('control:status', payload));
