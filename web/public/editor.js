'use strict';

// Editor de avisos: monta uma imagem 1920x1080 com título, mensagem, rodapé e emojis, baixa em PNG/JPG
// ou envia para a biblioteca do espaço e mostra numa tela (cria a sessão do aviso e assume a tela).
const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
const EMOJIS = ['📢', '🙏', '❤️', '✝️', '🎉', '✨', '🎵', '📅', '⏰', '📍', '👋', '🙌', '🔥', '⭐', '☕', '⚠️'];
const THEMES = [
  { id: 'night', label: 'Noite', paint: ['#121210', '#2a2820'], text: '#f5f4ed', accent: '#e7ad3c' },
  { id: 'amber', label: 'Âmbar', paint: ['#e7ad3c', '#c9761d'], text: '#16130b', accent: '#16130b' },
  { id: 'ocean', label: 'Oceano', paint: ['#0f3d5c', '#0a6b78'], text: '#ffffff', accent: '#9ee6ee' },
  { id: 'forest', label: 'Verde', paint: ['#183d27', '#2f6b3f'], text: '#ffffff', accent: '#bfe8b5' },
  { id: 'wine', label: 'Vinho', paint: ['#4a1426', '#8a2c3c'], text: '#ffffff', accent: '#ffc9a8' },
  { id: 'royal', label: 'Roxo', paint: ['#2b1857', '#5b2f8f'], text: '#ffffff', accent: '#e3c6ff' },
  { id: 'paper', label: 'Claro', paint: ['#f7f3ea', '#e8e0cf'], text: '#1d1b16', accent: '#a1611a' },
];
let theme = THEMES[0];
let align = 'center';
let photo = null;
let lastField = $('message');
let csrf = '';
let state = null;
let busy = false;
let noticeTimer;

function announce(message, error = false) {
  const node = $('notice');
  node.dataset.kind = error ? 'error' : 'info';
  node.textContent = message;
  node.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { node.hidden = true; }, error ? 7000 : 4000);
}

// ---------------------------------------------------------------- desenho
function wrap(text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function draw() {
  const scale = Number($('scale').value) / 100;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (photo) {
    const ratio = Math.max(W / photo.width, H / photo.height);
    const w = photo.width * ratio;
    const h = photo.height * ratio;
    ctx.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, .55)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, theme.paint[0]);
    gradient.addColorStop(1, theme.paint[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }
  const text = photo ? '#ffffff' : theme.text;
  const accent = photo ? '#e7ad3c' : theme.accent;
  const margin = 150;
  const width = W - margin * 2;
  const x = align === 'center' ? W / 2 : margin;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';

  const blocks = [];
  const title = $('title').value.trim();
  const message = $('message').value.trim();
  const footer = $('footer').value.trim();
  if (title) {
    ctx.font = `800 ${Math.round(112 * scale)}px ${FONT}`;
    blocks.push({ font: ctx.font, color: text, size: 112 * scale, lines: wrap(title, width), gap: 46 * scale });
  }
  if (message) {
    ctx.font = `500 ${Math.round(64 * scale)}px ${FONT}`;
    blocks.push({ font: ctx.font, color: text, size: 64 * scale, lines: wrap(message, width), gap: 40 * scale, line: 1.32 });
  }
  if (footer) {
    ctx.font = `700 ${Math.round(44 * scale)}px ${FONT}`;
    blocks.push({ font: ctx.font, color: accent, size: 44 * scale, lines: wrap(footer, width), gap: 0, rule: true });
  }
  let total = 0;
  for (const block of blocks) total += block.lines.length * block.size * (block.line || 1.18) + block.gap + (block.rule ? 40 * scale : 0);
  let y = Math.max(90, (H - total) / 2);
  for (const block of blocks) {
    if (block.rule) {
      ctx.fillStyle = accent;
      const ruleWidth = 140 * scale;
      ctx.fillRect(align === 'center' ? W / 2 - ruleWidth / 2 : margin, y, ruleWidth, 8 * scale);
      y += 40 * scale;
    }
    ctx.font = block.font;
    ctx.fillStyle = block.color;
    for (const line of block.lines) {
      y += block.size * (block.line || 1.18);
      ctx.fillText(line, x, y - block.size * 0.22, width);
    }
    y += block.gap;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- controles
function buildControls() {
  for (const emoji of EMOJIS) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'emoji';
    node.textContent = emoji;
    node.setAttribute('aria-label', 'Inserir ' + emoji);
    node.addEventListener('click', () => insertEmoji(emoji));
    $('emojis').append(node);
  }
  for (const item of THEMES) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'swatch';
    node.setAttribute('role', 'radio');
    node.setAttribute('aria-label', item.label);
    node.dataset.testid = 'theme-' + item.id;
    node.style.background = `linear-gradient(135deg, ${item.paint[0]}, ${item.paint[1]})`;
    node.addEventListener('click', () => { theme = item; photo = null; $('clear-background').hidden = true; syncThemes(); draw(); });
    $('themes').append(node);
  }
  syncThemes();
  for (const id of ['title', 'message', 'footer']) {
    $(id).addEventListener('input', draw);
    $(id).addEventListener('focus', () => { lastField = $(id); });
  }
  $('scale').addEventListener('input', draw);
  for (const node of document.querySelectorAll('[data-align]')) {
    node.addEventListener('click', () => {
      align = node.dataset.align;
      for (const other of document.querySelectorAll('[data-align]')) other.setAttribute('aria-pressed', String(other === node));
      draw();
    });
  }
  $('background-file').addEventListener('change', () => {
    const file = $('background-file').files[0];
    $('background-file').value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { photo = image; $('clear-background').hidden = false; syncThemes(); draw(); };
    image.onerror = () => announce('Não foi possível abrir essa imagem.', true);
    image.src = url;
  });
  $('clear-background').addEventListener('click', () => { photo = null; $('clear-background').hidden = true; syncThemes(); draw(); });
  $('download-png').addEventListener('click', () => download('image/png', 'png'));
  $('download-jpg').addEventListener('click', () => download('image/jpeg', 'jpg'));
  $('send-library').addEventListener('click', () => send(false));
  $('send-show').addEventListener('click', () => send(true));
  $('space').addEventListener('change', () => { remember($('space').value); loadState($('space').value); });
}

function syncThemes() {
  for (const node of $('themes').children) node.setAttribute('aria-checked', String(!photo && node.dataset.testid === 'theme-' + theme.id));
}

function insertEmoji(emoji) {
  const field = lastField;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  if (field.maxLength > 0 && field.value.length + emoji.length > field.maxLength) return;
  field.value = field.value.slice(0, start) + emoji + field.value.slice(end);
  const caret = start + emoji.length;
  field.setSelectionRange?.(caret, caret);
  draw();
}

function fileName(extension) {
  const base = ($('title').value.trim() || 'aviso').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40) || 'aviso';
  return base + '.' + extension;
}

function blob(mime) {
  draw();
  return new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao gerar a imagem.')), mime, 0.92));
}

async function download(mime, extension) {
  const file = await blob(mime);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = fileName(extension);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// ---------------------------------------------------------------- envio para a Central
async function api(path, method = 'GET', body, headers = {}) {
  if (method !== 'GET' && csrf) headers['X-FBS-CSRF'] = csrf;
  if (body !== undefined && !(body instanceof Blob)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch('/api/v1' + path, { method, body, headers, credentials: 'same-origin', cache: 'no-store' });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || 'Falha na comunicação com a Central.');
  return value;
}

function recall() {
  try { return JSON.parse(localStorage.getItem('fbs-studio-space')) || ''; } catch { return ''; }
}

function remember(id) {
  try { localStorage.setItem('fbs-studio-space', JSON.stringify(id)); } catch { /* opcional */ }
}

function fill(select, options, value) {
  select.replaceChildren(...options.map(([id, label]) => new Option(label, id)));
  if (options.some(([id]) => id === value)) select.value = value;
}

async function loadState(spaceId) {
  state = await api('/state' + (spaceId ? '?spaceId=' + encodeURIComponent(spaceId) : ''));
  fill($('space'), state.spaces.map((space) => [space.id, space.name]), state.spaceId);
  const screens = state.screens.map((screen) => [screen.id, screen.name + (screen.online ? '' : ' (desconectada)')]);
  fill($('screen'), screens.length ? screens : [['', 'Nenhuma tela neste espaço']], $('screen').value);
  $('send-show').disabled = !screens.length;
  $('send-library').disabled = !state.spaceId;
}

async function upload(file, name) {
  const created = await api('/uploads', 'POST', { spaceId: state.spaceId, name, size: file.size, mime: file.type });
  let offset = created.offset;
  while (offset < file.size) {
    const end = Math.min(offset + created.chunkSize, file.size);
    const result = await api('/uploads/' + created.id, 'PATCH', file.slice(offset, end), { 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(offset) });
    offset = result.offset;
    $('progress').textContent = 'Enviando… ' + Math.floor(100 * offset / file.size) + '%';
  }
  return api('/uploads/' + created.id + '/complete', 'POST', {});
}

async function send(show) {
  if (busy || !state?.spaceId) return;
  const screenId = $('screen').value;
  if (show && !screenId) return announce('Escolha uma tela.', true);
  const seconds = Math.min(3600, Math.max(3, Math.round(Number($('seconds').value) || 15)));
  busy = true;
  for (const id of ['send-show', 'send-library']) $(id).disabled = true;
  try {
    const mime = photo ? 'image/jpeg' : 'image/png';
    const file = await blob(mime);
    const title = $('title').value.trim() || 'Aviso';
    const media = await upload(file, fileName(photo ? 'jpg' : 'png'));
    if (!show) {
      $('progress').textContent = 'Salvo na biblioteca como "' + media.name + '".';
      announce('Aviso salvo na biblioteca.');
      return;
    }
    $('progress').textContent = 'Criando a sessão do aviso…';
    const created = await api('/playlists', 'POST', { spaceId: state.spaceId, name: ('Aviso · ' + title).slice(0, 80) });
    const playlist = await api('/playlists/' + created.id, 'PUT', { version: created.version, items: [{ mediaId: media.id, durationMs: seconds * 1000 }], loop: true });
    const commandId = window.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    await api('/screens/' + screenId + '/commands', 'POST', { commandId, action: 'take', playlistId: playlist.id });
    const screen = state.screens.find((item) => item.id === screenId);
    $('progress').textContent = 'No ar em "' + (screen ? screen.name : 'tela') + '". Para voltar à programação, use Liberar no painel.';
    announce('Aviso no ar.');
    await loadState(state.spaceId);
  } catch (error) {
    $('progress').textContent = '';
    announce(error.message || 'Não foi possível enviar o aviso.', true);
  } finally {
    busy = false;
    $('send-library').disabled = !state?.spaceId;
    $('send-show').disabled = !state?.screens.length;
  }
}

async function start() {
  buildControls();
  if (document.fonts?.ready) document.fonts.ready.then(draw);
  draw();
  try {
    const me = await api('/me');
    if (!me.authenticated) { $('login-hint').hidden = false; return; }
    csrf = me.csrf;
    $('send-area').hidden = false;
    await loadState(recall());
  } catch (error) {
    $('login-hint').hidden = false;
  }
}

document.addEventListener('gesturestart', (event) => event.preventDefault());
start();
