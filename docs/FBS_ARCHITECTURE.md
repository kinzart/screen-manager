# FBS Screen Manager: arquitetura alvo

Base: auditoria em `docs/FBS_AUDIT.md`. Princípio: a menor evolução segura, sem reescrita.

## 1. Visão geral

```
                    ┌─────────────────────────── FBS Studio (web/) = CENTRAL ───────────────────────────┐
 Operador (celular, │  http-utils ─ sessions (auth/pareamento) ─ api (espaços, sessões, telas, programa,│
 notebook) ──HTTPS──┤  comandos, telemetria) ─ media (upload, hash, manifesto, range)                    │
                    │  domínio puro: web/public/fbs-core.js (UMD) + web/orchestrator.js                  │
                    │  persistência: store.js (state.json v2, gravação atômica serial, migração v1→v2)   │
                    └───────────────▲───────────────────────────────▲────────────────────────────────────┘
                                    │ polling HTTPS 1 s + heartbeat  │
              ┌─────────────────────┴───────┐           ┌────────────┴───────────────┐
              │ Receptor /tv (navegador,    │           │ Tela FBS (APK WebView) e    │
              │ Electron ou notebook)       │           │ navegador de TV Android     │
              │ plano local + cache SW      │           │ (mesma página /tv)          │
              └─────────────────────────────┘           └─────────────────────────────┘

 App Windows local (Electron, main.js e src/) ─ continua autônomo e offline, com dados em userData/data.
 Editor mobile (mobile/) ─ continua autônomo. O núcleo puro dele é a referência da fila de mídias.
```

## 2. Camadas e responsabilidades

| Camada | Módulo | Regra |
|---|---|---|
| Domínio: fila de mídias | `web/public/fbs-core.js` (`sequenceAt`, `segmentOutput`) | Puro, sem I/O, com UMD carregável no Node (`require`) e no navegador (`<script>`). É a mesma função no servidor e no receptor |
| Domínio: fila de sessões | `web/orchestrator.js` (`validateProgram`, `simulate`, `resolveProgram`, `buildPlan`) | Puro e determinístico: `f(programa, sessões, instante)`. Executa somente no servidor, que é a autoridade |
| Persistência | `web/store.js` | Um único gravador, fila serial, `revision` monotônica e migrações versionadas |
| Protocolo | `web/api.js`, `web/sessions.js`, `web/media.js` | REST `/api/v1`, protocolo do receptor versão 2 (campo `protocol`), compatível com o receptor v1 |
| Interfaces | `web/public/studio.*` (Central), `web/public/player.*` (receptor) | Sem framework novo. Design system existente (`studio.css`) |

## 3. Decisões arquiteturais (ADR resumidas)

**ADR-1: A Central é o FBS Studio existente.** Ele já tem autenticação, pareamento, revogação, ACK versionado, upload retomável e uma interface móvel testada.
*Rejeitado:* um novo serviço de coordenação. Duplicaria autenticação e persistência e romperia o deploy na Hostinger.

**ADR-2: Transporte por polling HTTPS (1 s) mais heartbeat.** A hospedagem atual não aceita WebSocket de entrada (`web/README.md`).
*Rejeitado:* WebSocket ou SSE como requisito. Pode virar uma otimização opcional sem mudar o modelo, porque o estado é sempre recalculável.

**ADR-3: Estado derivado do relógio, e não de eventos.** A posição de qualquer tela é `f(programa, cursor, agora)`. A queda do servidor ou do receptor não perde estado: o reinício recalcula a mesma saída.
*Rejeitado:* uma máquina de estados movida por timers no servidor. Ela perde ticks no reinício e não é determinística em testes.

**ADR-4: O servidor envia um plano (próximas 6 h, até 64 segmentos) ao receptor.** Sem rede, o receptor continua executando o plano com `fbs-core.js` e pré-carrega as mídias dele.
*Rejeitado:* rodar o orquestrador completo no receptor. Exigiria fuso e agenda no WebView 83 e divergiria da autoridade.

**ADR-5: Dois níveis de fila nunca se misturam.**
- *Fila de mídias* = `playlist.items` (a "Sessão" da interface). Tem ordem, duração por item e, no modo ao vivo, `loop`.
- *Fila de sessões* = `screen.program.entries`. Cada entrada referencia uma sessão por id e não contém mídias.
Comandos de sessão (`next-session`) e de mídia (`next-item`) são ações distintas no protocolo.

**ADR-6: Cache no receptor com Service Worker e Cache Storage, em blocos de 8 MiB, verificados por SHA-256 por bloco** (hash calculado pelo servidor no upload). Download retomável por bloco, RAM limitada a um bloco e verificação nativa com `crypto.subtle`.
*Limite:* exige contexto seguro (HTTPS ou localhost). Em HTTP de LAN, o receptor recorre ao streaming e informa `cache: unsupported`.
*Rejeitado:* hash do arquivo inteiro no navegador, que exigiria o arquivo inteiro na RAM ou um SHA-256 em JS puro lento no WebView 83.

**ADR-7: Override manual com retomada em tempo de parede.** A programação continua correndo em segundo plano. Ao liberar o override, a tela mostra o que a programação define *agora*, e não onde parou. Assim, telas diferentes continuam alinhadas à agenda. Para retomar do ponto exato existe outro comando, *Pausar*, que congela o cursor.

**ADR-8: O app Windows local continua intacto.** O Windows participa da Central como receptor `/tv` (navegador ou Electron). Integrar a fila local do Electron à Central fica fora deste ciclo; ver o plano.

## 4. Autoridade, offline e relógio

- **Autoridade:** apenas o servidor muda o programa e o cursor. O receptor nunca grava a programação.
- **Offline:** o receptor executa o último plano recebido até `horizonEndMs`. Depois disso, mostra o logo. Sem rede e sem cache, a mídia que não estiver em cache falha e é tentada de novo, sem travar o plano.
- **Reconexão:** o snapshot do servidor sempre vence (reconciliação). O receptor descarta a projeção local e passa a confirmar (ACK) a versão atual.
- **Relógio:** cada snapshot traz `serverNowMs`. O receptor estima `offset = serverNowMs − (t_envio + t_resposta)/2` e calcula o plano no relógio do servidor. A divergência de relógio do aparelho não afeta a programação.
- **Fuso:** gatilhos diários usam `program.timezone` (IANA, padrão `America/Sao_Paulo`), convertidos no servidor com `Intl`. Instantes absolutos são epoch ms (UTC).

## 5. Segurança

- Permanecem: autenticação do operador, CSRF, `Origin`, rate limit e o modelo de pareamento existente.
- Novo: `deviceId` persistente do receptor (gerado no navegador e enviado no heartbeat) e **revogação sem apagar a tela** (`POST /screens/:id/revoke`).
- A mídia só é servida à tela se estiver no plano atual dela (sessão atual mais horizonte). O pré-carregamento continua limitado ao que a tela vai reproduzir.
- Permissões: o papel único de admin é mantido neste ciclo. Papéis `viewer`/`operator` ficam planejados (ver o plano, P-7).

## 6. Compatibilidade

| Elemento | Compatibilidade |
|---|---|
| `state.json` v1 | Migrado automaticamente para v2 na abertura, com backup `state.v1-<ts>.json` gravado antes |
| Receptor v1 (página antiga em cache) | Continua funcionando: `output`, `source` e o ACK têm o mesmo formato. O campo `plan` é ignorado |
| APK Tela FBS 0.1.0 | Inalterado: carrega `/tv` do servidor e recebe o receptor novo automaticamente |
| App Electron | Nenhuma mudança em `userData/data`. Testes de regressão da raiz continuam obrigatórios |
| Rollback do servidor | A versão antiga recusa `schemaVersion 2`. Para voltar, restaure `state.v1-<ts>.json` |
