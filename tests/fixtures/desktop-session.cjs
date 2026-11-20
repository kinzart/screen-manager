// Exercise real Electron IPC and renderers without moving a window to the user's TV.
const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const electron = require('electron');
process.on('uncaughtException', error => { console.error(error.stack); electron.app.exit(1); });
process.on('unhandledRejection', error => { console.error(error); electron.app.exit(1); });
const entry = path.resolve(__dirname, '../../main.js');
const screen = new EventEmitter();
let connected = true;
const primary = { id: 1, label: 'Operador', internal: true, bounds: { x: 0, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 } };
const tv = { ...primary, id: 2, label: 'TV de teste', internal: false, bounds: { ...primary.bounds, x: 1280 } };
screen.getPrimaryDisplay = () => primary;
screen.getAllDisplays = () => connected ? [primary, tv] : [primary];
screen.dipToScreenPoint = point => point;
global.fbsFixture = { port: 0, setTV(value) {
  connected = value;
  screen.emit(value ? 'display-added' : 'display-removed', {}, tv);
} };
electron.app.setPath('userData', process.env.FBS_TEST_PROFILE);
const load = Module._load;
Module._load = function(name, parent, ...rest) {
  const original = load.call(this, name, parent, ...rest);
  if (parent?.filename !== entry) return original;
  if (name === 'electron') {
    const api = Object.create(original);
    Object.defineProperties(api, {
      screen: { value: screen },
      BrowserWindow: { value: class extends original.BrowserWindow {
        constructor(options) {
          super({ ...options, x: 0, y: 0, show: false, fullscreen: false });
          this.showInactive = () => {};
          this.setFullScreen = () => {};
        }
      } }
    });
    return api;
  }
  if (name === './desktop/windows-display') return {
    identifyDisplay: async d => ({ devicePath: 'teste/' + d.id, deviceName: d.label, kind: 'wired' }),
    reconnectDisplay: () => { throw new Error('Saída física acionada durante teste isolado'); }
  };
  if (name === './desktop/live-server') return { ...original, createLiveServer(options) {
    const service = original.createLiveServer(options), listen = service.listen;
    service.listen = async () => { global.fbsFixture.port = await listen(0, '127.0.0.1'); return global.fbsFixture.port; };
    return service;
  } };
  return original;
};
require(entry);
