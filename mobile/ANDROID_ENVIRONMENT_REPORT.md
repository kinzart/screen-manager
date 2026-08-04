# Relatório de Ambiente Android

Gerado na Etapa 7, no ambiente de desenvolvimento atual (Windows, Git Bash).
**Nenhuma ferramenta foi instalada automaticamente** — este relatório é
apenas diagnóstico.

## Ferramentas verificadas

| Ferramenta | Comando | Resultado |
|---|---|---|
| JDK (runtime) | `java -version` | **ausente** — `command not found` |
| JDK (compilador) | `javac -version` | **ausente** — `command not found` |
| Variável `ANDROID_HOME` | `echo $ANDROID_HOME` | **não definida** |
| Variável `ANDROID_SDK_ROOT` | `echo $ANDROID_SDK_ROOT` | **não definida** |
| ADB | `adb version` | **ausente** — `command not found` |
| SDK Manager | `sdkmanager --version` | **ausente** — `command not found` |
| Gradle wrapper do projeto | `mobile/android/gradlew.bat` | **presente** (gerado por `npx cap add android` na Etapa 0) |
| Espaço em disco (unidade `D:`) | `df -h` | 252G livres de 932G (73% usado) — suficiente |

## Versões exigidas pelo projeto gerado

Extraídas de `mobile/android/variables.gradle` e
`mobile/android/gradle/wrapper/gradle-wrapper.properties`:

- `compileSdkVersion`: **36**
- `targetSdkVersion`: **36**
- `minSdkVersion`: **24**
- Gradle (wrapper): **8.14.3**
- Cordova Android (ponte usada pelo Capacitor): **14.0.1**

Essas versões implicam a necessidade de, no mínimo, **Android SDK
Platform 36** e **Android SDK Build-Tools** compatível instalados via
Android Studio/`sdkmanager`.

## Componentes que devem ser instalados pelo Android Studio

Nenhum destes foi instalado nesta sessão (fora do escopo autorizado):

1. **JDK 17+** (requisito do Android Gradle Plugin usado por Capacitor 8/
   Cordova Android 14).
2. **Android SDK Command-line Tools**.
3. **Android SDK Platform 36** (`platforms;android-36`).
4. **Android SDK Build-Tools** (versão compatível com compileSdk 36 —
   tipicamente `36.0.0` ou superior).
5. **Android SDK Platform-Tools** (fornece `adb`).
6. (Opcional, para emulador) **Android Emulator** + uma imagem de sistema
   (`system-images;android-36;...`).

## Variáveis de ambiente esperadas

Após instalar o Android Studio/SDK, definir (Windows, `setx` ou painel de
variáveis de ambiente do sistema — **fora do escopo desta automação**):

```
JAVA_HOME=<caminho do JDK, ex.: C:\Program Files\Android\Android Studio\jbr>
ANDROID_HOME=<caminho do SDK, ex.: C:\Users\<usuário>\AppData\Local\Android\Sdk>
ANDROID_SDK_ROOT=<mesmo valor de ANDROID_HOME>
PATH+=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin
```

## Comandos que deverão ser repetidos após instalar o ambiente

Executar, nesta ordem, dentro de `mobile/`:

```bash
npm test
npm run build
npx cap sync android
npx cap doctor
mobile/android/gradlew.bat --version
mobile/android/gradlew.bat clean assembleDebug
```

## Checklist para conectar um aparelho físico

1. Ativar **Opções do desenvolvedor** no Android (tocar 7x em "Número da
   versão" em Configurações > Sobre o telefone).
2. Ativar **Depuração USB** dentro de Opções do desenvolvedor.
3. Conectar o aparelho por cabo USB ao computador.
4. Autorizar a depuração USB no prompt exibido no próprio aparelho
   (aceitar a impressão digital RSA do computador).
5. Confirmar detecção: `adb devices` deve listar o device com status
   `device` (não `unauthorized` nem `offline`).
6. (Alternativa sem cabo) `adb pair`/`adb connect` via Wireless Debugging,
   se o Android for 11+.

## Caminho esperado do APK debug

Após um build bem-sucedido (`gradlew.bat assembleDebug`):

```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## Conclusão

Ambiente Android **ausente** neste computador. Nenhuma etapa de build/
instalação/execução em device foi tentada além do diagnóstico acima —
consistente com a proibição de instalar Android Studio/JDK/SDK
automaticamente.
