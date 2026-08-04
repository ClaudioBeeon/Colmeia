const tasksFake = [
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

tasksFake.forEach(t => {
  const now = new Date();
  t.dueISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
});
tasksFake.forEach((t, i) => { t.timerSeconds = 0; t.running = false; t.estimatePct = [12, 35, 48, 60, 20, 75, 30, 55, 18, 42, 65, 25, 50][i % 13]; });

// Começa vazio de propósito — mostra tela de carregando até o backend
// responder (ou, em último caso, cair pros dados fake).
let tasks = [];
// Igual a `tasks`, mas SEM o filtro de "só as 5 etapas do quadro" —
// inclui tarefas que estão em qualquer outra etapa do Runrun.it (ex:
// uma etapa de atendimento/briefing antes de chegar no designer).
// Usada pela Fila de Repasse, que precisa enxergar essas tarefas mesmo
// sem elas aparecerem no Kanban normal.
let tasksTodas = [];
let carregandoTarefas = true;

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
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  if (h > 0) return `${h}:${m}:${s}`;
  return `${m}:${s}`;
}

function cardHTML(task, idx) {
  const type = typeLabels[task.type];
  const atrasada = task.dueISO && task.dueISO < hojeISO();
  // Card de alteração ganha etiqueta própria e o nome da peça que ele está
  // pedindo pra mudar — antes ele era visualmente igual a qualquer outro e
  // só dizia "Alteração 01", então não dava pra saber de que peça se trata
  // sem abrir. O nome sai de graça das tarefas já carregadas (ver
  // nomeDaPecaOriginalRapido, js/detalhe-modal.js).
  const ehAlteracao = ehTarefaDeAlteracao(task);
  const pecaOriginal = ehAlteracao ? nomeDaPecaOriginalRapido(task) : null;
  return `
    <div class="task-card priority-${task.priority} ${atrasada ? "task-overdue" : ""} ${ehAlteracao ? "task-alteracao" : ""}" draggable="true" data-idx="${idx}">
      <div class="card-top">
        <span class="badge ${type.class}">${type.label}</span>
        ${ehAlteracao ? `<span class="badge badge-alteracao">Alteração</span>` : ""}
        <div class="priority-wrap" data-idx="${idx}">
          <button type="button" class="card-priority-tag priority-btn">${priorityLabels[task.priority]}</button>
          <div class="priority-menu">
            <button type="button" data-p="alta" class="pm-alta">Alta</button>
            <button type="button" data-p="media" class="pm-media">Média</button>
            <button type="button" data-p="baixa" class="pm-baixa">Baixa</button>
          </div>
        </div>
      </div>
      <div class="card-title">${escaparHTML(task.title)}</div>
      ${pecaOriginal ? `<div class="card-alteracao-de" title="Essa alteração é da peça: ${escaparHTML(pecaOriginal)}">↳ ${escaparHTML(pecaOriginal)}</div>` : ""}
      <div class="card-client">${escaparHTML(task.client)}</div>
      <div class="card-progress">
        <div class="progress-head">
          <button type="button" class="play-btn" data-idx="${idx}" aria-label="${task.running ? "Pausar" : "Iniciar"} tarefa">${task.running ? pauseIcon : playIcon}</button>
          <span class="timer-text" data-idx="${idx}">${formatTime(task.timerSeconds)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" data-idx="${idx}" style="width:${task.estimatePct}%"></div></div>
      </div>
      <div class="card-bottom">
        <div class="assignee-wrap" data-idx="${idx}">
          ${avatarHTML(task.assignee, "avatar-sm", task.assigneeAvatarUrl)}
          ${task.assigneeEmFocoAte && task.assigneeEmFocoAte > Date.now() ? `
            <span class="assignee-foco-badge" title="${escaparHTML(task.assignee)} está em modo foco até ${new Date(task.assigneeEmFocoAte).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}">🧠</span>
          ` : ""}
          <div class="assignee-menu"></div>
        </div>
        <div class="card-due-wrap" data-idx="${idx}">
          <button type="button" class="card-due-simple ${atrasada ? "overdue" : ""}">${dueIcon}${task.due}</button>
        </div>
      </div>
    </div>
  `;
}

const iconEntrega = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const iconHoje = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const hexIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.3l8.5 4.9v9.6L12 21.7l-8.5-4.9V7.2L12 2.3z"/></svg>`;

function buildBoard() {
  boardEl.innerHTML = "";

  if (!carregandoTarefas) {
    clearInterval(intervalMsgCarregando);
  }

  if (carregandoTarefas) {
    boardEl.innerHTML = `
      <div class="board-loading">
        <div class="board-loading-glass"></div>
        <div class="board-loading-content">
          <img src="https://res.cloudinary.com/dzqsqxrkw/image/upload/v1785023382/Icone_if96mt.png" class="board-loading-bee" alt="Colmeia">
          <p class="board-loading-text" id="loadingMsg">${mensagensCarregando[0]}</p>
        </div>
      </div>
    `;
    iniciarMensagensCarregando();
    return;
  }

  columnsDef.forEach(({ key, label, hex }) => {
    const col = document.createElement("div");
    col.className = "column";
    col.dataset.status = key;
    col.innerHTML = `
      <div class="column-header">
        <span class="column-hex" style="color:${hex};">${hexIcon}</span>
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

  // O painel de detalhe é fixed (posicionado pela tela toda, não pelo
  // board), então mora solto no <body> em vez de dentro do board do
  // Kanban. Antes, por estar dentro de #page-kanban, ele sumia junto
  // quando essa página ficava "hidden" (ex: ao clicar num card na Fila
  // de repasse) — daí o pop-up só aparecia depois de navegar de volta
  // pro Kanban. Remove qualquer painel antigo (de um buildBoard()
  // anterior) antes de criar o novo, pra não duplicar o id.
  const panelAntigo = document.getElementById("taskDetail");
  if (panelAntigo) panelAntigo.remove();
  const panel = document.createElement("div");
  panel.className = "task-detail";
  panel.id = "taskDetail";
  document.body.appendChild(panel);

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

let searchQuery = "";

/**
 * Tarefa fixa de "coordenação" (a sua, de acompanhar o time) não fica
 * misturada dentro de "Fazendo" — vira um pill redondo ao lado do
 * título "Quadro de tarefas", com o próprio play/pause.
 *
 * IMPORTANTE — identificação por título: por enquanto essa função
 * reconhece a tarefa pelo TÍTULO conter "coordenação" (sem acento
 * também funciona). Se a sua tarefa de coordenação tem um nome
 * diferente, ou se preferir identificar de outro jeito (por tipo, por
 * tag, por ID fixo), é só me avisar que troco essa regra aqui — é uma
 * única função, fácil de ajustar.
 */
function ehTarefaDeCoordenacao(t) {
  return !!(t.id && ehMinhaTarefa(t) && normalizarParaComparar(t.title).includes("coordenacao"));
}

function encontrarTarefaDeCoordenacao() {
  return tasks.find(ehTarefaDeCoordenacao);
}

function renderCoordenacaoPill() {
  const wrap = document.getElementById("coordenacaoPillWrap");
  if (!wrap) return;
  const t = encontrarTarefaDeCoordenacao();
  if (!t) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = `
    <button type="button" class="coordenacao-pill" id="coordenacaoPillBtn" data-id="${t.id}" title="${escaparHTML(t.title)}">
      <span class="coordenacao-pill-play">${t.running ? pauseIcon : playIcon}</span>
      <span class="coordenacao-pill-label">Coordenação</span>
      <span class="coordenacao-pill-timer">${formatTime(t.timerSeconds)}</span>
    </button>
  `;
  document.getElementById("coordenacaoPillBtn").addEventListener("click", () => {
    // Busca a tarefa VIVA pelo id no momento do clique — nunca usa o `t`
    // capturado quando a pílula foi desenhada. Se atualizarKanbanEmBackground
    // rodou nesse meio-tempo, `t` é um objeto fantasma: mexer no .running
    // dele não aparece em lugar nenhum, e pararOutrasTarefasRodando(t)
    // comparava por referência contra objetos vivos que nunca batiam — o
    // que fazia essa função PAUSAR a própria tarefa de coordenação que
    // acabou de receber o play. Mesmo bug documentado no CLAUDE.md.
    const tarefaViva = (t.id && tasks.find(x => String(x.id) === String(t.id))) || t;
    const vaiComecar = !tarefaViva.running;
    if (vaiComecar) pararOutrasTarefasRodando(tarefaViva);
    tarefaViva.running = vaiComecar;
    // Sem marcar isso, a proteção de 8s (ver atualizarKanbanEmBackground)
    // não valia pra essa pílula: uma atualização automática caindo logo
    // depois do clique trazia running=false do Runrun.it e desfazia o play
    // na tela, mesmo a tarefa já estando rodando de verdade lá.
    tarefaViva._runningToggleEm = Date.now();
    if (tarefaViva.running) tocarTarefaNoBackend(tarefaViva.id, tarefaViva.title);
    else { pausarTarefaNoBackend(tarefaViva.id); marcarUltimaTarefaPausada(tarefaViva.id); }
    render();
    updateNowPlaying();
  });
}

function render() {
  if (carregandoTarefas) return;
  columnsDef.forEach(({ key }) => {
    let list = tasks.filter(t => t.status === key && !ehTarefaDeCoordenacao(t));
    if (PAPEL_LOGADO === "designer") {
      list = list.filter(ehMinhaTarefa);
    } else if (PAPEL_LOGADO === "coordenador" && filtroDesignerCoordenador !== "todos") {
      const alvoNome = filtroDesignerCoordenador === "eu" ? DESIGNER_LOGADO : filtroDesignerCoordenador;
      list = list.filter(t => nomesCorrespondem(t.assignee, alvoNome));
    }
    if (searchQuery) {
      const alvo = normalizarParaComparar(searchQuery);
      // A busca profunda (dentro de comentários/descrição) mora em
      // notificacoes-avisos.js, carregado DEPOIS deste arquivo — daí o
      // typeof-guard, o mesmo padrão já usado pros ganchos do roteador de
      // URL e do modo foco.
      list = list.filter(t =>
        normalizarParaComparar(t.title).includes(alvo) ||
        normalizarParaComparar(t.client).includes(alvo) ||
        (typeof buscaProfundaBate === "function" && buscaProfundaBate(t.id, alvo))
      );
    }
    if (columnMode[key] === "hoje") {
      list = list.filter(t => t.dueISO === hojeISO());
    }
    // Sempre da mais atrasada pra mais na frente, nos dois modos —
    // usa a data completa (ano-mês-dia), não só o número do dia.
    list = list.slice().sort((a, b) => (a.dueISO || "9999-99-99").localeCompare(b.dueISO || "9999-99-99"));
    const holder = document.getElementById("col-" + key);
    holder.innerHTML = list.map(t => cardHTML(t, tasks.indexOf(t))).join("");
    document.querySelector(`.column[data-status="${key}"] .column-count`).textContent = list.length;
  });
  attachCardDragHandlers();
  renderCoordenacaoPill();
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
        const task = tasks[idx];
        const statusAntigo = task.status;
        if (statusAntigo === newStatus) return;
        task.status = newStatus;
        render();
        moverEtapaNoBackend(task.id, newStatus).then(ok => {
          if (!ok) {
            task.status = statusAntigo; // Runrun.it recusou — volta pro estado real
            render();
            // Sem esse aviso, o card só "voltava" sozinho pra coluna antiga
            // e ninguém entendia por quê (parecia bug do Colmeia).
            mostrarToast("Não consegui mover essa tarefa de coluna agora.", "erro");
          } else {
            agendarAtualizacaoKanban();
          }
        });
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
        const task = tasks[idx];
        task.priority = opt.dataset.p;
        salvarPrioridadeNoBackend(task.id, opt.dataset.p);

        // "Alta" também move a tarefa de verdade pra coluna Prioridades
        // no Runrun.it (não só no Colmeia).
        if (opt.dataset.p === "alta" && task.status !== "prioridades") {
          const statusAntigo = task.status;
          task.status = "prioridades";
          render();
          moverEtapaNoBackend(task.id, "prioridades").then(ok => {
            if (!ok) {
              task.status = statusAntigo;
              render();
              mostrarToast("Marquei a prioridade, mas não consegui mover a tarefa pra coluna Prioridades agora.", "erro");
            } else {
              agendarAtualizacaoKanban();
            }
          });
          return;
        }
        render();
      });
    });
  });

  // ===== Data de entrega desejada: clicar abre o calendário próprio do Colmeia =====
  document.querySelectorAll(".card-due-wrap").forEach(wrap => {
    const btn = wrap.querySelector(".card-due-simple");
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const task = tasks[wrap.dataset.idx];
      if (!task) return;

      abrirCalendarioColmeia({
        ancoraEl: btn,
        valorInicial: task.dueISO || "",
        onEscolher: async novaData => {
          if (!novaData || novaData === task.dueISO) return;
          wrap.innerHTML = `<span class="card-due-saving">Salvando...</span>`;
          const ok = await alterarEntregaNoBackend(task.id, novaData);
          if (!ok) {
            render(); // volta a data antiga
            mostrarToast("Não consegui alterar a Entrega Desejada agora.", "erro");
            return;
          }
          const [ano, mes, dia] = novaData.split("-").map(Number);
          task.dueISO = novaData;
          task.due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
          render();
          agendarAtualizacaoKanban();
        },
      });
    });
  });

  // ===== Foto do responsável: avançar sequência ou reatribuir manual =====
  document.querySelectorAll(".assignee-wrap").forEach(wrap => {
    const menu = wrap.querySelector(".assignee-menu");
    wrap.addEventListener("click", async e => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains("open");
      document.querySelectorAll(".assignee-menu").forEach(m => m.classList.remove("open"));
      if (!willOpen) return;
      menu.classList.add("open");

      const idx = wrap.dataset.idx;
      const task = tasks[idx];

      menu.innerHTML = `
        <button type="button" class="assignee-advance-btn" data-idx="${idx}">
          ➡️ <span>Avançar sequência (próximo responsável)</span>
        </button>
        <div class="assignee-menu-sep"></div>
        <div class="assignee-menu-loading">Carregando outras pessoas...</div>
      `;

      menu.querySelector(".assignee-advance-btn").addEventListener("click", async ev => {
        ev.stopPropagation();
        menu.classList.remove("open");
        await pararCronometroAoTransferir(task);
        const resultadoAvanco = await avancarWorkflowNoBackend(task.id);
        if (resultadoAvanco.novoResponsavel) {
          task.assignee = resultadoAvanco.novoResponsavel;
          task.assigneeAvatarUrl = null;
          render();
        }
        if (resultadoAvanco.ok) {
          agendarAtualizacaoKanban();
        } else {
          mostrarToast("Não consegui avançar a sequência dessa tarefa agora.", "erro");
        }
      });

      const usuarios = await buscarUsuariosRunrun();
      if (!menu.classList.contains("open")) return; // fechou enquanto carregava
      const listaContainer = menu.querySelector(".assignee-menu-loading");
      if (!listaContainer) return;
      if (usuarios.length === 0) {
        listaContainer.textContent = "Não consegui buscar a lista.";
        return;
      }
      listaContainer.outerHTML = usuarios.map(u => `
        <button type="button" data-user-id="${u.id}" data-user-nome="${u.nome}">
          ${avatarHTML(u.nome, "avatar-sm", u.foto)} <span>${u.nome}</span>
        </button>
      `).join("");
      menu.querySelectorAll("button:not(.assignee-advance-btn)").forEach(opt => {
        opt.addEventListener("click", async ev => {
          ev.stopPropagation();
          const nomeEscolhido = opt.dataset.userNome;
          menu.classList.remove("open");
          // 3º argumento: só alimenta o feed da aba Bee ("fulano te passou
          // a tarefa X") — ver reatribuirTarefaNoBackend em js/kanban-polling.js.
          const ok = await reatribuirTarefaNoBackend(task.id, opt.dataset.userId, nomeEscolhido);
          if (ok) {
            task.assignee = nomeEscolhido;
            task.assigneeAvatarUrl = null; // deixa a próxima carga real trazer a foto certa
            render();
            agendarAtualizacaoKanban();
          } else {
            mostrarToast("Não consegui reatribuir essa tarefa agora. Tenta de novo em alguns segundos.", "erro");
          }
        });
      });
    });
  });

  // ===== Play / progresso =====
  document.querySelectorAll(".play-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const idx = btn.dataset.idx;
      const task = tasks[idx];
      const vaiComecar = !task.running;
      if (vaiComecar) pararOutrasTarefasRodando(task);
      task.running = vaiComecar;
      task._runningToggleEm = Date.now();
      if (task.running) tocarTarefaNoBackend(task.id, task.title);
      else { pausarTarefaNoBackend(task.id); marcarUltimaTarefaPausada(task.id); }
      render(); // atualiza o ícone dessa tarefa E o da outra que parou junto
      updateNowPlaying();
    });
  });
}

document.addEventListener("click", () => {
  document.querySelectorAll(".priority-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".detail-more-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".status-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".assignee-menu").forEach(m => m.classList.remove("open"));
  const emojiPicker = document.getElementById("emojiPicker");
  if (emojiPicker) emojiPicker.hidden = true;
  const chatDestinoMenu = document.getElementById("chatDestinoMenu");
  if (chatDestinoMenu) chatDestinoMenu.hidden = true;
});

// ===== Nova tarefa (só o coordenador) =====
//
// Segue o padrão de campos do Runrun.it — título, cliente, tipo,
// responsável, prioridade, entrega desejada e descrição, igual quando
// se cria uma tarefa direto por lá. A lista de clientes vem do próprio
// Runrun.it (ação buscarProjetosRunrun) e fica guardada aqui depois da
// primeira busca, pra abrir na hora nas próximas vezes.
let _projetosRunrunCache = null;

async function abrirModalNovaTarefa() {
  const overlay = document.getElementById("novaTarefaModalOverlay");
  if (!overlay) return;

  document.getElementById("novaTarefaTitulo").value = "";
  document.getElementById("novaTarefaTipo").value = "Estático";
  document.getElementById("novaTarefaPrioridade").value = "media";
  document.getElementById("novaTarefaData").value = "";
  document.getElementById("novaTarefaDescricao").value = "";
  const aviso = document.getElementById("novaTarefaAviso");
  aviso.hidden = true;
  aviso.textContent = "";

  const respSelect = document.getElementById("novaTarefaResponsavel");
  preencherResponsaveisNovaTarefa(respSelect);

  overlay.hidden = false;
  document.getElementById("novaTarefaTitulo").focus();

  const clienteSelect = document.getElementById("novaTarefaCliente");
  if (_projetosRunrunCache) {
    preencherClientesNovaTarefa(clienteSelect, _projetosRunrunCache);
    return;
  }
  clienteSelect.innerHTML = `<option value="">Carregando clientes...</option>`;
  const data = await chamarBackend({ acao: "buscarProjetosRunrun" });
  if (!data.ok || !data.projetos) {
    clienteSelect.innerHTML = `<option value="">Não consegui carregar os clientes</option>`;
    return;
  }
  _projetosRunrunCache = data.projetos;
  // Se o modal já foi fechado enquanto isso carregava, não mexe mais na tela.
  if (!overlay.hidden) preencherClientesNovaTarefa(clienteSelect, _projetosRunrunCache);
}

/**
 * Monta a lista de "quem vai trabalhar nessa tarefa" com TODO MUNDO do
 * Runrun.it — atendimento, redação, mídia, não só os 3 designers.
 *
 * Antes essa lista era o DESIGNERS_EQUIPE fixo (Cláudio/Gustavo/Erick) e
 * mandava o NOME pro backend, que só sabia converter esses 3 nomes em id.
 * Agora manda o id direto, que é o que o Runrun.it precisa pra alocar.
 *
 * A lista já vem carregada: o login pede ela em segundo plano (ver
 * iniciarAppPosLogin, js/login-boot.js), então na prática ela aparece
 * pronta. Se ainda não tiver chegado, mostra o aviso e completa sozinha
 * quando chegar — sem travar a abertura do modal.
 */
async function preencherResponsaveisNovaTarefa(select) {
  if (!select) return;

  const marcarPadrao = () => {
    // Deixa quem está logado já escolhido — é quem cria a tarefa na
    // maioria das vezes.
    const meu = [...select.options].find(o =>
      (DESIGNER_ID_LOGADO && String(o.value) === String(DESIGNER_ID_LOGADO)) ||
      nomesCorrespondem(o.textContent, DESIGNER_LOGADO)
    );
    if (meu) select.value = meu.value;
  };

  if (select.dataset.montado === "1") { marcarPadrao(); return; }

  select.innerHTML = `<option value="">Carregando pessoas...</option>`;
  const usuarios = ordenarUsuariosParaRegra(await buscarUsuariosRunrun());
  if (!usuarios.length) {
    select.innerHTML = `<option value="">Não consegui carregar as pessoas</option>`;
    return;
  }
  select.innerHTML = `<option value="">Ninguém por enquanto</option>` +
    usuarios.map(u => `<option value="${u.id}">${escaparHTML(u.nome)}</option>`).join("");
  select.dataset.montado = "1";
  marcarPadrao();
}

/**
 * Monta a lista de projetos agrupada POR CLIENTE.
 *
 * Antes mostrava só o nome do projeto — e no Runrun.it esse nome é o do
 * período/frente ("[AGO2026] PERFORMANCE"), que se repete igualzinho entre
 * clientes diferentes. Na prática dava uma lista de nomes repetidos sem
 * dizer de quem era nenhum. Agora cada cliente vira um grupo (<optgroup>,
 * o cabeçalho cinza que o navegador desenha sozinho) com os projetos dele
 * embaixo, e a ordem é alfabética por cliente.
 */
function preencherClientesNovaTarefa(select, projetos) {
  const porCliente = new Map();
  projetos.forEach(p => {
    const cliente = p.cliente || "Sem cliente";
    if (!porCliente.has(cliente)) porCliente.set(cliente, []);
    porCliente.get(cliente).push(p);
  });

  const clientesOrdenados = [...porCliente.keys()].sort((a, b) => {
    // "Sem cliente" sempre por último, o resto em ordem alfabética.
    if (a === "Sem cliente") return 1;
    if (b === "Sem cliente") return -1;
    return a.localeCompare(b, "pt-BR");
  });

  select.innerHTML = `<option value="">Escolha o cliente e o projeto...</option>` +
    clientesOrdenados.map(cliente => {
      const opcoes = porCliente.get(cliente)
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map(p => `<option value="${p.id}">${escaparHTML(p.nome)}</option>`)
        .join("");
      return `<optgroup label="${escaparHTML(cliente)}">${opcoes}</optgroup>`;
    }).join("");
}

function fecharModalNovaTarefa() {
  const overlay = document.getElementById("novaTarefaModalOverlay");
  if (overlay) overlay.hidden = true;
}

async function criarTarefaViaModal() {
  const titulo = document.getElementById("novaTarefaTitulo").value.trim();
  const projectId = document.getElementById("novaTarefaCliente").value;
  const aviso = document.getElementById("novaTarefaAviso");
  aviso.hidden = true;

  if (!titulo || !projectId) {
    aviso.textContent = "Preencha pelo menos o título e o cliente.";
    aviso.hidden = false;
    return;
  }

  const criarBtn = document.getElementById("novaTarefaCriar");
  criarBtn.disabled = true;
  criarBtn.textContent = "Criando...";

  const dados = {
    titulo,
    projectId,
    tipo: document.getElementById("novaTarefaTipo").value,
    // Agora vai o ID do Runrun.it (a lista virou a de todo mundo, ver
    // preencherResponsaveisNovaTarefa). O nome vai junto só pra aparecer
    // legível no aviso de erro do backend.
    responsavelId: document.getElementById("novaTarefaResponsavel").value || null,
    responsavelNome: document.getElementById("novaTarefaResponsavel").selectedOptions[0]?.textContent || null,
    prioridade: document.getElementById("novaTarefaPrioridade").value,
    desiredDate: document.getElementById("novaTarefaData").value || null,
    descricao: document.getElementById("novaTarefaDescricao").value.trim() || null,
  };

  const data = await chamarBackend({ acao: "criarTarefa", dados });

  criarBtn.disabled = false;
  criarBtn.textContent = "Criar tarefa";

  if (!data.ok) {
    aviso.textContent = data.semRede
      ? "Sem internet agora — tenta de novo em alguns segundos."
      : "O Runrun.it recusou criar a tarefa" + (data.error ? ": " + data.error : ".");
    aviso.hidden = false;
    return;
  }

  fecharModalNovaTarefa();
  agendarAtualizacaoKanban();

  // `alocou: false` = a tarefa foi criada, mas o Runrun.it não aceitou pôr
  // o responsável (ver criarTarefaRunrun, RunrunEscrita.gs). Avisa em vez
  // de deixar a pessoa descobrir depois que a tarefa está sem dono.
  if (data.alocou === false) {
    // O diagnóstico diz o que o Runrun.it respondeu em cada tentativa de
    // alocar (ver alocarResponsavelNaTarefa, RunrunEscrita.gs) — sem ele,
    // "não consegui alocar" não dá nenhuma pista do motivo.
    console.warn("[Colmeia] Alocação falhou:", data.diagnosticoAlocacao || "(sem diagnóstico)");
    mostrarToast("Tarefa criada, mas não consegui alocar o responsável — escolhe direto no card.", "erro");
  } else {
    mostrarToast("Tarefa criada!", "sucesso");
  }

  // Abre a tarefa nova na hora, pra terminar de preencher o que faltar sem
  // ter que caçar ela no quadro. Ela ainda não está em `tasks` (o quadro só
  // vai atualizar daqui a pouco), então abrirTarefaPorId busca ela direto no
  // Runrun.it — é o mesmo caminho já usado pelo "Abrir essa tarefa" da aba
  // Tarefa original.
  if (data.taskId) abrirTarefaPorId(Number(data.taskId));
}

const novaTarefaBtnEl = document.getElementById("novaTarefaBtn");
if (novaTarefaBtnEl) novaTarefaBtnEl.addEventListener("click", abrirModalNovaTarefa);
const novaTarefaModalCloseEl = document.getElementById("novaTarefaModalClose");
if (novaTarefaModalCloseEl) novaTarefaModalCloseEl.addEventListener("click", fecharModalNovaTarefa);
const novaTarefaCancelarEl = document.getElementById("novaTarefaCancelar");
if (novaTarefaCancelarEl) novaTarefaCancelarEl.addEventListener("click", fecharModalNovaTarefa);
const novaTarefaCriarEl = document.getElementById("novaTarefaCriar");
if (novaTarefaCriarEl) novaTarefaCriarEl.addEventListener("click", criarTarefaViaModal);
const novaTarefaModalOverlayEl = document.getElementById("novaTarefaModalOverlay");
if (novaTarefaModalOverlayEl) {
  novaTarefaModalOverlayEl.addEventListener("click", e => {
    if (e.target === novaTarefaModalOverlayEl) fecharModalNovaTarefa();
  });
}

// Links de clientes cadastrados pelo coordenador (Drive, Banco de
// imagens, Biblioteca Adobe, Pasta de publicações + extras avulsos),
// carregados do backend do Colmeia.
