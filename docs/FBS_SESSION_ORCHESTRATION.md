# Orquestração de sessões por tela

Implementação: `web/orchestrator.js` (fila de sessões) e `web/public/fbs-core.js` (fila de mídias).
Testes: `tests/orchestrator.test.cjs`.

## 1. Dois níveis

| | Fila de mídias (nível 1) | Fila de sessões (nível 2) |
|---|---|---|
| Entidade | `playlist.items` | `screen.program.entries` |
| Unidade | item de mídia com `durationMs` | entrada que referencia uma playlist |
| Avanço | posição dentro da passagem: `sequenceAt(items, offset)` | `simulate()` sobre a linha do tempo da tela |
| Comandos | `next-item`, `previous-item` | `next-session`, `previous-session`, `restart`, `start-entry`, `stop`, `pause`, `play` |
| Escopo | a mesma playlist pode estar em várias entradas e telas | por tela |

Uma entrada nunca guarda mídias, e uma playlist nunca guarda agenda.

## 2. Precedência da saída de uma tela (`resolveScreenOutput`)

1. **Override ativo**: a sessão tomada manualmente.
2. **Programa** habilitado:
   - com uma entrada no ar, mostra aquela sessão;
   - parado, aplica `idleOutput` (`route` segue para 3; `logo`, `blackout` e `idle` são saídas fixas).
3. **Rota** (fio do mapa, comportamento legado): a sessão com transporte compartilhado, ou o espelho de outra tela.
4. Sem nada: `idle`.

Uma tela espelho (`input.kind = "screen"`) espelha a **saída efetiva** da tela de origem, inclusive override e programa.

## 3. Linha do tempo determinística

O estado é `f(programa, sessões, agora)`. Não existe timer no servidor. O cursor `{atMs, entryId, offsetMs, pending, paused}` é o ponto de partida da simulação. Todo comando ou edição **rebaseia** o cursor no estado resolvido naquele instante, o que mantém a simulação curta e torna os comandos exatos.

Definições:
- `D(e)` = soma de `durationMs` da playlist da entrada. Com `D = 0` ou playlist ausente, a entrada é **vazia** e não é elegível.
- `len(e)` = `once`: D; `count`: D×n; `loop`: ∞; limitado por `endAfterMs`.
- `fim(e, s)` = `min(s + len, validUntilMs)`, onde `s` é o início virtual.
- `válida(e, t)`: não vazia e `validFrom ≤ t < validUntil`.
- **Gatilho**: o instante de uma entrada com `start.type` igual a `daily` ou `at`. Gatilhos diários usam o fuso do programa e o filtro `days`.
- **Entradas sequenciais** (`start.type = sequence`) formam o fluxo. Entradas por horário **só entram por gatilho**. Ao terminar, o fluxo continua na primeira entrada sequencial *depois do índice dela*.

Algoritmo (a cada passo, o próximo evento entre o gatilho seguinte `T > t`, o fim da entrada atual e a troca pendente):

| Evento | Regra |
|---|---|
| Gatilho com o programa parado | Inicia a entrada do gatilho |
| Gatilho com prioridade **menor** que a da entrada no ar | Fica **pendente para o fim da entrada atual** (nunca é descartado em silêncio) |
| Gatilho com prioridade ≥ e `interrupt = immediate` | Troca no instante do gatilho |
| `interrupt = after-item` | Troca no fim da mídia que está no ar (limitado ao fim da entrada) |
| `interrupt = after-session` | Troca no fim da entrada atual |
| Vários pendentes | Vence o de maior prioridade. No empate, vence o **mais recente** |
| Gatilhos no mesmo instante | Vence a maior prioridade e, no empate, o menor índice. Os demais desse instante são descartados (registrado como limitação) |
| Gatilho da própria entrada no ar | Reinicia a entrada (por exemplo, o loop diário das 08:00) |
| Fim da entrada com `onEnd = stop` | O programa para até o próximo gatilho ou `play` |
| Fim com `onEnd = next` | Próxima entrada sequencial válida. Sem nenhuma: `endBehavior` `repeat` volta à primeira sequencial; `stop` para |
| Pendente que expirou (`validUntil`) na hora da troca | É descartado. O fluxo segue a regra de fim |

### Loops que não bloqueiam a agenda

- O `loop` termina somente por gatilho, `endAfterMs`, `validUntilMs` ou comando. **Todo gatilho de horário interrompe** um loop de prioridade igual ou menor.
- A validação recusa (`UNBOUNDED_LOOP`) uma entrada sequencial `loop` sem limite (`endAfterMs` e `validUntilMs`) seguida de entradas sequenciais, que ficariam inalcançáveis. O loop sem limite só é permitido como a última entrada sequencial.
- `repeat` com ciclos curtos tem avanço rápido aritmético (`k` ciclos inteiros), limitado a 20.000 passos por simulação. Ao exceder o limite, o estado vira `error: SIMULATION_LIMIT`, que fica visível no painel (nunca um loop infinito).

## 4. Interrupções, quedas e retomada

| Situação | Comportamento |
|---|---|
| Fim da mídia atual | O nível 1 avança. Ao fim da passagem, o nível 2 decide entre repetir e trocar |
| Override manual (`take`) | Tem precedência. `until = manual`: fica até `release`. `until = next-trigger`: termina no próximo gatilho do programa. `repeat` once/count encerra sozinho |
| Liberação do override | Retomada em **tempo de parede**: a programação continuou correndo (ADR-7) |
| Pausa | Congela o cursor. Gatilhos ocorridos durante a pausa **não são aplicados retroativamente**, e o painel mostra "pausado". `play` retoma do ponto exato |
| Parada (`stop`) | Programa parado (`idleOutput`). Gatilhos futuros reiniciam |
| Reinício do servidor | Recalcula a partir do cursor persistido; o resultado é idêntico |
| Reinício do receptor | Busca o snapshot e retoma na posição calculada |
| Queda de rede no receptor | Executa o plano local (≤ 6 h) com o relógio do servidor estimado. Depois do horizonte, mostra o logo |
| Retorno da conexão | O snapshot do servidor vence e o ACK volta a confirmar a versão atual |
| Sessão editada no ar | A posição em tempo de parede é preservada. Se a entrada atual for removida, o cursor vai para a próxima entrada sequencial |
| Mídia obrigatória sem cache | O receptor aplica `program.fallback` e reporta `waiting-media`. O servidor **não** desloca a agenda, que continua determinística entre telas |

## 5. Comandos idempotentes

`POST /api/v1/screens/:id/commands {commandId, action, ...}`:
- Um `commandId` repetido devolve o resultado gravado sem reaplicar o comando. São guardados os últimos 20 por tela.
- Estados exibidos: `accepted` (gravado, revisão R), `delivered` (o receptor buscou o estado com revisão ≥ R), `executed` (ACK atual recebido depois de R) e `failed` (ACK `error`).

Ações: `play`, `pause`, `stop`, `restart`, `next-session`, `previous-session`, `start-entry{entryId}`, `next-item`, `previous-item`, `take{playlistId, until, repeat}`, `release`.

## 6. Critérios de aceitação (cobertos por testes automatizados)

1. Sequência `once → count(2) → loop` com as durações exatas.
2. Um gatilho diário interrompe o loop no horário certo e o fluxo segue para a entrada seguinte.
3. Um gatilho de prioridade menor fica pendente até o fim da entrada atual.
4. `after-item` troca no fim exato da mídia.
5. Janela de validade: a entrada fora da janela é pulada; o fechamento da janela termina a entrada.
6. `endBehavior repeat` com avanço rápido em 30 dias, sem exceder o limite.
7. O mesmo instante devolve o mesmo resultado: determinismo e simulação a partir de cursor rebaseado.
8. Pausa e retomada exatas; override com retomada em tempo de parede.
9. A validação recusa um loop sem limite que bloqueia as entradas seguintes.
10. Gatilho diário respeitando o fuso e a troca de DST (fuso de teste com DST).
