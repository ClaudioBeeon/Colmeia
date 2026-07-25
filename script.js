// ============================================
// DADOS FAKE — só para visualização do protótipo.
// Nenhuma conexão real com planilha, Drive ou Runrun.it ainda.
// ============================================

const dueIcon = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const discordIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 6.3a15 15 0 00-3.6-1.1l-.2.4a13 13 0 013.1 1.1 12.6 12.6 0 00-11.9 0 13 13 0 013.1-1.1l-.2-.4A15 15 0 005.6 6.3C3.6 9.3 3 12.2 3.2 15a15 15 0 004.4 2.2l.6-1a9.6 9.6 0 01-1.7-.8l.4-.3a11.3 11.3 0 009.8 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1A15 15 0 0020.8 15c.3-3.2-.5-6.1-1.9-8.7zM9.7 13.4c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5zm4.6 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5z"/></svg>`;

const columnsDef = [
  { key: "pendentes", label: "Pendentes" },
  { key: "prioridades", label: "Prioridades" },
  { key: "fazendo", label: "Fazendo" },
  { key: "revisao", label: "Revisão" },
  { key: "ajustes", label: "Ajustes" },
];

// dia 24 = "hoje" na simulação
const HOJE = 24;

// ============================================
// INTEGRAÇÃO REAL — Google Apps Script (Code.gs) + Runrun.it
// ============================================
// Cole aqui a URL do seu Web App do Apps Script depois de publicar o
// Code.gs (Implantar > Nova implantação > Aplicativo da web).
// Enquanto não colar, o Colmeia continua usando os dados fake abaixo.
const COLMEIA_API_URL = "https://script.google.com/macros/s/AKfycbxSKcto3u-463xmhUm2xGUIylkWzYyeU-L-QHEz0bnFPImsl7Vlum5bZJU5vDT-5gOI/exec";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mapearTarefaDoBackend(t) {
  let day = null, due = "—";
  if (t.due) {
    const [ano, mes, dia] = t.due.split("-").map(Number);
    day = dia;
    due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
  }
  return {
    id: t.id,
    title: t.title,
    client: t.client,
    type: t.type,
    priority: t.priority,
    day,
    due,
    status: t.status,
    runrunStage: t.runrunStage,
    isOutraEtapa: t.isOutraEtapa,
    link: t.link,
    assignee: t.assignee,
    timerSeconds: 0,
    running: false,
    estimatePct: Math.min(95, Math.round((t.estimateMinutes || 30) / 2)),
    hasChange: false,
  };
}

async function carregarTarefasReais() {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1) {
    return; // Web App ainda não configurado — mantém os dados fake
  }
  try {
    const res = await fetch(COLMEIA_API_URL + "?tipo=tarefas");
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar tarefas do Colmeia:", data.error);
      return;
    }
    const doKanban = data.tarefas.filter(t => !t.isOutraEtapa).map(mapearTarefaDoBackend);
    tasks = doKanban;
    tasks.forEach(t => { t.estimatePct = t.estimatePct || 0; });
    buildBoard();
    render();
  } catch (err) {
    console.error("Falha ao conectar com o backend do Colmeia:", err);
  }
}

async function salvarPrioridadeNoBackend(taskId, prioridade) {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1 || !taskId) return;
  try {
    await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "definirPrioridade", taskId, prioridade }),
    });
  } catch (err) {
    console.error("Não consegui salvar a prioridade no backend:", err);
  }
}

// Dados fake usados enquanto COLMEIA_API_URL não estiver configurada
// (ver carregarTarefasReais acima) — servem só pra visualização.
let tasks = [
  { title: "Post carrossel — Lançamento coleção inverno", client: "Ateliê Nova", type: "estatico", priority: "media", day: 26, due: "26 Jul", status: "pendentes", assignee: "Claudio" },
  { title: "Vídeo reels — Bastidores da produção", client: "Grão Café", type: "video", priority: "baixa", day: 28, due: "28 Jul", status: "pendentes", assignee: "Bruna" },
  { title: "E-mail marketing — Promoção de aniversário", client: "Vitrine Modas", type: "email", priority: "baixa", day: 30, due: "30 Jul", status: "pendentes", assignee: "Erick" },
  { title: "Stories animados — Enquete de produto", client: "Ateliê Nova", type: "video", priority: "media", day: 29, due: "29 Jul", status: "pendentes", assignee: "Gustavo" },

  { title: "Arte anúncio — Campanha Dia dos Pais", client: "Vitrine Modas", type: "estatico", priority: "alta", day: 24, due: "24 Jul", status: "prioridades", assignee: "Gustavo" },
  { title: "Vídeo institucional — Reels 30s", client: "Loja Ferra", type: "video", priority: "alta", day: 24, due: "24 Jul", status: "prioridades", assignee: "Claudio" },
  { title: "Newsletter semanal", client: "Vitrine Modas", type: "email", priority: "alta", day: 24, due: "24 Jul", status: "prioridades", assignee: "Erick" },

  { title: "Post estático — Dica de uso do produto", client: "Grão Café", type: "estatico", priority: "media", day: 25, due: "25 Jul", status: "fazendo", assignee: "Gustavo" },
  { title: "Sequência de e-mails — Boas-vindas", client: "Loja Ferra", type: "email", priority: "baixa", day: 27, due: "27 Jul", status: "fazendo", assignee: "Claudio" },
  { title: "Stories animados — Enquete", client: "Ateliê Nova", type: "video", priority: "media", day: 24, due: "24 Jul", status: "fazendo", assignee: "Bruna" },
  { title: "Animação logo — Abertura de vídeo", client: "Ateliê Nova", type: "video", priority: "baixa", day: 26, due: "26 Jul", status: "fazendo", assignee: "Bruna" },

  { title: "Banner site — Nova coleção", client: "Loja Ferra", type: "estatico", priority: "baixa", day: 29, due: "29 Jul", status: "revisao", assignee: "Gustavo" },
  { title: "E-mail — Confirmação de pedido (template)", client: "Loja Ferra", type: "email", priority: "baixa", day: 25, due: "25 Jul", status: "revisao", assignee: "Claudio" },
  { title: "Vídeo — Tutorial de produto", client: "Grão Café", type: "video", priority: "media", day: 24, due: "24 Jul", status: "revisao", assignee: "Erick" },

  { title: "Reels — Making of coleção", client: "Loja Ferra", type: "video", priority: "media", day: 24, due: "24 Jul", status: "ajustes", assignee: "Claudio" },
  { title: "E-mail — Pesquisa de satisfação", client: "Vitrine Modas", type: "email", priority: "baixa", day: 22, due: "22 Jul", status: "ajustes", assignee: "Gustavo" },
  { title: "Arte stories — Novidade da semana", client: "Grão Café", type: "estatico", priority: "baixa", day: 22, due: "22 Jul", status: "ajustes", assignee: "Erick" },
];

tasks.forEach((t, i) => { t.timerSeconds = 0; t.running = false; t.estimatePct = [12, 35, 48, 60, 20, 75, 30, 55, 18, 42, 65, 25, 50][i % 13]; t.hasChange = i % 4 === 1; });

const typeLabels = {
  estatico: { label: "Estático", class: "badge-estatico" },
  video: { label: "Vídeo", class: "badge-video" },
  email: { label: "E-mail", class: "badge-email" },
};

const priorityLabels = { alta: "Alta", media: "Média", baixa: "Baixa" };

// modo de visualização por coluna: "entrega" (padrão) ou "hoje"
const columnMode = {};
columnsDef.forEach(c => columnMode[c.key] = "entrega");

const boardEl = document.getElementById("board");

function initials(name) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function cardHTML(task, idx) {
  const type = typeLabels[task.type];
  return `
    <div class="task-card priority-${task.priority}" draggable="true" data-idx="${idx}">
      <div class="card-top">
        <span class="badge ${type.class}">${type.label}</span>
        <div class="priority-wrap" data-idx="${idx}">
          <button type="button" class="card-priority-tag priority-btn">${priorityLabels[task.priority]}</button>
          <div class="priority-menu">
            <button type="button" data-p="alta" class="pm-alta">Alta</button>
            <button type="button" data-p="media" class="pm-media">Média</button>
            <button type="button" data-p="baixa" class="pm-baixa">Baixa</button>
          </div>
        </div>
      </div>
      <div class="card-title">${task.title}</div>
      <div class="card-client">${task.client}</div>
      <div class="card-progress">
        <div class="progress-head">
          <button type="button" class="play-btn" data-idx="${idx}" aria-label="${task.running ? "Pausar" : "Iniciar"} tarefa">${task.running ? pauseIcon : playIcon}</button>
          <span class="timer-text" data-idx="${idx}">${formatTime(task.timerSeconds)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" data-idx="${idx}" style="width:${task.estimatePct}%"></div></div>
      </div>
      <div class="card-bottom">
        <div class="avatar avatar-sm" title="${task.assignee}">${initials(task.assignee)}</div>
        <span class="card-due-simple ${task.day === HOJE ? "overdue" : ""}">${dueIcon}${task.due}</span>
      </div>
    </div>
  `;
}

const iconEntrega = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const iconHoje = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildBoard() {
  boardEl.innerHTML = "";
  columnsDef.forEach(({ key, label }) => {
    const col = document.createElement("div");
    col.className = "column";
    col.dataset.status = key;
    col.innerHTML = `
      <div class="column-header">
        <h2>${label}</h2>
        <div class="column-sort-ic" data-col="${key}">
          <button class="on" data-mode="entrega" title="Ordem de entrega desejada">${iconEntrega}</button>
          <button data-mode="hoje" title="Tarefas de hoje">${iconHoje}</button>
        </div>
        <span class="column-count"></span>
      </div>
      <div class="column-cards" id="col-${key}"></div>
    `;
    boardEl.appendChild(col);
  });

  const panel = document.createElement("div");
  panel.className = "task-detail";
  panel.id = "taskDetail";
  boardEl.appendChild(panel);

  boardEl.querySelectorAll(".column-sort-ic").forEach(group => {
    const key = group.dataset.col;
    group.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll("button").forEach(b => b.classList.remove("on"));
        btn.classList.add("on");
        columnMode[key] = btn.dataset.mode;
        render();
      });
    });
  });

  setupDragAndDrop();
}

function render() {
  columnsDef.forEach(({ key }) => {
    let list = tasks.filter(t => t.status === key);
    if (columnMode[key] === "hoje") {
      list = list.filter(t => t.day === HOJE);
    } else {
      list = list.slice().sort((a, b) => a.day - b.day);
    }
    const holder = document.getElementById("col-" + key);
    holder.innerHTML = list.map(t => cardHTML(t, tasks.indexOf(t))).join("");
    document.querySelector(`.column[data-status="${key}"] .column-count`).textContent = list.length;
  });
  attachCardDragHandlers();
}

function setupDragAndDrop() {
  document.querySelectorAll(".column-cards").forEach(holder => {
    holder.addEventListener("dragover", e => {
      e.preventDefault();
      holder.classList.add("drag-over");
    });
    holder.addEventListener("dragleave", () => holder.classList.remove("drag-over"));
    holder.addEventListener("drop", e => {
      e.preventDefault();
      holder.classList.remove("drag-over");
      const idx = e.dataTransfer.getData("text/plain");
      const newStatus = holder.closest(".column").dataset.status;
      if (idx !== "" && tasks[idx]) {
        tasks[idx].status = newStatus;
        render();
      }
    });
  });
}

function attachCardDragHandlers() {
  document.querySelectorAll(".task-card").forEach(card => {
    card.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", card.dataset.idx);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("click", () => openDetail(card.dataset.idx));
  });

  // ===== Menu de prioridade =====
  document.querySelectorAll(".priority-wrap").forEach(wrap => {
    const btn = wrap.querySelector(".priority-btn");
    const menu = wrap.querySelector(".priority-menu");
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains("open");
      document.querySelectorAll(".priority-menu").forEach(m => m.classList.remove("open"));
      if (willOpen) menu.classList.add("open");
    });
    menu.querySelectorAll("button").forEach(opt => {
      opt.addEventListener("click", e => {
        e.stopPropagation();
        const idx = wrap.dataset.idx;
        tasks[idx].priority = opt.dataset.p;
        salvarPrioridadeNoBackend(tasks[idx].id, opt.dataset.p);
        render();
      });
    });
  });

  // ===== Play / progresso =====
  document.querySelectorAll(".play-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const idx = btn.dataset.idx;
      const task = tasks[idx];
      task.running = !task.running;
      btn.innerHTML = task.running ? pauseIcon : playIcon;
      btn.setAttribute("aria-label", (task.running ? "Pausar" : "Iniciar") + " tarefa");
      updateNowPlaying();
    });
  });
}

document.addEventListener("click", () => {
  document.querySelectorAll(".priority-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".detail-more-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".status-menu").forEach(m => m.classList.remove("open"));
});

const clientHub = [
  { label: "Drive do cliente", cls: "hub-purple" },
  { label: "Banco de imagens", cls: "hub-pink" },
  { label: "Biblioteca Adobe", cls: "hub-blue" },
  { label: "Pasta publicações", cls: "hub-teal" },
  { label: "Site", cls: "hub-orange" },
  { label: "Instagram", cls: "hub-teal" },
];

const attachments = ["Anexo 01", "Anexo 02", "Anexo 03", "Anexo 04"];

let detailIdx = null;
let commentsOpen = false;
let changeOpen = false;
let childrenOpen = false;

function getChildren(parentTask) {
  return tasks.filter(t => !t.isParent && t.client === parentTask.client);
}

function taskDescription(task) {
  return `Produção de conteúdo do tipo ${typeLabels[task.type].label.toLowerCase()} para o cliente ${task.client}. Seguir o briefing combinado com o time de atendimento, manter a identidade visual do cliente e alinhar qualquer dúvida antes da entrega final.`;
}

const formatsByType = {
  estatico: [
    { label: "Feed 1x1", cls: "fb-purple" },
    { label: "Stories 9:16", cls: "fb-pink" },
  ],
  video: [
    { label: "Vídeo Feed 1x1", cls: "fb-blue" },
    { label: "Vídeo Stories 9:16", cls: "fb-teal" },
  ],
  email: [
    { label: "Banner desktop", cls: "fb-orange" },
    { label: "Banner mobile", cls: "fb-purple" },
  ],
};

function priorityVar(p) {
  return p === "alta" ? "danger" : p === "media" ? "warning" : "success";
}

function openDetail(idx) {
  detailIdx = Number(idx);
  commentsOpen = false;
  renderDetail();
  const panel = document.getElementById("taskDetail");
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  const cardEl = document.querySelector(`.task-card[data-idx="${idx}"]`);
  if (cardEl) cardEl.classList.add("selected");
  panel.classList.add("visible");
  requestAnimationFrame(() => panel.classList.add("open"));
}

function renderDetail() {
  const task = tasks[detailIdx];
  const type = typeLabels[task.type];
  const panel = document.getElementById("taskDetail");

  panel.innerHTML = `
    <div class="detail-inner">
      <div class="detail-header">
        <div class="detail-header-left">
          <button type="button" class="play-btn" id="detailPlay" aria-label="${task.running ? "Pausar" : "Iniciar"} tarefa">${task.running ? pauseIcon : playIcon}</button>
          <span class="timer-text" id="detailTimer">${formatTime(task.timerSeconds)}</span>
          <span class="detail-sep">|</span>
          ${!task.isParent ? `
            <button type="button" class="mother-card-btn" id="motherCardBtn" title="Ir para o card mãe">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          ` : `
            <div class="children-btn-wrap">
              <button type="button" class="mother-card-btn" id="childrenBtn" title="Ver subtarefas">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="children-float" id="childrenPanel">
                <div class="children-float-head">Subtarefas</div>
                <div class="children-list">
                  ${getChildren(task).map((c, i) => `
                    <button type="button" class="child-item ${i % 3 === 0 ? "done" : ""}" data-child-idx="${tasks.indexOf(c)}">
                      <div class="avatar avatar-sm child-avatar">${initials(c.assignee)}</div>
                      <span class="child-title">${c.title}</span>
                      ${i % 3 === 0 ? `<svg class="child-check" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
                    </button>
                  `).join("")}
                </div>
              </div>
            </div>
          `}
          <span class="detail-taskname">${task.title}</span>
          <span class="header-priority pv-${task.priority}">${priorityLabels[task.priority]}</span>
        </div>
        <div class="detail-header-right">
          <div class="nav-dots-group">
            <button type="button" class="nav-dot" id="navPrev" aria-label="Tarefa anterior"></button>
            <button type="button" class="nav-arrow" id="navPrevArrow" aria-label="Anterior">
              <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button type="button" class="nav-dot active"></button>
            <button type="button" class="nav-arrow" id="navNextArrow" aria-label="Próxima">
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button type="button" class="nav-dot" id="navNext" aria-label="Próxima tarefa"></button>
          </div>

          <div class="status-wrap">
            <button type="button" class="status-badge" id="statusBadge">${columnsDef.find(c => c.key === task.status)?.label || task.status}</button>
            <div class="status-menu" id="statusMenu">
              ${columnsDef.map(c => `<button type="button" data-status="${c.key}" class="${c.key === task.status ? "active" : ""}">${c.label}</button>`).join("")}
            </div>
          </div>

          <div class="detail-more-wrap">
            <button type="button" class="detail-more" id="detailMore" aria-label="Mais opções">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
            <div class="detail-more-menu" id="detailMoreMenu">
              <button type="button">Ver regra</button>
              <button type="button">Reabrir tarefa</button>
              <button type="button">Ajustar horas</button>
            </div>
          </div>

          <button type="button" class="detail-close" id="detailClose" aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      <div class="detail-body" id="detailBody">
        <div class="detail-pane desc-pane">
          <div class="detail-tabs">
            <button type="button" class="detail-tab" id="tabDesc">Descrição</button>
            <button type="button" class="detail-tab" id="tabComments">Comentários</button>
            ${task.hasChange ? `
              <button type="button" class="detail-tab change-tab" id="tabChange" title="Alteração 01">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>
              </button>
            ` : ""}
          </div>
          <div class="desc-stack">
            <div class="desc-content" id="descContent">
              <div class="ai-format-boxes">
                ${formatsByType[task.type].map(f => `<div class="format-box ${f.cls}">${f.label}</div>`).join("")}
              </div>
            </div>
            ${task.hasChange ? `
              <div class="change-panel" id="changePanel">
                <div class="change-panel-head">
                  <span class="change-dot"></span>
                  <span>Alteração 01</span>
                </div>
                <p class="change-summary">✨ Resumo por IA: cliente pediu pra trocar a cor de fundo pra tons mais claros e ajustar o texto do CTA — pedido feito nos comentários e reforçado na descrição.</p>
              </div>
            ` : ""}
          </div>
        </div>

        <div class="detail-pane comments-pane" id="commentsPane">
          <div class="detail-tabs">
            <button type="button" class="detail-tab active">Comentários</button>
          </div>
          <div class="comments-thread">
            <div class="comment-bubble">
              <div class="comment-avatar"></div>
              <div class="comment-body">
                <div class="comment-author">Atendimento 01</div>
                <div class="comment-text">Texto mensagem lorem ipsiccddddv dsfsdfsdf fdsfvds</div>
              </div>
            </div>
            <div class="comment-bubble mine">
              <div class="comment-body">
                <div class="comment-author">${task.assignee}</div>
                <div class="comment-text">Texto mensagem lorem ipsiccddddv dsfsdfsdf fddvsdv sdvsfvds</div>
              </div>
              <div class="comment-avatar"></div>
            </div>
          </div>
          <div class="comment-input">
            <input type="text" placeholder="Mensagem">
          </div>
        </div>

        <div class="detail-side">
          <div class="side-block">
            <span class="side-label">Entrega desejada</span>
            <div class="side-date">${task.due}</div>
          </div>
          <div class="side-block">
            <span class="side-label">Tipo de tarefa</span>
            <span class="badge ${type.class}">${type.label}</span>
          </div>
          <div class="side-block">
            <span class="side-label">Cliente</span>
            <span class="badge badge-estatico">${task.client}</span>
          </div>
          <div class="side-block">
            <span class="side-label">Hub do cliente</span>
            <div class="hub-grid">
              ${clientHub.map(h => `<a href="#" class="hub-pill ${h.cls}" onclick="return false">${h.label}</a>`).join("")}
            </div>
          </div>
          <div class="side-block">
            <span class="side-label">Atendimento responsável</span>
            <div class="side-person">
              <div class="avatar avatar-sm">${initials(task.assignee)}</div>
              <span>${task.assignee}</span>
            </div>
            <div class="discord-ctas">
              <a href="#" class="discord-cta" onclick="return false">
                <span class="discord-cta-icon">${discordIcon}</span>
                <span>Chamar no Discord</span>
              </a>
              <a href="#" class="discord-cta ghost" onclick="return false">
                <span class="discord-cta-icon">${discordIcon}</span>
                <span>Canal do cliente</span>
              </a>
            </div>
          </div>
          <div class="side-block attach-block">
            <div class="side-label-row">
              <span class="side-label">Anexos</span>
              <button type="button" class="download-all-btn" onclick="return false">Baixar todos</button>
            </div>
            <div class="attach-box">
              <div class="attach-list">
                ${attachments.map(a => `
                  <div class="attach-item">
                    <span>${a}</span>
                    <button type="button" class="attach-toggle" aria-label="Expandir">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("detailClose").addEventListener("click", closeDetail);
  document.getElementById("navPrevArrow").addEventListener("click", () => stepDetail(-1));
  document.getElementById("navNextArrow").addEventListener("click", () => stepDetail(1));

  document.getElementById("detailPlay").addEventListener("click", () => {
    task.running = !task.running;
    renderDetail();
    render();
    applyCommentsState();
    updateNowPlaying();
  });

  // ===== Menu de mais opções (⋮) =====
  const motherBtn = document.getElementById("motherCardBtn");
  if (motherBtn) motherBtn.addEventListener("click", () => goToParent(task));

  const childrenBtn = document.getElementById("childrenBtn");
  if (childrenBtn) {
    childrenBtn.addEventListener("click", () => {
      childrenOpen = !childrenOpen;
      commentsOpen = false;
      changeOpen = false;
      applyCommentsState();
    });
  }

  document.querySelectorAll(".child-item").forEach(item => {
    item.addEventListener("click", () => goToChild(tasks[item.dataset.childIdx]));
  });

  const statusBadge = document.getElementById("statusBadge");
  const statusMenu = document.getElementById("statusMenu");
  statusBadge.addEventListener("click", e => {
    e.stopPropagation();
    statusMenu.classList.toggle("open");
  });
  statusMenu.querySelectorAll("button").forEach(opt => {
    opt.addEventListener("click", e => {
      e.stopPropagation();
      task.status = opt.dataset.status;
      statusMenu.classList.remove("open");
      renderDetail();
      render();
    });
  });

  const moreBtn = document.getElementById("detailMore");
  const moreMenu = document.getElementById("detailMoreMenu");
  moreBtn.addEventListener("click", e => {
    e.stopPropagation();
    moreMenu.classList.toggle("open");
  });

  // ===== Abas Descrição / Comentários / Alteração (sem re-renderizar, com transição) =====
  document.getElementById("tabDesc").addEventListener("click", () => {
    commentsOpen = false;
    changeOpen = false;
    applyCommentsState();
  });
  document.getElementById("tabComments").addEventListener("click", () => {
    commentsOpen = true;
    changeOpen = false;
    applyCommentsState();
  });
  const tabChange = document.getElementById("tabChange");
  if (tabChange) {
    tabChange.addEventListener("click", () => {
      changeOpen = !changeOpen;
      commentsOpen = false;
      applyCommentsState();
    });
  }

  applyCommentsState();
}

function applyCommentsState() {
  const body = document.getElementById("detailBody");
  const tabDesc = document.getElementById("tabDesc");
  const tabComments = document.getElementById("tabComments");
  const tabChange = document.getElementById("tabChange");
  const changePanel = document.getElementById("changePanel");
  const childrenPanel = document.getElementById("childrenPanel");
  if (!body) return;
  body.classList.toggle("split", commentsOpen);
  if (tabDesc) tabDesc.classList.toggle("active", !commentsOpen);
  if (tabComments) {
    tabComments.classList.toggle("active", commentsOpen);
    tabComments.style.display = commentsOpen ? "none" : "";
  }
  if (tabChange) tabChange.classList.toggle("active", changeOpen);
  if (changePanel) changePanel.classList.toggle("open", changeOpen);
  if (childrenPanel) childrenPanel.classList.toggle("open", childrenOpen);
}

function getOrCreateParent(task) {
  const existing = tasks.findIndex(t => t.isParent && t.client === task.client);
  if (existing !== -1) return existing;
  tasks.push({
    title: `Card mãe — ${task.client}`,
    client: task.client,
    type: task.type,
    priority: "media",
    day: task.day,
    due: task.due,
    status: task.status,
    assignee: task.assignee,
    timerSeconds: 0,
    running: false,
    estimatePct: 40,
    hasChange: false,
    isParent: true,
  });
  return tasks.length - 1;
}

function goToParent(task) {
  const panel = document.getElementById("taskDetail");
  const inner = panel.querySelector(".detail-inner");
  if (!inner) return;
  inner.classList.add("panel-exit-up");
  setTimeout(() => {
    detailIdx = getOrCreateParent(task);
    commentsOpen = false;
    changeOpen = false;
    childrenOpen = false;
    renderDetail();
    const newInner = panel.querySelector(".detail-inner");
    newInner.classList.add("panel-enter-below");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => newInner.classList.remove("panel-enter-below"));
    });
    const cardEl2 = document.querySelector(`.task-card[data-idx="${detailIdx}"]`);
    if (cardEl2) {
      document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
      cardEl2.classList.add("selected");
    }
  }, 260);
}

function goToChild(childTask) {
  const panel = document.getElementById("taskDetail");
  const inner = panel.querySelector(".detail-inner");
  if (!inner || !childTask) return;
  inner.classList.add("panel-exit-down");
  setTimeout(() => {
    detailIdx = tasks.indexOf(childTask);
    commentsOpen = false;
    changeOpen = false;
    childrenOpen = false;
    renderDetail();
    const newInner = panel.querySelector(".detail-inner");
    newInner.classList.add("panel-enter-above");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => newInner.classList.remove("panel-enter-above"));
    });
    document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
    const cardEl2 = document.querySelector(`.task-card[data-idx="${detailIdx}"]`);
    if (cardEl2) cardEl2.classList.add("selected");
  }, 260);
}

function stepDetail(dir) {
  const order = tasks.map((t, i) => i).filter(i => tasks[i].status === tasks[detailIdx].status);
  const pos = order.indexOf(detailIdx);
  const next = order[(pos + dir + order.length) % order.length];
  detailIdx = next;
  renderDetail();
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  const cardEl = document.querySelector(`.task-card[data-idx="${detailIdx}"]`);
  if (cardEl) cardEl.classList.add("selected");
}

function closeDetail() {
  const panel = document.getElementById("taskDetail");
  panel.classList.remove("open");
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  setTimeout(() => panel.classList.remove("visible"), 250);
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeDetail();
});

function updateNowPlaying() {
  const el = document.getElementById("nowPlaying");
  if (!el) return;
  const running = tasks.find(t => t.running);
  if (running) {
    el.hidden = false;
    document.getElementById("nowPlayingTitle").textContent = running.title;
    document.getElementById("nowPlayingTime").textContent = formatTime(running.timerSeconds);
  } else {
    el.hidden = true;
  }
}

// avança a barra de progresso e o cronômetro das tarefas em execução
setInterval(() => {
  tasks.forEach((task, idx) => {
    if (task.running) {
      task.timerSeconds++;
      const timerEl = document.querySelector(`.timer-text[data-idx="${idx}"]`);
      if (timerEl) timerEl.textContent = formatTime(task.timerSeconds);
      if (task.estimatePct < 100) {
        task.estimatePct++;
        const fill = document.querySelector(`.progress-fill[data-idx="${idx}"]`);
        if (fill) fill.style.width = task.estimatePct + "%";
      }
    }
  });
  updateNowPlaying();
}, 1000);

// ===== Dark mode =====
document.querySelectorAll("#themeSwitch button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#themeSwitch button").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    if (btn.dataset.mode === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  });
});

const pageTitles = {
  kanban: ["Quadro de tarefas", "Time de design · Beeon"],
  clientes: ["Meus clientes", "Clientes atribuídos a você"],
  atendimento: ["Clientes por atendimento", "Agrupados por atendimento responsável"],
  tipos: ["Tipos de tarefas", "Visão por categoria"],
  runrun: ["Runrun completo", "Todas as abas e tarefas do time"],
  hoje: ["Minhas tarefas de hoje", "O que você deu play hoje"],
};

function buildClientsPage() {
  const grid = document.getElementById("clientsGrid");
  if (!grid) return;
  const mine = tasks.filter(t => !t.isParent && t.assignee === "Claudio");
  const byClient = {};
  mine.forEach(t => {
    if (!byClient[t.client]) byClient[t.client] = [];
    byClient[t.client].push(t);
  });
  grid.innerHTML = Object.entries(byClient).map(([client, list]) => `
    <div class="client-card">
      <div class="client-card-name">${client}</div>
      <div class="client-card-count">${list.length} tarefa${list.length > 1 ? "s" : ""}</div>
      <div class="client-card-badges">
        ${[...new Set(list.map(t => t.type))].map(ty => `<span class="badge ${typeLabels[ty].class}">${typeLabels[ty].label}</span>`).join("")}
      </div>
    </div>
  `).join("");
}

document.querySelectorAll(".nav-ic[data-page]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll(".nav-ic[data-page]").forEach(l => l.classList.remove("active"));
    link.classList.add("active");
    document.querySelectorAll(".app-page").forEach(p => p.hidden = true);
    document.getElementById("page-" + page).hidden = false;
    const [title, subtitle] = pageTitles[page];
    document.querySelector(".page-title").textContent = title;
    document.querySelector(".page-subtitle").textContent = subtitle;
    if (page === "clientes") buildClientsPage();
  });
});

document.getElementById("nowPlaying").addEventListener("click", () => {
  const idx = tasks.findIndex(t => t.running);
  if (idx !== -1) openDetail(idx);
});

buildBoard();
render();
carregarTarefasReais();
