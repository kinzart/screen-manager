# FBS: progresso e retomada

Branch de trabalho: `feat/fbs-central-orchestration` (criada a partir de `main@1ce4c2b`). Não fazer merge no `main` sem aprovação.
Git neste PC: use `git -c safe.directory=* <cmd>` (o repositório pertence a outro SID do Windows).

## Como retomar

1. Ler este arquivo, depois `docs/FBS_IMPLEMENTATION_PLAN.md`, e seguir a próxima tarefa não marcada.
2. Verificação mínima: `npm test` (raiz), `node --test tests/studio.test.cjs tests/orchestrator.test.cjs` e `cd mobile && npm test`.

## Fase 0: auditoria (concluída)

- Executado: auditoria somente leitura. Resultado em `docs/FBS_AUDIT.md`.
- Comandos e resultados reais: raiz 6/6; Studio 12/12 (1 falha intermitente na 1ª de 4 execuções); relay 1/1; `remote` 8/8; mobile 353/353.
- Achados principais: as branches `feat/mobile-android-v1` e `feature/android-v1` não existem; o mobile está no `main`. A Central já existe (FBS Studio). Faltam a fila de sessões por tela, o cache e a autonomia offline.

## Fase 1: especificação (concluída)

- Documentos: `FBS_ARCHITECTURE.md` (ADR 1-8), `FBS_DATA_MODEL.md` (esquema 2 e migração), `FBS_SESSION_ORCHESTRATION.md` (algoritmo, precedência, critérios) e `FBS_IMPLEMENTATION_PLAN.md`.
- Sem mudanças de código.
