(() => {
  'use strict';
  if (document.body.dataset.role !== 'control') return;

  const $ = (id) => document.getElementById(id);
  const session = $('session');
  const mediaRows = new Map();
  const ruleRows = new Map();
  const displayOptions = new Map();
  const pendingFields = new WeakMap();
  const busyButtons = new WeakSet();
  const playAttempts = new WeakSet();
  const blockedPreviews = new WeakSet();
  const uploads = [];
  const transitions = [
    ['', 'Padrão'], ['cut', 'Corte'], ['fade', 'Dissolver'],
    ['slide-left', 'Deslizar à esquerda'], ['slide-up', 'Deslizar para cima'], ['zoom', 'Zoom']
  ];
  let state = {
    ready: false, playlist: [], rules: [], displays: [], currentId: null,
    running: false, paused: false, locked: false, loop: false, elapsed: 0,
    connection: { blocked: true }, output: null
  };
  let needsSnapshot = true;
  let receivedAt = 0;
  let uploadBusy = false;
  let previewKey = '';
  let previewMedia = null;
  let previewFault = '';
  let confirmTask = null;
  let confirmSource = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function validId(id) {
    return typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
  }

  function sameId(a, b) {
    return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
  }

  function records(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.filter((item) => {
      if (!item || typeof item !== 'object' || !validId(item.id)) return false;
      const key = String(item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function canOperate() {
    return state.ready === true && !needsSnapshot && !session.hidden &&
      window.fbsLive?.connected === true;
  }

  function announce(message, error = false) {
    $('commandStatus').textContent = message;
    $('commandStatus').classList.toggle('is-error', error);
  }

  function readableError(error) {
    if (typeof error === 'string' && error.trim()) return error;
    if (error && typeof error.message === 'string' && error.message.trim()) return error.message;
    return 'Não foi possível concluir a solicitação.';
  }

  function refreshAvailability() {
    const connected = canOperate();
    document.querySelectorAll('[data-network]').forEach((node) => {
      node.disabled = !connected ||
        busyButtons.has(node) || node.dataset.unavailable === 'true';
    });
  }

  async function command(payload, trigger) {
    if (!canOperate()) {
      announce('Sem conexão com o palco. Aguarde a reconexão.', true);
      return false;
    }
    const button = trigger?.tagName === 'BUTTON' ? trigger : null;
    if (button && busyButtons.has(button)) return false;
    if (button) busyButtons.add(button);
    refreshAvailability();
    announce('Enviando comando…');
    try {
      await window.fbsLive.command(payload);
      announce('Comando enviado.');
      return true;
    } catch (error) {
      announce(readableError(error), true);
      return false;
    } finally {
      if (button) busyButtons.delete(button);
      refreshAvailability();
    }
  }

  async function fieldCommand(input, payload) {
    const token = {};
    pendingFields.set(input, token);
    try {
      await command(payload, input);
    } finally {
      if (pendingFields.get(input) === token) pendingFields.delete(input);
    }
  }

  function bindField(input, buildPayload) {
    input.addEventListener('change', () => {
      try {
        if (!input.checkValidity()) {
          input.reportValidity();
          throw new Error('Confira o valor deste campo.');
        }
        void fieldCommand(input, buildPayload());
      } catch (error) {
        announce(readableError(error), true);
        input.focus();
      }
    });
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (!pendingFields.has(input)) render();
      }, 0);
    });
  }

  function setValue(input, value) {
    if (document.activeElement === input || pendingFields.has(input)) return;
    const next = value === null || value === undefined ? '' : String(value);
    if (input.value !== next) input.value = next;
  }

  function place(parent, node, index) {
    const at = parent.children[index];
    if (at !== node) parent.insertBefore(node, at || null);
  }

  function preserveFocus(work) {
    const active = document.activeElement;
    let selection = null;
    try {
      if (typeof active?.selectionStart === 'number') {
        selection = [active.selectionStart, active.selectionEnd, active.selectionDirection];
      }
    } catch (_) { /* Alguns tipos de input não oferecem seleção de texto. */ }
    work();
    if (active?.isConnected && !active.disabled && document.activeElement !== active) {
      active.focus({ preventScroll: true });
      if (selection) {
        try { active.setSelectionRange(...selection); } catch (_) { /* Campo sem seleção. */ }
      }
    }
  }

  function button(text, handler, network = true) {
    const node = element('button', '', text);
    node.type = 'button';
    if (network) node.setAttribute('data-network', '');
    node.addEventListener('click', handler);
    return node;
  }

  function field(label, input) {
    const wrapper = element('label', 'field');
    wrapper.append(element('span', '', label), input);
    return wrapper;
  }

  function editableInput(type) {
    const input = element('input');
    input.type = type;
    input.setAttribute('data-network', '');
    if (type === 'time') input.step = '60';
    return input;
  }

  function transitionSelect() {
    const select = element('select');
    select.setAttribute('data-network', '');
    transitions.forEach(([value, label]) => {
      const option = element('option', '', label);
      option.value = value;
      select.append(option);
    });
    return select;
  }

  function transitionValue(value) {
    return transitions.some(([key]) => key === value) ? value : '';
  }

  function timeValue(value, optional = false) {
    if (optional && value === '') return '';
    const valid = optional ? /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/ : /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!valid.test(String(value))) {
      throw new Error('Confira o horário informado.');
    }
    return value;
  }

  function durationValue(value) {
    const number = Number(value);
    if (value.trim() === '' || !Number.isFinite(number) || number < 0 || number > 86400) {
      throw new Error('A duração deve ficar entre 0 e 86400 segundos.');
    }
    return number;
  }

  function clock(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds / 60) % 60;
    const rest = seconds % 60;
    return (hours ? String(hours).padStart(2, '0') + ':' : '') +
      String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  }

  function confirmAction(message, task, source, network = true) {
    if (confirmTask) return;
    confirmTask = task;
    confirmSource = source;
    $('confirmMessage').textContent = message;
    const yes = $('confirmYes');
    if (network) {
      yes.setAttribute('data-network', '');
    } else {
      yes.removeAttribute('data-network');
      yes.disabled = false;
    }
    $('confirmDialog').showModal();
    refreshAvailability();
    $('confirmCancel').focus();
  }

  $('confirmCancel').addEventListener('click', () => $('confirmDialog').close());
  $('confirmYes').addEventListener('click', () => {
    const task = confirmTask;
    if (!task || $('confirmYes').disabled) return;
    confirmTask = null;
    $('confirmDialog').close();
    void task();
  });
  $('confirmDialog').addEventListener('close', () => {
    confirmTask = null;
    if (confirmSource?.isConnected && !confirmSource.disabled) confirmSource.focus({ preventScroll: true });
    confirmSource = null;
  });

  function outputItem() {
    const item = state.output?.item;
    if (item && typeof item === 'object') {
      const queued = state.playlist.find((candidate) => sameId(candidate.id, item.id));
      return { ...queued, ...item };
    }
    return state.playlist.find((candidate) => sameId(candidate.id, item)) || null;
  }

  function createMediaRow(item) {
    const row = element('li', 'media-item');
    const record = { row, item };
    const heading = element('div', 'item-heading');
    record.index = element('p', 'eyebrow');
    record.title = element('h3', 'item-title');
    record.status = element('span', 'badge');
    const titleGroup = element('div');
    titleGroup.append(record.index, record.title);
    heading.append(titleGroup, record.status);

    const take = button('Colocar no ar', () => void command({ action: 'take', id: record.item.id }, take));
    take.className = 'primary take-button';
    record.take = take;
    const up = button('Subir', () => void command({ action: 'move', id: record.item.id, delta: -1 }, up));
    const down = button('Descer', () => void command({ action: 'move', id: record.item.id, delta: 1 }, down));
    const remove = button('Remover', () => confirmAction(
      'Remover “' + String(record.item.name || 'Mídia sem nome') + '” da fila? Esta ação não pode ser desfeita.',
      () => command({ action: 'remove', id: record.item.id }, remove), remove
    ));
    remove.className = 'danger';
    record.up = up;
    record.down = down;
    const actions = element('div', 'item-actions');
    actions.append(take, up, down, remove);

    const details = element('details', 'item-editor');
    details.append(element('summary', '', 'Editar mídia'));
    const fields = element('div', 'field-grid');
    record.duration = editableInput('number');
    record.duration.min = '0';
    record.duration.max = '86400';
    record.duration.step = 'any';
    record.duration.required = true;
    record.duration.inputMode = 'decimal';
    record.startAt = editableInput('time');
    record.startAt.step = '1';
    record.transition = transitionSelect();
    fields.append(
      field('Duração em segundos', record.duration),
      field('Início agendado', record.startAt),
      field('Transição', record.transition)
    );
    const files = element('div', 'item-actions');
    const open = element('a', 'file-link', 'Abrir mídia');
    open.href = '/api/media/' + encodeURIComponent(item.id);
    open.target = '_blank'; open.rel = 'noopener';
    const folder = button('Mostrar pasta no PC', () => void command({ action: 'showFolder', id: record.item.id }, folder));
    files.append(open, folder);
    details.append(fields, element('p', 'muted small', 'Use duração zero para manter a mídia no ar até a próxima troca.'), files);
    bindField(record.duration, () => ({ action: 'edit', id: record.item.id, field: 'duration', value: durationValue(record.duration.value) }));
    bindField(record.startAt, () => ({ action: 'edit', id: record.item.id, field: 'startAt', value: timeValue(record.startAt.value, true) }));
    bindField(record.transition, () => ({ action: 'edit', id: record.item.id, field: 'transition', value: transitionValue(record.transition.value) }));
    row.append(heading, actions, details);
    return record;
  }

  function renderMedia() {
    const activeIds = new Set();
    const onAir = state.output?.action === 'show' ? outputItem() : null;
    state.playlist.forEach((item, index) => {
      const key = String(item.id);
      activeIds.add(key);
      let record = mediaRows.get(key);
      if (!record) {
        record = createMediaRow(item);
        mediaRows.set(key, record);
      }
      record.item = item;
      record.title.textContent = String(item.name || 'Mídia sem nome');
      const type = isVideo(item) ? 'Vídeo' : 'Imagem';
      record.index.textContent = String(index + 1).padStart(2, '0') + ' · ' + type;
      const showing = sameId(onAir?.id, item.id);
      const selected = sameId(state.currentId, item.id);
      record.status.textContent = showing ? 'No ar' : selected ? 'Selecionado' : '';
      record.status.hidden = !showing && !selected;
      record.row.classList.toggle('is-current', showing);
      if (showing) record.row.setAttribute('aria-current', 'true');
      else record.row.removeAttribute('aria-current');
      record.take.setAttribute('aria-label', 'Colocar ' + String(item.name || 'mídia sem nome') + ' no ar');
      record.up.dataset.unavailable = String(index === 0);
      record.down.dataset.unavailable = String(index === state.playlist.length - 1);
      setValue(record.duration, item.duration ?? 0);
      setValue(record.startAt, item.startAt || '');
      setValue(record.transition, transitionValue(item.transition));
      place($('playlist'), record.row, index);
    });
    mediaRows.forEach((record, key) => {
      if (!activeIds.has(key)) {
        record.row.remove();
        mediaRows.delete(key);
      }
    });
    $('playlistEmpty').hidden = state.playlist.length > 0;
    $('playlistCount').textContent = state.playlist.length + ' na fila';
    $('clear').dataset.unavailable = String(state.playlist.length === 0);
  }

  function createRuleRow(item) {
    const row = element('li', 'rule-item');
    const record = { row, item, title: element('h3', 'item-title') };
    record.start = editableInput('time');
    record.end = editableInput('time');
    record.start.required = true;
    record.end.required = true;
    record.transition = transitionSelect();
    const fields = element('div', 'field-grid');
    fields.append(field('Início', record.start), field('Fim', record.end), field('Transição', record.transition));
    ['start', 'end'].forEach((name) => bindField(record[name], () => ({
      action: 'editRule', id: record.item.id, field: name, value: timeValue(record[name].value)
    })));
    bindField(record.transition, () => ({
      action: 'editRule', id: record.item.id, field: 'transition', value: transitionValue(record.transition.value)
    }));
    const remove = button('Remover regra', () => confirmAction(
      'Remover esta regra de horário? Esta ação não pode ser desfeita.',
      () => command({ action: 'removeRule', id: record.item.id }, remove), remove
    ));
    remove.className = 'danger';
    row.append(record.title, fields, remove);
    return record;
  }

  function renderRules() {
    const activeIds = new Set();
    state.rules.forEach((item, index) => {
      const key = String(item.id);
      activeIds.add(key);
      let record = ruleRows.get(key);
      if (!record) {
        record = createRuleRow(item);
        ruleRows.set(key, record);
      }
      record.item = item;
      record.title.textContent = 'Regra ' + (index + 1);
      setValue(record.start, item.start || '');
      setValue(record.end, item.end || '');
      setValue(record.transition, transitionValue(item.transition));
      place($('rules'), record.row, index);
    });
    ruleRows.forEach((record, key) => {
      if (!activeIds.has(key)) {
        record.row.remove();
        ruleRows.delete(key);
      }
    });
    $('rulesEmpty').hidden = state.rules.length > 0;
  }

  function renderDisplays() {
    const select = $('displaySelect');
    const placeholder = select.options[0];
    placeholder.textContent = state.displays.length ? 'Selecione uma saída' : 'Nenhuma saída disponível';
    const activeIds = new Set();
    state.displays.forEach((display, index) => {
      const key = String(display.id);
      activeIds.add(key);
      let option = displayOptions.get(key);
      if (!option) {
        option = element('option');
        option.value = key;
        displayOptions.set(key, option);
      }
      option.textContent = String(display.label || 'Saída ' + (index + 1));
      place(select, option, index + 1);
    });
    displayOptions.forEach((option, key) => {
      if (!activeIds.has(key)) {
        option.remove();
        displayOptions.delete(key);
      }
    });
    const selected = state.displays.find((display) => display.selected === true);
    setValue(select, selected ? String(selected.id) : '');
    select.dataset.unavailable = String(state.displays.length === 0);
  }

  bindField($('displaySelect'), () => {
    const display = state.displays.find((item) => String(item.id) === $('displaySelect').value);
    if (!display) throw new Error('Selecione uma saída disponível.');
    return { action: 'display', id: display.id };
  });

  function sameServerURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function isVideo(item) {
    const type = String(item?.type || '').toLowerCase();
    return type === 'video' || type.startsWith('video/') || type === 'mp4' || type === 'webm' ||
      /\.(mp4|webm)(?:[?#]|$)/i.test(String(item?.url || ''));
  }

  function previewShouldPlay() {
    return canOperate() && state.output?.action === 'show' &&
      (typeof state.output.paused === 'boolean' ? !state.output.paused : !state.paused);
  }

  function syncVideo() {
    const video = previewMedia;
    if (!(video instanceof HTMLVideoElement)) return;
    const position = Number(state.output?.position) + (state.output?.paused ? 0 : (performance.now() - receivedAt) / 1000);
    if (video.readyState >= 1 && Number.isFinite(position) && position >= 0) {
      const target = Number.isFinite(video.duration) && video.duration > 0
        ? video.loop ? position % video.duration : Math.min(position, video.duration) : position;
      if (Math.abs(video.currentTime - target) > 1.25) {
        try { video.currentTime = target; } catch (_) { /* Aguarde o próximo evento de metadados. */ }
      }
    }
    if (!previewShouldPlay()) {
      video.pause();
      $('previewResume').hidden = true;
      return;
    }
    if (blockedPreviews.has(video)) {
      $('previewResume').hidden = false;
      $('previewHint').textContent = 'Toque em “Ativar prévia” para permitir a reprodução.';
      return;
    }
    if (!video.paused || playAttempts.has(video)) return;
    playAttempts.add(video);
    video.play().catch(() => {
      blockedPreviews.add(video);
      if (previewMedia === video && previewShouldPlay()) {
        $('previewResume').hidden = false;
        $('previewHint').textContent = 'Toque em “Ativar prévia” para permitir a reprodução.';
      }
    }).finally(() => playAttempts.delete(video));
  }

  function renderPreview() {
    const action = state.output?.action;
    const item = outputItem();
    const url = action === 'logo' ? sameServerURL('/logo-bs.png') : sameServerURL(item?.url);
    const video = action === 'show' && isVideo(item);
    const key = JSON.stringify([action || 'waiting', state.output?.sequence, video, url, item?.id ?? null]);
    const host = $('previewStage');
    if (key !== previewKey) {
      if (previewMedia instanceof HTMLVideoElement) previewMedia.pause();
      previewKey = key;
      previewFault = '';
      previewMedia = null;
      $('previewResume').hidden = true;
      host.replaceChildren();
      if ((action === 'show' || action === 'logo') && url) {
        const media = element(video ? 'video' : 'img', 'preview-media');
        if (video) {
          media.muted = true;
          media.defaultMuted = true;
          media.playsInline = true;
          media.loop = !!item.duration;
          media.preload = 'metadata';
          media.disablePictureInPicture = true;
          media.addEventListener('loadedmetadata', syncVideo);
          media.addEventListener('playing', () => {
            if (previewMedia === media) $('previewResume').hidden = true;
          });
        } else {
          media.alt = action === 'logo' ? 'Logo FBS no ar' : 'Prévia da mídia no ar';
        }
        media.addEventListener('error', () => {
          if (previewMedia === media) {
            previewFault = 'Não foi possível carregar a prévia desta mídia.';
            $('previewHint').textContent = previewFault;
          }
        });
        previewMedia = media;
        media.src = url;
        host.append(media);
      } else if (action !== 'blackout') {
        host.append(element('p', 'preview-placeholder', action === 'show'
          ? 'Mídia sem endereço válido neste servidor.' : 'Aguardando a saída do palco.'));
      }
    }
    host.classList.toggle('is-logo', action === 'logo');
    host.classList.toggle('is-cover', action === 'show' && item?.fit === 'cover');
    host.classList.toggle('is-blackout', action === 'blackout');
    const paused = typeof state.output?.paused === 'boolean' ? state.output.paused : state.paused;
    $('previewInfo').textContent = action === 'blackout' ? 'Blackout' : action === 'logo' ? 'Logo no ar' :
      action === 'show' ? String(item?.name || 'Mídia no ar') + (paused ? ' · Pausado' : ' · No ar') : 'Nenhuma saída recebida.';
    $('previewHint').textContent = previewFault || (!canOperate()
      ? 'Última saída recebida. Aguardando conexão com o palco.'
      : '');
    syncVideo();
  }

  $('previewResume').addEventListener('click', async () => {
    const video = previewMedia;
    if (!(video instanceof HTMLVideoElement) || !previewShouldPlay()) return;
    blockedPreviews.delete(video);
    try {
      await video.play();
      if (previewMedia === video) $('previewResume').hidden = true;
    } catch (_) {
      blockedPreviews.add(video);
      $('previewHint').textContent = 'Não foi possível iniciar a prévia neste aparelho.';
    }
  });

  function renderUploads() {
    uploads.forEach((entry, index) => {
      entry.nameNode.textContent = entry.file.name;
      entry.statusNode.textContent = entry.message;
      entry.statusNode.classList.toggle('is-error', entry.status === 'error');
      entry.removeButton.disabled = entry.status === 'uploading';
      place($('uploads'), entry.row, index);
    });
    $('uploadSend').textContent = uploadBusy ? 'Enviando…' : 'Enviar pendentes';
    $('uploadSend').dataset.unavailable = String(uploadBusy || !uploads.some((entry) => entry.status === 'pending') ||
      typeof window.fbsLive?.upload !== 'function');
    refreshAvailability();
  }

  $('files').addEventListener('change', () => {
    const files = Array.from($('files').files || []);
    $('files').value = '';
    if (!canOperate()) {
      announce('Aguarde a conexão com o computador.', true);
      return;
    }
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']);
    const rejected = [];
    files.forEach((file) => {
      if (!/\.(png|jpe?g|gif|webp|mp4|webm)$/i.test(file.name) || (file.type && !allowedTypes.has(file.type.toLowerCase()))) {
        rejected.push(file.name);
        return;
      }
      const entry = { file, status: 'pending', message: 'Aguardando envio' };
      entry.row = element('li', 'upload-item');
      entry.nameNode = element('p', 'upload-name');
      entry.statusNode = element('p', 'muted small');
      const info = element('div');
      info.append(entry.nameNode, entry.statusNode);
      entry.removeButton = button('Descartar', () => confirmAction(
        'Descartar “' + entry.file.name + '” desta lista de envio?',
        () => {
          if (entry.status === 'uploading') return;
          const index = uploads.indexOf(entry);
          if (index >= 0) uploads.splice(index, 1);
          entry.row.remove();
          renderUploads();
        }, entry.removeButton, false
      ), false);
      entry.row.append(info, entry.removeButton);
      uploads.push(entry);
    });
    renderUploads();
    announce(rejected.length ? 'Formato não aceito: ' + rejected.join(', ') : 'Arquivos preparados. Toque em “Enviar pendentes”.', rejected.length > 0);
  });

  $('uploadSend').addEventListener('click', async () => {
    if (uploadBusy) return;
    if (!canOperate() || typeof window.fbsLive?.upload !== 'function') {
      announce('O envio está indisponível. Confira a conexão com o computador.', true);
      return;
    }
    const batch = uploads.filter((entry) => entry.status === 'pending');
    if (!batch.length) return;
    uploadBusy = true;
    let sent = 0;
    let failures = 0;
    renderUploads();
    try {
      for (const entry of batch) {
        if (!canOperate()) break;
        if (!uploads.includes(entry)) continue;
        entry.status = 'uploading';
        entry.message = 'Enviando…';
        renderUploads();
        try {
          await window.fbsLive.upload(entry.file);
          entry.status = 'sent';
          entry.message = 'Enviado ao computador';
          sent += 1;
        } catch (error) {
          entry.status = 'error';
          entry.message = readableError(error);
          failures += 1;
        }
        renderUploads();
      }
    } finally {
      uploadBusy = false;
      renderUploads();
      const remaining = uploads.filter((entry) => entry.status === 'pending').length;
      announce(sent + ' enviado(s)' + (failures ? ' · ' + failures + ' falha(s); confira a lista.' : '.') +
        (remaining ? ' ' + remaining + ' pendente(s). Retome o envio quando a conexão e a edição estiverem disponíveis.' : ''), failures > 0);
    }
  });

  $('play').addEventListener('click', () => void command({ action: state.running && !state.paused ? 'pause' : 'play' }, $('play')));
  [['previous', 'previous'], ['next', 'next'],
    ['showLogo', 'logo'], ['blackout', 'blackout']].forEach(([id, action]) => {
    $(id).addEventListener('click', () => void command({ action }, $(id)));
  });
  $('loop').addEventListener('click', () => void command({ action: 'loop', value: !state.loop }, $('loop')));
  $('lock').addEventListener('click', () => void command({ action: 'lock', value: !state.locked }, $('lock')));
  $('addRule').addEventListener('click', () => void command({ action: 'addRule' }, $('addRule')));
  $('clear').addEventListener('click', () => confirmAction(
    'Remover todas as mídias da fila? Esta ação não pode ser desfeita.',
    () => command({ action: 'clear' }, $('clear')), $('clear')
  ));

  function updateClock() {
    let seconds = state.elapsed || 0;
    if (canOperate() && state.running && !state.paused && !state.connection.blocked) seconds += (performance.now() - receivedAt) / 1000;
    const item = state.playlist.find(x => sameId(x.id, state.currentId));
    $('elapsed').textContent = clock(item?.duration ? Math.min(seconds, item.duration) : seconds);
  }
  setInterval(updateClock, 500);
  function render() {
    preserveFocus(() => {
      updateClock();
      $('playbackStatus').textContent = state.paused ? 'Pausado' : state.running ? 'Reproduzindo' : 'Parado';
      $('play').textContent = state.paused ? 'Retomar' : state.running ? 'Pausar' : 'Reproduzir';
      $('play').dataset.unavailable = String(state.playlist.length === 0);
      $('previous').dataset.unavailable = String(state.playlist.length === 0);
      $('next').dataset.unavailable = String(state.playlist.length === 0);
      $('loop').textContent = state.loop ? 'Repetir: sim' : 'Repetir: não';
      $('loop').setAttribute('aria-pressed', String(state.loop === true));
      $('lock').textContent = state.locked ? 'Desbloquear' : 'Bloquear';
      $('lock').setAttribute('aria-pressed', String(state.locked === true));
      $('lockHint').hidden = state.locked !== true;
      const description = [state.connection.name, state.connection.message]
        .filter((value) => typeof value === 'string' && value.trim()).join(' · ');
      $('connectionDetails').textContent = description || (canOperate() ? 'Conectado ao palco.' : 'Aguardando conexão com o palco.');
      $('connectionDetails').classList.toggle('is-error', state.connection.blocked === true);
      renderMedia();
      renderRules();
      renderDisplays();
      renderPreview();
      renderUploads();
      refreshAvailability();
    });
  }

  window.addEventListener('fbs-state', (event) => {
    const incoming = event.detail;
    if (!incoming || typeof incoming !== 'object') return;
    state = {
      ...incoming,
      playlist: records(incoming.playlist),
      rules: records(incoming.rules),
      displays: records(incoming.displays),
      connection: incoming.connection && typeof incoming.connection === 'object'
        ? incoming.connection : { blocked: true },
      output: incoming.output && typeof incoming.output === 'object' ? incoming.output : null
    };
    receivedAt = performance.now();
    needsSnapshot = false;
    render();
  });

  window.addEventListener('fbs-disconnected', () => {
    needsSnapshot = true;
    announce('Conexão interrompida. Aguarde a reconexão para operar.', true);
    render();
  });
  window.addEventListener('online', () => render());
  new MutationObserver(() => {
    if (session.hidden) needsSnapshot = true;
    render();
  }).observe(session, { attributes: true, attributeFilter: ['hidden'] });

  render();
})();
