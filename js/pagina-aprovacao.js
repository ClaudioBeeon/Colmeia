// ============================================================================
// APROVAÇÃO INTERNA DO ATENDIMENTO — ESQUELETO (2026-08-04)
// ============================================================================
//
// ATENÇÃO, PRÓXIMA SESSÃO: este arquivo está PROPOSITALMENTE VAZIO de lógica.
// A camada visual (index.html + css/06-aprovacao.css) está pronta e revisada
// com o Cláudio; falta a parte funcional, que é o que este arquivo descreve.
// Cada função abaixo tem o contrato escrito em cima dela. Implemente por
// dentro, sem mudar as assinaturas — o HTML já está montado esperando esses
// ids e essas classes.
//
// ----------------------------------------------------------------------------
// O QUE ESSA TELA RESOLVE
// ----------------------------------------------------------------------------
// Hoje qualquer pessoa gera o link do cliente direto, sem ninguém conferir.
// O fluxo passa a ser:
//
//   Designer conclui a peça
//        ↓
//   ATENDIMENTO confere aqui  ← as telas deste arquivo
//        ↓
//   O mesmo clique prepara o link do cliente
//        ↓
//   Cliente aprova ou pede ajuste (aprovar.html, já existe)
//
// O erro que tudo isso existe pra evitar: mandar pro cliente a peça errada,
// a VERSÃO errada, ou uma peça que não atende o briefing. Toda decisão aqui
// deve ser avaliada por quanto reduz a chance disso. Quando tiver dúvida
// entre "bonito" e "óbvio", é óbvio.
//
// ----------------------------------------------------------------------------
// QUEM USA — a restrição mais importante
// ----------------------------------------------------------------------------
// O atendimento NÃO usa o Colmeia. Eles trabalham no Runrun.it e entram aqui
// só pra isso. Não conhecem a navegação, os ícones nem o vocabulário do app.
// Consequências práticas, que já estão respeitadas no HTML e devem continuar:
//
//   - nenhum ícone sem rótulo, nenhum atalho escondido como único caminho;
//   - botões escritos por extenso ("Aprovar e preparar envio", não "Aprovar");
//   - a conferência é um overlay que cobre o app inteiro, pra nada do resto
//     competir por atenção;
//   - volume de 10 a 20 peças por dia: vale "aprovar e ir pra próxima", mas
//     NÃO vale atalho de teclado nem aprovação em lote.
//
// ----------------------------------------------------------------------------
// AS 5 TELAS E ONDE ELAS ESTÃO NO HTML
// ----------------------------------------------------------------------------
//   1. Fila               #page-aprovacao      → lista o que espera conferência
//   2. Conferência        #apvConferencia      → briefing | peça (overlay)
//   3. Envio              #apvEstadoEnvio      → MESMA tela da 2, estado trocado
//   4. Devolver           #apvOverlayDevolver  → painel lateral
//   5. Projeto fechado    #apvExcecaoFechado   → dentro do MESMO painel da 4
//
// O HTML tem conteúdo de EXEMPLO dentro dos contêineres, pra tela poder ser
// revisada antes de existir backend. Todo bloco de exemplo está marcado com
// <!-- EXEMPLO --> e deve ser substituído pelo que estas funções desenharem.
//
// ----------------------------------------------------------------------------
// AÇÕES DE BACKEND
// ----------------------------------------------------------------------------
// Já existem, dá pra reaproveitar:
//   - `listarPecasDaPastaDoCard`  (Aprovacao.gs) — agrupa os arquivos da pasta
//     em peças distintas ("Feed - v1"/"Feed - v2" = mesma peça; "Stories" =
//     outra). Serve pra montar o seletor de versão e a lista do envio.
//   - `gerarLinkDeAprovacao`      (Aprovacao.gs) — aceita `fileId`.
//   - `beeConferirEntrega`        (Bee.gs)       — a conferência da Bee.
//   - `adicionarComentario`       (RunrunEscrita.gs)
//
// Falta criar (sugestão de nome e de responsabilidade):
//   - `listarAprovacoesPendentes()` → o que alimenta a fila.
//   - `aprovarInternamente(taskId, fileId, aprovadoPor)` → registra o carimbo.
//   - `devolverParaDesigner(taskId, motivo, pins)` → cria a subtarefa de
//     alteração e já aloca pro designer que fez a peça.
//
// TRÊS DECISÕES QUE AINDA NÃO FORAM TOMADAS — resolver antes de codar:
//
//   (a) O QUE PÕE UMA PEÇA NA FILA. É o ponto que faz a funcionalidade
//       existir ou não, e ninguém definiu. Provavelmente uma etapa nova no
//       quadro ("Aguardando atendimento") por onde o designer passa ao
//       concluir. Precisa ser combinado com o Cláudio, não escolhido aqui.
//
//   (b) A NUMERAÇÃO DA SUBTAREFA. O briefing pede "Alteração V1" fixo — isso
//       quebra na segunda devolução da mesma peça (viram duas "Alteração V1"
//       no mesmo card mãe). Contar quantas já existem e numerar V1, V2, V3.
//
//   (c) QUEM ENXERGA A PÁGINA. O item de menu está `hidden` no index.html de
//       propósito: hoje ninguém vê. Decidir se aparece pro atendimento, pro
//       coordenador, ou pros dois — e tirar o `hidden` junto com isso. Ver
//       PAPEL_LOGADO (js/login-boot.js).
//
// ----------------------------------------------------------------------------
// ORDEM DE CARREGAMENTO
// ----------------------------------------------------------------------------
// Carregado depois de js/modo-foco.js e antes de js/login-boot.js — usa função
// de quase todo mundo (chamarBackend, mostrarToast, avatarHTML, escaparHTML,
// mostrarPagina). Mesma regra de ouro do CLAUDE.md: um arquivo pode usar o que
// vem antes dele, nunca o que vem depois.
// ============================================================================

// ---------------------------------------------------------------------------
// Estado do módulo
// ---------------------------------------------------------------------------

// A fila carregada, como veio do backend. Formato esperado de cada item:
//   { taskId, cliente, nomePeca, designer, designerId, esperandoDesde,
//     versaoAtual, totalVersoes, fileId, mimeType, temVersaoNova }
let apvFila = [];

// A peça aberta na conferência agora. Nunca guardar referência de objeto de
// tarefa aqui — o quadro se recria sozinho em segundo plano e a referência
// fica velha em silêncio. Comparar sempre por id, com String() dos dois
// lados (é o bug recorrente descrito no CLAUDE.md).
let apvPecaAberta = null;

// Qual versão está NA TELA agora. Pode ser diferente da mais recente — é
// justamente esse descompasso que a confirmação de aprovação vigia.
let apvVersaoNaTela = null;

// O "Ver como o cliente vê" já foi aberto nesta peça? Os botões de envio só
// acendem depois. Ver apvAoVerPreview().
let apvPreviewVisto = false;

// Pontos marcados na imagem ao devolver: [{ x, y, texto }], x/y em
// PORCENTAGEM da imagem (0 a 100), nunca em pixel — é o mesmo formato que a
// página do cliente já usa (ver aprovar.html), então dá pra reaproveitar.
let apvPinsDevolucao = [];

// ---------------------------------------------------------------------------
// TELA 1 — Fila de aprovação
// ---------------------------------------------------------------------------

/**
 * Ponto de entrada da página, chamado por mostrarPagina("aprovacao")
 * (js/pagina-repasse.js). Busca a fila e manda desenhar.
 *
 * Enquanto busca, deixar a lista com um aviso de carregando em vez de vazia:
 * "nenhuma peça esperando" e "ainda não carregou" são coisas MUITO diferentes
 * pra quem está olhando, e mostrar uma pela outra faz a pessoa ir embora
 * achando que não tem trabalho. Ver o contrato de chamarBackend/caiuARede em
 * js/config.js — falha de rede devolve `{ok:false, semRede:true}`, e isso
 * nunca pode virar lista vazia na tela.
 */
function buildAprovacaoPage() {
  // TODO: buscar a fila e chamar apvRenderFila().
}

/**
 * Desenha a lista dentro de #apvFilaLista.
 *
 * Cada item mostra, por exigência do briefing: cliente, nome da peça, quem é
 * o designer (com foto — usar avatarHTML de js/pessoas-fotos.js), há quanto
 * tempo está esperando, e a versão.
 *
 * ORDENAÇÃO: o briefing pede tempo de espera, mas o que decide urgência de
 * verdade é o PRAZO DO CLIENTE — uma peça de 40 min com entrega hoje às 18h é
 * mais urgente que uma de 4 h com entrega na sexta. Sugestão registrada com o
 * Cláudio: ordenar por prazo e manter o tempo de espera visível no card.
 *
 * @param {Array} itens  a fila já carregada
 */
function apvRenderFila(itens) {
  // TODO: montar o HTML dos cards e ligar o clique de "Conferir" em
  // apvAbrirConferencia(taskId). Lista vazia usa <div class="apv-vazio">.
}

// ---------------------------------------------------------------------------
// TELAS 2 e 3 — Conferência e envio
// ---------------------------------------------------------------------------

/**
 * Abre o overlay de conferência de uma peça.
 *
 * A entrada é em DOIS PASSOS, igual ao pop-up de tarefa: primeiro a classe
 * `visible` (que só faz o elemento existir na tela), depois `open` no quadro
 * seguinte (que dispara a transição). Sem os dois passos o navegador pula a
 * animação, porque o elemento nasce e muda de estado no mesmo instante.
 * Ver openDetail() em js/detalhe-modal.js — mesmo padrão.
 *
 * @param {string|number} taskId
 */
function apvAbrirConferencia(taskId) {
  // TODO: buscar briefing + versões da peça, preencher as duas colunas,
  // zerar apvPreviewVisto e apvPinsDevolucao, e abrir o overlay.
}

/**
 * Fecha a conferência e volta pra fila. Caminho inverso da abertura: tira
 * `open`, espera a transição, tira `visible`.
 */
function apvFecharConferencia() {
  // TODO
}

/**
 * Preenche a coluna da ESQUERDA — o que foi pedido.
 *
 * Sai daqui a descrição da tarefa, o prazo, o formato e o card mãe. Prazo
 * estourado é o ÚNICO caso de vermelho nesta tela (classe .atencao no
 * .apv-spec-valor); todo o resto de aviso é amarelo, seguindo o app.
 */
function apvRenderBriefing(peca) {
  // TODO
}

/**
 * Preenche a coluna da DIREITA — o que foi feito: seletor de versão, aviso de
 * versão nova (se houver) e a peça no palco.
 */
function apvRenderPeca(peca) {
  // TODO
}

/**
 * Desenha o seletor ‹ v1 v2 ●v3 › dentro de #apvVersaoSwitch.
 *
 * Fica SEMPRE visível, nunca escondido atrás de menu: se a versão não aparece
 * na tela, mandar a versão errada é questão de tempo. O nome do arquivo ao
 * lado (#apvArquivo) tem que mudar junto — é a única informação da tela que
 * não mente sobre qual arquivo vai pro cliente.
 */
function apvRenderSeletorDeVersao(peca) {
  // TODO
}

/**
 * Troca a versão exibida.
 *
 * Micro-interação que importa: piscar o palco ao trocar (classe .trocou em
 * .apv-palco, reiniciando a animação com um reflow — `void el.offsetWidth`).
 * Duas versões da mesma peça são parecidas de propósito, e sem um sinal de
 * mudança a pessoa clica em "v2" e não registra que algo mudou.
 *
 * @param {number} versao
 */
function apvIrParaVersao(versao) {
  // TODO
}

/**
 * Coloca a peça no palco (#apvPalcoSlot).
 *
 * Cria <img> ou <video controls playsinline> conforme o mimeType. O CSS já
 * garante que cabe inteira e nunca é cortada (object-fit: contain) — o
 * importante aqui é NÃO definir width/height fixos no elemento, senão a regra
 * de contain perde o efeito.
 *
 * Buscar os bytes pelo backend, nunca apontar a <img> direto pro Drive: nem
 * todo arquivo tem "qualquer pessoa com o link" ligado. Ver
 * buscarImagemCheiaDrive (Drive.gs) e o comentário sobre isso no CLAUDE.md.
 */
function apvMostrarNoPalco(peca, versao) {
  // TODO
}

/**
 * O aviso "a Manuela subiu a v4 há 10 minutos" (#apvAvisoNova).
 *
 * INFORMA, NÃO BLOQUEIA — enquanto a pessoa confere, é só um aviso amarelo
 * com um botão pra ver a versão nova. O único momento em que isso vira
 * interrupção é na hora de aprovar (ver apvAprovar).
 */
function apvRenderAvisoVersaoNova(peca) {
  // TODO
}

/**
 * A Bee confere a peça contra o briefing.
 *
 * SÓ RODA NO CLIQUE, nunca sozinha ao abrir a tela: é uma chamada de IA, cara
 * e lenta, e a maior parte das conferências não precisa dela. Reaproveitar a
 * ação `beeConferirEntrega` (Bee.gs), que já faz exatamente isso.
 *
 * Enquanto roda, trocar o texto do botão e desabilitá-lo. O resultado vai em
 * #apvBeeResultado, com .ok pros itens que batem e .duvida pros que não —
 * e sempre terminando com a ressalva de que a Bee erra: ela é uma segunda
 * opinião, quem decide é o atendimento.
 */
function apvPedirConferenciaDaBee() {
  // TODO
}

/**
 * Aprovar internamente.
 *
 * ESTE É O PONTO MAIS IMPORTANTE DO ARQUIVO.
 *
 * Se a versão na tela NÃO é a mais recente (seja porque a pessoa voltou pra
 * uma antiga, seja porque chegou uma nova enquanto ela conferia), abrir a
 * confirmação #apvConfirmaFundo ANTES de aprovar. Repare que o botão
 * principal de lá é "Ver a mais nova", não "seguir": dá pra aprovar a antiga
 * de propósito (às vezes é mesmo o certo), só não pode ser o caminho fácil.
 *
 * É o ÚNICO ponto do fluxo que interrompe alguém, de propósito — é
 * exatamente o erro que estas telas existem pra evitar, e interromper só
 * aqui é o que faz a interrupção continuar significando alguma coisa. Não
 * adicionar confirmação em mais nada sem uma razão do mesmo peso.
 *
 * Aprovado: NÃO troca de tela. O #apvEstadoConferindo some, o
 * #apvEstadoEnvio aparece, e a coluna do briefing continua ali de lado. Quem
 * acabou de aprovar quer mandar agora, não navegar.
 */
function apvAprovar() {
  // TODO
}

/**
 * O que roda depois que a confirmação de versão foi resolvida (ou quando ela
 * nem precisou aparecer): registra a aprovação no backend e troca o estado da
 * coluna da direita.
 */
function apvConfirmarAprovacao() {
  // TODO
}

/**
 * Monta o estado de envio: selo de aprovado, quais peças vão no link, campo
 * de mensagem e os botões.
 *
 * O selo (#apvSeloTxt) mostra quem aprovou e a que horas — é o registro de
 * que existiu conferência, e é o que dá sentido ao portão todo.
 *
 * A lista de peças usa `listarPecasDaPastaDoCard`: quando a pasta tem Feed E
 * Stories, as duas podem ir no mesmo link, marcadas de forma independente.
 */
function apvRenderEnvio(peca) {
  // TODO
}

/**
 * "Ver como o cliente vê" — abre aprovar.html numa aba nova, com o link real.
 *
 * O botão é o maior da tela DE PROPÓSITO, e os botões de envio nascem
 * apagados (.apv-envio-travado) até ele ser usado uma vez. Botão grande
 * sozinho é sugestão, não proteção; a trava é o que de fato impede
 * "mandei sem olhar", e custa um clique.
 *
 * COMO TIRAR, se um dia incomodar: é só parar de pôr a classe
 * .apv-envio-travado em #apvEnvioBotoes. O botão continua grande, sem a
 * trava. Foi combinado assim com o Cláudio — vale reavaliar depois de umas
 * semanas de uso real.
 */
function apvAoVerPreview() {
  // TODO
}

/**
 * Dispara o envio pelo canal escolhido.
 *
 * @param {string} canal  "whatsapp" | "link" | "email"
 *
 * WhatsApp: usar wa.me SEM número na frente (`https://wa.me/?text=...`), pra
 * abrir o seletor de conversa do próprio celular — quem escolhe pra quem vai
 * é a pessoa, não o Colmeia. Mesmo caminho que aprovar.html já usa.
 */
function apvEnviarProCliente(canal) {
  // TODO
}

// ---------------------------------------------------------------------------
// TELAS 4 e 5 — Devolver pro designer / projeto fechado
// ---------------------------------------------------------------------------

/**
 * Abre o painel de devolução.
 *
 * DECISÃO DE DESENHO IMPORTANTE: se o projeto do mês já estiver fechado no
 * Runrun.it (não aceita tarefa nova), isso tem que ser detectado AO ABRIR o
 * painel — o backend já sabe o status quando carrega a tarefa. O pior desenho
 * possível seria a pessoa escrever três parágrafos e só então descobrir que
 * não dá.
 *
 * E o texto dela NÃO É PERDIDO nesse caso: vira o comentário no card mãe do
 * mesmo jeito. É isso que faz a exceção não parecer um beco sem saída — o
 * caminho muda, o trabalho da pessoa não.
 *
 * Fechado → mostra #apvExcecaoFechado e #apvBlocoLinkMae, esconde
 * #apvExplicaNormal, e o botão do rodapé vira "Comentar e passar pro <nome>".
 */
function apvAbrirDevolver() {
  // TODO
}

function apvFecharDevolver() {
  // TODO
}

/**
 * Confirma a devolução.
 *
 * O motivo é OBRIGATÓRIO — sem ele o designer não sabe o que refazer, e a
 * devolução vira uma ida e volta perdida. Duas coisas sobre como cobrar isso:
 *
 *   - o erro aparece NO CAMPO (#apvErroMotivo + classe .invalido no
 *     textarea), não num alerta que some sozinho;
 *   - e some assim que a pessoa começa a digitar, não só quando reenvia.
 *
 * Caso normal    → cria a subtarefa de alteração já alocada pro designer.
 *                  Ver a decisão (b) do cabeçalho sobre a numeração.
 * Projeto fechado → comenta no card mãe marcando o designer e passa o card
 *                  pra ele. Mesmo resultado prático, caminho diferente.
 */
function apvConfirmarDevolucao() {
  // TODO
}

/**
 * Marcar pontos na imagem (opcional) — mesma ideia da página do cliente.
 *
 * Guardar x/y em PORCENTAGEM da imagem, nunca em pixel: assim o ponto continua
 * no lugar certo em qualquer tamanho de tela, do celular ao monitor grande.
 * Ver renderPins() em aprovar.html, que já resolve isso — dá pra copiar a
 * lógica inteira de lá.
 */
function apvAlternarMarcacao() {
  // TODO
}

function apvRenderPinsDevolucao() {
  // TODO
}

// ---------------------------------------------------------------------------
// Ligações de evento
// ---------------------------------------------------------------------------

/**
 * Liga todos os cliques fixos desta área.
 *
 * Os elementos daqui são criados UMA vez no index.html e nunca recriados, ao
 * contrário dos cards do quadro — então dá pra ligar tudo na carga, sem
 * religar a cada desenho. Já os cards da fila e os botões de versão são
 * gerados por JS: esses precisam ser religados a cada render (ou usar
 * delegação no contêiner, que é mais seguro).
 *
 * Não esquecer:
 *   - Esc fecha a confirmação de versão ANTES do painel de devolução, e o
 *     painel antes da conferência — sempre o de cima primeiro, nunca os dois
 *     de uma vez;
 *   - clicar no fundo escuro do overlay fecha o painel (mas não quando o
 *     clique começou dentro dele).
 */
function apvLigarEventos() {
  // TODO
}

// TODO: chamar apvLigarEventos() quando a implementação começar.
