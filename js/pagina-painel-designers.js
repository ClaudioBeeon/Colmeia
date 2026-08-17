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

function pnlCorPorHash(nome) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return PNL_CORES_PALETA[Math.abs(hash) % PNL_CORES_PALETA.length];
}

function pnlCorDoDesigner(nome) {
  if (pnlColors[nome]) return pnlColors[nome];
  return pnlCorPorHash(nome);
}

// Mesma lista de serviços pré-definidos do painel original — usada só pra
// dar uma cor fixa aos rótulos mais comuns; qualquer outro texto ganha
// uma cor gerada por hash (pnlServicoStyle), igual o original já fazia.
const PNL_SERVICOS_PREDEFINIDOS = [
  { label: "Estático", bg: "#E6F1FB", color: "#185FA5" },
  { label: "Vídeo", bg: "#FAEEDA", color: "#854F0B" },
  { label: "Animação", bg: "#EAF3DE", color: "#3B6D11" },
  { label: "E-mail", bg: "#FBEAF0", color: "#993556" },
  { label: "Story", bg: "#F3EEFB", color: "#6B3FA0" },
  { label: "Reels", bg: "#FEF0F0", color: "#C0392B" },
  { label: "Banner", bg: "#E8F8F5", color: "#1A6B55" },
  { label: "Tráfego", bg: "#FFF3CD", color: "#856404" },
];

function pnlServicoStyle(label) {
  const pre = PNL_SERVICOS_PREDEFINIDOS.find(s => s.label.toLowerCase() === label.toLowerCase());
  if (pre) return pre;
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue},55%,92%)`, color: `hsl(${hue},45%,35%)` };
}

function pnlFindCliente(designer, nomeCliente) {
  return (pnlState[designer] || []).find(c => c.cliente === nomeCliente);
}

/** Quantas tarefas em aberto no Runrun.it esse cliente tem agora. */
function pnlQtdTarefasDoCliente(nomeCliente) {
  const alvo = typeof normalizarParaComparar === "function" ? normalizarParaComparar(nomeCliente) : nomeCliente.toLowerCase();
  return pnlTarefasAbertas().filter(t => (typeof normalizarParaComparar === "function" ? normalizarParaComparar(t.client || "") : (t.client || "").toLowerCase()) === alvo).length;
}

function pnlFormatTempo(min) {
  if (!min) return "0min";
  if (min < 60) return min + "min";
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/** Preferência de exibição por designer (ordenação escolhida, modo
 *  compacto) — mesma convenção `colmeia_<coisa>_v1_<nome>` já usada no
 *  resto do app pra esse tipo de preferência (não é decisão de trabalho,
 *  então localStorage basta). */
function pnlChavePref(sufixo) {
  return `colmeia_esforco_${sufixo}_v1_${DESIGNER_LOGADO || "anon"}`;
}
function pnlLerPref(sufixo, padrao) {
  try { return localStorage.getItem(pnlChavePref(sufixo)) || padrao; } catch (e) { return padrao; }
}
function pnlSalvarPref(sufixo, valor) {
  try { localStorage.setItem(pnlChavePref(sufixo), valor); } catch (e) { /* sem localStorage, só não lembra */ }
}

/** Quanto é um dia cheio, em minutos. Estava escrito na mão só dentro de
 *  pnlRenderEsforcoLista (a lista da PÁGINA) e não chegava no pop-up — que
 *  é justamente onde a pessoa vai DECIDIR o que fazer com a carga (achado
 *  da crítica de 2026-08-17). Um lugar só, os dois desenhos usam. */
const PNL_ESFORCO_LIMITE_MIN = 240;
function pnlNivelDeCarga(min) {
  if (min > PNL_ESFORCO_LIMITE_MIN) return "estourado";
  if (min > PNL_ESFORCO_LIMITE_MIN * 0.75) return "cheio";
  return "tranquilo";
}

// ===== Abrir/fechar a página =====

function abrirPainelDesigners() {
  pnlAberta = true;
  if (!pnlCarregado) {
    pnlCarregarEstado(true);
  } else {
    pnlRenderTudo(); // já tinha carregado antes (voltou pra página): desenha na hora
  }
  if (!pnlPollTimer) pnlPollTimer = setInterval(pnlPollUmaVez, PNL_POLL_MS);
  ligarPollAoVoltarPraAba();
}

function fecharPainelDesigners() {
  pnlAberta = false;
  if (pnlPollTimer) { clearInterval(pnlPollTimer); pnlPollTimer = null; }
}

// 30s no lugar dos 8s de antes — ver o comentário de pnlPollUmaVez.
const PNL_POLL_MS = 30000;

/**
 * Buscar na hora em que a pessoa volta pra aba.
 *
 * É isto que deixa afrouxar o intervalo sem ninguém perceber: quem sai e
 * volta encontra o painel atualizado no instante em que olha, em vez de
 * esperar o próximo tique. Um intervalo curto tentava adivinhar esse
 * momento perguntando o tempo todo; aqui a gente simplesmente sabe quando
 * ele acontece.
 *
 * Ligado uma vez só (`_pnlOuvindoVolta`): abrir e fechar a página várias
 * vezes empilharia um ouvinte por abertura, e aí cada volta pra aba
 * dispararia várias buscas iguais.
 */
let _pnlOuvindoVolta = false;

function ligarPollAoVoltarPraAba() {
  if (_pnlOuvindoVolta) return;
  _pnlOuvindoVolta = true;
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && pnlAberta) pnlPollUmaVez();
  });
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

/**
 * Busca de novo o que mudou — existe pra quando duas pessoas editam o
 * painel ao mesmo tempo.
 *
 * Era de 8 em 8 segundos (2026-08-10: passou pra 30). Oito segundos é
 * ritmo de dado que muda o tempo todo; este muda algumas vezes por dia, e
 * quem está editando de verdade já vê o próprio trabalho na hora — a
 * pergunta rápida só servia pro caso raro de duas pessoas na mesma tela
 * no mesmo minuto. Esse caso continua atendido pelo gancho de "voltou pra
 * aba", que busca na hora e é bem melhor que qualquer intervalo.
 *
 * E o principal: NÃO PERGUNTA COM A ABA NO FUNDO. Antes, uma aba
 * esquecida aberta atrás de outras coisas ficava batendo no Apps Script do
 * painel-designers-beeon a cada 8 segundos o dia inteiro, sem ninguém
 * olhando o resultado.
 */
async function pnlPollUmaVez() {
  if (!pnlAberta || pnlSavePending || pnlEstaEditando()) return;
  if (document.hidden) return;
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
  if (!t.dueISO) return null;
  if (t.dueISO < hoje) return "atrasadas";
  if (t.dueISO === hoje) return "hoje";
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
  Object.values(grupos).forEach(l => l.sort((a, b) => (a.dueISO || "9999").localeCompare(b.dueISO || "9999")));
  return grupos;
}

/** Tarefas com prioridade do Runrun.it (isUrgent) — qualquer prazo. */
function pnlTarefasPrioridade() {
  return pnlTarefasAbertas().filter(t => t.isUrgent)
    .sort((a, b) => (a.dueISO || "9999").localeCompare(b.dueISO || "9999"));
}

/** Tarefas do mês corrente (por Entrega Desejada) + todas as atrasadas. */
function pnlTarefasDoMes() {
  const hoje = hojeISO();
  const anoMes = hoje.slice(0, 7);
  return pnlTarefasAbertas().filter(t => t.dueISO && (t.dueISO < hoje || t.dueISO.slice(0, 7) === anoMes))
    .sort((a, b) => (a.dueISO || "9999").localeCompare(b.dueISO || "9999"));
}

/**
 * Tempo médio de VERDADE pra uma tarefa: não o `t.tempoMedioMinutos` que
 * vem do backend (esse é uma média só por CLIENTE, vinda do cadastro do
 * painel só que sem separar por designer — `transformarTarefaParaColmeia`,
 * RunrunLeitura.gs), mas o número que está escrito NA TELA, no card do
 * cliente dentro da aba do designer (`pnlState[designer][i].tempo` — o
 * mesmo campo que os botões +/- de "Tempo médio" de pnlBuildClientCardHTML
 * editam). Pedido do Cláudio: cada designer pode ter um tempo diferente
 * pro MESMO cliente, e é esse número — o que ele cadastrou — que tem que
 * mandar no esforço do dia, não uma média genérica vinda do Runrun.it.
 *
 * Acha o designer do PAINEL a partir de quem está com a tarefa no
 * Runrun.it (mesmo cuidado de pnlTarefasDoDesignerPainel — são pessoas
 * de cadastros diferentes) e, dentro do cadastro dele, o cliente da
 * tarefa.
 *
 * Devolve `null` quando NÃO EXISTE cadastro pra essa dupla — nunca `0`.
 * `0` e "sem cadastro" são coisas diferentes de propósito: `0` é "cadastrei
 * e não dá trabalho", `null` é "nunca cadastrei" — antes os dois viravam a
 * mesma coisa na tela ("0min"), e o esforço do dia somava menos do que a
 * realidade sem avisar ninguém (achado da crítica de 2026-08-17). Quem
 * chama esta função TEM que tratar o `null` — não cai pra nenhuma média
 * emprestada, porque emprestar de outro designer é exatamente o que
 * estava errado antes.
 */
function pnlTempoMedioCadastrado(nomeResponsavelRunrun, nomeCliente) {
  if (!nomeResponsavelRunrun || !nomeCliente) return null;
  const designerPainel = pnlDesigners.find(d => nomesCorrespondem(nomeResponsavelRunrun, d));
  if (!designerPainel) return null;
  const alvo = typeof normalizarParaComparar === "function" ? normalizarParaComparar(nomeCliente) : nomeCliente.toLowerCase();
  const c = (pnlState[designerPainel] || []).find(c => (typeof normalizarParaComparar === "function" ? normalizarParaComparar(c.cliente) : c.cliente.toLowerCase()) === alvo);
  return c ? (c.tempo || 0) : null;
}

/**
 * Esforço de hoje: tarefas atrasadas ou pra hoje, somando o tempo médio
 * CADASTRADO NO PAINEL (pnlTempoMedioCadastrado — ver comentário acima),
 * não uma média vinda do Runrun.it. Agrupado por quem está com a tarefa
 * no Runrun.it — NÃO pelo designer do painel: são pessoas diferentes (ver
 * o aviso no grupo abaixo).
 *
 * Todo designer do painel entra, mesmo sem nenhuma tarefa vencendo hoje
 * (grupo com `min: 0`) — é o destino de qualquer reequilíbrio, e ficar de
 * fora fazia a pessoa livre parecer que não existe (achado da crítica de
 * 2026-08-17). E `semCadastro` conta quantas tarefas do grupo não têm
 * tempo cadastrado — sem isso "4 tarefas · 0min" parecia "não dá trabalho"
 * quando na verdade era "nunca cadastrei tempo pra ninguém aqui".
 */
function pnlEsforcoPorResponsavel() {
  const hoje = hojeISO();
  const porResponsavel = {}; // nome -> {min, semCadastro, tarefas:[]}
  pnlDesigners.forEach(d => { porResponsavel[d] = { min: 0, semCadastro: 0, tarefas: [] }; });
  pnlTarefasAbertas().forEach(t => {
    if (!t.dueISO || t.dueISO > hoje) return;
    const nome = t.assignee || "Sem responsável";
    if (!porResponsavel[nome]) porResponsavel[nome] = { min: 0, semCadastro: 0, tarefas: [] };
    const min = pnlTempoMedioCadastrado(nome, t.client);
    if (min === null) porResponsavel[nome].semCadastro++;
    else porResponsavel[nome].min += min;
    porResponsavel[nome].tarefas.push(t);
  });
  Object.values(porResponsavel).forEach(g => g.tarefas.sort((a, b) => (a.dueISO || "").localeCompare(b.dueISO || "")));
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
  pnlRenderKPIsMini();
  pnlRenderDesigners();
  pnlRenderRunrunKPIs();
  pnlRenderEsforcoLista();
}

/**
 * Os 3 boxes pequenos (Clientes/Criativos/Horas) — encolheram e desceram
 * pra coluna da direita em 2026-08-12 (ver o comentário no CSS,
 * .pnl-kpis-mini) pra abrir espaço em cima pra grade de designers.
 * "Esforço de hoje" saiu daqui: virou `pnlRenderEsforcoLista`, no lugar
 * de "Atividade recente".
 */
function pnlRenderKPIsMini() {
  const el = document.getElementById("pnlKpisMini");
  if (!el) return;

  const nomesClientes = new Set();
  pnlDesigners.forEach(d => (pnlState[d] || []).forEach(c => { if (c.cliente) nomesClientes.add(c.cliente); }));
  const totalClientes = nomesClientes.size;
  const totalCriativos = pnlDesigners.reduce((s, d) => s + (pnlState[d] || []).reduce((s2, c) => s2 + (c.criativos || 0), 0), 0);
  const totalMin = pnlDesigners.reduce((s, d) => s + (pnlState[d] || []).reduce((s2, c) => s2 + ((c.criativos || 0) * (c.tempo || 0)), 0), 0);

  el.innerHTML = `
    <div class="pnl-kpi-mini-card">
      <div class="pnl-kpi-mini-label">Clientes</div>
      <div class="pnl-kpi-mini-value">${totalClientes}</div>
    </div>
    <div class="pnl-kpi-mini-card">
      <div class="pnl-kpi-mini-label">Criativos</div>
      <div class="pnl-kpi-mini-value">${totalCriativos}</div>
    </div>
    <div class="pnl-kpi-mini-card">
      <div class="pnl-kpi-mini-label">Horas totais</div>
      <div class="pnl-kpi-mini-value">${escaparHTML(pnlFormatTempo(totalMin))}</div>
    </div>
  `;
}

/**
 * "Esforço de hoje", agora em LINHAS (um designer embaixo do outro, com
 * as horas do dia) em vez das colunas lado a lado de antes — no lugar de
 * "Atividade recente" (2026-08-12, pedido do Cláudio). Clicar numa linha
 * abre o mesmo modal de sempre, já filtrado pra essa pessoa.
 */
function pnlRenderEsforcoLista() {
  const el = document.getElementById("pnlEsforcoLista");
  if (!el) return;

  const esforco = pnlEsforcoPorResponsavel();
  // Diferente da tira DENTRO do modal (Tarefa 7), esta lista da página é um
  // resumo rápido — só quem tem carga hoje. pnlEsforcoPorResponsavel agora
  // inclui todo designer, inclusive livre; filtrar aqui pra não poluir.
  const nomesEsforco = Object.keys(esforco)
    .filter(n => esforco[n].tarefas.length > 0)
    .sort((a, b) => esforco[b].min - esforco[a].min);

  if (!nomesEsforco.length) {
    el.innerHTML = `<div class="pnl-esforco-vazio">Nada atrasado nem pra hoje.</div>`;
    return;
  }

  // <button>, não <div> com clique — era o outro controle central sem
  // teclado (achado da crítica de 2026-08-17, junto com a tira do modal).
  el.innerHTML = nomesEsforco.map(n => `
    <button type="button" class="pnl-esforco-linha" data-pnl-esforco-pessoa="${escaparHTML(n)}">
      ${typeof avatarHTML === "function" ? avatarHTML(n, "avatar-sm") : ""}
      <div class="pnl-esforco-linha-nome">${escaparHTML(n)}</div>
      <div class="pnl-esforco-linha-valor ${pnlNivelDeCarga(esforco[n].min) === "estourado" ? "alerta" : ""}">${escaparHTML(pnlFormatTempo(esforco[n].min))}</div>
    </button>
  `).join("");

  el.querySelectorAll("[data-pnl-esforco-pessoa]").forEach(linha => {
    linha.addEventListener("click", () => pnlAbrirEsforcoModal(linha.dataset.pnlEsforcoPessoa));
  });
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
    const atrasadas = tarefasDesigner.filter(t => t.dueISO && t.dueISO < hoje);
    const hojeLista = tarefasDesigner.filter(t => t.dueISO === hoje);
    const futuras = tarefasDesigner.filter(t => t.dueISO && t.dueISO > hoje);
    const temRunrun = atrasadas.length + hojeLista.length + futuras.length > 0;

    return `
      <div class="pnl-designer-card ${expandidoAgora ? "expandido" : ""} ${foraDoFiltro ? "pnl-fora-do-filtro" : ""}" data-designer="${escaparHTML(designer)}">
        <div class="pnl-dcard-top" data-pnl-toggle="${escaparHTML(designer)}">
          <div class="pnl-dcard-linha1">
            <div class="pnl-dcard-avatar-wrap">
              <div class="pnl-dcard-avatar" style="background:${col.bg};color:${col.fg}" data-pnl-relatorio="${escaparHTML(designer)}">${avatarInner}</div>
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
  const clientCol = pnlCorPorHash(c.cliente);
  const qtdTarefas = pnlQtdTarefasDoCliente(c.cliente);
  const tagsHtml = (c.servicos || []).map(s => {
    const st = pnlServicoStyle(s);
    return `<span class="pnl-tag" style="background:${st.bg};color:${st.color};">${escaparHTML(s)}<button type="button" class="pnl-tag-x" data-pnl-tag-remover="${escaparHTML(s)}" title="Remover serviço">×</button></span>`;
  }).join("");

  return `
    <div class="pnl-client-card" draggable="true" data-pnl-cliente="${escaparHTML(c.cliente)}" data-pnl-de-designer="${escaparHTML(designer)}">
      <div class="pnl-client-top">
        <div class="pnl-client-icon" style="background:${clientCol.bg};color:${clientCol.fg}">${escaparHTML(typeof initials === "function" ? initials(c.cliente) : c.cliente.slice(0, 2).toUpperCase())}</div>
        <input type="text" class="pnl-client-name-input" value="${escaparHTML(c.cliente)}" data-pnl-cliente-nome-input>
        <button type="button" class="pnl-mini-btn" data-pnl-remover-cliente="${escaparHTML(c.cliente)}" data-pnl-remover-designer="${escaparHTML(designer)}" title="Remover cliente">✕</button>
      </div>
      <div class="pnl-client-atend-row">
        <span class="pnl-client-atend" data-pnl-atend-editar title="Clique para alterar o atendimento">${escaparHTML(c.atend || "Sem atendimento")}</span>
        ${qtdTarefas ? `<span class="pnl-client-tarefas-badge">${qtdTarefas} tarefa${qtdTarefas > 1 ? "s" : ""} no Runrun.it</span>` : ""}
      </div>
      <div class="pnl-client-tags-row">
        ${tagsHtml}
        <button type="button" class="pnl-add-tag-btn" data-pnl-add-tag>+ serviço</button>
      </div>
      <div class="pnl-client-ctrl-row">
        <span class="pnl-ctrl-label">Criativos</span>
        <div class="pnl-ctrl-group">
          <button type="button" class="pnl-ctrl-btn" data-pnl-cri-menos>−</button>
          <span class="pnl-ctrl-val">${c.criativos || 0}</span>
          <button type="button" class="pnl-ctrl-btn" data-pnl-cri-mais>+</button>
        </div>
      </div>
      <div class="pnl-client-ctrl-row">
        <span class="pnl-ctrl-label">Tempo médio</span>
        <div class="pnl-ctrl-group">
          <button type="button" class="pnl-ctrl-btn" data-pnl-tempo-menos>−</button>
          <span class="pnl-ctrl-val" data-pnl-tempo-editar title="Clique pra editar">${escaparHTML(pnlFormatTempo(c.tempo || 0))}</span>
          <button type="button" class="pnl-ctrl-btn" data-pnl-tempo-mais>+</button>
        </div>
      </div>
    </div>
  `;
}

function pnlLigarEventosDaGrade(grid) {
  // Abrir o relatório diário — clicar no avatar, não no card inteiro
  // (o card inteiro já expande/recolhe os clientes via data-pnl-toggle).
  grid.querySelectorAll("[data-pnl-relatorio]").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      abrirRelatorioDesigner(el.dataset.pnlRelatorio);
    });
  });

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
        { chave: "atrasadas", label: "Atrasadas", lista: todas.filter(t => t.dueISO && t.dueISO < hoje) },
        { chave: "hoje", label: "Vence hoje", lista: todas.filter(t => t.dueISO === hoje) },
        { chave: "futuras", label: "Futuras", lista: todas.filter(t => t.dueISO && t.dueISO > hoje) },
      ];
      pnlAbrirTarefasModal(designer, { abas, abaInicial: cat });
    });
  });

  // Cliente: clique no corpo do card abre as tarefas dele; arrastar move de
  // designer. Os campos editáveis (nome/atendimento/tags/contadores) têm o
  // próprio stopPropagation, então esse guard só precisa cobrir input/button.
  grid.querySelectorAll("[data-pnl-cliente]").forEach(card => {
    card.addEventListener("click", ev => {
      if (ev.target.closest("input, button")) return;
      const nome = card.dataset.pnlCliente;
      const alvo = typeof normalizarParaComparar === "function" ? normalizarParaComparar(nome) : nome.toLowerCase();
      const tarefas = pnlTarefasAbertas().filter(t => (typeof normalizarParaComparar === "function" ? normalizarParaComparar(t.client || "") : (t.client || "").toLowerCase()) === alvo)
        .sort((a, b) => (a.dueISO || "9999").localeCompare(b.dueISO || "9999"));
      pnlAbrirTarefasModal(nome, { lista: tarefas });
    });
    card.addEventListener("dragstart", () => {
      card.classList.add("arrastando");
      card._pnlDrag = { cliente: card.dataset.pnlCliente, deDesigner: card.dataset.pnlDeDesigner };
      window._pnlDragAtual = card._pnlDrag;
    });
    card.addEventListener("dragend", () => card.classList.remove("arrastando"));
  });

  // Renomear cliente.
  grid.querySelectorAll("[data-pnl-cliente-nome-input]").forEach(input => {
    input.addEventListener("click", ev => ev.stopPropagation());
    input.addEventListener("blur", () => {
      const card = input.closest(".pnl-client-card");
      const designer = card.dataset.pnlDeDesigner, antigo = card.dataset.pnlCliente;
      const c = pnlFindCliente(designer, antigo);
      const novo = input.value.trim();
      if (!c || !novo || novo === antigo) { input.value = antigo; return; }
      c.cliente = novo;
      pnlRenderDesigners();
      pnlAgendarSalvar();
    });
    input.addEventListener("keydown", ev => { if (ev.key === "Enter") input.blur(); });
  });

  // Atendimento: clique vira campo de texto (mesmo padrão do original).
  grid.querySelectorAll("[data-pnl-atend-editar]").forEach(span => {
    span.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = span.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c) return;
      const input = document.createElement("input");
      input.type = "text"; input.className = "pnl-client-atend-input"; input.value = c.atend || "";
      span.replaceWith(input);
      input.focus(); input.select();
      const commit = () => { c.atend = input.value.trim(); pnlRenderDesigners(); pnlAgendarSalvar(); };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", ev2 => { if (ev2.key === "Enter") input.blur(); ev2.stopPropagation(); });
    });
  });

  // Serviços (tags): remover e adicionar.
  grid.querySelectorAll("[data-pnl-tag-remover]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = btn.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c) return;
      c.servicos = (c.servicos || []).filter(s => s !== btn.dataset.pnlTagRemover);
      pnlRenderDesigners();
      pnlAgendarSalvar();
    });
  });
  grid.querySelectorAll("[data-pnl-add-tag]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = btn.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c) return;
      const label = prompt("Serviço (ex: Estático, Vídeo, Animação, E-mail, Story, Reels, Banner, Tráfego, ou personalizado):");
      if (!label) return;
      const v = label.trim();
      if (!v) return;
      c.servicos = c.servicos || [];
      if (c.servicos.includes(v)) return;
      c.servicos.push(v);
      pnlRenderDesigners();
      pnlAgendarSalvar();
    });
  });

  // Criativos: +/-.
  grid.querySelectorAll("[data-pnl-cri-menos]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = btn.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c || !(c.criativos > 0)) return;
      c.criativos--;
      pnlRenderTudo();
      pnlAgendarSalvar();
    });
  });
  grid.querySelectorAll("[data-pnl-cri-mais]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = btn.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c) return;
      c.criativos = (c.criativos || 0) + 1;
      pnlRenderTudo();
      pnlAgendarSalvar();
    });
  });

  // Tempo médio: +/- de 5 em 5, e clicar no número edita o valor exato.
  grid.querySelectorAll("[data-pnl-tempo-menos]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = btn.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c || !(c.tempo >= 5)) return;
      c.tempo -= 5;
      pnlRenderTudo();
      pnlAgendarSalvar();
    });
  });
  grid.querySelectorAll("[data-pnl-tempo-mais]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = btn.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c) return;
      c.tempo = (c.tempo || 0) + 5;
      pnlRenderTudo();
      pnlAgendarSalvar();
    });
  });
  grid.querySelectorAll("[data-pnl-tempo-editar]").forEach(span => {
    span.addEventListener("click", ev => {
      ev.stopPropagation();
      const card = span.closest(".pnl-client-card");
      const c = pnlFindCliente(card.dataset.pnlDeDesigner, card.dataset.pnlCliente);
      if (!c) return;
      const input = document.createElement("input");
      input.type = "number"; input.className = "pnl-ctrl-input"; input.value = c.tempo || 0;
      span.replaceWith(input);
      input.focus(); input.select();
      const commit = () => { c.tempo = Math.max(0, parseInt(input.value) || 0); pnlRenderTudo(); pnlAgendarSalvar(); };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", ev2 => { if (ev2.key === "Enter") input.blur(); ev2.stopPropagation(); });
    });
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

/**
 * Reatribuir atendimento em massa: quando alguém do atendimento sai
 * (ex: Giovanna) e outra pessoa assume a carteira dela (ex: Vitória), em
 * vez de editar cliente por cliente (clique no nome do atendimento em
 * cada card), troca todo mundo de uma vez só aqui.
 */
function pnlAbrirModalReatribuir() {
  const nomesAtuais = new Set();
  Object.values(pnlState).forEach(lista => {
    (lista || []).forEach(c => { if (c.atend) nomesAtuais.add(c.atend); });
  });
  const opcoes = Array.from(nomesAtuais).sort((a, b) => a.localeCompare(b, "pt-BR"));

  pnlAddContexto = { tipo: "reatribuir" };
  document.getElementById("pnlModalTitulo").textContent = "Reatribuir atendimento";
  document.getElementById("pnlModalCorpo").innerHTML = `
    <div class="pnl-modal-campo">
      <label>De (atendimento atual)</label>
      <select id="pnlReatribuirDe">
        ${opcoes.length
          ? opcoes.map(n => `<option value="${escaparHTML(n)}">${escaparHTML(n)}</option>`).join("")
          : `<option value="">Nenhum atendimento cadastrado ainda</option>`}
      </select>
    </div>
    <div class="pnl-modal-campo">
      <label>Para (novo atendimento)</label>
      <input type="text" id="pnlReatribuirPara" placeholder="Ex: Vitória" list="pnlReatribuirParaLista">
      <datalist id="pnlReatribuirParaLista">
        ${opcoes.map(n => `<option value="${escaparHTML(n)}">`).join("")}
      </datalist>
    </div>
    <p class="pnl-modal-aviso" id="pnlReatribuirAviso"></p>
    <div class="pnl-modal-acoes">
      <button type="button" class="pnl-btn-secundario" id="pnlModalCancelar">Cancelar</button>
      <button type="button" class="pnl-btn-primario" id="pnlModalConfirmar">Reatribuir</button>
    </div>
  `;
  document.getElementById("pnlModalOverlay").hidden = false;
  document.getElementById("pnlModalCancelar").addEventListener("click", pnlFecharModal);
  document.getElementById("pnlModalConfirmar").addEventListener("click", pnlSubmitReatribuir);

  const atualizarAviso = () => {
    const de = document.getElementById("pnlReatribuirDe").value;
    const qtd = Object.values(pnlState).reduce((soma, lista) =>
      soma + (lista || []).filter(c => c.atend === de).length, 0);
    const aviso = document.getElementById("pnlReatribuirAviso");
    if (aviso) {
      aviso.textContent = de
        ? `${qtd} cliente${qtd === 1 ? "" : "s"} ${qtd === 1 ? "está" : "estão"} com "${de}" hoje.`
        : "";
    }
  };
  document.getElementById("pnlReatribuirDe")?.addEventListener("change", atualizarAviso);
  atualizarAviso();
  document.getElementById("pnlReatribuirPara").focus();
}

function pnlSubmitReatribuir() {
  const de = document.getElementById("pnlReatribuirDe").value;
  const para = document.getElementById("pnlReatribuirPara").value.trim();
  if (!de) { mostrarToast("Não tem ninguém pra reatribuir ainda.", "erro"); return; }
  if (!para) { mostrarToast("Escreve o nome de quem vai assumir.", "erro"); return; }
  if (para === de) { mostrarToast("Já é essa pessoa — escreve outro nome.", "erro"); return; }

  let trocados = 0;
  Object.values(pnlState).forEach(lista => {
    (lista || []).forEach(c => {
      if (c.atend === de) { c.atend = para; trocados++; }
    });
  });

  pnlFecharModal();
  pnlRenderTudo();
  pnlAgendarSalvar();
  mostrarToast(`${trocados} cliente${trocados === 1 ? "" : "s"} de "${de}" ${trocados === 1 ? "passou" : "passaram"} pra "${para}".`, "sucesso");
}

// ===== Modal de tarefas =====
// Duas formas de abrir: genérica (pnlAbrirTarefasModal — lista simples ou
// com abas, ex: cliente/designer/Atrasadas) e a de Esforço (pnlAbrirEsforcoModal
// — tira de pessoas pra filtrar + ordenar por Data/Tempo/Aba), que reproduz o
// pop-up "Esforço de hoje" do painel original. As duas compartilham a mesma
// linha de tarefa (pnlLinhaTarefaHTML), que já vem com a data e a etapa
// EDITÁVEIS de verdade — reaproveitando os componentes reais do Colmeia
// (abrirCalendarioColmeia + a ação "alterarEntrega", e abrirMenuEtapa +
// moverEtapaNoBackend, ambos de js/chat-comentarios.js e js/detalhe-modal.js)
// em vez de reinventar um editor à parte. Só o TÍTULO da tarefa abre o
// pop-up de detalhe completo do Colmeia.

let pnlTarefasEstadoAtual = null; // { titulo, abas, abaAtiva, lista, mostrarDesigner } OU { titulo, modoEsforco:true, esforco, filtroPessoa, ordenacao }

// ===== Foco preso dentro do modal (achado da crítica de 2026-08-17: sem
// isso, o Tab escapava pra página atrás enquanto o pop-up estava aberto).
// Mesma receita já usada e testada em aprovar.html (prenderFoco/soltarFoco).
let pnlFocoAntesDoModal = null;
let pnlModalAoTab = null;
function pnlPrenderFocoNoModal() {
  pnlFocoAntesDoModal = document.activeElement;
  const modal = document.querySelector(".pnl-tarefas-modal");
  document.getElementById("pnlTarefasFechar")?.focus();
  pnlModalAoTab = ev => {
    if (ev.key !== "Tab" || !modal) return;
    const focaveis = Array.prototype.slice.call(
      modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(el => !el.disabled && el.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
  };
  document.addEventListener("keydown", pnlModalAoTab);
}
function pnlSoltarFocoDoModal() {
  if (pnlModalAoTab) { document.removeEventListener("keydown", pnlModalAoTab); pnlModalAoTab = null; }
  if (pnlFocoAntesDoModal && typeof pnlFocoAntesDoModal.focus === "function") pnlFocoAntesDoModal.focus();
  pnlFocoAntesDoModal = null;
}

function pnlAbrirTarefasModal(titulo, opcoes) {
  pnlTarefasEstadoAtual = {
    titulo,
    abas: opcoes.abas || null,
    abaAtiva: opcoes.abas ? (opcoes.abaInicial || opcoes.abas[0].chave) : null,
    lista: opcoes.lista || null,
    mostrarDesigner: !!opcoes.mostrarDesigner,
  };
  document.getElementById("pnlTarefasOverlay").hidden = false;
  document.querySelector(".pnl-tarefas-modal")?.classList.remove("pnl-modal-esforco");
  pnlRenderTarefasModal();
  pnlPrenderFocoNoModal();
}

/** Abre igual ao card "Esforço de hoje" do painel original: tira de pessoas
 *  pra filtrar (clique de novo tira o filtro), ordenar por Data/Tempo/Aba. */
function pnlAbrirEsforcoModal(filtroInicial) {
  pnlTarefasEstadoAtual = {
    titulo: "Esforço de hoje",
    modoEsforco: true,
    esforco: pnlEsforcoPorResponsavel(),
    filtroPessoa: filtroInicial || null,
    // Lembradas por designer (achado da crítica de 2026-08-17: reabrir
    // sempre voltava pra "Data", obrigando reclicar em "Tempo" todo dia).
    ordenacao: pnlLerPref("ordenacao", "data"),
    compacto: pnlLerPref("compacto", "0") === "1",
    selecionadas: new Set(),
  };
  // Fotografia da carga de cada um AO ABRIR, pra comparar com o que ficou
  // ao fechar (ver pnlFecharTarefasModal) — o pop-up existe pra mudar o
  // dia do time, e fechar nunca dizia o que mudou (achado da crítica de
  // 2026-08-17, pergunta provocativa "e se fechar mostrasse o resultado?").
  pnlTarefasEstadoAtual._esforcoInicial = {};
  Object.keys(pnlTarefasEstadoAtual.esforco).forEach(nome => {
    pnlTarefasEstadoAtual._esforcoInicial[nome] = pnlTarefasEstadoAtual.esforco[nome].min;
  });
  document.getElementById("pnlTarefasOverlay").hidden = false;
  document.querySelector(".pnl-tarefas-modal")?.classList.add("pnl-modal-esforco");
  pnlRenderTarefasModal();
  pnlPrenderFocoNoModal();
}

function pnlFecharTarefasModal() {
  const st = pnlTarefasEstadoAtual;
  document.getElementById("pnlTarefasOverlay").hidden = true;
  // Se a pessoa fechou o pop-up com o calendário, o menu de etapa ou o
  // seletor de pessoa ainda abertos por cima, eles ficariam órfãos na tela.
  document.querySelectorAll(".colmeia-calendario, .status-menu, .pnl-menu-pessoa, .pnl-menu-data").forEach(el => el.remove());
  pnlSoltarFocoDoModal();

  // Resumo do que mudou, só quando algo mudou de verdade — compara a
  // carga de quando abriu com a de agora (recalculada na hora, não
  // guardada: reflete tudo que aconteceu, inclusive edições feitas por
  // trás enquanto o pop-up estava aberto).
  if (st && st.modoEsforco && st._esforcoInicial) {
    const agora = pnlEsforcoPorResponsavel();
    const mudou = Object.keys(st._esforcoInicial)
      .filter(nome => agora[nome] && agora[nome].min !== st._esforcoInicial[nome])
      .map(nome => `${nome}: ${pnlFormatTempo(st._esforcoInicial[nome])} → ${pnlFormatTempo(agora[nome].min)}`);
    if (mudou.length) mostrarToast("Você reorganizou: " + mudou.join(" · "), "sucesso");
  }
  pnlTarefasEstadoAtual = null;
}

function pnlRenderTarefasModal() {
  const st = pnlTarefasEstadoAtual;
  if (!st) return;
  document.getElementById("pnlTarefasTitulo").textContent = st.titulo;
  const corpo = document.getElementById("pnlTarefasConteudo");

  if (st.modoEsforco) {
    pnlRenderEsforcoModalCorpo(st, corpo);
    return;
  }

  const lista = st.abas ? st.abas.find(a => a.chave === st.abaAtiva).lista : st.lista;
  const abasHtml = st.abas ? `
    <div class="pnl-tarefas-abas">
      ${st.abas.map(a => `<button type="button" class="pnl-tarefas-aba ${a.chave === st.abaAtiva ? "active" : ""}" data-pnl-aba="${a.chave}">${escaparHTML(a.label)} (${a.lista.length})</button>`).join("")}
    </div>
  ` : "";

  const estaveis = pnlListaEstavel(st, `aba:${st.abaAtiva || "-"}`, lista);
  pnlPintarListaPreservandoRolagem(corpo, `
    ${abasHtml}
    <div class="pnl-tarefas-lista">
      ${estaveis.length ? estaveis.map(x => pnlLinhaTarefaHTML(x.t, st.mostrarDesigner, x.saiu)).join("")
        : `<div class="pnl-vazio">Nada aqui.</div>`}
    </div>
  `);

  corpo.querySelectorAll("[data-pnl-aba]").forEach(btn => {
    btn.addEventListener("click", () => { st.abaAtiva = btn.dataset.pnlAba; pnlRenderTarefasModal(); });
  });
  pnlWireLinhasDoModal(corpo, st);
}

function pnlRenderEsforcoModalCorpo(st, corpo) {
  const nomes = Object.keys(st.esforco).sort((a, b) => st.esforco[b].min - st.esforco[a].min);

  const tiraHtml = `
    <div class="pnl-esforco-tira">
      ${nomes.map(nome => {
        const g = st.esforco[nome];
        const qtd = g.tarefas.length;
        const livre = qtd === 0;
        const nivel = livre ? "livre" : pnlNivelDeCarga(g.min);
        const pct = Math.min(100, Math.round(g.min / PNL_ESFORCO_LIMITE_MIN * 100));
        return `
          <button type="button" class="pnl-esforco-tira-item ${st.filtroPessoa === nome ? "selecionado" : ""} ${livre ? "livre" : ""}"
                  data-pnl-esforco-filtro="${escaparHTML(nome)}" aria-pressed="${st.filtroPessoa === nome}">
            ${typeof avatarHTML === "function" ? avatarHTML(nome, "pnl-esforco-tira-avatar") : ""}
            <div class="pnl-esforco-tira-nome">${escaparHTML(nome)}</div>
            <div class="pnl-esforco-tira-tempo nivel-${nivel}">${livre ? "livre" : escaparHTML(pnlFormatTempo(g.min))}</div>
            <div class="pnl-carga-barra"><span class="nivel-${nivel}" style="width:${pct}%"></span></div>
            <div class="pnl-esforco-tira-qtd">${qtd} tarefa${qtd === 1 ? "" : "s"}</div>
            ${g.semCadastro ? `<div class="pnl-esforco-tira-aviso">${g.semCadastro} sem tempo cadastrado</div>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;

  let linhas = [];
  nomes.forEach(nome => {
    if (st.filtroPessoa && st.filtroPessoa !== nome) return;
    st.esforco[nome].tarefas.forEach(t => linhas.push(t));
  });

  if (st.ordenacao === "tempo") {
    // null (sem cadastro) vai pro FIM, não pro topo — não é "tarefa de zero
    // minuto", é dado faltando.
    linhas.sort((a, b) => {
      const ta = pnlTempoMedioCadastrado(a.assignee, a.client);
      const tb = pnlTempoMedioCadastrado(b.assignee, b.client);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    });
  } else if (st.ordenacao === "aba") {
    const ordemEtapa = {};
    (typeof columnsDef !== "undefined" ? columnsDef : []).forEach((c, i) => { ordemEtapa[c.key] = i; });
    linhas.sort((a, b) => (ordemEtapa.hasOwnProperty(a.status) ? ordemEtapa[a.status] : 99) - (ordemEtapa.hasOwnProperty(b.status) ? ordemEtapa[b.status] : 99));
  } else {
    linhas.sort((a, b) => (a.dueISO || "9999").localeCompare(b.dueISO || "9999"));
  }

  const estaveis = pnlListaEstavel(st, `esf:${st.filtroPessoa || "-"}:${st.ordenacao}`, linhas);
  pnlPintarListaPreservandoRolagem(corpo, `
    ${tiraHtml}
    <div class="pnl-ordenar-row">
      <span class="pnl-ordenar-label">Ordenar por:</span>
      <button type="button" class="pnl-sort-btn ${st.ordenacao === "data" ? "active" : ""}" data-pnl-ordenar="data" aria-pressed="${st.ordenacao === "data"}">Data</button>
      <button type="button" class="pnl-sort-btn ${st.ordenacao === "tempo" ? "active" : ""}" data-pnl-ordenar="tempo" aria-pressed="${st.ordenacao === "tempo"}">Tempo</button>
      <button type="button" class="pnl-sort-btn ${st.ordenacao === "aba" ? "active" : ""}" data-pnl-ordenar="aba" aria-pressed="${st.ordenacao === "aba"}">Aba</button>
      <span style="flex:1"></span>
      <button type="button" class="pnl-sort-btn ${st.compacto ? "active" : ""}" data-pnl-compacto aria-pressed="${!!st.compacto}">${st.compacto ? "Compacto" : "Modo compacto"}</button>
    </div>
    <div class="pnl-tarefas-lista ${st.compacto ? "compacta" : ""}">
      ${estaveis.length ? estaveis.map(x => pnlLinhaTarefaHTML(x.t, true, x.saiu, st)).join("") : `<div class="pnl-vazio">Nenhuma tarefa planejada pra hoje.</div>`}
    </div>
  `);

  corpo.querySelectorAll("[data-pnl-esforco-filtro]").forEach(el => {
    el.addEventListener("click", () => {
      const nome = el.dataset.pnlEsforcoFiltro;
      st.filtroPessoa = st.filtroPessoa === nome ? null : nome;
      pnlRenderTarefasModal();
    });
  });
  corpo.querySelectorAll("[data-pnl-ordenar]").forEach(btn => {
    btn.addEventListener("click", () => {
      st.ordenacao = btn.dataset.pnlOrdenar;
      pnlSalvarPref("ordenacao", st.ordenacao);
      pnlRenderTarefasModal();
    });
  });
  corpo.querySelector("[data-pnl-compacto]")?.addEventListener("click", () => {
    st.compacto = !st.compacto;
    pnlSalvarPref("compacto", st.compacto ? "1" : "0");
    pnlRenderTarefasModal();
  });

  pnlWireLinhasDoModal(corpo, st);
  if (st.selecionadas) pnlRenderBarraDeLote(st, corpo);
}

/**
 * Barra "N selecionadas" no fim da lista — só aparece com pelo menos 1
 * marcada. Reusa pnlAbrirMenuDeData/pnlAbrirSeletorDePessoa (as MESMAS
 * caixinhas do clique em uma linha só), aplicando o resultado em todas as
 * selecionadas de uma vez (achado da crítica de 2026-08-17: "o formato
 * real do trabalho é jogar 4 tarefas pra quinta, não editar 4 vezes").
 *
 * Cada tarefa é um registro INDEPENDENTE no Runrun.it (diferente da
 * aprovação de peças em aprovar.html, que disputa a mesma linha da
 * planilha) — por isso não precisa de fila sequencial: dispara todas de
 * uma vez, e cada pnlTrocarDataOtimista/pnlTrocarPessoaOtimista já cuida
 * do próprio sucesso/erro e do próprio toast, igual faria clicando uma a
 * uma.
 */
function pnlRenderBarraDeLote(st, corpo) {
  let barra = corpo.querySelector(".pnl-lote-barra");
  const n = st.selecionadas.size;
  if (!n) { if (barra) barra.remove(); return; }
  if (!barra) {
    barra = document.createElement("div");
    barra.className = "pnl-lote-barra";
    corpo.querySelector(".pnl-tarefas-lista")?.after(barra);
  }
  barra.innerHTML = `
    <strong>${n} selecionada${n === 1 ? "" : "s"}</strong>
    <button type="button" data-pnl-lote-data>Mudar a data das ${n}</button>
    <button type="button" data-pnl-lote-pessoa>Passar pra outra pessoa</button>
    <button type="button" data-pnl-lote-limpar>Limpar</button>`;
  barra.querySelector("[data-pnl-lote-limpar]").onclick = () => { st.selecionadas.clear(); pnlRenderTarefasModal(); };
  barra.querySelector("[data-pnl-lote-data]").onclick = ev => {
    const primeira = pnlAcharTarefaPorId(st, [...st.selecionadas][0]);
    if (!primeira) return;
    pnlAbrirMenuDeData(st, primeira, ev.target, novaData => {
      st.selecionadas.forEach(id => { const t = pnlAcharTarefaPorId(st, id); if (t) pnlTrocarDataOtimista(st, t, novaData); });
      st.selecionadas.clear();
      pnlRenderTarefasModal();
    });
  };
  barra.querySelector("[data-pnl-lote-pessoa]").onclick = ev => {
    const primeira = pnlAcharTarefaPorId(st, [...st.selecionadas][0]);
    if (!primeira) return;
    pnlAbrirSeletorDePessoa(primeira, ev.target, (userId, nome) => {
      st.selecionadas.forEach(id => { const t = pnlAcharTarefaPorId(st, id); if (t) pnlTrocarPessoaOtimista(st, t, userId, nome); });
      st.selecionadas.clear();
      pnlRenderTarefasModal();
    });
  };
}

/** Acha, em qualquer formato de estado do modal, a tarefa de verdade por id
 *  (pra editar data/etapa em cima do objeto real de tasksTodas). */
function pnlAcharTarefaPorId(st, id) {
  // Primeiro o objeto VIVO do quadro: a varredura em segundo plano troca as
  // tarefas por objetos novos, e editar uma cópia velha mudaria um objeto
  // que já não está em lugar nenhum (o mesmo bug de comparar por referência
  // documentado no CLAUDE.md, só que na hora de escrever).
  const viva = (typeof tasksTodas !== "undefined" ? tasksTodas : []).find(t => String(t.id) === String(id));
  if (viva) return viva;

  const pools = [];
  if (st.lista) pools.push(st.lista);
  if (st.abas) st.abas.forEach(a => pools.push(a.lista));
  if (st.esforco) Object.values(st.esforco).forEach(g => pools.push(g.tarefas));
  for (const pool of pools) {
    const achada = pool.find(t => String(t.id) === String(id));
    if (achada) return achada;
  }
  // Linha que já saiu da lista mas continua na tela (ver pnlListaEstavel).
  if (st._linhasConhecidas) return st._linhasConhecidas.get(String(id)) || null;
  return null;
}

/** Depois de editar data/etapa, refaz os números que podem ter mudado —
 *  esforço/KPIs de Runrun.it — sem fechar o pop-up.
 *
 *  `confirmado` = a mudança já foi aceita pelo Runrun.it. Só aí é que vale
 *  mandar o quadro se atualizar: pedir a atualização durante a mudança
 *  otimista faria a busca voltar com o valor ANTIGO (a escrita ainda nem
 *  chegou lá) — era um dos jeitos de a data "aparecer e voltar". */
function pnlAtualizarTudoAposEditar(st, confirmado) {
  if (st.modoEsforco) st.esforco = pnlEsforcoPorResponsavel();
  pnlRenderTarefasModal();
  pnlRenderDesigners();
  pnlRenderRunrunKPIs();
  if (confirmado && typeof agendarAtualizacaoKanban === "function") agendarAtualizacaoKanban();
}

/**
 * Troca a Entrega Desejada NA HORA, sem esperar o Runrun.it.
 *
 * O que era antes: o botão virava "Salvando...", a tela travava esperando
 * a resposta e só então a lista se refazia. Como a lista é ordenada por
 * data, a tarefa editada pulava de lugar (ou sumia da lista, se a data
 * nova a tirasse de "atrasadas/hoje") no mesmo instante em que a pessoa
 * ainda estava olhando pra ela — a queixa do Cláudio de "estou olhando
 * uma, quando vejo ela foi pra cima sozinha e perdi ela".
 *
 * Agora são três coisas juntas, e é a combinação delas que resolve:
 *   1. a data muda na hora (otimista) e volta sozinha só se o Runrun.it
 *      recusar de verdade;
 *   2. `marcarEscritaOtimista` impede a varredura automática do quadro de
 *      trazer a data velha de volta nos segundos seguintes;
 *   3. a ordem da lista fica CONGELADA enquanto o pop-up está aberto (ver
 *      pnlListaEstavel) — a linha editada não sai do lugar nem some;
 *      quando ela deixa de pertencer à lista, fica ali esmaecida com um
 *      aviso, em vez de desaparecer debaixo do olho de quem editou.
 */
function pnlTrocarDataOtimista(st, t, novaData) {
  if (!novaData || novaData === t.dueISO) return;
  const dueISOAntigo = t.dueISO;
  const dueAntigo = t.due;
  const [ano, mes, dia] = novaData.split("-").map(Number);

  marcarEscritaOtimista(t, {
    dueISO: novaData,
    due: `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`,
  });
  pnlAtualizarTudoAposEditar(st, false);
  pnlPiscarLinhaDaTarefa(t.id);

  enviarEscritaNoBackend({ acao: "alterarEntrega", taskId: t.id, novaData }, "mudar a entrega desejada")
    .then(resultado => {
      if (resultado && resultado.ok) {
        if (pnlTarefasEstadoAtual === st && typeof agendarAtualizacaoKanban === "function") agendarAtualizacaoKanban();
        // Esta é a ação mais consequente e mais barata da tela ao mesmo
        // tempo: mexe na entrega de um cliente de verdade com um clique,
        // dezenas de vezes por dia (achado da crítica de 2026-08-17).
        // mostrarToastComDesfazer já existe (js/config.js) — feita pro
        // mesmo padrão noutra tela. A escrita já saiu pro backend acima,
        // então "confirmar" (6s depois, sem clicar em nada) não precisa
        // fazer mais nada; "Desfazer" chama esta MESMA função de novo com
        // a data velha — como ela já é otimista, desfazer é só trocar de novo.
        mostrarToastComDesfazer(
          `Entrega de "${t.title}" mudou pra ${t.due}.`,
          () => pnlTrocarDataOtimista(st, t, dueISOAntigo),
          null
        );
        return;
      }
      // Recusa de verdade — devolve a data antiga e tira a proteção, senão
      // a varredura ficaria segurando o valor errado até a janela vencer.
      t.dueISO = dueISOAntigo;
      t.due = dueAntigo;
      desmarcarEscritaOtimista(t, ["dueISO", "due"]);
      if (pnlTarefasEstadoAtual === st) pnlAtualizarTudoAposEditar(st, false);
      mostrarToast((resultado && resultado.error) ? String(resultado.error).slice(0, 60) : "Não consegui salvar a nova data.", "erro");
    });
}

/**
 * Passar a tarefa pra outra pessoa direto no pop-up — a alavanca que
 * faltava (achado da crítica de 2026-08-17): reequilibrar tem duas
 * alavancas, outro DIA e outra PESSOA, e o pop-up só dava a primeira.
 * `reatribuirTarefaNoBackend` já existe e já é usada pelo quadro
 * (js/kanban-polling.js) — reusada aqui, não reimplementada. Mesma receita
 * otimista de pnlTrocarDataOtimista, acima.
 */
function pnlTrocarPessoaOtimista(st, t, userId, nomeNovo) {
  if (!nomeNovo || nomeNovo === t.assignee) return;
  const antigoNome = t.assignee, antigoAvatar = t.assigneeAvatarUrl;

  marcarEscritaOtimista(t, { assignee: nomeNovo });
  pnlAtualizarTudoAposEditar(st, false);
  pnlPiscarLinhaDaTarefa(t.id);

  reatribuirTarefaNoBackend(t.id, userId, nomeNovo).then(ok => {
    if (ok) {
      if (pnlTarefasEstadoAtual === st && typeof agendarAtualizacaoKanban === "function") agendarAtualizacaoKanban();
      return;
    }
    t.assignee = antigoNome;
    t.assigneeAvatarUrl = antigoAvatar;
    desmarcarEscritaOtimista(t, ["assignee"]);
    if (pnlTarefasEstadoAtual === st) pnlAtualizarTudoAposEditar(st, false);
    mostrarToast("Não consegui passar essa tarefa pra outra pessoa agora.", "erro");
  });
}

/** Menu com a lista de gente do Runrun.it (mesma fonte do seletor do
 *  quadro, buscarUsuariosRunrun) ancorado no botão clicado. Reusa
 *  posicionarPopupFixo (js/config.js), o mesmo que o calendário usa. */
async function pnlAbrirSeletorDePessoa(t, ancoraEl, aoEscolher) {
  document.querySelectorAll(".pnl-menu-pessoa").forEach(m => m.remove());
  const menu = document.createElement("div");
  menu.className = "pnl-menu-pessoa";
  menu.innerHTML = `<div class="pnl-menu-pessoa-carregando">Carregando pessoas...</div>`;
  document.body.appendChild(menu);
  posicionarPopupFixo(menu, ancoraEl);

  const fechar = () => { menu.remove(); document.removeEventListener("click", foraDoMenu); };
  const foraDoMenu = ev => { if (!menu.contains(ev.target) && ev.target !== ancoraEl) fechar(); };
  setTimeout(() => document.addEventListener("click", foraDoMenu), 0);

  const usuarios = await buscarUsuariosRunrun();
  if (!menu.isConnected) return; // fechou enquanto carregava
  if (!usuarios.length) { menu.innerHTML = `<div class="pnl-menu-pessoa-carregando">Não consegui buscar a lista.</div>`; return; }
  menu.innerHTML = usuarios.map(u => `
    <button type="button" data-user-id="${u.id}" data-user-nome="${escaparHTML(u.nome)}">
      ${typeof avatarHTML === "function" ? avatarHTML(u.nome, "avatar-sm", u.foto, { runrunId: u.id, email: u.email }) : ""}
      <span>${escaparHTML(u.nome)}</span>
    </button>
  `).join("");
  menu.querySelectorAll("button[data-user-id]").forEach(opt => {
    opt.addEventListener("click", () => {
      fechar();
      aoEscolher(opt.dataset.userId, opt.dataset.userNome);
    });
  });
}

/** Quanto essa pessoa JÁ tem marcado pra um dia específico — usado no menu
 *  de atalho de data, pra o dia de destino deixar de ser uma aposta às
 *  cegas (achado da crítica de 2026-08-17). Mesma regra de
 *  pnlTempoMedioCadastrado: tarefa sem cadastro não soma no minuto, mas
 *  ainda conta como carga (semCadastro). */
function pnlCargaDoDiaPra(nomeDesigner, iso) {
  let min = 0, semCadastro = 0;
  pnlTarefasAbertas().forEach(t => {
    if (t.dueISO !== iso || (t.assignee || "") !== nomeDesigner) return;
    const m = pnlTempoMedioCadastrado(t.assignee, t.client);
    if (m === null) semCadastro++; else min += m;
  });
  return { min, semCadastro };
}

/** Próximos N dias ÚTEIS a partir de hoje (pula sábado/domingo — a agência
 *  não posta nem entrega fim de semana). */
function pnlProximosDiasUteis(n) {
  const dias = [];
  const d = new Date();
  while (dias.length < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const diaDaSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
    const rotulo = dias.length === 0 ? "Amanhã" : `${diaDaSemana} · ${d.getDate()} ${MESES_ABREV[d.getMonth()]}`;
    dias.push({ iso, rotulo });
  }
  return dias;
}

/**
 * Menu de atalho ao clicar na pílula de data: os próximos 3 dias úteis,
 * cada um já mostrando a carga que a pessoa tem NAQUELE dia — em vez de
 * abrir o mês inteiro direto pra "joga pra amanhã", o caso mais comum
 * (achado da crítica de 2026-08-17: "o dia de destino era uma aposta às
 * cegas"). "Escolher outra data…" no fim cai no calendário de sempre.
 */
function pnlAbrirMenuDeData(st, t, ancoraEl, aoEscolher) {
  document.querySelectorAll(".pnl-menu-data").forEach(m => m.remove());
  const menu = document.createElement("div");
  menu.className = "pnl-menu-data";
  const dias = pnlProximosDiasUteis(3);
  menu.innerHTML = dias.map(d => {
    const carga = pnlCargaDoDiaPra(t.assignee, d.iso);
    const nivel = pnlNivelDeCarga(carga.min);
    return `<button type="button" data-pnl-dia="${d.iso}">${escaparHTML(d.rotulo)}
      <span class="pnl-menu-data-carga nivel-${nivel}">${carga.min ? escaparHTML(pnlFormatTempo(carga.min)) : "livre"}</span></button>`;
  }).join("") + `<hr><button type="button" data-pnl-dia="calendario">Escolher outra data…</button>`;
  document.body.appendChild(menu);
  posicionarPopupFixo(menu, ancoraEl);

  const fechar = () => { menu.remove(); document.removeEventListener("click", foraDoMenu); };
  const foraDoMenu = ev => { if (!menu.contains(ev.target) && ev.target !== ancoraEl) fechar(); };
  setTimeout(() => document.addEventListener("click", foraDoMenu), 0);

  menu.querySelectorAll("[data-pnl-dia]").forEach(btn => {
    btn.addEventListener("click", () => {
      fechar();
      if (btn.dataset.pnlDia === "calendario") {
        abrirCalendarioColmeia({ ancoraEl, valorInicial: t.dueISO || "", onEscolher: aoEscolher });
      } else {
        aoEscolher(btn.dataset.pnlDia);
      }
    });
  });
}

/** Pisca a linha da tarefa que acabou de mudar — é o que dá a sensação de
 *  "pronto, mudou" sem nenhum "Salvando..." no meio. */
function pnlPiscarLinhaDaTarefa(taskId) {
  requestAnimationFrame(() => {
    const linha = document.querySelector(`.pnl-tarefa-row[data-pnl-row-id="${CSS.escape(String(taskId))}"]`);
    if (!linha) return;
    linha.classList.remove("pnl-tarefa-row-mudou");
    void linha.offsetWidth; // reinicia a animação se clicar duas vezes seguidas
    linha.classList.add("pnl-tarefa-row-mudou");
  });
}

/**
 * ORDEM CONGELADA — a razão de existir: a lista do pop-up é ordenada por
 * data/tempo/etapa, ou seja, por campos que a própria pessoa está editando
 * ali dentro. Reordenar a cada edição é matematicamente certo e na prática
 * insuportável: o item que você acabou de mexer pula de lugar, e o próximo
 * que você ia mexer já não está mais onde estava.
 *
 * Então: a ordem é decidida UMA VEZ, quando a visão abre, e não muda mais
 * enquanto o pop-up estiver aberto naquela visão. Trocar de aba, de filtro
 * de pessoa ou de critério de ordenação é um pedido explícito de reordenar
 * — aí sim recalcula (é a `chaveVisao`).
 *
 * Tarefa que deixou de pertencer à lista (mudou de data e saiu de "hoje",
 * ou alguém a entregou do outro lado) NÃO some: continua na mesma linha,
 * esmaecida, com o aviso de que já não está mais ali. Some de verdade só
 * quando o pop-up for reaberto. Sumir na hora é o mesmo problema de pular
 * de lugar, só que pior.
 */
function pnlListaEstavel(st, chaveVisao, linhas) {
  const idsAgora = new Map(linhas.map(t => [String(t.id), t]));

  if (st._ordemVisao !== chaveVisao) {
    st._ordemVisao = chaveVisao;
    st._ordemIds = linhas.map(t => String(t.id));
    st._linhasConhecidas = idsAgora;
    return linhas.map(t => ({ t, saiu: false }));
  }

  // Guarda a versão mais nova de cada tarefa que continua na lista, pra
  // quando ela sair a linha ainda mostrar o dado certo (a data NOVA, que é
  // justamente o motivo de ela ter saído).
  idsAgora.forEach((t, id) => st._linhasConhecidas.set(id, t));

  const saida = [];
  const vivas = typeof tasksTodas !== "undefined" ? tasksTodas : [];
  st._ordemIds.forEach(id => {
    // Pra quem já saiu da lista, pega a versão viva do quadro se ainda
    // existir — assim a linha esmaecida mostra o dado ATUAL da tarefa
    // (inclusive a data nova, que foi o motivo de ela ter saído).
    let t = idsAgora.get(id);
    if (!t) {
      const viva = vivas.find(x => String(x.id) === id);
      if (viva) st._linhasConhecidas.set(id, viva);
      t = st._linhasConhecidas.get(id);
    }
    if (t) saida.push({ t, saiu: !idsAgora.has(id) });
  });
  const jaListados = new Set(st._ordemIds);
  linhas.forEach(t => {
    const id = String(t.id);
    if (jaListados.has(id)) return;
    st._ordemIds.push(id);
    saida.push({ t, saiu: false });
  });
  return saida;
}

/** Redesenha o corpo do pop-up sem perder onde a pessoa estava na rolagem
 *  — a lista pode ser longa e refazer o HTML joga o scroll pro topo. */
function pnlPintarListaPreservandoRolagem(corpo, html) {
  const anterior = corpo.querySelector(".pnl-tarefas-lista");
  const rolagem = anterior ? anterior.scrollTop : 0;
  const rolagemCorpo = corpo.scrollTop;
  corpo.innerHTML = html;
  const nova = corpo.querySelector(".pnl-tarefas-lista");
  if (nova && rolagem) nova.scrollTop = rolagem;
  if (rolagemCorpo) corpo.scrollTop = rolagemCorpo;
}

function pnlWireLinhasDoModal(corpo, st) {
  corpo.querySelectorAll("[data-pnl-abrir-tarefa]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.pnlAbrirTarefa;
      pnlFecharTarefasModal();
      if (typeof abrirTarefaPorId === "function") abrirTarefaPorId(id);
    });
  });

  // Data de entrega desejada — mesmo calendário do pop-up de detalhe.
  corpo.querySelectorAll("[data-pnl-editar-data]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const t = pnlAcharTarefaPorId(st, btn.dataset.pnlEditarData);
      if (!t || typeof abrirCalendarioColmeia !== "function") return;
      pnlAbrirMenuDeData(st, t, btn, novaData => pnlTrocarDataOtimista(st, t, novaData));
    });
  });

  // Etapa — mesmo menu do pop-up de detalhe (abrirMenuEtapa já chama
  // moverEtapaNoBackend e desfaz sozinho se o Runrun.it recusar).
  corpo.querySelectorAll("[data-pnl-editar-etapa]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const t = pnlAcharTarefaPorId(st, btn.dataset.pnlEditarEtapa);
      if (!t || typeof abrirMenuEtapa !== "function") return;
      abrirMenuEtapa(t, btn, () => pnlAtualizarTudoAposEditar(st));
    });
  });

  // Designer — a outra alavanca de reequilíbrio (ver pnlTrocarPessoaOtimista).
  corpo.querySelectorAll("[data-pnl-trocar-pessoa]").forEach(btn => {
    btn.addEventListener("click", ev => {
      ev.stopPropagation();
      const t = pnlAcharTarefaPorId(st, btn.dataset.pnlTrocarPessoa);
      if (!t) return;
      pnlAbrirSeletorDePessoa(t, btn, (userId, nome) => pnlTrocarPessoaOtimista(st, t, userId, nome));
    });
  });

  // Seleção em lote (só existe quando st.selecionadas foi criado —
  // ver pnlAbrirEsforcoModal). Não redesenha a lista inteira ao marcar/
  // desmarcar, só a barra — senão a rolagem e o foco pulariam a cada clique.
  corpo.querySelectorAll("[data-pnl-marcar]").forEach(chk => {
    chk.addEventListener("click", ev => ev.stopPropagation());
    chk.addEventListener("change", () => {
      if (!st.selecionadas) return;
      const id = chk.dataset.pnlMarcar;
      chk.checked ? st.selecionadas.add(id) : st.selecionadas.delete(id);
      chk.closest(".pnl-tarefa-row")?.classList.toggle("pnl-tarefa-row-marcada", chk.checked);
      pnlRenderBarraDeLote(st, corpo);
    });
  });
}

// Cores das etapas do quadro — mesmas 5 colunas de columnsDef (js/config.js),
// só que em versão "suave" (fundo claro + texto colorido), igual toda outra
// etiqueta do painel. Etapa fora das 5 colunas (ex: "Aprovação Cliente", um
// card mãe) cai no neutro — o menu de etapa continua deixando mover pra
// qualquer uma das 5 a partir daí.
const PNL_ETAPA_CORES = {
  // ⚠️ "pendentes" NÃO pode usar var(--page-bg): a própria linha da tarefa
  // (.pnl-tarefa-row) já é var(--card-bg) — a pastilha ficaria quase igual
  // ao fundo dela. var(--border) é o tom seguinte, sempre diferente nos
  // dois temas (ver css/01-base.css).
  // `fg` usa os tokens -on-soft (não --warning/--purple/--danger direto):
  // aqueles são pra preenchimento sólido e ficavam abaixo de 3,7:1 aqui —
  // "Fazendo" chegava a 1,84:1 (achado da crítica de 2026-08-17).
  pendentes: { bg: "var(--border)", fg: "var(--text-secondary)" },
  prioridades: { bg: "var(--accent-soft)", fg: "var(--accent)" },
  fazendo: { bg: "var(--warning-soft)", fg: "var(--warning-on-soft)" },
  revisao: { bg: "var(--purple-soft)", fg: "var(--purple-on-soft)" },
  ajustes: { bg: "var(--danger-soft)", fg: "var(--danger-on-soft)" },
};
function pnlCorDaEtapa(t) {
  if (t.entregue) return { bg: "var(--pnl-sucesso-suave)", fg: "var(--success-on-soft)" };
  return PNL_ETAPA_CORES[t.status] || { bg: "var(--border)", fg: "var(--text-secondary)" };
}

// Ícone de calendário reaproveitado na etiqueta "Publica X" — mesmo traço
// (stroke-width 1.8) dos outros ícones já usados no painel.
const PNL_ICONE_CALENDARIO = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function pnlLinhaTarefaHTML(t, mostrarDesigner, saiuDaLista, st) {
  // Caixinha de seleção em lote — só quando o chamador passa `st` com
  // `selecionadas` (hoje só o modal "Esforço de hoje"; o modal genérico de
  // tarefas continua sem lote, fora de escopo). `pnlAcharTarefaPorId` não
  // se aplica aqui porque `t` já é o objeto de verdade.
  const emLote = !!(st && st.selecionadas);
  const marcada = emLote && st.selecionadas.has(String(t.id));
  const hoje = hojeISO();
  const atrasada = t.dueISO && t.dueISO < hoje && !t.entregue;
  const dataCurta = t.due || "sem data";
  const designerCol = mostrarDesigner && t.assignee ? pnlCorPorHash(t.assignee) : null;
  const clienteCol = t.client ? pnlCorPorHash(t.client) : null;
  const etapaCor = pnlCorDaEtapa(t);
  const rotuloEtapa = typeof rotuloDaEtapa === "function" ? rotuloDaEtapa(t) : (t.runrunStage || "Sem etapa");
  const publicacaoCurta = pnlFormatDataCurta(t.dataPublicacao);
  // Entrega marcada DEPOIS do dia de postar — o erro que o calendário da
  // Central já existe pra pegar, mas nesta tela (onde ele é COMETIDO) não
  // avisava nada (achado da crítica de 2026-08-17). Avisa, não bloqueia:
  // às vezes atrasar a entrega é a decisão certa.
  const depoisDaPublicacao = !!(t.dataPublicacao && t.dueISO && t.dueISO > t.dataPublicacao);
  // Tempo cadastrado pelo Cláudio na aba do designer (ver pnlTempoMedioCadastrado)
  // — não a média genérica do Runrun.it. `null` = nunca cadastrou pra essa
  // dupla designer+cliente; a pílula mostra "—", não "0min" (achado da
  // crítica de 2026-08-17 — "0min" escondia tarefa sem cadastro).
  const tempoCadastrado = pnlTempoMedioCadastrado(t.assignee, t.client);
  const semTempo = tempoCadastrado === null;
  const tituloTempo = semTempo
    ? `Sem tempo cadastrado pra ${t.assignee || "esse designer"} + ${t.client || "esse cliente"} — esta tarefa não conta no esforço do dia`
    : `Tempo médio cadastrado na aba de ${t.assignee || ""}`;

  return `
    <div class="pnl-tarefa-row ${saiuDaLista ? "pnl-tarefa-row-saiu" : ""} ${marcada ? "pnl-tarefa-row-marcada" : ""}" data-pnl-row-id="${escaparHTML(String(t.id))}">
      ${emLote ? `<input type="checkbox" class="pnl-tarefa-chk" data-pnl-marcar="${escaparHTML(String(t.id))}" ${marcada ? "checked" : ""} aria-label="Selecionar ${escaparHTML(t.title || "tarefa")}">` : ""}
      <div class="pnl-tarefa-info">
        <button type="button" class="pnl-tarefa-titulo-btn" data-pnl-abrir-tarefa="${escaparHTML(String(t.id))}" title="Abrir a tarefa no Colmeia">${escaparHTML(t.title || "Sem título")}</button>
        <div class="pnl-tarefa-badges">
          ${saiuDaLista ? `<span class="pnl-tag pnl-tag-saiu" title="Continua aqui só pra você não perder ela de vista — some quando reabrir o pop-up">já não entra nesta lista</span>` : ""}
          ${designerCol ? `<button type="button" class="pnl-tag pnl-tag-designer" style="background:${designerCol.bg};color:${designerCol.fg};" data-pnl-trocar-pessoa="${escaparHTML(String(t.id))}" title="Clique pra passar pra outra pessoa">${escaparHTML(t.assignee)}</button>` : ""}
          ${clienteCol ? `<span class="pnl-tag" style="background:${clienteCol.bg};color:${clienteCol.fg};">${escaparHTML(t.client)}</span>` : ""}
          ${publicacaoCurta ? `<span class="pnl-pub" title="Data de Publicação (Runrun.it)">${PNL_ICONE_CALENDARIO} Publica ${escaparHTML(publicacaoCurta)}</span>` : ""}
        </div>
      </div>
      <div class="pnl-tarefa-right">
        <button type="button" class="pnl-pill pnl-pill-data ${atrasada ? "atrasada" : ""} ${depoisDaPublicacao ? "pos-publicacao" : ""}" data-pnl-editar-data="${escaparHTML(String(t.id))}" title="${depoisDaPublicacao ? "Entrega marcada DEPOIS do dia de postar (" + escaparHTML(publicacaoCurta) + ") — clique pra trocar" : "Clique pra trocar a Entrega Desejada"}">${escaparHTML(dataCurta)}</button>
        <span class="pnl-pill pnl-pill-tempo ${semTempo ? "sem-tempo" : ""}" title="${escaparHTML(tituloTempo)}">${semTempo ? "—" : escaparHTML(pnlFormatTempo(tempoCadastrado))}</span>
        <button type="button" class="pnl-pill pnl-pill-etapa" style="background:${etapaCor.bg};color:${etapaCor.fg};" data-pnl-editar-etapa="${escaparHTML(String(t.id))}" title="Clique pra mudar a etapa">${escaparHTML(rotuloEtapa)}</button>
        ${t.link ? `<a class="pnl-tarefa-link" href="${escaparHTML(t.link)}" target="_blank" rel="noopener" title="Abrir no Runrun.it">↗</a>` : ""}
      </div>
    </div>
  `;
}

/**
 * "AAAA-MM-DD" -> "10 ago". NUNCA usar `new Date(iso)` com uma data sem
 * hora — em UTC-3 isso volta um dia (vira 21h do dia anterior em UTC), o
 * mesmo bug já documentado no CLAUDE.md (calendário de postagens). Faz o
 * mesmo split na mão que mapearTarefaDoBackend já faz pra `due`.
 */
function pnlFormatDataCurta(iso) {
  if (!iso || typeof iso !== "string") return null;
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!dia || !mes) return null;
  return `${dia} ${MESES_ABREV[mes - 1]}`;
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

  document.getElementById("pnlReatribuirBtn")?.addEventListener("click", pnlAbrirModalReatribuir);

  document.getElementById("pnlModalFechar")?.addEventListener("click", pnlFecharModal);
  document.getElementById("pnlModalOverlay")?.addEventListener("click", ev => {
    if (ev.target.id === "pnlModalOverlay") pnlFecharModal();
  });

  document.getElementById("pnlTarefasFechar")?.addEventListener("click", pnlFecharTarefasModal);
  document.getElementById("pnlTarefasOverlay")?.addEventListener("click", ev => {
    if (ev.target.id === "pnlTarefasOverlay") pnlFecharTarefasModal();
  });

  document.addEventListener("keydown", ev => {
    if (ev.key !== "Escape") return;
    // Com um submenu aberto por cima do pop-up (calendário, menu de etapa,
    // seletor de pessoa), o Esc fecha SÓ ele — fechar o modal inteiro por
    // baixo era um bug de verdade, não só de aparência (achado da crítica
    // de 2026-08-17): quem estava escolhendo uma data perdia a tarefa que
    // estava editando. Este handler é registrado uma vez, no carregamento
    // da página — sempre ANTES de qualquer submenu existir — então checar
    // o DOM aqui é o único jeito confiável de saber quem deve responder
    // primeiro (a ordem de registro dos listeners não ajuda: os submenus
    // só nascem depois que este já está no ar).
    const submenu = document.querySelector(".colmeia-calendario, .status-menu, .pnl-menu-pessoa, .pnl-menu-data");
    if (submenu) { submenu.remove(); return; }
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

// ===== Relatório diário — cache com teto (mesmo padrão de outros Map de
// cache do app: cresce sem limite numa aba aberta o dia todo se não tiver
// teto — ver CLAUDE.md, "Caches — todos têm teto ou validade"). =====
const RELATORIO_CACHE_TETO = 60;
const relatorioDiarioCache = new Map();

function relatorioDiarioChave(designer, dataISO) {
  return designer + "::" + dataISO;
}

async function buscarRelatorioDiario(designer, dataISO) {
  const chave = relatorioDiarioChave(designer, dataISO);
  if (relatorioDiarioCache.has(chave)) return relatorioDiarioCache.get(chave);

  const data = await chamarBackend({ acao: "relatorioDiarioDesigner", designer, dataISO });
  if (caiuARede(data) || !data.ok) return null;

  if (relatorioDiarioCache.size >= RELATORIO_CACHE_TETO) {
    const primeiraChave = relatorioDiarioCache.keys().next().value;
    relatorioDiarioCache.delete(primeiraChave);
  }
  relatorioDiarioCache.set(chave, data);
  return data;
}

// ===== Pop-up "Relatório diário" (Painel de Designers) =====
let relatorioDesignerAtual = null; // nome do designer com o pop-up aberto, ou null
let relatorioDiaAtual = null;      // Date do dia sendo mostrado

function relatorioDataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function abrirRelatorioDesigner(designer) {
  relatorioDesignerAtual = designer;
  relatorioDiaAtual = new Date();
  document.getElementById("reldOverlay").hidden = false;
  await relatorioDiarioRenderizar();
}

function fecharRelatorioDesigner() {
  relatorioDesignerAtual = null;
  document.getElementById("reldOverlay").hidden = true;
}

async function relatorioDiarioIrParaDia(delta) {
  if (!relatorioDiaAtual) return;
  relatorioDiaAtual.setDate(relatorioDiaAtual.getDate() + delta);
  await relatorioDiarioRenderizar();
}

async function relatorioDiarioRenderizar() {
  const corpo = document.getElementById("reldCorpo");
  if (!corpo || !relatorioDesignerAtual || !relatorioDiaAtual) return;

  corpo.innerHTML = `<div class="reld-carregando">Carregando relatório...</div>`;
  document.getElementById("reldTituloDesigner").textContent = relatorioDesignerAtual;
  document.getElementById("reldDataLabel").textContent =
    relatorioDiaAtual.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const dataISO = relatorioDataISO(relatorioDiaAtual);
  const dados = await buscarRelatorioDiario(relatorioDesignerAtual, dataISO);

  // O designer/dia pode ter mudado enquanto a busca estava no ar (clicou
  // rápido nas setas, ou fechou o pop-up) — descarta resposta velha.
  if (!relatorioDesignerAtual || relatorioDataISO(relatorioDiaAtual) !== dataISO) return;

  if (!dados) {
    corpo.innerHTML = `
      <div class="reld-erro">
        Não consegui carregar o relatório de hoje.
        <button type="button" onclick="relatorioDiarioRenderizar()">Tentar de novo</button>
      </div>`;
    return;
  }

  corpo.innerHTML = relatorioDiarioCorpoHTML(dados);
}

function relatorioDiarioCorpoHTML(dados) {
  const tocadas = dados.tocadas || [];
  const entregues = dados.entregues || [];
  const fila = dados.filaDoDia || { total: 0, atrasadas: 0, hojeCerto: 0 };
  const chegaram = dados.chegaramDepoisDas10h || [];

  return `
    <div class="reld-numeros">
      <div class="reld-num-card">
        <div class="reld-num">${tocadas.length}</div>
        <div class="reld-num-label">Tarefas tocadas</div>
      </div>
      <div class="reld-num-card">
        <div class="reld-num">${entregues.length}</div>
        <div class="reld-num-label">Entregues</div>
      </div>
      <div class="reld-num-card">
        <div class="reld-num">${fila.total}</div>
        <div class="reld-num-label">Na fila${fila.atrasadas ? ` <span class="reld-num-sub">${fila.atrasadas} atrasada${fila.atrasadas > 1 ? "s" : ""}</span>` : ""}</div>
      </div>
      <div class="reld-num-card">
        <div class="reld-num">${chegaram.length}</div>
        <div class="reld-num-label">Chegaram depois das 10h</div>
      </div>
    </div>

    <div class="reld-secao">
      <div class="reld-secao-titulo">Entregues no dia</div>
      ${entregues.length === 0 ? `<div class="reld-vazio">Nada entregue neste dia.</div>` : `
        <div class="reld-lista">
          ${entregues.map(relatorioDiarioLinhaEntregueHTML).join("")}
        </div>
      `}
    </div>

    <div class="reld-secao">
      <div class="reld-secao-titulo">Chegou depois das 10h</div>
      ${chegaram.length === 0 ? `<div class="reld-vazio">Nada chegou fora da fila original.</div>` : `
        <div class="reld-lista">
          ${chegaram.map(relatorioDiarioLinhaEventoHTML).join("")}
        </div>
      `}
    </div>
  `;
}

function relatorioDiarioLinhaEntregueHTML(e) {
  const pct = calcularEstimatePct(e.workedSeconds || 0, e.tempoMedioMinutos || 0);
  // calcularEstimatePct trava em 100 (é feita pra barra de progresso do
  // card, que não deve "estourar") — aqui precisamos saber se passou de
  // verdade, então compara os segundos brutos, não o percentual travado.
  const passouDoEsperado = e.tempoMedioMinutos > 0 && (e.workedSeconds || 0) > e.tempoMedioMinutos * 60;
  const gasto = formatarHoras(e.workedSeconds || 0);
  const esperado = e.tempoMedioMinutos ? formatarHoras(e.tempoMedioMinutos * 60) : "—";
  return `
    <div class="reld-linha">
      <div class="reld-linha-topo">
        <span class="reld-linha-titulo">${escaparHTML(e.titulo)}</span>
        <span class="reld-linha-cliente">${escaparHTML(e.cliente || "")}</span>
      </div>
      <div class="reld-linha-barra-wrap">
        <div class="reld-linha-barra ${passouDoEsperado ? "reld-passou" : ""}" style="width:${Math.min(100, pct)}%"></div>
      </div>
      <div class="reld-linha-tempos">Gastou ${gasto}${e.tempoMedioMinutos ? ` · esperado ${esperado}` : ""}</div>
    </div>
  `;
}

function relatorioDiarioLinhaEventoHTML(ev) {
  const icone = ev.tipo === "prioridade" ? "⚡" : "↪";
  const hora = ev.quando ? new Date(ev.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  return `
    <div class="reld-linha reld-linha-evento">
      <span class="reld-evento-icone">${icone}</span>
      <span class="reld-linha-titulo">${escaparHTML(ev.titulo || "")}</span>
      <span class="reld-evento-hora">${hora}</span>
    </div>
  `;
}
