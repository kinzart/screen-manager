# Checklist de Validação Manual em Device Real

Este checklist **não foi executado** nesta sessão — não há JDK/Android
SDK/device disponíveis (ver `ANDROID_ENVIRONMENT_REPORT.md`). Deve ser
seguido manualmente assim que um APK debug for gerado e instalado em um
aparelho Android real. Marcar cada item apenas após confirmação visual
direta no aparelho — nenhum item deste checklist pode ser considerado
`PASS` com base em teste automatizado ou build bem-sucedido.

- [ ] 1. Abertura — o app abre sem crash a partir do ícone.
- [ ] 2. Tela touch-first — todos os controles respondem ao toque, sem
      necessidade de mouse/hover.
- [ ] 3. Retrato — layout correto em orientação retrato.
- [ ] 4. Paisagem — layout correto em orientação paisagem (`app.css`
      possui `@media (orientation: landscape)`, validar visualmente).
- [ ] 5. Importação de imagem — seleciona uma imagem do aparelho e ela
      aparece na playlist.
- [ ] 6. Importação de vídeo pequeno (poucos MB) — importa e reproduz.
- [ ] 7. Importação de vídeo grande (várias centenas de MB / >1 GB) —
      importa sem travar a UI, sem estourar memória (valida R3 do plano).
- [ ] 8. Miniatura — item importado exibe preview/miniatura no editor.
- [ ] 9. Playlist — lista mostra todos os itens importados, rolável.
- [ ] 10. Mover item — botões mover-para-cima/mover-para-baixo reordenam
       corretamente.
- [ ] 11. Duração — campo de duração editável e respeitado na reprodução.
- [ ] 12. Transição — transição selecionada (`fade`/`slide-*`/`zoom`/`cut`)
       é visivelmente aplicada.
- [ ] 13. Play — inicia a apresentação a partir do item selecionado.
- [ ] 14. Pause/resume — alterna corretamente, sem perder o `elapsed`.
- [ ] 15. Next/previous — avança/retrocede na playlist.
- [ ] 16. Blackout — tela preta imediata, reversível.
- [ ] 17. Logo — exibe o estado de logo (quando configurado).
- [ ] 18. Loop — ao terminar a playlist, reinicia do início se
       `loopPlaylist` estiver ativo; para no último item caso contrário.
- [ ] 19. Fechar e abrir — fechar o app e reabrir restaura playlist e
       estado de reprodução (via `RuntimeState`).
- [ ] 20. Background/foreground — bloquear a tela (ou trocar de app) e
       voltar: elapsed reflete o tempo real decorrido (não soma de
       ticks), sem crash, sem duplicar a mídia atual.
- [ ] 21. Modo avião — app continua funcional (importar, editar, 
       apresentar mídia já copiada) sem conexão de rede.
- [ ] 22. Tela não apagar durante apresentação — wake lock mantém a tela
       ligada enquanto uma apresentação está ativa.
- [ ] 23. Comportamento de codecs — testar ao menos um `.mp4` (H.264) e,
       se disponível, um `.webm`; registrar quais codecs falham (risco R1
       do plano de arquitetura).
- [ ] 24. Remoção de mídia — remover um item da playlist apaga o arquivo
       correspondente do sandbox (`deleteFromLibrary`).
- [ ] 25. Ausência de crash — nenhum dos passos acima produz crash, ANR
       (App Not Responding) ou tela branca.

## Registro de execução

Preencher ao rodar o checklist:

- Data:
- Modelo do aparelho / versão do Android:
- Build instalado (hash do APK):
- Resultado por item (marcar acima) + observações de qualquer falha.

**Não declarar `DEVICE_VALIDATED` apenas porque o APK compilou.** Este
status só é verdadeiro após os 25 itens acima serem confirmados
manualmente, um a um, no aparelho.
