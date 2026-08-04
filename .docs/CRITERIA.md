# Critérios de Aceite — Auditoria Mobile

## Task 9 — Escopo e critérios

A task 9 será considerada concluída quando:

- `.docs/SCOPE.md` existir;
- `.docs/CRITERIA.md` existir;
- ambos estiverem em UTF-8 válido;
- não houver caracteres de controle indevidos;
- não houver texto com encoding corrompido;
- Android estiver definido como primeira entrega pretendida;
- iOS estiver definido como roadmap futuro;
- a função exata do mobile estiver marcada como decisão pendente;
- informações técnicas não auditadas estiverem marcadas como não confirmadas;
- todos os paths de auditoria estiverem padronizados;
- nenhum arquivo de código tiver sido alterado.

## Baseline do projeto

A auditoria deve confirmar, com evidência:

- conteúdo relevante do `package.json`;
- scripts npm existentes;
- versão declarada do projeto;
- dependências Electron;
- versão de Node declarada, caso exista;
- branch atual;
- estado do Git;
- estrutura principal de arquivos;
- existência de testes;
- processo de empacotamento desktop.

O relatório será:

`.docs/_audit/package-baseline.md`

Nenhuma versão ou comando deve ser presumido.

## Auditoria do Electron

### Processo principal

Documento:

`.docs/_audit/main.js.md`

Deve mapear:

- criação de janelas;
- IPC handlers;
- APIs Electron;
- filesystem;
- persistência;
- múltiplos monitores;
- shell e diálogos;
- subprocessos;
- side effects.

### Preload e bridge

Documento:

`.docs/_audit/preload.js.md`

Deve mapear:

- `contextBridge`;
- `ipcRenderer`;
- APIs expostas em `window`;
- consumidores;
- dependências de Electron e Node;
- compatibilidade mobile.

### Renderer de controle

Documento:

`.docs/_audit/control.js.md`

Deve mapear:

- arquivo real responsável pelo controle;
- estado;
- eventos;
- drag and drop;
- teclado;
- touch;
- acesso à bridge;
- comandos de reprodução.

### Renderer de exibição

Documento:

`.docs/_audit/display.js.md`

Deve mapear:

- arquivo real responsável pela exibição;
- reprodução de mídia;
- fullscreen;
- múltiplos monitores;
- timers;
- sincronização;
- dependências Electron.

## Persistência e comunicação

Documento:

`.docs/_audit/persistence-and-ipc.md`

Deve registrar:

- playlist;
- configurações;
- cache;
- arquivos locais;
- fluxo entre main, preload e renderers;
- mensagens IPC;
- pontos de acoplamento ao desktop.

## Incompatibilidades

Documento:

`.docs/INCOMPATIBILITIES.md`

Cada incompatibilidade deve informar:

- evidência;
- impacto;
- nível de dificuldade;
- alternativa possível;
- limitações da alternativa.

## Comparação arquitetural

Documento:

`.docs/ARCHITECTURE_OPTIONS.md`

Deve comparar:

1. controle remoto do Electron;
2. aplicativo independente;
3. arquitetura híbrida.

A comparação deve considerar:

- reutilização de código;
- rede;
- persistência;
- filesystem;
- segurança;
- experiência de uso;
- Android;
- iOS;
- manutenção;
- complexidade.

## Decisão humana

Documento:

`.docs/MOBILE_PRODUCT_DECISION.md`

Pode conter uma recomendação técnica, mas deve manter a decisão como pendente
até aprovação explícita do usuário.

## Gate final da auditoria

Documento:

`.docs/MOBILE_AUDIT_REPORT.md`

A implementação somente poderá começar quando:

- todas as auditorias obrigatórias estiverem concluídas;
- as contradições estiverem resolvidas;
- os itens não confirmados estiverem listados;
- houver recomendação arquitetural;
- o usuário escolher a arquitetura;
- existir branch ou worktree isolado;
- o baseline desktop estiver preservado.

## Proibições durante a auditoria

- não instalar dependências;
- não alterar código desktop;
- não criar `android/`;
- não criar `ios/`;
- não alterar `.env`;
- não executar deploy;
- não realizar publicação;
- não iniciar implementação antes da decisão humana.