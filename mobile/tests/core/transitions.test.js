import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRANSITIONS, DEFAULT_TRANSITION, normalizeTransition, transitionFor } from '../../www/app/core/transitions.js';

test('TRANSITIONS preserva os nomes usados pelo desktop (control.js linhas 63-67, 338)', () => {
  assert.deepEqual(TRANSITIONS, ['cut', 'fade', 'slide-left', 'slide-up', 'zoom']);
});

test('normalizeTransition preserva valores conhecidos', () => {
  for (const t of TRANSITIONS) assert.equal(normalizeTransition(t), t);
});

test('normalizeTransition normaliza valor desconhecido para string vazia (não lança)', () => {
  assert.equal(normalizeTransition('wipe'), '');
  assert.equal(normalizeTransition(''), '');
  assert.equal(normalizeTransition(undefined), '');
  assert.equal(normalizeTransition(null), '');
  assert.equal(normalizeTransition(42), '');
});

test('transitionFor: transição do item tem prioridade (reproduz control.js linha 46-48)', () => {
  assert.equal(transitionFor({ transition: 'zoom' }, 'fade'), 'zoom');
});

test('transitionFor: usa a transição da regra de horário quando o item não define uma', () => {
  assert.equal(transitionFor({ transition: '' }, 'slide-left'), 'slide-left');
  assert.equal(transitionFor({}, 'slide-up'), 'slide-up');
});

test('transitionFor: fallback seguro para o padrão "fade" quando nada está definido', () => {
  assert.equal(transitionFor({ transition: '' }, undefined), DEFAULT_TRANSITION);
  assert.equal(transitionFor({}, null), DEFAULT_TRANSITION);
});

test('transitionFor: normaliza valores desconhecidos em vez de propagá-los', () => {
  assert.equal(transitionFor({ transition: 'wipe' }, 'zoom'), 'zoom');
  assert.equal(transitionFor({ transition: 'wipe' }, 'also-invalid'), DEFAULT_TRANSITION);
});
