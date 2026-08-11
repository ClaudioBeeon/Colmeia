# Colmeia — contexto do projeto

Ferramenta de Kanban criada para substituir o Runrun.it na Beeon (agência de marketing).
O usuário (Cláudio, coordenador de design) não programa — todo o código foi construído
em conversas guiadas com Claude. Sempre explicar mudanças em português simples, sem jargão
não explicado, e dar um resumo claro no final de cada tarefa.

## Localização real do repositório

IMPORTANTE: o repositório git de verdade fica em
`C:\Users\Usuario\Documents\GitHub\Colmeia` (remote: https://github.com/ClaudioBeeon/Colmeia.git).
A pasta `C:\Users\Usuario\Documents\Colmeia` (sem "GitHub") existe mas está vazia — não é o projeto.
Se uma sessão futura receber acesso a essa pasta vazia, pedir acesso à pasta correta antes de continuar.

## Arquitetura

- `index.html`, `js/*.js` (separado por assunto — ver "Estrutura do frontend (js/)" abaixo) e
  `css/*.css` = frontend. Publicado automaticamente no GitHub Pages a cada push.
  O CSS era um `style.css` único de ~3.200 linhas; em 2026-07-30 virou 5 arquivos por área
  (`01-base`, `02-quadro`, `03-detalhe`, `04-paginas`, `05-componentes`; em 2026-08-04 entrou o
  6º, `06-aprovacao`), carregados por tags
  `<link>` **nessa ordem exata** — em CSS, quando duas regras têm o mesmo peso, vence a escrita
  depois, então trocar a ordem muda a aparência. A checagem automática confere isso a cada push.
- Os arquivos `.gs` na raiz = backend, roda no Google Apps Script. Ver "Estrutura do backend (.gs)"
  abaixo. `Código.gs` tem que se chamar exatamente assim (com acento) — é o nome real do arquivo
  dentro do projeto do Apps Script (confirmado via `clasp clone`); um arquivo local chamado diferente
  (ex: sem o acento) faria o clasp criar um SEGUNDO arquivo lá dentro, duplicando funções e quebrando
  tudo. Desde 2026-07-28 o deploy é automático (ver seção "Deploy automático" abaixo) — não é mais
  preciso colar manualmente no editor do Apps Script.
- Backend integra com API do Runrun.it, Google Drive e Google Sheets (a planilha é o "banco de dados").
- Projeto irmão "painel-designers-beeon" (outro Apps Script) fornece tempo médio de criação por
  cliente e vínculos de nomes de cliente. URL dele está em `js/config.js` como `PAINEL_BEEON_API_URL`.
- URL do backend Colmeia está em `js/config.js` como `COLMEIA_API_URL`.

## Estrutura do backend (.gs) — dividido em 2026-07-30

O `Código.gs` era um arquivo único de ~3.000 linhas e foi dividido por assunto em 7 arquivos (hoje 8, com o `Bee.gs`), **sem
alterar nenhuma linha de código** (só movendo blocos). Diferente do frontend, aqui **a ordem dos
arquivos NÃO importa**: o Apps Script avalia todos os `.gs` do projeto antes de atender qualquer
requisição, e todos compartilham o mesmo espaço de nomes — qualquer função chama qualquer outra sem
"importar" nada.

- `Código.gs` (~350 linhas) — configuração (chaves, usuários, colunas), as **rotas** (`doGet`/`doPost`/
  `handleRequest`: quem responde a qual ação do front) e a varredura do quadro compartilhada em cache
  (`getTarefasColmeia`, `guardarNoCacheEmFatias`, `invalidarCacheDoQuadro`).
- `RunrunLeitura.gs` (~785 linhas) — tudo que só LÊ do Runrun.it: chamadas base (`runrunFetch`),
  `transformarTarefaParaColmeia`, buscas do quadro/card mãe/sequência/comentários/anexos/descrição.
- `RunrunEscrita.gs` (~340 linhas) — tudo que ALTERA algo no Runrun.it: play/pause, comentários,
  avançar/desfazer sequência, entregar/reabrir, mover etapa, datas, reatribuir, estimativa.
  Separado de propósito: é onde mora o risco de mexer em dado de verdade do time.
- `Drive.gs` (~525 linhas) — pastas de card, uploads recentes, atividades do Histórico, backup diário.
- `Planilha.gs` (~640 linhas) — tudo que lê/grava na planilha (links de clientes, pastas de cards,
  avisos, clientes ocultos, login, pessoas, prioridades, log de plays). Toda gravação passa por
  `pegarTravaDaPlanilha`.
- `IA.gs` (~335 linhas) — Groq/Gemini, frase do dia, briefing da tarefa, resumo da alteração.
- `Agenda.gs` (~100 linhas) — reuniões de hoje e resposta de convite.
- `Bee.gs` (~330 linhas) — a **Bee**, assistente dentro do card. Tem DOIS prompts separados de
  propósito: `beeResumo` (a primeira fala dela — só o que está escrito, cada item apontando pra
  mensagem exata de onde saiu) e `beeConversar` (a partir daí ela pode opinar, sugerir caminho
  criativo e montar prompt de imagem pro Firefly — palpite só existe se o designer pedir). A
  conversa fica na aba `BeeChat` da planilha, **uma linha por tarefa** (a conversa inteira dentro
  de uma célula), e é apagada 15 dias depois da entrega — o carimbo de entrega é posto pelo próprio
  `handleRequest` quando a entrega passa pelo Colmeia, e a limpeza roda junto do backup diário.
  Tem também a **Bee solta** (`beeConversarLivre`), a bolinha no canto da tela: ali ela NÃO lê tarefa
  nenhuma, é só uma especialista em design. A conversa livre é guardada na mesma aba, com a chave
  `livre-<nome>`. **Dois modelos de propósito:** `GEMINI_MODEL` (rápido) pra tudo que é leitura/resumo
  e `GEMINI_MODEL_CONVERSA` (forte, mais lento) só pra conversar — se o nome do modelo forte não
  existir, `chamarGeminiTexto` cai sozinho no rápido em vez de deixar a Bee muda.

- `AprovacaoInterna.gs` (~470 linhas) — a **conferência do atendimento** ANTES de a peça ir pro
  cliente: a fila (`listarConferenciasPendentes`), os dados da tela de conferência, o carimbo de
  aprovação e a devolução pro designer (que cria a subtarefa "Alteração VN" em Ajustes, com entrega
  hoje às 18h, ou faz o caminho alternativo quando o projeto do mês está fechado). Não confundir com
  `Aprovacao.gs`, que é o passo SEGUINTE — o link que o cliente abre. Ver seção própria abaixo.
- `PainelDesigners.gs` (~140 linhas) — PONTE pro Apps Script separado do projeto irmão
  painel-designers-beeon: a página "Painel de Designers" do Colmeia (js/pagina-painel-designers.js)
  fala com este arquivo, que repassa pro backend de lá (`PAINEL_BEEON_API_URL`) e devolve a
  resposta. O DADO continua morando na planilha de lá — só a tela mudou de casa. Ver seção própria
  abaixo.
- `Supabase.gs` (~180 linhas) — a ponte com o **banco de dados de verdade** (PostgreSQL no
  Supabase), que está substituindo a planilha aba por aba. Ver seção própria abaixo.

**Ao criar um arquivo `.gs` novo:** é obrigatório liberá-lo no `.claspignore` (que ignora tudo por
padrão), senão o clasp não o envia e o deploy passa "com sucesso" mas as funções dele não existem em
produção. A checagem automática (`.github/scripts/checar-arquivos-gs.js`) barra esse esquecimento.

## Estrutura do frontend (index.html)

Páginas trocadas via `hidden` attribute, todas dentro de `<section class="app-page" id="page-...">`:
- `page-kanban` — quadro principal (`#board`)
- `page-clientes`, `page-atendimento`, `page-tipos`, `page-runrun`, `page-horas`, `page-repasse`
  (a antiga `page-hoje`, a página "Histórico", foi incorporada dentro de `page-horas` em 2026-08-03 —
  ver seção própria abaixo)

## Estrutura do frontend (js/)

Em 2026-07-28 o antigo `script.js` (~6.000 linhas, um arquivo só) foi separado em 15 arquivos
(em 2026-07-30 o `detalhe-modal.js` passou de 2.000 linhas e virou 3, totalizando 17; em seguida
entrou a fila offline, 18; depois a Bee, 19; a página de horas, 20; a paleta de comando, 21; o
roteador de URL, 22; a história da peça, 23; o modo foco, 24; a página Bee, 25; a aprovação do
atendimento, 26; a Central do Atendimento, 27; a pílula de atenção, 28; e a página Painel de
Designers, 29) menores dentro
da pasta `js/`, cada um cuidando de um assunto. **Não é um sistema de build** — não tem bundler,
TypeScript, nem npm envolvido no frontend. É só HTML puro: o `index.html` carrega os 29 arquivos
com várias tags `<script src="js/...">` seguidas, **na ordem certa**, perto do fim do
`<body>`. Isso funciona porque tags `<script>` comuns (sem `type="module"`) compartilham o mesmo
espaço de variáveis globais do documento — é como se fosse um arquivo só, só que dividido em pedaços.

**Regra de ouro ao editar isso:** a ORDEM das tags `<script>` no `index.html` importa. Um arquivo
que aparece depois pode usar variáveis/funções de um arquivo anterior, mas não o contrário. Se
precisar mover uma função de um arquivo pra outro, verificar se ela usa algo que só existe em
arquivos que vêm depois dela na lista — se sim, ou move os dois juntos, ou ajusta a ordem das tags.

Arquivos, na ordem em que são carregados (`js/`):
1. `config.js` — ícones SVG, `columnsDef`, URLs da API, nomes de meses, avisinhos
   (toast/ilha/pílula) e o painel de diagnóstico (Ctrl+Shift+D).
2. `fila-offline.js` — `enviarEscritaNoBackend()`: toda ação de escrita que pode chegar
   atrasada sem problema passa por aqui. Se a internet estiver fora, fica guardada no
   navegador e vai sozinha quando voltar. Play/pause e avançar/entregar NÃO entram na fila
   de propósito (ver comentário no topo do arquivo).
3. `notificacoes-uploads.js` — checagem de upload em segundo plano, prompt de "repetir comentário".
4. `pessoas-fotos.js` — fotos de designers/atendimento, `avatarHTML`, `mapearTarefaDoBackend(t)`
   (normaliza dados vindos do backend), `calcularEstimatePct`.
5. `kanban-polling.js` — `agendarAtualizacaoKanban()`, `atualizarKanbanEmBackground()` (poll do quadro).
6. `painel-pessoas-clientes.js` — painel de Configurações, abas Pessoas e Clientes.
7. `regras-briefing.js` — regras de tarefa, geração de briefing por IA (`gerarBriefingComIA`).
8. `kanban-board.js` — `buildBoard()`, `render()`, `cardHTML()`, drag and drop do quadro.
9. `clientes-hub.js` — links/hub por cliente (Drive, banco de imagens, etc.).
10. `chat-comentarios.js` — chat flutuante (`abrirChatPanel`, `abrirThreadAqui`), comentários,
   edição de entrega desejada.
11. `detalhe-modal.js` — `openDetail(idx)`, `renderDetail()`, `closeDetail()`, `applyCommentsState()`,
    a sequência de responsáveis do cabeçalho (`renderSequenciaHTML`/`wireWorkflowArrows`), o menu de
    etapa, o cronômetro de 1s e o modo escuro. (Base do pop-up de detalhe da tarefa.)
12. `detalhe-cardmae.js` — fluxo do CARD MÃE: `buscarCardMaeDoBackend`, `abrirCardMae`,
    `precarregarCardMaeEmBackground`, aba "Descrição card mãe" e o "carrossel" do pill do cabeçalho
    (entregue → transferir o card mãe → editar a regra dele ali mesmo).
13. `detalhe-alteracao.js` — subtarefas de ALTERAÇÃO: `ehTarefaDeAlteracao`,
    `acharTarefaOriginalDaAlteracao`, `nomeDaPecaOriginalRapido` (usado no card do quadro),
    `carregarResumoDaAlteracao` (resumo por IA do que mudou) e a aba "Tarefa original".
14. `bee.js` — a **Bee** no chat da tarefa. O painel de comentários tem dois chats, escolhidos
    pelos ícones do topo: "Comentários" (vai pro Runrun.it) e "Bee" (fica só no Colmeia) — a
    separação é proposital, o pior erro possível seria mandar pro cliente uma pergunta que era pra
    ela. A primeira fala dela é o resumo do que a tarefa pede, com etiqueta de origem clicável em
    cada item (`irParaOrigemDoItem` pula pra mensagem exata e acende ela). **Nada daqui vai pro
    Runrun.it sozinho**: `mandarMensagemProRunrun` só joga o texto no campo pra revisar.
15. `paginas-designers.js` — painel dos designers (tempo médio por cliente), página "Meus clientes"
    e "Clientes por atendimento".
16. `pagina-tipos-runrun.js` — página "Tipos de tarefas" e "Runrun completo".
17. `pagina-repasse.js` — página "Fila de repasse", `mostrarPagina(page)` (troca de página do app).
18. `pagina-horas.js` — página "Minhas horas" (tem cronômetro próprio de 1s, desligado ao sair).
19. `notificacoes-avisos.js` — notificações de comentário não lido, avisos do coordenador.
20. `paleta-comando.js` — a **paleta de comando** (Ctrl+Espaço). Ver seção própria abaixo.
21. `roteador-url.js` — link direto pra tarefa/página pela URL (`/11503`, `/minhas-horas`). Ver
    seção própria abaixo.
22. `detalhe-historia.js` — os **eventos do sistema** (criada, começou a trabalhar, arquivo, entregue)
    que alimentam a pílula "Linha do tempo" do painel de comentários. Ver seção própria abaixo.
23. `modo-foco.js` — o **modo foco** (sessão de trabalho por tempo marcado). Ver seção própria abaixo.
24. `pagina-bee.js` — a página **Bee** (feed de atividades + o painel de verdade da Bee do lado).
    Ver seção própria abaixo.
25. `pagina-aprovacao.js` — a **aprovação interna do atendimento** (a fila, a conferência, o envio
    e a devolução), mais `pedirAprovacaoDoAtendimento`, o ponto único por onde uma peça entra na
    fila. Ver seção própria abaixo.
26. `central-atendimento.js` — a **Central do Atendimento** (overlay próprio: abas Hoje, Radar de
    clientes, Aprovações e Minhas métricas, mais o calendário de postagens e o pop-up dos grupos).
27. `central-atencao.js` — a pílula **"Precisa de atenção"** no rodapé da Timeline da Central e a
    revisão que ela abre. Ver seção própria abaixo.
28. `pagina-painel-designers.js` — a página **Painel de Designers** (a tela principal do projeto
    irmão painel-designers-beeon, trazida pra dentro do Colmeia) e a aba "Vincular clientes" das
    Configurações do coordenador. Ver seção própria abaixo.
29. `login-boot.js` — tela de login, restaurar sessão salva, ponto de partida do app.

É grande ainda mesmo dividido — usar grep dentro de `js/` em vez de ler um arquivo inteiro quando
só precisar achar uma função.

## "Essa tarefa é minha?" — usar `ehMinhaTarefa`, não comparar nomes (2026-07-30)

`nomesCorrespondem(a, b)` compara nomes por "um é começo do outro" (acerta "Gio" = "Giovanna", mas
confundiria "Manu" com "Manuel" E com "Manuela"). Isso é aceitável pra achar FOTO de alguém, mas era
arriscado pra decidir de quem é uma tarefa — decisão que define o que aparece no seu quadro, o que
entra na Fila de repasse e de que tarefas você é notificado.

Agora o backend devolve `assigneeId` (id real do Runrun.it) em toda tarefa, e o login devolve
`runrunId` de quem entrou (guardado em `DESIGNER_ID_LOGADO` e na sessão salva). **Use sempre
`ehMinhaTarefa(t)`** (js/paginas-designers.js) — ela compara por id quando os dois lados têm, e cai
na comparação por nome quando falta algum (backend antigo, sessão salva de antes), então nada quebra.

Comparação por NOME continua certa (e inevitável) só onde o nome é a única informação que existe:
autor de comentário, menções (`<mention>`), dono de arquivo no Drive, o seletor de designer do
coordenador, os dados do painel-designers-beeon (que é indexado por nome) e `souClaudio()`.

## A paleta de comando — Ctrl+Espaço (2026-08-03)

`js/paleta-comando.js` + o bloco no fim de `css/05-componentes.css`. Ctrl+Espaço (Cmd+Espaço no Mac)
abre uma janelinha no meio da tela: busca tarefa/cliente/responsável, executa ação e troca de página.
Esc fecha.

**Por que não é Ctrl+K, a escolha óbvia:** testado e confirmado que tanto o Firefox quanto o Chrome
reservam Ctrl+K pra focar a busca da barra de endereço, NO NÍVEL DO NAVEGADOR — a página nunca chega
a ver o evento, então `preventDefault()` não alcança. Não é bug de código, é decisão dos dois
navegadores. Ctrl+Espaço não é reservado por nenhum dos dois nem é atalho comum de teclado português.

**É HÍBRIDA de propósito, e isso é a decisão principal do arquivo:** tudo que aparece na lista é
calculado no navegador, na hora, **sem nenhuma ida ao backend** — por isso responde instantâneo e
funciona com a internet fora. A Bee de verdade (que pensa, demora alguns segundos e precisa de rede)
só entra quando a pessoa **escolhe** a última linha, "Perguntar pra Bee" — nunca sozinha. Mandar tudo
pra IA interpretar deixaria "achar uma tarefa", a coisa mais repetida do dia, dependente de rede.
Por isso a linha da Bee é sempre a ÚLTIMA: pra nunca ser a escolha acidental do Enter.

- **Ordenação por relevância:** `paletaNota()` dá 3 (começa igual), 2 (começo de palavra), 1 (só
  contém) ou 0 (não serve), sempre sem acento e em minúsculo. As notas de título/cliente/responsável
  são **somadas** (peso 3/2/1), não `Math.max` — com `max`, uma tarefa que casa no título E no
  cliente empatava com uma que só casa no cliente, e o desempate virava a ordem crua do array.
- **Ações contextuais** só aparecem quando têm alvo: "Pausar" só se algo está rodando, "Abrir a
  pasta no Drive"/"Dar play" só com card aberto. Ação sem alvo não deve aparecer nem apagada.
- Abrir tarefa usa `abrirTarefaPorId()` (js/detalhe-modal.js), que já sabe buscar avulsa no
  Runrun.it quando ela não está carregada — por isso a busca pode varrer `tasksTodas` inteiro.
- O atalho é registrado no `document` em **fase de captura** (`true`), pra pegar o Ctrl+Espaço antes de
  qualquer campo de texto da tela. O Esc também é capturado ali: sem isso, apertar Esc com a paleta
  aberta fechava o CARD atrás dela.
- Carregada por último (só antes do `login-boot.js`) porque usa função de quase todo mundo.

## O roteador de URL — link direto pra tarefa e página (2026-08-03)

`js/roteador-url.js` + `404.html` na raiz do repositório. Faz o endereço do navegador virar algo
útil: `.../11503` abre direto a tarefa 11503, `.../minhas-horas` abre a página de horas, `.../` (nada
depois) é o quadro. Com isso: dá pra mandar o link de uma tarefa pra alguém, apertar F5 sem perder o
lugar, e o botão Voltar/Avançar do navegador passa a funcionar de verdade dentro do app.

**Por que existe o `404.html`:** o Colmeia é só arquivo estático no GitHub Pages, sem servidor que
entenda `/11503` como uma rota — navegação DENTRO do app usa `history.pushState` e nunca passa perto
do GitHub, mas um link aberto DE FORA (colado, favoritos) ou um F5 vira um pedido por um arquivo
chamado "11503" que não existe. O GitHub cai no `404.html`, que guarda o caminho pedido numa
"encomenda" (`sessionStorage`) e manda a pessoa de volta pro `index.html` de verdade — que lê essa
encomenda (`restaurarRotaPendente`, primeira coisa que roda no arquivo) e conserta a URL visível antes
até da tela de login. É a técnica padrão pra SPA em GitHub Pages, sem nada exótico.

**`ROTA_BASE` não tem o nome do repositório escrito na mão:** usa `new URL(".", location.href)`, que
acha sozinho a pasta onde o `index.html` está publicado. Funciona tanto na URL de hoje
(`claudiobeeon.github.io/Colmeia/...`) quanto na de amanhã (`colmeia.beeon.com.br/...`, quando o
domínio entrar no ar) **sem precisar mexer no código** quando isso acontecer — o mesmo raciocínio vale
pro `404.html`, que calcula a base do mesmo jeito.

- **Três ganchos, ligados nos lugares certos:** `roteadorAoMostrarPagina` (fim de `mostrarPagina`,
  js/pagina-repasse.js), `roteadorAoAbrirTarefa` (fim de `openDetail`, js/detalhe-modal.js) e
  `roteadorAoFecharTarefa` (fim de `closeDetail`, js/detalhe-modal.js) — todos atrás de
  `typeof ... === "function"`, o mesmo padrão já usado em `mostrarPagina` pra `fecharPaginaHoras`.
- **Fechar substitui a URL (`replaceState`), abrir empilha (`pushState`):** abrir uma tarefa cria uma
  entrada nova no histórico (Voltar retorna pra página de antes); fechar ela manualmente (X ou Esc)
  troca essa MESMA entrada de volta pra URL da página, em vez de empilhar mais uma — sem isso, Voltar
  depois de fechar uma tarefa reabria ela de novo antes de sair de verdade.
- **A trava `roteadorReagindoAoHistorico`:** existem dois momentos em que o app precisa se atualizar A
  PARTIR da URL (o carregamento inicial de um link direto, e o botão Voltar/Avançar) — nesses dois, a
  URL já está certa, e os três ganchos acima não podem escrever por cima dela de novo no meio da
  reconciliação (ex: "mostra o quadro de fundo, depois abre a tarefa" escrevendo a URL do quadro por
  cima da URL da tarefa que era pra ficar). A trava desliga os ganchos só durante esses dois momentos.
- **Comparação de ID por `String()`** em `abrirTarefaPorId` (js/detalhe-modal.js) — o roteador manda o
  ID como texto (veio da URL), `task.id` vem como número do backend; sem `String()` dos dois lados, um
  link direto pra uma tarefa que já estava carregada caía sempre no caminho lento de buscar de novo.
- Carregado logo depois da paleta de comando (mesmo motivo: usa função de quase todo mundo).

## Uma fala só quando um arquivo sobe pelo Colmeia (2026-08-08)

Arrastar um arquivo pro card gerava DUAS bolhas da Bee sobre o mesmo arquivo: a de
`registrarFalaDaBeeSobrePasta` ("Subiu X na pasta do card. Quer que eu faça algo com isso?", com
conferir/comparar), instantânea, e a de `renderNotificacoesUpload` (js/notificacoes-uploads.js), com
o mosaico de miniaturas e o **"Enviar para revisão"** — a ação que importa — que só chegava na
varredura seguinte. Duas falas, e a útil vinha por último e devagar.

- **A primeira bolha some no caminho do upload**, e SÓ nele: `registrarFalaDaBeeSobrePasta` agora
  recebe `origem` ("upload" ou "link"). ⚠️ No caminho do **link do Drive colado num comentário** ela
  continua aparecendo, e tem que continuar — ali não subiu arquivo pela pasta, então
  `renderNotificacoesUpload` não acharia nada e a Bee ficaria muda.
- **A fala continua GRAVADA na conversa da Bee** (`beeConversas`), como sempre. O que saiu foi só a
  exibição automática no chat de Comentários.
- **A segunda vem na hora:** `subirArquivoArrastadoParaCard` chama `renderNotificacoesUpload`
  direto ao terminar, e `subirArquivoNoCard` (Drive.gs) chama `invalidarCacheDeUploadsDoCard` —
  sem isso o cache de 15s de `buscarUploadsRecentesDoCard` (feito pro polling de 8s) podia devolver
  a lista velha, sem o arquivo que acabou de subir.

## Preview de imagem do Drive (2026-08-03)

Mostrar uma imagem que mora no Drive DENTRO do Colmeia (preview pequeno, clique amplia quase em tela
cheia) — usado primeiro na fala da Bee que avisa upload novo (js/notificacoes-uploads.js), com
`abrirImagemAmpliadaDoDrive` (js/config.js) feito de propósito pra ser reaproveitado por outras telas
que também vão precisar disso (parede do cliente, antes e depois).

- **Sempre passa pelo backend**, nunca linka a URL do Drive direto numa `<img>`: nem todo arquivo tem
  "qualquer pessoa com o link" habilitado, e a conta do Apps Script já tem acesso à pasta de qualquer
  jeito. Duas ações separadas em Drive.gs: `buscarThumbnailDrive` (usa `getThumbnail()`, um JPEG
  baixinho que o próprio Google já gera — rápido, pro preview pequeno) e `buscarImagemCheiaDrive`
  (usa `getBlob()`, a imagem de verdade — só buscada quando clica pra ampliar). Mesmo limite de 25MB
  e mesmo formato de erro do `baixarDocumentoAnexo` (anexos do Runrun.it).
- `listarUploadsRecentesDaPasta` (Drive.gs) agora também devolve `id` e `mimeType` de cada arquivo —
  é o que o front-end usa pra saber "isso é imagem, vale tentar mostrar preview" (`ehImagemPreviewable`).
- O visualizador ampliado captura Esc em **fase de captura**, mesmo padrão da paleta de comando: se
  ele está aberto, o Esc fecha ELE, não o card por trás.

## Painel de comentários: pílulas "Todos os comentários"/"Linha do tempo" (2026-08-03)

Antes disso, "Linha do tempo" (juntar os comentários da alteração + tarefa original + card mãe) só
existia pra subtarefa de ALTERAÇÃO, e a "aba História" (criada → começou a trabalhar → arquivo →
entregue) vivia sozinha, do lado da Descrição, sem nenhum comentário junto. Os dois foram fundidos e
generalizados pra QUALQUER tarefa dentro do próprio painel de comentários, como duas pílulas novas:

- **"Todos os comentários"** — mistura, por hora, os comentários desta tarefa + card mãe (se tiver) +
  tarefa original (se for alteração) + a conversa com a Bee (se o interruptor estiver ligado).
- **"Linha do tempo"** — a mesma coisa + os eventos do sistema (criada, começou a trabalhar, arquivo,
  entregue) — substituiu de vez a antiga aba "História" (removida do lado da Descrição).

**Sub-pills cinzas, não mais um menu suspenso:** o antigo botão "Comentários ∨" que abria uma listinha
virou uma fileira de pílulas sempre visível (`.chat-subpills`, `#chatSubAqui`/`#chatSubMae`/
`#chatSubTodos`/`#chatSubLinha`) logo abaixo do cabeçalho — sem precisar clicar pra revelar as opções.
Por causa disso o gomo "Comentários" do cabeçalho (a pílula amarela ao lado da Bee) **parou de mudar
de nome**: fica sempre "Comentários", já que quem mostra ONDE você está agora é a fileira de baixo.
`atualizarSubpillsAtivas()` (js/chat-comentarios.js) troca qual pílula fica marcada e mostra/esconde o
interruptor da Bee; `marcarAbaBeeAtiva()` (js/bee.js) esconde a fileira inteira enquanto a Bee está
aberta (não faz sentido nenhuma pílula lá).

**A generalização junta 4 fontes possíveis, cada uma com sua própria busca:**
- Comentários daqui, do card mãe e da tarefa original — `buscarFontesDeComentarios(task)`, extraído
  do que já era a lógica da antiga "Linha do tempo" de alteração (`cardMaeCache`/
  `acharTarefaOriginalDaAlteracao`), agora chamado pra QUALQUER tarefa (cada ponta que não existir
  simplesmente devolve `[]`).
- Bee — `buscarBeeComoComentarios(task)`, ação `beeHistorico`, convertida pro mesmo formato de
  comentário (`_origem: "Bee"`). **Só entra se `chatMostrarBeeNoUnificado` estiver ligado** — ver o
  interruptor abaixo.
- Eventos do sistema (só na Linha do tempo) — `buscarEventosComoComentarios(task)`
  (js/chat-comentarios.js) chama `montarEventosDoSistema` (js/detalhe-historia.js, a mesma fonte de
  dados de quando isso era a aba "História" — `buscarHistoriaDaTarefa`, Código.gs), convertendo cada
  evento num pseudo-comentário com `_icone` (🐣▶️📎✅) e `_somenteLeitura: true`. **De propósito SEM
  comentário nenhum misturado aqui dentro** (a antiga `montarEventosDaHistoria` misturava — a nova
  `montarEventosDoSistema` não) — os comentários de verdade já vêm da fonte acima; incluir de novo
  duplicaria.
- A descrição da tarefa entra como a primeira mensagre, só leitura (`pseudoComentarioDescricao`) —
  mesma ideia de antes, generalizada pras duas pílulas.

**`_somenteLeitura: true`** (Bee, eventos, descrição) tira os botões de reagir/editar/excluir da bolha
em `renderComentariosHTML` — antes esse campo existia só na descrição e nunca era checado de verdade
(os botões apareciam mesmo assim, um comentário fantasma clicável); agora é respeitado.

**Interruptor "mostrar comentários da Bee"** (`#chatBeeToggleRow`, só aparece nas duas pílulas de
merge): preferência por designer em `localStorage` (`colmeia_comentarios_bee_v1_<nome>`, começa
ligado). Ligar/desligar **não rebusca nada** — `alternarBeeNoUnificado` só re-desenha com o que já foi
buscado (a Bee é buscada sempre, só é filtrada na hora de montar a lista).

**Enviar um comentário nas duas pílulas de merge pergunta ONDE, em vez de adivinhar** (pedido do
Cláudio): clicar em Enviar abre `#chatDestinoMenu` (reaproveita o CSS de `.chat-hdr-menu`, só que
ancorado pra CIMA — `.chat-destino-menu`, porque o campo de escrever fica no rodapé do painel) com até
4 botões — "Nesta tarefa" (sempre), "Card mãe"/"Tarefa principal" (só se existirem) e "Todos" (só
aparece se tiver mais de 1 destino real — manda a MESMA mensagem, em sequência, pra cada um).
`enviarParaAlvo(alvoId, texto, arquivo, ofereceRepetir)` é o envio de verdade, compartilhado entre o
caminho normal (Comentários/Card mãe, onde o destino já é óbvio, sem seletor) e o seletor.

Fora das pílulas de merge, nada mudou: comentar em "Comentários" ou "Card mãe" ainda vai direto pro
lugar óbvio, sem perguntar nada.

## Modo foco (2026-08-03)

`js/modo-foco.js` + o bloco no fim de `css/05-componentes.css`. Uma sessão de trabalho concentrado
por tempo marcado: botão "🧠 Focar" no cabeçalho da tarefa (25/50/90 min) — enquanto ativo, sidebar e
os ícones do topo somem (`body.modo-foco-ativo`), os avisos da ilha ficam guardados em vez de
interromper (aparecem juntos quando o foco termina), e o resto do time vê "Fulano em foco até 15:40"
no card dela no quadro.

**Botão separado do play de propósito:** o play continua sendo só o cronômetro, do jeito que sempre
foi — muita tarefa é rápida demais pra merecer o modo foco. É uma escolha à parte, feita quando a
pessoa realmente quer se isolar.

- **HUD flutuante, não o botão do cabeçalho, é a fonte de verdade enquanto ativo:** `focoBotaoHTML()`
  devolve vazio quando já está em foco — o `.foco-hud` (fixo, sempre visível, sobrevive a fechar a
  tarefa) é quem mostra o status e o botão de sair, pra não duplicar controle em dois lugares.
- **A ilha (`mostrarIlha`, js/config.js) é interceptada ANTES de entrar na fila normal**, via
  `typeof focoEstaAtivo === "function" && focoEstaAtivo()` — se estiver em foco, o evento vai pro
  array `focoAvisosGuardados` em vez de aparecer. Ao sair do foco, cada um desses eventos é jogado de
  volta pra `mostrarIlha` (que por essa hora já não intercepta mais nada, `focoAteQuando` já é null) —
  reaproveita a fila de exibição de sempre, um por vez, em vez de inventar uma segunda.
- **"O time vê" é assíncrono e barato de propósito:** `entrarEmFoco`/`sairDoFoco` (Planilha.gs, aba
  "Foco", 1 linha por designer, sempre reescrita) mexem só na planilha; quem enxerga o selo 🧠 no
  card de outra pessoa (`assignee-foco-badge`, js/kanban-board.js) é através da PRÓXIMA varredura do
  quadro (`getTarefasColmeia`, Código.gs, mescla `getFocosAtivos()` por nome do responsável) — o mesmo
  atraso de até ~45s que qualquer outra mudança de quadro já tem, não precisa ser instantâneo.
- **Comparação por NOME** pra casar foco com tarefa (`t.assignee === designer`) é aceitável aqui: é
  status de PESSOA, não decisão de "de quem é a tarefa" (o caso que o CLAUDE.md pede id de verdade).
- Carregado depois do roteador de URL (mesmo motivo dos outros dois: usa função de quase todo mundo).

## "Retomar" na pílula do topo (2026-08-03)

`ultimaTarefaPausada` (js/kanban-polling.js) — quando a pessoa pausa uma tarefa de propósito (pra
atender uma prioridade, por exemplo) sem entregar nem passar pra frente, um selo circular preto
(`#retomarBadge`, index.html) aparece DENTRO da própria pílula amarela, colado na borda esquerda
dela — só o ícone em repouso, expande por cima do amarelo mostrando "↻ Retomar `<nome da tarefa>`"
no `:hover`. Clica e volta a tocar, sem precisar procurar o card no quadro.

**Dentro do envelope da pílula, mas fora do carrossel dela:** `#retomarBadge` mora dentro de
`.now-playing-wrap` (mesmo elemento que guarda `.now-playing`/`.now-playing-idle`/`.pill-notif`) pra
herdar a altura e o cantos arredondados certos, mas não participa do sobe-desce entre esses três
estados — fica sempre visível, inclusive com OUTRA tarefa rodando. `position: absolute` com
`top`/`bottom` (em vez de um `height` fixo) faz a altura dele acompanhar a da pílula de verdade; é
isso que evita o corte no topo que dava numa versão anterior (selo fora da pílula, com altura solta
que não batia com a da pílula ao lado). Quando visível, a classe `.tem-retomar` no wrap empurra pra
direita o conteúdo centralizado de `.now-playing`/`.now-playing-idle`/`.pill-notif` (mesmo padrão já
usado por `.tem-reuniao-proxima`, só que do lado esquerdo) — sem isso o texto centralizado ficaria
por baixo do ícone.

**Some depois de DUAS tarefas diferentes tocadas, não uma:** uma pausa rápida pra atender uma
prioridade não deve fazer a pessoa perder o fio do que estava fazendo antes — só na SEGUNDA tarefa
diferente é que se considera "seguiu em frente de vez". `_outrasTarefasTocadasDesdeQuePausou`
(js/kanban-polling.js) é um `Set` de ids (não um contador solto): tocar a MESMA outra tarefa duas
vezes não conta em dobro. Tocar a PRÓPRIA tarefa marcada (retomou ela) zera tudo na hora — é
exatamente pra isso que o selo existe.

**Só pause MANUAL marca** (a pessoa escolheu parar, não o Colmeia pausando sozinho por outro
motivo) — `marcarUltimaTarefaPausada(taskId)` é chamada nos 6 cliques de pausar de verdade
(pílula do topo, botão do card no quadro, botão dentro do card aberto, pílula de coordenação, a
paleta de comando, a página Minhas horas), e reseta o contador de outras tarefas (é uma marca NOVA).
NÃO é chamada em `pararOutrasTarefasRodando` (para a tarefa VELHA sozinho quando uma nova começa)
nem no pause de segurança da entrega — esse último, inclusive, LIMPA a marca se bater com a tarefa
entregue: não faz sentido oferecer "Retomar" algo que acabou de ser concluído. Ao adicionar um novo
botão de pausar no futuro, decidir esse mesmo jeito: pause escolhido pela pessoa marca (e reseta o
contador), pause automático do sistema não.

## Cabeçalho do painel de comentários (2026-08-03)

`js/detalhe-modal.js` (markup) + o bloco `.chat-panel-header`/`.chat-hdr-*` em css/03-detalhe.css.
Segue o mesmo padrão visual da barra escura do quadro (`.topbar-dark`/`.now-playing-wrap`,
css/01-base.css): voltar (círculo preto solto, à esquerda) | barra preta arredondada, dividida em dois
"gomos" — Comentários (`#chatPanelMenuBtn`) e a Bee (`#chatIconeBee`, um botão largo com o texto "Bee",
não um ícone sozinho). **O gomo "Comentários" tem rótulo FIXO** (nunca muda de texto, nem quando a
conversa ativa é Card mãe/Todos os comentários/Linha do tempo) — quem mostra ONDE você está é a
fileira de pílulas cinzas logo abaixo (`.chat-subpills`, ver a seção "Painel de comentários: pílulas
'Todos os comentários'/'Linha do tempo'" mais abaixo), não mais um menu suspenso escondido atrás de
uma setinha (isso existiu brevemente e foi substituído no mesmo dia).

**Só um gomo "aceso" (amarelo) por vez, como um controle segmentado, SEM stroke nenhum:**
`marcarAbaBeeAtiva(ativa)` (js/bee.js) já acendia `.chat-hdr-bee.active`; agora também apaga o outro
gomo com `.chat-aba-atual.aba-apagada`. Nenhum dos dois estados usa borda — só o preenchimento amarelo
(ou a ausência dele) diferencia qual está aceso; o contorno claro que existia antes no estado apagado
foi tirado a pedido (ficava competindo visualmente com o preenchimento). Simétrico nos dois sentidos:
sair da Bee (`abrirThreadComentarios`) já limpa `.active` da Bee, e entrar nela apaga o gomo dos
comentários (e some com a fileira de pílulas inteira — não fazem sentido do lado da Bee).

**Os dois gomos têm o MESMO tamanho, e isso exigiu um truque de estrutura:** `flex:1` nos dois pareceria
bastar, mas um `<button>` como item flex direto resiste a encolher até o tamanho do irmão mesmo com
`min-width:0` (motor do navegador reserva um mínimo intrínseco próprio de elemento de formulário) —
testado isoladamente e confirmado: o botão da Bee sempre ficava ~18px mais largo que o dos Comentários
(exatamente o padding horizontal do botão). Um `<div>` não tem essa reserva. Por isso o botão da Bee
mora dentro de um `<div class="chat-hdr-bee-wrap">` que é quem recebe o `flex:1`, e o gomo dos
Comentários dentro de um `<div class="chat-abas-wrap">` do mesmo jeito — os dois flex-items da barra
são DIVs, nunca BOTÕES direto.

**Avatarzinho redondo em cada gomo, cor FIXA (não muda com aceso/apagado):** `.chat-hdr-avatar-bee`
(fundo amarelo, ícone preto) reusa o mesmo `beeIcon` (js/bee.js) usado em toda foto da Bee no app —
"o padrão que já usamos", não um ícone novo. `.chat-hdr-avatar-comentarios` reusa o `chatIcon`
(js/config.js, o mesmo do botão flutuante de comentários) com um fundo escuro fixo — não existe uma
cor "oficial" de comentários no app, então foi inventada uma (grafite), simétrica ao amarelo da Bee.

**Animações leves, no mesmo vocabulário já usado no resto do app:** trocar de gomo aceso anima cor
(`var(--dur-base)`); o popup do seletor de destino (`.chat-hdr-menu`, ver a seção de baixo) ganha um
"pop" leve ao abrir (`@keyframes chatHdrMenuPop`, mesma família do `commentPop` que as bolhas de
comentário já usavam).

## A página "Histórico" virou parte de "Minhas horas" (2026-08-03)

A página própria "Histórico" (`page-hoje`, nav "Histórico") deixou de existir. Ela tinha duas seções:
"O que você deu play hoje" (removida de vez, sem migrar pra lugar nenhum) e "Atividades recentes"
(arquivos novos nas pastas do Drive dos clientes) — essa segunda passou a viver dentro da página
"Minhas horas" (js/pagina-horas.js), no card que antes mostrava "Horas realizadas / Comparativo
semanal / Horas previstas / Dias travados" (`.hr-lista`, embaixo da foto do designer, ao lado do card
escuro "Tarefas entregues"). A pedido do Cláudio, esse conteúdo de comparativo SUMIU — não foi
realocado pra lugar nenhum — o card agora é só a lista de atividades recentes.

- `renderAtividadesRecentesHoras()` (js/pagina-horas.js) substituiu `renderComparativo()`; a busca
  (`buscarAtividadesDrive`) entrou como a 4ª chamada paralela de `carregarDadosDaPaginaHoras()` — o
  mesmo padrão de `horasEntregues` (variável de módulo `horasAtividades`, preenchida uma vez e lida
  pelo render). `nomeDaPastaDoCaminho()` (js/paginas-designers.js) foi reaproveitada — é só o helper
  "pega o último pedaço do caminho", não tinha nada de específico da página antiga.
- **`horasSemanaPassada` continua existindo**, mesmo com o comparativo removido: `renderMetricas()`
  (o "Nesta semana"/"Últimas 2 semanas" no topo da página) também dependia dela — só o card visual de
  comparativo (e a busca teórica de "subiu/desceu vs. semana passada") foi removido, a busca da semana
  anterior em si continua rodando em segundo plano do mesmo jeito.
- Removido junto (ficou órfão sem a página Histórico): `montarCarrosselSetas` (js/config.js, só
  existia pro carrossel horizontal de lá), todas as classes `.historico-*`/`.hoje-list`/
  `.atividades-list`/`.hr-lis-*` em css, as entradas `hoje` em `pageTitles`
  (js/paginas-designers.js), `ROTEADOR_SLUGS` (js/roteador-url.js) e na lista "Ir para" da paleta de
  comando (js/paleta-comando.js), e o `if (page === "hoje") ...` em `mostrarPagina()`
  (js/pagina-repasse.js). A ação de backend `buscarTarefasHoje` (o "log de plays" de "O que você deu
  play hoje") não foi tocada no `.gs` — ficou sem uso no front, mas não há necessidade de mexer no
  backend só por isso.

## Sugestão de programa pra abrir + bug do link de "Acesso rápido" (2026-08-03)

**O bug:** `salvarAcessoRapido` (Planilha.gs) forçava `https://` na frente de QUALQUER link que não
começasse com `http`/`https` — um link de abrir programa direto (`adbps:///`, o Photoshop configurado
por fora pelo Cláudio) virava `https://adbps:///`, um endereço quebrado que o navegador não sabia mais
abrir. Trocado pra só completar com `https://` quando o link não tem NENHUM protocolo — agora
`algumacoisa://` de qualquer nome passa direto.

**A sugestão:** no painel de detalhe da tarefa, logo abaixo de "Criar pasta do card", um bloco
"Sugestão pra abrir" aparece quando o TÍTULO da tarefa contém "feed"/"stories"/"story" — mostra Ps
(Photoshop) e Ai (Illustrator) como pílulas coloridas (cores oficiais da Adobe), que abrem os programas
direto via `adbps:///`/`adbai:///` (`sugestaoDeProgramaHTML`/`SUGESTOES_DE_PROGRAMA`,
js/detalhe-modal.js). **Baseado só no título, não na descrição:** a descrição só chega depois, em
`carregarTudoDaTarefa` — se a sugestão dependesse dela, ficaria errada (ausente) na primeira olhada,
bem quando mais importa. **Só Photoshop/Illustrator por enquanto:** Premiere e After Effects ficaram
de fora — Reels/vídeo/animação sugeriria eles, mas não existe (ainda) um jeito de abrir eles direto
igual o Photoshop/Illustrator têm; a estrutura (`SUGESTOES_DE_PROGRAMA`) já está pronta pra adicionar
uma regra nova assim que tiver o link.

## Aprovação interna do atendimento (2026-08-04)

`js/pagina-aprovacao.js` + `AprovacaoInterna.gs` + `css/06-aprovacao.css` + os blocos no
`index.html`. O portão que faltava no fluxo: antes disso qualquer um gerava o link do cliente
direto, sem ninguém conferir. Passou a ser designer conclui → **atendimento confere** → o mesmo
clique prepara o link do cliente → cliente responde (`aprovar.html`, que já existia).

**Foi feito em duas etapas, por duas sessões:** primeiro a camada visual inteira (as 5 telas, com
conteúdo de exemplo e um esqueleto de JS documentado função por função), depois a funcional, que
manteve o layout como estava e só ligou os dados. Vale repetir o método quando o desenho importa:
desenhar primeiro, sem estrutura imposta por quem vai codar, e implementar uma vez só por cima do
layout final.

### Como uma peça ENTRA na fila (decisão do Cláudio, 04/08)

Não é etapa nova no quadro: é o **designer** que manda, por **dois caminhos**, e os dois chamam a
MESMA ação `pedirConferenciaInterna`.

1. **A fala da Bee de "arquivo novo"** (js/notificacoes-uploads.js) ganhou a pastilha principal
   "Enviar para revisão". É o caminho automático — aparece na hora em que a peça
   acabou de ficar pronta, sem ninguém precisar lembrar de nada.
2. **O botão "Enviar para revisão"** — que vira **"Acessar página de aprovação"** depois de usado
   (`verificarRevisaoJaEnviada`), mesma ideia do "Criar pasta do card" → "Acessar pasta do card"
   logo acima dele: botão que não muda depois de usado convida a clicar de novo sem querer, e quem
   clica não tem como saber se já mandou. **O estado vale pra FAMÍLIA inteira** (card mãe +
   subtarefas), porque a pasta do card — e portanto a peça — é a mesma pros três: mandar pela
   subtarefa e abrir o card mãe tem que mostrar o mesmo estado, senão a pessoa manda de novo achando
   que não tinha mandado. `idsDaFamiliaDaTarefa` reaproveita o `cardMaeCache` que já é preenchido
   quando uma subtarefa abre, então quase nunca custa uma ida a mais ao servidor — mesma ideia do
   `buscarOuHerdarPastaCard`. Fica na coluna da direita do card, junto do Hub do
   cliente (`#apvPedirBtn`, js/detalhe-modal.js).

**Qual peça vai:** com mais de uma peça na pasta (Feed e Stories são peças diferentes; "Feed - v1" e
"Feed - v2" são a mesma), abre o menu de escolha — todas marcadas por padrão. Com uma peça só, vai
direto sem perguntar. É `abrirEscolhaDePeca` (js/detalhe-modal.js), **o mesmo menu do link de
aprovação do cliente**, agora parametrizado (`titulo`/`rotuloBotao`/`aoConfirmar`) em vez de
duplicado. O que segue pro backend é o **nome da peça**, nunca o `fileId`: a fila guarda a peça, e
qual arquivo dela está valendo é lido do Drive na hora — é isso que faz a tela perceber sozinha
quando chega versão nova depois do pedido.

**Mandar pra revisão faz DUAS coisas:** põe a peça na fila da tela de conferência **e** deixa no
campo de comentário um texto com o **link direto da conferência daquela peça**
(`rascunharComentarioDeRevisao` + `roteadorLinkDaConferencia`). O comentário não é enfeite — o
atendimento trabalha no **Runrun.it** e não fica olhando a fila do Colmeia sozinho; é o comentário
que avisa e traz eles até cá. **Nada vai pro Runrun.it sozinho:** o texto fica no campo pro designer
revisar e clicar em enviar, mesmo comportamento do "Adicionar ao comentário" que a fala da Bee já
tinha. O link é `.../aprovacoes?tarefa=<taskId>&peca=<nome>` — aponta pra PEÇA, não pra fila, senão
quem clica teria que procurar de novo numa lista.

> ⚠️ **Toda rota do app tem UM pedaço só depois da base**, e os parâmetros vão na **query**. A
> primeira versão desse link era `/aprovacoes/114526` e travou o app inteiro piscando sem parar: o
> `404.html` (que é quem atende link colado e F5) sobe **uma** pasta pra achar o index.html, então
> dois pedaços viravam `/aprovacoes/`, que também não existe — 404 de novo, e de novo. Desde então o
> `404.html` tem um contador de voltas que, na terceira passagem, joga a pessoa na raiz em vez de
> deixar ela presa (`colmeiaBounce404`, zerado por `restaurarRotaPendente` quando o app abre de
> verdade). **Ao criar rota nova, parâmetro na query.**

**Por que dois e não um:** a fala da Bee depende da varredura de 8s da pasta do Drive e some
quando é dispensada. Se fosse o único caminho, uma peça ficaria parada só porque a notificação
passou batido. É o mesmo par de "Criar pasta do card" + "Linkar pasta certa" — o caminho fácil, e
a saída manual pra quando ele falha. **Ao criar um terceiro ponto de entrada no futuro, chamar
`pedirAprovacaoDoAtendimento` (js/pagina-aprovacao.js) em vez de montar outra chamada:** a regra de
"o que é mandar pra conferência" tem que continuar morando num lugar só.

### A subtarefa de alteração nasce em AJUSTES, com entrega HOJE às 18h

Pedido do Cláudio: *"se não o card se perde"*. São duas coisas separadas, as duas em
`devolverParaDesigner` (AprovacaoInterna.gs):

- **Entrega hoje 18h** — vai no `desiredDate` da criação; `criarTarefaRunrun` completa sozinho com
  as 18:00 (`desired_date_with_time`). Sem data, a tarefa afunda no fim da coluna, que é ordenada
  por entrega. A data é calculada no fuso de São Paulo (`hojeNoFusoDaAgencia`), não no do servidor
  do Google — senão um pedido feito à noite viraria "amanhã".
- **Coluna Ajustes** — NÃO dá pra mandar na criação; a etapa é um PUT separado
  (`task_state_id`, ver `moverEtapaTarefa`), então é uma segunda chamada logo depois. Se ela
  falhar, a tarefa continua existindo e alocada: o aviso na tela diz isso em vez de mentir
  "pronto!". No caminho do projeto fechado o card mãe também é movido pra Ajustes — mas a entrega
  desejada dele **não** é mexida, porque ele é o guarda-chuva do mês e pode ter um prazo de cliente
  de verdade ali.

### Os pontos marcados na peça sobrevivem à ida pro Runrun.it

O atendimento marca pontos com o mouse na tela de conferência, mas o pedido vai parar no
**Runrun.it, que não sabe desenhar marcação em imagem**. Antes disso, do outro lado sobrava só
`(alto à esquerda) trocar o logo` — e o designer ficava adivinhando qual elemento era.

A devolução inteira (motivo + pinos + qual arquivo estava sendo conferido) é gravada na aba
`Devolucoes` (`gravarDevolucao`, AprovacaoInterna.gs), e daí saem **dois caminhos pro mesmo
conteúdo** — os dois precisam existir, porque o time trabalha nos dois lugares:

- **Dentro do card**, pra quem já está no Colmeia: `renderDevolucaoNoCard`
  (js/detalhe-alteracao.js) desenha a peça com os pontos em cima, no **topo da descrição, fora de
  aba nenhuma**. Numa tarefa de alteração isso não é contexto de apoio, é a instrução principal —
  atrás de uma aba seria exatamente o que a pessoa não veria antes de começar.
- **`ajuste.html`**, o link que entra no texto do pedido, pra quem abriu a tarefa direto no
  Runrun.it. Página sozinha e **sem login**, mesmo modelo da página de aprovação do cliente (o que
  protege é o código aleatório). O backend não sabe onde o Colmeia está publicado, então a `baseUrl`
  vem do front-end — mesma divisão de `gerarLinkDeAprovacao`.

**Em vídeo os pontos não são desenhados**, nos dois caminhos: o quadro muda o tempo todo e uma
marcação fixa apontaria pro lugar errado em quase todos eles. Fica o player e a lista escrita.

No caminho do **projeto fechado** não existe subtarefa, então a devolução fica pendurada no **card
mãe** (`taskIdAlteracao` vazio) — é por isso que `buscarDevolucaoDaTarefa` aceita os dois ids.

### As outras decisões que estavam em aberto

- **Numeração da alteração:** `proximoNumeroDeAlteracao` conta as "Alteração V*" que já existem no
  card mãe e segue (V1, V2, V3). "V1" fixo criaria duas com o mesmo nome na segunda devolução.
- **Quem enxerga a página:** papel `atendimento` na planilha de login, mais o Cláudio. O designer
  não vê — ele MANDA pra conferência, não confere. Ligado em `iniciarAppPosLogin`
  (js/login-boot.js); o item de menu nasce `hidden` no index.html, então quem não se encaixa nunca
  vê a página.

### O card mãe vai pra "Aprovação do Cliente" ao enviar

Na tela de envio tem a marcação **"Mover o card mãe para Aprovação do Cliente"**, ligada por
padrão: depois que o link vai pro cliente, o card mãe não é mais trabalho em produção — é coisa
esperando resposta, e quem olha o quadro do **Runrun.it** (o time todo, não só quem usa o Colmeia)
precisa ver isso. Acontece no mesmo clique que manda o link, uma vez por peça
(`apvCardMaeMovido` — dá pra mandar o mesmo link por WhatsApp e por e-mail). Falhar não cancela o
envio: o link é a parte que importa e já está pronto; o aviso conta o que não deu certo.

**O id da etapa NÃO está escrito na mão.** `idDaEtapaPorNome` (AprovacaoInterna.gs) descobre pelo
NOME, olhando uma tarefa que já esteja nela — o mesmo caminho que a página "Runrun completo" já
usava pro arrastar-e-soltar, porque não existe endpoint que liste as etapas do quadro. Um número
fixo aqui viraria uma quebra silenciosa no dia em que a agência renomeasse ou recriasse a etapa. O
id fica 6h em cache. Se a etapa não for achada, a tela **diz isso** em vez de fingir que moveu.

### O que fica na planilha e o que é lido ao vivo

A aba `ConferenciaInterna` guarda só a **decisão** (pediu / aprovou / devolveu) e **qual versão
estava valendo na hora do pedido**. Os arquivos são lidos do Drive toda vez. É isso que faz a tela
perceber sozinha quando o designer sobe uma versão nova depois de já ter pedido a conferência
(`temVersaoNova`), sem precisar de aviso nenhum. Linha já decidida é podada em 30 dias junto do
backup diário; o que está `pendente` nunca é apagado, por mais velho que seja — é trabalho em
aberto.

**Cuidado com o nome parecido:** `listarAprovacoesPendentes` (Aprovacao.gs) é de OUTRA etapa —
lista o que já foi mandado pro cliente e ainda não voltou (alimenta a aba "Aprovações" da Fila de
repasse). `listarConferenciasPendentes` (AprovacaoInterna.gs) é o passo ANTERIOR. As duas olham
lados opostos do mesmo fluxo e não devem ser ligadas uma na outra.

### Imagem vai embutida, vídeo vai pelo player do Drive

Mesma divisão que a página do cliente já usava, e pelo mesmo motivo: qualquer vídeo estoura o
limite de 25MB do Apps Script. **A diferença aqui é que o arquivo NÃO é liberado publicamente** —
a peça ainda pode ser devolvida, e liberar antes da aprovação exporia algo que talvez nunca vá pro
cliente. Quem confere abre logado na conta da agência, que já tem acesso à pasta.

**Quem usa é o atendimento, que NÃO usa o Colmeia** (eles trabalham no Runrun.it e entram só pra
isso). Essa é a restrição de UX principal e explica quase todas as escolhas: nenhum ícone sem
rótulo, botão escrito por extenso, e a conferência sendo um overlay que cobre o app inteiro em vez
de mais uma página no meio das outras.

**As 5 telas:** fila (`#page-aprovacao`, única dentro da moldura normal do app) → conferência
(`#apvConferencia`, overlay: briefing à esquerda, peça à direita) → envio (o MESMO overlay com o
estado trocado, não uma tela nova) → devolver (`#apvOverlayDevolver`) → projeto fechado (o MESMO
painel do devolver, conteúdo diferente).

**Três decisões de desenho que não devem ser desfeitas sem conversa:**
- **A altura da conferência é travada e a peça nunca rola.** Quem confere 15 peças por dia não pode
  ter que rolar pra ver o rodapé da arte — é assim que passa um detalhe errado. O `min-height: 0`
  no `.apv-palco` é o que faz a peça encolher em vez de empurrar os botões pra fora da tela; sem
  ele um flex item se recusa a ficar menor que o conteúdo. No celular a trava sai (ver o media
  query no fim do CSS, com o motivo).
- **A confirmação ao aprovar uma versão que não é a mais nova é o ÚNICO ponto que interrompe
  alguém**, de propósito: é exatamente o erro que essas telas existem pra evitar, e interromper só
  ali é o que faz a interrupção continuar significando algo. Não acrescentar confirmação em mais
  nada sem uma razão do mesmo peso.
- **O rebrand da conferência (2026-08-07, protótipo 1 aprovado pelo Cláudio).** Quatro mudanças que
  andam juntas: (1) a pílula de cima ficou PRETA, como a `.topbar-dark` do quadro — mas só no estado
  neutro, porque verde (aprovado) e amarelo (em alteração) continuam mandando na cor, já que a cor da
  barra É o estado da peça; (2) as colunas trocaram de lado por `order` no CSS, **sem mexer no HTML** —
  a peça foi pra esquerda, e `.apv-coluna-pedido`/`.apv-coluna-feito` continuam significando a mesma
  coisa em todo o resto do código; (3) briefing, peças da pasta e specs deixaram de ser cartões soltos
  e viraram UM bloco com três pílulas (`.apv-info-bloco`: Briefing / Opções de arte / Infos) — o corpo
  rola por dentro dele mesmo pra a altura não mudar ao trocar de aba; (4) a peça ganhou um cartão
  branco (`.apv-peca-card`) com o seletor de versão no rodapé dele. **A pílula "Opções de arte" é
  informação nova na tela**: lista as peças da pasta do card, inclusive as que NÃO vieram pra
  conferência (`outrasPecas`, que antes só apareciam lá no painel de envio) — era assim que uma peça
  era esquecida. Ela só LISTA; quem troca de peça é o carrossel embaixo do palco.
  ⚠️ As regras do rebrand ficam no FIM do 06-aprovacao.css, depois do media query de celular — por
  isso o media query precisa ser repetido lá embaixo, senão o desktop ganha por ordem de escrita.
- **A barra de envio (2026-08-06, protótipo B aprovado pelo Cláudio).** O rodapé branco
  (`.apv-rodape-coluna`) com o botão preto gigante saiu, e a fileira de botões dentro do cartão de
  mensagem também: hoje é UMA barra preta arredondada só (`.apv-barra-envio`), no mesmo vocabulário
  da `.topbar-dark` do topo do quadro — conferir de apoio (cinza, à esquerda) e mandar em destaque
  (amarelo, à direita), com WhatsApp/copiar/e-mail no menu do "Mandar". Ela gruda no FIM da coluna
  com `margin-top: auto` no wrapper `.apv-envio-rodape` (não na barra: senão a notinha ficava presa
  lá em cima). **Ao mexer nela, lembrar que o `padding-bottom` da `.apv-coluna-pedido` voltou a
  existir** — era zero enquanto o rodapé branco trazia o próprio.
- **"Ver como o cliente vê" convida, não trava.** Existiu brevemente a ideia de deixar os botões de
  envio apagados até esse botão ser usado uma vez (classe `.apv-envio-travado`), mas isso nunca
  chegou a valer no código — e em 2026-08-06 o Cláudio decidiu que fica assim mesmo: forçar o
  clique todo dia vira gesto automático, que protege menos do que não ter trava nenhuma. O botão
  continua sendo o maior do painel, que é o convite; o texto embaixo dele muda pra "Você já viu
  como o cliente vê" depois de usado. **Se alguém for reintroduzir a trava, é uma decisão nova —
  não é "consertar" nada que ficou pela metade.**

### O resumo da Bee virou uma FICHA, e a alteração saiu do meio dele (2026-08-07)

O resumo vinha como três listas de bullet empilhadas (formato / copy / o resto) e ficava enorme
numa coluna de ~390px — pior, o aviso de "peça com alteração pedida", que é a informação mais
importante quando existe, ficava lá no fim, fora da vista. Protótipo 3 aprovado pelo Cláudio:

- **Formato vira um CHIP preto** (`.apv-brief-formato-chip`), quase um título — é a primeira
  pergunta de quem confere ("é do tamanho certo?") e agora se responde num relance.
- **Copy vira um bloco de CITAÇÃO** (`.apv-brief-copy`). Ela é pra ser comparada palavra por
  palavra com a arte ao lado; tratar como citação sinaliza "isto é texto literal".
- **O resto vira ETIQUETAS soltas** (`.apv-brief-tag`), não bullets — cada detalhe de arte é uma
  checagem curta e independente, que não merecia uma linha inteira.
- **A alteração saiu do corpo e virou o rodapé fixo do bloco** (`.apv-info-rodape`, irmão do
  `.apv-info-corpo` que rola, desenhado por `apvRenderAlteracaoDoBriefing`). **Fechada por padrão
  de propósito:** quem confere precisa SABER que existe alteração antes de olhar a arte, mas ler o
  quê só interessa depois — a faixa com o contador dá o aviso em uma linha, o texto vem no clique.
- **`.apv-info-bloco` ganhou `max-height: 46vh`.** Sem teto, `.apv-blocos-coluna` tem `flex: 1 0
  auto` (não encolhe), então o bloco crescia com o conteúdo e quem rolava era a COLUNA inteira —
  levando o rodapé de alteração pra fora da tela, que é exatamente o que ele não pode fazer.

### "Expandir" o campo "O que precisa mudar?" (2026-08-07)

Botão `#apvExpandirMotivo` ao lado do rótulo: liga a classe `.apv-motivo-expandido` no overlay
inteiro, que **esconde só o `.apv-info-corpo`** (as pílulas e o rodapé de alteração continuam
visíveis) e solta o teto do campo. Escrever um pedido de alteração num campo de 3 linhas, rolando,
faz quem escreve perder de vista o que já escreveu — e pedido mal escrito é peça refeita errada.
Uma classe só, sem mexer em `style.height` na mão: é o que deixa a transição existir e o estado ser
reversível sem guardar altura em variável nenhuma. **Clicar numa das três pílulas desfaz o
expandir** (`apvTrocarInfoPane` chama `apvExpandirMotivo(false)`) — sem isso, clicar numa pílula
não mostrava nada e parecia quebrado.

### O prompt da Bee da conferência, v2 (2026-08-07)

`BRIEFING_CONFERENCIA_VERSAO` foi pra `conf-v2` — **ela entra no hash do cache, então mudar
qualquer regra do prompt sem subir a versão faz os resumos velhos continuarem sendo servidos.**
Três erros relatados pelo Cláudio, todos por o prompt não saber como um briefing da Beeon é escrito
de verdade:

1. **Briefing com caixas pra marcar.** Muito card mãe traz os formatos possíveis em caixinhas
   (`[ ] Feed  [x] Stories`) e o atendimento marca só a que vale — a Bee devolvia TODAS, e o
   atendimento conferia um Stories procurando um Feed que ninguém pediu. O prompt agora explica o
   que é caixa marcada (`[x]`, `☑`, `✅`, `(x)`) e manda ignorar as vazias; se nada parece marcado,
   não escolhe por conta própria.
2. **Legenda entrando como copy.** Legenda é o texto do POST (vai no Instagram na hora de
   publicar), não o texto da ARTE — ela não existe na peça que está na tela, então listá-la só
   fazia quem confere procurar na arte um texto que nunca ia estar lá. Hashtags, @, link da bio e
   roteiro de vídeo saem pelo mesmo motivo.
3. **Copy virando outra coisa.** Estava sendo entendido como "o texto do pedido" em vez de "as
   palavras que aparecem na peça". O prompt agora define copy pelo teste que importa: **dá pra LER
   isso olhando a arte?** Se não dá, não é copy.

`itens` também apertou: só detalhes de ARTE que dá pra conferir OLHANDO (cor, logo, foto, fonte,
elemento que tem ou não tem que aparecer) — prazo, quem faz e combinado de processo ficam fora. O
teto de 5 itens está escrito no prompt **e** aplicado com `.slice(0, 5)` no código: o prompt é um
pedido, o slice é a garantia.

## A página "Bee" (2026-08-04)

`js/pagina-bee.js` + o bloco no fim de `css/04-paginas.css`. Uma aba própria na barra lateral
(`page-bee`) com dois lados: um feed de atividades à esquerda, e o **painel de verdade da Bee**
(o mesmo `#beePainel` da bolinha flutuante, `js/bee.js`) aberto do lado direito.

**O chat não tem markup próprio nessa página — o painel de verdade é MOVIDO pra cá.**
`abrirPaginaBee()` faz `slot.appendChild(painel)`, tirando o `#beePainel` de onde ele mora (irmão
do `.main`) e colocando dentro de `#beePainelSlot`, na coluna da direita; `fecharPaginaBee()`
devolve pro lugar. Mover em vez de recriar mantém os MESMOS ids, listeners e estado de conversa —
a Bee daqui é literalmente a mesma da bolinha flutuante, sem uma linha de lógica duplicada.

**A primeira versão tentou só chamar `beeAbrirPainel()` e deu errado:** aquilo liga
`body.bee-aberta`, que é o modo "painel lateral" — ele empurrava o conteúdo pro lado e o feed
ficava perdido no meio da tela, nada a ver com o protótipo aprovado. Por isso `abrirPaginaBee()`
REMOVE `body.bee-aberta` e a classe `.bee-painel-na-pagina` (css/05-componentes.css) desliga tudo
que faz dele um painel lateral: largura fixa, a margem negativa que o esconde, e a transição de
entrada. Ao mexer no CSS do `.bee-painel`, conferir se a regra nova também precisa ser desligada lá.

O layout é `.bee-pagina` (css/04-paginas.css): grid de duas colunas — feed à esquerda numa moldura
cinza própria, chat à direita. Dentro da página, `.bee-grid` também é reescrito pra quadrados de
tamanho fixo numa linha só: o `1fr 1fr` original foi desenhado pro painel lateral de 500px e, num
painel de 800px+, virava blocos enormes com o último atalho cortado.

**O feed junta DOIS grupos de evento, e a diferença entre eles importa:**

1. **O que VOCÊ fez** — reconstruído do estado atual, não precisa de log nenhum. Reaproveita as
   MESMAS buscas que "Minhas horas" já usa: `buscarEntreguesDoDesigner` (entregas) e
   `buscarAtividadesDrive` (uploads). Tem histórico desde sempre.
2. **O que OS OUTROS fizeram nas suas tarefas** — anotado na hora que acontece, na aba
   `FeedEventos` da planilha (`registrarEventoFeed`/`buscarFeedEventos`, Planilha.gs). Hoje:
   `comentario`, `prioridade` e `recebida` (alguém te passou uma tarefa, por sequência ou
   reatribuição).

**Por que o grupo 2 precisa de log:** a API do Runrun.it devolve o ESTADO atual (a prioridade é
alta), nunca a história (fulano mudou pra alta às 14h). Duas consequências, de propósito: só entra
o que passou PELO COLMEIA (comentário feito direto no site do Runrun.it não aparece), e o feed
começa vazio e vai enchendo a partir de agora — não dá pra reconstruir o passado.

**A anotação acontece num lugar só:** `registrarEventosDoFeed` (Código.gs), chamada no fim do
`handleRequest` depois da ação dar certo. Nenhuma função de escrita precisou mudar — o contexto
(de quem é a tarefa, qual o título) vem no próprio `body` que o front-end mandou.

**`autorDoFeed`, nunca `autor`:** `autor` decide com qual conta do Runrun.it a ação é executada
(`tokenRunrunDoAutor`) — mandá-lo em ações que hoje não o mandam trocaria a conta que
comenta/repassa de verdade. Por isso o feed tem um campo próprio, sem efeito colateral. Ao
adicionar um tipo de evento novo, seguir esse mesmo cuidado.

`registrarEventoFeed` ignora sozinho quando autor == dono (ninguém precisa ser avisado do que
acabou de fazer), e a aba é podada em 14 dias junto do backup diário (`limparFeedEventosAntigos`).

## "Ficar comigo" da Fila de repasse foi pro backend (2026-08-04)

**O que aconteceu:** ao trocar o endereço do Colmeia (`claudiobeeon.github.io` →
`colmeia.beeon.com.br`), a Fila de repasse voltou a mostrar TUDO que já tinha sido resolvido.
Causa: `colmeia_repasse_ignorados_ids` (a lista de "Ficar comigo") morava só no `localStorage`, que
é **separado por domínio** — o endereço novo começou do zero.

O que NÃO se perdeu: as tarefas realmente repassadas/entregues mudaram de responsável no
Runrun.it, que é dado de verdade. Só a lista de "decidi ficar com essa" (que não muda nada no
Runrun.it de propósito) evaporou.

**Correção:** a fonte de verdade passou a ser a planilha (aba `RepasseIgnorados`, ver Planilha.gs).
O `localStorage` continua existindo como cópia local — a tela desenha na hora, sem esperar a rede, e
segue funcionando com a internet fora. `carregarRepasseIgnoradosDoBackend` (js/pagina-repasse.js,
chamada no login) faz a UNIÃO dos dois lados e **sobe o que só existia no navegador**, então nada
precisa ser reclicado — inclusive as decisões antigas, se a pessoa abrir o endereço velho uma vez.

**Isso contraria a regra "preferências vão em localStorage" do CLAUDE.md? Não.** Aquela regra vale
pra preferência VISUAL por designer (ordem de abas etc.), que pode se perder sem prejuízo. "Ficar
comigo" é uma decisão de trabalho — o incidente é a prova de que não podia estar só no navegador.
Ao criar algo novo, usar esse critério: preferência de exibição → localStorage; decisão que doeria
perder → planilha.

## Auditoria da página do cliente — `aprovar.html` (2026-08-08)

**O bug que importava, e não era de aparência:** com uma caixinha aberta ("Quem está aprovando?" ou
o aviso de pontos marcados), apertar ← ou → **trocava a peça ATRÁS dela**. `enviarRespostaPeca` lê
`pecaAtual` na hora do envio, então o Confirmar seguinte **aprovava a peça errada** — e o aviso de
pontos mostrava a contagem da peça velha. Corrigido com `temModalAberto()`, checado antes de
qualquer navegação. ⚠️ Ao acrescentar outro atalho de teclado aqui, checar isso também.

Outras correções da mesma passada, todas de celular (é lá que o cliente abre — o link chega por
WhatsApp):

- **Arrastar o dedo troca de peça.** Antes só as setas, e ninguém procura seta num carrossel de
  telefone. Só conta gesto bem mais horizontal que vertical (`|dx| ≥ 45` e `|dx| ≥ |dy| × 1.5`),
  senão rolar a página trocaria a peça sem querer. ⚠️ A trava `arrastouAgora` é obrigatória: alguns
  navegadores disparam `click` depois do arraste, e clique no visor **solta um pino** — sem ela,
  trocar de peça deixava um ponto marcado no caminho.
- **`58vh` → `58dvh`.** `vh` conta a altura com a barra de endereço escondida, então a peça podia
  ser mais alta que a tela real e empurrar legenda e miniaturas pra fora. A linha de `vh` fica antes
  como reserva pra navegador antigo.
- **As caixinhas com o teclado aberto:** centralizadas, o Confirmar podia ficar embaixo do teclado
  sem jeito de alcançar. No celular viram `align-items: flex-start` + `overflow-y: auto`.
- **Cliente e título empilhados no topo** — lado a lado, um nome comprido espremia o título da peça
  até sobrar só reticências, e o título é o que diz qual peça é.
- **E-mail marketing (HTML) ganhou fundo branco próprio.** A maioria não declara cor no `body`, e o
  cinza do palco vazava por trás do texto — o cliente julgava a peça sobre uma cor que não é a dela.
- **Alvo de toque dos pinos** de 28px pra 34px.
- **"Clique na peça" vira "Toque na peça"** em aparelho de toque (`ehToque()` decide só a PALAVRA,
  nunca comportamento).
- **O comprovante de data/hora passou a valer pro ajuste também** — existia só na aprovação, sem
  motivo. E `enviarResposta` passa `Date.now()`, senão ficava em branco justo pra quem acabou de
  responder.
- **Favicon e `theme-color`.** A aba mostrava o ícone genérico de página sem favicon, o que num link
  recebido por WhatsApp parece link duvidoso.

Mais duas, da segunda leva:

- **`buscarAprovacaoPublica` tem prazo próprio de 60s**, contra os 25s de todas as outras. Só ela
  traz a ARTE embutida (base64, às vezes vários MB) — numa rede de celular ruim, que é exatamente
  onde esse link é aberto, 25s estourava no meio do download e o cliente via "nosso sistema está
  fora do ar" com o sistema funcionando, só lento. As outras ações mandam pouca coisa e ficam em
  25s: ali um prazo longo só faria esperar mais pra descobrir que caiu. **Junto veio o aviso de
  demora** (`#loadingDemora`, depois de 12s): sem ele, um minuto olhando as frases em rodízio parece
  tela travada, e quem acha que travou fecha a aba — a peça fica sem resposta por um problema que
  não existia.
- **"Preciso consultar antes" sobrevive ao F5.** `buscarAprovacaoPublica` passou a devolver
  `consultandoEm` (coluna Q, que já era gravada) e a página restaura o botão no estado "já avisei"
  (`marcarConsultaAvisada`, chamada nos dois momentos: no clique e na abertura). Antes, recarregar
  trazia o botão normal de volta e a pessoa clicava outra vez achando que não tinha funcionado.
  ⚠️ Continua **não sendo status** — o link segue `pendente` e o cliente pode aprovar ou pedir
  ajuste normalmente depois.

## Painel de Designers integrado ao Colmeia (2026-08-10)

A "tela principal" do projeto irmão **painel-designers-beeon**
(`github.com/ClaudioBeeon/Designers-Beeon`) — designers, clientes de cada um, criativos, tempo
médio, home office, KPIs do Runrun.it e a tela "Vincular clientes duplicados" — passou a viver
dentro do Colmeia, a pedido do Cláudio: *"o Colmeia está mais completo, integrar tudo seria
interessante"*. Ver a análise que motivou isso na conversa (comparação técnica dos dois códigos
antes de mexer em qualquer coisa).

**Rota escolhida: só a TELA mudou de casa, o DADO não (ainda).** `PainelDesigners.gs` é uma ponte —
cada ação nova (`painelLerEstado`, `painelSalvarEstado`, `painelListarClientesParaVinculo`,
`painelLinkarClientes`, `painelDesvincularCliente`, `painelAtividadesRecentes`) recebe do
front-end do Colmeia e repassa pro Apps Script SEPARADO do painel (`PAINEL_BEEON_API_URL`), que
continua sendo dono da planilha. Foi escolha deliberada, não a "versão fácil de qualquer jeito":
juntar as planilhas de vez é a etapa 4 de um plano em fases, deixada pra depois — mexer em onde o
dado mora é o passo de maior risco, e não precisava acontecer pra entregar o que foi pedido agora.
Se um dia fizer sentido juntar de vez, é só trocar o "de dentro" dessas funções — o front-end
continua chamando as mesmas ações.

**O que NÃO veio, e por quê:**
- As páginas "Atendimento"/"Serviço"/"Todos os clientes" do painel original — o Cláudio confirmou
  que o Colmeia já cobre isso (Clientes por atendimento, Meus clientes).
- A edição de tarefa direto no card (arrastar etapa, trocar data numa janelinha flutuante) virou
  **abrir a tarefa de verdade do Colmeia** (`abrirTarefaPorId`) — mais completa (comentários, Bee,
  cronômetro) que o editor do painel, então é estritamente melhor, não uma perda.
- Desfazer (Ctrl+Z) e exportar CSV ficaram de fora desta primeira versão.

### O bug do "esforço de hoje" — corrigido na raiz, não só realocado

O painel original calculava "Atrasadas/Hoje/Futuras/Prioridades/Mês/Esforço" numa varredura PRÓPRIA
do Runrun.it, cacheada numa célula da planilha e atualizada por **um único gatilho de tempo a cada
10 minutos**. Se esse gatilho parasse de disparar sozinho — o Apps Script derruba gatilho depois de
falha repetida, **sem avisar visivelmente** — o número ficava travado no valor antigo, sem erro
nenhum aparecer na tela. Era essa a causa provável do bug relatado.

No Colmeia, os mesmos números saem inteiramente de **`tasksTodas`**, o array que o próprio quadro já
mantém atualizado (poll de ~60s) — zero busca nova, zero cache extra, zero gatilho pra manter vivo.
Não tem como esse número "travar sozinho": ele é recalculado do que já está fresco toda vez que a
tela desenha. Ver `pnlPorCategoriaDePrazo`/`pnlTarefasPrioridade`/`pnlTarefasDoMes`/
`pnlEsforcoPorResponsavel` em `js/pagina-painel-designers.js`.

⚠️ **`t.isUrgent`** foi adicionado a `transformarTarefaParaColmeia` (RunrunLeitura.gs) só pra isso —
é o campo `is_urgent` do Runrun.it, o mesmo que o painel usava pro KPI "Prioridades". Não confundir
com a coluna "Prioridades" do quadro do Colmeia (`task.status === "prioridades"`), que é outra
coisa (uma etapa do fluxo, não uma marcação do Runrun.it).

### ⚠️ Designer do PAINEL ≠ designer do RUNRUN.IT — e isso não é um bug daqui

Os designers cadastrados no painel (Paulo, Gustavo, Imane, "Sem designer"...) são o time de criação
da Beeon — diferente de quem está **logado de verdade** no Runrun.it (`RUNRUN_USUARIOS`: Cláudio,
Gustavo, Erick). Só o Gustavo é a mesma pessoa nos dois. Por isso os números de
"atrasadas/hoje/futuras" e o esforço só aparecem no card de um designer do painel quando o NOME dele
bate com um usuário real do Runrun.it — na prática, quase só o card do Gustavo mostra algo.

**Isso já era assim no painel original** (o próprio código de lá tinha o mesmo comentário de aviso)
— não é uma regressão da integração, é uma limitação de dado que sempre existiu. A comparação usa
`nomesCorrespondem` (`pnlTarefasDoDesignerPainel`), o mesmo jeito que o resto do Colmeia já compara
PESSOA por nome (ver a seção "Essa tarefa é minha?" mais abaixo — status de pessoa aceita
comparação por nome; "de quem é a tarefa" não).

### "Vincular clientes duplicados" virou a 4ª aba das Configurações do coordenador

Não ganhou uma tela própria — entrou como aba nova (`configTabVinculos`) dentro do modal
"Configurações do coordenador" que já existia (Pessoas / Links de clientes / Memórias da Bee),
porque é literalmente a mesma categoria de coisa: cadastro que só o coordenador mexe. Mesmo shell
(`peopleModalBody`), mesmo padrão de troca de aba (`atualizarAbasConfig`,
js/painel-pessoas-clientes.js) chamando pra fora do arquivo
(`renderConfigVinculosClientes`, js/pagina-painel-designers.js — funciona mesmo definida num
arquivo carregado DEPOIS, porque só é *chamada* muito depois de todo script já ter carregado, nunca
no carregamento da página em si).

### Detalhes que já custaram raciocínio

- **`pnlEstaEditando()` trava o poll de 8s** (mesmo padrão do `isUserEditing()` original): enquanto
  qualquer campo de texto/select estiver com foco, o poll não sobrescreve por baixo do dedo.
- **Salvar é tudo-ou-nada.** O painel guarda o estado inteiro numa célula só — não dá pra gravar "só
  um designer". Toda ação de escrita manda o objeto completo (`pnlBuildPayload`), debounced 900ms
  (`pnlAgendarSalvar`), igual o painel original sempre fez.
- **`painelSalvarEstado`/`painelLinkarClientes`/`painelDesvincularCliente` invalidam os caches do
  Colmeia** (`vinculosClientesPainel`, `tempoMedioClientesPainel`, RunrunLeitura.gs) — sem isso, uma
  mudança feita agora só valeria pro resto do Colmeia depois de até 10 minutos.
- **As três ações mais pesadas foram pra `ACOES_DEMORADAS`** (js/config.js): elas somam o cold-start
  de DOIS Apps Script (Colmeia + painel), e `painelListarClientesParaVinculo` ainda varre o Drive do
  lado de lá.

## O check "já aprovou, por fora" chegou na Aprovações da Fila de repasse (2026-08-09)

Já existia só dentro do pop-up dos grupos da Central (grupo "Com o cliente", ver a seção própria
mais abaixo). O Cláudio pediu o mesmo na **Aprovações da Fila de repasse** — a página que só ele
enxerga (`repasseNav.hidden = !souClaudio()`) — pra poder concluir uma peça que o cliente aprovou
por fora (WhatsApp, e-mail, reunião) sem esperar ele clicar no link.

**A lógica saiu do lugar duplicado e virou ponto único:** `aprovarPorFora(item, btn)`
(js/pagina-repasse.js) — pergunta canal e quem aprovou, chama `aprovarAprovacaoPorFora` (Aprovacao.gs,
já existia) e atualiza os DOIS caches (`aprovacoesCache` da Fila de repasse e
`centralAprovacoesCache` da Central, que são os mesmos dados emprestados em duas telas).
`centralMarcarAprovadaPorFora` (js/central-atendimento.js) hoje só chama essa função e cuida do
redesenho que é específico do pop-up.

- O botão (✅) só aparece na coluna **"Aguardando o cliente"** (`status === "pendente"`) do card
  reaproveitado por `cardDeAprovacaoHTML`/`wireCardsDeAprovacao` — o MESMO card que a aba
  "Aprovações" da Central também usa (`centralPreencherSecaoAprovacoes`), então o botão vale nos
  dois lugares de graça. Em "ajuste" o cliente já respondeu (pediu mudança); marcar aprovado por
  cima contradiria a resposta dele.
- Ao marcar, o card só `.remove()` da tela (mesma simplificação que "excluir" já fazia) em vez de
  recalcular a coluna inteira — reaparece certo (em "Aprovadas") na próxima vez que a aba abrir.

## A "Aprovações" do menu do Cláudio virou só a Central (2026-08-09)

O ícone "Aprovações do atendimento" (`data-page="aprovacao"`, a fila de conferência interna antes
de mandar pro cliente) parou de aparecer no menu **do Cláudio especificamente**
(`aprovacaoNav.hidden = !podeConferir || souClaudio()`, js/login-boot.js). Não é perda de função: a
MESMA fila já abre pelos grupos "Esperando você" e "Prontas pra enviar" do pop-up da Central
(`centralAbrirGrupo` → `apvAbrirConferencia`, a mesma tela de conferência de sempre) — era só um
segundo caminho de entrada pra decidir entre. A rota `/aprovacoes` e a visibilidade pro papel
"atendimento" continuam intactas — só o ícone dele some.

## "Meus botões da esquerda" dentro da Central, só pro Cláudio (2026-08-09)

Pedido dele: "quando vou pra Central, muda meus botões e opções da esquerda, tem como manter os
mesmos?" A Central é `position: fixed; inset: 0`, cobrindo a sidebar normal do Colmeia por baixo —
faz sentido pra quem tem papel "atendimento" (nunca viu essa sidebar, entra direto na Central), mas
o Cláudio navega os dois mundos o tempo todo.

`#centralSidebarExtraNav` (index.html) é um bloco a mais dentro do `.central-sidebar-nav`, com os
MESMOS 8 destinos da sidebar normal (Kanban, Meus clientes, Clientes por atendimento, Tipos de
tarefas, Runrun completo, Minhas horas, Fila de repasse, Bee) — mostrado só pra ele
(`abrirCentralAtendimento`, js/central-atendimento.js), abaixo de um divisor, DEPOIS dos 4 tabs
próprios da Central (Hoje/Radar/Aprovações/Métricas — esses continuam ali, isso não os substitui).

- **`data-central-ir-pagina`, não `data-page`, de propósito** — reaproveitar `data-page` faria o
  wiring genérico de `.nav-ic[data-page]` (js/pagina-repasse.js) também disparar `mostrarPagina`
  sozinho, SEM fechar a Central: a página trocaria por baixo do overlay, escondida. O clique aqui
  chama `fecharCentralAtendimento()` e SÓ DEPOIS `mostrarPagina()`.
- ⚠️ **`.central-sidebar-nav` ganhou `min-height: 0; overflow-y: auto`** — com 12 itens (4 da
  Central + 8 dele) ela passa da altura da tela em monitores mais baixos; sem isso o perfil e o
  "Sair" do rodapé (que dependem de `margin-top: auto` lá embaixo) seriam empurrados pra fora,
  invisíveis. Agora só a NAVEGAÇÃO rola por dentro dela mesma; perfil/sair ficam fixos.

## "Aprovar todas" na página do cliente (2026-08-09)

Um link quase sempre traz **Feed + Stories da mesma campanha**, e desde que a resposta virou por
peça (M5) o cliente tinha que aprovar uma a uma — **digitando o nome dele em cada uma**. Era o
atrito mais bobo do fluxo inteiro: a decisão é uma só, o trabalho era N.

`#btnAprovarTudo` (aprovar.html) pergunta o nome **uma vez** e aprova todas as pendentes. O
"Aprovar" de sempre continua ali, pra quem quer decidir peça por peça — os dois convivem, como o
Cláudio pediu.

- **Só aparece com 2+ pendentes** (`atualizarCardDecisao`): com uma só, ele e o "Aprovar" fariam a
  mesma coisa, e dois botões iguais lado a lado é só chance de errar o clique.
- ⚠️ **Envia UMA DE CADA VEZ, em fila.** A gravação passa por `pegarTravaDaPlanilha`, e pedidos
  simultâneos disputariam a trava; além disso é o ÚLTIMO a chegar que dispara o `todasRespondidas`
  (o agregado do link), o que só é confiável se ele for mesmo o último. O botão vira "Aprovando 2 de
  4…" enquanto corre.
- **Falha PARA a fila.** As que já passaram continuam aprovadas (a planilha gravou), e o aviso diz
  quantas foram e quantas faltaram, pra a pessoa repetir só o resto — em vez de tentar tudo de novo
  e não saber o que já valeu.
- **O aviso de pontos marcados vale aqui também**, olhando TODAS as pendentes: aprovar quatro de
  uma vez com ponto marcado numa delas é justamente o engano mais caro de desfazer.
- ⚠️ **`confirmarAprovacaoComNome` lê `aprovandoTudo` ANTES de fechar o modal** — `fecharModalQuemAprova`
  zera a marca (é o caminho do cancelar), então checar depois daria sempre falso e "aprovar todas"
  viraria "aprovar essa". Mesmo padrão de `centralAbrirDoGrupo`.

## "Enviar para o cliente" abre os três canais (2026-08-08)

O botão da pílula de cima, depois de aprovado, abria o **WhatsApp direto** — escolhia o canal pela
pessoa, e quem só queria copiar o link tinha que descer a coluna até a barra de envio pra achar a
opção. Agora ele abre o **mesmo menu de três canais** (WhatsApp / copiar link / e-mail) do botão
"Mandar" da barra.

**São dois elementos de menu, e o markup é repetido de propósito:** os dois abrem pra lados opostos
(`#apvAcaoMenu` pra BAIXO a partir da pílula; `#apvEnvioMenu` pra CIMA, porque a barra mora no pé da
coluna). Mover um único elemento entre dois pais pra reaproveitar três botões seria mais frágil que
repeti-los. **O comportamento NÃO é repetido:** abrir/fechar passa por `apvAlternarMenuDeEnvio`
(que também fecha o outro, pra nunca haver dois abertos) e a ação por `apvEnviarPara`; os cliques
são ligados por `.apv-envio-menu [data-apv-envio]`, que pega os dois de uma vez.

- **`.apv-contexto` ganhou `position: relative`** só pra ancorar esse menu: o botão é item direto da
  fileira da pílula, sem invólucro próprio, e envolvê-lo num `<div>` mudaria o comportamento dele no
  flex (mesmo raciocínio dos gomos do cabeçalho do chat).
- **`apvClickAcao` recebe o evento e chama `stopPropagation`** — sem isso o "fechar ao clicar fora"
  pegaria o próprio clique que abriu e fecharia o menu na hora.
- Abrir uma peça nova fecha **os dois** menus (`.apv-envio-menu`, nos dois pontos de reset).

## A conferência no celular — a revisão de 2026-08-08

⚠️ **Regra nova de mobile pra tela de conferência vai no ÚLTIMO bloco `@media` do
`css/06-aprovacao.css`.** O arquivo tem TRÊS deles (~895, ~1388 e o do fim), e tudo escrito depois
dos dois primeiros — o rebrand, a ficha da Bee, o rodapé de alteração, o expandir — nasceu sem
regra de celular nenhuma. Só o último ganha de todos por ordem de escrita.

**O que estava quebrado, e a causa comum:** a pílula do topo é uma fileira `flex-wrap: wrap` com
sete coisas (logo, id, cliente, peça, chips de etapa, "N peças esperando" e o botão de 210px). Num
telefone ela quebrava em 4–5 linhas — e `border-radius: 999px` num bloco de cinco linhas não parece
pílula, parece defeito. Pior: `.apv-conferencia` tem `overflow: hidden` e a pílula é `flex: 0 0
auto` (**não encolhe**), então cada linha a mais comia o espaço das colunas e **o que passava do fim
era cortado, sem scroll pra chegar lá** — era essa a "informação sumindo". Depois de aprovar ficava
pior porque os chips "Card mãe → Aprovação Cliente" acendem dentro da pílula, com `margin: 0 auto` e
sem poder encolher.

**A saída:** no celular a pílula deixa de ser pílula e vira um cartão de linhas empilhadas
(`border-radius: 18px`), cliente e peça um sobre o outro com reticências, chips com `min-width: 0`
pra poderem encolher, e o botão de ação ocupando a largura toda.

Outras quatro coisas revisadas junto, todas no mesmo bloco:
- **Nada de rolagem dentro de rolagem:** `.apv-info-bloco` perde o `max-height: 46vh` e
  `.apv-info-corpo` volta a `overflow: visible`. No desktop o teto existe pro rodapé de alteração
  não sair da tela; no celular a coluna já rola, e um scroll aninhado faz o dedo rolar a caixa
  errada.
- **A barra preta de envio empilha:** lado a lado em 390px, "Ver como o cliente vê" virava
  "Ver como o…".
- **O botão "Expandir" do campo de alteração some** — ele troca o espaço do briefing pelo do campo,
  e no celular os dois não disputam altura nenhuma. O estado expandido também é neutralizado, pra
  quem diminuir a janela não ficar com o briefing escondido e sem botão pra trazer de volta.
- **O overlay ganhou 10px de respiro nas bordas**, senão o cartão de cantos redondos encostava na
  moldura da tela.

## O calendário de postagens da Central (2026-08-08)

`centralRenderCalendario` (js/central-atendimento.js) + `calendarioDePostagens`
(AprovacaoInterna.gs) + o bloco `.central-cal-*` no fim de `css/07-central-atendimento.css`.
Protótipo 1 aprovado pelo Cláudio, a partir de uma referência que ele mandou: **bloco preto** como a
Timeline, **dias em círculo**, **hoje em amarelo**. Fica embaixo da foto do atendimento, que encolheu
pra uma linha (a mesma altura dos cartões de número ao lado) pra abrir esse espaço.

- **Custo ZERO no Runrun.it.** `calendarioDePostagens` lê `getTarefasColmeia()` — a mesma varredura
  do quadro que já roda em cache — e ela já traz `dataPublicacao` pronta, extraída do campo
  personalizado (`extrairDataPublicacaoTarefa`, RunrunLeitura.gs). Uma busca própria seria varrer o
  Runrun.it de novo pelo mesmo dado.
- ⚠️ **Só mostra tarefa ABERTA, e não mostra card mãe** — é o que `buscarTarefasRunrun` traz (ver o
  CLAUDE.md). Pra um calendário de "o que vem aí" isso é o certo; peça já entregue e fechada some
  dele. Ver o passado exigiria `buscarExtrasRunrunCompleto`, que é caro.
- **A busca acontece UMA vez.** Virar de mês é tudo no navegador — o array inteiro já está na
  memória, e pedir de novo a cada seta seria desperdício.
- **`centralCalChave` monta "AAAA-MM-DD" no fuso LOCAL**, nunca `toISOString()`: em UTC-3 aquele
  joga o dia 1 pro dia 31 do mês anterior, e o calendário inteiro sairia deslocado.
- ⚠️ **Pelo mesmo motivo, `centralCalCurta` lê "AAAA-MM-DD" NA MÃO** (2026-08-09). `new Date(texto)`
  trata data SEM HORA como meia-noite em **UTC** — em UTC-3 isso vira 21h do dia anterior e
  `getDate()` devolve um dia a menos. Era o bug do "posta 5/8" numa peça que a grade mostrava
  (certo) no dia 6: mentia a ETIQUETA, não a grade. Data COM hora (`due`) segue pelo `new Date`
  normal, onde não há ambiguidade. **Ao formatar qualquer data vinda do backend, checar se ela tem
  hora antes de entregar pro `new Date`.**
- ⚠️ **As células do fim do mês têm contador PRÓPRIO**, não `celulas.length % 7` (2026-08-09). Com o
  resto, agosto de 2026 emendava em 2, 3, 4, 5, 6 de setembro — **o dia 1º não existia na grade**, e
  uma peça que postasse nele sumia do calendário.
- ⚠️ **A caixinha do dia mora FORA do cartão** (`position: fixed`, filha de `#centralAtendimento`).
  `.central-hoje-tile` tem `overflow: hidden`, então uma caixinha desenhada dentro dele é cortada na
  borda — foi exatamente o erro do primeiro protótipo, e o Cláudio não conseguiu vê-la. Ela é
  posicionada em pixel a partir do círculo do dia, e vira pro outro lado / sobe quando não couber.
- **Cada peça da caixinha é um CARD clicável** que abre a tarefa (`abrirTarefaPorId`, que sabe buscar
  avulsa no Runrun.it quando ela não está carregada).
- **Abre no hover E no clique:** num aparelho de toque hover não existe, e sem o clique o calendário
  ficaria sem uso lá.
- ⚠️ **O fechamento é ATRASADO (260ms), e isso é obrigatório** (2026-08-09). Como a caixinha mora
  fora do bloco do calendário, o caminho do mouse do círculo até ela passa POR FORA dos dois: o
  `mouseleave` do calendário disparava e ela sumia antes de dar pra clicar em qualquer peça — foi
  exatamente o que o Cláudio relatou. Sair de um e entrar no outro agendam e cancelam o MESMO
  temporizador (`centralAgendarFecharDia`/`centralCancelarFecharDia`), então a travessia não fecha
  nada. Um `mouseleave` que fecha na hora não funciona aqui, por mais que pareça o óbvio.
- **A etiqueta de entrega fica laranja quando a entrega é DEPOIS do dia de postar.** É o erro que
  este calendário existe pra pegar: a peça fica pronta atrasada em relação à publicação.

### O calendário abria vazio: prazo de 25s estourando em silêncio (2026-08-09)

O calendário nasceu barato (só lia `getTarefasColmeia()`, a varredura que já está em cache) e por
isso não estava em `ACOES_DEMORADAS`. Depois ele passou a puxar também as tarefas JÁ FECHADAS dos
últimos 45 dias (`buscarPostagensFechadas`) e os cards mãe que não estão alocados a ninguém varrido
— com o cache do backend frio, isso passa de 25s com folga. Três correções, que andam juntas:

- **`calendarioDePostagens` entrou em `ACOES_DEMORADAS`** (js/config.js) → 90s. ⚠️ Ao tornar uma
  ação de backend mais pesada, conferir se ela ainda cabe no prazo padrão — o prazo é escolhido pelo
  NOME da ação, então ele não acompanha sozinho a mudança.
- **Falha parou de virar lista vazia.** `centralPostagens` só é buscada quando está em `null`, então
  gravar `[]` num erro **congelava o calendário vazio pelo resto da sessão** — e vazio parece "não
  tem nada postado", não "não consegui perguntar". Hoje a falha deixa em `null` e desenha
  `centralCalErroHTML` com um "Tentar de novo" (`centralCalBuscando` é a trava contra buscas
  empilhadas).
- **As duas varreduras viraram paralelas** (`runrunFetchAll`): o resgate dos cards mãe era até 40
  idas seguidas ao Runrun.it, e as fechadas eram até 15 (3 designers × 5 páginas) em fila indiana.
  Agora é uma rodada por página, com os designers juntos, e quem já saiu da janela não entra na
  rodada seguinte — mesmo padrão de `buscarTarefasAbertasSeparadas`.

### A Central demorava demais pra abrir (2026-08-09)

Duas causas somadas, uma de cada lado:

**1. As buscas de abertura estavam em SÉRIE.** `centralCarregarDados` esperava fila+aprovações,
depois esperava os pedidos de atenção, e só então desenhava — e o desenho é que disparava o
calendário, o pedido mais demorado de todos. Quatro prazos enfileirados. Hoje as quatro saem no
mesmo instante e a tela desenha assim que a parte útil chega: `centralGarantirPostagens()` (a busca
do calendário, separada do desenho justamente pra poder sair na frente) e os pedidos de atenção não
são esperados por ninguém — cada um redesenha só o seu pedaço quando chega.

**2. `listarVersoesDasPecas` é a função mais cara da Central.** Varrer a pasta do card no Drive não
é uma chamada só: cada arquivo custa um pedido por propriedade lida, e `listarConferenciasPendentes`
chamava isso **uma vez por tarefa da fila**. Ganhou cache de 90s no script (compartilhado entre as
pessoas do atendimento), limpo por `invalidarCacheDeVersoesDasPecas` quando um arquivo sobe pelo
Colmeia (`subirArquivoNoCard`, Drive.gs).

⚠️ **`pedirConferenciaInterna` usa `listarVersoesDasPecasSemCache` de propósito** — é ali que fica
gravado qual versão estava valendo no pedido, e é desse número que sai o aviso de "tem versão nova".
Um retrato de 90s atrás faria o designer subir a v2, mandar pra revisão na hora e o sistema anotar
v1: o erro exato que esse campo existe pra pegar. Ao criar uma leitura nova de pasta, decidir do
mesmo jeito — **exibir** pode usar o cache, **decidir** não.

### O pill amarelo de cliente, na barra preta do topo

Escolher um cliente ali muda a **Central inteira** — os quatro cartões de número, a timeline, o
radar e o calendário. Amarelo de propósito: no vocabulário do app, amarelo é o que está ativo agora
(a pílula do "tocando" no quadro), e um filtro ligado é exatamente isso.

- **Ele entra em `centralClienteEhDoLogado`**, o filtro que já decide tudo que a Central mostra —
  assim nenhuma tela precisa lembrar de checar por conta própria.
- ⚠️ **Por isso `centralClienteEhDaPessoa` teve que ser separada dela.** Quem MONTA a lista do pill
  não pode passar pelo filtro do próprio pill, senão sobraria só o cliente já escolhido e não
  haveria como trocar. A função nova é o teste "é cliente desta pessoa?" sem o filtro.
- **Não substitui o "ver como" ao lado, e os dois convivem:** aquele troca de PESSOA (só coordenador
  vê), este corta por CLIENTE dentro do que a pessoa já enxerga.

### Cliente repetido no seletor: comparar por CHAVE, nunca por `===` (2026-08-09)

O mesmo cliente aparecia duas ou três vezes no seletor do pill. O nome chega de fontes que não
conversam — a fila e as aprovações trazem o que está gravado na tarefa do Runrun.it, e a lista de
"clientes de quem está vendo" vem do painel-designers-beeon. Um acento, um MAIÚSCULO ou um espaço a
mais e viram dois nomes diferentes. Corrigir o cadastro não resolve: a grafia velha continua gravada
nas peças antigas.

- **`centralChaveCliente` / `centralMesmoCliente` / `centralUnificarClientes`** (js/central-atendimento.js)
  são o ponto único. A chave é `normalizarParaComparar` (sem acento, minúsculo, pontuação virando
  espaço) — a mesma que `pdMesclarPorCliente` já usava no painel dos designers.
- ⚠️ **Unificar a lista SEM trocar as comparações teria quebrado a Central inteira**: escolher
  "Clínicas União Passos" no pill deixaria de casar com as peças gravadas como "Clinicas União
  PASSOS", e a tela ficaria vazia. As duas coisas andam juntas — `centralClienteEhDoLogado`, o
  calendário, a pílula de atenção, o radar do cliente e a timeline dele passaram todos pra
  `centralMesmoCliente`.
- ⚠️ **`centralGrupoForaDoFiltro` guarda CHAVES, não nomes**, e `contagem` no menu de clientes também
  é por chave — por nome cru o cliente virava duas linhas no menu, uma com o número e outra zerada.
- **A grafia mostrada é a do CADASTRO** (painel-designers-beeon), que entra primeiro em
  `centralUnificarClientes`: é a que o Cláudio corrige quando está errada. As outras fontes só
  completam o que faltar — cliente que só existe numa peça continua aparecendo.
- Isto é só de EXIBIÇÃO: não renomeia nada em lugar nenhum, e clientes de nomes de verdade
  diferentes continuam separados.


**As três fontes do calendário (2026-08-09).** A primeira versão usava só a varredura do quadro, e
por isso o mês aparecia pela metade: aquela varredura traz **só tarefas abertas** e joga os **cards
mãe** num balde separado. Hoje `calendarioDePostagens` junta três:

1. **Abertas** — `getTarefasColmeia()`, o que está em produção agora.
2. **Cards mãe** — do MESMO cache que a varredura já preencheu (`CACHE_CARD_MAE_ABERTOS`): custo
   zero de rede.
3. **Já entregues e fechadas** — `buscarPostagensFechadas`, uma varredura própria das tarefas
   fechadas dos últimos 45 dias. É a única que custa; sem ela, todo dia que já passou aparecia
   vazio, como se nada tivesse sido postado.

Por causa da (3), **o resultado inteiro fica 10 min em cache** (`CALENDARIO_CACHE_CHAVE`), limpo por
`invalidarCacheDoQuadro` junto com o resto — sem isso uma data recém-mudada continuaria no dia
velho. Um calendário do mês não precisa da pressa do quadro; a troco de alguns minutos de atraso,
ninguém repaga a varredura ao abrir a Central.

**O bug que fazia o calendário nascer vazio (2026-08-09).** `extrairDataPublicacaoTarefa`
(RunrunLeitura.gs) lia `t.custom_fields['custom_24']` — tratando os campos personalizados como um
OBJETO. Mas `extrairTipoTarefa`, no mesmo arquivo e funcionando há meses (é quem põe o ícone de tipo
em todo card do quadro), trata o MESMO campo como um **array** de `{name, value}`. Os dois não podem
estar certos: a data saía `null` em toda tarefa, e qualquer tela que dependia dela aparecia vazia
**sem erro nenhum na tela** — o que fez o problema parecer ser do calendário, que era só a primeira
tela a depender dela de verdade.

Hoje a leitura aceita os três formatos (array, objeto e campo solto na raiz) e, no array, casa tanto
pelo id `custom_24` quanto pelo NOME ("Data de Publicação") — se a agência recriar o campo, o id muda
e o nome não. `normalizarDataPublicacao` aceita ISO, `dd/mm/aaaa`, timestamp e `{value|date}`.
⚠️ Ao mexer em campo personalizado do Runrun.it, **conferir em qual formato o outro extrator do
arquivo já lê** antes de escrever um novo — e, na dúvida, rodar `diagnosticoDataPublicacao()` pelo
editor do Apps Script, que imprime o `custom_fields` cru de tarefas de verdade.

**A DATA DE PUBLICAÇÃO MORA NO CARD MÃE; A ENTREGA DESEJADA, NA SUBTAREFA DO DESIGNER**
(2026-08-09). Por isso o calendário não pode olhar cada tarefa sozinha — foi o erro da primeira
versão: as subtarefas (que têm entrega e designer, mas não têm publicação) ficavam de fora, e o
card mãe aparecia com a entrega DELE, que é outra coisa.

Hoje `calendarioDePostagens` cruza os dois lados, e **uma linha do calendário = uma peça**:
- a **peça** é quem tem data de publicação (quase sempre o card mãe);
- a **entrega desejada** vem da subtarefa — a MAIS TARDE, quando há várias etapas abertas, porque é
  quando a peça realmente fica pronta;
- o **designer** vem da subtarefa que ainda está aberta (a mãe costuma estar com quem coordena);
- **entregue** só quando TODAS as subtarefas fecharam — uma etapa aberta significa trabalho em pé;
- subtarefa cuja mãe também está no calendário **não vira linha própria**, senão a mesma peça
  apareceria uma vez por etapa do fluxo no mesmo dia.

Card mãe que não veio na varredura (não está alocado a nenhum dos designers varridos) é resgatado
por `parentTaskId`, uma leitura por mãe, com teto em `CALENDARIO_MAX_MAES_AVULSAS` — sem isso a peça
inteira sumiria do calendário justamente por causa de onde a data mora.

Na tela isso virou **três estados de dia**: preenchido = a postar, **vazado = já saiu** (dia todo
entregue), amarelo = hoje. Peça entregue não acende mais o alerta vermelho de "entrega depois de
postar" — o prazo já foi cumprido.


## O pop-up dos grupos da Central (2026-08-08)

`centralAbrirGrupo`/`centralRenderGrupo` (js/central-atendimento.js) + o bloco `.central-grupo-*` /
`.central-gc-*` no fim de `css/07-central-atendimento.css` + o markup no fim de
`#centralAtendimento`. Protótipo **"Prateleira"** aprovado pelo Cláudio.

**O que substitui:** clicar num dos quatro cartões de número da aba Hoje chamava
`centralAbrirAprovacoesEm`, que levava pra OUTRA aba e destacava uma coluna lá — a pessoa saía da
tela onde estava pra ver uma lista, e voltava clicando de novo. Agora abre por cima, e a **pílula
preta troca entre os quatro grupos sem fechar nada**, com os contadores sempre à vista.
`centralAbrirAprovacoesEm` continua existindo: é pra onde o grupo "Com o cliente" leva (ver abaixo).

- **Mora DENTRO de `#centralAtendimento`**, não solto no `<body>`: aquele é `position: fixed; inset:
  0; z-index: 50`, então o pop-up herda a moldura da Central e continua **abaixo** da conferência
  (`.apv-conferencia`, z-index 120) — que é o que precisa acontecer quando clicar num card abre ela.
- **O card:** a arte ocupa quase o cartão inteiro e a informação vem numa **prateleira branca
  flutuando por dentro dele** (`.central-gc-prat`). Dois níveis de branco e duas sombras
  encaixadas — a profundidade vem daí, não de borda. O card inteiro é o botão; a setinha é só a
  pista, e acende de preto no hover.
- ⚠️ **O texto do card muda com o grupo** (`CENTRAL_GRUPOS` + o bloco de selo em
  `centralCardDoGrupoHTML`): "Esperando você" mostra há quanto tempo espera, "Prontas pra enviar"
  quem conferiu, os dois do cliente há quanto tempo está fora. Sem isso, três dos quatro grupos
  mostrariam um dado que não serve pra eles.
- **Os quatro contadores são recalculados a cada desenho**, nunca guardados: conferir uma peça e
  trocar de grupo tem que mostrar o número novo.
- ⚠️ **`centralAbrirDoGrupo` lê o grupo ANTES de fechar o pop-up** — `centralFecharGrupo` zera
  `centralGrupoAtual`, então checar depois daria sempre falso e o "voltou com ajuste" nunca abriria
  no modo do cliente (`apvAbrirParaAlteracaoDoCliente`).
- **"Com o cliente" não abre conferência**, porque não existe uma: a peça está fora esperando
  resposta. Esse é o único grupo que ainda leva pra aba Aprovações, onde moram copiar o link e
  cobrar no WhatsApp.
- **O CHECK "já aprovou, por fora" (2026-08-09)** — `.central-gc-ok`, só neste grupo. Na vida real
  o cliente responde no grupo do WhatsApp, no e-mail ou na reunião, e o link ficava pendente pra
  sempre cobrando uma resposta que já veio; as duas saídas que existiam eram ruins (excluir o link
  perde o registro de que a peça FOI aprovada, ou deixar cobrando). `aprovarAprovacaoPorFora`
  (Aprovacao.gs) grava as MESMAS colunas que a resposta pelo link — status, quem aprovou, carimbo
  de hora — pra tudo que já lê isso continuar funcionando sem saber que existe esse caminho.
  ⚠️ **Só neste grupo, de propósito:** nos outros a decisão é nossa e tem tela própria, e um check
  ali seria um atalho pra aprovar sem olhar a arte. O canal e o nome de quem aprovou são
  perguntados (os dois opcionais) porque uma aprovação que ninguém rastreia depois é pior que
  nenhuma — se der problema, a primeira pergunta é "quem disse que estava aprovado?". E a coluna
  "quem aprovou" nunca recebe o nome de alguém da Beeon: isso faria "Concluídos" parecer que a
  agência aprovou a própria peça.
- **O pop-up não decide nada** — não aprova, não devolve, não manda link. Clicar num card abre a
  tela de conferência de sempre. Duplicar a decisão em dois lugares seria a chance de alguém
  resolver uma peça sem ter olhado a arte direito.

### A quinta aba: "Concluídos" (2026-08-08)

Os quatro grupos originais são trabalho EM ABERTO; este é **histórico**, e a pílula mostra isso:
um traço (`.central-grupo-risco`) separa ele dos outros e o contador é **verde** — aqui o número é
boa notícia, não trabalho acumulado. Quem marca a diferença no código é `historico: true` no
`CENTRAL_GRUPOS`.

- ⚠️ **São os últimos 7 dias, não tudo.** `listarAprovacoesPendentes` (Aprovacao.gs) só devolve
  aprovadas dentro de `APROVADAS_JANELA_DIAS`, de propósito, pra a lista não virar arquivo morto que
  só cresce. O texto do topo diz isso — senão o número pareceria "o total de sempre".
- **Custo zero:** essas linhas já vinham no mesmo cache que os outros grupos leem.
- **Clicar abre o LINK DO CLIENTE em aba nova**, não uma conferência: a peça fechou, não há o que
  decidir. O que ainda serve é ver a mesma página que o cliente viu, já com o "Aprovado" e o nome de
  quem confirmou.
- O selo do card mostra **quem aprovou** — e esse nome é do lado do CLIENTE (o que ele digitou na
  caixinha da página de aprovação), não de alguém da Beeon. É a única informação que essa aba tem e
  nenhuma outra tem.

**Navegação por seta:** ← e → andam entre os grupos na ordem da pílula. **Não circulam de
propósito** — chegar na ponta e voltar pro começo faz perder a noção de onde se está.

### O que preenche o espaço quando há poucas peças

Com três cards o pop-up era um cabeçalho e um vazio enorme. Duas peças ocupam esse espaço **com
trabalho**, e nenhuma delas custa uma busca nova — tudo sai do cache que a Central já lê.

- **Busca e seletor de clientes moram DENTRO da pílula preta** (2026-08-08) — ela deixou de ser só
  troca de aba, no mesmo espírito da `.topbar-dark` do quadro, que é status + ações. As abas
  encolhem pra abrir espaço; a busca é quem estica com o que sobra.
  - A busca procura no nome do CLIENTE e no da PEÇA ao mesmo tempo, sem acento — ninguém deveria ter
    que escolher em qual campo está procurando. Esc dentro dela limpa o campo em vez de fechar o
    pop-up.
  - O seletor lista **todos os clientes do atendimento** (de `pdTodosClientesPlano`, a mesma fonte
    de `centralClienteEhDoLogado`), não só os que têm peça no grupo — quem não tem aparece apagado
    e com zero. ⚠️ O estado guarda quem está **FORA** (`centralGrupoForaDoFiltro`), não quem está
    dentro: o padrão é todos marcados, e um cliente novo já nasce marcado sozinho.
  - O botão acende na cor do grupo quando há filtro ligado — dá pra ver que a lista está cortada sem
    abrir o menu.
  ⚠️ Os dois filtros cortam a GRADE, **nunca os contadores da pílula preta**: eles são o tamanho do
  grupo, e mudar com o filtro faria parecer que peça sumiu do sistema.
- **Cada grupo tem uma cor** (`.cor-prontas`, `.cor-comCliente`, …, via `--central-g`), e ela pinta a
  aba acesa, o botão de filtro ligado e os detalhes do lado direito. A tela muda de temperatura ao
  trocar de grupo — cor com significado, não enfeite.
- **Coluna de contexto** (`centralRenderLadoDoGrupo`), que tem dois estados:
  - sem cliente escolhido → **"esperando há mais tempo"** (`centralEsperandoMaisHTML`): uma barra
    por cliente, proporcional ao mais antigo do grupo, âmbar ao passar de `APROVACAO_DIAS_ALERTA`.
    O piso de 6% na largura existe pra "hoje" ainda desenhar uma barrinha — largura zero parece
    dado faltando, não dado pequeno.
  - com UM cliente sozinho no filtro → **o radar dele** (`centralRadarDoClienteHTML`, protótipo 2
    aprovado pelo Cláudio): os três números daquele cliente (há quanto tempo parado, quantas com
    ele, quantas aprovadas), a timeline dele e as duas ações — copiar link e cobrar. A timeline sai
    das MESMAS fontes do feed da aba Hoje (`centralConstruirTimeline`), só filtradas: funciona sem
    busca nova porque os eventos já carregam `cliente` desde que o feed foi feito.
    ⚠️ Quem decide entre ranking e radar é a lista **já filtrada** ter exatamente um cliente — não o
    seletor. Buscar por um cliente também abre o radar dele, o que é o certo.
  - ⚠️ Ela **some no celular** (media query): numa tela estreita roubaria a largura dos cards, que
    são o assunto. O filtro por cliente fica — ali ele ajuda ainda mais.
- **Dois cuidados de texto na timeline:** `ev.quem` é o DESIGNER num "mandou pra conferência" e o
  CLIENTE nos dois de resposta — numa coluna que já é de um cliente só, repetir o nome dele em cada
  linha é ruído, então nesses casos o nome sai. E `ev.texto` foi escrito pro feed, onde o nome fica
  numa linha acima ("Mandou X pra conferência"); inline, depois do nome, ele começa minúsculo.

## A Timeline da Central virou um feed (2026-08-08)

`centralRenderTimelineHoje` (js/central-atendimento.js) + o bloco `.central-tl-*` em
`css/07-central-atendimento.css`. É o card preto de altura total da aba **Hoje** da Central do
Atendimento — a mesma tela que `colmeia.beeon.com.br/Laura` abre. Era uma lista de linhas apertadas
com uma faixa de miniatura de 46px; virou um **feed no vocabulário de rede social** (protótipo "Feed
cheio" aprovado pelo Cláudio): avatar de 34px, quem em destaque, hora abaixo do nome, pastilha de
status à direita, e a peça **quase quadrada** (`aspect-ratio: 5/4`, a proporção da referência que o
Cláudio mandou) com o nome do cliente e o "CONFERIR" por cima.

- **A coluna tem largura de CELULAR, não uma fração da tela.** Era `1.15fr`: num ultrawide ela
  passava de 500px e as artes viravam imagens enormes — feed de rede social não estica pros lados,
  tem uma coluna e ponto. Hoje é `minmax(320px, 400px)`, e o espaço que sobra vai pros outros cards,
  que ganham em ser largos. **Entre 900px e 1200px ela volta a ser fração** (media query própria):
  reservar 320px ali deixaria os cartões de número com ~90px. E no empilhado (≤900px) ela leva
  `max-width: 440px` + `justify-self: center`, senão num tablet ocuparia 620px e esticaria de novo.
- **A arte usa `aspect-ratio: 5/4`, nunca altura fixa** — a proporção da referência do Cláudio.
  Com altura fixa ela virava faixa larga na tela grande e quadrado na pequena. ⚠️ `.sem-imagem`
  precisa zerar o `aspect-ratio` junto com a altura, senão a proporção ganha e a faixa não encolhe.

- ⚠️ **Foto SÓ no evento "mandou pra conferência"** (decisão do Cláudio). Ajuste e aprovação falam
  de uma peça que já passou por aqui — a arte não é informação nova neles, e sem foto esses eventos
  encolhem sozinhos, o que dá espaço pros que têm. Quem decide é `fileId` no JS (fica `null` nos
  dois casos); o CSS não esconde nada.
- **O pedido do cliente aparece por extenso** (`citacao`, de `respostaTexto`) num bloco de citação.
  Antes ele só existia depois de abrir a conferência, sendo que é a instrução do que fazer.
- **Miniatura que não vem não pode levar o botão junto:** `centralCarregarMiniaturaTimeline` só
  remove o bloco da arte se ele NÃO tiver o "Conferir" dentro; tendo, ele encolhe pra uma faixa
  (`.sem-imagem`) em vez de sumir. Trocar um problema de aparência por um de função seria pior.
- **Dois cliques diferentes no mesmo post:** o post inteiro é clicável só no "pediu ajuste" (abre a
  conferência no modo do cliente); no "mandou pra conferência" quem leva é o botão em cima da arte
  — daí o `stopPropagation` nele, senão os dois disparariam.

## O link de aprovação encurtou e virou legível (2026-08-08)

O time reclamou que os links eram grandes demais pra mandar pro cliente e enchiam o comentário da
tarefa. Eram dois links diferentes, os dois inchados pelo mesmo motivo (um UUID de 32 caracteres):

| | Antes | Agora |
|---|---|---|
| Link do cliente | `…/aprovar.html?codigo=<32>` (80 chars) | `…/adn/11505-k7m2` (**42**) |
| Link do comentário | `…/aprovacoes?tarefa=114526&peca=<32>` (90 chars) | `…/aprovacoes?t=114526&p=k7m2p9` (**54**) |

**O formato do link do cliente é `sigla/idDaTarefa-cadeado`** (`montarCodigoDeAprovacao`,
Aprovacao.gs). Sigla e id existem pra ser LIDOS — bater o olho e saber de qual cliente e tarefa é.
**O cadeado de 4 letras é o que não pode sair:** a página não tem login, e sigla e id são os dois
adivinháveis (a sigla sai do nome do cliente, ids do Runrun.it são sequenciais). Sem ele, quem
recebesse um link abriria a peça de qualquer outro cliente trocando o número — e aprovaria no lugar
dele. Com ele são 1,6 milhão de combinações por tarefa, e não existe lista de tarefas pra varrer.

**A sigla é mista:** automática (as consoantes do nome — Bauducco → `bdc`), com um campo editável
por cliente no painel de Configurações → Clientes (coluna J da aba `LinksClientes`, vazia = "usa a
automática"). Duas siglas iguais **não são problema**: o que identifica a aprovação é o código
inteiro, e o id da tarefa já é único — o campo existe só pra ficar óbvio de quem é.
⚠️ `siglaAutomaticaDeCliente` existe **duas vezes** (Aprovacao.gs e js/config.js): o painel precisa
mostrar a dica antes de salvar, e uma ida ao servidor só pra isso deixaria a lista lenta. Divergir
só faz a dica mostrar letra diferente da que o link usa — mas ao mexer numa, mexer na outra.

**Quem faz o link bonito funcionar é o `404.html`.** O GitHub Pages não tem servidor: `/adn/11505-k7m2`
não é arquivo nenhum, então cai no 404. Até aqui esse arquivo só sabia **subir uma pasta**, e
`/adn/` também não existe — era o laço infinito de 2026-08-04. Agora ele **reconhece o padrão de
aprovação e manda direto pro `aprovar.html?c=<codigo>`**, sem passar pela encomenda do
sessionStorage. É o único lugar do site que consegue ler um caminho inventado e decidir o que fazer,
porque é servido pra qualquer endereço inexistente em qualquer profundidade.
⚠️ O `else` em volta do caminho normal é **obrigatório**: `location.replace` não interrompe o
script, e sem ele o desvio do fim do arquivo escreveria por cima do destino da aprovação.

**Nada foi migrado, e nada precisa ser.** A busca sempre foi por igualdade exata do código
(`acharLinhaDeAprovacao`), que nunca dependeu do tamanho. Links já mandados pra cliente continuam
abrindo: `aprovar.html` lê `?c=` (novo) **e** `?codigo=` (antigo), `linkDeAprovacaoDoCliente`
(js/config.js) decide o formato pela presença de uma barra no código, e o roteador lê `t`/`p` e
`tarefa`/`peca`.

**`linkDeAprovacaoDoCliente` é ponto único.** A montagem da URL estava copiada em 5 lugares (hub do
cliente, fila de repasse e 3× na conferência) — um formato novo teria que ser lembrado nos cinco.
Nunca montar essa URL na mão de novo.

### ⚠️ Copiar link: sempre por `copiarTexto`, nunca por `navigator.clipboard` direto (2026-08-09)

`navigator.clipboard.writeText` só funciona **logo depois de um clique** — o navegador dá uns 5
segundos de permissão por interação e depois recusa **em silêncio** (promessa rejeitada, nada na
tela). Isso quebra qualquer botão que precise ir ao SERVIDOR antes de copiar.

Foi o bug do "copiar link" da pílula de cima da conferência: pela barra de baixo costumava
funcionar (o link já tinha sido gerado no "Ver como o cliente vê", então a cópia era instantânea),
pela pílula quase nunca — ali o link ainda não existia e `gerarLinkDeAprovacao` num Apps Script
frio passa dos 5 segundos com folga.

`copiarTexto(texto, rotuloDoPrompt)` (js/config.js) tenta o jeito moderno, cai pra
`document.execCommand("copy")` (obsoleto, mas **não** depende dessa janela de tempo — é o que salva
justamente esse caso) e, se nem isso, joga o texto num `prompt` pra dar pra copiar na mão. Devolve
`true` só quando copiou sozinho. **Pré-gerar o link ao aprovar resolveria o atraso, mas está
descartado de propósito:** o link vira uma linha `pendente` na planilha, e a peça apareceria em
"Aguardando o cliente" sem ninguém ter mandado nada.

**O `loteId` também encolheu** (32 → 6 caracteres, `pedirConferenciaInterna`): ele ia inteiro no link
do comentário. É seguro porque `linhasDoLote` filtra por `taskId` **antes** de comparar o lote — só
precisa ser único dentro de uma tarefa.

## Link de aprovação: várias peças, e vídeo pelo player do Drive (2026-08-04)

Três coisas quebradas no link de aprovação, corrigidas juntas:

**1. Não dava pra mandar mais de uma peça.** O menu de escolha era de item único (clicava numa peça
e fechava), então "dois vídeos no mesmo link" era impossível. Agora é caixa de seleção, **todas
marcadas por padrão** (quem abre esse menu quase sempre quer mandar tudo que subiu), com um botão
"Gerar link" no fim. Na planilha, vários arquivos vão na MESMA célula separados por `|`
(`gravarLinhaDeAprovacao`/`idsDaLinhaDeAprovacao`, Aprovacao.gs) — id do Drive nunca tem esse
caractere, e linha antiga com um id só continua sendo lida como uma lista de um item, sem migração.

**2. O link aparecia num aviso que sumia.** Quando o navegador recusava a cópia automática
(`navigator.clipboard` falha sem permissão/foco), o único lugar onde o link existia era um toast de
alguns segundos — o Cláudio via "o link aparecer rápido e sumir". Agora o link vira uma **fala da
Bee** (`mostrarLinkDeAprovacaoDaBee`, js/detalhe-modal.js), escrito por extenso e com botão de
copiar, no mesmo `#beeInlineAvisos` das outras falas dela — não some e sobrevive à lista de
comentários ser redesenhada.

**3. Vídeo nunca abria** ("Não consegui carregar essa peça — pode ter sido movida ou apagada do
Drive", com o arquivo lá). A mensagem era enganosa: `buscarAprovacaoPublica` mandava a peça
embutida em base64, e qualquer vídeo estoura o limite de 25MB do Apps Script — o `catch` genérico
traduzia o erro de tamanho como "arquivo sumido". Agora **vídeo nunca vai embutido**: o arquivo é
liberado como "qualquer pessoa com o link" (`liberarArquivoParaAprovacao`) e a página mostra o
player do próprio Drive num iframe. Imagem continua em base64 (funciona bem e não precisa expor);
imagem grande demais cai no mesmo player, em vez de falhar.

**Sobre liberar o arquivo** (decisão do Cláudio, 2026-08-04): libera SÓ o arquivo mandado pra
aprovação, nunca a pasta. É o único jeito de vídeo funcionar numa página sem login — e o cliente ia
ver a peça de qualquer forma. Falhar aqui não impede gerar o link (imagem segue por base64), por
isso `liberarArquivoParaAprovacao` não estoura erro.

Uma peça que falhar não derruba as outras: ela vira um item com `erro` e o aviso aparece só naquele
quadro. Pins continuam só na primeira peça e só em imagem embutida — no player do Drive o clique é
do player, não dá pra saber onde caiu.

## Aba "Aprovações" na Fila de repasse (2026-08-04)

Protótipo aprovado pelo Cláudio antes de implementar. Uma 5ª aba na Fila de repasse com o que foi
mandado pro cliente e ainda não voltou — três colunas por situação (**Aguardando o cliente** /
**Pediu ajuste** / **Aprovadas**), em vez de uma lista só: assim "o que preciso cobrar" e "o que
voltou pedindo ajuste" não se misturam com o que já está resolvido.

**Diferente das outras abas, essa não sai das tarefas do quadro.** `renderRepasse()` desvia pra
`renderAprovacoesRepasse()` ANTES de qualquer filtro de tarefa: os dados vêm da planilha de
aprovações (`listarAprovacoesPendentes`, Aprovacao.gs), porque um link de aprovação existe
independente de a tarefa ainda estar aberta no Runrun.it.

- **`pendente` e `ajuste` entram sempre**, independente da idade (enquanto o cliente não responde,
  é trabalho em aberto). **`aprovado` só dos últimos 7 dias** (`APROVADAS_JANELA_DIAS`) — serve pra
  fechar o ciclo, não pra virar arquivo morto que só cresce.
- **O tempo de espera vira alerta vermelho depois de 3 dias** (`APROVACAO_DIAS_ALERTA`, borda do
  card + cor do texto). É isso que faz a aba responder "o que preciso cobrar hoje" em vez de ser um
  histórico passivo.
- **"Cobrar no WhatsApp" usa `wa.me/?text=` SEM número**, igual já é feito na página de aprovação
  (aprovar.html): abre o seletor de conversa do próprio WhatsApp pra pessoa escolher o grupo do
  cliente, em vez de o Colmeia decidir um número.
- O contador vermelho da aba conta **pendente + ajuste** (o que precisa de você), nunca as
  aprovadas — e é buscado já ao abrir a página, mesmo sem entrar na aba.
- Reaproveita `.repasse-column`/`.repasse-card`/`.repasse-btn` no CSS; só o que é específico de
  aprovação (`.aprov-*`) foi criado.

## Quando o Runrun.it cai (2026-08-04)

Eles saem do ar de vez em quando, e aí TUDO que depende deles falha junto. Antes cada tela
inventava a própria mensagem técnica, e — pior — a página de aprovação **mentia** pro cliente.

**O buraco silencioso que existia:** `responderAprovacaoPublica` (Aprovacao.gs) grava a resposta na
planilha PRIMEIRO e só depois comenta na tarefa do Runrun.it, dentro de um `try/catch` que engolia o
erro. Com o Runrun.it fora: a resposta do cliente era salva (bom), mas o comentário não chegava, o
cliente via "já avisamos o time" e o designer nunca ficava sabendo. Ninguém dos dois lados
descobria — só quando o cliente cobrasse.

**A logística agora, ponta a ponta:**

1. **Detectar** — `runrunFetch` (RunrunLeitura.gs) marca `runrunForaDoAr` no cache (2 min) quando a
   resposta é 5xx/429/0 ou nem chega a responder, e LIMPA a marca em qualquer resposta boa. Só
   isso conta como queda: 401/403/404 são problema nosso (token, id que não existe) e não acendem
   o aviso. `runrunPareceForaDoAr()` é quem responde a pergunta.
2. **A resposta do cliente nunca se perde** — ela já era salva antes do Runrun.it entrar na
   história, e isso não mudou.
3. **Contar a verdade pro cliente** — `responderAprovacaoPublica` agora devolve `avisoChegou`.
   Sendo `false`, a página mostra "Sua resposta está salva com a gente, mas o nosso sistema está
   fora do ar" e oferece o WhatsApp (que passa a aparecer também no "aprovado", onde normalmente
   fica escondido). Se nem a peça carregar, `mostrarErroDeServidor()` (aprovar.html) diferencia
   "servidor fora" de "link errado" — mandar o cliente conferir o link quando o problema é nosso
   só faz ele achar que errou.
4. **Reenviar sozinho** — o que não saiu fica marcado na coluna N da aba `Aprovacoes`
   (`marcarAvisoDeAprovacaoPendente`) e `reenviarAvisosDeAprovacaoPendentes` tenta de novo em dois
   momentos: quando alguém abre a aba "Aprovações" e no backup diário. O comentário reenviado diz
   que é atrasado e quando o cliente respondeu de verdade — quem lê precisa saber disso.
5. **Avisar quem está no Colmeia** — `mostrarAvisoRunrunFora` (js/config.js) põe uma faixa fixa no
   topo dizendo o que funciona e o que não funciona. NÃO some sozinha (diferente do toast): some
   quando a próxima varredura do quadro conseguir falar com eles de novo.
6. **Mostrar o preso na aba Aprovações** — o card ganha `.aprov-preso` avisando que o cliente já
   respondeu mas o recado ainda não entrou na tarefa, pra ninguém achar que não houve resposta.

**Tom das mensagens, de propósito:** amarelo (a cor da casa), nunca vermelho, e sem jargão. Pro
cliente, "fora do ar" não é erro dele nem problema dele — e a resposta que ele acabou de dar está
salva. Ele sempre tem dois caminhos (tentar de novo / WhatsApp), nunca um beco sem saída.

## Migração pro Supabase — aba por aba, sem reescrever nada (2026-08-10)

`Supabase.gs` + a pasta `supabase/` (os comandos SQL de cada tabela, em ordem).

**O problema que motivou:** `pegarTravaDaPlanilha` usa `LockService.getScriptLock()`, que não trava
uma linha nem uma aba — trava o **script inteiro**. Os 90 pontos de gravação do Colmeia disputam uma
fila só: enquanto alguém grava um comentário, mais ninguém consegue gravar nada, nem coisa sem
relação nenhuma. É o único ponto que já está no tamanho errado pro time de hoje. O resto
(GitHub Pages, Runrun.it como dono da tarefa, o cache em camadas) está certo e não se mexe.

**A decisão principal, e a que mais economiza:** o front-end **não muda uma linha**, e o Apps Script
continua sendo a camada de API. Só o miolo das funções que gravam troca de lugar de guardar —
`navegador → Apps Script → planilha` vira `navegador → Apps Script → Supabase`, sem ninguém acima
saber. Migrar pra Edge Functions/Cloudflare foi descartado por ora: o Apps Script **não é** o
gargalo, a trava é. Firebase/Firestore também — o dado do Colmeia é claramente relacional (tarefa,
cliente, designer, aprovação, todos se referenciando por id) e forçar um banco de documentos custaria
redesenhar o modelo inteiro em vez de só trocar onde ele mora.

**Como cada aba troca de lado, sem deploy e com volta atrás de graça:** a propriedade de script
`SUPABASE_TABELAS` lista as tabelas que já mandam no Supabase, separadas por vírgula.
`supabaseManda(tabela)` responde por tabela.
- Fora da lista → grava nos **dois** lugares, lê da planilha (fase de conferência).
- Dentro da lista → lê do Supabase, e a planilha vira cópia de segurança.

Tirar o nome da lista volta tudo ao normal na hora. E **enquanto `SUPABASE_URL`/`SUPABASE_KEY` não
existirem, nada muda**: `supabaseConfigurado()` dá `false` e todo o caminho novo é pulado — por isso
dá pra publicar esse código com segurança antes de o banco existir.

**Ler do Supabase que falhou cai na planilha, nunca devolve vazio.** Mesmo cuidado do
`chamarBackend`/`caiuARede` do front-end: "não deu pra perguntar" não é "não tem nada". Devolver `[]`
numa falha de rede é exatamente o bug que já apagou a conversa inteira da tela uma vez.

**A chave tem que ser a `service_role` LEGADA — a nova não funciona aqui.** O Supabase oferece
primeiro as chaves novas (`sb_secret_...`) e esconde a legada numa segunda aba, mas a nova responde
`401 — Forbidden use of secret API key in browser`: ela barra pedido com cara de navegador, e o
`UrlFetchApp` do Apps Script se identifica assim sem deixar trocar esse cabeçalho. Não é
configuração errada — é uma checagem que o Apps Script não tem como passar. `testarSupabase()` já
reconhece esse erro e diz o que fazer.

**A chave `service_role` só pode viver nas propriedades do Apps Script.** Ela passa por cima de
qualquer permissão do banco; no front-end (que é público) qualquer pessoa que abrisse o Colmeia
teria o banco todo. Toda tabela nasce com `enable row level security` e **nenhuma policy** — assim a
chave pública (anon) não lê nem escreve nada, e só o backend passa.

**Ordem da migração** (do menos arriscado pro mais valioso):
1. `FeedEventos` ✅ — a peça-piloto: pequena, ninguém depende dela pra trabalhar e o dado se apaga
   sozinho em 14 dias. Serve pra exercitar chave/conexão/gravação/leitura/limpeza antes de encostar
   em algo que dói perder.
2. `Log de Plays` e `PedidosAtencao` ✅ — mesma forma, feitas juntas de propósito: separar seria
   repetir a mesma conversa três vezes sem aprender nada. O Log de Plays é a aba que mais cresce do
   Colmeia (uma linha por play, 60 dias de validade) — é onde a varredura linear mais custava.
   `buscarPlaysDeHoje` continua **agrupando por tarefa no Apps Script** nos dois caminhos: o que muda
   é só de onde vêm as linhas (o banco já entrega filtradas). Um cálculo só, sem os dois lados
   poderem divergir.
3. `BeeChat` — hoje a conversa inteira mora dentro de UMA célula por tarefa; vira uma linha por
   mensagem, e a conversa passa a poder ser buscada.
4. O fluxo de aprovação — **o prêmio**: onde mais gente escreve ao mesmo tempo (designer,
   atendimento e o cliente pelo link público), e onde a trava única mais dói. São **quatro** abas,
   não três, migradas em quatro etapas separadas e ordenadas por QUEM mexe em cada uma:
   `HistoricoConferencias` ✅ (ninguém: é arquivo) → `ConferenciaInterna` ✅ (atendimento e designers)
   → `Devolucoes` ✅ (atendimento) → `Aprovacoes` (**o cliente**, na página sem login — por último,
   com as outras três já rodando).
   **Uma aba vira uma tabela, com as mesmas colunas — sem redesenhar o modelo.** É tentador
   aproveitar a viagem pra separar as peças de um lote em tabela própria ou transformar o
   `fileId1|fileId2` numa lista de verdade; reformar o fluxo junto multiplicaria o risco justo onde
   menos se pode errar. Depois de estar no banco, essas melhorias ficam baratas. As duas únicas
   exceções não mudam comportamento: as colunas penduradas depois entram como colunas normais, e —
   **plano revisto em 2026-08-10, na etapa 3** — os campos que guardam JSON em texto (`pins`,
   `pecas_json`, `respostasPecas`) **continuam em texto, não viram `jsonb`**: o ganho seria consultar
   dentro do JSON, coisa que nada no Colmeia faz, e o custo é concreto — o Postgres reescreve `jsonb`
   no formato dele (espaço e ordem das chaves mudam), e aí `supabaseConferir` acusaria diferença em
   toda linha sem nenhuma diferença existir. Trocar a rede de segurança por um recurso que ninguém
   pediu é mau negócio. Vira `jsonb` no dia em que alguém precisar perguntar algo pro conteúdo.
   ⚠️ **O cabeçalho da aba `Aprovacoes` mente:** ela é criada com 13 colunas (A:M) e o código lê até
   a 17ª — `aviso_pendente`, `quemAprovou`, `respostasPecas` e `consultandoEm` foram penduradas
   depois, cada uma com um remendo `if (getLastColumn() < N)`. Ao migrar, tirar as colunas de
   `linhaParaObjetoDeAprovacao`, **nunca do cabeçalho**.
5. Login com sessão de verdade — hoje a senha sozinha identifica a PESSOA.
6. As abas de cadastro (LinksClientes, Pessoas, AcessoRapido) — **talvez nunca**: quase não têm
   escrita concorrente, e vale muito poder abrir a planilha e corrigir uma linha na mão.

**Toda aba migrada precisa da CÓPIA INICIAL antes de virar a chave.** Gravar nos dois lugares só
vale dali pra frente — sem copiar o que já está na aba, a tela daquela aba apareceria vazia até o
banco encher de novo. `supabaseCopiaInicial` (Supabase.gs) é a função comum; cada aba tem só um
`migrar<Aba>ParaSupabase()` de três linhas por cima dela. Apaga e recopia (rodar duas vezes não
duplica) e **se recusa a rodar depois da virada** — aí quem manda é o banco, e recopiar por cima
apagaria o que só existe lá.

**O truque que fez a `ConferenciaInterna` caber sem reescrever as telas:** o banco devolve as linhas
no **mesmo formato da planilha** — um array por linha, na ordem das colunas (`COLUNAS_CONFERENCIA`,
AprovacaoInterna.gs), com um cabeçalho de mentira na posição 0. Com isso `loteIdDaLinha`,
`linhasDoLote`, `acharLinhaDaConferencia` e todos os leitores continuam valendo letra por letra;
só muda de onde as linhas vêm (`linhasDaConferencia()`). **Vale repetir nas próximas etapas.**

**O que muda de verdade é a ESCRITA, e é aí que está o ganho.** Essa é a primeira tabela que
*atualiza* linha em vez de só anexar (pendente → aprovada → enviada; ou → devolvida → pendente de
novo). Na planilha, mexer numa peça era "descubra que ela é a linha 7, varrendo a aba, e escreva na
linha 7". No banco a peça tem identidade — `(task_id, nome_peca)`, com índice único — então
`salvarConferenciaNoBanco` faz "atualiza se existe, cria se não" em um comando, sem procurar e sem
trava.

⚠️ **Quem é do lote continua sendo decidido por `loteIdDaLinha`, nunca por um filtro `lote_id` no
banco.** Linha antiga tem `lote_id` VAZIO e o lote dela é `taskId::nomePeca`; repetir essa regra em
SQL abriria a porta pros dois lados discordarem sobre o que é um lote — e aí uma aprovação pegaria
peça a menos ou a mais. `marcarConferenciaDevolvida` tem uma lista própria (por NOME, quando o lote
não aparece), e por isso usa `atualizarPecasNoBanco` direto em vez de `atualizarLoteNoBanco`.

**`reabrirDevolvidasComVersaoNova` continua lendo a PLANILHA de propósito**, mesmo depois da virada:
ela precisa do número da linha pra escrever de volta, e a planilha continua sendo escrita sempre
(logo, está completa). O banco ela atualiza pela identidade da peça, não pelo número.

**A partir do fluxo de aprovação, conferir de olho não basta mais.** Nas abas anteriores, validar era
abrir a tela e ver se parecia certo; uma linha errada numa aprovação não aparece em tela nenhuma,
aparece num cliente reclamando dias depois. `supabaseConferir` (Supabase.gs) compara os dois lados
linha a linha e diz o que não bate — recebe os MESMOS argumentos de `supabaseCopiaInicial`, então a
conferência de uma aba é uma linha depois da cópia dela. Como essas abas não têm coluna de
identidade, ela compara por "impressão digital" (todos os campos juntos, em texto) contando
repetições, então linha repetida de verdade continua batendo e a ordem não importa. **Rodar sempre
entre a cópia e a virada da chave.**

**`supabaseBuscarTudo`** existe porque o PostgREST corta em 1.000 linhas por pedido **sem avisar** —
uma conferência que ignorasse isso acusaria milhares de linhas "faltando" no banco.

**`testarSupabase()`** roda direto no editor do Apps Script e diz se as chaves estão certas — usar
antes de pôr qualquer tabela na lista.

## Bug recorrente conhecido

Nunca comparar tarefas por referência de objeto (`tasks[detailIdx] === task`). A atualização
automática do quadro (`atualizarKanbanEmBackground`) recria os objetos de tarefa periodicamente,
então comparações por referência quebram silenciosamente. Sempre comparar por `task.id`
(`String(tasks[detailIdx].id) === String(task.id)`).
Há muitos usos de `tasks[detailIdx]` no código (~38 ocorrências) — ao mexer perto de índice/detalhe,
prestar atenção a esse padrão.

Em 2026-07-28 esse mesmo bug apareceu em pelo menos 6 lugares diferentes (comparação por `!==`/`===`
direto no objeto) e causou 2 problemas reportados pelo usuário: (1) o briefing da IA parava de
carregar depois de clicar em play/pausa (`gerarBriefingComIA`, js/regras-briefing.js) — corrigido
comparando por id; (2) a notificação de "você subiu um arquivo no Drive" só funcionava uma vez e
depois nunca mais aparecia (`iniciarChecagemUploadEmSegundoPlano`/`renderNotificacoesUpload`,
js/notificacoes-uploads.js) — o `setInterval` se autodesligava assim que o quadro atualizava sozinho
em segundo plano, achando (por referência) que a tarefa tinha mudado. Além da comparação por id, tem
um segundo cuidado parecido: nunca guardar uma referência de elemento do DOM (`document.getElementById(...)`)
antes de um `await`/callback assíncrono se algo nesse meio-tempo pode redesenhar aquele pedaço da tela
(ex: `renderDetail()` sendo chamado de novo) — o elemento antigo é removido da tela e escrever nele não
aparece pra ninguém. Buscar o elemento de novo (`document.getElementById(...)`) depois do `await`,
bem perto da hora de usar.

## Notificações do sino (comentários) — 2026-07-28

Antes, o sino só calculava "comentários não lidos" na hora (comparando com o último visto no
`localStorage`) — assim que abria o sino, a notificação já sumia pra sempre da lista. Agora existe um
log próprio no `localStorage` (`colmeia_notificacoes_log_v2`, ver js/notificacoes-avisos.js) que
guarda cada comentário novo (autor, texto completo, tarefa, quando chegou) por até 2 dias
(`NOTIF_RETENCAO_MS`), independente de já ter sido visto ou não — abrir o sino só zera o contador
("vista: true"), o card continua na lista até completar os 2 dias. É só por navegador (mesmo padrão
de preferência por designer), não sincroniza entre dispositivos nem fica salvo na planilha.

- Também: `card mãe` que chega pro designer direto numa etapa normal (ex: "Revisão"), sem passar pela
  etapa "Card mãe" nem ser aberto a partir de uma subtarefa dela, agora ganha a setinha de "ver
  subtarefas" mesmo assim — `openDetail` chama `carregarFilhosSeForCardMae` (js/detalhe-modal.js), que
  usa a ação nova do backend `buscarSubtarefasDoCardMae` (Código.gs) pra checar se aquela tarefa tem
  `subtask_ids` e, se tiver, liga `task.isMotherCard`/`task.subtarefasResumo` e redesenha o pop-up.

## Decisões/padrões estabelecidos (2026-07-28)

- Preferências por designer (ordem de abas etc.) vão em `localStorage`, não no backend — cada
  designer usa seu próprio navegador/login, então não precisa sincronizar entre dispositivos.
  Convenção de nome de chave: `colmeia_<coisa>_v1`.
- `buscarTarefasRunrun()` (Código.gs) só busca tarefas **abertas** (`is_closed=false`) e **exclui**
  cards mãe (`tarefaEhCardMae`) — por isso `tasksTodas` no front nunca tem essas duas categorias.
  Pra qualquer feature que precise delas (ex: aba "Entregues"/"Card mãe" no Runrun completo), é
  preciso uma busca EXTRA e separada (`buscarExtrasRunrunCompleto`, ação `buscarExtrasRunrunCompleto`),
  chamada só quando a tela que precisa disso é aberta — nunca colocar isso no polling geral de 60s
  (`getTarefasColmeia`), senão fica lento pra todo mundo o tempo todo.
- Runrun.it não tem filtro de data na API de tarefas — pra buscar "coisas dos últimos N dias" sem
  varrer tudo, pede-se ordenado (`sort=updated_at&sortDir=desc`) e para de virar página assim que a
  primeira tarefa fora da janela aparece.
- Padrão de cache já usado em `Código.gs`: `CacheService.getScriptCache()` com `cache.get`/`cache.put`
  (chave string, JSON serializado, TTL em segundos). Usado em `buscarVinculosDoPainel` (10 min) e em
  `buscarUploadsRecentesDoCard` (15s, pra não re-varrer a pasta do Drive a cada poll de 8s do
  front-end enquanto um card fica aberto).
- Campo `createdAt` (data de criação da tarefa no Runrun.it) foi adicionado em `transformarTarefaParaColmeia`
  (Código.gs) e `mapearTarefaDoBackend` (js/pessoas-fotos.js) — usar esse campo pra qualquer ordenação
  "mais antigo pro mais novo".
- Vínculo de apelidos (painel de Pessoas): `pessoasSalvas[i].aliases` agora resulta em remover a
  linha do apelido da planilha (`excluirPessoasPorNomesNoBackend`, chama a ação já existente
  `excluirPessoasPorNomes` do backend) e esconder ele da lista do painel (`chavesDeApelidosAbsorvidos`
  em js/painel-pessoas-clientes.js), mostrando uma barrinha expansível "N vinculados" na pessoa principal. Isso é só
  visual no painel de Pessoas — nomes em cards/comentários/painel de clientes continuam mostrando o
  nome bruto (não foi pedido resolver em todo o app, só no painel).
- Cards do quadro/Runrun completo/Runrun completo usam `data-idx` (índice no array `tasks`/`tasksTodas`)
  pra ligar elementos à tarefa, e os handlers de clique buscam a tarefa fresca (`tasks[idx]`) no
  momento do clique, nunca guardando a referência do objeto de antes — segue o padrão já usado em
  `priority-wrap`/`assignee-wrap`. Isso evita o bug de referência obsoleta mencionado acima.

## Deploy automático do Código.gs (2026-07-28)

O `Código.gs` agora tem deploy 100% automático via GitHub Actions (`.github/workflows/deploy-apps-script.yml`):
a cada push na branch `main` que muda `Código.gs`, o workflow instala o `clasp` (`package.json`, só serve
pra isso — não tem relação com o frontend), restaura o login do clasp a partir do secret
`CLASP_CREDENTIALS`, gera um `.clasp.json` a partir do secret `SCRIPT_ID`, roda `clasp push --force` e
depois `clasp deploy --deploymentId <secret CLASP_DEPLOYMENT_ID>` — **atualiza a implantação de produção
existente, nunca cria uma nova**. Se existir o secret opcional `STAGING_DEPLOYMENT_ID`, também redeploya
lá como rede de segurança.

**IMPORTANTE — isso significa que não há mais revisão manual**: qualquer push que muda `Código.gs` na
`main` vai direto pro Apps Script de produção. Ao propor mudanças em `Código.gs`, ter isso em mente —
o aviso de "cole no Apps Script e crie uma Nova versão" (usado antes disso existir) não se aplica mais;
em vez disso, avisar que o push já publica sozinho.

`.claspignore` restringe o clasp a só enviar `Código.gs` (+ `appsscript.json` se existir) — sem isso ele
tentaria empurrar `index.html`/`js/*.js` (do frontend) pro Apps Script também.

**Coisas que travaram na primeira configuração (2026-07-28), pra não repetir o diagnóstico:**
1. `package.json` tinha que fixar a MESMA versão major do clasp que rodou o `clasp login` local
   (aqui, 3.3.0) — a v2 lê o arquivo de credenciais (`~/.clasprc.json`) num formato diferente
   (`token.access_token`) do da v3 (`tokens.default.access_token`), e dá
   `Cannot read properties of undefined (reading 'access_token')` se não bater.
2. O nome real do arquivo no projeto do Apps Script é **`Código`** (com acento), não `Code` — clasp
   identifica o arquivo remoto pelo nome local (sem extensão), então o arquivo aqui no repo TEM que
   se chamar `Código.gs` exatamente. `.clasp.json` tem `"fileExtension": "gs"` pra manter consistência.
3. `clasp push` exige um `appsscript.json` local pra aceitar enviar qualquer coisa (erro "Project
   contents must include a manifest file named appsscript."). Foi obtido com `clasp clone` numa pasta
   temporária separada (nunca clonar dentro deste repo — sobrescreveria `Código.gs` com a versão antiga
   que ainda estava em produção).
4. A conta Google usada no `clasp login` precisa ter a "Google Apps Script API" habilitada em
   https://script.google.com/home/usersettings, senão `clasp push` falha com "User has not enabled
   the Apps Script API".

Secrets do GitHub em uso: `CLASP_CREDENTIALS` (conteúdo de `~/.clasprc.json`), `SCRIPT_ID`,
`CLASP_DEPLOYMENT_ID` (produção), `STAGING_DEPLOYMENT_ID` (implantação de teste, opcional/rede de
segurança). O ID de qualquer implantação é o trecho entre `/s/` e `/exec` na URL do Web App dela.

## Toda ida ao backend passa por `chamarBackend` (2026-07-30)

Existiam 56 blocos `fetch(COLMEIA_API_URL, ...)` copiados pelo app, cada um com o seu try/catch.
Hoje **todos** passam por `chamarBackend(corpo)` (js/config.js) — a única exceção é a varredura do
quadro, que é GET e usa `chamarBackendGet("?tipo=tarefas")`. Nunca escrever um `fetch` novo pro
Colmeia direto; usar sempre esses dois. (Chamadas ao painel-designers-beeon são outra coisa e
continuam com `fetch` próprio.)

**O contrato, e por que ele importa:**
- resposta CHEGOU → devolve o JSON do backend (`{ok: true/false, ...}`);
- resposta NÃO CHEGOU (internet fora, servidor mudo, estourou o prazo) → `{ok: false, semRede: true}`.

Use `caiuARede(resposta)` pra distinguir. Isso separa **"não tem"** de **"não sei"**, que era a
causa de um bug feio: `buscarComentariosDoBackend` devolvia `[]` numa falha de rede, o chat era
redesenhado com essa lista e a CONVERSA INTEIRA sumia da tela. Hoje essa função (e
`buscarDescricaoDoBackend`) devolvem **`null` quando não deu pra perguntar** — quem chama tem que
tratar o `null` preservando o que já está na tela, nunca sobrescrevendo.

Todas as chamadas têm prazo máximo (25s; 90s pras ações de IA/Drive listadas em `ACOES_DEMORADAS`).
Antes não havia nenhum e uma tela podia ficar "pensando" pra sempre.

Os `try/catch` que sobraram em volta de várias chamadas hoje protegem só o código de tratamento
(o `chamarBackend` não estoura erro) — são inofensivos, não são sinal de que algo ficou pela metade.

## Caches — todos têm teto ou validade

- **No navegador:** `cacheComentariosPorTarefa`, `chatMaeCache` e `cardMaeCache` são `Map` que
  cresciam pra sempre numa aba aberta o dia todo. Agora têm teto (`podarCacheDeComentarios`,
  `podarCacheMap`) e descartam os mais antigos. Ao criar um `Map` de cache novo, dar teto também.
- **No backend:** `/users` do Runrun.it fica 6h em cache (`buscarUsuariosRunrunComCache`) — id de
  pessoa não muda e isso era buscado do zero em toda varredura. As prioridades da planilha ficam
  5 min (`getPrioridadesSalvas`), e **qualquer gravação de prioridade tem que chamar
  `invalidarCacheDePrioridades()`**.

## Varredura do quadro é PARALELA (2026-07-30)

`buscarTarefasAbertasSeparadas` (RunrunLeitura.gs) buscava as tarefas dos 3 designers em fila
indiana. Agora usa `runrunFetchAll` e busca a página 1 dos três de uma vez, depois a página 2 de
quem ainda tem mais. Mesmo resultado, bem mais rápido. Ao mexer nessa função, lembrar que ela é o
caminho crítico de TODO refresh do quadro — nada de acrescentar chamada sequencial ali dentro.

Pelo mesmo motivo, `_verificarNotificacoesImpl` busca comentários em **lotes de 4** (`emLotes`),
não todos de uma vez: a primeira checagem da sessão disparava um pedido por tarefa no mesmo
instante, justo na abertura do app.

## Versão nas tags `<script>`/`<link>` do index.html

Elas terminam com `?v=AAAA-MM-DDx` (ex: `js/config.js?v=2026-07-30a`). Sem isso, o GitHub Pages
guarda os arquivos por ~10 min e um designer podia ficar com **HTML novo + JavaScript velho**
depois de um push, vendo bug que "já foi corrigido". **Ao mudar qualquer arquivo de `js/` ou
`css/`, trocar essa versão em TODAS as tags do index.html** (mesmo valor pra todas). A checagem
automática ignora o `?v=` ao conferir ordem e nomes.

## Fluxo de trabalho

- Validar sintaxe de JS depois de qualquer edição.
- Fazer commit e push direto no repo git ao terminar uma alteração testada (sem pedir confirmação
  extra, a menos que a mudança seja arriscada).
- Desde 2026-07-28, push que muda `Código.gs`/`appsscript.json` na `main` publica sozinho em produção
  (ver "Deploy automático" acima) — não pedir mais pra colar manualmente no Apps Script.

## "Precisa de atenção" — a pílula da Timeline (2026-08-09)

`js/central-atencao.js` + a aba `PedidosAtencao` (Planilha.gs) + o bloco `.central-atencao-*` no fim
de `css/07-central-atendimento.css`. Protótipo 2 aprovado pelo Cláudio ("o card preto vira a
revisão"), com o cartão no desenho de pastilhas da versão B ("fala da Bee").

**Onde ela mora mudou no mesmo dia (2026-08-09, pedido do Cláudio):** nasceu no rodapé da Timeline
e SUBIU pra barra preta do topo, como um **pill amarelo** ao lado do de cliente — mesmo espírito da
pílula do "tocando" no quadro. O rodapé era o pé de uma coluna que rola, e o que pede decisão não
podia estar lá. Clicar expande a revisão num painel ancorado no pill (`#centralAtencaoPop`), em vez
de cobrir o card preto: um baralho de cartões, uma peça por vez, cada uma saindo por um de dois
lados (arrastando, pelos dois botões redondos, ou pelas setas ← →).

- **Sem fila, o pill não existe** — some da barra inteiro em vez de ficar zerado. É o que impede
  virar enfeite permanente, e o que faz o topo não ganhar mais um botão fixo.
- **A fila inclui as ATRASADAS** (`publicacao < hoje` e não entregue), não só hoje/amanhã. Na
  primeira versão a peça que passava do dia de postar sem ficar pronta — o caso mais grave — saía
  da fila no dia seguinte, como se tivesse se resolvido sozinha. `CENTRAL_ATENCAO_DIAS_ATRAS` (14)
  é o teto: peça de um mês atrás não é decisão de hoje, e fila de 40 cartões ninguém revisa.
- **Com atrasada na fila o pill fica VERMELHO** (`.tem-atrasada`), não amarelo: aí não é mais "olha
  isso", é "isso já passou do prazo". O resumo cita as atrasadas primeiro e sempre.
- **A altura do painel é FIXA** (`height`, não `max-height`): o baralho é `position: absolute` por
  dentro, então sem altura definida no pai as cartas não têm de onde tirar tamanho e ele colapsa.

**A fila não custa nenhuma busca nova:** sai de `centralPostagens`, o MESMO array que o calendário
de postagens já busca uma vez por sessão (`calendarioDePostagens`, AprovacaoInterna.gs). Por isso a
pílula só aparece depois que o calendário chega — `centralRenderCalendario` chama
`centralRenderPilulaAtencao()` quando a busca volta.

**Os dois lados são propositalmente desiguais:**
- **Pedir atenção** grava na aba `PedidosAtencao`, cai no **sino do Colmeia de quem coordena**
  (`centralChecarPedidosDeAtencaoNoSino`, pendurada no fim de `_verificarNotificacoesImpl`) e vira
  um **evento vermelho na própria Timeline** — a cobrança é uma coisa que aconteceu, não um aviso
  que some. É isso que impede duas pessoas do atendimento de cobrarem a mesma peça: peça já cobrada
  para aquela data de postagem sai da fila da pílula.
- **Segurar** não grava nada e não avisa ninguém: só tira o cartão da frente **até o fim do dia**,
  em `localStorage` (`colmeia_atencao_seguradas_v1_<nome>`). Isso contraria a regra "decisão de
  trabalho vai pra planilha" só na aparência — o que doeria perder é a COBRANÇA; perder um
  "segurar" custa ver o mesmo cartão amanhã, que é exatamente o que se quer se a peça continua
  parada.

**Detalhes que já custaram tempo:**
- ⚠️ **Os botões ficavam por baixo da sombra da carta, e o conserto é no BARALHO, não neles.** Cada
  carta leva `z-index: 10/9/8` escrito na mão; sem `z-index` próprio, `.central-atencao-baralho`
  não abre contexto de empilhamento, então aquele 10 competia direto com o dos botões e vencia por
  número. Hoje o baralho tem `z-index: 1` (contexto criado) e o cabeçalho e os botões têm `2` — o
  10 das cartas passa a valer só lá dentro. Subir o z-index dos botões "resolveria" até o próximo
  ajuste; isso já quebrou duas vezes.
- A Bee fica na ESQUERDA da pílula, com o pontinho vermelho no ombro dela: à direita ela caía
  debaixo da bolinha flutuante da Bee (`.bee-fab`), que mora no mesmo canto. Pelo mesmo motivo, a
  `.bee-fab` some enquanto a revisão está aberta (`body.central-atencao-revisando`).
- O Esc é capturado em fase de CAPTURA, como na paleta de comando: sem isso ele fecharia a Central
  inteira por baixo da revisão.
- **O formato da peça (Feed/Stories/Reels…) é adivinhado pelo TÍTULO**, mesma ideia do
  `SUGESTOES_DE_PROGRAMA` (js/detalhe-modal.js). Sem palavra conhecida, a pastilha simplesmente não
  aparece — melhor faltar do que chutar errado.
