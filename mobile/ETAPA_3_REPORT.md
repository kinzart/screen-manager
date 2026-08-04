# Relatório — Etapa 3: Importação e Biblioteca de Mídia

**IMPLEMENTATION_STATUS: COMPLETE**
**AUTOMATED_TEST_STATUS: PASS**
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED**

---

## 1. Estado inicial

```
?? .docs/
?? dist.zip
?? mobile/
```
Branch `feat/mobile-android-v1`. `npm test`/`test:core`/`test:persistence`
executados antes de qualquer edição: **133/133 passaram**.

## 2. Investigação do picker (obrigatória antes de instalar)

Avaliada a família de plugins de seleção de arquivo compatíveis com
Capacitor 8:

- **`@capawesome/capacitor-file-picker`** — escolhida. Versão instalada:
  `8.0.3` (mais recente estável na linha 8.x). `peerDependencies:
  {"@capacitor/core": ">=8.0.0"}` — confirmado via `npm view` antes de
  instalar. Publicado há ~1 mês (mantido ativamente), MIT, mantenedor
  `robingenz` (time capawesome, autores de vários plugins Capacitor
  oficialmente listados). Sem dependências próprias (`deps: none`).
- Nenhum outro pacote foi instalado para "experimentar" — apenas este foi
  avaliado e instalado, conforme exigido.
- Método usado: `pickMedia({ readData: false })` — seleciona imagens e
  vídeos da galeria em uma única chamada (em vez de `pickImages`/
  `pickVideos` separados), suficiente para o requisito ("selecionar
  imagens e vídeos").
- Método usado: `copyFile({ from, to, overwrite })` — cópia executada
  **inteiramente do lado nativo**, dado `since 7.1.0`, portanto disponível
  na versão 8.0.3 instalada.
- Confirmado por leitura de
  `node_modules/@capawesome/capacitor-file-picker/dist/esm/definitions.d.ts`
  (não por suposição): `PickedFile.path` (string, "Only available on
  Android and iOS") é o caminho nativo do arquivo original; `PickedFile.data`
  (Base64) só é preenchido se `readData: true` — e o adapter **nunca**
  define essa opção como `true`.

## 3. Estratégia real para arquivos grandes (sem Base64 integral)

- `pickMedia()` sempre chama o plugin com **`readData: false`** — os bytes
  do arquivo nunca atravessam o JavaScript como string, nunca ficam em
  memória no processo da WebView.
- A cópia para `library/<uid>.<ext>` é feita por
  `FilePicker.copyFile({ from: <path nativo do picker>, to: <caminho
  absoluto resolvido via Filesystem.getUri> })` — uma operação nativa que
  recebe apenas dois caminhos, nunca dados.
- Testado explicitamente (`CapacitorMedia.test.js`, "arquivo grande nunca é
  convertido integralmente em Base64…"): simulando um arquivo de 2 GB, a
  chamada a `copyFile` não contém nenhum campo `data`, apenas `from`/`to`
  (strings).
- **Nenhuma bridge/plugin Android próprio foi necessário** — `@capawesome/
  capacitor-file-picker@8.0.3` já expõe `copyFile` nativo, cobrindo o
  requisito sem código nativo adicional nesta etapa.
- Falha de cópia dispara limpeza best-effort do arquivo parcial no destino
  (`_cleanupPartial`, testado).

## 4. Arquivos criados e alterados

**Criados:**
- `mobile/www/app/adapters/CapacitorMedia.js` — implementação de `MediaPort`, sem importar Capacitor/@capawesome.
- `mobile/www/app/adapters/createCapacitorMedia.js` — única borda que importa `@capacitor/filesystem`, `@capacitor/core` e `@capawesome/capacitor-file-picker`.
- `mobile/tests/adapters/CapacitorMedia.test.js` — 32 testes.
- `mobile/tests/adapters/createCapacitorMedia.test.js` — 6 testes.
- `mobile/tests/helpers/FakeMediaPicker.js` — fake em memória (só teste).
- `mobile/ETAPA_3_REPORT.md` (este arquivo).

**Alterados:**
- `mobile/www/app/core/ports.js` — adicionados `MediaError`/`MediaErrorCode` (puro, sem import de Capacitor).
- `mobile/tests/core/ports.test.js` — +2 testes para `MediaError`/`MediaErrorCode` (nada removido).
- `mobile/tests/helpers/FakeFilesystem.js` — adicionados `getUri`/`deleteFile` e helpers `markAsCopied`/`hasFile` (aditivo; os 43 testes de persistência da Etapa 2 continuam intactos e verdes).
- `mobile/package.json` — dependência `@capawesome/capacitor-file-picker@8.0.3`; scripts `test:media` novo, `test` passou a cobrir `tests/adapters/*.test.js` (já incluía o padrão desde a Etapa 2), `test:persistence` foi restringido a `CapacitorStorage*.test.js` para não se misturar com os novos testes de mídia.
- `mobile/package-lock.json` — atualizado por `npm install`.
- `mobile/android/**` — atualizado por `npx cap sync android` (detectou o novo plugin `@capawesome/capacitor-file-picker@8.0.3`; nenhuma edição manual).

**Não alterados:** `mobile/www/index.html`, `mobile/www/styles/**`,
`mobile/www/app/main.js`, nenhum módulo de UI/PresenterView/EditorView/
TransportBar, `mobile/README.md`, e todos os arquivos do Electron (seção 10).

## 5. MediaRef final e requisitos de validação

```js
{ storage: 'sandbox', relPath: 'library/<uid>.<ext>', mime: 'image/...'|'video/...', bytes: <inteiro não negativo> }
```
- `validateMediaRef` (models.js, inalterado) é chamada em toda saída de
  `importToLibrary` e toda entrada de `resolveSrc`/`deleteFromLibrary` —
  bloqueia caminho absoluto do Windows, `file://`, `..` (path traversal) e
  MIME fora de `image/*`/`video/*`.
- **Reforço adicional específico de mídia:** `isWithinLibrary(relPath)`
  exige que `relPath` comece literalmente com `library/` — uma MediaRef
  tecnicamente válida por `validateMediaRef` mas apontando para fora de
  `library/` (ex.: `state/settings.json`) é **rejeitada** por
  `resolveSrc`/`deleteFromLibrary` com `MediaError(INVALID_REF)`. Testado.
- `MIME_TO_EXT` restringe os tipos aceitos em `importToLibrary` ao mesmo
  conjunto do desktop (`main.js` `SUPPORTED`): png, jpg/jpeg, webp, gif,
  mp4, webm — mais estrito que "qualquer image/video" aceito por
  `validateMediaRef`, por paridade intencional com o desktop.
- Cancelamento do picker (`pickMedia`) é diferenciado de erro real: retorna
  `[]`, nunca lança.
- UID gerado por `models.generateId()` (injetável) evita colisão de nome —
  cada importação recebe um novo UID.

## 6. Comandos executados e exit codes

| # | Comando | Exit code |
|---|---|---|
| 1 | `git status --short` / `git branch --show-current` (precheck) | 0 |
| 2 | `npm test` / `test:core` / `test:persistence` (precheck, 133/133) | 0 |
| 3 | `sha256sum` dos arquivos protegidos (precheck) | 0 |
| 4 | `npm view @capawesome/capacitor-file-picker versions/peerDependencies/deprecated` (investigação) | 0 |
| 5 | `npm install @capawesome/capacitor-file-picker@8.0.3` | 0 |
| 6 | `node --check` nos 7 arquivos novos/alterados | 0 (todos) |
| 7 | `npm run test:media` — 38/38 | 0 |
| 8 | `npm test` (completo) — 173/173 | 0 |
| 9 | `npm run test:core` — 92/92 | 0 |
| 10 | `npm run test:persistence` — 43/43 (confirma que a extensão de `FakeFilesystem.js` não quebrou a Etapa 2) | 0 |
| 11 | `npx cap sync android` — detectou os 3 plugins, incluindo o novo | 0 |
| 12 | `git diff --check` | 0 |
| 13 | `git status --short` (final) | 0 |
| 14 | comparação final de hashes dos arquivos protegidos | idênticos |

## 7. Testes: totais e preservação

- **Antes da Etapa 3:** 133 testes (90 core + 43 persistência).
- **Depois da Etapa 3:** **173 testes** — `npm test` 173/173, `test:core`
  92/92 (90 + 2 novos de `MediaError`), `test:persistence` 43/43
  (inalterado), `test:media` 38/38 (novo).
- Os 133 testes anteriores **continuam presentes e passando**; nenhum foi
  removido ou enfraquecido.

## 8. Confirmação do core sem Capacitor / Electron intacto

- Teste dedicado em `CapacitorMedia.test.js` varre os 6 arquivos do core
  procurando `import`/`require` executável de `@capacitor/*`,
  `@capawesome/*` ou `electron` — 0 ocorrências.
- `sha256sum` de `package.json`, `package-lock.json`, `main.js`,
  `preload.js`, `src/**`, `tests/**` (raiz) idênticos aos hashes das
  Etapas 0-2. `git diff --stat HEAD` para esses caminhos: sem saída.
- `mobile/android/**` foi alterado **apenas** por `npx cap sync android`
  (comando explicitamente autorizado quando um plugin é instalado) —
  nenhuma edição manual.

## 9. Limitações e validações não realizadas

- **DEVICE_VALIDATION_BLOCKED** (herdado das Etapas 0-2: JDK/Android SDK
  ausentes). Especificamente para esta etapa, não foi possível confirmar
  em device real:
  - O formato exato da mensagem/código de **cancelamento** nativo Android
    do picker (`isCancelError` cobre o texto confirmado da implementação
    web, `'pickFiles canceled.'`, mais qualquer mensagem contendo
    "cancel" — se o Android usar um texto totalmente diferente, isso
    precisará ser revisto com testes em device).
  - A **interoperabilidade exata** entre o formato de URI retornado por
    `Filesystem.getUri()` (ex.: `file:///...` vs. `content://...` no
    Android) e o formato de caminho esperado por
    `FilePicker.copyFile({to})` (a documentação mostra exemplos como
    `'/path/to/new-file.txt'`, sem prefixo `file://`). O adapter remove um
    prefixo `file://` se presente (`stripFileScheme`) como melhor esforço,
    mas isso **não foi validado em device** — é a maior incerteza técnica
    desta etapa e fica registrada explicitamente aqui.
  - Se `Directory.Data` no Android realmente aceita cópia via caminho
    absoluto de app-privado sem passar por content resolver/SAF (o típico
    para `Directory.Data`, mas não confirmável sem device).
- Nenhuma dessas incertezas foi escondida: todas cobertas por testes com
  fakes que fixam o contrato esperado, mas o contrato em si só pode ser
  confirmado com JDK/Android SDK instalados e um device/emulador.

## 10. Status final

**IMPLEMENTATION_STATUS: COMPLETE** — `MediaPort` implementado
integralmente (`pickMedia`, `importToLibrary`, `resolveSrc`,
`deleteFromLibrary`), sem Base64 integral de arquivos grandes, sem código
nativo próprio necessário.
**AUTOMATED_TEST_STATUS: PASS** — 173/173 testes, todos os scripts
(`test`, `test:core`, `test:persistence`, `test:media`) verdes.
**ANDROID_DEVICE_STATUS: DEVICE_VALIDATION_BLOCKED** — sem JDK/Android SDK
neste ambiente; as incertezas da seção 9 permanecem pendentes de
verificação em device real antes de qualquer alegação de "funciona no
Android".
