# FBS Screen Manager: modelo de dados (Studio, esquema 2)

Persistência: `FBS_DATA_DIR/state.json`, um único documento gravado atomicamente. `revision` aumenta a cada gravação.
Os nomes do pedido foram mapeados para o domínio real encontrado.

| Conceito pedido | Entidade real | Onde |
|---|---|---|
| MediaAsset | `media` | `db.media[id]` |
| Playlist | `playlist` (a "Sessão" na interface) | `db.playlists[id]` |
| Session | `playlist` + `entry` da programação | Na interface, "sessão" é a playlist; a execução dela numa tela é uma entrada |
| Screen | `screen` | `db.screens[id]` |
| PlayerDevice | `screen.device` (persistido) + `presence` (memória) | Identidade e telemetria |
| SessionAssignment | `screen.program.entries[]` | Fila de sessões |
| ScheduleRule | `entry.start`, `entry.validFromMs/validUntilMs`, `entry.endAfterMs` | |
| PlaybackState | resolvido: `resolveScreenOutput()` + `ack` | Derivado, não persistido |
| TransferJob | Relatório `cache` do heartbeat | Executado no receptor |
| ReleaseInfo | `GET /health` (versão do servidor) + `device.app` | Planejado: canal de releases (P-8) |

## 1. Esquema 2

```jsonc
{
  "schemaVersion": 2,
  "revision": 123,
  "spaces":   { "<id>": { "id", "name", "createdAt" } },
  "media":    { "<id>": {
      "id", "spaceId", "name", "type": "image|video", "mime", "extension", "size", "createdAt",
      // novos no esquema 2 (null até o hash ser calculado):
      "sha256": "hex64|null", "chunkSize": 8388608, "chunks": ["hex64", "..."] | null
  } },
  "uploads":  { /* inalterado */ },
  "playlists":{ "<id>": {               // FILA DE MÍDIAS: inalterada
      "id", "spaceId", "name", "version", "loop": true,
      "items": [{ "id", "mediaId", "durationMs" }],
      "transport": { "playing", "positionMs", "anchorAtMs", "mode": "media|blackout|logo" },
      "position": { "x", "y" }
  } },
  "screens":  { "<id>": {
      "id", "spaceId", "name", "version", "routeRevision", "input": null | { "kind": "playlist|screen", "id" },
      "position", "createdAt",
      // novos no esquema 2:
      "program": null | Program,         // FILA DE SESSÕES
      "override": null | Override,
      "commands": [ CommandRecord ],     // as últimas 20, para idempotência
      "device": null | { "deviceId", "app", "version", "platform", "firstSeenAt", "lastSeenAt" }
  } },
  "sessions": { /* inalterado: sessões de login (operador/tela) */ },
  "pairings": { /* inalterado */ }
}
```

### Program (fila de sessões de uma tela)

```jsonc
{
  "enabled": true,
  "timezone": "America/Sao_Paulo",     // IANA
  "endBehavior": "stop" | "repeat",    // depois da última entrada sequencial
  "idleOutput": "route" | "logo" | "blackout" | "idle",  // saída com o programa parado
  "fallback": "stream" | "logo" | "blackout",            // entrada obrigatória sem mídia em cache
  "entries": [ Entry ],                // até 100
  "cursor": { "atMs", "entryId": "id|null", "offsetMs", "pending": null | Pending, "paused": false }
}
```

### Entry (SessionAssignment)

| Campo | Tipo | Padrão | Semântica |
|---|---|---|---|
| `id` | string | gerado | Estável entre edições |
| `playlistId` | id | — | A sessão (fila de mídias) a executar |
| `repeat` | `{mode:"once"}` \| `{mode:"count",count:1..1000}` \| `{mode:"loop"}` | once | Passagens completas pela fila de mídias |
| `start` | `{type:"sequence"}` \| `{type:"daily",time:"HH:MM[:SS]",days?:[0..6]}` \| `{type:"at",atMs}` | sequence | Sequencial ou por gatilho de horário (`days`: 0 = domingo) |
| `validFromMs`/`validUntilMs` | ms \| null | null | Janela de validade. Fora dela, a entrada é ignorada; ao fechar a janela, a entrada termina |
| `endAfterMs` | ms ≥ 1000 \| null | null | Duração máxima da entrada (limita o `loop`) |
| `interrupt` | `immediate` \| `after-item` \| `after-session` | immediate | Como o gatilho interrompe o que está no ar |
| `priority` | 0..100 | 50 | Resolve conflitos de gatilho |
| `onEnd` | `next` \| `stop` | next | Transição ao terminar |
| `required` | bool | false | Só começa com as mídias em cache; caso contrário, aplica `program.fallback` |

### Override

`{ "playlistId", "startedAtMs", "repeat": Repeat, "until": "manual" | "next-trigger" }`. Tem precedência sobre o programa (ver orquestração).

### CommandRecord

`{ "id": "commandId do cliente", "action", "at", "revision": "db.revision após aplicar", "result": "ok|error", "error"? }`.

## 2. Migração 1 → 2

Executada em `StudioStore.open`:
1. Lê `state.json`. Se `schemaVersion === 1`, grava uma cópia **byte a byte** em `state.v1-<epochms>.json` (com fsync) antes de qualquer mudança.
2. Transforma: `screens[*]` recebe `program:null, override:null, commands:[], device:null`; `media[*]` recebe `sha256:null, chunkSize:null, chunks:null`; `schemaVersion = 2`.
3. Grava com o mesmo protocolo atômico do `change()`.
4. Esquema desconhecido (maior que 2 ou inválido): recusa iniciar com uma mensagem clara. Não sobrescreve nada.

Os hashes das mídias existentes são calculados depois da abertura, em segundo plano e em streaming, um arquivo por vez. Enquanto o hash está ausente, o manifesto marca a mídia com `integrity: "pending"` e o receptor usa streaming.

## 3. Dados do app Windows (inalterados)

`userData/data/playlist.json` (array de itens `{id, path, name, type, duration, transition, fit, startAt}`), `settings.json` (`{rules, defaultFit, loopPlaylist}`) e `connections.json`. Não são lidos nem escritos pela Central. Migrar esses dados para a Central é uma exportação explícita planejada (P-9) e nunca automática.
