# FBS Screen Manager: auditoria do estado real (Fase 0)

Data: 2026-11-23. Branch auditada: `main` em `1ce4c2b`. Branch de trabalho criada a partir dela: `feat/fbs-central-orchestration`.
Fase somente leitura: nenhum código de produção foi alterado nesta fase.

## 1. Repositório e branches

| Item | Evidência |
|---|---|
| Remoto | `git@github.com:kinzart/screen-manager.git` |
| Branches locais | `main` (1ce4c2b, igual a `origin/main`), `feat/mobile-hybrid-v1` (1ce4c2b local; `origin/feat/mobile-hybrid-v1` em eb863bc, 1 commit atrás) |
| Branches remotas (`git ls-remote --heads origin`) | `main`, `feat/mobile-hybrid-v1` |
| `feat/mobile-android-v1` / `feature/android-v1` | **Não existem** nem localmente nem no remoto. O trabalho Android/Capacitor está em `mobile/`, integrado ao `main` pelo commit `6f67b3c Add mobile hybrid presentation app` |
| Tags | nenhuma |
| Histórico | 8 commits lineares: c26f304 first commit → 6f67b3c mobile → 07a3190 recuperação de tela → 36bfbab Linux → 844d23e relay → a1e1105 APK CI → eb863bc receptor Android → 1ce4c2b FBS Studio |
| Arquivos não rastreados | `CORRIGIR-WIFI.ps1`, `package-existing-wifi.py`, `prepare-wifi-driver.py`, `wifi-mint*/`, `wifi-mint*.zip` (50 MB), `.wifi-library-helper/`. Não pertencem ao produto (diagnóstico de Wi-Fi do MacBook). **Preservados e não commitados.** |
| Git | O repositório pertence a outro SID do Windows. O git recusa o acesso por "dubious ownership". Usei `git -c safe.directory=*` em cada comando, sem alterar a configuração global |

### Contexto histórico versus estado atual

| Afirmação histórica | Estado atual verificado |
|---|---|
| Electron `fbs-screen-manager` v1.0.2 | `package.json` está em **1.1.0** |
| `main.js`, `preload.js`, `src/control.js`, `src/display.js` | Existem. Foram somados `desktop/` (saída, recuperação, servidor LAN e relay) e `src/live/` (controle remoto LAN) |
| `playlist.json` e `settings.json` em `userData/data` | Confirmado (`main.js:12-15`). Também existe `connections.json` (pareamento, relay e tela alvo) |
| Android Capacitor independente, sem React/Vue | Confirmado em `mobile/`: ES modules puros, Vite e Capacitor |
| Suíte de 87 testes | Valia na Etapa 1 (`mobile/ETAPA_1_REPORT.md:116`). **Hoje são 353 testes mobile**, todos passando |

## 2. Componentes e linguagens

O repositório tem 207 arquivos rastreados e cerca de 19,7 mil linhas de JS/HTML/CSS/Java. Ele contém **cinco aplicações**:

| Componente | Pasta | Stack | Papel atual |
|---|---|---|---|
| App Windows/Linux | raiz, `desktop/`, `src/` | Electron 37.10.3, JS CommonJS, `ws` | Operador local: fila de mídias e janela de saída no 2º monitor. Inclui servidor LAN `:8790` (controle e `/tv`) e cliente de relay |
| Editor mobile | `mobile/` | Capacitor e Vite, ES modules sem framework | App de apresentação no celular com núcleo puro portado do desktop |
| FBS Studio (central web) | `web/` | Node ≥22, `http` puro, 1 dependência (`qrcode-generator`) | **Central hospedada** em `screen-manager.kinzart.com.br` (1.0.1): espaços, sessões, telas, pareamento, mapa de rotas, biblioteca e upload retomável |
| Relay legado | `remote/` | Node e `ws` | Sala por código de 4 dígitos, estado em memória (celular → TV) |
| Receptor Android "Tela FBS" | `projector/` | Java, WebView, minSdk 24, target 34 | APK leve (25 KB) que abre a URL `/tv` com cookies persistentes e D-pad |

## 3. Persistência

| Onde | Formato | Integridade |
|---|---|---|
| Electron `userData/data/*.json` | JSON sem versão de esquema | `writeJson`: `.tmp` seguido de `rename` (`main.js:24`), sem fsync. Arquivo corrompido derruba a leitura em `connections` (`JSON.parse` sem try) |
| Mobile | Capacitor Preferences e Filesystem (sandbox) | Validadores em `mobile/www/app/core/models.js` |
| Studio `FBS_DATA_DIR/state.json` | JSON `schemaVersion: 1` e `revision` monotônica | Fila serial, gravação em temporário, `fsync` e `rename` (`web/store.js:46`). `validateDatabase` **rejeita qualquer `schemaVersion ≠ 1`**, o que exige uma migração explícita antes de evoluir o esquema |
| Studio mídias | `media/<uuid>.<ext>`, `uploads/<uuid>.part` | Upload em blocos de 2 MiB com `Upload-Offset` e recuperação de queda entre rename e commit (`web/media.js:30-48`). **Sem hash de conteúdo** |

## 4. Fluxos de reprodução e agendamento

### 4.1 Fila de mídias do Windows (semântica de referência)

Fonte: `src/control.js`.
- Itens `{id, path, name, type, duration(s), transition, fit, startAt}`. Os padrões ao adicionar são `duration: 10` e `fit: "contain"`.
- `take(id)` zera o tempo decorrido e envia `show`. `startTimer` conta em ticks de 250 ms. Com `duration > 0` e o tempo esgotado, chama `autoNext` ou, se `locked`, segura o item no fim.
- `duration == 0` **segura o item indefinidamente**. O vídeo fica em `loop` quando `duration` é diferente de zero (`src/display.js:32`).
- `autoNext`: no último item, sem `loopPlaylist`, mostra "Fim da fila" e `stop()` envia o logo. Com loop, volta ao primeiro item. `next(±1)` é circular.
- `startAt` (HH:MM[:SS]) por item: `checkSchedule` faz `take` uma vez por dia (chave `data-id-startAt`), a menos que o item no ar esteja `locked`.
- `rules`: janelas HH:MM com transição padrão. Não tratam a passagem da meia-noite, e essa limitação é documentada no mobile.
- Usa o horário local do sistema, sem fuso explícito.

### 4.2 Núcleo mobile (lógica compartilhável)

`mobile/www/app/core/{PlaybackEngine,ScheduleEngine,PlaylistManager,transitions,models}.js` porta a semântica acima para ES modules puros. Calcula o tempo decorrido por timestamp, em vez de contar ticks. Divergências documentadas nos cabeçalhos: item removido para em vez de adivinhar o próximo, e regras malformadas são ignoradas.

### 4.3 FBS Studio (central)

- `playlists` são as "sessões" da interface: `items[{id, mediaId, durationMs ≥ 1000}]`, `loop` e um `transport` compartilhado `{playing, positionMs, anchorAtMs, mode}`. A posição é derivada do relógio do servidor (`web/engine.js:52`), então várias telas ligadas à mesma sessão ficam sincronizadas.
- `screens.input`: **uma única** origem por tela (`playlist` ou outra `screen`, que espelha a tela), com prevenção de ciclos (`validateRoute`).
- **Não existe uma fila de sessões por tela**, nem agenda, repetição contada, janela de validade ou override com retomada. Esse é o principal hiato em relação ao requisito 2.
- Comandos de transporte (`play/pause/seek/next/previous/blackout/logo`) atuam na sessão inteira, para todas as telas ligadas a ela.

### 4.4 Receptor `/tv` (`web/public/player.js`)

- Polling HTTPS a cada 1 s. A hospedagem (Hostinger) não aceita WebSocket de entrada (`web/README.md`).
- ACK `{routeVersion, playlistVersion, status, mediaId}`. O servidor recusa ACK de uma versão antiga com `409 STALE_ACK`. O painel distingue conectado, aguardando confirmação e confirmado. Esse é o embrião da reconciliação entre estado desejado e efetivo.
- **Autonomia offline mínima**: sem rede, o receptor só extrapola a posição dentro do item atual (`desiredPosition` limitado a `durationMs`). Não avança para o próximo item nem para a próxima sessão.
- **Sem cache local**: a mídia é lida diretamente de `/api/v1/media/:id` com `Cache-Control: no-store`. Não há pré-carregamento nem relatório de prontidão.
- A autorização de mídia para a tela aceita somente itens da sessão atual (`web/media.js:60`). Isso **impede o pré-carregamento das próximas sessões**.

## 5. Rede, autenticação e segurança

| Superfície | Mecanismo |
|---|---|
| Studio operador | Senha única de admin (≥16 caracteres, por variável de ambiente), cookie HttpOnly com hash SHA-256 no estado, CSRF por sessão, verificação de `Origin` e rate limit de login. **Há um único papel (admin); não existe modelo de permissões** |
| Studio tela | Pareamento: código de 6 dígitos e desafio de 32 bytes, validade de 5 minutos, aprovação pelo operador e cookie de tela por 30 dias. Revogação = excluir a tela (remove as sessões da tela) |
| Electron LAN `:8790` | Códigos de 8 dígitos por papel (tv/control) e cookie HMAC por 30 dias |
| Relay `remote/` | Tokens opcionais (`REMOTE_REQUIRE_TOKENS`) e estado em memória |
| Cabeçalhos | CSP restrita, `no-store`, `X-Frame-Options DENY`, HSTS em produção |

Nenhum segredo está versionado. `.gitignore` cobre `.env*`, `.maestro/` (onde ficam o keystore JKS e o arquivo de credenciais do Studio) e `dist/`.

## 6. Testes: linha de base executada nesta auditoria

| Suíte | Comando | Resultado real |
|---|---|---|
| Raiz Electron (saída, controle, servidor LAN) | `npm test` | 6/6 pass |
| FBS Studio HTTP | `node --test tests/studio.test.cjs` | 12/12 pass em 3 execuções seguidas. **1 falha intermitente na 1ª execução** (detalhe não capturado; rodava em sequência com outras suítes). Risco R6 |
| Relay (raiz) | `node --test tests/remote-relay.test.cjs` | 1/1 pass (27 s) |
| Relay (`remote/`) | `npm test` | 8/8 pass |
| Mobile | `npm test` em `mobile/` | 353/353 pass |
| E2E Studio e Electron | `tests/studio.e2e.cjs`, `tests/desktop-live.e2e.cjs` | Não executados nesta fase (dependem do Edge e do Playwright de `mobile/node_modules`) |

Nota: o script da auditoria tentou `npx vitest` em `mobile/` por engano. O vitest foi baixado apenas no cache do npx, nenhum arquivo do projeto mudou (`git status mobile` vazio) e a suíte correta (`node --test`) foi executada em seguida.

## 7. Build, release e distribuição

- Windows: `electron-builder --win nsis`. O instalador 1.1.0 existe em `dist/1.1.0/` (ignorado pelo git) e não é assinado (sem certificado de code signing).
- Linux: workflow `linux-packages.yml` (AppImage e deb). Publica release via `gh` **somente em tag `v*`**. Ainda sem tags, então nenhuma release foi publicada.
- Android editor: workflow `android-apk.yml` (APK debug, artefato). Receptor `projector/`: build local com `scripts/build-projector.ps1` e keystore permanente fora do git.
- Studio web: workflow `web-studio.yml` (test e build em Node 24). O deploy na Hostinger é feito manualmente.
- **Não há mecanismo de atualização automática** em nenhuma plataforma. O receptor web se atualiza sozinho porque carrega `/tv` do servidor; o APK só muda o envelope WebView.
- `gh` CLI ausente nesta máquina. Não há credenciais de publicação no ambiente: publicação BLOCKED por política e por credenciais.

## 8. Ferramentas e orquestração disponíveis (verificado)

| Ferramenta | Estado |
|---|---|
| SUPERAGENT (`superagent --diagnose`) | `hermes` é o único executor *capable*. `codex` e `claude` estão *configured-unproven*, com falhas recentes (`CODEX_PROCESS_DEADLINE_EXCEEDED`, `CLAUDE_OFFICIAL_CALL_FAILED`). `groq` falha com `EMPTY_MODEL_RESULT` e `ollama` está fora do ar. O pedido atual define o Claude Code como coordenador, por isso a execução é feita diretamente e com verificação local |
| Graphify | Grafo existente em `.maestro/fbs-analysis/graphify-out/graph.json`. Consultado: `resolveScreen` é usado por `api.js` (state, ack, painel) **e por `media.js` (autorização)**, o ponto de acoplamento crítico |
| Codex CLI | Instalado. Não usado: a última prova ponta a ponta falhou por timeout |
| UX Pro Max | Skill `ui-ux-pro-max` instalada |
| Node | 22.23.2 (a hospedagem usa 24) |
| Java | Apenas Java 8 no PATH. O JDK 21 portátil fica em `.maestro/fbs-analysis/toolchain`. O build Android não é necessário nesta etapa |

## 9. Riscos

| ID | Risco | Impacto |
|---|---|---|
| R1 | `validateDatabase` aceita somente o esquema 1. Evoluir o esquema sem migração impede o Studio de iniciar | Alto |
| R2 | Mudar a origem da tela sem atualizar `media.js` faz o receptor receber 403 nas mídias | Alto |
| R3 | O receptor sem plano local fica parado no fim do item quando perde a rede | Médio |
| R4 | Sem cache, vídeos grandes dependem de banda em tempo real; a queda de rede interrompe a reprodução | Alto |
| R5 | Cache Storage, Service Worker e `crypto.subtle` exigem contexto seguro. A URL LAN `http://192.168…` do Electron **não** permite cache no navegador | Médio (limite de plataforma) |
| R6 | Falha intermitente observada uma vez na suíte HTTP do Studio | Baixo/médio |
| R7 | Papel único de admin: não há permissões granulares | Médio |
| R8 | Fuso horário: o Windows usa a hora local do sistema; o Studio usa epoch ms. Agendas diárias exigem um fuso explícito | Médio |
| R9 | O repositório tem um owner SID diferente; commits exigem `safe.directory` | Baixo |
| R10 | Validação em hardware (HY300, Android TV, iPhone) continua pendente segundo o histórico | Informativo |

## 10. Conclusão da auditoria

A menor evolução segura é **evoluir o FBS Studio (`web/`) como Central**, sem criar outro servidor. Ele já tem autoridade, persistência atômica, pareamento, revogação, ACK versionado, upload retomável e uma interface testada em 375 px. Os hiatos que serão implementados, em ordem de valor:

1. Fila de sessões por tela, separada da fila de mídias da sessão: programa, agenda, repetição, override e retomada.
2. Plano de reprodução enviado ao receptor, que permite autonomia offline determinística e pré-carregamento.
3. Hash e manifesto de mídias, cache local no receptor com verificação por bloco e relatório de prontidão.
4. Telemetria (heartbeat), comandos idempotentes e estados recebido/executado.
5. Migração do esquema 1 para 2 com backup.

O app Windows local permanece intacto. A integração dele com a Central acontece como receptor `/tv` (navegador ou janela Electron).
