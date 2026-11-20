#!/usr/bin/env node

import crypto from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowMissing = process.argv.includes('--allow-missing');
const requestedOutput = process.argv.find((arg, index) => index > 1 && !arg.startsWith('--'));
const output = path.resolve(projectRoot, requestedOutput || path.join('dist', 'usb-bundle'));

if (/^j:/i.test(requestedOutput || '') || /^j:/i.test(output)) {
  throw new Error('Não gere o bundle diretamente em J:. Use uma pasta local e confira o pacote antes de copiá-lo para o pendrive.');
}

const exists = async file => fs.access(file).then(() => true, () => false);
const unique = values => [...new Set(values)];
const androidOutputs = path.join(projectRoot, 'mobile', 'android', 'app', 'build', 'outputs');
const projectorApkPattern = /^fbs-tela-\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\.apk$/i;
const temporaryBuildPattern = /^build-(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

function isWithin(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function hasTemporaryBuildSegment(file) {
  return file.split(/[\\/]/).some(segment => temporaryBuildPattern.test(segment));
}
function isFinalAndroidArtifact(file) {
  if (hasTemporaryBuildSegment(file)) return false;
  const name = path.basename(file);
  if (projectorApkPattern.test(name)) return true;
  return isWithin(androidOutputs, file) && (/^app-(debug|release)\.apk$/i.test(name) || /\.aab$/i.test(name));
}
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
  if (!(await exists(root)) || isWithin(output, root) || hasTemporaryBuildSegment(root)) return [];
  const found = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (isWithin(output, file)) continue;
      if (entry.isDirectory()) {
        if (!temporaryBuildPattern.test(entry.name)) await visit(file);
      } else if (entry.isFile() && predicate(file)) {
        found.push(file);
      }
    }
  }
  await visit(root);
  return found;
}

async function copyIfNew(source, destination, copied) {
  const target = path.join(output, destination);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.copyFile(source, target, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (await sha256(source) !== await sha256(target)) {
      throw new Error(`Arquivo existente preservado: ${target}. Use uma pasta de saída nova para este bundle.`);
    }
  }
  copied.push({ source, target });
}

async function writeIfNew(target, content) {
  try {
    await fs.writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (await fs.readFile(target, 'utf8') !== content) {
      throw new Error(`Arquivo existente preservado: ${target}. Use uma pasta de saída nova para este bundle.`);
    }
  }
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
const roots = [path.join(projectRoot, 'dist'), androidOutputs];
const allBuildFiles = unique((await Promise.all(roots.map(root => filesUnder(root, file => /\.(exe|AppImage|deb|apk|aab)$/i.test(file))))).flat()).sort();

const windows = latestBy(allBuildFiles.filter(file => /^FBS Screen Manager Setup .*\.exe$/i.test(path.basename(file))), () => 'windows');
const linux = latestBy(allBuildFiles.filter(file => /\.(AppImage|deb)$/i.test(file)), file => {
  const match = path.basename(file).match(/^fbs-screen-manager-\d+\.\d+\.\d+-([^.]+)\.(AppImage|deb)$/i);
  return match ? `${match[2]}-${match[1]}` : path.basename(file);
});
const android = latestBy(allBuildFiles.filter(isFinalAndroidArtifact), file => path.basename(file).toLowerCase());
const projector = android.filter(file => projectorApkPattern.test(path.basename(file)));
const mobile = android.filter(file => !projectorApkPattern.test(path.basename(file)));

for (const source of windows) await copyIfNew(source, path.join('windows', path.basename(source)), copied);
for (const source of linux) await copyIfNew(source, path.join('linux', path.basename(source)), copied);
for (const source of android) await copyIfNew(source, path.join('android', path.basename(source)), copied);

const docs = [
  ['README.md', 'README.md'],
  ['MANUAL_USUARIO.md', 'MANUAL_USUARIO.md'],
  ['docs/PROJETOR_LUBUNTU.md', 'PROJETOR_LUBUNTU.md'],
  ['docs/PENDRIVE_PROJETOR.md', 'PENDRIVE_PROJETOR.md'],
  ['projector/README.md', 'TELA_FBS.md']
];
for (const [source, destination] of docs) {
  const file = path.join(projectRoot, source);
  if (await exists(file)) await copyIfNew(file, path.join('docs', destination), copied);
  else missing.push(source);
}

if (!windows.length) missing.push('instalador Windows (.exe)');
if (!linux.length) missing.push('artefato Linux (.AppImage ou .deb)');
if (!projector.length) missing.push('receptor Tela FBS (APK final fbs-tela-<semver>.apk em dist)');

const readme = `FBS Screen Manager — pacote para pendrive\n\n` +
  `Conteúdo encontrado:\n` +
  `- Windows: ${windows.length ? windows.map(file => path.basename(file)).join(', ') : 'ausente'}\n` +
  `- Linux: ${linux.length ? linux.map(file => path.basename(file)).join(', ') : 'ausente'}\n` +
  `- Tela FBS — receptor nativo: ${projector.length ? projector.map(file => path.basename(file)).join(', ') : 'ausente'}\n` +
  `- Editor mobile — Capacitor (opcional): ${mobile.length ? mobile.map(file => path.basename(file)).join(', ') : 'não incluído'}\n\n` +
  `Projetor HDMI simples: instale Windows ou abra o AppImage no notebook e conecte o cabo.\n` +
  `Projetor Android/HY300 K: use o APK final assinado fbs-tela-<semver>.apk do Tela FBS; não é firmware.\n` +
  `Tela FBS é o receptor de projector/. O editor Capacitor de mobile/ é outro aplicativo.\n` +
  `app-debug.apk é para teste do editor; app-release.apk e AAB também são do editor, não do receptor.\n` +
  `O gerador seleciona nomes finais, mas não verifica a assinatura Android. Use o APK assinado pelo build.\n` +
  `No projetor, instale pelo gerenciador de arquivos; nas próximas versões escolha Atualizar sem desinstalar.\n` +
  `Use Menu para mudar a URL. O endereço empacotado em asset local é somente o padrão inicial.\n` +
  `Primeiro teste do MVP: LAN, um notebook Linux/Windows por vez, mantendo o desktop FBS aberto.\n` +
  `A página /tv usa os oito dígitos de Exibição na TV; telefones usam o código de Controle e a página /.\n` +
  `O pareamento dura até 30 dias, salvo revogação. O receptor mantém URL/cookies e tenta reconectar.\n` +
  `Multi-dispositivo/QR está pendente; /display no relay legado não promete sincronização online de mídia local ou vários notebooks.\n` +
  `A validação física no projetor ainda está pendente.\n\n` +
  `Leia docs/PENDRIVE_PROJETOR.md e docs/TELA_FBS.md antes do evento.\n` +
  `Para o receptor, distribua somente APK final assinado, instruções e checksum; nunca JKS ou credenciais.\n` +
  `Confira checksums.txt depois de copiar. Preserve o conteúdo do pendrive e não o formate.\n` +
  `Gere primeiro em uma pasta local nova; a saída direta em J: é recusada.\n` +
  `Arquivos existentes diferentes não são sobrescritos e nenhum arquivo antigo é apagado.\n\n` +
  (missing.length ? `Itens ausentes neste pacote:\n${missing.map(item => `- ${item}`).join('\n')}\n` : 'Todos os grupos obrigatórios de artefatos e documentos foram encontrados; isso não comprova assinatura nem validação física.\n');
await fs.mkdir(output, { recursive: true });
const readmeTarget = path.join(output, 'README.txt');
await writeIfNew(readmeTarget, readme);

const checksumLines = [];
for (const { target } of copied) checksumLines.push(`${await sha256(target)}  ${path.relative(output, target).replaceAll('\\', '/')}`);
checksumLines.push(`${await sha256(readmeTarget)}  README.txt`);
checksumLines.sort();
await writeIfNew(path.join(output, 'checksums.txt'), checksumLines.join('\n') + '\n');

console.log(`Pacote USB: ${output}`);
console.log(`Arquivos copiados ou já idênticos: ${copied.length}`);
if (missing.length) {
  console.warn(`Ausentes: ${missing.join('; ')}`);
  if (!allowMissing) {
    console.error('Use --allow-missing para criar um pacote de conferência mesmo incompleto.');
    process.exitCode = 2;
  }
}
