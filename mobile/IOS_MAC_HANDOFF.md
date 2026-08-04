# Handoff — Continuar o Build iOS em um Mac com Xcode

Este documento assume que quem o executa está em um **Mac** com **Xcode**
instalado. Nada aqui foi executado neste computador (Windows, sem Xcode) —
é um roteiro, não um relatório de resultado.

## 0. Requisitos derivados do Capacitor instalado

- `@capacitor/core`/`@capacitor/cli`/`@capacitor/android`: **8.4.2**
  (confirmado em `package.json`/`node_modules`). Para manter consistência
  de versão major/minor, instalar **`@capacitor/ios@8.4.2`** (mesma major.minor
  da CLI e do core — não instalar uma versão major diferente).
- Capacitor 8.x requer Xcode recente (verificar a versão mínima exigida na
  documentação oficial do Capacitor 8 no momento da execução — este
  documento não fixa um número de versão do Xcode porque não pôde ser
  confirmado neste ambiente sem acesso à doc atualizada/Mac real).
- CocoaPods instalado (`sudo gem install cocoapods` ou via Homebrew), exigido
  pelo `ios add` do Capacitor para resolver os pods dos 4 plugins.
- macOS compatível com a versão de Xcode escolhida.
- Conta Apple ID (gratuita já basta para rodar em device próprio via
  "Personal Team", sujeito ao limite de 7 dias de validade do
  provisionamento gratuito).

## 1. Clonar/copiar o projeto

```bash
git clone <url-do-repo> fbs-screen-manager
cd fbs-screen-manager/mobile
# ou, se copiado manualmente (ex.: via AirDrop/pendrive a partir do Windows),
# garantir que node_modules NÃO foi copiado (reinstalar do zero no Mac).
```

## 2. Instalar dependências

```bash
npm install
```

## 3. Rodar a suíte de testes (deve continuar 323/323, sem depender de Mac)

```bash
npm test
```

## 4. Build web

```bash
npm run build
```

## 5. Instalar `@capacitor/ios`

```bash
npm install @capacitor/ios@8.4.2
```

## 6. Adicionar a plataforma iOS

```bash
npx cap add ios
```

Isso gera `mobile/ios/` — **não deve ser gerado neste computador (Windows)**
porque não pode ser validado aqui; só faz sentido gerar em um Mac onde o
próximo passo (`cap sync`/`cap open`) pode de fato ser executado e testado.

## 7. Sincronizar

```bash
npx cap sync ios
```

## 8. Abrir no Xcode

```bash
npx cap open ios
```

## 9. Signing & Capabilities

No Xcode, selecionar o projeto → target `App` → aba **Signing &
Capabilities**:

- **Team**: selecionar o Apple ID pessoal (ou de equipe, se houver).
- **Bundle Identifier**: `br.com.kinzart.fbscreenmanager` (já configurado em
  `capacitor.config.json`, `appId`; conferir que bate no Xcode após o
  `cap sync`).
- Marcar "Automatically manage signing" para simplificar o provisionamento
  com conta pessoal gratuita.

## 10. Selecionar o iPhone 13 como destino de execução

- Conectar o iPhone 13 via cabo (ou parear via Wi-Fi no Xcode, se já
  configurado antes).
- No seletor de destino do Xcode (topo da janela), escolher o iPhone 13
  físico (não o simulador) — o objetivo é validar em device real.

## 11. Trust/Developer Mode no iPhone

Ao instalar o primeiro build de desenvolvimento:

1. iOS pode exigir **"Confiar no desenvolvedor"** em
   Ajustes → Geral → VPN e Gerenciamento de Dispositivo → selecionar o
   perfil do Apple ID usado → Confiar.
2. Em iOS 16+, pode ser necessário ativar **Developer Mode** em
   Ajustes → Privacidade e Segurança → Developer Mode → reiniciar o iPhone
   para confirmar.

## 12. Permissões do Info.plist

Conforme `IOS_COMPATIBILITY_REPORT.md`/`IOS_PLUGIN_MATRIX.md`:

- `pickMedia` (capacitor-file-picker) **não exige** chave de Info.plist para
  o fluxo básico (usa `PHPickerViewController`, fora de processo).
- Nenhuma outra chave de privacidade é exigida pelos plugins atuais
  (`filesystem`, `preferences`, `app`) além do Privacy Manifest (item 13).
- Caso testes no device revelem necessidade de outras chaves (ex.: se optar
  por `pickFiles`/`pickDirectory` com acesso mais amplo no futuro),
  documentar no `IOS_BUILD_REPORT_TEMPLATE.md`.

## 13. Privacy Manifest (`PrivacyInfo.xcprivacy`)

Obrigatório para qualquer submissão futura à App Store (não bloqueia teste
em device próprio via Xcode, mas deve ser feito desde já para não esquecer):

1. Criar `ios/App/App/PrivacyInfo.xcprivacy` (ou usar a extensão oficial do
   Capacitor para VS Code, se disponível).
2. Declarar `NSPrivacyAccessedAPICategoryUserDefaults` (motivo `CA92.1`) —
   exigido por `@capacitor/preferences`.
3. Declarar `NSPrivacyAccessedAPICategoryFileTimestamp` (motivo `C617.1`) —
   exigido por `@capacitor/filesystem`.
4. Ver os exemplos de XML nos READMEs instalados:
   `node_modules/@capacitor/preferences/README.md` e
   `node_modules/@capacitor/filesystem/README.md`.

## 14. Logs do Xcode

Durante o teste no device:

- Usar o painel **Debug Area/Console** do Xcode para capturar logs nativos
  (Swift) e `console.log`/`console.error` do JS (o bridge do Capacitor
  encaminha ambos para o mesmo console do Xcode).
- Filtrar por `[CapacitorMedia]`, `[CapacitorStorage]`,
  `[LifecycleCoordinator]`, `[PresentationPlatform]` — todos os loggers do
  projeto usam esses prefixos (ver `DEFAULT_LOGGER` em cada adapter).

## 15. Validação do picker

Testar especificamente (ver riscos em `IOS_COMPATIBILITY_REPORT.md`, seção 4):

- Selecionar uma foto **tirada agora pela Câmera do iPhone** (formato HEIC
  nativo) — confirmar se `CapacitorMedia.importToLibrary()` aceita ou
  rejeita como `UNSUPPORTED_TYPE`. Se rejeitar indevidamente, será
  necessário adicionar `image/heic`/`image/heif` a `MIME_TO_EXT` em
  `CapacitorMedia.js` (fora do escopo desta etapa — reportar apenas).
- Cancelar o picker sem selecionar nada — confirmar que `isCancelError()`
  reconhece a mensagem real do iOS (hoje só confirmada contra a
  implementação web do plugin).

## 16. Cópia para sandbox

- Confirmar que `FilePicker.copyFile({from, to, overwrite:false})` funciona
  com o `path` real retornado pelo picker no iOS (formato exato do `path`
  no iOS não foi confirmado estaticamente).
- Confirmar que arquivo parcial não permanece em `library/` após uma falha
  simulada (ex.: cancelar o app no meio da cópia, se possível).

## 17. `convertFileSrc`

- Confirmar visualmente que a imagem/vídeo importado é exibido corretamente
  no `PresenterView` via a URL retornada por `Capacitor.convertFileSrc()`.

## 18. Vídeos grandes

- Repetir o teste com um vídeo grande (ex.: >500MB, gravado em 4K) e
  confirmar:
  - Nenhum conteúdo Base64 trafega pelo JS (checar Debug Area/Memory do
    Xcode durante a importação).
  - Memória não cresce de forma incompatível com o tamanho do arquivo.
  - Tempo de cópia é razoável.

## 19. Lifecycle

- Background/foreground reais: apertar o botão lateral, puxar o Centro de
  Controle, receber uma notificação durante apresentação de vídeo —
  confirmar que `LifecycleCoordinator` não duplica escrita nem trava (ver
  risco #4 em `IOS_COMPATIBILITY_REPORT.md`).

## 20. Modo avião

- Ativar modo avião durante uso normal (app não depende de rede, exceto
  para o próprio dev server durante teste local) — confirmar que nada
  quebra.

## 21. Codecs

- Testar vídeos `.mp4`/`.webm` — **iOS/WebKit não suporta `.webm`
  nativamente** (H.264/H.265 em contêiner MP4 é o caminho seguro). Se o
  usuário importar um `.webm`, o `<video>` do WKWebView provavelmente
  falhará silenciosamente ou disparará o evento `error` (já tratado por
  `MediaEngine`/`PresenterView` via `setError()`) — mas isso é uma
  **divergência real de suporte de codec** entre Android (Chromium, suporta
  WebM) e iOS (WebKit, não suporta WebM), a ser documentada no relatório de
  build.

## 22. Orientação

- Testar retrato e paisagem reais no iPhone 13; validar se a ausência de
  `screen.orientation.lock()` no iOS (ver risco #2) é aceitável para o caso
  de uso ou exige solução nativa (Xcode: orientações suportadas por
  `Info.plist`/`UISupportedInterfaceOrientations`, fora do escopo desta
  etapa).

## 23. Wake Lock

- Confirmar que `navigator.wakeLock` funciona na versão real do iOS do
  iPhone 13 (requer iOS 16.4+) durante apresentação de vídeo/imagem longa.

---

Preencher os resultados reais em `IOS_BUILD_REPORT_TEMPLATE.md` e marcar
cada item de `IOS_DEVICE_TEST_CHECKLIST.md`.
