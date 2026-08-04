# Matriz de Compatibilidade iOS — Plugins Capacitor

Levantamento baseado em: `package.json`, `node_modules/@capacitor/*/package.json`
(campo `ios.src`), READMEs instalados, `.d.ts` de definições, e no código dos
adapters em `mobile/www/app/adapters/*`. `@capacitor/ios` **não está
instalado** neste projeto — nada abaixo depende de `ios/` existir.

| Plugin | Versão instalada | Suporte iOS | API usada pelo adapter | Configuração iOS necessária | Validação automatizada existente | Validação em device pendente | Risco | Ação necessária no Mac |
|---|---|---|---|---|---|---|---|---|
| `@capacitor/filesystem` | 8.1.2 | Sim (`ios/Sources` presente) | `mkdir`, `getUri`, `deleteFile`, `readFile`, `writeFile` — via `CapacitorStorage.js`/`CapacitorMedia.js` | Nenhuma permissão especial (não usa Photos/Documents pastas visíveis). **Requer `PrivacyInfo.xcprivacy`** com categoria `NSPrivacyAccessedAPICategoryFileTimestamp` (motivo recomendado `C617.1`) | Testes com fakes de `filesystem` (Node) — não cobre comportamento nativo real | Sim — confirmar mensagens/códigos de erro reais (`OS-PLUG-FILE-XXXX`), `getUri` retornando `file://...`, `Directory.Data` mapeando para Documents | **Médio** — `Directory.Data` no iOS é a pasta **Documents** do app, que por padrão é **incluída em backup do iCloud** e pode ficar visível ao usuário se `UIFileSharingEnabled` for ativado (não é o caso aqui). No Android, `Directory.Data` é uma pasta interna não visível/sem backup — comportamento **diferente** entre plataformas | Adicionar `PrivacyInfo.xcprivacy`; decidir se mídia grande deve usar `Directory.Library`/`LibraryNoCloud` em vez de `Data` para evitar backup iCloud de arquivos grandes (ver seção "Riscos" no relatório) |
| `@capacitor/preferences` | 8.0.1 | Sim (`ios/Sources` presente) | `get`, `set` — via `CapacitorStorage.js` (RuntimeState) | **Requer `PrivacyInfo.xcprivacy`** com categoria `NSPrivacyAccessedAPICategoryUserDefaults` (motivo recomendado `CA92.1`) — obrigatório para submissão à App Store desde 2024-05-01 | Testes com fakes de `preferences` (Node) | Sim — confirmar que `UserDefaults` persiste corretamente entre sessões/kills do app | **Baixo** — API simples e estável nas duas plataformas | Adicionar entrada de `UserDefaults` ao mesmo `PrivacyInfo.xcprivacy` |
| `@capacitor/app` | 8.1.1 | Sim (`ios/Sources` presente) | `addListener('appStateChange', ...)` — via `createLifecycleCoordinator.js` | Nenhuma (eventos de lifecycle padrão do iOS: `willResignActive`/`didEnterBackground`/`willEnterForeground`) | Testes com fake de `appState` (Node) — cobre a lógica do `LifecycleCoordinator`, não o disparo real dos eventos nativos | Sim — no iOS, `willResignActive` dispara **mais cedo e com mais frequência** que o `onPause` do Android (ex.: ao puxar o Centro de Controle, receber uma notificação, Face ID) — pode gerar mais ciclos background→foreground que no Android | **Médio** — a suposição "background = app realmente saiu de foco" é mais fraca no iOS; `_handleBackground`/`_handleForeground` já são idempotentes e enfileirados, o que mitiga, mas precisa validação real | Validar no iPhone: abrir Centro de Controle, receber notificação, bloquear tela — confirmar que não há corrupção de estado nem escrita excessiva |
| `@capawesome/capacitor-file-picker` | 8.0.3 | Sim (`ios/Plugin` presente) | `pickMedia({readData:false})`, `copyFile({from,to,overwrite})` — via `CapacitorMedia.js` | Nenhuma permissão de Info.plist necessária para `pickMedia` (usa `PHPickerViewController`, que roda fora do processo do app e **não exige** `NSPhotoLibraryUsageDescription`). Entitlement `com.apple.security.files.user-selected.read-only` só é necessário para **Mac Catalyst** (fora de escopo aqui) | Testes com fakes de `filePicker`/`filesystem` (Node) — cobre a lógica de `pickMedia`/`importToLibrary`, não o picker nativo real | Sim — formato real de `path` retornado no iOS (provavelmente `file://...` em sandbox temporário), comportamento de `copyFile` nativo, cancelamento (mensagem de erro pode diferir do Android) | **Alto** — esta é a borda mais crítica do MediaPort (arquivos grandes, cópia para sandbox). `isCancelError()` só foi confirmada contra a implementação **web** do plugin; formato de erro nativo iOS **não verificado**. HEIC: no iOS, `pickMedia` faz **transcodificação automática HEIC→JPEG por padrão** (`skipTranscoding` default `true` na verdade retorna resultado já convertido — ver nota abaixo), o que é bom (evita rejeição por `UNSUPPORTED_TYPE`), mas precisa confirmação real | Validar no iPhone 13: `pickMedia` com fotos HEIC nativas do iPhone, vídeos grandes (>500MB), cancelamento do picker, e o `path`/`copyFile` fim-a-fim (`getUri → copyFile → convertFileSrc`) |

## Notas importantes

1. **HEIC**: fotos do iPhone são nativamente `.heic`. `MIME_TO_EXT` em
   `CapacitorMedia.js` não inclui `image/heic` — hoje qualquer HEIC seria
   rejeitado como `UNSUPPORTED_TYPE` **a menos que** o plugin já entregue o
   arquivo como JPEG. Segundo a definição de `PickMediaOptions.skipTranscoding`
   (default `true`), o comportamento exato precisa ser confirmado no device:
   se o plugin entregar `mimeType: 'image/heic'` mesmo com o arquivo já
   convertido, a rejeição seria um **falso negativo** grave para o caso de
   uso mais comum no iPhone (fotos tiradas pela própria Câmera).
2. **`Directory.Data` diverge de comportamento entre plataformas** (Android:
   pasta privada da app, sem backup; iOS: pasta Documents, com backup
   iCloud por padrão). Isso é uma diferença de comportamento real, não
   hipotética, e deve ser decidida antes de validar em device.
3. **`convertFileSrc`**: função de `@capacitor/core`, plataforma-agnóstica na
   API pública; a URI resultante (`capacitor://...` ou `ionic://...`) é
   gerada pelo bridge nativo — comportamento não pôde ser distinguido
   estaticamente entre Android/iOS a partir do código-fonte JS disponível
   neste ambiente; requer confirmação visual no device.
4. **Nenhum plugin de orientação/tela cheia/wake-lock é usado** — todos são
   APIs Web padrão (`navigator.wakeLock`, `screen.orientation`,
   `Element.requestFullscreen`). No iOS/Safari (incluindo WKWebView),
   **`navigator.wakeLock` só tem suporte a partir do iOS 16.4+** e
   `screen.orientation.lock()` **não é suportado em iOS/Safari/WKWebView**
   (API não implementada pela WebKit) — isso é uma divergência real e
   esperada, já coberta pelo *feature detection* existente em
   `PresentationPlatform.wakeLockSupported()`/`orientationSupported()`, que
   retornam `{supported:false}` sem lançar. **Ação necessária**: decidir se
   o bloqueio de orientação (retrato/paisagem forçado durante apresentação)
   precisa de solução nativa no iOS (ex.: configuração de orientações
   suportadas no Xcode) já que a API Web não cobre.
