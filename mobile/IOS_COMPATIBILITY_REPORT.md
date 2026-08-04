# Relatório — ETAPA IOS-0: Auditoria de Compatibilidade iOS

**Escopo**: avaliação estática de compatibilidade do código mobile existente
(core + adapters + UI, testado 323/323 em Node) com iOS/iPhone, **sem**
instalar Xcode, CocoaPods, `@capacitor/ios` (executável) ou gerar `ios/`.
Este computador é Windows, sem Xcode — nenhuma validação em simulador ou
device pôde ser feita aqui. Ver `IOS_PLUGIN_MATRIX.md` para a matriz
plugin-a-plugin.

## 1. Método

Evidência coletada de:
- `mobile/package.json` (dependências e versões reais instaladas).
- `node_modules/@capacitor/{filesystem,preferences,app}/package.json` —
  todos declaram `"ios": {"src": "ios"}` e possuem código-fonte Swift em
  `ios/Sources/` de fato presente no disco.
- `node_modules/@capawesome/capacitor-file-picker/package.json` — possui
  `ios/Plugin` presente no disco.
- READMEs instalados de cada plugin (não apenas `package.json`).
- `.d.ts` de definições do `capacitor-file-picker` (única forma de confirmar
  precisamente quais campos/opções existem por plataforma, já que o README
  às vezes omite detalhes cobertos apenas no JSDoc-gerado).
- Código-fonte dos adapters: `CapacitorMedia.js`, `CapacitorStorage.js`,
  `PresentationPlatform.js`, `LifecycleCoordinator.js`, `main.js`.
- `AndroidManifest.xml` (para comparação — o que hoje é declarado só para
  Android e o que precisaria de equivalente em Info.plist).
- `www/index.html` e `www/styles/*.css` (viewport, safe-area).
- Relatórios anteriores (`ETAPA_2_REPORT.md`, `ETAPA_3_REPORT.md`,
  `ETAPA_4_REPORT.md`) — todos já registravam explicitamente que a validação
  nativa real (Android) nunca foi feita em device, então o mesmo gap se
  aplica a iOS a fortiori.

**Nenhum dos 4 plugins depende de recursos exclusivos de Android** — todos
têm implementação iOS nativa mantida pelos autores (Ionic/Capacitor core e
Capawesome). Isso confirma que a arquitetura (ports/adapters, injeção de
dependência, zero import direto de `@capacitor/*` fora das 4 fábricas
`create*.js`) já foi construída de um jeito que **não impede** portar para
iOS — nenhuma refatoração de arquitetura é necessária para isso.

## 2. Divergências reais Android vs iOS identificadas

| # | Item | Android | iOS | Impacto |
|---|---|---|---|---|
| 1 | `Directory.Data` (Filesystem) | Pasta privada da app, sem backup, apagada ao desinstalar | Pasta **Documents**, com **backup iCloud por padrão** | Mídia grande (vídeos) importada ficaria sujeita a backup iCloud, aumentando uso de armazenamento em nuvem do usuário sem consentimento explícito disso |
| 2 | `screen.orientation.lock()` | Suportado (Chrome WebView) | **Não implementado** no WebKit/Safari/WKWebView | `PresentationPlatform.lockOrientation()` sempre retornará `{supported:false}` no iOS — já tratado sem lançar, mas a *feature* de travar orientação durante apresentação **não funcionará** via Web API no iPhone |
| 3 | `navigator.wakeLock` | Suportado (Chrome/WebView moderno) | Suportado **apenas iOS 16.4+** | iPhone 13 roda iOS moderno (tipicamente 16+), então provavelmente funciona, mas precisa confirmação na versão real instalada no aparelho |
| 4 | Eventos de lifecycle (`@capacitor/app`) | `onPause`/`onResume` mais previsíveis | `willResignActive` dispara em mais situações (Centro de Controle, notificação, Face ID) | Mais ciclos background→foreground que no Android — `LifecycleCoordinator` já enfileira e é idempotente, mas o volume de eventos reais é maior, sem validação |
| 5 | HEIC (fotos nativas do iPhone) | N/A (Android não usa HEIC por padrão) | Câmera do iPhone grava `.heic` por padrão | `MIME_TO_EXT` não mapeia `image/heic`; comportamento depende de o plugin já entregar JPEG transcodificado (ver matriz, nota 1) — **não confirmado** |
| 6 | Privacy Manifest (`PrivacyInfo.xcprivacy`) | Não existe conceito equivalente | **Obrigatório** para submissão à App Store (Preferences + Filesystem exigem categorias declaradas) | Não bloqueia teste em device próprio (sideload via Xcode), mas bloqueia qualquer futura distribuição via TestFlight/App Store |
| 7 | Permissões de mídia (Info.plist) | `READ_EXTERNAL_STORAGE`/`ACCESS_MEDIA_LOCATION` (não declaradas hoje) | `pickMedia` via `PHPickerViewController` **não exige** `NSPhotoLibraryUsageDescription` | Favorável ao iOS — picker moderno roda fora do processo do app, sem prompt de permissão de galeria |

## 3. O que já está favorável ao iOS sem mudança nenhuma

- `viewport-fit=cover` já configurado em `index.html`.
- `env(safe-area-inset-*)` já usado em `app.css` e `presenter.css` — cobre
  notch/Dynamic Island do iPhone 13 sem alteração.
- Toda a lógica de negócio (`core/*`) é JS puro, sem dependência de DOM ou
  Capacitor — 100% portável.
- Todos os adapters seguem injeção de dependência estrita: nenhuma classe
  testável importa `@capacitor/*` diretamente, só as 4 fábricas
  (`createCapacitorStorage.js`, `createCapacitorMedia.js`,
  `createLifecycleCoordinator.js`, e o bootstrap `main.js` para
  `PresentationPlatform`). Isso significa que portar para iOS não deveria
  exigir tocar em nenhum arquivo de `core/` nem na maioria da UI.
- `capacitor.config.json` não tem nenhuma configuração Android-específica
  hardcoded (`webDir`, `appId`, `appName` são plataforma-agnósticos).

## 4. Riscos específicos para validar no iPhone 13

Em ordem de severidade:

1. **HEIC não mapeado** (`MIME_TO_EXT`) — pode rejeitar o caso de uso mais
   comum (foto tirada agora na Câmera do iPhone) como `UNSUPPORTED_TYPE`.
   **Requer teste real** antes de qualquer conclusão — pode já funcionar se
   o plugin sempre entrega `image/jpeg` transcodificado.
2. **Cadeia `getUri → copyFile → sandbox → convertFileSrc`** para arquivos
   grandes — nunca validada fora de mocks em nenhuma plataforma (Android
   também não foi validado ainda, ver `ETAPA_7_REPORT.md`). É a borda mais
   arriscada do app inteiro.
3. **`Directory.Data` = Documents com backup iCloud** — decisão de produto
   pendente: aceitar o backup, ou migrar para `Directory.Library`/
   `LibraryNoCloud` antes de acumular vídeos grandes na conta iCloud do
   usuário.
4. **Ausência de trava de orientação nativa** — se o app precisa forçar
   paisagem durante apresentação e a Web API não cobre no iOS, a solução
   exigiria configuração nativa no Xcode (`UISupportedInterfaceOrientations`
   dinâmico ou código Swift), fora do escopo desta etapa.
5. **Frequência de eventos de lifecycle** — sem dado real de quantos
   `appStateChange` disparam durante um uso normal no iPhone.

## 5. O que esta auditoria NÃO fez (propositalmente)

- Não instalou `@capacitor/ios`.
- Não executou `npx cap add ios` nem gerou pasta `ios/`.
- Não iniciou CocoaPods, xcodebuild ou qualquer processo que dependa de
  macOS.
- Não alterou nenhum código de produção (`www/app/**`, `tests/**`,
  Electron).
- Não afirmou que qualquer item acima foi validado em device — todos os
  riscos listados na seção 4 permanecem **não confirmados** até teste real
  no iPhone 13 via Mac/Xcode (ETAPA IOS-2).

## 6. Status

**IOS_AUDIT_STATUS: COMPLETE** (auditoria estática) —
**IOS_DEVICE_VALIDATION_STATUS: PENDING** (depende de Mac/Xcode, fora deste
ambiente).
