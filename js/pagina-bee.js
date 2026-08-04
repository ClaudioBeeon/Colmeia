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

let beeFeedEventos = null; // null = ainda não buscou

function abrirPaginaBee() {
  renderFeedDaBee();
  if (typeof beeAbrirPainel === "function") beeAbrirPainel();
  carregarFeedDaBee();
}

function fecharPaginaBee() {
  if (typeof beeFecharPainel === "function") beeFecharPainel();
}

async function carregarFeedDaBee() {
  const [entregues, atividades, anotados] = await Promise.all([
    chamarBackend({ acao: "buscarEntreguesDoDesigner", designer: DESIGNER_LOGADO, limite: 20 }),
    chamarBackend({ acao: "buscarAtividadesDrive", designer: DESIGNER_LOGADO }),
    chamarBackend({ acao: "buscarFeedEventos", designer: DESIGNER_LOGADO }),
  ]);

  // Trocou de página enquanto carregava — não teria mais onde desenhar.
  if (document.getElementById("page-bee").hidden) return;

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

  if (beeFeedEventos === null) {
    alvo.innerHTML = `<p class="bee-feed-vazio">Carregando...</p>`;
    return;
  }
  if (!beeFeedEventos.length) {
    alvo.innerHTML = `<p class="bee-feed-vazio">Nada por aqui ainda — assim que você entregar uma tarefa, subir um arquivo ou alguém mexer numa tarefa sua, aparece nesse feed.</p>`;
    return;
  }

  let ultimoLabel = null;
  const blocos = [];
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
