# Manual do Usuario - Screen Manager

Este manual explica como instalar, operar e personalizar o Screen Manager.

## 1. Para que serve

O Screen Manager controla uma tela de saida, como projetor, TV ou telao, a partir de uma janela de controle. Na janela principal voce organiza a fila de midias. Na tela de saida o publico ve somente a imagem, video, blackout ou logo.

## 2. Preparar o computador

1. Conecte o projetor, TV ou telao ao computador.
2. No Windows, configure as telas como **Estender estas telas**.
3. Abra o aplicativo.
4. Se houver uma segunda tela, a saida abre nela em tela cheia.
5. Se houver apenas uma tela, a saida abre em janela para teste.

## 3. Adicionar midias

Voce pode adicionar midias de duas formas:

- Clique em **Adicionar midia**.
- Arraste arquivos para dentro da janela do app.

Formatos aceitos:

- Imagens: PNG, JPG, JPEG, WEBP, GIF.
- Videos: MP4, WEBM.

Importante: o app referencia o caminho original do arquivo. Depois de adicionar uma midia, nao mova ou renomeie o arquivo no Windows.

## 4. Organizar a fila

Cada linha da fila representa uma midia.

Voce pode:

- Arrastar a linha para cima ou para baixo.
- Usar os botoes de seta para subir ou descer.
- Dar duplo clique em uma linha para colocar esse item no ar.
- Remover um item com o botao `X`.
- Ajustar duracao, transicao e horario.

## 5. Controles ao vivo

Na lateral direita ficam os controles principais:

- **Anterior**: volta para a midia anterior.
- **Play/Pausar**: inicia ou pausa a exibicao.
- **Proximo**: avanca para a proxima midia.
- **Bloquear item no ar**: impede que o app avance automaticamente quando a duracao acabar ou quando chegar um horario agendado.
- **Loop ligado/desligado**: define se a playlist volta para o primeiro item ao chegar no fim.
- **Blackout**: deixa a tela de saida preta.
- **FBS Logo**: mostra a tela de logo.

## 6. Duracao dos itens

O campo **Duracao** controla por quantos segundos a midia fica no ar.

- Imagens normalmente usam uma duracao fixa.
- Videos tambem podem ter duracao definida.
- Se a duracao chegar ao fim e o item nao estiver bloqueado, o app avanca automaticamente.
- Se **Bloquear item no ar** estiver ligado, o item atual permanece no ar.

## 7. Loop da playlist

O botao **Loop ligado** faz a fila reiniciar automaticamente quando chega ao ultimo item.

Quando esta em **Loop desligado**, o app para no fim da fila e volta para a tela de logo.

## 8. Regras por horario

Em **Regras por horario**, voce pode configurar periodos com transicoes especificas.

Exemplo:

```text
19:00 ate 20:00 - fade
20:00 ate 21:00 - zoom
```

Essas regras ajudam quando uma apresentacao precisa ter comportamento diferente em momentos especificos do evento.

## 9. Painel de arquivos

O painel **ARQUIVOS** lista os arquivos que estao na fila.

Use:

- **Abrir** para abrir o arquivo no programa padrao do Windows.
- **Pasta** para abrir a pasta onde o arquivo esta salvo.

Isso ajuda a localizar rapidamente uma midia sem procurar manualmente no Explorer.

## 10. Trocar o logo

O arquivo do logo fica em:

```text
src/logo-bs.png
```

Para trocar:

1. Prepare um arquivo PNG novo.
2. Renomeie esse arquivo para `logo-bs.png`.
3. Substitua o arquivo existente em `src/logo-bs.png`.
4. Rode o app com:

```powershell
npm start
```

5. Clique em **FBS Logo** e confira na tela de saida.
6. Para gerar um instalador com o novo logo:

```powershell
npm run package
```

Recomendacao: use PNG com fundo transparente e boa resolucao, por exemplo 1000 px ou mais de largura.

## 11. Gerar um instalador novo

Depois de qualquer mudanca no codigo ou no logo, gere um novo instalador:

```powershell
npm run package
```

Os arquivos ficam em `dist/`.

Se voce testar um `.exe` antigo, as mudancas recentes nao vao aparecer. Sempre confira a data do arquivo em `dist/`.

## 12. Solucao de problemas

### Arrastei uma midia e ela nao entrou

Verifique se o formato e suportado: PNG, JPG, JPEG, WEBP, GIF, MP4 ou WEBM.

### Um item sumiu ou nao abre

O arquivo pode ter sido movido ou renomeado no Windows. Remova o item da fila e adicione novamente.

### A tela nao abriu no projetor

Confira no Windows se o modo de exibicao esta como **Estender estas telas**. Depois reinicie o app.

### O logo nao mudou

Confirme se o arquivo novo foi salvo exatamente como `src/logo-bs.png`. Se estiver usando o instalador, gere um novo com `npm run package`.

### Testei o exe e nada mudou

O exe provavelmente e antigo. Rode `npm start` para testar o codigo fonte atual ou gere um novo instalador com `npm run package`.

## 13. Dicas para evento

- Desative suspensao de energia do Windows.
- Desative notificacoes.
- Teste todos os videos antes do evento.
- Prefira MP4 H.264 para maior compatibilidade.
- Mantenha as midias em uma pasta fixa.
- Leve backup da pasta de midias.
- Teste blackout, logo, loop e bloqueio antes de abrir o evento.
