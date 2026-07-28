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
