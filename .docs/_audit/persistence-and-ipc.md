# Mapeamento de persistencia IPC e fluxo de dados

Auditoria somente leitura dos componentes do aplicativo Electron.

## Fontes auditadas

- main: main.js
  - SHA-256: 68D4C667DF1F7085FF7E7158110E3E8E36A9A240853B42204C4AB4E617725F84
- preload: preload.js
  - SHA-256: AC7E9CCF98732B4FAF69076ACB2780843CB8D3AC59F2E67E73F83F2079CC3E41
- control: src\control.js
  - SHA-256: 6F0F7D6E27F88FE0A1D6927D6CB33032E3C84FEB18C51D19716DEF0F53C336D8
- display: src\display.js
  - SHA-256: AD4D1E4D7ED2EF409780EF2F4FECD24489972A8248A4982508D19FCB2E580DF1

## Canais IPC

- control:status
- display:command
- display:select
- displays:list
- displays-changed
- files:choose
- files:open
- files:showInFolder
- files:validate
- playlist:load
- playlist:save
- settings:load
- settings:save

## Evidencias IPC

- renderer-to-main | on | control:status | main.js, linha 83
  - ipcMain.on('control:status', (_e, payload) => controlWindow?.webContents.send('control:status', payload));
- main-to-renderer | send | control:status | main.js, linha 83
  - ipcMain.on('control:status', (_e, payload) => controlWindow?.webContents.send('control:status', payload));
- main-to-renderer | on | control:status | preload.js, linha 15
  - status: payload => ipcRenderer.send('control:status', payload),
- renderer-to-main | send | control:status | preload.js, linha 15
  - status: payload => ipcRenderer.send('control:status', payload),
- renderer-to-main | on | display:command | main.js, linha 82
  - ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));
- main-to-renderer | send | display:command | main.js, linha 82
  - ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));
- main-to-renderer | on | display:command | preload.js, linha 14
  - command: payload => ipcRenderer.send('display:command', payload),
- renderer-to-main | send | display:command | preload.js, linha 14
  - command: payload => ipcRenderer.send('display:command', payload),
- renderer-to-main | handle | display:select | main.js, linha 81
  - ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
- renderer-to-main | invoke | display:select | preload.js, linha 13
  - selectDisplay: id => ipcRenderer.invoke('display:select', id),
- renderer-to-main | handle | displays:list | main.js, linha 80
  - ipcMain.handle('displays:list', () => displays());
- renderer-to-main | invoke | displays:list | preload.js, linha 12
  - listDisplays: () => ipcRenderer.invoke('displays:list'),
- main-to-renderer | send | displays-changed | main.js, linha 55
  - screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
- main-to-renderer | on | displays-changed | preload.js, linha 18
  - onDisplays: fn => ipcRenderer.on('displays-changed', (_e, value) => fn(value))
- renderer-to-main | handle | files:choose | main.js, linha 61
  - ipcMain.handle('files:choose', async () => {
- renderer-to-main | invoke | files:choose | preload.js, linha 3
  - chooseFiles: () => ipcRenderer.invoke('files:choose'),
- renderer-to-main | handle | files:open | main.js, linha 66
  - ipcMain.handle('files:open', async (_e, filePath) => {
- renderer-to-main | invoke | files:open | preload.js, linha 6
  - openFile: path => ipcRenderer.invoke('files:open', path),
- renderer-to-main | handle | files:showInFolder | main.js, linha 71
  - ipcMain.handle('files:showInFolder', (_e, filePath) => {
- renderer-to-main | invoke | files:showInFolder | preload.js, linha 7
  - showInFolder: path => ipcRenderer.invoke('files:showInFolder', path),
- renderer-to-main | handle | files:validate | main.js, linha 65
  - ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- renderer-to-main | invoke | files:validate | preload.js, linha 4
  - validateFiles: paths => ipcRenderer.invoke('files:validate', paths),
- renderer-to-main | handle | playlist:load | main.js, linha 76
  - ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- renderer-to-main | invoke | playlist:load | preload.js, linha 8
  - loadPlaylist: () => ipcRenderer.invoke('playlist:load'),
- renderer-to-main | handle | playlist:save | main.js, linha 77
  - ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- renderer-to-main | invoke | playlist:save | preload.js, linha 9
  - savePlaylist: data => ipcRenderer.invoke('playlist:save', data),
- renderer-to-main | handle | settings:load | main.js, linha 78
  - ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- renderer-to-main | invoke | settings:load | preload.js, linha 10
  - loadSettings: () => ipcRenderer.invoke('settings:load'),
- renderer-to-main | handle | settings:save | main.js, linha 79
  - ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- renderer-to-main | invoke | settings:save | preload.js, linha 11
  - saveSettings: data => ipcRenderer.invoke('settings:save', data),

## Chamadas de bridge nos renderers

- src\control.js, linha 231: window.fbs.chooseFiles()
- src\control.js, linha 240: window.fbs.command()
- src\control.js, linha 418: window.fbs.filePaths()
- src\control.js, linha 498: window.fbs.listDisplays()
- src\control.js, linha 492: window.fbs.loadPlaylist()
- src\control.js, linha 493: window.fbs.loadSettings()
- src\display.js, linha 18: window.fbs.onCommand()
- src\control.js, linha 425: window.fbs.onDisplays()
- src\control.js, linha 424: window.fbs.onStatus()
- src\control.js, linha 168: window.fbs.openFile()
- src\control.js, linha 203: window.fbs.savePlaylist()
- src\control.js, linha 204: window.fbs.saveSettings()
- src\control.js, linha 405: window.fbs.selectDisplay()
- src\control.js, linha 169: window.fbs.showInFolder()
- src\display.js, linha 14: window.fbs.status()
- src\control.js, linha 210: window.fbs.validateFiles()

## Storage do navegador

- Nenhuma chave literal de localStorage ou sessionStorage foi localizada.

## Persistencia e arquivos

- main.js, linha 3: const fs = require('fs');
- main.js, linha 5: const DATA_DIR = path.join(app.getPath('userData'), 'data');
- main.js, linha 6: const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
- main.js, linha 7: const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
- main.js, linha 14: fs.mkdirSync(DATA_DIR, { recursive: true });
- main.js, linha 15: if (!fs.existsSync(PLAYLIST_FILE)) fs.writeFileSync(PLAYLIST_FILE, '[]');
- main.js, linha 16: if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ rules: [], defaultFit: 'contain', loopPlaylist: true }, null, 2));
- main.js, linha 36: webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
- main.js, linha 38: displayWindow.loadFile(path.join(__dirname, 'src', 'display.html'));
- main.js, linha 47: webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
- main.js, linha 49: controlWindow.loadFile(path.join(__dirname, 'src', 'control.html'));
- main.js, linha 65: ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- main.js, linha 67: if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false, error: 'Arquivo nao encontrado' };
- main.js, linha 68: const error = await shell.openPath(filePath);
- main.js, linha 72: if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return { ok: false, error: 'Arquivo nao encontrado' };
- main.js, linha 73: shell.showItemInFolder(filePath);
- main.js, linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- main.js, linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- main.js, linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- main.js, linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });

## Estado playlist e configuracoes

- main.js, linha 6: const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
- main.js, linha 7: const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
- main.js, linha 15: if (!fs.existsSync(PLAYLIST_FILE)) fs.writeFileSync(PLAYLIST_FILE, '[]');
- main.js, linha 16: if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ rules: [], defaultFit: 'contain', loopPlaylist: true }, null, 2));
- main.js, linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- main.js, linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- main.js, linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- main.js, linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- preload.js, linha 8: loadPlaylist: () => ipcRenderer.invoke('playlist:load'),
- preload.js, linha 9: savePlaylist: data => ipcRenderer.invoke('playlist:save', data),
- preload.js, linha 10: loadSettings: () => ipcRenderer.invoke('settings:load'),
- preload.js, linha 11: saveSettings: data => ipcRenderer.invoke('settings:save', data),
- src\control.js, linha 2: const queueEl = $("#queue");
- src\control.js, linha 3: let playlist = [],
- src\control.js, linha 4: settings = { rules: [], loopPlaylist: true },
- src\control.js, linha 44: return settings.rules.find((r) => r.start <= now && now < r.end);
- src\control.js, linha 68: return `<article class="item${cls}" draggable="true" data-id="${esc(item.id)}"><span class="handle" title="Arraste para reordenar">≡</span><div class="thumb">${media}</div><div class="meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.type === "video" ? "VÍDEO" : "IMAGEM"}</small>${state ? `<span class="schedu...
- src\control.js, linha 71: queueEl.innerHTML = playlist.map(itemMarkup).join("");
- src\control.js, linha 72: $("#empty").hidden = playlist.length > 0;
- src\control.js, linha 74: `${playlist.length} ${playlist.length === 1 ? "item" : "itens"}`;
- src\control.js, linha 110: const from = playlist.findIndex((x) => x.id === dragId),
- src\control.js, linha 111: to = playlist.findIndex((x) => x.id === id);
- src\control.js, linha 113: const [m] = playlist.splice(from, 1);
- src\control.js, linha 114: playlist.splice(to, 0, m);
- src\control.js, linha 119: el.querySelector(".duration").onchange = (e) =>
- src\control.js, linha 120: update(id, "duration", Math.max(0, Number(e.target.value)));
- src\control.js, linha 128: playlist = playlist.filter((x) => x.id !== id);
- src\control.js, linha 144: $("#fileCount").textContent = String(playlist.length);
- src\control.js, linha 145: if (!playlist.length) {
- src\control.js, linha 149: panel.innerHTML = playlist
- src\control.js, linha 157: el.querySelector(".open-file").onclick = () => openPlaylistPath(id, "file");
- src\control.js, linha 159: openPlaylistPath(id, "folder");
- src\control.js, linha 162: async function openPlaylistPath(id, mode) {
- src\control.js, linha 163: const item = playlist.find((x) => x.id === id);
- src\control.js, linha 179: button.classList.toggle("active", !!settings.loopPlaylist);
- src\control.js, linha 180: button.textContent = settings.loopPlaylist ? "Loop ligado" : "Loop desligado";
- src\control.js, linha 181: button.title = settings.loopPlaylist
- src\control.js, linha 183: : "Ao final, para a playlist";
- src\control.js, linha 186: const from = playlist.findIndex((item) => item.id === id);
- src\control.js, linha 188: if (from < 0 || to < 0 || to >= playlist.length) return;
- src\control.js, linha 189: [playlist[from], playlist[to]] = [playlist[to], playlist[from]];
- src\control.js, linha 194: const x = playlist.find((i) => i.id === id);
- src\control.js, linha 196: if (id === currentId && key === "duration")
- src\control.js, linha 203: await window.fbs.savePlaylist(playlist);
- src\control.js, linha 204: await window.fbs.saveSettings(settings);
- src\control.js, linha 212: playlist.push({
- src\control.js, linha 217: duration: 10,
- src\control.js, linha 234: const item = playlist.find((x) => x.id === id);
- src\control.js, linha 248: if (!playlist.length) return toast("Adicione uma mídia à fila");
- src\control.js, linha 249: take(currentId || playlist[0].id);
- src\control.js, linha 260: if (!playlist.length) return;
- src\control.js, linha 261: const i = playlist.findIndex((x) => x.id === currentId);
- src\control.js, linha 263: playlist[(Math.max(0, i) + delta + playlist.length) % playlist.length].id,
- src\control.js, linha 267: const i = playlist.findIndex((x) => x.id === currentId);
- src\control.js, linha 268: if (i === playlist.length - 1 && !settings.loopPlaylist) {
- src\control.js, linha 286: const item = playlist.find((x) => x.id === currentId);
- src\control.js, linha 288: if (item.duration > 0 && elapsed >= item.duration) {
- src\control.js, linha 290: elapsed = item.duration;
- src\control.js, linha 300: const item = playlist.find((x) => x.id === currentId),
- src\control.js, linha 301: i = playlist.findIndex((x) => x.id === currentId);
- src\control.js, linha 303: ? i < playlist.length - 1
- src\control.js, linha 304: ? playlist[i + 1]
- src\control.js, linha 305: : settings.loopPlaylist && playlist.length > 1
- src\control.js, linha 306: ? playlist[0]
- src\control.js, linha 308: : playlist[0];
- src\control.js, linha 313: : playlist.length
- src\control.js, linha 317: $("#remaining").textContent = fmt((item?.duration || 0) - elapsed);
- src\control.js, linha 318: $("#progress").style.width = item?.duration
- src\control.js, linha 319: ? `${Math.min(100, (elapsed / item.duration) * 100)}%`
- src\control.js, linha 335: $("#rules").innerHTML = settings.rules
- src\control.js, linha 344: settings.rules[i].start = e.target.value;
- src\control.js, linha 348: settings.rules[i].end = e.target.value;
- src\control.js, linha 352: settings.rules[i].transition = e.target.value;
- src\control.js, linha 356: settings.rules.splice(i, 1);
- src\control.js, linha 373: playlist = [];
- src\control.js, linha 393: settings.loopPlaylist = !settings.loopPlaylist;
- src\control.js, linha 401: settings.rules.push({ start: "19:00", end: "20:00", transition: "fade" });
- src\control.js, linha 435: scheduled = playlist
- src\control.js, linha 444: const live = playlist.find((x) => x.id === currentId);
- src\control.js, linha 492: playlist = await window.fbs.loadPlaylist();
- src\control.js, linha 493: settings = { rules: [], loopPlaylist: true, ...(await window.fbs.loadSettings()) };
- src\control.js, linha 494: settings.rules ||= [];
- src\control.js, linha 495: settings.loopPlaylist ??= true;
- src\display.js, linha 14: if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }

## Fluxo consolidado

1. A interface de controle manipula playlist, configuracoes e comandos de apresentacao.
2. Chamadas window.bridge.metodo, quando presentes, entram pelo preload.
3. O preload converte chamadas para ipcRenderer ou entrega callbacks aos renderers.
4. O processo principal recebe canais via ipcMain e pode acessar janelas, arquivos e recursos do sistema.
5. O renderer de exibicao recebe estado e apresenta imagem, video, logo ou blackout.
6. Playlist e configuracoes podem permanecer em memoria, storage web, JSON ou filesystem, conforme as evidencias listadas.

## Impacto mobile preliminar

- ipcMain e ipcRenderer nao existem diretamente no Capacitor.
- A bridge atual pode virar um contrato compartilhado com adapters para Electron e mobile.
- Filesystem desktop deve ser substituido por API Android, plugin Capacitor ou servico executado no computador.
- localStorage pode funcionar em WebView, mas volume, backup e ciclo de vida precisam de validacao.
- A decisao entre controle remoto, aplicativo independente e arquitetura hibrida continua pendente.

## Pontos para revisao humana

- Canais IPC montados dinamicamente podem nao aparecer nesta extracao.
- Bridges compostas dinamicamente podem exigir revisao manual.
- A origem definitiva da playlist e das configuracoes deve ser confirmada na arquitetura.

## Estado

- Nenhum arquivo de codigo foi alterado.
- Nenhuma dependencia foi instalada.
- Nenhum build ou deploy foi executado.
- Fluxo mobile definitivo: NAO CONFIRMADO.
