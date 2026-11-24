# FBS: progresso e retomada

Branch de trabalho deste ciclo: `feat/fbs-central-orchestration` (já mergeada no `main`, PRs #1 e #2). Ciclos seguintes: `feat/pin-login` e `feat/mobile-ux`. **Não fazer merge no `main` sem aprovação.** Branch enviada ao GitHub (`origin/feat/fbs-central-orchestration`).

**Produção:** a Central 1.1.0 foi publicada em 2026-11-24 (commit `2bbe219`, build Hostinger `01a20e3b-8814-7107-990c-730151dfd7c5`) com `scripts/deploy-studio.mjs`. Conferido depois: `/health` = 1.1.0; login com a senha existente; espaço "Evento de validação" com 1 tela, 2 sessões e 8 mídias; `/tv` em HTTPS gera código e QR, Service Worker e contexto seguro disponíveis. A existência de `state.v1-*.json` no servidor **não** foi conferida (a API não lê fora de `public_html`).

**Publicação automática:** `.github/workflows/deploy-studio.yml` publica a cada push no `main` que altere `web/` (testes antes) e depende do segredo `HOSTINGER_API_TOKEN`. Só passa a valer depois do merge desta branch no `main`.
Git neste PC: use `git -c safe.directory=* <cmd>` (o repositório pertence a outro SID do Windows). O working tree usa CRLF (`core.autocrlf=true`).

## Estado em 2026-11-24 (ler primeiro)

- **Produção:** Central **1.2.0** em https://screen-manager.kinzart.com.br, publicada a partir de `feat/mobile-ux` (commit `b57c8ee`) com `scripts/deploy-studio.mjs`. O `main` está na 1.1.0. **Falta o merge de `feat/mobile-ux`** (já inclui `feat/pin-login`). Até lá, a publicação automática a partir do `main` é recusada pelo bloqueio de downgrade.
- **Senha do operador:** PIN de 6 números (`.maestro/fbs-analysis/private/ACESSO-FBS-STUDIO.txt`). Depois de 10 senhas erradas em 15 minutos, o login trava para todos.
- **Hostinger:** token da API em `.maestro/fbs-analysis/private/hostinger-token.txt` e no segredo `HOSTINGER_API_TOKEN` do GitHub. Trocar uma variável de ambiente **não** reinicia o app: é preciso chamar `POST .../nodejs/server/restart`.
- **1.2.0 entregou:**
  - menu de ações ao tocar no card;
  - exclusão de tela, sessão, mídia e espaço;
  - "Reiniciar tela" (comando `reload` → `reloadToken`);
  - nomes "FBS N" únicos;
  - painel sem zoom, com barra inferior e mapa em duas colunas no celular;
  - app instalável (PWA);
  - editor de avisos em `/avisos`.
- **APK Tela FBS 0.2.0:** `versionCode` automático. A atualização por cima da 0.1.0 foi validada em emulador Android 11; no HY300 real, ainda não. O APK está em `Desktop/FBS Tela - Pendrive`.
- **Verificação:**

  | Suíte | Resultado |
  |---|---|
  | web | 34/34 |
  | raiz | 6/6 |
  | E2E `mobile-ux` | PASS |
  | E2E `central-ui` | PASS |
  | E2E `studio` | PASS |
  | E2E `tv-offline` | PASS |
- **Próximos passos:**
  1. Merge da PR.
  2. Teste no HY300 e no celular instalado.
  3. Proposta aguardando OK: app Electron com botão "Painel da Central" e atualização automática via GitHub Releases.
  4. Opcional: APK que se atualiza sozinho.

## Como retomar

1. Ler este arquivo, `docs/FBS_IMPLEMENTATION_PLAN.md` (backlog P-7 a P-12) e `docs/FBS_SESSION_ORCHESTRATION.md`.
2. Verificação mínima, todos verdes em 2026-11-23:
   ```
   npm test                              # raiz Electron: 6
   cd web && npm test && npm run build   # Studio + orquestrador + Central: 32
   cd mobile && npm test                 # 353
   cd remote && npm test                 # 8
   node tests/central-ui.e2e.cjs         # Edge, 375 px
   node tests/tv-offline.e2e.cjs         # Edge, cache + queda real do servidor
   node tests/studio.e2e.cjs             # regressão legada do Studio (Edge, MP4, 375 px)
   ```
3. O que falta fazer está em "Pendências", no fim deste arquivo.

## Commits deste ciclo

| Commit | Conteúdo |
|---|---|
| `620f706` | Fase 0 (auditoria) e Fase 1 (arquitetura, modelo de dados, orquestração e plano) |
| `bca56cc` | Núcleo: fbs-core (UMD), orquestrador, screen-output, screen-control, migração v2, hash de mídia, comandos, telemetria, manifesto e testes |
| `e294d51` | Receptor: plano offline, cache em blocos verificados (SW), heartbeat, ciclos compactos e E2E |
| `05c0872` | Interface da Central: estado, comandos, controle manual, editor de programação e E2E 375 px |
| `16f7172` | Documentação de releases, versão 1.1.0 do Studio e checkpoint |
| `0533b10` | Script de publicação pela API da Hostinger e workflow de publicação automática |
| `2bbe219` | Limpeza de pastas temporárias dos testes com novas tentativas (R6) |

## Fases

| Fase | Situação | Evidência |
|---|---|---|
| 0: Auditoria | Concluída | `docs/FBS_AUDIT.md` |
| 1: Especificação | Concluída | 4 documentos e ADRs |
| 2: Núcleo e compatibilidade | Concluída | 15 testes do orquestrador; migração com backup byte a byte; suítes legadas verdes |
| 3: Central e orquestração | Concluída (com o backlog P-7 em aberto) | 5 testes HTTP de integração; E2E da interface |
| 4: Cache, distribuição e experiência | Concluída na web; builds nativos não gerados | E2E com cache e queda real; `docs/FBS_RELEASES.md` |
| 5: QA | Concluída no ambiente local; hardware pendente | Matriz abaixo |

## Comandos executados e resultados reais (última rodada)

| Comando | Resultado |
|---|---|
| `npm test` (raiz) | 6/6 pass |
| `cd web && npm test` | 32/32 pass (studio 12, orquestrador 15, central 5) |
| `cd web && npm run build` | ok (`node --check` em todos os módulos) |
| `cd mobile && npm test` | 353/353 pass |
| `cd remote && npm test` | 8/8 pass |
| `node tests/central-ui.e2e.cjs` | PASS (2 execuções) |
| `node tests/tv-offline.e2e.cjs` | PASS (2 execuções com a queda real do servidor). Uma versão anterior que usava `context.setOffline` falhou 1 vez e foi corrigida: o teste não provava o modo offline |
| `node tests/studio.e2e.cjs` | PASS (2 execuções) |
| Testes de mutação manuais | 3 mutações (prioridade, avanço rápido, congelamento do cursor) foram detectadas pelos testes |

## Matriz de requisitos

Legenda: PASS = verificado por teste automatizado executado aqui; NOT_TESTED = sem teste ou sem implementação (o motivo está na linha); BLOCKED = depende de algo externo.

| # | Requisito | Status | Evidência / observação |
|---|---|---|---|
| 1.1 | Central web responsiva gerencia telas, sessões, biblioteca e atribuições | PASS | `central-ui.e2e` (375 px, sem rolagem horizontal) e `studio.e2e` (1440 px e 375 px) |
| 1.2 | Central autoritativa sem impedir reprodução local offline | PASS | ADR-3/4; `tv-offline.e2e` com o servidor desligado |
| 1.3 | Gerenciar players Windows **e** Android | PASS parcial / NOT_TESTED | Receptor `/tv` testado no Edge (Windows). Android: WebView 83 validada no ciclo anterior (protocolo 1); **o protocolo 2 não foi testado em Android** |
| 1.4 | Permissões | NOT_TESTED (não implementado) | Continua o papel único de admin. P-7 exige uma decisão de produto |
| 2.1 | Fila de mídias interna preservada | PASS | `playlists.items` inalterado; `studio.test` legado 12/12; paridade da saída de rota com `playlistOutput` |
| 2.2 | Fila de sessões separada por tela | PASS | `orchestrator.test` e `central.test` |
| 2.3 | Ordem, execução única, N repetições, loop, horário, janela, encerramento, transição | PASS | Critérios 1-5 e 10 |
| 2.4 | Interrupções, conflitos, prioridade, fim da mídia, override, retomada | PASS | Critérios 3, 4 e 8; gatilhos simultâneos; override com retomada em tempo de parede |
| 2.5 | Reinicialização, queda e retorno de conexão | PASS | Determinismo (critério 7), reinício do servidor no E2E e reconexão com ACK |
| 2.6 | Loops que não bloqueiam a agenda | PASS | Critério 9 (`UNBOUNDED_LOOP`) e critério 2 (gatilho interrompe o loop) |
| 3.1 | Protocolo versionado, id persistente, heartbeat | PASS | `protocol: 2`, `deviceId` em localStorage, heartbeat a cada 10 s (`central.test` telemetria) |
| 3.2 | Comandos idempotentes, confirmação, revisão, reconciliação | PASS | `commandId`; accepted→delivered→executed (`central.test`, `central-ui.e2e`); `STALE_ACK` |
| 3.3 | Pairing QR com token temporário, autorização e revogação | PASS | Pareamento existente (QR e desafio de 5 min); revogação sem apagar a tela e troca de aparelho (`central.test`) |
| 3.4 | Limites de plataforma especificados | PASS (documental) | `FBS_RELEASES.md` §5 |
| 3.5 | Reaproveitar o Android Capacitor | NOT_TESTED | O receptor Android é o APK WebView. O editor Capacitor não foi integrado à Central (fora do escopo deste ciclo) |
| 4.1 | Download antecipado para armazenamento privado | PASS | Cache Storage por origem; `tv-offline.e2e` 3/3 |
| 4.2 | Retomável, hash, espaço livre, proteção do arquivo em uso, limpeza | PASS parcial | Blocos de 8 MiB com SHA-256 verificado, retomada por bloco, `storage.estimate` e a mídia no ar protegida, tudo implementado. **O E2E não interrompe um download no meio**; a retomada está NOT_TESTED |
| 4.3 | Relatório de prontidão | PASS | Telemetria `cache.ready/total/bytes` visível no painel |
| 4.4 | Não iniciar uma sessão obrigatória sem arquivos e fallback configurável | NOT_TESTED | Implementado (`required` e `program.fallback`, status `waiting-media`) sem teste automatizado de navegador |
| 4.5 | Mídias grandes sem RAM integral | PASS | Bloco de 8 MiB por vez no SW e no download; arquivo de 17 MB em 3 blocos com Range entre blocos |
| 5.1 | Online/offline, última comunicação, sessão, mídia, progresso, cache, versão, falhas | PASS | Painel "Estado da tela" (`central-ui.e2e`, captura em 375 px) |
| 5.2 | Ações remotas: reproduzir, pausar, parar, avançar, reiniciar | PASS | `central.test` (pausa exata, próxima sessão/mídia, override) e `central-ui.e2e` |
| 5.3 | Distinguir comando recebido de executado | PASS | Estados `delivered` e `executed` |
| 6.1 | Processo de build e release investigado | PASS (documental) | `FBS_AUDIT.md` §7, `FBS_RELEASES.md` |
| 6.2 | Instaladores, APK, canais, rollback | NOT_TESTED / BLOCKED | Nenhum instalador ou APK gerado neste ciclo. Publicação BLOCKED (sem credenciais, sem autorização) |
| 7.1 | Interface touch-first, acessível, com feedback | PASS parcial | Alvos de 44 px, `aria-label`, `role=status` e mensagens; validado em 375 px. Sem auditoria formal de acessibilidade (leitor de tela) |
| 7.2 | Design system existente, sem framework novo | PASS | Tokens de `studio.css`; JS puro. UX Pro Max está instalado e não foi usado, para não introduzir outra linguagem visual |
| C | Funcionamento local do Windows preservado | PASS | Nenhum arquivo do Electron alterado; raiz 6/6 |
| HW | Teste em dispositivo real (HY300, Android TV, iPhone) | NOT_TESTED | Exige hardware físico |

## Riscos

| ID | Risco | Situação |
|---|---|---|
| R1 | Rollback para a Central 1.0.1 exige restaurar o backup v1 | Documentado em `FBS_RELEASES.md` §4 |
| R5 | Sem HTTPS não há cache no receptor | Limite de plataforma; o painel mostra "Indisponível (use HTTPS)" |
| R6 | Falha intermitente na suíte legada do Studio | Causa: `ENOTEMPTY` ao apagar a pasta temporária no Windows. Corrigido com `maxRetries` (commit `2bbe219`); 12/12 verdes |
| R11 | Travamento raro de `central.test.cjs` no Windows (2 ocorrências; a 2ª em 2026-11-24 durou cerca de 1 h mesmo com `--test-timeout`) | Não reproduzido em 21 execuções seguintes. Causa desconhecida; os testes usam relógio fixo. Se voltar: guardar o processo e inspecionar antes de matar |
| R12 | Gatilhos no mesmo instante: perdedores descartados | Comportamento determinístico e documentado |
| R13 | Pausa descarta gatilhos ocorridos durante ela | Documentado; o painel mostra "Pausada" |
| R14 | Protocolo 2 não testado em WebView 83 (HY300) | Usa apenas ES2017 e APIs presentes no Chrome 83, mas falta prova em hardware |

## Pendências (próximo passo, por prioridade)

1. Testar no HY300/Android TV a página `/tv` da Central 1.1.0 em HTTPS: cache, modo offline e telemetria (`deviceId` e versão).
2. Teste automatizado de `required` + `fallback` e de download interrompido no meio de um bloco (retomada).
3. Conferir no Gerenciador de Arquivos do hPanel que `fbs-screen-manager-data/state.v1-*.json` existe; merge da branch no `main` (decisão do dono) para ativar a publicação automática.
4. P-7 Permissões, P-8 canal de releases, P-9 exportar fila do Electron, P-10 receptor Electron com cache em disco.
