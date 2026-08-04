// Teste de arquitetura obrigatório da Etapa 1: garante que nenhum módulo do
// core referencia, em código executável, Electron, Capacitor, DOM/window,
// ou fs/file:/// diretamente. Comentários e strings de documentação (ex.:
// a checagem de "file://" em models.js) são desconsiderados via remoção de
// comentários antes da varredura, para evitar falso positivo — a própria
// menção textual nesta descrição não é código executável.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_DIR = path.resolve(__dirname, '../../www/app/core');

const FORBIDDEN_PATTERNS = [
  { name: 'require("electron")', pattern: /require\(\s*['"]electron['"]\s*\)/ },
  { name: 'import from "electron"', pattern: /from\s+['"]electron['"]/ },
  { name: '@capacitor/*', pattern: /@capacitor\// },
  { name: 'window.*', pattern: /\bwindow\s*[.[]/ },
  { name: 'document.*', pattern: /\bdocument\s*[.[]/ },
  { name: 'ipcMain', pattern: /\bipcMain\b/ },
  { name: 'ipcRenderer', pattern: /\bipcRenderer\b/ },
  { name: 'BrowserWindow', pattern: /\bBrowserWindow\b/ },
  { name: 'require("fs")', pattern: /require\(\s*['"]fs['"]\s*\)/ },
  { name: 'import from "fs"', pattern: /from\s+['"]fs['"]/ },
  { name: 'require("node:fs")', pattern: /require\(\s*['"]node:fs['"]\s*\)/ },
  { name: 'import from "node:fs"', pattern: /from\s+['"]node:fs['"]/ },
  { name: 'file:/// literal', pattern: /file:\/\/\// },
];

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function listCoreJsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCoreJsFiles(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

test('core não contém, em código executável, referências a Electron/Capacitor/DOM/fs', () => {
  const files = listCoreJsFiles(CORE_DIR);
  assert.ok(files.length > 0, `nenhum arquivo .js encontrado em ${CORE_DIR}`);

  const violations = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw);
    for (const { name, pattern } of FORBIDDEN_PATTERNS) {
      if (pattern.test(code)) {
        violations.push(`${path.relative(CORE_DIR, file)} contém referência proibida: ${name}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('core não depende de nenhum pacote externo declarado (sem "dependencies" em código puro)', () => {
  const files = listCoreJsFiles(CORE_DIR);
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    const importSpecifiers = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of importSpecifiers) {
      assert.ok(
        spec.startsWith('./') || spec.startsWith('../'),
        `${path.relative(CORE_DIR, file)} importa um módulo externo não permitido no core: "${spec}"`,
      );
    }
  }
});
