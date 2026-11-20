# Manual do Usuario - Screen Manager

Este manual explica como instalar, operar e personalizar o Screen Manager no Windows e no Linux.

## 1. Para que serve

O Screen Manager controla uma tela de saida, como projetor, TV ou telao, a partir de uma janela de controle. Na janela principal voce organiza a fila de midias. Na tela de saida o publico ve somente a imagem, video, blackout ou logo.

## 2. Preparar o computador

1. Conecte o projetor, TV ou telao ao computador.
2. No Windows, configure as telas como **Estender estas telas**. No Linux, escolha o modo de telas estendidas nas configurações de monitores do ambiente gráfico.
3. Abra o aplicativo.
4. Se houver uma segunda tela, a saida abre nela em tela cheia.
5. Se houver apenas uma tela, a saida abre em janela para teste.

## 3. Adicionar midias

Voce pode adicionar midias de duas formas:

- Clique em **Adicionar midia**.
- Arraste arquivos para dentro da janela do app.

Formatos aceitos:

- Imagens: PNG, JPG, JPEG, WEBP, GIF.
- Videos: MP4, WEBM.

Importante: o app referencia o caminho original do arquivo. Depois de adicionar uma midia, nao mova ou renomeie o arquivo no computador.

## 4. Organizar a fila

Cada linha da fila representa uma midia.

Voce pode:

- Arrastar a linha para cima ou para baixo.
- Usar os botoes de seta para subir ou descer.
- Dar duplo clique em uma linha para colocar esse item no ar.
- Remover um item com o botao `X`.
- Ajustar duracao, transicao e horario.

## 5. Controles ao vivo

Na lateral direita ficam os controles principais:

- **Anterior**: volta para a midia anterior.
- **Play/Pausar**: inicia ou pausa a exibicao.
- **Proximo**: avanca para a proxima midia.
- **Bloquear item no ar**: impede que o app avance automaticamente quando a duracao acabar ou quando chegar um horario agendado.
- **Loop ligado/desligado**: define se a playlist volta para o primeiro item ao chegar no fim.
- **Blackout**: deixa a tela de saida preta.
- **FBS Logo**: mostra a tela de logo.

## 6. Duracao dos itens

O campo **Duracao** controla por quantos segundos a midia fica no ar.

- Imagens normalmente usam uma duracao fixa.
- Videos tambem podem ter duracao definida.
- Se a duracao chegar ao fim e o item nao estiver bloqueado, o app avanca automaticamente.
- Se **Bloquear item no ar** estiver ligado, o item atual permanece no ar.

## 7. Loop da playlist

O botao **Loop ligado** faz a fila reiniciar automaticamente quando chega ao ultimo item.

Quando esta em **Loop desligado**, o app para no fim da fila e volta para a tela de logo.

## 8. Regras por horario

Em **Regras por horario**, voce pode configurar periodos com transicoes especificas.

Exemplo:

```text
19:00 ate 20:00 - fade
20:00 ate 21:00 - zoom
```

Essas regras ajudam quando uma apresentacao precisa ter comportamento diferente em momentos especificos do evento.

## 9. Painel de arquivos

O painel **ARQUIVOS** lista os arquivos que estao na fila.

Use:

- **Abrir** para abrir o arquivo no programa padrao do sistema.
- **Pasta** para abrir a pasta onde o arquivo esta salvo.

Isso ajuda a localizar rapidamente uma midia sem procurar manualmente no gerenciador de arquivos.

## 10. Trocar o logo

O arquivo do logo fica em:

```text
src/logo-bs.png
```

Para trocar:

1. Prepare um arquivo PNG novo.
2. Renomeie esse arquivo para `logo-bs.png`.
3. Substitua o arquivo existente em `src/logo-bs.png`.
4. Rode o app com:

```sh
npm start
```

5. Clique em **FBS Logo** e confira na tela de saida.
6. Para gerar um instalador Windows com o novo logo:

```powershell
npm run package
```

No Linux, use `npm run package:linux` para gerar AppImage e deb com o novo logo.

Recomendacao: use PNG com fundo transparente e boa resolucao, por exemplo 1000 px ou mais de largura.

## 11. Gerar e instalar uma distribuição

Depois de qualquer mudança no código ou no logo, gere uma nova distribuição. Para compilar a partir do repositório, use Node.js 20 ou superior e npm.

### Windows

Na raiz do repositório, execute:

```powershell
npm ci
npm run package
```

O comando `npm run package` continua gerando o instalador Windows NSIS. Os arquivos ficam em `dist/`.

Se voce testar um `.exe` antigo, as mudancas recentes nao vao aparecer. Sempre confira a data do arquivo em `dist/`.

### Linux: gerar AppImage e deb

Em um ambiente Linux com interface gráfica compatível com Electron, execute na raiz do repositório:

```sh
npm ci
npm run package:linux
```

Os arquivos ficam em `dist/`, com nomes no padrão `fbs-screen-manager-${version}-${arch}.${ext}`. O pacote inclui `main.js`, `preload.js`, os módulos JavaScript de `desktop/`, `src/`, os assets e a dependência `ws`. O helper PowerShell Miracast é incluído somente no pacote Windows.

O **AppImage é o formato portátil recomendado**: você baixa o arquivo, concede permissão de execução e abre o aplicativo, sem instalar um pacote no sistema. O **deb é destinado a Debian/Ubuntu** e instala o aplicativo no sistema. Escolha o arquivo correspondente à arquitetura do computador.

Para solicitar Windows e Linux juntos, em um ambiente preparado para compilar ambos, use:

```sh
npm run package:all
```

### Linux: executar o AppImage

Abra o terminal na pasta onde está o AppImage. Os exemplos abaixo usam a versão 1.1.0 para x64; substitua o nome conforme a versão e arquitetura do arquivo recebido:

```sh
chmod +x ./fbs-screen-manager-1.1.0-x64.AppImage
./fbs-screen-manager-1.1.0-x64.AppImage
```

Guarde o AppImage em uma pasta fixa para abri-lo novamente. Para remover essa distribuição portátil, feche o aplicativo e exclua o arquivo AppImage.

### Debian/Ubuntu: instalar e remover o deb

Na pasta onde está o pacote deb, execute, ajustando o nome ao arquivo recebido:

```sh
sudo apt install ./fbs-screen-manager-1.1.0-x64.deb
```

Abra **FBS Screen Manager** no menu de aplicativos ou execute:

```sh
fbs-screen-manager
```

Para remover o pacote instalado:

```sh
sudo apt remove fbs-screen-manager
```

## 12. Solucao de problemas

### Arrastei uma midia e ela nao entrou

Verifique se o formato e suportado: PNG, JPG, JPEG, WEBP, GIF, MP4 ou WEBM.

### Um item sumiu ou nao abre

O arquivo pode ter sido movido ou renomeado no computador. Remova o item da fila e adicione novamente.

### A tela nao abriu no projetor

Confira se o Windows está em **Estender estas telas** ou se o Linux está configurado para telas estendidas. Verifique se o sistema operacional reconhece o projetor. No painel, abra **Conexões** para ver a última saída e o andamento das tentativas. Use o seletor **Saída** para mudar o destino durante o evento.

### O logo nao mudou

Confirme se o arquivo novo foi salvo exatamente como `src/logo-bs.png`. Se estiver usando uma versão empacotada, gere uma nova com `npm run package` no Windows ou `npm run package:linux` no Linux.

### Testei o exe e nada mudou

O exe provavelmente e antigo. Rode `npm start` para testar o codigo fonte atual ou gere um novo instalador com `npm run package`.

## 13. Dicas para evento

- Desative suspensao de energia do computador.
- Desative notificacoes.
- Teste todos os videos antes do evento.
- Prefira MP4 H.264 para maior compatibilidade.
- Mantenha as midias em uma pasta fixa.
- Leve backup da pasta de midias.
- Teste blackout, logo, loop e bloqueio antes de abrir o evento.

## 14. Reconectar a TV

Conecte a TV por HDMI ou DisplayPort e configure as telas no modo estendido. No Windows, também é possível conectar uma TV sem fio por **Windows + K** e selecionar **Estender** em **Windows + P**. No Linux, configure os monitores nas opções de tela do ambiente gráfico. Escolha a TV no campo **Saída**. O aplicativo memoriza a tela usada, inclusive entre aberturas.

Para HDMI/DisplayPort no Windows e no Linux, o aplicativo usa a API `screen` do Electron para identificar monitores e acompanhar desconexão e reconexão. Se a tela cair, o painel conserva o item, o tempo e o bloqueio. A fila e os horários aguardam a recuperação. Quando o sistema operacional reconhece a mesma tela, o aplicativo volta a colocá-la no ar e retoma a reprodução a partir do ponto da queda. Um vídeo que já estava pausado continua pausado. Blackout e logo também são preservados. Você pode mudar a fila e escolher outra saída enquanto aguarda. O sinal depende de o cabo, a entrada e a TV estarem disponíveis e de o sistema reconhecer o monitor.

### Miracast no Windows

O helper PowerShell Miracast é exclusivo do Windows e só acompanha a distribuição Windows. Com uma TV identificada como Miracast, o aplicativo verifica o rádio Wi-Fi e procura o nome da última TV no painel **Transmitir** do Windows. As tentativas continuam, com intervalos progressivos, enquanto o aplicativo estiver aberto. Se o nome anunciado for diferente do nome do monitor, informe-o em **Conexões → Nome da TV no painel Transmitir do Windows**. Dê nomes distintos às TVs do evento. Alguns receptores pedem confirmação na própria TV. O painel automático reconhece os nomes do Windows em português e inglês. [Projeção sem fio no Windows](https://support.microsoft.com/en-gb/windows/hardware/display-graphics/screen-mirroring-and-projecting-to-your-pc-or-wireless-display?nochrome=true)

### Saída sem fio no Linux

O pacote Linux não inclui o helper Miracast do Windows. A disponibilidade de uma saída sem fio depende do sistema, dos drivers e das ferramentas utilizadas. Não há garantia de que essa saída tenha o mesmo backend Miracast ou a mesma reconexão automática do Windows. Se o sistema expuser a saída como monitor, sua identificação pelo aplicativo depende da API `screen` do Electron. Para uma TV com navegador, a saída `/tv` descrita na seção 16 usa a rede IP e funciona de forma independente do helper Miracast.

## 15. Operar pelo iPhone

1. Ligue o computador e o iPhone à rede do evento. O PC também pode usar cabo de rede. Em **Conexões**, clique em **Ativar acesso pelo celular e TV**.
2. Abra no Safari o endereço exibido pelo PC, por exemplo `http://192.168.1.20:8790`. Digite os oito dígitos de **Controle do celular**. Cada código vale por dez minutos e pareia um navegador. **Gerar novos códigos** permite adicionar outro aparelho.
3. Use o painel para enviar mídias, editar a fila e os horários, colocar um item no ar, pausar, bloquear, aplicar blackout ou exibir a logo. As alterações aparecem no computador e nos outros controles. O PC precisa permanecer aberto durante o evento.
4. Para voltar pelo ícone do iPhone, use **Compartilhar → Adicionar à Tela de Início** no Safari quando disponível. O navegador guarda o pareamento por até 30 dias. **Desativar acesso remoto** no PC encerra as conexões e invalida os pareamentos.

Cada arquivo enviado pode ter até 256 MB. Use PNG, JPEG, GIF, WEBP, MP4 ou WEBM. Para fotos HEIC ou vídeos MOV do iPhone, exporte uma cópia em JPEG ou MP4 compatível com a TV. Se o painel não abrir, confira se os aparelhos estão na mesma rede e se a rede de convidados permite comunicação entre eles. Se o Windows pedir acesso de rede, autorize o aplicativo para a rede privada do evento.

## 16. Exibir diretamente na Android TV

Abra o navegador da TV e digite o endereço do PC com `/tv` no final, por exemplo `http://192.168.1.20:8790/tv`. Digite o código **Exibição na TV** e use **Tela cheia** com o controle remoto. A TV recebe somente a saída da apresentação. Após uma queda de rede, a página tenta se conectar novamente e busca a mídia, o ponto de reprodução e o estado atuais do PC.

Salve o endereço nos favoritos. Em navegadores que oferecem instalação de aplicativos web, abra o endereço por HTTPS e use **Instalar** ou **Adicionar à tela inicial**. A opção depende do navegador da TV. A saída também funciona como página comum em navegadores com WebSocket e suporte aos formatos da apresentação. [Instalação de aplicativos web](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

## 17. Controlar o evento de outra cidade

### Relay online (recomendado para acesso web)

O repositório inclui um servidor de retransmissão em `remote/`. Hospede a
pasta em um serviço Node.js com HTTPS/WebSocket, por exemplo Render, Railway,
Fly.io ou um VPS. No painel do Screen Manager, em **Conexões**, informe a URL
do relay e clique em **Criar sessão remota**. O aplicativo gera uma sala,
conecta o computador por uma conexão de saída e mostra o token do controle
móvel. O celular pode estar em outra cidade e não precisa estar na mesma rede.

O projetor continua conectado ao computador do evento. Se a internet cair, o
palco local continua funcionando e a conexão remota tenta voltar sozinha.
Configure `REMOTE_REQUIRE_TOKENS=true` no servidor e use HTTPS/WSS em produção.

Uma opção é conectar o PC do evento e o iPhone à mesma rede privada Tailscale. Com o acesso remoto habilitado no Screen Manager, execute no PC do evento:

```powershell
tailscale serve --bg http://127.0.0.1:8790
```

Abra no telefone a URL HTTPS que o Tailscale mostrar e pareie usando o código de controle do PC. O mesmo endereço com `/tv` atende um receptor da rede privada. Um túnel próprio também pode encaminhar a raiz de um endereço HTTPS para a porta 8790. Ele precisa encaminhar WebSocket, uploads e requisições HTTP de mídia com o cabeçalho `Range`. Preserve o cabeçalho `Host` ou encaminhe `X-Forwarded-Host` por um proxy no próprio computador. [Comando Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve)

O telefone usa a rede IP para controlar a sessão. A projeção Miracast usa Wi-Fi Direct. O estado do Bluetooth é independente desses dois caminhos. [Microsoft sobre o transporte Miracast](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/wireless-displays--miracast-)
