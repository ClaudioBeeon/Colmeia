// ============================================
// PÁGINA "BEE" — feed de atividades + o painel de verdade da Bee do lado
// ============================================
//
// O chat NÃO tem markup próprio aqui: essa página só abre/fecha o mesmo
// #beePainel que a bolinha flutuante já usa em qualquer tela (ver
// beeAbrirPainel/beeFecharPainel em js/bee.js) — como ele é um item flex
// irmão do .main (não um pop-up por cima), abrir ele enquanto a página
// Bee está sozinha visível já produz o layout "feed à esquerda, chat à
// direita", sem duplicar nenhuma lógica de conversa.
//
// O QUE ENTRA NO FEED, e de onde vem cada coisa:
//
//   - o que VOCÊ fez, reconstruído do estado atual (não precisa de log):
//       entregas    -> buscarEntreguesDoDesigner (a mesma de "Minhas horas")
//       uploads     -> buscarAtividadesDrive     (idem)
//   - o que OS OUTROS fizeram nas suas tarefas, anotado na hora que
//     acontece (buscarFeedEventos -> aba FeedEventos da planilha):
//       comentario  -> alguém comentou numa tarefa sua
//       prioridade  -> alguém mudou a prioridade de uma tarefa sua
//       recebida    -> alguém te passou uma tarefa (sequência ou reatribuição)
//
// A diferença entre os dois grupos importa: o primeiro sempre existiu e
// aparece com histórico; o segundo só passa a existir a partir de agora,
// porque o Runrun.it não conta depois do fato quem fez o quê e quando
// (ver a explicação inteira em Planilha.gs, seção FEED DA ABA "BEE").

let beeFeedEventos = null;      // null = ainda não tem nada pra mostrar
let beeFeedAtualizando = false; // true = tem uma busca em andamento

// O feed guardado no navegador. Sem isso, cada vez que a aba abria a
// pessoa via "Carregando..." numa tela em branco e esperava o Drive/
// Runrun.it responderem — mesmo tendo visto a mesma lista minutos antes.
// Mesmo padrão do snapshot do quadro (js/pessoas-fotos.js): guarda por
// designer (o computador pode ser compartilhado) e com data.
const BEE_FEED_CACHE_KEY = "colmeia_bee_feed_v1";
const BEE_FEED_CACHE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

function salvarFeedNoNavegador(eventos) {
  if (!DESIGNER_LOGADO || !Array.isArray(eventos)) return;
  try {
    localStorage.setItem(BEE_FEED_CACHE_KEY, JSON.stringify({
      designer: DESIGNER_LOGADO, quando: Date.now(), eventos,
    }));
  } catch (err) {
    // Espaço cheio/aba privada: sem cache o feed só volta a abrir vazio.
    try { localStorage.removeItem(BEE_FEED_CACHE_KEY); } catch (e) { /* segue */ }
  }
}

function restaurarFeedDoNavegador() {
  if (!DESIGNER_LOGADO) return null;
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(BEE_FEED_CACHE_KEY) || "null"); }
  catch (err) { return null; }
  if (!salvo || !Array.isArray(salvo.eventos) || !salvo.eventos.length) return null;
  if (!nomesCorrespondem(salvo.designer, DESIGNER_LOGADO)) return null;
  if (!salvo.quando || (Date.now() - salvo.quando) > BEE_FEED_CACHE_VALIDADE_MS) return null;
  return salvo.eventos;
}

// Onde o #beePainel morava antes de ser trazido pra cá — guardado pra
// devolver ele exatamente no mesmo lugar quando a pessoa sai da página
// (a bolinha flutuante continua funcionando em todas as outras telas).
let _beePainelCasaOriginal = null;

/**
 * Traz o painel de verdade da Bee pra dentro da página, no lugar do
 * chat. Mover (em vez de recriar) mantém os MESMOS ids, listeners e
 * estado de conversa — a Bee daqui é literalmente a mesma da bolinha.
 */
function abrirPaginaBee() {
  const painel = document.getElementById("beePainel");
  const slot = document.getElementById("beePainelSlot");
  if (painel && slot && painel.parentElement !== slot) {
    _beePainelCasaOriginal = painel.parentElement;
    slot.appendChild(painel);
    painel.classList.add("bee-painel-na-pagina");
    painel.setAttribute("aria-hidden", "false");
    // Sai do modo "painel lateral": sem isso o CSS de body.bee-aberta
    // continuaria valendo e o painel empurraria o quadro das OUTRAS
    // páginas, que foi exatamente o que ficou estranho na 1ª versão.
    document.body.classList.remove("bee-aberta");
  }
  // Esconde a bolinha flutuante enquanto essa página está aberta (ela
  // serve pra CHAMAR a Bee de outra tela; aqui já está tudo na frente).
  document.body.classList.add("pagina-bee-aberta");
  // A tela inicial dela (atalhos + conversas recentes) é o ponto de
  // partida certo aqui — a página inteira é sobre a Bee.
  if (typeof beeMostrarTela === "function") beeMostrarTela("inicio");
  if (typeof beeRecentesLista !== "undefined" && beeRecentesLista === null
      && typeof carregarRecentesDaBee === "function") {
    carregarRecentesDaBee();
  }

  // Mostra na hora o que já foi visto da última vez (guardado no
  // navegador) e atualiza por baixo — em vez de deixar a tela em branco
  // esperando o Drive/Runrun.it responderem.
  if (beeFeedEventos === null) {
    const doCache = restaurarFeedDoNavegador();
    if (doCache) beeFeedEventos = doCache;
  }
  renderFeedDaBee();
  carregarFeedDaBee();
}

function fecharPaginaBee() {
  document.body.classList.remove("pagina-bee-aberta");
  const painel = document.getElementById("beePainel");
  if (painel && _beePainelCasaOriginal && painel.parentElement !== _beePainelCasaOriginal) {
    _beePainelCasaOriginal.appendChild(painel);
    painel.classList.remove("bee-painel-na-pagina");
    painel.setAttribute("aria-hidden", "true");
  }
}

async function carregarFeedDaBee() {
  beeFeedAtualizando = true;
  renderFeedDaBee(); // acende a faixinha "atualizando" por cima do que já está lá

  const [entregues, atividades, anotados] = await Promise.all([
    chamarBackend({ acao: "buscarEntreguesDoDesigner", designer: DESIGNER_LOGADO, limite: 20 }),
    chamarBackend({ acao: "buscarAtividadesDrive", designer: DESIGNER_LOGADO }),
    chamarBackend({ acao: "buscarFeedEventos", designer: DESIGNER_LOGADO }),
  ]);

  beeFeedAtualizando = false;

  // Trocou de página enquanto carregava — não teria mais onde desenhar.
  if (document.getElementById("page-bee").hidden) return;

  // Nenhuma das três respondeu (internet fora): mantém na tela o que já
  // estava, em vez de apagar tudo e mostrar "nada por aqui" — que seria
  // mentira. Distinguir "não tem" de "não sei" é a regra do chamarBackend.
  if (caiuARede(entregues) && caiuARede(atividades) && caiuARede(anotados)) {
    renderFeedDaBee();
    return;
  }

  const eventos = [];
  if (!caiuARede(entregues) && entregues.ok) {
    entregues.entregues.forEach(t => {
      if (!t.quando) return;
      eventos.push({ tipo: "entrega", quando: t.quando, taskId: t.id, titulo: t.titulo, cliente: t.cliente, tipoTarefa: t.tipo });
    });
  }
  if (!caiuARede(atividades) && atividades.ok) {
    atividades.atividades.forEach(a => {
      eventos.push({ tipo: "upload", quando: a.quando, arquivo: a.arquivo, cliente: a.cliente, pastaUrl: a.pastaUrl, breadcrumb: a.breadcrumb });
    });
  }
  if (!caiuARede(anotados) && anotados.ok) {
    (anotados.eventos || []).forEach(e => {
      eventos.push({
        tipo: e.tipo, quando: e.quando, autor: e.autor,
        taskId: e.taskId, titulo: e.titulo, detalhe: e.detalhe,
      });
    });
  }
  eventos.sort((a, b) => b.quando - a.quando);
  beeFeedEventos = eventos;
  salvarFeedNoNavegador(eventos);
  renderFeedDaBee();
}

function beeFeedDataLabel(quando) {
  const hoje = new Date();
  const d = new Date(quando);
  const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mesmoDia(d, hoje)) return "Hoje";
  const ontem = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);
  if (mesmoDia(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

function beeFeedHora(quando) {
  return new Date(quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function renderFeedDaBee() {
  const alvo = document.getElementById("beeFeedLista");
  if (!alvo) return;

  // A faixinha de "atualizando" fica POR CIMA do feed que já está na
  // tela — o conteúdo antigo continua visível e legível embaixo dela,
  // em vez de sumir e virar um "Carregando..." numa tela vazia.
  const faixa = beeFeedAtualizando
    ? `<div class="bee-feed-atualizando"><span class="bee-feed-spinner"></span>Buscando o que rolou...</div>`
    : "";

  // Primeira vez de todas (sem nada guardado no navegador): aí sim não
  // tem o que mostrar além do aviso.
  if (beeFeedEventos === null) {
    alvo.innerHTML = beeFeedAtualizando
      ? `<div class="bee-feed-atualizando primeira"><span class="bee-feed-spinner"></span>Buscando o que rolou nas suas tarefas...</div>`
      : `<p class="bee-feed-vazio">Nada pra mostrar agora.</p>`;
    return;
  }
  if (!beeFeedEventos.length) {
    alvo.innerHTML = faixa +
      `<p class="bee-feed-vazio">Nada por aqui ainda — assim que você entregar uma tarefa, subir um arquivo ou alguém mexer numa tarefa sua, aparece nesse feed.</p>`;
    return;
  }

  let ultimoLabel = null;
  const blocos = [faixa];
  beeFeedEventos.forEach(ev => {
    const label = beeFeedDataLabel(ev.quando);
    if (label !== ultimoLabel) {
      blocos.push(`<div class="bee-feed-dia">${label}</div>`);
      ultimoLabel = label;
    }
    blocos.push(beeFeedCardHTML(ev));
  });
  alvo.innerHTML = blocos.join("");

  // O card INTEIRO é clicável (data-abrir-tarefa/data-abrir-pasta só no
  // <article>) — o botãozinho de seta é só visual, clicar nele já
  // aciona o mesmo listener por causa do bubbling. Um listener só por
  // card, nunca dois, senão a tarefa abriria duas vezes.
  alvo.querySelectorAll("[data-abrir-tarefa]").forEach(el => {
    el.addEventListener("click", () => abrirTarefaPorId(Number(el.dataset.abrirTarefa)));
  });
  alvo.querySelectorAll("[data-abrir-pasta]").forEach(el => {
    el.addEventListener("click", () => window.open(el.dataset.abrirPasta, "_blank", "noopener"));
  });
}

const BEE_FEED_PRIORIDADE_ROTULO = { alta: "alta", media: "média", baixa: "baixa" };

/**
 * Cada tipo de evento vira: quem aparece no topo do card, a manchete em
 * caixa alta, uma linha de detalhe opcional, e pra onde o card leva ao
 * ser clicado. O resto do card (avatar, hora, seta) é igual pra todos.
 */
function beeFeedCardHTML(ev) {
  const papelProprio = PAPEL_LOGADO === "coordenador" ? "Coordenador de Design" : "Designer";
  const chip = texto => `<span class="bee-ev-chip">${escaparHTML(texto || "")}</span>`;

  let quem, papel, manchete, detalhe = "", alvo;

  switch (ev.tipo) {
    case "entrega":
      quem = DESIGNER_LOGADO; papel = papelProprio;
      manchete = `VOCÊ ENTREGOU<br>${chip(ev.titulo)}`;
      detalhe = ev.cliente || "";
      alvo = `data-abrir-tarefa="${ev.taskId}"`;
      break;

    case "upload":
      quem = DESIGNER_LOGADO; papel = papelProprio;
      manchete = `VOCÊ SUBIU UM ARQUIVO${ev.cliente ? "<br>" + chip(ev.cliente) : ""}`;
      detalhe = ev.arquivo || "";
      alvo = `data-abrir-pasta="${ev.pastaUrl || "#"}"`;
      break;

    case "comentario":
      quem = ev.autor; papel = "";
      manchete = `${escaparHTML((ev.autor || "").toUpperCase())} COMENTOU EM<br>${chip(ev.titulo)}`;
      detalhe = ev.detalhe || "";
      alvo = ev.taskId ? `data-abrir-tarefa="${ev.taskId}"` : "";
      break;

    case "prioridade":
      quem = ev.autor; papel = "";
      manchete = `${escaparHTML((ev.autor || "").toUpperCase())} MUDOU A PRIORIDADE DE<br>${chip(ev.titulo)}`;
      detalhe = BEE_FEED_PRIORIDADE_ROTULO[ev.detalhe]
        ? `Agora está como ${BEE_FEED_PRIORIDADE_ROTULO[ev.detalhe]}.` : "";
      alvo = ev.taskId ? `data-abrir-tarefa="${ev.taskId}"` : "";
      break;

    case "recebida":
      quem = ev.autor; papel = "";
      manchete = `${escaparHTML((ev.autor || "").toUpperCase())} TE PASSOU<br>${chip(ev.titulo)}`;
      alvo = ev.taskId ? `data-abrir-tarefa="${ev.taskId}"` : "";
      break;

    // Tipo que este front-end ainda não conhece (backend mais novo que a
    // aba aberta): melhor não desenhar nada do que desenhar quebrado.
    default:
      return "";
  }

  const avatar = (typeof avatarHTML === "function") ? avatarHTML(quem, "bee-ev-avatar") : "";
  const tituloBotao = alvo.indexOf("pasta") !== -1 ? "Abrir pasta no Drive" : "Abrir tarefa";

  return `
    <article class="bee-ev-card" ${alvo}>
      ${alvo ? `<button type="button" class="bee-ev-abrir" title="${tituloBotao}">
        <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M8 7h9v9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>` : ""}
      <div class="bee-ev-head">
        ${avatar}
        <div class="bee-ev-quem">
          <div class="bee-ev-nome">${escaparHTML(quem === DESIGNER_LOGADO ? "Você" : (quem || ""))}</div>
          ${papel ? `<div class="bee-ev-papel">${escaparHTML(papel)}</div>` : ""}
        </div>
        <div class="bee-ev-hora">${beeFeedHora(ev.quando)}</div>
      </div>
      <div class="bee-ev-corpo">
        <div class="bee-ev-titulo">${manchete}</div>
        ${detalhe ? `<div class="bee-ev-desc">${escaparHTML(detalhe)}</div>` : ""}
      </div>
    </article>
  `;
}
