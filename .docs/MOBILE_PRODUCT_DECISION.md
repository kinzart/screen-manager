# Decisao do produto mobile

## Status

PENDING_HUMAN_APPROVAL

Implementacao autorizada: NAO

A decisao final pertence ao usuario.

## Recomendacao tecnica

Opcao recomendada para Android v1: Opcao A - controle remoto do aplicativo Electron.

O computador continua executando o aplicativo, acessando os arquivos e apresentando a midia no monitor ou projetor.

O aplicativo Android funciona como painel remoto para visualizar o estado e enviar comandos.

## Fundamentacao

Incompatibilidades consideradas:

- INC-01
- INC-02
- INC-03
- INC-04
- INC-05
- INC-06
- INC-07
- INC-08
- INC-09

1. O aplicativo atual depende de Electron, BrowserWindow, IPC e recursos do Windows.
2. O controle de segundo monitor permanece no computador.
3. Um aplicativo independente exigiria reimplementar filesystem, player e persistencia.
4. O controle remoto reduz o risco e o prazo da primeira entrega.
5. A arquitetura hibrida permanece como possibilidade futura.

## Escopo recomendado para Android v1

- pareamento seguro entre celular e computador;
- comunicacao pela rede local;
- visualizacao do estado da apresentacao;
- visualizacao e reorganizacao da playlist;
- play, pause, proximo e anterior;
- blackout e logo;
- controle de loop;
- tratamento de desconexao;
- desktop como fonte oficial do estado.

## Fora do Android v1

- reproducao independente de arquivos no celular;
- sincronizacao em nuvem;
- funcionamento fora da rede local;
- implementacao iOS;
- publicacao em loja;
- arquitetura hibrida completa.

## Decisao humana necessaria

O usuario deve escolher explicitamente:

- A: controle remoto do Electron;
- B: aplicativo mobile independente;
- C: arquitetura hibrida.

Opcao aprovada: NAO DEFINIDA
Android v1 autorizado: NAO
iOS autorizado: NAO

## Estado

- Nenhum arquivo de codigo foi alterado.
- Nenhuma dependencia foi instalada.
- Nenhuma arquitetura foi aprovada automaticamente.
- Implementacao continua bloqueada.
