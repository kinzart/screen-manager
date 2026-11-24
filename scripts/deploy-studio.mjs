#!/usr/bin/env node
// Publica a Central (FBS Studio, pasta web/) na hospedagem Node.js da Hostinger pela API oficial.
//
// Uso:
//   HOSTINGER_API_TOKEN=... node scripts/deploy-studio.mjs            # publica o commit atual (HEAD)
//   HOSTINGER_API_TOKEN=... node scripts/deploy-studio.mjs --dry-run  # só confere acesso, versão e pacote
//
// Variáveis opcionais: FBS_DEPLOY_DOMAIN (padrão screen-manager.kinzart.com.br), FBS_DEPLOY_USERNAME
// (descoberto pela API), FBS_DEPLOY_ALLOW_DOWNGRADE=1 (permite publicar versão menor que a do site).
//
// Segurança dos dados: o FBS_DATA_DIR fica fora da aplicação e não é tocado pelo build. Na primeira
// abertura da 1.1.0 o servidor migra o state.json para o esquema 2 e guarda antes uma cópia byte a byte
// em state.v1-<data>.json na mesma pasta. Publicar uma versão MENOR que a do site é recusado, porque a
// versão antiga não abre dados do esquema novo (ver docs/FBS_RELEASES.md §4).
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://developers.hostinger.com';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.HOSTINGER_API_TOKEN;
const domain = process.env.FBS_DEPLOY_DOMAIN || 'screen-manager.kinzart.com.br';
const dryRun = process.argv.includes('--dry-run');
// Configuração validada na publicação 1.0.1 (Node 24, entrada hosting.js, build = node --check).
const DEFAULT_SETTINGS = { node_version: 24, app_type: 'other', root_directory: null, output_directory: '.', build_script: 'build', entry_file: 'hosting.js', package_manager: 'npm' };

const log = message => console.log(`[deploy] ${message}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function fail(message) { console.error(`[deploy] ERRO: ${message}`); process.exit(1); }

async function api(method, route, body) {
  const response = await fetch(API + route, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`${method} ${route.split('?')[0]} -> HTTP ${response.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

async function liveVersion() {
  try {
    const response = await fetch(`https://${domain}/health`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    return data && data.app === 'fbs-studio' ? data.version : null;
  } catch { return null; }
}

async function findUsername() {
  if (process.env.FBS_DEPLOY_USERNAME) return process.env.FBS_DEPLOY_USERNAME;
  const result = await api('GET', `/api/hosting/v1/websites?domain=${encodeURIComponent(domain)}&per_page=50`);
  const list = Array.isArray(result) ? result : result?.data || [];
  const site = list.find(entry => entry.domain === domain);
  if (!site?.username) fail(`site ${domain} não encontrado nesta conta Hostinger (confira o token).`);
  return site.username;
}

async function upload(username, archivePath, archiveName) {
  const credentials = await api('POST', '/api/hosting/v1/files/upload-urls', { username, domain });
  if (!credentials?.url || !credentials.auth_key || !credentials.rest_auth_key) fail('credenciais de envio inválidas.');
  const bytes = readFileSync(archivePath);
  const destination = `${credentials.url.replace(/\/$/, '')}/${encodeURIComponent(archiveName)}?override=true`;
  const headers = { 'X-Auth': credentials.auth_key, 'X-Auth-Rest': credentials.rest_auth_key, 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0' };
  const create = await fetch(destination, { method: 'POST', headers: { ...headers, 'Upload-Length': String(bytes.length) }, redirect: 'error' });
  await create.arrayBuffer();
  if (create.status !== 201) fail(`envio (criação) HTTP ${create.status}`);
  const patch = await fetch(destination, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/offset+octet-stream' }, body: bytes, redirect: 'error' });
  await patch.arrayBuffer();
  if (patch.status !== 204 || Number(patch.headers.get('upload-offset')) !== bytes.length) fail(`envio (dados) HTTP ${patch.status}`);
  log(`pacote enviado: ${archiveName} (${bytes.length} bytes)`);
}

async function main() {
  if (!token) fail('defina HOSTINGER_API_TOKEN (hPanel → Perfil → API).');
  const git = args => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd: root, encoding: 'utf8' }).trim();
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const version = JSON.parse(git(['show', 'HEAD:web/package.json'])).version;
  const current = await liveVersion();
  log(`site ${domain}: versão no ar ${current || 'desconhecida'}; versão a publicar ${version} (commit ${commit})`);
  if (current && compareVersions(version, current) < 0 && process.env.FBS_DEPLOY_ALLOW_DOWNGRADE !== '1') {
    fail(`a versão ${version} é menor que a do site (${current}). Publicar uma versão antiga quebra os dados migrados. Veja docs/FBS_RELEASES.md §4.`);
  }

  const username = await findUsername();
  let stored = null;
  try { stored = await api('GET', `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds/settings`); }
  catch (error) { if (error.status !== 404) throw error; }
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(settings)) if (stored && stored[key] !== undefined && stored[key] !== null) settings[key] = stored[key];
  settings.entry_file = 'hosting.js'; // a Hostinger importa o arquivo de entrada; server.js sozinho não inicia
  log(`conta ${username}; build: Node ${settings.node_version}, entrada ${settings.entry_file}, script ${settings.build_script}`);

  // O pacote é exatamente o conteúdo commitado de web/ (sem node_modules, dados ou arquivos locais).
  const temp = mkdtempSync(path.join(tmpdir(), 'fbs-deploy-'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const archiveName = `fbs-studio_${version}_${commit}_${stamp}.zip`;
  const archivePath = path.join(temp, archiveName);
  try {
    git(['archive', '--format=zip', '-o', archivePath, 'HEAD:web']);
    const listing = execFileSync('git', ['-c', 'safe.directory=*', 'ls-tree', '-r', '--name-only', 'HEAD:web'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
    for (const required of ['hosting.js', 'server.js', 'package.json', 'package-lock.json', 'public/player.html']) {
      if (!listing.includes(required)) fail(`o pacote não contém ${required}.`);
    }
    log(`pacote montado com ${listing.length} arquivos`);
    if (dryRun) { log('--dry-run: acesso à API conferido; nada foi enviado.'); return; }

    await upload(username, archivePath, archiveName);
    const message = `FBS Studio ${version} (${commit})`;
    const build = await api('POST', `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds`, {
      ...settings, source_type: 'archive', source_options: { archive_path: archiveName, message },
    });
    const uuid = build?.uuid || build?.data?.uuid;
    if (!uuid) fail(`a Hostinger não devolveu o id do build: ${JSON.stringify(build).slice(0, 300)}`);
    log(`build iniciado: ${uuid}`);

    const deadline = Date.now() + 15 * 60 * 1000;
    let state = build.state;
    while (Date.now() < deadline) {
      await sleep(10000);
      const info = await api('GET', `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds/${uuid}`);
      state = info?.state || info?.data?.state;
      log(`estado do build: ${state}`);
      if (state === 'completed') break;
      if (state === 'failed') {
        const logs = await api('GET', `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds/${uuid}/logs`).catch(() => null);
        console.error(typeof logs === 'string' ? logs.slice(-4000) : JSON.stringify(logs).slice(-4000));
        fail('o build falhou na Hostinger. O site continua na versão anterior.');
      }
    }
    if (state !== 'completed') fail('tempo esgotado aguardando o build.');

    const healthDeadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < healthDeadline) {
      if (await liveVersion() === version) { log(`OK: https://${domain}/health responde a versão ${version}.`); return; }
      await sleep(10000);
    }
    fail(`o build terminou, mas /health ainda não responde ${version}. Confira os logs da aplicação no hPanel.`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => fail(error.message));
