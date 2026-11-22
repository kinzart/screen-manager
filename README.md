# Screen Manager

Aplicativo para Windows e Linux para operar imagens e vídeos em eventos. O computador mantém a fila e os horários. O operador pode usar o painel do PC ou o navegador do iPhone, e a TV pode receber a apresentação por HDMI/DisplayPort ou pelo próprio navegador. No Windows, também há reconexão por helper Miracast. A operação na rede do evento funciona sem internet.

## Recursos principais

- Fila de exibicao para imagens e videos.
- Arrastar e soltar arquivos PNG, JPG, WEBP, GIF, MP4 e WEBM.
- Reordenacao da fila por arrastar a linha ou pelos botoes de subir/descer.
- Duplo clique em um item para colocar no ar imediatamente.
- Play, pausa, anterior, proximo, blackout e tela de logo.
- Botao de loop da playlist.
- Bloqueio do item no ar para impedir trocas automaticas.
- Regras por horario com transicoes.
- Painel de arquivos com atalho para abrir o arquivo ou mostrar na pasta.
- Saida em tela cheia no segundo monitor quando disponivel.
- Recuperação da última saída, com preservação do item, posição do vídeo, pausa e bloqueio.
- Controle do mesmo evento pelo telefone e saída em navegador de TV, com pareamentos separados.

## Conectar o iPhone ou uma TV

### FBS Studio pela internet

O novo [FBS Studio](https://screen-manager.kinzart.com.br/studio) permite enviar mídias e controlar sessões e telas em redes diferentes. Abra [o receptor](https://screen-manager.kinzart.com.br/tv) no projetor, TV ou notebook, aprove o código no painel e ligue os nós no mapa para distribuir ou espelhar o conteúdo. O QR do receptor abre o painel no código de pareamento. [Guia da versão web e servidor próprio](web/README.md).

### Acesso na rede do computador

No painel do computador, abra **Conexões → Ativar acesso pelo celular e TV**. No iPhone, abra no Safari um dos endereços exibidos e digite o código de controle. Na Android TV, abra o mesmo endereço com `/tv` no final e use o código de exibição. Os aparelhos podem usar Wi-Fi ou Ethernet na mesma rede. O manual também explica o acesso de outra cidade por uma rede privada. [Manual do usuário](MANUAL_USUARIO.md#14-reconectar-a-tv)

### Monitores e reconexão

Em Windows e Linux, as saídas HDMI/DisplayPort usam a API `screen` do Electron para identificar monitores e acompanhar sua desconexão e reconexão. Configure as telas no modo estendido nas configurações do sistema. A recuperação depende de o sistema operacional reconhecer novamente o monitor.

O helper PowerShell de reconexão Miracast é exclusivo do Windows e só é incluído na distribuição Windows. Uma saída sem fio no Linux depende das ferramentas e do suporte do sistema; ela não tem garantia de usar o mesmo backend Miracast nem a mesma reconexão automática do helper Windows. A saída pelo navegador da TV usa a rede IP e é uma alternativa independente desse helper.

### Controle remoto pela internet

O projeto também inclui um relay Node.js em `remote/`. Hospede essa pasta em
um serviço com HTTPS/WebSocket, crie uma sessão remota no painel do computador
e conecte o celular usando a URL, a sala e o token exibidos. O computador abre
a conexão de saída e continua ligado ao projetor; celular e computador não
precisam estar na mesma rede. Se a internet cair, a apresentação local
continua e o desktop reconecta quando o relay voltar. Em produção, configure
`REMOTE_REQUIRE_TOKENS=true` no servidor.

## Requisitos

- Windows 10 ou 11, ou Linux com ambiente gráfico compatível com Electron.
- No Linux, AppImage é o formato portátil recomendado; o pacote deb é destinado a Debian/Ubuntu.
- Para desenvolvimento e empacotamento: Node.js 20 ou superior e npm.

## Instalar e rodar em desenvolvimento

Na raiz do repositório:

```sh
npm ci
npm start
```

## Gerar distribuições

### Windows

O comando existente continua gerando o instalador Windows NSIS:

```powershell
npm ci
npm run package
```

### Linux

Em um ambiente Linux com Node.js e npm, execute na raiz do repositório:

```sh
npm ci
npm run package:linux
```

Os arquivos são criados em `dist/`, com o padrão `fbs-screen-manager-${version}-${arch}.${ext}`. O empacotamento inclui `main.js`, `preload.js`, os módulos JavaScript de `desktop/`, `src/`, os assets e a dependência de produção `ws`.

**AppImage** é o formato portátil recomendado: não instala um pacote no sistema. **deb** é o formato de instalação para Debian/Ubuntu. Use o arquivo correspondente à arquitetura do computador.

Para solicitar os alvos Windows e Linux no mesmo comando, em um ambiente preparado para compilar ambos:

```sh
npm run package:all
```

### Executar o AppImage

Na pasta onde salvou o AppImage, conceda permissão de execução e abra o arquivo. O exemplo usa a versão 1.1.0 para x64; ajuste o nome conforme o arquivo gerado ou recebido:

```sh
chmod +x ./fbs-screen-manager-1.1.0-x64.AppImage
./fbs-screen-manager-1.1.0-x64.AppImage
```

Para remover a distribuição portátil, feche o aplicativo e exclua o arquivo AppImage.

### Instalar e remover o deb

No Debian/Ubuntu, na pasta do arquivo deb, execute o comando abaixo, ajustando o nome à versão e arquitetura recebidas:

```sh
sudo apt install ./fbs-screen-manager-1.1.0-x64.deb
```

Depois, abra **FBS Screen Manager** pelo menu de aplicativos ou execute `fbs-screen-manager`. Para remover o pacote:

```sh
sudo apt remove fbs-screen-manager
```

## Testes

```powershell
npm test
```

Os testes cobrem a fila e os controles, perda e retorno da saída, cancelamento das tentativas de reconexão, pareamento e permissões, WebSocket e leitura de vídeo por intervalos.

Para testar o fluxo completo no Windows com Edge e as dependências de `mobile/` instaladas, rode `node tests/desktop-live.e2e.cjs`. O teste abre o Electron com perfil temporário, simula duas telas e opera o telefone e a TV por navegadores separados. A variável opcional `FBS_QA_VIDEO` aceita o caminho de um MP4 para verificar a retomada de vídeo.

## Manual de usuario

Veja o tutorial completo em [MANUAL_USUARIO.md](MANUAL_USUARIO.md).

## Trocar o logo

O logo exibido na tela de saida fica em:

```text
src/logo-bs.png
```

Substitua esse arquivo por outro PNG com o mesmo nome. Depois rode `npm start` para testar, `npm run package` para gerar o instalador Windows ou `npm run package:linux` para gerar as distribuições Linux.

## O que nao vai para o GitHub

Este repositorio ignora dependencias, builds e estado local de ferramentas:

- `node_modules/`
- `dist/`
- `.memory/`
- `.maestro/`
- `.agents/`, `.claude/`, `.cursor/`
- arquivos `.env` e logs

Esses arquivos sao locais e podem ser recriados quando necessario.
