const $ = (s) => document.querySelector(s);
const queueEl = $("#queue");
let playlist = [],
  settings = { rules: [], loopPlaylist: true },
  currentId = null,
  running = false,
  paused = false,
  locked = false,
  elapsed = 0,
  timer = null,
  dragId = null,
  scheduleKey = "",
  scheduleState = new Map();
const extType = (p) => (/\.(mp4|webm)$/i.test(p) ? "video" : "image");
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const url = (p) => {
  const normalized = String(p || "").replace(/\\/g, "/");
  const encoded = normalized
    .split("/")
    .map((part, index) =>
      index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part),
    )
    .join("/");
  return `file:///${encoded}`.replace("file:////", "file:///");
};
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
let initialized = false, publicationPending = false, outputBlocked = false, surface = "logo", previewKey;
function publish() {
  if (!initialized || publicationPending || !window.fbs.publishState) return;
  publicationPending = true;
  queueMicrotask(() => {
    publicationPending = false;
    window.fbs.publishState({ playlist, rules: settings.rules, loop: settings.loopPlaylist,
      currentId, running, paused, locked, elapsed });
  });
}
function command(action, item) {
  if (action === "show") previewKey = undefined;
  if (["show", "blackout", "logo"].includes(action)) surface = action;
  window.fbs.command(item ? { action, item } : { action });
  publish();
}
const fmt = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.max(0, Math.floor(n % 60))).padStart(2, "0")}`;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function activeRule() {
  const now = new Date().toTimeString().slice(0, 5);
  return settings.rules.find((r) => r.start <= now && now < r.end);
}
function transitionFor(item) {
  return item.transition || activeRule()?.transition || "fade";
}
function itemMarkup(item) {
  const state = scheduleState.get(item.id);
  const cls =
    state?.kind === "soon"
      ? " scheduled-soon"
      : state?.kind === "live"
        ? " live"
        : state?.kind === "next"
          ? " schedule-next"
          : "";
  const media =
    item.type === "video"
      ? `<video muted src="${url(item.path)}"></video>`
      : `<img src="${url(item.path)}">`;
  const transitions = ["cut", "fade", "slide-left", "slide-up", "zoom"]
    .map(
      (x) => `<option ${item.transition === x ? "selected" : ""}>${x}</option>`,
    )
    .join("");
  return `<article class="item${cls}" draggable="true" data-id="${esc(item.id)}"><span class="handle" title="Arraste para reordenar">≡</span><div class="thumb">${media}</div><div class="meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.type === "video" ? "VÍDEO" : "IMAGEM"}</small>${state ? `<span class="schedule-badge">${esc(state.text)}</span>` : ""}</div><div class="field"><label>DURAÇÃO</label><input class="duration" type="number" min="0" value="${item.duration ?? 10}"></div><div class="field"><label>TRANSIÇÃO</label><select class="transition"><option value="">Automática</option>${transitions}</select></div><div class="field schedule"><label>HORÁRIO</label><input class="startAt" type="time" step="1" value="${esc(item.startAt || "")}"></div><div class="row-actions"><button class="move-up" title="Subir">↑</button><button class="move-down" title="Descer">↓</button><button class="delete" title="Remover">×</button></div></article>`;
}
function render() {
  queueEl.innerHTML = playlist.map(itemMarkup).join("");
  $("#empty").hidden = playlist.length > 0;
  $("#count").textContent =
    `${playlist.length} ${playlist.length === 1 ? "item" : "itens"}`;
  bindItems();
  renderFilePanel();
  updateLoopButton();
  updateStatus();
}
function bindItems() {
  document.querySelectorAll(".item").forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener("dragstart", (e) => {
      if (e.target.closest("input,select,button")) {
        e.preventDefault();
        return;
      }
      dragId = id;
      e.dataTransfer.setData("application/x-fbs-item", id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.dropEffect = "move";
      e.dataTransfer.setDragImage?.(el, 24, 24);
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      el.classList.remove("dragging");
    });
    el.addEventListener("dragover", (e) => {
      if (dragId) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }
    });
    el.addEventListener("drop", (e) => {
      if (!dragId) return;
      e.preventDefault();
      e.stopPropagation();
      const from = playlist.findIndex((x) => x.id === dragId),
        to = playlist.findIndex((x) => x.id === id);
      if (from < 0 || to < 0 || from === to) return;
      const [m] = playlist.splice(from, 1);
      playlist.splice(to, 0, m);
      dragId = null;
      render();
      save();
    });
    el.querySelector(".duration").onchange = (e) =>
      update(id, "duration", Math.max(0, Number(e.target.value)));
    el.querySelector(".transition").onchange = (e) =>
      update(id, "transition", e.target.value);
    el.querySelector(".startAt").onchange = (e) =>
      update(id, "startAt", e.target.value);
    el.querySelector(".move-up").onclick = () => moveItem(id, -1);
    el.querySelector(".move-down").onclick = () => moveItem(id, 1);
    el.querySelector(".delete").onclick = () => {
      playlist = playlist.filter((x) => x.id !== id);
      if (currentId === id) {
        currentId = null;
        stop();
      }
      render();
      save();
    };
    el.ondblclick = (e) => {
      if (!e.target.closest("input,select,button")) take(id);
    };
  });
}
function renderFilePanel() {
  const panel = $("#filePanel");
  if (!panel) return;
  $("#fileCount").textContent = String(playlist.length);
  if (!playlist.length) {
    panel.innerHTML = '<p class="file-empty">Nenhum arquivo na fila.</p>';
    return;
  }
  panel.innerHTML = playlist
    .map(
      (item) =>
        `<div class="file-row" data-id="${esc(item.id)}"><div><strong title="${esc(item.name)}">${esc(item.name)}</strong><small title="${esc(item.path)}">${esc(item.path)}</small></div><div class="file-actions"><button class="open-file" title="Abrir arquivo">Abrir</button><button class="open-folder" title="Mostrar na pasta">Pasta</button></div></div>`,
    )
    .join("");
  panel.querySelectorAll(".file-row").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector(".open-file").onclick = () => openPlaylistPath(id, "file");
    el.querySelector(".open-folder").onclick = () =>
      openPlaylistPath(id, "folder");
  });
}
async function openPlaylistPath(id, mode) {
  const item = playlist.find((x) => x.id === id);
  if (!item) return toast("Arquivo nao encontrado na fila");
  try {
    const result =
      mode === "file"
        ? await window.fbs.openFile(item.path)
        : await window.fbs.showInFolder(item.path);
    if (!result?.ok) return toast(result?.error || "Nao foi possivel abrir");
    toast(mode === "file" ? "Abrindo arquivo" : "Abrindo pasta");
  } catch (error) {
    toast(`Erro ao abrir: ${error.message}`);
  }
}
function updateLoopButton() {
  const button = $("#loopBtn");
  if (!button) return;
  button.classList.toggle("active", !!settings.loopPlaylist);
  button.textContent = settings.loopPlaylist ? "Loop ligado" : "Loop desligado";
  button.title = settings.loopPlaylist
    ? "Ao final, volta para o primeiro item"
    : "Ao final, para a playlist";
}
function moveItem(id, direction) {
  const from = playlist.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= playlist.length) return;
  [playlist[from], playlist[to]] = [playlist[to], playlist[from]];
  render();
  save();
}
function update(id, key, value) {
  const x = playlist.find((i) => i.id === id);
  if (x) x[key] = value;
  if (id === currentId && key === "duration")
    elapsed = Math.min(elapsed, value);
  save();
  updateStatus();
}
async function save() {
  publish();
  $("#saveState").textContent = "Salvando…";
  await window.fbs.savePlaylist(playlist);
  await window.fbs.saveSettings(settings);
  $("#saveState").textContent = "Salvo";
}
async function addFiles(paths, displayName) {
  const requested = Array.from(paths || []).filter(Boolean);
  if (!requested.length) return;
  const valid = await window.fbs.validateFiles(requested);
  valid.forEach((path) =>
    playlist.push({
      id: uid(),
      path,
      name: displayName || path.split(/[\\/]/).pop(),
      type: extType(path),
      duration: 10,
      transition: "",
      fit: "contain",
      startAt: "",
    }),
  );
  if (!valid.length) toast("Nenhum arquivo compativel foi encontrado");
  else if (valid.length !== requested.length)
    toast("Alguns arquivos não são compatíveis");
  if (!valid.length) return;
  render();
  await save();
}
async function choose() {
  addFiles(await window.fbs.chooseFiles());
}
function take(id) {
  const item = playlist.find((x) => x.id === id);
  if (!item) return;
  currentId = id;
  elapsed = 0;
  running = true;
  paused = false;
  command("show", { ...item, transition: transitionFor(item) });
  startTimer();
  updateStatus();
}
function start() {
  if (!playlist.length) return toast("Adicione uma mídia à fila");
  take(currentId || playlist[0].id);
}
function stop() {
  running = false;
  paused = false;
  clearInterval(timer);
  timer = null;
  command("logo");
  updateStatus();
}
function next(delta = 1) {
  if (!playlist.length) return;
  const i = playlist.findIndex((x) => x.id === currentId);
  take(
    playlist[(Math.max(0, i) + delta + playlist.length) % playlist.length].id,
  );
}
function autoNext() {
  const i = playlist.findIndex((x) => x.id === currentId);
  if (i === playlist.length - 1 && !settings.loopPlaylist) {
    toast("Fim da fila");
    stop();
    return;
  }
  next();
}
function toggle() {
  if (!running) return start();
  paused = !paused;
  command(paused ? "pause" : "resume");
  updateStatus();
}
function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!running || paused || outputBlocked) return;
    elapsed += 0.25;
    const item = playlist.find((x) => x.id === currentId);
    if (!item) return autoNext();
    if (item.duration > 0 && elapsed >= item.duration) {
      if (locked) {
        elapsed = item.duration;
        updateStatus();
        return;
      }
      autoNext();
    }
    updateStatus();
  }, 250);
}
function updateStatus() {
  const item = playlist.find((x) => x.id === currentId),
    i = playlist.findIndex((x) => x.id === currentId);
  const nextItem = item
    ? i < playlist.length - 1
      ? playlist[i + 1]
      : settings.loopPlaylist && playlist.length > 1
        ? playlist[0]
        : null
    : playlist[0];
  $("#currentName").textContent = item?.name || "Nenhuma mídia";
  $("#nextName").textContent =
    nextItem && nextItem.id !== item?.id
      ? nextItem.name
      : playlist.length
        ? "Fim da fila"
        : "Fila vazia";
  $("#elapsed").textContent = fmt(elapsed);
  $("#remaining").textContent = fmt(Math.max(0, (item?.duration || 0) - elapsed));
  $("#progress").style.width = item?.duration
    ? `${Math.min(100, (elapsed / item.duration) * 100)}%`
    : "0";
  $("#playState").textContent = !running
    ? "PARADO"
    : paused
      ? "PAUSADO"
      : "RODANDO";
  $("#pauseBtn").textContent = running && !paused ? "Ⅱ" : "▶";
  const preview = $("#livePreview");
  const key = surface === "show" ? item?.id : surface;
  if (key !== previewKey) {
    previewKey = key;
    preview.innerHTML = surface === "show" && item
      ? item.type === "video" ? `<video muted autoplay loop src="${url(item.path)}"></video>` : `<img src="${url(item.path)}">`
      : surface === "logo" ? '<img class="brand-logo" src="logo-bs.png" alt="Logo">' : '';
  }
  if (surface === "blackout" || (surface === "logo" && running)) $("#currentName").textContent = surface === "blackout" ? "Blackout" : "Logo";
  const previewVideo = preview.querySelector("video");
  if (previewVideo && (paused || outputBlocked) && !previewVideo.paused) previewVideo.pause();
  if (previewVideo && !paused && !outputBlocked && previewVideo.paused && previewVideo.readyState >= 2) previewVideo.play().catch(() => {});
}
function renderRules() {
  $("#rules").innerHTML = settings.rules
    .map(
      (r, i) =>
        `<div class="rule" data-i="${i}"><input class="rs" type="time" value="${r.start}"><input class="re" type="time" value="${r.end}"><select class="rt">${["cut", "fade", "slide-left", "slide-up", "zoom"].map((x) => `<option ${r.transition === x ? "selected" : ""}>${x}</option>`).join("")}</select><button>×</button></div>`,
    )
    .join("");
  document.querySelectorAll(".rule").forEach((el) => {
    const i = +el.dataset.i;
    el.querySelector(".rs").onchange = (e) => {
      settings.rules[i].start = e.target.value;
      save();
    };
    el.querySelector(".re").onchange = (e) => {
      settings.rules[i].end = e.target.value;
      save();
    };
    el.querySelector(".rt").onchange = (e) => {
      settings.rules[i].transition = e.target.value;
      save();
    };
    el.querySelector("button").onclick = () => {
      settings.rules.splice(i, 1);
      renderRules();
      save();
    };
  });
}
async function loadDisplays(list) {
  const select = $("#displaySelect");
  select.replaceChildren(...list.map(d => new Option(d.label, d.id, false, !!d.selected)));
  if (outputBlocked) select.add(new Option("Aguardando a última tela", "", false, true), 0);
}
$("#addBtn").onclick = $("#emptyAdd").onclick = choose;
$("#clearBtn").onclick = () => {
  if (confirm("Remover todos os itens da fila?")) {
    playlist = [];
    currentId = null;
    stop();
    render();
    save();
  }
};
$("#prevBtn").onclick = () => next(-1);
$("#nextBtn").onclick = () => next(1);
$("#pauseBtn").onclick = toggle;
$("#lockBtn").onclick = () => {
  locked = !locked;
  publish();
  $("#lockBtn").classList.toggle("active", locked);
  $("#lockBtn").textContent = locked
    ? "◆ Item no ar bloqueado"
    : "◇ Bloquear item no ar";
  toast(
    locked ? "Trocas automáticas bloqueadas" : "Trocas automáticas liberadas",
  );
};
$("#loopBtn").onclick = () => {
  settings.loopPlaylist = !settings.loopPlaylist;
  updateLoopButton();
  updateStatus();
  save();
};
$("#blackoutBtn").onclick = () => { command("blackout"); updateStatus(); };
$("#logoBtn").onclick = () => { command("logo"); updateStatus(); };
$("#addRule").onclick = () => {
  settings.rules.push({ id: uid(), start: "19:00", end: "20:00", transition: "fade" });
  renderRules();
  save();
};
$("#displaySelect").onchange = (e) => window.fbs.selectDisplay(e.target.value);
document.addEventListener("dragover", (e) => {
  if (dragId || ![...e.dataTransfer.types].includes("Files")) return;
  e.preventDefault();
  $("#dropzone").hidden = false;
});
document.addEventListener("dragleave", (e) => {
  if (!dragId && !e.relatedTarget) $("#dropzone").hidden = true;
});
document.addEventListener("drop", (e) => {
  if (dragId || ![...e.dataTransfer.types].includes("Files")) return;
  e.preventDefault();
  $("#dropzone").hidden = true;
  const paths = window.fbs.filePaths
    ? window.fbs.filePaths(e.dataTransfer.files)
    : [...e.dataTransfer.files].map((f) => f.path).filter(Boolean);
  if (!paths.length) return toast("Nao foi possivel ler os arquivos arrastados");
  addFiles(paths);
});
window.fbs.onStatus((s) => s.error && toast(s.error));
window.fbs.onDisplays(loadDisplays);
function secondsUntil(time, now = new Date()) {
  if (!time) return Infinity;
  const p = time.split(":").map(Number),
    target = new Date(now);
  target.setHours(p[0], p[1], p[2] || 0, 0);
  return Math.ceil((target - now) / 1000);
}
function checkSchedule() {
  if (outputBlocked) return;
  const now = new Date(),
    scheduled = playlist
      .map((item, index) => ({
        item,
        index,
        left: secondsUntil(item.startAt, now),
      }))
      .filter((x) => Number.isFinite(x.left) && x.left >= 0)
      .sort((a, b) => a.left - b.left || a.index - b.index);
  scheduleState.clear();
  const live = playlist.find((x) => x.id === currentId);
  if (live?.startAt)
    scheduleState.set(live.id, { kind: "live", text: "NO AR" });
  scheduled.forEach((x, n) => {
    if (x.left <= 30)
      scheduleState.set(x.item.id, {
        kind: "soon",
        text: `ENTRA EM ${x.left}s`,
      });
    else if (n === 0)
      scheduleState.set(x.item.id, {
        kind: "next",
        text: "→ PRÓXIMO AGENDADO",
      });
    else if (n === 1)
      scheduleState.set(x.item.id, { kind: "next", text: "→ DEPOIS" });
  });
  const due = scheduled.find((x) => x.left === 0),
    key = due ? `${now.toDateString()}-${due.item.id}-${due.item.startAt}` : "";
  if (due && key !== scheduleKey) {
    scheduleKey = key;
    if (!locked) take(due.item.id);
    else
      toast(`${due.item.name} está agendado, mas o item no ar está bloqueado`);
  }
  applyScheduleState();
}
function applyScheduleState() {
  document.querySelectorAll(".item").forEach((el) => {
    const state = scheduleState.get(el.dataset.id);
    el.classList.remove("scheduled-soon", "live", "schedule-next");
    el.querySelector(".schedule-badge")?.remove();
    if (!state) return;
    el.classList.add(
      state.kind === "soon"
        ? "scheduled-soon"
        : state.kind === "live"
          ? "live"
          : "schedule-next",
    );
    const badge = document.createElement("span");
    badge.className = "schedule-badge";
    badge.textContent = state.text;
    el.querySelector(".meta").appendChild(badge);
  });
}
setInterval(checkSchedule, 1000);
(async () => {
  playlist = await window.fbs.loadPlaylist();
  settings = { rules: [], loopPlaylist: true, ...(await window.fbs.loadSettings()) };
  settings.rules ||= [];
  settings.rules.forEach(rule => { rule.id ||= uid(); });
  settings.loopPlaylist ??= true;
  initialized = true;
  render();
  renderRules();
  loadDisplays(await window.fbs.listDisplays());
  publish();
})().catch((e) => toast(`Erro ao iniciar: ${e.message}`));
