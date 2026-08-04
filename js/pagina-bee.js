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
// PRIMEIRA VERSÃO DO FEED — de propósito enxuta: só mostra os dois tipos
// de evento que já têm dado de verdade pronto (sem precisar de nada novo
// no backend), reaproveitando as mesmas buscas de "Minhas horas":
//   - tarefas que você entregou (buscarEntreguesDoDesigner)
//   - arquivos que você subiu no Drive (buscarAtividadesDrive)
// Comentário/prioridade mudada/"Cláudio reorganizou seu dia" ficam de
// fora por enquanto — pedem um registro novo (log) no backend, que ainda
// não existe. Ver conversa de design antes de implementar isso.

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
  const [entregues, atividades] = await Promise.all([
    chamarBackend({ acao: "buscarEntreguesDoDesigner", designer: DESIGNER_LOGADO, limite: 20 }),
    chamarBackend({ acao: "buscarAtividadesDrive", designer: DESIGNER_LOGADO }),
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

  const papel = PAPEL_LOGADO === "coordenador" ? "Coordenador de Design" : "Designer";
  const avatar = (typeof avatarHTML === "function") ? avatarHTML(DESIGNER_LOGADO, "bee-ev-avatar") : "";

  if (beeFeedEventos === null) {
    alvo.innerHTML = `<p class="bee-feed-vazio">Carregando...</p>`;
    return;
  }
  if (!beeFeedEventos.length) {
    alvo.innerHTML = `<p class="bee-feed-vazio">Nada por aqui ainda — assim que você entregar uma tarefa ou subir um arquivo, aparece nesse feed.</p>`;
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
    blocos.push(beeFeedCardHTML(ev, avatar, papel));
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

function beeFeedCardHTML(ev, avatar, papel) {
  const hora = beeFeedHora(ev.quando);

  if (ev.tipo === "entrega") {
    return `
      <article class="bee-ev-card" data-abrir-tarefa="${ev.taskId}">
        <button type="button" class="bee-ev-abrir" title="Abrir tarefa">
          <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M8 7h9v9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="bee-ev-head">
          ${avatar}
          <div class="bee-ev-quem"><div class="bee-ev-nome">Você</div><div class="bee-ev-papel">${escaparHTML(papel)}</div></div>
          <div class="bee-ev-hora">${hora}</div>
        </div>
        <div class="bee-ev-corpo">
          <div class="bee-ev-titulo">VOCÊ ENTREGOU<br><span class="bee-ev-chip">${escaparHTML(ev.titulo)}</span></div>
          ${ev.cliente ? `<div class="bee-ev-desc">${escaparHTML(ev.cliente)}</div>` : ""}
        </div>
      </article>
    `;
  }

  // upload
  return `
    <article class="bee-ev-card" data-abrir-pasta="${ev.pastaUrl || "#"}">
      <button type="button" class="bee-ev-abrir" title="Abrir pasta no Drive">
        <svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M8 7h9v9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="bee-ev-head">
        ${avatar}
        <div class="bee-ev-quem"><div class="bee-ev-nome">Você</div><div class="bee-ev-papel">${escaparHTML(papel)}</div></div>
        <div class="bee-ev-hora">${hora}</div>
      </div>
      <div class="bee-ev-corpo">
        <div class="bee-ev-titulo">VOCÊ SUBIU UM ARQUIVO${ev.cliente ? "<br>" + `<span class="bee-ev-chip">${escaparHTML(ev.cliente)}</span>` : ""}</div>
        <div class="bee-ev-desc">${escaparHTML(ev.arquivo || "")}</div>
      </div>
    </article>
  `;
}
