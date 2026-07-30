const tiposExpandido = new Set();

/**
 * "Tipos de tarefas": visual idêntico ao painel-designers-beeon —
 * agrupa os clientes pelos serviços que cada um presta (campo
 * "servicos", array — um cliente pode aparecer em mais de um grupo).
 */
function buildTiposPage() {
  const grid = document.getElementById("tiposGrid");
  if (!grid) return;

  if (!painelBeeonData) {
    grid.innerHTML = `<div class="placeholder-box"><span>⏳</span><p>Carregando do painel-designers-beeon...</p></div>`;
    return;
  }

  const flat = pdTodosClientesPlano();
  const porServico = {};
  flat.forEach(item => {
    const servicos = (item.c.servicos && item.c.servicos.length) ? item.c.servicos : ["Sem serviço definido"];
    servicos.forEach(servico => {
      if (!porServico[servico]) porServico[servico] = [];
      porServico[servico].push(item);
    });
  });

  const nomes = Object.keys(porServico).sort((a, b) => a.localeCompare(b));

  if (nomes.length === 0) {
    grid.innerHTML = `<div class="placeholder-box"><span>🏷️</span><p>Nenhum serviço cadastrado no painel-designers-beeon ainda.</p></div>`;
    return;
  }

  grid.innerHTML = nomes.map(servico => {
    const itens = porServico[servico];
    const merged = pdMesclarPorCliente(itens);
    const totalCriat = itens.reduce((s, i) => s + (i.c.criativos || 0), 0);
    const st = pdEstiloServico(servico);
    const aberto = tiposExpandido.has(servico);
    return `
      <div class="pd-designer-card ${aberto ? "expanded" : ""}" data-tipo="${servico}">
        <div class="pd-dcard-top">
          <div class="pd-avatar-wrap"><div class="pd-avatar" style="background:${st.bg};color:${st.color};">🏷️</div></div>
          <div class="pd-dcard-name">${servico}</div>
          <div class="pd-dcard-top-spacer"></div>
          <div class="pd-designer-stats-row">
            <div class="pd-dstat"><div class="pd-dstat-num">${merged.length}</div><div class="pd-dstat-label">Clientes</div></div>
            <div class="pd-dstat"><div class="pd-dstat-num">${totalCriat}</div><div class="pd-dstat-label">Criativos</div></div>
          </div>
        </div>
        <div class="pd-clients-inner">
          ${merged.map(g => pdClientCardHTML(g)).join("")}
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".pd-dcard-top").forEach(top => {
    top.addEventListener("click", () => {
      const nome = top.closest(".pd-designer-card").dataset.tipo;
      if (tiposExpandido.has(nome)) tiposExpandido.delete(nome);
      else tiposExpandido.add(nome);
      buildTiposPage();
    });
  });
}

/**
 * "Runrun completo": mostra TODAS as etapas de verdade do Runrun.it
 * (não só as 5 do Kanban principal — Cards Mães fica de fora, igual o
 * resto do Colmeia já faz), com todas as tarefas em aberto de quem for
 * escolhido no seletor (ou do time inteiro, no "Todos juntos"). Usa
 * tasksTodas (a lista crua, sem o filtro de coluna do Kanban
 * principal) em vez de tasks.
 */
// Abas extras da página Runrun completo (Card mãe / Entregues), buscadas
// à parte pra não pesar o polling normal do quadro (ver
// carregarExtrasRunrunCompletoSeNecessario). null enquanto não carregou
// ainda nessa sessão.
let extrasRunrunCompleto = null;
let carregandoExtrasRunrunCompleto = false;

async function carregarExtrasRunrunCompletoSeNecessario() {
  const CINCO_MIN_MS = 5 * 60 * 1000;
  if (extrasRunrunCompleto && (Date.now() - extrasRunrunCompleto.quando) < CINCO_MIN_MS) return;
  if (carregandoExtrasRunrunCompleto) return;
  carregandoExtrasRunrunCompleto = true;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarExtrasRunrunCompleto" }),
    });
    const data = await res.json();
    if (data.ok) {
      extrasRunrunCompleto = {
        cardMae: data.cardMae.map(mapearTarefaDoBackend),
        entregues: data.entregues.map(mapearTarefaDoBackend),
        quando: Date.now(),
      };
      if (!document.getElementById("page-runrun").hidden) buildRunrunCompletoPage();
    }
  } catch (err) {
    console.error("Falha ao buscar card mãe/entregues do Runrun completo:", err);
  } finally {
    carregandoExtrasRunrunCompleto = false;
  }
}

// Ordem das abas da página Runrun completo, arrastada pelo próprio
// designer — fica salva no navegador dele (cada um usa seu próprio
// computador/login, então localStorage já basta, sem precisar do backend).
const CHAVE_ORDEM_ABAS_RUNRUN_COMPLETO = "colmeia_ordemAbasRunrunCompleto_v1";

function ordenarColunasRunrunCompletoPelaPreferencia(colunas) {
  let ordemSalva = [];
  try { ordemSalva = JSON.parse(localStorage.getItem(CHAVE_ORDEM_ABAS_RUNRUN_COMPLETO) || "[]"); } catch (e) { /* ignora, usa ordem padrão */ }
  if (!ordemSalva.length) return colunas;

  const porNome = new Map(colunas.map(c => [c.nome, c]));
  const ordenadas = [];
  ordemSalva.forEach(nome => {
    if (porNome.has(nome)) { ordenadas.push(porNome.get(nome)); porNome.delete(nome); }
  });
  // Abas novas que não estavam na ordem salva (ex: uma etapa nova no
  // Runrun.it) entram no fim, na ordem padrão.
  colunas.forEach(c => { if (porNome.has(c.nome)) ordenadas.push(c); });
  return ordenadas;
}

// Permite arrastar o cabeçalho de uma aba pra cima do de outra pra trocá-las
// de lugar, salvando a nova ordem no localStorage.
function wireDragDasAbasRunrunCompleto(board, colunas) {
  let nomeArrastando = null;
  board.querySelectorAll(".column-header[data-col-nome]").forEach(header => {
    header.addEventListener("dragstart", () => { nomeArrastando = header.dataset.colNome; });
    header.addEventListener("dragover", e => {
      e.preventDefault();
      header.closest(".column").classList.add("column-drag-over");
    });
    header.addEventListener("dragleave", () => {
      header.closest(".column").classList.remove("column-drag-over");
    });
    header.addEventListener("drop", e => {
      e.preventDefault();
      header.closest(".column").classList.remove("column-drag-over");
      const nomeAlvo = header.dataset.colNome;
      if (!nomeArrastando || nomeArrastando === nomeAlvo) return;

      const nomes = colunas.map(c => c.nome);
      const de = nomes.indexOf(nomeArrastando);
      const para = nomes.indexOf(nomeAlvo);
      if (de === -1 || para === -1) return;
      nomes.splice(para, 0, nomes.splice(de, 1)[0]);

      try { localStorage.setItem(CHAVE_ORDEM_ABAS_RUNRUN_COMPLETO, JSON.stringify(nomes)); } catch (e) { /* ignora */ }
      buildRunrunCompletoPage();
    });
  });
}

// Ordena do mais antigo pro mais novo (data de criação da tarefa no
// Runrun.it) — tarefas sem essa data ficam no fim, por não ter como saber.
function ordenarPorCriacaoAscendente(lista) {
  return lista.slice().sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
    return ta - tb;
  });
}

function buildRunrunCompletoPage() {
  const board = document.getElementById("runrunBoard");
  if (!board) return;

  if (carregandoTarefas) {
    board.innerHTML = `<div class="placeholder-box"><span>⏳</span><p>Carregando tarefas do Runrun.it...</p></div>`;
    return;
  }

  carregarExtrasRunrunCompletoSeNecessario();

  const designerAlvo = (PAPEL_LOGADO === "coordenador" && filtroDesignerCoordenador !== "todos")
    ? (filtroDesignerCoordenador === "eu" ? DESIGNER_LOGADO : filtroDesignerCoordenador)
    : (PAPEL_LOGADO === "coordenador" ? null : DESIGNER_LOGADO); // null = "Todos juntos"

  const alvoBusca = searchQuery ? normalizarParaComparar(searchQuery) : "";
  const pertenceAoDesigner = t => t.id && (!designerAlvo || nomesCorrespondem(t.assignee, designerAlvo))
    && (!alvoBusca || normalizarParaComparar(t.title).includes(alvoBusca) || normalizarParaComparar(t.client).includes(alvoBusca));
  const lista = tasksTodas.filter(pertenceAoDesigner);

  if (lista.length === 0 && !extrasRunrunCompleto) {
    board.innerHTML = `<div class="placeholder-box"><span>📋</span><p>Nenhuma tarefa em aberto encontrada.</p></div>`;
    return;
  }

  const porEtapa = {};
  lista.forEach(t => {
    const etapa = t.runrunStage || "Sem etapa";
    if (!porEtapa[etapa]) porEtapa[etapa] = [];
    porEtapa[etapa].push(t);
  });
  const etapas = Object.keys(porEtapa).sort((a, b) => porEtapa[b].length - porEtapa[a].length);

  // "Card mãe" e "Entregues" são abas extras (buscadas à parte) — só
  // aparecem depois que essa busca terminar, e só se tiverem tarefa.
  const colunasExtras = [];
  if (extrasRunrunCompleto) {
    const cardMae = extrasRunrunCompleto.cardMae.filter(pertenceAoDesigner);
    const entregues = extrasRunrunCompleto.entregues.filter(pertenceAoDesigner);
    if (cardMae.length) colunasExtras.push({ nome: "Card mãe", tarefas: cardMae });
    if (entregues.length) colunasExtras.push({ nome: "Entregues", tarefas: entregues });
  } else if (carregandoExtrasRunrunCompleto) {
    // Ainda buscando Card mãe/Entregues no backend — mostra uma coluna
    // avisando que está carregando, em vez de deixar a pessoa achando
    // que essas abas simplesmente não existem.
    colunasExtras.push({ nome: "Card mãe / Entregues", tarefas: [], carregando: true });
  }

  let colunas = etapas.map(etapa => ({ nome: etapa, tarefas: porEtapa[etapa] })).concat(colunasExtras);
  colunas = ordenarColunasRunrunCompletoPelaPreferencia(colunas);

  board.innerHTML = colunas.map(col => {
    // Não tem uma "chave de coluna" fixa aqui (são as etapas de verdade
    // do Runrun.it, uma pra cada nome real) — pega o taskStateId de
    // qualquer tarefa que já esteja nessa coluna como alvo de quem for
    // largado nela. Sem tarefa nenhuma ali (coluna vazia) não dá pra
    // saber o alvo, então essa coluna não aceita soltar.
    const taskStateIdAlvo = (col.tarefas.find(t => t.taskStateId) || {}).taskStateId || "";
    return `
    <div class="column">
      <div class="column-header" draggable="${col.carregando ? "false" : "true"}" data-col-nome="${escaparHTML(col.nome)}">
        <span class="column-hex" style="color:var(--accent);">${hexIcon}</span>
        <h2>${col.nome}</h2>
        ${col.carregando ? `<span class="rule-row-spinner"></span>` : `<span class="column-count">${col.tarefas.length}</span>`}
      </div>
      <div class="column-cards" data-task-state-id="${taskStateIdAlvo}" data-col-nome="${escaparHTML(col.nome)}">${col.carregando
        ? `<p class="workflow-seq-empty" style="padding:24px;">Carregando...</p>`
        : ordenarPorCriacaoAscendente(col.tarefas).map(t => runrunCompletoCardHTML(t)).join("")}</div>
    </div>
  `;
  }).join("");

  wireDragDasAbasRunrunCompleto(board, colunas);

  const todasAsTarefas = lista.concat(colunasExtras.flatMap(c => c.tarefas));
  wireDragDosCardsRunrunCompleto(board, todasAsTarefas);
  board.querySelectorAll(".rc-card").forEach(el => {
    el.addEventListener("click", () => {
      const t = todasAsTarefas.find(x => String(x.id) === el.dataset.id);
      if (t) abrirTarefaPorId(t.id);
    });
  });
}

// Arrastar um card pra outra coluna move a tarefa pra etapa de verdade
// do Runrun.it — igual o Kanban principal já faz, mas aqui a "coluna"
// é uma etapa real (não uma das 5 fixas), então o alvo é o taskStateId
// de outra tarefa que já esteja lá (ver data-task-state-id acima).
function wireDragDosCardsRunrunCompleto(board, todasAsTarefas) {
  board.querySelectorAll(".rc-card").forEach(card => {
    card.addEventListener("dragstart", e => {
      e.stopPropagation(); // não deixa o drag do card também iniciar o drag da aba (dragstart do column-header ancestral)
      e.dataTransfer.setData("text/plain", card.dataset.id);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });

  board.querySelectorAll(".column-cards").forEach(holder => {
    const taskStateIdAlvo = holder.dataset.taskStateId;
    if (!taskStateIdAlvo) return; // coluna vazia ou sem etapa conhecida — não aceita soltar
    const nomeColunaAlvo = holder.dataset.colNome;
    holder.addEventListener("dragover", e => {
      e.preventDefault();
      e.stopPropagation();
      holder.classList.add("drag-over");
    });
    holder.addEventListener("dragleave", () => holder.classList.remove("drag-over"));
    holder.addEventListener("drop", async e => {
      e.preventDefault();
      e.stopPropagation();
      holder.classList.remove("drag-over");
      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;
      const t = todasAsTarefas.find(x => String(x.id) === taskId);
      if (!t || t.taskStateId === taskStateIdAlvo) return;
      const stageIdAntigo = t.taskStateId;
      const runrunStageAntigo = t.runrunStage;
      t.taskStateId = taskStateIdAlvo;
      t.runrunStage = nomeColunaAlvo; // é o que agrupa os cards nas colunas (buildRunrunCompletoPage)
      buildRunrunCompletoPage(); // otimista — já move o card na hora
      const ok = await moverEtapaArbitrariaNoBackend(taskId, taskStateIdAlvo);
      if (ok) {
        agendarAtualizacaoKanban();
      } else {
        t.taskStateId = stageIdAntigo; // Runrun.it recusou — volta pro estado real
        t.runrunStage = runrunStageAntigo;
        buildRunrunCompletoPage();
        mostrarToast("Não consegui mover essa tarefa de etapa agora.", "erro");
      }
    });
  });
}

function runrunCompletoCardHTML(t) {
  const type = typeLabels[t.type] || { label: t.type, class: "" };
  const atrasada = t.dueISO && t.dueISO < hojeISO();
  return `
    <div class="task-card rc-card" draggable="true" data-id="${t.id}" data-task-state-id="${t.taskStateId || ""}">
      <div class="card-top">
        <span class="badge ${type.class}">${type.label}</span>
      </div>
      <div class="card-title">${escaparHTML(t.title)}</div>
      <div class="card-client">${escaparHTML(t.client)}</div>
      <div class="card-bottom">
        ${avatarHTML(t.assignee, "avatar-sm", t.assigneeAvatarUrl)}
        ${t.due ? `<span class="card-due-simple ${atrasada ? "overdue" : ""}">${dueIcon}${t.due}</span>` : ""}
      </div>
    </div>
  `;
}

// ================= FILA DE REPASSE =================
// Tarefas que estão, agora, com você (Cláudio) — ou seja, ainda não
// foram passadas pro designer. Duas situações diferentes, por isso os
// 3 modos de visualização da aba:
// - "Com sequência pronta": já tem uma Sequência de responsáveis
//   configurada, só falta avançar de verdade.
// - "Sem sequência": ninguém configurou nada, e a tarefa ficou "presa"
//   com você — precisa de alguém decidindo na hora pra quem vai
//   (repassar pro designer, ou você mesmo assume).
//
// IMPORTANTE: o responsável (você) pode estar em QUALQUER coluna — a
// maioria chega em "Pendentes", mas o atendimento às vezes erra e
// acaba te deixando em "Prioridades" ou até "Revisão". Por isso a
// checagem NÃO olha a coluna, só o responsável atual. (Uma versão
// anterior exigia que a tarefa estivesse fora das 5 colunas normais do
// quadro — isso ficou errado assim que vi que a maioria cai dentro de
// "Pendentes" mesmo, então foi removido.)
