# Auditoria de preload.js

Auditoria somente leitura da bridge entre Electron e renderer.

## Arquivo auditado

- Caminho: preload.js
- Linhas: 20
- Bytes: 1230
- SHA-256: AC7E9CCF98732B4FAF69076ACB2780843CB8D3AC59F2E67E73F83F2079CC3E41

## Bridges expostas

- window.fbs

## Canais IPC localizados

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

## Electron e bridge

- Linha 1: const { contextBridge, ipcRenderer, webUtils } = require('electron');
- Linha 2: contextBridge.exposeInMainWorld('fbs', {

## IPC renderer

- Linha 1: const { contextBridge, ipcRenderer, webUtils } = require('electron');
- Linha 3: chooseFiles: () => ipcRenderer.invoke('files:choose'),
- Linha 4: validateFiles: paths => ipcRenderer.invoke('files:validate', paths),
- Linha 6: openFile: path => ipcRenderer.invoke('files:open', path),
- Linha 7: showInFolder: path => ipcRenderer.invoke('files:showInFolder', path),
- Linha 8: loadPlaylist: () => ipcRenderer.invoke('playlist:load'),
- Linha 9: savePlaylist: data => ipcRenderer.invoke('playlist:save', data),
- Linha 10: loadSettings: () => ipcRenderer.invoke('settings:load'),
- Linha 11: saveSettings: data => ipcRenderer.invoke('settings:save', data),
- Linha 12: listDisplays: () => ipcRenderer.invoke('displays:list'),
- Linha 13: selectDisplay: id => ipcRenderer.invoke('display:select', id),
- Linha 14: command: payload => ipcRenderer.send('display:command', payload),
- Linha 15: status: payload => ipcRenderer.send('control:status', payload),
- Linha 16: onCommand: fn => ipcRenderer.on('display:command', (_e, value) => fn(value)),
- Linha 17: onStatus: fn => ipcRenderer.on('control:status', (_e, value) => fn(value)),
- Linha 18: onDisplays: fn => ipcRenderer.on('displays-changed', (_e, value) => fn(value))

## Arquivos e caminhos

- Linha 1: const { contextBridge, ipcRenderer, webUtils } = require('electron');
- Linha 5: filePaths: files => Array.from(files || []).map(file => webUtils.getPathForFile(file)).filter(Boolean),
- Linha 6: openFile: path => ipcRenderer.invoke('files:open', path),

## APIs Node e sistema

- Nenhuma correspondência localizada.

## APIs do aplicativo

- Linha 2: contextBridge.exposeInMainWorld('fbs', {
- Linha 8: loadPlaylist: () => ipcRenderer.invoke('playlist:load'),
- Linha 9: savePlaylist: data => ipcRenderer.invoke('playlist:save', data),
- Linha 10: loadSettings: () => ipcRenderer.invoke('settings:load'),
- Linha 11: saveSettings: data => ipcRenderer.invoke('settings:save', data),
- Linha 12: listDisplays: () => ipcRenderer.invoke('displays:list'),
- Linha 13: selectDisplay: id => ipcRenderer.invoke('display:select', id),
- Linha 14: command: payload => ipcRenderer.send('display:command', payload),
- Linha 15: status: payload => ipcRenderer.send('control:status', payload),
- Linha 16: onCommand: fn => ipcRenderer.on('display:command', (_e, value) => fn(value)),
- Linha 17: onStatus: fn => ipcRenderer.on('control:status', (_e, value) => fn(value)),
- Linha 18: onDisplays: fn => ipcRenderer.on('displays-changed', (_e, value) => fn(value))

## Consumidores das bridges

- fbs: src\control.js, linha 168: ? await window.fbs.openFile(item.path)
- fbs: src\control.js, linha 169: : await window.fbs.showInFolder(item.path);
- fbs: src\control.js, linha 203: await window.fbs.savePlaylist(playlist);
- fbs: src\control.js, linha 204: await window.fbs.saveSettings(settings);
- fbs: src\control.js, linha 210: const valid = await window.fbs.validateFiles(requested);
- fbs: src\control.js, linha 231: addFiles(await window.fbs.chooseFiles());
- fbs: src\control.js, linha 240: window.fbs.command({
- fbs: src\control.js, linha 256: window.fbs.command({ action: "logo" });
- fbs: src\control.js, linha 278: window.fbs.command({ action: paused ? "pause" : "resume" });
- fbs: src\control.js, linha 398: $("#blackoutBtn").onclick = () => window.fbs.command({ action: "blackout" });
- fbs: src\control.js, linha 399: $("#logoBtn").onclick = () => window.fbs.command({ action: "logo" });
- fbs: src\control.js, linha 405: $("#displaySelect").onchange = (e) => window.fbs.selectDisplay(e.target.value);
- fbs: src\control.js, linha 418: const paths = window.fbs.filePaths
- fbs: src\control.js, linha 419: ? window.fbs.filePaths(e.dataTransfer.files)
- fbs: src\control.js, linha 424: window.fbs.onStatus((s) => s.error && toast(s.error));
- fbs: src\control.js, linha 425: window.fbs.onDisplays(loadDisplays);
- fbs: src\control.js, linha 492: playlist = await window.fbs.loadPlaylist();
- fbs: src\control.js, linha 493: settings = { rules: [], loopPlaylist: true, ...(await window.fbs.loadSettings()) };
- fbs: src\control.js, linha 498: loadDisplays(await window.fbs.listDisplays());
- fbs: src\display.js, linha 14: if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }
- fbs: src\display.js, linha 15: else el.addEventListener('error', () => window.fbs.status({ error: `Arquivo não encontrado: ${item.name}` }));
- fbs: src\display.js, linha 18: window.fbs.onCommand(cmd => {

## Compatibilidade mobile preliminar

As conclusões abaixo são inferências baseadas nas evidências encontradas. A arquitetura final continua pendente.

- contextBridge e exposeInMainWorld são mecanismos do Electron e não existem diretamente no Capacitor.
- As bridges expostas são candidatas a uma interface compartilhada com adapters separados para desktop e mobile.
- ipcRenderer deve ser substituído por adapter local, plugin Capacitor ou protocolo de rede, conforme a arquitetura escolhida.
- webUtils, caminhos de arquivos e integrações do shell exigem APIs compatíveis com o sandbox Android.

## Estado

- preload.js não foi alterado.
- Nenhuma dependência foi instalada.
- Nenhum build ou deploy foi executado.
- Compatibilidade mobile definitiva: NAO CONFIRMADA.
