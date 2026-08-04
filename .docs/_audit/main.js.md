# Auditoria de main.js

Auditoria somente leitura do processo principal Electron.

## Arquivo auditado

- Caminho: main.js
- Linhas: 83
- Bytes: 4622
- SHA-256: 68D4C667DF1F7085FF7E7158110E3E8E36A9A240853B42204C4AB4E617725F84

## Metodo

Foram pesquisadas chamadas e referencias relacionadas a Electron, IPC, janelas, filesystem, persistencia, monitores e integracoes do sistema.
As evidencias abaixo reproduzem linhas reais do arquivo.

## Electron e imports

- Linha 1: const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
- Linha 5: const DATA_DIR = path.join(app.getPath('userData'), 'data');
- Linha 30: displayWindow = new BrowserWindow({
- Linha 44: controlWindow = new BrowserWindow({
- Linha 53: app.whenReady().then(() => {
- Linha 55: screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
- Linha 56: screen.on('display-removed', () => controlWindow?.webContents.send('displays-changed', displays()));
- Linha 57: app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindows(); });
- Linha 59: app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
- Linha 61: ipcMain.handle('files:choose', async () => {
- Linha 65: ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- Linha 66: ipcMain.handle('files:open', async (_e, filePath) => {
- Linha 71: ipcMain.handle('files:showInFolder', (_e, filePath) => {
- Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- Linha 80: ipcMain.handle('displays:list', () => displays());
- Linha 81: ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
- Linha 82: ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));
- Linha 83: ipcMain.on('control:status', (_e, payload) => controlWindow?.webContents.send('control:status', payload));

## Criacao e gerenciamento de janelas

- Linha 30: displayWindow = new BrowserWindow({
- Linha 38: displayWindow.loadFile(path.join(__dirname, 'src', 'display.html'));
- Linha 39: displayWindow.once('ready-to-show', () => displayWindow.show());
- Linha 44: controlWindow = new BrowserWindow({
- Linha 49: controlWindow.loadFile(path.join(__dirname, 'src', 'control.html'));

## IPC

- Linha 55: screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
- Linha 56: screen.on('display-removed', () => controlWindow?.webContents.send('displays-changed', displays()));
- Linha 61: ipcMain.handle('files:choose', async () => {
- Linha 65: ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- Linha 66: ipcMain.handle('files:open', async (_e, filePath) => {
- Linha 71: ipcMain.handle('files:showInFolder', (_e, filePath) => {
- Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- Linha 80: ipcMain.handle('displays:list', () => displays());
- Linha 81: ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
- Linha 82: ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));
- Linha 83: ipcMain.on('control:status', (_e, payload) => controlWindow?.webContents.send('control:status', payload));

## Monitores fullscreen e exibicao

- Linha 10: let displayWindow;
- Linha 11: let displayId;
- Linha 19: function displays() {
- Linha 20: return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: `Tela ${i + 1} · ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' · principal' : ''}` }));
- Linha 23: function createDisplay(targetId) {
- Linha 24: const all = screen.getAllDisplays();
- Linha 25: const primary = screen.getPrimaryDisplay();
- Linha 27: displayId = String(target.id);
- Linha 28: if (displayWindow && !displayWindow.isDestroyed()) displayWindow.destroy();
- Linha 29: const hasSecond = all.length > 1;
- Linha 30: displayWindow = new BrowserWindow({
- Linha 32: width: hasSecond ? target.bounds.width : 960,
- Linha 33: height: hasSecond ? target.bounds.height : 540,
- Linha 34: fullscreen: hasSecond, frame: !hasSecond, backgroundColor: '#000000',
- Linha 38: displayWindow.loadFile(path.join(__dirname, 'src', 'display.html'));
- Linha 39: displayWindow.once('ready-to-show', () => displayWindow.show());
- Linha 40: displayWindow.on('closed', () => { displayWindow = null; });
- Linha 50: createDisplay();
- Linha 55: screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
- Linha 56: screen.on('display-removed', () => controlWindow?.webContents.send('displays-changed', displays()));
- Linha 80: ipcMain.handle('displays:list', () => displays());
- Linha 81: ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
- Linha 82: ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));

## Filesystem e caminhos

- Linha 2: const path = require('path');
- Linha 3: const fs = require('fs');
- Linha 5: const DATA_DIR = path.join(app.getPath('userData'), 'data');
- Linha 6: const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
- Linha 7: const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
- Linha 14: fs.mkdirSync(DATA_DIR, { recursive: true });
- Linha 15: if (!fs.existsSync(PLAYLIST_FILE)) fs.writeFileSync(PLAYLIST_FILE, '[]');
- Linha 16: if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ rules: [], defaultFit: 'contain', loopPlaylist: true }, null, 2));
- Linha 36: webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
- Linha 38: displayWindow.loadFile(path.join(__dirname, 'src', 'display.html'));
- Linha 47: webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
- Linha 49: controlWindow.loadFile(path.join(__dirname, 'src', 'control.html'));
- Linha 65: ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- Linha 67: if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false, error: 'Arquivo nao encontrado' };
- Linha 72: if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false, error: 'Arquivo nao encontrado' };
- Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });

## Persistencia e dados

- Linha 5: const DATA_DIR = path.join(app.getPath('userData'), 'data');
- Linha 6: const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
- Linha 7: const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
- Linha 15: if (!fs.existsSync(PLAYLIST_FILE)) fs.writeFileSync(PLAYLIST_FILE, '[]');
- Linha 16: if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ rules: [], defaultFit: 'contain', loopPlaylist: true }, null, 2));
- Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });

## Dialog shell e integracao com sistema

- Linha 62: const result = await dialog.showOpenDialog(controlWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Imagens e vídeos', extensions: [...SUPPORTED].map(x => x.slice(1)) }] });
- Linha 68: const error = await shell.openPath(filePath);
- Linha 73: shell.showItemInFolder(filePath);

## Subprocessos e comandos externos

- Nenhuma correspondencia localizada.

## Impacto mobile preliminar

Esta secao registra inferencias tecnicas baseadas nas evidencias encontradas. A arquitetura final continua pendente.

- BrowserWindow e gerenciamento de janelas sao exclusivos do runtime desktop e exigem substituicao no mobile.
- ipcMain nao existe no Capacitor; sera necessaria uma camada de adapter, bridge nativa ou protocolo de comunicacao.
- Acesso direto ao filesystem deve ser substituido por APIs permitidas pelo Android ou plugins Capacitor.
- Logica de multiplos monitores, BrowserWindow e fullscreen desktop nao pode ser transportada diretamente para Android.
- Dialog e shell exigem APIs equivalentes da plataforma mobile.

## Estado

- main.js nao foi alterado.
- Nenhuma dependencia foi instalada.
- Nenhum comando de build ou deploy foi executado.
- Compatibilidade mobile definitiva: NAO CONFIRMADA.
