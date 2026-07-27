// ============================================
// DADOS FAKE — só para visualização do protótipo.
// Nenhuma conexão real com planilha, Drive ou Runrun.it ainda.
// ============================================

const dueIcon = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const discordIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 6.3a15 15 0 00-3.6-1.1l-.2.4a13 13 0 013.1 1.1 12.6 12.6 0 00-11.9 0 13 13 0 013.1-1.1l-.2-.4A15 15 0 005.6 6.3C3.6 9.3 3 12.2 3.2 15a15 15 0 004.4 2.2l.6-1a9.6 9.6 0 01-1.7-.8l.4-.3a11.3 11.3 0 009.8 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1A15 15 0 0020.8 15c.3-3.2-.5-6.1-1.9-8.7zM9.7 13.4c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5zm4.6 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5z"/></svg>`;
const chatIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 1112.6 6.5L4 21l1.9-6.1A7.96 7.96 0 014 12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const reopenIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4.5 15a8 8 0 0014.5 3.5M19.5 9A8 8 0 005 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const columnsDef = [
  { key: "pendentes", label: "Pendentes", hex: "var(--text-muted)" },
  { key: "prioridades", label: "Prioridades", hex: "var(--danger)" },
  { key: "fazendo", label: "Fazendo", hex: "var(--accent)" },
  { key: "revisao", label: "Revisão", hex: "var(--purple)" },
  { key: "ajustes", label: "Ajustes", hex: "var(--warning)" },
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
const MESES_COMPLETOS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
(function atualizarPillDeData() {
  const el = document.getElementById("topbarDateText");
  if (!el) return;
  const agora = new Date();
  el.textContent = `${agora.getDate()} ${MESES_COMPLETOS[agora.getMonth()]}`;
})();

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
/**
 * Busca as atividades recentes do Drive (uploads de arquivo) que já
 * existem no painel-designers-beeon — mesmo cache que alimenta o card
 * "Atividade recente" de lá.
 *
 * NÃO é mais usada pela notificação de upload dentro do pop-up de
 * tarefa (ver renderNotificacoesUpload) — aquela agora checa a pasta
 * do próprio card direto pelo Code.gs do Colmeia (instantâneo, sem
 * depender do cache de 10 minutos do painel). Deixada aqui por se um
 * dia precisar de uma visão geral de atividades fora do contexto de
 * uma tarefa específica.
 */
async function buscarAtividadesPainelBeeon() {
  if (!PAINEL_BEEON_API_URL) return [];
  try {
    const res = await fetch(PAINEL_BEEON_API_URL + "?tipo=atividades");
    const data = await res.json();
    return data.ok ? (data.atividades || []) : [];
  } catch (err) {
    console.error("Falha ao buscar atividades do painel-beeon:", err);
    return [];
  }
}

// Só avisa sobre upload que aconteceu nas últimas 3 horas — depois
// disso não faz mais sentido como "notificação" do momento.
const JANELA_NOTIFICACAO_UPLOAD_MS = 3 * 60 * 60 * 1000;

function chaveUploadVisto(link) {
  return "colmeia_upload_visto_" + link;
}
function uploadJaVisto(link) {
  try { return localStorage.getItem(chaveUploadVisto(link)) === "1"; } catch (err) { return false; }
}
function marcarUploadVisto(link) {
  try { localStorage.setItem(chaveUploadVisto(link), "1"); } catch (err) { /* sem problema */ }
}

/**
 * Mostra, dentro da aba Comentários, um aviso pra cada pasta onde o
 * designer logado subiu arquivo recentemente pro cliente dessa tarefa
 * — junto com "Copiar link" e "Ver", pra não precisar catar a pasta
 * certa no Drive na mão. Pode aparecer mais de um (ex: PSD numa pasta,
 * PNG em outra).
 *
 * Checa direto a pasta do card (Code.gs > buscarUploadsRecentesDoCard),
 * em vez do cache de 10 minutos do painel-designers-beeon — como o
 * Colmeia já sabe exatamente qual é a pasta dessa tarefa, a checagem é
 * instantânea (olha só 1 pasta, não o Drive inteiro).
 */
/**
 * Antes, a checagem de "você subiu um arquivo na pasta do card" só
 * rodava uma vez, no momento de abrir a tarefa — se o upload no Drive
 * acontecesse só depois (ex: em outra aba), a notificação nunca mais
 * aparecia até fechar e reabrir a tarefa. Agora, enquanto o pop-up da
 * tarefa fica aberto, o Colmeia rechecha sozinho a cada poucos
 * segundos (e também na hora, assim que a aba volta a ficar em foco —
 * o momento mais comum de ter acabado de subir algo no Drive em outra
 * aba/janela e voltado pro Colmeia pra copiar o link).
 */
let _intervalChecagemUpload = null;
function iniciarChecagemUploadEmSegundoPlano(task) {
  pararChecagemUploadEmSegundoPlano();
  if (!task.id) return;
  _intervalChecagemUpload = setInterval(() => {
    if (tasks[detailIdx] !== task) { pararChecagemUploadEmSegundoPlano(); return; }
    renderNotificacoesUpload(task);
  }, 8000);
}
function pararChecagemUploadEmSegundoPlano() {
  clearInterval(_intervalChecagemUpload);
  _intervalChecagemUpload = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && tasks[detailIdx] && tasks[detailIdx].id) {
    renderNotificacoesUpload(tasks[detailIdx]);
  }
});

async function renderNotificacoesUpload(task) {
  const container = document.getElementById("uploadNotifs");
  if (!container || !task.id) return;

  let resultado;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarUploadsRecentesDoCard", taskId: task.id }),
    });
    resultado = await res.json();
  } catch (err) {
    console.error("Falha ao checar uploads recentes da pasta do card:", err);
    return;
  }
  if (tasks[detailIdx] !== task) return; // trocou de tarefa enquanto carregava
  if (!resultado.ok || !resultado.uploads || !resultado.pastaUrl) {
    container.innerHTML = "";
    return;
  }

  const agora = Date.now();
  const arquivosRelevantes = resultado.uploads
    .filter(u =>
      nomesCorrespondem(u.quem, DESIGNER_LOGADO) &&
      (agora - u.quando) < JANELA_NOTIFICACAO_UPLOAD_MS
    )
    .map(u => u.arquivo);

  if (arquivosRelevantes.length === 0 || uploadJaVisto(resultado.pastaUrl)) {
    container.innerHTML = "";
    return;
  }

  const grupos = [{ pasta: resultado.pastaNome || "pasta do card", link: resultado.pastaUrl, arquivos: arquivosRelevantes }];

  container.innerHTML = grupos.map(g => `
    <div class="upload-notif" data-link="${g.link}">
      <button type="button" class="upload-notif-dismiss" data-link="${g.link}" aria-label="Dispensar">×</button>
      <p class="upload-notif-text">Você adicionou ${g.arquivos.length} arquivo${g.arquivos.length > 1 ? "s" : ""} na pasta <strong>${g.pasta}</strong></p>
      <div class="upload-notif-actions">
        <button type="button" class="upload-notif-copy" data-link="${g.link}">Copiar link</button>
        <a href="${g.link}" target="_blank" rel="noopener" class="upload-notif-ver">Ver</a>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".upload-notif-copy").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.link).then(() => {
        const original = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(() => { btn.textContent = original; }, 1200);
      });
    });
  });
  container.querySelectorAll(".upload-notif-dismiss").forEach(btn => {
    btn.addEventListener("click", () => {
      marcarUploadVisto(btn.dataset.link);
      const el = container.querySelector(`.upload-notif[data-link="${CSS.escape(btn.dataset.link)}"]`);
      if (el) el.remove();
    });
  });
}

/**
 * Depois de comentar numa subtarefa, pergunta se quer repetir o mesmo
 * comentário no card mãe também (evita ter que escrever duas vezes a
 * mesma coisa pro atendimento acompanhar).
 */
function mostrarPromptRepetirComentario(task, texto) {
  const el = document.getElementById("repetirComentarioPrompt");
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `
    <span>Repetir esse comentário no card mãe?</span>
    <button type="button" class="repetir-sim">Sim</button>
    <button type="button" class="repetir-nao">Não</button>
  `;
  el.querySelector(".repetir-nao").addEventListener("click", () => { el.hidden = true; });
  el.querySelector(".repetir-sim").addEventListener("click", async () => {
    el.innerHTML = `<span>Enviando pro card mãe...</span>`;
    const ok = await enviarComentarioNoBackend(task.parentTaskId, texto);
    el.innerHTML = ok ? `<span>✓ Repetido no card mãe.</span>` : `<span>Não consegui enviar pro card mãe.</span>`;
    setTimeout(() => { el.hidden = true; }, 2000);
  });
}

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

async function salvarPessoaNoBackend(nome, foto, aliases, discord) {
  if (!COLMEIA_API_URL || !nome) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "salvarPessoa", nome, foto, aliases, discord }),
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
 * Busca o link do Discord (DM) de uma pessoa, cadastrado manualmente
 * no painel "Pessoas conhecidas".
 */
function getDiscordDaPessoa(nome) {
  const p = pessoasSalvas.find(x => nomesCorrespondem(x.nome, nome));
  return (p && p.discord) || null;
}

/**
 * Busca o link do canal do Discord do cliente — procurado dentro dos
 * links extras cadastrados pra esse cliente (basta nomear um link
 * extra como "Discord").
 */
function getDiscordDoCliente(nomeCliente) {
  const dados = getLinksDoCliente(nomeCliente);
  if (!dados || !dados.extras) return null;
  const extra = dados.extras.find(e => normalizarParaComparar(e.nome).includes("discord"));
  return extra ? extra.url : null;
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
    parentTaskId: t.parentTaskId || null,
    link: t.link,
    attachmentsCount: t.attachmentsCount || 0,
    assignee: t.assignee,
    assigneeAvatarUrl: t.assigneeAvatarUrl || null,
    timerSeconds: t.workedSeconds || 0,
    running: !!t.isRunning,
    estimateMinutes: t.estimateMinutes || 30,
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
    verificarNotificacoes();
  } catch (err) {
    console.error("Falha ao conectar com o backend do Colmeia:", err);
    tasks = tasksFake;
    carregandoTarefas = false;
    buildBoard();
    render();
  }
}

/**
 * Busca de novo as tarefas reais do Runrun.it e atualiza o quadro sem
 * mostrar a tela de "Carregando..." e sem fechar o pop-up de detalhe
 * que estiver aberto — usada depois de qualquer ação (comentário,
 * concluir, avançar responsável, mudar coluna etc) pra que tarefas que
 * mudaram de dono/etapa já sumam do quadro sozinhas, e tarefas novas já
 * apareçam, sem precisar dar F5.
 */
async function atualizarKanbanEmBackground() {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1) return;
  try {
    const res = await fetch(COLMEIA_API_URL + "?tipo=tarefas");
    const data = await res.json();
    if (!data.ok) return;

    const novasTarefas = data.tarefas.filter(t => !t.isOutraEtapa).map(mapearTarefaDoBackend);

    // Preserva o progresso visual (barra) e não deixa o cronômetro
    // "voltar no tempo" se, por acaso, o Runrun.it ainda não processou
    // os últimos segundos rodados localmente.
    novasTarefas.forEach(nova => {
      const antiga = tasks.find(t => t.id === nova.id);
      if (antiga) {
        nova.estimatePct = antiga.estimatePct || nova.estimatePct;
        if (antiga.running && nova.running) {
          nova.timerSeconds = Math.max(nova.timerSeconds, antiga.timerSeconds);
        }
      }
    });

    const idAberto = (tasks[detailIdx] && tasks[detailIdx].id) || null;
    tasks = novasTarefas;

    if (idAberto) {
      const novoIdx = tasks.findIndex(t => t.id === idAberto);
      if (novoIdx !== -1) {
        detailIdx = novoIdx;
      } else {
        // A tarefa que estava aberta sumiu daqui (mudou de etapa ou de
        // responsável) — fecha o pop-up sozinho, não faz sentido
        // continuar mostrando o detalhe de algo que já não está mais
        // no seu quadro.
        closeDetail();
      }
    }

    render();
    updateNowPlaying();
  } catch (err) {
    console.error("Falha ao atualizar o kanban em background:", err);
  }
}

// Agenda a atualização em background com um pequeno atraso (dá tempo
// do Runrun.it processar a mudança) e "debounca" — se vários cliques
// pedirem atualização em sequência, só dispara uma vez.
let _timeoutAtualizacaoKanban = null;
function agendarAtualizacaoKanban() {
  clearTimeout(_timeoutAtualizacaoKanban);
  _timeoutAtualizacaoKanban = setTimeout(atualizarKanbanEmBackground, 900);
}

// Além de atualizar depois de cada ação, também atualiza sozinho de
// tempos em tempos (pega mudanças feitas por outras pessoas do time).
setInterval(atualizarKanbanEmBackground, 60000);

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
 * Para o cronômetro (visual + Runrun.it) automaticamente sempre que a
 * tarefa é transferida pro próximo responsável ou concluída — não faz
 * sentido o cronômetro continuar rodando numa tarefa que já não é mais
 * "sua" ou que já foi entregue.
 */
function pararCronometroAoTransferir(task) {
  if (!task.running) return;
  task.running = false;
  pausarTarefaNoBackend(task.id);
  render();
  updateNowPlaying();
  const detailPlayBtn = document.getElementById("detailPlay");
  if (detailPlayBtn) {
    detailPlayBtn.innerHTML = playIcon;
    detailPlayBtn.setAttribute("aria-label", "Iniciar tarefa");
  }
  const detailTimerEl = document.getElementById("detailTimer");
  if (detailTimerEl) detailTimerEl.textContent = formatTime(task.timerSeconds);
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
// Qual aba do painel do coordenador está ativa agora.
let configTabAtiva = "pessoas";

function abrirPainelPessoas() {
  const overlay = document.getElementById("peopleModalOverlay");
  overlay.hidden = false;
  configTabAtiva = "pessoas";
  atualizarAbasConfig();
}

function atualizarAbasConfig() {
  document.getElementById("configTabPessoas").classList.toggle("active", configTabAtiva === "pessoas");
  document.getElementById("configTabClientes").classList.toggle("active", configTabAtiva === "clientes");
  const hint = document.getElementById("configHint");
  if (configTabAtiva === "pessoas") {
    hint.textContent = "Todo nome que o Colmeia encontrar (no painel-designers-beeon, no Runrun.it, em subtarefas etc) aparece aqui. Troque a foto ou vincule apelidos à mesma pessoa.";
    renderPainelPessoas();
  } else {
    hint.textContent = "Cadastre os links de cada cliente (Drive, banco de imagens etc) — eles aparecem no Hub do Cliente pros designers.";
    renderPainelClientes();
    carregarPastasDriveSeNecessario().then(() => {
      if (configTabAtiva === "clientes") renderPainelClientes();
    });
  }
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
    const discordAtual = salvo ? salvo.discord || "" : "";
    return `
      <div class="people-row" data-chave="${chave}" data-nome-original="${info.nomeOriginal}">
        <div class="people-row-top">
          <div class="people-row-avatar">${avatarPreviewHTML(info.nomeOriginal, fotoAtual)}</div>
          <span class="people-row-name">${info.nomeOriginal}</span>
        </div>
        <input type="text" class="people-row-input" data-campo="foto" placeholder="URL da foto" value="${fotoAtual}">
        <input type="text" class="people-row-input" data-campo="aliases" placeholder="Apelidos, separados por vírgula (ex: Manu, Manuela)" value="${aliasesTexto}">
        <input type="text" class="people-row-input" data-campo="discord" placeholder="Link do Discord (DM dessa pessoa)" value="${discordAtual}">
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
      const discord = row.querySelector('[data-campo="discord"]').value.trim();

      btn.disabled = true;
      btn.textContent = "Salvando...";
      const ok = await salvarPessoaNoBackend(nomeOriginal, foto, aliases, discord);
      btn.disabled = false;
      btn.textContent = "Salvar";

      if (ok) {
        const idxSalvo = pessoasSalvas.findIndex(p => normalizarParaComparar(p.nome) === normalizarParaComparar(nomeOriginal));
        const novoRegistro = { nome: nomeOriginal, foto, aliases, discord };
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

// Grupos de clientes expandidos no painel de configuração (igual ao
// padrão das outras listas expansíveis do Colmeia).
const clientesConfigExpandido = new Set();
let clientesConfigFiltro = "";

/**
 * Junta os nomes de clientes de todos os designers no painel-beeon,
 * sem duplicar, ordenados de A a Z.
 */
function listarTodosClientesConhecidos() {
  if (!painelBeeonData || !painelBeeonData.state) return [];
  const vistos = new Set();
  const nomes = [];
  Object.values(painelBeeonData.state).forEach(lista => {
    (lista || []).forEach(c => {
      const chave = normalizarParaComparar(c.cliente);
      if (vistos.has(chave)) return;
      vistos.add(chave);
      nomes.push(c.cliente);
    });
  });
  return nomes.sort((a, b) => a.localeCompare(b));
}

/**
 * Busca as pastas de cliente de verdade no Google Drive (mesma
 * estrutura do painel-designers-beeon: Beeon > Clientes > [cliente],
 * com a subpasta Publicações dentro), casa com os clientes já
 * conhecidos pelo nome, e preenche/salva só os campos que ainda
 * estiverem vazios — nunca sobrescreve um link que você já colocou
 * na mão.
 */
async function preencherDriveAutomatico() {
  const btn = document.getElementById("driveAutofillBtn");
  const statusEl = document.getElementById("driveAutofillStatus");
  btn.disabled = true;
  statusEl.textContent = "Lendo o Drive...";

  try {
    await carregarPastasDriveSeNecessario();
    btn.disabled = false;

    if (!pastasDriveCache || pastasDriveCache.length === 0) {
      statusEl.textContent = "Não consegui ler o Drive.";
      return;
    }

    const pastasDrive = pastasDriveCache;
    const todosClientes = listarTodosClientesConhecidos();
    let atualizados = 0;

    for (const cliente of todosClientes) {
      const dadosAtuais = getLinksDoCliente(cliente) || { drive: "", bancoImagens: "", bibliotecaAdobe: "", pastaPublicacoes: "", extras: [], pastaDriveVinculada: "" };

      // Se já tem um vínculo manual escolhido, usa ele — não tenta
      // adivinhar pelo nome nesse caso.
      let pasta = null;
      if (dadosAtuais.pastaDriveVinculada) {
        pasta = pastasDrive.find(p => p.driveUrl === dadosAtuais.pastaDriveVinculada);
      } else {
        pasta = pastasDrive.find(p => normalizarParaComparar(p.nome) === normalizarParaComparar(cliente));
      }
      if (!pasta) continue;

      const precisaDrive = !dadosAtuais.drive && pasta.driveUrl;
      const precisaPublicacoes = !dadosAtuais.pastaPublicacoes && pasta.pastaPublicacoesUrl;
      if (!precisaDrive && !precisaPublicacoes) continue;

      const novosDados = {
        drive: dadosAtuais.drive || pasta.driveUrl || "",
        bancoImagens: dadosAtuais.bancoImagens || "",
        bibliotecaAdobe: dadosAtuais.bibliotecaAdobe || "",
        pastaPublicacoes: dadosAtuais.pastaPublicacoes || pasta.pastaPublicacoesUrl || "",
        pastaDriveVinculada: dadosAtuais.pastaDriveVinculada || "",
        extras: dadosAtuais.extras || [],
      };
      const ok = await salvarLinksClienteNoBackend(cliente, novosDados);
      if (ok) {
        const idxExistente = linksClientes.findIndex(l => normalizarParaComparar(l.cliente) === normalizarParaComparar(cliente));
        const novoRegistro = { cliente, ...novosDados };
        if (idxExistente !== -1) linksClientes[idxExistente] = novoRegistro;
        else linksClientes.push(novoRegistro);
        atualizados++;
      }
    }

    renderPainelClientes();
    const statusDepois = document.getElementById("driveAutofillStatus");
    if (statusDepois) statusDepois.textContent = `✓ ${atualizados} cliente${atualizados === 1 ? "" : "s"} preenchido${atualizados === 1 ? "" : "s"}.`;
  } catch (err) {
    console.error("Falha ao preencher Drive automaticamente:", err);
    btn.disabled = false;
    statusEl.textContent = "Falha de conexão.";
  }
}

// Cache das pastas de cliente lidas do Drive, carregada uma vez ao
// abrir a aba "Links de clientes" — usada pro seletor de vínculo manual.
let pastasDriveCache = null;

async function carregarPastasDriveSeNecessario() {
  if (pastasDriveCache !== null || !COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarPastasClientesDrive" }),
    });
    const data = await res.json();
    pastasDriveCache = data.ok ? (data.clientes || []) : [];
  } catch (err) {
    console.error("Falha ao carregar pastas do Drive:", err);
    pastasDriveCache = [];
  }
}

function renderPainelClientes() {
  const body = document.getElementById("peopleModalBody");

  if (!painelBeeonData) {
    body.innerHTML = `<p class="workflow-seq-empty">Carregando clientes do painel-designers-beeon...</p>`;
    return;
  }

  const todosClientes = listarTodosClientesConhecidos();
  const alvo = normalizarParaComparar(clientesConfigFiltro);
  const clientesFiltrados = alvo ? todosClientes.filter(c => normalizarParaComparar(c).includes(alvo)) : todosClientes;

  body.innerHTML = `
    <div class="drive-autofill-bar">
      <button type="button" id="driveAutofillBtn">🔄 Preencher Drive automaticamente</button>
      <span class="people-row-saved" id="driveAutofillStatus"></span>
    </div>
    <input type="text" class="rule-add-search" id="clientesConfigSearch" placeholder="Buscar cliente..." value="${clientesConfigFiltro}">
    <div class="config-clientes-list">
      ${clientesFiltrados.map(cliente => {
        const dados = getLinksDoCliente(cliente) || { drive: "", bancoImagens: "", bibliotecaAdobe: "", pastaPublicacoes: "", extras: [], pastaDriveVinculada: "", descricao: "" };
        const aberto = clientesConfigExpandido.has(cliente);
        return `
          <div class="atendimento-group ${aberto ? "expanded" : ""}">
            <button type="button" class="atendimento-group-header" data-cliente="${cliente}">
              <span class="atendimento-group-name">${cliente}</span>
            </button>
            ${aberto ? `
              <div class="cliente-links-form" data-cliente-form="${cliente}">
                <label class="cliente-link-field">
                  <span>Descrição (aparece no card de "Meus clientes")</span>
                  <textarea data-campo="descricao" placeholder="Ex: Açougue frigorífico em Passos, Itaú e SSP" rows="2">${dados.descricao || ""}</textarea>
                </label>
                <label class="cliente-link-field">
                  <span>Vincular pasta do Drive (se o nome vier diferente)</span>
                  <select class="cliente-drive-vinculo" data-campo="pastaDriveVinculada">
                    <option value="">— Escolher a pasta certa —</option>
                    ${(pastasDriveCache || []).map(p => `
                      <option value="${p.driveUrl}" data-pub="${p.pastaPublicacoesUrl || ""}" ${dados.pastaDriveVinculada === p.driveUrl ? "selected" : ""}>${p.nome}</option>
                    `).join("")}
                  </select>
                </label>
                <label class="cliente-link-field">
                  <span>Drive do cliente</span>
                  <input type="text" data-campo="drive" value="${dados.drive || ""}" placeholder="https://drive.google.com/...">
                </label>
                <label class="cliente-link-field">
                  <span>Banco de imagens</span>
                  <input type="text" data-campo="bancoImagens" value="${dados.bancoImagens || ""}" placeholder="https://...">
                </label>
                <label class="cliente-link-field">
                  <span>Biblioteca Adobe</span>
                  <input type="text" data-campo="bibliotecaAdobe" value="${dados.bibliotecaAdobe || ""}" placeholder="https://...">
                </label>
                <label class="cliente-link-field">
                  <span>Pasta de publicações</span>
                  <input type="text" data-campo="pastaPublicacoes" value="${dados.pastaPublicacoes || ""}" placeholder="https://...">
                </label>
                <div class="cliente-links-extras" data-extras-lista>
                  ${(dados.extras || []).map((e, i) => `
                    <div class="cliente-link-extra" data-extra-idx="${i}">
                      <input type="text" data-extra-campo="nome" value="${e.nome || ""}" placeholder="Nome do link">
                      <input type="text" data-extra-campo="url" value="${e.url || ""}" placeholder="https://...">
                      <button type="button" class="cliente-link-extra-remove" data-extra-idx="${i}" title="Remover">×</button>
                    </div>
                  `).join("")}
                </div>
                <button type="button" class="cliente-link-add-extra">+ Adicionar link extra</button>
                <div class="cliente-links-footer">
                  <button type="button" class="people-row-save" data-cliente-salvar="${cliente}">Salvar</button>
                  <span class="people-row-saved" data-cliente-saved="${cliente}"></span>
                </div>
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;

  document.getElementById("clientesConfigSearch").addEventListener("input", e => {
    clientesConfigFiltro = e.target.value;
    renderPainelClientes();
  });

  document.getElementById("driveAutofillBtn").addEventListener("click", preencherDriveAutomatico);

  body.querySelectorAll(".atendimento-group-header").forEach(btn => {
    btn.addEventListener("click", () => {
      const cliente = btn.dataset.cliente;
      if (clientesConfigExpandido.has(cliente)) clientesConfigExpandido.delete(cliente);
      else clientesConfigExpandido.add(cliente);
      renderPainelClientes();
    });
  });

  body.querySelectorAll(".cliente-link-add-extra").forEach(btn => {
    btn.addEventListener("click", () => {
      const form = btn.closest(".cliente-links-form");
      const lista = form.querySelector("[data-extras-lista]");
      const idx = lista.children.length;
      const div = document.createElement("div");
      div.className = "cliente-link-extra";
      div.dataset.extraIdx = idx;
      div.innerHTML = `
        <input type="text" data-extra-campo="nome" placeholder="Nome do link">
        <input type="text" data-extra-campo="url" placeholder="https://...">
        <button type="button" class="cliente-link-extra-remove" data-extra-idx="${idx}" title="Remover">×</button>
      `;
      lista.appendChild(div);
      div.querySelector(".cliente-link-extra-remove").addEventListener("click", () => div.remove());
    });
  });

  body.querySelectorAll(".cliente-link-extra-remove").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".cliente-link-extra").remove());
  });

  body.querySelectorAll(".cliente-drive-vinculo").forEach(select => {
    select.addEventListener("change", () => {
      const form = select.closest(".cliente-links-form");
      const opcao = select.options[select.selectedIndex];
      if (!opcao.value) return;
      form.querySelector('[data-campo="drive"]').value = opcao.value;
      const pub = opcao.dataset.pub;
      if (pub) form.querySelector('[data-campo="pastaPublicacoes"]').value = pub;
    });
  });

  body.querySelectorAll("[data-cliente-salvar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cliente = btn.dataset.clienteSalvar;
      const form = body.querySelector(`[data-cliente-form="${CSS.escape(cliente)}"]`);
      const dados = {
        descricao: form.querySelector('[data-campo="descricao"]').value.trim(),
        drive: form.querySelector('[data-campo="drive"]').value.trim(),
        bancoImagens: form.querySelector('[data-campo="bancoImagens"]').value.trim(),
        bibliotecaAdobe: form.querySelector('[data-campo="bibliotecaAdobe"]').value.trim(),
        pastaPublicacoes: form.querySelector('[data-campo="pastaPublicacoes"]').value.trim(),
        pastaDriveVinculada: form.querySelector('[data-campo="pastaDriveVinculada"]').value,
        extras: Array.from(form.querySelectorAll(".cliente-link-extra")).map(div => ({
          nome: div.querySelector('[data-extra-campo="nome"]').value.trim(),
          url: div.querySelector('[data-extra-campo="url"]').value.trim(),
        })).filter(e => e.nome && e.url),
      };

      btn.disabled = true;
      btn.textContent = "Salvando...";
      const ok = await salvarLinksClienteNoBackend(cliente, dados);
      btn.disabled = false;
      btn.textContent = "Salvar";

      const avisoEl = form.querySelector(`[data-cliente-saved="${CSS.escape(cliente)}"]`);
      if (ok) {
        const idxExistente = linksClientes.findIndex(l => normalizarParaComparar(l.cliente) === normalizarParaComparar(cliente));
        const novoRegistro = { cliente, ...dados };
        if (idxExistente !== -1) linksClientes[idxExistente] = novoRegistro;
        else linksClientes.push(novoRegistro);
        avisoEl.textContent = "✓ Salvo";
        setTimeout(() => { avisoEl.textContent = ""; }, 2000);
      } else {
        avisoEl.textContent = "Erro ao salvar";
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
        <div class="rule-row ${s.atual ? "current" : ""} ${s.pendente ? "pendente" : ""}" data-element-id="${s.id}">
          <span class="rule-row-order">${i + 1}</span>
          ${avatarHTML(s.nome, "avatar-sm", s.foto)}
          <span class="rule-row-name">${s.nome}</span>
          ${s.pendente ? `<span class="rule-row-spinner"></span>` :
            s.concluido ? `<span class="rule-row-status done">Concluído</span>` :
            s.atual ? `<span class="rule-row-status current">Atual</span>` :
            `<span class="rule-row-status">Aguardando</span>`}
          ${(!s.concluido && !s.atual && !s.pendente) ? `
            <button type="button" class="rule-row-remove" data-element-id="${s.id}" title="Remover da sequência">
              <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          ` : ""}
        </div>
      `).join("");

  body.innerHTML = `
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
    btn.addEventListener("click", e => {
      e.stopPropagation();
      removerPessoaOtimista(task, btn.dataset.elementId);
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

/**
 * Remove a linha na hora (otimista, sem esperar o servidor responder)
 * e só depois confirma de verdade com o Runrun.it em segundo plano.
 */
/**
 * Depois que a resposta de verdade do Runrun.it chega, atualiza tanto o
 * cabeçalho quanto a lista dentro do modal "Ver regra" (se ele ainda
 * estiver aberto) — sem isso, a linha otimista ficava presa girando
 * pra sempre, mesmo depois de já ter confirmado de verdade.
 */
async function atualizarSequenciaEModal(task) {
  await carregarSequencia(task);
  const overlay = document.getElementById("ruleModalOverlay");
  if (overlay && !overlay.hidden) renderModalRegra(task);
}

function removerPessoaOtimista(task, elementId) {
  const row = document.querySelector(`.rule-row[data-element-id="${elementId}"]`);
  if (row) {
    row.classList.add("saindo");
    setTimeout(() => row.remove(), 200);
  }
  task.sequencia = task.sequencia.filter(s => String(s.id) !== String(elementId));
  removerDaRegraNoBackend(task.workflowId, elementId).then(() => atualizarSequenciaEModal(task));
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
    btn.addEventListener("click", e => {
      animarPessoaSubindo(btn, e);
      adicionarPessoaOtimista(task, {
        id: btn.dataset.userId,
        nome: btn.dataset.userNome,
        foto: btn.dataset.userFoto || null,
      });
    });
  });
}

/**
 * Adiciona a pessoa na hora na lista (otimista, com um spinner bem
 * discreto na linha dela), sem esperar o Runrun.it responder. Confirma
 * de verdade em segundo plano e substitui pela sequência real quando
 * a resposta chegar.
 */
function adicionarPessoaOtimista(task, usuario) {
  const seq = task.sequencia || [];
  seq.forEach(s => { s.ultimo = false; });
  seq.push({
    id: "pendente-" + Date.now(),
    nome: usuario.nome,
    foto: usuario.foto,
    atual: false,
    concluido: false,
    ultimo: true,
    pendente: true,
  });
  task.sequencia = seq;
  renderModalRegra(task);
  renderSequenciaNoHeaderSeAberta(task);

  adicionarNaRegraNoBackend(task.workflowId, usuario.id).then(() => atualizarSequenciaEModal(task));
}

/**
 * Se o pop-up da tarefa ainda estiver aberto nela, atualiza também a
 * sequência mostrada no cabeçalho (fora do modal), pra não ficar
 * desatualizada enquanto o modal está aberto por cima.
 */
function renderSequenciaNoHeaderSeAberta(task) {
  if (tasks[detailIdx] !== task) return;
  const el = document.getElementById("workflowSeqGroup");
  if (el) el.innerHTML = renderSequenciaHTML(task);
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

async function reabrirTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "reabrirTarefa", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou reabrir a tarefa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao reabrir a tarefa no Runrun.it:", err);
    return false;
  }
}

/**
 * Move a tarefa de verdade pra outra etapa/coluna no Runrun.it — usada
 * tanto pelo drag-and-drop do Kanban quanto pelo menu de status do
 * pop-up de detalhe.
 */
async function moverEtapaNoBackend(taskId, chaveColuna) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "moverEtapa", taskId, chaveColuna }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou mover a etapa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao mover a etapa no Runrun.it:", err);
    return false;
  }
}

async function ajustarEstimativaNoBackend(taskId, minutos) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "ajustarEstimativa", taskId, minutos }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou ajustar a estimativa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao ajustar a estimativa no Runrun.it:", err);
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
/**
 * Categoriza um campo do briefing por cor, baseado em palavras-chave na
 * própria pergunta (funciona mesmo com perguntas diferentes de tarefa
 * pra tarefa, já que olha só se tem certas palavras, não o texto exato).
 */
/**
 * Filtro de segurança: mesmo que a IA erre e devolva de novo a
 * pergunta de plataformas ou formatos dentro de "campos" (já mostrada
 * separada em cima), esconde a duplicata aqui.
 */
function ehCampoDuplicadoDePlataformaOuFormato(pergunta) {
  const p = normalizarParaComparar(pergunta);
  const ehPlataforma = p.includes("publicad") || (p.includes("onde") && p.includes("conteudo"));
  const ehFormato = p.includes("formato") && (p.includes("necess") || p.includes("quais"));
  return ehPlataforma || ehFormato;
}

function categoriaCampoBriefing(pergunta) {
  const p = normalizarParaComparar(pergunta);
  if (p.includes("referencia") || p.includes("link")) return "cat-blue";
  if (p.includes("instrucao") || p.includes("redacao")) return "cat-purple";
  if (p.includes("observa") || p.includes("expectativa")) return "cat-pink";
  if (p.includes("comentario") || p.includes("legenda") || p.includes("arte")) return "cat-teal";
  return "cat-gray";
}

/**
 * Identifica se uma pergunta é sobre o texto que vai dentro da arte
 * (varia de redação entre tarefas: "informações textuais", "texto na
 * arte" etc.) — não depende de vir sempre com as mesmas palavras exatas,
 * só que tenha "texto" e "arte" nela.
 */
function ehCampoTextoNaArte(pergunta) {
  const p = normalizarParaComparar(pergunta);
  return (p.includes("texto") || p.includes("textu")) && p.includes("arte");
}

// Serviços conhecidos pra reconhecer o link e mostrar "Ver no X" em vez
// da URL crua. Se não reconhecer o domínio, usa o próprio domínio como
// nome (ex: "Ver no meusite.com").
const SERVICOS_LINK = {
  "docs.google.com": "Docs",
  "drive.google.com": "Drive",
  "sheets.google.com": "Planilhas",
  "slides.google.com": "Slides",
  "forms.google.com": "Formulários",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "figma.com": "Figma",
  "notion.so": "Notion",
  "canva.com": "Canva",
  "trello.com": "Trello",
  "dropbox.com": "Dropbox",
};

function detectarServicoDoLink(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const dominio in SERVICOS_LINK) {
      if (host.includes(dominio)) return SERVICOS_LINK[dominio];
    }
    return host;
  } catch (err) {
    return null;
  }
}

/**
 * Desenha o valor de um campo do briefing: se o valor inteiro for só um
 * link, mostra uma etiqueta "Ver no Docs ↗" (ou o serviço que for) em
 * vez da URL crua. Senão, usa o texto normal com qualquer link dentro
 * dele virando clicável.
 */
function renderValorCampo(valor) {
  const soLink = /^https?:\/\/\S+$/.test(valor.trim());
  if (soLink) {
    const url = valor.trim();
    const servico = detectarServicoDoLink(url) || "link";
    return `<a href="${url}" target="_blank" rel="noopener" class="ai-briefing-link-pill">Ver no ${servico} ↗</a>`;
  }
  return linkificarTexto(valor);
}

/**
 * Escapa HTML (evita que o texto quebre a página se tiver < ou &, por
 * exemplo) e transforma links (http/https) em links clicáveis de
 * verdade — usado nos campos do briefing gerado pela IA, já que um
 * deles pode ser um link do Google Drive ou de referência.
 */
function escaparHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function linkificarTexto(texto) {
  const escapado = escaparHTML(texto);
  return escapado.replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

// Cores pra alternar entre os formatos gerados pela IA (mesmo estilo
// visual dos boxes que já existiam, só que agora com dados reais).
const CORES_FORMATO_BOX = ["fb-blue", "fb-purple", "fb-orange", "fb-teal", "fb-pink"];

/**
 * Chama o Gemini (via backend) pra organizar a descrição real da
 * tarefa em plataformas + formatos + um resumo do briefing, e desenha
 * o resultado no lugar do botão.
 */
function wireBriefingCopyButtons(resultEl) {
  resultEl.querySelectorAll(".ai-briefing-copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.texto).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = "✓";
        setTimeout(() => { btn.innerHTML = original; }, 1200);
      });
    });
  });
}

async function gerarBriefingComIA(task) {
  const resultEl = document.getElementById("briefingResult");
  if (!resultEl) return;

  if (!COLMEIA_API_URL) {
    resultEl.innerHTML = `<p class="workflow-seq-empty">Backend não configurado.</p>`;
    task.briefingHTML = resultEl.innerHTML;
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
      task.briefingHTML = resultEl.innerHTML;
      return;
    }
    if (data.semDescricao) {
      resultEl.innerHTML = `<p class="workflow-seq-empty">Essa tarefa não tem descrição pra organizar.</p>`;
      task.briefingHTML = resultEl.innerHTML;
      return;
    }

    const b = data.briefing || {};
    const plataformas = b.plataformas || [];
    const formatos = b.formatos || [];
    const resumo = b.resumo || "";
    // Campos dinâmicos — a IA identifica sozinha quais perguntas existem
    // na descrição (varia de tarefa pra tarefa) e devolve a resposta de
    // cada uma, exatamente como está escrita (nunca reescrita).
    const campos = (b.campos || []).filter(c => !ehCampoDuplicadoDePlataformaOuFormato(c.pergunta));

    // O campo de "texto na arte" ganha destaque especial (o designer vai
    // copiar isso direto pra peça) — identificado pela pergunta conter
    // as palavras "texto" e "arte", não importa a redação exata.
    const idxDestaque = campos.findIndex(c => ehCampoTextoNaArte(c.pergunta) && c.resposta);
    const campoDestaque = idxDestaque !== -1 ? campos[idxDestaque] : null;
    const camposSecundarios = campos.filter((c, i) => i !== idxDestaque);

    resultEl.innerHTML = `
      ${(plataformas.length || formatos.length) ? `
        <div class="ai-briefing-tags">
          ${plataformas.map(p => `<span class="ai-briefing-plataforma-tag">${p}</span>`).join("")}
          ${formatos.map((f, i) => `<div class="format-box format-box-sm ${CORES_FORMATO_BOX[i % CORES_FORMATO_BOX.length]}">${f}</div>`).join("")}
        </div>
      ` : ""}
      ${resumo ? `<p class="ai-briefing-resumo">${resumo}</p>` : ""}
      ${campoDestaque ? `
        <div class="ai-briefing-destaque">
          <div>
            <p class="ai-briefing-destaque-label">${campoDestaque.pergunta}</p>
            <p class="ai-briefing-destaque-valor">${escaparHTML(campoDestaque.resposta)}</p>
          </div>
          <button type="button" class="ai-briefing-copy-btn" data-texto="${escaparHTML(campoDestaque.resposta).replace(/"/g, "&quot;")}" title="Copiar texto">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
        </div>
      ` : ""}
      ${(() => {
        const preenchidos = camposSecundarios.filter(c => c.resposta);
        const vazios = camposSecundarios.filter(c => !c.resposta);
        return `
          ${preenchidos.length ? `
            <div class="ai-briefing-preenchidos">
              ${preenchidos.map(c => `
                <div class="ai-briefing-cat ${categoriaCampoBriefing(c.pergunta)}">
                  <div class="ai-briefing-cat-head">
                    <span class="ai-briefing-cat-icon">${c.pergunta.trim().charAt(0).toUpperCase()}</span>
                    <span class="ai-briefing-cat-label">${c.pergunta}</span>
                  </div>
                  <div class="ai-briefing-cat-valor">${renderValorCampo(c.resposta)}</div>
                </div>
              `).join("")}
            </div>
          ` : ""}
          ${vazios.length ? `
            <div class="ai-briefing-vazios">
              <span class="ai-briefing-vazios-label">Vazios</span>
              ${vazios.map(c => `<span class="ai-briefing-vazio-bolha" title="${c.pergunta}">${c.pergunta.trim().charAt(0).toUpperCase()}</span>`).join("")}
            </div>
          ` : ""}
        `;
      })()}
    `;

    task.briefingHTML = resultEl.innerHTML; // guarda pronto — não perde mais em re-renders (ex: ao dar play)
    wireBriefingCopyButtons(resultEl);
  } catch (err) {
    console.error("Falha ao gerar briefing com IA:", err);
    if (tasks[detailIdx] === task) {
      resultEl.innerHTML = `<p class="workflow-seq-empty">Falha de conexão.</p>`;
      task.briefingHTML = resultEl.innerHTML;
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

async function salvarDescricaoNoBackend(taskId, texto) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "salvarDescricao", taskId, texto }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou salvar a descrição:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao salvar a descrição no Runrun.it:", err);
    return false;
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

async function reagirComentarioNoBackend(commentId, emoji) {
  if (!COLMEIA_API_URL || !commentId || !emoji) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "reagirComentario", commentId, emoji }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou a reação:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao reagir no Runrun.it:", err);
    return false;
  }
}

async function excluirComentarioNoBackend(commentId) {
  if (!COLMEIA_API_URL || !commentId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "excluirComentario", commentId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou excluir o comentário:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao excluir comentário no Runrun.it:", err);
    return false;
  }
}

async function enviarComentarioComAnexoNoBackend(taskId, texto, arquivo) {
  if (!COLMEIA_API_URL || !taskId || !arquivo) return false;
  try {
    const base64Dados = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.readAsDataURL(arquivo);
    });
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({
        acao: "adicionarComentarioComAnexo",
        taskId, texto,
        nomeArquivo: arquivo.name,
        mimeType: arquivo.type || "application/octet-stream",
        base64Dados,
      }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o anexo:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao enviar anexo pro Runrun.it:", err);
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
    if (PAPEL_LOGADO === "designer") {
      list = list.filter(t => nomesCorrespondem(t.assignee, DESIGNER_LOGADO));
    } else if (PAPEL_LOGADO === "coordenador" && filtroDesignerCoordenador !== "todos") {
      const alvoNome = filtroDesignerCoordenador === "eu" ? DESIGNER_LOGADO : filtroDesignerCoordenador;
      list = list.filter(t => nomesCorrespondem(t.assignee, alvoNome));
    }
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
        const task = tasks[idx];
        const statusAntigo = task.status;
        if (statusAntigo === newStatus) return;
        task.status = newStatus;
        render();
        moverEtapaNoBackend(task.id, newStatus).then(ok => {
          if (!ok) {
            task.status = statusAntigo; // Runrun.it recusou — volta pro estado real
            render();
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
        pararCronometroAoTransferir(task);
        const novoResponsavel = await avancarWorkflowNoBackend(task.id);
        if (novoResponsavel) {
          task.assignee = novoResponsavel;
          task.assigneeAvatarUrl = null;
          render();
          agendarAtualizacaoKanban();
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
            agendarAtualizacaoKanban();
          } else {
            alert("Não consegui reatribuir essa tarefa agora. Tenta de novo em alguns segundos.");
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
  const emojiPicker = document.getElementById("emojiPicker");
  if (emojiPicker) emojiPicker.hidden = true;
});

// Links de clientes cadastrados pelo coordenador (Drive, Banco de
// imagens, Biblioteca Adobe, Pasta de publicações + extras avulsos),
// carregados do backend do Colmeia.
let linksClientes = []; // [{cliente, drive, bancoImagens, bibliotecaAdobe, pastaPublicacoes, extras:[{nome,url}]}]

async function carregarLinksClientes() {
  if (!COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarLinksClientes" }),
    });
    const data = await res.json();
    if (data.ok) linksClientes = data.links || [];
  } catch (err) {
    console.error("Falha ao carregar links de clientes:", err);
  }
}

async function salvarLinksClienteNoBackend(cliente, dados) {
  if (!COLMEIA_API_URL || !cliente) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "salvarLinksCliente", cliente, dados }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (err) {
    console.error("Falha ao salvar links do cliente:", err);
    return false;
  }
}

let progressoClientes = []; // [{designer, cliente, entregues, total}]
let clientesOcultos = []; // [{designer, cliente}] — só filtro do Colmeia

async function carregarClientesOcultos() {
  if (!COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarClientesOcultos" }),
    });
    const data = await res.json();
    if (data.ok) clientesOcultos = data.ocultos || [];
  } catch (err) {
    console.error("Falha ao carregar clientes ocultos:", err);
  }
}

function clienteEstaOculto(designer, cliente) {
  return clientesOcultos.some(o => nomesCorrespondem(o.designer, designer) && normalizarParaComparar(o.cliente) === normalizarParaComparar(cliente));
}

async function ocultarClienteNoBackend(designer, cliente) {
  if (!COLMEIA_API_URL) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "ocultarCliente", designer, cliente }),
    });
    const data = await res.json();
    return data.ok;
  } catch (err) {
    console.error("Falha ao ocultar cliente:", err);
    return false;
  }
}

async function carregarProgressoClientes() {
  if (!COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarProgressoClientes" }),
    });
    const data = await res.json();
    if (data.ok) {
      progressoClientes = data.progresso || [];
      if (!document.getElementById("page-clientes").hidden) buildClientsPage();
    }
  } catch (err) {
    console.error("Falha ao carregar progresso mensal de clientes:", err);
  }
}

function getProgressoCliente(designer, cliente) {
  const reg = progressoClientes.find(p => nomesCorrespondem(p.designer, designer) && normalizarParaComparar(p.cliente) === normalizarParaComparar(cliente));
  return reg ? { entregues: reg.entregues, total: reg.total } : { entregues: 0, total: 0 };
}

function getLinksDoCliente(nomeCliente) {
  return linksClientes.find(l => normalizarParaComparar(l.cliente) === normalizarParaComparar(nomeCliente)) || null;
}

const HUB_FIXOS = [
  { chave: "drive", label: "Drive do cliente", cls: "hub-purple" },
  { chave: "bancoImagens", label: "Banco de imagens", cls: "hub-pink" },
  { chave: "bibliotecaAdobe", label: "Biblioteca Adobe", cls: "hub-blue" },
  { chave: "pastaPublicacoes", label: "Pasta publicações", cls: "hub-teal" },
];

/**
 * Desenha o Hub do Cliente com os links reais cadastrados pelo
 * coordenador. Um link só aparece clicável se tiver URL cadastrada —
 * senão some (não mostra pill vazia/quebrada pro designer).
 */
function renderHubDoClienteHTML(nomeCliente) {
  const dados = getLinksDoCliente(nomeCliente);
  if (!dados) {
    return `<span class="hub-empty">Nenhum link cadastrado ainda pra esse cliente.</span>`;
  }
  const fixos = HUB_FIXOS.filter(h => dados[h.chave]).map(h =>
    `<a href="${dados[h.chave]}" target="_blank" rel="noopener" class="hub-pill ${h.cls}">${h.label}</a>`
  );
  const extras = (dados.extras || []).filter(e => e.url).map((e, i) =>
    `<a href="${e.url}" target="_blank" rel="noopener" class="hub-pill ${HUB_FIXOS[i % HUB_FIXOS.length].cls}">${e.nome}</a>`
  );
  const todos = [...fixos, ...extras];
  if (todos.length === 0) {
    return `<span class="hub-empty">Nenhum link cadastrado ainda pra esse cliente.</span>`;
  }
  return todos.join("");
}

// (attachments fake removido — agora busca de verdade em carregarAnexos())

let detailIdx = null;
let changeOpen = false;
let childrenOpen = false;

// ===== Chat flutuante (comentários em pop-up separado, fora do card) =====
let chatThreadAtivo = "aqui"; // "aqui" (a tarefa aberta) ou "mae" (o card mãe dela)
let chatAlvoTaskId = null;    // id de quem recebe o próximo comentário enviado
const chatMaeCache = new Map(); // taskId (da subtarefa) -> {id, title, comments}

function chaveVistoChat(taskId) {
  return "colmeia_chat_visto_" + taskId;
}
function marcarChatVisto(task) {
  if (!task.id || !task.comments || task.comments.length === 0) return;
  const maiorId = Math.max(...task.comments.map(c => c.id || 0));
  try { localStorage.setItem(chaveVistoChat(task.id), String(maiorId)); } catch (err) { /* sem problema */ }
}
function contarComentariosNaoLidos(task) {
  if (!task.id || !task.comments || task.comments.length === 0) return 0;
  let visto = 0;
  try { visto = Number(localStorage.getItem(chaveVistoChat(task.id))) || 0; } catch (err) { /* sem problema */ }
  return task.comments.filter(c => !nomesCorrespondem(c.autor, DESIGNER_LOGADO) && (c.id || 0) > visto).length;
}
function atualizarBadgeChat(task) {
  const badge = document.getElementById("chatFabBadge");
  if (!badge) return;
  const qtd = contarComentariosNaoLidos(task);
  badge.hidden = qtd === 0;
  badge.textContent = qtd > 9 ? "9+" : String(qtd);
}

/**
 * Abre o pop-up de chat pra tarefa aberta: divide a tela (o card
 * encolhe pra ~30%, o chat ocupa o resto), sempre começando na aba
 * "Comentários aqui".
 */
function abrirChatPanel(task) {
  const painel = document.getElementById("taskDetail");
  const chatPanel = document.getElementById("chatPanel");
  if (!painel || !chatPanel) return;
  painel.classList.add("chat-open");
  chatPanel.hidden = false;
  abrirThreadAqui(task);
}

function fecharChatPanel() {
  const painel = document.getElementById("taskDetail");
  const chatPanel = document.getElementById("chatPanel");
  if (painel) painel.classList.remove("chat-open");
  if (chatPanel) chatPanel.hidden = true;
}

function abrirThreadAqui(task) {
  chatThreadAtivo = "aqui";
  chatAlvoTaskId = task.id;
  const tabAqui = document.getElementById("chatTabAqui");
  const tabMae = document.getElementById("chatTabMae");
  if (tabAqui) tabAqui.classList.add("active");
  if (tabMae) tabMae.classList.remove("active");
  const titulo = document.getElementById("chatPanelTitle");
  if (titulo) titulo.textContent = task.title;
  const thread = document.getElementById("commentsThread");
  if (thread) {
    thread.innerHTML = renderComentariosHTML(task);
    wireExcluirComentario();
    thread.scrollTop = thread.scrollHeight;
  }
  marcarChatVisto(task);
  atualizarBadgeChat(task);
}

/**
 * Troca o chat pra mostrar os comentários do card mãe (só existe o
 * botão se a tarefa tiver parentTaskId). Busca uma vez só e guarda em
 * cache — trocar de aba de volta e pra frente não busca de novo.
 */
async function abrirThreadDoCardMae(task) {
  chatThreadAtivo = "mae";
  chatAlvoTaskId = null;
  const tabAqui = document.getElementById("chatTabAqui");
  const tabMae = document.getElementById("chatTabMae");
  if (tabMae) tabMae.classList.add("active");
  if (tabAqui) tabAqui.classList.remove("active");
  const thread = document.getElementById("commentsThread");
  if (thread) thread.innerHTML = `<p class="comments-empty">Carregando comentários do card mãe...</p>`;

  let cache = chatMaeCache.get(task.id);
  if (!cache) {
    const resultado = await buscarCardMaeDoBackend(task.id);
    if (!resultado.ok || !resultado.temPai) {
      if (chatThreadAtivo === "mae" && tasks[detailIdx] === task && thread) {
        thread.innerHTML = `<p class="comments-empty">Essa tarefa não tem card mãe.</p>`;
      }
      return;
    }
    const comentarios = await buscarComentariosDoBackend(resultado.cardMae.id);
    cache = { id: resultado.cardMae.id, title: resultado.cardMae.title, comments: comentarios };
    chatMaeCache.set(task.id, cache);
  }
  if (chatThreadAtivo !== "mae" || tasks[detailIdx] !== task) return; // trocou de aba/tarefa enquanto carregava
  chatAlvoTaskId = cache.id;
  const titulo = document.getElementById("chatPanelTitle");
  if (titulo) titulo.textContent = cache.title;
  if (thread) {
    thread.innerHTML = renderComentariosHTML({ id: cache.id, comments: cache.comments });
    wireExcluirComentario();
    thread.scrollTop = thread.scrollHeight;
  }
}

/**
 * Recarrega a thread que está sendo mostrada agora no chat (a da
 * própria tarefa ou a do card mãe) — usado depois de enviar, excluir
 * ou reagir a um comentário.
 */
async function recarregarThreadAtiva() {
  const task = tasks[detailIdx];
  if (chatThreadAtivo === "aqui") {
    await carregarComentarios(task);
    return;
  }
  const cache = chatMaeCache.get(task.id);
  if (!cache) return;
  cache.comments = await buscarComentariosDoBackend(cache.id);
  chatMaeCache.set(task.id, cache);
  if (chatThreadAtivo !== "mae" || tasks[detailIdx] !== task) return;
  const thread = document.getElementById("commentsThread");
  if (thread) {
    thread.innerHTML = renderComentariosHTML({ id: cache.id, comments: cache.comments });
    wireExcluirComentario();
  }
}

/**
 * Desenha a lista de comentários de uma tarefa. Enquanto ainda não
 * carregou (task.comments === undefined), mostra "Carregando...".
 * Tarefas sem id real (dados fake) nunca terão comentários reais.
 */
function formatarHoraComentario(dataISO) {
  if (!dataISO) return "";
  const d = new Date(dataISO);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Transforma links soltos (http://..., https://..., www...) dentro do
 * texto de um comentário em links de verdade, clicáveis. Se o texto já
 * vier com um <a> pronto (o Runrun.it às vezes já manda formatado),
 * não mexe em nada pra não linkificar duas vezes.
 */
function linkifyTexto(texto) {
  if (!texto) return "";
  if (/<a\s/i.test(texto)) return texto;
  const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/gi;
  return texto.replace(urlRegex, url => {
    const limpo = url.replace(/[.,;:)\]]+$/, ""); // não pega pontuação colada no final
    const sobra = url.slice(limpo.length);
    const href = limpo.startsWith("http") ? limpo : "https://" + limpo;
    return `<a href="${href}" target="_blank" rel="noopener">${limpo}</a>${sobra}`;
  });
}

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
  return task.comments.map(c => {
    const minha = nomesCorrespondem(c.autor, DESIGNER_LOGADO);
    return `
    <div class="comment-bubble ${minha ? "mine" : ""}" data-comment-id="${c.id}">
      ${minha ? "" : avatarHTML(c.autor, "avatar-sm comment-avatar")}
      <div class="comment-body">
        <div class="comment-meta"><span class="comment-author">${minha ? "Você" : c.autor}</span><span class="comment-time">${formatarHoraComentario(c.data)}</span></div>
        <div class="comment-text">${linkifyTexto(c.texto)}</div>
        ${(c.reactions || []).length ? `
          <div class="comment-reactions">
            ${c.reactions.map(r => `<span class="comment-reaction-chip" title="${(r.users || []).map(u => u.name).join(", ")}">${r.emoji} ${r.count}</span>`).join("")}
          </div>
        ` : ""}
      </div>
      <button type="button" class="comment-react-btn" data-comment-id="${c.id}" title="Reagir" aria-label="Reagir">🙂</button>
      <div class="comment-react-picker" data-comment-id="${c.id}" hidden></div>
      <button type="button" class="comment-delete-btn" data-comment-id="${c.id}" title="Excluir comentário" aria-label="Excluir comentário">
        <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>
  `;
  }).join("");
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
    atualizarBadgeChat(task);
    const chatPanel = document.getElementById("chatPanel");
    const chatAberto = chatPanel && !chatPanel.hidden;
    if (chatAberto && chatThreadAtivo === "aqui") {
      marcarChatVisto(task);
      atualizarBadgeChat(task);
      const thread = document.getElementById("commentsThread");
      if (thread) {
        thread.innerHTML = renderComentariosHTML(task);
        wireExcluirComentario();
      }
    }
  }
}

/**
 * Busca os anexos de verdade da tarefa (antes disso mostrava "Anexo
 * 01, 02, 03, 04" fixos, sem vir do Runrun.it de verdade). Só faz a
 * chamada se a tarefa realmente tiver anexo (attachmentsCount > 0) —
 * economiza uma chamada à toa pra maioria das tarefas, que não tem.
 */
function formatarTamanhoArquivo(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function carregarAnexos(task) {
  if (!task.id || !task.attachmentsCount) return;
  let anexos = [];
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarAnexos", taskId: task.id }),
    });
    const data = await res.json();
    if (data.ok) anexos = data.anexos || [];
  } catch (err) {
    console.error("Falha ao buscar anexos:", err);
  }
  if (tasks[detailIdx] !== task) return; // trocou de tarefa enquanto carregava
  const listaEl = document.getElementById("attachList");
  if (!listaEl) return;
  if (anexos.length === 0) {
    listaEl.innerHTML = `<p class="attach-empty">Nenhum anexo nessa tarefa.</p>`;
    return;
  }
  listaEl.innerHTML = anexos.map(a => `
    <button type="button" class="attach-item" data-doc-id="${a.id}" data-nome="${a.nome}">
      <span>${a.nome}${a.tamanho ? ` <span class="attach-size">${formatarTamanhoArquivo(a.tamanho)}</span>` : ""}</span>
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `).join("");
  listaEl.querySelectorAll(".attach-item").forEach(btn => {
    btn.addEventListener("click", () => baixarAnexo(btn.dataset.docId, btn.dataset.nome, btn));
  });
}

/**
 * Baixa o anexo de verdade: pede o arquivo em base64 pro backend (que
 * busca autenticado no Runrun.it) e monta o download no navegador.
 */
async function baixarAnexo(documentId, nome, btnEl) {
  const original = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = `<span>Baixando...</span>`;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "baixarAnexo", documentId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Falha ao baixar.");

    const binario = atob(data.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const blob = new Blob([bytes], { type: data.mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = nome || "anexo";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Falha ao baixar anexo:", err);
    alert("Não consegui baixar esse anexo agora. Tenta de novo em alguns segundos.");
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = original;
  }
}

const MESES_PT_JS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Confirma com o coordenador antes de criar de verdade a pasta da
 * tarefa no Drive, dentro de Clientes > cliente > Publicações > ano >
 * mês > nome da tarefa.
 */
/**
 * Abre o modal de confirmação de verdade (não é mais o alerta feio do
 * navegador) e devolve true/false conforme o que a pessoa escolher.
 */
function confirmarCriacaoDePasta(mensagemHtml) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirmPastaModalOverlay");
    document.getElementById("confirmPastaModalTexto").innerHTML = mensagemHtml;
    overlay.hidden = false;

    const btnConfirmar = document.getElementById("confirmPastaConfirmar");
    const btnCancelar = document.getElementById("confirmPastaCancelar");
    const btnFechar = document.getElementById("confirmPastaModalClose");

    function fechar(valor) {
      overlay.hidden = true;
      btnConfirmar.removeEventListener("click", onConfirmar);
      btnCancelar.removeEventListener("click", onCancelar);
      btnFechar.removeEventListener("click", onCancelar);
      resolve(valor);
    }
    function onConfirmar() { fechar(true); }
    function onCancelar() { fechar(false); }

    btnConfirmar.addEventListener("click", onConfirmar);
    btnCancelar.addEventListener("click", onCancelar);
    btnFechar.addEventListener("click", onCancelar);
  });
}

/**
 * Anima a troca do texto do botão (o texto antigo sobe e some, o novo
 * entra de baixo) — usado quando a pasta é criada com sucesso.
 */
function trocarTextoBotaoPasta(novoTexto) {
  const label = document.querySelector("#criarPastaDriveBtn .pasta-drive-btn-label");
  if (!label) return;
  label.classList.add("saindo");
  setTimeout(() => {
    label.textContent = novoTexto;
    label.classList.remove("saindo");
    label.classList.add("entrando");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => label.classList.remove("entrando"));
    });
  }, 260);
}

async function confirmarECriarPastaDoCard(task) {
  const btn = document.getElementById("criarPastaDriveBtn");

  // Se ainda está em andamento a checagem automática de "essa pasta já
  // existe?" (corrida entre o clique e essa checagem), espera ela
  // terminar antes de decidir se cria uma pasta nova ou só abre a que
  // já existe — é exatamente essa corrida que fazia o Colmeia às vezes
  // não reconhecer uma pasta já criada.
  if (task._pastaCheckPromise) {
    btn.disabled = true;
    trocarTextoBotaoPasta("Verificando...");
    await task._pastaCheckPromise;
    btn.disabled = false;
  }

  // Se a pasta já foi criada antes (guardado no objeto da tarefa, então
  // sobrevive a qualquer re-render do pop-up — não só no dataset do
  // botão, que é recriado do zero toda vez), o botão vira link de acesso.
  const urlJaSalva = btn.dataset.pastaUrl || task.pastaUrlSalva;
  if (urlJaSalva) {
    trocarTextoBotaoPasta("Acessar pasta do card");
    window.open(urlJaSalva, "_blank");
    return;
  }

  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = MESES_PT_JS[agora.getMonth()];
  const caminho = `${task.client} &gt; Publicações &gt; ${ano} &gt; ${mes} &gt; ${task.title}`;

  const confirmado = await confirmarCriacaoDePasta(`Deseja criar a pasta <strong>"${task.title}"</strong> em<br>${caminho}?`);
  if (!confirmado) return;

  btn.disabled = true;
  trocarTextoBotaoPasta("Criando pasta...");

  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "criarPastaDoCard", cliente: task.client, tituloCard: task.title, taskId: task.id }),
    });
    const data = await res.json();
    btn.disabled = false;

    if (!data.ok) {
      trocarTextoBotaoPasta(data.error ? data.error.slice(0, 40) : "Não consegui criar a pasta");
      return;
    }
    btn.dataset.pastaUrl = data.url;
    task.pastaUrlSalva = data.url; // guarda no objeto da tarefa — reconhece na hora se reabrir de novo
    trocarTextoBotaoPasta("Acessar pasta do card");
  } catch (err) {
    console.error("Falha ao criar pasta do card no Drive:", err);
    btn.disabled = false;
    trocarTextoBotaoPasta("Falha de conexão");
  }
}

/**
 * Ao abrir o pop-up da tarefa, checa (leitura rápida na planilha, sem
 * tocar no Drive) se a pasta do card já foi criada antes — assim o
 * botão já nasce como "Acessar pasta do card" em vez de pedir
 * confirmação de criação de novo toda vez que a tarefa é reaberta.
 *
 * O resultado fica guardado em task.pastaUrlSalva (não só no dataset
 * do botão, que é recriado do zero a cada renderDetail) — assim, se o
 * pop-up re-renderizar por qualquer motivo (dar play, mudar de coluna,
 * etc), o botão já nasce certo na hora, sem esperar o fetch de novo e
 * sem correr o risco de "esquecer" que a pasta já existe.
 */
async function verificarPastaJaSalva(task, btn) {
  if (!task.id) return;

  if (task.pastaUrlSalva !== undefined) {
    if (task.pastaUrlSalva) {
      btn.dataset.pastaUrl = task.pastaUrlSalva;
      const label = btn.querySelector(".pasta-drive-btn-label");
      if (label) label.textContent = "Acessar pasta do card";
    }
    return;
  }

  if (!task._pastaCheckPromise) {
    task._pastaCheckPromise = (async () => {
      try {
        const res = await fetch(COLMEIA_API_URL, {
          method: "POST",
          body: JSON.stringify({ acao: "buscarPastaCard", taskId: task.id }),
        });
        const data = await res.json();
        task.pastaUrlSalva = (data.ok && data.url) ? data.url : null;
      } catch (err) {
        console.error("Falha ao checar se a pasta do card já existe:", err);
        // Não guarda nada em caso de erro — deixa tentar de novo da
        // próxima vez que a tarefa for aberta, em vez de travar como
        // "sem pasta" pra sempre por causa de uma falha de rede.
      } finally {
        task._pastaCheckPromise = null;
      }
    })();
  }

  await task._pastaCheckPromise;
  if (tasks[detailIdx] !== task) return; // trocou de tarefa enquanto carregava
  if (task.pastaUrlSalva) {
    btn.dataset.pastaUrl = task.pastaUrlSalva;
    const label = btn.querySelector(".pasta-drive-btn-label");
    if (label) label.textContent = "Acessar pasta do card";
  }
}

/**
 * Deixa a "Entrega desejada" editável: clicar no lápis troca o texto
 * por um <input type="date"> nativo; ao escolher uma data nova, salva
 * de verdade no Runrun.it e atualiza a tela (card + pop-up) sem
 * precisar recarregar tudo.
 */
function wireEdicaoEntregaDesejada(task) {
  const btn = document.getElementById("dueDateEditBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const row = document.getElementById("dueDateRow");
    if (!row) return;
    // Usa a data ISO (ano-mês-dia) de verdade como valor inicial do
    // input — usar o texto já formatado ("22 jul") aqui quebrava o
    // calendário nativo (ele não reconhece esse formato) e depois
    // salvava o valor cru (ex: "2026-07-27") no lugar do "22 jul"
    // bonito, que era o bug reportado.
    row.innerHTML = `<input type="date" class="side-date-input" id="dueDateInput" value="${task.dueISO || ""}">`;
    const input = document.getElementById("dueDateInput");
    input.focus();
    // Abre o calendário nativo direto (em vez de deixar a pessoa
    // digitar a data na mão) — dá a sensação de um seletor moderno.
    if (typeof input.showPicker === "function") {
      try { input.showPicker(); } catch (e) { /* alguns navegadores recusam fora de um clique direto — sem problema, o campo continua clicável normalmente */ }
    }

    async function salvar() {
      const novaData = input.value; // sempre no formato AAAA-MM-DD
      if (!novaData || novaData === task.dueISO) {
        renderDetail();
        return;
      }
      row.innerHTML = `<span class="side-date-saving">Salvando...</span>`;
      try {
        const res = await fetch(COLMEIA_API_URL, {
          method: "POST",
          body: JSON.stringify({ acao: "alterarEntrega", taskId: task.id, novaData }),
        });
        const data = await res.json();
        if (!data.ok) {
          row.innerHTML = `<span class="side-date-saving">${data.error ? data.error.slice(0, 40) : "Não consegui salvar"}</span>`;
          setTimeout(() => renderDetail(), 1800);
          return;
        }
        // Mantém sempre o mesmo padrão visual de antes (ex: "27 jul"),
        // nunca a data crua (AAAA-MM-DD) — isso é que ficava feio.
        const [ano, mes, dia] = novaData.split("-").map(Number);
        task.dueISO = novaData;
        task.due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
        renderDetail();
        render(); // atualiza a data no card do quadro também
        agendarAtualizacaoKanban();
      } catch (err) {
        console.error("Falha ao trocar a Entrega desejada:", err);
        row.innerHTML = `<span class="side-date-saving">Falha de conexão</span>`;
        setTimeout(() => renderDetail(), 1800);
      }
    }

    input.addEventListener("change", salvar);
    input.addEventListener("blur", () => {
      // Se saiu do campo sem trocar nada, só volta pro texto normal.
      if (document.getElementById("dueDateInput")) renderDetail();
    });
  });
}

function wireExcluirComentario() {
  document.querySelectorAll(".comment-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esse comentário?")) return;
      const bolha = btn.closest(".comment-bubble");
      if (bolha) bolha.style.opacity = "0.4";
      const ok = await excluirComentarioNoBackend(btn.dataset.commentId);
      if (ok) recarregarThreadAtiva();
      else if (bolha) bolha.style.opacity = "1";
    });
  });

  const EMOJIS_REACAO = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  document.querySelectorAll(".comment-react-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const picker = document.querySelector(`.comment-react-picker[data-comment-id="${CSS.escape(btn.dataset.commentId)}"]`);
      document.querySelectorAll(".comment-react-picker").forEach(p => { if (p !== picker) p.hidden = true; });
      if (!picker) return;
      if (picker.innerHTML === "") {
        picker.innerHTML = EMOJIS_REACAO.map(em => `<button type="button" class="emoji-opt">${em}</button>`).join("");
        picker.querySelectorAll(".emoji-opt").forEach(emojiBtn => {
          emojiBtn.addEventListener("click", async () => {
            picker.hidden = true;
            const ok = await reagirComentarioNoBackend(btn.dataset.commentId, emojiBtn.textContent);
            if (ok) recarregarThreadAtiva();
          });
        });
      }
      picker.hidden = !picker.hidden;
    });
  });
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
  childrenOpen = false;
  fecharChatPanel();
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
  carregarAnexos(tasks[detailIdx]);
  renderNotificacoesUpload(tasks[detailIdx]);
  iniciarChecagemUploadEmSegundoPlano(tasks[detailIdx]);
  if (tasks[detailIdx].id) gerarBriefingComIA(tasks[detailIdx]);
  // Se já tinha sido gerado antes (task.briefingHTML cacheado), o
  // template já usa o cache direto — só precisa religar os botões de
  // copiar, já que o innerHTML foi todo recriado do zero.
  else if (tasks[detailIdx].briefingHTML !== undefined) {
    const resultEl = document.getElementById("briefingResult");
    if (resultEl) wireBriefingCopyButtons(resultEl);
  }
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
    // Sem "Sequência de responsáveis" configurada — em vez de só um
    // texto ("Sem sequência"), mostra a foto de quem está com a tarefa
    // agora (o responsável atual), pra sempre dar pra ver quem deve
    // fazer o quê.
    const responsavelAtualHTML = `
      <div class="wf-dot current wf-dot-sem-sequencia" title="${task.assignee}">
        ${avatarHTML(task.assignee, "avatar-xs", task.assigneeAvatarUrl)}
      </div>
    `;
    if (task.entregue) {
      return `
        <div class="workflow-seq-dots">${responsavelAtualHTML}</div>
        <button type="button" class="nav-arrow nav-deliver delivered" id="navDeliverBtn" title="Reabrir tarefa">
          ${reopenIcon}
        </button>
      `;
    }
    if (task.parentTaskId) {
      // Subtarefa sem "Sequência de responsáveis" configurada — o botão
      // de concluir/entregar é obrigatório aqui, senão não tem outro
      // jeito de marcar essa subtarefa como entregue.
      return `
        <div class="workflow-seq-dots">${responsavelAtualHTML}</div>
        <button type="button" class="nav-arrow nav-deliver" id="navDeliverBtn" title="Concluir e entregar essa subtarefa">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      `;
    }
    return `<div class="workflow-seq-dots">${responsavelAtualHTML}</div>`;
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
    ${task.entregue ? `
      <button type="button" class="nav-arrow nav-deliver delivered" id="navDeliverBtn" title="Reabrir tarefa">
        ${reopenIcon}
      </button>
    ` : semNinguemNaFrente ? `
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
      pararCronometroAoTransferir(task);
      const novoResponsavel = await desfazerWorkflowNoBackend(task.id);
      if (novoResponsavel) {
        task.assignee = novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
        agendarAtualizacaoKanban();
      }
      // Sincroniza com o Runrun.it de verdade — se a chamada acima
      // falhou, isso já devolve a sequência real (volta sozinho).
      await carregarSequencia(task);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      nextBtn.disabled = true;
      pararCronometroAoTransferir(task);

      // Animação otimista: já mostra a transferência acontecendo na
      // hora (mesmo sem confirmação do Runrun.it ainda) — se a chamada
      // de baixo falhar, o carregarSequencia final busca o estado real
      // e desfaz a animação sozinho.
      if (task.sequencia && task.sequencia.length) {
        const atualIdx = task.sequencia.findIndex(s => s.atual);
        if (atualIdx !== -1 && atualIdx < task.sequencia.length - 1) {
          task.sequencia[atualIdx].atual = false;
          task.sequencia[atualIdx].concluido = true;
          task.sequencia[atualIdx + 1].atual = true;
          const seqEl = document.getElementById("workflowSeqGroup");
          if (seqEl) {
            seqEl.innerHTML = renderSequenciaHTML(task);
            wireWorkflowArrows(task);
          }
        }
      }

      const novoResponsavel = await avancarWorkflowNoBackend(task.id);
      if (novoResponsavel) {
        task.assignee = novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
        agendarAtualizacaoKanban();
      }
      // Sincroniza com o Runrun.it de verdade (confirma ou desfaz a
      // animação otimista de cima, se o Runrun.it recusou).
      await carregarSequencia(task);
    });
  }
  const addPersonBtn = document.getElementById("navAddPersonBtn");
  if (addPersonBtn) {
    addPersonBtn.addEventListener("click", () => abrirModalRegra(task));
  }
  const deliverBtn = document.getElementById("navDeliverBtn");
  if (deliverBtn) {
    if (task.entregue) {
      deliverBtn.addEventListener("click", async () => {
        deliverBtn.disabled = true;
        const ok = await reabrirTarefaNoBackend(task.id);
        if (ok) {
          task.entregue = false;
          await carregarSequencia(task);
        } else {
          deliverBtn.disabled = false;
          alert("Não consegui reabrir essa tarefa agora. Tenta de novo em alguns segundos.");
        }
      });
    } else {
      deliverBtn.addEventListener("click", async () => {
        deliverBtn.disabled = true;
        pararCronometroAoTransferir(task);

        // Anima na hora (círculo virando verde), mesmo antes do
        // Runrun.it confirmar — se der errado, desfaz sozinho (o
        // carregarSequencia final busca o estado real da tarefa).
        deliverBtn.classList.add("delivered");
        const entregueOtimista = task.entregue;
        task.entregue = true;

        // Primeiro fecha a etapa da última pessoa da sequência (sem
        // transferir pra ninguém, já que não tem próximo) — confirmado
        // que o Runrun.it só deixa entregar depois disso. Se a tarefa
        // não tiver sequência (comum em subtarefas), pula essa parte.
        if (task.sequencia && task.sequencia.length > 0) {
          await avancarWorkflowNoBackend(task.id);
        }
        const ok = await entregarTarefaNoBackend(task.id);
        if (ok) {
          task.entregue = true;
          await esperar(450);
          await carregarSequencia(task);
          agendarAtualizacaoKanban();
        } else {
          // Runrun.it recusou — a conclusão volta sozinha.
          task.entregue = entregueOtimista;
          deliverBtn.classList.remove("delivered");
          deliverBtn.disabled = false;
          await carregarSequencia(task);
        }
      });
    }
  }
}

function renderDetail() {
  const task = tasks[detailIdx];
  const type = typeLabels[task.type];
  const panel = document.getElementById("taskDetail");

  panel.innerHTML = `
    <div class="detail-inner">
      <div class="detail-header">
        <div class="detail-header-pill">
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
          ` : task.parentTaskId ? `
            <button type="button" class="mother-card-btn" id="motherCardBtn" title="Ir para o card mãe">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          ` : ""}
          <span class="detail-taskname">${task.title}</span>
          <span class="header-priority pv-${task.priority}">${priorityLabels[task.priority]}</span>
          <div class="detail-header-pill-right">
            <div class="nav-dots-group" id="workflowSeqGroup">
              ${renderSequenciaHTML(task)}
            </div>
            <div class="status-wrap">
              <button type="button" class="status-badge" id="statusBadge">${task.isMotherCard ? "Card mãe" : (columnsDef.find(c => c.key === task.status)?.label || task.runrunStage || "Sem etapa")}</button>
              <div class="status-menu" id="statusMenu">
                ${columnsDef.map(c => `<button type="button" data-status="${c.key}" class="${c.key === task.status ? "active" : ""}">${c.label}</button>`).join("")}
              </div>
            </div>
          </div>
        </div>
        <div class="detail-header-right">
          <div class="detail-more-wrap">
            <button type="button" class="detail-more" id="detailMore" aria-label="Mais opções">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
            </button>
            <div class="detail-more-menu" id="detailMoreMenu">
              <button type="button" id="verRegraBtn">Ver regra</button>
              <button type="button" id="reabrirTarefaMenuBtn">Reabrir tarefa</button>
              <button type="button" id="ajustarHorasBtn">Ajustar horas</button>
              ${task.id ? `<a href="${task.link}" target="_blank" rel="noopener" id="verNoRunrunBtn">Ver tarefa no Runrun</a>` : ""}
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
            <button type="button" class="detail-tab active" id="tabDesc">Descrição</button>
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
                  ${task.briefingHTML !== undefined ? task.briefingHTML : `<p class="workflow-seq-empty">Carregando briefing...</p>`}
                </div>
                <div class="desc-actions-row">
                  <button type="button" class="ai-briefing-toggle" id="verOriginalBtn">Ver briefing original</button>
                  ${task.id ? `<button type="button" class="ai-briefing-toggle" id="editarDescricaoBtn">Editar descrição</button>` : ""}
                </div>
              ` : ""}
              <div class="desc-text-real" id="descTextReal" ${task.id ? "hidden" : ""}>${task.id ? "Carregando..." : ""}</div>
              <div class="desc-edit-actions" id="descEditActions" hidden>
                <button type="button" class="desc-edit-salvar" id="descEditSalvar">Salvar</button>
                <button type="button" class="desc-edit-cancelar" id="descEditCancelar">Cancelar</button>
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

        <div class="detail-side">
          <div class="side-block">
            <span class="side-label">Entrega desejada</span>
            <div class="side-date-row" id="dueDateRow">
              <span class="side-date" id="dueDateText">${task.due || "Sem data"}</span>
              ${task.id ? `
                <button type="button" class="side-date-edit-btn" id="dueDateEditBtn" title="Alterar data" aria-label="Alterar data">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              ` : ""}
            </div>
          </div>
          ${task.id ? `
            <div class="side-block">
              <button type="button" class="pasta-drive-btn" id="criarPastaDriveBtn">
                <span class="pasta-drive-btn-icon">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span class="pasta-drive-btn-label-wrap">
                  <span class="pasta-drive-btn-label">Criar pasta do card</span>
                </span>
              </button>
            </div>
          ` : ""}
          <div class="side-block">
            <span class="side-label">Tipo de tarefa</span>
            <span class="badge ${type.class}">${type.label}</span>
          </div>
          <div class="side-block">
            <span class="side-label">Cliente</span>
            <span class="badge badge-cliente">${task.client}</span>
          </div>
          <div class="side-block">
            <span class="side-label">Hub do cliente</span>
            <div class="hub-grid">
              ${renderHubDoClienteHTML(task.client)}
            </div>
          </div>
          <div class="side-block">
            <span class="side-label">Atendimento responsável</span>
            <div class="side-person">
              ${avatarAtendimentoHTML(getAtendimentoDoCliente(task.client) || task.assignee, "avatar-sm")}
              <span>${getAtendimentoDoCliente(task.client) || task.assignee}</span>
            </div>
            ${(() => {
              const nomeAtendimento = getAtendimentoDoCliente(task.client) || task.assignee;
              const linkPessoa = getDiscordDaPessoa(nomeAtendimento);
              const linkCliente = getDiscordDoCliente(task.client);
              return `
                <div class="discord-ctas">
                  ${linkPessoa ? `
                    <a href="${linkPessoa}" target="_blank" rel="noopener" class="discord-cta">
                      <span class="discord-cta-icon">${discordIcon}</span>
                      <span>Chamar no Discord</span>
                    </a>
                  ` : `
                    <span class="discord-cta disabled" title="Cadastre o Discord dessa pessoa em Configurações">
                      <span class="discord-cta-icon">${discordIcon}</span>
                      <span>Chamar no Discord</span>
                    </span>
                  `}
                  ${linkCliente ? `
                    <a href="${linkCliente}" target="_blank" rel="noopener" class="discord-cta ghost">
                      <span class="discord-cta-icon">${discordIcon}</span>
                      <span>Canal do cliente</span>
                    </a>
                  ` : `
                    <span class="discord-cta ghost disabled" title="Cadastre o link 'Discord' nos links extras desse cliente">
                      <span class="discord-cta-icon">${discordIcon}</span>
                      <span>Canal do cliente</span>
                    </span>
                  `}
                </div>
              `;
            })()}
          </div>
          <div class="side-block attach-block">
            <div class="side-label-row">
              <span class="side-label">Anexos</span>
              <button type="button" class="download-all-btn" id="downloadAllBtn" onclick="return false" ${task.attachmentsCount ? "" : "hidden"}>Baixar todos</button>
            </div>
            <div class="attach-box">
              <div class="attach-list" id="attachList">
                ${task.id
                  ? (task.attachmentsCount
                      ? `<p class="attach-empty">Carregando anexos...</p>`
                      : `<p class="attach-empty">Nenhum anexo nessa tarefa.</p>`)
                  : `<p class="attach-empty">Nenhum anexo nessa tarefa.</p>`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button type="button" class="chat-fab" id="chatFabBtn" aria-label="Abrir comentários" title="Comentários">
        ${chatIcon}
        <span class="chat-fab-badge" id="chatFabBadge" hidden>0</span>
      </button>
    </div>

    <div class="chat-panel" id="chatPanel" hidden>
      <div class="chat-panel-header">
        <div class="chat-panel-title" id="chatPanelTitle">${task.title}</div>
        <button type="button" class="chat-panel-close" id="chatPanelClose" aria-label="Fechar chat">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="chat-panel-tabs">
        <button type="button" class="chat-panel-tab active" id="chatTabAqui">Comentários aqui</button>
        <button type="button" class="chat-panel-tab" id="chatTabMae" ${task.parentTaskId ? "" : "hidden"}>Comentários card mãe</button>
      </div>
      <div class="upload-notifs" id="uploadNotifs"></div>
      <div class="comments-thread" id="commentsThread">
        ${renderComentariosHTML(task)}
      </div>
      <div class="repetir-comentario-prompt" id="repetirComentarioPrompt" hidden></div>
      <div class="comment-input">
        <div class="comment-mention-list" id="mentionList" hidden></div>
        <button type="button" class="comment-tool-btn" id="emojiBtn" title="Emoji" aria-label="Emoji">😊</button>
        <button type="button" class="comment-tool-btn" id="attachBtn" title="Anexar arquivo" aria-label="Anexar arquivo">
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5l-9 9a4 4 0 01-5.7-5.7l9-9a2.7 2.7 0 013.8 3.8l-8.5 8.5a1.3 1.3 0 01-1.9-1.9L16.2 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <input type="file" id="attachFileInput" hidden>
        <div class="emoji-picker" id="emojiPicker" hidden></div>
        <input type="text" id="commentInput" placeholder="Escreva sua mensagem...">
        <button type="button" class="comment-send-btn" id="commentSendBtn" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 12l16-7-6.5 16-2.5-6.5L4 12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="comment-attach-preview" id="attachPreview" hidden></div>
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
  const criarPastaBtn = document.getElementById("criarPastaDriveBtn");
  if (criarPastaBtn) {
    criarPastaBtn.addEventListener("click", () => confirmarECriarPastaDoCard(task));
    verificarPastaJaSalva(task, criarPastaBtn);
  }

  wireEdicaoEntregaDesejada(task);

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
    opt.addEventListener("click", async e => {
      e.stopPropagation();
      const statusAntigo = task.status;
      task.status = opt.dataset.status;
      statusMenu.classList.remove("open");
      renderDetail();
      render();
      const ok = await moverEtapaNoBackend(task.id, opt.dataset.status);
      if (!ok) {
        task.status = statusAntigo; // Runrun.it recusou — volta pro estado real
        renderDetail();
        render();
      } else {
        agendarAtualizacaoKanban();
      }
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

  const reabrirMenuBtn = document.getElementById("reabrirTarefaMenuBtn");
  if (reabrirMenuBtn) {
    reabrirMenuBtn.addEventListener("click", async () => {
      moreMenu.classList.remove("open");
      if (!task.id) return;
      reabrirMenuBtn.disabled = true;
      const ok = await reabrirTarefaNoBackend(task.id);
      reabrirMenuBtn.disabled = false;
      if (ok) {
        task.entregue = false;
        await carregarSequencia(task);
      } else {
        alert("Não consegui reabrir essa tarefa agora. Tenta de novo em alguns segundos.");
      }
    });
  }

  const ajustarHorasBtn = document.getElementById("ajustarHorasBtn");
  if (ajustarHorasBtn) {
    ajustarHorasBtn.addEventListener("click", async () => {
      moreMenu.classList.remove("open");
      if (!task.id) return;
      const horasAtuais = (task.estimateMinutes / 60).toFixed(1);
      const resposta = prompt("Nova estimativa de horas pra essa tarefa (ex: 2 ou 2.5):", horasAtuais);
      if (resposta === null) return;
      const horas = parseFloat(resposta.replace(",", "."));
      if (!horas || horas <= 0) {
        alert("Digita um número de horas válido (maior que zero).");
        return;
      }
      const ok = await ajustarEstimativaNoBackend(task.id, horas * 60);
      if (ok) {
        task.estimateMinutes = Math.round(horas * 60);
        task.estimatePct = Math.min(95, Math.round(task.estimateMinutes / 2));
        render();
      } else {
        alert("Não consegui ajustar a estimativa agora. Tenta de novo em alguns segundos.");
      }
    });
  }

  const verOriginalBtn = document.getElementById("verOriginalBtn");
  if (verOriginalBtn) {
    verOriginalBtn.addEventListener("click", () => {
      const original = document.getElementById("descTextReal");
      const escondido = original.hidden;
      original.hidden = !escondido;
      verOriginalBtn.textContent = escondido ? "Ocultar briefing original" : "Ver briefing original";
    });
  }

  const editarDescricaoBtn = document.getElementById("editarDescricaoBtn");
  if (editarDescricaoBtn) {
    let htmlAntesDeEditar = "";
    editarDescricaoBtn.addEventListener("click", () => {
      const original = document.getElementById("descTextReal");
      const acoes = document.getElementById("descEditActions");
      original.hidden = false;
      if (verOriginalBtn) verOriginalBtn.textContent = "Ocultar briefing original";
      htmlAntesDeEditar = original.innerHTML;
      original.contentEditable = "true";
      original.classList.add("editando");
      original.focus();
      acoes.hidden = false;
      editarDescricaoBtn.hidden = true;
    });

    document.getElementById("descEditCancelar").addEventListener("click", () => {
      const original = document.getElementById("descTextReal");
      original.innerHTML = htmlAntesDeEditar;
      original.contentEditable = "false";
      original.classList.remove("editando");
      document.getElementById("descEditActions").hidden = true;
      editarDescricaoBtn.hidden = false;
    });

    document.getElementById("descEditSalvar").addEventListener("click", async () => {
      const original = document.getElementById("descTextReal");
      const salvarBtn = document.getElementById("descEditSalvar");
      const novoHtml = original.innerHTML;
      salvarBtn.disabled = true;
      salvarBtn.textContent = "Salvando...";
      const ok = await salvarDescricaoNoBackend(task.id, novoHtml);
      salvarBtn.disabled = false;
      salvarBtn.textContent = "Salvar";
      if (ok) {
        original.contentEditable = "false";
        original.classList.remove("editando");
        document.getElementById("descEditActions").hidden = true;
        editarDescricaoBtn.hidden = false;
      } else {
        alert("Não consegui salvar a descrição agora. Tenta de novo em alguns segundos.");
      }
    });
  }

  // ===== Abas Descrição / Alteração (sem re-renderizar, com transição) =====
  document.getElementById("tabDesc").addEventListener("click", () => {
    changeOpen = false;
    applyCommentsState();
  });
  const tabChange = document.getElementById("tabChange");
  if (tabChange) {
    tabChange.addEventListener("click", () => {
      changeOpen = !changeOpen;
      applyCommentsState();
    });
  }

  const commentInput = document.getElementById("commentInput");
  let arquivoParaAnexar = null;

  async function enviarComentarioAtual() {
    const texto = commentInput.value.trim();
    if (!texto && !arquivoParaAnexar) return;
    if (!chatAlvoTaskId) {
      console.warn("Essa tarefa não está conectada ao Runrun.it, não dá pra comentar de verdade.");
      return;
    }
    const alvoId = chatAlvoTaskId;
    const eraThreadAqui = chatThreadAtivo === "aqui";
    const arquivoAtual = arquivoParaAnexar;
    commentInput.value = "";
    commentInput.disabled = true;
    limparAnexoSelecionado();

    // Mostra a bolha na hora (opaca/pendente), antes mesmo do Runrun.it
    // confirmar — assim que confirma, ela "acende" (muda de cor).
    const thread = document.getElementById("commentsThread");
    const idTemporario = "pendente-" + Date.now();
    if (thread && texto) {
      const vazio = thread.querySelector(".comments-empty");
      if (vazio) vazio.remove();
      thread.insertAdjacentHTML("beforeend", `
        <div class="comment-bubble mine pending" data-comment-id="${idTemporario}">
          <div class="comment-body">
            <div class="comment-meta"><span class="comment-author">Você</span><span class="comment-time">Enviando...</span></div>
            <div class="comment-text">${linkifyTexto(escaparHTML(texto))}</div>
          </div>
        </div>
      `);
      thread.scrollTop = thread.scrollHeight;
    }

    const ok = arquivoAtual
      ? await enviarComentarioComAnexoNoBackend(alvoId, texto, arquivoAtual)
      : await enviarComentarioNoBackend(alvoId, texto);

    commentInput.disabled = false;
    const bolhaTemporaria = document.querySelector(`.comment-bubble[data-comment-id="${idTemporario}"]`);
    if (ok) {
      // Confirma visualmente (some o opaco/pendente) até a lista real
      // (com a bolha de verdade vinda do Runrun.it) substituir tudo.
      if (bolhaTemporaria) bolhaTemporaria.classList.remove("pending");
      recarregarThreadAtiva();
      agendarAtualizacaoKanban();
      if (eraThreadAqui && task.parentTaskId && texto) mostrarPromptRepetirComentario(task, texto);
    } else {
      if (bolhaTemporaria) bolhaTemporaria.remove(); // não foi enviado — some a bolha
    }
  }

  function limparAnexoSelecionado() {
    arquivoParaAnexar = null;
    const preview = document.getElementById("attachPreview");
    if (preview) { preview.hidden = true; preview.innerHTML = ""; }
    const fileInput = document.getElementById("attachFileInput");
    if (fileInput) fileInput.value = "";
  }

  if (commentInput) {
    commentInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !mentionListAberta()) enviarComentarioAtual();
    });
  }

  const sendBtn = document.getElementById("commentSendBtn");
  if (sendBtn) sendBtn.addEventListener("click", enviarComentarioAtual);

  // ===== Anexar arquivo =====
  const attachBtn = document.getElementById("attachBtn");
  const attachFileInput = document.getElementById("attachFileInput");
  if (attachBtn && attachFileInput) {
    attachBtn.addEventListener("click", () => attachFileInput.click());
    attachFileInput.addEventListener("change", () => {
      const arquivo = attachFileInput.files[0];
      if (!arquivo) return;
      arquivoParaAnexar = arquivo;
      const preview = document.getElementById("attachPreview");
      preview.hidden = false;
      preview.innerHTML = `
        <span class="attach-preview-nome">📎 ${arquivo.name}</span>
        <button type="button" id="attachPreviewRemove" aria-label="Remover anexo">×</button>
      `;
      document.getElementById("attachPreviewRemove").addEventListener("click", limparAnexoSelecionado);
    });
  }

  // ===== Emoji =====
  const emojiBtn = document.getElementById("emojiBtn");
  const emojiPicker = document.getElementById("emojiPicker");
  const EMOJIS_COMUNS = ["😀","😂","😍","👍","🙏","🎉","🔥","👀","✅","❌","😅","😢","🚀","💡","⚠️","❤️"];
  if (emojiBtn && emojiPicker) {
    emojiPicker.innerHTML = EMOJIS_COMUNS.map(e => `<button type="button" class="emoji-opt">${e}</button>`).join("");
    emojiBtn.addEventListener("click", e => {
      e.stopPropagation();
      emojiPicker.hidden = !emojiPicker.hidden;
    });
    emojiPicker.querySelectorAll(".emoji-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        commentInput.value += btn.textContent;
        commentInput.focus();
        emojiPicker.hidden = true;
      });
    });
  }

  // ===== Mencionar pessoa (@) =====
  const mentionList = document.getElementById("mentionList");
  function mentionListAberta() {
    return mentionList && !mentionList.hidden;
  }
  function todosNomesParaMencao() {
    const nomes = new Set();
    pessoasSalvas.forEach(p => nomes.add(p.nome));
    if (painelBeeonData) {
      Object.keys(painelBeeonData.state || {}).forEach(d => nomes.add(d));
      (painelBeeonData.state ? Object.values(painelBeeonData.state) : []).forEach(lista =>
        (lista || []).forEach(c => { if (c.atend) nomes.add(c.atend); })
      );
    }
    return Array.from(nomes);
  }
  if (commentInput && mentionList) {
    commentInput.addEventListener("input", () => {
      const valor = commentInput.value;
      const posArroba = valor.lastIndexOf("@");
      if (posArroba === -1 || /\s/.test(valor.slice(posArroba + 1))) {
        mentionList.hidden = true;
        return;
      }
      const busca = normalizarParaComparar(valor.slice(posArroba + 1));
      const opcoes = todosNomesParaMencao().filter(n => !busca || normalizarParaComparar(n).includes(busca)).slice(0, 6);
      if (opcoes.length === 0) { mentionList.hidden = true; return; }
      mentionList.hidden = false;
      mentionList.innerHTML = opcoes.map(n => `<button type="button" class="mention-opt">${n}</button>`).join("");
      mentionList.querySelectorAll(".mention-opt").forEach(btn => {
        btn.addEventListener("click", () => {
          commentInput.value = valor.slice(0, posArroba) + "@" + btn.textContent + " ";
          mentionList.hidden = true;
          commentInput.focus();
        });
      });
    });
  }

  // ===== Chat flutuante (comentários em pop-up separado) =====
  const chatFabBtn = document.getElementById("chatFabBtn");
  if (chatFabBtn) chatFabBtn.addEventListener("click", () => abrirChatPanel(task));

  const chatPanelClose = document.getElementById("chatPanelClose");
  if (chatPanelClose) chatPanelClose.addEventListener("click", fecharChatPanel);

  const chatTabAqui = document.getElementById("chatTabAqui");
  if (chatTabAqui) chatTabAqui.addEventListener("click", () => abrirThreadAqui(task));

  const chatTabMae = document.getElementById("chatTabMae");
  if (chatTabMae) chatTabMae.addEventListener("click", () => abrirThreadDoCardMae(task));

  atualizarBadgeChat(task);

  applyCommentsState();
}

function applyCommentsState() {
  const tabChange = document.getElementById("tabChange");
  const changePanel = document.getElementById("changePanel");
  const childrenPanel = document.getElementById("childrenPanel");
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
      <img src="https://res.cloudinary.com/dzqsqxrkw/image/upload/v1785023382/Icone_if96mt.png" class="detail-loading-bee" alt="Colmeia">
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
  fecharChatPanel();
  renderDetail();
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  const cardEl = document.querySelector(`.task-card[data-idx="${detailIdx}"]`);
  if (cardEl) cardEl.classList.add("selected");
}

function closeDetail() {
  pararChecagemUploadEmSegundoPlano();
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
  const idle = document.getElementById("nowPlayingIdle");
  if (!el) return;
  // Só considera tarefas rodando do PRÓPRIO designer logado — o array
  // `tasks` pode ter tarefas de outras pessoas (visão do coordenador),
  // e a barra "tocando agora" é sempre sobre o que EU estou fazendo.
  const running = tasks.find(t => t.running && nomesCorrespondem(t.assignee, DESIGNER_LOGADO));
  if (running) {
    el.hidden = false;
    if (idle) idle.hidden = true;
    document.getElementById("nowPlayingTitle").textContent = running.title;
    document.getElementById("nowPlayingTime").textContent = formatTime(running.timerSeconds);
  } else {
    el.hidden = true;
    if (idle) idle.hidden = false;
  }
}

// avança a barra de progresso e o cronômetro das tarefas em execução
setInterval(() => {
  tasks.forEach((task, idx) => {
    if (task.running) {
      task.timerSeconds++;
      const timerEl = document.querySelector(`.timer-text[data-idx="${idx}"]`);
      if (timerEl) timerEl.textContent = formatTime(task.timerSeconds);
      if (tasks[detailIdx] === task) {
        const detailTimerEl = document.getElementById("detailTimer");
        if (detailTimerEl) detailTimerEl.textContent = formatTime(task.timerSeconds);
      }
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

// Guarda quais grupos de serviço estão expandidos.
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

function mostrarPagina(page) {
  document.querySelectorAll(".nav-ic[data-page]").forEach(l => l.classList.toggle("active", l.dataset.page === page));
  document.querySelectorAll(".app-page").forEach(p => p.hidden = true);
  document.getElementById("page-" + page).hidden = false;
  const [title] = pageTitles[page];
  const heading = document.getElementById("pageHeadingTitle");
  if (heading) heading.textContent = title;

  const seletor = document.getElementById("designerFilterSelect");
  if (seletor) {
    if ((page === "kanban" || page === "clientes") && PAPEL_LOGADO === "coordenador") {
      if (!seletor.dataset.montado) {
        seletor.innerHTML = `
          <option value="todos">Todos juntos</option>
          <option value="eu">Só o meu (${DESIGNER_LOGADO})</option>
          ${DESIGNERS_EQUIPE.filter(n => !nomesCorrespondem(n, DESIGNER_LOGADO)).map(n => `<option value="${n}">${n}</option>`).join("")}
        `;
        seletor.value = filtroDesignerCoordenador;
        seletor.dataset.montado = "1";
      }
      seletor.hidden = false;
    } else {
      seletor.hidden = true;
    }
  }

  if (page === "clientes") buildClientsPage();
  if (page === "atendimento") buildAtendimentoPage();
  if (page === "tipos") buildTiposPage();
}

document.getElementById("designerFilterSelect").addEventListener("change", e => {
  filtroDesignerCoordenador = e.target.value;
  render();
  if (!document.getElementById("page-clientes").hidden) buildClientsPage();
});

document.querySelectorAll(".nav-ic[data-page]").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    mostrarPagina(link.dataset.page);
  });
});

// Busca por tarefa ou cliente
document.getElementById("searchInput").addEventListener("input", e => {
  searchQuery = e.target.value;
  render();
});

document.getElementById("verTodasBtn").addEventListener("click", () => {
  searchQuery = "";
  document.getElementById("searchInput").value = "";
  render();
});

document.getElementById("nowPlaying").addEventListener("click", () => {
  const idx = tasks.findIndex(t => t.running);
  if (idx !== -1) openDetail(idx);
});

// ===== Notificações reais (comentários não lidos nas tarefas do designer logado) =====
let notificacoes = []; // [{task, qtdNaoLidas, ultimoAutor, ultimoTexto}]

/**
 * Varre as tarefas em aberto do designer logado, busca os comentários
 * de cada uma e reaproveita o mesmo controle de "visto" do chat
 * flutuante (chaveVistoChat) pra saber quais têm comentário novo.
 */
async function verificarNotificacoes() {
  if (!DESIGNER_LOGADO) return;
  const minhasTarefas = tasks.filter(t => t.id && nomesCorrespondem(t.assignee, DESIGNER_LOGADO));

  const resultados = await Promise.all(minhasTarefas.map(async t => {
    const comentarios = await buscarComentariosDoBackend(t.id);
    t.comments = comentarios; // aproveita e já deixa cacheado pro chat também
    let visto = 0;
    try { visto = Number(localStorage.getItem(chaveVistoChat(t.id))) || 0; } catch (err) { /* sem problema */ }
    const naoLidos = comentarios.filter(c => !nomesCorrespondem(c.autor, DESIGNER_LOGADO) && (c.id || 0) > visto);
    if (naoLidos.length === 0) return null;
    const ultimo = naoLidos[naoLidos.length - 1];
    return { task: t, qtd: naoLidos.length, autor: ultimo.autor, texto: ultimo.texto };
  }));

  notificacoes = resultados.filter(Boolean);
  atualizarBadgeNotificacoes();
}

function atualizarBadgeNotificacoes() {
  const badge = document.getElementById("notificationsBadge");
  if (!badge) return;
  const total = notificacoes.reduce((s, n) => s + n.qtd, 0);
  badge.hidden = total === 0;
  badge.textContent = total > 9 ? "9+" : String(total);
}

function renderNotificacoes() {
  const body = document.getElementById("notificationsBody");
  if (!body) return;
  if (notificacoes.length === 0) {
    body.innerHTML = `<p class="quick-access-empty">Nenhum comentário novo nas suas tarefas.</p>`;
    return;
  }
  body.innerHTML = notificacoes.map((n, i) => `
    <div class="notif-item" data-i="${i}">
      <div class="notif-item-top">
        <span class="notif-item-titulo">${n.task.title}</span>
        <span class="notif-item-count">${n.qtd}</span>
      </div>
      <div class="notif-item-preview"><span class="notif-item-autor">${n.autor}:</span> ${n.texto}</div>
    </div>
  `).join("");
  body.querySelectorAll(".notif-item").forEach(el => {
    el.addEventListener("click", async () => {
      const n = notificacoes[Number(el.dataset.i)];
      document.getElementById("notificationsPanel").classList.remove("open");
      const idxExistente = tasks.indexOf(n.task);
      if (idxExistente !== -1) {
        mostrarPagina("kanban");
        openDetail(idxExistente);
      }
      await esperar(150);
      abrirChatPanel(tasks[detailIdx]);
    });
  });
}

// Notificações reais: comentários novos nas tarefas do designer logado.
document.getElementById("notificationsBtn").addEventListener("click", async () => {
  const panel = document.getElementById("notificationsPanel");
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) {
    document.getElementById("notificationsBody").innerHTML = `<p class="quick-access-empty">Carregando...</p>`;
    await verificarNotificacoes();
    renderNotificacoes();
    // Abrir o sino já marca tudo como visto — o contador zera na hora
    // (a lista continua na tela pra você poder clicar nela normalmente).
    notificacoes.forEach(n => marcarChatVisto(n.task));
    const badge = document.getElementById("notificationsBadge");
    if (badge) badge.hidden = true;
  }
});
document.getElementById("notificationsClose").addEventListener("click", () => {
  document.getElementById("notificationsPanel").classList.remove("open");
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
  ruleModalOverlay.hidden = true;
});
ruleModalOverlay.addEventListener("click", e => {
  if (e.target === ruleModalOverlay) ruleModalOverlay.hidden = true;
});

// Modal "Pessoas conhecidas" (aberto clicando no perfil na barra lateral)
const peopleModalOverlay = document.getElementById("peopleModalOverlay");
document.getElementById("sidebarProfileLink").addEventListener("click", e => {
  e.preventDefault();
  if (PAPEL_LOGADO !== "coordenador") return; // só o coordenador mexe nessas configurações
  abrirPainelPessoas();
});
document.getElementById("peopleModalClose").addEventListener("click", () => {
  peopleModalOverlay.hidden = true;
});
peopleModalOverlay.addEventListener("click", e => {
  if (e.target === peopleModalOverlay) peopleModalOverlay.hidden = true;
});
document.getElementById("configTabPessoas").addEventListener("click", () => {
  configTabAtiva = "pessoas";
  atualizarAbasConfig();
});
document.getElementById("configTabClientes").addEventListener("click", () => {
  configTabAtiva = "clientes";
  atualizarAbasConfig();
});

/**
 * Roda tudo que o Colmeia precisa pra funcionar de verdade — só chamada
 * depois que o login (ou uma sessão salva) confirma quem está usando.
 */
function iniciarAppPosLogin() {
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("page").hidden = false;

  document.getElementById("sidebarNomeUsuario").textContent = DESIGNER_LOGADO;
  document.getElementById("sidebarAvatarIniciais").textContent = initials(DESIGNER_LOGADO);
  document.getElementById("sidebarProfileLink").title = PAPEL_LOGADO === "coordenador" ? "Configurações" : DESIGNER_LOGADO;

  buildBoard();
  render();
  mostrarPagina("kanban");
  carregarTarefasReais();
  carregarDadosPainelBeeon();
  carregarPessoasSalvas();
  carregarLinksClientes();
  carregarProgressoClientes();
  carregarClientesOcultos();
}

// ===== Login e sessão =====
// Guarda {nome, papel} no navegador depois de logar, pra não pedir
// senha de novo toda vez que abrir o Colmeia nesse computador.
const SESSAO_CHAVE = "colmeia_sessao";

function lerSessaoSalva() {
  try {
    const bruto = localStorage.getItem(SESSAO_CHAVE);
    return bruto ? JSON.parse(bruto) : null;
  } catch (err) {
    return null;
  }
}

function salvarSessao(nome, papel) {
  try {
    localStorage.setItem(SESSAO_CHAVE, JSON.stringify({ nome, papel }));
  } catch (err) {
    console.error("Não consegui salvar a sessão:", err);
  }
}

function sairDoColmeia() {
  try { localStorage.removeItem(SESSAO_CHAVE); } catch (err) { /* sem problema */ }
  location.reload();
}

document.getElementById("sidebarLogout").addEventListener("click", sairDoColmeia);

/**
 * Busca uma frase engraçada gerada pela IA baseada no dia/período de
 * agora, pra mostrar na tela de login. Já deixa uma frase padrão
 * escrita enquanto espera (a tela de login não pode ficar vazia).
 */
async function buscarFraseDoDia() {
  if (!COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "gerarFraseDoDia" }),
    });
    const data = await res.json();
    if (data.ok && data.frase) {
      const el = document.getElementById("loginFrase");
      if (el) el.textContent = data.frase;
    }
  } catch (err) {
    console.error("Falha ao buscar a frase do dia:", err);
  }
}

document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const senha = document.getElementById("loginSenha").value;
  const btn = document.getElementById("loginSubmit");
  const erroEl = document.getElementById("loginErro");
  erroEl.hidden = true;

  if (!senha) return;
  btn.disabled = true;

  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "login", senha }),
    });
    const data = await res.json();
    btn.disabled = false;

    if (!data.ok) {
      erroEl.textContent = data.error || "Não consegui entrar.";
      erroEl.hidden = false;
      return;
    }

    DESIGNER_LOGADO = data.nome;
    PAPEL_LOGADO = data.papel;
    salvarSessao(data.nome, data.papel);
    iniciarAppPosLogin();
  } catch (err) {
    console.error("Falha ao tentar logar:", err);
    btn.disabled = false;
    erroEl.textContent = "Falha de conexão. Tente de novo.";
    erroEl.hidden = false;
  }
});

// Se já tiver uma sessão salva nesse navegador, entra direto sem pedir
// senha de novo.
const sessaoSalva = lerSessaoSalva();
if (sessaoSalva && sessaoSalva.nome && sessaoSalva.papel) {
  DESIGNER_LOGADO = sessaoSalva.nome;
  PAPEL_LOGADO = sessaoSalva.papel;
  iniciarAppPosLogin();
} else {
  buscarFraseDoDia();
}
// Senão, a tela de login (já visível por padrão no HTML) fica esperando
// o formulário ser enviado — o resto acontece no listener do submit acima.
