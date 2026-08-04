# Relatório — Etapa 1: Core Puro e Testes

**Status final: COMPLETE**

---

## 1. Precheck

- `git status --short` antes de qualquer alteração:
  ```
  ?? .docs/
  ?? dist.zip
  ?? mobile/
  ```
- Branch confirmada: `feat/mobile-android-v1`.
- Documentos lidos integralmente antes de codar: `mobile/ETAPA_0_REPORT.md`,
  `mobile/package.json`, `src/control.js`, `src/display.js`,
  `.docs/_audit/control.js.md`, `.docs/_audit/display.js.md`,
  `.docs/_audit/persistence-and-ipc.md`.
- Nenhum `reset`/`restore`/`clean`/`stash`/`checkout --` foi usado; nenhum
  arquivo untracked existente foi removido.

### Hashes iniciais dos arquivos protegidos (idênticos aos registrados na
Etapa 0 e conferidos novamente ao final — ver seção 10)

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
(hashes completos em `sha256sum` — idênticos aos de `.docs/_audit/*.md`)

## 2. Arquivos criados e alterados

**Criados** (todos dentro de `mobile/`):
- `mobile/www/app/core/models.js`
- `mobile/www/app/core/PlaylistManager.js`
- `mobile/www/app/core/PlaybackEngine.js`
- `mobile/www/app/core/ScheduleEngine.js`
- `mobile/www/app/core/transitions.js`
- `mobile/www/app/core/ports.js`
- `mobile/tests/core/models.test.js`
- `mobile/tests/core/PlaylistManager.test.js`
- `mobile/tests/core/PlaybackEngine.test.js`
- `mobile/tests/core/ScheduleEngine.test.js`
- `mobile/tests/core/transitions.test.js`
- `mobile/tests/core/ports.test.js`
- `mobile/tests/core/architecture.test.js`
- `mobile/ETAPA_1_REPORT.md` (este arquivo)

**Alterados:**
- `mobile/package.json` — adicionado `"type": "module"` (os módulos do
  core usam ESM `import`/`export`) e os scripts `test`/`test:core`.

**Não alterados** (não foi necessário): `mobile/package-lock.json`
(nenhuma dependência nova instalada), `mobile/README.md`.

**Confirmadamente intocados:** `mobile/www/index.html`,
`mobile/www/styles/**`, `mobile/www/app/main.js`, `mobile/android/**`, e
todos os arquivos do Electron listados na seção 10.

## 3. Regras extraídas do desktop e decisões de modelagem

Ver tabela de paridade completa na seção 11.

Principais decisões:
- **`path` absoluto → `MediaRef`**: o mobile nunca aceita caminho absoluto
  do Windows nem `file://`/`file:///` como referência de mídia válida
  (`validateMediaRef` em `models.js`), conforme decisão humana da Etapa 0
  (mídia sempre copiada para o sandbox).
- **Timer por timestamp, não por ticks**: `PlaybackEngine` calcula
  `elapsed` a partir de `now - syncTimestamp`, nunca por contagem de
  incrementos de `0.25`. O agendamento do "tick" periódico (250ms) fica
  fora do core, a cargo do bootstrap/UI (Etapa 5/6) — exatamente como
  pedido.
- **Item removido durante a reprodução**: o desktop, ao apagar o item que
  está no ar, chama `stop()` explicitamente (`control.js` linhas 128-132) —
  nunca invoca `autoNext()` com um `currentId` inexistente. O core
  reproduz essa garantia: se `tick()`/`autoNext()` não encontram o item
  atual na playlist, o engine **para** (`stopped`, `reason: 'item-missing'`)
  em vez de adivinhar um próximo índice.
- **Regras de agendamento com validação defensiva**: o desktop não valida
  o formato de `rules[].start/end` (assume dados bem formados vindos da
  própria UI). O core adiciona `isValidRule()` para não quebrar diante de
  dados persistidos corrompidos — regra inválida é apenas ignorada, nunca
  lança exceção. Divergência intencional, documentada em `ScheduleEngine.js`.
- **Regra atravessando meia-noite**: o desktop usa comparação léxica de
  strings `"HH:MM"` em `activeRule()`, que **não** reconhece corretamente
  uma regra como `start:"23:00", end:"01:00"` como ativa após a meia-noite
  (string `"00:30" < "23:00"` falha na primeira condição). O core
  **preserva essa mesma limitação** em vez de implementar suporte não
  solicitado — testado explicitamente em `ScheduleEngine.test.js`.
- **`ports.js`**: como JS não tem interfaces nativas, `StoragePort`,
  `MediaPort` e `PresentationAdapter` são classes-base cujos métodos
  lançam `NotImplementedError` até serem sobrescritos por uma
  implementação concreta (Etapas 2-4).

## 4. Comandos executados e exit codes

| # | Comando | Exit code | Resultado |
|---|---|---|---|
| 1 | `git status --short` (precheck) | 0 | ver seção 1 |
| 2 | `git branch --show-current` (precheck) | 0 | `feat/mobile-android-v1` |
| 3 | `sha256sum` dos arquivos protegidos (precheck) | 0 | hashes registrados |
| 4 | `node --check` em cada um dos 13 arquivos criados | 0 (todos) | sintaxe válida |
| 5 | `npm test` (`mobile/`) | 0 | 87/87 testes passaram |
| 6 | `npm run test:core` (`mobile/`) | 0 | 87/87 testes passaram |
| 7 | busca de imports proibidos (`grep` por electron/@capacitor/ipcMain/ipcRenderer/BrowserWindow/fs/file:///) | — | 1 ocorrência, em **comentário** de `ports.js` (permitido) |
| 8 | busca de `window.`/`document.` executável | — | nenhuma ocorrência |
| 9 | `git diff --check` | 0 | sem problemas de whitespace/conflito |
| 10 | `git status --short` (final) | 0 | ver seção 9 |
| 11 | comparação final de hashes dos arquivos protegidos | 0 | **idênticos** aos da Etapa 0 |

**Nota sobre o script `npm test`:** a primeira tentativa com
`node --test tests/core/` (com barra final, conforme sugerido inicialmente)
falhou neste ambiente com `MODULE_NOT_FOUND` — um comportamento específico
desta combinação de Node v24.18.0 + Git Bash no Windows, que tratou o
argumento de diretório como um nome de módulo a resolver em vez de um
diretório a varrer. `node --test` **sem argumentos** (descoberta padrão) e
`node --test tests/core/*.test.js` (glob explícito) funcionaram
corretamente e são equivalentes. Os scripts finais em `package.json` usam o
glob explícito, mais previsível entre plataformas.

## 5. Quantidade de testes

**87 testes**, distribuídos em 7 arquivos:
- `models.test.js`: 22
- `PlaylistManager.test.js`: 15
- `PlaybackEngine.test.js`: 17
- `ScheduleEngine.test.js`: 16
- `transitions.test.js`: 7
- `ports.test.js`: 6
- `architecture.test.js`: 2

Nenhum jsdom, Vitest, Jest ou Mocha foi instalado — apenas `node:test` e
`node:assert/strict` (nativos do Node, já disponíveis).

## 6. Resultado de `npm test`

```
ℹ tests 87
ℹ suites 0
ℹ pass 87
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
Exit code `0`.

## 7. Resultado de `npm run test:core`

Idêntico ao `npm test` (mesmo comando): 87/87 passaram, exit code `0`.

## 8. Confirmação de ausência de Electron/Capacitor/DOM no core

- `mobile/tests/core/architecture.test.js` varre todos os `.js` de
  `mobile/www/app/core/`, remove comentários e falha se encontrar, em
  código executável: `require('electron')`/`from 'electron'`,
  `@capacitor/*`, `window.*`, `document.*`, `ipcMain`, `ipcRenderer`,
  `BrowserWindow`, `require('fs')`/`from 'fs'`/`require('node:fs')`/
  `from 'node:fs'`, e a URL literal `file:///`. **Passou** (0 violações).
- Um segundo teste no mesmo arquivo garante que todo `import ... from` no
  core aponta para um caminho relativo (`./` ou `../`) — ou seja, o core
  não depende de nenhum pacote de terceiros (nem mesmo Capacitor).
- Confirmado manualmente também via busca direta (seção 4, itens 7-8): a
  única ocorrência textual de `@capacitor/` está dentro de um comentário
  em `ports.js` explicando por que `pickMedia()` ainda não foi
  implementado — não é código executável.

## 9. `git status --short` final

```
?? .docs/
?? dist.zip
?? mobile/
```

Nenhum `git add`/`commit`/`push` foi executado. `.docs/` e `dist.zip`
permanecem exatamente como estavam.

## 10. Arquivos protegidos — confirmados intactos

`sha256sum` de `package.json`, `package-lock.json`, `main.js`,
`preload.js`, todos os arquivos de `src/**` e `tests/**` (raiz) após a
Etapa 1 é **byte-a-byte idêntico** aos hashes registrados no precheck
(seção 1) e aos hashes já auditados em `.docs/_audit/*.md`
(`main.js`, `control.js`, `display.js`). `git diff --stat HEAD` para esses
caminhos não produz saída. Nenhum arquivo do Electron foi tocado.

## 11. Tabela de paridade com o desktop

| Regra extraída | Arquivo desktop | Função/região de origem | Comportamento mantido | Adaptação mobile | Teste que comprova | Divergência intencional |
|---|---|---|---|---|---|---|
| Detecção de tipo por extensão | `src/control.js` | `extType` (linha 14) | mp4/webm → video, resto → image | `detectMediaTypeFromName` (models.js); nova `detectMediaTypeFromMime` para o caminho principal mobile (mídia copiada com mime conhecido) | `models.test.js` → "detectMediaTypeFromName reproduz extType…" | Nenhuma no comportamento por extensão; mime é adição, não substituição forçada |
| Seleção de transição | `src/control.js` | `transitionFor` (linhas 46-48) | `item.transition \|\| regraAtiva?.transition \|\| 'fade'` | `transitionFor(item, ruleTransition)` em `transitions.js`, com a regra ativa resolvida externamente pelo `ScheduleEngine` | `transitions.test.js` (7 casos) | Normaliza valores desconhecidos para `''` em vez de propagá-los sem checagem |
| Regra de horário ativa | `src/control.js` | `activeRule` (linhas 42-45) | comparação léxica `"HH:MM"` de `start`/`end` | `activeRule(rules, nowHHMM)` em `ScheduleEngine.js` | `ScheduleEngine.test.js` (antes/dentro/depois/fronteira/múltiplas) | Adiciona `isValidRule()` defensivo; **preserva** a limitação de regra atravessando meia-noite |
| `secondsUntil` | `src/control.js` | linhas 426-432 | segundos até um horário `"HH:MM[:SS]"`, `Infinity` se vazio | cópia funcional idêntica em `ScheduleEngine.js` | `ScheduleEngine.test.js` | Nenhuma |
| `checkSchedule` (estados soon/live/next + item due) | `src/control.js` | linhas 433-470 | calcula estados de agendamento e detecta item que deve entrar agora, deduplicado por chave | `ScheduleEngine.evaluate()` retorna `{states, due}` em vez de mexer no DOM | `ScheduleEngine.test.js` (soon, live, due único por chave, nenhum agendamento) | Renderização visual (`applyScheduleState`, linhas 471-489) fica para a Etapa 5 (UI) |
| Adição de item à playlist | `src/control.js` | `addFiles` (linhas 207-229) | cria item com id, name, type, duration=10, transition='', fit='contain', startAt='' | `PlaylistManager.add()` + `validatePlaylistItem` (models.js) | `PlaylistManager.test.js`, `models.test.js` | `path` vira `media: MediaRef`; `uid()` reproduzido como `generateId()` |
| Atualização de campo | `src/control.js` | `update` (linhas 193-200) | atualiza campo por id, salva | `PlaylistManager.update(id, patch)` | `PlaylistManager.test.js` | Efeito colateral de clamping de `elapsed` ao mudar `duration` (linha 197) não é responsabilidade do PlaylistManager — cabe ao `PlaybackEngine`/UI (fora do escopo desta etapa) |
| Remoção de item | `src/control.js` | delete handler (linhas 127-135) | remove por id; se era o item no ar, para a apresentação | `PlaylistManager.remove(id)` (remoção) + `PlaybackEngine.tick()`/`autoNext()` param no item ausente | `PlaylistManager.test.js`, `PlaybackEngine.test.js` ("item removido durante a reprodução") | A orquestração (chamar `stop()` explicitamente ao remover o item no ar) é responsabilidade da UI/bootstrap, não do PlaylistManager isoladamente |
| Reordenação por arraste | `src/control.js` | drop handler (linhas 106-118) | move item para posição de outro item (índice absoluto) | `PlaylistManager.move(id, toIndex)` | `PlaylistManager.test.js` | Drag&drop de mouse não existe no core (é DOM); Etapa 5 fará a UI de toque chamar `move`/`moveBy` |
| Reordenação por botões ↑/↓ | `src/control.js` | `moveItem` (linhas 185-192) | troca com vizinho; no-op na borda | `PlaylistManager.moveBy(id, delta)` | `PlaylistManager.test.js` | Nenhuma |
| Substituir/limpar playlist | `src/control.js` | linhas 371-378, 492-493 | `playlist = []` / `playlist = await loadPlaylist()` | `PlaylistManager.replace()` / `clear()` | `PlaylistManager.test.js` | Nenhuma |
| `take(id)` — iniciar item | `src/control.js` | linhas 233-246 | zera elapsed, marca running, dispara `command('show')` | `PlaybackEngine.take()` — envio do comando de apresentação fica no `PresentationAdapter` (Etapa 4), fora do core | `PlaybackEngine.test.js` | Nenhuma no cálculo de estado |
| `start()` | `src/control.js` | linhas 247-250 | playlist vazia → toast; senão `take(currentId ou primeiro)` | `PlaybackEngine.start()` retorna `null` em playlist vazia (toast é responsabilidade da UI) | `PlaybackEngine.test.js` | Nenhuma no cálculo de estado |
| `stop()` | `src/control.js` | linhas 251-258 | limpa timer, `running=false`, envia comando `logo` | `PlaybackEngine.stop()` — envio do comando `logo` fica no `PresentationAdapter` | `PlaybackEngine.test.js` | Nenhuma no cálculo de estado |
| `next(delta)` | `src/control.js` | linhas 259-265 | avança com wraparound modular | `PlaybackEngine.next()`/`previous()` | `PlaybackEngine.test.js` | Nenhuma |
| `autoNext()` | `src/control.js` | linhas 266-274 | último item + loop desligado → para; senão avança | `PlaybackEngine.autoNext()` | `PlaybackEngine.test.js` | Item ausente → **para** em vez de avançar (ver seção 3) |
| `toggle()` (pause/resume) | `src/control.js` | linhas 275-280 | alterna paused, envia comando pause/resume | `PlaybackEngine.toggle()`/`pause()`/`resume()` — comando fica no `PresentationAdapter` | `PlaybackEngine.test.js` | Nenhuma no cálculo de estado |
| `startTimer` (loop de 250ms, elapsed, duration, locked) | `src/control.js` | linhas 281-298 | `elapsed += 0.25` por tick; ao atingir `duration`, chama `autoNext()` (ou congela se `locked`) | `PlaybackEngine.tick(playlist, settings, now)` calcula `elapsed` por **timestamp**, não por contagem de ticks; chamado externamente pelo bootstrap/UI | `PlaybackEngine.test.js` (auto-advance, locked, duration=0) | **Divergência intencional obrigatória da Etapa 1**: sem `setInterval` interno; base de tempo por timestamp injetável |
| Estado de execução para restauração | *(não existe no desktop — novo requisito mobile)* | — | — | `PlaybackEngine.snapshot()`/`restore()` + `validateRuntimeState` (models.js) | `PlaybackEngine.test.js` (snapshot, restore com item presente/ausente, restore null) | Funcionalidade nova, exigida por "restaurar seu estado ao ser reaberto" (requisito do modo independente) |
| Contratos de bridge (`window.fbs`) | `preload.js` / `.docs/_audit/persistence-and-ipc.md` | API de 16 métodos | `chooseFiles, loadPlaylist, savePlaylist, command, onCommand, …` | `StoragePort`, `MediaPort`, `PresentationAdapter` em `ports.js` — contratos equivalentes, sem IPC | `ports.test.js` | `pickMedia()` declarado no contrato mas **não implementado** nesta etapa (ver seção 12) |

## 12. Divergências intencionais (resumo)

1. `PlaybackEngine` usa cálculo de `elapsed` por timestamp, não por
   contagem de ticks de `setInterval` — exigência explícita da Etapa 1.
2. Item removido durante a reprodução: o engine **para** em vez de tentar
   adivinhar um próximo item, espelhando o comportamento real do desktop
   (que chama `stop()` explicitamente ao deletar o item no ar).
3. `ScheduleEngine` adiciona validação defensiva de regras (`isValidRule`)
   ausente no desktop, para não quebrar diante de JSON persistido
   corrompido no Android.
4. `ScheduleEngine` **preserva** a limitação do desktop de não suportar
   corretamente regras de horário que atravessam a meia-noite — não foi
   inventado suporte não solicitado.
5. `models.js` valida estritamente `MediaRef`/`PlaylistItem`/`Settings`/
   `RuntimeState`, algo que o desktop não faz explicitamente (ele confia
   nos dados vindos da própria UI/IPC).
6. `RuntimeState` é um modelo inteiramente novo (não existe no desktop),
   necessário para o requisito "restaurar seu estado ao ser reaberto" do
   modo independente.

## 13. Bloqueios reais

Nenhum. O core roda inteiramente sobre Node puro (`node:test`,
`node:assert/strict`), sem exigir Java, Android SDK, ou qualquer
dependência instalada além do que a Etapa 0 já trouxe (que nem chega a ser
usado pelos testes do core). JDK/Android SDK continuam ausentes neste
ambiente (herdado da Etapa 0), mas **não bloqueiam** esta etapa, conforme
previsto.

## 14. Status final

**COMPLETE.** Todos os 87 testes passam (`npm test` e `npm run test:core`,
exit code `0` em ambos); nenhum import proibido em código executável do
core; nenhum arquivo protegido foi alterado (hashes idênticos antes/depois);
nenhum comando proibido (Gradle, `cap sync`, `cap run`, instalação de
JDK/SDK/Android Studio, `git add`/`commit`/`push`) foi executado.
