# Plano de implementação priorizado

Ciclos pequenos de implementação, teste e correção. Cada fase termina com uma atualização de `docs/FBS_PROGRESS.md` e um commit na branch `feat/fbs-central-orchestration`. Nunca no `main`.

## Fase 2: núcleo e compatibilidade

| ID | Tarefa | Arquivos | Aceite |
|---|---|---|---|
| N-1 | Núcleo da fila de mídias em UMD (`sequenceAt`, `segmentOutput`) | `web/public/fbs-core.js` | Testes unitários e paridade com `playlistOutput` |
| N-2 | Orquestrador puro (`validateProgram`, `simulate`, `resolveProgram`, `buildPlan`, fuso) | `web/orchestrator.js` | Os 10 critérios de `FBS_SESSION_ORCHESTRATION.md` §6 |
| N-3 | Migração v1→v2 com backup | `web/store.js` | Teste: arquivo v1 real migrado, backup idêntico byte a byte, dados preservados, v3 recusado |
| N-4 | Regressão legada | — | `npm test` raiz, `tests/studio.test.cjs` e mobile continuam passando |

## Fase 3: Central e orquestração

| ID | Tarefa | Aceite |
|---|---|---|
| C-1 | `resolveScreenOutput` (override → programa → rota) integrado a `/state`, ACK, painel e autorização de mídia | Testes HTTP: tela com programa recebe a sessão certa; mídia da próxima sessão é autorizada; mídia de fora do plano é negada |
| C-2 | `PUT /screens/:id/program` com versão e validação | 409 por versão; 400 `UNBOUNDED_LOOP` |
| C-3 | `POST /screens/:id/commands` idempotente com estados accepted/delivered/executed | O mesmo `commandId` não reaplica |
| C-4 | Heartbeat e telemetria (`deviceId`, versão, cache, armazenamento, erros) e revogação sem apagar a tela | Painel mostra os dados; tela revogada recebe 401 |
| C-5 | Plano (`plan`) no snapshot do receptor e protocolo 2 | O receptor v1 continua funcionando |
| C-6 | Interface: painel de programação da tela (touch-first, 375 px), comandos e status | E2E com 375 px |

## Fase 4: cache, distribuição e experiência

| ID | Tarefa | Aceite |
|---|---|---|
| D-1 | Hash SHA-256 completo e por bloco de 8 MiB no fim do upload e em segundo plano para mídias antigas | Teste: hash confere com o arquivo |
| D-2 | `GET /screens/self/manifest` (mídias do plano, ordenadas por primeiro uso) | Teste HTTP |
| D-3 | Service Worker no receptor: cache em blocos, `Range` servido do cache, retomada e verificação por bloco, limpeza segura (nunca remove a mídia atual nem as do plano), checagem de espaço (`navigator.storage.estimate`) | Teste em navegador real (Edge) em `localhost` |
| D-4 | Receptor offline: execução do plano local e fallback de entrada obrigatória | E2E com o servidor derrubado |
| D-5 | Documentar o processo de release (Windows NSIS, APK, web) e o modelo `ReleaseInfo` | Doc; sem publicação |

## Fase 5: QA

Matriz de requisitos PASS/FAIL/BLOCKED/NOT_TESTED em `docs/FBS_PROGRESS.md`, com os comandos executados.

## Backlog (fora deste ciclo, com o motivo)

| ID | Item | Motivo |
|---|---|---|
| P-7 | Papéis `viewer`/`operator` | Muda o modelo de autenticação. Exige uma decisão de produto sobre usuários |
| P-8 | Canal de releases e verificação de atualização no APK | Exige credenciais, assinatura e hospedagem dos binários |
| P-9 | Exportar a fila local do Electron para a Central | Envia arquivos do usuário para a nuvem. Exige uma ação explícita do usuário e uma interface própria |
| P-10 | Modo "Receptor da Central" dentro do Electron, com cache em disco via Node | Hoje o Windows já funciona como receptor pelo navegador. Implementar depois de validar D-3 |
| P-11 | WebSocket/SSE opcional | A hospedagem atual não suporta |
| P-12 | Validação em hardware (HY300, Android TV, iPhone, Miracast) | Exige dispositivos físicos |
