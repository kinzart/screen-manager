'use strict';

// Painel da tela na Central: estado/telemetria, comandos remotos, controle manual e programação (fila de sessões).
// Script clássico carregado após studio.js; reutiliza api, mutate, element, button, announce, listFor e get.
(function () {
  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ORIGINS = { program: 'Programação', override: 'Controle manual', route: 'Rota do mapa' };
  const COMMAND_STATUS = {
    accepted: 'aceito pela central', delivered: 'recebido pela tela', executed: 'executado pela tela', failed: 'falhou na tela'
  };
  const ACTIONS = {
    play: 'Reproduzir', pause: 'Pausar', stop: 'Parar', restart: 'Reiniciar', 'next-session': 'Próxima sessão',
    'previous-session': 'Sessão anterior', 'start-entry': 'Iniciar entrada', 'next-item': 'Próxima mídia',
    'previous-item': 'Mídia anterior', take: 'Assumir sessão', release: 'Liberar controle manual'
  };
  let draft = null;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  function heading(text, id) {
    const node = element('h3', 'section-title', text);
    if (id) node.id = id;
    return node;
  }

  function option(select, value, label, current) {
    const node = new Option(label, value, false, value === current);
    select.add(node);
  }

  function field(label, control, hint) {
    const wrapper = element('label', 'program-field');
    wrapper.append(element('span', 'field-label', label), control);
    if (hint) wrapper.append(element('small', 'field-hint', hint));
    return wrapper;
  }

  function choice(options, value, onChange, test) {
    const select = element('select');
    for (const [key, label] of options) option(select, key, label, value);
    if (test) select.dataset.testid = test;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function relative(ms) {
    if (!ms) return 'nunca';
    const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 60) return 'há ' + seconds + ' s';
    if (seconds < 3600) return 'há ' + Math.round(seconds / 60) + ' min';
    return new Date(ms).toLocaleString('pt-BR');
  }

  function clock(ms) {
    return ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  }

  function localInput(ms) {
    if (!ms) return '';
    const date = new Date(ms);
    const pad = (value) => String(value).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function fromLocalInput(value) {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }

  function screenCommand(screen, action, extra) {
    return mutate(() => api('/screens/' + screen.id + '/commands', 'POST', Object.assign({ commandId: uuid(), action: action }, extra || {})),
      () => announce(ACTIONS[action] + ': comando enviado.'));
  }

  // ---------------------------------------------------------------- estado
  function renderStatus(screen) {
    const list = $('screen-status-grid');
    if (!list) return;
    const telemetry = screen.telemetry || screen.lastTelemetry;
    const session = screen.sourceId && get('playlist', screen.sourceId);
    const output = screen.output;
    const rows = [
      ['Conexão', screen.online ? 'Online · ' + relative(screen.lastSeenAt) : 'Offline · última comunicação ' + relative(screen.lastSeenAt), screen.online ? 'ok' : 'warn'],
      ['Origem', ORIGINS[screen.origin] || 'Rota do mapa'],
      ['Sessão no ar', session ? session.name : 'Nenhuma'],
      ['Mídia atual', output && output.item ? output.item.name + ' · ' + formatTime(output.positionMs) + ' de ' + formatTime(output.item.durationMs)
        : output && output.mode !== 'media' ? (output.mode === 'logo' ? 'Logotipo' : 'Tela preta') : 'Nenhuma'],
      ['Reprodução', { playing: 'Confirmada pela tela', paused: 'Pausada na tela', syncing: 'Aguardando confirmação', 'waiting-media': 'Aguardando mídia obrigatória',
        error: 'Erro na tela', waiting: 'Tela desconectada', idle: 'Ociosa', blackout: 'Tela preta', logo: 'Logotipo' }[screen.status] || screen.status,
        screen.status === 'error' || screen.status === 'waiting-media' ? 'warn' : ''],
    ];
    const state = screen.programState;
    if (state) {
      rows.push(['Programação', state.status === 'disabled' ? 'Desativada' : { playing: 'Em execução', paused: 'Pausada', stopped: 'Parada', error: 'Erro: ' + state.error }[state.status] || state.status,
        state.status === 'error' ? 'warn' : '']);
      if (state.nextChangeMs) rows.push(['Próxima troca', clock(state.nextChangeMs)]);
      if (state.pending) rows.push(['Pendente', 'Entrada aguardando o fim da atual']);
    }
    if (screen.lastCommand) {
      rows.push(['Último comando', (ACTIONS[screen.lastCommand.action] || screen.lastCommand.action) + ' · ' + (COMMAND_STATUS[screen.lastCommand.status] || screen.lastCommand.status),
        screen.lastCommand.status === 'failed' ? 'warn' : screen.lastCommand.status === 'executed' ? 'ok' : '']);
    }
    if (screen.device) rows.push(['Aparelho', (screen.device.app || '') + ' ' + (screen.device.version || '') + (screen.device.revokedAt ? ' · revogado' : '')]);
    if (telemetry) {
      const cache = telemetry.cache || {};
      rows.push(['Cache', cache.supported ? cache.ready + ' de ' + cache.total + ' mídias · ' + readableSize(cache.bytesReady || 0) + ' de ' + readableSize(cache.bytesTotal || 0)
        : 'Indisponível (use HTTPS); reprodução por streaming', cache.supported && cache.ready < cache.total ? 'warn' : '']);
      if (telemetry.storage && telemetry.storage.quota) rows.push(['Armazenamento', readableSize(telemetry.storage.usage) + ' de ' + readableSize(telemetry.storage.quota)]);
      const problems = (telemetry.errors || []).concat(cache.errors || []);
      if (problems.length) rows.push(['Falhas', problems.join(' · '), 'warn']);
    }
    if (screen.ack && screen.ack.message) rows.push(['Mensagem da tela', screen.ack.message, 'warn']);
    const key = JSON.stringify(rows);
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren();
    for (const [label, value, tone] of rows) {
      const term = element('dt', '', label);
      const detail = element('dd', tone ? 'tone-' + tone : '', value);
      list.append(term, detail);
    }
  }

  // ---------------------------------------------------------------- comandos
  function buildCommands(body, screen) {
    const section = element('section', 'screen-panel');
    section.setAttribute('aria-labelledby', 'commands-title');
    section.append(heading('Comandos da tela', 'commands-title'));
    const hint = element('p', 'panel-hint', '');
    hint.id = 'commands-hint';
    const sessionRow = element('div', 'command-grid');
    const mediaRow = element('div', 'command-grid');
    const make = (action, label) => {
      const node = button(label, () => screenCommand(get('screen', screen.id), action), { test: 'screen-command-' + action });
      node.dataset.command = action;
      return node;
    };
    sessionRow.append(make('play', '▶ Reproduzir'), make('pause', 'Ⅱ Pausar'), make('stop', '■ Parar'),
      make('previous-session', '⏮ Sessão anterior'), make('next-session', 'Próxima sessão ⏭'), make('restart', '↺ Reiniciar'));
    mediaRow.append(make('previous-item', '‹ Mídia anterior'), make('next-item', 'Próxima mídia ›'));
    const take = element('div', 'take-row');
    const takeSelect = element('select');
    takeSelect.id = 'take-session';
    takeSelect.dataset.testid = 'take-session';
    take.append(field('Assumir sessão agora', takeSelect),
      button('Assumir', () => {
        if (!takeSelect.value) return announce('Escolha uma sessão para assumir.', true);
        screenCommand(get('screen', screen.id), 'take', { playlistId: takeSelect.value, until: $('take-until').value });
      }, { className: 'primary', test: 'take-submit' }));
    const release = button('Liberar', () => screenCommand(get('screen', screen.id), 'release'), { test: 'take-release' });
    release.id = 'take-release';
    take.append(release);
    const until = choice([['manual', 'Até liberar'], ['next-trigger', 'Até o próximo horário']], 'manual', () => {});
    until.id = 'take-until';
    take.append(field('Duração', until));
    section.append(hint, sessionRow, mediaRow, take);
    body.append(section);
  }

  function syncCommands(screen) {
    const state = screen.programState;
    const program = Boolean(state && state.enabled);
    const override = Boolean(state && state.override);
    const enabled = program || override;
    for (const node of document.querySelectorAll('[data-command]')) node.disabled = !enabled || (override && !program && !['play', 'pause', 'next-item', 'previous-item'].includes(node.dataset.command));
    setText($('commands-hint'), enabled ? (override ? 'Controle manual ativo. Liberar devolve a tela à programação no ponto atual da agenda.' : 'Os comandos valem só para esta tela.')
      : 'Salve uma programação ou assuma uma sessão para controlar esta tela individualmente. A rota do mapa segue o controle da sessão.');
    const select = $('take-session');
    const sessions = listFor('playlist');
    const key = JSON.stringify(sessions.map((item) => [item.id, item.name]));
    if (select && select.dataset.key !== key) {
      select.dataset.key = key;
      const current = select.value;
      select.replaceChildren(new Option('Escolha uma sessão', ''));
      for (const item of sessions) option(select, item.id, item.name, current);
    }
    $('take-release').disabled = !override;
  }

  // ---------------------------------------------------------------- programação
  function fromScreen(screen) {
    const program = screen.program;
    return {
      screenId: screen.id, version: screen.version, dirty: false, exists: Boolean(program),
      program: program ? JSON.parse(JSON.stringify({
        timezone: program.timezone, endBehavior: program.endBehavior, idleOutput: program.idleOutput,
        fallback: program.fallback, enabled: program.enabled, entries: program.entries
      })) : { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo', endBehavior: 'stop', idleOutput: 'route', fallback: 'stream', enabled: true, entries: [] }
    };
  }

  function touch(structural) {
    draft.dirty = true;
    $('program-save').disabled = false;
    $('program-discard').disabled = false;
    setText($('program-dirty'), 'Alterações não salvas');
    if (structural) renderEditor();
  }

  function entryCard(entry, index, total) {
    const card = element('li', 'program-entry');
    card.dataset.testid = 'program-entry';
    const top = element('div', 'entry-top');
    top.append(element('span', 'entry-index', String(index + 1)));
    const sessions = listFor('playlist').map((item) => [item.id, item.name]);
    if (!sessions.some(([id]) => id === entry.playlistId)) sessions.unshift([entry.playlistId || '', 'Escolha uma sessão']);
    const session = choice(sessions, entry.playlistId, (value) => { entry.playlistId = value; touch(false); }, 'entry-session');
    session.setAttribute('aria-label', 'Sessão da entrada ' + (index + 1));
    top.append(session);
    const tools = element('div', 'entry-tools');
    const move = (delta) => {
      const list = draft.program.entries;
      const [item] = list.splice(index, 1);
      list.splice(index + delta, 0, item);
      touch(true);
    };
    tools.append(
      button('↑', () => move(-1), { title: 'Mover entrada ' + (index + 1) + ' para cima', disabled: index === 0 }),
      button('↓', () => move(1), { title: 'Mover entrada ' + (index + 1) + ' para baixo', disabled: index === total - 1 }),
      button('×', () => { draft.program.entries.splice(index, 1); touch(true); }, { title: 'Remover entrada ' + (index + 1), className: 'danger' }));
    top.append(tools);
    card.append(top);

    const grid = element('div', 'entry-grid');
    const start = entry.start || { type: 'sequence' };
    grid.append(field('Início', choice([['sequence', 'Na sequência'], ['daily', 'Todo dia no horário'], ['at', 'Em data e hora']], start.type, (value) => {
      entry.start = value === 'daily' ? { type: 'daily', time: '09:00', days: null } : value === 'at' ? { type: 'at', atMs: Date.now() + 3600000 } : { type: 'sequence' };
      touch(true);
    }, 'entry-start')));
    if (start.type === 'daily') {
      const time = element('input');
      time.type = 'time';
      time.step = 1;
      time.value = start.time;
      time.addEventListener('change', () => { start.time = time.value.length === 5 || time.value.length === 8 ? time.value : start.time; touch(false); });
      grid.append(field('Horário (' + draft.program.timezone + ')', time));
      const days = element('fieldset', 'day-picker');
      days.append(element('legend', '', 'Dias'));
      DAYS.forEach((name, day) => {
        const label = element('label', 'day');
        const box = element('input');
        box.type = 'checkbox';
        box.checked = !start.days || start.days.includes(day);
        box.addEventListener('change', () => {
          const selected = DAYS.map((_, value) => value).filter((value) => days.querySelectorAll('input')[value].checked);
          start.days = selected.length === 7 ? null : selected.length ? selected : start.days;
          if (!selected.length) box.checked = true;
          touch(false);
        });
        label.append(box, element('span', '', name));
        days.append(label);
      });
      grid.append(days);
    } else if (start.type === 'at') {
      const at = element('input');
      at.type = 'datetime-local';
      at.value = localInput(start.atMs);
      at.addEventListener('change', () => { const value = fromLocalInput(at.value); if (value) { start.atMs = value; touch(false); } });
      grid.append(field('Data e hora (deste aparelho)', at));
    }
    const repeat = entry.repeat || { mode: 'once' };
    grid.append(field('Repetição', choice([['once', 'Uma vez'], ['count', 'Número de vezes'], ['loop', 'Em loop']], repeat.mode, (value) => {
      entry.repeat = value === 'count' ? { mode: 'count', count: 2 } : { mode: value };
      touch(true);
    }, 'entry-repeat')));
    if (repeat.mode === 'count') {
      const count = element('input');
      count.type = 'number';
      count.min = 1;
      count.max = 1000;
      count.value = repeat.count;
      count.addEventListener('change', () => { repeat.count = Math.max(1, Math.min(1000, Math.round(Number(count.value) || 1))); touch(false); });
      grid.append(field('Vezes', count));
    }
    const limit = element('input');
    limit.type = 'number';
    limit.min = 0;
    limit.step = 'any';
    limit.placeholder = 'Sem limite';
    limit.value = entry.endAfterMs ? String(entry.endAfterMs / 60000) : '';
    limit.addEventListener('change', () => {
      const minutes = Number(limit.value);
      entry.endAfterMs = limit.value && minutes > 0 ? Math.max(1000, Math.round(minutes * 60000)) : null;
      touch(false);
    });
    grid.append(field('Duração máxima (min)', limit, repeat.mode === 'loop' ? 'Necessária se houver sessões depois deste loop.' : ''));
    if (start.type !== 'sequence') {
      grid.append(field('Interrupção', choice([['immediate', 'Imediata'], ['after-item', 'Ao fim da mídia atual'], ['after-session', 'Ao fim da sessão atual']],
        entry.interrupt || 'immediate', (value) => { entry.interrupt = value; touch(false); })));
    }
    grid.append(field('Ao terminar', choice([['next', 'Seguir para a próxima'], ['stop', 'Parar a programação']], entry.onEnd || 'next', (value) => { entry.onEnd = value; touch(false); })));
    const more = element('details', 'entry-more');
    more.append(element('summary', '', 'Mais opções'));
    const priority = element('input');
    priority.type = 'number';
    priority.min = 0;
    priority.max = 100;
    priority.value = entry.priority === undefined ? 50 : entry.priority;
    priority.addEventListener('change', () => { entry.priority = Math.max(0, Math.min(100, Math.round(Number(priority.value) || 0))); touch(false); });
    const validFrom = element('input');
    validFrom.type = 'datetime-local';
    validFrom.value = localInput(entry.validFromMs);
    validFrom.addEventListener('change', () => { entry.validFromMs = fromLocalInput(validFrom.value); touch(false); });
    const validUntil = element('input');
    validUntil.type = 'datetime-local';
    validUntil.value = localInput(entry.validUntilMs);
    validUntil.addEventListener('change', () => { entry.validUntilMs = fromLocalInput(validUntil.value); touch(false); });
    const required = element('input');
    required.type = 'checkbox';
    required.checked = Boolean(entry.required);
    required.addEventListener('change', () => { entry.required = required.checked; touch(false); });
    const requiredLabel = element('label', 'check');
    requiredLabel.append(required, element('span', '', 'Obrigatória: só começa com as mídias já baixadas na tela'));
    more.append(field('Prioridade (0 a 100)', priority, 'Decide conflitos entre horários.'), field('Válida a partir de', validFrom), field('Válida até', validUntil), requiredLabel);
    grid.append(more);
    card.append(grid);
    return card;
  }

  function renderEditor() {
    const root = $('program-editor-body');
    if (!root || !draft) return;
    root.replaceChildren();
    const program = draft.program;
    const options = element('div', 'entry-grid program-options');
    options.append(
      field('Ao fim da fila', choice([['stop', 'Parar'], ['repeat', 'Repetir do início']], program.endBehavior, (value) => { program.endBehavior = value; touch(false); }, 'program-end')),
      field('Sem sessão no ar', choice([['route', 'Usar a rota do mapa'], ['logo', 'Logotipo'], ['blackout', 'Tela preta'], ['idle', 'Aguardar']], program.idleOutput, (value) => { program.idleOutput = value; touch(false); })),
      field('Mídia obrigatória ausente', choice([['stream', 'Transmitir pela rede'], ['logo', 'Logotipo'], ['blackout', 'Tela preta']], program.fallback, (value) => { program.fallback = value; touch(false); })));
    const zone = element('input');
    zone.value = program.timezone;
    zone.addEventListener('change', () => { program.timezone = zone.value.trim(); touch(true); });
    options.append(field('Fuso horário', zone, 'Ex.: America/Sao_Paulo'));
    root.append(options);
    const list = element('ol', 'program-list');
    list.setAttribute('aria-label', 'Entradas da programação');
    program.entries.forEach((entry, index) => list.append(entryCard(entry, index, program.entries.length)));
    if (!program.entries.length) list.append(element('li', 'program-empty', 'Nenhuma sessão na programação. Sem programação, a tela segue a rota do mapa.'));
    root.append(list);
    const add = button('+ Adicionar sessão à programação', () => {
      const first = listFor('playlist')[0];
      if (!first) return announce('Crie uma sessão antes de programar a tela.', true);
      program.entries.push({ playlistId: first.id, repeat: { mode: 'once' }, start: { type: 'sequence' }, interrupt: 'immediate', priority: 50, onEnd: 'next', required: false, endAfterMs: null });
      touch(true);
    }, { test: 'program-add' });
    root.append(add);
  }

  function buildEditor(body, screen) {
    const section = element('section', 'screen-panel');
    section.setAttribute('aria-labelledby', 'program-title');
    section.append(heading('Programação da tela', 'program-title'),
      element('p', 'panel-hint', 'Fila de sessões desta tela: cada entrada executa uma sessão inteira. A ordem das mídias continua dentro de cada sessão.'));
    const editorBody = element('div');
    editorBody.id = 'program-editor-body';
    const footer = element('div', 'actions program-actions');
    const status = element('span', 'dirty-flag', '');
    status.id = 'program-dirty';
    status.setAttribute('role', 'status');
    const save = button('Salvar programação', () => {
      const current = get('screen', screen.id);
      const program = draft.program;
      if (program.entries.some((entry) => !entry.playlistId)) return announce('Escolha a sessão de todas as entradas.', true);
      mutate(() => api('/screens/' + screen.id + '/program', 'PUT', { version: current.version, program: program }), (updated) => {
        Object.assign(current, updated);
        draft = fromScreen(current);
        renderEditor();
        setText($('program-dirty'), 'Programação salva');
        $('program-save').disabled = true;
        $('program-discard').disabled = true;
        announce('Programação salva.');
      });
    }, { className: 'primary', test: 'program-save', disabled: true });
    save.id = 'program-save';
    const discard = button('Descartar', () => { draft = fromScreen(get('screen', screen.id)); renderEditor(); setText($('program-dirty'), ''); $('program-save').disabled = true; $('program-discard').disabled = true; }, { disabled: true });
    discard.id = 'program-discard';
    const remove = button('Remover programação', () => {
      const current = get('screen', screen.id);
      if (!current.program || !window.confirm('Remover a programação? A tela volta a seguir a rota do mapa.')) return;
      mutate(() => api('/screens/' + screen.id + '/program', 'PUT', { version: current.version, program: null }), (updated) => {
        Object.assign(current, updated);
        draft = fromScreen(current);
        renderEditor();
        announce('Programação removida.');
      });
    }, { className: 'danger', test: 'program-remove' });
    remove.id = 'program-remove';
    footer.append(save, discard, remove, status);
    section.append(editorBody, footer);
    body.append(section);
  }

  function build(body, screen) {
    const status = element('section', 'screen-panel');
    status.setAttribute('aria-labelledby', 'status-title');
    status.append(heading('Estado da tela', 'status-title'));
    const grid = element('dl', 'status-grid');
    grid.id = 'screen-status-grid';
    grid.dataset.testid = 'screen-status';
    status.append(grid);
    body.append(status);
    buildCommands(body, screen);
    buildEditor(body, screen);
    const device = button('Desconectar aparelho', () => {
      if (!window.confirm('Desconectar o aparelho desta tela? A programação e as rotas são mantidas; o aparelho precisará parear de novo.')) return;
      mutate(() => api('/screens/' + screen.id + '/revoke', 'POST', {}), () => announce('Aparelho desconectado. A tela foi mantida.'));
    }, { test: 'revoke-device' });
    const devices = element('div', 'actions');
    devices.append(device);
    body.append(devices);
    draft = null;
    sync(screen);
  }

  function sync(screen) {
    renderStatus(screen);
    syncCommands(screen);
    if (!draft || draft.screenId !== screen.id || (!draft.dirty && draft.version !== screen.version)) {
      draft = fromScreen(screen);
      renderEditor();
      const remove = $('program-remove');
      if (remove) remove.disabled = !draft.exists;
    }
  }

  window.FBSProgram = { build: build, sync: sync };
})();
