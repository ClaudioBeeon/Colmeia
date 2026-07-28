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
  return tasksTodas.filter(t => !t.isMotherCard && tarefaEstaComAtendimento(t));
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
// tarefa, pra não perguntar de novo toda vez que a aba reabrir.
async function garantirClassificacaoSequencia(t) {
  if (t._temSequencia !== undefined) return t._temSequencia;
  if (!t.id) { t._temSequencia = false; return false; }
  const resultado = await buscarSequenciaDoBackend(t.id);
  t._sequenciaCache = resultado.sequencia;
  t._workflowIdCache = resultado.workflowId;
  t._temSequencia = !!(resultado.sequencia && resultado.sequencia.length > 0);
  return t._temSequencia;
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

function buildRepassePage() {
  if (!souClaudio()) { mostrarPagina("kanban"); return; } // essa página é só do Cláudio
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

function repasseCardHTML(t) {
  const type = typeLabels[t.type] || { label: t.type, class: "" };
  const tempoParado = formatarTempoParado(t.lastActivityAt);
  const atrasada = t.dueISO && t.dueISO < hojeISO();
  return `
    <div class="repasse-card" data-id="${t.id}">
      <div class="repasse-card-top">
        <span class="badge ${type.class}">${type.label}</span>
      </div>
      <div class="repasse-card-title">${t.title}</div>
      <div class="repasse-datas-pill">
        <div class="repasse-data-item" data-campo="publicacao" data-id="${t.id}">
          <span class="repasse-data-label">Publicação</span>
          <button type="button" class="repasse-data-valor">${formatarDataCurtaSemAno(t.dataPublicacao) || "—"}</button>
        </div>
        <span class="repasse-data-divisor"></span>
        <div class="repasse-data-item ${atrasada ? "overdue" : ""}" data-campo="entrega" data-id="${t.id}">
          <span class="repasse-data-label">Entrega</span>
          <button type="button" class="repasse-data-valor">${formatarDataCurtaSemAno(t.dueISO) || "—"}</button>
        </div>
      </div>
      ${tempoParado ? `<div class="repasse-card-tempo">${tempoParado}</div>` : ""}
      <div class="repasse-card-actions">
        <button type="button" class="repasse-btn repasse-btn-repassar" data-id="${t.id}">Repassar</button>
        <button type="button" class="repasse-btn repasse-btn-ficar" data-id="${t.id}">Ficar comigo</button>
      </div>
    </div>
  `;
}

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
}

function removerCardDeRepasseDaTela(btn) {
  const card = btn.closest(".repasse-card");
  if (!card) return;
  card.style.transition = "opacity 0.2s var(--ease-apple), transform 0.2s var(--ease-apple)";
  card.style.opacity = "0";
  card.style.transform = "translateX(12px)";
  setTimeout(() => card.remove(), 200);
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
  document.querySelectorAll(".repasse-data-item").forEach(item => {
    item.addEventListener("click", e => e.stopPropagation()); // não abre o card de detalhe

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
      async function salvar() {
        if (jaSalvou) return;
        jaSalvou = true;
        const novaData = input.value; // sempre AAAA-MM-DD
        if (!novaData || novaData === valorAtualISO) { renderRepasse(); return; }

        input.disabled = true;
        const ok = campo === "publicacao"
          ? await alterarPublicacaoNoBackend(t.id, novaData)
          : await alterarEntregaNoBackend(t.id, novaData);

        if (!ok) {
          alert(`Não consegui alterar a ${campo === "publicacao" ? "Publicação" : "Entrega Desejada"} agora. Tenta de novo em alguns segundos.`);
          renderRepasse();
          return;
        }

        if (campo === "publicacao") {
          t.dataPublicacao = novaData;
        } else {
          const [ano, mes, dia] = novaData.split("-").map(Number);
          t.dueISO = novaData;
          t.due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
        }
        agendarAtualizacaoKanban();
        renderRepasse();
      }

      input.addEventListener("change", salvar);
      input.addEventListener("blur", () => { if (!jaSalvou) renderRepasse(); });
    });
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
        alert("Não consegui te encontrar na lista de usuários do Runrun.it.");
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
        alert("Não consegui reatribuir essa tarefa agora. Tenta de novo em alguns segundos.");
      }
    });
  });

  document.querySelectorAll(".repasse-btn-repassar").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const t = lista.find(x => String(x.id) === btn.dataset.id);
      if (!t) return;
      btn.disabled = true;
      btn.textContent = "Verificando...";
      await garantirClassificacaoSequencia(t);
      btn.disabled = false;
      btn.textContent = "Repassar";

      if (t._temSequencia) {
        const proximo = proximoDaSequencia(t._sequenciaCache);
        if (proximo) {
          // Já tem alguém definido como próximo na sequência — confirma
          // com o nome antes de avançar de verdade.
          abrirConfirmacaoRepasse(t, proximo, btn);
        } else {
          // Tem sequência configurada, mas ninguém definido como próximo
          // (ex: sequência com todo mundo já concluído) — deixa o
          // Runrun.it decidir e mostra quem entrou depois.
          confirmarEAvancarSequencia(t, btn, null);
        }
      } else {
        // Sem sequência nenhuma configurada ainda: abre o mesmo modal
        // "Ver regra" usado dentro dos cards, pra criar a regra de
        // verdade (não só reatribuir uma vez só) — reaproveita a
        // sequência/workflowId já buscados por garantirClassificacaoSequencia.
        t.sequencia = t._sequenciaCache || [];
        t.workflowId = t._workflowIdCache || null;
        abrirModalRegra(t);
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

// Pop-up de confirmação "Repassar para <nome>?" antes de mexer em
// qualquer coisa de verdade no Runrun.it.
function abrirConfirmacaoRepasse(t, proximo, btn) {
  let menu = btn.parentElement.querySelector(".repasse-picker");
  if (menu) { menu.remove(); return; } // clicou de novo — fecha
  menu = document.createElement("div");
  menu.className = "repasse-picker repasse-confirm";
  menu.innerHTML = `
    <div class="repasse-confirm-text">Repassar para <strong>${proximo.nome}</strong>?</div>
    <div class="repasse-confirm-actions">
      <button type="button" class="repasse-confirm-cancel">Cancelar</button>
      <button type="button" class="repasse-confirm-ok">Confirmar</button>
    </div>
  `;
  btn.parentElement.appendChild(menu);
  menu.querySelector(".repasse-confirm-cancel").addEventListener("click", ev => { ev.stopPropagation(); menu.remove(); });
  menu.querySelector(".repasse-confirm-ok").addEventListener("click", ev => {
    ev.stopPropagation();
    menu.remove();
    confirmarEAvancarSequencia(t, btn, proximo);
  });
  setTimeout(() => {
    document.addEventListener("click", function fechar(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener("click", fechar);
      }
    });
  }, 0);
}

// Avança a sequência de verdade no Runrun.it (só chamado depois de
// confirmado, ou quando não havia ninguém específico pra confirmar).
async function confirmarEAvancarSequencia(t, btn, proximo) {
  btn.disabled = true;
  btn.textContent = "Repassando...";
  const novoResponsavel = await avancarWorkflowNoBackend(t.id);
  if (novoResponsavel) {
    removerCardDeRepasseDaTela(btn);
    agendarAtualizacaoKanban();
  } else {
    btn.disabled = false;
    btn.textContent = "Repassar";
    alert("Não consegui avançar a sequência dessa tarefa agora.");
  }
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

// ===== Notificações reais (comentários não lidos nas tarefas do designer logado) =====
