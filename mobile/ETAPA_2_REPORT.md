# Relatório — Etapa 2: Persistência Mobile

**Status final: COMPLETE**

---

## 1. Estado inicial do Git (precheck)

```
?? .docs/
?? dist.zip
?? mobile/
```
Working tree limpo além desses untracked pré-existentes (nada foi
`reset`/`restore`/`clean`/`stash`; nenhum arquivo removido).

## 2. Branch e HEAD

- Branch: `feat/mobile-android-v1` (confirmada antes e depois das alterações).
- `npm test` executado **antes** de qualquer edição: **87/87 passaram**
  (suíte herdada da Etapa 1).

### Hashes iniciais dos arquivos protegidos (precheck — idênticos aos das
Etapas 0 e 1, e confirmados idênticos novamente ao final, seção 17)

```
b948ddd9…2d4cb15c  package.json
f85bc1a1…d4b90e2f  package-lock.json
68d4c667…7725f84   main.js
ac7e9ccf…9cc3e41   preload.js
6f0f7d6e…f53c336d src/control.js
ad4d1e4d…8248a498  src/display.js
5a4084bf…7c25a287  src/control.css
25511794…f81a4     src/control.html
afbbce27…7f1730bb  src/display.css
fa1af963…41ba3ef3  src/display.html
b942ec5c…7cad28db  src/logo-bs.png
e5147b09…f601fbd5  src/schedule.css
d0afb99b…957ac828  tests/control.test.js
```

## 3. Arquivos criados e alterados

**Criados:**
- `mobile/www/app/adapters/CapacitorStorage.js` — implementação de `StoragePort`, sem importar Capacitor.
- `mobile/www/app/adapters/createCapacitorStorage.js` — única borda que importa `@capacitor/filesystem` e `@capacitor/preferences`.
- `mobile/tests/adapters/CapacitorStorage.test.js` — 37 testes (fakes).
- `mobile/tests/adapters/createCapacitorStorage.test.js` — 6 testes.
- `mobile/tests/helpers/FakeFilesystem.js` — fake em memória (só para teste).
- `mobile/tests/helpers/FakePreferences.js` — fake em memória (só para teste).
- `mobile/ETAPA_2_REPORT.md` (este arquivo).

**Alterados:**
- `mobile/www/app/core/ports.js` — adicionados `StorageError` e `StorageErrorCode` (classe/constante puras, sem import de Capacitor — conceito de contrato, não de implementação).
- `mobile/tests/core/ports.test.js` — adicionados 3 testes para `StorageError`/`StorageErrorCode` (os 6 testes originais **não foram alterados nem removidos**).
- `mobile/package.json` — adicionado o script `test:persistence`; `test` passou a rodar core+adapters; `test:core` **continua rodando somente o core**.

**Não alterados** (não foi necessário): `mobile/package-lock.json`, `mobile/README.md`.

**Confirmadamente intocados:** `mobile/www/index.html`, `mobile/www/styles/**`,
`mobile/www/app/main.js`, `mobile/www/app/core/models.js`,
`mobile/www/app/core/PlaylistManager.js`, `mobile/www/app/core/PlaybackEngine.js`,
`mobile/www/app/core/ScheduleEngine.js`, `mobile/www/app/core/transitions.js`,
`mobile/android/**` (nenhum arquivo sob `android/` tem mtime posterior a
`ETAPA_1_REPORT.md` — verificado com `find android -newer ETAPA_1_REPORT.md`,
0 resultados), e todos os arquivos do Electron (seção 17).

## 4. Estrutura da implementação

```
mobile/www/app/adapters/
├── CapacitorStorage.js        # StoragePort real, recebe plugins por injeção
└── createCapacitorStorage.js  # única borda que importa @capacitor/*

mobile/tests/
├── adapters/
│   ├── CapacitorStorage.test.js       # comportamento, com fakes
│   └── createCapacitorStorage.test.js # construção/wiring, sem I/O real
└── helpers/
    ├── FakeFilesystem.js   # só para teste — nunca importado em produção
    └── FakePreferences.js  # só para teste — nunca importado em produção
```

`CapacitorStorage` recebe `{ filesystem, preferences, directory, encoding,
logger?, now? }` pelo construtor — nunca importa `@capacitor/*` nem toca
variáveis globais. `createCapacitorStorage()` é a fábrica que conecta os
plugins reais (`Filesystem`, `Preferences`, `Directory.Data`,
`Encoding.UTF8`). O core (`mobile/www/app/core/**`) permanece sem qualquer
import de Capacitor — confirmado por teste (seção 9).

## 5. Caminhos JSON e chave do Preferences (centralizados como constantes)

```js
export const STATE_DIR = 'state';
export const PLAYLIST_PATH = `${STATE_DIR}/playlist.json`;   // "state/playlist.json"
export const SETTINGS_PATH = `${STATE_DIR}/settings.json`;   // "state/settings.json"
export const RUNTIME_STATE_KEY = 'fbs.mobile.runtimeState.v1';
```
Todos relativos (nunca absolutos), sob `Directory.Data`; nenhuma string de
caminho ou chave é repetida em outro lugar do código — todo método usa
essas constantes.

## 6. Defaults adotados

```js
export const DEFAULT_SETTINGS = Object.freeze({ rules: [], defaultFit: 'contain', loopPlaylist: true });
```
Espelha exatamente o seed do desktop (`main.js` linha 16:
`{ rules: [], defaultFit: 'contain', loopPlaylist: true }`), definido em
`CapacitorStorage.js` (não em `models.js`, que não foi alterado — `models.js`
contém apenas validadores, não valores default, por design da Etapa 1).

## 7. Comportamento para arquivo ausente

- `loadPlaylist()`: `readFile` lança "arquivo não encontrado" →
  `isNotFoundError()` reconhece → retorna `[]`. Nenhum warning (é o caminho
  esperado, não uma corrupção).
- `loadSettings()`: mesmo tratamento → retorna cópia de `DEFAULT_SETTINGS`.
- `loadRuntimeState()`: `Preferences.get` retorna `{ value: null }` para
  chave ausente (contrato documentado do plugin) → retorna `null`.

## 8. Comportamento para JSON corrompido

Em todos os três métodos de leitura: `JSON.parse` falha → `logger.warn({
event: 'storage.fallback', reason: 'corrupted-json', path|key, error, at })`
→ fallback (`[]`, `DEFAULT_SETTINGS` ou `null`, respectivamente). **O
arquivo/chave corrompido NUNCA é sobrescrito durante o load** — nenhuma
chamada a `writeFile`/`Preferences.set` acontece nesse caminho (testado
explicitamente). O mesmo fallback + warning (`reason: 'invalid-model'`)
ocorre quando o JSON é válido mas a estrutura não passa nas funções reais
de `models.js` (`validatePlaylistItem`/`validateSettings`/`validateRuntimeState`).

## 9. Comportamento para erros reais de I/O

Erros de leitura/escrita que **não** são "não encontrado" (permissão,
disco cheio, falha nativa) são envolvidos em `StorageError` com um dos
códigos `READ_FAILED`, `WRITE_FAILED` ou `PREFERENCES_FAILED` (`ports.js`)
e **relançados** — nunca confundidos com arquivo ausente, nunca
engolidos. `StorageError.cause` preserva o erro original para diagnóstico.
Erros de **validação** (playlist/settings/runtime state inválidos passados
para `save*`) usam o código `INVALID_MODEL` e são lançados **antes** de
qualquer chamada de I/O (testado: nenhuma chamada a `writeFile`/`set`
ocorre quando a validação falha).

## 10. Estratégia de concorrência

Fila de escrita **por caminho**, dentro do processo JS
(`_writeQueues: Map<path, Promise>`), implementada em
`CapacitorStorage._enqueueWrite()`. Duas chamadas a `savePlaylist()` (ou
`saveSettings()`) disparadas sem `await` entre si para o **mesmo arquivo**
são encadeadas: a segunda só inicia `writeFile` depois que a primeira
termina (com sucesso ou falha). Testado com `FakeFilesystem.setWriteDelay()`
simulando uma escrita lenta e duas chamadas concorrentes — nenhuma
sobreposição de `writeFile` no mesmo caminho ocorre, e o conteúdo final
corresponde à última escrita enfileirada (FIFO).

## 11. Garantia e limitação de atomicidade

**Garantido e testado:** dentro do mesmo processo JavaScript, duas escritas
concorrentes no mesmo arquivo nunca se sobrepõem (fila por caminho).

**NÃO garantido — limitação documentada, não inventada:** atomicidade
completa contra falhas externas ao processo JS (o app Android sendo morto
pelo sistema, crash nativo, ou falha de energia no meio de uma escrita)
**não é garantida** por esta implementação. `writeFile` é uma escrita
direta ao caminho final, sem escrita em arquivo temporário + `rename`.

**Por que não foi implementado temp+rename nesta etapa:** o
`FilesystemPlugin` instalado (`@capacitor/filesystem@8.1.2`) expõe
`rename(options: RenameOptions)`, então tecnicamente é possível escrever em
`state/playlist.json.tmp` e renomear por cima do arquivo final. Mas a
semântica exata de `rename` quando o destino **já existe** (sobrescrita
silenciosa vs. erro) varia entre a implementação web (`dist/esm/web.js`,
lança `Error` se o destino já existe sem overwrite explícito — ver linha
542 do arquivo) e o comportamento nativo Android, que **não pôde ser
verificado neste ambiente** (sem JDK/Android SDK/device — ver seção 18,
bloqueio herdado das Etapas 0-1). Implementar temp+rename sem poder validar
essa semântica em device real violaria a instrução explícita desta etapa
("não invente garantia de atomicidade" / "avalie somente se a semântica for
confiável e testável"). A decisão foi entregar a garantia que **pode** ser
verificada agora (serialização em processo) e documentar claramente o que
falta para atomicidade completa (validação de `rename` em device Android —
candidato a uma etapa futura, quando JDK/SDK estiverem disponíveis).

## 12. Tabela: método da StoragePort → implementação → testes

| Método | Implementação (`CapacitorStorage.js`) | Testes |
|---|---|---|
| `loadPlaylist()` | `_readJsonFile(PLAYLIST_PATH)` + `Array.isArray` + `validatePlaylistItem` por item + `defensiveCopy` | `CapacitorStorage.test.js`: ausente, round-trip, ordem, JSON malformado, modelo inválido, erro de leitura, cópia defensiva, UTF-8/Directory |
| `savePlaylist(items)` | valida `Array` + cada item com `validatePlaylistItem` (antes de qualquer I/O) → `_writeJsonFile` (mkdir + fila de escrita) | inválido rejeitado antes da escrita, path absoluto rejeitado, file:/// rejeitado, erro de escrita, mkdir do `state/`, concorrência |
| `loadSettings()` | `_readJsonFile(SETTINGS_PATH)` + `validateSettings` + `defensiveCopy`, fallback `DEFAULT_SETTINGS` | ausente→defaults, round-trip, JSON malformado, regra inválida, loopPlaylist true/false, cópia defensiva |
| `saveSettings(settings)` | `validateSettings` (antes do I/O) → `_writeJsonFile` | inválido rejeitado antes da escrita, round-trip |
| `loadRuntimeState()` | `Preferences.get` → `JSON.parse` → `validateRuntimeState` → `defensiveCopy`, fallback `null` | chave ausente, round-trip, JSON corrompido, modelo inválido, erro real do Preferences |
| `saveRuntimeState(state)` | `validateRuntimeState` (antes do I/O) → `JSON.stringify` → `Preferences.set` | valor sempre string, inválido rejeitado antes do `set`, erro real do Preferences, chave namespaced, nunca chama `clear()`, playlist/settings nunca vão para o Preferences |

## 13. Comandos executados e exit codes

| # | Comando | Exit code |
|---|---|---|
| 1 | `git status --short` (precheck) | 0 |
| 2 | `git branch --show-current` (precheck) | 0 |
| 3 | `npm test` (precheck, antes das alterações) — 87/87 | 0 |
| 4 | `sha256sum` dos arquivos protegidos (precheck) | 0 |
| 5 | `npm ls @capacitor/filesystem @capacitor/preferences` (versões inalteradas: 8.1.2 / 8.0.1) | 0 |
| 6 | `node --check` nos 8 arquivos novos/alterados | 0 (todos) |
| 7 | `npm test` (após implementação) — 133/133 | 0 |
| 8 | `npm run test:core` — 90/90 | 0 |
| 9 | `npm run test:persistence` — 43/43 | 0 |
| 10 | busca de import/require de `@capacitor/*` e `electron` dentro do core (via teste dedicado + grep manual) | 0 violações executáveis (só menções em comentário) |
| 11 | `git diff --check` | 0 |
| 12 | `git status --short` (final) | 0 |
| 13 | comparação final de hashes dos arquivos protegidos | idênticos |
| 14 | `find android -newer ETAPA_1_REPORT.md -type f` (confirma `mobile/android/**` intocado) | 0 arquivos |

## 14. Número total de testes

**133 testes** no total (`npm test`):
- Core (`npm run test:core`): **90** (87 herdados da Etapa 1 + 3 novos de `StorageError`/`StorageErrorCode` em `ports.test.js`).
- Persistência (`npm run test:persistence`): **43** (37 em `CapacitorStorage.test.js` + 6 em `createCapacitorStorage.test.js`).

## 15. Confirmação dos 87 testes originais

Os **87 testes da Etapa 1 continuam presentes e passando**, sem nenhuma
remoção ou enfraquecimento — nenhum arquivo de teste do core foi excluído
ou teve asserção removida; `ports.test.js` apenas recebeu 3 testes
**adicionais** ao final do arquivo. `npm run test:core` roda exatamente os
arquivos de `tests/core/*.test.js`, incluindo os 87 originais, resultando
em 90/90 (87 + 3 novos).

## 16. Confirmação do core sem Capacitor

- Teste dedicado em `CapacitorStorage.test.js` ("mobile/www/app/core/**
  continua sem import/require executável de @capacitor/* ou electron") lê
  os 6 arquivos do core e falha se encontrar sintaxe de `import`/`require`
  para `@capacitor/*` ou `electron` (comentários são ignorados via regex
  que exige `from '...'`/`require('...')`, não apenas a substring).
- O teste de arquitetura da Etapa 1 (`architecture.test.js`) continua
  rodando e passando (parte dos 90 testes de `test:core`).
- Confirmado manualmente com `grep` (seção de validações): a única
  ocorrência de `@capacitor/filesystem` em `www/app/core/` está em um
  **comentário** de `ports.js` (herdado da Etapa 0, explicando por que
  `pickMedia()` não foi implementado).

## 17. Confirmação do Electron intacto

`sha256sum` de `package.json`, `package-lock.json`, `main.js`, `preload.js`
e todos os arquivos de `src/**`/`tests/**` (raiz) após a Etapa 2 é
**byte-a-byte idêntico** aos hashes do precheck (seção 2) e das Etapas 0-1.
`git diff --stat HEAD` para esses caminhos não produz saída. `mobile/android/**`
confirmado intocado (seção 3). Nenhum comando Gradle/`cap sync`/`cap run`/
instalação de JDK/SDK foi executado.

## 18. Divergências do plano

1. O plano original (Etapa 0, ETAPA_0_REPORT.md) já havia sinalizado que
   `pickMedia()` não seria implementado na Etapa 2 — confirmado, esta etapa
   não tocou em `MediaPort`.
2. `DEFAULT_SETTINGS` foi definido em `CapacitorStorage.js` em vez de
   `models.js`, porque a instrução desta etapa proibiu alterar `models.js`
   e `models.js` (por design da Etapa 1) contém apenas validadores, não
   valores padrão — decisão consistente com a separação já estabelecida.
3. Estratégia de atomicidade: o plano pedia para "avaliar escrita
   temporária + rename somente se a semântica […] for confiável e
   testável". Avaliada e **não adotada** nesta etapa pela razão documentada
   na seção 11 (impossível validar a semântica de `rename` sem device
   Android). Isso é uma decisão consciente dentro do escopo permitido, não
   um desvio não autorizado.

## 19. Bloqueios reais

- **JDK e Android SDK continuam ausentes** neste ambiente (herdado das
  Etapas 0-1) — não bloqueou esta etapa (toda a suíte roda em Node puro
  com fakes), mas **impede verificar em device real**: (a) os códigos de
  erro nativos exatos do `PluginError` do Android (`isNotFoundError()` foi
  implementado cobrindo o formato confirmado da implementação web e um
  `code` genérico ENOENT-like — se os códigos nativos reais divergirem,
  isso precisará ser revisto com testes em device); (b) a semântica real de
  `rename()` no Android para decidir com segurança sobre temp+rename
  (seção 11).
- Nenhum outro bloqueio.

## 20. Status final

**COMPLETE.** Todos os 133 testes passam (`npm test`, `npm run test:core`,
`npm run test:persistence`, todos exit code 0); os 87 testes originais da
Etapa 1 permanecem verdes; Filesystem e Preferences estão isolados nos
adapters (nenhum import de `@capacitor/*` no core, confirmado por teste);
nenhum código desktop foi alterado (hashes idênticos); nenhum arquivo em
`mobile/android/**` foi tocado; corrupção, ausência e erros reais de I/O
têm comportamentos distintos e testados (fallback+warning / fallback
silencioso / `StorageError` relançado, respectivamente).
