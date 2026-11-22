'use strict';

const $ = (id) => document.getElementById(id);
const graph = $('graph');
const scroll = $('graph-scroll');
const ns = 'http://www.w3.org/2000/svg';
const nodes = new Map();
const drafts = new Map();
const pendingAdds = new Set();
const uploads = [];
const savedUploads = 'fbs-studio-uploads';
const defaultUploadMime = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm'
};
const pairCode = (/^[0-9]{6}$/.exec(new URLSearchParams(location.hash.slice(1)).get('pair') || '') || [])[0] || '';
const statusNames = {
  waiting: 'Aguardando sinal', syncing: 'Enviado · carregando', ready: 'Pronta',
  playing: 'Reproduzindo', paused: 'Pausada', blackout: 'Tela preta',
  logo: 'Logotipo', idle: 'Sem fonte', error: 'Falha na reprodução'
};
let csrf = '';
let state;
let spaceId = recall('fbs-studio-space', '');
let selected = null;
let outputPort = null;
let gesture = null;
let suppress = null;
let polling = false;
let editing = 0;
let writeEpoch = 0;
let authenticated = false;
let inspectorKey = '';
let mediaKey = '';
let pairKey = '';
let draft = null;
let sampleAt = 0;
let action = null;
let notifyTimeout;
let uploading = false;

function recall(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* The current operation can continue without local storage. */ }
}

function element(tag, className, label) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (label !== undefined) node.textContent = label;
  return node;
}

function button(label, handler, options = {}) {
  const node = element('button', options.className, label);
  node.type = 'button';
  if (options.test) node.dataset.testid = options.test;
  if (options.title) node.setAttribute('aria-label', options.title);
  if (options.disabled) node.disabled = true;
  node.addEventListener('click', handler);
  return node;
}

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function formField(tag, label, id) {
  const wrapper = element('div', 'stack');
  const field = element(tag);
  field.id = id;
  const caption = element('label', '', label);
  caption.htmlFor = id;
  wrapper.append(caption, field);
  return { wrapper, field };
}

function announce(message, error = false) {
  $('notice').dataset.kind = error ? 'error' : 'info';
  setText($('notice'), message);
  $('notice').hidden = false;
  clearTimeout(notifyTimeout);
  notifyTimeout = setTimeout(() => { $('notice').hidden = true; }, error ? 7000 : 4000);
}

function connection(status) {
  const node = $('connection');
  node.dataset.state = status;
  setText(node, { connecting: 'Conectando', online: 'Conectado', offline: 'Sem conexão' }[status]);
}

async function api(path, method = 'GET', body, headers = {}) {
  if (method !== 'GET' && csrf) headers['X-FBS-CSRF'] = csrf;
  if (body !== undefined && !(body instanceof Blob)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch('/api/v1' + path, {
    method, body, headers, credentials: 'same-origin', cache: 'no-store',
    signal: AbortSignal.timeout(body instanceof Blob ? 90000 : 15000)
  });
  const value = await response.json();
  if (!response.ok) {
    const error = new Error(value.error || 'Falha na comunicação com o estúdio.');
    error.status = response.status;
    error.value = value;
    if (response.status === 401 && authenticated) showLogin('Sua sessão expirou. Entre novamente.');
    throw error;
  }
  return value;
}

function showLogin(message = '') {
  authenticated = false;
  csrf = '';
  $('studio').hidden = true;
  $('masthead-controls').hidden = true;
  $('login-view').hidden = false;
  if ($('action-dialog').open) $('action-dialog').close();
  setText($('login-error'), message);
}

function showStudio(token) {
  authenticated = true;
  csrf = token;
  $('login-view').hidden = true;
  $('studio').hidden = false;
  $('masthead-controls').hidden = false;
  if (pairCode) switchTab('pair');
  refresh();
  processUploads();
}

async function refresh() {
  if (!authenticated || polling || editing) return;
  polling = true;
  const requested = spaceId;
  const started = performance.now();
  const startedEpoch = writeEpoch;
  try {
    const snapshot = await api('/state' + (requested ? '?spaceId=' + encodeURIComponent(requested) : ''));
    if (!authenticated || editing || requested !== spaceId || startedEpoch !== writeEpoch) return;
    state = snapshot;
    sampleAt = (performance.now() + started) / 2;
    csrf = snapshot.csrf || csrf;
    spaceId = snapshot.spaceId || '';
    persist('fbs-studio-space', spaceId);
    render();
    connection('online');
  } catch (error) {
    if (error.status === 404 && requested === spaceId) {
      spaceId = '';
      persist('fbs-studio-space', '');
    }
    connection('offline');
  } finally {
    polling = false;
    if ((requested !== spaceId || startedEpoch !== writeEpoch) && authenticated) refresh();
  }
}

async function mutate(work, done) {
  editing++;
  writeEpoch++;
  try {
    const value = await work();
    if (done) done(value);
    return true;
  } catch (error) {
    announce(error.message || 'A operação falhou. Tente novamente.', true);
    return false;
  } finally {
    editing--;
    refresh();
  }
}

function switchTab(tab) {
  for (const id of ['inspect', 'library', 'pair']) {
    $(id).hidden = id !== tab;
    $('tab-' + id).setAttribute('aria-pressed', String(id === tab));
  }
}

function choose(kind, id) {
  if (selected?.id !== id) {
    draft = null;
    selected = id ? { kind, id } : null;
    inspectorKey = '';
  }
  switchTab('inspect');
  renderNodes();
  renderInspector();
  updateTransport();
}

function lastSpace() {
  return Boolean(state && state.spaceId && state.spaceId === spaceId);
}

function render() {
  if (!lastSpace() && spaceId) return;
  const options = state.spaces.map((space) => [space.id, space.name]);
  if (!options.length) options.push(['', 'Nenhum espaço']);
  selectOptions($('workspace'), options, spaceId);
  $('workspace').disabled = !state.spaces.length;
  $('new-playlist').disabled = !spaceId;
  const online = state.screens.filter((screen) => screen.online).length;
  setText($('space-summary'), spaceId ? online + ' de ' + state.screens.length + ' telas conectadas' : '');
  setText($('graph-count'), state.playlists.length + ' sessões · ' + state.screens.length + ' telas');
  renderNodes();
  renderInspector();
  renderMedia();
  renderPairings();
  renderUploads();
  updateTransport();
}

function selectOptions(select, options, value) {
  const key = JSON.stringify(options);
  if (select.dataset.options !== key) {
    select.dataset.options = key;
    select.replaceChildren(...options.map(([id, name]) => new Option(name, id)));
  }
  if (select.value !== value) select.value = value;
}

function listFor(kind) {
  return (kind === 'playlist' ? state?.playlists : state?.screens) || [];
}

function get(kind, id) {
  return listFor(kind).find((item) => item.id === id);
}

function openDialog({ title, label = 'Nome', submit = 'Salvar', name = '', copy = '', perform, done }) {
  action = { perform, done };
  setText($('dialog-title'), title);
  setText($('dialog-label'), label);
  setText($('dialog-submit'), submit);
  setText($('dialog-copy'), copy);
  $('dialog-copy').hidden = !copy;
  $('dialog-error').hidden = true;
  $('create-name').value = name;
  $('action-dialog').showModal();
  $('create-name').focus();
  $('create-name').select();
}

function createNode(kind) {
  const isSpace = kind === 'space';
  openDialog({
    title: isSpace ? 'Novo espaço' : 'Nova sessão',
    label: isSpace ? 'Nome do espaço' : 'Nome da sessão',
    submit: 'Criar',
    perform: (name) => isSpace ? api('/spaces', 'POST', { name }) : api('/playlists', 'POST', { spaceId, name }),
    done: (created) => {
      if (isSpace) {
        spaceId = created.id;
        persist('fbs-studio-space', created.id);
        selected = null;
        draft = null;
        outputPort = null;
      } else {
        selected = { kind: 'playlist', id: created.id };
        draft = null;
        switchTab('inspect');
      }
    }
  });
}

function labelForScreen(screen) {
  if (!screen.online) return 'Desconectada';
  return statusNames[screen.status] || 'Conectada';
}

function addGraphNode(kind, id) {
  const card = element('div', 'node');
  card.dataset.kind = kind;
  card.dataset.id = id;
  card.dataset.testid = kind + '-node';
  const title = element('strong', 'node-title');
  const meta = element('span', 'node-meta');
  const info = button('', (event) => {
    if (!consumeClick(info, event)) choose(kind, id);
  }, { className: 'node-info', test: 'node-select' });
  info.append(title, meta);
  info.addEventListener('pointerdown', (event) => beginGesture(event, kind, id, 'node'));
  card.append(info);
  const output = button('', (event) => {
    if (!consumeClick(output, event)) setOutput(outputPort?.id === id ? null : { kind, id });
  }, { className: 'port port-out', test: 'source-port' });
  output.addEventListener('pointerdown', (event) => beginGesture(event, kind, id, 'wire'));
  card.append(output);
  let input;
  if (kind === 'screen') {
    input = button('', () => {
      if (outputPort) connect(id, outputPort);
      else choose(kind, id);
    }, { className: 'port port-in', test: 'target-port' });
    card.append(input);
  }
  $('nodes').append(card);
  const item = { card, title, meta, info, input, output };
  nodes.set(id, item);
  return item;
}

function position(element, x, y) {
  element.style.left = x + 'px';
  element.style.top = y + 'px';
}

function renderNodes() {
  const seen = new Set();
  let width = 670;
  let height = scroll.clientHeight;
  for (const kind of ['playlist', 'screen']) {
    const values = listFor(kind);
    values.forEach((value, index) => {
      const node = nodes.get(value.id) || addGraphNode(kind, value.id);
      seen.add(value.id);
      const current = gesture?.type === 'node' && gesture.id === value.id ? gesture.current : value.position;
      const x = current?.x ?? (kind === 'playlist' ? 32 : 415);
      const y = current?.y ?? 45 + index * 110;
      position(node.card, x, y);
      width = Math.max(width, x + 240);
      height = Math.max(height, y + 115);
      node.card.dataset.selected = String(value.id === selected?.id);
      node.info.setAttribute('aria-pressed', node.card.dataset.selected);
      setText(node.title, value.name);
      setText(node.meta, kind === 'playlist' ? value.items.length + ' mídias' + (value.transport.playing ? ' · Em execução' : '') : labelForScreen(value));
      node.meta.dataset.online = String(kind === 'screen' && value.online && value.status !== 'error');
      node.output.setAttribute('aria-label', 'Saída de ' + value.name);
      node.output.setAttribute('aria-pressed', String(outputPort?.id === value.id));
      if (node.input) node.input.setAttribute('aria-label', 'Entrada de ' + value.name);
    });
  }
  for (const [id, node] of nodes) {
    if (!seen.has(id)) {
      node.card.remove();
      nodes.delete(id);
    }
  }
  graph.style.minWidth = width + 'px';
  graph.style.height = height + 'px';
  $('graph-empty').hidden = seen.size > 0;
  drawWires();
}

function coordinates(element) {
  const a = element.getBoundingClientRect();
  const b = graph.getBoundingClientRect();
  return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
}

function wire(source, target, kind, preview = false) {
  const path = document.createElementNS(ns, 'path');
  const delta = Math.max(36, Math.abs(target.x - source.x) * .58);
  path.classList.add('wire', kind);
  if (preview) path.classList.add('preview');
  path.setAttribute('d', [
    'M', source.x, source.y, 'C', source.x + delta, source.y,
    target.x - delta, target.y, target.x, target.y
  ].join(' '));
  return path;
}

function drawWires() {
  const paths = [];
  for (const screen of listFor('screen')) {
    const source = nodes.get(screen.input?.id)?.output;
    const target = nodes.get(screen.id)?.input;
    if (source && target) paths.push(wire(coordinates(source), coordinates(target), screen.input.kind));
  }
  if (gesture?.type === 'wire' && gesture.moved) {
    const source = nodes.get(gesture.id)?.output;
    if (source) paths.push(wire(coordinates(source), gesture.current, gesture.kind, true));
  }
  $('wire-lines').replaceChildren(...paths);
}

function setOutput(value) {
  outputPort = value;
  const source = value && get(value.kind, value.id);
  setText($('wire-hint'), source ? 'Saída de ' + source.name + ' selecionada. Escolha uma entrada.' : 'Ligue uma saída à entrada de uma tela.');
  for (const [id, node] of nodes) node.output.setAttribute('aria-pressed', String(value?.id === id));
}

function connect(id, input) {
  if (editing) return;
  const screen = get('screen', id);
  if (!screen) return;
  if (screen.input?.kind === input?.kind && screen.input?.id === input?.id) {
    setOutput(null);
    return;
  }
  mutate(() => api('/screens/' + id + '/route', 'PUT', { version: screen.version, input }), () => {
    setOutput(null);
    announce(input ? 'Conexão alterada.' : 'Tela desconectada.');
  });
}

function consumeClick(node, event) {
  if (event.detail === 0 || suppress?.node !== node || performance.now() >= suppress.until) return false;
  suppress = null;
  return true;
}

function beginGesture(event, kind, id, type) {
  if (gesture || event.button !== 0 || !event.isPrimary) return;
  suppress = null;
  const card = nodes.get(id).card;
  const center = { x: card.offsetLeft, y: card.offsetTop };
  const handle = event.currentTarget;
  handle.setPointerCapture(event.pointerId);
  gesture = {
    kind, id, type, handle, center, pointer: event.pointerId,
    x: event.clientX, y: event.clientY, moved: false, current: center
  };
}

function moveGesture(event) {
  if (!gesture || gesture.pointer !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  if (Math.hypot(dx, dy) > 5) gesture.moved = true;
  if (!gesture.moved) return;
  const bounds = graph.getBoundingClientRect();
  if (gesture.type === 'node') {
    const x = Math.min(4000, Math.max(0, Math.round(gesture.center.x + dx)));
    const y = Math.min(4000, Math.max(0, Math.round(gesture.center.y + dy)));
    gesture.current = { x, y };
    position(nodes.get(gesture.id).card, x, y);
  } else {
    gesture.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  drawWires();
}

function endGesture(event, cancelled = false) {
  if (!gesture || gesture.pointer !== event.pointerId) return;
  const ended = gesture;
  gesture = null;
  if (!ended.moved || cancelled) {
    drawWires();
    if (cancelled) renderNodes();
    return;
  }
  suppress = { node: ended.handle, until: performance.now() + 350 };
  if (ended.type === 'wire') {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.port-in');
    const source = { kind: ended.kind, id: ended.id };
    setOutput(source);
    if (target) connect(target.closest('.node').dataset.id, source);
  } else {
    const node = get(ended.kind, ended.id);
    if (node) mutate(() => api('/nodes/' + ended.kind + 's/' + ended.id + '/position', 'PATCH', {
      version: node.version, ...ended.current
    }), (updated) => {
      node.position = updated.position || ended.current;
      node.version = updated.version || node.version;
      renderNodes();
    }).then((ok) => { if (!ok) renderNodes(); });
  }
  drawWires();
}

function listRow(title, meta) {
  const row = element('div', 'list-row');
  const label = element('div', 'row-label');
  label.append(element('span', 'row-title', title), element('small', '', meta));
  row.append(label);
  return row;
}

function inspectorHeading(title, subtitle) {
  const head = element('div', 'inspector-head');
  const heading = element('h2', '', title);
  heading.id = 'inspect-title';
  const caption = element('p', '', subtitle);
  caption.id = 'inspect-caption';
  head.append(heading, caption);
  return head;
}

function renderInspector() {
  const target = selected && get(selected.kind, selected.id);
  const key = target ? target.id : '@' + spaceId;
  if (key !== inspectorKey) {
    inspectorKey = key;
    const body = $('inspect');
    body.replaceChildren();
    if (target && selected.kind === 'playlist') buildPlaylist(body, target);
    else if (target) buildScreen(body, target);
    else {
      body.append(inspectorHeading('Controle de transmissão', spaceId
        ? 'Selecione uma sessão ou tela no mapa para abrir os controles.'
        : 'Crie um espaço para reunir sessões, mídias e telas.'));
      const controls = element('div', 'actions');
      controls.append(spaceId
        ? button('Parear uma tela', () => switchTab('pair'))
        : button('Criar espaço', () => createNode('space')));
      body.append(controls);
    }
  }
  if (target && selected.kind === 'playlist') syncPlaylist(target);
  else if (target) syncScreen(target);
}

function playlistFields(playlist) {
  return JSON.stringify([playlist.name, playlist.items, playlist.loop]);
}

function makeDraft(playlist) {
  return {
    id: playlist.id, name: playlist.name, loop: playlist.loop,
    items: playlist.items.map((item) => ({ ...item })),
    original: playlistFields(playlist), dirty: false, edits: 0
  };
}

function dirty() {
  draft.dirty = true;
  draft.edits++;
  drafts.set(draft.id, draft);
  updateDraftControls();
}

function updateDraftControls() {
  const target = get('playlist', draft.id);
  const changedElsewhere = draft.dirty && draft.original !== playlistFields(target);
  $('playlist-save').disabled = !draft.dirty || changedElsewhere || pendingAdds.has(draft.id);
  $('draft-conflict').hidden = !changedElsewhere;
  setText($('draft-status'), draft.dirty ? 'Alterações pendentes' : 'Fila salva');
  document.querySelectorAll('[data-testid="queue-play"]').forEach((item) => { item.disabled = draft.dirty; });
}

function formatTime(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return (hours ? hours + ':' + String(minutes % 60).padStart(2, '0') : String(minutes)) + ':' + String(seconds % 60).padStart(2, '0');
}

function buildPlaylist(body, playlist) {
  draft = drafts.get(playlist.id) || makeDraft(playlist);
  body.append(inspectorHeading(playlist.name, 'Sessão de apresentação'));
  const transport = element('div', 'transport stack');
  const seek = formField('input', 'Posição da sessão', 'transport-seek');
  seek.field.type = 'range';
  seek.field.min = 0;
  seek.field.max = 0;
  seek.field.step = 100;
  seek.field.dataset.testid = 'transport-seek';
  seek.field.addEventListener('input', () => setText($('position-value'), formatTime(Number(seek.field.value))));
  seek.field.addEventListener('change', () => command('seek', { positionMs: Number(seek.field.value) }));
  seek.wrapper.prepend(element('h3', '', 'Reprodução'));
  seek.wrapper.querySelector('label').classList.add('sr-only');
  const time = element('div', 'seek-time');
  const elapsed = element('span', '', '0:00');
  elapsed.id = 'position-value';
  const duration = element('span', '', '0:00');
  duration.id = 'duration-value';
  time.append(elapsed, duration);
  seek.wrapper.append(time);
  transport.append(seek.wrapper);
  const transportActions = element('div', 'actions');
  for (const [key, caption] of [['previous', 'Anterior'], ['play', 'Reproduzir'], ['pause', 'Pausar'], ['next', 'Próxima'], ['blackout', 'Tela preta'], ['logo', 'Logotipo']]) {
    const control = button(caption, () => command(key), {
      test: 'transport-' + key, className: key === 'play' ? 'primary' : ''
    });
    control.id = 'transport-' + key;
    transportActions.append(control);
  }
  transport.append(transportActions);
  body.append(transport);

  const form = element('form', 'stack');
  form.id = 'queue-form';
  form.append(element('h3', '', 'Fila da sessão'));
  const name = formField('input', 'Nome da sessão', 'playlist-name');
  name.field.required = true;
  name.field.maxLength = 80;
  name.field.addEventListener('input', () => { draft.name = name.field.value; dirty(); });
  form.append(name.wrapper);
  const items = element('ol', 'queue');
  items.id = 'queue-items';
  const empty = element('p', '', 'Adicione mídias da biblioteca à fila.');
  empty.id = 'queue-empty';
  form.append(empty, items);
  const add = element('div', 'queue-add');
  const addLabel = element('label', '', 'Mídia da biblioteca');
  addLabel.htmlFor = 'media-select';
  const media = element('select');
  media.id = 'media-select';
  media.dataset.testid = 'media-select';
  const addButton = button('Adicionar', async () => {
    const item = state.media.find((entry) => entry.id === media.value);
    if (!item || draft.items.length >= 200 || pendingAdds.has(playlist.id)) return;
    const current = draft;
    pendingAdds.add(playlist.id);
    syncPlaylist(get('playlist', playlist.id));
    try {
      const durationMs = item.type === 'video' ? await videoDuration(item) : 5000;
      if (draft !== current) return;
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      draft.items.push({ id, mediaId: item.id, durationMs });
      dirty();
      renderQueue();
    } finally {
      pendingAdds.delete(playlist.id);
      if (draft?.id === playlist.id) syncPlaylist(get('playlist', playlist.id));
    }
  }, { test: 'media-add' });
  addButton.id = 'media-add';
  add.append(addLabel, media, addButton);
  form.append(add);
  const loopLabel = element('label', 'loop-check');
  const loop = element('input');
  loop.type = 'checkbox';
  loop.id = 'playlist-loop';
  loop.addEventListener('change', () => { draft.loop = loop.checked; dirty(); });
  loopLabel.append(loop, 'Repetir a fila');
  form.append(loopLabel);
  const pending = element('p', '', 'Fila salva');
  pending.id = 'draft-status';
  const conflict = element('div', 'stack');
  conflict.id = 'draft-conflict';
  conflict.hidden = true;
  conflict.append(element('p', 'error', 'A fila foi alterada em outro painel.'), button('Recarregar fila', () => {
    if (window.confirm('Recarregar a fila e descartar suas alterações?')) {
      drafts.delete(playlist.id);
      draft = makeDraft(get('playlist', playlist.id));
      fillDraft();
    }
  }));
  form.append(conflict, pending);
  const actions = element('div', 'actions');
  const save = element('button', 'primary', 'Salvar fila');
  save.type = 'submit';
  save.id = 'playlist-save';
  save.dataset.testid = 'playlist-save';
  actions.append(save, button('Excluir sessão', () => {
    if (!window.confirm('Excluir esta sessão e desligar as telas ligadas a ela?')) return;
    mutate(() => api('/playlists/' + playlist.id, 'DELETE'), () => {
      drafts.delete(playlist.id);
      selected = null;
      draft = null;
      setOutput(null);
      announce('Sessão excluída.');
    });
  }, { className: 'danger' }));
  form.append(actions);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (editing || pendingAdds.has(playlist.id)) return;
    const target = get('playlist', playlist.id);
    if (!draft.dirty || draft.original !== playlistFields(target)) return;
    const name = draft.name.trim();
    if (!name) {
      announce('Informe o nome da sessão.', true);
      return;
    }
    const current = draft;
    const edits = current.edits;
    save.disabled = true;
    await mutate(() => api('/playlists/' + target.id, 'PUT', {
      version: target.version, name, items: current.items, loop: current.loop
    }), (updated) => {
      Object.assign(target, updated);
      if (edits === current.edits) {
        drafts.delete(updated.id);
        if (draft === current) {
          draft = makeDraft(updated);
          fillDraft();
        }
      } else {
        current.original = playlistFields(updated);
      }
      announce('Fila salva.');
    });
    if (draft?.id === playlist.id) updateDraftControls();
  });
  body.append(form);
  fillDraft();
}

function fillDraft() {
  $('playlist-name').value = draft.name;
  $('playlist-loop').checked = draft.loop;
  renderQueue();
  updateDraftControls();
}

function syncPlaylist(playlist) {
  setText($('inspect-title'), playlist.name);
  const stillEditing = $('queue-form').contains(document.activeElement);
  if (!draft.dirty && !stillEditing && playlistFields(playlist) !== draft.original) {
    draft = makeDraft(playlist);
    fillDraft();
  }
  const media = $('media-select');
  const options = state.media.map((item) => [item.id, item.name]);
  if (!options.length) options.push(['', 'Biblioteca vazia']);
  selectOptions(media, options, options.some(([id]) => id === media.value) ? media.value : options[0][0]);
  media.disabled = !state.media.length;
  const adding = pendingAdds.has(draft.id);
  $('media-add').disabled = adding || !state.media.length || draft.items.length >= 200;
  setText($('media-add'), adding ? 'Adicionando…' : 'Adicionar');
  updateDraftControls();
}

function renderQueue(refocus) {
  const list = $('queue-items');
  list.replaceChildren();
  const items = draft.items;
  $('queue-empty').hidden = items.length > 0;
  items.forEach((item, index) => {
    const media = state.media.find((entry) => entry.id === item.mediaId);
    const title = media?.name || 'Mídia indisponível';
    const row = element('li', 'list-row');
    row.dataset.id = item.id;
    row.dataset.testid = 'queue-row';
    const heading = element('div', 'row-label');
    heading.append(element('span', 'row-title', (index + 1) + '. ' + title));
    const seconds = element('input');
    seconds.type = 'number';
    seconds.dataset.testid = 'queue-duration';
    seconds.min = 1;
    seconds.max = 86400;
    seconds.step = '.001';
    seconds.required = true;
    seconds.value = item.durationMs / 1000;
    seconds.setAttribute('aria-label', 'Duração em segundos de ' + title);
    seconds.addEventListener('input', () => {
      item.durationMs = Math.round(Number(seconds.value) * 1000);
      dirty();
    });
    const duration = element('label', 'duration');
    duration.append(seconds, 's');
    heading.append(duration);
    const controls = element('div', 'queue-controls');
    const play = button('▶', () => command('play', { itemId: item.id }), {
      title: 'Reproduzir ' + title, test: 'queue-play', disabled: draft.dirty
    });
    const move = (direction) => {
      const neighbor = index + direction;
      [items[index], items[neighbor]] = [items[neighbor], items[index]];
      dirty();
      renderQueue({ id: item.id, test: direction < 0 ? 'queue-up' : 'queue-down' });
    };
    controls.append(play,
      button('↑', () => move(-1), { title: 'Subir ' + title, test: 'queue-up', disabled: index === 0 }),
      button('↓', () => move(1), { title: 'Descer ' + title, test: 'queue-down', disabled: index === items.length - 1 }),
      button('×', () => {
        items.splice(index, 1);
        dirty();
        renderQueue();
        $('media-select').focus();
      }, { title: 'Retirar ' + title, test: 'queue-remove' })
    );
    row.append(heading, controls);
    list.append(row);
  });
  if (refocus) {
    const row = Array.from(list.children).find((entry) => entry.dataset.id === refocus.id);
    const control = row?.querySelector('[data-testid="' + refocus.test + '"]');
    if (control?.disabled) row.querySelector('button:enabled')?.focus();
    else control?.focus();
  }
}

function videoDuration(media) {
  return new Promise((resolve) => {
    const video = element('video');
    const finish = (duration) => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.ondurationchange = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(duration);
    };
    const timer = setTimeout(() => finish(10000), 2500);
    const applyDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        finish(Math.min(86400000, Math.max(1000, Math.round(video.duration * 1000))));
      }
    };
    video.preload = 'metadata';
    video.onloadedmetadata = applyDuration;
    video.ondurationchange = applyDuration;
    video.onerror = () => finish(10000);
    video.src = '/api/v1/media/' + encodeURIComponent(media.id);
  });
}

function command(action, fields = {}) {
  const playlist = selected && get('playlist', selected.id);
  if (!playlist || editing) return;
  mutate(() => api('/playlists/' + playlist.id + '/transport', 'POST', {
    action, version: playlist.version, ...fields
  }), (updated) => {
    Object.assign(playlist, updated);
    const elapsed = performance.now() - sampleAt;
    state.serverNowMs += elapsed;
    sampleAt += elapsed;
    updateTransport();
  });
}

function updateTransport() {
  const playlist = selected?.kind === 'playlist' && get('playlist', selected.id);
  const seek = $('transport-seek');
  if (!playlist || !seek) return;
  const { transport, items, loop } = playlist;
  const duration = items.reduce((total, item) => total + item.durationMs, 0);
  const now = state.serverNowMs + performance.now() - sampleAt;
  const elapsed = transport.positionMs + (transport.playing ? Math.max(0, now - transport.anchorAtMs) : 0);
  const value = duration && loop ? elapsed % duration : Math.min(elapsed, duration);
  const done = !loop && value >= duration;
  const active = transport.playing && !done;
  seek.disabled = !duration;
  if (document.activeElement !== seek) {
    seek.max = duration;
    seek.value = Math.round(value);
    setText($('position-value'), formatTime(value));
  }
  setText($('duration-value'), formatTime(duration));
  $('transport-play').disabled = !duration || active;
  $('transport-pause').disabled = !active;
  $('transport-next').disabled = !duration;
  $('transport-previous').disabled = !duration;
  $('transport-blackout').setAttribute('aria-pressed', String(transport.mode === 'blackout'));
  $('transport-logo').setAttribute('aria-pressed', String(transport.mode === 'logo'));
}

function buildScreen(body, screen) {
  body.append(inspectorHeading(screen.name, labelForScreen(screen)));
  const details = element('p');
  details.id = 'screen-details';
  details.className = 'error';
  details.hidden = true;
  body.append(details);
  const source = formField('select', 'Origem da tela', 'screen-source');
  source.field.dataset.testid = 'screen-source';
  source.field.addEventListener('change', () => {
    const [kind, id] = source.field.value.split(':');
    connect(screen.id, id ? { kind, id } : null);
  });
  body.append(source.wrapper);
  const controls = element('div', 'actions');
  const disconnect = button('Desconectar origem', () => connect(screen.id, null), { test: 'disconnect-screen' });
  disconnect.id = 'disconnect-screen';
  const rename = button('Renomear', () => {
    const current = get('screen', screen.id);
    openDialog({
      title: 'Renomear tela', label: 'Nome da tela', name: current.name,
      perform: (name) => api('/screens/' + screen.id, 'PATCH', { name, version: current.version }),
      done: () => announce('Tela renomeada.')
    });
  }, { test: 'rename-screen' });
  const revoke = button('Revogar tela', () => {
    if (!window.confirm('Revogar acesso desta tela e removê-la do mapa?')) return;
    mutate(() => api('/screens/' + screen.id, 'DELETE'), () => {
      selected = null;
      setOutput(null);
      announce('Tela revogada.');
    });
  }, { className: 'danger', test: 'revoke-screen' });
  controls.append(disconnect, rename, revoke);
  body.append(controls);
}

function syncScreen(screen) {
  setText($('inspect-title'), screen.name);
  setText($('inspect-caption'), labelForScreen(screen));
  const details = $('screen-details');
  const error = screen.status === 'error' && screen.ack?.message;
  details.hidden = !error;
  setText(details, error || '');
  const select = $('screen-source');
  const options = [['', 'Sem origem']];
  for (const playlist of listFor('playlist')) options.push(['playlist:' + playlist.id, 'Sessão · ' + playlist.name]);
  for (const item of listFor('screen')) {
    if (item.id !== screen.id) options.push(['screen:' + item.id, 'Espelho · ' + item.name]);
  }
  const current = screen.input ? screen.input.kind + ':' + screen.input.id : '';
  selectOptions(select, options, options.some(([id]) => id === current) ? current : '');
  $('disconnect-screen').disabled = !screen.input;
}

function readableSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  if (bytes >= 1024) return Math.ceil(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function renderMedia() {
  const key = JSON.stringify([spaceId, state.media]);
  if (key === mediaKey) return;
  mediaKey = key;
  const list = $('media-list');
  list.replaceChildren();
  $('upload-input').disabled = !spaceId;
  if (!state.media.length) {
    list.append(element('p', '', spaceId ? 'Nenhuma mídia neste espaço.' : 'Crie um espaço para enviar mídias.'));
    return;
  }
  for (const item of state.media) {
    const row = listRow(item.name, (item.type === 'video' ? 'Vídeo' : 'Imagem') + ' · ' + readableSize(item.size));
    row.dataset.id = item.id;
    row.dataset.testid = 'library-media';
    list.append(row);
  }
}

function renderPairings() {
  const pairings = state.pairings.slice().sort((left, right) => Number(right.code === pairCode) - Number(left.code === pairCode));
  const key = JSON.stringify([spaceId, pairings]);
  const badge = $('pair-badge');
  badge.hidden = !pairings.length;
  setText(badge, String(pairings.length));
  if (key === pairKey) return;
  pairKey = key;
  const list = $('pair-list');
  const active = list.contains(document.activeElement) && document.activeElement.closest('[data-code]')?.dataset.code;
  list.replaceChildren();
  if (pairCode && !pairings.some((pair) => pair.code === pairCode)) {
    list.append(element('p', '', 'O código ' + pairCode + ' não está pendente.'));
  }
  if (!pairings.length) {
    list.append(element('p', '', 'Nenhum pedido de pareamento pendente.'));
    return;
  }
  if (!spaceId) list.append(element('p', '', 'Crie um espaço para aprovar uma tela.'));
  for (const pair of pairings) {
    const expires = new Date(pair.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const row = listRow(pair.name, 'Válido até ' + expires);
    row.dataset.code = pair.code;
    row.dataset.testid = 'pairing-row';
    row.firstChild.prepend(element('span', 'pair-code', pair.code));
    const approve = button('Aprovar', () => {
      const workspace = spaceId;
      openDialog({
        title: 'Aprovar tela', label: 'Nome da tela', name: pair.name,
        copy: 'Código ' + pair.code, submit: 'Aprovar',
        perform: (name) => api('/spaces/' + workspace + '/pairings/' + pair.id + '/approve', 'POST', { name }),
        done: () => announce('Tela aprovada. Abra o mapa para conectar a origem.')
      });
    }, { disabled: !spaceId, test: 'approve-pairing' });
    row.append(approve);
    list.append(row);
    if (active === pair.code) approve.focus({ preventScroll: true });
  }
}

function renderUploads() {
  const list = $('uploads');
  const visible = uploads.filter((upload) => upload.spaceId === spaceId);
  const key = JSON.stringify(visible.map((upload) => [upload.key, upload.phase, upload.offset, upload.error]));
  if (key === list.dataset.key) return;
  list.dataset.key = key;
  const active = list.contains(document.activeElement) && document.activeElement.closest('[data-upload]')?.dataset.upload;
  list.replaceChildren();
  for (const upload of visible) {
    const percent = Math.floor(100 * upload.offset / upload.file.size);
    const status = {
      queued: 'Na fila', uploading: percent + '% enviados', complete: 'Envio concluído',
      error: upload.error || 'Envio interrompido'
    }[upload.phase];
    const row = listRow(upload.file.name, status);
    row.dataset.upload = upload.key;
    row.dataset.testid = 'upload-row';
    if (upload.phase === 'uploading') {
      const meter = element('progress');
      meter.max = upload.file.size;
      meter.value = upload.offset;
      meter.setAttribute('aria-label', 'Envio de ' + upload.file.name);
      row.append(meter);
    }
    if (upload.phase === 'error') {
      const retry = button('Retomar', () => {
        upload.phase = 'queued';
        renderUploads();
        processUploads();
      }, { test: 'upload-retry' });
      row.append(retry);
      if (active === upload.key) retry.focus({ preventScroll: true });
    }
    if (upload.phase !== 'uploading') row.append(button('Remover', () => discardUpload(upload)));
    list.append(row);
  }
}

function rememberUpload(upload, entry) {
  const entries = recall(savedUploads, {});
  if (entry) entries[upload.key] = entry;
  else delete entries[upload.key];
  persist(savedUploads, entries);
}

async function discardUpload(upload) {
  if (upload.phase === 'uploading') return;
  try {
    if (upload.id && upload.phase !== 'complete') await api('/uploads/' + upload.id, 'DELETE');
  } catch (error) {
    if (error.status !== 404) {
      announce(error.message, true);
      return;
    }
  }
  rememberUpload(upload);
  uploads.splice(uploads.indexOf(upload), 1);
  renderUploads();
}

function enqueue(files) {
  if (!spaceId) return;
  for (const file of files) {
    const mime = defaultUploadMime[file.name.split('.').pop()?.toLowerCase()] || file.type;
    if (!Object.values(defaultUploadMime).includes(mime) || !file.size || file.size > 512 * 1048576) {
      announce('Formato ou tamanho inválido para ' + file.name + '. O limite é de 512 MB por arquivo.', true);
      continue;
    }
    const key = JSON.stringify([spaceId, file.name, file.size, file.lastModified, mime]);
    const entry = uploads.find((upload) => upload.key === key);
    if (entry && entry.phase === 'error') entry.phase = 'queued';
    else if (!entry) {
      const saved = recall(savedUploads, {})[key];
      uploads.push({ key, mime, file, spaceId, phase: 'queued', offset: 0, id: saved?.id, sentAll: Boolean(saved?.sentAll) });
    }
  }
  renderUploads();
  processUploads();
}

async function uploadFile(upload) {
  let transfer;
  const { file } = upload;
  if (upload.id) {
    try {
      transfer = await api('/uploads/' + upload.id);
    } catch (error) {
      if (error.status !== 404) throw error;
      if (upload.sentAll) {
        const snapshot = await api('/state?spaceId=' + encodeURIComponent(upload.spaceId));
        if (snapshot.media.some((item) => item.id === upload.id)) return;
      }
      upload.id = null;
      upload.sentAll = false;
      rememberUpload(upload);
    }
  }
  if (!transfer) transfer = await api('/uploads', 'POST', {
    spaceId: upload.spaceId, name: file.name, size: file.size, mime: upload.mime
  });
  upload.id = transfer.id;
  upload.offset = transfer.offset;
  rememberUpload(upload, { id: transfer.id, sentAll: false });
  let correctedOffset = false;
  while (upload.offset < file.size) {
    const start = upload.offset;
    const end = Math.min(start + transfer.chunkSize, file.size);
    try {
      const chunk = file.slice(start, end);
      const result = await api('/uploads/' + upload.id, 'PATCH', chunk, {
        'Content-Type': 'application/octet-stream', 'Upload-Offset': String(start)
      });
      if (!Number.isSafeInteger(result.offset) || result.offset < end || result.offset > file.size) {
        throw new Error('O servidor retornou um progresso de envio inválido.');
      }
      upload.offset = result.offset;
      correctedOffset = false;
    } catch (error) {
      const offset = error.value?.offset;
      if (correctedOffset || error.status !== 409 || !Number.isSafeInteger(offset) || offset < 0 || offset > file.size || offset === start) throw error;
      upload.offset = offset;
      correctedOffset = true;
    }
    renderUploads();
  }
  upload.sentAll = true;
  rememberUpload(upload, { id: upload.id, sentAll: true });
  await api('/uploads/' + upload.id + '/complete', 'POST', {});
}

async function processUploads() {
  if (uploading || !authenticated) return;
  uploading = true;
  try {
    let upload;
    while (authenticated && (upload = uploads.find((item) => item.phase === 'queued'))) {
      upload.phase = 'uploading';
      renderUploads();
      try {
        await uploadFile(upload);
        rememberUpload(upload);
        upload.offset = upload.file.size;
        upload.phase = 'complete';
        refresh();
      } catch (error) {
        upload.error = error.status ? error.message : 'Envio interrompido. Retome para continuar do último bloco.';
        upload.phase = 'error';
      }
      renderUploads();
    }
  } finally {
    uploading = false;
  }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button');
  const password = $('password');
  submit.disabled = true;
  setText($('login-error'), '');
  try {
    const session = await api('/login', 'POST', { password: password.value });
    password.value = '';
    showStudio(session.csrf);
  } catch (error) {
    setText($('login-error'), error.status ? error.message : 'Sem conexão com o estúdio. Tente novamente.');
    password.focus();
    password.select();
  } finally {
    submit.disabled = false;
  }
});

$('action-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('create-name').value.trim();
  if (!action || !name || editing) return;
  const current = action;
  const submit = $('dialog-submit');
  submit.disabled = true;
  $('dialog-error').hidden = true;
  editing++;
  writeEpoch++;
  try {
    const created = await current.perform(name);
    if (current.done) current.done(created);
    $('action-dialog').close();
  } catch (error) {
    setText($('dialog-error'), error.message);
    $('dialog-error').hidden = false;
  } finally {
    editing--;
    submit.disabled = false;
    refresh();
  }
});

$('dialog-cancel').addEventListener('click', () => $('action-dialog').close());
$('workspace').addEventListener('change', () => {
  spaceId = $('workspace').value;
  persist('fbs-studio-space', spaceId);
  state = { ...state, spaceId, playlists: [], screens: [], media: [] };
  selected = null;
  draft = null;
  setOutput(null);
  render();
  refresh();
});

$('new-space').addEventListener('click', () => createNode('space'));
$('new-playlist').addEventListener('click', () => createNode('playlist'));
for (const id of ['inspect', 'library', 'pair']) {
  $('tab-' + id).addEventListener('click', () => switchTab(id));
}
$('upload-input').addEventListener('change', () => {
  enqueue($('upload-input').files);
  $('upload-input').value = '';
});
$('tv-link').textContent = new URL('/tv', location.origin).href;
$('copy-tv').addEventListener('click', async () => {
  const address = $('tv-link').href;
  try {
    await navigator.clipboard.writeText(address);
    announce('Endereço copiado.');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('tv-link'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    announce(document.execCommand('copy') ? 'Endereço copiado.' : 'Endereço selecionado para copiar.');
  }
});
$('logout').addEventListener('click', () => mutate(() => api('/logout', 'POST', {}), () => showLogin()));
graph.addEventListener('pointermove', moveGesture);
graph.addEventListener('pointerup', (event) => endGesture(event));
graph.addEventListener('pointercancel', (event) => endGesture(event, true));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && outputPort) setOutput(null);
});
window.addEventListener('resize', () => { if (state) renderNodes(); });
window.addEventListener('online', refresh);
setInterval(refresh, 1000);
setInterval(updateTransport, 250);

api('/me').then((session) => {
  if (session.authenticated) showStudio(session.csrf);
  else showLogin();
}).catch(() => showLogin('Sem conexão com o estúdio. Tente novamente.'));
