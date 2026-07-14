# Screen Manager

Aplicativo desktop local para controlar imagens e videos em um segundo monitor, projetor ou telao. Ele roda em Windows com Electron, nao precisa de internet, login ou servidor, e foi pensado para eventos, cultos, apresentacoes e operacao de midia ao vivo.

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

O teste automatizado cobre os principais fluxos da tela de controle: foco dos campos, arrastar e soltar, loop, bloqueio, painel de arquivos e reordenacao.

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
