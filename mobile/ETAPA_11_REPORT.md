# Relatório — Etapa 11: Nova Interface, Navegação e Configurações

**STATUS: COMPLETE**

## Design system

Criados `www/styles/tokens.css` (cores, espaçamento, tipografia, raios,
safe-areas, alturas de controle), `www/styles/components.css` (componentes
reutilizáveis) e `www/styles/screens.css` (layout das 4 telas + overlay de
apresentação). Tema escuro único, sem CDN, sem emoji como ícone.

## Ícones

`www/app/icons/icons.js` — 22 ícones SVG inline (play, pause, previous,
next, blackout, logo, import, settings, home, playlist, presentation,
moveUp, moveDown, delete, edit, close, more, loop, timer, image, video,
warning, check). `TransportBar`, `PresenterView` (botão de saída) e
`EditorView` foram migrados de texto/glifo para estes ícones.

## Navegação

`BottomNavigation` (4 abas fixas: Início/Playlist/Apresentação/
Configurações) + `AppHeader` (marca, título da seção, status, ação
contextual — sem hambúrguer). `AppShell.js` foi reescrito para orquestrar
isso, **preservando a API que `AppController` já usava**
(`editorView`, `transportBar`, `presenterView`, `showEditor()`,
`showPresenter()`, `isPresenting()`) — nenhuma mudança de contrato foi
necessária nesse ponto específico.

## Telas novas

- `HomeScreen.js` — resumo (itens, duração estimada, item atual/status),
  atalhos Apresentar/Importar/Editar playlist, empty state.
- `PresentationScreen.js` — estado parado (item atual/próximo + botão
  Apresentar). O estado fullscreen (apresentando) é montado pelo
  `AppShell` reaproveitando `PresenterView`/`TransportBar` já testados,
  como overlay com auto-hide (toque revela, some após
  `hideControlsDelayMs`).
- `SettingsScreen.js` — 7 seções: Aparência, Apresentação, Logo e
  identidade (`LogoSettings.js`), Playlist (limpar), Agendamento (CRUD de
  regras), Armazenamento, Sobre.

## Playlist (EditorView reescrito)

Cards compactos (`MediaThumbnail` + nome amigável via `displayNameFor()`
— nunca UUID) com 4 ações sempre visíveis (apresentar, mover cima/baixo,
editar) e um painel expansível (`playlist-item-editor`) que só abre um
item por vez, contendo nome/duração/transição/ajuste/horário/remover.
`core/models.js` ganhou `displayNameFor()` e um campo opcional
`displayName` em `PlaylistItem` (retrocompatível).

## Logo e identidade

`LogoSettings.js` (import real via `MediaPort.pickMedia`/
`importToLibrary`, preview, remover, ativar/desativar, 5 posições,
tamanho/opacidade/margem via sliders, manter proporção) — persistido em
`Settings.logo` (`core/models.js`: `DEFAULT_LOGO_SETTINGS`,
`validateLogoSettings`, `LOGO_POSITIONS`). `PresenterView.setWatermark()`
aplica a marca d'água **persistente sobre a mídia** — deliberadamente
separada do `logo()`/`blackout()` de tela cheia já existentes (que
substituem a mídia inteira, espelhando `src/display.js`).

## Testes

333→343 testes (rewrite de `EditorView.test.js`, `TransportBar.test.js`,
`AppShell.test.js`; ajuste pontual em `bootstrap.test.js` para o novo
painel expansível). Cobertura nova: nenhum UUID visível como texto,
estados de thumbnail (loading/ready/unavailable), badge "No ar",
expandir/colapsar editor, navegação entre telas, TransportBar sempre
acessível durante apresentação, ausência de emoji nos botões.

## Limitações conhecidas ao final desta etapa

- Barra de progresso/timer da apresentação (elapsed/duração) definida em
  CSS (`screens.css`) mas **não conectada** a dados reais do
  `PlaybackEngine` — `showTimer`/`showNextItem` existem como settings mas
  ainda não alteram visualmente o presenter. Corrigido/avaliado na
  Etapa 12 apenas na medida do tempo disponível (ver
  `ETAPA_12_REPORT.md`, seção de limitações).
- `ConfirmDialog` não foi extraído como componente próprio — o modal
  existente em `index.html`/`main.js` (`createModalConfirm`) foi apenas
  restilizado via `components.css`, por já funcionar e ser testado.
