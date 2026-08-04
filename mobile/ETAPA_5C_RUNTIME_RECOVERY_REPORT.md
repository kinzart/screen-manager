# Relatório — ETAPA 5C: Recuperação do Runtime Web Real

**WEB_RUNTIME_STATUS: COMPLETE**
**NATIVE_IOS_STATUS: PENDING_MAC_XCODE**
**ANDROID_STATUS: PAUSED**

---

## 1. Git inicial e final

- Branch (mesma durante toda a etapa): `feat/mobile-hybrid-v1`
- HEAD (mesmo durante toda a etapa): `c26f304ce56fb6c30659c97599afdfd6e54cdbb0`
- `git status --short` inicial e final: `?? .docs/`, `?? dist.zip`, `?? mobile/`
  (idêntico — nada além de arquivos dentro de `mobile/` foi tocado)
- Nada em stage em nenhum momento. Nenhum `git add`/`commit`/`push` executado.

## 2. Erro real que fazia a tela não funcionar (reprodução, não suposição)

Reproduzido com Vite (`--host 127.0.0.1 --port 5174`) aberto em um Chrome
real via automação de navegador (não `curl`). A página carregava (HTTP 200,
sem erros de console, bootstrap concluindo com sucesso), mas a primeira
tela mostrava **apenas o modal de confirmação vazio, sobre fundo preto** —
nada do editor era visível nem clicável.

Inspeção da árvore de acessibilidade confirmou que **todos os elementos da
UI existiam corretamente no DOM** (editor, playlist vazia, transporte,
presenter) — ou seja, o bootstrap (`main.js`) e o `AppController.init()`
terminavam com sucesso, sem exceção. O problema não era JavaScript.

## 3. Causa raiz

`mobile/www/styles/app.css` e `mobile/www/styles/presenter.css` definiam
`display: flex` **incondicional** em várias classes (`.boot-loading`,
`.boot-error`, `.confirm-modal`, `.presenter-loading`, `.presenter-error`),
sem nenhuma regra `[hidden] { display: none }`. Como CSS de autor tem
precedência sobre o stylesheet padrão do navegador (que normalmente aplica
`display:none` a qualquer elemento com o atributo `hidden`) **mesmo com
especificidade igual**, `elemento.hidden = true` deixava de ter qualquer
efeito visual nesses elementos específicos. O resultado: a tela de
carregamento (ou o modal de confirmação) permanecia permanentemente visível
e sobreposta à interface real, mesmo com toda a lógica de estado (JS)
funcionando perfeitamente por baixo.

Esse é exatamente o cenário relatado pelo usuário no iPhone: "abre, mas não
faz nada" — porque, visualmente, nada além da tela de carregamento/erro
nunca desaparecia de verdade.

### Correção

Adicionada uma única regra global em `mobile/www/styles/app.css`:

```css
[hidden] {
  display: none !important;
}
```

Isso restaura o comportamento padrão do atributo `hidden` em toda a
aplicação, com `!important` para vencer qualquer `display` definido por
classe, sem precisar caçar e corrigir individualmente cada seletor.

## 4. Segundo bug real encontrado durante a reprodução manual (não hipotético)

Ao testar blackout durante uma apresentação real, o clique não tinha efeito
visível. Causa: `AppShell.showPresenter()` escondia
`transportContainerEl` (`hidden = true`) — o container que contém os únicos
botões reais de play/pause/próximo/anterior/blackout/logo
(`TransportBar`). `PresenterView` só tem um botão de saída (`×`); nenhum
desses controles existe duplicado ali. Resultado: durante a apresentação
real, **os controles de transporte ficavam inacessíveis por toque**, apesar
de existirem no DOM.

### Correção

`AppShell.showPresenter()`/`showEditor()` (`mobile/www/app/ui/AppShell.js`)
não escondem mais o `TransportBar` — em vez disso, alternam a classe
`app-shell-transport-overlay`, que o reposiciona (`position: fixed`,
`z-index: 20`) para flutuar sobre o `PresenterView` (regra adicionada em
`mobile/www/styles/app.css`).

## 5. Terceiro problema real: `MediaPort` nunca funcionava em navegador puro

`CapacitorMedia.importToLibrary()` exige um `path` nativo do picker
(`pickedFile._sourcePath || pickedFile.path`). A implementação **web** do
`@capawesome/capacitor-file-picker`
(`node_modules/@capawesome/capacitor-file-picker/dist/esm/web.js`) **nunca
fornece `path`** — só `blob`. Ou seja, `importMedia()` sempre falhava com
`MediaError(INVALID_REF)` no navegador (Safari do iPhone incluído), mesmo
com a UI e o restante do app funcionando.

### Correção — `WebMediaAdapter` real (não simulado)

Criado `mobile/www/app/adapters/WebMediaAdapter.js`, implementando
`MediaPort` de verdade para navegador:

- `pickMedia()`: abre um `<input type="file" accept="image/*,video/*" multiple>` real.
- `importToLibrary()`: mantém o `Blob` em memória associado a um `relPath`
  sintético (`library/<uid>.<ext>`) — nunca converte para Base64, nunca
  chama `copyFile` nativo.
- `resolveSrc()`: resolve via `URL.createObjectURL()`.
- `deleteFromLibrary()`: chama `URL.revokeObjectURL()`.
- **Limitação explícita e deliberada**: mídia importada no modo web **não
  sobrevive a um recarregamento de página** (comportamento confirmado no
  teste manual: após reload, `resolveSrc()` lança um erro claro e visível
  ao usuário — "mídia indisponível nesta sessão" — em vez de falhar
  silenciosamente ou fingir sucesso).

Criado `mobile/www/app/adapters/createPlatformAdapters.js`: ponto único de
decisão nativo vs. web, via `Capacitor.isNativePlatform()` (mecanismo
oficial do Capacitor). `main.js` foi alterado para delegar a esta fábrica
em vez de sempre usar `createCapacitorMedia`/`createCapacitorStorage`
diretamente.

### Por que NÃO foram criados `WebStorageAdapter.js` nem `WebLifecycleAdapter.js`

Investigação em `node_modules/@capacitor/{filesystem,preferences,app}/dist/esm/web.js`
confirmou que esses três plugins **já têm implementação web própria e
funcional**, mantida pelo próprio Capacitor:

- `@capacitor/filesystem` → IndexedDB no navegador.
- `@capacitor/preferences` → `localStorage` no navegador.
- `@capacitor/app` → eventos via `document.visibilitychange`.

Isso foi **confirmado empiricamente**, não apenas por leitura de código: no
teste manual em navegador real, a playlist e o item importado
**sobreviveram a um recarregamento completo da página** sem nenhum código
adicional — prova de que `CapacitorStorage`/`createCapacitorStorage.js` e
`createLifecycleCoordinator.js` já funcionam corretamente nas duas
plataformas, sem alteração. Criar adapters web redundantes duplicaria uma
implementação que já existe e já funciona — por isso não foram criados.

## 6. Arquivos corrigidos/criados

**Corrigidos:**
- `mobile/www/styles/app.css` — regra `[hidden]` global; classe
  `.app-shell-transport-overlay`.
- `mobile/www/app/ui/AppShell.js` — `showPresenter()`/`showEditor()` não
  escondem mais o `TransportBar`.
- `mobile/www/app/main.js` — usa `createPlatformAdapters` em vez de
  `createCapacitorStorage`/`createCapacitorMedia` diretamente.
- `mobile/tests/integration/bootstrap.test.js` — teste 5 atualizado para a
  nova arquitetura (verifica `createPlatformAdapters` em vez do import
  direto em `main.js`).
- `mobile/tests/ui/AppShell.test.js` — novo teste cobrindo o overlay do
  TransportBar durante a apresentação.
- `mobile/package.json` — adicionado `playwright` (devDependency) e o
  script `test:e2e`.

**Criados:**
- `mobile/www/app/adapters/WebMediaAdapter.js`
- `mobile/www/app/adapters/createPlatformAdapters.js`
- `mobile/tests/adapters/WebMediaAdapter.test.js` (9 testes unitários)
- `mobile/tests/e2e/app-runtime.e2e.test.js` (Playwright + Edge do sistema)
- `mobile/tests/fixtures/sample-image.png` (fixture PNG 1×1, não é arquivo
  pessoal do usuário)
- `mobile/ETAPA_5C_RUNTIME_RECOVERY_REPORT.md` (este arquivo)

**Não criados** (justificativa na seção 5): `WebStorageAdapter.js`,
`WebLifecycleAdapter.js`, `tests/adapters/WebStorageAdapter.test.js`,
`tests/adapters/WebLifecycleAdapter.test.js`,
`tests/integration/browser-runtime.test.js` (coberto de forma mais forte
pelo teste e2e real de navegador, que substitui um teste jsdom equivalente
— jsdom não teria detectado nenhum dos dois bugs de CSS/layout descritos
acima).

## 7. Eventos conectados (confirmados por clique real, não por existência de método)

Testado manualmente em Chrome real (automação de navegador) e no teste E2E
Playwright:

- Importar mídia (upload real de arquivo) → aparece na playlist.
- Editar duração → campo aceita e mantém o valor.
- Apresentar → imagem real decodificada pelo navegador (`naturalWidth`
  confirmado via canvas, não apenas presença do elemento).
- Blackout → `.presenter-blackout.hidden === false` confirmado via DOM.
- Logo → `.presenter-blackout` volta a `hidden === true`, `.presenter-logo`
  fica visível.
- Pause/Resume (toggle play/pause) → label do botão alterna
  "Pausar"/"Reproduzir".
- Sair da apresentação → editor reaparece, presenter esconde, playlist
  ainda lá, nenhum erro de console, página continua responsiva.
- Reload de página → playlist e settings persistidos (via IndexedDB/
  localStorage nativos do Capacitor Web), RuntimeState restaurado
  corretamente, erro claro ao tentar reapresentar mídia cuja `Blob` não
  sobreviveu ao reload (comportamento esperado do modo web, não um bug).

## 8. Resultado do teste E2E real

```
npm run test:e2e
✔ fluxo completo em navegador real: abrir → importar → playlist → apresentar → blackout → editor
tests 1, pass 1, fail 0
```

Usa Playwright com `channel: 'msedge'` (Edge já instalado no sistema — não
baixou nenhum Chromium adicional). Sobe seu próprio servidor Vite dedicado
(porta 5199) e o encerra ao final. Falha automaticamente se houver:
exceção JS não tratada (`pageerror`), `console.error` (exceto o 404 de
`/favicon.ico`, ruído de navegador não relacionado ao app — `index.html`
não declara favicon, fora do escopo desta correção), ou requisição de rede
falha.

## 9. Erros de console antes e depois

- **Antes**: nenhum erro de console durante o boot (o bug era 100% CSS,
  não JS) — por isso os relatórios anteriores, que só rodavam testes
  automatizados e checavam HTTP 200, não detectaram o problema. Este foi o
  ponto central da correção de rumo do usuário: testes verdes e build OK
  não provam que a interface funciona.
- **Depois**: zero erros de console em toda a sessão de teste manual e no
  teste E2E (exceto o 404 de favicon, filtrado e documentado).

## 10. Resultado de `npm test`

```
333/333 PASS
(323 anteriores + 9 testes novos de WebMediaAdapter + 1 teste novo de AppShell)
```

Também confirmados individualmente: `test:core` (92), `test:persistence`
(43), `test:media` (38), `test:presentation` (43), `test:ui` (57),
`test:integration` (40), `test:lifecycle` (24) — todos PASS.

## 11. Resultado de `npm run build`

```
✓ built in ~70ms
dist/index.html, dist/assets/*.css, dist/assets/*.js gerados sem erro.
```

## 12. URL validada

`http://127.0.0.1:5174/` (Vite `--host 127.0.0.1`, sessão manual) e
`http://127.0.0.1:5199/` (Vite `--host 127.0.0.1 --strictPort`, sessão do
teste E2E automatizado). Servidores encerrados ao final de cada sessão de
validação (nenhum processo Vite ficou rodando).

## 13. Controles validados

Importar mídia, playlist (adicionar/editar duração), apresentar, blackout,
logo, pause/resume, sair da apresentação — todos confirmados por interação
real (clique/upload), não apenas por leitura de código. Mover para
cima/baixo, remover, próximo/anterior e loop **não foram exercitados
manualmente nesta sessão** (já cobertos por testes automatizados jsdom
existentes e sem qualquer indício de regressão relacionado às correções
desta etapa — nenhum deles depende de CSS `hidden` ou do TransportBar
durante apresentação).

## 14. Electron intacto

- `main.js`/`preload.js`: hashes SHA-256 conferidos, arquivos não
  modificados.
- `git status --short main.js preload.js src tests package.json
  package-lock.json .maestro .memory`: vazio (nenhuma alteração).
- Nenhum import de `electron` em `mobile/www/**` (grep vazio).

## 15. Limitações do modo web (explícitas, não escondidas)

- Mídia importada no navegador **não persiste** entre recarregamentos de
  página (limitação deliberada e documentada no próprio código/erro
  exibido ao usuário) — settings e playlist (metadados) persistem
  normalmente via IndexedDB/localStorage; apenas o conteúdo binário
  (Blob) da mídia se perde.
- `LifecycleCoordinator` no modo web reage a `document.visibilitychange`
  (fallback do próprio `@capacitor/app`), que dispara em situações
  diferentes de `onPause`/`onResume` nativos — mesma ressalva já registrada
  em `IOS_COMPATIBILITY_REPORT.md` para o iOS nativo.
- `screen.orientation.lock()`/Wake Lock nativos permanecem sujeitos às
  mesmas limitações de suporte do navegador já documentadas em
  `IOS_COMPATIBILITY_REPORT.md` — não alteradas por esta correção.
- Este runtime web NÃO substitui a necessidade de build nativo
  Android/iOS para uso real em produção — serve para desenvolvimento e
  para o teste visual/funcional via Safari do iPhone (ver
  `WEB_IPHONE_TEST_GUIDE.md`), agora **de fato funcional**, não apenas
  "abre mas não faz nada".

## 16. Status real

**WEB_RUNTIME_STATUS: COMPLETE** — página abre, loading termina, sem erros
de console, botões respondem, importação web funciona (Blob real), playlist
muda de verdade, apresentação abre, imagem é exibida e decodificada de
verdade, transporte funciona, blackout e logo funcionam, retorno ao editor
funciona, fluxo E2E em navegador real (Playwright + Edge) passa, build Vite
passa, todos os testes automatizados anteriores permanecem verdes, Electron
intacto.

**NATIVE_IOS_STATUS: PENDING_MAC_XCODE** — nada mudou aqui; build iOS nativo
continua exigindo Mac/Xcode, não iniciado nesta etapa.

**ANDROID_STATUS: PAUSED** — nenhum build Android foi executado nesta
etapa, conforme instruído.
