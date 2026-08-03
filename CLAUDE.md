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
  (`01-base`, `02-quadro`, `03-detalhe`, `04-paginas`, `05-componentes`), carregados por tags
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

**Ao criar um arquivo `.gs` novo:** é obrigatório liberá-lo no `.claspignore` (que ignora tudo por
padrão), senão o clasp não o envia e o deploy passa "com sucesso" mas as funções dele não existem em
produção. A checagem automática (`.github/scripts/checar-arquivos-gs.js`) barra esse esquecimento.

## Estrutura do frontend (index.html)

Páginas trocadas via `hidden` attribute, todas dentro de `<section class="app-page" id="page-...">`:
- `page-kanban` — quadro principal (`#board`)
- `page-clientes`, `page-atendimento`, `page-tipos`, `page-runrun`, `page-hoje`, `page-repasse`

## Estrutura do frontend (js/)

Em 2026-07-28 o antigo `script.js` (~6.000 linhas, um arquivo só) foi separado em 15 arquivos
(em 2026-07-30 o `detalhe-modal.js` passou de 2.000 linhas e virou 3, totalizando 17; em seguida
entrou a fila offline, 18; depois a Bee, 19; a página de horas, 20; a paleta de comando, 21; o
roteador de URL, 22; a história da peça, 23; e o modo foco, 24) menores dentro da pasta `js/`, cada
um cuidando de um assunto. **Não é um sistema de build** — não tem bundler, TypeScript, nem npm
envolvido no frontend. É só HTML puro: o `index.html` carrega os 24 arquivos com várias tags
`<script src="js/...">` seguidas, **na ordem certa**, perto do fim do
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
22. `detalhe-historia.js` — a aba **"História"** (linha do tempo da tarefa). Ver seção própria abaixo.
23. `modo-foco.js` — o **modo foco** (sessão de trabalho por tempo marcado). Ver seção própria abaixo.
24. `login-boot.js` — tela de login, restaurar sessão salva, ponto de partida do app.

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

## A aba "História" — linha do tempo da tarefa (2026-08-03)

`js/detalhe-historia.js`. Uma aba nova ao lado de "Descrição": briefing chegou → alguém trabalhou →
arquivo subiu → cliente comentou → entregue, cada evento com o tempo até o próximo bem visível.
Responde "por que demorou?" sem ninguém se defender — quase sempre é um buraco de espera, não
trabalho lento.

**Cada evento tem uma fonte diferente, e isso importa pra saber onde mexer:**
- "Tarefa criada" — `task.createdAt`, já vem no objeto (nenhuma busca nova).
- Comentários — `buscarComentariosDoBackend(task.id)`, a MESMA busca que já alimenta a aba
  Comentários — reaproveitada aqui, não busca de novo o que já ia buscar de qualquer jeito.
- "Começou a trabalhar" — ação `buscarHistoriaDaTarefa` (Código.gs) → `buscarHistoricoDePlaysDaTarefa`
  (Planilha.gs), lendo a aba "Log de Plays" filtrada por essa tarefa. O log só guarda o INÍCIO de cada
  play, não quando pausou — por isso é "começou a trabalhar às HH:MM", não uma duração de sessão.
- Arquivo adicionado — mesma ação → `buscarHistoricoDeArquivosDoCard` (Drive.gs), que lê TODOS os
  arquivos da pasta do card, sem o corte de 30 min que `buscarUploadsRecentesDoCard` usa pro aviso da
  Bee (são duas funções de propósitos diferentes, mesma pasta).
- "Entregue" — só o horário é exato se a entrega aconteceu NESTA sessão (`task._entregueEm`); senão
  usa `task.lastActivityAt` como aproximação (o Runrun.it não expõe o instante exato da entrega) e
  marca o evento como aproximado.

Segue o mesmo padrão de abas mutuamente exclusivas que "Descrição"/"Descrição card mãe"/"Tarefa
original" já usavam (`historiaAberta`, js/chat-comentarios.js) — inclusive chamando
`carregarHistoriaDaTarefa` **direto**, sem `typeof` de guarda: mesmo o arquivo carregando depois de
detalhe-modal.js, a chamada só acontece dentro de um clique, bem depois de todo script já ter
carregado (mesmo raciocínio de `carregarDescricaoCardMae`, que já é chamado assim de dentro de
detalhe-modal.js mesmo detalhe-cardmae.js carregando depois).

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
