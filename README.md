# Screen Manager

Aplicativo Windows para operar imagens e vídeos em eventos. O computador mantém a fila e os horários. O operador pode usar o painel do PC ou o navegador do iPhone, e a TV pode receber a apresentação por cabo, Miracast ou pelo próprio navegador. A operação na rede do evento funciona sem internet.

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

No painel do computador, abra **Conexões → Ativar acesso pelo celular e TV**. No iPhone, abra no Safari um dos endereços exibidos e digite o código de controle. Na Android TV, abra o mesmo endereço com `/tv` no final e use o código de exibição. Os aparelhos podem usar Wi-Fi ou Ethernet na mesma rede. O manual também explica o acesso de outra cidade por uma rede privada. [Manual do usuário](MANUAL_USUARIO.md#14-reconectar-a-tv)

## Requisitos

- Windows 10 ou 11.
- Node.js 20 ou superior.
- npm.

## Instalar e rodar em desenvolvimento

```powershell
npm install
npm start
```

## Gerar instalador

```powershell
npm run package
```

O instalador e a versao empacotada serao criados em `dist/`.

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

Substitua esse arquivo por outro PNG com o mesmo nome. Depois rode `npm start` para testar ou `npm run package` para gerar um novo instalador.

## O que nao vai para o GitHub

Este repositorio ignora dependencias, builds e estado local de ferramentas:

- `node_modules/`
- `dist/`
- `.memory/`
- `.maestro/`
- `.agents/`, `.claude/`, `.cursor/`
- arquivos `.env` e logs

Esses arquivos sao locais e podem ser recriados quando necessario.
