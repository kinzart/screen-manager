#!/usr/bin/env node

import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowMissing = process.argv.includes('--allow-missing');
const requestedOutput = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--'));
const output = path.resolve(projectRoot, requestedOutput || path.join('dist', 'usb-bundle'));

const exists = async file => fs.access(file).then(() => true, () => false);
const unique = values => [...new Set(values)];
function versionOf(file) {
  const match = path.basename(file).match(/(\d+\.\d+\.\d+)/);
  return match ? match[1].split('.').map(Number) : [0, 0, 0];
}
function compareVersion(a, b) {
  const av = versionOf(a), bv = versionOf(b);
  for (let index = 0; index < 3; index++) if (av[index] !== bv[index]) return av[index] - bv[index];
  return a.localeCompare(b);
}
function latestBy(files, key) {
  const selected = new Map();
  for (const file of files) {
    const group = key(file);
    const previous = selected.get(group);
    if (!previous || compareVersion(file, previous) > 0) selected.set(group, file);
  }
  return [...selected.values()].sort();
}

async function filesUnder(root, predicate) {
  if (!(await exists(root))) return [];
  const found = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (predicate(file)) found.push(file);
    }
  }
  await visit(root);
  return found;
}

async function copyIfNew(source, destination, copied) {
  const target = path.join(output, destination);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  copied.push({ source, target });
}

async function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

const copied = [];
const missing = [];
const roots = [path.join(projectRoot, 'dist'), path.join(projectRoot, 'mobile', 'android', 'app', 'build', 'outputs')];
const allBuildFiles = unique((await Promise.all(roots.map(root => filesUnder(root, file => /\.(exe|AppImage|deb|apk|aab)$/i.test(file))))).flat());

const windows = latestBy(allBuildFiles.filter(file => /^FBS Screen Manager Setup .*\.exe$/i.test(path.basename(file))), () => 'windows');
const linux = latestBy(allBuildFiles.filter(file => /\.(AppImage|deb)$/i.test(file)), file => {
  const match = path.basename(file).match(/^fbs-screen-manager-\d+\.\d+\.\d+-([^.]+)\.(AppImage|deb)$/i);
  return match ? `${match[2]}-${match[1]}` : path.basename(file);
});
const android = latestBy(allBuildFiles.filter(file => /\.(apk|aab)$/i.test(file)), file => path.basename(file));

for (const source of windows) await copyIfNew(source, path.join('windows', path.basename(source)), copied);
for (const source of linux) await copyIfNew(source, path.join('linux', path.basename(source)), copied);
for (const source of android) await copyIfNew(source, path.join('android', path.basename(source)), copied);

const docs = [
  ['README.md', 'README.md'],
  ['MANUAL_USUARIO.md', 'MANUAL_USUARIO.md'],
  ['docs/PROJETOR_LUBUNTU.md', 'PROJETOR_LUBUNTU.md'],
  ['docs/PENDRIVE_PROJETOR.md', 'PENDRIVE_PROJETOR.md']
];
for (const [source, destination] of docs) {
  const file = path.join(projectRoot, source);
  if (await exists(file)) await copyIfNew(file, path.join('docs', destination), copied);
  else missing.push(source);
}

if (!windows.length) missing.push('instalador Windows (.exe)');
if (!linux.length) missing.push('artefato Linux (.AppImage ou .deb)');
if (!android.length) missing.push('APK Android (mobile/android/app/build/outputs)');

const readme = `FBS Screen Manager — pacote para pendrive\n\n` +
  `Conteúdo encontrado:\n` +
  `- Windows: ${windows.length ? windows.map(file => path.basename(file)).join(', ') : 'ausente'}\n` +
  `- Linux: ${linux.length ? linux.map(file => path.basename(file)).join(', ') : 'ausente'}\n` +
  `- Android: ${android.length ? android.map(file => path.basename(file)).join(', ') : 'ausente'}\n\n` +
  `Projetor HDMI simples: instale Windows ou abra o AppImage no notebook e conecte o cabo.\n` +
  `Projetor Android: instale o APK no próprio projetor; valide orientação horizontal e controle remoto.\n` +
  `Leia docs/PENDRIVE_PROJETOR.md antes do evento.\n\n` +
  (missing.length ? `Itens ausentes neste pacote:\n${missing.map(item => `- ${item}`).join('\n')}\n` : 'Todos os grupos de artefatos foram encontrados.\n');
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'README.txt'), readme, 'utf8');

const checksumLines = [];
for (const { target } of copied) checksumLines.push(`${await sha256(target)}  ${path.relative(output, target).replaceAll('\\', '/')}`);
checksumLines.sort();
await fs.writeFile(path.join(output, 'checksums.txt'), checksumLines.join('\n') + (checksumLines.length ? '\n' : ''), 'utf8');

console.log(`Pacote USB: ${output}`);
console.log(`Copiados: ${copied.length} arquivo(s)`);
if (missing.length) {
  console.warn(`Ausentes: ${missing.join('; ')}`);
  if (!allowMissing) {
    console.error('Use --allow-missing para criar um pacote de conferência mesmo incompleto.');
    process.exitCode = 2;
  }
}
