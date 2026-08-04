# Arquitetura de Informação — Mobile

## Navegação principal (bottom navigation, 4 itens fixos)

1. **Início** — resumo, atalhos rápidos (Apresentar / Importar mídia)
2. **Playlist** — lista compacta + editor expansível por item
3. **Apresentação** — painel de status quando parado; fullscreen quando apresentando
4. **Configurações** — Aparência, Apresentação, Logo e identidade, Playlist, Agendamento, Armazenamento, Sobre

Bottom nav NUNCA aparece durante apresentação fullscreen (regra explícita
do prompt). Nas outras 3 telas, sempre visível, respeitando
`env(safe-area-inset-bottom)`.

## Barra superior (AppHeader)

- Esquerda: marca do app (texto "FBS" — logo real do desktop
  `src/logo-bs.png` não é copiado automaticamente para o bundle mobile
  nesta etapa; ver `MOBILE_UX_SPEC.md` para a decisão).
- Centro/esquerda: título da seção atual (`Início`, `Playlist`,
  `Apresentação`, `Configurações`).
- Direita: badge de status (ex.: "3 itens", "Apresentando", "Salvo") +
  ação contextual (ex.: botão "Limpar" só na Playlist).
- Sem hambúrguer: as 4 áreas principais sempre acessíveis via bottom nav.

## Telas e conteúdo

### Início (HomeScreen)
- Resumo da última sessão (nome do app + contagem de itens + duração total estimada)
- Item atual (se houver) e status da apresentação
- Botão primário "Apresentar"
- Botão secundário "Importar mídia"
- Atalho "Editar playlist"
- Empty state quando não houver itens

### Playlist (PlaylistScreen)
- Lista de `PlaylistCard` (thumbnail, nome amigável, tipo, duração,
  transição, indicador de item atual, botão de opções)
- Toque em "opções" abre painel expansível (`PlaylistItemEditor`) com todos
  os campos de edição — nunca todos os itens abertos ao mesmo tempo
- Botão "Importar mídia" no header contextual
- Botão "Limpar playlist" com confirmação

### Apresentação (PresentationScreen)
- Estado parado: `CurrentMediaPanel` + `NextMediaPanel` + botão grande
  "Apresentar"
- Estado apresentando: fullscreen (`PresenterView`), controles como
  overlay com auto-hide, toque revela; nunca bottom nav

### Configurações (SettingsScreen)
1. Aparência (tema — informativo, escuro é o único suportado nesta etapa)
2. Apresentação (duração/transição/fit padrão, loop, comportamento ao
   terminar, auto-hide de controles e seu tempo, mostrar próximo item,
   mostrar timer)
3. Logo e identidade (`LogoSettings` — import/preview/remover/ativar/
   posição/tamanho/opacidade/margem/manter proporção)
4. Playlist (limpar playlist)
5. Agendamento (CRUD de regras de horário)
6. Armazenamento (contagem de itens, modo nativo/web)
7. Sobre (nome, versão, plataforma)

## Fluxos principais

- **Primeira abertura**: Home mostra empty state → botão "Importar mídia"
  → volta para Home com resumo preenchido.
- **Criar apresentação**: Home/Playlist → importar → editar itens →
  Apresentação → Apresentar.
- **Importar mídia**: de Home ou Playlist, mesmo fluxo (`AppController.importMedia`).
- **Editar playlist**: Playlist → toque no card → editor expansível → editar → fecha.
- **Configurar logo**: Configurações → Logo e identidade → importar →
  ajustar posição/tamanho/opacidade → ativa automaticamente.
- **Iniciar apresentação**: Home ou Apresentação → botão "Apresentar".
- **Operar apresentação**: toque revela overlay → play/pause/anterior/
  próximo/blackout/logo/sair.
- **Sair e continuar depois**: sair da apresentação volta para
  Apresentação (parado) ou Home; RuntimeState restaura ao reabrir.
- **Mídia indisponível (web, pós-reload)**: card mostra aviso "Mídia
  indisponível" + botão "Selecionar novamente"; metadados preservados,
  item nunca é removido automaticamente.
- **Excluir item**: editor expansível → remover → confirmação.
- **Limpar playlist**: Configurações → Playlist → Limpar → confirmação.
- **Restaurar sessão**: automático no `AppController.init()` (já existente).
