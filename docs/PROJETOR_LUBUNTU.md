# Teste com projetor no Lubuntu

Este roteiro separa os dois modos de saída que o Screen Manager oferece no Linux:

- **Saída física:** o projetor recebe HDMI/DisplayPort diretamente do computador.
- **Saída pelo navegador:** o projetor (ou um dispositivo Android ligado a ele) abre a página `/tv` pela rede.

## 1. Saída física HDMI/DisplayPort

1. Conecte o cabo antes de iniciar o aplicativo.
2. No Lubuntu, abra **Preferências → Configuração do monitor** e escolha **Estender** ou o modo de tela desejado.
3. Confira se o sistema reconheceu a saída:

   ```bash
   xrandr --query
   ```

   Procure uma saída como `HDMI-1`, `HDMI-0` ou `DP-1` com o estado `connected`. Os nomes variam conforme o computador e o adaptador.

4. Inicie o aplicativo na pasta do projeto:

   ```bash
   npm start
   ```

5. No painel, abra **Conexões → Saída** e selecione o projetor. Coloque uma imagem ou vídeo no ar.

Com duas telas reconhecidas, a janela de palco abre em tela cheia na saída escolhida. Para testar a recuperação, remova o cabo por alguns segundos e conecte-o novamente. O item atual, a posição do vídeo, a pausa, o blackout e o logo devem ser preservados enquanto o sistema volta a reconhecer a tela.

## 2. Projetor com Android ou navegador

Este caminho não usa a API de monitores do Linux. O dispositivo que está ligado ao projetor abre a saída de palco pela rede:

1. Ative **Conexões → Ativar acesso pelo celular e TV** no aplicativo.
2. Descubra o endereço do computador:

   ```bash
   hostname -I
   ```

3. No navegador do projetor/Android TV, abra `http://IP_DO_COMPUTADOR:8790/tv`.
4. Digite o código de exibição mostrado no painel.
5. Use o telefone para colocar uma imagem ou vídeo no ar e confirme que a página `/tv` acompanha a apresentação.

O telefone, o computador e o dispositivo do projetor precisam conseguir se comunicar pela rede local neste modo. Se o endereço não abrir, verifique se estão na mesma rede e se o firewall está bloqueando a porta 8790. Em uma instalação que usa UFW, a liberação pode ser feita com:

```bash
sudo ufw allow 8790/tcp
```

Não libere essa porta diretamente para a internet. O modo remoto pela internet precisa de um relay seguro e autenticação própria.

## 3. Checklist rápido

- [ ] `xrandr --query` mostra o projetor como `connected`.
- [ ] O aplicativo abre o palco no projetor em tela cheia.
- [ ] PNG/JPG e MP4/WebM aparecem no projetor.
- [ ] Desconectar e reconectar HDMI recupera o estado.
- [ ] `/tv` abre no navegador, quando o projetor tem Android/navegador.
- [ ] O telefone controla play, pausa, blackout e logo.
- [ ] A página `/tv` não fica com rolagem horizontal em tela pequena.

O helper PowerShell de Miracast não é incluído no Linux. Para projetor sem cabo, use o navegador do dispositivo ou as ferramentas sem fio do próprio sistema; o suporte e a reconexão dependem do driver e do ambiente gráfico.
