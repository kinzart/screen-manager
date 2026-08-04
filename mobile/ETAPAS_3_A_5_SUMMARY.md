# Resumo consolidado — Etapas 3, 4 e 5

**Branch:** `feat/mobile-android-v1`
**Status do lote: todas as três etapas CODE_COMPLETE, testes automatizados
verdes, validação em device real BLOQUEADA por ausência de JDK/Android
SDK (`DEVICE_VALIDATION_BLOCKED`).** Isto não deve ser interpretado como
"aplicativo Android validado" — apenas como "código e testes automatizados
completos, aguardando confirmação em device real".

---

## Estado do Git

- **Antes do lote:** 133 testes (Etapas 0-2 completas), branch limpa exceto `.docs/`, `dist.zip`, `mobile/` (untracked, esperado).
- **Depois do lote:** **271 testes**, mesma branch, mesmo conjunto de untracked — **nada foi adicionado ao stage, nenhum commit foi feito**.
- `git diff --check` e a comparação de hashes dos arquivos protegidos (`package.json`/`package-lock.json` da raiz, `main.js`, `preload.js`, `src/**`, `tests/**`) confirmam **zero alterações** no Electron, do início ao fim do lote.

## Resultado por etapa

| Etapa | Implementação | Testes automatizados | Device Android |
|---|---|---|---|
| 3 — Importação e biblioteca de mídia | COMPLETE | PASS (38 novos, 173 total) | DEVICE_VALIDATION_BLOCKED |
| 4 — Apresentação local | COMPLETE | PASS (43 novos, 216 total) | DEVICE_VALIDATION_BLOCKED |
| 5 — Interface touch-first e fluxo completo | COMPLETE | PASS (55 novos, 271 total) | DEVICE_VALIDATION_BLOCKED |

## Dependências instaladas no lote (e por quê)

| Pacote | Versão | Etapa | Justificativa |
|---|---|---|---|
| `@capawesome/capacitor-file-picker` | 8.0.3 | 3 | Único pacote avaliado: `peerDependencies: {"@capacitor/core": ">=8.0.0"}` confirmado via `npm view` antes de instalar; ativamente mantido (Capawesome); expõe `pickMedia()` (sem Base64 quando `readData:false`) e `copyFile()` (cópia 100% nativa) — resolve a exigência de arquivos grandes sem nenhum plugin nativo próprio. |
| `jsdom` (devDependency) | 29.1.1 | 4 | Testar `PresenterView`/`EditorView`/`TransportBar`/`AppShell` (manipulação real de `<img>`/`<video>`/eventos DOM) sem depender de device; já usado no projeto desktop (`tests/control.test.js`), mantendo consistência; **não** introduz framework de UI. |

Nenhuma outra dependência foi instalada. `@capacitor/status-bar` e
`@capacitor/screen-orientation` foram avaliados e **descartados** — Wake
Lock/Orientação/Fullscreen são cobertos por APIs Web padrão, já
suportadas pela WebView, sem necessidade real de plugin nativo adicional
(ver `ETAPA_4_REPORT.md`, seção 3).

## Picker de mídia escolhido e evidência de compatibilidade

`@capawesome/capacitor-file-picker@8.0.3`. Evidência: `npm view` mostrou
`peerDependencies: {"@capacitor/core": ">=8.0.0"}`; leitura direta de
`node_modules/@capawesome/capacitor-file-picker/dist/esm/definitions.d.ts`
confirmou os métodos `pickMedia({readData})` e `copyFile({from,to,overwrite})`
antes de qualquer código ser escrito contra eles. Detalhe completo em
`ETAPA_3_REPORT.md`, seções 2-3.

## Estratégia real para arquivos grandes

`readData: false` sempre — os bytes do arquivo nunca atravessam o
JavaScript como Base64 nem ficam em memória no processo da WebView. A
cópia para `library/<uid>.<ext>` é 100% nativa via
`FilePicker.copyFile({from, to})`, que recebe apenas caminhos, nunca
dados. Testado explicitamente simulando um arquivo de 2 GB
(`CapacitorMedia.test.js`). Nenhuma bridge/plugin Android próprio foi
necessário.

## Totais de testes

- **Antes do lote (fim da Etapa 2):** 133.
- **Depois da Etapa 3:** 173 (+38 mídia, +2 `MediaError`/`MediaErrorCode`).
- **Depois da Etapa 4:** 216 (+43 apresentação: `PresentationPlatform`, `LocalPresentationAdapter`, `PresenterView`).
- **Depois da Etapa 5 (final do lote): 271** (+55 UI/integração: `EditorView`, `TransportBar`, `AppShell`, `AppController`).
- Todos os testes de todas as etapas anteriores **permanecem presentes e verdes** — nenhum foi removido ou enfraquecido em nenhum momento do lote.

## Scripts de teste disponíveis (`mobile/package.json`)

```
npm test               # tudo: core + adapters + ui + AppController — 271/271
npm run test:core      # só o core puro — 92/92
npm run test:persistence  # CapacitorStorage/createCapacitorStorage — 43/43
npm run test:media     # CapacitorMedia/createCapacitorMedia — 38/38
npm run test:presentation # PresentationPlatform/LocalPresentationAdapter/PresenterView — 43/43
npm run test:ui        # EditorView/TransportBar/AppShell/AppController — 55/55
```

## Comandos executados no lote e exit codes (visão consolidada)

Todos com exit code `0`: `npm install` (2×, para os dois pacotes),
`node --check` em todos os `.js` novos (production + testes),
`npm test`/`test:core`/`test:persistence`/`test:media`/`test:presentation`/`test:ui`
em cada etapa, `npx cap sync android` (Etapa 3, detectou o novo plugin),
`npx cap doctor` (fim do lote), `git diff --check`, `git status --short`,
comparação de hashes SHA-256 dos arquivos protegidos. Nenhum comando
falhou; nenhum resultado foi declarado sucesso sem confirmação de exit
code e saída. Detalhamento comando-a-comando em cada `ETAPA_N_REPORT.md`.

## Resultado de `cap sync` e `cap doctor`

- `npx cap sync android` (Etapa 3): `[success] android platform added!`
  não aplicável (já existia); sincronizou e detectou os 3 plugins
  instalados (`@capacitor/filesystem`, `@capacitor/preferences`,
  `@capawesome/capacitor-file-picker`). Etapas 4 e 5 não instalaram
  plugins novos, então `cap sync` não foi executado nelas (nada a
  sincronizar).
- `npx cap doctor` (fim do lote): `[success] Android looking great! 👌` —
  versões coerentes entre `cli`/`core`/`android`. **Este comando não
  verifica JDK/Android SDK** — apenas coerência de versões dos pacotes
  Capacitor instalados.

## Confirmações

- **Core sem Capacitor:** todo arquivo criado nas Etapas 3-5 foi varrido
  por testes de arquitetura dedicados (regex sobre código sem comentários)
  procurando `import`/`require` de `@capacitor/*`, `@capawesome/*` ou
  `electron` em `mobile/www/app/core/**` — zero ocorrências executáveis em
  todas as três etapas.
- **Electron intacto:** `sha256sum` de `package.json`, `package-lock.json`,
  `main.js`, `preload.js`, `src/**`, `tests/**` (raiz) idênticos do início
  ao fim do lote (mesmos hashes das Etapas 0-2). `mobile/android/**` só
  foi alterado por `npx cap sync android` na Etapa 3 (plugin novo
  detectado), nunca editado manualmente.

## Limitações reais (consolidado)

1. **JDK e Android SDK ausentes** neste ambiente — bloqueia toda validação
   em device/emulador real (build Gradle, `cap run android`, toque real,
   reprodução real de vídeo/codecs, wake lock/orientação/fullscreen reais,
   formato exato de erros nativos do picker e do filesystem).
2. **Interoperabilidade `Filesystem.getUri()` ↔ `FilePicker.copyFile({to})`**
   não pôde ser confirmada em device (Etapa 3) — a remoção do prefixo
   `file://` é um melhor esforço, não uma certeza validada.
3. **Bundler/import map não decidido** (Etapa 5) — `main.js` não foi
   integrado com os adapters reais porque os specifiers `@capacitor/*`
   exigem um pipeline de build que este projeto ainda não tem; a lógica em
   si está implementada e testada, falta só essa "última milha".
4. **`app.css` do editor não foi criado** — o editor funciona (testado via
   jsdom) mas sem estilo visual aplicado ainda.
5. **Diálogo de confirmação de exclusão** é injetável mas usa um default
   permissivo (sempre confirma) até que a integração de UI nativa exista.

## Validações pendentes em device

- Build Gradle real (`gradlew assembleDebug`) e instalação em
  device/emulador.
- Toque real em todos os controles (tamanho de alvo, resposta ao dedo,
  teclado virtual sobre os campos de edição).
- Reprodução real de vídeo (codecs, autoplay, `muted`/`playsInline` em
  WebView Android real).
- Wake Lock, Screen Orientation e Fullscreen API dentro da WebView do
  Capacitor (implementadas com feature detection, mas não confirmadas em
  runtime real).
- Comportamento exato de erros nativos do `@capacitor/filesystem` e do
  `@capawesome/capacitor-file-picker` (formato de mensagem/código —
  `isNotFoundError`/`isCancelError` cobrem o que foi confirmado na
  implementação *web* dos plugins, não a nativa).
- Ciclo de vida Android real (app em segundo plano, tela bloqueada,
  processo morto pelo sistema) — o `RuntimeState` foi desenhado para
  suportar isso (salva em eventos significativos), mas não foi exercitado
  em device.

## O que falta antes de produzir um APK

1. **Decidir e configurar um bundler** (esbuild/rollup/vite, o mais leve
   possível) ou um import map, para que `main.js` possa de fato importar
   os adapters Capacitor reais (`createCapacitorStorage`,
   `createCapacitorMedia`) e ser carregado pela WebView do Capacitor —
   ver `ETAPA_5_REPORT.md`, seção 6.
2. **Escrever o bootstrap real em `main.js`**: construir `AppShell` sobre
   o `#app` de `index.html`, instanciar os adapters reais via as fábricas
   (`createCapacitorStorage`, `createCapacitorMedia`), montar
   `LocalPresentationAdapter` com um `PresentationPlatform` alimentado por
   `navigator.wakeLock`/`screen.orientation`/Fullscreen API reais, e
   chamar `AppController.init()`.
3. **Instalar JDK + Android SDK** neste ambiente (ou usar um ambiente com
   essas ferramentas) para sair de `DEVICE_VALIDATION_BLOCKED`.
4. **Rodar em device/emulador real** e validar a lista da seção anterior
   ("Validações pendentes em device").
5. **Estilizar `app.css`** do editor (hoje só `presenter.css` tem estilo).
6. **Decidir a UI de confirmação de exclusão** (diálogo nativo Capacitor
   ou modal in-app) e conectar via `confirmFn`.
7. Só então: `npx cap sync android`, `gradlew assembleDebug` (ou
   `cap run android`), gerar o primeiro APK de teste.

Nenhum desses itens foi executado nesta sessão — todos ficam registrados
aqui como próximos passos explícitos, não implícitos.
