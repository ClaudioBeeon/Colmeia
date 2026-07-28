// Notificações reais: comentários novos nas tarefas do designer logado,
// guardadas aqui (nesse navegador) por até NOTIF_RETENCAO_MS, mesmo
// depois de abertas/lidas — antes, assim que o sino era aberto, a
// notificação já desaparecia da lista pra sempre. Cada item:
// {taskId, taskTitle, autor, texto, comentarioId, criadoEm, vista}
let notificacoes = [];
const NOTIF_LOG_KEY = "colmeia_notificacoes_log_v2";
const NOTIF_RETENCAO_MS = 2 * 24 * 60 * 60 * 1000; // 2 dias

function carregarNotificacoesLog() {
  let bruto = [];
  try { bruto = JSON.parse(localStorage.getItem(NOTIF_LOG_KEY) || "[]"); } catch (err) { bruto = []; }
  const agora = Date.now();
  return bruto.filter(n => n && n.criadoEm && (agora - n.criadoEm) < NOTIF_RETENCAO_MS);
}
function salvarNotificacoesLog(lista) {
  try { localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(lista)); } catch (err) { /* sem problema */ }
}

/**
 * Varre as tarefas em aberto do designer logado, busca os comentários
 * de cada uma e registra no log (localStorage) qualquer comentário de
 * outra pessoa que ainda não estava lá — dedupe por comentário (não
 * por "lido"), então o item continua na lista mesmo depois de visto,
 * até completar os 2 dias de retenção.
 */
async function verificarNotificacoes() {
  if (!DESIGNER_LOGADO) return;
  const minhasTarefas = tasks.filter(t => t.id && nomesCorrespondem(t.assignee, DESIGNER_LOGADO));
  let log = carregarNotificacoesLog();
  const chavesExistentes = new Set(log.map(n => n.taskId + "::" + n.comentarioId));

  await Promise.all(minhasTarefas.map(async t => {
    const comentarios = await buscarComentariosDoBackend(t.id);
    t.comments = comentarios; // aproveita e já deixa cacheado pro chat também
    comentarios
      .filter(c => !nomesCorrespondem(c.autor, DESIGNER_LOGADO))
      .forEach(c => {
        const chave = t.id + "::" + (c.id || 0);
        if (chavesExistentes.has(chave)) return;
        chavesExistentes.add(chave);
        log.push({
          taskId: t.id,
          taskTitle: t.title,
          autor: c.autor,
          texto: c.texto,
          comentarioId: c.id || 0,
          criadoEm: c.data ? new Date(c.data).getTime() : Date.now(),
          vista: false,
        });
      });
  }));

  log = log.filter(n => (Date.now() - n.criadoEm) < NOTIF_RETENCAO_MS);
  log.sort((a, b) => b.criadoEm - a.criadoEm);
  salvarNotificacoesLog(log);
  notificacoes = log;
  atualizarBadgeNotificacoes();
}

function atualizarBadgeNotificacoes() {
  const badge = document.getElementById("notificationsBadge");
  if (!badge) return;
  const total = notificacoes.filter(n => !n.vista).length;
  badge.hidden = total === 0;
  badge.textContent = total > 9 ? "9+" : String(total);
}

// Tempo relativo mais fino que tempoRelativoAviso (minutos importam
// bastante pra notificação de comentário — "agora há pouco" o dia
// inteiro não ajuda a saber se é recém-chegada ou de ontem).
function tempoRelativoNotificacao(criadoEm) {
  const ms = Date.now() - Number(criadoEm);
  const minutos = Math.floor(ms / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

function renderNotificacoes() {
  const body = document.getElementById("notificationsBody");
  if (!body) return;
  if (notificacoes.length === 0) {
    body.innerHTML = `<p class="quick-access-empty">Nenhum comentário novo nas suas tarefas.</p>`;
    return;
  }
  body.innerHTML = notificacoes.map((n, i) => `
    <div class="notif-card ${n.vista ? "" : "unread"}" data-i="${i}">
      ${avatarHTML(n.autor, "avatar-sm notif-card-avatar")}
      <div class="notif-card-body">
        <div class="notif-card-top">
          <span class="notif-card-autor">${escaparHTML(n.autor)}</span>
          <span class="notif-card-tempo">${tempoRelativoNotificacao(n.criadoEm)}</span>
        </div>
        <p class="notif-card-texto">${linkifyTexto(escaparHTML(n.texto))}</p>
        <span class="notif-card-tarefa">${escaparHTML(n.taskTitle)}</span>
      </div>
      ${n.vista ? "" : `<span class="notif-card-dot" title="Novo"></span>`}
    </div>
  `).join("");
  body.querySelectorAll(".notif-card").forEach(el => {
    el.addEventListener("click", async () => {
      const n = notificacoes[Number(el.dataset.i)];
      document.getElementById("notificationsPanel").classList.remove("open");
      // Por id, não por referência — se o quadro atualizou sozinho
      // enquanto o painel de notificações estava aberto, a tarefa daquele
      // momento pode não ser mais o mesmo objeto em tasks[].
      const idxExistente = tasks.findIndex(t => String(t.id) === String(n.taskId));
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
    // Abrir o sino zera o contador, mas os cards continuam na lista —
    // só somem sozinhos depois de NOTIF_RETENCAO_MS (2 dias).
    notificacoes.forEach(n => {
      n.vista = true;
      // Mantém o pontinho de "não lido" do chat de cada tarefa em sincronia
      // com o sino (só funciona se essa tarefa já tinha comentários
      // carregados nessa sessão — senão não faz diferença).
      const t = tasks.find(x => String(x.id) === String(n.taskId));
      if (t) marcarChatVisto(t);
    });
    salvarNotificacoesLog(notificacoes);
    const badge = document.getElementById("notificationsBadge");
    if (badge) badge.hidden = true;
  }
});
document.getElementById("notificationsClose").addEventListener("click", () => {
  document.getElementById("notificationsPanel").classList.remove("open");
});

// ===== Painel de Avisos (coordenador lança, todo mundo vê) =====
const AVISOS_VISTOS_KEY = "colmeia_avisos_vistos_ids";
function idsAvisosVistos() {
  try { return new Set(JSON.parse(localStorage.getItem(AVISOS_VISTOS_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function marcarAvisosVistos(lista) {
  try {
    const vistos = idsAvisosVistos();
    lista.forEach(a => vistos.add(a.id));
    localStorage.setItem(AVISOS_VISTOS_KEY, JSON.stringify(Array.from(vistos)));
  } catch (e) { /* sem problema */ }
}

let avisosCache = [];

async function buscarAvisosDoBackend() {
  if (!COLMEIA_API_URL) return [];
  try {
    const res = await fetch(COLMEIA_API_URL, { method: "POST", body: JSON.stringify({ acao: "listarAvisos" }) });
    const data = await res.json();
    return data.ok ? data.avisos : [];
  } catch (err) {
    console.error("Falha ao buscar avisos:", err);
    return [];
  }
}

function tempoRelativoAviso(criadoEm) {
  const ms = Date.now() - Number(criadoEm);
  const horas = Math.floor(ms / 3600000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

function renderAvisos() {
  const body = document.getElementById("avisosBody");
  if (!body) return;
  if (avisosCache.length === 0) {
    body.innerHTML = `<p class="quick-access-empty">Nenhum aviso por enquanto.</p>`;
    return;
  }
  body.innerHTML = avisosCache.map(a => `
    <div class="aviso-item" data-id="${a.id}">
      <div class="aviso-item-top">
        <span class="aviso-item-autor">${a.autor}</span>
        <span class="aviso-item-tempo">${tempoRelativoAviso(a.criadoEm)}</span>
      </div>
      <p class="aviso-item-texto">${escaparHTML(a.texto)}</p>
      ${souClaudio() ? `<button type="button" class="aviso-item-excluir" data-id="${a.id}" aria-label="Excluir aviso">×</button>` : ""}
    </div>
  `).join("");

  body.querySelectorAll(".aviso-item-excluir").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      const res = await fetch(COLMEIA_API_URL, { method: "POST", body: JSON.stringify({ acao: "excluirAviso", id }) });
      const data = await res.json();
      if (data.ok) {
        avisosCache = avisosCache.filter(a => a.id !== id);
        renderAvisos();
      } else {
        btn.disabled = false;
        alert(data.error || "Não consegui excluir esse aviso agora.");
      }
    });
  });
}

const avisosPanel = document.getElementById("avisosPanel");
document.getElementById("avisosBtn").addEventListener("click", async () => {
  avisosPanel.classList.toggle("open");
  if (!avisosPanel.classList.contains("open")) return;

  const novoWrap = document.getElementById("avisosNovoWrap");
  if (novoWrap) novoWrap.hidden = !souClaudio(); // só o Cláudio lança aviso novo — os outros só veem

  document.getElementById("avisosBody").innerHTML = `<p class="quick-access-empty">Carregando...</p>`;
  avisosCache = await buscarAvisosDoBackend();
  renderAvisos();
  // Abrir o painel já marca tudo como visto — o contador zera na hora.
  marcarAvisosVistos(avisosCache);
  const badge = document.getElementById("avisosBadge");
  if (badge) badge.hidden = true;
});
document.getElementById("avisosClose").addEventListener("click", () => {
  avisosPanel.classList.remove("open");
});
document.getElementById("avisosNovoBtn").addEventListener("click", async () => {
  const textarea = document.getElementById("avisosNovoTexto");
  const texto = textarea.value.trim();
  if (!texto) return;
  const btn = document.getElementById("avisosNovoBtn");
  btn.disabled = true;
  btn.textContent = "Lançando...";
  const res = await fetch(COLMEIA_API_URL, {
    method: "POST",
    body: JSON.stringify({ acao: "criarAviso", autor: DESIGNER_LOGADO, texto }),
  });
  const data = await res.json();
  btn.disabled = false;
  btn.textContent = "Lançar aviso";
  if (data.ok) {
    textarea.value = "";
    avisosCache = await buscarAvisosDoBackend();
    renderAvisos();
    marcarAvisosVistos(avisosCache);
  } else {
    alert(data.error || "Não consegui lançar o aviso agora.");
  }
});

// Checa avisos novos sozinho de vez em quando (mesmo sem o painel
// aberto), pra acender o sino quando chegar aviso novo.
async function atualizarBadgeAvisos() {
  const badge = document.getElementById("avisosBadge");
  if (!badge || !COLMEIA_API_URL) return;
  avisosCache = await buscarAvisosDoBackend();
  const vistos = idsAvisosVistos();
  const novos = avisosCache.filter(a => !vistos.has(a.id)).length;
  if (novos > 0) { badge.textContent = novos > 99 ? "99+" : String(novos); badge.hidden = false; }
  else badge.hidden = true;
}
atualizarBadgeAvisos();
setInterval(atualizarBadgeAvisos, 5 * 60 * 1000); // a cada 5 minutos

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
