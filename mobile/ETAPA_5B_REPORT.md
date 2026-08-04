# Relatório — Etapa 5B: Integração Executável e Build Web

**IMPLEMENTATION_STATUS: COMPLETE**
**AUTOMATED_TEST_STATUS: PASS**
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED**

---

## 1. Estado inicial

Branch `feat/mobile-android-v1`, HEAD `c26f304`. Antes desta etapa: 271/271
testes. Reavaliação humana classificou a Etapa 5 anterior como `PARTIAL`
por faltar bootstrap real conectado, empacotamento correto dos imports
Capacitor, CSS touch-first, build web real e sincronização com Android —
todos os cinco pontos são endereçados nesta etapa.

## 2. Decisão de build

**Vite 8.1.5** (devDependency), somente como bundler/dev-server — nenhum
framework de UI foi instalado. `root: mobile/www/` (código-fonte
continua sendo a fonte da verdade), `base: './'`, `build.outDir:
mobile/dist/` (`emptyOutDir: true` — sempre resultado de build, nunca
editado à mão), `capacitor.config.json.webDir` alterado de `"www"` para
`"dist"`.

## 3. Arquivos criados e alterados

**Criados:**
- `mobile/vite.config.js`
- `mobile/tests/integration/bootstrap.test.js` — 12 testes.
- `mobile/tests/integration/index-html.test.js` — 10 testes.
- `mobile/tests/build/build-output.test.js` — 7 testes (executa `vite build` de verdade via `child_process`).
- `mobile/ETAPA_5B_REPORT.md` (este arquivo).

**Alterados:**
- `mobile/www/app/main.js` — bootstrap real (era só um `console.log` da Etapa 0).
- `mobile/www/index.html` — elementos obrigatórios (loading, erro, app-root, modal de confirmação), sem IDs duplicados.
- `mobile/www/styles/app.css` — CSS touch-first completo (era só a casca da Etapa 0).
- `mobile/www/app/ui/EditorView.js` — `confirmFn` agora suporta retorno síncrono OU `Promise<boolean>` (necessário para o modal real).
- `mobile/www/app/AppController.js` — construtor aceita `playlistManager`/`playbackEngine`/`scheduleEngine` opcionais (default: instâncias próprias), para o bootstrap poder construí-los explicitamente.
- `mobile/tests/ui/EditorView.test.js` — teste de confirmação ajustado para o novo fluxo assíncrono (+1 teste novo para confirmFn assíncrono).
- `mobile/package.json` — devDependency `vite@8.1.5`; scripts `dev`/`build`/`preview`/`test:integration` novos; `test` passou a incluir `tests/integration/**` e `tests/build/**`.
- `mobile/package-lock.json` — atualizado por `npm install`.
- `mobile/capacitor.config.json` — `webDir: "dist"`.
- `mobile/.gitignore` — `dist/` adicionado (build output nunca versionado).
- `mobile/android/**` — atualizado por `npx cap sync android` (copiou `dist/` para `android/app/src/main/assets/public`, refletindo o novo `webDir`).

**Não alterados:** `mobile/www/styles/presenter.css` (já atendia os
requisitos — verificado por teste), demais módulos do core/adapters/ui não
listados acima, e todo o Electron da raiz.

## 4. Bootstrap real (`main.js`)

Implementa os 18 passos pedidos:
1-2. espera `DOMContentLoaded` quando `document.readyState === 'loading'`.
2-12. constrói, nesta ordem, via `bootstrap({...})`: `CapacitorStorage`
(factory real `createCapacitorStorage`), `CapacitorMedia` (factory real
`createCapacitorMedia`), `AppShell` (que internamente constrói
`PresenterView`/`EditorView`/`TransportBar`), `PresentationPlatform`
(Web APIs reais: `navigator.wakeLock`, `screen.orientation`, Fullscreen
API, com feature detection), `LocalPresentationAdapter`,
`PlaylistManager`/`PlaybackEngine`/`ScheduleEngine` (passados explicitamente
ao `AppController`, não mais construídos implicitamente dentro dele —
ver alteração em `AppController.js`), e finalmente `AppController`.
13. `await controller.init()`.
14. `showLoading()` antes, `showApp()`/`showError()` depois — testado
    (`bootstrap.test.js`, itens 2-4).
15. erro de inicialização mostra `#boot-error` com mensagem e um botão
    "Tentar novamente" funcional (`onclick` religa `bootstrap()`).
16. nenhum `catch` vazio: o `catch` de `bootstrap()` sempre chama
    `showError()`; o `catch` de nível superior (auto-start) sempre loga o
    erro (`console.error`) — nenhuma rejeição fica sem tratamento
    (testado: `"bootstrap não deixa nenhuma rejeição não tratada…"`).
17. nenhum import de `electron`.
18. nenhum plugin Capacitor é acessado fora das fábricas/adapters já
    autorizados — `main.js` só importa `createCapacitorStorage`,
    `createCapacitorMedia`, `PresentationPlatform`, `LocalPresentationAdapter`,
    `AppShell`, `AppController`, `PlaylistManager`, `PlaybackEngine`,
    `ScheduleEngine` — nenhum `@capacitor/*` direto (testado).

**Testável:** `bootstrap({ doc, createStorage, createMedia, createPlatform,
confirmFn })` aceita cada dependência por injeção com defaults reais; só
roda automaticamente quando `document` global existe (nunca em
import Node puro).

## 5. Modal de confirmação real

`EditorView.confirmFn` agora aceita um valor síncrono **ou**
`Promise<boolean>` (`await this._confirmFn(...)`). `main.js` implementa
`createModalConfirm(doc)`, que exibe `#confirm-modal` (index.html),
resolve a Promise no clique de `#confirm-modal-confirm`/`#confirm-modal-cancel`,
e remove os listeners depois — sem vazamento. Testado ponta-a-ponta
(`bootstrap.test.js`, item 11: confirmar remove, cancelar mantém).

## 6. index.html e CSS

`index.html` contém todos os elementos exigidos: meta charset/viewport/
theme-color, `#boot-loading`, `#boot-error`+`#boot-error-message`+
`#boot-retry`, `#app-root` (onde `AppShell` monta editor/playlist/
transport/presenter), `#confirm-modal` com título e ações, import de
`app/main.js` como module, `app.css` e `presenter.css`. Sem IDs
duplicados (testado).

`app.css`: mobile-first, `@media (orientation: landscape)` para reflow de
campos, `button{min-width:44px;min-height:44px}`, `:focus-visible`,
contraste (`#f2f2f2` sobre `#0b0b0b`/`#161616`), `.editor-list` rolável
(dentro de `.app-shell-editor{overflow-y:auto}`), `.transport-root`
acessível, estilos para `.editor-move-up`/`.editor-move-down` (herdados
das classes que `EditorView.js` já gera), `.confirm-modal`, `.boot-loading`/
`.editor-empty`/`.editor-error`/`.editor-feedback`, `env(safe-area-inset-*)`
em `.boot-loading`, `.app-shell-editor`, `.app-shell-transport`.
`presenter.css` (já existente da Etapa 4) cobre `position:fixed;inset:0`.

## 7. Build

`npm run build` → `vite build` → `mobile/dist/index.html` + `dist/assets/*.js`
+ `dist/assets/*.css`. Verificado (via teste que roda o build de verdade):
- **Nenhum import bare não resolvido**: `grep` no bundle por
  `from "@capacitor/` ou `from "@capawesome/` → 0 ocorrências. Vite/Rollup
  empacotou `@capacitor/core`, `@capacitor/filesystem`, `@capacitor/preferences`
  e `@capawesome/capacitor-file-picker` inteiramente no bundle final.
- **Caminhos relativos**: `dist/index.html` referencia `./assets/...`
  (nunca `/assets/...`) — compatível com o `file://`/`https://localhost/`
  do WebView Capacitor.
- **Sem Electron**: 0 ocorrências de `require('electron')`/`from 'electron'`
  em qualquer bundle gerado.
- **Sem dependência de servidor externo**: nenhuma URL `http(s)://` fixa em
  `dist/index.html` ou nos bundles (exceto, implicitamente, nenhuma —
  o teste rejeita qualquer ocorrência).
- `npx cap sync android` copiou `mobile/dist/` para
  `mobile/android/app/src/main/assets/public/` (confirmado por
  `ls` — `index.html`, `assets/`, `cordova.js`, `cordova_plugins.js`).

## 8. Comandos executados e exit codes

| # | Comando | Exit code |
|---|---|---|
| 1 | `git status --short` / branch / HEAD (precheck) | 0 |
| 2 | `npm test`/`test:core`/`test:persistence`/`test:media`/`test:presentation`/`test:ui` (precheck, 271/271) | 0 |
| 3 | `sha256sum` dos arquivos protegidos (precheck) | 0 |
| 4 | `npm install --save-dev vite@8.1.5` | 0 |
| 5 | `node --check` em todos os arquivos novos/alterados | 0 (todos) |
| 6 | `npm run build` (1ª vez, manual) | 0 |
| 7 | `npx cap sync android` (1ª vez) — detectou `dist` como fonte | 0 |
| 8 | `npm run test:integration` — 27/27 (inclui um `vite build` real dentro do teste) | 0 |
| 9 | `npm test` (completo) — 299/299 | 0 |
| 10 | `npm run build` (final, para o relatório) | 0 |
| 11 | `npx cap sync android` (final) | 0 |
| 12 | `npx cap doctor` — `[success] Android looking great!` | 0 |
| 13 | `git diff --check` | 0 |
| 14 | `git status --short` (final) | 0 |
| 15 | comparação final de hashes dos arquivos protegidos | idênticos |

## 9. Testes: totais e preservação

- **Antes:** 271 testes.
- **Depois: 299 testes** — `npm test` 299/299. Novos: 12
  (`bootstrap.test.js`) + 10 (`index-html.test.js`) + 7
  (`build-output.test.js`) = 29, mais 1 teste adicional de confirmFn
  assíncrono em `EditorView.test.js` (- ajuste do teste existente para o
  novo fluxo assíncrono, sem perda de cobertura) = **+28 líquidos**.
- Todos os testes anteriores continuam passando.

## 10. Confirmações

- **Core sem Capacitor:** nenhuma alteração em `mobile/www/app/core/**`
  nesta etapa; teste dedicado (`bootstrap.test.js`, item 5) confirma que
  nenhum arquivo de UI/`AppController.js` referencia
  `createCapacitorStorage`/`createCapacitorMedia`.
- **Electron intacto:** hashes de `package.json`, `package-lock.json`,
  `main.js`, `preload.js`, `src/**`, `tests/**` (raiz) idênticos aos das
  Etapas 0-5. `git diff --stat HEAD` sem saída para esses caminhos.
- **`mobile/android/**`** alterado somente por `npx cap sync android`
  (esperado, dado o novo `webDir`); nenhuma edição manual.

## 11. Limitações e validações não realizadas

- **DEVICE_VALIDATION_BLOCKED** (herdado): sem JDK/Android SDK, não é
  possível confirmar em device que o bundle gerado pelo Vite roda
  corretamente dentro da WebView real do Capacitor (`Capacitor.convertFileSrc`,
  plugins nativos de fato respondendo).
- `mobile/www/app/main.js` usa `window.confirm` como fallback quando o
  modal HTML não existir no DOM (defesa, não caminho principal).
- Nenhum asset de logo (`src/logo-bs.png` do desktop) foi copiado para
  `mobile/www/` nesta etapa — `logoSrc` está vazio; a `PresenterView` já
  trata isso corretamente (elemento de logo escondido por padrão).

## 12. Status final

**IMPLEMENTATION_STATUS: COMPLETE** — bootstrap real conectado, imports
Capacitor corretamente empacotados (Vite), CSS touch-first implementado,
build web real gerado (`mobile/dist/`), conteúdo sincronizado com Android
(`npx cap sync android`).
**AUTOMATED_TEST_STATUS: PASS** — 299/299 testes, incluindo um teste que
executa `vite build` de verdade e inspeciona o resultado.
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED** — sem JDK/Android SDK
neste ambiente; o bundle não pôde ser executado dentro de uma WebView real.
