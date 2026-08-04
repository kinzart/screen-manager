# Escopo da Auditoria Mobile — Screen Manager

## Status

`AUDIT_ONLY`

A implementação mobile ainda não está autorizada.

## Objetivo

Auditar o aplicativo Electron, identificar o código reutilizável, mapear
incompatibilidades e comparar arquiteturas mobile antes de instalar
dependências ou modificar o runtime desktop.

## Preservação obrigatória

- A versão Electron deve permanecer intacta durante a auditoria.
- Nenhuma dependência mobile deve ser instalada nesta fase.
- `main.js`, `preload.js` e os renderers não devem ser alterados.
- Não criar `android/` ou `ios/`.
- Não alterar `package.json`.
- Não realizar deploy.
- Não alterar `.env`.
- Produzir apenas documentação em `.docs/`.

## Decisão de produto pendente

Ainda não está confirmado qual produto será construído:

1. Controle remoto do Electron pela rede local.
2. Aplicativo mobile independente.
3. Arquitetura híbrida.

A auditoria deve comparar as três opções.

A decisão final pertence ao usuário e será registrada em:

`.docs/MOBILE_PRODUCT_DECISION.md`

## Entrega inicial

- Primeira plataforma pretendida: Android.
- Tecnologia preferencial: Capacitor, sujeita à auditoria.
- iOS: roadmap futuro, não incluído na primeira implementação.
- Aplicação mobile: ainda não implementada.

## Documentos da auditoria

- `.docs/SCOPE.md`
- `.docs/CRITERIA.md`
- `.docs/_audit/package-baseline.md`
- `.docs/_audit/main.js.md`
- `.docs/_audit/preload.js.md`
- `.docs/_audit/control.js.md`
- `.docs/_audit/display.js.md`
- `.docs/_audit/persistence-and-ipc.md`
- `.docs/INCOMPATIBILITIES.md`
- `.docs/ARCHITECTURE_OPTIONS.md`
- `.docs/MOBILE_PRODUCT_DECISION.md`
- `.docs/MOBILE_AUDIT_REPORT.md`

## Informações ainda não confirmadas

Devem ser verificadas na auditoria de baseline:

- versão do Node.js;
- versão do Electron;
- scripts npm disponíveis;
- funcionamento de `npm start`;
- existência e funcionamento de `npm test`;
- existência e funcionamento do empacotamento desktop;
- versão apropriada do Capacitor;
- requisitos mínimos do Android;
- requisitos mínimos do iOS;
- formato e localização futura do APK.

Até que sejam verificadas, essas informações são `NÃO CONFIRMADAS`.

## Sequência autorizada

1. Corrigir escopo e critérios.
2. Auditar o baseline do projeto.
3. Auditar processo principal, preload e renderers.
4. Mapear persistência e IPC.
5. Consolidar incompatibilidades.
6. Comparar arquiteturas.
7. Produzir recomendação técnica.
8. Solicitar decisão humana.
9. Somente depois planejar a implementação.

## Fora do escopo da auditoria

- instalação do Capacitor;
- implementação Android;
- implementação iOS;
- sincronização em nuvem;
- publicação em lojas;
- PWA;
- deploy;
- alteração do runtime Electron.