# Entrega por pendrive: notebook, projetor HDMI e projetor Android

O pendrive deve carregar artefatos diferentes conforme o tipo de projetor. Preserve todo o conteúdo existente: não formate o dispositivo e não apague arquivos do usuário.

## Escolha do pacote correto

### Projetor HDMI/DisplayPort simples

Esse projetor não executa aplicativos. Ele funciona como uma tela externa:

1. Instale o Screen Manager no **notebook**.
2. Conecte o notebook ao projetor por HDMI/DisplayPort.
3. Configure o Lubuntu/Windows para estender as telas.
4. Abra o aplicativo no notebook e escolha a saída do projetor.

Leve no pendrive um destes arquivos:

- Windows: `FBS Screen Manager Setup *.exe`;
- Linux: `fbs-screen-manager-*.AppImage` (recomendado) ou `*.deb` para Debian/Ubuntu.

O projetor não precisa de internet, Git, Node.js ou Android para esse modo.

### Projetor Android / Android TV

#### Caso HY300 K

O receptor é o **Tela FBS**, APK nativo leve de `projector/`. Para esta versão, o arquivo de instalação é **`fbs-tela-0.1.0.apk`**, assinado. Ele não é firmware e não é o editor mobile Capacitor de `mobile/`.

O nome HY300 cobre revisões diferentes. Confira em **Configurações → Sobre** a versão do Android. O Tela FBS exige Android 7.0/API 24 ou superior, tem target API 34 e utiliza a WebView do sistema. O APK não contém bibliotecas `.so` e atende sistemas de 32 e 64 bits, mas a compatibilidade da WebView e do controle remoto ainda precisa ser validada no aparelho.

Não instale firmware de outro HY300: as revisões 713 e 726 não são intercambiáveis. A instalação do APK por USB usa o gerenciador de arquivos do aparelho, como uma instalação normal de aplicativo. [Orientação oficial da Magcubic](https://www.magcubic.com/pages/official-statement-regarding-certain-apk-files-on-magcubic-hy300-series-products)

Para instalar:

1. Copie o APK final assinado, as instruções e o checksum para uma pasta própria no pendrive, preservando os demais arquivos.
2. Conecte o pendrive ao projetor e abra `fbs-tela-0.1.0.apk` no gerenciador de arquivos.
3. Se solicitado, permita a instalação de fontes desconhecidas para esse gerenciador e conclua a instalação.
4. Abra **Tela FBS** pelo launcher Android comum ou Android TV/Leanback.
5. Use D-pad e OK para navegar, Voltar para retornar e **Menu** para configurar o endereço do notebook.

Nas próximas versões, abra o novo APK e escolha **Atualizar**, sem desinstalar. A atualização exige o mesmo application ID (`br.com.kinzart.fbsprojector`), a mesma chave de assinatura e `versionCode` maior. O responsável pelo build também deve aumentar `versionName` no Manifest.

O endereço pré-configurado no APK vem somente de um **asset local com o valor padrão inicial**. Ele não configura um servidor nem faz o pareamento automaticamente. Para mudar de notebook ou endereço, use **Menu**; o receptor mantém a URL escolhida e os cookies.

A JKS e o diretório privado de assinatura (`SigningDirectory`, ignorado pelo Git) ficam fora do pacote. Guarde o backup da assinatura fora do Git e fora do pendrive público, pois ela será necessária para futuras atualizações.

O build Windows e os requisitos do SDK/JDK estão em `projector/README.md`, copiado para o bundle como `docs/TELA_FBS.md`. Esse build não depende de Gradle nem de Node.js.

**A validação física no HY300 K está pendente.** Este guia não declara que o APK já foi instalado ou testado no aparelho.

O APK não transforma um projetor HDMI em Android. Se o projetor não tiver sistema Android, use o aplicativo Windows/Linux no notebook.

## Primeiro teste do MVP: rede local

O primeiro incremento usa **um notebook por vez**, Linux ou Windows, como fonte da apresentação. O **desktop FBS deve permanecer aberto**. O notebook e o projetor Android precisam estar na mesma rede local; internet não substitui essa conexão LAN.

1. Abra o desktop FBS no notebook e prepare a apresentação.
2. No Tela FBS, configure o endereço LAN da página `/tv` do notebook, por exemplo `http://<ip-do-notebook>:<porta>/tv`.
3. No notebook, obtenha o código de **Exibição na TV**, com **oito dígitos**, e informe-o na página `/tv`.
4. Para controlar por telefone, abra a página `/` do notebook e utilize o código de **Controle**. Não use o código de Controle para parear a TV.
5. Teste uma imagem e um vídeo, os comandos do controle remoto e uma queda e retorno da conexão local.

O pareamento fica salvo por até **30 dias**, salvo revogação no notebook. O receptor mantém a URL e os cookies e tenta reconectar, mas o notebook precisa continuar acessível e com o desktop aberto.

O modo multi-dispositivo/QR ainda está pendente. A página `/display` permanece disponível no relay legado; não há promessa de sincronização online de mídias locais nem de operação com vários notebooks. Levar o APK no pendrive não cria um relay nem publica os arquivos do notebook na internet.

## Estrutura recomendada do pendrive

```text
FBS-Screen-Manager/
├── README.txt
├── windows/
│   └── FBS Screen Manager Setup 1.1.0.exe
├── linux/
│   ├── fbs-screen-manager-1.1.0-x64.AppImage
│   └── fbs-screen-manager-1.1.0-x64.deb
├── android/
│   └── fbs-tela-0.1.0.apk
├── docs/
│   ├── README.md
│   ├── MANUAL_USUARIO.md
│   ├── PROJETOR_LUBUNTU.md
│   ├── PENDRIVE_PROJETOR.md
│   └── TELA_FBS.md
└── checksums.txt
```

Na parte Android destinada ao receptor, leve somente o APK final **assinado**, as instruções e o checksum. Não leve fontes, credenciais, JKS ou APKs intermediários (`resources.apk`, `unsigned.apk`, `aligned.apk` ou arquivos de diretórios `build-<guid>`).

O gerador também pode incluir `app-debug.apk`, `app-release.apk` e arquivos AAB encontrados nos outputs Android de `mobile/`. Eles pertencem ao **editor mobile**, não ao Tela FBS. `app-debug.apk` serve para testes do editor; AAB não é o arquivo de instalação por USB do receptor.

## Montagem sem alterar o pendrive diretamente

Gere primeiro uma pasta local de conferência, na raiz do projeto:

```bash
node scripts/make-usb-bundle.mjs dist/usb-bundle
```

O script não fabrica APKs ou instaladores ausentes e não verifica a assinatura Android: use o APK final assinado pelo build. Ele informa os itens faltantes. `--allow-missing` permite montar um pacote incompleto para conferência; não significa que a entrega esteja pronta.

Use uma pasta de saída nova para cada entrega. O script não apaga arquivos e recusa sobrescrever arquivos existentes com conteúdo diferente; também não remove intermediários deixados em uma pasta por execuções anteriores. Ele recusa saída direta na unidade `J:`.

Depois de conferir os artefatos, copie a pasta preparada para uma pasta nova no pendrive, sem substituir conteúdo do usuário. Não execute o gerador diretamente em `J:` e não formate o dispositivo. Confira os hashes de `checksums.txt` após a cópia.

## Checklist antes de sair

- [ ] O instalador Windows abre em um notebook limpo, quando incluído.
- [ ] O AppImage tem permissão de execução e abre no Lubuntu, quando incluído.
- [ ] O `.deb` instala e desinstala em Debian/Ubuntu de teste, quando incluído.
- [ ] O APK Tela FBS está assinado; a JKS não está no pendrive.
- [ ] O APK instala no projetor Android e abre em orientação horizontal.
- [ ] Launcher comum/Leanback e D-pad/OK/Voltar/Menu foram conferidos no aparelho.
- [ ] Uma atualização com a mesma assinatura funciona sem desinstalar.
- [ ] O notebook permanece com o desktop aberto durante a exibição.
- [ ] O pareamento `/tv` usa os oito dígitos de Exibição na TV.
- [ ] O telefone usa o código de Controle e a página `/`.
- [ ] Uma imagem e um MP4 foram exibidos pela LAN.
- [ ] A URL e o pareamento persistem após reabrir o receptor.
- [ ] A queda e o retorno da rede local foram testados.
- [ ] O projetor HDMI aparece como segunda tela, quando utilizado.
- [ ] O cabo HDMI foi removido e reconectado durante a apresentação, quando utilizado.
- [ ] Os hashes de `checksums.txt` foram conferidos depois de copiar para o pendrive.
- [ ] O conteúdo anterior do pendrive foi preservado.
