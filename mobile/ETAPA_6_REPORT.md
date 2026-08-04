# Relatório — Etapa 6: Ciclo de Vida e Robustez

**IMPLEMENTATION_STATUS: COMPLETE**
**AUTOMATED_TEST_STATUS: PASS**
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED**

---

## 1. Estado inicial

Branch `feat/mobile-android-v1`, HEAD `c26f304`. Antes desta etapa: 299/299
testes (Etapa 5B `COMPLETE`, ver `ETAPA_5B_REPORT.md`).

## 2. Dependência

Instalado `@capacitor/app@8.1.1` (versão estável mais recente compatível com
Capacitor 8 — não a `9.0.0-alpha`), como `dependency` (não devDependency,
pois é usado em runtime pelo bootstrap). Nenhuma biblioteca comunitária de
lifecycle foi instalada.

## 3. Arquivos criados

- `mobile/www/app/adapters/LifecycleCoordinator.js` — classe pura (sem
  import de Capacitor); recebe `controller`, `platform` (opcional) e
  `appState` (interface `{addListener}`) por injeção.
- `mobile/www/app/adapters/createLifecycleCoordinator.js` — **único**
  arquivo desta etapa que importa `@capacitor/app`; constrói o
  `LifecycleCoordinator` real ligando `appState.addListener` a
  `App.addListener` do plugin.
- `mobile/tests/adapters/LifecycleCoordinator.test.js` — 13 testes
  (construtor, start/stop idempotentes, background/foreground, wake lock
  condicional, serialização de eventos concorrentes, resiliência a erros).
- `mobile/tests/integration/lifecycle-flow.test.js` — 16 testes de
  integração com `AppController` real (não fake) cobrindo todos os
  cenários de robustez pedidos.
- `mobile/ETAPA_6_REPORT.md` (este arquivo).

## 4. Arquivos alterados

- `mobile/www/app/AppController.js` — 4 métodos públicos novos, usados
  exclusivamente pelo `LifecycleCoordinator` (a UI continua sem acessá-los
  diretamente):
  - `isPresenting()` — expõe `this._playback.presenting`.
  - `flushPendingSave()` — cancela o debounce pendente e grava
    imediatamente (`savePlaylist`+`saveSettings`).
  - `saveRuntimeStateNow()` — alias público de `_saveRuntimeStateNow`.
  - `resumeFromBackground(now)` — chama `PlaybackEngine.tick(...)` com o
    timestamp real de retorno; se o item expirou durante o background,
    avança (`autoNext`) e reflete na `PresentationAdapter`; se o item atual
    foi removido da playlist enquanto em segundo plano, mostra erro no
    editor e retorna à tela de edição; sempre re-renderiza e persiste o
    `RuntimeState` ao final (quando havia apresentação ativa).
- `mobile/www/app/main.js` — importa `createLifecycleCoordinator`; após
  `controller.init()`, constrói e inicia (`await lifecycle.start()`) o
  coordinator real, passando `platform` (a mesma instância usada pelo
  `LocalPresentationAdapter`). Falha ao iniciar o lifecycle (ex.: ambiente
  sem bridge nativa) é capturada e logada — **não** impede o app de abrir
  (loading/erro/app continuam corretos). `bootstrap()` ganhou o parâmetro
  injetável `createLifecycle` (default: `createLifecycleCoordinator`),
  propagado também no fluxo de retry.
- `mobile/package.json` — dependency `@capacitor/app@8.1.1`; script novo
  `test:lifecycle`.

**Não alterados:** todo o Electron da raiz; `core/**` (nenhum arquivo do
core importa Capacitor ou conhece o `LifecycleCoordinator` — ele fica na
camada de adapters, como os demais).

## 5. Comportamento implementado

### Background (`appStateChange` com `isActive:false`)
1. `flushPendingSave()` — qualquer edição de playlist/settings pendente por
   debounce é gravada imediatamente (sem esperar os 500ms restantes).
2. `saveRuntimeStateNow()` — grava `{currentItemId, elapsed, isPlaying,
   locked, blackout, presenting}` no storage.
3. Se `controller.isPresenting()` for `true` **e** uma `PresentationPlatform`
   foi injetada, libera o wake lock (`platform.allowSleep()`).
4. Nenhum serviço em background é criado — o app não promete continuar
   reproduzindo fora do processo ativo (conforme exigido).

### Foreground (`appStateChange` com `isActive:true`)
1. `controller.resumeFromBackground(now)`:
   - Se não havia apresentação ativa: apenas re-renderiza a transport bar
     (no-op seguro).
   - Se havia: chama `PlaybackEngine.tick(playlist, settings, now)`, que
     calcula o `elapsed` **por diferença de timestamp real** (`now -
     syncTimestamp`), nunca por soma de ticks perdidos — este cálculo já
     existia desde a Etapa 1 (`PlaybackEngine.elapsed()`); a Etapa 6 apenas
     passa a *chamar* esse cálculo no momento certo (retorno do
     background), em vez de depender de um timer que não roda enquanto a
     WebView está suspensa.
   - Se o item expirou durante o background: avança para o próximo
     (`autoNext`) e chama `presentation.show(item)` com o novo item.
   - Se o item atual não existe mais na playlist (removido durante o
     background): reporta erro no editor (`"A mídia em reprodução foi
     removida ou não está mais disponível."`), limpa a apresentação
     (`presentation.clear()`) e retorna ao editor.
2. Se `controller.isPresenting()` for `true` e a plataforma foi injetada,
   renova o wake lock (`platform.keepAwake()`).
3. `RuntimeState` é salvo novamente ao final de `resumeFromBackground`
   quando havia apresentação ativa.

### Reinício do app (fluxo já existente em `AppController.init()`, validado nesta etapa)
`init()` já carrega `settings` → `playlist` → `RuntimeState` → restaura
(`PlaybackEngine.restore`) de forma resiliente: qualquer uma dessas três
cargas pode falhar/rejeitar sem interromper as demais (cada uma tem seu
próprio `try/catch`), e `restore()` só aplica o `RuntimeState` se
`currentItemId` de fato existir na playlist carregada — caso contrário,
ignora silenciosamente (testado nesta etapa com um `RuntimeState`
propositalmente corrompido). Autoplay nunca é iniciado sozinho: `init()`
termina em `showEditor()`, nunca chama `startPresentation()` por conta
própria.

### Offline
Nenhum código desta etapa (ou de etapas anteriores) depende de rede: toda
a persistência é local (`Filesystem`/`Preferences`), a importação de mídia
é local (picker do sistema + cópia para o sandbox), e a apresentação lê o
arquivo já copiado via `convertFileSrc`. `tests/build/build-output.test.js`
(Etapa 5B) já garante ausência de URLs `http(s)://` fixas no bundle.

## 6. Robustez — cenários testados

Todos os itens da lista da Etapa 6 foram cobertos por teste automatizado:

| Cenário | Teste |
|---|---|
| `RuntimeState` corrompido | `lifecycle-flow.test.js`: "RuntimeState corrompido" |
| Playlist corrompida (rejeita ao carregar) | `lifecycle-flow.test.js`: "playlist corrompida" |
| Arquivo de mídia removido (durante background) | `lifecycle-flow.test.js`: "mídia removida durante o background" |
| Picker cancelado | `lifecycle-flow.test.js`: "picker cancelado" |
| Falha de cópia | `lifecycle-flow.test.js`: "falha de cópia durante importação" |
| Erro de vídeo | `lifecycle-flow.test.js`: "erro de vídeo" |
| Pause/resume repetidos | já coberto por `AppController.test.js` (Etapa 4/5); revalidado nesta suite completa |
| Background durante importação | `lifecycle-flow.test.js`: "background durante importação em andamento" |
| Background durante vídeo | `lifecycle-flow.test.js`: "background durante apresentação de vídeo" |
| Reentrada rápida no foreground | `LifecycleCoordinator.test.js`: "reentrada rápida no foreground" |
| Múltiplos eventos `appStateChange` | `LifecycleCoordinator.test.js` + `lifecycle-flow.test.js`: "múltiplos eventos/appStateChange" |
| Remoção correta dos listeners | `LifecycleCoordinator.test.js`: "start()/stop()"; `lifecycle-flow.test.js`: "stop() remove o listener" |
| Persistência sem excesso de escritas | `lifecycle-flow.test.js`: "múltiplos appStateChange … não geram escritas duplicadas" |
| Debounce/flush no background | `lifecycle-flow.test.js`: "background: flush de pendências…" |
| Arquivo de 2 GB como só metadado | `lifecycle-flow.test.js`: "arquivo grande (2 GB) permanece apenas como metadado" |
| Nenhum Base64 integral | mesmo teste acima — `FakeMedia.importToLibrary` nunca aceita/retorna payload de conteúdo, só `{relPath, mime, bytes}` |
| Elapsed real (não soma de ticks) | `lifecycle-flow.test.js`: "elapsed é recalculado por timestamp real" |

## 7. Testes: totais e preservação

- **Antes:** 299 testes.
- **Depois: 323 testes** — `npm test` 323/323. **+24 testes líquidos**,
  distribuídos entre `LifecycleCoordinator.test.js` (unitário/isolado,
  com fakes de `appState`/`controller`/`platform`) e
  `lifecycle-flow.test.js` (integração com `AppController` real).
- Todos os 299 testes anteriores continuam passando sem alteração.
- `npm run test:lifecycle` — 24/24 PASS, isolado.

## 8. Comandos executados e exit codes (checkpoint final)

| # | Comando | Resultado |
|---|---|---|
| 1 | `git status --short` / branch / HEAD (precheck) | inalterado, `feat/mobile-android-v1` @ `c26f304` |
| 2 | `npm install @capacitor/app@8.1.1` | 0 — 1 pacote adicionado |
| 3 | `npm run test:lifecycle` | 24/24 PASS |
| 4 | `npm test` (completo) | **323/323 PASS** |
| 5 | `npm run build` | sucesso — `dist/index.html` + `assets/*.js`/`*.css` (bundle ~58.9 kB) |
| 6 | `npx cap sync android` | sucesso — 4 plugins detectados (`@capacitor/app@8.1.1` incluído), copiou `dist/` → `android/app/src/main/assets/public` |
| 7 | `npx cap doctor` | `[success] Android looking great! 👌` |
| 8 | `node --check` (todos os `.js` em `www/`) | sem erros |
| 9 | `git diff --check` | exit 0 |
| 10 | `git status --short` (final) | inalterado (`.docs/`, `dist.zip`, `mobile/` untracked) |

## 9. Confirmações

- **Electron intacto:** `git status --short` na raiz não lista `main.js`,
  `preload.js`, `src/**`, `tests/**` ou `package.json`/`package-lock.json`
  da raiz — nenhum foi tocado.
- **Isolamento do plugin:** apenas `createLifecycleCoordinator.js` importa
  `@capacitor/app`; `LifecycleCoordinator.js` recebe tudo por injeção
  (`appState`), testável 100% em Node puro sem bridge nativa.
- **Nenhum serviço em background Android** foi criado — o app só reage a
  `appStateChange` enquanto o processo está vivo.
- **`AppController` continua sem importar Capacitor** — os 4 novos
  métodos públicos usam apenas o que já existia internamente
  (`_storage`, `_playback`, `_presentation`, `_shell`).

## 10. Bloqueios reais

Nenhum na implementação/testes automatizados. `ANDROID_DEVICE_STATUS`
permanece `DEVICE_VALIDATION_BLOCKED`: sem JDK/Android SDK/device físico
não é possível confirmar em ambiente real que `App.addListener` do plugin
nativo dispara `appStateChange` corretamente ao dar lock/unlock ou trocar
de app (o comportamento do plugin web/mock não é exercitado nos testes,
apenas a lógica do `LifecycleCoordinator`/`AppController` a jusante dele).

## 11. Próximo passo

Etapa 7 — Build APK e Validação Android, autorizada em sequência.
