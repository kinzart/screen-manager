# Template — Relatório de Build iOS (preencher em um Mac)

Nenhum campo abaixo foi preenchido nesta etapa — este computador não tem
Xcode/macOS. Preencher ao executar `IOS_MAC_HANDOFF.md` em um Mac real.

## 1. Ambiente

- macOS (versão):
- Xcode (versão):
- CocoaPods (versão):
- Node/npm (versões):
- `@capacitor/ios` (versão instalada):

## 2. Precheck

| Comando | Resultado | Exit code |
|---|---|---|
| `npm install` | | |
| `npm test` | | |
| `npm run build` | | |
| `npm install @capacitor/ios@8.4.2` | | |
| `npx cap add ios` | | |
| `npx cap sync ios` | | |

## 3. Xcode

- Signing Team usado:
- Bundle Identifier confirmado no Xcode: `br.com.kinzart.fbscreenmanager`
- Warnings de build relevantes:
- Resultado do build (sucesso/falha):

## 4. Instalação no iPhone 13

- Trust/Developer Mode necessário: sim/não
- Instalação concluída: sim/não
- Logs relevantes do Xcode Console na abertura:

## 5. Checklist funcional

Ver `IOS_DEVICE_TEST_CHECKLIST.md` — colar aqui o resultado resumido
(quantos PASS/FAIL de 45 itens).

## 6. Riscos confirmados ou descartados (da auditoria estática)

Preencher com base em `IOS_COMPATIBILITY_REPORT.md`, seção 4:

| Risco | Confirmado no device? | Nota |
|---|---|---|
| HEIC não mapeado | | |
| `Directory.Data` = Documents/iCloud backup | | |
| Sem trava de orientação nativa | | |
| Frequência de eventos de lifecycle | | |
| Cadeia getUri→copyFile→sandbox→convertFileSrc | | |
| `.webm` não suportado pelo WebKit | | |
| Wake Lock requer iOS 16.4+ | | |

## 7. PrivacyInfo.xcprivacy

- Criado: sim/não
- Categorias declaradas:

## 8. Status final

- IOS_BUILD_STATUS:
- IOS_DEVICE_STATUS:
- Observações finais:
