'use strict';

const { execFile } = require('child_process');
const path = require('path');

const KINDS = new Set(['wireless', 'wired', 'unknown']);

function validText(value, maximum) {
  return typeof value === 'string' && value.trim().length > 0 &&
    value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
}

function helperPath() {
  return __dirname.includes('app.asar' + path.sep)
    ? path.join(process.resourcesPath, 'windows-display', 'reconnect.ps1')
    : path.join(__dirname, 'windows', 'reconnect.ps1');
}

function abortError() {
  const error = new Error('Operação cancelada.');
  error.code = 'ABORT_ERR';
  return error;
}

function runHelper(parameters, timeout, signal) {
  if (signal && signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const options = {
      encoding: 'utf8',
      windowsHide: true,
      shell: false,
      timeout,
      killSignal: 'SIGTERM',
      maxBuffer: 128 * 1024
    };
    if (signal) options.signal = signal;
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFile(powershell, [
      '-NoProfile', '-NonInteractive', '-File', helperPath(), ...parameters
    ], options, (error, stdout) => {
      if (signal && signal.aborted) return reject(abortError());
      if (error) return reject(error);
      try {
        resolve(JSON.parse(stdout.replace(/^\uFEFF/u, '').trim()));
      } catch (_) {
        reject(new Error('O auxiliar do Windows retornou uma resposta inválida.'));
      }
    });
  });
}

function encode(value) {
  // Base64 é um argumento separado, sem expressões PowerShell ou opções injetáveis.
  return Buffer.from(value, 'utf8').toString('base64');
}

async function identifyDisplay(display, signal) {
  if (process.platform !== 'win32') return null;
  const point = display && display.physicalPoint;
  if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y) ||
      point.x < -2147483648 || point.x > 2147483647 ||
      point.y < -2147483648 || point.y > 2147483647) return null;
  try {
    const result = await runHelper([
      '-Mode', 'Identify', '-X', String(point.x), '-Y', String(point.y)
    ], 25000, signal);
    if (!result || !KINDS.has(result.kind) ||
        !validText(result.deviceName, 256) || !validText(result.devicePath, 4096)) {
      return null;
    }
    return {
      kind: result.kind,
      deviceName: result.deviceName,
      devicePath: result.devicePath
    };
  } catch (_) {
    return null;
  }
}

async function reconnectDisplay(identity, signal) {
  if (process.platform !== 'win32') {
    return { message: 'A reconexão de vídeo sem fio está disponível somente no Windows.' };
  }
  // O chamador conserva a identidade retornada enquanto o monitor estava ativo.
  // Isso também permite recuperar uma identidade persistida entre execuções.
  if (!identity || identity.kind !== 'wireless' ||
      !validText(identity.deviceName, 256) || !validText(identity.devicePath, 4096)) {
    return { message: 'A reconexão exige a identidade de uma tela sem fio previamente ativa.' };
  }
  const castName = identity.castName || identity.deviceName;
  if (!validText(castName, 256)) {
    return { message: 'Configure um nome de transmissão válido e exatamente igual ao anunciado pela TV.' };
  }
  try {
    const result = await runHelper([
      '-Mode', 'Reconnect', '-Kind', 'wireless',
      '-DeviceNameBase64', encode(identity.deviceName),
      '-DevicePathBase64', encode(identity.devicePath),
      '-CastNameBase64', encode(castName)
    ], 50000, signal);
    if (!result || !validText(result.message, 4096)) {
      return { message: 'Não foi possível interpretar o resultado da tentativa de conexão.' };
    }
    return { message: result.message };
  } catch (error) {
    if ((signal && signal.aborted) || error.code === 'ABORT_ERR') {
      return { message: 'Tentativa cancelada. Uma solicitação já enviada pode continuar aguardando confirmação na TV.' };
    }
    if (error.killed || error.code === 'ETIMEDOUT') {
      return { message: 'O tempo da tentativa terminou. Verifique a confirmação na TV; a conexão ainda não foi confirmada.' };
    }
    return { message: 'Não foi possível executar o auxiliar de conexão do Windows. A conexão não foi confirmada.' };
  }
}

module.exports = { identifyDisplay, reconnectDisplay };
