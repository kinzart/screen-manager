# FBS Studio web

Painel central para operar apresentações pela internet, com sessões de conteúdo e receptores independentes. Um único servidor atende o celular, notebooks Windows/Linux, TVs e projetores Android. Cada receptor abre `/tv` e recebe apenas o conteúdo da sua conexão no mapa.

## Usar a versão hospedada

1. No celular ou computador, abra [FBS Studio](https://screen-manager.kinzart.com.br/studio) e entre com a senha do operador.
2. Crie um espaço para o evento e uma sessão. Na Biblioteca, envie imagens ou vídeos; selecione a sessão e adicione as mídias à fila.
3. No projetor, TV ou notebook de exibição, abra [Tela FBS](https://screen-manager.kinzart.com.br/tv). No aplicativo Android **Tela FBS**, altere o endereço do receptor para esse mesmo endereço HTTPS.
4. Confira o código de seis dígitos da tela em **Parear** no painel e aprove o aparelho. O QR da tela abre o painel no código correto; a aprovação exige a senha do operador.
5. Puxe um fio da saída da sessão para a entrada de uma tela. Uma sessão pode alimentar várias telas. Uma tela também pode ser ligada à entrada de outra para espelhar sua sessão. O sistema bloqueia ciclos.
6. Selecione a sessão para reproduzir, pausar, mudar de item, mover a posição, mostrar tela preta ou logotipo. Para controlar pelo celular sem arrastar fios, selecione a tela e use **Origem da tela**.

Cada aparelho precisa acessar a internet. Eles podem estar em cidades e redes diferentes. Os notebooks também podem funcionar como receptores pelo navegador em tela cheia. A biblioteca desta versão fica no servidor web; arquivos e filas do aplicativo Electron local precisam ser enviados ao Studio para essa operação pela internet.

O receptor guarda seu pareamento por até 30 dias e tenta retomar a conexão automaticamente. Durante uma queda de internet, mantém a mídia que conseguiu carregar. Quando a rede volta, busca o estado atual da sessão. O painel distingue tela conectada, comando aguardando confirmação e reprodução confirmada pelo receptor. O armazenamento do navegador deve permanecer habilitado.

## Executar um servidor próprio

Requer Node.js 22 ou superior. A distribuição hospedada usa Node.js 24. Execute na pasta `web`:

```sh
npm ci
export FBS_ADMIN_PASSWORD='substitua-por-uma-senha-longa-e-exclusiva'
export FBS_PUBLIC_ORIGIN='http://localhost:8788'
npm start
```

No PowerShell, configure as mesmas variáveis com `$env:FBS_ADMIN_PASSWORD = '...'` e `$env:FBS_PUBLIC_ORIGIN = 'http://localhost:8788'`.

Para produção, configure `NODE_ENV=production`, `FBS_PUBLIC_ORIGIN=https://seu-dominio` e `FBS_DATA_DIR` com um caminho absoluto privado, **fora da aplicação, de `public_html` e de `hbuilds`**. A senha deve ter pelo menos 16 caracteres. O servidor usa `PORT` fornecida pela hospedagem, ou 8788. Na Hostinger, configure `hosting.js` como arquivo de entrada: o carregador importa o arquivo e não o executa como `require.main`. Publique somente o conteúdo desta pasta; sessões e arquivos privados nunca entram no arquivo de publicação.

O serviço usa um processo Node.js e uma fila serial de gravações atômicas. Faça backup do diretório inteiro indicado por `FBS_DATA_DIR`, com o serviço parado, para preservar `state.json`, mídias e envios. Não execute duas instâncias sobre o mesmo diretório. A senha fica nas variáveis de ambiente; os cookies e desafios são guardados como hashes.

Na Hostinger Web/Cloud, o controle usa HTTPS a cada segundo, pois esse serviço não aceita WebSockets de entrada. Os arquivos são enviados em blocos de 2 MB, com retomada do último bloco confirmado. Cada arquivo pode ter até 512 MB e cada espaço até 2 GB, incluindo envios ainda pendentes. Formatos aceitos: PNG, JPEG, WebP, GIF, MP4 e WebM. A reprodução de um codec específico depende do navegador do receptor; MP4 com H.264 costuma ser a opção mais compatível com aparelhos Android.

## Verificação

```sh
npm ci
npm test
npm run build
```

Os testes HTTP verificam autenticação/CSRF, isolamento de telas, pareamento, conexões circulares, versões, reprodução, ranges de mídia, upload interrompido, quota, reinício e recuperação de uma queda durante o commit. O teste de navegador na raiz, `node tests/studio.e2e.cjs`, usa o Playwright de `mobile/node_modules` e Edge para operar duas telas e um painel, incluindo vídeo, desconexão e celular de 375 px.
