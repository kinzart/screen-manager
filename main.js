const { app, BrowserWindow, ipcMain, dialog, screen, shell, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { OutputState, DisplayRecovery } = require('./desktop/output');
const { identifyDisplay, reconnectDisplay } = require('./desktop/windows-display');
const { createLiveServer, mediaTypes } = require('./desktop/live-server');

const DATA_DIR = path.join(app.getPath('userData'), 'data');
const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CONNECTIONS_FILE = path.join(DATA_DIR, 'connections.json');
const SUPPORTED = new Set(Object.keys(mediaTypes));
const PORT = 8790;
const output = new OutputState();
let controlWindow;
let displayWindow;
let recovery, connections, live, placement, readyWindow;
let operatorState = null, stateAt = 0, remoteError = '', transition = Promise.resolve(), quitting = false;
const pendingActions = new Map();

function writeJson(file, value) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(file + '.tmp', file);
}

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PLAYLIST_FILE)) fs.writeFileSync(PLAYLIST_FILE, '[]');
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ rules: [], defaultFit: 'contain', loopPlaylist: true }, null, 2));
}

function displays() {
  const state = recovery.state();
  return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), selected: String(d.id) === state.targetId && !state.blocked,
    label: `${d.label || 'Tela ' + (i + 1)} · ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' · principal' : ''}` }));
}

function send(win, channel, data) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, data);
}

function attachOutput(target) {
  const fullscreen = screen.getAllDisplays().length > 1 || (!!recovery.target && !target.internal && !target.primary);
  const bounds = { ...target.bounds };
  if (!fullscreen) { bounds.width = Math.min(960, bounds.width); bounds.height = Math.min(540, bounds.height); }
  const key = JSON.stringify([target.id, bounds, fullscreen]);
  if (!displayWindow || displayWindow.isDestroyed()) {
    const win = displayWindow = new BrowserWindow({ ...bounds, fullscreen, backgroundColor: '#000000', show: false,
      autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
        nodeIntegration: false, backgroundThrottling: false } });
    placement = key;
    win.once('ready-to-show', () => {
      readyWindow = win;
      if (displayWindow === win && placement && !recovery.blocked) win.showInactive();
    });
    win.on('closed', () => { if (win === displayWindow) { displayWindow = null; placement = null; readyWindow = null; } });
    win.loadFile(path.join(__dirname, 'src', 'display.html'));
  } else if (placement !== key) {
    displayWindow.hide();
    displayWindow.setFullScreen(false);
    displayWindow.setBounds(bounds);
    displayWindow.setFullScreen(fullscreen);
    placement = key;
    if (displayWindow === readyWindow) displayWindow.showInactive();
  }
}

function publishOutput() {
  send(displayWindow, 'display:command', localOutput());
  live?.update();
}
function localOutput() {
  const state = output.snapshot();
  if (state.item) state.item = { ...state.item, url: pathToFileURL(state.item.path).href };
  return state;
}

function remoteInfo() {
  const urls = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal)
    .map(n => `http://${n.address}:${PORT}`);
  return { enabled: !!live, urls: [...new Set(urls)], port: PORT, error: remoteError, ...live?.info() };
}
function connectionsChanged() {
  send(controlWindow, 'connection:changed', { output: recovery.state(), remote: remoteInfo(), displays: displays() });
  live?.update();
}
function publicItem(item) {
  if (!item) return null;
  const { id, name, type, duration, fit, transition, startAt } = item;
  return { id, name, type, duration, fit, transition, startAt, url: '/api/media/' + encodeURIComponent(id) };
}
function publicState(role) {
  const stage = output.snapshot();
  stage.item = publicItem(stage.item);
  if (role === 'tv') return { output: stage };
  const state = operatorState || {};
  let elapsed = state.elapsed || 0;
  if (state.running && !state.paused && !recovery.blocked) elapsed += Math.max(0, Date.now() - stateAt) / 1000;
  return { ready: !!operatorState, playlist: (state.playlist || []).map(publicItem), rules: state.rules || [],
    currentId: state.currentId, elapsed, running: !!state.running, locked: !!state.locked, paused: !!state.paused,
    loop: !!state.loop, output: stage, connection: recovery.state(), displays: displays() };
}

function dispatch(command) {
  if (!operatorState || !controlWindow || controlWindow.isDestroyed()) return Promise.reject(new Error('O painel do computador está iniciando.'));
  if (pendingActions.size >= 32) return Promise.reject(new Error('Aguarde os comandos em andamento.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pendingActions.delete(id); reject(new Error('O painel do computador não respondeu.')); }, 10000);
    pendingActions.set(id, result => { clearTimeout(timeout); result.error ? reject(new Error(result.error)) : resolve(); });
    send(controlWindow, 'operator:action', { id, command });
  });
}
async function setRemote(enable) {
  remoteError = '';
  if (enable && !live) {
    const secret = connections.secret || crypto.randomBytes(32).toString('hex');
    const service = createLiveServer({ secret, srcDir: path.join(__dirname, 'src'), uploadDir: path.join(DATA_DIR, 'recebidos'),
      snapshot: publicState, media: id => operatorState?.playlist.find(item => item.id === id) || (output.item?.id === id && output.item),
      dispatch: command => {
        if (!command || !['play','pause','previous','next','take','lock','loop','blackout','logo','move','edit','remove','clear','addRule','editRule','removeRule','display','showFolder'].includes(command.action)) throw new Error('Comando inválido.');
        return dispatch(command);
      },
      imported: (file, name) => dispatch({ action: 'import', file, name }), onChange: connectionsChanged });
    try { await service.listen(PORT); }
    catch (error) {
      await service.close();
      remoteError = error.code === 'EADDRINUSE' ? `A porta ${PORT} está em uso. Feche a outra instância e ative novamente.` : 'O servidor de controle não pôde iniciar.';
      connectionsChanged(); return remoteInfo();
    }
    live = service;
    Object.assign(connections, { remote: true, secret });
  } else if (!enable) {
    const previous = live;
    live = null;
    connections.remote = false;
    delete connections.secret;
    await previous?.close();
  }
  writeJson(CONNECTIONS_FILE, connections);
  connectionsChanged();
  return remoteInfo();
}
function queueRemote(enable) {
  transition = transition.catch(() => {}).then(() => setRemote(enable));
  return transition;
}

function createWindows() {
  controlWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1080, minHeight: 680,
    backgroundColor: '#11110f', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  controlWindow.on('closed', () => { controlWindow = null; operatorState = null; if (!quitting) app.quit(); });
  controlWindow.loadFile(path.join(__dirname, 'src', 'control.html'));
  recovery.refresh();
}

app.whenReady().then(() => {
  ensureData();
  connections = fs.existsSync(CONNECTIONS_FILE) ? JSON.parse(fs.readFileSync(CONNECTIONS_FILE, 'utf8')) : {};
  recovery = new DisplayRecovery({ saved: connections.target,
    list: () => screen.getAllDisplays().map(d => ({ ...d, primary: d.id === screen.getPrimaryDisplay().id })),
    identify: (d, signal) => {
      const center = { x: d.bounds.x + Math.floor(d.bounds.width / 2), y: d.bounds.y + Math.floor(d.bounds.height / 2) };
      return identifyDisplay({ ...d, physicalPoint: process.platform === 'win32' ? screen.dipToScreenPoint(center) : center }, signal);
    },
    reconnect: reconnectDisplay, remember: target => { connections.target = target; writeJson(CONNECTIONS_FILE, connections); },
    attach: attachOutput, hide: () => { placement = null; displayWindow?.hide(); },
    notify: state => {
      if (output.hold(state.blocked)) publishOutput();
      connectionsChanged();
    }
  });
  createWindows();
  if (connections.remote) queueRemote(true);
  screen.on('display-added', () => recovery.refresh());
  screen.on('display-removed', (_event, d) => recovery.refresh(d.id));
  screen.on('display-metrics-changed', () => recovery.refresh());
  powerMonitor.on('suspend', () => recovery.suspend());
  powerMonitor.on('resume', () => recovery.resume());
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindows(); });
});
app.on('before-quit', () => { quitting = true; recovery?.suspend(); live?.close(); });
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
ipcMain.handle('playlist:save', (_e, data) => { writeJson(PLAYLIST_FILE, data); return true; });
ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
ipcMain.handle('settings:save', (_e, data) => { writeJson(SETTINGS_FILE, data); return true; });
ipcMain.handle('displays:list', () => displays());
ipcMain.handle('display:select', (_e, id) => { recovery.select(id); return recovery.state().targetId; });
ipcMain.handle('display:current', localOutput);
ipcMain.handle('connection:get', () => ({ output: recovery.state(), remote: remoteInfo(), displays: displays() }));
ipcMain.handle('connection:wireless-name', (_e, name) => recovery.setCastName(name));
ipcMain.handle('remote:enable', (_e, value) => queueRemote(value === true));
ipcMain.handle('remote:renew', () => { live?.renew(); connectionsChanged(); return remoteInfo(); });
ipcMain.on('display:command', (event, payload) => {
  if (event.sender !== controlWindow?.webContents) return;
  output.command(payload); publishOutput();
});
ipcMain.on('operator:state', (event, state) => {
  if (event.sender !== controlWindow?.webContents) return;
  operatorState = state; stateAt = Date.now(); live?.update();
});
ipcMain.on('operator:result', (event, result) => {
  if (event.sender !== controlWindow?.webContents) return;
  pendingActions.get(result.id)?.(result); pendingActions.delete(result.id);
});
ipcMain.on('control:status', (_e, payload) => send(controlWindow, 'control:status', payload));
