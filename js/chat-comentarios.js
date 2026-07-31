let detailIdx = null;
let childrenOpen = false;
let descMaeAberta = false;
// Aba "Tarefa original" aberta? (só existe em subtarefa de alteração — ver
// ehTarefaDeAlteracao em js/detalhe-modal.js)
let originalAberta = false;

// ===== Chat flutuante (comentários em pop-up separado, fora do card) =====
let chatThreadAtivo = "aqui"; // "aqui" (a tarefa aberta) ou "mae" (o card mãe dela)
let chatAlvoTaskId = null;    // id de quem recebe o próximo comentário enviado
const chatMaeCache = new Map(); // taskId (da subtarefa) -> {id, title, comments}

// Teto pros caches que vivem em Map na memória (esse e o cardMaeCache em
// js/detalhe-cardmae.js). Sem teto eles nunca eram limpos: numa aba aberta
// a semana inteira, toda subtarefa aberta entrava e ficava pra sempre.
// Map do JavaScript preserva a ordem de inserção, então as primeiras chaves
// são as mais antigas — são elas que saem.
const MAX_ITENS_CACHE_CARDMAE = 60;

function podarCacheMap(mapa, maximo) {
  if (mapa.size <= maximo) return;
  const excedente = mapa.size - maximo;
  let i = 0;
  for (const chave of mapa.keys()) {
    if (i++ >= excedente) break;
    mapa.delete(chave);
  }
}

// ===== Conversa que não pisca =====
//
// Dois problemas viviam juntos aqui:
//
// 1. Toda recarga fazia `thread.innerHTML = ...` mesmo quando NADA tinha
//    mudado. Como isso apaga e redesenha a lista inteira, a conversa
//    piscava e o scroll pulava — a cada 8 segundos, a cada comentário
//    enviado, a cada troca de aba do navegador.
// 2. Abrir um card já visto antes começava do zero ("Carregando
//    comentários...") e só mostrava a conversa quando o Runrun.it
//    respondesse.
//
// `pintarThread` resolve o primeiro: compara o desenho novo com o que já
// está na tela e só encosta no DOM se for diferente de verdade. O cache
// abaixo resolve o segundo: a última conversa conhecida de cada tarefa
// fica guardada no navegador e aparece na hora, enquanto a busca real
// acontece por baixo. Se a busca trouxer o mesmo, ninguém vê nada
// acontecer — que é exatamente o objetivo.
const CHAVE_CACHE_CHAT = "colmeia_chat_cache_v1";
const MAX_TAREFAS_CACHE_CHAT = 80;

function lerCacheChatLocal() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CACHE_CHAT) || "{}"); } catch (err) { return {}; }
}

function comentariosDoCacheLocal(chave) {
  const cache = lerCacheChatLocal();
  const item = cache[String(chave)];
  return item && Array.isArray(item.comments) ? item.comments : null;
}

function guardarComentariosNoCacheLocal(chave, comentarios) {
  if (!chave || !Array.isArray(comentarios)) return;
  try {
    const cache = lerCacheChatLocal();
    cache[String(chave)] = { comments: comentarios, quando: Date.now() };
    // Teto por quantidade: descarta as conversas guardadas há mais tempo.
    const chaves = Object.keys(cache);
    if (chaves.length > MAX_TAREFAS_CACHE_CHAT) {
      chaves
        .sort((a, b) => (cache[a].quando || 0) - (cache[b].quando || 0))
        .slice(0, chaves.length - MAX_TAREFAS_CACHE_CHAT)
        .forEach(k => delete cache[k]);
    }
    localStorage.setItem(CHAVE_CACHE_CHAT, JSON.stringify(cache));
  } catch (err) {
    // Armazenamento cheio ou bloqueado (aba anônima) — o chat funciona
    // igual, só sem o "abre instantâneo".
  }
}

/**
 * Desenha uma lista de mensagens na thread SEM piscar.
 *
 * - Se o desenho for igual ao que já está lá, não faz absolutamente nada.
 * - Se mudou, troca o conteúdo preservando a posição da rolagem — e só
 *   desce automaticamente pro fim se a pessoa já estava lendo o fim (ou
 *   se `rolarPraBaixo` for pedido, ex: acabou de enviar uma mensagem).
 *
 * Devolve true se realmente mudou alguma coisa na tela.
 */
/**
 * Esquece o que `pintarThread` acha que está desenhado na tela.
 *
 * É preciso sempre que outra parte do app escreve na thread por fora (a
 * Bee desenha a conversa dela ali mesmo). Sem isso, ao voltar da Bee pros
 * comentários o `pintarThread` compararia com o desenho ANTIGO, concluiria
 * que "nada mudou" e deixaria a conversa da Bee na tela.
 */
function esquecerPinturaDaThread() {
  const thread = document.getElementById("commentsThread");
  if (thread) thread._htmlPintado = null;
}

function pintarThread(thread, html, opcoes) {
  if (!thread) return false;
  const rolarPraBaixo = !!(opcoes && opcoes.rolarPraBaixo);
  if (thread._htmlPintado === html) {
    if (rolarPraBaixo) thread.scrollTop = thread.scrollHeight;
    return false;
  }
  const estavaNoFim = (thread.scrollHeight - thread.scrollTop - thread.clientHeight) < 60;
  const posicaoAntes = thread.scrollTop;
  thread.innerHTML = html;
  thread._htmlPintado = html;
  wireExcluirComentario();
  // Print colado na descrição/num comentário: busca a imagem de verdade
  // pelo backend (o navegador sozinho não consegue — ver
  // carregarImagensDaDescricao).
  carregarImagensDaDescricao(thread);
  if (rolarPraBaixo || estavaNoFim) thread.scrollTop = thread.scrollHeight;
  else thread.scrollTop = posicaoAntes;
  return true;
}

// ===== Nome da conversa ativa, no topo do chat =====
//
// O topo mostra a conversa em que você está ("Comentários", "Card mãe",
// "Linha do tempo", "Bee") com uma setinha do lado pra trocar ali mesmo.
// Antes ele mostrava o nome da tarefa e a troca de aba estava escondida
// dentro do menu de "...", que sumiu.
function nomeDaConversaAtiva() {
  if (chatThreadAtivo === "bee") return "Bee";
  if (chatThreadAtivo === "mae") return "Card mãe";
  if (chatThreadAtivo === "tudo") return "Linha do tempo";
  return "Comentários";
}

function atualizarTituloDoChat() {
  const titulo = document.getElementById("chatPanelTitle");
  if (titulo) titulo.textContent = nomeDaConversaAtiva();

  const porAba = { aqui: "chatTabAqui", mae: "chatTabMae", tudo: "chatTabTudo" };
  let quantasAbas = 0;
  ["chatTabAqui", "chatTabMae", "chatTabTudo"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("active", porAba[chatThreadAtivo] === id);
    if (!el.hidden) quantasAbas++;
  });

  // Tarefa sem card mãe e que não é alteração tem uma aba só — aí a
  // setinha não serviria pra nada e some, junto com o clique.
  const botao = document.getElementById("chatPanelMenuBtn");
  if (botao) botao.classList.toggle("sem-opcoes", quantasAbas < 2);
}

// Também por pessoa, pelo mesmo motivo do log de notificações (ver
// chaveLogNotificacoes, js/notificacoes-avisos.js): "eu já li essa
// conversa" é de quem está logado, não do computador. Sem o nome na
// chave, entrar no login de outra pessoa no mesmo navegador fazia ela
// herdar os "já lidos" de quem usou antes.
function chaveVistoChat(taskId) {
  return "colmeia_chat_visto_" + taskId + "_" + normalizarParaComparar(DESIGNER_LOGADO || "sem-login");
}
function marcarChatVisto(task) {
  if (!task.id || !task.comments || task.comments.length === 0) return;
  const maiorId = Math.max(...task.comments.map(c => c.id || 0));
  try { localStorage.setItem(chaveVistoChat(task.id), String(maiorId)); } catch (err) { /* sem problema */ }
}
function contarComentariosNaoLidos(task) {
  if (!task.id || !task.comments || task.comments.length === 0) return 0;
  let visto = 0;
  try { visto = Number(localStorage.getItem(chaveVistoChat(task.id))) || 0; } catch (err) { /* sem problema */ }
  return task.comments.filter(c => !nomesCorrespondem(c.autor, DESIGNER_LOGADO) && (c.id || 0) > visto).length;
}
function atualizarBadgeChat(task) {
  const badge = document.getElementById("chatFabBadge");
  if (!badge) return;
  const qtd = contarComentariosNaoLidos(task);
  badge.hidden = qtd === 0;
  badge.textContent = qtd > 9 ? "9+" : String(qtd);
}

/**
 * Abre o pop-up de chat pra tarefa aberta: divide a tela (o card
 * encolhe pra ~30%, o chat ocupa o resto), sempre começando na aba
 * "Comentários aqui".
 */
function abrirChatPanel(task) {
  const painel = document.getElementById("taskDetail");
  const chatPanel = document.getElementById("chatPanel");
  if (!painel || !chatPanel) return;
  painel.classList.add("chat-open");
  chatPanel.hidden = false;
  abrirThreadAqui(task);
  // A Bee lê a tarefa em segundo plano assim que o chat abre — assim a
  // linha "Bee resumiu o que foi pedido" aparece sozinha embaixo dos
  // comentários, e o chat dela já abre pronto. É aqui e não na abertura
  // do card de propósito: abrir o chat é o momento em que a pessoa está
  // indo ler a conversa, então o custo se justifica.
  precarregarBee(task);
}

function fecharChatPanel() {
  const painel = document.getElementById("taskDetail");
  const chatPanel = document.getElementById("chatPanel");
  if (painel) painel.classList.remove("chat-open");
  if (chatPanel) chatPanel.hidden = true;
}

function abrirThreadAqui(task) {
  chatThreadAtivo = "aqui";
  chatAlvoTaskId = task.id;
  marcarAbaBeeAtiva(false);
  atualizarCampoParaBee(false);
  atualizarTituloDoChat();
  // Nunca começa em branco: se a conversa dessa tarefa já foi vista antes
  // neste navegador, ela aparece na hora e a busca real corrige por baixo.
  if (task.comments === undefined) {
    const guardados = comentariosDoCacheLocal(task.id);
    if (guardados) task.comments = guardados;
  }
  const thread = document.getElementById("commentsThread");
  if (thread) {
    pintarThread(thread, renderComentariosHTML(task), { rolarPraBaixo: true });
    inserirLinhaDaBeeNaThread(task);
  }
  const avisos = document.getElementById("beeInlineAvisos");
  if (avisos) avisos.innerHTML = "";
  marcarChatVisto(task);
  atualizarBadgeChat(task);
}

/**
 * Troca o chat pra mostrar os comentários do card mãe (só existe o
 * botão se a tarefa tiver parentTaskId). Busca uma vez só e guarda em
 * cache — trocar de aba de volta e pra frente não busca de novo.
 */
async function abrirThreadDoCardMae(task) {
  chatThreadAtivo = "mae";
  chatAlvoTaskId = null;
  marcarAbaBeeAtiva(false);
  atualizarCampoParaBee(false);
  atualizarTituloDoChat();
  const thread = document.getElementById("commentsThread");
  const avisosMae = document.getElementById("beeInlineAvisos");
  if (avisosMae) avisosMae.innerHTML = "";

  let cache = chatMaeCache.get(task.id);
  // Já vi essa conversa antes neste navegador? Mostra ela na hora, e a
  // busca de verdade acontece logo abaixo sem apagar nada.
  if (!cache && thread) {
    const guardados = comentariosDoCacheLocal("mae-" + task.id);
    if (guardados) pintarThread(thread, renderComentariosHTML({ id: task.id, comments: guardados }), { rolarPraBaixo: true });
    else pintarThread(thread, `<p class="comments-empty">Carregando comentários do card mãe...</p>`);
  }
  if (!cache) {
    const resultado = await buscarCardMaeDoBackend(task.id);
    if (!resultado.ok || !resultado.temPai) {
      if (chatThreadAtivo === "mae" && tasks[detailIdx] && tasks[detailIdx].id === task.id && thread) {
        pintarThread(thread, `<p class="comments-empty">Essa tarefa não tem card mãe.</p>`);
      }
      return;
    }
    const comentarios = await buscarComentariosDoBackend(resultado.cardMae.id);
    if (comentarios === null) {
      // Não deu pra perguntar. Sai SEM guardar em cache — senão a lista
      // vazia ficaria grudada como se fosse a verdade até trocar de tarefa
      // (ver buscarComentariosDoBackend). E não apaga o que já está na
      // tela: se veio do cache do navegador, continua valendo mais do que
      // um aviso de erro.
      if (chatThreadAtivo === "mae" && tasks[detailIdx] && tasks[detailIdx].id === task.id && thread
          && !comentariosDoCacheLocal("mae-" + task.id)) {
        pintarThread(thread, `<p class="comments-empty">Não consegui carregar os comentários do card mãe agora.</p>`);
      }
      return;
    }
    cache = { id: resultado.cardMae.id, title: resultado.cardMae.title, comments: comentarios };
    chatMaeCache.set(task.id, cache);
    podarCacheMap(chatMaeCache, MAX_ITENS_CACHE_CARDMAE);
    guardarComentariosNoCacheLocal("mae-" + task.id, comentarios);
  }
  if (chatThreadAtivo !== "mae" || !tasks[detailIdx] || tasks[detailIdx].id !== task.id) return; // trocou de aba/tarefa enquanto carregava
  chatAlvoTaskId = cache.id;
  atualizarTituloDoChat();
  if (thread) pintarThread(thread, renderComentariosHTML({ id: cache.id, comments: cache.comments }));
}

/**
 * Linha do tempo única de uma subtarefa de ALTERAÇÃO: junta, em ordem de
 * hora, os comentários das três pontas que contam a história daquela peça
 * — a própria alteração, a tarefa original (a peça que foi feita) e o card
 * mãe (onde o atendimento normalmente escreve o pedido do cliente).
 *
 * É isso que responde "o que exatamente pediram nessa alteração": antes
 * essas conversas viviam em lugares separados (e a da tarefa original nem
 * era acessível pelo Colmeia), então o designer abria uma subtarefa
 * chamada só "Alteração 01" sem nenhum contexto do que mudar.
 *
 * Comentar por aqui vai pra própria alteração (é a tarefa aberta).
 */
async function abrirThreadLinhaDoTempo(task) {
  chatThreadAtivo = "tudo";
  chatAlvoTaskId = task.id;
  marcarAbaBeeAtiva(false);
  atualizarCampoParaBee(false);
  atualizarTituloDoChat();
  const thread = document.getElementById("commentsThread");
  const avisosTudo = document.getElementById("beeInlineAvisos");
  if (avisosTudo) avisosTudo.innerHTML = "";

  const taskId = task.id;
  // Mesma ideia das outras abas: a última linha do tempo montada fica
  // guardada no navegador e reaparece na hora, sem "Montando...".
  if (thread) {
    const guardados = comentariosDoCacheLocal("tudo-" + taskId);
    if (guardados) pintarThread(thread, renderComentariosHTML({ id: taskId, comments: guardados }), { rolarPraBaixo: true });
    else pintarThread(thread, `<p class="comments-empty">Montando a linha do tempo...</p>`);
  }
  const original = acharTarefaOriginalDaAlteracao(task);
  const infoMae = cardMaeCache.get(taskId);

  // As três buscas em paralelo (a da alteração e a do card mãe costumam
  // já estar em cache do pré-carregamento).
  const [comentariosAqui, comentariosOriginal, comentariosMae] = await Promise.all([
    task.comments !== undefined ? Promise.resolve(task.comments) : buscarComentariosDoBackend(taskId),
    original ? buscarComentariosDoBackend(original.id) : Promise.resolve([]),
    (infoMae && infoMae.ok && infoMae.temPai)
      ? (chatMaeCache.has(taskId)
          ? Promise.resolve(chatMaeCache.get(taskId).comments)
          : buscarComentariosDoBackend(infoMae.cardMae.id))
      : Promise.resolve([]),
  ]);

  // Trocou de aba ou de tarefa enquanto carregava? Compara por id.
  if (chatThreadAtivo !== "tudo" || !tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return;

  // Alguma das três pontas não respondeu? (`null`, ver
  // buscarComentariosDoBackend.) Aí a linha do tempo está incompleta e não
  // pode afirmar "não tem nada" — seria mentira.
  const algumaFalhou = comentariosAqui === null || comentariosOriginal === null || comentariosMae === null;

  const juntos = []
    .concat((comentariosAqui || []).map(c => Object.assign({}, c, { _origem: "Nesta alteração" })))
    .concat((comentariosOriginal || []).map(c => Object.assign({}, c, { _origem: "Tarefa original" })))
    .concat((comentariosMae || []).map(c => Object.assign({}, c, { _origem: "Card mãe" })))
    .sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0));

  // A descrição entra como a PRIMEIRA mensagem da linha do tempo, só pra
  // leitura — muitas vezes o pedido inteiro está lá, e sem isso a linha
  // do tempo conta a história pela metade. Ela continua sendo editada
  // onde sempre foi (a aba Descrição); aqui é só uma cópia pra ler.
  if (task.descricaoTexto) {
    juntos.unshift({
      id: "descricao",
      autor: "Descrição da tarefa",
      texto: task.descricaoTexto,
      data: task.createdAt || null,
      _origem: "Descrição",
      _somenteLeitura: true,
    });
  }

  atualizarTituloDoChat();
  // Só guarda quando a linha do tempo veio COMPLETA — uma montada com uma
  // das três pontas faltando seria uma versão capenga da conversa, e ela
  // ficaria guardada como se fosse a verdade.
  if (!algumaFalhou && juntos.length) guardarComentariosNoCacheLocal("tudo-" + taskId, juntos);

  if (thread) {
    let html;
    if (juntos.length) html = renderComentariosHTML({ id: taskId, comments: juntos });
    else if (algumaFalhou) html = `<p class="comments-empty">Não consegui carregar a linha do tempo agora.</p>`;
    else html = `<p class="comments-empty">Nenhum comentário em nenhuma das três pontas ainda.</p>`;
    pintarThread(thread, html);
    inserirLinhaDaBeeNaThread(task);
  }
}

/**
 * Recarrega a thread que está sendo mostrada agora no chat (a da
 * própria tarefa, a do card mãe ou a linha do tempo da alteração) —
 * usado depois de enviar, excluir ou reagir a um comentário.
 */
async function recarregarThreadAtiva() {
  const task = tasks[detailIdx];
  if (chatThreadAtivo === "tudo") {
    // Rebusca os comentários da própria alteração (é onde a pessoa acabou
    // de escrever) e remonta a linha do tempo inteira. Se a rebusca não
    // chegar (`null`), mantém o que já tinha — ver buscarComentariosDoBackend.
    const rebuscados = await buscarComentariosDoBackend(task.id);
    if (rebuscados !== null) task.comments = rebuscados;
    await abrirThreadLinhaDoTempo(task);
    return;
  }
  if (chatThreadAtivo === "aqui") {
    await carregarComentarios(task);
    return;
  }
  const cache = chatMaeCache.get(task.id);
  if (!cache) return;
  const comentariosMae = await buscarComentariosDoBackend(cache.id);
  if (comentariosMae === null) return; // não chegou: preserva o que está na tela
  cache.comments = comentariosMae;
  chatMaeCache.set(task.id, cache);
  guardarComentariosNoCacheLocal("mae-" + task.id, comentariosMae);
  if (chatThreadAtivo !== "mae" || !tasks[detailIdx] || tasks[detailIdx].id !== task.id) return;
  const thread = document.getElementById("commentsThread");
  if (thread) pintarThread(thread, renderComentariosHTML({ id: cache.id, comments: cache.comments }));
}

/**
 * Desenha a lista de comentários de uma tarefa. Enquanto ainda não
 * carregou (task.comments === undefined), mostra "Carregando...".
 * Tarefas sem id real (dados fake) nunca terão comentários reais.
 */
function formatarHoraComentario(dataISO) {
  if (!dataISO) return "";
  const d = new Date(dataISO);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Transforma links soltos (http://..., https://..., www...) dentro do
 * texto de um comentário em links de verdade, clicáveis. Se o texto já
 * vier com um <a> pronto (o Runrun.it às vezes já manda formatado),
 * não mexe em nada pra não linkificar duas vezes.
 *
 * IMPORTANTE: o texto passado aqui precisa já estar escapado (ver
 * prepararTextoComentario) — mas o teste de "já vem com <a> pronto"
 * só funciona em cima do texto CRU (antes de escapar), porque depois
 * de escapado o <a> vira "&lt;a" e o teste nunca bate. Por isso essa
 * checagem não fica mais aqui dentro, e sim em prepararTextoComentario.
 */
function linkifyTexto(texto) {
  if (!texto) return "";
  const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/gi;
  return texto.replace(urlRegex, url => {
    const limpo = url.replace(/[.,;:)\]]+$/, ""); // não pega pontuação colada no final
    const sobra = url.slice(limpo.length);
    const href = limpo.startsWith("http") ? limpo : "https://" + limpo;
    return `<a href="${href}" target="_blank" rel="noopener">${limpo}</a>${sobra}`;
  });
}

/**
 * Prepara um texto de comentário/notificação pra exibição: troca
 * menções por destaque e passa pela peneira (ver peneirarHTMLDeComentario),
 * que deixa só um punhado de marcações inofensivas (negrito, itálico,
 * link, lista) e escapa/joga fora o resto.
 *
 * Antes disso, um comentário só ganhava negrito/itálico de verdade
 * quando JÁ vinha com um link pronto do Runrun.it (a peneira só rodava
 * nesse caso) — sem link, tudo era escapado, e `<b>Ajuste:</b>` aparecia
 * cru na tela em vez de negrito. Agora todo comentário passa pelo MESMO
 * caminho seguro, com ou sem link — a peneira também cuida de linkificar
 * URL solta (ver linkificarTextoSolto lá dentro).
 */
function prepararTextoComentario(textoBruto) {
  if (!textoBruto) return "";
  const comMencoes = formatarMencoes(textoBruto);
  return aplicarMarcadoresDeMencao(peneirarHTMLDeComentario(comMencoes));
}

/**
 * Peneira o HTML de um comentário vindo do Runrun.it: reconstrói o texto
 * deixando passar SÓ um punhado de marcações de formatação conhecidas
 * (link, negrito, itálico, quebra de linha, parágrafo, lista) e jogando
 * fora qualquer outra coisa — script, imagem, evento de clique, estilo.
 *
 * Antes, um comentário que já vinha com <a> pronto era inserido na tela
 * exatamente como veio, "confiando" no que o Runrun.it mandou. Como só
 * gente do time escreve lá o risco era baixo, mas era uma porta aberta
 * pra HTML estranho quebrar (ou fazer coisa indevida com) a tela do chat.
 * Nos links, além de exigir http/https, força abrir em outra aba.
 */
// IMG entra na lista porque print colado (na descrição ou num comentário)
// é conteúdo de verdade do pedido — sem ele, a Linha do tempo mostrava a
// descrição sem as imagens, como se não existissem. O `src` só sobrevive
// se apontar pro Runrun.it (aí carregarImagensDaDescricao busca a imagem
// pelo backend) ou se já for uma imagem embutida; qualquer outro endereço
// é jogado fora igual antes.
const TAGS_PERMITIDAS_COMENTARIO = ["A", "B", "STRONG", "I", "EM", "U", "BR", "P", "UL", "OL", "LI", "SPAN", "DIV", "IMG"];

function peneirarHTMLDeComentario(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/gi;

  // Troca URL solta dentro de um nó de texto puro por um <a> de
  // verdade — no nível do DOM (não como string), pra nunca correr o
  // risco de "linkificar" o texto que já está dentro de um <a> gerado
  // aqui do lado (ver o teto abaixo).
  function linkificarTextoSolto(noTexto) {
    if (noTexto.parentElement && noTexto.parentElement.tagName === "A") return;
    const texto = noTexto.textContent;
    const casamentos = [...texto.matchAll(urlRegex)];
    if (!casamentos.length) return;
    const frag = doc.createDocumentFragment();
    let ultimo = 0;
    casamentos.forEach(m => {
      if (m.index > ultimo) frag.appendChild(doc.createTextNode(texto.slice(ultimo, m.index)));
      const limpo = m[0].replace(/[.,;:)\]]+$/, ""); // não pega pontuação colada no final
      const sobra = m[0].slice(limpo.length);
      const a = doc.createElement("a");
      a.setAttribute("href", limpo.startsWith("http") ? limpo : "https://" + limpo);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
      a.textContent = limpo;
      frag.appendChild(a);
      if (sobra) frag.appendChild(doc.createTextNode(sobra));
      ultimo = m.index + m[0].length;
    });
    if (ultimo < texto.length) frag.appendChild(doc.createTextNode(texto.slice(ultimo)));
    noTexto.replaceWith(frag);
  }

  function limpar(no) {
    Array.from(no.childNodes).forEach(filho => {
      if (filho.nodeType === Node.TEXT_NODE) { linkificarTextoSolto(filho); return; }
      if (filho.nodeType !== Node.ELEMENT_NODE) { filho.remove(); return; }

      if (TAGS_PERMITIDAS_COMENTARIO.indexOf(filho.tagName) === -1) {
        // Tag não permitida: some com ela, mas preserva o texto de dentro
        // (assim nenhuma palavra do comentário é perdida).
        const textoDentro = doc.createTextNode(filho.textContent || "");
        filho.replaceWith(textoDentro);
        return;
      }

      // Tira TODOS os atributos (é aí que moram os onclick, style, etc)...
      const href = filho.tagName === "A" ? filho.getAttribute("href") : null;
      const srcImagem = filho.tagName === "IMG" ? filho.getAttribute("src") : null;
      Array.from(filho.attributes).forEach(attr => filho.removeAttribute(attr.name));

      if (filho.tagName === "IMG") {
        // Endereço de internet (o print colado fica no armazenamento do
        // Runrun.it, que é outro domínio — por isso não dá pra exigir
        // runrun.it aqui) ou imagem já embutida. Qualquer outra coisa
        // vira nada.
        const aceito = srcImagem && (ehEnderecoDeImagemNaInternet(srcImagem) || srcImagem.startsWith("data:image/"));
        if (!aceito) { filho.remove(); return; }
        if (srcImagem.startsWith("data:image/")) {
          // Já vem embutida — mostra direto, não tem o que buscar.
          filho.setAttribute("src", srcImagem);
          filho.setAttribute("class", "desc-imagem");
        } else {
          prepararImagemProBackend(filho, srcImagem);
        }
        return;
      }
      // ...e devolve só o href, se for um link http/https de verdade.
      if (filho.tagName === "A") {
        if (href && /^https?:\/\//i.test(href)) {
          filho.setAttribute("href", href);
          filho.setAttribute("target", "_blank");
          filho.setAttribute("rel", "noopener");
        } else {
          const textoDentro = doc.createTextNode(filho.textContent || "");
          filho.replaceWith(textoDentro);
          return;
        }
      }
      limpar(filho);
    });
  }

  limpar(doc.body);
  return doc.body.innerHTML;
}

function renderComentariosHTML(task) {
  if (!task.id) {
    return `<p class="comments-empty">Essa tarefa ainda não está conectada ao Runrun.it.</p>`;
  }
  if (task.comments === undefined) {
    return `<p class="comments-empty">Carregando comentários...</p>`;
  }
  if (task.comments.length === 0) {
    return `<p class="comments-empty">Nenhum comentário ainda.</p>`;
  }
  return task.comments.map(c => {
    const minha = nomesCorrespondem(c.autor, DESIGNER_LOGADO);
    return `
    <div class="comment-bubble ${minha ? "mine" : ""}" data-comment-id="${c.id}">
      ${avatarHTML(minha ? DESIGNER_LOGADO : c.autor, "avatar-sm comment-avatar")}
      <div class="comment-body">
        <div class="comment-meta"><span class="comment-author">${minha ? "Você" : escaparHTML(c.autor)}</span><span class="comment-time">${formatarHoraComentario(c.data)}</span>${c._origem ? `<span class="comment-origem">${escaparHTML(c._origem)}</span>` : ""}</div>
        <div class="comment-text">${prepararTextoComentario(c.texto)}</div>
        ${(c.reactions || []).length ? `
          <div class="comment-reactions">
            ${c.reactions.map(r => `<span class="comment-reaction-chip" title="${(r.users || []).map(u => u.name).join(", ")}">${r.emoji} ${r.count}</span>`).join("")}
          </div>
        ` : ""}
      </div>
      <button type="button" class="comment-react-btn" data-comment-id="${c.id}" title="Reagir" aria-label="Reagir">🙂</button>
      <div class="comment-react-picker" data-comment-id="${c.id}" hidden></div>
      <div class="comment-bubble-acoes">
        ${minha ? `
          <button type="button" class="comment-edit-btn" data-comment-id="${c.id}" title="Editar comentário" aria-label="Editar comentário">
            <svg viewBox="0 0 24 24" fill="none"><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        ` : ""}
        <button type="button" class="comment-delete-btn" data-comment-id="${c.id}" title="Excluir comentário" aria-label="Excluir comentário">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
  `;
  }).join("");
}

/**
 * Busca os comentários reais no Runrun.it e atualiza só a lista na tela
 * (sem re-renderizar o pop-up inteiro, pra não perder o foco do campo
 * de texto nem fechar menus abertos).
 */
/**
 * O Runrun.it devolve a descrição em HTML (editor de texto rico), com
 * checklists no formato <ul data-checked="true/false"><li>...</li></ul>.
 * Essa função troca isso por ☑/☐ de verdade na frente de cada item, e
 * tira estilos/cores que vieram do editor de lá pra não conflitar com o
 * visual do Colmeia.
 */
function formatarDescricaoRunrun(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("ul[data-checked]").forEach(ul => {
    const marcado = ul.getAttribute("data-checked") === "true";
    ul.querySelectorAll("li").forEach(li => {
      li.textContent = (marcado ? "☑ " : "☐ ") + li.textContent;
      li.style.listStyle = "none";
    });
  });

  // Remove cor/estilo herdados do editor do Runrun.it (ex: texto azulado
  // de "Legenda:"), deixando só a formatação básica (negrito, parágrafos).
  doc.querySelectorAll("[style]").forEach(el => el.removeAttribute("style"));
  doc.querySelectorAll("[class]").forEach(el => el.removeAttribute("class"));

  // Cada print colado sai daqui SEM endereço, só com ele guardado de
  // lado. Quem vai buscar a imagem de verdade é carregarImagensDaDescricao
  // (ver lá embaixo) — se o endereço original ficasse no lugar, o
  // navegador ia tentar buscar sozinho, tomar "não autorizado" e desenhar
  // o ícone de quebrada antes da imagem certa chegar.
  doc.querySelectorAll("img[src]").forEach(img => prepararImagemProBackend(img, img.getAttribute("src")));

  return doc.body.innerHTML;
}

// ===== Imagens coladas na descrição =====
//
// Um print colado direto no editor do Runrun.it vira um <img> apontando
// pro servidor deles, que só entrega a imagem pra quem manda as chaves de
// acesso. O navegador do designer não tem essas chaves (e não pode ter),
// então ele pedia a imagem, tomava "não autorizado" e desenhava aquele
// ícone de imagem quebrada. O backend busca a imagem COM as chaves e
// devolve os bytes dela (ver baixarImagemDaDescricao, RunrunLeitura.gs);
// aqui a gente troca o endereço original pela imagem já embutida.
//
// Cada imagem é buscada UMA vez por sessão: a descrição é redesenhada
// várias vezes (abrir o card, recarregar, trocar de aba) e sem esse cache
// cada redesenho custaria um download novo de cada print.
const cacheImagensDescricao = new Map();
// Teto baixo de propósito: aqui cada item é a imagem INTEIRA guardada na
// memória (não um endereço), então 40 prints grandes numa aba aberta o dia
// todo pesariam de verdade no navegador.
const MAX_IMAGENS_DESCRICAO_CACHE = 20;

// Imagem transparente de 1 pixel, escrita aqui dentro mesmo (não é um
// arquivo, não vai buscar nada na internet). Serve de "vaga" enquanto a
// imagem de verdade não chega.
const PIXEL_TRANSPARENTE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function ehImagemProtegidaDoRunrun(src) {
  return !!src && /^https:\/\/([^\/:?#]*\.)?runrun\.it\//i.test(src);
}

// Qualquer endereço de internet serve pra ser tratado aqui. A primeira
// versão só cuidava de endereço do próprio runrun.it — e o print colado
// na descrição NÃO fica lá: o Runrun.it guarda o arquivo em outro
// servidor (armazenamento deles), então a imagem continuava passando
// direto e quebrando igual antes.
function ehEnderecoDeImagemNaInternet(src) {
  return !!src && /^https?:\/\//i.test(src);
}

/**
 * Deixa um <img> pronto pra ser carregado: tira o endereço original e
 * guarda ele de lado, pra decidir com calma como buscar a imagem.
 */
function prepararImagemProBackend(img, url) {
  if (!ehEnderecoDeImagemNaInternet(url)) return;
  img.setAttribute("data-url-original", url);
  img.setAttribute("src", PIXEL_TRANSPARENTE);
  img.setAttribute("class", "desc-imagem carregando");
}

/**
 * Tenta carregar a imagem direto no navegador, do jeito normal.
 * Devolve true se deu certo. Serve pra não gastar uma ida ao backend com
 * imagem que o navegador já consegue buscar sozinho (link público).
 */
function tentarCarregarImagemDireto(url) {
  return new Promise(resolve => {
    const teste = new Image();
    teste.onload = () => resolve(true);
    teste.onerror = () => resolve(false);
    teste.src = url;
  });
}

async function carregarImagensDaDescricao(container) {
  if (!container) return;
  const imagens = [...container.querySelectorAll("img[data-url-original]")];
  if (!imagens.length) return;

  await Promise.all(imagens.map(async img => {
    const url = img.dataset.urlOriginal;

    if (cacheImagensDescricao.has(url)) {
      const guardada = cacheImagensDescricao.get(url);
      img.classList.remove("carregando");
      if (guardada) img.src = guardada;
      else marcarImagemQuebrada(img, url);
      return;
    }

    // 1º) o caminho barato: o navegador consegue sozinho? Muita imagem
    // colada é link público e carrega normal — nesses casos não custa
    // nada e não passa pelo backend.
    if (await tentarCarregarImagemDireto(url)) {
      cacheImagensDescricao.set(url, url);
      podarCacheMap(cacheImagensDescricao, MAX_IMAGENS_DESCRICAO_CACHE);
      img.classList.remove("carregando");
      if (img.isConnected) img.src = url;
      return;
    }

    // 2º) não conseguiu: aí sim o backend busca por ele.
    const data = await chamarBackend({ acao: "baixarImagemDaDescricao", url });
    // Sem rede não é "a imagem não existe" — não grava nada no cache
    // (senão a falha grudava) e deixa pra próxima vez.
    if (caiuARede(data)) { img.classList.remove("carregando"); return; }
    img.classList.remove("carregando");

    if (data.ok && data.base64) {
      const embutida = `data:${data.mimeType};base64,${data.base64}`;
      cacheImagensDescricao.set(url, embutida);
      podarCacheMap(cacheImagensDescricao, MAX_IMAGENS_DESCRICAO_CACHE);
      // A imagem pode ter saído da tela enquanto baixava (redesenho, troca
      // de card) — nesse caso o cache já guardou pra próxima vez.
      if (img.isConnected) img.src = embutida;
    } else {
      cacheImagensDescricao.set(url, null);
      console.warn("[Colmeia] Não consegui carregar imagem da descrição:", data.error);
      marcarImagemQuebrada(img, url);
    }
  }));
}

// Em vez do ícone de imagem quebrada do navegador (que não explica nada),
// deixa um link pra abrir a imagem no Runrun.it, onde a sessão da própria
// pessoa dá conta de mostrar.
function marcarImagemQuebrada(img, url) {
  if (!img.isConnected) return;
  let onde = "";
  try { onde = new URL(url).hostname; } catch (err) { /* endereço estranho, segue sem */ }
  const aviso = document.createElement("a");
  aviso.className = "desc-imagem-falhou";
  aviso.href = url;
  aviso.target = "_blank";
  aviso.rel = "noopener";
  // Mostra ONDE a imagem está hospedada: se um dia parar de funcionar de
  // novo, é esse nome que diz o motivo sem precisar abrir o console.
  aviso.textContent = onde
    ? `🖼 Não consegui mostrar essa imagem (${onde}) — abrir no Runrun.it`
    : "🖼 Não consegui mostrar essa imagem — abrir no Runrun.it";
  img.replaceWith(aviso);
}

/**
 * Busca a descrição real no Runrun.it e atualiza só o texto na tela
 * (sem re-renderizar o pop-up inteiro).
 */
async function carregarDescricao(task) {
  if (!task.id) return;
  const taskId = task.id;
  const texto = await buscarDescricaoDoBackend(taskId);
  // Compara pelo ID, não pela referência do objeto: o array `tasks` pode
  // ter sido substituído por atualizarKanbanEmBackground() enquanto essa
  // busca estava em andamento (troca os objetos por outros novos, mesmo
  // sendo a mesma tarefa), o que fazia esse "if" falhar sempre na
  // primeira abertura e a descrição só aparecer ao reabrir o card.
  if (tasks[detailIdx] && tasks[detailIdx].id === taskId) {
    const el = document.getElementById("descTextReal");
    if (!el) return;
    // `null` = não deu pra perguntar (ver buscarDescricaoDoBackend). Diz
    // isso em vez de AFIRMAR que a tarefa não tem descrição — só quando o
    // backend responde de verdade "" é que a tarefa está mesmo sem texto.
    if (texto === null) el.innerHTML = "Não consegui carregar a descrição agora.";
    else {
      el.innerHTML = texto ? formatarDescricaoRunrun(texto) : "Sem descrição cadastrada nessa tarefa.";
      carregarImagensDaDescricao(el);
    }
  }
}

// Manda cada chamada com um número de vez — se enviar dois comentários
// em seguida rápido, duas buscas ficam "no ar" ao mesmo tempo, e nada
// garante que a de trás (comentário mais antigo) responda ANTES da da
// frente. Sem isso, a resposta mais lenta (um retrato de antes do
// segundo comentário existir) sobrescrevia a mais rápida por cima,
// fazendo o comentário recém-mandado sumir da tela até fechar e reabrir
// a tarefa — mesmo já tendo sido publicado de verdade no Runrun.it.
let _cargaComentariosSeq = 0;

async function carregarComentarios(task) {
  if (!task.id) return;
  const taskId = task.id;
  const minhaVez = ++_cargaComentariosSeq;
  const comentarios = await buscarComentariosDoBackend(taskId);
  // `null` = não deu pra perguntar (ver buscarComentariosDoBackend). NUNCA
  // sobrescreve o que já está carregado nesse caso: era isso que fazia a
  // conversa inteira sumir da tela numa piscada de internet.
  if (comentarios === null) return;
  // Chegou depois de uma busca mais nova já ter sido disparada? Descarta
  // — ver comentário acima do porquê.
  if (minhaVez !== _cargaComentariosSeq) return;
  task.comments = comentarios;
  guardarComentariosNoCacheLocal(taskId, comentarios);
  // Só atualiza a tela se o usuário ainda estiver vendo essa mesma tarefa
  // (compara por ID, não por referência — ver comentário em carregarDescricao).
  if (tasks[detailIdx] && tasks[detailIdx].id === taskId) {
    atualizarBadgeChat(task);
    const chatPanel = document.getElementById("chatPanel");
    const chatAberto = chatPanel && !chatPanel.hidden;
    if (chatAberto && chatThreadAtivo === "aqui") {
      marcarChatVisto(task);
      atualizarBadgeChat(task);
      const thread = document.getElementById("commentsThread");
      // pintarThread: se não chegou comentário novo, a tela nem é tocada
      // — é isso que acaba com o piscar a cada checagem.
      if (thread) pintarThread(thread, renderComentariosHTML(task));
    }
  }
}

/**
 * Busca os anexos de verdade da tarefa (antes disso mostrava "Anexo
 * 01, 02, 03, 04" fixos, sem vir do Runrun.it de verdade). Só faz a
 * chamada se a tarefa realmente tiver anexo (attachmentsCount > 0) —
 * economiza uma chamada à toa pra maioria das tarefas, que não tem.
 */
function formatarTamanhoArquivo(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Carrega TUDO que o pop-up da tarefa precisa num único pedido ao backend
 * (ação "abrirTarefa") e distribui o resultado pela tela.
 *
 * Antes, abrir um card disparava de 8 a 12 pedidos separados — é por isso
 * que ele aparecia em pedaços, com vários "Carregando..." ao mesmo tempo.
 * Agora é um pedido só; lá dentro o backend busca do Runrun.it em paralelo.
 *
 * Se essa ação não existir no backend (janela de alguns minutos entre a
 * publicação do site e a do backend, ou backend antigo), volta sozinho pro
 * jeito antigo — um pedido por assunto. Assim nada quebra durante a troca.
 */
async function carregarTudoDaTarefa(task) {
  if (!task.id) return;
  const taskId = task.id;
  // Avisa que a pasta do card já vem NESSA resposta, pra verificarPastaJaSalva
  // (chamada pelo renderDetail, que roda antes disso terminar) não sair
  // fazendo um pedido próprio em paralelo à toa.
  task._abrindoTudo = true;

  const data = await chamarBackend({ acao: "abrirTarefa", taskId });
  task._abrindoTudo = false;

  if (!data || !data.ok) {
    // Backend ainda não conhece "abrirTarefa" (ou deu erro): faz do jeito
    // antigo, cada coisa no seu pedido.
    if (data && data.error && String(data.error).indexOf("desconhecida") !== -1) {
      console.error("Backend antigo: usando o modo antigo de abrir o card (um pedido por assunto).");
    }
    carregarComentarios(task);
    carregarDescricao(task);
    carregarSequencia(task);
    carregarAnexos(task);
    carregarCronometroReal(task);
    const btnPastaFallback = document.getElementById("criarPastaDriveBtn");
    if (btnPastaFallback) verificarPastaJaSalva(task, btnPastaFallback);
    return;
  }

  // Trocou de tarefa enquanto carregava? Compara por id, nunca por
  // referência (bug recorrente do CLAUDE.md).
  const aindaNaMesma = () => tasks[detailIdx] && String(tasks[detailIdx].id) === String(taskId);

  // --- Cronômetro: nunca deixa o tempo voltar pra trás ---
  const fresco = mapearTarefaDoBackend(data.tarefa);
  task.timerSeconds = Math.max(task.timerSeconds || 0, fresco.timerSeconds);
  task.tempoMedioMinutos = fresco.tempoMedioMinutos;
  task.estimatePct = calcularEstimatePct(task.timerSeconds, task.tempoMedioMinutos);
  task.attachmentsCount = fresco.attachmentsCount;

  // --- Sequência de responsáveis ---
  task.sequencia = data.sequencia || [];
  task.workflowId = data.workflowId || null;

  // --- Comentários ---
  task.comments = data.comentarios || [];

  // --- Pasta do Drive (veio de leitura na planilha, sem tocar no Drive) ---
  if (data.pastaUrl !== undefined) task.pastaUrlSalva = data.pastaUrl;

  if (!aindaNaMesma()) return;

  // Agora desenha tudo de uma vez.
  const timerEl = document.getElementById("detailTimer");
  if (timerEl) timerEl.textContent = formatTime(task.timerSeconds);

  const descEl = document.getElementById("descTextReal");
  if (descEl) {
    descEl.innerHTML = data.descricao
      ? formatarDescricaoRunrun(data.descricao)
      : "Sem descrição cadastrada nessa tarefa.";
    carregarImagensDaDescricao(descEl);
  }
  // Guarda a descrição na própria tarefa: a Linha do tempo mostra ela
  // como a primeira mensagem (ver abrirThreadLinhaDoTempo), e é isso que
  // faz o "ver original" da Bee ter pra onde apontar quando o pedido veio
  // da descrição, e não de um comentário.
  task.descricaoTexto = data.descricao || "";

  const seqEl = document.getElementById("workflowSeqGroup");
  if (seqEl) {
    seqEl.innerHTML = renderSequenciaHTML(task);
    wireWorkflowArrows(task);
  }

  atualizarBadgeChat(task);
  const chatPanel = document.getElementById("chatPanel");
  if (chatPanel && !chatPanel.hidden && chatThreadAtivo === "aqui") {
    marcarChatVisto(task);
    atualizarBadgeChat(task);
    const thread = document.getElementById("commentsThread");
    if (thread) pintarThread(thread, renderComentariosHTML(task));
  }

  if (task.pastaUrlSalva) {
    const btnPasta = document.getElementById("criarPastaDriveBtn");
    if (btnPasta) {
      btnPasta.dataset.pastaUrl = task.pastaUrlSalva;
      const label = btnPasta.querySelector(".pasta-drive-btn-label");
      if (label) label.textContent = "Acessar pasta do card";
      mostrarPillCopiarLinkDaPasta(task.pastaUrlSalva);
    }
    atualizarLabelLinkManual(true);
  }

  // Anexos: vieram junto (no Runrun.it eles moram dentro dos comentários).
  // Numa subtarefa de alteração ainda falta buscar os da tarefa original,
  // então nesse caso deixa carregarAnexos cuidar de tudo.
  if (ehTarefaDeAlteracao(task)) carregarAnexos(task);
  else desenharAnexos(task, data.anexos || []);

  // "É card mãe?" também já veio na mesma resposta.
  if (data.temSubtarefas) carregarFilhosSeForCardMae(task);
}

async function buscarAnexosDeUmaTarefa(taskId) {
  const data = await chamarBackend({ acao: "buscarAnexos", taskId });
  return data.ok ? (data.anexos || []) : [];
}

async function carregarAnexos(task) {
  if (!task.id) return;
  // Numa subtarefa de ALTERAÇÃO, os arquivos que o designer precisa (a peça
  // que vai ser alterada) estão na tarefa ORIGINAL, não nela — então aqui
  // busca nas duas e junta, marcando de onde cada arquivo veio. Por isso a
  // checagem de attachmentsCount não pode mais barrar a busca de saída:
  // a alteração costuma ter zero anexos próprios e é justamente aí que
  // precisamos ir ver os da original.
  const ehAlteracao = ehTarefaDeAlteracao(task);
  if (!task.attachmentsCount && !ehAlteracao) return;

  let anexos = task.attachmentsCount ? await buscarAnexosDeUmaTarefa(task.id) : [];

  if (ehAlteracao) {
    // O card mãe (e a lista de irmãs) já vem pré-carregado quando a
    // subtarefa abre; se ainda não chegou, espera.
    if (!cardMaeCache.has(task.id)) await precarregarCardMaeEmBackground(task.id);
    const original = acharTarefaOriginalDaAlteracao(task);
    if (original) {
      const anexosOriginal = await buscarAnexosDeUmaTarefa(original.id);
      anexos = anexos.concat(anexosOriginal.map(a => Object.assign({}, a, { _daOriginal: true })));
    }
  }
  if (!tasks[detailIdx] || tasks[detailIdx].id !== task.id) return; // trocou de tarefa enquanto carregava
  desenharAnexos(task, anexos);
}

/**
 * Desenha a lista de anexos na tela. Separado da BUSCA porque agora os
 * anexos podem chegar de dois caminhos: junto com todo o resto, no pedido
 * único de abrir o card (carregarTudoDaTarefa — no Runrun.it os anexos
 * moram dentro dos comentários, então vêm de graça), ou numa busca própria
 * (subtarefa de alteração, que também precisa dos anexos da tarefa
 * original). Os dois caminhos desenham igual, por aqui.
 */
function desenharAnexos(task, anexos) {
  if (task && task.id) anexosJaBuscados.set(String(task.id), anexos || []);
  const listaEl = document.getElementById("attachList");
  if (!listaEl) return;
  const allBtn = document.getElementById("downloadAllBtn");
  if (!anexos || anexos.length === 0) {
    listaEl.innerHTML = `<p class="attach-empty">Nenhum anexo nessa tarefa.</p>`;
    if (allBtn) allBtn.hidden = true;
    return;
  }
  if (allBtn) allBtn.hidden = false;
  listaEl.innerHTML = anexos.map(a => {
    const grande = anexoEhGrandeDemais(a.tamanho);
    return `
    <button type="button" class="attach-item${grande ? " grande" : ""}" data-doc-id="${a.id}" data-nome="${escaparHTML(a.nome)}" data-grande="${grande ? "1" : ""}">
      <span>${escaparHTML(a.nome)}${a._daOriginal ? ` <span class="attach-origem">da tarefa original</span>` : ""}${a.tamanho ? ` <span class="attach-size">${formatarTamanhoArquivo(a.tamanho)}</span>` : ""}${grande ? ` <span class="attach-runrun">abre no Runrun.it</span>` : ""}</span>
      ${grande ? ICONE_ABRIR_FORA : ICONE_BAIXAR}
    </button>
  `;
  }).join("");
  listaEl.querySelectorAll(".attach-item").forEach(btn => {
    btn.addEventListener("click", () => {
      // Arquivo grande já é desviado pro Runrun.it AQUI, no clique de
      // verdade — assim a aba nova nunca é barrada pelo navegador (o que
      // acontecia quando ela só era aberta depois de esperar a resposta
      // do backend, e sobrava só uma mensagem de erro vermelha na tela).
      if (btn.dataset.grande) abrirAnexoNoRunrun(task.id, btn.dataset.nome);
      else baixarAnexo(btn.dataset.docId, btn.dataset.nome, btn, task.id);
    });
  });
  if (allBtn) allBtn.onclick = () => baixarTodosAnexos(anexos, allBtn, task.id);
}

/**
 * Guarda os anexos que já foram buscados de cada tarefa, só enquanto o
 * Colmeia está aberto.
 *
 * Existe por causa disto: a busca dos anexos acontece UMA vez, quando o
 * card abre — mas o pop-up inteiro é redesenhado (renderDetail) em várias
 * situações depois disso: dar play/pausa, trocar a etapa, mudar a data de
 * entrega, salvar alguém no painel de Pessoas, mexer no card mãe. Cada um
 * desses redesenhos apagava a lista e escrevia "Carregando anexos..." de
 * novo — e essa mensagem ficava pra sempre, porque ninguém mandava buscar
 * outra vez. Agora o redesenho reaproveita o que já tinha sido buscado
 * (ver redesenharAnexosGuardados, chamada no fim do renderDetail).
 */
const anexosJaBuscados = new Map();

function redesenharAnexosGuardados(task) {
  if (!task || !task.id) return;
  const guardados = anexosJaBuscados.get(String(task.id));
  // Sem nada guardado é porque a primeira busca ainda está a caminho
  // (o card acabou de abrir) — aí "Carregando anexos..." está certo, e
  // quem chegar depois desenha. Não pede de novo de propósito: pedir
  // aqui faria uma busca extra a cada abertura de card, justamente o
  // que o pedido único de abrir a tarefa veio evitar.
  if (guardados) desenharAnexos(task, guardados);
}

const ICONE_BAIXAR = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICONE_ABRIR_FORA = `<svg viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Tem que ser o MESMO número do LIMITE_BYTES em baixarDocumentoAnexo
// (RunrunLeitura.gs): acima disso o arquivo não cabe na resposta do
// Apps Script e o download por aqui não tem como funcionar. Saber o
// tamanho antes de clicar (o Runrun.it já manda junto com a lista de
// anexos) é o que permite desviar pro Runrun.it na hora, em vez de
// tentar, falhar e avisar depois.
const LIMITE_ANEXO_BYTES = 25 * 1024 * 1024;

function anexoEhGrandeDemais(tamanho) {
  return Number(tamanho) > LIMITE_ANEXO_BYTES;
}

/**
 * Manda a pessoa pro Runrun.it, onde o anexo pode ser baixado direto,
 * sem passar pelo Colmeia. Não é erro nenhum — é o caminho certo pra
 * arquivo grande —, então o aviso é o normal (cinza), não o vermelho.
 * Se o navegador bloquear a aba nova, mostra um botão pra abrir: clicar
 * nele é um clique de verdade, e esse nunca é bloqueado.
 */
function abrirAnexoNoRunrun(taskId, nome) {
  if (!taskId) {
    mostrarToast(`"${nome}" é grande demais pra baixar pelo Colmeia — abre a tarefa no Runrun.it pra pegar de lá.`, "erro");
    return false;
  }
  const url = "https://runrun.it/tasks/" + taskId;
  const recado = nome ? `"${nome}" é grande demais pro Colmeia` : "Anexo grande demais pro Colmeia";
  if (window.open(url, "_blank")) {
    mostrarToast(`${recado} — abri a tarefa no Runrun.it pra você baixar de lá.`);
    return true;
  }
  mostrarIlha({
    titulo: `${recado}`,
    subtitulo: "Dá pra baixar direto no Runrun.it.",
    acoes: [{ label: "Abrir no Runrun.it", principal: true, onClick: () => window.open(url, "_blank") }],
  });
  return false;
}

/**
 * Baixa todos os anexos da tarefa de uma vez (botão "Baixar todos").
 * Dispara um download por vez, com um pequeno intervalo entre eles —
 * downloads simultâneos demais no mesmo instante costumam ser
 * bloqueados pelo navegador (parece pop-up em massa).
 */
async function baixarTodosAnexos(anexos, allBtn, taskId) {
  const original = allBtn.textContent;
  allBtn.disabled = true;
  // Os grandes demais ficam de fora do laço: eles vão pro Runrun.it, e
  // abrir uma aba pra cada um seria um monte de janela na cara da pessoa.
  // No fim, se teve algum, abre a tarefa UMA vez só.
  const cabem = anexos.filter(a => !anexoEhGrandeDemais(a.tamanho));
  const grandes = anexos.length - cabem.length;
  for (let i = 0; i < cabem.length; i++) {
    allBtn.textContent = `Baixando ${i + 1}/${cabem.length}...`;
    const a = cabem[i];
    const fakeBtn = document.createElement("button"); // só pra reaproveitar o baixarAnexo sem mexer no botão de cada linha
    await baixarAnexo(a.id, a.nome, fakeBtn, taskId);
    if (i < cabem.length - 1) await new Promise(r => setTimeout(r, 400));
  }
  allBtn.disabled = false;
  allBtn.textContent = original;
  if (grandes > 0) {
    abrirAnexoNoRunrun(taskId, grandes === 1 ? "1 anexo" : grandes + " anexos");
  }
}

/**
 * Busca o tempo trabalhado de verdade no Runrun.it toda vez que o card
 * é aberto, em vez de confiar só no cronômetro local ou na atualização
 * automática de 60s (que só cobre tarefas EM ABERTO — uma tarefa já
 * entregue/fechada para de ser sincronizada e o número local podia
 * ficar congelado errado pra sempre). Nunca deixa o tempo voltar pra
 * trás, mesmo raciocínio do merge da atualização em segundo plano.
 */
async function carregarCronometroReal(task) {
  if (!task.id) return;
  const resultado = await buscarTarefaCompletaDoBackend(task.id);
  if (!resultado.ok) return;
  const fresco = mapearTarefaDoBackend(resultado.tarefa);
  task.timerSeconds = Math.max(task.timerSeconds, fresco.timerSeconds);
  task.tempoMedioMinutos = fresco.tempoMedioMinutos;
  task.estimatePct = calcularEstimatePct(task.timerSeconds, task.tempoMedioMinutos);
  if (tasks[detailIdx] && tasks[detailIdx].id === task.id) {
    const timerEl = document.getElementById("detailTimer");
    if (timerEl) timerEl.textContent = formatTime(task.timerSeconds);
  }
  // Essa mesma resposta já diz se a tarefa tem subtarefas — aproveita e
  // resolve aqui o "isso é um card mãe?", que antes custava uma SEGUNDA
  // chamada lendo exatamente a mesma tarefa no Runrun.it a cada abertura
  // de card. A lista de subtarefas (que custa uma leitura por subtarefa)
  // só é buscada quando realmente é card mãe.
  if (resultado.temSubtarefas) carregarFilhosSeForCardMae(task);
}

/**
 * Baixa o anexo de verdade: pede o arquivo em base64 pro backend (que
 * busca autenticado no Runrun.it) e monta o download no navegador.
 */
async function baixarAnexo(documentId, nome, btnEl, taskId) {
  const original = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = `<span>Baixando...</span>`;
  try {
    const data = await chamarBackend({ acao: "baixarAnexo", documentId });
    if (!data.ok) {
      // Rede de segurança: normalmente o desvio pro Runrun.it já
      // aconteceu no clique (o tamanho vem junto com a lista de anexos).
      // Isso aqui cobre o caso do Runrun.it não ter informado o tamanho —
      // aí só o backend descobre que o arquivo é grande, e mesmo assim a
      // pessoa é levada pro Runrun.it em vez de ver um erro.
      if (data.arquivoGrande) {
        abrirAnexoNoRunrun(taskId, nome);
        return;
      }
      throw new Error(data.error || "Falha ao baixar.");
    }

    const binario = atob(data.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const blob = new Blob([bytes], { type: data.mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = nome || "anexo";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Falha ao baixar anexo:", err);
    // Antes mostrava sempre a mesma mensagem genérica, escondendo o
    // motivo real que o backend devolveu (ex: arquivo grande demais,
    // Runrun.it recusou, documento não existe mais) — agora mostra o
    // motivo de verdade quando tem um.
    mostrarToast("Não consegui baixar esse anexo agora: " + (err.message || "erro desconhecido"), "erro");
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = original;
  }
}

const MESES_PT_JS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Confirma com o coordenador antes de criar de verdade a pasta da
 * tarefa no Drive, dentro de Clientes > cliente > Publicações > ano >
 * mês > nome da tarefa.
 */
/**
 * Abre o modal de confirmação de verdade (não é mais o alerta feio do
 * navegador) e devolve true/false conforme o que a pessoa escolher.
 */
function confirmarCriacaoDePasta(mensagemHtml) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirmPastaModalOverlay");
    document.getElementById("confirmPastaModalTexto").innerHTML = mensagemHtml;
    overlay.hidden = false;

    const btnConfirmar = document.getElementById("confirmPastaConfirmar");
    const btnCancelar = document.getElementById("confirmPastaCancelar");
    const btnFechar = document.getElementById("confirmPastaModalClose");

    function fechar(valor) {
      overlay.hidden = true;
      btnConfirmar.removeEventListener("click", onConfirmar);
      btnCancelar.removeEventListener("click", onCancelar);
      btnFechar.removeEventListener("click", onCancelar);
      resolve(valor);
    }
    function onConfirmar() { fechar(true); }
    function onCancelar() { fechar(false); }

    btnConfirmar.addEventListener("click", onConfirmar);
    btnCancelar.addEventListener("click", onCancelar);
    btnFechar.addEventListener("click", onCancelar);
  });
}

/**
 * Anima a troca do texto do botão (o texto antigo sobe e some, o novo
 * entra de baixo) — usado quando a pasta é criada com sucesso.
 */
function trocarTextoBotaoPasta(novoTexto) {
  const label = document.querySelector("#criarPastaDriveBtn .pasta-drive-btn-label");
  if (!label) return;
  label.classList.add("saindo");
  setTimeout(() => {
    label.textContent = novoTexto;
    label.classList.remove("saindo");
    label.classList.add("entrando");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => label.classList.remove("entrando"));
    });
  }, 260);
}

async function confirmarECriarPastaDoCard(task) {
  const btn = document.getElementById("criarPastaDriveBtn");

  // Se ainda está em andamento a checagem automática de "essa pasta já
  // existe?" (corrida entre o clique e essa checagem), espera ela
  // terminar antes de decidir se cria uma pasta nova ou só abre a que
  // já existe — é exatamente essa corrida que fazia o Colmeia às vezes
  // não reconhecer uma pasta já criada.
  if (task._pastaCheckPromise) {
    btn.disabled = true;
    trocarTextoBotaoPasta("Verificando...");
    await task._pastaCheckPromise;
    btn.disabled = false;
  }

  // Se a pasta já foi criada antes (guardado no objeto da tarefa, então
  // sobrevive a qualquer re-render do pop-up — não só no dataset do
  // botão, que é recriado do zero toda vez), o botão vira link de acesso.
  const urlJaSalva = btn.dataset.pastaUrl || task.pastaUrlSalva;
  if (urlJaSalva) {
    trocarTextoBotaoPasta("Acessar pasta do card");
    window.open(urlJaSalva, "_blank");
    return;
  }

  // Se o campo Projeto (do Runrun.it, não o título) tem o "mês do
  // projeto" entre colchetes (ex: [MAIO26]), o backend usa ELE pra
  // decidir a pasta (ver criarPastaDoCardNoDrive, Drive.gs) — esse
  // preview mostra o MESMO mês, senão a confirmação mentiria sobre onde
  // a pasta vai ser criada de verdade.
  const mesProjeto = extrairMesAnoDoProjeto(task.projeto);
  const agora = new Date();
  const ano = mesProjeto ? mesProjeto.ano : agora.getFullYear();
  const mes = MESES_PT_JS[mesProjeto ? mesProjeto.mesIndex : agora.getMonth()];
  const caminho = `${task.client} &gt; Publicações &gt; ${ano} &gt; ${mes} &gt; ${task.title}`;

  const confirmado = await confirmarCriacaoDePasta(`Deseja criar a pasta <strong>"${task.title}"</strong> em<br>${caminho}?`);
  if (!confirmado) return;

  btn.disabled = true;
  trocarTextoBotaoPasta("Criando pasta...");

  try {
    const data = await chamarBackend({ acao: "criarPastaDoCard", cliente: task.client, tituloCard: task.title, taskId: task.id, projeto: task.projeto });
    btn.disabled = false;

    if (!data.ok) {
      // O erro vai pro avisinho (que cabe a mensagem inteira, sem cortar em
      // 40 letras) e o botão VOLTA ao texto normal — antes ele ficava preso
      // exibindo o erro picado e a pessoa não descobria que podia tentar de
      // novo sem fechar e reabrir a tarefa.
      mostrarToast(data.error || "Não consegui criar a pasta do card agora.", "erro");
      trocarTextoBotaoPasta("Criar pasta do card");
      return;
    }
    btn.dataset.pastaUrl = data.url;
    task.pastaUrlSalva = data.url; // guarda no objeto da tarefa — reconhece na hora se reabrir de novo
    trocarTextoBotaoPasta("Acessar pasta do card");
    mostrarPillCopiarLinkDaPasta(data.url);
    atualizarLabelLinkManual(true);
  } catch (err) {
    console.error("Falha ao criar pasta do card no Drive:", err);
    btn.disabled = false;
    mostrarToast("Falha de conexão. Não consegui criar a pasta agora — tenta de novo em alguns segundos.", "erro");
    trocarTextoBotaoPasta("Criar pasta do card");
  }
}

/**
 * Ao abrir o pop-up da tarefa, checa (leitura rápida na planilha, sem
 * tocar no Drive) se a pasta do card já foi criada antes — assim o
 * botão já nasce como "Acessar pasta do card" em vez de pedir
 * confirmação de criação de novo toda vez que a tarefa é reaberta.
 *
 * O resultado fica guardado em task.pastaUrlSalva (não só no dataset
 * do botão, que é recriado do zero a cada renderDetail) — assim, se o
 * pop-up re-renderizar por qualquer motivo (dar play, mudar de coluna,
 * etc), o botão já nasce certo na hora, sem esperar o fetch de novo e
 * sem correr o risco de "esquecer" que a pasta já existe.
 */
function mostrarPillCopiarLinkDaPasta(url) {
  const pill = document.getElementById("pastaCopyLinkBtn");
  if (!pill) return;
  pill.dataset.url = url;
  pill.hidden = false;
}

async function verificarPastaJaSalva(task, btn) {
  if (!task.id) return;
  // A abertura do card já traz a pasta na mesma resposta (ver
  // carregarTudoDaTarefa) — não faz um pedido separado em paralelo com ela.
  if (task._abrindoTudo) return;

  if (task.pastaUrlSalva !== undefined) {
    if (task.pastaUrlSalva) {
      btn.dataset.pastaUrl = task.pastaUrlSalva;
      const label = btn.querySelector(".pasta-drive-btn-label");
      if (label) label.textContent = "Acessar pasta do card";
      mostrarPillCopiarLinkDaPasta(task.pastaUrlSalva);
    }
    return;
  }

  if (!task._pastaCheckPromise) {
    task._pastaCheckPromise = (async () => {
      try {
        // Subtarefa nova (ex: uma "Alteração 02" recém-criada) nunca
        // teve o botão "Criar pasta do card" clicado nela mesma — antes
        // de checar só o id dela, também busca o card mãe e as tarefas
        // irmãs (já carregados em segundo plano assim que a subtarefa
        // abriu, ver precarregarCardMaeEmBackground) e, se alguma já
        // tiver pasta registrada, o backend vincula essa mesma pasta
        // aqui também, silenciosamente — sem perguntar nada, sem correr
        // o risco de criar uma pasta duplicada (buscarOuHerdarPastaCard).
        let idsRelacionados = [];
        if (task.parentTaskId) {
          const cardMaeInfo = cardMaeCache.get(task.id) || await buscarCardMaeDoBackend(task.id);
          if (cardMaeInfo && cardMaeInfo.ok && cardMaeInfo.temPai && cardMaeInfo.cardMae) {
            idsRelacionados = [cardMaeInfo.cardMae.id, ...(cardMaeInfo.subtarefas || []).map(s => s.id)]
              .filter(id => String(id) !== String(task.id));
          }
        }
        const data = await chamarBackend(idsRelacionados.length
              ? { acao: "buscarOuHerdarPastaCard", taskId: task.id, idsRelacionados }
              : { acao: "buscarPastaCard", taskId: task.id });
        task.pastaUrlSalva = (data.ok && data.url) ? data.url : null;
      } catch (err) {
        console.error("Falha ao checar se a pasta do card já existe:", err);
        // Não guarda nada em caso de erro — deixa tentar de novo da
        // próxima vez que a tarefa for aberta, em vez de travar como
        // "sem pasta" pra sempre por causa de uma falha de rede.
      } finally {
        task._pastaCheckPromise = null;
      }
    })();
  }

  await task._pastaCheckPromise;
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return; // trocou de tarefa enquanto carregava
  if (task.pastaUrlSalva) {
    btn.dataset.pastaUrl = task.pastaUrlSalva;
    const label = btn.querySelector(".pasta-drive-btn-label");
    if (label) label.textContent = "Acessar pasta do card";
    mostrarPillCopiarLinkDaPasta(task.pastaUrlSalva);
  }
  atualizarLabelLinkManual(task.pastaUrlSalva);
}

// Texto do link minimalista muda conforme já tem pasta vinculada ou não
// — "Linkar pasta certa" (primeira vez) vira "Trocar pasta vinculada"
// depois de já ter uma, deixando claro que dá pra corrigir se a
// automática detectou/criou a pasta errada.
function atualizarLabelLinkManual(jaTemPasta) {
  const linkManualBtn = document.getElementById("pastaLinkManualBtn");
  if (linkManualBtn) linkManualBtn.textContent = jaTemPasta ? "Trocar pasta vinculada" : "Linkar pasta certa";
}

/**
 * Opção minimalista pra vincular manualmente a pasta certa do Drive —
 * útil quando a criação/detecção automática (criarPastaDoCardNoDrive)
 * erra o caminho (ex: pasta já existia com nome levemente diferente).
 * Troca o próprio botão por um campo de texto simples, sem modal.
 */
async function abrirLinkarPastaManual(task, criarPastaBtn) {
  const linkBtn = document.getElementById("pastaLinkManualBtn");
  if (!linkBtn || document.getElementById("pastaLinkManualForm")) return;

  linkBtn.insertAdjacentHTML("afterend", `
    <div class="pasta-link-manual-form" id="pastaLinkManualForm">
      <input type="text" class="pasta-link-manual-input" id="pastaLinkManualInput" placeholder="Cole o link da pasta do Drive">
      <button type="button" class="pasta-link-manual-salvar" id="pastaLinkManualSalvar">Salvar</button>
      <button type="button" class="pasta-link-manual-cancelar" id="pastaLinkManualCancelar" aria-label="Cancelar">
        <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>
  `);
  linkBtn.hidden = true;
  const form = document.getElementById("pastaLinkManualForm");
  const input = document.getElementById("pastaLinkManualInput");
  input.focus();

  function fechar() {
    form.remove();
    linkBtn.hidden = false;
  }
  document.getElementById("pastaLinkManualCancelar").addEventListener("click", fechar);

  async function salvar() {
    const url = input.value.trim();
    if (!url) { fechar(); return; }
    input.disabled = true;
    document.getElementById("pastaLinkManualSalvar").disabled = true;
    const resultado = await linkarPastaManualNoBackend(task.id, url);
    if (resultado.ok) {
      const urlFinal = resultado.url || url;
      task.pastaUrlSalva = urlFinal;
      if (criarPastaBtn) {
        criarPastaBtn.dataset.pastaUrl = urlFinal;
        const label = criarPastaBtn.querySelector(".pasta-drive-btn-label");
        if (label) label.textContent = "Acessar pasta do card";
      }
      mostrarPillCopiarLinkDaPasta(urlFinal);
      atualizarLabelLinkManual(true);
      mostrarToast("Pasta vinculada.");
      fechar();
    } else {
      input.disabled = false;
      document.getElementById("pastaLinkManualSalvar").disabled = false;
      mostrarToast(resultado.error || "Não consegui vincular essa pasta agora.", "erro");
    }
  }
  document.getElementById("pastaLinkManualSalvar").addEventListener("click", salvar);
  input.addEventListener("keydown", e => { if (e.key === "Enter") salvar(); });
}

async function linkarPastaManualNoBackend(taskId, url) {
  if (!taskId || !url) return { ok: false, error: "Faltou o link da pasta." };
  return await chamarBackend({ acao: "linkarPastaManual", taskId, url });
}

/**
 * Deixa a "Entrega desejada" editável: clicar no lápis abre o
 * calendário próprio do Colmeia (abrirCalendarioColmeia, js/config.js)
 * grudado no botão; ao escolher uma data nova, salva de verdade no
 * Runrun.it e atualiza a tela (card + pop-up) sem precisar recarregar
 * tudo.
 */
function wireEdicaoEntregaDesejada(task) {
  const btn = document.getElementById("dueDateEditBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    abrirCalendarioColmeia({
      ancoraEl: btn,
      valorInicial: task.dueISO || "",
      onEscolher: async novaData => {
        if (!novaData || novaData === task.dueISO) return;
        const row = document.getElementById("dueDateRow");
        if (row) row.innerHTML = `<span class="side-date-saving">Salvando...</span>`;
        // Passa pela fila de ações: "a entrega é nesse dia" continua certo
        // mesmo se chegar atrasado, então sem internet fica guardado e vai
        // sozinho quando voltar (ver js/fila-offline.js). Antes essa era a
        // única troca de data que NÃO usava a fila, por engano.
        const data = await enviarEscritaNoBackend(
          { acao: "alterarEntrega", taskId: task.id, novaData },
          "mudar a entrega desejada"
        );
        if (!data.ok) {
          const rowAgora = document.getElementById("dueDateRow");
          if (rowAgora) rowAgora.innerHTML = `<span class="side-date-saving">${data.error ? String(data.error).slice(0, 40) : "Não consegui salvar"}</span>`;
          setTimeout(() => renderDetail(), 1800);
          return;
        }
        // Mantém sempre o mesmo padrão visual de antes (ex: "27 jul"),
        // nunca a data crua (AAAA-MM-DD) — isso é que ficava feio.
        const [ano, mes, dia] = novaData.split("-").map(Number);
        task.dueISO = novaData;
        task.due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
        renderDetail();
        render(); // atualiza a data no card do quadro também
        agendarAtualizacaoKanban();
      },
    });
  });
}

function wireExcluirComentario() {
  document.querySelectorAll(".comment-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esse comentário?")) return;
      const bolha = btn.closest(".comment-bubble");
      if (bolha) bolha.style.opacity = "0.4";
      const ok = await excluirComentarioNoBackend(btn.dataset.commentId);
      if (ok) recarregarThreadAtiva();
      else if (bolha) bolha.style.opacity = "1";
    });
  });

  document.querySelectorAll(".comment-edit-btn").forEach(btn => {
    btn.addEventListener("click", () => iniciarEdicaoComentario(btn.dataset.commentId));
  });

  const EMOJIS_REACAO = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  document.querySelectorAll(".comment-react-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const picker = document.querySelector(`.comment-react-picker[data-comment-id="${CSS.escape(btn.dataset.commentId)}"]`);
      document.querySelectorAll(".comment-react-picker").forEach(p => { if (p !== picker) p.hidden = true; });
      if (!picker) return;
      if (picker.innerHTML === "") {
        picker.innerHTML = EMOJIS_REACAO.map(em => `<button type="button" class="emoji-opt">${em}</button>`).join("");
        picker.querySelectorAll(".emoji-opt").forEach(emojiBtn => {
          emojiBtn.addEventListener("click", async () => {
            picker.hidden = true;
            const ok = await reagirComentarioNoBackend(btn.dataset.commentId, emojiBtn.textContent);
            if (ok) recarregarThreadAtiva();
          });
        });
      }
      picker.hidden = !picker.hidden;
    });
  });
}

/**
 * Edita um comentário nosso — igual o Runrun.it tem. Troca o balão pra
 * um campo editável na hora (sem sair da conversa), com Salvar/Cancelar.
 * Só existe pra comentário nosso (o botão nem aparece nos dos outros).
 */
function iniciarEdicaoComentario(commentId) {
  const bolha = document.querySelector(`.comment-bubble[data-comment-id="${CSS.escape(commentId)}"]`);
  const task = tasks[detailIdx];
  const comentario = task && (task.comments || []).find(c => String(c.id) === String(commentId));
  const textEl = bolha && bolha.querySelector(".comment-text");
  if (!textEl || !comentario) return;

  const original = textEl.innerHTML;
  const cancelar = () => { textEl.innerHTML = original; };

  textEl.innerHTML = `
    <div class="comment-edit-form">
      <input type="text" class="comment-edit-input" value="${escaparHTML(comentario.texto)}">
      <div class="comment-edit-acoes">
        <button type="button" class="comment-edit-cancelar">Cancelar</button>
        <button type="button" class="comment-edit-salvar">Salvar</button>
      </div>
    </div>
  `;
  const input = textEl.querySelector(".comment-edit-input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const salvar = async () => {
    const novoTexto = input.value.trim();
    if (!novoTexto || novoTexto === comentario.texto) { cancelar(); return; }
    textEl.innerHTML = `<p class="bee-vazio" style="padding:0;text-align:left;">Salvando...</p>`;
    const ok = await editarComentarioNoBackend(commentId, novoTexto);
    if (ok) {
      comentario.texto = novoTexto;
      recarregarThreadAtiva();
    } else {
      textEl.innerHTML = original;
      mostrarToast("Não consegui salvar a edição agora. Tenta de novo.", "erro");
    }
  };

  textEl.querySelector(".comment-edit-cancelar").addEventListener("click", cancelar);
  textEl.querySelector(".comment-edit-salvar").addEventListener("click", salvar);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); salvar(); }
    if (e.key === "Escape") cancelar();
  });
}


