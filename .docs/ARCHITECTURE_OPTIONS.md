# Opcoes de arquitetura mobile

Comparacao baseada nas auditorias do Electron e nas incompatibilidades consolidadas.

Incompatibilidades consideradas: INC-01, INC-02, INC-03, INC-04, INC-05, INC-06, INC-07, INC-08, INC-09

## Comparacao resumida

| Criterio | A: Controle remoto | B: App independente | C: Hibrida |
|---|---|---|---|
| Complexidade inicial | Media | Alta | Muito alta |
| Preserva o Electron | Sim | Sim, mas duplica recursos | Sim |
| Reutilizacao da interface | Media | Alta | Alta |
| Reutilizacao do runtime | Alta no desktop | Baixa | Media |
| Exige computador ligado | Sim | Nao | Depende do modo |
| Exige rede local | Sim | Nao | Para modo remoto |
| Filesystem mobile | Minimo | Obrigatorio | Obrigatorio no modo local |
| Segundo monitor desktop | Preservado | Nao aplicavel diretamente | Preservado no modo remoto |
| Prazo da primeira versao | Menor | Maior | Maior |
| Risco tecnico | Medio | Alto | Muito alto |

## Opcao A — controle remoto do Electron

O computador continua executando o aplicativo Electron e exibindo a apresentacao.
O celular controla playlist, play, pause, proximo item, blackout, logo, loop e configuracoes permitidas.

### Componentes

- Servidor local seguro iniciado pelo Electron.
- WebSocket ou HTTP local para comandos e estado.
- Aplicativo Android em Capacitor.
- Autenticacao por codigo temporario ou QR Code.

### Vantagens

- Preserva segundo monitor, filesystem e reproducao no computador.
- Menor quantidade de codigo desktop a substituir.
- Primeira entrega Android mais rapida.
- Mantem arquivos grandes fora do celular.

### Desvantagens

- Exige computador e aplicativo desktop ligados.
- Exige comunicacao pela rede local.
- Exige autenticacao e protecao contra comandos nao autorizados.

### Adequacao para a primeira versao

ALTA. Resolve o uso do celular como controle sem reimplementar o sistema inteiro.

## Opcao B — aplicativo mobile independente

O celular carrega, organiza e reproduz suas proprias midias sem depender do Electron.

### Componentes

- Aplicativo Capacitor com storage e filesystem mobile.
- Seletor Android de imagens e videos.
- Repository local para playlist e configuracoes.
- Player adaptado para codecs e ciclo de vida Android.

### Vantagens

- Funciona sem computador.
- Pode ser usado para apresentacao diretamente no dispositivo.
- Nao depende de rede local.

### Desvantagens

- Exige reimplementar filesystem, persistencia e player.
- Nao substitui automaticamente a saida para segundo monitor do computador.
- Permissoes e codecs variam por aparelho.
- Maior risco de regressao e divergencia entre desktop e mobile.

### Adequacao para a primeira versao

BAIXA A MEDIA. Tecnologicamente possivel, mas possui escopo muito maior.

## Opcao C — arquitetura hibrida

O aplicativo mobile possui modo local e modo de controle remoto do Electron.

### Componentes

- Core compartilhado para playlist, estado e validacoes.
- Adapter Electron.
- Adapter Capacitor.
- Adapter remoto por rede.
- Storage separado por plataforma.

### Vantagens

- Maior flexibilidade futura.
- Permite reutilizar regras e contratos.
- Pode oferecer controle remoto e apresentacao local.

### Desvantagens

- Maior complexidade inicial.
- Exige tres caminhos de integracao e mais testes.
- Alto risco de crescimento prematuro do escopo.

### Adequacao para a primeira versao

BAIXA. Melhor como roadmap depois de validar o controle remoto.

## Recomendacao tecnica preliminar

Recomenda-se a Opcao A para a primeira versao Android.

Motivos:

1. O aplicativo atual foi criado para controlar midia em um segundo monitor conectado ao computador.
2. O Electron ja possui acesso a janelas, filesystem, shell, display e reproducao.
3. O celular pode acrescentar mobilidade sem substituir imediatamente o runtime desktop.
4. O contrato da bridge pode ser convertido em uma API local controlada.
5. A opcao hibrida pode permanecer como roadmap.

Esta recomendacao nao representa aprovacao final. A decisao permanece com o usuario.

## Estado

- Nenhum arquivo de codigo foi alterado.
- Nenhuma dependencia foi instalada.
- Nenhuma arquitetura foi aprovada automaticamente.
- Decisao humana: PENDENTE.
