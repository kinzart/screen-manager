# Relatório — Etapa 4: Apresentação Local

**IMPLEMENTATION_STATUS: COMPLETE**
**AUTOMATED_TEST_STATUS: PASS**
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED**

---

## 1. Estado inicial

Branch `feat/mobile-android-v1`. Antes desta etapa: 173/173 testes
(`npm test`), Etapa 3 `COMPLETE`.

## 2. Arquivos criados e alterados

**Criados:**
- `mobile/www/app/ui/PresenterView.js` — DOM da apresentação (imagem/vídeo/blackout/logo/loading/erro/controles).
- `mobile/www/app/adapters/LocalPresentationAdapter.js` — implementação de `PresentationAdapter`.
- `mobile/www/app/adapters/PresentationPlatform.js` — wrapper de Wake Lock/Orientação/Fullscreen (APIs Web, por injeção).
- `mobile/www/styles/presenter.css` — estilos da apresentação (fit contain/cover, transições, blackout, logo, controles).
- `mobile/tests/ui/PresenterView.test.js` — 20 testes (jsdom).
- `mobile/tests/adapters/LocalPresentationAdapter.test.js` — 10 testes.
- `mobile/tests/adapters/PresentationPlatform.test.js` — 13 testes.
- `mobile/ETAPA_4_REPORT.md` (este arquivo).

**Alterados:**
- `mobile/package.json` — devDependency `jsdom@29.1.1` (justificativa: seção 4); script `test:presentation` novo; `test` passou a incluir `tests/ui/*.test.js`.
- `mobile/package-lock.json` — atualizado por `npm install`.

**Não alterados nesta etapa** (autorizado, mas não necessário ainda —
integração fica para a Etapa 5): `mobile/www/index.html`,
`mobile/www/styles/app.css`, `mobile/www/app/main.js`.
`mobile/android/**` **não foi tocado** — nenhum plugin Capacitor novo foi
instalado nesta etapa (ver seção 3), logo `npx cap sync android` não era
necessário e não foi executado.

## 3. Dependências de plataforma — decisão

Avaliadas conforme pedido: `@capacitor/status-bar`, `@capacitor/screen-orientation`,
Screen Wake Lock API.

**Decisão: nenhum plugin Capacitor novo foi instalado.** Toda capacidade de
plataforma desta etapa (manter tela ligada, travar orientação, tela cheia)
é implementada sobre **APIs Web padrão** (`navigator.wakeLock`,
`screen.orientation`, Fullscreen API), já suportadas pela WebView Android/
Chrome, seguindo a preferência explícita do plano ("Prefira Screen Wake
Lock API com feature detection" / "Não instale plugin comunitário de
keep-awake sem justificar"). `PresentationPlatform` nunca acessa esses
globais diretamente — recebe-os por injeção de dependência, então em
produção o bootstrap (Etapa 5) passará os objetos reais
(`navigator.wakeLock`, `screen.orientation`, um wrapper de
`element.requestFullscreen()`); nos testes, fakes. Isso elimina o risco de
compatibilidade de um plugin nativo extra que não pôde ser validado em
device.

## 4. Por que jsdom (justificativa exigida)

`PresenterView` manipula elementos `<img>`/`<video>` reais: `classList`,
atributos (`autoplay`, `muted`, `playsInline`, `loop`), e eventos
(`error`, `ended`, `loadedmetadata`). Um fake de DOM caseiro reproduziria
mal esse contrato (múltiplas APIs de elemento, herança de `HTMLElement`,
`dispatchEvent`). `jsdom` é uma implementação de DOM madura e já usada no
projeto (o teste desktop `tests/control.test.js` também usa jsdom, na raiz
do repositório) — reaproveitar a mesma ferramenta, isolada como
devDependency **somente dentro de `mobile/`**, é consistente com o
restante do projeto e evita reinventar um DOM parcial. `jsdom` **não**
introduz nenhum framework de UI; continua HTML/CSS/JS puro.

**Limitação conhecida do jsdom (documentada, não escondida):**
`HTMLMediaElement.play()`/`pause()` não são implementados de verdade pelo
jsdom (ele registra "Not implemented" no console e não lança). Os testes
de `pause()`/`resume()` validam que os métodos são chamados sem lançar
exceção — **não** que o vídeo realmente toca. Reprodução real de
vídeo/áudio só pode ser validada em device (`DEVICE_VALIDATION_BLOCKED`).

## 5. Decisões técnicas — PresenterView

- Reproduz a lógica de `src/display.js` (autoplay/muted/playsInline,
  blackout via camada própria, logo, pause/resume no `<video>` atual) numa
  única view mobile, sem duas janelas/IPC.
- Novidades em relação ao desktop (não existiam em `display.js`): estado de
  carregamento (`setLoading`), estado de erro visível (`setError`), classes
  `fit-contain`/`fit-cover` explícitas (desktop aplicava a classe
  `item.fit` diretamente via string interpolation, sem normalização),
  camada de controles com botão de saída (`aria-label="Sair da
  apresentação"`, alvo de toque ≥44px via CSS) — o desktop não tinha
  conceito de "sair", pois a apresentação ficava em uma janela separada
  controlada pelo operador.
- `_transitionClass`/fallback de transição reaproveitam a mesma lista de
  transições do core (`cut`, `fade`, `slide-left`, `slide-up`, `zoom`) —
  valor desconhecido cai em `enter-fade`, replicado localmente na view (não
  importa `core/transitions.js` para manter a view livre de qualquer
  decisão de negócio — a decisão de transição já vem pronta do
  `PlaylistItem`/`AppController`).

## 6. LocalPresentationAdapter — capabilities honestas

`capabilities()` retorna `{ fullscreen, remote: false, secondScreen: false }`
onde `fullscreen` só é `true` quando uma `PresentationPlatform` com
Fullscreen API **realmente suportada** foi injetada — nunca apenas porque a
`PresenterView` ocupa 100% da viewport via CSS (`position: fixed; inset:
0`). Testado explicitamente (`capabilities(): honestas…`): sem
`platform` → `fullscreen: false`; com `platform` cuja API de fullscreen
está disponível → `fullscreen: true`. `remote` e `secondScreen` são sempre
`false` nesta etapa — v1 é local-only; nenhum código tenta detectar ou usar
um segundo monitor (`getScreenDetails`/`isExtended`/`BrowserWindow`
ausentes, confirmado por teste de arquitetura).

## 7. Comandos executados e exit codes

| # | Comando | Exit code |
|---|---|---|
| 1 | `git status --short` / branch (precheck) | 0 |
| 2 | `npm install --save-dev jsdom@29.1.1` | 0 |
| 3 | `node --check` nos 6 arquivos novos | 0 (todos) |
| 4 | `npm run test:presentation` — 43/43 | 0 |
| 5 | `npm test` (completo) — 216/216 | 0 |
| 6 | `git diff --check` | 0 |
| 7 | `git status --short` (final) | 0 |
| 8 | comparação final de hashes dos arquivos protegidos | idênticos |

`npx cap sync android` **não foi executado** nesta etapa — nenhum plugin
Capacitor novo foi instalado (seção 3), então não havia nada para
sincronizar; `mobile/android/**` permanece exatamente como a Etapa 3 o
deixou.

## 8. Testes: totais e preservação

- **Antes:** 173 testes.
- **Depois: 216 testes** — `npm test` 216/216. Distribuição nova:
  `test:presentation` 43/43 (13 `PresentationPlatform` + 10
  `LocalPresentationAdapter` + 20 `PresenterView`).
- Os 173 testes anteriores continuam passando, nenhum removido/enfraquecido.

## 9. Confirmações

- **Core sem Capacitor:** nenhum arquivo desta etapa altera
  `mobile/www/app/core/**`; testes de arquitetura (herdados +
  `LocalPresentationAdapter.test.js`) confirmam ausência de import de
  `@capacitor/*`/`electron` nos novos adapters.
- **Electron intacto:** hashes de `package.json`, `package-lock.json`,
  `main.js`, `preload.js`, `src/**`, `tests/**` (raiz) idênticos aos das
  Etapas 0-3. `git diff --stat HEAD` sem saída para esses caminhos.
- **`mobile/android/**` intocado** — sem instalação de plugin, sem `cap
  sync` nesta etapa.

## 10. Limitações e validações não realizadas

- **DEVICE_VALIDATION_BLOCKED** (herdado): sem JDK/Android SDK, não é
  possível confirmar em device real:
  - se `navigator.wakeLock`/`screen.orientation`/Fullscreen API de fato se
    comportam como esperado dentro da WebView Android do Capacitor
    (geralmente suportadas em Chrome/WebView moderno, mas não confirmado
    neste ambiente);
  - reprodução real de codecs de vídeo (autoplay/muted/playsInline em
    device, distinto do comportamento simulado por jsdom);
  - toque real nos controles/botão de saída (alvo de 44px é uma
    recomendação de acessibilidade aplicada via CSS, não testada com um
    dedo real).
- Não implementado nesta etapa (fora de escopo, conforme instruído): HDMI,
  casting, segundo monitor Android.

## 11. Status final

**IMPLEMENTATION_STATUS: COMPLETE** — `PresenterView`,
`LocalPresentationAdapter` e `PresentationPlatform` implementados
integralmente, cobrindo imagem, vídeo, play/pause/resume, blackout, logo,
clear, transições, fit contain/cover, orientação/wake-lock com feature
detection, capabilities honestas.
**AUTOMATED_TEST_STATUS: PASS** — 216/216 testes (`npm test`,
`test:presentation` inclusos), todos exit code 0.
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED** — sem JDK/Android SDK
neste ambiente; ver seção 10 para o que especificamente depende de device
real antes de qualquer alegação de funcionamento no Android.
