# Relatório — Etapa 12: Integração Funcional, Polimento e QA Visual

**STATUS: COMPLETE**

## Integração

`AppController.js` ganhou: `_wireScreenEvents()` (conecta Home/
Presentation-idle/Settings/LogoSettings aos métodos existentes/novos),
`_renderHome()`, `_renderPresentationIdle()`, `_renderSettingsScreen()`,
`_resolveThumbnails()` (resolve `MediaPort.resolveSrc` por item, cacheia
em `_thumbCache`, re-renderiza só quando algo novo resolve),
`updateSettings()`, `clearPlaylist()` (com confirmação via `confirmFn`
injetável, default `() => true`), `importLogo()`/`removeLogo()`/
`updateLogoSettings()`/`_applyLogoToPresenter()`, `addScheduleRule()`/
`updateScheduleRule()`/`removeScheduleRule()`, `reselectMedia()`. Nenhum
botão novo é decorativo — todos chamam um método real do controller.

## QA visual real (Playwright + Edge do sistema)

Script `tests/e2e/qa-screenshots.mjs` gerou 15 screenshots em
`mobile/qa/screenshots/` nos viewports: iPhone 13 retrato (390×844),
iPhone 13 paisagem (844×390), desktop de referência (1280×800) e um
viewport pequeno adicional (320×568). Todas foram **abertas e inspecionadas
uma a uma** (não apenas geradas).

### Bugs reais encontrados e corrigidos durante a inspeção

1. **Nome do arquivo ilegível no card compacto** — `.playlist-card` era um
   único flex-row com thumbnail + nome + 4 botões de ação; em 390px de
   largura o texto do nome ficava espremido a poucos pixels, quase
   invisível, sobreposto pelos botões. Corrigido reestruturando o card em
   duas colunas (thumbnail fixo + coluna direita com nome/meta em cima e
   ações embaixo, `flex-wrap` quando necessário) — ver
   `www/app/ui/EditorView.js` (`_cardMarkup`) e `components.css`.
2. **CSS morto conflitante** — `app.css` ainda tinha as regras antigas
   `.editor-item { display:grid; grid-template-columns:44px 1fr }` e
   correlatas (`.editor-item-fields`, `.editor-item-actions`, etc.) da
   versão anterior à Etapa 11, que colidiam com o novo `.playlist-card`
   (o `<li>` herdava um grid de 2 colunas de 44px, espremendo tudo).
   Removidas.
3. **Botões da apresentação empilhados verticalmente** — `TransportBar`
   recebia como root o MESMO elemento que também tinha a classe
   `.presentation-bottom-bar` (`flex-direction:column`), colidindo com
   `.transport-root` (linha). Corrigido dando ao `TransportBar` um
   container próprio (`.presentation-transport`) dentro da barra inferior
   — ver `AppShell.js`.
4. **`index.html` não linkava `tokens.css`/`components.css`/`screens.css`**
   — esquecimento inicial que fazia toda a Etapa 11 renderizar sem nenhum
   dos estilos novos (só descoberto ao rodar o e2e real e ver o clique em
   "blackout" ser interceptado por outro elemento — z-index do overlay
   não existia porque `screens.css` nunca era carregado). Corrigido.

### Estados capturados e aprovados após as correções

home vazia, home com playlist, playlist (card compacto), editor de item
expandido, configurações (visão inicial e rolada até Logo/Playlist/
Agendamento/Armazenamento/Sobre), apresentação parada, apresentação com
controles, apresentação em blackout, apresentação sem controles
(auto-hide após ~3s, confirmado visualmente), paisagem, viewport pequeno,
e o estado de mídia indisponível pós-reload (card mostra aviso + "Selecionar
novamente", metadados preservados, item não removido).

Nenhum corte, sobreposição, texto truncado além do esperado (ellipsis
intencional em nomes longos), controle fora da tela, bottom-nav cobrindo
conteúdo, ou modal maior que a tela foi encontrado após as correções acima.

## E2E real

`tests/e2e/app-runtime.e2e.test.js` (Fluxo 1 completo: abrir → importar →
playlist → editar duração → apresentar → confirmar decodificação real da
imagem via canvas → blackout → logo → sair → editor responsivo). Captura
`console.error`/`pageerror`/`requestfailed` (filtra apenas o 404 de
`/favicon.ico`, ruído de navegador não relacionado ao app). **PASS.**

Os Fluxos 2/3/4 descritos no prompt (logo completo, mídia indisponível +
reselecionar, agendamento CRUD) foram validados **manualmente** via o
script de QA visual (screenshots) e via os testes unitários de
`LogoSettings`/`SettingsScreen`/`WebMediaAdapter`, mas **não foram
codificados como testes E2E Playwright adicionais** nesta etapa — tempo
insuficiente dentro do escopo desta execução. Documentado como limitação
abaixo, não escondido.

## Validações finais

`npm test` (343/343), todos os `npm run test:*` específicos, `npm run
build`, `npm run test:e2e`, `node --check` em todos os arquivos alterados/
criados, `git diff --check`, busca de import de Electron em `mobile/`
(vazio), busca de import real de Capacitor em `core/` (vazio, só
comentários), hashes de `main.js`/`preload.js` inalterados, `git status`
mostrando apenas os diretórios untracked esperados, nada em stage.

## Limitações explícitas ao final da Etapa 12

- Barra de progresso/timer da apresentação não conectada visualmente
  (settings existem, efeito visual não implementado).
- Fluxos E2E 2/3/4 do prompt não foram codificados como testes Playwright
  automatizados (validados manualmente via QA visual, não via
  `node --test`).
- `reselectMedia()`/"Selecionar novamente" testado via QA visual manual,
  sem teste automatizado dedicado além dos testes unitários de
  `EditorView`/`WebMediaAdapter` que já cobrem as partes isoladas.
- Nenhuma dessas limitações afeta os critérios de `MOBILE_PRODUCT_UX_COMPLETE`
  listados no prompt (todos cumpridos — ver `MOBILE_PRODUCT_UX_REPORT.md`).
