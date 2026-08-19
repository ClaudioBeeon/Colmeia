let detailIdx = null;
let childrenOpen = false;
let descMaeAberta = false;
// Aba "Tarefa original" aberta? (só existe em subtarefa de alteração — ver
// ehTarefaDeAlteracao em js/detalhe-modal.js)
let originalAberta = false;
// Aba "Anexos" aberta? (pedido do Cláudio, 2026-08-04 — antes vivia
// espremida na coluna da direita, agora é uma aba própria)
let anexosAberta = false;

// ===== Chat flutuante (comentários em pop-up separado, fora do card) =====
// "aqui" (a tarefa aberta), "mae" (o card mãe dela), "todos" (Todos os
// comentários — aqui+mãe+original+Bee misturados por hora) ou "linha"
// (Linha do tempo — o mesmo de "todos" + eventos do sistema: criada,
// começou a trabalhar, arquivo, entregue). "bee" é a conversa dela,
// que mora no mesmo campo mas NUNCA entra nesse merge de "todos"/"linha"
// sem o interruptor ligado (ver chatMostrarBeeNoUnificado abaixo).
let chatThreadAtivo = "aqui";
let chatAlvoTaskId = null;    // id de quem recebe o próximo comentário enviado
// (2026-08-13) O antigo `chatMaeCache` — comentários do card mãe indexados
// pela SUBTAREFA — deixou de existir: era uma segunda cópia do mesmo dado,
// e era ela que discordava da lista unificada. Os comentários do card mãe
// agora vivem na fonte única, sob o id DELE, como os de qualquer tarefa.

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

// ===== A FONTE ÚNICA dos comentários (2026-08-13) =====
//
// ⚠️ REGRA: guarda-se INGREDIENTE, nunca MISTURA.
//
// Antes, "Todos os comentários" e "Linha do tempo" eram guardados já
// prontos, em chaves próprias ("todos-<id>-bee", "linha-<id>-bee"). Como a
// mistura era guardada SEPARADA dos ingredientes, as duas desandavam: o
// card mãe sumia da lista unificada, a descrição caía fora depois de
// qualquer ação, e não havia um lugar só pra corrigir. Era dado derivado
// em cache — o erro clássico.
//
// Agora existe UM lugar com os comentários de cada tarefa (a própria, a
// original, o card mãe), e as duas listas unificadas são CALCULADAS na
// hora, toda vez. Custa uma ordenação de 3 listas pequenas — menos de um
// milissegundo — e em troca é impossível a mistura discordar da fonte.
const fontesDeComentarios = new Map(); // String(taskId) -> comentarios[]

/** Os comentários que já conhecemos dessa tarefa (memória → navegador → null). */
function comentariosDaFonte(taskId) {
  if (!taskId) return null;
  const chave = String(taskId);
  if (fontesDeComentarios.has(chave)) return fontesDeComentarios.get(chave);
  const doNavegador = comentariosDoCacheLocal(chave);
  if (doNavegador) {
    fontesDeComentarios.set(chave, doNavegador);
    return doNavegador;
  }
  return null;
}

/**
 * Registra os comentários de uma tarefa — o ÚNICO caminho de escrita.
 * Guarda na memória e no navegador, e mantém `task.comments` em dia
 * quando a tarefa está carregada (ele continua sendo lido em vários
 * lugares; aqui é só pra os dois nunca discordarem).
 */
function guardarFonteDeComentarios(taskId, comentarios) {
  if (!taskId || !Array.isArray(comentarios)) return;
  fontesDeComentarios.set(String(taskId), comentarios);
  guardarComentariosNoCacheLocal(taskId, comentarios);
  const t = typeof tasks !== "undefined" && Array.isArray(tasks)
    ? tasks.find(x => String(x.id) === String(taskId))
    : null;
  if (t) t.comments = comentarios;
  podarCacheMap(fontesDeComentarios, MAX_TAREFAS_CACHE_CHAT);
}

/**
 * Acrescenta UM comentário à fonte de uma tarefa, sem buscar nada.
 *
 * É o coração do item A: quando você envia um comentário, o Runrun.it já
 * devolve o comentário criado (id e horário de verdade) — então não existe
 * motivo pra perguntar de novo o que acabamos de escrever. Se já houver um
 * comentário com o mesmo id, atualiza no lugar em vez de duplicar (é o que
 * torna seguro chamar isso mais de uma vez).
 */
/**
 * Acha um comentário em qualquer fonte já carregada (a da tarefa, a do
 * card mãe) — reagir/editar/excluir só têm o id do comentário na mão, não
 * sabem de qual das listas ele veio. Devolve o objeto DE DENTRO da fonte,
 * de propósito: é ele que precisa ser alterado pra a mudança otimista
 * sobreviver ao próximo redesenho (que recalcula tudo a partir das fontes
 * — ver o comentário grande sobre fonte única lá em cima).
 */
function acharComentarioNasFontes(commentId) {
  if (!commentId) return null;
  const alvo = String(commentId);
  for (const lista of fontesDeComentarios.values()) {
    const achado = (lista || []).find(c => String(c.id) === alvo);
    if (achado) return achado;
  }
  return null;
}

/** Tira um comentário de todas as fontes (usado pelo excluir otimista).
 *  Devolve { taskId, indice, comentario } pra dar pra recolocar no lugar
 *  exato se o Runrun.it recusar. */
function tirarComentarioDasFontes(commentId) {
  const alvo = String(commentId);
  for (const [taskId, lista] of fontesDeComentarios.entries()) {
    const i = (lista || []).findIndex(c => String(c.id) === alvo);
    if (i === -1) continue;
    const comentario = lista[i];
    const novos = lista.slice();
    novos.splice(i, 1);
    guardarFonteDeComentarios(taskId, novos);
    return { taskId, indice: i, comentario };
  }
  return null;
}

/** Recoloca um comentário no lugar de onde ele saiu (desfaz o excluir). */
function devolverComentarioAFonte(guardado) {
  if (!guardado) return;
  const atuais = comentariosDaFonte(guardado.taskId) || [];
  const novos = atuais.slice();
  novos.splice(Math.min(guardado.indice, novos.length), 0, guardado.comentario);
  guardarFonteDeComentarios(guardado.taskId, novos);
}

/**
 * Aplica a reação na hora, do jeito que o Runrun.it vai aplicar: o mesmo
 * emoji clicado duas vezes tira a reação (é como ele funciona), então a
 * versão otimista também tem que alternar — senão clicar pra tirar
 * mostraria o número SUBINDO até a resposta chegar e corrigir.
 */
function aplicarReacaoOtimista(comentario, emoji) {
  const eu = (typeof DESIGNER_LOGADO !== "undefined" && DESIGNER_LOGADO) || "Você";
  const mesmaPessoa = (a, b) => (typeof nomesCorrespondem === "function" ? nomesCorrespondem(a, b) : String(a) === String(b));
  const lista = (comentario.reactions || []).map(r => ({ ...r, users: (r.users || []).slice() }));
  const i = lista.findIndex(r => r.emoji === emoji);
  if (i === -1) {
    lista.push({ emoji, count: 1, users: [{ name: eu }] });
    comentario.reactions = lista;
    return;
  }
  const chip = lista[i];
  if (chip.users.some(u => mesmaPessoa(u.name, eu))) {
    chip.users = chip.users.filter(u => !mesmaPessoa(u.name, eu));
    chip.count = Math.max(0, (chip.count || 1) - 1);
    if (chip.count === 0) lista.splice(i, 1);
  } else {
    chip.users.push({ name: eu });
    chip.count = (chip.count || 0) + 1;
  }
  comentario.reactions = lista;
}

function acrescentarComentarioNaFonte(taskId, comentario) {
  if (!taskId || !comentario || !comentario.id) return;
  const atuais = comentariosDaFonte(taskId) || [];
  const i = atuais.findIndex(c => String(c.id) === String(comentario.id));
  const novos = atuais.slice();
  if (i === -1) novos.push(comentario);
  else novos[i] = comentario;
  novos.sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0));
  guardarFonteDeComentarios(taskId, novos);
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

  const novos = casarComentariosNaThread(thread, html);

  thread._htmlPintado = html;
  wireExcluirComentario();
  // Print colado na descrição/num comentário: busca a imagem de verdade
  // pelo backend (o navegador sozinho não consegue — ver
  // carregarImagensDaDescricao). Só nos elementos NOVOS: antes isso rodava
  // na thread inteira a cada repintura, remandando ao servidor as mesmas
  // imagens que já estavam na tela.
  novos.forEach(el => carregarImagensDaDescricao(el));
  if (rolarPraBaixo || estavaNoFim) thread.scrollTop = thread.scrollHeight;
  else thread.scrollTop = posicaoAntes;
  return true;
}

/**
 * Transforma o que está na thread no desenho novo mexendo SÓ no que mudou
 * (2026-08-13, item B da auditoria dos comentários).
 *
 * Por que não `innerHTML = html` direto: trocar o HTML inteiro joga fora
 * todo o estado interno dos elementos que continuavam iguais — posição da
 * rolagem, animação em andamento, texto selecionado — e, no Colmeia,
 * ainda fazia `carregarImagensDaDescricao` rebaixar TODAS as imagens
 * coladas nos comentários a cada atualização. Como quase toda atualização
 * aqui é "chegou mais um comentário no fim", redesenhar os outros trinta
 * era desperdício puro.
 *
 * A identidade de cada bolha é o `data-comment-id` que o
 * renderComentariosHTML já escrevia — não precisou inventar chave nova.
 * Quem não tem id (as mensagens de "Carregando...", "Nenhum comentário
 * ainda") cai no caminho antigo, que pra elas é o certo mesmo.
 *
 * Devolve os elementos que ENTRARAM agora (pra só neles buscar imagem).
 */
function casarComentariosNaThread(thread, html) {
  const molde = document.createElement("div");
  molde.innerHTML = html;

  const novasBolhas = Array.from(molde.children);
  const todasTemId = novasBolhas.length > 0 && novasBolhas.every(el => el.dataset && el.dataset.commentId);
  const atuais = Array.from(thread.children);
  const atuaisTemId = atuais.every(el => el.dataset && el.dataset.commentId);

  // Lista virando aviso (ou o contrário): troca tudo, é mais simples e
  // acontece raramente. Thread vazia segue pelo caminho de baixo — ali
  // "tudo é novo", que é exatamente o que ele já faz.
  if (!todasTemId || !atuaisTemId) {
    thread.innerHTML = html;
    return [thread];
  }

  const sobrando = new Map();
  atuais.forEach(el => sobrando.set(el.dataset.commentId, el));

  // Decide, pra cada posição, QUAL elemento fica: o que já estava (quando
  // idêntico) ou o recém-desenhado.
  const entraram = [];
  const finais = novasBolhas.map(nova => {
    const id = nova.dataset.commentId;
    const existente = sobrando.get(id);
    sobrando.delete(id);
    if (!existente) { entraram.push(nova); return nova; }
    // Mudou de verdade (editaram o texto, entrou uma reação)? Troca só
    // essa bolha. Igual = o elemento antigo continua na tela, intocado.
    if (existente.outerHTML !== nova.outerHTML) {
      existente.replaceWith(nova);
      entraram.push(nova);
      return nova;
    }
    return existente;
  });

  // Põe na ordem certa. `insertBefore` num nó que já está no lugar certo
  // seria mexer à toa — por isso a checagem de posição, feita quando o
  // elemento JÁ está na thread (era esse o bug da primeira versão: eu
  // olhava a vizinhança do nó enquanto ele ainda estava no molde).
  let referencia = null;
  for (let i = finais.length - 1; i >= 0; i--) {
    const el = finais[i];
    if (el.parentNode !== thread || el.nextSibling !== referencia) {
      thread.insertBefore(el, referencia);
    }
    referencia = el;
  }

  // Sobrou na tela quem não existe mais no desenho novo (comentário
  // excluído): sai.
  sobrando.forEach(el => { if (el.parentNode === thread) el.remove(); });

  return entraram;
}

// ===== Sub-pills logo abaixo do cabeçalho (Comentários/Card mãe/Todos
// os comentários/Linha do tempo) =====
//
// O gomo "Comentários" do cabeçalho não muda mais de nome (fica sempre
// "Comentários", contra "Bee" do outro gomo) — quem mostra ONDE você
// está agora é essa fileira de pílulas cinzas, sempre visível enquanto
// não está na Bee (marcarAbaBeeAtiva esconde a fileira inteira).
function atualizarSubpillsAtivas() {
  const porAba = { aqui: "chatSubAqui", mae: "chatSubMae", todos: "chatSubTodos", linha: "chatSubLinha" };
  ["chatSubAqui", "chatSubMae", "chatSubTodos", "chatSubLinha"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const ativa = porAba[chatThreadAtivo] === id;
    el.classList.toggle("active", ativa);
    el.setAttribute("aria-selected", String(ativa));
  });
  // O interruptor da Bee só faz sentido nos dois merges — nas outras
  // pílulas não tem o que ligar/desligar.
  const linhaDoToggle = document.getElementById("chatBeeToggleRow");
  if (linhaDoToggle) linhaDoToggle.hidden = chatThreadAtivo !== "todos" && chatThreadAtivo !== "linha";
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
  atualizarSubpillsAtivas();
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
  atualizarSubpillsAtivas();
  const thread = document.getElementById("commentsThread");
  const avisosMae = document.getElementById("beeInlineAvisos");
  if (avisosMae) avisosMae.innerHTML = "";

  // Descobre QUEM é o card mãe (isso sim precisa de uma ida, se ainda não
  // souber). Os COMENTÁRIOS dele vêm da fonte única, igual a qualquer
  // outra tarefa — não existe mais um cache separado só pra eles.
  let idMae = idDaMaeSeConhecido(task);
  if (!idMae && task.parentTaskId) {
    if (thread) {
      const jaConhecidos = comentariosDaFonte(task.parentTaskId);
      if (jaConhecidos) pintarThread(thread, renderComentariosHTML({ id: task.parentTaskId, comments: jaConhecidos }), { rolarPraBaixo: true });
      else pintarThread(thread, `<p class="comments-empty">Carregando comentários do card mãe...</p>`);
    }
    await precarregarCardMaeEmBackground(task.id);
    idMae = idDaMaeSeConhecido(task);
  }
  if (chatThreadAtivo !== "mae" || !tasks[detailIdx] || tasks[detailIdx].id !== task.id) return;

  if (!idMae) {
    if (thread) pintarThread(thread, `<p class="comments-empty">Essa tarefa não tem card mãe.</p>`);
    return;
  }
  chatAlvoTaskId = idMae;

  // Mostra o que já se sabe (o abrirCardMaeCompleto já traz os
  // comentários junto), e só busca se realmente não tiver nada.
  if (thread && comentariosDaFonte(idMae)) {
    pintarThread(thread, renderComentariosHTML({ id: idMae, comments: comentariosDaFonte(idMae) }), { rolarPraBaixo: true });
  }
  if (comentariosDaFonte(idMae) === null) {
    if (thread) pintarThread(thread, `<p class="comments-empty">Carregando comentários do card mãe...</p>`);
    const comentarios = await buscarComentariosDoBackend(idMae);
    // `null` = não deu pra perguntar. Não registra e não apaga o que está
    // na tela — ver buscarComentariosDoBackend.
    if (comentarios === null) {
      if (chatThreadAtivo === "mae" && tasks[detailIdx] && tasks[detailIdx].id === task.id && thread) {
        pintarThread(thread, `<p class="comments-empty">Não consegui carregar os comentários do card mãe agora.</p>`);
      }
      return;
    }
    guardarFonteDeComentarios(idMae, comentarios);
  }
  if (chatThreadAtivo !== "mae" || !tasks[detailIdx] || tasks[detailIdx].id !== task.id) return; // trocou de aba/tarefa enquanto carregava
  if (thread) pintarThread(thread, renderComentariosHTML({ id: idMae, comments: comentariosDaFonte(idMae) || [] }));
}

// ===== "Todos os comentários" e "Linha do tempo" — os dois merges =====
//
// Generalização do que antes só existia pra subtarefa de ALTERAÇÃO (a
// antiga abrirThreadLinhaDoTempo): junta, em ordem de hora, os
// comentários de todas as pontas que existirem pra essa tarefa — ela
// mesma, o card mãe (se tiver) e a tarefa original (se for uma
// alteração) — e, se o interruptor estiver ligado, a conversa com a
// Bee também. "Linha do tempo" é a mesma coisa + os eventos do sistema
// (criada, começou a trabalhar, arquivo, entregue — ver
// js/detalhe-historia.js), pra ela sozinha já responder "por que
// demorou" sem precisar de uma aba separada.

// Preferência por designer (mesmo padrão de colmeia_<coisa>_v1): mostrar
// os comentários da Bee misturados no "Todos os comentários"/"Linha do
// tempo"? Começa ligado — só quem quiser tira.
function lerPreferenciaBeeUnificado() {
  try {
    const v = localStorage.getItem("colmeia_comentarios_bee_v1_" + normalizarParaComparar(DESIGNER_LOGADO || "sem-login"));
    return v === null ? true : v === "1";
  } catch (err) { return true; }
}
function salvarPreferenciaBeeUnificado(mostrar) {
  try { localStorage.setItem("colmeia_comentarios_bee_v1_" + normalizarParaComparar(DESIGNER_LOGADO || "sem-login"), mostrar ? "1" : "0"); }
  catch (err) { /* sem problema */ }
}
let chatMostrarBeeNoUnificado = lerPreferenciaBeeUnificado();

/**
 * Busca as três pontas de comentários "de verdade" (não inclui Bee nem
 * eventos do sistema — isso é acrescentado por quem chama). Retorna
 * `null` em cada ponta que falhou (pra quem chama saber que a lista
 * está incompleta, não vazia de verdade).
 */
/**
 * Qual é o id do card mãe dessa tarefa, se já souber. Só leitura — não
 * dispara busca nenhuma.
 */
function idDaMaeSeConhecido(task) {
  const infoMae = cardMaeCache.get(task.id);
  return (infoMae && infoMae.ok && infoMae.temPai) ? infoMae.cardMae.id : null;
}

/**
 * Busca as fontes que ainda FALTAM e registra cada uma. Não devolve nada:
 * quem chama redesenha a partir da fonte única depois.
 *
 * Espera o card mãe terminar de carregar (`precarregarCardMaeEmBackground`)
 * antes de decidir que "não tem mãe" — sem isso, a lista unificada era
 * montada enquanto ele ainda estava a caminho e os comentários dele
 * simplesmente não entravam, pra nunca mais (2026-08-13).
 */
async function garantirFontesDeComentarios(task) {
  const taskId = task.id;

  if (task.parentTaskId && !cardMaeCache.has(taskId)) {
    await precarregarCardMaeEmBackground(taskId);
  }

  const original = acharTarefaOriginalDaAlteracao(task);
  const idMae = idDaMaeSeConhecido(task);

  const aBuscar = [];
  if (comentariosDaFonte(taskId) === null) aBuscar.push(taskId);
  if (original && comentariosDaFonte(original.id) === null) aBuscar.push(original.id);
  if (idMae && comentariosDaFonte(idMae) === null) aBuscar.push(idMae);

  const resultados = await Promise.all(aBuscar.map(id => buscarComentariosDoBackend(id)));
  let algumaFalhou = false;
  resultados.forEach((lista, i) => {
    // `null` = não deu pra perguntar. Não registra — senão uma piscada de
    // internet viraria "essa tarefa não tem comentário" até trocar de card.
    if (lista === null) { algumaFalhou = true; return; }
    guardarFonteDeComentarios(aBuscar[i], lista);
  });

  if (chatMostrarBeeNoUnificado && beeConversas.get(taskId) === undefined) {
    const historico = await chamarBackend({ acao: "beeHistorico", taskId });
    if (historico && historico.ok) beeConversas.set(taskId, historico.conversa || []);
  }

  return { algumaFalhou };
}

/** Conversa com a Bee (se o interruptor estiver ligado), no mesmo formato de comentário. */
function beeComoComentarios(task) {
  if (!chatMostrarBeeNoUnificado) return [];
  const conversa = beeConversas.get(task.id);
  if (!conversa) return [];
  return conversa.map((m, i) => ({
    id: "bee-" + i,
    autor: m.autor === "bee" ? "Bee" : (DESIGNER_LOGADO || "Você"),
    texto: m.texto,
    data: m.quando,
    _origem: "Bee",
    _somenteLeitura: true,
  }));
}

// Eventos do sistema já buscados, por tarefa — mesma ideia da fonte única
// dos comentários: guarda o ingrediente, monta a mistura na hora.
const eventosPorTarefa = new Map();

/** Monta os pseudo-comentários dos eventos do sistema (ver js/detalhe-historia.js). */
async function buscarEventosComoComentarios(task) {
  const dados = await chamarBackend({ acao: "buscarHistoriaDaTarefa", taskId: task.id });
  if (!dados || !dados.ok) return null;
  const eventos = montarEventosDoSistema(task, dados);
  // Sem _origem de propósito: pra um comentário de verdade essa etiqueta
  // diz DE ONDE ele veio (Card mãe/Tarefa original/Bee), o que importa.
  // Pra um evento, "Sistema" + o ícone já contam a história sozinhos —
  // repetir "Linha do tempo" na etiqueta seria só ruído.
  return eventos.map((ev, i) => ({
    id: "evt-" + i,
    autor: "Sistema",
    texto: ev.titulo + (ev.detalhe ? `: ${ev.detalhe}` : "") + (ev.aproximado ? " (aproximado)" : ""),
    data: new Date(ev.quando).toISOString(),
    _somenteLeitura: true,
    _icone: HISTORIA_ICONES[ev.tipo],
  }));
}

function juntarEOrdenar(partes) {
  return [].concat(...partes).sort((a, b) => new Date(a.data || 0) - new Date(b.data || 0));
}

/**
 * A descrição entra como a PRIMEIRA mensagem dos merges, só pra leitura
 * — muitas vezes o pedido inteiro está lá, e sem isso a lista conta a
 * história pela metade. Ela continua sendo editada onde sempre foi (a
 * aba Descrição); aqui é só uma cópia.
 */
function pseudoComentarioDescricao(task) {
  if (!task.descricaoTexto) return [];
  return [{
    id: "descricao",
    autor: "Descrição da tarefa",
    texto: task.descricaoTexto,
    data: task.createdAt || null,
    _origem: "Descrição",
    _somenteLeitura: true,
  }];
}

/** Card mãe existe → devolve o id dele (senão null). Usado no seletor de destino ao enviar. */
function idDoCardMae(task) {
  const infoMae = cardMaeCache.get(task.id);
  return (infoMae && infoMae.ok && infoMae.temPai) ? infoMae.cardMae.id : null;
}

/**
 * A lista unificada, CALCULADA AGORA a partir da fonte única. Função pura
 * e síncrona: não busca nada, não toca na tela. É o coração do item C —
 * como ela roda toda vez que a tela é desenhada, a mistura nunca fica
 * velha em relação aos ingredientes.
 */
function montarMergeDeComentarios(task, comEventos) {
  const original = acharTarefaOriginalDaAlteracao(task);
  const idMae = idDaMaeSeConhecido(task);
  const partes = [
    pseudoComentarioDescricao(task),
    (comentariosDaFonte(task.id) || []).map(c => Object.assign({}, c, { _origem: "Nesta tarefa" })),
    (original ? (comentariosDaFonte(original.id) || []) : []).map(c => Object.assign({}, c, { _origem: "Tarefa original" })),
    (idMae ? (comentariosDaFonte(idMae) || []) : []).map(c => Object.assign({}, c, { _origem: "Card mãe" })),
    beeComoComentarios(task),
  ];
  if (comEventos) partes.push(eventosPorTarefa.get(String(task.id)) || []);
  return juntarEOrdenar(partes);
}

/** Desenha a lista unificada com o que já se sabe, sem esperar rede. */
function desenharThreadUnificada(task, comEventos, opcoes) {
  const thread = document.getElementById("commentsThread");
  if (!thread) return;
  const juntos = montarMergeDeComentarios(task, comEventos);
  if (juntos.length) {
    pintarThread(thread, renderComentariosHTML({ id: task.id, comments: juntos }), opcoes);
    return;
  }
  // Nada ainda: só diz "carregando" se de fato ainda não temos a fonte
  // principal. Se já temos e ela está vazia, a verdade é "não tem nada".
  const aindaBuscando = comentariosDaFonte(task.id) === null;
  pintarThread(thread, aindaBuscando
    ? `<p class="comments-empty">${comEventos ? "Montando a linha do tempo..." : "Juntando os comentários..."}</p>`
    : `<p class="comments-empty">${comEventos ? "Ainda não tem nada pra mostrar aqui." : "Nenhum comentário em lugar nenhum ainda."}</p>`);
}

/** O caminho comum de "Todos os comentários" e "Linha do tempo". */
async function abrirThreadUnificada(task, comEventos) {
  chatThreadAtivo = comEventos ? "linha" : "todos";
  chatAlvoTaskId = task.id;
  marcarAbaBeeAtiva(false);
  atualizarCampoParaBee(false);
  atualizarSubpillsAtivas();
  const avisos = document.getElementById("beeInlineAvisos");
  if (avisos) avisos.innerHTML = "";

  const taskId = task.id;
  const aba = chatThreadAtivo;

  // 1) Na hora, com tudo que já se sabe (memória + navegador).
  desenharThreadUnificada(task, comEventos, { rolarPraBaixo: true });

  // 2) Busca só o que falta.
  const pendentes = [garantirFontesDeComentarios(task)];
  if (comEventos && !eventosPorTarefa.has(String(taskId))) {
    pendentes.push(buscarEventosComoComentarios(task).then(evs => {
      if (evs !== null) eventosPorTarefa.set(String(taskId), evs);
    }));
  }
  const [resultado] = await Promise.all(pendentes);

  // 3) Redesenha com o que chegou. Como o desenho é sempre calculado da
  //    fonte, se nada mudou o pintarThread não encosta na tela.
  if (chatThreadAtivo !== aba || !tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return;
  const thread = document.getElementById("commentsThread");
  if (!thread) return;
  const juntos = montarMergeDeComentarios(task, comEventos);
  if (!juntos.length && resultado && resultado.algumaFalhou) {
    pintarThread(thread, `<p class="comments-empty">${comEventos ? "Não consegui montar a linha do tempo agora." : "Não consegui juntar os comentários agora."}</p>`);
    return;
  }
  desenharThreadUnificada(task, comEventos);
}

function abrirThreadTodos(task) { return abrirThreadUnificada(task, false); }
function abrirThreadLinha(task) { return abrirThreadUnificada(task, true); }

/** Liga/desliga os comentários da Bee no merge e redesenha na hora, sem rebuscar nada. */
function alternarBeeNoUnificado(mostrar) {
  chatMostrarBeeNoUnificado = mostrar;
  salvarPreferenciaBeeUnificado(mostrar);
  const task = tasks[detailIdx];
  if (!task) return;
  if (chatThreadAtivo === "todos") abrirThreadTodos(task);
  else if (chatThreadAtivo === "linha") abrirThreadLinha(task);
}

/**
 * Recarrega a thread que está sendo mostrada agora no chat (a da
 * própria tarefa, a do card mãe ou a linha do tempo da alteração) —
 * usado depois de enviar, excluir ou reagir a um comentário.
 */
async function recarregarThreadAtiva() {
  const task = tasks[detailIdx];
  if (!task) return;
  const alvo = chatThreadAtivo === "mae" ? idDaMaeSeConhecido(task) : task.id;
  if (!alvo) return;

  // UMA busca só, sempre da mesma fonte — e a tela é recalculada a partir
  // dela. Antes, nas abas unificadas isso rebuscava os comentários E
  // remontava a mistura do zero (que ia buscar de novo a tarefa original,
  // o card mãe, a Bee e os eventos): ~5 idas ao servidor pra mostrar uma
  // mensagem que já estava na tela.
  const rebuscados = await buscarComentariosDoBackend(alvo);
  if (rebuscados === null) return; // não chegou: preserva o que está na tela
  guardarFonteDeComentarios(alvo, rebuscados);
  redesenharThreadAtiva();
}

/**
 * Redesenha a aba aberta agora a partir da fonte única, SEM buscar nada.
 * É o caminho que o envio de comentário usa (ver item A) — e como tudo é
 * calculado da mesma fonte, o `pintarThread` só encosta na tela no que
 * mudou de verdade.
 */
function redesenharThreadAtiva() {
  const task = tasks[detailIdx];
  if (!task) return;
  const thread = document.getElementById("commentsThread");
  if (!thread) return;

  if (chatThreadAtivo === "todos") { desenharThreadUnificada(task, false); return; }
  if (chatThreadAtivo === "linha") { desenharThreadUnificada(task, true); return; }
  if (chatThreadAtivo === "mae") {
    const idMae = idDaMaeSeConhecido(task);
    if (idMae) pintarThread(thread, renderComentariosHTML({ id: idMae, comments: comentariosDaFonte(idMae) || [] }));
    return;
  }
  const daTarefa = comentariosDaFonte(task.id);
  if (daTarefa) task.comments = daTarefa;
  pintarThread(thread, renderComentariosHTML(task));
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
    const minha = !c._somenteLeitura && nomesCorrespondem(c.autor, DESIGNER_LOGADO);
    return `
    <div class="comment-bubble ${minha ? "mine" : ""} ${c._somenteLeitura ? "somente-leitura" : ""}" data-comment-id="${c.id}">
      ${c.autor === "Bee"
        ? `<span class="avatar avatar-sm comment-avatar comment-avatar-bee" aria-hidden="true">${beeIcon}</span>`
        : avatarHTML(minha ? DESIGNER_LOGADO : c.autor, "avatar-sm comment-avatar")}
      <div class="comment-body">
        <div class="comment-meta"><span class="comment-author">${minha ? "Você" : escaparHTML(c.autor)}</span><span class="comment-time">${formatarHoraComentario(c.data)}</span>${c._origem ? `<span class="comment-origem">${escaparHTML(c._origem)}</span>` : ""}</div>
        <div class="comment-text">${c._icone ? `<span class="comment-evento-icone">${c._icone}</span> ` : ""}${prepararTextoComentario(c.texto)}</div>
        ${(c.reactions || []).length ? `
          <div class="comment-reactions">
            ${c.reactions.map(r => `<span class="comment-reaction-chip" title="${(r.users || []).map(u => u.name).join(", ")}">${r.emoji} ${r.count}</span>`).join("")}
          </div>
        ` : ""}
      </div>
      ${c._somenteLeitura ? "" : `
        <button type="button" class="comment-react-btn" data-comment-id="${c.id}" title="Reagir" aria-label="Reagir">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5h.01M15.5 10.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="comment-react-picker" data-comment-id="${c.id}" hidden></div>
        ${minha ? `
        <div class="comment-bubble-acoes">
            <button type="button" class="comment-edit-btn" data-comment-id="${c.id}" title="Editar comentário" aria-label="Editar comentário">
              <svg viewBox="0 0 24 24" fill="none"><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          <button type="button" class="comment-delete-btn" data-comment-id="${c.id}" title="Excluir comentário" aria-label="Excluir comentário">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
        ` : ""}
      `}
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
  guardarFonteDeComentarios(taskId, comentarios);
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

  // Se essa tarefa já foi vista (ou pré-carregada de manhã, ver
  // precarregarDetalhesDoDia em js/cache-tarefas.js), desenha o guardado
  // NA HORA e segue buscando o de verdade por trás — o padrão "mostra o
  // que tem, confere depois". Sem isso, o card fica em branco durante
  // toda a espera da fila do Apps Script, que é a reclamação do Erick.
  let _veioDoCache = false;
  if (typeof lerDetalheDoCache === "function") {
    try {
      const guardado = await lerDetalheDoCache(taskId);
      if (guardado && guardado.abrir && tasks[detailIdx]
          && String(tasks[detailIdx].id) === String(taskId)) {
        aplicarDadosDaTarefa(task, guardado.abrir, taskId, true);
        _veioDoCache = true;
      }
    } catch (err) { /* sem cache: segue no caminho normal */ }
  }
  // "cache" = a pessoa viu o card na hora; "servidor" = teve que esperar
  // a fila. É esta proporção que diz se o pré-carregamento está pegando.
  if (typeof medirOrigemDoDado === "function") {
    medirOrigemDoDado("card", _veioDoCache ? "cache" : "servidor");
  }

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

  aplicarDadosDaTarefa(task, data, taskId, false);

  // Guarda pra próxima abertura (dela ou de outro dia). Sem await: o card
  // já está desenhado, e escrever no banco local não é problema de
  // ninguém que esteja esperando.
  if (typeof guardarDetalheNoCache === "function") {
    guardarDetalheNoCache(taskId, { abrir: data });
  }
}

/**
 * Joga os dados de `abrirTarefa` no card. Existe separado porque roda
 * DUAS vezes por abertura: uma com o que estava guardado no navegador
 * (instantâneo) e outra com o que chegou do servidor (a verdade).
 *
 * @param {boolean} veioDoCache quando true, os dados podem estar velhos —
 *   e aí tem coisa que é melhor NÃO mexer (ver o cronômetro abaixo).
 */
function aplicarDadosDaTarefa(task, data, taskId, veioDoCache) {
  // Trocou de tarefa enquanto carregava? Compara por id, nunca por
  // referência (bug recorrente do CLAUDE.md).
  const aindaNaMesma = () => tasks[detailIdx] && String(tasks[detailIdx].id) === String(taskId);

  // --- Cronômetro: nunca deixa o tempo voltar pra trás ---
  // Do cache, o cronômetro NÃO entra: o tempo é do segundo atual, não de
  // quando a foto foi tirada. É a mesma lição do snapshot do quadro, que
  // restaura tudo menos o `running` (ver restaurarSnapshotDoQuadro).
  // O mapearTarefaDoBackend fica DENTRO deste if de propósito: o resultado
  // dele só serve aqui, e rodá-lo por fora fazia o desenho instantâneo
  // inteiro morrer caso o que estivesse guardado viesse capenga.
  if (!veioDoCache) {
    const fresco = mapearTarefaDoBackend(data.tarefa);
    task.timerSeconds = Math.max(task.timerSeconds || 0, fresco.timerSeconds);
    task.tempoMedioMinutos = fresco.tempoMedioMinutos;
    task.estimatePct = calcularEstimatePct(task.timerSeconds, task.tempoMedioMinutos);
  }

  // --- Sequência de responsáveis ---
  task.sequencia = data.sequencia || [];
  task.workflowId = data.workflowId || null;

  // --- Comentários ---
  task.comments = data.comentarios || [];
  // Registra na fonte única (ver o bloco "A FONTE ÚNICA" no topo): é dela
  // que "Todos os comentários" e a "Linha do tempo" são calculados.
  if (!veioDoCache) guardarFonteDeComentarios(taskId, task.comments);

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
  // Guarda a descrição na própria tarefa: Todos os comentários/Linha do
  // tempo mostram ela como a primeira mensagem (ver
  // pseudoComentarioDescricao), e é isso que faz o "ver original" da Bee
  // ter pra onde apontar quando o pedido veio da descrição, e não de um
  // comentário.
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

  // Anexos: agora é uma aba própria (ver tabAnexos, js/detalhe-modal.js),
  // sob demanda — só busca de verdade quando a pessoa clica nela
  // (carregarAnexos, mais abaixo, já junta a família inteira: card mãe +
  // todas as subtarefas). Só desenha de graça aqui quando a tarefa NÃO
  // tem família nenhuma (não é alteração, não tem card mãe, não é ela
  // mesma um card mãe) — nesse caso os anexos já vieram nessa mesma
  // resposta, sem custo nenhum, e é tudo que existe mesmo.
  if (!ehTarefaDeAlteracao(task) && !task.parentTaskId && !data.temSubtarefas) {
    desenharAnexos(task, data.anexos || []);
  }

  // "É card mãe?" também já veio na mesma resposta.
  if (data.temSubtarefas) carregarFilhosSeForCardMae(task);
}

async function buscarAnexosDeUmaTarefa(taskId) {
  const data = await chamarBackend({ acao: "buscarAnexos", taskId });
  return data.ok ? (data.anexos || []) : [];
}

/**
 * Junta os anexos de TODA a família do card — a própria tarefa, o card
 * mãe (se ela for subtarefa) e TODAS as subtarefas irmãs (se ela for
 * card mãe, ou tiver irmãs) — cada anexo de fora marcado com de ONDE
 * ele veio (_origemNome), pra desenharAnexos etiquetar o pill. Pedido do
 * Cláudio (2026-08-04): "esses anexos precisam estar todos, de card
 * mãe, subtarefas, o que tiver ali" — generaliza o que antes só existia
 * pra "tarefa original" de uma alteração (a original é só mais uma
 * irmã, então já cai aqui dentro sozinha).
 */
async function buscarTodosAnexosDaFamilia(task) {
  // Sempre busca — nunca filtrar por `task.attachmentsCount` (achado do
  // Cláudio, 2026-08-19: "o número de anexos fica sempre em 0"). Esse
  // campo vem de `attachments_count` do Runrun.it, que conta arquivo
  // anexado DIRETO na tarefa; mas o que este app trata como "anexo" é
  // arquivo colado DENTRO de um comentário (buscarAnexosTarefa,
  // RunrunLeitura.gs, lê `comentario.documents`) — as duas contagens não
  // têm relação nenhuma, e quase todo anexo da agência entra por
  // comentário. Filtrar por um número que não mede a coisa certa
  // escondia anexo de verdade. Chamada só acontece sob demanda (clique
  // na aba Anexos), então não há custo de background pra economizar.
  const proprios = await buscarAnexosDeUmaTarefa(task.id);

  let cardMae = null;
  let irmas = [];

  if (task.parentTaskId) {
    // O card mãe (e a lista de irmãs) já vem pré-carregado quando a
    // subtarefa abre; se ainda não chegou, espera.
    if (!cardMaeCache.has(task.id)) await precarregarCardMaeEmBackground(task.id);
    const info = cardMaeCache.get(task.id);
    if (info && info.ok && info.temPai) {
      cardMae = info.cardMae;
      irmas = (info.subtarefas || []).filter(s => String(s.id) !== String(task.id));
    }
  } else if (task.subtarefasResumo) {
    // A própria tarefa É o card mãe (ver carregarFilhosSeForCardMae).
    irmas = task.subtarefasResumo;
  }

  const fontes = [];
  if (cardMae) fontes.push({ id: cardMae.id, nome: "Card mãe" });
  irmas.forEach(s => fontes.push({ id: s.id, nome: s.title || "Subtarefa" }));

  const listas = await Promise.all(fontes.map(f => buscarAnexosDeUmaTarefa(f.id)));

  const todos = proprios.slice();
  fontes.forEach((f, i) => {
    // _origemId: pra "abrir arquivo grande demais no Runrun.it" levar
    // pra tarefa CERTA (a que tem o anexo), não pra tarefa que está
    // aberta no Colmeia agora — ver desenharAnexos.
    listas[i].forEach(a => todos.push(Object.assign({}, a, { _origemNome: f.nome, _origemId: f.id })));
  });
  return todos;
}

async function carregarAnexos(task) {
  if (!task.id) return;
  const anexos = await buscarTodosAnexosDaFamilia(task);
  if (!tasks[detailIdx] || tasks[detailIdx].id !== task.id) return; // trocou de tarefa enquanto carregava
  desenharAnexos(task, anexos);
}

/**
 * Desenha a lista de anexos na tela, como pills — um por arquivo, com o
 * nome, o tamanho e (quando veio de fora da própria tarefa) uma
 * etiqueta de onde ele está: "Card mãe" ou o título da subtarefa (ver
 * _origemNome, buscarTodosAnexosDaFamilia). Separado da BUSCA porque os
 * anexos podem chegar de dois caminhos: junto com todo o resto, no
 * pedido único de abrir o card (carregarTudoDaTarefa — só quando a
 * tarefa não tem família nenhuma), ou na busca sob demanda da aba
 * Anexos (carregarAnexos, que já junta a família inteira). Os dois
 * caminhos desenham igual, por aqui.
 */
function desenharAnexos(task, anexos) {
  if (task && task.id) anexosJaBuscados.set(String(task.id), anexos || []);
  const listaEl = document.getElementById("attachList");
  const allBtn = document.getElementById("downloadAllBtn");
  const contadorEl = document.getElementById("anexosTabCount");
  if (contadorEl) {
    const qtd = (anexos || []).length;
    contadorEl.textContent = qtd;
    contadorEl.hidden = qtd === 0;
  }
  if (!listaEl) return;
  if (!anexos || anexos.length === 0) {
    listaEl.innerHTML = `<p class="attach-empty">Nenhum anexo na tarefa, no card mãe ou nas subtarefas.</p>`;
    if (allBtn) allBtn.hidden = true;
    return;
  }
  if (allBtn) allBtn.hidden = false;
  listaEl.innerHTML = anexos.map(a => {
    const grande = anexoEhGrandeDemais(a.tamanho);
    return `
    <button type="button" class="arquivo-pill${grande ? " grande" : ""}" data-doc-id="${a.id}" data-nome="${escaparHTML(a.nome)}" data-grande="${grande ? "1" : ""}" data-origem-id="${escaparHTML(a._origemId || task.id)}" title="${escaparHTML(a.nome)}">
      <span class="arquivo-pill-icone">${grande ? ICONE_ABRIR_FORA : ICONE_BAIXAR}</span>
      <span class="arquivo-pill-nome">${escaparHTML(a.nome)}</span>
      ${a._origemNome ? `<span class="arquivo-pill-origem">${escaparHTML(a._origemNome)}</span>` : ""}
      ${a.tamanho ? `<span class="arquivo-pill-tamanho">${formatarTamanhoArquivo(a.tamanho)}</span>` : ""}
      ${grande ? `<span class="arquivo-pill-origem">abre no Runrun.it</span>` : ""}
    </button>
  `;
  }).join("");
  listaEl.querySelectorAll(".arquivo-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      // Arquivo grande já é desviado pro Runrun.it AQUI, no clique de
      // verdade — assim a aba nova nunca é barrada pelo navegador (o que
      // acontecia quando ela só era aberta depois de esperar a resposta
      // do backend, e sobrava só uma mensagem de erro vermelha na tela).
      // data-origem-id leva pra tarefa DONA do anexo (card mãe/subtarefa),
      // não pra que está aberta no Colmeia agora.
      if (btn.dataset.grande) abrirAnexoNoRunrun(btn.dataset.origemId, btn.dataset.nome);
      else baixarAnexo(btn.dataset.docId, btn.dataset.nome, btn, btn.dataset.origemId);
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
    mostrarToast(`“${nome}” é grande demais pra baixar pelo Colmeia — abre a tarefa no Runrun.it pra pegar de lá.`, "erro");
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
  //
  // ⚠️ NÃO afirma "Cliente > Publicações" como caminho fixo (2026-08-12):
  // cliente com frente/marca dentro da mesma pasta (ex: GO TOGETHER >
  // MICE > Publicações) tem a pasta de verdade um nível mais fundo, e
  // esse nível só o backend sabe (lê o link configurado em Configurações
  // → Clientes, ver acharPastaDePublicacoesDoCliente, Drive.gs) — um
  // preview fixo já mostrou um caminho que nunca existiu de verdade. O
  // caminho REAL só aparece depois, no aviso de sucesso.
  const mesProjeto = extrairMesAnoDoProjeto(task.projeto);
  const agora = new Date();
  const ano = mesProjeto ? mesProjeto.ano : agora.getFullYear();
  const mes = MESES_PT_JS[mesProjeto ? mesProjeto.mesIndex : agora.getMonth()];

  const confirmado = await confirmarCriacaoDePasta(
    `Deseja criar a pasta <strong>"${task.title}"</strong> dentro de Publicações de <strong>${task.client}</strong> (${mes}/${ano})?`
  );
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
    // O caminho de VERDADE (já resolvido pelo backend, com a frente/marca
    // do cliente incluída quando existe) — o preview de antes da criação
    // não sabia isso, então é aqui que a pessoa confere onde caiu de fato.
    if (data.caminho) mostrarToast((data.jaExistia ? "Pasta já existia em " : "Pasta criada em ") + data.caminho, "sucesso");
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
          // ESPERA a busca que o openDetail já disparou em vez de abrir
          // outra (2026-08-13): antes, o `|| await buscarCardMaeDoBackend`
          // aqui caía no caminho ANTIGO — 4 idas ao servidor — sempre que
          // chegasse antes da outra terminar, que é o caso normal. Agora
          // precarregarCardMaeEmBackground devolve a MESMA promessa pra
          // quem chegar no meio (ver cardMaeEmVoo, js/detalhe-cardmae.js).
          await precarregarCardMaeEmBackground(task.id);
          const cardMaeInfo = cardMaeCache.get(task.id);
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
      // Otimista: a data nova aparece na hora, sem "Salvando..." no meio.
      onEscolher: novaData => {
        if (!novaData || novaData === task.dueISO) return;
        const dueISOAntigo = task.dueISO;
        const dueAntigo = task.due;
        // Mantém sempre o mesmo padrão visual de antes (ex: "27 jul"),
        // nunca a data crua (AAAA-MM-DD) — isso é que ficava feio.
        const [ano, mes, dia] = novaData.split("-").map(Number);
        marcarEscritaOtimista(task, {
          dueISO: novaData,
          due: `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`,
        });
        renderDetail();
        render(); // atualiza a data no card do quadro também

        // Passa pela fila de ações: "a entrega é nesse dia" continua certo
        // mesmo se chegar atrasado, então sem internet fica guardado e vai
        // sozinho quando voltar (ver js/fila-offline.js).
        enviarEscritaNoBackend(
          { acao: "alterarEntrega", taskId: task.id, novaData },
          "mudar a entrega desejada"
        ).then(data => {
          if (data && data.ok) { agendarAtualizacaoKanban(); return; }
          task.dueISO = dueISOAntigo;
          task.due = dueAntigo;
          desmarcarEscritaOtimista(task, ["dueISO", "due"]);
          if (tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id)) renderDetail();
          render();
          mostrarToast((data && data.error) ? String(data.error).slice(0, 60) : "Não consegui salvar a nova data.", "erro");
        });
      },
    });
  });
}

function wireExcluirComentario() {
  document.querySelectorAll(".comment-delete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      // Sem confirm() cinza do navegador (2026-08-14, achado do hallmark
      // audit: destoava de um app que desenha cada outro popup próprio) —
      // some da tela na hora e dá 6s de "Desfazer" antes de mandar a
      // exclusão de verdade pro Runrun.it.
      const commentId = btn.dataset.commentId;
      const guardado = tirarComentarioDasFontes(commentId);
      if (!guardado) return;
      redesenharThreadAtiva();
      mostrarToastComDesfazer(
        "Comentário excluído.",
        () => { devolverComentarioAFonte(guardado); redesenharThreadAtiva(); },
        async () => {
          const ok = await excluirComentarioNoBackend(commentId);
          if (!ok) {
            devolverComentarioAFonte(guardado);
            redesenharThreadAtiva();
            mostrarToast("Não consegui excluir esse comentário agora.", "erro");
          }
        }
      );
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
          emojiBtn.addEventListener("click", () => {
            picker.hidden = true;
            const commentId = btn.dataset.commentId;
            const emoji = emojiBtn.textContent;
            // Otimista: a reação aparece no balão na hora. Antes o emoji só
            // surgia depois da resposta do Runrun.it E de uma RECARGA
            // inteira da conversa — duas idas ao servidor pra mostrar uma
            // carinha que a gente já sabia qual era.
            const comentario = acharComentarioNasFontes(commentId);
            const reacoesAntes = comentario ? (comentario.reactions || []).map(r => ({ ...r, users: (r.users || []).slice() })) : null;
            if (comentario) {
              aplicarReacaoOtimista(comentario, emoji);
              redesenharThreadAtiva();
            }
            reagirComentarioNoBackend(commentId, emoji).then(ok => {
              if (ok) return;
              if (comentario) { comentario.reactions = reacoesAntes; redesenharThreadAtiva(); }
              mostrarToast("Não consegui registrar sua reação agora.", "erro");
            });
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

  const salvar = () => {
    const novoTexto = input.value.trim();
    if (!novoTexto || novoTexto === comentario.texto) { cancelar(); return; }
    // Otimista: o texto novo já fica valendo. Antes o balão virava
    // "Salvando..." e a pessoa esperava a resposta pra ver o próprio texto.
    // Mexe no comentário DA FONTE (não só no da tarefa aberta), senão o
    // próximo redesenho recalcularia a partir da fonte e traria o texto
    // velho de volta.
    const naFonte = acharComentarioNasFontes(commentId) || comentario;
    const textoAntes = naFonte.texto;
    naFonte.texto = novoTexto;
    comentario.texto = novoTexto;
    redesenharThreadAtiva();
    editarComentarioNoBackend(commentId, novoTexto).then(ok => {
      if (ok) return;
      naFonte.texto = textoAntes;
      comentario.texto = textoAntes;
      redesenharThreadAtiva();
      mostrarToast("Não consegui salvar a edição agora. Tenta de novo.", "erro");
    });
  };

  textEl.querySelector(".comment-edit-cancelar").addEventListener("click", cancelar);
  textEl.querySelector(".comment-edit-salvar").addEventListener("click", salvar);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); salvar(); }
    if (e.key === "Escape") cancelar();
  });
}


