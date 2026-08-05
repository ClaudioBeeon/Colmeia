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
roteador de URL, 22; a história da peça, 23; o modo foco, 24; a página Bee, 25; e a aprovação do
atendimento, 26) menores dentro
da pasta `js/`, cada um cuidando de um assunto. **Não é um sistema de build** — não tem bundler,
TypeScript, nem npm envolvido no frontend. É só HTML puro: o `index.html` carrega os 26 arquivos
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
26. `login-boot.js` — tela de login, restaurar sessão salva, ponto de partida do app.

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
- **Os botões de envio nascem apagados até "Ver como o cliente vê" ser usado uma vez.** Botão
  grande sozinho é sugestão, não proteção. É fácil de tirar se incomodar (parar de pôr a classe
  `.apv-envio-travado`) — foi combinado assim com o Cláudio, pra reavaliar depois de uso real.
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
