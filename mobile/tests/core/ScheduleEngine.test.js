import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleEngine, activeRule, secondsUntil, isValidRule } from '../../www/app/core/ScheduleEngine.js';

function makeItem(id, overrides = {}) {
  return {
    id,
    media: { storage: 'sandbox', relPath: `library/${id}.jpg`, mime: 'image/jpeg', bytes: 10 },
    name: `${id}.jpg`,
    type: 'image',
    duration: 10,
    transition: '',
    fit: 'contain',
    startAt: '',
    ...overrides,
  };
}

test('activeRule: horário antes da regra não corresponde', () => {
  const rules = [{ start: '19:00', end: '20:00', transition: 'fade' }];
  assert.equal(activeRule(rules, '18:59'), null);
});

test('activeRule: horário dentro da regra corresponde', () => {
  const rules = [{ start: '19:00', end: '20:00', transition: 'fade' }];
  assert.equal(activeRule(rules, '19:30')?.transition, 'fade');
});

test('activeRule: horário depois da regra não corresponde', () => {
  const rules = [{ start: '19:00', end: '20:00', transition: 'fade' }];
  assert.equal(activeRule(rules, '20:01'), null);
});

test('activeRule: fronteira exata — start é inclusivo, end é exclusivo', () => {
  const rules = [{ start: '19:00', end: '20:00', transition: 'fade' }];
  assert.equal(activeRule(rules, '19:00')?.transition, 'fade');
  assert.equal(activeRule(rules, '20:00'), null);
});

test('activeRule: regra atravessando meia-noite reproduz a limitação do desktop (não suportada)', () => {
  // Documentado em ScheduleEngine.js: comparação léxica de strings "HH:MM"
  // não reconhece corretamente uma regra start="23:00" end="01:00" como
  // ativa depois da meia-noite. Divergência intencional: preserva o mesmo
  // comportamento do desktop em vez de inventar suporte não solicitado.
  const rules = [{ start: '23:00', end: '01:00', transition: 'zoom' }];
  assert.equal(activeRule(rules, '23:30'), null);
  assert.equal(activeRule(rules, '00:30'), null);
});

test('activeRule: regra inválida é ignorada silenciosamente, sem lançar', () => {
  const rules = [{ start: 'não-é-hora', end: '20:00', transition: 'fade' }, null, { start: '19:00' }];
  assert.doesNotThrow(() => activeRule(rules, '19:30'));
  assert.equal(activeRule(rules, '19:30'), null);
});

test('isValidRule valida formato HH:MM de start/end', () => {
  assert.equal(isValidRule({ start: '19:00', end: '20:00' }), true);
  assert.equal(isValidRule({ start: '19:0', end: '20:00' }), false);
  assert.equal(isValidRule(null), false);
});

test('activeRule: múltiplas regras — primeira correspondência na ordem da lista vence', () => {
  const rules = [
    { start: '08:00', end: '22:00', transition: 'cut' },
    { start: '19:00', end: '20:00', transition: 'fade' },
  ];
  assert.equal(activeRule(rules, '19:30')?.transition, 'cut');
});

test('activeRule: nenhum agendamento (rules vazio) retorna null', () => {
  assert.equal(activeRule([], '19:30'), null);
});

test('secondsUntil: horário vazio retorna Infinity', () => {
  assert.equal(secondsUntil(''), Infinity);
  assert.equal(secondsUntil(null), Infinity);
});

test('secondsUntil: calcula segundos até o horário informado', () => {
  const now = new Date(2026, 0, 1, 10, 0, 0);
  assert.equal(secondsUntil('10:00:30', now), 30);
  assert.equal(secondsUntil('09:59:30', now), -30);
});

test('ScheduleEngine.evaluate: item agendado "em breve" (<=30s) recebe estado soon', () => {
  const now = new Date(2026, 0, 1, 10, 0, 0);
  const engine = new ScheduleEngine();
  const playlist = [makeItem('a', { startAt: '10:00:20' })];
  const { states, due } = engine.evaluate(playlist, null, now);
  assert.equal(states.get('a').kind, 'soon');
  assert.equal(due, null);
});

test('ScheduleEngine.evaluate: item com left=0 é retornado como "due" uma única vez por chave', () => {
  const now = new Date(2026, 0, 1, 10, 0, 0);
  const engine = new ScheduleEngine();
  const playlist = [makeItem('a', { startAt: '10:00:00' })];
  const first = engine.evaluate(playlist, null, now);
  assert.equal(first.due?.id, 'a');
  const second = engine.evaluate(playlist, null, now);
  assert.equal(second.due, null); // mesma chave já processada
});

test('ScheduleEngine.evaluate: item ao vivo (currentId) com startAt recebe estado "live"', () => {
  const now = new Date(2026, 0, 1, 10, 0, 0);
  const engine = new ScheduleEngine();
  const playlist = [makeItem('a', { startAt: '09:00:00' })];
  const { states } = engine.evaluate(playlist, 'a', now);
  assert.equal(states.get('a').kind, 'live');
});

test('ScheduleEngine.evaluate: nenhum agendamento (sem startAt) resulta em states vazio e due=null', () => {
  const now = new Date(2026, 0, 1, 10, 0, 0);
  const engine = new ScheduleEngine();
  const playlist = [makeItem('a'), makeItem('b')];
  const { states, due } = engine.evaluate(playlist, null, now);
  assert.equal(states.size, 0);
  assert.equal(due, null);
});

test('ScheduleEngine.activeRuleTransition expõe a transição da regra ativa', () => {
  const engine = new ScheduleEngine([{ start: '19:00', end: '20:00', transition: 'zoom' }]);
  assert.equal(engine.activeRuleTransition('19:30'), 'zoom');
  assert.equal(engine.activeRuleTransition('06:00'), undefined);
});
