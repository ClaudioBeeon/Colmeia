// ============================================================================
// PAINEL DE DESIGNERS (2026-08-10)
// ============================================================================
//
// A "tela principal" do projeto irmão painel-designers-beeon
// (github.com/ClaudioBeeon/Designers-Beeon), trazida pra dentro do Colmeia
// a pedido do Cláudio: "o Colmeia está mais completo, integrar tudo seria
// interessante". Só coordenador vê — mesma regra da Fila de repasse.
//
// O QUE FICOU DE FORA, e por quê:
// - As páginas "Atendimento"/"Serviço"/"Todos os clientes" do painel
//   original NÃO vieram — o Cláudio confirmou que o Colmeia já cobre isso
//   (Clientes por atendimento, Meus clientes).
// - A EDIÇÃO de tarefa direto no card (arrastar etapa, trocar data numa
//   janelinha flutuante) não veio: clicar numa tarefa aqui abre a tela de
//   detalhe DE VERDADE do Colmeia (abrirTarefaPorId) — mais completa que
//   o editor do painel (tem comentários, Bee, cronômetro...), então trocar
//   por ela é estritamente melhor, não uma perda.
// - Desfazer (Ctrl+Z) e exportar CSV não vieram nesta primeira versão.
//
// O QUE MUDOU DE PROPÓSITO (não é só copiar e colar):
// - "Atrasadas/Hoje/Futuras/Prioridades/Mês" e "Esforço de hoje" NÃO vêm
//   mais de uma varredura própria do Runrun.it, cacheada por um gatilho
//   de 10 em 10 minutos (era ali que morava o bug que o Cláudio relatou:
//   se aquele gatilho parasse de disparar sozinho — o Apps Script derruba
//   gatilho depois de falha repetida, sem avisar visivelmente — o número
//   ficava parado sem erro nenhum aparecer). Aqui, os mesmos números saem
//   de `tasksTodas`, o array que o PRÓPRIO Colmeia já mantém atualizado
//   (poll de ~60s) pra desenhar o quadro — sem cache extra, sem gatilho
//   pra manter vivo, sempre tão fresco quanto o quadro já é.
//
// O DADO (designers, clientes de cada um, criativos, tempo médio, cores,
// home office) continua morando na planilha SEPARADA do painel — só a
// TELA mudou de casa. Ver o comentário grande em PainelDesigners.gs pro
// porquê dessa escolha (é a etapa "rápida" de um plano em fases).
//
// Carregado por último (antes só de login-boot.js): usa função de quase
// todo mundo (tasksTodas, avatarHTML, abrirTarefaPorId, chamarBackend,
// escaparHTML, nomesCorrespondem, hojeISO).
// ============================================================================

// ===== Estado (espelha o formato salvo na planilha do painel) =====
let pnlDesigners = [];
let pnlState = {};        // designer -> [{cliente, escopo, atend, video, email, criativos, tempo, servicos:[]}]
let pnlColors = {};       // designer -> {bg, fg}
let pnlRoles = {};        // designer -> especialidade (texto livre)
let pnlPhotos = {};       // designer -> URL da foto
let pnlHomeOffice = {};   // designer -> quantos já usou (0-6)
let pnlUpdatedAt = 0;

let pnlCarregado = false; // já carregou pelo menos uma vez nesta sessão?
let pnlAberta = false;    // a página está na tela agora?
let pnlPollTimer = null;
let pnlSaveTimer = null;
let pnlSavePending = false;
let pnlEditandoAgora = false; // um campo de texto está focado (não sobrescreve por baixo)

let pnlSortAZ = false;
let pnlExpandidos = new Set();
let pnlBuscaTermo = "";
let pnlAddContexto = null; // {tipo:"designer"} ou {tipo:"cliente", designer}

const PNL_CORES_PALETA = [
  { bg: "#E6F1FB", fg: "#185FA5" }, { bg: "#EAF3DE", fg: "#3B6D11" }, { bg: "#FBEAF0", fg: "#993556" },
  { bg: "#F3EEFB", fg: "#6B3FA0" }, { bg: "#FAEEDA", fg: "#854F0B" }, { bg: "#E8F8F5", fg: "#1A6B55" },
  { bg: "#FEF0F0", fg: "#C0392B" }, { bg: "#FFF3CD", fg: "#856404" },
];

function pnlCorDoDesigner(nome) {
  if (pnlColors[nome]) return pnlColors[nome];
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return PNL_CORES_PALETA[Math.abs(hash) % PNL_CORES_PALETA.length];
}

function pnlFormatTempo(min) {
  if (!min) return "0min";
  if (min < 60) return min + "min";
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ===== Abrir/fechar a página =====

function abrirPainelDesigners() {
  pnlAberta = true;
  if (!pnlCarregado) {
    pnlCarregarEstado(true);
  } else {
    pnlRenderTudo(); // já tinha carregado antes (voltou pra página): desenha na hora
  }
  pnlCarregarAtividade();
  if (!pnlPollTimer) pnlPollTimer = setInterval(pnlPollUmaVez, 8000);
}

function fecharPainelDesigners() {
  pnlAberta = false;
  if (pnlPollTimer) { clearInterval(pnlPollTimer); pnlPollTimer = null; }
}

// ===== Carregar / salvar (a planilha do painel, via PainelDesigners.gs) =====

function pnlAplicarDados(data) {
  if (data.designers) pnlDesigners = data.designers;
  if (data.colors) pnlColors = data.colors;
  if (data.roles) pnlRoles = data.roles;
  if (data.photos) pnlPhotos = data.photos;
  if (data.homeOffice) pnlHomeOffice = data.homeOffice;
  if (data.state) pnlState = data.state;
  pnlDesigners.forEach(d => { if (!pnlState[d]) pnlState[d] = []; });
}

async function pnlCarregarEstado(mostrarCarregando) {
  const grid = document.getElementById("pnlDesigners");
  if (mostrarCarregando && grid) grid.innerHTML = `<div class="pnl-vazio">Carregando o painel...</div>`;

  const data = await chamarBackend({ acao: "painelLerEstado" });
  if (!data || !data.ok) {
    if (grid) grid.innerHTML = `<div class="pnl-vazio">Não consegui abrir o painel agora. ${escaparHTML((data && data.error) || "Tenta de novo em alguns segundos.")}</div>`;
    return;
  }
  if (data.empty || !data.data) {
    pnlCarregado = true;
    if (grid) grid.innerHTML = `<div class="pnl-vazio">O painel ainda não tem nada salvo.</div>`;
    return;
  }
  pnlAplicarDados(data.data);
  pnlUpdatedAt = data.updatedAt || 0;
  pnlCarregado = true;
  pnlRenderTudo();
}

/** Um campo de texto/select tá com foco agora? (não sobrescreve por baixo do dedo). */
function pnlEstaEditando() {
  const el = document.activeElement;
  return !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"));
}

function pnlAgendarSalvar() {
  pnlSavePending = true;
  pnlAtualizarSync("salvando");
  clearTimeout(pnlSaveTimer);
  pnlSaveTimer = setTimeout(pnlSalvarAgora, 900);
}

function pnlBuildPayload() {
  return { designers: pnlDesigners, colors: pnlColors, roles: pnlRoles, photos: pnlPhotos, homeOffice: pnlHomeOffice, state: pnlState };
}

async function pnlSalvarAgora() {
  pnlSavePending = false;
  const data = await chamarBackend({ acao: "painelSalvarEstado", dados: pnlBuildPayload() });
  if (data && data.ok) {
    pnlUpdatedAt = data.updatedAt || Date.now();
    pnlAtualizarSync("ok");
  } else {
    pnlAtualizarSync("erro");
    clearTimeout(pnlSaveTimer);
    pnlSaveTimer = setTimeout(pnlSalvarAgora, 4000); // tenta de novo sozinho
  }
}

function pnlAtualizarSync(estado) {
  const el = document.getElementById("pnlSync");
  if (!el) return;
  el.classList.toggle("erro", estado === "erro");
  el.textContent = estado === "salvando" ? "Salvando..." : estado === "erro" ? "Não consegui salvar — tentando de novo" : "";
}

/** Poll de 8s: só busca de novo o que mudou (outra pessoa editando ao mesmo tempo). */
async function pnlPollUmaVez() {
  if (!pnlAberta || pnlSavePending || pnlEstaEditando()) return;
  const data = await chamarBackend({ acao: "painelLerEstado" });
  if (data && data.ok && !data.empty && data.data && data.updatedAt > pnlUpdatedAt) {
    pnlAplicarDados(data.data);
    pnlUpdatedAt = data.updatedAt;
    pnlRenderTudo();
  }
}

// ===== Runrun.it — tudo calculado em cima de `tasksTodas`, já carregado =====
// Zero busca nova: é o mesmo array que o quadro principal do Colmeia já
// mantém fresco. Ver o comentário grande no topo do arquivo pro porquê
// disso ser, também, o conserto do bug do "esforço de hoje".

function pnlTarefasAbertas() {
  return (typeof tasksTodas !== "undefined" ? tasksTodas : []).filter(t => !t.entregue);
}

function pnlCategoriaDoPrazo(t, hoje) {
  if (!t.due) return null;
  if (t.due < hoje) return "atrasadas";
  if (t.due === hoje) return "hoje";
  return "futuras";
}

/** { atrasadas:[], hoje:[], futuras:[] } — todas as tarefas abertas do time. */
function pnlPorCategoriaDePrazo() {
  const hoje = hojeISO();
  const grupos = { atrasadas: [], hoje: [], futuras: [] };
  pnlTarefasAbertas().forEach(t => {
    const cat = pnlCategoriaDoPrazo(t, hoje);
    if (cat) grupos[cat].push(t);
  });
  Object.values(grupos).forEach(l => l.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")));
  return grupos;
}

/** Tarefas com prioridade do Runrun.it (isUrgent) — qualquer prazo. */
function pnlTarefasPrioridade() {
  return pnlTarefasAbertas().filter(t => t.isUrgent)
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
}

/** Tarefas do mês corrente (por Entrega Desejada) + todas as atrasadas. */
function pnlTarefasDoMes() {
  const hoje = hojeISO();
  const anoMes = hoje.slice(0, 7);
  return pnlTarefasAbertas().filter(t => t.due && (t.due < hoje || t.due.slice(0, 7) === anoMes))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
}

/**
 * Esforço de hoje: tarefas atrasadas ou pra hoje, somando o tempo médio
 * do cliente (já vem pronto em `t.tempoMedioMinutos`, calculado no
 * backend a partir do mesmo cadastro do painel — ver transformarTarefaParaColmeia,
 * RunrunLeitura.gs). Agrupado por quem está com a tarefa no Runrun.it —
 * NÃO pelo designer do painel: são pessoas diferentes (ver o aviso no
 * grupo abaixo).
 */
function pnlEsforcoPorResponsavel() {
  const hoje = hojeISO();
  const porResponsavel = {}; // nome -> {min, tarefas:[]}
  pnlTarefasAbertas().forEach(t => {
    if (!t.due || t.due > hoje) return;
    const nome = t.assignee || "Sem responsável";
    if (!porResponsavel[nome]) porResponsavel[nome] = { min: 0, tarefas: [] };
    porResponsavel[nome].min += t.tempoMedioMinutos || 0;
    porResponsavel[nome].tarefas.push(t);
  });
  Object.values(porResponsavel).forEach(g => g.tarefas.sort((a, b) => (a.due || "").localeCompare(b.due || "")));
  return porResponsavel;
}

/**
 * ⚠️ Os designers do PAINEL (Paulo, Gustavo, Imane, "Sem designer"...) são
 * o time de criação — diferente de quem está LOGADO no Runrun.it
 * (Cláudio, Gustavo, Erick: só quem realmente usa a conta de lá). Os
 * números de "atrasadas/hoje/futuras" e o esforço só aparecem no card de
 * um designer do painel quando o NOME dele bate com um usuário real do
 * Runrun.it (por isso, na prática, só "Gustavo" costuma mostrar algo —
 * mesma limitação que o painel original já tinha, não é regressão daqui).
 */
function pnlTarefasDoDesignerPainel(nomeDesignerPainel) {
  return pnlTarefasAbertas().filter(t => nomesCorrespondem(t.assignee || "", nomeDesignerPainel));
}

// ===== Render =====

function pnlRenderTudo() {
  pnlRenderKPIs();
  pnlRenderDesigners();
  pnlRenderRunrunKPIs();
}

function pnlRenderKPIs() {
  const el = document.getElementById("pnlKpis");
  if (!el) return;

  const nomesClientes = new Set();
  pnlDesigners.forEach(d => (pnlState[d] || []).forEach(c => { if (c.cliente) nomesClientes.add(c.cliente); }));
  const totalClientes = nomesClientes.size;
  const totalCriativos = pnlDesigners.reduce((s, d) => s + (pnlState[d] || []).reduce((s2, c) => s2 + (c.criativos || 0), 0), 0);
  const totalMin = pnlDesigners.reduce((s, d) => s + (pnlState[d] || []).reduce((s2, c) => s2 + ((c.criativos || 0) * (c.tempo || 0)), 0), 0);
  const designersAtivos = pnlDesigners.filter(d => d !== "Sem designer" && (pnlState[d] || []).length).length;

  const esforco = pnlEsforcoPorResponsavel();
  const nomesEsforco = Object.keys(esforco).sort((a, b) => esforco[b].min - esforco[a].min);
  const maiorMin = Math.max(1, ...nomesEsforco.map(n => esforco[n].min));

  el.innerHTML = `
    <div class="pnl-kpi-card">
      <div class="pnl-kpi-label">Total de clientes</div>
      <div class="pnl-kpi-value">${totalClientes}</div>
      <div class="pnl-kpi-sub">${pnlDesigners.length} designers</div>
    </div>
    <div class="pnl-kpi-card">
      <div class="pnl-kpi-label">Criativos no total</div>
      <div class="pnl-kpi-value">${totalCriativos}</div>
      <div class="pnl-kpi-sub">média ${totalClientes ? (totalCriativos / totalClientes).toFixed(1) : 0} por cliente</div>
    </div>
    <div class="pnl-kpi-card">
      <div class="pnl-kpi-label">Horas totais</div>
      <div class="pnl-kpi-value">${escaparHTML(pnlFormatTempo(totalMin))}</div>
      <div class="pnl-kpi-sub">${designersAtivos} designers ativos</div>
    </div>
    <div class="pnl-kpi-card ${nomesEsforco.length ? "clicavel" : ""}" id="pnlKpiEsforco">
      <div class="pnl-kpi-label">Esforço de hoje</div>
      ${nomesEsforco.length ? nomesEsforco.map(n => `
        <div class="pnl-esforco-linha">
          <span class="pnl-esforco-nome">${escaparHTML(n)}</span>
          <span class="pnl-esforco-barra"><i style="width:${Math.round(esforco[n].min / maiorMin * 100)}%" class="${esforco[n].min > 240 ? "alerta" : ""}"></i></span>
          <span class="pnl-esforco-min">${escaparHTML(pnlFormatTempo(esforco[n].min))}</span>
        </div>
      `).join("") : `<div class="pnl-esforco-vazio">Nada atrasado nem pra hoje.</div>`}
    </div>
  `;

  if (nomesEsforco.length) {
    const todasEsforco = [];
    nomesEsforco.forEach(n => esforco[n].tarefas.forEach(t => todasEsforco.push(t)));
    document.getElementById("pnlKpiEsforco")?.addEventListener("click", () => {
      pnlAbrirTarefasModal("Esforço de hoje", { lista: todasEsforco });
    });
  }
}

function pnlRenderDesigners() {
  const grid = document.getElementById("pnlDesigners");
  if (!grid) return;

  const termo = typeof normalizarParaComparar === "function" ? normalizarParaComparar(pnlBuscaTermo) : pnlBuscaTermo.toLowerCase();
  const lista = pnlDesigners.slice();
  if (pnlSortAZ) lista.sort((a, b) => a.localeCompare(b, "pt-BR"));

  grid.innerHTML = lista.map(designer => {
    const clientes = (pnlState[designer] || []).slice();
    if (pnlSortAZ) clientes.sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));

    // Filtro de busca: bate no nome do designer OU de algum cliente dele.
    const bateDesigner = !termo || (typeof normalizarParaComparar === "function" ? normalizarParaComparar(designer) : designer.toLowerCase()).includes(termo);
    const clientesQueBatem = termo
      ? clientes.filter(c => (typeof normalizarParaComparar === "function" ? normalizarParaComparar(c.cliente) : c.cliente.toLowerCase()).includes(termo))
      : clientes;
    const foraDoFiltro = termo && !bateDesigner && !clientesQueBatem.length;
    const clientesMostrados = termo && !bateDesigner ? clientesQueBatem : clientes;
    const expandidoAgora = pnlExpandidos.has(designer) || (termo && clientesQueBatem.length > 0);

    const col = pnlCorDoDesigner(designer);
    const foto = pnlPhotos[designer];
    const avatarInner = foto ? `<img src="${escaparHTML(foto)}" alt="">` : (typeof initials === "function" ? initials(designer) : designer.slice(0, 2).toUpperCase());

    const totalCriativos = clientes.reduce((s, c) => s + (c.criativos || 0), 0);
    const totalMin = clientes.reduce((s, c) => s + ((c.criativos || 0) * (c.tempo || 0)), 0);

    const tarefasDesigner = pnlTarefasDoDesignerPainel(designer);
    const hoje = hojeISO();
    const atrasadas = tarefasDesigner.filter(t => t.due && t.due < hoje);
    const hojeLista = tarefasDesigner.filter(t => t.due === hoje);
    const futuras = tarefasDesigner.filter(t => t.due && t.due > hoje);
    const temRunrun = atrasadas.length + hojeLista.length + futuras.length > 0;

    return `
      <div class="pnl-designer-card ${expandidoAgora ? "expandido" : ""} ${foraDoFiltro ? "pnl-fora-do-filtro" : ""}" data-designer="${escaparHTML(designer)}">
        <div class="pnl-dcard-top" data-pnl-toggle="${escaparHTML(designer)}">
          <div class="pnl-dcard-linha1">
            <div class="pnl-dcard-avatar-wrap">
              <div class="pnl-dcard-avatar" style="background:${col.bg};color:${col.fg}">${avatarInner}</div>
              <button type="button" class="pnl-dcard-foto-btn" data-pnl-foto="${escaparHTML(designer)}" title="Trocar foto">📷</button>
            </div>
            <input type="text" class="pnl-dcard-nome" value="${escaparHTML(designer)}" data-pnl-renomear="${escaparHTML(designer)}">
            ${designer !== "Sem designer" ? `<button type="button" class="pnl-dcard-remover" data-pnl-remover-designer="${escaparHTML(designer)}" title="Remover designer">🗑</button>` : ""}
          </div>
          <div class="pnl-dcard-stats">
            <div class="pnl-dstat"><div class="pnl-dstat-num">${clientes.length}</div><div class="pnl-dstat-label">Clientes</div></div>
            <div class="pnl-dstat"><div class="pnl-dstat-num">${totalCriativos}</div><div class="pnl-dstat-label">Criativos</div></div>
            <div class="pnl-dstat"><div class="pnl-dstat-num">${escaparHTML(pnlFormatTempo(totalMin))}</div><div class="pnl-dstat-label">Tempo</div></div>
          </div>
          ${temRunrun ? `
            <div class="pnl-dcard-runrun pnl-dcard-stats">
              <div class="pnl-dstat clicavel" data-pnl-cat="atrasadas" data-pnl-cat-designer="${escaparHTML(designer)}"><div class="pnl-dstat-num atrasadas">${atrasadas.length}</div><div class="pnl-dstat-label">Atrasadas</div></div>
              <div class="pnl-dstat clicavel" data-pnl-cat="hoje" data-pnl-cat-designer="${escaparHTML(designer)}"><div class="pnl-dstat-num hoje">${hojeLista.length}</div><div class="pnl-dstat-label">Vence hoje</div></div>
              <div class="pnl-dstat clicavel" data-pnl-cat="futuras" data-pnl-cat-designer="${escaparHTML(designer)}"><div class="pnl-dstat-num futuras">${futuras.length}</div><div class="pnl-dstat-label">Futuras</div></div>
            </div>
          ` : ""}
        </div>
        ${designer !== "Sem designer" ? `
          <div class="pnl-ho-row">
            <span class="pnl-ho-label">Home office</span>
            <span class="pnl-ho-bars">
              ${Array.from({ length: 6 }).map((_, i) => `<span class="pnl-ho-bar ${i < (pnlHomeOffice[designer] || 0) ? "preenchida" : ""}" data-pnl-ho="${escaparHTML(designer)}" data-pnl-ho-i="${i}" title="${i + 1}º home office"></span>`).join("")}
            </span>
          </div>
        ` : ""}
        <div class="pnl-clientes-inner">
          <div class="pnl-clientes-lista">
            ${clientesMostrados.map(c => pnlBuildClientCardHTML(c, designer)).join("")}
            <div class="pnl-add-client-mini" data-pnl-add-cliente="${escaparHTML(designer)}">+ Adicionar cliente</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  pnlLigarEventosDaGrade(grid);
}

function pnlBuildClientCardHTML(c, designer) {
  return `
    <div class="pnl-client-card" draggable="true" data-pnl-cliente="${escaparHTML(c.cliente)}" data-pnl-de-designer="${escaparHTML(designer)}">
      <span class="pnl-client-nome">${escaparHTML(c.cliente)}</span>
      ${c.escopo ? `<span class="pnl-client-escopo">${escaparHTML(c.escopo)}</span>` : ""}
      ${c.tempo ? `<span class="pnl-client-tempo">${escaparHTML(pnlFormatTempo(c.tempo))}</span>` : ""}
      <button type="button" class="pnl-client-remover" data-pnl-remover-cliente="${escaparHTML(c.cliente)}" data-pnl-remover-designer="${escaparHTML(designer)}" title="Remover">✕</button>
    </div>
  `;
}

function pnlLigarEventosDaGrade(grid) {
  // Expandir/recolher.
  grid.querySelectorAll("[data-pnl-toggle]").forEach(el => {
    el.addEventListener("click", ev => {
      if (ev.target.closest("input, button")) return;
      const d = el.dataset.pnlToggle;
      if (pnlExpandidos.has(d)) pnlExpandidos.delete(d); else pnlExpandidos.add(d);
      pnlRenderDesigners();
    });
  });

  // Renomear designer.
  grid.querySelectorAll("[data-pnl-renomear]").forEach(input => {
    input.addEventListener("click", ev => ev.stopPropagation());
    input.addEventListener("blur", () => pnlRenomearDesigner(input.dataset.pnlRenomear, input.value.trim()));
    input.addEventListener("keydown", ev => { if (ev.key === "Enter") input.blur(); });
  });

  // Trocar foto.
  grid.querySelectorAll("[data-pnl-foto]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const designer = btn.dataset.pnlFoto;
      const url = prompt(`Cole o link da foto de ${designer} (URL da imagem):`, pnlPhotos[designer] || "");
      if (url === null) return;
      if (url.trim()) pnlPhotos[designer] = url.trim(); else delete pnlPhotos[designer];
      pnlRenderDesigners();
      pnlAgendarSalvar();
    });
  });

  // Remover designer.
  grid.querySelectorAll("[data-pnl-remover-designer]").forEach(btn => {
    // ⚠️ Também casa com o botão de remover CLIENTE (que também carrega
    // data-pnl-remover-designer, pra saber de onde tirar) — só age como
    // "remover designer" quando NÃO tem data-pnl-remover-cliente junto.
    if (btn.dataset.pnlRemoverCliente) return;
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      pnlRemoverDesigner(btn.dataset.pnlRemoverDesigner);
    });
  });

  // Home office.
  grid.querySelectorAll("[data-pnl-ho]").forEach(bar => {
    bar.addEventListener("click", ev => {
      ev.stopPropagation();
      const designer = bar.dataset.pnlHo;
      const i = Number(bar.dataset.pnlHoI);
      const atual = pnlHomeOffice[designer] || 0;
      pnlHomeOffice[designer] = atual === i + 1 ? i : i + 1;
      pnlRenderDesigners();
      pnlAgendarSalvar();
    });
  });

  // Estatísticas de Runrun.it clicáveis -> modal de tarefas.
  grid.querySelectorAll("[data-pnl-cat]").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      const designer = el.dataset.pnlCatDesigner;
      const cat = el.dataset.pnlCat;
      const hoje = hojeISO();
      const todas = pnlTarefasDoDesignerPainel(designer);
      const abas = [
        { chave: "atrasadas", label: "Atrasadas", lista: todas.filter(t => t.due && t.due < hoje) },
        { chave: "hoje", label: "Vence hoje", lista: todas.filter(t => t.due === hoje) },
        { chave: "futuras", label: "Futuras", lista: todas.filter(t => t.due && t.due > hoje) },
      ];
      pnlAbrirTarefasModal(designer, { abas, abaInicial: cat });
    });
  });

  // Cliente: clique abre as tarefas dele; arrastar move de designer.
  grid.querySelectorAll("[data-pnl-cliente]").forEach(card => {
    card.addEventListener("click", ev => {
      if (ev.target.closest("[data-pnl-remover-cliente]")) return;
      const nome = card.dataset.pnlCliente;
      const alvo = typeof normalizarParaComparar === "function" ? normalizarParaComparar(nome) : nome.toLowerCase();
      const tarefas = pnlTarefasAbertas().filter(t => (typeof normalizarParaComparar === "function" ? normalizarParaComparar(t.client || "") : (t.client || "").toLowerCase()) === alvo)
        .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
      pnlAbrirTarefasModal(nome, { lista: tarefas });
    });
    card.addEventListener("dragstart", () => {
      card.classList.add("arrastando");
      card._pnlDrag = { cliente: card.dataset.pnlCliente, deDesigner: card.dataset.pnlDeDesigner };
      window._pnlDragAtual = card._pnlDrag;
    });
    card.addEventListener("dragend", () => card.classList.remove("arrastando"));
  });

  grid.querySelectorAll("[data-pnl-remover-cliente]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      pnlRemoverCliente(btn.dataset.pnlRemoverDesigner, btn.dataset.pnlRemoverCliente);
    });
  });

  grid.querySelectorAll("[data-pnl-add-cliente]").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      pnlAbrirModalCliente(el.dataset.pnlAddCliente);
    });
  });

  // Soltar cliente arrastado num designer diferente.
  grid.querySelectorAll(".pnl-designer-card").forEach(card => {
    card.addEventListener("dragover", ev => { ev.preventDefault(); card.classList.add("arrastando-sobre"); });
    card.addEventListener("dragleave", () => card.classList.remove("arrastando-sobre"));
    card.addEventListener("drop", ev => {
      ev.preventDefault();
      card.classList.remove("arrastando-sobre");
      const drag = window._pnlDragAtual;
      window._pnlDragAtual = null;
      if (!drag) return;
      pnlMoverCliente(drag.cliente, drag.deDesigner, card.dataset.designer);
    });
  });
}

function pnlRenderRunrunKPIs() {
  const el = document.getElementById("pnlRunrunKpis");
  if (!el) return;
  const grupos = pnlPorCategoriaDePrazo();
  const prioridades = pnlTarefasPrioridade();
  const doMes = pnlTarefasDoMes();

  el.innerHTML = `
    <div class="pnl-runrun-kpi" id="pnlKpiAtrasadas"><div class="pnl-runrun-kpi-num">${grupos.atrasadas.length}</div><div class="pnl-runrun-kpi-label">Tarefas atrasadas</div></div>
    <div class="pnl-runrun-kpi" id="pnlKpiHoje"><div class="pnl-runrun-kpi-num">${grupos.hoje.length}</div><div class="pnl-runrun-kpi-label">Tarefas pra hoje</div></div>
    <div class="pnl-runrun-kpi" id="pnlKpiPrioridades"><div class="pnl-runrun-kpi-num">${prioridades.length}</div><div class="pnl-runrun-kpi-label">Prioridades</div></div>
    <div class="pnl-runrun-kpi" id="pnlKpiMes"><div class="pnl-runrun-kpi-num">${doMes.length}</div><div class="pnl-runrun-kpi-label">Tarefas do mês</div></div>
  `;
  document.getElementById("pnlKpiAtrasadas").addEventListener("click", () => pnlAbrirTarefasModal("Tarefas atrasadas", { lista: grupos.atrasadas, mostrarDesigner: true }));
  document.getElementById("pnlKpiHoje").addEventListener("click", () => pnlAbrirTarefasModal("Tarefas pra hoje", { lista: grupos.hoje, mostrarDesigner: true }));
  document.getElementById("pnlKpiPrioridades").addEventListener("click", () => pnlAbrirTarefasModal("Prioridades", { lista: prioridades, mostrarDesigner: true }));
  document.getElementById("pnlKpiMes").addEventListener("click", () => pnlAbrirTarefasModal("Tarefas do mês", { lista: doMes, mostrarDesigner: true }));
}

// ===== Atividade recente (reaproveita a busca que já existe no Colmeia) =====

async function pnlCarregarAtividade() {
  const el = document.getElementById("pnlAtividadeLista");
  if (!el) return;
  el.innerHTML = `<div class="pnl-atividade-vazio">Carregando...</div>`;
  const atividades = typeof buscarAtividadesPainelBeeon === "function" ? await buscarAtividadesPainelBeeon() : [];
  if (!pnlAberta) return; // saiu da página enquanto buscava
  if (!atividades.length) { el.innerHTML = `<div class="pnl-atividade-vazio">Nada nos últimos dias.</div>`; return; }

  el.innerHTML = atividades.slice(0, 20).map(a => `
    <div class="pnl-atividade-item">
      ${typeof avatarHTML === "function" ? avatarHTML(a.quem, "avatar-sm") : ""}
      <div class="pnl-atividade-txt">
        <span><b>${escaparHTML(a.quem || "?")}</b> subiu <b>${escaparHTML(a.arquivo || "um arquivo")}</b></span>
        <div class="pnl-atividade-cliente">${escaparHTML(a.cliente || "")}</div>
        <div class="pnl-atividade-quando">${pnlHaQuanto(a.quando)}</div>
      </div>
    </div>
  `).join("");
}

function pnlHaQuanto(ts) {
  if (!ts) return "";
  const min = Math.floor((Date.now() - Number(ts)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

// ===== Ações: designer =====

function pnlRenomearDesigner(antigo, novo) {
  if (!novo || novo === antigo) { pnlRenderDesigners(); return; }
  if (pnlDesigners.includes(novo)) { mostrarToast("Já existe um designer com esse nome.", "erro"); pnlRenderDesigners(); return; }
  pnlDesigners = pnlDesigners.map(d => d === antigo ? novo : d);
  pnlState[novo] = pnlState[antigo] || [];
  delete pnlState[antigo];
  if (pnlColors[antigo]) { pnlColors[novo] = pnlColors[antigo]; delete pnlColors[antigo]; }
  if (pnlPhotos[antigo]) { pnlPhotos[novo] = pnlPhotos[antigo]; delete pnlPhotos[antigo]; }
  if (pnlHomeOffice[antigo] != null) { pnlHomeOffice[novo] = pnlHomeOffice[antigo]; delete pnlHomeOffice[antigo]; }
  if (pnlExpandidos.has(antigo)) { pnlExpandidos.delete(antigo); pnlExpandidos.add(novo); }
  pnlRenderTudo();
  pnlAgendarSalvar();
}

function pnlRemoverDesigner(designer) {
  const clientes = pnlState[designer] || [];
  if (!confirm(`Remover ${designer}? ${clientes.length ? `Os ${clientes.length} clientes dele vão pra "Sem designer".` : ""}`)) return;
  pnlDesigners = pnlDesigners.filter(d => d !== designer);
  if (!pnlDesigners.includes("Sem designer")) pnlDesigners.push("Sem designer");
  pnlState["Sem designer"] = (pnlState["Sem designer"] || []).concat(clientes);
  delete pnlState[designer];
  delete pnlColors[designer];
  delete pnlPhotos[designer];
  delete pnlHomeOffice[designer];
  pnlRenderTudo();
  pnlAgendarSalvar();
}

// ===== Ações: cliente =====

function pnlRemoverCliente(designer, clienteNome) {
  if (!confirm(`Remover "${clienteNome}" do painel?`)) return;
  pnlState[designer] = (pnlState[designer] || []).filter(c => c.cliente !== clienteNome);
  pnlRenderTudo();
  pnlAgendarSalvar();
}

function pnlMoverCliente(clienteNome, deDesigner, paraDesigner) {
  if (deDesigner === paraDesigner) return;
  const lista = pnlState[deDesigner] || [];
  const idx = lista.findIndex(c => c.cliente === clienteNome);
  if (idx === -1) return;
  const [c] = lista.splice(idx, 1);
  c.designer = paraDesigner;
  pnlState[paraDesigner] = pnlState[paraDesigner] || [];
  pnlState[paraDesigner].push(c);
  pnlRenderTudo();
  pnlAgendarSalvar();
}

// ===== Modal genérico: Adicionar designer / Adicionar cliente =====

function pnlAbrirModalDesigner() {
  pnlAddContexto = { tipo: "designer" };
  document.getElementById("pnlModalTitulo").textContent = "Novo designer";
  document.getElementById("pnlModalCorpo").innerHTML = `
    <div class="pnl-modal-campo">
      <label>Nome do designer</label>
      <input type="text" id="pnlNovoDesignerNome" placeholder="Ex: Fernanda">
    </div>
    <div class="pnl-modal-campo">
      <label>Especialidade</label>
      <input type="text" id="pnlNovoDesignerRole" placeholder="Ex: Performance, SEO, Social...">
    </div>
    <div class="pnl-modal-acoes">
      <button type="button" class="pnl-btn-secundario" id="pnlModalCancelar">Cancelar</button>
      <button type="button" class="pnl-btn-primario" id="pnlModalConfirmar">Adicionar</button>
    </div>
  `;
  document.getElementById("pnlModalOverlay").hidden = false;
  document.getElementById("pnlModalCancelar").addEventListener("click", pnlFecharModal);
  document.getElementById("pnlModalConfirmar").addEventListener("click", pnlSubmitAddDesigner);
  document.getElementById("pnlNovoDesignerNome").focus();
}

function pnlSubmitAddDesigner() {
  const nome = document.getElementById("pnlNovoDesignerNome").value.trim();
  const role = document.getElementById("pnlNovoDesignerRole").value.trim();
  if (!nome) { mostrarToast("Escreve o nome do designer.", "erro"); return; }
  if (pnlDesigners.includes(nome)) { mostrarToast("Já existe um designer com esse nome.", "erro"); return; }
  pnlDesigners.unshift(nome);
  pnlState[nome] = [];
  if (role) pnlRoles[nome] = role;
  pnlFecharModal();
  pnlRenderTudo();
  pnlAgendarSalvar();
}

function pnlAbrirModalCliente(designerPreselecionado) {
  pnlAddContexto = { tipo: "cliente", designer: designerPreselecionado };
  document.getElementById("pnlModalTitulo").textContent = "Novo cliente";
  document.getElementById("pnlModalCorpo").innerHTML = `
    <div class="pnl-modal-campo">
      <label>Nome do cliente</label>
      <input type="text" id="pnlNovoClienteNome" placeholder="Ex: Loja Tal">
    </div>
    <div class="pnl-modal-campo">
      <label>Escopo</label>
      <select id="pnlNovoClienteEscopo">
        <option value="INBOUND">Inbound</option>
        <option value="PERFORMANCE" selected>Performance</option>
        <option value="SEO">SEO</option>
        <option value="REDE SOCIAL">Rede Social</option>
      </select>
    </div>
    <div class="pnl-modal-campo">
      <label>Atendimento</label>
      <input type="text" id="pnlNovoClienteAtend" placeholder="Ex: Manu">
    </div>
    <div class="pnl-modal-campo">
      <label>Designer</label>
      <select id="pnlNovoClienteDesigner">
        ${pnlDesigners.map(d => `<option value="${escaparHTML(d)}" ${d === designerPreselecionado ? "selected" : ""}>${escaparHTML(d)}</option>`).join("")}
      </select>
    </div>
    <div class="pnl-modal-acoes">
      <button type="button" class="pnl-btn-secundario" id="pnlModalCancelar">Cancelar</button>
      <button type="button" class="pnl-btn-primario" id="pnlModalConfirmar">Adicionar</button>
    </div>
  `;
  document.getElementById("pnlModalOverlay").hidden = false;
  document.getElementById("pnlModalCancelar").addEventListener("click", pnlFecharModal);
  document.getElementById("pnlModalConfirmar").addEventListener("click", pnlSubmitAddCliente);
  document.getElementById("pnlNovoClienteNome").focus();
}

function pnlSubmitAddCliente() {
  const nome = document.getElementById("pnlNovoClienteNome").value.trim();
  const escopo = document.getElementById("pnlNovoClienteEscopo").value;
  const atend = document.getElementById("pnlNovoClienteAtend").value.trim();
  const designer = document.getElementById("pnlNovoClienteDesigner").value;
  if (!nome) { mostrarToast("Escreve o nome do cliente.", "erro"); return; }
  pnlState[designer] = pnlState[designer] || [];
  pnlState[designer].push({ cliente: nome, escopo, atend, designer, video: "-", email: "-", criativos: 0, tempo: 0, servicos: [] });
  pnlFecharModal();
  pnlExpandidos.add(designer);
  pnlRenderTudo();
  pnlAgendarSalvar();
}

function pnlFecharModal() {
  document.getElementById("pnlModalOverlay").hidden = true;
  pnlAddContexto = null;
}

// ===== Modal de tarefas (só leitura — abre a tarefa DE VERDADE no clique) =====

let pnlTarefasEstadoAtual = null; // { titulo, abas, abaAtiva, lista, mostrarDesigner }

function pnlAbrirTarefasModal(titulo, opcoes) {
  pnlTarefasEstadoAtual = {
    titulo,
    abas: opcoes.abas || null,
    abaAtiva: opcoes.abas ? (opcoes.abaInicial || opcoes.abas[0].chave) : null,
    lista: opcoes.lista || null,
    mostrarDesigner: !!opcoes.mostrarDesigner,
  };
  document.getElementById("pnlTarefasOverlay").hidden = false;
  pnlRenderTarefasModal();
}

function pnlFecharTarefasModal() {
  document.getElementById("pnlTarefasOverlay").hidden = true;
  pnlTarefasEstadoAtual = null;
}

function pnlRenderTarefasModal() {
  const st = pnlTarefasEstadoAtual;
  if (!st) return;
  document.getElementById("pnlTarefasTitulo").textContent = st.titulo;

  const lista = st.abas ? st.abas.find(a => a.chave === st.abaAtiva).lista : st.lista;
  const abasHtml = st.abas ? `
    <div class="pnl-tarefas-abas">
      ${st.abas.map(a => `<button type="button" class="pnl-tarefas-aba ${a.chave === st.abaAtiva ? "active" : ""}" data-pnl-aba="${a.chave}">${escaparHTML(a.label)} (${a.lista.length})</button>`).join("")}
    </div>
  ` : "";

  const corpo = document.getElementById("pnlTarefasConteudo");
  corpo.innerHTML = `
    ${abasHtml}
    <div class="pnl-tarefas-lista">
      ${lista.length ? lista.map((t, i) => pnlLinhaTarefaHTML(t, st.mostrarDesigner)).join("")
        : `<div class="pnl-vazio">Nada aqui.</div>`}
    </div>
  `;

  corpo.querySelectorAll("[data-pnl-aba]").forEach(btn => {
    btn.addEventListener("click", () => { st.abaAtiva = btn.dataset.pnlAba; pnlRenderTarefasModal(); });
  });
  corpo.querySelectorAll("[data-pnl-abrir-tarefa]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.pnlAbrirTarefa;
      pnlFecharTarefasModal();
      if (typeof abrirTarefaPorId === "function") abrirTarefaPorId(id);
    });
  });
}

function pnlLinhaTarefaHTML(t, mostrarDesigner) {
  const hoje = hojeISO();
  const atrasada = t.due && t.due < hoje && !t.entregue;
  const dataCurta = t.due ? `${Number(t.due.slice(8, 10))}/${Number(t.due.slice(5, 7))}` : "sem data";
  const subtitulo = [t.client, mostrarDesigner ? t.assignee : null].filter(Boolean).join(" · ");
  return `
    <button type="button" class="pnl-tarefa-row" data-pnl-abrir-tarefa="${escaparHTML(String(t.id))}">
      <span class="pnl-tarefa-titulo">
        <b>${escaparHTML(t.title || "Sem título")}</b>
        <span class="pnl-tarefa-cliente">${escaparHTML(subtitulo)}</span>
      </span>
      <span class="pnl-tarefa-data ${atrasada ? "atrasada" : ""}">${escaparHTML(dataCurta)}</span>
    </button>
  `;
}

// ===== Ligar os controles fixos da página (uma vez só) =====

let pnlControlesLigados = false;
function pnlLigarControlesUmaVez() {
  if (pnlControlesLigados) return;
  pnlControlesLigados = true;

  document.getElementById("pnlBusca")?.addEventListener("input", e => {
    pnlBuscaTermo = e.target.value;
    pnlRenderDesigners();
  });

  document.getElementById("pnlOrdenarBtn")?.addEventListener("click", e => {
    pnlSortAZ = !pnlSortAZ;
    e.currentTarget.classList.toggle("ativo", pnlSortAZ);
    pnlRenderDesigners();
  });

  document.getElementById("pnlExpandirBtn")?.addEventListener("click", e => {
    const abrirTudo = pnlExpandidos.size < pnlDesigners.length;
    pnlExpandidos = abrirTudo ? new Set(pnlDesigners) : new Set();
    e.currentTarget.textContent = abrirTudo ? "Recolher todos" : "Abrir todos";
    pnlRenderDesigners();
  });

  const addBtn = document.getElementById("pnlAddBtn");
  const addMenu = document.getElementById("pnlAddMenu");
  addBtn?.addEventListener("click", ev => {
    ev.stopPropagation();
    addMenu.hidden = !addMenu.hidden;
  });
  document.addEventListener("click", () => { if (addMenu) addMenu.hidden = true; });
  addMenu?.querySelectorAll("[data-pnl-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      addMenu.hidden = true;
      if (btn.dataset.pnlAdd === "designer") pnlAbrirModalDesigner();
      else pnlAbrirModalCliente(null);
    });
  });

  document.getElementById("pnlModalFechar")?.addEventListener("click", pnlFecharModal);
  document.getElementById("pnlModalOverlay")?.addEventListener("click", ev => {
    if (ev.target.id === "pnlModalOverlay") pnlFecharModal();
  });

  document.getElementById("pnlTarefasFechar")?.addEventListener("click", pnlFecharTarefasModal);
  document.getElementById("pnlTarefasOverlay")?.addEventListener("click", ev => {
    if (ev.target.id === "pnlTarefasOverlay") pnlFecharTarefasModal();
  });

  document.getElementById("pnlAtividadeRefresh")?.addEventListener("click", pnlCarregarAtividade);

  document.addEventListener("keydown", ev => {
    if (ev.key !== "Escape") return;
    if (pnlTarefasEstadoAtual) { pnlFecharTarefasModal(); return; }
    if (!document.getElementById("pnlModalOverlay")?.hidden) pnlFecharModal();
  });
}
pnlLigarControlesUmaVez();

// ============================================================================
// CONFIGURAÇÕES → "Vincular clientes" (a antiga tela do painel, agora uma
// aba a mais nas Configurações do coordenador — ver configTabVinculos,
// index.html, e atualizarAbasConfig, js/painel-pessoas-clientes.js).
// ============================================================================

let pnlVincDados = null;
let pnlVincSelecionados = [];
let pnlVincGruposAbertos = {};
let pnlVincMensagem = null;
let pnlVincCarregando = false;

async function renderConfigVinculosClientes() {
  const body = document.getElementById("peopleModalBody");
  if (!body) return;
  if (pnlVincCarregando) return;
  pnlVincCarregando = true;
  body.innerHTML = `<div class="pnl-vazio">Carregando clientes do painel, Runrun.it e Drive...</div>`;

  const data = await chamarBackend({ acao: "painelListarClientesParaVinculo" });
  pnlVincCarregando = false;
  pnlVincDados = data;
  pnlVincSelecionados = [];
  pnlVincDesenhar();
}

function pnlVincJaVinculado(nome) {
  if (!pnlVincDados || !pnlVincDados.vinculos) return false;
  const alvo = normalizarParaComparar(nome);
  return pnlVincDados.vinculos.some(v => normalizarParaComparar(v.origem) === alvo || normalizarParaComparar(v.canonico) === alvo);
}

function pnlVincDesenhar() {
  const body = document.getElementById("peopleModalBody");
  if (!body) return;
  const d = pnlVincDados;
  if (!d || !d.ok) {
    body.innerHTML = `<div class="pnl-vazio">Não consegui carregar os clientes. ${escaparHTML((d && d.error) || "")}</div>`;
    return;
  }

  const chipHtml = nome => `
    <button type="button" class="pnl-chip ${pnlVincSelecionados.includes(nome) ? "selecionado" : ""} ${pnlVincJaVinculado(nome) ? "ja-vinculado" : ""}" data-pnl-vinc-chip="${escaparHTML(nome)}">
      ${pnlVincJaVinculado(nome) ? "🔗 " : ""}${escaparHTML(nome)}
    </button>
  `;
  const colunaHtml = (titulo, nomes) => `
    <div class="pnl-vinc-coluna">
      <div class="pnl-vinc-titulo">${escaparHTML(titulo)} <span class="pnl-vinc-qtd">${nomes.length}</span></div>
      <div class="pnl-vinc-lista">${nomes.length ? nomes.map(chipHtml).join("") : `<div class="pnl-vazio">Nenhum cliente aqui.</div>`}</div>
    </div>
  `;

  // Agrupa os 3 lados (painel/Runrun/Drive) por identidade — vínculo
  // manual, ou o próprio nome batendo sem acento/maiúscula.
  const vinculoPorOrigem = {};
  (d.vinculos || []).forEach(v => { vinculoPorOrigem[normalizarParaComparar(v.origem)] = v.canonico; });
  const todos = [
    ...(d.painel || []).map(nome => ({ nome, origem: "painel" })),
    ...(d.runrun || []).map(nome => ({ nome, origem: "runrun" })),
    ...(d.drive || []).map(nome => ({ nome, origem: "drive" })),
  ];
  const grupos = {};
  todos.forEach(({ nome, origem }) => {
    const canonicoManual = vinculoPorOrigem[normalizarParaComparar(nome)];
    const chave = normalizarParaComparar(canonicoManual || nome);
    if (!grupos[chave]) grupos[chave] = { nomeExibicao: canonicoManual || nome, painel: [], runrun: [], drive: [] };
    if (origem === "painel" && !canonicoManual) grupos[chave].nomeExibicao = nome;
    grupos[chave][origem].push(nome);
  });
  const chaves = Object.keys(grupos).sort((a, b) => grupos[a].nomeExibicao.localeCompare(grupos[b].nomeExibicao, "pt-BR"));

  const colunaVinculadosHtml = `
    <div class="pnl-vinc-coluna">
      <div class="pnl-vinc-titulo">🔗 Todos os clientes <span class="pnl-vinc-qtd">${chaves.length}</span></div>
      <div class="pnl-vinc-lista">
        ${chaves.map(chave => {
          const g = grupos[chave];
          const aberto = !!pnlVincGruposAbertos[chave];
          const total = g.painel.length + g.runrun.length + g.drive.length;
          const soUmLado = (g.painel.length ? 1 : 0) + (g.runrun.length ? 1 : 0) + (g.drive.length ? 1 : 0) < 2;
          const linha = (label, lista) => lista.map(nome => `
            <div class="pnl-vinc-item">
              <span><b>${label}</b>${escaparHTML(nome)}</span>
              ${vinculoPorOrigem[normalizarParaComparar(nome)] ? `<button type="button" class="pnl-mini-btn" data-pnl-vinc-desvincular="${escaparHTML(nome)}" title="Desvincular">✕</button>` : ""}
            </div>
          `).join("");
          return `
            <div class="pnl-vinc-grupo">
              <button type="button" class="pnl-vinc-grupo-cab" data-pnl-vinc-toggle="${escaparHTML(chave)}">
                <span>${escaparHTML(g.nomeExibicao)}${soUmLado ? " · só aqui" : ""}</span>
                <span>${total}</span>
              </button>
              ${aberto ? `<div class="pnl-vinc-grupo-corpo">${linha("Painel ", g.painel)}${linha("Runrun.it ", g.runrun)}${linha("Drive ", g.drive)}</div>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  const avisoHtml = pnlVincMensagem ? `<div class="pnl-vinc-aviso ${pnlVincMensagem.tipo}">${escaparHTML(pnlVincMensagem.texto)}</div>` : "";

  body.innerHTML = `
    ${avisoHtml}
    <p class="pnl-vinc-explicacao">Selecione os nomes que são o mesmo cliente (um de cada coluna, ou vários da mesma) e clique em "Linkar selecionados".</p>
    <div class="pnl-vinc-colunas">
      ${colunaHtml("No painel", d.painel || [])}
      ${colunaHtml("No Runrun.it", d.runrun || [])}
      ${colunaHtml("No Drive", d.drive || [])}
      ${colunaVinculadosHtml}
    </div>
    ${d.driveErro ? `<p class="pnl-vazio">Drive: ${escaparHTML(d.driveErro)}</p>` : ""}
    <div class="pnl-vinc-barra ${pnlVincSelecionados.length >= 2 ? "visivel" : ""}">
      <span>${pnlVincSelecionados.length} selecionado(s)</span>
      <button type="button" class="pnl-btn-primario" id="pnlVincLinkarBtn">Linkar selecionados</button>
      <button type="button" class="pnl-btn-secundario" id="pnlVincLimparBtn">Limpar seleção</button>
    </div>
  `;

  body.querySelectorAll("[data-pnl-vinc-chip]").forEach(btn => {
    btn.addEventListener("click", () => {
      const nome = btn.dataset.pnlVincChip;
      const idx = pnlVincSelecionados.indexOf(nome);
      if (idx === -1) pnlVincSelecionados.push(nome); else pnlVincSelecionados.splice(idx, 1);
      pnlVincDesenhar();
    });
  });
  body.querySelectorAll("[data-pnl-vinc-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const chave = btn.dataset.pnlVincToggle;
      pnlVincGruposAbertos[chave] = !pnlVincGruposAbertos[chave];
      pnlVincDesenhar();
    });
  });
  body.querySelectorAll("[data-pnl-vinc-desvincular]").forEach(btn => {
    btn.addEventListener("click", () => pnlVincDesvincular(btn.dataset.pnlVincDesvincular));
  });
  document.getElementById("pnlVincLinkarBtn")?.addEventListener("click", pnlVincLinkar);
  document.getElementById("pnlVincLimparBtn")?.addEventListener("click", () => { pnlVincSelecionados = []; pnlVincDesenhar(); });
}

async function pnlVincLinkar() {
  if (pnlVincSelecionados.length < 2) return;
  const nomes = [...pnlVincSelecionados];
  const resultado = await chamarBackend({ acao: "painelLinkarClientes", nomes });
  if (!resultado || !resultado.ok) {
    pnlVincMensagem = { tipo: "erro", texto: "Não consegui linkar esses clientes: " + ((resultado && resultado.error) || "erro desconhecido") };
    pnlVincDesenhar();
    return;
  }
  pnlVincMensagem = { tipo: "sucesso", texto: `Vinculado! ${nomes.join(" + ")} agora são o mesmo cliente (${resultado.canonico}).` };
  pnlVincGruposAbertos[normalizarParaComparar(resultado.canonico)] = true;
  await renderConfigVinculosClientesMantendoAviso();
}

async function pnlVincDesvincular(nomeOrigem) {
  const resultado = await chamarBackend({ acao: "painelDesvincularCliente", nomeOrigem });
  if (!resultado || !resultado.ok) {
    pnlVincMensagem = { tipo: "erro", texto: "Não consegui desvincular: " + ((resultado && resultado.error) || "erro desconhecido") };
    pnlVincDesenhar();
    return;
  }
  pnlVincMensagem = { tipo: "sucesso", texto: `"${nomeOrigem}" foi desvinculado.` };
  await renderConfigVinculosClientesMantendoAviso();
}

async function renderConfigVinculosClientesMantendoAviso() {
  const avisoPendente = pnlVincMensagem;
  const data = await chamarBackend({ acao: "painelListarClientesParaVinculo" });
  pnlVincDados = data;
  pnlVincSelecionados = [];
  pnlVincMensagem = avisoPendente;
  pnlVincDesenhar();
}
