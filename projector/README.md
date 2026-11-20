# Tela FBS — receptor Android nativo

O **Tela FBS** é o APK leve do receptor, mantido em `projector/`. Ele abre a exibição do notebook em uma WebView do Android. O projeto Capacitor em `mobile/` é o **editor mobile**, um aplicativo separado; seus APKs não substituem o receptor.

## Plataforma e navegação

- Application ID: `br.com.kinzart.fbsprojector`.
- Android mínimo: Android 7.0 / API 24.
- Target SDK: API 34.
- APK universal para sistemas de 32 e 64 bits, sem bibliotecas nativas `.so`; utiliza a WebView do sistema.
- Orientação horizontal (`landscape`), com entradas de launcher Android comum e Android TV/Leanback.
- Operação por controle remoto: D-pad para navegação, OK para confirmar, Voltar para retornar e Menu para configurar o endereço.
- Mantém o endereço escolhido e os cookies de pareamento entre aberturas e tenta reconectar quando a conexão cai.

A compatibilidade da WebView, a instalação e os comandos do controle remoto precisam ser validados no modelo físico do projetor. Um APK universal não elimina diferenças entre revisões do HY300 K.

## Escopo do primeiro incremento

O primeiro incremento exibe a página `/tv` de **um notebook por vez**, com o desktop FBS aberto no Linux ou Windows e os dois aparelhos na mesma rede local. O notebook continua responsável pela apresentação e precisa permanecer aberto durante o uso.

Use o endereço LAN do notebook, por exemplo `http://<ip-do-notebook>:<porta>/tv`. Na página `/tv`, informe o código de **Exibição na TV**, com oito dígitos, mostrado no notebook. Telefones usam o código de **Controle** e a página `/`; os dois fluxos não são intercambiáveis. O pareamento fica salvo por até 30 dias, salvo revogação no notebook.

A página `/display` continua disponível no relay legado. Isso não representa uma promessa de sincronização online de mídia local nem de operação com vários notebooks. O modo multi-dispositivo/QR ainda está pendente. O primeiro teste do MVP deve ocorrer pela LAN.

## Endereço padrão

A opção de build `-DefaultUrl` define somente o endereço inicial em um asset local empacotado no APK. Ela não provisiona um servidor nem cria pareamento. Use **Menu** no receptor para alterar o endereço; o app mantém a URL escolhida e os cookies.

## Build no Windows

São necessários o Android SDK com plataforma API 34 e Build Tools, e o JDK 21. Na raiz do projeto:

```powershell
powershell -File scripts/build-projector.ps1 -SdkRoot <sdk> -JavaHome <jdk21>
```

Para incluir um endereço inicial:

```powershell
powershell -File scripts/build-projector.ps1 -SdkRoot <sdk> -JavaHome <jdk21> -DefaultUrl "http://<ip-do-notebook>:<porta>/tv"
```

O build usa `aapt2`, `javac`, `d8`, `zipalign` e `apksigner`, com as ferramentas Android fornecidas pelo SDK e o compilador Java pelo JDK. Não utiliza Gradle nem Node.js. Não confunda esse processo com o build Capacitor de `mobile/`.

O arquivo de distribuição desta versão é `fbs-tela-0.1.0.apk`. Utilize o APK final assinado indicado pelo build. `resources.apk`, `unsigned.apk`, `aligned.apk` e diretórios temporários `build-<guid>` são intermediários e não devem ir para o pendrive.

## Assinatura e atualizações

Use uma JKS local persistente. O diretório indicado por `SigningDirectory` deve permanecer ignorado pelo Git. Guarde um backup privado da JKS e dos dados necessários para utilizá-la **fora do Git e fora do pendrive público**. A JKS não é um arquivo de distribuição.

Para permitir atualizações sem desinstalar, preserve o application ID e a mesma chave de assinatura. Antes de cada nova versão, aumente `android:versionCode` e `android:versionName` no `AndroidManifest.xml` do receptor e mantenha o nome do APK coerente com a versão.

No projetor, abra o APK pelo gerenciador de arquivos e instale como aplicativo normal. Nas próximas versões, escolha **Atualizar**, sem desinstalar. Não se trata de firmware.

## Entrega e validação

Para o receptor, distribua somente o APK final assinado, as instruções e o checksum SHA-256. Preserve os arquivos existentes no pendrive e não o formate. Consulte `docs/PENDRIVE_PROJETOR.md` para o roteiro de instalação e teste.

A validação física no HY300 K permanece pendente. Antes de usar em evento, confira instalação, atualização, launcher, orientação, D-pad/OK/Voltar/Menu, pareamento, persistência da URL e dos cookies e reconexão na rede local.
