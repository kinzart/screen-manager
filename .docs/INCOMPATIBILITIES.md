# Incompatibilidades Electron para mobile

Consolidacao das auditorias das tasks 10 a 15.

A arquitetura mobile final continua pendente de decisao humana.

## Resumo

| ID | Area | Impacto | Dificuldade |
|---|---|---|---|
| INC-01 | Runtime Electron e BrowserWindow | Alto | Alta |
| INC-02 | IPC e bridge Electron | Alto | Media |
| INC-03 | Filesystem e caminhos locais | Alto | Alta |
| INC-04 | Segundo monitor e gerenciamento de exibicao | Critico | Alta |
| INC-05 | Reproducao de midia e codecs | Medio | Media |
| INC-06 | Drag and drop teclado e touch | Medio | Media |
| INC-07 | Persistencia de playlist e configuracoes | Medio | Media |
| INC-08 | Ciclo de vida mobile | Medio | Media |
| INC-09 | Shell dialog e integracao com Windows | Medio | Media |

## INC-01 - Runtime Electron e BrowserWindow

- Impacto: Alto
- Dificuldade: Alta
- Alternativa: Manter o runtime desktop e criar adapter mobile sem BrowserWindow.
- Limitacao: O mobile nao reproduz diretamente a arquitetura de multiplas janelas Electron.

### Evidencias

- .docs\_audit\main.js.md, linha 3: Auditoria somente leitura do processo principal Electron.
- .docs\_audit\main.js.md, linha 14: Foram pesquisadas chamadas e referencias relacionadas a Electron, IPC, janelas, filesystem, persistencia, monitores e integracoes do sistema.
- .docs\_audit\main.js.md, linha 17: ## Electron e imports
- .docs\_audit\main.js.md, linha 19: - Linha 1: const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
- .docs\_audit\main.js.md, linha 21: - Linha 30: displayWindow = new BrowserWindow({
- .docs\_audit\main.js.md, linha 22: - Linha 44: controlWindow = new BrowserWindow({
- .docs\_audit\main.js.md, linha 24: - Linha 55: screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
- .docs\_audit\main.js.md, linha 25: - Linha 56: screen.on('display-removed', () => controlWindow?.webContents.send('displays-changed', displays()));
- .docs\_audit\main.js.md, linha 26: - Linha 57: app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindows(); });
- .docs\_audit\package-baseline.md, linha 7: Auditoria somente leitura do projeto Electron.
- .docs\_audit\package-baseline.md, linha 23: - Electron declarado: ^37.2.0
- .docs\_audit\package-baseline.md, linha 24: - Electron no package-lock: 37.10.3
- .docs\_audit\package-baseline.md, linha 28: - package: electron-builder --win nsis
- .docs\_audit\package-baseline.md, linha 29: - start: electron .

## INC-02 - IPC e bridge Electron

- Impacto: Alto
- Dificuldade: Media
- Alternativa: Criar contrato compartilhado com adapters Electron, Capacitor ou protocolo WebSocket.
- Limitacao: O comportamento atual nao pode ser copiado diretamente para o WebView mobile.

### Evidencias

- .docs\_audit\main.js.md, linha 19: - Linha 1: const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
- .docs\_audit\main.js.md, linha 28: - Linha 61: ipcMain.handle('files:choose', async () => {
- .docs\_audit\main.js.md, linha 29: - Linha 65: ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- .docs\_audit\main.js.md, linha 30: - Linha 66: ipcMain.handle('files:open', async (_e, filePath) => {
- .docs\_audit\main.js.md, linha 31: - Linha 71: ipcMain.handle('files:showInFolder', (_e, filePath) => {
- .docs\_audit\main.js.md, linha 32: - Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 33: - Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 34: - Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 35: - Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 36: - Linha 80: ipcMain.handle('displays:list', () => displays());
- .docs\_audit\main.js.md, linha 37: - Linha 81: ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
- .docs\_audit\main.js.md, linha 38: - Linha 82: ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));
- .docs\_audit\main.js.md, linha 39: - Linha 83: ipcMain.on('control:status', (_e, payload) => controlWindow?.webContents.send('control:status', payload));
- .docs\_audit\main.js.md, linha 53: - Linha 61: ipcMain.handle('files:choose', async () => {

## INC-03 - Filesystem e caminhos locais

- Impacto: Alto
- Dificuldade: Alta
- Alternativa: Usar Capacitor Filesystem, seletor Android ou manter arquivos no desktop.
- Limitacao: Android possui sandbox, permissoes e caminhos diferentes do Windows.

### Evidencias

- .docs\_audit\main.js.md, linha 5: ## Arquivo auditado
- .docs\_audit\main.js.md, linha 14: Foram pesquisadas chamadas e referencias relacionadas a Electron, IPC, janelas, filesystem, persistencia, monitores e integracoes do sistema.
- .docs\_audit\main.js.md, linha 15: As evidencias abaixo reproduzem linhas reais do arquivo.
- .docs\_audit\main.js.md, linha 20: - Linha 5: const DATA_DIR = path.join(app.getPath('userData'), 'data');
- .docs\_audit\main.js.md, linha 29: - Linha 65: ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- .docs\_audit\main.js.md, linha 32: - Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 33: - Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 34: - Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 35: - Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 44: - Linha 38: displayWindow.loadFile(path.join(__dirname, 'src', 'display.html'));
- .docs\_audit\main.js.md, linha 47: - Linha 49: controlWindow.loadFile(path.join(__dirname, 'src', 'control.html'));
- .docs\_audit\main.js.md, linha 54: - Linha 65: ipcMain.handle('files:validate', (_e, paths = []) => paths.filter(p => typeof p === 'string' && SUPPORTED.has(path.extname(p).toLowerCase()) && fs.existsSync(p)));
- .docs\_audit\main.js.md, linha 57: - Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 58: - Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });

## INC-04 - Segundo monitor e gerenciamento de exibicao

- Impacto: Critico
- Dificuldade: Alta
- Alternativa: Manter o display no computador e usar o celular como controle remoto.
- Limitacao: O celular nao substitui automaticamente o segundo monitor conectado ao computador.

### Evidencias

- .docs\_audit\main.js.md, linha 21: - Linha 30: displayWindow = new BrowserWindow({
- .docs\_audit\main.js.md, linha 24: - Linha 55: screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
- .docs\_audit\main.js.md, linha 25: - Linha 56: screen.on('display-removed', () => controlWindow?.webContents.send('displays-changed', displays()));
- .docs\_audit\main.js.md, linha 36: - Linha 80: ipcMain.handle('displays:list', () => displays());
- .docs\_audit\main.js.md, linha 37: - Linha 81: ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
- .docs\_audit\main.js.md, linha 38: - Linha 82: ipcMain.on('display:command', (_e, payload) => displayWindow?.webContents.send('display:command', payload));
- .docs\_audit\main.js.md, linha 43: - Linha 30: displayWindow = new BrowserWindow({
- .docs\_audit\main.js.md, linha 44: - Linha 38: displayWindow.loadFile(path.join(__dirname, 'src', 'display.html'));
- .docs\_audit\main.js.md, linha 45: - Linha 39: displayWindow.once('ready-to-show', () => displayWindow.show());
- .docs\_audit\main.js.md, linha 51: - Linha 55: screen.on('display-added', () => controlWindow?.webContents.send('displays-changed', displays()));
- .docs\_audit\main.js.md, linha 52: - Linha 56: screen.on('display-removed', () => controlWindow?.webContents.send('displays-changed', displays()));
- .docs\_audit\main.js.md, linha 61: - Linha 80: ipcMain.handle('displays:list', () => displays());
- .docs\_audit\main.js.md, linha 62: - Linha 81: ipcMain.handle('display:select', (_e, id) => { createDisplay(id); return displayId; });
- .docs\_audit\package-baseline.md, linha 15: - Descricao: Gerenciador local de mÃ­dia para telÃ£o e segundo monitor

## INC-05 - Reproducao de midia e codecs

- Impacto: Medio
- Dificuldade: Media
- Alternativa: Reutilizar elementos HTML de midia e validar codecs e permissoes no Android.
- Limitacao: Autoplay, formatos e acesso a arquivos variam por dispositivo.

### Evidencias

- .docs\_audit\control.js.md, linha 43: - Linha 119: el.querySelector(".duration").onchange = (e) =>
- .docs\_audit\control.js.md, linha 72: - Linha 119: el.querySelector(".duration").onchange = (e) =>
- .docs\_audit\control.js.md, linha 101: - Linha 68: return `<article class="item${cls}" draggable="true" data-id="${esc(item.id)}"><span class="handle" title="Arraste para reordenar">≡</span><div class="thumb">${media}</div><div class="meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.type === "video" ? "VÍDE...
- .docs\_audit\control.js.md, linha 223: - Linha 68: return `<article class="item${cls}" draggable="true" data-id="${esc(item.id)}"><span class="handle" title="Arraste para reordenar">≡</span><div class="thumb">${media}</div><div class="meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.type === "video" ? "VÍDE...
- .docs\_audit\control.js.md, linha 234: - Linha 119: el.querySelector(".duration").onchange = (e) =>
- .docs\_audit\control.js.md, linha 235: - Linha 120: update(id, "duration", Math.max(0, Number(e.target.value)));
- .docs\_audit\control.js.md, linha 255: - Linha 196: if (id === currentId && key === "duration")
- .docs\_audit\control.js.md, linha 258: - Linha 217: duration: 10,
- .docs\_audit\control.js.md, linha 280: - Linha 288: if (item.duration > 0 && elapsed >= item.duration) {
- .docs\_audit\control.js.md, linha 281: - Linha 290: elapsed = item.duration;
- .docs\_audit\control.js.md, linha 295: - Linha 317: $("#remaining").textContent = fmt((item?.duration || 0) - elapsed);
- .docs\_audit\control.js.md, linha 296: - Linha 318: $("#progress").style.width = item?.duration
- .docs\_audit\control.js.md, linha 297: - Linha 319: ? `${Math.min(100, (elapsed / item.duration) * 100)}%`
- .docs\_audit\preload.js.md, linha 102: - fbs: src\display.js, linha 14: if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }

## INC-06 - Drag and drop teclado e touch

- Impacto: Medio
- Dificuldade: Media
- Alternativa: Criar interacoes touch, botoes e gestos equivalentes.
- Limitacao: Drag and drop e atalhos de teclado nao podem ser a unica interface mobile.

### Evidencias

- .docs\_audit\control.js.md, linha 12: - Sinais encontrados: nome contém control, window.fbs, playlist, dragstart, dragover, drop, addEventListener, openFile, loopPlaylist, settings
- .docs\_audit\control.js.md, linha 28: - dragstart
- .docs\_audit\control.js.md, linha 29: - drop
- .docs\_audit\control.js.md, linha 68: - Linha 83: el.addEventListener("dragstart", (e) => {
- .docs\_audit\control.js.md, linha 71: - Linha 106: el.addEventListener("drop", (e) => {
- .docs\_audit\control.js.md, linha 97: - Linha 414: document.addEventListener("drop", (e) => {
- .docs\_audit\control.js.md, linha 99: ## Drag and drop
- .docs\_audit\control.js.md, linha 102: - Linha 83: el.addEventListener("dragstart", (e) => {
- .docs\_audit\control.js.md, linha 105: - Linha 91: e.dataTransfer.dropEffect = "move";
- .docs\_audit\control.js.md, linha 109: - Linha 103: e.dataTransfer.dropEffect = "move";
- .docs\_audit\control.js.md, linha 110: - Linha 106: el.addEventListener("drop", (e) => {
- .docs\_audit\control.js.md, linha 113: - Linha 409: $("#dropzone").hidden = false;
- .docs\_audit\control.js.md, linha 115: - Linha 412: if (!dragId && !e.relatedTarget) $("#dropzone").hidden = true;
- .docs\_audit\control.js.md, linha 116: - Linha 414: document.addEventListener("drop", (e) => {

## INC-07 - Persistencia de playlist e configuracoes

- Impacto: Medio
- Dificuldade: Media
- Alternativa: Criar repository compartilhado com storage separado por plataforma.
- Limitacao: Storage web pode ser apagado, limitado ou nao sincronizado com o desktop.

### Evidencias

- .docs\_audit\main.js.md, linha 14: Foram pesquisadas chamadas e referencias relacionadas a Electron, IPC, janelas, filesystem, persistencia, monitores e integracoes do sistema.
- .docs\_audit\main.js.md, linha 32: - Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 33: - Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 34: - Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 35: - Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 57: - Linha 76: ipcMain.handle('playlist:load', () => JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 58: - Linha 77: ipcMain.handle('playlist:save', (_e, data) => { fs.writeFileSync(PLAYLIST_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 59: - Linha 78: ipcMain.handle('settings:load', () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
- .docs\_audit\main.js.md, linha 60: - Linha 79: ipcMain.handle('settings:save', (_e, data) => { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); return true; });
- .docs\_audit\main.js.md, linha 97: - Linha 6: const PLAYLIST_FILE = path.join(DATA_DIR, 'playlist.json');
- .docs\_audit\main.js.md, linha 98: - Linha 7: const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
- .docs\_audit\main.js.md, linha 100: - Linha 15: if (!fs.existsSync(PLAYLIST_FILE)) fs.writeFileSync(PLAYLIST_FILE, '[]');
- .docs\_audit\package-baseline.md, linha 62: - package.json
- .docs\_audit\package-baseline.md, linha 63: - package-lock.json

## INC-08 - Ciclo de vida mobile

- Impacto: Medio
- Dificuldade: Media
- Alternativa: Tratar pause, resume, background e restauracao de estado.
- Limitacao: Timers podem ser suspensos quando o aplicativo perde foco.

### Evidencias

- .docs\_audit\control.js.md, linha 39: - Linha 40: setTimeout(() => t.classList.remove("show"), 2200);
- .docs\_audit\display.js.md, linha 63: ## Timers e sincronizacao
- .docs\_audit\display.js.md, linha 95: - Timers e sincronizacao de midia devem considerar suspensao do aplicativo, tela bloqueada e ciclo de vida mobile.
- .docs\_audit\main.js.md, linha 81: - Linha 34: fullscreen: hasSecond, frame: !hasSecond, backgroundColor: '#000000',
- .docs\_audit\persistence-and-ipc.md, linha 242: - localStorage pode funcionar em WebView, mas volume, backup e ciclo de vida precisam de validacao.

## INC-09 - Shell dialog e integracao com Windows

- Impacto: Medio
- Dificuldade: Media
- Alternativa: Substituir por plugins Capacitor e intents Android.
- Limitacao: Nem todas as acoes do shell desktop possuem equivalente mobile.

### Evidencias

- .docs\_audit\main.js.md, linha 19: - Linha 1: const { app, BrowserWindow, ipcMain, dialog, screen, shell } = require('electron');
- .docs\_audit\main.js.md, linha 26: - Linha 57: app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindows(); });
- .docs\_audit\main.js.md, linha 126: ## Dialog shell e integracao com sistema
- .docs\_audit\main.js.md, linha 128: - Linha 62: const result = await dialog.showOpenDialog(controlWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Imagens e vídeos', extensions: [...SUPPORTED].map(x => x.slice(1)) }] });
- .docs\_audit\main.js.md, linha 129: - Linha 68: const error = await shell.openPath(filePath);
- .docs\_audit\main.js.md, linha 130: - Linha 73: shell.showItemInFolder(filePath);
- .docs\_audit\main.js.md, linha 144: - Dialog e shell exigem APIs equivalentes da plataforma mobile.
- .docs\_audit\persistence-and-ipc.md, linha 133: - main.js, linha 68: const error = await shell.openPath(filePath);
- .docs\_audit\persistence-and-ipc.md, linha 135: - main.js, linha 73: shell.showItemInFolder(filePath);
- .docs\_audit\preload.js.md, linha 113: - webUtils, caminhos de arquivos e integrações do shell exigem APIs compatíveis com o sandbox Android.

## Conclusao preliminar

A incompatibilidade central e que o aplicativo atual depende do computador para janelas, segundo monitor, IPC, filesystem e integracao com Windows.

A opcao com menor risco para a primeira entrega Android e manter a apresentacao no Electron e usar o celular como controle remoto.

Um aplicativo independente exigiria reimplementar filesystem, persistencia, exibicao, selecao de midia e ciclo de vida.

Uma arquitetura hibrida possui maior potencial futuro, mas tambem maior custo inicial.

## Estado

- Nenhum arquivo de codigo foi alterado.
- Nenhuma dependencia foi instalada.
- Nenhum build ou deploy foi executado.
- Arquitetura definitiva: NAO CONFIRMADA.
