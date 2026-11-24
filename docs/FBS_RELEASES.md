# Releases, atualizações e compatibilidade

Estado verificado em 2026-11-23. **Nenhuma release foi publicada neste ciclo.** Publicar exige credenciais e autorização explícita do dono do repositório.

## 1. Componentes e versões atuais

| Componente | Versão | Build | Distribuição atual |
|---|---|---|---|
| App Windows/Linux (Electron) | 1.1.0 (`package.json`) | `npm run package` (NSIS), `package:linux` | Instalador local em `dist/` (ignorado pelo git). NSIS sem assinatura de código |
| FBS Studio (Central web) | 1.1.0 (`web/package.json`; era 1.0.1) | `npm ci && npm test && npm run build` em `web/` | Deploy manual na Hostinger (entrada `hosting.js`) |
| Receptor `/tv` | `PLAYER_VERSION` 1.1.0, protocolo 2 | É servido pela Central | Atualiza sozinho: cada aparelho carrega `/tv` do servidor. O cache-busting é feito por `?v=` em `player.html` |
| Tela FBS (APK receptor) | 0.1.0, versionCode 1 | `scripts/build-projector.ps1` | APK assinado com keystore local (fora do git), instalação manual ou USB |
| Editor mobile (Capacitor) | ver `mobile/package.json` | `android-apk.yml` (APK debug) | Artefato de CI |

## 2. Compatibilidade

| Combinação | Situação |
|---|---|
| Central 1.1.0 + página `/tv` antiga (protocolo 1) | Funciona. `output`, `source` e o ACK mantêm o formato; `plan`, cache e heartbeat ficam ausentes. A telemetria mostra `protocol: 1` |
| Central 1.0.1 + `state.json` esquema 2 | **Não funciona.** A versão antiga recusa o esquema 2. O rollback exige restaurar `state.v1-<ts>.json` (ver §4) |
| APK 0.1.0 + Central 1.1.0 | Funciona sem atualizar o APK: o receptor novo vem pela WebView. O cache exige HTTPS (produção) |
| Electron 1.1.0 | Não depende da Central. Os dados em `userData/data` ficam inalterados |

## 3. Modelo `ReleaseInfo` (proposto, não implementado)

```jsonc
{ "component": "studio|desktop-win|desktop-linux|projector-apk|mobile-apk",
  "version": "1.1.0", "channel": "stable|beta", "protocol": 2, "minProtocol": 1,
  "url": "https://…", "sha256": "…", "size": 0, "publishedAt": "ISO-8601", "notes": "…" }
```
A Central poderia servir `GET /api/v1/releases` a partir de um arquivo no `FBS_DATA_DIR` e comparar com `screen.device.version` (já persistido pelo heartbeat) para exibir "atualização disponível". Esse é o item P-8 do plano.

## 4. Rollback

| Componente | Procedimento |
|---|---|
| Central | 1) Parar o serviço. 2) Copiar `FBS_DATA_DIR` inteiro (backup). 3) Renomear `state.v1-<ts>.json` para `state.json`. 4) Publicar o build anterior. Mudanças feitas depois da migração (programações, comandos e mídias novas) **são perdidas** no rollback. As mídias continuam em disco |
| Receptor `/tv` | Acompanha a Central |
| APK | O Android recusa um versionCode menor por cima do instalado. Voltar exige desinstalar (perde cookies e pareamento) ou publicar a versão antiga com versionCode maior, assinada com a **mesma** keystore |
| Windows NSIS | Reinstalar o instalador anterior. `userData` é preservado |

## 5. Limites reais das plataformas

- **Android:** instalação silenciosa só com Device Owner/MDM ou com uma loja (Play, com políticas próprias). Um APK baixado exige a confirmação do usuário e a permissão "instalar apps desconhecidos". Por isso o APK foi mantido como um envelope fino de WebView: quase toda atualização chega pela Central sem reinstalação.
- **Windows:** atualização automática (`electron-updater`) exige um feed de releases (GitHub Releases) e, para não gerar alertas do SmartScreen, um certificado de assinatura de código. Ambos estão ausentes. BLOCKED por credenciais.
- **Navegador/WebView:** Service Worker, Cache Storage e `crypto.subtle` exigem HTTPS ou localhost. O endereço LAN `http://192.168…` do Electron (`:8790`) não permite cache: o receptor informa `cache: indisponível` e transmite por streaming.
- **Armazenamento do navegador:** a cota depende do aparelho (`navigator.storage.estimate`). O receptor checa o espaço antes de baixar e pede `persist()`, mas o navegador pode recusar e apagar o cache em caso de pouco espaço. O painel mostra uso e cota.

## 6. Processo recomendado (quando houver autorização)

1. Branch → PR → CI verde (`web-studio.yml` roda as três suítes de `web/`).
2. Tag `vX.Y.Z` → `linux-packages.yml` publica o AppImage e o deb (já configurado; exige `GITHUB_TOKEN` do próprio Actions).
3. Studio: deploy manual com backup prévio do `FBS_DATA_DIR`. Confirmar em `/health` que a versão é 1.1.0 e que a migração criou o `state.v1-*.json`.
4. APK: subir versionCode e versionName e assinar com a mesma keystore. Guardar SHA-256 e tamanho no `ReleaseInfo`.
