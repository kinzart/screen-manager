# Guia — Teste Visual pelo Safari no iPhone 13 (rede local)

**O que isto é**: um jeito de abrir o app mobile no Safari do iPhone 13, na
mesma rede Wi-Fi do computador, para avaliar **layout, touch, orientação e
navegação** — sem instalar nada no iPhone e sem depender de Mac/Xcode.

**O que isto NÃO é**: uma validação nativa. Rodando pelo Safari puro (sem
Capacitor nativo), os plugins usam suas implementações **web** de fallback:

- `@capacitor/filesystem` → IndexedDB (não é o filesystem nativo real).
- `@capacitor/preferences` → `localStorage`.
- `@capawesome/capacitor-file-picker` → `<input type="file">` do navegador,
  que retorna um `Blob`, **não** um `path` nativo. Como
  `CapacitorMedia.importToLibrary()` exige `pickedFile._sourcePath` (só
  existe em Android/iOS nativo), **a importação de mídia vai falhar de
  forma visível e controlada** (`MediaError INVALID_REF`) depois de
  escolher um arquivo no picker web — isso é esperado, não é um bug, e
  **não deve ser interpretado como MediaPort validado**.
- `@capacitor/app` (lifecycle) não dispara `appStateChange` fora do runtime
  nativo — o `LifecycleCoordinator` simplesmente não inicia (já tratado sem
  crashar, ver `main.js`, bloco try/catch ao redor de `lifecycle.start()`).

Nenhuma alteração de código foi necessária para este teste: o próprio
Capacitor já resolve para as implementações web dos plugins quando não há
bridge nativo. Não foi criado nenhum "modo diagnóstico" adicional no
código — o comportamento acima já é o comportamento real e existente do
projeto rodando num navegador comum.

## 1. Iniciar o servidor Vite na rede local

No PowerShell, dentro de `mobile/`:

```powershell
npx vite --host 0.0.0.0 --port 5173
```

Ou, de forma equivalente, editando temporariamente (não commitar) o comando
`npm run dev` para incluir `--host`. A saída mostrará duas URLs:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

Use a URL de **Network** no iPhone.

## 2. Descobrir o IPv4 do computador no Windows

```powershell
ipconfig
```

Procure por "Endereço IPv4" na seção do adaptador Wi-Fi ativo (ex.:
`192.168.15.3`). Neste ambiente, o IPv4 detectado foi `192.168.15.3` — pode
mudar a cada rede/reinicialização; sempre confirme antes de cada sessão de
teste.

## 3. URL a abrir no Safari do iPhone

```
http://192.168.15.3:5173/
```

(troque pelo IP mostrado no passo 2). O iPhone precisa estar na **mesma
rede Wi-Fi** que o computador.

## 4. Possíveis bloqueios de Firewall (Windows)

Se o iPhone não conseguir abrir a página:

1. Verifique se o **Firewall do Windows** está bloqueando conexões de
   entrada na porta 5173 para redes privadas.
2. Se necessário, crie uma regra de entrada específica para a porta 5173
   (TCP), escopo **rede privada apenas** — não abrir para rede pública.
3. Confirme que o roteador não isola clientes Wi-Fi entre si ("AP
   isolation"/"client isolation"), o que impediria o iPhone de alcançar o
   PC mesmo na mesma rede.
4. Antivírus de terceiros (se houver) pode ter firewall próprio — verificar
   separadamente do Firewall do Windows.

Nenhuma alteração de firewall foi feita automaticamente por esta etapa —
qualquer regra de firewall deve ser criada manualmente pelo usuário.

## 5. Checklist de teste (layout/touch, não nativo)

Marque cada item ao testar no iPhone 13 real:

- [ ] Página carrega no Safari sem erro em branco.
- [ ] `#boot-loading` aparece brevemente e some.
- [ ] Editor (`AppShell`/`EditorView`) aparece corretamente.
- [ ] Layout em retrato — sem cortes, sem overflow horizontal.
- [ ] Layout em paisagem — sem cortes, sem overflow horizontal.
- [ ] Safe area respeitada (notch/Dynamic Island não cobre controles) —
      girar e verificar cantos superiores/inferiores.
- [ ] Botões/controles têm área de toque adequada (sem toques acidentais
      em botão vizinho).
- [ ] Botão "Importar mídia" abre o seletor de arquivo do Safari.
- [ ] Cancelar o seletor não gera erro nem trava a UI.
- [ ] Selecionar um arquivo real: app mostra **erro tratado** (não crash) —
      confirma que falhas de import são visíveis ao usuário, não silenciosas.
- [ ] Playlist renderiza itens (se houver itens de teste previamente
      salvos via localStorage/IndexedDB do próprio Safari).
- [ ] Mover item para cima/baixo funciona por toque.
- [ ] Editar campos (duração, transição, fit, startAt) funciona com o
      teclado do iPhone.
- [ ] Alternar loop funciona.
- [ ] `PresenterView` abre e exibe corretamente em tela cheia percebida
      (mesmo sem Fullscreen API nativa real).
- [ ] Botões do `TransportBar` (play/pause/next/previous/blackout/logo)
      respondem ao toque.
- [ ] Sair da apresentação volta ao editor.
- [ ] Fechar aba do Safari e reabrir: layout carrega novamente (RuntimeState
      pode ou não persistir — depende do IndexedDB/localStorage do Safari,
      não é native e não deve ser tratado como prova de persistência real).
- [ ] Acessibilidade: `aria-label`s presentes são lidos corretamente pelo
      VoiceOver, se ativado (opcional).

## 6. Limitações explícitas deste teste

- Não valida `MediaPort` real (picker nativo, `copyFile`, `convertFileSrc`).
- Não valida `LifecycleCoordinator` (sem eventos `appStateChange` reais).
- Não valida Wake Lock/orientação nativos do iOS (ver
  `IOS_COMPATIBILITY_REPORT.md`, riscos 2 e 3).
- Não valida persistência real em `Directory.Data`/`UserDefaults`.
- Serve **apenas** para inspeção visual/touch/layout/navegação/estados de
  loading e erro.

## 7. Como coletar erros visíveis

- Erros JS não tratados aparecem como `#boot-error` (tela de erro do
  próprio app) quando ocorrem durante o bootstrap.
- Para erros durante o uso (depois do boot), usar o Safari em um Mac (se
  disponível) com **Desenvolvedor → [nome do iPhone] → página aberta** para
  ver o console remoto; sem Mac, não há como inspecionar o console do
  Safari iOS diretamente — anotar sintomas visuais (o que a tela mostrou)
  no template de resultados.

## 8. Adicionar à Tela de Início (apenas avaliação visual)

No Safari do iPhone, com a página aberta: botão Compartilhar →
"Adicionar à Tela de Início". Isso cria um atalho que abre em modo
"standalone" (sem a barra do Safari), útil para avaliar como o layout se
comporta em tela cheia — **ainda não é um app nativo instalado**, apenas um
atalho web. Não confundir com instalação real via Xcode/TestFlight.
