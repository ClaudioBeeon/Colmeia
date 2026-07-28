const REPASSE_IGNORADOS_KEY = "colmeia_repasse_ignorados_ids";
function idsRepasseIgnorados() {
  try { return new Set(JSON.parse(localStorage.getItem(REPASSE_IGNORADOS_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
// Usado quando você clica "Ficar comigo" — a tarefa continua com você
// (assignee não muda), então sem isso ela voltaria a aparecer na fila
// pra sempre mesmo depois de você decidir assumir ela de propósito.
function ignorarNaRepasse(taskId) {
  try {
    const ignorados = idsRepasseIgnorados();
    ignorados.add(taskId);
    localStorage.setItem(REPASSE_IGNORADOS_KEY, JSON.stringify(Array.from(ignorados)));
  } catch (e) { /* sem problema */ }
}

function tarefaEstaComAtendimento(t) {
  if (!t.id || !t.assignee) return false;
  if (ehTarefaDeCoordenacao(t)) return false; // a sua tarefa fixa de coordenação não é "repasse"
  if (idsRepasseIgnorados().has(t.id)) return false; // você já decidiu ficar com essa
  return nomesCorrespondem(t.assignee, DESIGNER_LOGADO);
}

function tarefasParaRepasse() {
  return tasksTodas.filter(t => !t.isMotherCard && (tarefaEstaComAtendimento(t) || repasseRecemAvancados.has(t.id)));
}

// "Há quanto tempo está parada" — usa a última atividade da tarefa no
// Runrun.it como aproximação (não existe um campo de "desde quando é
// dessa pessoa" de verdade disponível na API).
function formatarTempoParado(isoString) {
  if (!isoString) return null;
  const ms = Date.now() - new Date(isoString).getTime();
  if (!(ms >= 0)) return null;
  const horas = Math.floor(ms / 3600000);
  if (horas < 1) return "atualizada há poucos minutos";
  if (horas < 24) return `atualizada há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `atualizada há ${dias} dia${dias > 1 ? "s" : ""}`;
}

// Classificação "com/sem sequência" — buscada sob demanda (custa uma
// chamada ao Runrun.it por tarefa) e cacheada direto no objeto da
// tarefa (em t.sequencia/t.workflowId, os mesmos campos usados no
// pop-up de detalhe), pra não perguntar de novo toda vez que a aba
// reabrir nem duplicar a busca que o card de repasse também precisa
// pra desenhar a fileira de fotinhos.
async function garantirClassificacaoSequencia(t) {
  if (t._temSequencia !== undefined) return t._temSequencia;
  if (!t.id) { t._temSequencia = false; t.sequencia = []; t.workflowId = null; return false; }
  const resultado = await buscarSequenciaDoBackend(t.id);
  t.sequencia = resultado.sequencia;
  t.workflowId = resultado.workflowId;
  t._temSequencia = !!(resultado.sequencia && resultado.sequencia.length > 0);
  return t._temSequencia;
}

// Busca de novo (sem usar o cache) — chamada depois de repassar/entregar/
// adicionar alguém na regra, pra pegar o estado real e redesenhar só
// aquele card.
async function recarregarSequenciaCard(t) {
  const resultado = await buscarSequenciaDoBackend(t.id);
  t.sequencia = resultado.sequencia;
  t.workflowId = resultado.workflowId;
  t._temSequencia = !!(resultado.sequencia && resultado.sequencia.length > 0);
  montarSequenciaCard(t);
}

// Contador do ícone da barra lateral: só mostra o que é NOVO desde a
// última vez que a pessoa abriu a aba (evita virar um número gigante e
// inútil toda vez que reabre o Colmeia).
const REPASSE_VISTOS_KEY = "colmeia_repasse_vistos_ids";
function idsRepasseVistos() {
  try { return new Set(JSON.parse(localStorage.getItem(REPASSE_VISTOS_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function marcarRepasseComoVisto(lista) {
  try {
    const vistos = idsRepasseVistos();
    lista.forEach(t => vistos.add(t.id));
    localStorage.setItem(REPASSE_VISTOS_KEY, JSON.stringify(Array.from(vistos)));
  } catch (e) { /* sem problema */ }
}
function atualizarBadgeRepasse() {
  const badge = document.getElementById("repasseBadge");
  if (!badge || !souClaudio()) return;
  const lista = tarefasParaRepasse();
  const vistos = idsRepasseVistos();
  const novos = lista.filter(t => !vistos.has(t.id)).length;
  if (novos > 0) {
    badge.textContent = novos > 99 ? "99+" : String(novos);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

let repasseViewMode = "cliente"; // "cliente" | "com_sequencia" | "sem_sequencia"
let repasseSearch = "";
let repasseMontada = false;

// Tarefas que você acabou de repassar (avançar a sequência) nessa
// visita à aba — ficam aparecendo mesmo depois de deixarem de ser
// "suas" de verdade, pra você não perder de vista o card no meio da
// lista só porque a atualização em segundo plano rodou. Só é limpo de
// novo quando a aba é reaberta (reentrar na página) ou a página é
// recarregada — "Ficar comigo" continua sumindo na hora, esse é o
// único jeito de tirar um card na hora.
let repasseRecemAvancados = new Set();

function buildRepassePage() {
  if (!souClaudio()) { mostrarPagina("kanban"); return; } // essa página é só do Cláudio
  repasseRecemAvancados = new Set();
  if (!repasseMontada) {
    document.querySelectorAll(".repasse-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".repasse-tab").forEach(b => b.classList.remove("active"));
        tab.classList.add("active");
        repasseViewMode = tab.dataset.mode;
        renderRepasse();
      });
    });
    const searchInput = document.getElementById("repasseSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        repasseSearch = e.target.value;
        renderRepasse();
      });
    }
    repasseMontada = true;
  }
  renderRepasse();
  // Assim que a pessoa abre a aba, o que já estava ali vira "visto" —
  // o contador só volta a subir quando chegar tarefa nova de verdade.
  marcarRepasseComoVisto(tarefasParaRepasse());
  atualizarBadgeRepasse();
}

// Formato curto (dd/mm, sem ano) usado no "pill" de datas do card de
// repasse — mais compacto que o "10 ago" usado no resto do Colmeia.
function formatarDataCurtaSemAno(iso) {
  if (!iso) return null;
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

// mostrarClientePill: liga a tagzinha com o nome do cliente no topo do
// card — só faz sentido na aba "Prioridades" (lista corrida, não tem
// coluna por cliente igual as outras abas pra já deixar isso óbvio).
function repasseCardHTML(t, mostrarClientePill) {
  const type = typeLabels[t.type] || { label: t.type, class: "" };
  const tempoParado = formatarTempoParado(t.lastActivityAt);
  const atrasada = t.dueISO && t.dueISO < hojeISO();
  return `
    <div class="repasse-card" data-id="${t.id}">
      <div class="repasse-card-top">
        <span class="badge ${type.class}">${type.label}</span>
        ${mostrarClientePill ? `<span class="repasse-client-pill">${t.client}</span>` : ""}
      </div>
      <div class="repasse-card-title">${t.title}</div>
      <div class="repasse-datas-stack">
        <div class="repasse-data-pill" data-campo="publicacao" data-id="${t.id}">
          <span class="repasse-data-label">Publicação</span>
          <button type="button" class="repasse-data-valor">${formatarDataCurtaSemAno(t.dataPublicacao) || "—"}</button>
        </div>
        <div class="repasse-data-pill ${atrasada ? "overdue" : ""}" data-campo="entrega" data-id="${t.id}">
          <span class="repasse-data-label">Entrega</span>
          <button type="button" class="repasse-data-valor">${formatarDataCurtaSemAno(t.dueISO) || "—"}</button>
        </div>
      </div>
      <div class="repasse-seq-row" data-id="${t.id}">
        <span class="repasse-seq-loading">Carregando sequência...</span>
      </div>
      ${tempoParado ? `<div class="repasse-card-tempo">${tempoParado}</div>` : ""}
      <div class="repasse-card-actions">
        <button type="button" class="repasse-btn repasse-btn-ficar" data-id="${t.id}">Ficar comigo</button>
      </div>
    </div>
  `;
}

/**
 * Desenha, dentro do card de repasse, a mesma fileira de fotinhos que
 * já existe no pop-up de detalhe da tarefa — assim dá pra ver se já
 * tem uma "Sequência de responsáveis" configurada sem precisar clicar
 * em nada. Três estados possíveis:
 *  - já foi entregue por aqui mesmo (t._repasseEntregue): só um aviso.
 *  - sem sequência nenhuma: só a sua foto sozinha + criar regra/entregar.
 *  - com sequência: os pontinhos de sempre + avançar (se tiver alguém
 *    na frente) ou adicionar próxima pessoa/entregar (se você for o
 *    último da fila).
 */
function renderRepasseSeqHTML(t) {
  if (t._repasseEntregue) {
    return `<div class="repasse-seq-row-done">Entregue ✓</div>`;
  }
  const seq = t.sequencia || [];
  if (seq.length === 0) {
    return `
      <div class="repasse-seq-dots">
        <div class="wf-dot current" title="${t.assignee}">${avatarHTML(t.assignee, "avatar-xs", t.assigneeAvatarUrl)}</div>
        <span class="repasse-seq-empty-label">sem regra ainda</span>
      </div>
      <button type="button" class="repasse-seq-btn add" data-action="add" title="Criar sequência de responsáveis">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="repasse-seq-btn deliver" data-action="deliver-direto" title="Entregar tarefa">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
  }
  const atualIdx = seq.findIndex(s => s.atual);
  const semProximo = atualIdx !== -1 && seq[atualIdx].ultimo;
  return `
    <div class="repasse-seq-dots">
      ${seq.map((s, i) => `
        ${i > 0 ? `<div class="wf-line ${seq[i - 1].concluido ? "done" : ""}"></div>` : ""}
        <div class="wf-dot ${s.atual ? "current" : ""} ${s.concluido ? "completed" : ""}" title="${s.nome}">
          ${avatarHTML(s.nome, "avatar-xs", s.foto)}
          ${s.concluido ? `<span class="wf-check">✓</span>` : ""}
        </div>
      `).join("")}
    </div>
    ${semProximo ? `
      <button type="button" class="repasse-seq-btn add" data-action="add" title="Adicionar próxima pessoa na sequência">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="repasse-seq-btn deliver" data-action="deliver-sequencia" title="Entregar tarefa (não tem mais ninguém na frente)">
        <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    ` : `
      <button type="button" class="repasse-seq-btn advance" data-action="advance" title="Repassar para a próxima pessoa">
        <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `}
  `;
}

/**
 * Busca (se ainda não tiver) e desenha a sequência dentro de um card
 * específico da fila de repasse. Chamada pra cada card assim que a
 * coluna é montada, e de novo depois de qualquer ação (repassar,
 * adicionar pessoa, entregar).
 */
function montarSequenciaCard(t) {
  const row = document.querySelector(`.repasse-seq-row[data-id="${CSS.escape(String(t.id))}"]`);
  if (!row) return; // card não está mais na tela (trocou de aba/filtro enquanto buscava)
  if (t.sequencia === undefined) {
    garantirClassificacaoSequencia(t).then(() => montarSequenciaCard(t));
    return;
  }
  row.innerHTML = renderRepasseSeqHTML(t);
  wireRepasseSeqRow(row, t);
}

function wireRepasseSeqRow(row, t) {
  const advanceBtn = row.querySelector('[data-action="advance"]');
  if (advanceBtn) {
    advanceBtn.addEventListener("click", e => {
      e.stopPropagation();
      const proximo = proximoDaSequencia(t.sequencia);
      if (proximo) abrirConfirmacaoRepasseCard(t, proximo, advanceBtn);
    });
  }
  const addBtn = row.querySelector('[data-action="add"]');
  if (addBtn) {
    addBtn.addEventListener("click", e => {
      e.stopPropagation();
      repasseModalTaskAtual = t; // pra saber qual card redesenhar quando o modal fechar
      abrirModalRegra(t); // reaproveita o mesmo modal "Ver regra" usado nos cards do quadro
    });
  }
  const deliverSeqBtn = row.querySelector('[data-action="deliver-sequencia"]');
  if (deliverSeqBtn) {
    deliverSeqBtn.addEventListener("click", e => {
      e.stopPropagation();
      abrirConfirmacaoEntregarCard(t, deliverSeqBtn, true);
    });
  }
  const deliverDiretoBtn = row.querySelector('[data-action="deliver-direto"]');
  if (deliverDiretoBtn) {
    deliverDiretoBtn.addEventListener("click", e => {
      e.stopPropagation();
      abrirConfirmacaoEntregarCard(t, deliverDiretoBtn, false);
    });
  }
}

// Pop-up "Repassar para <nome>?" ancorado na barra de baixo do card
// (mesmo lugar de sempre), mesmo o clique tendo vindo da seta lá em
// cima, na fileira de fotinhos.
function abrirConfirmacaoRepasseCard(t, proximo, btn) {
  const actionsEl = btn.closest(".repasse-card").querySelector(".repasse-card-actions");
  let menu = actionsEl.querySelector(".repasse-picker");
  if (menu) { menu.remove(); return; }
  menu = document.createElement("div");
  menu.className = "repasse-picker repasse-confirm";
  menu.innerHTML = `
    <div class="repasse-confirm-text">Repassar para <strong>${proximo.nome}</strong>?</div>
    <div class="repasse-confirm-actions">
      <button type="button" class="repasse-confirm-cancel">Cancelar</button>
      <button type="button" class="repasse-confirm-ok">Confirmar</button>
    </div>
  `;
  actionsEl.appendChild(menu);
  menu.querySelector(".repasse-confirm-cancel").addEventListener("click", ev => { ev.stopPropagation(); menu.remove(); });
  menu.querySelector(".repasse-confirm-ok").addEventListener("click", ev => {
    ev.stopPropagation();
    menu.remove();
    confirmarEAvancarSequenciaCard(t, btn, proximo);
  });
  setTimeout(() => {
    document.addEventListener("click", function fechar(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) { menu.remove(); document.removeEventListener("click", fechar); }
    });
  }, 0);
}

// Pop-up de confirmação antes de entregar — texto muda conforme o
// motivo (você é o último da sequência x a tarefa nem tem sequência).
function abrirConfirmacaoEntregarCard(t, btn, temSequencia) {
  const actionsEl = btn.closest(".repasse-card").querySelector(".repasse-card-actions");
  let menu = actionsEl.querySelector(".repasse-picker");
  if (menu) { menu.remove(); return; }
  menu = document.createElement("div");
  menu.className = "repasse-picker repasse-confirm repasse-confirm-entregar";
  const texto = temSequencia
    ? "Você é a última pessoa da sequência — confirmar aqui vai <strong>entregar a tarefa</strong>, não repassar pra ninguém. Tem certeza?"
    : "Essa tarefa não tem sequência configurada — confirmar aqui vai <strong>entregar a tarefa</strong>. Tem certeza?";
  menu.innerHTML = `
    <div class="repasse-confirm-text">${texto}</div>
    <div class="repasse-confirm-actions">
      <button type="button" class="repasse-confirm-cancel">Cancelar</button>
      <button type="button" class="repasse-confirm-ok">Entregar</button>
    </div>
  `;
  actionsEl.appendChild(menu);
  menu.querySelector(".repasse-confirm-cancel").addEventListener("click", ev => { ev.stopPropagation(); menu.remove(); });
  menu.querySelector(".repasse-confirm-ok").addEventListener("click", ev => {
    ev.stopPropagation();
    menu.remove();
    if (temSequencia) confirmarEAvancarSequenciaCard(t, btn, null);
    else confirmarEntregaDiretaCard(t, btn);
  });
  setTimeout(() => {
    document.addEventListener("click", function fechar(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) { menu.remove(); document.removeEventListener("click", fechar); }
    });
  }, 0);
}

// Marca visualmente a fileira de fotinhos como "confirmando..." — o
// pedido já foi otimista (a tela já mudou), isso só deixa claro que a
// confirmação de verdade com o Runrun.it ainda está rodando em segundo
// plano, com um anel amarelo pulsando na foto que está assumindo.
function marcarSeqRowConfirmando(taskId, ligar) {
  const row = document.querySelector(`.repasse-seq-row[data-id="${CSS.escape(String(taskId))}"]`);
  if (!row) return;
  row.classList.toggle("repasse-seq-confirmando", ligar);
  if (ligar) {
    const dotAtual = row.querySelector(".wf-dot.current");
    if (dotAtual) dotAtual.classList.add("confirmando");
  }
}

// Avança a sequência de verdade no Runrun.it (repassar pro próximo OU
// entregar, se você já era o último — mesmo endpoint faz as duas
// coisas, ver comentário em avancarWorkflowNoBackend). Não tira o card
// da tela sozinho: só marca ele como "recém avançado" pra continuar
// aparecendo até você sair da aba ou recarregar — pedido explícito,
// pra não perder o card de vista no meio da fila.
//
// Otimista: a fileira de fotinhos já mostra a transferência acontecendo
// NA HORA (antes de qualquer resposta do Runrun.it), com o anel
// amarelo indicando que ainda está confirmando em segundo plano — se o
// Runrun.it recusar, desfaz sozinho e avisa com um toast, em vez de
// deixar o botão "travado" esperando a chamada de rede inteira terminar.
async function confirmarEAvancarSequenciaCard(t, btn, proximo) {
  await pararCronometroAoTransferir(t); // se por acaso estava rodando, para antes de repassar

  const sequenciaAntes = t.sequencia ? t.sequencia.map(s => ({ ...s })) : t.sequencia;
  const entregueAntes = t._repasseEntregue;
  if (t.sequencia && t.sequencia.length) {
    const atualIdx = t.sequencia.findIndex(s => s.atual);
    if (atualIdx !== -1) {
      t.sequencia[atualIdx].atual = false;
      t.sequencia[atualIdx].concluido = true;
      if (atualIdx + 1 < t.sequencia.length) t.sequencia[atualIdx + 1].atual = true;
    }
  }
  if (!proximo) t._repasseEntregue = true; // era o último da fila — isso entrega a tarefa de verdade
  montarSequenciaCard(t);
  marcarSeqRowConfirmando(t.id, true);

  try {
    const resultado = await avancarWorkflowNoBackend(t.id);
    if (resultado.ok) {
      repasseRecemAvancados.add(t.id);
      if (resultado.novoResponsavel) {
        t.assignee = resultado.novoResponsavel;
        t.assigneeAvatarUrl = null;
      }
      await recarregarSequenciaCard(t); // sincroniza com o estado real
      agendarAtualizacaoKanban();
    } else {
      t.sequencia = sequenciaAntes;
      t._repasseEntregue = entregueAntes;
      montarSequenciaCard(t);
      mostrarToast("Não consegui avançar a sequência dessa tarefa agora.", "erro");
    }
  } finally {
    marcarSeqRowConfirmando(t.id, false);
  }
}

// Entrega direto (tarefa sem nenhuma sequência configurada ainda) —
// mesmo tratamento otimista do avanço acima.
async function confirmarEntregaDiretaCard(t, btn) {
  await pararCronometroAoTransferir(t); // se por acaso estava rodando, para antes de entregar

  const entregueAntes = t._repasseEntregue;
  t._repasseEntregue = true;
  montarSequenciaCard(t);
  marcarSeqRowConfirmando(t.id, true);

  try {
    const ok = await entregarTarefaNoBackend(t.id);
    if (ok) {
      repasseRecemAvancados.add(t.id);
      agendarAtualizacaoKanban();
    } else {
      t._repasseEntregue = entregueAntes;
      montarSequenciaCard(t);
      mostrarToast("Não consegui entregar essa tarefa agora.", "erro");
    }
  } finally {
    marcarSeqRowConfirmando(t.id, false);
  }
}

// Enquanto o modal "Ver regra" está aberto a partir de um card de
// repasse, guarda qual tarefa é essa — pra redesenhar só aquele card
// (com a regra nova/pessoa adicionada) assim que o modal for fechado.
let repasseModalTaskAtual = null;

function renderRepasse() {
  const board = document.getElementById("repasseBoard");
  if (!board) return;

  let lista = tarefasParaRepasse();

  if (repasseSearch.trim()) {
    const alvo = normalizarParaComparar(repasseSearch);
    lista = lista.filter(t => normalizarParaComparar(t.client).includes(alvo) || normalizarParaComparar(t.title).includes(alvo));
  }

  if (repasseViewMode === "cliente") {
    renderRepasseColunas(board, lista);
  } else if (repasseViewMode === "prioridade") {
    // Lista corrida (não agrupada por cliente) só com as tarefas
    // marcadas como prioridade Alta — cada card ganha uma tagzinha com
    // o nome do cliente, já que não tem mais coluna pra deixar isso óbvio.
    const prioritarias = lista.filter(t => t.priority === "alta");
    renderRepasseListaFlat(board, prioritarias);
  } else {
    // Pros modos "com sequência" / "sem sequência", precisa classificar
    // cada tarefa primeiro (busca sob demanda, cacheada em cada tarefa).
    board.innerHTML = `<p class="workflow-seq-empty" style="padding:24px;">Conferindo quais têm sequência configurada...</p>`;
    Promise.all(lista.map(t => garantirClassificacaoSequencia(t))).then(() => {
      if (repasseViewMode !== "com_sequencia" && repasseViewMode !== "sem_sequencia") return; // trocou de aba enquanto carregava
      const filtrada = lista.filter(t => repasseViewMode === "com_sequencia" ? t._temSequencia : !t._temSequencia);
      renderRepasseColunas(board, filtrada);
    });
  }
}

// Aba "Prioridades": mesma ordenação por Entrega das outras abas, mas
// numa lista corrida só (sem coluna por cliente) — por isso cada card
// leva a tagzinha do cliente, pra não perder essa informação.
function renderRepasseListaFlat(board, lista) {
  lista = lista.slice().sort((a, b) => {
    if (!a.dueISO) return 1;
    if (!b.dueISO) return -1;
    return a.dueISO.localeCompare(b.dueISO);
  });

  if (lista.length === 0) {
    board.innerHTML = `<p class="workflow-seq-empty" style="padding:24px;">Nenhuma tarefa de prioridade alta esperando repasse 🎉</p>`;
    return;
  }

  board.innerHTML = `
    <div class="repasse-flat-grid">
      ${lista.map(t => repasseCardHTML(t, true)).join("")}
    </div>
  `;

  wireRepasseCards(lista);
  lista.forEach(t => montarSequenciaCard(t));
}

function renderRepasseColunas(board, lista) {
  lista = lista.slice().sort((a, b) => {
    if (!a.dueISO) return 1;
    if (!b.dueISO) return -1;
    return a.dueISO.localeCompare(b.dueISO);
  });

  const porCliente = {};
  lista.forEach(t => {
    if (!porCliente[t.client]) porCliente[t.client] = [];
    porCliente[t.client].push(t);
  });
  const clientes = Object.keys(porCliente).sort();

  if (clientes.length === 0) {
    board.innerHTML = `<p class="workflow-seq-empty" style="padding:24px;">Nenhuma tarefa esperando repasse por aqui 🎉</p>`;
    return;
  }

  board.innerHTML = clientes.map(cliente => `
    <div class="repasse-column">
      <div class="repasse-column-header">
        <span class="repasse-column-nome">${cliente}</span>
        <span class="repasse-column-count">${porCliente[cliente].length}</span>
      </div>
      <div class="repasse-column-body">
        ${porCliente[cliente].map(t => repasseCardHTML(t)).join("")}
      </div>
    </div>
  `).join("");

  wireRepasseCards(lista);
  lista.forEach(t => montarSequenciaCard(t));
}

function removerCardDeRepasseDaTela(btn) {
  const card = btn.closest(".repasse-card");
  if (!card) return;
  card.style.transition = "opacity 0.2s var(--ease-apple), transform 0.2s var(--ease-apple)";
  card.style.opacity = "0";
  card.style.transform = "translateX(12px)";
  setTimeout(() => card.remove(), 200);
}

// Reconstrói só o conteúdo de um pill de data (label + valor), sem tocar
// no resto do card nem na ordem da lista — usado depois de salvar uma
// nova data, e também na primeira montagem de cada item.
function restaurarPillItem(item, t, campo) {
  const label = campo === "publicacao" ? "Publicação" : "Entrega";
  const valorISO = campo === "publicacao" ? t.dataPublicacao : t.dueISO;
  const atrasada = campo === "entrega" && t.dueISO && t.dueISO < hojeISO();
  item.classList.toggle("overdue", atrasada);
  item.innerHTML = `
    <span class="repasse-data-label">${label}</span>
    <button type="button" class="repasse-data-valor">${formatarDataCurtaSemAno(valorISO) || "—"}</button>
  `;
}

// Liga o clique de abrir o calendário num pill de data específico —
// chamado na montagem inicial de cada card e de novo depois de salvar
// uma data (já que o innerHTML do item é reconstruído nessa hora).
function wireDataItem(item, lista) {
  item.onclick = e => e.stopPropagation(); // não abre o card de detalhe

  const valorBtn = item.querySelector(".repasse-data-valor");
  valorBtn.addEventListener("click", e => {
    e.stopPropagation();
    const t = lista.find(x => String(x.id) === item.dataset.id);
    if (!t) return;
    const campo = item.dataset.campo; // "publicacao" ou "entrega"
    const valorAtualISO = (campo === "publicacao" ? t.dataPublicacao : t.dueISO) || "";
    const labelHTML = item.querySelector(".repasse-data-label").outerHTML;

    item.innerHTML = `${labelHTML}<input type="date" class="repasse-data-input" value="${valorAtualISO}">`;
    const input = item.querySelector(".repasse-data-input");
    input.addEventListener("click", ev => ev.stopPropagation());
    input.focus();
    // Abre o calendário nativo direto ao clicar, em vez de deixar a
    // pessoa digitar a data na mão.
    if (typeof input.showPicker === "function") {
      try { input.showPicker(); } catch (err) { /* alguns navegadores recusam fora de um clique direto — segue clicável normalmente */ }
    }

    let jaSalvou = false;
    function salvar() {
      if (jaSalvou) return;
      jaSalvou = true;
      const novaData = input.value; // sempre AAAA-MM-DD
      if (!novaData || novaData === valorAtualISO) {
        restaurarPillItem(item, t, campo);
        wireDataItem(item, lista);
        return;
      }

      // Otimista: já mostra a data nova na hora (sem deixar o campo
      // desabilitado esperando o Runrun.it responder) — a chamada real
      // roda em segundo plano; se o Runrun.it recusar, volta pro valor
      // antigo sozinho e avisa com um toast, em vez de travar a tela
      // toda inteira esperando.
      const valorAntigo = campo === "publicacao" ? t.dataPublicacao : t.dueISO;
      const dueAntigo = t.due;
      if (campo === "publicacao") {
        t.dataPublicacao = novaData;
      } else {
        const [ano, mes, dia] = novaData.split("-").map(Number);
        t.dueISO = novaData;
        t.due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
      }
      restaurarPillItem(item, t, campo);
      wireDataItem(item, lista);

      const promessa = campo === "publicacao"
        ? alterarPublicacaoNoBackend(t.id, novaData)
        : alterarEntregaNoBackend(t.id, novaData);

      promessa.then(ok => {
        if (ok) {
          agendarAtualizacaoKanban();
          return;
        }
        // Runrun.it recusou — desfaz sozinho e avisa.
        if (campo === "publicacao") {
          t.dataPublicacao = valorAntigo;
        } else {
          t.dueISO = valorAntigo;
          t.due = dueAntigo;
        }
        const itemAtual = document.querySelector(`.repasse-data-pill[data-campo="${campo}"][data-id="${CSS.escape(String(t.id))}"]`);
        if (itemAtual) {
          restaurarPillItem(itemAtual, t, campo);
          wireDataItem(itemAtual, lista);
        }
        mostrarToast(`Não consegui alterar a ${campo === "publicacao" ? "Publicação" : "Entrega Desejada"} agora.`, "erro");
      });
    }

    input.addEventListener("change", salvar);
    input.addEventListener("blur", () => { if (!jaSalvou) { restaurarPillItem(item, t, campo); wireDataItem(item, lista); } });
  });
}

function wireRepasseCards(lista) {
  document.querySelectorAll(".repasse-card").forEach(card => {
    const t = lista.find(x => String(x.id) === card.dataset.id);
    if (!t) return;
    card.addEventListener("click", () => {
      abrirTarefaPorId(t.id); // painel de detalhe fica solto no body, então abre por cima da própria aba de repasse
    });
  });

  // ===== Pill de datas: clicar em Publicação ou Entrega abre o calendário =====
  // Importante: depois de salvar, NÃO chamamos renderRepasse() (isso
  // reordenaria a lista inteira por data e o card "pularia" de posição
  // enquanto a pessoa ainda está mexendo nele). Em vez disso, só o pill
  // daquele campo é reconstruído no lugar — a reordenação de verdade só
  // acontece quando a aba é reaberta/atualizada de novo.
  document.querySelectorAll(".repasse-data-pill").forEach(item => {
    wireDataItem(item, lista);
  });

  document.querySelectorAll(".repasse-btn-ficar").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const t = lista.find(x => String(x.id) === btn.dataset.id);
      if (!t) return;
      btn.disabled = true;
      btn.textContent = "Assumindo...";
      const usuarios = await buscarUsuariosRunrun();
      const eu = usuarios.find(u => nomesCorrespondem(u.nome, DESIGNER_LOGADO));
      if (!eu) {
        btn.disabled = false;
        btn.textContent = "Ficar comigo";
        mostrarToast("Não consegui te encontrar na lista de usuários do Runrun.it.", "erro");
        return;
      }
      const ok = await reatribuirTarefaNoBackend(t.id, eu.id);
      if (ok) {
        ignorarNaRepasse(t.id);
        removerCardDeRepasseDaTela(btn);
        agendarAtualizacaoKanban();
      } else {
        btn.disabled = false;
        btn.textContent = "Ficar comigo";
        mostrarToast("Não consegui reatribuir essa tarefa agora. Tenta de novo em alguns segundos.", "erro");
      }
    });
  });

}

// Acha, na sequência já carregada, quem vem logo depois do responsável
// atual e ainda não concluiu a etapa dele — é pra essa pessoa que o
// "Repassar" vai perguntar antes de avançar de verdade.
function proximoDaSequencia(seq) {
  if (!Array.isArray(seq) || seq.length === 0) return null;
  const idxAtual = seq.findIndex(s => s.atual);
  for (let i = idxAtual + 1; i < seq.length; i++) {
    if (!seq[i].concluido) return seq[i];
  }
  return null;
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
    if ((page === "kanban" || page === "clientes" || page === "runrun") && PAPEL_LOGADO === "coordenador") {
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
  if (page === "repasse") buildRepassePage();
  if (page === "runrun") buildRunrunCompletoPage();
  if (page === "hoje") buildHistoricoPage();
}

document.getElementById("designerFilterSelect").addEventListener("change", e => {
  filtroDesignerCoordenador = e.target.value;
  render();
  if (!document.getElementById("page-clientes").hidden) buildClientsPage();
  if (!document.getElementById("page-runrun").hidden) buildRunrunCompletoPage();
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

// Fechou o modal "Ver regra" que foi aberto a partir de um card da
// fila de repasse (botão "+" na fileira de fotinhos)? Redesenha só
// aquele card com a sequência atualizada — mesma lógica de
// recarregarSequenciaCard usada depois de repassar/entregar.
document.getElementById("ruleModalClose").addEventListener("click", () => {
  if (repasseModalTaskAtual) { recarregarSequenciaCard(repasseModalTaskAtual); repasseModalTaskAtual = null; }
});
document.getElementById("ruleModalOverlay").addEventListener("click", e => {
  if (e.target.id === "ruleModalOverlay" && repasseModalTaskAtual) {
    recarregarSequenciaCard(repasseModalTaskAtual);
    repasseModalTaskAtual = null;
  }
});

// ===== Notificações reais (comentários não lidos nas tarefas do designer logado) =====
