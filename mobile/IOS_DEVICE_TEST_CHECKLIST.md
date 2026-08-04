# Checklist — Validação em Device Real (iPhone 13, via Mac/Xcode)

Nenhum item abaixo foi executado neste computador (Windows, sem Xcode/Mac).
Preencher apenas depois de instalar o build de desenvolvimento no iPhone 13
via Xcode, seguindo `IOS_MAC_HANDOFF.md`.

## Dados do device

- Modelo: iPhone 13
- Versão do iOS:
- Bundle Identifier instalado: `br.com.kinzart.fbscreenmanager`
- Versão do app (`CFBundleShortVersionString`):
- Build (`CFBundleVersion`):

## Checklist funcional

1. [ ] Aplicativo abre
2. [ ] Loading conclui
3. [ ] Editor aparece
4. [ ] Layout em retrato
5. [ ] Layout em paisagem
6. [ ] Controles possuem área adequada para toque
7. [ ] Importação de imagem (não-HEIC, ex.: PNG/JPEG)
8. [ ] Importação de foto HEIC nativa da Câmera do iPhone
9. [ ] Importação de vídeo pequeno
10. [ ] Importação de vídeo grande (>500MB)
11. [ ] Arquivo é copiado ao sandbox (`library/<uid>.<ext>`)
12. [ ] Miniatura aparece
13. [ ] Item é adicionado à playlist
14. [ ] Mover item para cima
15. [ ] Mover item para baixo
16. [ ] Editar duração
17. [ ] Editar transição
18. [ ] Editar fit
19. [ ] Editar startAt
20. [ ] Ativar e desativar loop
21. [ ] Iniciar apresentação
22. [ ] Imagem é exibida
23. [ ] Vídeo é reproduzido (codec MP4/H.264)
24. [ ] Vídeo `.webm` (esperado falhar — confirmar erro tratado, não crash)
25. [ ] Pause
26. [ ] Resume
27. [ ] Próximo
28. [ ] Anterior
29. [ ] Blackout
30. [ ] Logo
31. [ ] Sair da apresentação
32. [ ] Fechar e reabrir o app
33. [ ] Playlist é restaurada
34. [ ] RuntimeState é restaurado com segurança
35. [ ] Background e foreground (botão lateral)
36. [ ] Background e foreground (Centro de Controle)
37. [ ] Background e foreground (notificação recebida)
38. [ ] Bloquear e desbloquear tela
39. [ ] Modo avião
40. [ ] Tela permanece ligada durante apresentação (Wake Lock, iOS 16.4+)
41. [ ] Orientação: comportamento sem `screen.orientation.lock()` (avaliar
    se aceitável)
42. [ ] Picker cancelado sem erro
43. [ ] Mídia removida tratada
44. [ ] Erro de codec tratado (webm, HEIC não convertido, etc.)
45. [ ] Ausência de crash em todo o roteiro

## Interoperabilidade de arquivos grandes (crítico)

- [ ] `getUri`/picker `path` → `copyFile` → sandbox → `convertFileSrc`
      funciona fim-a-fim com arquivo real (não mock)
- [ ] Nenhum conteúdo Base64 trafega pelo JS durante a importação
- [ ] Memória não cresce de forma incompatível com o tamanho do arquivo
- [ ] Arquivo parcial não permanece em `library/` após falha simulada

## Privacy / App Store readiness (não bloqueia teste em device próprio)

- [ ] `PrivacyInfo.xcprivacy` criado com as duas categorias exigidas
      (UserDefaults, FileTimestamp)

## Resultado

- ANDROID_DEVICE_STATUS (referência, etapa anterior): não aplicável a este
  documento.
- IOS_DEVICE_STATUS: `PENDING` até execução real no iPhone 13.
