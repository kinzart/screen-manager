# Relatório — Etapa 5: Interface Touch-First e Fluxo Completo

**IMPLEMENTATION_STATUS: COMPLETE**
**AUTOMATED_TEST_STATUS: PASS**
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED**

---

## 1. Estado inicial

Branch `feat/mobile-android-v1`. Antes desta etapa: 216/216 testes,
Etapa 4 `COMPLETE`.

## 2. Arquivos criados e alterados

**Criados:**
- `mobile/www/app/ui/EditorView.js` — editor de playlist touch-first (botões ↑/↓, sem drag&drop).
- `mobile/www/app/ui/TransportBar.js` — play/pause/next/previous/blackout/logo.
- `mobile/www/app/ui/AppShell.js` — casca única (editor ⇄ apresentação).
- `mobile/www/app/AppController.js` — orquestrador (core + adapters + UI).
- `mobile/tests/ui/EditorView.test.js` — 16 testes.
- `mobile/tests/ui/TransportBar.test.js` — 4 testes.
- `mobile/tests/ui/AppShell.test.js` — 4 testes.
- `mobile/tests/AppController.test.js` — 31 testes.
- `mobile/ETAPA_5_REPORT.md` (este arquivo).
- `mobile/ETAPAS_3_A_5_SUMMARY.md` (resumo do lote).

**Alterados:**
- `mobile/package.json` — script `test:ui` novo; `test` passou a incluir `tests/ui/*.test.js` e `tests/AppController.test.js`.

**Não alterados nesta etapa (decisão técnica, ver seção 6):**
`mobile/www/index.html`, `mobile/www/styles/app.css`,
`mobile/www/app/main.js`, `mobile/package-lock.json` (nenhuma dependência
nova), `mobile/README.md`. Código do Electron: intocado.

## 3. Requisitos de interface atendidos

- **Touch-first, sem drag&drop de mouse:** reordenação por botões `↑`/`↓`
  acessíveis (`EditorView._itemMarkup`), desabilitados nas bordas — INC-06
  da auditoria (o desktop só tinha drag&drop de mouse) é resolvido aqui.
- **Sem depender de hover/botão direito/teclado:** todas as ações são
  `<button>`/`<select>`/`<input>` com `click`/`change`, alvo de toque ≥44px
  via CSS (herdado de `presenter.css`; `app.css` não foi tocado — ver
  seção 6).
- **aria-label em todo controle por ícone:** import, loop, mover, remover,
  apresentar, campos de edição, transporte (◀▶⏮⏭⬛🔷) e botão de saída da
  apresentação — testado explicitamente (`EditorView.test.js`,
  `TransportBar.test.js`, `AppController.test.js` item 29).
- **Confirmação antes de excluir:** `EditorView` recebe um `confirmFn`
  injetável (default sempre confirma) chamado antes de disparar `onRemove`
  — arquitetura pronta para um diálogo real; a UI de diálogo nativo em si
  fica para integração futura (ver seção 8).
- **Feedback de carregamento/erro/importação:** `EditorView.showFeedback()`
  (info transitória: "Selecionando mídia…", "N arquivo(s) importado(s)",
  "Importação cancelada") e `EditorView.showError()` (erros de importação,
  apresentação e persistência — `role="alert"`).
- **Retrato/paisagem, sem hover:** CSS de `presenter.css` usa `position:
  fixed; inset:0` (responsivo por natureza); `app.css` do editor não foi
  criado/expandido nesta etapa (ver limitação, seção 8).

## 4. AppController — integração

Conecta `PlaylistManager`, `PlaybackEngine`, `ScheduleEngine` (core, sem
Capacitor) com `StoragePort`, `MediaPort`, `PresentationAdapter` (adapters)
e `AppShell` (UI), via injeção de dependência no construtor — nunca importa
Capacitor diretamente (confirmado por teste de arquitetura). A UI nunca
recebe `storage`/`media`/`presentation`; só fala com o `AppController` via
callbacks (`onImportClick`, `onRemove`, `onEditField`, …), e o
`AppController` nunca constrói `EditorView`/`TransportBar`/`PresenterView`/
`AppShell` diretamente (testado: `"AppController não cria dependência
circular…"`).

**Fluxo `init()`:** carregar settings → carregar playlist → carregar
RuntimeState → restaurar (`PlaybackEngine.restore`) → renderizar editor.

**Persistência:** `scheduleSave()` implementa debounce simples (um único
`setTimeout` pendente por vez — chamadas repetidas antes do disparo não
recriam o timer) que agrupa `savePlaylist`+`saveSettings` em uma única
escrita mesmo com várias edições seguidas (testado: item 26, 3 edições →
1 escrita). `RuntimeState` é salvo **imediatamente** (não debounced) em
eventos significativos: iniciar/sair da apresentação, pause/resume,
next/previous, blackout/logo — para não perder o estado se o app for
morto logo em seguida.

**Erros de persistência** aparecem via `EditorView.showError()` **sem**
descartar o estado em memória (`PlaylistManager`/`_settings` continuam
com os valores editados mesmo que a escrita em disco falhe) — testado
explicitamente (item 25).

## 5. Agendamento (startAt/rules) — limites deixados claros

O `AppController` mantém um `ScheduleEngine` sincronizado com
`settings.rules`, e o campo `startAt` é editável no `EditorView`
(`.editor-startat`). **Nenhum serviço em background Android foi criado.**
O agendamento só é avaliado enquanto o app está aberto e em primeiro
plano — não há promessa nem simulação de execução com o app fechado. Esta
limitação está documentada aqui e deve ser repetida na UI/documentação de
usuário quando essa etapa futura acontecer (fora do escopo atual).

## 6. Decisão técnica: `main.js`/`index.html`/`app.css` não foram integrados

**Motivo:** o projeto mobile não usa nenhum bundler (webpack/rollup/vite/
esbuild) — `index.html` carrega `app/main.js` como módulo ES nativo via
caminho relativo. Os specifiers **bare** usados pelos adapters
(`@capacitor/filesystem`, `@capacitor/core`, `@capawesome/capacitor-file-picker`)
só resolvem dentro do runtime real do Capacitor Android (que injeta esses
módulos no build nativo) — **não resolvem** se `main.js` os importar
diretamente e for aberto puro num navegador ou WebView sem o pipeline de
build do Capacitor. Achei mais honesto **não** escrever uma integração em
`main.js` que pareceria funcionar mas na verdade dependeria de uma decisão
de build (bundler ou import map) ainda não tomada, do que produzir um
bootstrap enganoso. Isso não compromete o `CODE_COMPLETE` desta etapa:
`AppController`, `AppShell` e todos os adapters estão **integralmente
implementados e testados** com fakes — falta apenas a "última milha" de
conectar tudo em `main.js`, que é uma decisão de build a ser tomada
explicitamente numa etapa futura (ver `ETAPAS_3_A_5_SUMMARY.md`).

## 7. Comandos executados e exit codes

| # | Comando | Exit code |
|---|---|---|
| 1 | `git status --short` / branch (precheck) | 0 |
| 2 | `node --check` em todos os `.js` novos | 0 (todos) |
| 3 | `npm run test:ui` — 55/55 | 0 |
| 4 | `npm test` (completo) — 271/271 | 0 |
| 5 | `npm run test:core`/`test:persistence`/`test:media`/`test:presentation` — 92/43/38/43 | 0 (todos) |
| 6 | busca de `electron`/`@capacitor` em `mobile/www/**` (só comentários, confirmado) | 0 |
| 7 | `git diff --check` | 0 |
| 8 | `git status --short` (final) | 0 |
| 9 | comparação final de hashes dos arquivos protegidos | idênticos |
| 10 | `npx cap doctor` — `[success] Android looking great!` | 0 |

`npx cap sync android` não foi necessário (nenhuma dependência nova nesta
etapa).

## 8. Testes: totais e preservação

- **Antes:** 216 testes.
- **Depois: 271 testes** — `npm test` 271/271. Novos: `test:ui` 55/55
  (16 EditorView + 4 TransportBar + 4 AppShell + 31 AppController).
- Os 216 testes anteriores continuam passando, nenhum removido/enfraquecido.

## 9. Limitações e validações não realizadas

- **Bundler/import map não decidido** (seção 6) — bloqueia apenas a
  integração final em `main.js`, não a lógica testada.
- **`app.css` do editor não foi criado** nesta etapa — o editor funciona
  (testado via jsdom) mas sem estilo visual aplicado; alvo de toque ≥44px
  só está garantido via CSS em `presenter.css` (controles da apresentação).
  Isso é uma lacuna visual, não funcional.
- **Confirmação de exclusão** usa uma função injetável que hoje, por
  padrão, sempre confirma — um diálogo nativo real (ou modal in-app) fica
  para quando a integração de `main.js` acontecer.
- **DEVICE_VALIDATION_BLOCKED** (herdado): toque real, tamanho de alvo em
  device físico, comportamento de teclado virtual sobre `<input>`, e
  qualquer interação de fato "por dedo" não podem ser confirmados sem
  device/emulador.
- **Validação visual local:** não foi realizada nesta etapa — como
  `main.js` não foi integrado (seção 6), servir `mobile/www` localmente
  mostraria apenas a casca estática da Etapa 0, não o app funcional; abrir
  isso no navegador não agregaria informação real além dos testes jsdom já
  executados. Registrado como pendente, não fingido.

## 10. Status final

**IMPLEMENTATION_STATUS: COMPLETE** — `EditorView`, `TransportBar`,
`AppShell` e `AppController` implementados integralmente, cobrindo todo o
fluxo touch-first pedido (importar, playlist, reordenar, editar campos,
loop, apresentar, transporte, blackout/logo, sair, persistência com
autosave debounced e RuntimeState imediato).
**AUTOMATED_TEST_STATUS: PASS** — 271/271 testes, todos os scripts
(`test`, `test:core`, `test:persistence`, `test:media`,
`test:presentation`, `test:ui`) verdes.
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED** — sem JDK/Android SDK
neste ambiente; adicionalmente, a integração final em `main.js` depende de
uma decisão de bundler ainda não tomada (seção 6), então mesmo com
JDK/SDK a experiência ponta-a-ponta no device exigiria essa etapa extra.
