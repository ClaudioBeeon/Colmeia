const pageTitles = {
  kanban: ["Quadro de tarefas", "Time de design · Beeon"],
  clientes: ["Meus clientes", "Clientes atribuídos a você"],
  atendimento: ["Clientes por atendimento", "Agrupados por atendimento responsável"],
  tipos: ["Tipos de tarefas", "Visão por categoria"],
  runrun: ["Runrun completo", "Todas as abas e tarefas do time"],
  hoje: ["Histórico", "O que você fez hoje"],
  repasse: ["Fila de repasse", "Tarefas esperando com o atendimento"],
};

// Nome do designer logado no Colmeia hoje (mesmo usado na barra lateral).
// Troque aqui quando tiver login de verdade — por enquanto é fixo.
// Preenchido de verdade depois do login (ver bloco de login lá embaixo).
// Antes disso fica null — nenhuma tela usa isso até o login acontecer.
let DESIGNER_LOGADO = null;
let PAPEL_LOGADO = null; // 'coordenador' ou 'designer'

// Mesma equipe configurada no backend (RUNRUN_USUARIOS) — usado só pra
// montar as opções do seletor "ver o Kanban de quem" do coordenador.
const DESIGNERS_EQUIPE = ["Cláudio", "Gustavo", "Erick"];
let filtroDesignerCoordenador = "todos"; // "todos" | "eu" | nome de alguém da equipe

// Mesma lógica de normalização usada no painel-designers-beeon: tira
// acento, deixa minúsculo, tira espaço extra. Assim "Claudio" (Colmeia)
// e "Cláudio" (painel-beeon) são reconhecidos como o mesmo nome.
function normalizarParaComparar(s) {
  return (s || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Compara dois nomes de forma flexível: reconhece "Manu" batendo com
 * "Manuela Mendonça" (um é o começo do outro), além de acento e
 * maiúsculas/minúsculas diferentes. Só entra em ação com pelo menos 3
 * letras, pra não dar falso positivo com nomes muito curtos.
 */
function nomesCorrespondem(a, b) {
  const na = normalizarParaComparar(a);
  const nb = normalizarParaComparar(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 3 || nb.length < 3) return false;
  return na.startsWith(nb) || nb.startsWith(na);
}

/**
 * Busca a foto de uma pessoa por nome, aceitando apelido/nome curto
 * (ex: comentário do Runrun.it vem "Manuela Mendonça" mas no painel
 * está só "Manu") — procura tanto nas fotos de designers quanto nas de
 * atendimento.
 */
function buscarFotoPorNomeAproximado(nome) {
  if (painelBeeonData && painelBeeonData.photos) {
    const chave = Object.keys(painelBeeonData.photos).find(d => nomesCorrespondem(d, nome));
    if (chave) return painelBeeonData.photos[chave];
  }
  const chaveAtend = Object.keys(ATENDIMENTO_PHOTOS_BEEON).find(d => nomesCorrespondem(d, nome));
  if (chaveAtend) return ATENDIMENTO_PHOTOS_BEEON[chaveAtend];
  return null;
}

/**
 * Acha a lista de clientes de um designer dentro do state do
 * painel-beeon, comparando o nome sem se importar com acento/maiúsculas
 * (ex: "Claudio" no Colmeia bate com "Cláudio" no painel).
 */
// Copiado exatamente do painel-designers-beeon, pra manter as mesmas
// cores e o mesmo comportamento de "cliente aparece em mais de um
// designer vira um card só, com uma linha por designer dentro".
const PD_SERVICOS_PREDEFINIDOS = [
  { label: "Estático", bg: "#E6F1FB", color: "#185FA5" },
  { label: "Vídeo", bg: "#FAEEDA", color: "#854F0B" },
  { label: "Animação", bg: "#EAF3DE", color: "#3B6D11" },
  { label: "E-mail", bg: "#FBEAF0", color: "#993556" },
  { label: "Story", bg: "#F3EEFB", color: "#6B3FA0" },
  { label: "Reels", bg: "#FEF0F0", color: "#C0392B" },
  { label: "Banner", bg: "#E8F8F5", color: "#1A6B55" },
  { label: "Tráfego", bg: "#FFF3CD", color: "#856404" },
];
const PD_COLOR_PALETTE = [
  { bg: "#E6F1FB", fg: "#185FA5" }, { bg: "#EAF3DE", fg: "#3B6D11" }, { bg: "#FBEAF0", fg: "#993556" },
  { bg: "#F3EEFB", fg: "#6B3FA0" }, { bg: "#FAEEDA", fg: "#854F0B" }, { bg: "#E8F8F5", fg: "#1A6B55" },
  { bg: "#FEF0F0", fg: "#C0392B" }, { bg: "#FFF3CD", fg: "#856404" },
];
function pdHashStr(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return hash;
}
function pdCorPor(nome) {
  return PD_COLOR_PALETTE[Math.abs(pdHashStr(nome)) % PD_COLOR_PALETTE.length];
}
function pdEstiloServico(label) {
  const pre = PD_SERVICOS_PREDEFINIDOS.find(s => s.label.toLowerCase() === label.toLowerCase());
  if (pre) return pre;
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue},55%,92%)`, color: `hsl(${hue},45%,35%)` };
}

/**
 * Junta todos os clientes de todos os designers numa lista só, cada
 * item com {c, designer} — igual ao getAllClientsFlat do painel.
 */
function pdTodosClientesPlano() {
  if (!painelBeeonData || !painelBeeonData.state) return [];
  const lista = [];
  Object.entries(painelBeeonData.state).forEach(([designer, clientes]) => {
    (clientes || []).forEach(c => lista.push({ c, designer }));
  });
  return lista;
}

/**
 * Junta entradas do mesmo cliente (mesmo nome) num grupo só — se o
 * mesmo cliente aparece com designers diferentes, vira um card único
 * com uma linha por designer dentro. Igual ao mergeEntriesByClient do
 * painel.
 */
function pdMesclarPorCliente(items) {
  const mapa = new Map();
  items.forEach(item => {
    const chave = normalizarParaComparar(item.c.cliente);
    if (!mapa.has(chave)) mapa.set(chave, { clienteName: item.c.cliente, entries: [] });
    mapa.get(chave).entries.push(item);
  });
  return [...mapa.values()].sort((a, b) => a.clienteName.localeCompare(b.clienteName));
}

/**
 * Desenha um card de cliente exatamente igual ao do painel-designers-
 * beeon (buildMergedCard, versão só-leitura): ícone com iniciais,
 * nome, atendimento, e uma linha por designer com as tags de serviço.
 */
function pdClientCardHTML(group) {
  const col = pdCorPor(group.clienteName);
  const primeiroAtend = group.entries[0].c.atend || "Sem atendimento";

  const linhasDesigner = group.entries.map(({ c, designer }) => {
    const colDesigner = pdCorPor(designer);
    const fotoDesigner = resolverFotoManual(designer) || fotoDoDesigner(designer);
    const tags = (c.servicos || []).map(label => {
      const st = pdEstiloServico(label);
      return `<span class="pd-tag" style="background:${st.bg};color:${st.color};">${label}</span>`;
    }).join("");
    return `
      <div class="pd-client-designer-row">
        <div class="pd-client-designer-head">
          ${fotoDesigner ? `<img src="${fotoDesigner}" class="pd-client-designer-photo">` : ""}
          <span class="pd-client-designer-badge" style="background:${colDesigner.bg};color:${colDesigner.fg};">🎨 ${designer}</span>
        </div>
        ${tags ? `<div class="pd-client-tags-row">${tags}</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div class="pd-client-card">
      <div class="pd-client-top-row">
        <div class="pd-client-icon" style="background:${col.bg};color:${col.fg};">${initials(group.clienteName)}</div>
        <div class="pd-client-name-wrap">${group.clienteName}</div>
      </div>
      <span class="pd-client-atend">${primeiroAtend}</span>
      ${linhasDesigner}
    </div>
  `;
}

function clientesDoDesignerNoPainel(nomeDesigner) {
  if (!painelBeeonData || !painelBeeonData.state) return [];
  const chave = Object.keys(painelBeeonData.state).find(d => nomesCorrespondem(d, nomeDesigner));
  return chave ? (painelBeeonData.state[chave] || []) : [];
}

// Paleta dos badges de serviço nos cards de "Meus clientes" — cor de
// fundo pastel saturada com texto sempre preto, igual à referência do
// Figma (Card.fig: badge "E-mail" azul #7FA5EA com texto preto).
const MC_CORES_SERVICO = {
  "e-mail": "#7FA5EA",
  "email": "#7FA5EA",
  "estatico": "#FFD666",
  "vídeo": "#C9BFF5",
  "video": "#C9BFF5",
  "animação": "#A8E6B0",
  "animacao": "#A8E6B0",
  "story": "#F5A9C9",
  "reels": "#F5A2A2",
  "banner": "#8FE0D0",
  "tráfego": "#FFD666",
  "trafego": "#FFD666",
};
function mcCorServico(label) {
  const chave = normalizarParaComparar(label || "");
  if (MC_CORES_SERVICO[chave]) return MC_CORES_SERVICO[chave];
  let hash = 0;
  for (let i = 0; i < chave.length; i++) hash = chave.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 75%)`;
}

// Deixa o nome do cliente com só a inicial de cada palavra maiúscula
// (o painel-designers-beeon às vezes guarda em CAIXA ALTA) — só na
// exibição, não mexe no dado original usado pra busca/comparação.
function formatarNomeExibicao(nome) {
  return (nome || "").toLowerCase().replace(/(^|\s|-)\S/g, c => c.toUpperCase());
}

/**
 * Card de cliente da aba "Meus clientes" — visual fiel ao Card.fig que
 * o Cláudio mandou: badge do serviço em cima, nome, descrição (campo
 * livre cadastrado em Links de clientes), barra de progresso das
 * entregas do mês (degradê amarelo → laranja) e o atendimento
 * responsável embaixo. Clicável: abre o hub do cliente.
 */
function mcClientCardHTML(cliente, designer, servicos, souCoordenador) {
  const servico = (servicos && servicos[0]) || "Cliente";
  const corBadge = mcCorServico(servico);
  const dadosLinks = getLinksDoCliente(cliente);
  const descricao = (dadosLinks && dadosLinks.descricao) ? dadosLinks.descricao : "Sem descrição cadastrada ainda.";
  const atend = getAtendimentoDoCliente(cliente) || "Sem atendimento";
  const fotoAtend = resolverFotoManual(atend) || fotoDoAtendimento(atend);
  const { entregues, total } = getProgressoCliente(designer, cliente);
  const pct = total === 0 ? 100 : Math.round((entregues / total) * 100);
  const labelBarra = total === 0 ? "Sem tarefas neste mês" : "Tarefas entregues";

  return `
    <div class="mc-card" data-cliente="${cliente}" data-designer="${designer}">
      ${souCoordenador ? `
        <button type="button" class="mc-ocultar-btn" title="Ocultar esse cliente da lista de ${designer} (só no Colmeia)" aria-label="Ocultar cliente">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      ` : ""}
      <span class="mc-badge" style="background:${corBadge};">${servico}</span>
      <div class="mc-title">${formatarNomeExibicao(cliente)}</div>
      <div class="mc-desc">${descricao}</div>
      <div class="mc-progress-head"><span>${labelBarra}</span><span class="mc-pct">${pct}%</span></div>
      <div class="mc-progress-track"><div class="mc-progress-fill" style="width:${pct}%;"></div></div>
      <div class="mc-bottom">
        ${fotoAtend ? `<img src="${fotoAtend}" class="mc-avatar" alt="${atend}">` : `<div class="mc-avatar-fallback"></div>`}
        <div>
          <div class="mc-name">${formatarNomeExibicao(atend)}</div>
          <div class="mc-name-sub">Atendimento responsável</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * "Meus clientes": lista só os clientes do designer logado, vindos de
 * verdade do painel-designers-beeon (state[designer]), com foto quando
 * disponível. Clicar num card abre o hub do cliente (abrirHubDoCliente).
 */
function buildClientsPage() {
  const grid = document.getElementById("clientsGrid");
  if (!grid) return;

  if (!painelBeeonData) {
    grid.innerHTML = `<div class="placeholder-box"><span>⏳</span><p>Carregando clientes do painel-designers-beeon...</p></div>`;
    return;
  }

  // Coordenador pode usar o mesmo seletor "ver o Kanban de quem" pra
  // olhar os clientes de outro designer também.
  const designerAlvo = (PAPEL_LOGADO === "coordenador" && filtroDesignerCoordenador !== "todos")
    ? (filtroDesignerCoordenador === "eu" ? DESIGNER_LOGADO : filtroDesignerCoordenador)
    : DESIGNER_LOGADO;

  const chaveDesigner = Object.keys(painelBeeonData.state).find(d => nomesCorrespondem(d, designerAlvo));
  const todosOsItens = chaveDesigner ? (painelBeeonData.state[chaveDesigner] || []).map(c => ({ c, designer: chaveDesigner })) : [];
  const meusItens = todosOsItens.filter(({ c }) => !clienteEstaOculto(chaveDesigner, c.cliente));

  if (meusItens.length === 0) {
    grid.innerHTML = `<div class="mc-empty placeholder-box"><span>🗂️</span><p>Nenhum cliente encontrado pra ${designerAlvo} no painel-designers-beeon.</p></div>`;
    return;
  }

  const grupos = pdMesclarPorCliente(meusItens);
  const souCoordenador = PAPEL_LOGADO === "coordenador";
  grid.innerHTML = grupos.map(g => mcClientCardHTML(g.clienteName, chaveDesigner, g.entries[0].c.servicos, souCoordenador)).join("");

  grid.querySelectorAll(".mc-card").forEach(card => {
    card.addEventListener("click", () => abrirHubDoCliente(card.dataset.cliente, card.dataset.designer));
  });

  if (souCoordenador) {
    grid.querySelectorAll(".mc-ocultar-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation(); // não abre o hub do cliente ao clicar em ocultar
        const card = btn.closest(".mc-card");
        const cliente = card.dataset.cliente;
        const designer = card.dataset.designer;
        if (!confirm(`Ocultar "${cliente}" da lista de clientes de ${designer}? Isso não mexe nos dados do painel-designers-beeon, só esconde aqui no Colmeia.`)) return;
        btn.disabled = true;
        const ok = await ocultarClienteNoBackend(designer, cliente);
        if (ok) {
          clientesOcultos.push({ designer, cliente });
          buildClientsPage();
        } else {
          btn.disabled = false;
          alert("Não consegui ocultar esse cliente agora. Tenta de novo em alguns segundos.");
        }
      });
    });
  }
}

const clientHubModalOverlay = document.getElementById("clientHubModalOverlay");

/**
 * Abre o pop-up do hub do cliente: links cadastrados, atendimento
 * responsável, e as tarefas em aberto desse cliente com ESSE designer,
 * ordenadas da entrega desejada mais antiga pra mais distante.
 */
function abrirHubDoCliente(cliente, designer) {
  const col = pdCorPor(cliente);
  document.getElementById("chModalIcon").style.background = col.bg;
  document.getElementById("chModalIcon").style.color = col.fg;
  document.getElementById("chModalIcon").textContent = initials(cliente);
  document.getElementById("chModalNome").textContent = formatarNomeExibicao(cliente);

  document.getElementById("chModalHub").innerHTML = renderHubDoClienteHTML(cliente);

  const atend = getAtendimentoDoCliente(cliente) || "Sem atendimento";
  const fotoAtend = resolverFotoManual(atend) || fotoDoAtendimento(atend);
  const atendRow = document.getElementById("chModalAtendRow");
  if (atend === "Sem atendimento") {
    atendRow.hidden = true;
  } else {
    atendRow.hidden = false;
    document.getElementById("chModalAtendFoto").src = fotoAtend || "";
    document.getElementById("chModalAtendNome").textContent = formatarNomeExibicao(atend);
  }

  const tarefasDoCliente = tasks
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => normalizarParaComparar(t.client) === normalizarParaComparar(cliente) && nomesCorrespondem(t.assignee, designer))
    .sort((a, b) => (a.t.dueISO || "9999-99-99").localeCompare(b.t.dueISO || "9999-99-99"));

  const listaEl = document.getElementById("chModalTarefas");
  if (tarefasDoCliente.length === 0) {
    listaEl.innerHTML = `<span class="ch-tarefas-vazio">Nenhuma tarefa em aberto pra esse cliente agora.</span>`;
  } else {
    const hoje = hojeISO();
    listaEl.innerHTML = tarefasDoCliente.map(({ t, idx }) => {
      const atrasada = t.dueISO && t.dueISO < hoje;
      return `
        <div class="ch-tarefa-item" data-idx="${idx}">
          <span class="ch-tarefa-titulo">${t.title}</span>
          <span class="ch-tarefa-due ${atrasada ? "overdue" : ""}">${t.dueISO ? t.due : "Sem data"}</span>
        </div>
      `;
    }).join("");
    listaEl.querySelectorAll(".ch-tarefa-item").forEach(item => {
      item.addEventListener("click", () => abrirTarefaDoHub(item.dataset.idx));
    });
  }

  clientHubModalOverlay.hidden = false;
}

/**
 * Clicou numa tarefa dentro do pop-up do hub: fecha o hub, muda pra
 * aba Kanban (o painel de detalhe da tarefa vive lá dentro) e abre a
 * tarefa de verdade.
 */
function abrirTarefaDoHub(idx) {
  clientHubModalOverlay.hidden = true;
  mostrarPagina("kanban");
  openDetail(idx);
}

document.getElementById("clientHubModalClose").addEventListener("click", () => {
  clientHubModalOverlay.hidden = true;
});
clientHubModalOverlay.addEventListener("click", e => {
  if (e.target === clientHubModalOverlay) clientHubModalOverlay.hidden = true;
});

// Guarda quais grupos de atendimento estão expandidos (mesmo padrão do
// painel-beeon: clica no cabeçalho do grupo pra abrir/fechar a lista).
const atendimentoExpandido = new Set();

/**
 * "Clientes por atendimento": visual idêntico ao painel-designers-beeon
 * — agrupa os clientes de todos os designers pelo atendimento
 * responsável, ordena de A a Z, cada grupo expande/recolhe ao clicar
 * no cabeçalho, e clientes com mais de um designer viram um card só.
 */
function buildAtendimentoPage() {
  const grid = document.getElementById("atendimentoGrid");
  if (!grid) return;

  if (!painelBeeonData) {
    grid.innerHTML = `<div class="placeholder-box"><span>⏳</span><p>Carregando clientes do painel-designers-beeon...</p></div>`;
    return;
  }

  const flat = pdTodosClientesPlano().filter(({ c }) => !!c.atend && normalizarParaComparar(c.atend) !== "sem atendimento");
  const porAtendimento = {};
  flat.forEach(item => {
    const a = item.c.atend;
    if (!porAtendimento[a]) porAtendimento[a] = [];
    porAtendimento[a].push(item);
  });

  const nomes = Object.keys(porAtendimento).sort((a, b) => a.localeCompare(b));

  grid.innerHTML = nomes.map(atend => {
    const itens = porAtendimento[atend];
    const merged = pdMesclarPorCliente(itens);
    const col = pdCorPor(atend);
    const foto = resolverFotoManual(atend) || fotoDoAtendimento(atend);
    const aberto = atendimentoExpandido.has(atend);
    return `
      <div class="pd-designer-card ${aberto ? "expanded" : ""}" data-atend="${atend}">
        <div class="pd-dcard-top">
          <div class="pd-avatar-wrap"><div class="pd-avatar" style="background:${col.bg};color:${col.fg};">${foto ? `<img src="${foto}">` : initials(atend)}</div></div>
          <div class="pd-dcard-name">${atend}</div>
          <div class="pd-dcard-top-spacer"></div>
        </div>
        <div class="pd-clients-inner">
          ${merged.map(g => pdClientCardHTML(g)).join("")}
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".pd-dcard-top").forEach(top => {
    top.addEventListener("click", () => {
      const nome = top.closest(".pd-designer-card").dataset.atend;
      if (atendimentoExpandido.has(nome)) atendimentoExpandido.delete(nome);
      else atendimentoExpandido.add(nome);
      buildAtendimentoPage();
    });
  });
}

/**
 * Página "Histórico": duas seções —
 * 1) as tarefas em que você deu play hoje (log próprio, "Log de Plays"
 *    na planilha, lido via ação buscarTarefasHoje);
 * 2) atividades recentes nas pastas do Drive dos seus clientes
 *    (uploads/arquivos novos em "Publicações > ano > mês").
 * As duas buscas rodam em paralelo e cada uma mostra seu próprio
 * "carregando" — uma pode demorar mais que a outra sem travar a outra.
 */
function buildHistoricoPage() {
  carregarHistoricoPlays(_historicoJanelaAtual);
  carregarAtividadesDrive();
}

// Janela de tempo escolhida no filtro (Hoje/Últimas 48h/Última semana) —
// fica guardada aqui pra sobreviver a um buildHistoricoPage() chamado de
// novo (ex: reabrindo a aba), até a pessoa trocar de novo.
let _historicoJanelaAtual = "hoje";
const HISTORICO_JANELA_LABEL = { hoje: "hoje", "48h": "nas últimas 48h", semana: "na última semana" };

document.querySelectorAll("#hojeListFiltro .historico-filtro-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("active")) return;
    document.querySelectorAll("#hojeListFiltro .historico-filtro-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    _historicoJanelaAtual = btn.dataset.janela;
    carregarHistoricoPlays(_historicoJanelaAtual);
  });
});

async function carregarHistoricoPlays(janela) {
  janela = janela || "hoje";
  const lista = document.getElementById("hojeList");
  if (!lista) return;
  const tituloEl = document.getElementById("hojeListTitulo");
  if (tituloEl) tituloEl.textContent = `O que você deu play ${HISTORICO_JANELA_LABEL[janela] || "hoje"}`;
  lista.innerHTML = `<div class="historico-loading"><span class="rule-row-spinner"></span><p>Carregando...</p></div>`;
  if (!COLMEIA_API_URL || !DESIGNER_LOGADO) {
    lista.innerHTML = `<p class="workflow-seq-empty">Backend não configurado.</p>`;
    return;
  }
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarTarefasHoje", designer: DESIGNER_LOGADO, janela }),
    });
    const data = await res.json();
    if (!data.ok) {
      lista.innerHTML = `<p class="workflow-seq-empty">${data.error || "Não consegui buscar seu histórico."}</p>`;
      return;
    }
    if (data.tarefas.length === 0) {
      lista.innerHTML = `<p class="workflow-seq-empty">Você ainda não deu play em nenhuma tarefa ${HISTORICO_JANELA_LABEL[janela] || "hoje"}.</p>`;
      return;
    }

    // Usa os dados já carregados em tasksTodas quando a tarefa ainda
    // está aberta (mais rápido, sem ida ao Runrun.it) — só busca avulso
    // (buscarTarefaCompletaDoBackend) as que já foram entregues/fechadas
    // e por isso não estão mais nessa lista.
    const detalhes = await Promise.all(data.tarefas.map(async p => {
      const jaCarregada = tasksTodas.find(t => String(t.id) === String(p.taskId));
      if (jaCarregada) return Object.assign({}, jaCarregada, { ultimoPlay: p.ultimoPlay });
      const resultado = await buscarTarefaCompletaDoBackend(p.taskId);
      if (!resultado.ok) return { id: p.taskId, title: p.titulo, client: "", type: "", ultimoPlay: p.ultimoPlay };
      return Object.assign({}, mapearTarefaDoBackend(resultado.tarefa), { ultimoPlay: p.ultimoPlay });
    }));

    lista.innerHTML = detalhes.map(t => historicoCardHTML(t)).join("");
    lista.querySelectorAll(".historico-card").forEach(card => {
      card.addEventListener("click", () => abrirTarefaPorId(card.dataset.id));
    });
    montarCarrosselSetas(lista, document.getElementById("hojeListPrev"), document.getElementById("hojeListNext"));
  } catch (err) {
    console.error("Falha ao buscar histórico de plays de hoje:", err);
    lista.innerHTML = `<p class="workflow-seq-empty">Falha de conexão.</p>`;
  }
}

function historicoCardHTML(t) {
  const type = typeLabels[t.type] || { label: t.type || "Tarefa", class: "" };
  const hora = new Date(Number(t.ultimoPlay)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const etapa = columnsDef.find(c => c.key === t.status)?.label || t.runrunStage || "Sem etapa";
  return `
    <div class="task-card historico-card" data-id="${t.id}">
      <div class="card-top">
        <span class="badge ${type.class}">${type.label}</span>
        <span class="historico-card-hora">${hora}</span>
      </div>
      <div class="card-title">${t.title}</div>
      <div class="card-client">${t.client || "Sem cliente"}</div>
      <div class="card-bottom">
        <div class="assignee-wrap">${avatarClienteHTML(t.client, "avatar-sm")}</div>
        <span class="card-due-simple">${etapa}</span>
      </div>
    </div>
  `;
}

async function carregarAtividadesDrive() {
  const lista = document.getElementById("atividadesList");
  if (!lista) return;
  lista.innerHTML = `<div class="historico-loading"><span class="rule-row-spinner"></span><p>Carregando...</p></div>`;
  if (!COLMEIA_API_URL || !DESIGNER_LOGADO) {
    lista.innerHTML = `<p class="workflow-seq-empty">Backend não configurado.</p>`;
    return;
  }

  try {
    // Filtra por dono do arquivo no Drive (o backend acha o e-mail do
    // designer sozinho) — só mostra a atividade da própria pessoa, não a
    // de todo mundo do time.
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarAtividadesDrive", designer: DESIGNER_LOGADO }),
    });
    const data = await res.json();
    if (!data.ok) {
      lista.innerHTML = `<p class="workflow-seq-empty">${data.error || "Não consegui buscar as atividades do Drive."}</p>`;
      return;
    }
    if (data.atividades.length === 0) {
      lista.innerHTML = `<p class="workflow-seq-empty">Nenhuma atividade recente nas pastas dos seus clientes.</p>`;
      return;
    }
    lista.innerHTML = data.atividades.map(a => atividadeCardHTML(a)).join("");
    montarCarrosselSetas(lista, document.getElementById("atividadesListPrev"), document.getElementById("atividadesListNext"));
  } catch (err) {
    console.error("Falha ao buscar atividades do Drive:", err);
    lista.innerHTML = `<p class="workflow-seq-empty">Falha de conexão.</p>`;
  }
}

function atividadeCardHTML(a) {
  return `
    <a class="task-card atividade-card" href="${a.pastaUrl || "#"}" target="_blank" rel="noopener">
      <div class="card-top">
        <span class="badge">${a.pastaNome || "Pasta"}</span>
      </div>
      <div class="card-title">${a.arquivo}</div>
      <div class="card-client">${a.cliente}</div>
      <div class="card-bottom">
        <div class="assignee-wrap">${avatarClienteHTML(a.cliente, "avatar-sm")}</div>
        <span class="historico-card-hora">${a.breadcrumb || ""}</span>
      </div>
    </a>
  `;
}

// Guarda quais grupos de serviço estão expandidos.
