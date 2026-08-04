# Auditoria do renderer de controle

Auditoria somente leitura da interface responsável pelo controle da apresentação.

## Arquivo identificado

- Caminho: src\control.js
- Pontuacao de identificacao: 71
- Linhas: 500
- Bytes: 17123
- SHA-256: 6F0F7D6E27F88FE0A1D6927D6CB33032E3C84FEB18C51D19716DEF0F53C336D8
- Sinais encontrados: nome contém control, window.fbs, playlist, dragstart, dragover, drop, addEventListener, openFile, loopPlaylist, settings

## Candidatos avaliados

- src\control.js: score 71
- src\display.js: score 3

## HTML relacionado

- src\control.html

## Eventos registrados

- dragend
- dragleave
- dragover
- dragstart
- drop

## Bridges acessadas

- window.fbs

## Inicializacao e DOM

- Linha 1: const $ = (s) => document.querySelector(s);
- Linha 39: t.classList.add("show");
- Linha 40: setTimeout(() => t.classList.remove("show"), 2200);
- Linha 81: document.querySelectorAll(".item").forEach((el) => {
- Linha 93: el.classList.add("dragging");
- Linha 97: el.classList.remove("dragging");
- Linha 119: el.querySelector(".duration").onchange = (e) =>
- Linha 121: el.querySelector(".transition").onchange = (e) =>
- Linha 123: el.querySelector(".startAt").onchange = (e) =>
- Linha 125: el.querySelector(".move-up").onclick = () => moveItem(id, -1);
- Linha 126: el.querySelector(".move-down").onclick = () => moveItem(id, 1);
- Linha 127: el.querySelector(".delete").onclick = () => {
- Linha 155: panel.querySelectorAll(".file-row").forEach((el) => {
- Linha 157: el.querySelector(".open-file").onclick = () => openPlaylistPath(id, "file");
- Linha 158: el.querySelector(".open-folder").onclick = () =>
- Linha 179: button.classList.toggle("active", !!settings.loopPlaylist);
- Linha 341: document.querySelectorAll(".rule").forEach((el) => {
- Linha 343: el.querySelector(".rs").onchange = (e) => {
- Linha 347: el.querySelector(".re").onchange = (e) => {
- Linha 351: el.querySelector(".rt").onchange = (e) => {
- Linha 355: el.querySelector("button").onclick = () => {
- Linha 384: $("#lockBtn").classList.toggle("active", locked);
- Linha 472: document.querySelectorAll(".item").forEach((el) => {
- Linha 474: el.classList.remove("scheduled-soon", "live", "schedule-next");
- Linha 475: el.querySelector(".schedule-badge")?.remove();
- Linha 477: el.classList.add(
- Linha 484: const badge = document.createElement("span");
- Linha 487: el.querySelector(".meta").appendChild(badge);

## Eventos e listeners

- Linha 83: el.addEventListener("dragstart", (e) => {
- Linha 95: el.addEventListener("dragend", () => {
- Linha 99: el.addEventListener("dragover", (e) => {
- Linha 106: el.addEventListener("drop", (e) => {
- Linha 119: el.querySelector(".duration").onchange = (e) =>
- Linha 121: el.querySelector(".transition").onchange = (e) =>
- Linha 123: el.querySelector(".startAt").onchange = (e) =>
- Linha 125: el.querySelector(".move-up").onclick = () => moveItem(id, -1);
- Linha 126: el.querySelector(".move-down").onclick = () => moveItem(id, 1);
- Linha 127: el.querySelector(".delete").onclick = () => {
- Linha 157: el.querySelector(".open-file").onclick = () => openPlaylistPath(id, "file");
- Linha 158: el.querySelector(".open-folder").onclick = () =>
- Linha 343: el.querySelector(".rs").onchange = (e) => {
- Linha 347: el.querySelector(".re").onchange = (e) => {
- Linha 351: el.querySelector(".rt").onchange = (e) => {
- Linha 355: el.querySelector("button").onclick = () => {
- Linha 370: $("#addBtn").onclick = $("#emptyAdd").onclick = choose;
- Linha 371: $("#clearBtn").onclick = () => {
- Linha 379: $("#prevBtn").onclick = () => next(-1);
- Linha 380: $("#nextBtn").onclick = () => next(1);
- Linha 381: $("#pauseBtn").onclick = toggle;
- Linha 382: $("#lockBtn").onclick = () => {
- Linha 392: $("#loopBtn").onclick = () => {
- Linha 398: $("#blackoutBtn").onclick = () => window.fbs.command({ action: "blackout" });
- Linha 399: $("#logoBtn").onclick = () => window.fbs.command({ action: "logo" });
- Linha 400: $("#addRule").onclick = () => {
- Linha 405: $("#displaySelect").onchange = (e) => window.fbs.selectDisplay(e.target.value);
- Linha 406: document.addEventListener("dragover", (e) => {
- Linha 411: document.addEventListener("dragleave", (e) => {
- Linha 414: document.addEventListener("drop", (e) => {

## Drag and drop

- Linha 68: return `<article class="item${cls}" draggable="true" data-id="${esc(item.id)}"><span class="handle" title="Arraste para reordenar">≡</span><div class="thumb">${media}</div><div class="meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.type === "video" ? "VÍDEO" : "IMAGEM"}</small>${state ? ...
- Linha 83: el.addEventListener("dragstart", (e) => {
- Linha 89: e.dataTransfer.setData("application/x-fbs-item", id);
- Linha 90: e.dataTransfer.effectAllowed = "move";
- Linha 91: e.dataTransfer.dropEffect = "move";
- Linha 92: e.dataTransfer.setDragImage?.(el, 24, 24);
- Linha 95: el.addEventListener("dragend", () => {
- Linha 99: el.addEventListener("dragover", (e) => {
- Linha 103: e.dataTransfer.dropEffect = "move";
- Linha 106: el.addEventListener("drop", (e) => {
- Linha 406: document.addEventListener("dragover", (e) => {
- Linha 407: if (dragId || ![...e.dataTransfer.types].includes("Files")) return;
- Linha 409: $("#dropzone").hidden = false;
- Linha 411: document.addEventListener("dragleave", (e) => {
- Linha 412: if (!dragId && !e.relatedTarget) $("#dropzone").hidden = true;
- Linha 414: document.addEventListener("drop", (e) => {
- Linha 415: if (dragId || ![...e.dataTransfer.types].includes("Files")) return;
- Linha 417: $("#dropzone").hidden = true;
- Linha 419: ? window.fbs.filePaths(e.dataTransfer.files)
- Linha 420: : [...e.dataTransfer.files].map((f) => f.path).filter(Boolean);

## Teclado

- Nenhuma correspondencia localizada.

## Touch e ponteiro

- Nenhuma correspondencia localizada.

## Bridge Electron

- Linha 168: ? await window.fbs.openFile(item.path)
- Linha 169: : await window.fbs.showInFolder(item.path);
- Linha 203: await window.fbs.savePlaylist(playlist);
- Linha 204: await window.fbs.saveSettings(settings);
- Linha 210: const valid = await window.fbs.validateFiles(requested);
- Linha 231: addFiles(await window.fbs.chooseFiles());
- Linha 240: window.fbs.command({
- Linha 256: window.fbs.command({ action: "logo" });
- Linha 278: window.fbs.command({ action: paused ? "pause" : "resume" });
- Linha 398: $("#blackoutBtn").onclick = () => window.fbs.command({ action: "blackout" });
- Linha 399: $("#logoBtn").onclick = () => window.fbs.command({ action: "logo" });
- Linha 405: $("#displaySelect").onchange = (e) => window.fbs.selectDisplay(e.target.value);
- Linha 418: const paths = window.fbs.filePaths
- Linha 419: ? window.fbs.filePaths(e.dataTransfer.files)
- Linha 424: window.fbs.onStatus((s) => s.error && toast(s.error));
- Linha 425: window.fbs.onDisplays(loadDisplays);
- Linha 492: playlist = await window.fbs.loadPlaylist();
- Linha 493: settings = { rules: [], loopPlaylist: true, ...(await window.fbs.loadSettings()) };
- Linha 498: loadDisplays(await window.fbs.listDisplays());

## Playlist e estado

- Linha 2: const queueEl = $("#queue");
- Linha 3: let playlist = [],
- Linha 4: settings = { rules: [], loopPlaylist: true },
- Linha 44: return settings.rules.find((r) => r.start <= now && now < r.end);
- Linha 71: queueEl.innerHTML = playlist.map(itemMarkup).join("");
- Linha 72: $("#empty").hidden = playlist.length > 0;
- Linha 74: `${playlist.length} ${playlist.length === 1 ? "item" : "itens"}`;
- Linha 110: const from = playlist.findIndex((x) => x.id === dragId),
- Linha 111: to = playlist.findIndex((x) => x.id === id);
- Linha 113: const [m] = playlist.splice(from, 1);
- Linha 114: playlist.splice(to, 0, m);
- Linha 128: playlist = playlist.filter((x) => x.id !== id);
- Linha 144: $("#fileCount").textContent = String(playlist.length);
- Linha 145: if (!playlist.length) {
- Linha 149: panel.innerHTML = playlist
- Linha 157: el.querySelector(".open-file").onclick = () => openPlaylistPath(id, "file");
- Linha 159: openPlaylistPath(id, "folder");
- Linha 162: async function openPlaylistPath(id, mode) {
- Linha 163: const item = playlist.find((x) => x.id === id);
- Linha 179: button.classList.toggle("active", !!settings.loopPlaylist);
- Linha 180: button.textContent = settings.loopPlaylist ? "Loop ligado" : "Loop desligado";
- Linha 181: button.title = settings.loopPlaylist
- Linha 183: : "Ao final, para a playlist";
- Linha 186: const from = playlist.findIndex((item) => item.id === id);
- Linha 188: if (from < 0 || to < 0 || to >= playlist.length) return;
- Linha 189: [playlist[from], playlist[to]] = [playlist[to], playlist[from]];
- Linha 194: const x = playlist.find((i) => i.id === id);
- Linha 203: await window.fbs.savePlaylist(playlist);
- Linha 204: await window.fbs.saveSettings(settings);
- Linha 212: playlist.push({
- Linha 234: const item = playlist.find((x) => x.id === id);
- Linha 248: if (!playlist.length) return toast("Adicione uma mídia à fila");
- Linha 249: take(currentId || playlist[0].id);
- Linha 260: if (!playlist.length) return;
- Linha 261: const i = playlist.findIndex((x) => x.id === currentId);
- Linha 263: playlist[(Math.max(0, i) + delta + playlist.length) % playlist.length].id,
- Linha 267: const i = playlist.findIndex((x) => x.id === currentId);
- Linha 268: if (i === playlist.length - 1 && !settings.loopPlaylist) {
- Linha 286: const item = playlist.find((x) => x.id === currentId);
- Linha 300: const item = playlist.find((x) => x.id === currentId),
- Linha 301: i = playlist.findIndex((x) => x.id === currentId);
- Linha 303: ? i < playlist.length - 1
- Linha 304: ? playlist[i + 1]
- Linha 305: : settings.loopPlaylist && playlist.length > 1
- Linha 306: ? playlist[0]
- Linha 308: : playlist[0];
- Linha 313: : playlist.length
- Linha 335: $("#rules").innerHTML = settings.rules
- Linha 344: settings.rules[i].start = e.target.value;
- Linha 348: settings.rules[i].end = e.target.value;
- Linha 352: settings.rules[i].transition = e.target.value;
- Linha 356: settings.rules.splice(i, 1);
- Linha 373: playlist = [];
- Linha 393: settings.loopPlaylist = !settings.loopPlaylist;
- Linha 401: settings.rules.push({ start: "19:00", end: "20:00", transition: "fade" });
- Linha 435: scheduled = playlist
- Linha 444: const live = playlist.find((x) => x.id === currentId);
- Linha 492: playlist = await window.fbs.loadPlaylist();
- Linha 493: settings = { rules: [], loopPlaylist: true, ...(await window.fbs.loadSettings()) };
- Linha 494: settings.rules ||= [];
- Linha 495: settings.loopPlaylist ??= true;

## Comandos de apresentacao

- Linha 3: let playlist = [],
- Linha 4: settings = { rules: [], loopPlaylist: true },
- Linha 7: paused = false,
- Linha 56: : state?.kind === "next"
- Linha 57: ? " schedule-next"
- Linha 68: return `<article class="item${cls}" draggable="true" data-id="${esc(item.id)}"><span class="handle" title="Arraste para reordenar">≡</span><div class="thumb">${media}</div><div class="meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.type === "video" ? "VÍDEO" : "IMAGEM"}</small>${state ? ...
- Linha 71: queueEl.innerHTML = playlist.map(itemMarkup).join("");
- Linha 72: $("#empty").hidden = playlist.length > 0;
- Linha 74: `${playlist.length} ${playlist.length === 1 ? "item" : "itens"}`;
- Linha 77: updateLoopButton();
- Linha 102: e.stopPropagation();
- Linha 109: e.stopPropagation();
- Linha 110: const from = playlist.findIndex((x) => x.id === dragId),
- Linha 111: to = playlist.findIndex((x) => x.id === id);
- Linha 113: const [m] = playlist.splice(from, 1);
- Linha 114: playlist.splice(to, 0, m);
- Linha 119: el.querySelector(".duration").onchange = (e) =>
- Linha 120: update(id, "duration", Math.max(0, Number(e.target.value)));
- Linha 128: playlist = playlist.filter((x) => x.id !== id);
- Linha 131: stop();
- Linha 144: $("#fileCount").textContent = String(playlist.length);
- Linha 145: if (!playlist.length) {
- Linha 149: panel.innerHTML = playlist
- Linha 157: el.querySelector(".open-file").onclick = () => openPlaylistPath(id, "file");
- Linha 159: openPlaylistPath(id, "folder");
- Linha 162: async function openPlaylistPath(id, mode) {
- Linha 163: const item = playlist.find((x) => x.id === id);
- Linha 176: function updateLoopButton() {
- Linha 177: const button = $("#loopBtn");
- Linha 179: button.classList.toggle("active", !!settings.loopPlaylist);
- Linha 180: button.textContent = settings.loopPlaylist ? "Loop ligado" : "Loop desligado";
- Linha 181: button.title = settings.loopPlaylist
- Linha 183: : "Ao final, para a playlist";
- Linha 186: const from = playlist.findIndex((item) => item.id === id);
- Linha 188: if (from < 0 || to < 0 || to >= playlist.length) return;
- Linha 189: [playlist[from], playlist[to]] = [playlist[to], playlist[from]];
- Linha 194: const x = playlist.find((i) => i.id === id);
- Linha 196: if (id === currentId && key === "duration")
- Linha 203: await window.fbs.savePlaylist(playlist);
- Linha 212: playlist.push({
- Linha 217: duration: 10,
- Linha 234: const item = playlist.find((x) => x.id === id);
- Linha 239: paused = false;
- Linha 248: if (!playlist.length) return toast("Adicione uma mídia à fila");
- Linha 249: take(currentId || playlist[0].id);
- Linha 251: function stop() {
- Linha 253: paused = false;
- Linha 256: window.fbs.command({ action: "logo" });
- Linha 259: function next(delta = 1) {
- Linha 260: if (!playlist.length) return;
- Linha 261: const i = playlist.findIndex((x) => x.id === currentId);
- Linha 263: playlist[(Math.max(0, i) + delta + playlist.length) % playlist.length].id,
- Linha 266: function autoNext() {
- Linha 267: const i = playlist.findIndex((x) => x.id === currentId);
- Linha 268: if (i === playlist.length - 1 && !settings.loopPlaylist) {
- Linha 270: stop();
- Linha 273: next();
- Linha 277: paused = !paused;
- Linha 278: window.fbs.command({ action: paused ? "pause" : "resume" });
- Linha 284: if (!running || paused) return;
- Linha 286: const item = playlist.find((x) => x.id === currentId);
- Linha 287: if (!item) return autoNext();
- Linha 288: if (item.duration > 0 && elapsed >= item.duration) {
- Linha 290: elapsed = item.duration;
- Linha 294: autoNext();
- Linha 300: const item = playlist.find((x) => x.id === currentId),
- Linha 301: i = playlist.findIndex((x) => x.id === currentId);
- Linha 302: const nextItem = item
- Linha 303: ? i < playlist.length - 1
- Linha 304: ? playlist[i + 1]
- Linha 305: : settings.loopPlaylist && playlist.length > 1
- Linha 306: ? playlist[0]
- Linha 308: : playlist[0];
- Linha 310: $("#nextName").textContent =
- Linha 311: nextItem && nextItem.id !== item?.id
- Linha 312: ? nextItem.name
- Linha 313: : playlist.length
- Linha 317: $("#remaining").textContent = fmt((item?.duration || 0) - elapsed);
- Linha 318: $("#progress").style.width = item?.duration
- Linha 319: ? `${Math.min(100, (elapsed / item.duration) * 100)}%`
- Linha 321: $("#playState").textContent = !running
- Linha 323: : paused
- Linha 326: $("#pauseBtn").textContent = running && !paused ? "Ⅱ" : "▶";
- Linha 330: ? `<video muted autoplay loop src="${url(item.path)}"></video>`
- Linha 362: async function loadDisplays(list) {
- Linha 363: const select = $("#displaySelect"),
- Linha 373: playlist = [];
- Linha 374: stop();
- Linha 379: $("#prevBtn").onclick = () => next(-1);
- Linha 380: $("#nextBtn").onclick = () => next(1);
- Linha 381: $("#pauseBtn").onclick = toggle;
- Linha 392: $("#loopBtn").onclick = () => {
- Linha 393: settings.loopPlaylist = !settings.loopPlaylist;
- Linha 394: updateLoopButton();
- Linha 398: $("#blackoutBtn").onclick = () => window.fbs.command({ action: "blackout" });
- Linha 399: $("#logoBtn").onclick = () => window.fbs.command({ action: "logo" });
- Linha 405: $("#displaySelect").onchange = (e) => window.fbs.selectDisplay(e.target.value);
- Linha 425: window.fbs.onDisplays(loadDisplays);
- Linha 435: scheduled = playlist
- Linha 444: const live = playlist.find((x) => x.id === currentId);
- Linha 455: kind: "next",
- Linha 459: scheduleState.set(x.item.id, { kind: "next", text: "→ DEPOIS" });
- Linha 474: el.classList.remove("scheduled-soon", "live", "schedule-next");
- Linha 482: : "schedule-next",
- Linha 492: playlist = await window.fbs.loadPlaylist();
- Linha 493: settings = { rules: [], loopPlaylist: true, ...(await window.fbs.loadSettings()) };
- Linha 495: settings.loopPlaylist ??= true;
- Linha 498: loadDisplays(await window.fbs.listDisplays());

## Arquivos e midia

- Linha 14: const extType = (p) => (/\.(mp4|webm)$/i.test(p) ? "video" : "image");
- Linha 31: return `file:///${encoded}`.replace("file:////", "file:///");
- Linha 59: const media =
- Linha 60: item.type === "video"
- Linha 61: ? `<video muted src="${url(item.path)}"></video>`
- Linha 68: return `<article class="item${cls}" draggable="true" data-id="${esc(item.id)}"><span class="handle" title="Arraste para reordenar">≡</span><div class="thumb">${media}</div><div class="meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.type === "video" ? "VÍDEO" : "IMAGEM"}</small>${state ? ...
- Linha 76: renderFilePanel();
- Linha 92: e.dataTransfer.setDragImage?.(el, 24, 24);
- Linha 141: function renderFilePanel() {
- Linha 142: const panel = $("#filePanel");
- Linha 144: $("#fileCount").textContent = String(playlist.length);
- Linha 146: panel.innerHTML = '<p class="file-empty">Nenhum arquivo na fila.</p>';
- Linha 152: `<div class="file-row" data-id="${esc(item.id)}"><div><strong title="${esc(item.name)}">${esc(item.name)}</strong><small title="${esc(item.path)}">${esc(item.path)}</small></div><div class="file-actions"><button class="open-file" title="Abrir arquivo">Abrir</button><button class="open-folder" title="Mostrar na pasta">P...
- Linha 155: panel.querySelectorAll(".file-row").forEach((el) => {
- Linha 157: el.querySelector(".open-file").onclick = () => openPlaylistPath(id, "file");
- Linha 167: mode === "file"
- Linha 168: ? await window.fbs.openFile(item.path)
- Linha 171: toast(mode === "file" ? "Abrindo arquivo" : "Abrindo pasta");
- Linha 207: async function addFiles(paths) {
- Linha 210: const valid = await window.fbs.validateFiles(requested);
- Linha 231: addFiles(await window.fbs.chooseFiles());
- Linha 329: ? item.type === "video"
- Linha 330: ? `<video muted autoplay loop src="${url(item.path)}"></video>`
- Linha 407: if (dragId || ![...e.dataTransfer.types].includes("Files")) return;
- Linha 415: if (dragId || ![...e.dataTransfer.types].includes("Files")) return;
- Linha 418: const paths = window.fbs.filePaths
- Linha 419: ? window.fbs.filePaths(e.dataTransfer.files)
- Linha 420: : [...e.dataTransfer.files].map((f) => f.path).filter(Boolean);
- Linha 422: addFiles(paths);

## Compatibilidade touch e mobile

- O renderer utiliza drag and drop. O comportamento precisa ser validado e possivelmente adaptado para toque.
- Nenhum evento touch ou pointer explícito foi localizado; compatibilidade mobile permanece pendente.
- A interface depende de bridge Electron e precisará de adapter para Capacitor ou comunicação com o desktop.

## Estado

- O renderer selecionado não foi alterado.
- Nenhum arquivo de código foi alterado.
- Nenhuma dependência foi instalada.
- Compatibilidade mobile definitiva: NAO CONFIRMADA.
