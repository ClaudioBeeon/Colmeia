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
// (o "hoje" de verdade agora vem de hojeISO(), calculado dinamicamente)

// ============================================
// INTEGRAÇÃO REAL — Google Apps Script (Code.gs) + Runrun.it
// ============================================
// Cole aqui a URL do seu Web App do Apps Script depois de publicar o
// Code.gs (Implantar > Nova implantação > Aplicativo da web).
// Enquanto não colar, o Colmeia continua usando os dados fake abaixo.
const COLMEIA_API_URL = "https://script.google.com/macros/s/AKfycbxSKcto3u-463xmhUm2xGUIylkWzYyeU-L-QHEz0bnFPImsl7Vlum5bZJU5vDT-5gOI/exec";

// URL do Web App do painel-designers-beeon (o outro painel, já publicado).
// O Colmeia só faz leitura aqui — nunca escreve nada nesse painel.
const PAINEL_BEEON_API_URL = "https://script.google.com/macros/s/AKfycbzzWtG4jkVpLvPwOAHaj-h9KK9k_8N6YWGUXfFtUDSXRiCj7ILDPvuSy9VJXhglTrzEQQ/exec";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Guarda os dados lidos do painel-designers-beeon (designers, clientes,
// atendimento, fotos) depois que carregarDadosPainelBeeon() rodar.
// Formato: { designers: [...], roles: {...}, state: {...}, fotos: {...} }
let painelBeeonData = null;

/**
 * Busca (só leitura, GET) o estado completo do painel-designers-beeon:
 * lista de designers, papel/especialidade de cada um, e o mapa
 * designer -> lista de clientes (com escopo, atendimento, serviços etc).
 *
 * IMPORTANTE: nunca faz POST pra esse painel — só GET. O Colmeia não
 * altera nada lá.
 *
 * Na primeira vez, mostra no console do navegador (F12 > Console) a
 * estrutura crua que veio, pra confirmarmos onde ficam as fotos de
 * cada designer/cliente (o nome exato do campo pode variar).
 */
async function carregarDadosPainelBeeon() {
  if (!PAINEL_BEEON_API_URL) return;
  try {
    const res = await fetch(PAINEL_BEEON_API_URL);
    const resposta = await res.json();
    if (!resposta.ok) {
      console.error("Erro ao buscar dados do painel-designers-beeon:", resposta.error);
      return;
    }
    if (resposta.empty) {
      console.warn("O painel-designers-beeon respondeu, mas o estado está vazio (nada salvo lá ainda).");
      return;
    }

    // Log de diagnóstico — só na primeira carga, pra confirmarmos os
    // nomes exatos dos campos (principalmente onde ficam as fotos).
    console.log("[Colmeia] Estrutura recebida do painel-designers-beeon:", resposta.data);

    painelBeeonData = {
      designers: resposta.data.designers || [],
      roles: resposta.data.roles || {},
      state: resposta.data.state || {},
      photos: resposta.data.photos || {}, // designer -> URL da foto, confirmado no script.js do painel
    };

    // Depois de carregado, atualiza as páginas que dependem desses dados.
    buildClientsPage();
    buildAtendimentoPage();
    buildTiposPage();
  } catch (err) {
    console.error("Falha ao conectar com o painel-designers-beeon:", err);
  }
}

/**
 * Tenta achar a foto de um designer nos dados vindos do painel-beeon.
 * Confirmado no código-fonte do painel: o campo se chama "photos"
 * (designer -> URL da foto).
 */
function fotoDoDesigner(nomeDesigner) {
  if (!painelBeeonData || !painelBeeonData.photos) return null;
  const chave = Object.keys(painelBeeonData.photos).find(d => nomesCorrespondem(d, nomeDesigner));
  return chave ? painelBeeonData.photos[chave] : null;
}

// Fotos de quem faz o atendimento dos clientes. No painel-designers-beeon
// essa lista é fixa dentro do próprio código (não vem do backend), então
// copiei ela de lá — se alguém novo entrar no atendimento ou uma foto
// mudar, é só atualizar aqui também.
const ATENDIMENTO_PHOTOS_BEEON = {
  "Manu": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833487/Firefly_gpt-image_Transforme_essa_pessoa_em_um_emoji_do_IOS_em_um_fundo_amarelo_claro_mantendo_as_mes_372247_biwncc.png",
  "Laura": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833986/Firefly_gpt-image_Altere_o_fundo_para_roxo_bem_claro_22904_s2j7cx.png",
  "Giovanna": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833487/Firefly_gpt-image_Transforme_essa_pessoa_em_um_emoji_do_IOS_em_um_fundo_azul_claro_mantendo_as_mesmas_372247_1_eroaek.png",
  "João Teles": "https://link-da-foto-do-joao.jpg",
  "Lucas": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833905/Firefly_gpt-image_Transforme_essa_pessoa_em_um_emoji_do_IOS_em_um_fundo_laranja_bem_claro_mantendo_as_372247_sdfav1.png",
};

// Pessoas cadastradas manualmente pelo coordenador (foto customizada e
// apelidos vinculados), carregadas do backend do Colmeia.
let pessoasSalvas = []; // [{nome, foto, aliases: [...]}]

// Todo nome que o código encontra e mostra um avatar, guardado aqui pra
// alimentar a tela de configuração de Pessoas. Chave = nome normalizado.
const nomesVistos = new Map(); // nomeNormalizado -> { nomeOriginal, fotoAtual }

function registrarNomeVisto(nome, foto) {
  if (!nome) return;
  const chave = normalizarParaComparar(nome);
  if (!chave) return;
  const existente = nomesVistos.get(chave);
  nomesVistos.set(chave, {
    nomeOriginal: nome,
    fotoAtual: foto || (existente ? existente.fotoAtual : null),
  });
}

/**
 * Confere se o coordenador já cadastrou manualmente uma foto pra esse
 * nome (ou um apelido dele). Tem prioridade sobre qualquer outra fonte.
 */
function resolverFotoManual(nome) {
  const alvo = normalizarParaComparar(nome);
  for (const p of pessoasSalvas) {
    if (normalizarParaComparar(p.nome) === alvo) return p.foto || null;
    if (p.aliases.some(a => normalizarParaComparar(a) === alvo)) return p.foto || null;
  }
  return null;
}

async function carregarPessoasSalvas() {
  if (!COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarPessoas" }),
    });
    const data = await res.json();
    if (data.ok) {
      pessoasSalvas = data.pessoas || [];
    }
  } catch (err) {
    console.error("Falha ao carregar pessoas salvas:", err);
  }
}

async function salvarPessoaNoBackend(nome, foto, aliases) {
  if (!COLMEIA_API_URL || !nome) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "salvarPessoa", nome, foto, aliases }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (err) {
    console.error("Falha ao salvar pessoa no backend:", err);
    return false;
  }
}

function fotoDoAtendimento(nomeAtendimento) {
  const chave = Object.keys(ATENDIMENTO_PHOTOS_BEEON).find(d => nomesCorrespondem(d, nomeAtendimento));
  return chave ? ATENDIMENTO_PHOTOS_BEEON[chave] : null;
}

function avatarAtendimentoHTML(nome, sizeClass) {
  const foto = resolverFotoManual(nome) || fotoDoAtendimento(nome) || fotoDoDesigner(nome);
  registrarNomeVisto(nome, foto);
  if (foto) {
    return `<img class="avatar ${sizeClass || ""}" src="${foto}" data-nome="${nome}" alt="${nome}" title="${nome}" onerror="handleAvatarImgError(this)">`;
  }
  return `<div class="avatar ${sizeClass || ""}" title="${nome}">${initials(nome)}</div>`;
}

/**
 * Acha quem é o atendimento responsável (c.atend) de um cliente,
 * procurando nos clientes de todos os designers no painel-beeon.
 * Devolve null se o cliente não for encontrado lá (ex: dados fake).
 */
function getAtendimentoDoCliente(nomeCliente) {
  if (!painelBeeonData || !painelBeeonData.state) return null;
  const alvo = normalizarParaComparar(nomeCliente);
  for (const designer of Object.keys(painelBeeonData.state)) {
    const cliente = (painelBeeonData.state[designer] || []).find(c => normalizarParaComparar(c.cliente) === alvo);
    if (cliente && cliente.atend) return cliente.atend;
  }
  return null;
}

/**
 * Se a foto não carregar (link quebrado, offline, etc), troca a imagem
 * pelas iniciais do nome, em vez de deixar o ícone de imagem quebrada.
 */
function handleAvatarImgError(img) {
  const nome = img.getAttribute("data-nome") || "";
  const div = document.createElement("div");
  div.className = img.className;
  div.title = nome;
  div.textContent = initials(nome);
  img.replaceWith(div);
}

function avatarHTML(nomeDesigner, sizeClass, avatarUrlDireto) {
  // Prioridade: 1) foto cadastrada manualmente pelo coordenador, 2) foto
  // do painel-designers-beeon, 3) foto que veio do Runrun.it.
  const foto = resolverFotoManual(nomeDesigner) || fotoDoDesigner(nomeDesigner) || avatarUrlDireto;
  registrarNomeVisto(nomeDesigner, foto);
  if (foto) {
    return `<img class="avatar ${sizeClass || ""}" src="${foto}" data-nome="${nomeDesigner}" alt="${nomeDesigner}" title="${nomeDesigner}" onerror="handleAvatarImgError(this)">`;
  }
  return `<div class="avatar ${sizeClass || ""}" title="${nomeDesigner}">${initials(nomeDesigner)}</div>`;
}

// Frases divertidas do tema colmeia, mostradas em rodízio na tela de
// carregando (em vez de "Atualizando informações do Runrun.it...").
const mensagensCarregando = [
  "Preparando o melzinho...",
  "Ajeitando os favos...",
  "Organizando as abelhinhas...",
  "Polinizando as tarefas...",
  "Zunzunzum no Runrun.it...",
  "Arrumando a colmeia...",
];
let intervalMsgCarregando = null;

function iniciarMensagensCarregando() {
  clearInterval(intervalMsgCarregando);
  let indice = 0;
  intervalMsgCarregando = setInterval(() => {
    indice = (indice + 1) % mensagensCarregando.length;
    const el = document.getElementById("loadingMsg");
    if (!el) { clearInterval(intervalMsgCarregando); return; }
    el.classList.remove("fade-in");
    void el.offsetWidth; // reinicia a animação CSS
    el.textContent = mensagensCarregando[indice];
    el.classList.add("fade-in");
  }, 1800);
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    dueISO: t.due || null, // data completa (ano-mês-dia), usada pra ordenar e saber se está atrasada
    status: t.status,
    runrunStage: t.runrunStage,
    isOutraEtapa: t.isOutraEtapa,
    link: t.link,
    assignee: t.assignee,
    assigneeAvatarUrl: t.assigneeAvatarUrl || null,
    timerSeconds: t.workedSeconds || 0,
    running: !!t.isRunning,
    estimatePct: Math.min(95, Math.round((t.estimateMinutes || 30) / 2)),
    hasChange: false,
  };
}

async function carregarTarefasReais() {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1) {
    // Web App ainda não configurado — usa os dados fake só nesse caso.
    tasks = tasksFake;
    carregandoTarefas = false;
    buildBoard();
    render();
    return;
  }
  try {
    const res = await fetch(COLMEIA_API_URL + "?tipo=tarefas");
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar tarefas do Colmeia:", data.error);
      tasks = tasksFake;
      carregandoTarefas = false;
      buildBoard();
      render();
      return;
    }
    const doKanban = data.tarefas.filter(t => !t.isOutraEtapa).map(mapearTarefaDoBackend);
    tasks = doKanban;
    tasks.forEach(t => { t.estimatePct = t.estimatePct || 0; });
    carregandoTarefas = false;
    buildBoard();
    render();
  } catch (err) {
    console.error("Falha ao conectar com o backend do Colmeia:", err);
    tasks = tasksFake;
    carregandoTarefas = false;
    buildBoard();
    render();
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

/**
 * Dá play numa tarefa de verdade no Runrun.it. Se der erro (ex: endpoint
 * ainda não confirmado), avisa no console mas não trava a tela — o
 * cronômetro local continua rodando mesmo assim.
 */
async function tocarTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "tocarTarefa", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o play:", data.error);
  } catch (err) {
    console.error("Falha ao dar play no Runrun.it:", err);
  }
}

async function pausarTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "pausarTarefa", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o pause:", data.error);
  } catch (err) {
    console.error("Falha ao pausar no Runrun.it:", err);
  }
}

/**
 * Move a tarefa pra outra coluna de verdade no Runrun.it. A regra
 * automática de transferir pro próximo responsável é do próprio
 * Runrun.it — o Colmeia só avisa "mudou de etapa".
 */
/**
 * Avança a tarefa pra próxima pessoa na Sequência de responsáveis
 * (workflow do Runrun.it) — CONFIRMADO funcionando. Diferente de mudar
 * a coluna no Colmeia (isso continua só visual por enquanto, o endpoint
 * de mover coluna ainda não foi confirmado).
 */
async function avancarWorkflowNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return null;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "avancarWorkflow", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Runrun.it recusou avançar a sequência:", data.error);
      return null;
    }
    return data.novoResponsavel || null;
  } catch (err) {
    console.error("Falha ao avançar a sequência no Runrun.it:", err);
    return null;
  }
}

async function reatribuirTarefaNoBackend(taskId, responsavelId) {
  if (!COLMEIA_API_URL || !taskId || !responsavelId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "reatribuir", taskId, responsavelId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou reatribuir:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao reatribuir no Runrun.it:", err);
    return false;
  }
}

/**
 * Busca a Sequência de responsáveis real de uma tarefa (a aba "Regras"
 * no Runrun.it). Devolve uma lista (vazia se não tiver sequência
 * configurada) — nunca null, pra não quebrar o render.
 */
async function buscarSequenciaDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { sequencia: [], workflowId: null };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarSequencia", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar sequência de responsáveis:", data.error);
      return { sequencia: [], workflowId: null };
    }
    return { sequencia: data.sequencia || [], workflowId: data.workflowId || null };
  } catch (err) {
    console.error("Falha ao buscar sequência no Runrun.it:", err);
    return { sequencia: [], workflowId: null };
  }
}

async function adicionarNaRegraNoBackend(workflowId, userId) {
  if (!COLMEIA_API_URL || !workflowId || !userId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "adicionarNaRegra", workflowId, userId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou adicionar na regra:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao adicionar na regra no Runrun.it:", err);
    return false;
  }
}

/**
 * Abre o painel "Pessoas conhecidas" — lista todo nome que o Colmeia já
 * viu na sessão atual, com a foto atual, e deixa o coordenador trocar a
 * foto ou vincular apelidos (ex: "Manu" = "Manuela Mendonça").
 */
function abrirPainelPessoas() {
  const overlay = document.getElementById("peopleModalOverlay");
  overlay.hidden = false;
  renderPainelPessoas();
}

function renderPainelPessoas() {
  const body = document.getElementById("peopleModalBody");
  const nomes = Array.from(nomesVistos.entries()).sort((a, b) => a[1].nomeOriginal.localeCompare(b[1].nomeOriginal));

  if (nomes.length === 0) {
    body.innerHTML = `<p class="workflow-seq-empty">Nenhum nome visto ainda nessa sessão — navegue pelo Colmeia (abra tarefas, veja clientes) e volte aqui.</p>`;
    return;
  }

  body.innerHTML = nomes.map(([chave, info]) => {
    const salvo = pessoasSalvas.find(p => normalizarParaComparar(p.nome) === chave);
    const fotoAtual = resolverFotoManual(info.nomeOriginal) || info.fotoAtual || "";
    const aliasesTexto = salvo ? salvo.aliases.join(", ") : "";
    return `
      <div class="people-row" data-chave="${chave}" data-nome-original="${info.nomeOriginal}">
        <div class="people-row-top">
          <div class="people-row-avatar">${avatarPreviewHTML(info.nomeOriginal, fotoAtual)}</div>
          <span class="people-row-name">${info.nomeOriginal}</span>
        </div>
        <input type="text" class="people-row-input" data-campo="foto" placeholder="URL da foto" value="${fotoAtual}">
        <input type="text" class="people-row-input" data-campo="aliases" placeholder="Apelidos, separados por vírgula (ex: Manu, Manuela)" value="${aliasesTexto}">
        <button type="button" class="people-row-save" data-chave="${chave}">Salvar</button>
        <span class="people-row-saved" data-chave-saved="${chave}"></span>
      </div>
    `;
  }).join("");

  body.querySelectorAll(".people-row-save").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".people-row");
      const nomeOriginal = row.dataset.nomeOriginal;
      const foto = row.querySelector('[data-campo="foto"]').value.trim();
      const aliasesTexto = row.querySelector('[data-campo="aliases"]').value.trim();
      const aliases = aliasesTexto ? aliasesTexto.split(",").map(s => s.trim()).filter(Boolean) : [];

      btn.disabled = true;
      btn.textContent = "Salvando...";
      const ok = await salvarPessoaNoBackend(nomeOriginal, foto, aliases);
      btn.disabled = false;
      btn.textContent = "Salvar";

      if (ok) {
        const idxSalvo = pessoasSalvas.findIndex(p => normalizarParaComparar(p.nome) === normalizarParaComparar(nomeOriginal));
        const novoRegistro = { nome: nomeOriginal, foto, aliases };
        if (idxSalvo !== -1) pessoasSalvas[idxSalvo] = novoRegistro;
        else pessoasSalvas.push(novoRegistro);

        const avisoEl = row.querySelector(".people-row-saved");
        avisoEl.textContent = "✓ Salvo";
        setTimeout(() => { avisoEl.textContent = ""; }, 2000);

        // Atualiza as fotos em tudo que já está na tela agora.
        render();
        buildClientsPage();
        buildAtendimentoPage();
        buildTiposPage();
        if (document.getElementById("taskDetail").classList.contains("visible")) renderDetail();
      } else {
        row.querySelector(".people-row-saved").textContent = "Erro ao salvar";
      }
    });
  });
}

// Avatar simples só pra pré-visualização dentro do painel de pessoas
// (não usa avatarHTML pra não registrar de novo o mesmo nome em loop).
function avatarPreviewHTML(nome, foto) {
  if (foto) {
    return `<img class="avatar avatar-sm" src="${foto}" alt="${nome}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'avatar avatar-sm', textContent:'${initials(nome)}'}))">`;
  }
  return `<div class="avatar avatar-sm">${initials(nome)}</div>`;
}

/**
 * Abre o modal "Ver regra", mostrando a sequência completa da tarefa
 * e a opção de adicionar mais uma pessoa no final dela.
 */
async function abrirModalRegra(task) {
  const overlay = document.getElementById("ruleModalOverlay");
  const body = document.getElementById("ruleModalBody");
  overlay.hidden = false;
  body.innerHTML = `<p class="workflow-seq-empty">Carregando...</p>`;

  // Reaproveita a sequência já carregada no header, ou busca de novo
  // se por algum motivo ainda não tiver.
  if (task.sequencia === undefined) await carregarSequencia(task);

  renderModalRegra(task);
}

function renderModalRegra(task) {
  const body = document.getElementById("ruleModalBody");
  const seq = task.sequencia || [];

  const listaHtml = seq.length === 0
    ? `<p class="workflow-seq-empty">Sem sequência configurada nessa tarefa.</p>`
    : seq.map((s, i) => `
        <div class="rule-row ${s.atual ? "current" : ""}" data-element-id="${s.id}">
          <span class="rule-row-order">${i + 1}</span>
          ${avatarHTML(s.nome, "avatar-sm", s.foto)}
          <span class="rule-row-name">${s.nome}</span>
          ${s.concluido ? `<span class="rule-row-status done">Concluído</span>` : s.atual ? `<span class="rule-row-status current">Atual</span>` : `<span class="rule-row-status">Aguardando</span>`}
          ${(!s.concluido && !s.atual) ? `
            <button type="button" class="rule-row-remove" data-element-id="${s.id}" title="Remover da sequência">
              <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          ` : ""}
        </div>
      `).join("");

  body.innerHTML = `
    <div class="rule-status-msg" id="ruleStatusMsg" hidden></div>
    <div class="rule-list" id="ruleList">${listaHtml}</div>
    <div class="rule-add-section">
      <span class="side-label">Adicionar próxima pessoa</span>
      <input type="text" class="rule-add-search" id="ruleAddSearch" placeholder="Buscar pessoa...">
      <div class="rule-add-list" id="ruleAddList">
        <div class="assignee-menu-loading">Carregando pessoas...</div>
      </div>
    </div>
  `;

  body.querySelectorAll(".rule-row-remove").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      await executarAcaoNaRegra(task, async () => {
        return removerDaRegraNoBackend(task.workflowId, btn.dataset.elementId);
      }, "Removendo da sequência...");
    });
  });

  document.getElementById("ruleAddSearch").addEventListener("input", e => {
    renderizarListaAdicionarRegra(task, usuariosParaAdicionarRegra, e.target.value);
  });

  buscarUsuariosRunrun().then(usuarios => {
    usuariosParaAdicionarRegra = usuarios;
    renderizarListaAdicionarRegra(task, usuarios, "");
  });
}

// Enquanto true, o modal "Ver regra" não pode ser fechado (tem uma
// ação em andamento no Runrun.it).
let regraAtualizando = false;

/**
 * Roda uma ação de mudar a regra (adicionar/remover pessoa), mostrando
 * uma mensaginha de "Atualizando..." e travando o fechamento do modal
 * até terminar de verdade.
 */
async function executarAcaoNaRegra(task, acaoFn, mensagem) {
  regraAtualizando = true;
  const msgEl = document.getElementById("ruleStatusMsg");
  if (msgEl) {
    msgEl.hidden = false;
    msgEl.textContent = mensagem;
  }
  await acaoFn();
  await carregarSequencia(task);
  regraAtualizando = false;
  renderModalRegra(task);
}

async function removerDaRegraNoBackend(workflowId, elementId) {
  if (!COLMEIA_API_URL || !workflowId || !elementId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "removerDaRegra", workflowId, elementId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou remover da regra:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao remover da regra no Runrun.it:", err);
    return false;
  }
}

// Guarda a lista de usuários carregada, pra filtrar sem buscar de novo
// a cada letra digitada na busca do modal.
let usuariosParaAdicionarRegra = [];

function renderizarListaAdicionarRegra(task, usuarios, filtro) {
  const listEl = document.getElementById("ruleAddList");
  if (!listEl) return;
  if (usuarios.length === 0) {
    listEl.innerHTML = `<div class="assignee-menu-loading">Não consegui buscar a lista.</div>`;
    return;
  }
  const alvo = normalizarParaComparar(filtro);
  const filtrados = alvo ? usuarios.filter(u => normalizarParaComparar(u.nome).includes(alvo)) : usuarios;
  listEl.innerHTML = filtrados.map(u => `
    <button type="button" data-user-id="${u.id}" data-user-nome="${u.nome}" data-user-foto="${u.foto || ""}">
      ${avatarHTML(u.nome, "avatar-sm", u.foto)} <span>${u.nome}</span>
    </button>
  `).join("");
  listEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async e => {
      if (regraAtualizando) return;
      animarPessoaSubindo(btn, e);
      btn.disabled = true;
      await executarAcaoNaRegra(task, async () => {
        return adicionarNaRegraNoBackend(task.workflowId, btn.dataset.userId);
      }, "Adicionando na sequência...");
    });
  });
}

/**
 * Efeito visual: clona a fotinho de quem foi clicado e faz ela "subir"
 * do botão até a lista da sequência, dando a sensação de que a pessoa
 * está entrando ali de verdade.
 */
function animarPessoaSubindo(btn) {
  const lista = document.getElementById("ruleList");
  if (!lista) return;
  const origemRect = btn.getBoundingClientRect();
  const destinoRect = lista.getBoundingClientRect();

  const clone = btn.querySelector(".avatar")?.cloneNode(true);
  if (!clone) return;
  clone.classList.add("avatar-flying");
  clone.style.left = origemRect.left + "px";
  clone.style.top = origemRect.top + "px";
  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    clone.style.left = destinoRect.left + 16 + "px";
    clone.style.top = destinoRect.bottom - 30 + "px";
    clone.style.opacity = "0";
    clone.style.transform = "scale(0.6)";
  });

  setTimeout(() => clone.remove(), 650);
}

async function entregarTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "entregarTarefa", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou entregar a tarefa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao entregar a tarefa no Runrun.it:", err);
    return false;
  }
}

async function desfazerWorkflowNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return null;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "desfazerWorkflow", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Runrun.it recusou desfazer a sequência:", data.error);
      return null;
    }
    return data.novoResponsavel || null;
  } catch (err) {
    console.error("Falha ao desfazer a sequência no Runrun.it:", err);
    return null;
  }
}

// Cache com todo mundo do Runrun.it, carregado só na primeira vez que
// alguém clicar numa foto pra reatribuir (evita buscar toda hora).
let usuariosRunrunCache = null;

async function buscarUsuariosRunrun() {
  if (usuariosRunrunCache) return usuariosRunrunCache;
  if (!COLMEIA_API_URL) return [];
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarUsuarios" }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao listar usuários do Runrun.it:", data.error);
      return [];
    }
    usuariosRunrunCache = data.usuarios || [];
    return usuariosRunrunCache;
  } catch (err) {
    console.error("Falha ao listar usuários do Runrun.it:", err);
    return [];
  }
}

/**
 * Busca os comentários reais de uma tarefa no Runrun.it. Devolve uma
 * lista (pode ser vazia) — nunca null, pra não quebrar o render.
 */
/**
 * Busca a descrição real de uma tarefa no Runrun.it. Devolve sempre uma
 * string (vazia se não tiver descrição ou der erro).
 */
// Cores pra alternar entre os formatos gerados pela IA (mesmo estilo
// visual dos boxes que já existiam, só que agora com dados reais).
const CORES_FORMATO_BOX = ["fb-blue", "fb-purple", "fb-orange", "fb-teal", "fb-pink"];

/**
 * Chama o Gemini (via backend) pra organizar a descrição real da
 * tarefa em plataformas + formatos + um resumo do briefing, e desenha
 * o resultado no lugar do botão.
 */
async function gerarBriefingComIA(task) {
  const resultEl = document.getElementById("briefingResult");
  if (!resultEl) return;

  if (!COLMEIA_API_URL) {
    resultEl.innerHTML = `<p class="workflow-seq-empty">Backend não configurado.</p>`;
    return;
  }

  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "gerarBriefing", taskId: task.id }),
    });
    const data = await res.json();

    // Se o usuário já trocou de tarefa enquanto isso carregava, não
    // atualiza o pop-up de outra tarefa.
    if (tasks[detailIdx] !== task) return;

    if (!data.ok) {
      resultEl.innerHTML = `<p class="workflow-seq-empty">${data.error || "Não consegui gerar o briefing."}</p>`;
      return;
    }
    if (data.semDescricao) {
      resultEl.innerHTML = `<p class="workflow-seq-empty">Essa tarefa não tem descrição pra organizar.</p>`;
      return;
    }

    const b = data.briefing || {};
    const plataformas = b.plataformas || [];
    const formatos = b.formatos || [];
    const resumo = b.resumo || "";

    // Campos de texto livre — o valor vem EXATAMENTE como escrito na
    // descrição original (pedimos pra IA nunca reescrever), então é
    // seguro mostrar direto. Se vazio/null, mostra "Não preenchido".
    const camposLivres = [
      { label: "Instrução para redação", icone: "✏️", valor: b.instrucaoRedacao },
      { label: "Referência", icone: "🔗", valor: b.referencia },
      { label: "Texto na arte", icone: "🔤", valor: b.textoNaArte },
      { label: "Observações", icone: "💬", valor: b.observacoes },
    ];

    resultEl.innerHTML = `
      ${plataformas.length ? `
        <div class="ai-briefing-tags">
          ${plataformas.map(p => `<span class="badge badge-estatico">${p}</span>`).join("")}
        </div>
      ` : ""}
      ${formatos.length ? `
        <div class="ai-format-boxes">
          ${formatos.map((f, i) => `<div class="format-box ${CORES_FORMATO_BOX[i % CORES_FORMATO_BOX.length]}">${f}</div>`).join("")}
        </div>
      ` : ""}
      ${resumo ? `<p class="ai-briefing-resumo">${resumo}</p>` : ""}
      <div class="ai-briefing-campos">
        ${camposLivres.map(c => `
          <div class="ai-briefing-campo">
            <p class="ai-briefing-campo-label">${c.icone} ${c.label}</p>
            <p class="ai-briefing-campo-valor ${c.valor ? "" : "vazio"}">${c.valor || "Não preenchido"}</p>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    console.error("Falha ao gerar briefing com IA:", err);
    if (tasks[detailIdx] === task) {
      resultEl.innerHTML = `<p class="workflow-seq-empty">Falha de conexão.</p>`;
    }
  }
}

async function buscarDescricaoDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return "";
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarDescricao", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar descrição:", data.error);
      return "";
    }
    return data.descricao || "";
  } catch (err) {
    console.error("Falha ao buscar descrição no Runrun.it:", err);
    return "";
  }
}

async function buscarComentariosDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return [];
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarComentarios", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar comentários:", data.error);
      return [];
    }
    return data.comentarios || [];
  } catch (err) {
    console.error("Falha ao buscar comentários no Runrun.it:", err);
    return [];
  }
}

async function enviarComentarioNoBackend(taskId, texto) {
  if (!COLMEIA_API_URL || !taskId || !texto) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "adicionarComentario", taskId, texto }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o comentário:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao enviar comentário pro Runrun.it:", err);
    return false;
  }
}

// Dados fake usados só se o backend falhar de verdade (ver
// carregarTarefasReais) — nunca aparecem enquanto está carregando.
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
tasksFake.forEach((t, i) => { t.timerSeconds = 0; t.running = false; t.estimatePct = [12, 35, 48, 60, 20, 75, 30, 55, 18, 42, 65, 25, 50][i % 13]; t.hasChange = i % 4 === 1; });

// Começa vazio de propósito — mostra tela de carregando até o backend
// responder (ou, em último caso, cair pros dados fake).
let tasks = [];
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
  return `
    <div class="task-card priority-${task.priority} ${atrasada ? "task-overdue" : ""}" draggable="true" data-idx="${idx}">
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
        <div class="assignee-wrap" data-idx="${idx}">
          ${avatarHTML(task.assignee, "avatar-sm", task.assigneeAvatarUrl)}
          <div class="assignee-menu"></div>
        </div>
        <span class="card-due-simple ${atrasada ? "overdue" : ""}">${dueIcon}${task.due}</span>
      </div>
    </div>
  `;
}

const iconEntrega = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const iconHoje = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
          <span class="board-loading-bee">🐝</span>
          <p class="board-loading-text" id="loadingMsg">${mensagensCarregando[0]}</p>
        </div>
      </div>
    `;
    iniciarMensagensCarregando();
    return;
  }

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

let searchQuery = "";

function render() {
  if (carregandoTarefas) return;
  columnsDef.forEach(({ key }) => {
    let list = tasks.filter(t => t.status === key);
    if (searchQuery) {
      const alvo = normalizarParaComparar(searchQuery);
      list = list.filter(t =>
        normalizarParaComparar(t.title).includes(alvo) ||
        normalizarParaComparar(t.client).includes(alvo)
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
        // Mudar de coluna aqui no Colmeia ainda é só visual — o endpoint
        // de mover etapa de verdade no Runrun.it ainda não foi confirmado.
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
        const novoResponsavel = await avancarWorkflowNoBackend(task.id);
        if (novoResponsavel) {
          task.assignee = novoResponsavel;
          task.assigneeAvatarUrl = null;
          render();
        } else {
          console.warn("Não consegui avançar a sequência — talvez essa tarefa não tenha uma Sequência de responsáveis configurada.");
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
          const ok = await reatribuirTarefaNoBackend(task.id, opt.dataset.userId);
          if (ok) {
            task.assignee = nomeEscolhido;
            task.assigneeAvatarUrl = null; // deixa a próxima carga real trazer a foto certa
            render();
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
      task.running = !task.running;
      btn.innerHTML = task.running ? pauseIcon : playIcon;
      btn.setAttribute("aria-label", (task.running ? "Pausar" : "Iniciar") + " tarefa");
      if (task.running) tocarTarefaNoBackend(task.id);
      else pausarTarefaNoBackend(task.id);
      updateNowPlaying();
    });
  });
}

document.addEventListener("click", () => {
  document.querySelectorAll(".priority-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".detail-more-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".status-menu").forEach(m => m.classList.remove("open"));
  document.querySelectorAll(".assignee-menu").forEach(m => m.classList.remove("open"));
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

/**
 * Desenha a lista de comentários de uma tarefa. Enquanto ainda não
 * carregou (task.comments === undefined), mostra "Carregando...".
 * Tarefas sem id real (dados fake) nunca terão comentários reais.
 */
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
  return task.comments.map(c => `
    <div class="comment-bubble ${nomesCorrespondem(c.autor, task.assignee) ? "mine" : ""}">
      ${avatarHTML(c.autor, "avatar-sm comment-avatar")}
      <div class="comment-body">
        <div class="comment-author">${c.autor}</div>
        <div class="comment-text">${c.texto}</div>
      </div>
    </div>
  `).join("");
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

  return doc.body.innerHTML;
}

/**
 * Busca a descrição real no Runrun.it e atualiza só o texto na tela
 * (sem re-renderizar o pop-up inteiro).
 */
async function carregarDescricao(task) {
  if (!task.id) return;
  const texto = await buscarDescricaoDoBackend(task.id);
  if (tasks[detailIdx] === task) {
    const el = document.getElementById("descTextReal");
    if (el) el.innerHTML = texto ? formatarDescricaoRunrun(texto) : "Sem descrição cadastrada nessa tarefa.";
  }
}

async function carregarComentarios(task) {
  if (!task.id) return;
  task.comments = await buscarComentariosDoBackend(task.id);
  // Só atualiza a tela se o usuário ainda estiver vendo essa mesma tarefa.
  if (tasks[detailIdx] === task) {
    const thread = document.getElementById("commentsThread");
    if (thread) thread.innerHTML = renderComentariosHTML(task);
  }
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

function openDetail(idx, entradaAnimacao) {
  detailIdx = Number(idx);
  commentsOpen = false;
  childrenOpen = false;
  renderDetail();
  const panel = document.getElementById("taskDetail");
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  const cardEl = document.querySelector(`.task-card[data-idx="${idx}"]`);
  if (cardEl) cardEl.classList.add("selected");
  panel.classList.add("visible");
  requestAnimationFrame(() => panel.classList.add("open"));
  if (entradaAnimacao) {
    const inner = panel.querySelector(".detail-inner");
    if (inner) {
      inner.classList.add(entradaAnimacao);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => inner.classList.remove(entradaAnimacao));
      });
    }
  }
  carregarComentarios(tasks[detailIdx]);
  carregarDescricao(tasks[detailIdx]);
  carregarSequencia(tasks[detailIdx]);
  if (tasks[detailIdx].id) gerarBriefingComIA(tasks[detailIdx]);
}

/**
 * Desenha a Sequência de responsáveis (Lucas → Cláudio → Laura, por
 * exemplo) no lugar dos pontinhos de navegação. Enquanto ainda não
 * carregou (task.sequencia === undefined), mostra "Carregando...".
 */
function renderSequenciaHTML(task) {
  if (!task.id) {
    return `<span class="workflow-seq-empty">—</span>`;
  }
  if (task.sequencia === undefined) {
    return `<span class="workflow-seq-empty">Carregando sequência...</span>`;
  }
  if (task.sequencia.length === 0) {
    return `<span class="workflow-seq-empty">Sem sequência configurada</span>`;
  }
  const atualIdx = task.sequencia.findIndex(s => s.atual);
  const semNinguemNaFrente = atualIdx !== -1 && task.sequencia[atualIdx].ultimo;
  return `
    <button type="button" class="nav-arrow" id="navPrevArrow" title="Desfazer (voltar etapa)">
      <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="workflow-seq-dots">
      ${task.sequencia.map((s, i) => `
        ${i > 0 ? `<div class="wf-line ${task.sequencia[i - 1].concluido ? "done" : ""}"></div>` : ""}
        <div class="wf-dot ${s.atual ? "current" : ""} ${s.concluido ? "completed" : ""}" title="${s.nome}">
          ${avatarHTML(s.nome, "avatar-xs", s.foto)}
          ${s.concluido ? `<span class="wf-check">✓</span>` : ""}
        </div>
      `).join("")}
    </div>
    ${semNinguemNaFrente ? `
      <button type="button" class="nav-arrow" id="navAddPersonBtn" title="Adicionar próxima pessoa na sequência">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="nav-arrow nav-deliver" id="navDeliverBtn" title="Entregar tarefa (não tem mais ninguém na frente)">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    ` : `
      <button type="button" class="nav-arrow" id="navNextArrow" title="Avançar (próximo responsável)">
        <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `}
  `;
}

/**
 * Busca a sequência real no Runrun.it e atualiza só essa parte da tela
 * (sem re-renderizar o pop-up inteiro).
 */
async function carregarSequencia(task) {
  if (!task.id) return;
  const resultado = await buscarSequenciaDoBackend(task.id);
  task.sequencia = resultado.sequencia;
  task.workflowId = resultado.workflowId;
  if (tasks[detailIdx] !== task) return; // usuário já trocou de tarefa
  const el = document.getElementById("workflowSeqGroup");
  if (el) {
    el.innerHTML = renderSequenciaHTML(task);
    wireWorkflowArrows(task);
  }
}

/**
 * Liga as setas de desfazer/avançar a sequência de verdade no
 * Runrun.it. Precisa ser chamado de novo toda vez que o HTML da
 * sequência é redesenhado (as setas são recriadas do zero).
 */
function wireWorkflowArrows(task) {
  const prevBtn = document.getElementById("navPrevArrow");
  const nextBtn = document.getElementById("navNextArrow");
  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      prevBtn.disabled = true;
      const novoResponsavel = await desfazerWorkflowNoBackend(task.id);
      if (novoResponsavel) {
        task.assignee = novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
      }
      await carregarSequencia(task);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      nextBtn.disabled = true;
      const novoResponsavel = await avancarWorkflowNoBackend(task.id);
      if (novoResponsavel) {
        task.assignee = novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
      }
      await carregarSequencia(task);
    });
  }
  const addPersonBtn = document.getElementById("navAddPersonBtn");
  if (addPersonBtn) {
    addPersonBtn.addEventListener("click", () => abrirModalRegra(task));
  }
  const deliverBtn = document.getElementById("navDeliverBtn");
  if (deliverBtn) {
    deliverBtn.addEventListener("click", async () => {
      deliverBtn.disabled = true;
      // Primeiro fecha a etapa da última pessoa da sequência (sem
      // transferir pra ninguém, já que não tem próximo) — confirmado
      // que o Runrun.it só deixa entregar depois disso.
      await avancarWorkflowNoBackend(task.id);
      const ok = await entregarTarefaNoBackend(task.id);
      if (ok) {
        console.log("Tarefa entregue no Runrun.it.");
        await carregarSequencia(task);
      } else {
        deliverBtn.disabled = false;
      }
    });
  }
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
          ${task.isMotherCard ? `
            <div class="children-btn-wrap">
              <button type="button" class="mother-card-btn" id="childrenBtn" title="Ver subtarefas">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="children-float" id="childrenPanel">
                <div class="children-float-head">Subtarefas</div>
                <div class="children-list">
                  ${(task.subtarefasResumo || []).map(s => `
                    <button type="button" class="child-item ${s.fechada ? "done" : ""}" data-child-id="${s.id}">
                      ${avatarHTML(s.responsavel, "avatar-sm child-avatar", s.foto)}
                      <span class="child-title">${s.title}</span>
                      ${s.fechada ? `<svg class="child-check" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
                    </button>
                  `).join("")}
                </div>
              </div>
            </div>
          ` : `
            <button type="button" class="mother-card-btn" id="motherCardBtn" title="Ir para o card mãe">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          `}
          <span class="detail-taskname">${task.title}</span>
          <span class="header-priority pv-${task.priority}">${priorityLabels[task.priority]}</span>
        </div>
        <div class="detail-header-right">
          <div class="nav-dots-group" id="workflowSeqGroup">
            ${renderSequenciaHTML(task)}
          </div>

          <div class="status-wrap">
            <button type="button" class="status-badge" id="statusBadge">${task.isMotherCard ? "Card mãe" : (columnsDef.find(c => c.key === task.status)?.label || task.runrunStage || "Sem etapa")}</button>
            <div class="status-menu" id="statusMenu">
              ${columnsDef.map(c => `<button type="button" data-status="${c.key}" class="${c.key === task.status ? "active" : ""}">${c.label}</button>`).join("")}
            </div>
          </div>

          <div class="detail-more-wrap">
            <button type="button" class="detail-more" id="detailMore" aria-label="Mais opções">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
            <div class="detail-more-menu" id="detailMoreMenu">
              <button type="button" id="verRegraBtn">Ver regra</button>
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
              ${task.id ? `
                <div class="ai-briefing-result" id="briefingResult">
                  <p class="workflow-seq-empty">Carregando briefing...</p>
                </div>
                <button type="button" class="ai-briefing-toggle" id="verOriginalBtn">Ver briefing original</button>
              ` : ""}
              <div class="desc-text-real" id="descTextReal" ${task.id ? "hidden" : ""}>${task.id ? "Carregando..." : ""}</div>
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
          <div class="comments-thread" id="commentsThread">
            ${renderComentariosHTML(task)}
          </div>
          <div class="comment-input">
            <input type="text" id="commentInput" placeholder="Mensagem">
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
              ${avatarAtendimentoHTML(getAtendimentoDoCliente(task.client) || task.assignee, "avatar-sm")}
              <span>${getAtendimentoDoCliente(task.client) || task.assignee}</span>
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
  wireWorkflowArrows(task);

  document.getElementById("detailPlay").addEventListener("click", () => {
    task.running = !task.running;
    if (task.running) tocarTarefaNoBackend(task.id);
    else pausarTarefaNoBackend(task.id);
    renderDetail();
    render();
    applyCommentsState();
    updateNowPlaying();
  });

  // ===== Menu de mais opções (⋮) =====
  const motherBtn = document.getElementById("motherCardBtn");
  if (motherBtn) motherBtn.addEventListener("click", () => abrirCardMae(task));

  const childrenBtn = document.getElementById("childrenBtn");
  if (childrenBtn) {
    childrenBtn.addEventListener("click", e => {
      e.stopPropagation();
      childrenOpen = !childrenOpen;
      applyCommentsState();
    });
  }
  document.querySelectorAll(".child-item").forEach(item => {
    item.addEventListener("click", () => {
      childrenOpen = false;
      applyCommentsState();
      abrirTarefaPorId(Number(item.dataset.childId));
    });
  });

  const statusBadge = document.getElementById("statusBadge");
  const statusMenu = document.getElementById("statusMenu");
  if (task.isMotherCard) {
    statusBadge.disabled = true;
    statusBadge.title = "Card mãe não tem coluna no Colmeia";
  } else {
    statusBadge.addEventListener("click", e => {
      e.stopPropagation();
      statusMenu.classList.toggle("open");
    });
  }
  statusMenu.querySelectorAll("button").forEach(opt => {
    opt.addEventListener("click", e => {
      e.stopPropagation();
      task.status = opt.dataset.status;
      // Mudar de coluna aqui no Colmeia ainda é só visual — ver nota acima.
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

  document.getElementById("verRegraBtn").addEventListener("click", () => {
    moreMenu.classList.remove("open");
    abrirModalRegra(task);
  });

  const verOriginalBtn = document.getElementById("verOriginalBtn");
  if (verOriginalBtn) {
    verOriginalBtn.addEventListener("click", () => {
      const original = document.getElementById("descTextReal");
      const escondido = original.hidden;
      original.hidden = !escondido;
      verOriginalBtn.textContent = escondido ? "Ocultar briefing original" : "Ver briefing original";
    });
  }

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

  const commentInput = document.getElementById("commentInput");
  if (commentInput) {
    commentInput.addEventListener("keydown", async e => {
      if (e.key !== "Enter") return;
      const texto = commentInput.value.trim();
      if (!texto) return;
      if (!task.id) {
        console.warn("Essa tarefa não está conectada ao Runrun.it, não dá pra comentar de verdade.");
        return;
      }
      commentInput.value = "";
      commentInput.disabled = true;
      const ok = await enviarComentarioNoBackend(task.id, texto);
      commentInput.disabled = false;
      if (ok) carregarComentarios(task);
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

/**
 * Abre o modal do Card Mãe real (buscado no Runrun.it a partir do
 * parent_task_id da subtarefa que está aberta), mostrando a lista de
 * todas as subtarefas — igual a aba "Subtarefas" do Runrun.it.
 */
/**
 * Abre uma tarefa qualquer pelo ID, como uma tarefa normal do Colmeia
 * (mesmo pop-up de sempre, com descrição/comentários/sequência). Se ela
 * já estiver carregada (uma subtarefa do quadro, por exemplo), só abre;
 * senão busca ela avulsa no Runrun.it primeiro.
 */
async function abrirTarefaPorId(taskId) {
  const panel = document.getElementById("taskDetail");
  const inner = panel.querySelector(".detail-inner");
  if (inner) inner.classList.add("panel-exit-down");
  await esperar(200);

  const idxExistente = tasks.findIndex(t => t.id === taskId);
  if (idxExistente !== -1) {
    openDetail(idxExistente, "panel-enter-above");
    return;
  }

  mostrarCardEmBranco("Buscando a tarefa...");
  const resultado = await buscarTarefaCompletaDoBackend(taskId);
  if (!resultado.ok) {
    mostrarCardEmBranco(resultado.error || "Não consegui abrir essa tarefa.");
    return;
  }
  const nova = mapearTarefaDoBackend(resultado.tarefa);
  tasks.push(nova);
  openDetail(tasks.length - 1, "panel-enter-above");
}

async function buscarTarefaCompletaDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { ok: false, error: "Backend não configurado." };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarTarefaCompleta", taskId }),
    });
    return await res.json();
  } catch (err) {
    console.error("Falha ao buscar tarefa no Runrun.it:", err);
    return { ok: false, error: "Falha de conexão com o Runrun.it." };
  }
}

/**
 * Abre o card mãe de verdade de uma subtarefa (seta pra cima), como uma
 * tarefa normal — já marcada como isMotherCard, com o resumo das
 * subtarefas guardado nela pra alimentar o painel flutuante (seta pra
 * baixo) sem precisar buscar de novo.
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mostra um card vazio (só a abelhinha) dentro do pop-up enquanto busca
 * os dados de verdade — evita a sensação de "travado" durante a troca
 * de card mãe/subtarefa.
 */
function mostrarCardEmBranco(mensagem) {
  const panel = document.getElementById("taskDetail");
  panel.innerHTML = `
    <div class="detail-inner detail-loading-blank">
      <span class="detail-loading-bee">🐝</span>
      <p class="workflow-seq-empty">${mensagem || "Carregando..."}</p>
    </div>
  `;
}

async function abrirCardMae(task) {
  if (!task.id) {
    console.warn("Essa tarefa não está conectada ao Runrun.it, não tem card mãe pra abrir.");
    return;
  }

  const panel = document.getElementById("taskDetail");
  const inner = panel.querySelector(".detail-inner");
  if (inner) inner.classList.add("panel-exit-up");
  await esperar(200);
  mostrarCardEmBranco("Buscando o card mãe...");

  const resultado = await buscarCardMaeDoBackend(task.id);
  if (!resultado.ok) {
    mostrarCardEmBranco(resultado.error || "Não consegui buscar o card mãe.");
    return;
  }
  if (!resultado.temPai) {
    mostrarCardEmBranco("Essa tarefa não tem card mãe.");
    return;
  }

  let idx = tasks.findIndex(t => t.id === resultado.cardMae.id);
  if (idx === -1) {
    const novaMae = mapearTarefaDoBackend(resultado.cardMae);
    tasks.push(novaMae);
    idx = tasks.length - 1;
  }
  tasks[idx].isMotherCard = true;
  tasks[idx].subtarefasResumo = resultado.subtarefas || [];

  openDetail(idx, "panel-enter-below");
}

async function buscarCardMaeDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { ok: false, error: "Backend não configurado." };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarCardMae", taskId }),
    });
    return await res.json();
  } catch (err) {
    console.error("Falha ao buscar o card mãe no Runrun.it:", err);
    return { ok: false, error: "Falha de conexão com o Runrun.it." };
  }
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

// Nome do designer logado no Colmeia hoje (mesmo usado na barra lateral).
// Troque aqui quando tiver login de verdade — por enquanto é fixo.
const DESIGNER_LOGADO = "Claudio";

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
function clientesDoDesignerNoPainel(nomeDesigner) {
  if (!painelBeeonData || !painelBeeonData.state) return [];
  const chave = Object.keys(painelBeeonData.state).find(d => nomesCorrespondem(d, nomeDesigner));
  return chave ? (painelBeeonData.state[chave] || []) : [];
}

/**
 * "Meus clientes": lista só os clientes do designer logado, vindos de
 * verdade do painel-designers-beeon (state[designer]), com foto quando
 * disponível. Não usa mais os dados fake do Runrun.
 */
function buildClientsPage() {
  const grid = document.getElementById("clientsGrid");
  if (!grid) return;

  if (!painelBeeonData) {
    grid.innerHTML = `<div class="placeholder-box"><span>⏳</span><p>Carregando clientes do painel-designers-beeon...</p></div>`;
    return;
  }

  const meusClientes = clientesDoDesignerNoPainel(DESIGNER_LOGADO);
  if (meusClientes.length === 0) {
    grid.innerHTML = `<div class="placeholder-box"><span>🗂️</span><p>Nenhum cliente encontrado pra ${DESIGNER_LOGADO} no painel-designers-beeon.</p></div>`;
    return;
  }

  grid.innerHTML = meusClientes.map(c => `
    <div class="client-card">
      <div class="client-card-top">
        ${avatarHTML(DESIGNER_LOGADO, "avatar-sm")}
        <div class="client-card-name">${c.cliente}</div>
      </div>
      <div class="client-card-count">${c.escopo || ""}</div>
      <div class="client-card-badges">
        ${(c.servicos || []).map(s => `<span class="badge badge-estatico">${s}</span>`).join("")}
      </div>
    </div>
  `).join("");
}

// Guarda quais grupos de atendimento estão expandidos (mesmo padrão do
// painel-beeon: clica no cabeçalho do grupo pra abrir/fechar a lista).
const atendimentoExpandido = new Set();

/**
 * "Clientes por atendimento": mesmo padrão do painel-designers-beeon —
 * agrupa os clientes de todos os designers pelo atendimento responsável,
 * ordena de A a Z, e cada grupo expande/recolhe ao clicar no cabeçalho.
 */
function buildAtendimentoPage() {
  const grid = document.getElementById("atendimentoGrid");
  if (!grid) return;

  if (!painelBeeonData) {
    grid.innerHTML = `<div class="placeholder-box"><span>⏳</span><p>Carregando clientes do painel-designers-beeon...</p></div>`;
    return;
  }

  const todos = [];
  const vistosPorGrupo = new Set(); // evita o mesmo cliente aparecer 2x no mesmo grupo
  Object.entries(painelBeeonData.state).forEach(([designer, listaClientes]) => {
    (listaClientes || []).forEach(c => {
      if (!c.atend) return; // sem atendimento definido — não entra nessa aba
      const chave = normalizarParaComparar(c.atend) + "|" + normalizarParaComparar(c.cliente);
      if (vistosPorGrupo.has(chave)) return; // já apareceu nesse grupo, pula
      vistosPorGrupo.add(chave);
      todos.push({ ...c, designer });
    });
  });

  const porAtendimento = {};
  todos.forEach(c => {
    if (!porAtendimento[c.atend]) porAtendimento[c.atend] = [];
    porAtendimento[c.atend].push(c);
  });

  const nomes = Object.keys(porAtendimento).sort((a, b) => a.localeCompare(b));

  grid.innerHTML = nomes.map(responsavel => {
    const lista = porAtendimento[responsavel];
    const aberto = atendimentoExpandido.has(responsavel);
    return `
      <div class="atendimento-group ${aberto ? "expanded" : ""}">
        <button type="button" class="atendimento-group-header" data-atend="${responsavel}">
          ${avatarAtendimentoHTML(responsavel, "avatar-sm")}
          <span class="atendimento-group-name">${responsavel}</span>
          <span class="atendimento-group-count">${lista.length} cliente${lista.length > 1 ? "s" : ""}</span>
        </button>
        ${aberto ? `
          <div class="clients-grid">
            ${lista.map(c => `
              <div class="client-card">
                <div class="client-card-top">
                  ${avatarHTML(c.designer, "avatar-sm")}
                  <div class="client-card-name">${c.cliente}</div>
                </div>
                <div class="client-card-count">${c.escopo || ""}</div>
                <div class="client-card-badges">
                  ${(c.servicos || []).map(s => `<span class="badge badge-estatico">${s}</span>`).join("")}
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".atendimento-group-header").forEach(btn => {
    btn.addEventListener("click", () => {
      const nome = btn.dataset.atend;
      if (atendimentoExpandido.has(nome)) atendimentoExpandido.delete(nome);
      else atendimentoExpandido.add(nome);
      buildAtendimentoPage();
    });
  });
}

// Guarda quais grupos de serviço estão expandidos.
const tiposExpandido = new Set();

/**
 * "Tipos de tarefas": agrupa os clientes de todos os designers pelos
 * serviços que cada um presta (campo "servicos", array — um cliente
 * pode aparecer em mais de um grupo), vindos do painel-designers-beeon.
 * Mesmo padrão de grupos expansíveis usado em "Clientes por atendimento".
 */
function buildTiposPage() {
  const grid = document.getElementById("tiposGrid");
  if (!grid) return;

  if (!painelBeeonData) {
    grid.innerHTML = `<div class="placeholder-box"><span>⏳</span><p>Carregando do painel-designers-beeon...</p></div>`;
    return;
  }

  const porServico = {};
  const vistosPorServico = new Set(); // evita duplicar o mesmo cliente no mesmo serviço
  Object.entries(painelBeeonData.state).forEach(([designer, listaClientes]) => {
    (listaClientes || []).forEach(c => {
      const servicos = (c.servicos && c.servicos.length) ? c.servicos : ["Sem serviço definido"];
      servicos.forEach(servico => {
        const chave = normalizarParaComparar(servico) + "|" + normalizarParaComparar(c.cliente);
        if (vistosPorServico.has(chave)) return;
        vistosPorServico.add(chave);
        if (!porServico[servico]) porServico[servico] = [];
        porServico[servico].push({ ...c, designer });
      });
    });
  });

  const nomes = Object.keys(porServico).sort((a, b) => a.localeCompare(b));

  if (nomes.length === 0) {
    grid.innerHTML = `<div class="placeholder-box"><span>🏷️</span><p>Nenhum serviço cadastrado no painel-designers-beeon ainda.</p></div>`;
    return;
  }

  grid.innerHTML = nomes.map(servico => {
    const lista = porServico[servico];
    const aberto = tiposExpandido.has(servico);
    return `
      <div class="atendimento-group ${aberto ? "expanded" : ""}">
        <button type="button" class="atendimento-group-header" data-tipo="${servico}">
          <span class="tipo-tag-icon">🏷️</span>
          <span class="atendimento-group-name">${servico}</span>
          <span class="atendimento-group-count">${lista.length} cliente${lista.length > 1 ? "s" : ""}</span>
        </button>
        ${aberto ? `
          <div class="clients-grid">
            ${lista.map(c => `
              <div class="client-card">
                <div class="client-card-top">
                  ${avatarHTML(c.designer, "avatar-sm")}
                  <div class="client-card-name">${c.cliente}</div>
                </div>
                <div class="client-card-count">${c.escopo || ""}</div>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".atendimento-group-header").forEach(btn => {
    btn.addEventListener("click", () => {
      const nome = btn.dataset.tipo;
      if (tiposExpandido.has(nome)) tiposExpandido.delete(nome);
      else tiposExpandido.add(nome);
      buildTiposPage();
    });
  });
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
    if (page === "atendimento") buildAtendimentoPage();
    if (page === "tipos") buildTiposPage();
  });
});

// Busca por tarefa ou cliente
document.getElementById("searchInput").addEventListener("input", e => {
  searchQuery = e.target.value;
  render();
});

document.getElementById("nowPlaying").addEventListener("click", () => {
  const idx = tasks.findIndex(t => t.running);
  if (idx !== -1) openDetail(idx);
});

// Notificações do Runrun.it — ainda não integrado, só o botão por enquanto.
document.getElementById("notificationsBtn").addEventListener("click", () => {
  console.log("Notificações do Runrun.it: integração ainda não feita.");
});

// Acesso rápido — painel lateral recolhível
const quickAccessPanel = document.getElementById("quickAccessPanel");
document.getElementById("quickAccessBtn").addEventListener("click", () => {
  quickAccessPanel.classList.toggle("open");
});
document.getElementById("quickAccessClose").addEventListener("click", () => {
  quickAccessPanel.classList.remove("open");
});

// Modal "Ver regra"
const ruleModalOverlay = document.getElementById("ruleModalOverlay");
document.getElementById("ruleModalClose").addEventListener("click", () => {
  if (regraAtualizando) return;
  ruleModalOverlay.hidden = true;
});
ruleModalOverlay.addEventListener("click", e => {
  if (regraAtualizando) return;
  if (e.target === ruleModalOverlay) ruleModalOverlay.hidden = true;
});

// Modal "Pessoas conhecidas" (aberto clicando no perfil na barra lateral)
const peopleModalOverlay = document.getElementById("peopleModalOverlay");
document.getElementById("sidebarProfileLink").addEventListener("click", e => {
  e.preventDefault();
  abrirPainelPessoas();
});
document.getElementById("peopleModalClose").addEventListener("click", () => {
  peopleModalOverlay.hidden = true;
});
peopleModalOverlay.addEventListener("click", e => {
  if (e.target === peopleModalOverlay) peopleModalOverlay.hidden = true;
});

buildBoard();
render();
carregarTarefasReais();
carregarDadosPainelBeeon();
carregarPessoasSalvas();
