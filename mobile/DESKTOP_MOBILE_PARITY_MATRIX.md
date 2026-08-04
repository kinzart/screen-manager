# Matriz de Paridade Desktop → Mobile

Levantada a partir de `src/control.js`, `src/control.html`, `src/display.js`,
`main.js` (raiz) e do estado atual de `mobile/www/app/**`.

| Funcionalidade | Origem | Comportamento no desktop | Status atual mobile | Onde aparece na nova UI | Adaptação necessária | Independente | Remoto futuro | Fora de escopo | Teste de aceite |
|---|---|---|---|---|---|---|---|---|---|
| Importar arquivos | control.js `choose()`/`addFiles` | Dialog nativo do SO, valida extensão/existência | Funcional (picker nativo/web) | Home (atalho) + Playlist (botão) | Nenhuma (MediaPort já cobre) | Sim | Sim | — | Selecionar 1+ arquivo → aparece na playlist |
| Playlist (lista) | control.js `render`/`itemMarkup` | Grid denso, drag-and-drop | Cards mas com todos os campos sempre abertos, sem thumbnail real | Tela Playlist | Cards compactos + editor expansível + thumbnail | Sim | Sim | Drag-and-drop (mouse) fora de escopo mobile | Lista mostra thumbnail, nome, tipo, duração |
| Ordenar (mover) | control.js `moveItem`/drag | Arrastar ou botões ↑↓ | Botões ↑↓ funcionais | Playlist (card compacto) | Manter botões, ícones SVG | Sim | Sim | Drag touch | Mover altera ordem persistida |
| Remover item | control.js delete | Sem confirmação | Com confirmação (modal) | Playlist (editor expansível) | Manter | Sim | Sim | — | Remover confirma e some da lista |
| Duração | control.js `.duration` | Input numérico | Funcional | Editor expansível do item | Manter | Sim | Sim | — | Editar persiste |
| Transição | control.js `.transition` + `transitionFor` (regra pode sobrepor) | Select com "Automática" | Funcional (sem herdar regra ainda) | Editor expansível | Manter; herdar de regra é melhoria futura | Sim | Sim | Herança de regra de horário na transição | Selecionar aplica |
| Ajuste contain/cover | (não existe no desktop — `fit` fixo `contain` no display.js) | Sempre contain | Selecionável (contain/cover) | Editor expansível | Manter (mobile já é superior aqui) | Sim | Sim | — | Selecionar aplica no presenter |
| Agendamento (regras horário) | control.js `renderRules`/`checkSchedule` | Lista de regras start/end/transição, dispara `take()` automaticamente | ScheduleEngine existe no core, sem UI | Configurações → Agendamento | Criar UI de CRUD de regras | Sim (app precisa estar aberto) | Sim | Disparo em background (SO) | Criar/editar/remover regra persiste |
| Loop da playlist | control.js `loopBtn`/`autoNext` | Toggle | Funcional (toggle no header antigo) | Configurações → Apresentação (padrão) + atalho rápido | Mover para Configurações como padrão; manter toggle rápido opcional | Sim | Sim | — | Toggle persiste e afeta autoavanço |
| Play | control.js `toggle`/`start` | Inicia do currentId ou primeiro item | Funcional | Tela Apresentação | Manter | Sim | Sim | — | Play inicia exibição |
| Pause | control.js `toggle` | Pausa vídeo, mantém timer parado | Funcional | Tela Apresentação (overlay) | Manter | Sim | Sim | — | Pause visível e efetivo |
| Anterior/Próximo | control.js `next()` | Circular na playlist | Funcional | Tela Apresentação (overlay) | Manter | Sim | Sim | — | Troca item, atualiza timer |
| Blackout | control.js `blackoutBtn` | Tela preta, para timer visualmente não (continua rodando) | Funcional | Tela Apresentação (overlay) | Manter | Sim | Sim | — | Blackout cobre mídia |
| Logo | control.js `logoBtn` / display.js `logo()` | Mostra `#logo` (imagem estática do HTML do desktop) | Placeholder vazio (`logoSrc:''`), nunca configurável | Configurações → Logo e Identidade; exibido no presenter | Implementar import/posição/tamanho/opacidade real via MediaPort | Sim | Sim | Logo diferente por display (multi-tela) | Logo configurado aparece no presenter |
| Configurações gerais | control.js settings load/save | rules, loopPlaylist (mínimo) | Existe no storage, sem UI própria | Tela Configurações (6 seções) | Criar UI completa | Sim | Parcial (algumas globais) | — | Alterações persistem e sobrevivem reload |
| Persistência | main.js IPC + fs | JSON em disco (Electron) | Funcional via CapacitorStorage (IndexedDB/localStorage no web) | Transparente | Nenhuma | Sim | Sim | — | Reload restaura playlist/settings |
| Restauração de sessão | — (desktop não tem RuntimeState) | N/A | RuntimeState existe (mobile-only) | Home (resumo) + restauração silenciosa | Nenhuma | Sim | Sim | — | Reabrir app restaura currentId/elapsed |
| Presenter (exibição) | display.js | Janela separada (2º monitor ou janela) | Mesma WebView, view alternável | Tela Apresentação (fullscreen) | Overlay de controles com auto-hide | Sim | Sim | 2º monitor real | Apresentação ocupa a tela toda |
| Item atual / próximo | control.js `updateStatus` | Painel lateral fixo | Só na TransportBar (nome atual) | Home (resumo) + Apresentação (CurrentMediaPanel/NextMediaPanel) | Criar os dois painéis | Sim | Sim | — | Mostra nome atual e próximo |
| Timer (elapsed/remaining) | control.js `#elapsed`/`#remaining`/`#progress` | Barra de progresso + texto | Não existe no mobile hoje | Tela Apresentação | Criar barra de progresso | Sim | Sim | — | Progresso reflete PlaybackEngine |
| Erros | control.js `toast()` / mobile `showError` | Toast simples 2.2s | `showError` fixo, sem auto-dismiss, visual cru | StatusBanner / Toast component | Unificar visual, manter acessibilidade (role=alert) | Sim | Sim | — | Erro real aparece e é legível |
| Tela cheia | display.js (janela dedicada) | Janela ocupa o monitor | `PresentationPlatform.enterFullscreen` (Fullscreen API) | Tela Apresentação | Manter | Sim | Sim | — | Apresentação usa toda a viewport |
| Segundo monitor (desktop) | main.js `createDisplay` | Multi-monitor real via Electron | N/A (1 tela física no celular) | — | — | Não aplicável | Futuro casting/HDMI | Sim (fora de escopo) | — |
| Abrir arquivo/pasta | control.js `openPlaylistPath` (`window.fbs.openFile/showInFolder`) | Abre no explorador do SO | Não existe (sandbox mobile não tem "pasta" visível ao usuário) | — | — | Não aplicável | Não aplicável | Sim (sandbox não expõe path ao SO) | — |
| Configurações de exibição (fit/transição padrão) | Implícito (`defaultFit` em settings) | `defaultFit` usado ao importar | Existe no storage, sem UI | Configurações → Apresentação | Criar campos de padrão | Sim | Sim | — | Alterar padrão aplica a novas importações |
| Regras de horário (ver Agendamento acima) | — | — | — | — | — | — | — | — | — |

## Cobertura

Todas as 27 funcionalidades pedidas na lista mínima do prompt estão
cobertas na tabela acima (algumas fundidas por serem a mesma capacidade
vista de dois ângulos, ex. "regras de horário" = "agendamento").
