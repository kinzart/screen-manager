# FBS Screen Manager — Mobile (Android)

Projeto Capacitor do app mobile independente, parte da arquitetura híbrida
`APPROVED_HYBRID_MOBILE_FIRST`. Não usa Electron, React ou Vue — HTML, CSS e
JavaScript puros.

- **appId:** `br.com.kinzart.fbscreenmanager`
- **appName:** FBS Screen Manager
- **webDir:** `www`

## Estado

Etapa 0 (scaffolding) apenas. Nenhuma lógica de playlist, importação de
mídia ou apresentação foi implementada ainda — ver `ETAPA_0_REPORT.md` e o
plano de arquitetura da sessão para as próximas etapas.

## Comandos

```
npm install
npx cap add android
npx cap sync android
npx cap doctor
```

Requer Java (JDK) e Android SDK instalados para `cap add android` / build
Android completarem com sucesso.
