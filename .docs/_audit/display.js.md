# Auditoria do renderer de exibicao

Auditoria somente leitura do renderer responsavel por apresentar imagens, videos e estados visuais.

## Arquivo identificado

- Caminho: src\display.js
- Pontuacao de identificacao: 67
- Linhas: 25
- Bytes: 1594
- SHA-256: AD4D1E4D7ED2EF409780EF2F4FECD24489972A8248A4982508D19FCB2E580DF1
- Sinais: nome contem display, window.fbs, media, video, .play(, .pause(, blackout, logo, duration

## Candidatos avaliados

- src\display.js: score 67
- src\display.html: score 41
- src\control.html: score -5
- src\control.js: score -22

## HTML relacionado

- src\display.html

## Eventos registrados

- error

## Bridges acessadas

- window.fbs

## Inicializacao e DOM

- Linha 1: const stage = document.getElementById('stage');
- Linha 7: function clear() { stage.querySelectorAll('.media,.blackout').forEach(x => x.remove()); }
- Linha 8: function logo() { clear(); document.getElementById('logo').hidden = false; }
- Linha 10: clear(); document.getElementById('logo').hidden = true;
- Linha 11: const el = document.createElement(item.type === 'video' ? 'video' : 'img');
- Linha 16: stage.appendChild(el);
- Linha 20: if (cmd.action === 'blackout') { clear(); document.getElementById('logo').hidden = true; stage.insertAdjacentHTML('beforeend','<div class="blackout"></div>'); }
- Linha 22: if (cmd.action === 'pause') stage.querySelector('video')?.pause();
- Linha 23: if (cmd.action === 'resume') stage.querySelector('video')?.play().catch(()=>{});

## Midia e reproducao

- Linha 14: if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }
- Linha 22: if (cmd.action === 'pause') stage.querySelector('video')?.pause();
- Linha 23: if (cmd.action === 'resume') stage.querySelector('video')?.play().catch(()=>{});

## Imagem video e audio

- Linha 13: el.src = fileUrl(item.path);

## Fullscreen e janela

- Nenhuma correspondencia localizada.

## Monitores e dimensoes

- Nenhuma correspondencia localizada.

## Timers e sincronizacao

- Linha 14: if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }

## Comunicacao e bridge

- Linha 14: if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }
- Linha 15: else el.addEventListener('error', () => window.fbs.status({ error: `Arquivo não encontrado: ${item.name}` }));
- Linha 18: window.fbs.onCommand(cmd => {

## Eventos recebidos

- Linha 14: if (item.type === 'video') { el.autoplay = true; el.muted = true; el.playsInline = true; el.loop = !!item.duration; el.addEventListener('error', () => window.fbs.status({ error: `Não foi possível reproduzir ${item.name}` })); }
- Linha 15: else el.addEventListener('error', () => window.fbs.status({ error: `Arquivo não encontrado: ${item.name}` }));

## Estado visual e modos

- Linha 7: function clear() { stage.querySelectorAll('.media,.blackout').forEach(x => x.remove()); }
- Linha 8: function logo() { clear(); document.getElementById('logo').hidden = false; }
- Linha 10: clear(); document.getElementById('logo').hidden = true;
- Linha 20: if (cmd.action === 'blackout') { clear(); document.getElementById('logo').hidden = true; stage.insertAdjacentHTML('beforeend','<div class="blackout"></div>'); }
- Linha 21: if (cmd.action === 'logo') logo();

## Erros e limpeza

- Linha 23: if (cmd.action === 'resume') stage.querySelector('video')?.play().catch(()=>{});

## Compatibilidade mobile preliminar

As conclusoes abaixo sao inferencias tecnicas. A arquitetura final continua pendente.

- Elementos HTML de imagem, audio e video podem ser parcialmente reutilizados em WebView, mas codecs, permissao de arquivos e autoplay precisam de validacao Android.
- Timers e sincronizacao de midia devem considerar suspensao do aplicativo, tela bloqueada e ciclo de vida mobile.
- A comunicacao atual depende de bridge ou mecanismo desktop e precisara de adapter, plugin Capacitor ou protocolo de rede.
- Modos como blackout, logo e on-air podem ser reutilizados como estado de interface, desde que desacoplados do Electron.

## Estado

- O renderer identificado nao foi alterado.
- Nenhum arquivo de codigo foi alterado.
- Nenhuma dependencia foi instalada.
- Nenhum build ou deploy foi executado.
- Compatibilidade mobile definitiva: NAO CONFIRMADA.
