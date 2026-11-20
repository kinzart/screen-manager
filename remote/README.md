# Controle Remoto — Servidor de Retransmissão

Liga o celular (controle) a uma TV/monitor (exibição), **sem depender do
notebook**. A TV abre o endereço deste servidor no próprio navegador dela
(Smart TV, Chromecast com Google TV, Fire TV, Android TV, ou qualquer PC/
mini PC ligado à TV); o celular conecta ao mesmo servidor com o código de
4 dígitos mostrado na tela.

## Como funciona

1. A TV abre `https://SEU-SERVIDOR/display` → o servidor cria uma sala e
   mostra um código (ex.: `4391`).
2. No app mobile: Configurações → Controle Remoto → informe o endereço do
   servidor e o código → Conectar.
3. Comandos (apresentar, blackout, logo, pause, próximo…) saem do celular,
   passam pelo servidor e chegam à TV. Mídia (fotos/vídeos) é enviada do
   celular para o servidor e servida dali para a TV.

O Electron também pode entrar na mesma sala como `desktop` usando o token
`desktopToken` devolvido por `POST /api/rooms`. Quando esse papel está
conectado, os comandos do celular são roteados para o computador (que executa
as ações na saída HDMI/projetor/TV e publica o snapshot do estado); se ele não
estiver conectado, o relay mantém o comportamento legado e envia os comandos
diretamente para a TV navegador. O módulo `desktop/remote-relay.js` mantém a
conexão de saída WSS, reconecta com backoff e responde a `state-request`.

Tudo em memória — nenhum banco de dados. Uma sala "morre" quando a aba da
TV é fechada; a mídia enviada fica em disco (`data/media/`) até a sala
expirar (6h sem TV conectada) ou o servidor reiniciar (armazenamento
efêmero na maioria dos provedores gratuitos — aceitável para uso pessoal
de apresentações, não para arquivamento).

## Rodar localmente (teste)

```bash
cd remote
npm install
npm test        # 6 testes reais (HTTP + WebSocket), sem mocks de rede
npm start        # sobe em http://localhost:8787
```

Abra `http://localhost:<seu-ip-local>:8787/display` num navegador (ou
outro dispositivo na mesma rede) e configure o app mobile apontando pro
mesmo endereço — útil para testar antes de hospedar de verdade.

## Hospedar de verdade (nuvem)

Qualquer provedor que rode um processo Node persistente com WebSocket
funciona. Passos genéricos (exemplo com **Render**, que tem plano gratuito
adequado a este tamanho — o serviço "dorme" após inatividade no plano
gratuito, o que é aceitável para uso pessoal):

1. Crie uma conta em https://render.com (ou Railway/Fly.io — passos
   equivalentes).
2. "New Web Service" → conecte o repositório Git deste projeto.
3. **Root Directory**: `remote`
4. **Build Command**: `npm install`
5. **Start Command**: `npm start`
6. **Instance Type**: Free (ou o menor pago, se quiser evitar o
   "hibernar" após inatividade)
7. Variável de ambiente opcional: `PORT` (a maioria dos provedores já
   define automaticamente — o servidor lê `process.env.PORT`).
8. Após o deploy, você recebe uma URL pública (ex.:
   `https://fbs-remote.onrender.com`) — é esse endereço que a TV abre em
   `/display` e que você digita em Configurações → Controle Remoto no app.

### Desktop conectado ao projetor

O mesmo relay também pode controlar o Screen Manager instalado no computador
do evento. No painel Windows/Linux, informe a URL do relay e use **Criar sessão
remota**. O aplicativo chama `POST /api/rooms`, guarda o `desktopToken` e abre
uma conexão de saída WebSocket com `role=desktop`. O celular usa a URL, o número
da sala e o `controllerToken`; os comandos chegam ao desktop mesmo quando o
celular está em outra rede ou outra cidade. O projetor continua ligado
localmente ao computador, por HDMI/DisplayPort ou pela saída local `/tv`.

Em uma integração manual, a conexão do desktop tem este formato:

```text
wss://seu-relay.exemplo.com/ws?role=desktop&room=1234&token=desktopToken
```

O desktop mantém reconexão exponencial e publica snapshots do estado. Se a
internet cair, a apresentação local continua; quando o relay volta, o estado
é enviado novamente.

### Sessões seguras e reconexão

Cada sala agora recebe tokens aleatórios separados para a tela e para o
controle. O navegador da TV usa o token de exibição e o servidor envia
heartbeats para encerrar conexões presas; a página refaz a conexão com
intervalo progressivo quando a internet cai. Para exigir token também no
WebSocket, nos uploads e na leitura de mídia, defina no provedor:

```text
REMOTE_REQUIRE_TOKENS=true
```

O modo sem essa variável continua compatível com clientes v1 que ainda usam
apenas o código de quatro dígitos. O cliente atualizado deve enviar o token
no cabeçalho `Authorization: Bearer ...` para upload e na query do WebSocket.
Em produção, use sempre HTTPS/WSS e um armazenamento persistente para mídia.

### Armazenamento persistente (opcional)

Se o provedor escolhido oferecer um "disco persistente" (ex.: Render
Disks), monte-o e aponte a variável de ambiente `REMOTE_DATA_DIR` para
esse caminho — assim a mídia sobrevive a reinícios do serviço. Sem isso,
a mídia enviada é perdida a cada deploy/restart (aceitável para uso ao
vivo de uma apresentação, não para guardar arquivos).

## Limitações conhecidas desta versão (v1)

- Sem autenticação além do código de 4 dígitos da sala — qualquer pessoa
  que descubra o código durante a janela em que a sala existe pode
  conectar como controlador. Aceitável para uso pessoal/doméstico; não
  recomendado para eventos públicos sem uma camada adicional de segurança.
- Sem persistência de mídia entre reinícios do servidor, salvo disco
  persistente configurado manualmente.
- "logo" (comando de tela cheia) na TV atualmente equivale a um blackout —
  a TV não tem configuração própria de marca d'água nesta versão (só o
  presenter local do celular tem `LogoSettings`/`setWatermark`).
- Sem exibição de "próximo item"/timer na TV (só no app mobile).
- Testado com Node 18+, `ws@8`. Não testado ainda contra um navegador real
  de Smart TV — recomenda-se validar no aparelho específico antes de
  confiar em produção (navegadores embutidos de TV variam muito em
  suporte a WebSocket/CSS/fetch).
