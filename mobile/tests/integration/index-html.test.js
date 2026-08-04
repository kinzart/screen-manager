// Valida a estrutura de mobile/www/index.html (fonte, não o dist/ gerado):
// elementos obrigatórios presentes e sem IDs duplicados.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.resolve(__dirname, '../../www/index.html');
const rawHtml = readFileSync(INDEX_PATH, 'utf8');
const dom = new JSDOM(rawHtml);
const doc = dom.window.document;

test('possui meta charset', () => {
  assert.ok(doc.querySelector('meta[charset]'));
});

test('possui meta viewport', () => {
  const viewport = doc.querySelector('meta[name="viewport"]');
  assert.ok(viewport);
  assert.match(viewport.getAttribute('content'), /width=device-width/);
});

test('possui meta theme-color', () => {
  assert.ok(doc.querySelector('meta[name="theme-color"]'));
});

test('possui conteúdo inicial de loading (#boot-loading)', () => {
  assert.ok(doc.getElementById('boot-loading'));
});

test('possui contêiner do editor/apresentação (#app-root, onde AppShell monta editor/playlist/transport/presenter)', () => {
  assert.ok(doc.getElementById('app-root'));
});

test('possui mensagens de erro (#boot-error e #boot-error-message)', () => {
  assert.ok(doc.getElementById('boot-error'));
  assert.ok(doc.getElementById('boot-error-message'));
});

test('possui confirmação de exclusão real (#confirm-modal com título e ações)', () => {
  assert.ok(doc.getElementById('confirm-modal'));
  assert.ok(doc.getElementById('confirm-modal-title'));
  assert.ok(doc.getElementById('confirm-modal-cancel'));
  assert.ok(doc.getElementById('confirm-modal-confirm'));
});

test('importa app/main.js como module', () => {
  const script = doc.querySelector('script[type="module"]');
  assert.ok(script);
  assert.match(script.getAttribute('src'), /main\.js$/);
});

test('referencia app.css e presenter.css', () => {
  const hrefs = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
  assert.ok(hrefs.some((h) => h.includes('app.css')));
  assert.ok(hrefs.some((h) => h.includes('presenter.css')));
});

test('não possui IDs duplicados', () => {
  const ids = [...doc.querySelectorAll('[id]')].map((el) => el.id);
  const seen = new Set();
  const duplicates = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  assert.deepEqual(duplicates, []);
});
