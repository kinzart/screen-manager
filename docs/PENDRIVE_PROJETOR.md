# Entrega por pendrive: notebook, projetor HDMI e projetor Android

O pendrive deve carregar artefatos diferentes conforme o tipo de projetor.

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

O nome HY300 cobre revisões diferentes. Antes de gerar o APK definitivo,
confira no projetor **Configurações → Sobre** a versão do Android e, se
possível, a arquitetura/ABI. Há variantes antigas com Android 11 e espaço de
usuário ARM de 32 bits e variantes mais novas com chip H726/Android 14; um APK
arm64 pode não instalar na variante 32-bit. A instalação offline por USB é um
fluxo suportado pela própria linha HY300, mas deve ser feita pelo gerenciador
de arquivos do aparelho. [Orientação oficial da Magcubic](https://www.magcubic.com/pages/official-statement-regarding-certain-apk-files-on-magcubic-hy300-series-products)

Para identificar a ABI com depuração de rede/ADB ativada, use no notebook:

```bash
adb connect IP_DO_PROJETOR:5555
adb shell getprop ro.product.cpu.abi
adb shell getprop ro.build.version.release
```

O primeiro APK de teste será gerado para a ABI compatível detectada. Não
instale firmware de outro HY300: as revisões 713 e 726 não são intercambiáveis.

Nesse caso o projetor pode executar um APK. O APK é gerado pelo projeto Capacitor em `mobile/` e é um aplicativo Android separado do Electron. Para uma primeira instalação de teste:

```bash
cd mobile
npm ci
npm run build
npx cap sync android
./android/gradlew assembleDebug
```

No Windows, use `android\\gradlew.bat assembleDebug`. O APK de teste aparece em:

```text
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

O repositório também possui o workflow **Android APK** em GitHub Actions. Em
**Actions → Android APK → Run workflow**, execute o build no Ubuntu e baixe o
artefato `fbs-screen-manager-android`. Isso evita instalar JDK e Android SDK no
notebook de operação.

Copie o APK para o pendrive, abra-o no projetor e autorize a instalação de fontes desconhecidas. Para distribuição pública ou instalação por loja, gere um APK/AAB assinado; `assembleDebug` é somente para teste.

O APK atual tem launcher Android comum. Antes de tratá-lo como aplicativo Android TV final, ainda é necessário validar no dispositivo e, se desejado, adicionar launcher Leanback, banner de TV, navegação completa por controle remoto/D-pad, layout horizontal e política de suspensão da tela. Um projetor Android que permite sideload pode executar o APK mesmo sem aparecer na grade de apps da TV.

O APK não transforma um projetor HDMI em Android. Se o projetor não tiver sistema Android, use o aplicativo Windows/Linux no notebook.

## Controle remoto e modo online

O APK pode trabalhar como controlador/apresentador local e possui adaptador para relay remoto, mas o relay precisa estar publicado e configurado com URL de servidor, sala e token. Levar apenas o APK no pendrive não cria o servidor nem substitui o computador que controla a saída HDMI.

Para o evento offline, mantenha o notebook com o Electron como fonte principal e use a página `/tv` ou o APK somente quando o projetor Android estiver conectado à rede local. Para o evento remoto, valide o relay antes de sair: login, token, expiração da sessão, reconexão e revogação.

## Estrutura recomendada do pendrive

```text
FBS-Screen-Manager/
├── windows/
│   └── FBS Screen Manager Setup 1.1.0.exe
├── linux/
│   ├── fbs-screen-manager-1.1.0-x64.AppImage
│   └── fbs-screen-manager-1.1.0-x64.deb
├── android/
│   └── app-debug.apk
├── docs/
│   ├── README.txt
│   ├── PROJETOR_LUBUNTU.md
│   └── PENDRIVE_PROJETOR.md
└── checksums.txt
```

Use `node scripts/make-usb-bundle.mjs <pasta-do-pendrive>` para montar essa estrutura a partir dos artefatos existentes. O script não fabrica um APK ou instalador ausente: ele informa exatamente o que está faltando.

## Checklist antes de sair

- [ ] O instalador Windows abre em um notebook limpo.
- [ ] O AppImage tem permissão de execução e abre no Lubuntu.
- [ ] O `.deb` instala e desinstala em Debian/Ubuntu de teste.
- [ ] O APK instala no projetor Android e abre em orientação horizontal.
- [ ] O projetor HDMI aparece como segunda tela.
- [ ] Uma imagem e um MP4 foram exibidos.
- [ ] O cabo HDMI foi removido e reconectado durante a apresentação.
- [ ] O pareamento local e, quando aplicável, o relay remoto foram testados.
- [ ] Os hashes de `checksums.txt` foram conferidos depois de copiar para o pendrive.
