// Motor de agendamento. Extraído/adaptado de src/control.js:
// activeRule (42-45), secondsUntil (426-432), checkSchedule (433-470).
// Núcleo puro: sem Electron, Capacitor ou DOM. A aplicação visual do estado
// (applyScheduleState, linhas 471-489) é responsabilidade da UI (Etapa 5).

/**
 * Valida o formato mínimo de uma regra (start/end em "HH:MM"). O desktop
 * não valida isso — assume dados bem formados vindos da própria UI. Esta
 * validação defensiva é uma DIVERGÊNCIA INTENCIONAL: dados persistidos em
 * disco no mobile podem ser corrompidos externamente; regras inválidas são
 * silenciosamente ignoradas (não lançam erro) em vez de quebrar o cálculo.
 */
export function isValidRule(rule) {
  return (
    !!rule &&
    typeof rule.start === 'string' &&
    typeof rule.end === 'string' &&
    /^\d{2}:\d{2}$/.test(rule.start) &&
    /^\d{2}:\d{2}$/.test(rule.end)
  );
}

/**
 * Reproduz activeRule() — desktop linhas 42-45 — via comparação léxica de
 * strings "HH:MM", idêntica ao desktop.
 *
 * DIVERGÊNCIA/LIMITAÇÃO PRESERVADA INTENCIONALMENTE: assim como no desktop,
 * uma regra que atravessa a meia-noite (ex.: start="23:00", end="01:00")
 * NÃO é corretamente reconhecida como ativa após a meia-noite, porque a
 * comparação de strings "00:30" < "23:00" já falha na primeira condição.
 * O desktop nunca tratou esse caso; o mobile reproduz o mesmo
 * comportamento em vez de inventar suporte não solicitado.
 */
export function activeRule(rules, nowHHMM) {
  if (!Array.isArray(rules)) return null;
  return rules.find((r) => isValidRule(r) && r.start <= nowHHMM && nowHHMM < r.end) || null;
}

/** Reproduz secondsUntil() — desktop linhas 426-432. */
export function secondsUntil(time, now = new Date()) {
  if (!time) return Infinity;
  const parts = String(time).split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return Infinity;
  const target = new Date(now);
  target.setHours(parts[0], parts[1] ?? 0, parts[2] ?? 0, 0);
  return Math.ceil((target - now) / 1000);
}

export class ScheduleEngine {
  constructor(rules = []) {
    this.rules = Array.isArray(rules) ? rules : [];
    this._dueKey = '';
  }

  setRules(rules) {
    this.rules = Array.isArray(rules) ? rules : [];
  }

  activeRule(nowHHMM) {
    return activeRule(this.rules, nowHHMM);
  }

  /** Regra ativa como transição, para alimentar transitions.transitionFor(). */
  activeRuleTransition(nowHHMM) {
    return this.activeRule(nowHHMM)?.transition;
  }

  /**
   * Reproduz checkSchedule() — desktop linhas 433-470 — sem tocar o DOM.
   * Retorna { states, due } onde `states` é um Map(id -> {kind, text}) igual
   * ao scheduleState do desktop, e `due` é o item que deve entrar no ar
   * agora (ou null). A deduplicação por `scheduleKey` (linhas 462-467) é
   * preservada para não disparar o mesmo agendamento duas vezes.
   */
  evaluate(playlist, currentId, now = new Date()) {
    const scheduled = playlist
      .map((item, index) => ({ item, index, left: secondsUntil(item.startAt, now) }))
      .filter((x) => Number.isFinite(x.left) && x.left >= 0)
      .sort((a, b) => a.left - b.left || a.index - b.index);

    const states = new Map();
    const live = playlist.find((x) => x.id === currentId);
    if (live?.startAt) states.set(live.id, { kind: 'live', text: 'NO AR' });

    scheduled.forEach((x, n) => {
      if (x.left <= 30) {
        states.set(x.item.id, { kind: 'soon', text: `ENTRA EM ${x.left}s` });
      } else if (n === 0) {
        states.set(x.item.id, { kind: 'next', text: '→ PRÓXIMO AGENDADO' });
      } else if (n === 1) {
        states.set(x.item.id, { kind: 'next', text: '→ DEPOIS' });
      }
    });

    const due = scheduled.find((x) => x.left === 0);
    const key = due ? `${now.toDateString()}-${due.item.id}-${due.item.startAt}` : '';
    let dueItem = null;
    if (due && key !== this._dueKey) {
      this._dueKey = key;
      dueItem = due.item;
    }
    return { states, due: dueItem };
  }

  reset() {
    this._dueKey = '';
  }
}
