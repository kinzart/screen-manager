# Especificação de UX/Design System — Mobile v2

## Tema

Escuro profissional (único tema nesta etapa — "Aparência" em Configurações
é informativo/preparatório, não implementa tema claro real).

## Tokens (`www/styles/tokens.css`)

- **Cores de superfície**: `--surface-0` (fundo geral), `--surface-1`
  (cards), `--surface-2` (elementos elevados/modais), `--surface-overlay`
  (overlays sobre mídia).
- **Cores de texto**: `--text-primary`, `--text-secondary`, `--text-muted`.
- **Cor de marca**: `--brand` (accent usado em item ativo da navegação,
  foco, botão primário).
- **Estados**: `--success`, `--warning`, `--danger`, com variantes `-bg`
  para fundos de banners/badges.
- **Bordas**: `--border-subtle`, `--border-strong`.
- **Sombras**: `--shadow-1` (cards), `--shadow-2` (modais/overlays).
- **Tipografia**: escala `--font-size-xs` … `--font-size-xl`,
  `--font-weight-regular/medium/bold`.
- **Espaçamento**: escala `--space-1` (4px) … `--space-8` (48px).
- **Raios**: `--radius-sm/md/lg/pill`.
- **Alturas de controle**: `--control-height` (44px mínimo, alvo de
  toque), `--bottom-nav-height`.
- **Safe areas**: variáveis derivadas de `env(safe-area-inset-*)`
  reaproveitadas nos componentes.

## Identidade visual

Sem logo real embutido nesta etapa (o único ativo disponível é
`src/logo-bs.png`, do desktop — não copiado automaticamente para o bundle
mobile para não "fingir" um asset configurado; ver `LogoSettings`: o app
nunca exibe um logo que o usuário não configurou explicitamente). A marca
do app no `AppHeader` usa uma marca tipográfica ("FBS") com um selo SVG
simples — não um arquivo de imagem inexistente.

## Ícones

SVG inline, módulo único `www/app/icons/icons.js`, 21 ícones (ver lista no
prompt). Nenhum emoji usado como ícone de interface funcional.

## Componentes (ver Etapa 11 para implementação)

AppHeader, BottomNavigation, HomeScreen, PlaylistScreen,
PresentationScreen, SettingsScreen, MediaThumbnail, PlaylistCard,
PlaylistItemEditor, EmptyState, StatusBanner, ConfirmDialog (reaproveita o
modal existente, restilizado), Toast (variante leve de StatusBanner),
LogoSettings, PresentationControls (evolução do TransportBar existente,
com auto-hide), CurrentMediaPanel, NextMediaPanel.
