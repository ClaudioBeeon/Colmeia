// ===== "Ficar comigo": quais tarefas você já decidiu assumir =====
//
// Isso ficava SÓ no localStorage — e por isso a fila inteira voltou a
// aparecer quando o Colmeia mudou de endereço (claudiobeeon.github.io ->
// colmeia.beeon.com.br): localStorage é separado por domínio, então o
// endereço novo começou do zero. Agora a fonte de verdade é a planilha
// (aba RepasseIgnorados, ver Planilha.gs); o localStorage continua aqui
// como cópia local, pra tela desenhar na hora sem esperar a rede e pra
// continuar funcionando com a internet fora.
const REPASSE_IGNORADOS_KEY = "colmeia_repasse_ignorados_ids";

// Começa com o que estiver salvo no navegador; a busca no backend (ver
// carregarRepasseIgnoradosDoBackend) junta o resto assim que responde.
let repasseIgnoradosCache = null;

function idsRepasseIgnorados() {
  if (repasseIgnoradosCache) return repasseIgnoradosCache;
  try { repasseIgnoradosCache = new Set(JSON.parse(localStorage.getItem(REPASSE_IGNORADOS_KEY) || "[]").map(String)); }
  catch (e) { repasseIgnoradosCache = new Set(); }
  return repasseIgnoradosCache;
}

function salvarIgnoradosNoNavegador() {
  try {
    localStorage.setItem(REPASSE_IGNORADOS_KEY, JSON.stringify(Array.from(idsRepasseIgnorados())));
  } catch (e) { /* sem problema */ }
}

// Usado quando você clica "Ficar comigo" — a tarefa continua com você
// (assignee não muda), então sem isso ela voltaria a aparecer na fila
// pra sempre mesmo depois de você decidir assumir ela de propósito.
function ignorarNaRepasse(taskId) {
  idsRepasseIgnorados().add(String(taskId));
  salvarIgnoradosNoNavegador();
  // Passa pela fila de escrita: se a internet estiver fora, a decisão vai
  // sozinha quando voltar, em vez de se perder (js/fila-offline.js).
  if (typeof enviarEscritaNoBackend === "function") {
    enviarEscritaNoBackend(
      { acao: "ignorarNoRepasse", designer: DESIGNER_LOGADO, taskIds: [String(taskId)] },
      "guardar o 'ficar comigo'"
    );
  }
}

/**
 * Junta o que a planilha sabe com o que este navegador já tinha, e SOBE
 * a diferença. É isso que recupera, sozinho, quem tinha decisões antigas
 * guardadas só no navegador — inclusive as do endereço antigo, se a
 * pessoa abrir o Colmeia por lá uma vez.
 *
 * Chamada no login (js/login-boot.js). Falha de rede não apaga nada: sem
 * resposta, segue valendo só o que já estava no navegador.
 */
async function carregarRepasseIgnoradosDoBackend() {
  if (!DESIGNER_LOGADO) return;
  const doNavegador = new Set(idsRepasseIgnorados());

  const resposta = await chamarBackend({ acao: "listarRepasseIgnorados", designer: DESIGNER_LOGADO });
  if (caiuARede(resposta) || !resposta.ok) return;

  const doBackend = new Set((resposta.ids || []).map(String));
  doBackend.forEach(id => repasseIgnoradosCache.add(id));
  salvarIgnoradosNoNavegador();

  // O que só existia neste navegador ainda não está na planilha — sobe
  // tudo de uma vez (uma chamada só, não uma por tarefa).
  const sóAqui = Array.from(doNavegador).filter(id => !doBackend.has(id));
  if (sóAqui.length) {
    chamarBackend({ acao: "ignorarNoRepasse", designer: DESIGNER_LOGADO, taskIds: sóAqui });
  }

  if (typeof atualizarBadgeRepasse === "function") atualizarBadgeRepasse();
  if (!document.getElementById("page-repasse").hidden && typeof buildRepassePage === "function") {
    buildRepassePage();
  }
}

function tarefaEstaComAtendimento(t) {
  if (!t.id || !t.assignee) return false;
  if (ehTarefaDeCoordenacao(t)) return false; // a sua tarefa fixa de coordenação não é "repasse"
  // String() dos dois lados: o id vem como número do backend, mas o
  // conjunto guarda texto (é como sai do JSON/da planilha).
  if (idsRepasseIgnorados().has(String(t.id))) return false; // você já decidiu ficar com essa
  return ehMinhaTarefa(t);
}

function tarefasParaRepasse() {
  return tasksTodas.filter(t => !t.isMotherCard && (tarefaEstaComAtendimento(t) || repasseRecemAvancados.has(t.id)));
}

// Resolve o objeto de tarefa "de verdade" (o que está em tasksTodas
// agora), nunca um que ficou preso numa lista de render de um tempinho
// atrás. Sem isso, se a atualização automática do quadro trocar os
// objetos de tarefa por baixo bem no meio de uma ação (repassar,
// adicionar pessoa, entregar), a ação mexia num objeto "órfão" — parecia
// ter dado certo na tela na hora, mas sumia nas próximas atualizações.
function tarefaRepasseViva(t) {
  if (!t || !t.id) return t;
  return tasksTodas.find(x => String(x.id) === String(t.id)) || t;
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
  t = tarefaRepasseViva(t);
  if (t._temSequencia !== undefined) return t._temSequencia;
  if (!t.id) { t._temSequencia = false; t.sequencia = []; t.workflowId = null; return false; }
  const resultado = await buscarSequenciaDoBackend(t.id);
  // Erro de rede não vira "sem sequência": não grava nada no cache (assim
  // a próxima tentativa busca de novo, em vez de a tarefa ficar presa na
  // aba errada até dar F5) e não zera a sequência que já estava boa.
  if (resultado.erro) return t._temSequencia;
  t.sequencia = resultado.sequencia;
  t.workflowId = resultado.workflowId;
  t._temSequencia = !!(resultado.sequencia && resultado.sequencia.length > 0);
  return t._temSequencia;
}

// Busca de novo (sem usar o cache) — chamada depois de repassar/entregar/
// adicionar alguém na regra, pra pegar o estado real e redesenhar só
// aquele card.
async function recarregarSequenciaCard(t) {
  t = tarefaRepasseViva(t);
  const resultado = await buscarSequenciaDoBackend(t.id);
  // Igual em garantirClassificacaoSequencia: falha de rede não pode virar
  // "sem sequência" (senão o card passa a mostrar o botão de entregar em
  // vez da seta de repassar). Mantém o que já estava desenhado.
  if (resultado.erro) return;
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

// Trava a POSIÇÃO de cada card na fila (não só se ele continua
// aparecendo) — sem isso, toda vez que a atualização em segundo plano
// rodava, a lista era reordenada por data de novo do zero, e um card
// que você tinha acabado de mexer "descia" pra outra posição na hora
// errada. Guarda a ordem (ids) da primeira vez que a aba é montada;
// dali em diante os cards já conhecidos mantêm a MESMA posição relativa,
// e só um card genuinamente novo entra no fim (ordenado por data só
// entre os novos). Só é destravada de novo quando a aba é reaberta
// (buildRepassePage) ou a página recarrega (F5) — pedido explícito.
let repasseOrdemFixa = null;

function ordenarComPosicaoFixa(lista) {
  const porData = (a, b) => {
    if (!a.dueISO) return 1;
    if (!b.dueISO) return -1;
    return a.dueISO.localeCompare(b.dueISO);
  };
  if (!repasseOrdemFixa) {
    const ordenada = lista.slice().sort(porData);
    repasseOrdemFixa = ordenada.map(t => t.id);
    return ordenada;
  }
  const posicao = new Map(repasseOrdemFixa.map((id, i) => [String(id), i]));
  const conhecidos = [];
  const novas = [];
  lista.forEach(t => {
    if (posicao.has(String(t.id))) conhecidos.push(t);
    else novas.push(t);
  });
  conhecidos.sort((a, b) => posicao.get(String(a.id)) - posicao.get(String(b.id)));
  novas.sort(porData);
  novas.forEach(t => repasseOrdemFixa.push(t.id)); // entra no fim e já fica fixo dali em diante também
  return conhecidos.concat(novas);
}

function buildRepassePage() {
  if (!souClaudio()) { mostrarPagina("kanban"); return; } // essa página é só do Cláudio
  repasseRecemAvancados = new Set();
  repasseOrdemFixa = null; // reabrir a aba destrava a ordem e reordena por data de novo
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

  // O contador da aba "Aprovações" é buscado mesmo sem entrar nela — é o
  // que faz o número aparecer já na chegada ("tem 4 esperando resposta").
  // Sem travar nada: se falhar, a aba continua funcionando quando aberta.
  if (repasseViewMode !== "aprovacoes") {
    carregarAprovacoesDoRepasse().then(lista => {
      if (lista === null) return;
      aprovacoesCache = lista;
      atualizarBadgeAprovacoes();
    });
  }
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
/**
 * Sugestão de pra quem repassar — SEM IA de propósito: tudo aqui já é
 * número que o Colmeia tem em mãos (quem fez a peça original, quem tem
 * menos tarefas agora), então uma conta simples é mais rápida e mais
 * confiável que perguntar pra um modelo. O ícone da Bee aparece porque é
 * ela quem "assina" a sugestão, não porque ela calculou.
 *
 * "Quem fez a peça original" só funciona se aquela subtarefa já foi
 * aberta nesta sessão (é quando o card mãe entra no cache) — quando não
 * dá, cai direto no critério de carga.
 */
function sugerirDesignerParaRepasse(t) {
  const candidatos = DESIGNERS_EQUIPE.filter(n => !nomesCorrespondem(n, t.assignee));
  if (!candidatos.length) return null;

  if (typeof ehTarefaDeAlteracao === "function" && ehTarefaDeAlteracao(t)) {
    const original = typeof acharTarefaOriginalDaAlteracao === "function" ? acharTarefaOriginalDaAlteracao(t) : null;
    const nomeOriginal = original && original.responsavel;
    if (nomeOriginal && candidatos.some(n => nomesCorrespondem(n, nomeOriginal))) {
      return { nome: nomeOriginal, motivo: "fez a peça original" };
    }
  }

  const lista = (typeof tasksTodas !== "undefined" && tasksTodas.length) ? tasksTodas : tasks;
  const contagem = {};
  candidatos.forEach(n => { contagem[n] = 0; });
  lista.forEach(x => {
    const nome = candidatos.find(n => nomesCorrespondem(n, x.assignee));
    if (nome) contagem[nome]++;
  });
  const maisLivre = candidatos.reduce((a, b) => (contagem[a] <= contagem[b] ? a : b));
  return { nome: maisLivre, motivo: "está com menos tarefas agora" };
}

function repasseCardHTML(t, mostrarClientePill) {
  const type = typeLabels[t.type] || { label: t.type, class: "" };
  const tempoParado = formatarTempoParado(t.lastActivityAt);
  const atrasada = t.dueISO && t.dueISO < hojeISO();
  const sugestao = sugerirDesignerParaRepasse(t);
  return `
    <div class="repasse-card" data-id="${t.id}">
      <div class="repasse-card-top">
        <span class="badge ${type.class}">${type.label}</span>
        ${mostrarClientePill ? `<span class="repasse-client-pill">${escaparHTML(t.client)}</span>` : ""}
      </div>
      <div class="repasse-card-title">${escaparHTML(t.title)}</div>
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
      ${sugestao ? `<div class="repasse-sugestao" title="${escaparHTML(sugestao.motivo)}"><span class="bee-selo-mini">${beeIcon}</span>sugere: ${escaparHTML(sugestao.nome)}</div>` : ""}
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
  // Antes mostrava a fila inteira de pontinhos — numa regra longa, os
  // últimos ficavam cortados pra fora do card (largura fixa). Agora
  // mostra sempre no máximo 3: quem veio antes (pra dar pra voltar), o
  // atual (centralizado) e o próximo/último.
  const idxCentro = atualIdx !== -1 ? atualIdx : 0;
  const janela = [idxCentro - 1, idxCentro, idxCentro + 1].filter(i => i >= 0 && i < seq.length);
  return `
    <div class="repasse-seq-dots">
      ${janela.map((idx, pos) => `
        ${pos > 0 ? `<div class="wf-line ${seq[janela[pos - 1]].concluido ? "done" : ""}"></div>` : ""}
        <div class="wf-dot ${seq[idx].atual ? "current" : ""} ${seq[idx].concluido ? "completed" : ""}" title="${seq[idx].nome}">
          ${avatarHTML(seq[idx].nome, "avatar-xs", seq[idx].foto)}
          ${seq[idx].concluido ? `<span class="wf-check">✓</span>` : ""}
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
    garantirClassificacaoSequencia(t).then(() => {
      // Se a busca falhou, `sequencia` continua indefinida — NÃO pode
      // chamar montarSequenciaCard de novo na hora, senão vira um laço
      // infinito de tentativas de rede (buscar, falhar, buscar...). Avisa
      // na própria linha e deixa a próxima atualização automática tentar.
      if (t.sequencia === undefined) {
        const rowAgora = document.querySelector(`.repasse-seq-row[data-id="${CSS.escape(String(t.id))}"]`);
        if (rowAgora) rowAgora.innerHTML = `<span class="repasse-seq-loading">Não consegui carregar a sequência agora</span>`;
        return;
      }
      montarSequenciaCard(t);
    });
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
      abrirQuickPickerRegra(t, addBtn); // pop-up rápido com as fotos, sem abrir o modal grande
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
  // Clicar numa foto da fileira (não nos botões de ação) abre o modal
  // grande "Ver regra" — a fileira em si só mostra quem é, o pop-up
  // rápido do "+" é que serve pra decidir rápido quem entra a seguir.
  row.querySelectorAll(".wf-dot").forEach(dot => {
    dot.addEventListener("click", e => {
      e.stopPropagation();
      repasseModalTaskAtual = t; // pra saber qual card redesenhar quando o modal fechar
      abrirModalRegra(t);
    });
  });
}

/**
 * Calcula onde encostar o pop-up rápido perto do botão que abriu ele —
 * embaixo se tiver espaço na tela, em cima se não tiver (ex: card no
 * fim da coluna). O pop-up é filho do `.repasse-card` (não só da barra
 * de baixo, como os de confirmação), porque o botão "+" fica no meio
 * do card, então a posição precisa ser calculada de verdade em vez de
 * só grudar embaixo.
 */
function posicionarPickerPertoDoBotao(menu, btn) {
  const card = btn.closest(".repasse-card");
  if (!card) return;
  const cardRect = card.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const alturaMenu = menu.offsetHeight || 220;
  const espacoAbaixo = window.innerHeight - btnRect.bottom;
  const abrirParaCima = espacoAbaixo < alturaMenu + 16 && btnRect.top > alturaMenu + 16;

  let left = btnRect.left - cardRect.left - 90; // centraliza aproximadamente sob o botão
  const larguraMenu = menu.offsetWidth || 220;
  left = Math.max(4, Math.min(left, cardRect.width - larguraMenu - 4));
  menu.style.left = left + "px";
  menu.style.right = "auto";

  if (abrirParaCima) {
    menu.style.bottom = (cardRect.bottom - btnRect.top + 8) + "px";
    menu.style.top = "auto";
  } else {
    menu.style.top = (btnRect.bottom - cardRect.top + 8) + "px";
    menu.style.bottom = "auto";
  }
}

// Fecha qualquer pop-up (confirmação ou pop-up rápido) já aberto
// naquele card antes de abrir um novo — evita dois grudados ao mesmo
// tempo se a pessoa clicar em botões diferentes rapidinho.
function fecharPickersDoCard(card) {
  card.querySelectorAll(".repasse-picker").forEach(m => m.remove());
  card.classList.remove("repasse-card-popup-aberto");
}

/**
 * Pop-up rápido e animado com a foto de todo mundo — abre ao clicar no
 * "+", perto do botão (embaixo ou em cima, conforme o espaço). Clicar
 * numa pessoa já adiciona ela na sequência na hora (otimista, mesmo
 * padrão do resto do app), sem precisar abrir o modal "Ver regra"
 * inteiro só pra isso.
 */
async function abrirQuickPickerRegra(t, btn) {
  const card = btn.closest(".repasse-card");
  const jaAberto = card.querySelector(".repasse-quick-add");
  fecharPickersDoCard(card);
  if (jaAberto) return; // clicou de novo no mesmo botão — só fecha
  card.classList.add("repasse-card-popup-aberto"); // sobe acima dos cards vizinhos

  const menu = document.createElement("div");
  menu.className = "repasse-picker repasse-quick-add";
  menu.innerHTML = `<div class="assignee-menu-loading">Carregando pessoas...</div>`;
  card.appendChild(menu);
  posicionarPickerPertoDoBotao(menu, btn);

  const usuarios = ordenarUsuariosParaRegra(await buscarUsuariosRunrun());
  if (!menu.isConnected) return; // fechou enquanto carregava
  if (usuarios.length === 0) {
    menu.innerHTML = `<div class="assignee-menu-loading">Não consegui buscar a lista.</div>`;
    return;
  }
  menu.innerHTML = usuarios.map(u => `
    <button type="button" data-user-id="${u.id}" data-user-nome="${u.nome}" data-user-foto="${u.foto || ""}">
      ${avatarHTML(u.nome, "avatar-sm", u.foto)} <span>${u.nome}</span>
    </button>
  `).join("");
  posicionarPickerPertoDoBotao(menu, btn); // recalcula já com a altura real da lista

  menu.querySelectorAll("button").forEach(opt => {
    opt.addEventListener("click", ev => {
      ev.stopPropagation();
      fecharPickersDoCard(card);
      adicionarPessoaViaQuickPicker(t, {
        id: opt.dataset.userId,
        nome: opt.dataset.userNome,
        foto: opt.dataset.userFoto || null,
      });
    });
  });

  setTimeout(() => {
    document.addEventListener("click", function fechar(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) { fecharPickersDoCard(card); document.removeEventListener("click", fechar); }
    });
  }, 0);
}

// Adiciona a pessoa escolhida no pop-up rápido — otimista (a fileira já
// mostra a foto nova na hora, com o anel amarelo na foto que assumiu),
// confirma de verdade em segundo plano. Mesma ideia de
// adicionarPessoaOtimista (js/regras-briefing.js), só que redesenhando
// direto o card de repasse em vez do modal "Ver regra" — usa a mesma
// construirSequenciaOtimistaComNovaPessoa (regras-briefing.js) pra
// garantir que sua foto nunca some quando a regra ainda nem existia.
async function adicionarPessoaViaQuickPicker(t, usuario) {
  t = tarefaRepasseViva(t);
  if (repasseAcaoJaEmAndamento(t)) return;
  t.sequencia = construirSequenciaOtimistaComNovaPessoa(t, usuario);
  montarSequenciaCard(t);
  renderSequenciaNoHeaderSeAberta(t); // se o pop-up de detalhe dessa tarefa também estiver aberto

  try {
    if (!t.workflowId) {
      const criado = await criarRegraNoBackend(t.id);
      t = tarefaRepasseViva(t);
      if (!criado.ok) {
        mostrarToast("Não consegui criar a sequência dessa tarefa agora.", "erro");
        await recarregarSequenciaCard(t);
        return;
      }
      t.workflowId = criado.workflowId;
    }
    const ok = await adicionarNaRegraNoBackend(t.workflowId, usuario.id);
    t = tarefaRepasseViva(t);
    if (!ok) mostrarToast("Não consegui adicionar essa pessoa na sequência agora.", "erro");
    await recarregarSequenciaCard(t); // sincroniza com o estado real (troca a linha "pendente" pela de verdade)
    agendarAtualizacaoKanban();
  } finally {
    repasseLiberarAcao(t);
  }
}

// Pop-up "Repassar para <nome>?" ancorado na barra de baixo do card
// (mesmo lugar de sempre), mesmo o clique tendo vindo da seta lá em
// cima, na fileira de fotinhos.
function abrirConfirmacaoRepasseCard(t, proximo, btn) {
  const card = btn.closest(".repasse-card");
  const actionsEl = card.querySelector(".repasse-card-actions");
  const jaAberto = card.querySelector(".repasse-picker");
  fecharPickersDoCard(card);
  if (jaAberto) return;
  card.classList.add("repasse-card-popup-aberto"); // sobe acima dos cards vizinhos
  const menu = document.createElement("div");
  menu.className = "repasse-picker repasse-confirm";
  menu.innerHTML = `
    <div class="repasse-confirm-text">Repassar para <strong>${proximo.nome}</strong>?</div>
    <div class="repasse-confirm-actions">
      <button type="button" class="repasse-confirm-cancel">Cancelar</button>
      <button type="button" class="repasse-confirm-ok">Confirmar</button>
    </div>
  `;
  actionsEl.appendChild(menu);
  menu.querySelector(".repasse-confirm-cancel").addEventListener("click", ev => { ev.stopPropagation(); fecharPickersDoCard(card); });
  menu.querySelector(".repasse-confirm-ok").addEventListener("click", ev => {
    ev.stopPropagation();
    fecharPickersDoCard(card);
    confirmarEAvancarSequenciaCard(t, btn, proximo);
  });
  setTimeout(() => {
    document.addEventListener("click", function fechar(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) { fecharPickersDoCard(card); document.removeEventListener("click", fechar); }
    });
  }, 0);
}

// Pop-up de confirmação antes de entregar — texto muda conforme o
// motivo (você é o último da sequência x a tarefa nem tem sequência).
function abrirConfirmacaoEntregarCard(t, btn, temSequencia) {
  const card = btn.closest(".repasse-card");
  const actionsEl = card.querySelector(".repasse-card-actions");
  const jaAberto = card.querySelector(".repasse-picker");
  fecharPickersDoCard(card);
  if (jaAberto) return;
  card.classList.add("repasse-card-popup-aberto"); // sobe acima dos cards vizinhos
  const menu = document.createElement("div");
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
  menu.querySelector(".repasse-confirm-cancel").addEventListener("click", ev => { ev.stopPropagation(); fecharPickersDoCard(card); });
  menu.querySelector(".repasse-confirm-ok").addEventListener("click", ev => {
    ev.stopPropagation();
    fecharPickersDoCard(card);
    if (temSequencia) confirmarEAvancarSequenciaCard(t, btn, null);
    else confirmarEntregaDiretaCard(t, btn);
  });
  setTimeout(() => {
    document.addEventListener("click", function fechar(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) { fecharPickersDoCard(card); document.removeEventListener("click", fechar); }
    });
  }, 0);
}

// Trava silenciosa contra clique duplo — sem NENHUM efeito visual
// (pedido explícito: não pode parecer "carregando" de jeito nenhum,
// nem esmaecido nem travado). Só ignora um clique novo se já tiver uma
// ação em andamento pra essa mesma tarefa — protege contra mandar dois
// pedidos conflitantes ao mesmo tempo pro Runrun.it (ex: clicar
// "avançar" duas vezes rápido), sem precisar mostrar nada disso na tela.
function repasseAcaoJaEmAndamento(t) {
  if (t._repasseAcaoEmAndamento) return true;
  t._repasseAcaoEmAndamento = true;
  return false;
}
function repasseLiberarAcao(t) {
  t._repasseAcaoEmAndamento = false;
}

// Avança a sequência de verdade no Runrun.it (repassar pro próximo OU
// entregar, se você já era o último — mesmo endpoint faz as duas
// coisas, ver comentário em avancarWorkflowNoBackend). Não tira o card
// da tela sozinho: só marca ele como "recém avançado" pra continuar
// aparecendo até você sair da aba ou recarregar — pedido explícito,
// pra não perder o card de vista no meio da fila.
//
// Otimista: a fileira de fotinhos já mostra a transferência acontecendo
// NA HORA (antes de qualquer resposta do Runrun.it), sem nenhum efeito
// de "carregando" — confirma de verdade em segundo plano; se o
// Runrun.it recusar, desfaz sozinho e avisa com um toast.
async function confirmarEAvancarSequenciaCard(t, btn, proximo) {
  t = tarefaRepasseViva(t);
  if (repasseAcaoJaEmAndamento(t)) return;
  await pararCronometroAoTransferir(t); // se por acaso estava rodando, para antes de repassar
  t = tarefaRepasseViva(t);

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

  try {
    const resultado = await avancarWorkflowNoBackend(t.id);
    t = tarefaRepasseViva(t);
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
    repasseLiberarAcao(t);
  }
}

// Entrega direto (tarefa sem nenhuma sequência configurada ainda) —
// mesmo tratamento otimista do avanço acima.
async function confirmarEntregaDiretaCard(t, btn) {
  t = tarefaRepasseViva(t);
  if (repasseAcaoJaEmAndamento(t)) return;
  await pararCronometroAoTransferir(t); // se por acaso estava rodando, para antes de entregar
  t = tarefaRepasseViva(t);

  const entregueAntes = t._repasseEntregue;
  t._repasseEntregue = true;
  montarSequenciaCard(t);

  try {
    const ok = await entregarTarefaNoBackend(t.id);
    t = tarefaRepasseViva(t);
    if (ok) {
      repasseRecemAvancados.add(t.id);
      agendarAtualizacaoKanban();
    } else {
      t._repasseEntregue = entregueAntes;
      montarSequenciaCard(t);
      mostrarToast("Não consegui entregar essa tarefa agora.", "erro");
    }
  } finally {
    repasseLiberarAcao(t);
  }
}

// Enquanto o modal "Ver regra" está aberto a partir de um card de
// repasse, guarda qual tarefa é essa — pra redesenhar só aquele card
// (com a regra nova/pessoa adicionada) assim que o modal for fechado.
let repasseModalTaskAtual = null;

function renderRepasse() {
  const board = document.getElementById("repasseBoard");
  if (!board) return;

  // A aba "Aprovações" não olha pras tarefas do quadro: ela vem da
  // planilha de aprovações (o que foi mandado pro cliente). Por isso sai
  // antes de todo o filtro de tarefas abaixo.
  if (repasseViewMode === "aprovacoes") {
    renderAprovacoesRepasse(board);
    return;
  }

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
    // Modos "com sequência" / "sem sequência": cada tarefa precisa ser
    // classificada, e isso custa uma chamada ao Runrun.it por tarefa.
    // Antes a tela inteira era apagada e substituída por "Conferindo quais
    // têm sequência configurada...", só voltando quando TODAS as respostas
    // chegassem — com muitas tarefas isso era uma espera longa travando
    // tudo. Agora mostra na hora o que já dá pra mostrar e vai encaixando
    // as outras conforme as respostas chegam.
    renderRepasseIncremental(board, lista, repasseViewMode);
  }
}

// Desenha a aba com o que já se sabe e vai completando. Redesenha de forma
// "agrupada" (a cada 250ms, não a cada resposta) pra não ficar piscando a
// tela a cada tarefa que chega.
let _repasseFillTimeout = null;
function renderRepasseIncremental(board, lista, modoNoInicio) {
  const desenhar = () => {
    // Trocou de aba enquanto as respostas chegavam? Nada a fazer.
    if (repasseViewMode !== modoNoInicio) return;
    // Não redesenha por baixo de um pop-up que a pessoa acabou de abrir
    // (confirmar repasse/entrega ou o "+") — mesmo cuidado que a
    // atualização automática do quadro já toma.
    if (document.querySelector("#repasseBoard .repasse-card-popup-aberto")) return;

    const conhecidas = lista.filter(t => t._temSequencia !== undefined);
    const filtrada = conhecidas.filter(t => modoNoInicio === "com_sequencia" ? t._temSequencia : !t._temSequencia);
    const faltando = lista.length - conhecidas.length;

    if (filtrada.length === 0 && faltando > 0) {
      board.innerHTML = `<p class="workflow-seq-empty" style="padding:24px;">Conferindo quais têm sequência configurada...</p>`;
      return;
    }
    renderRepasseColunas(board, filtrada);
    // Aviso discreto de que ainda tem gente na fila de conferência — sem
    // isso, a pessoa podia achar que a lista já estava completa.
    if (faltando > 0) {
      board.insertAdjacentHTML("beforeend",
        `<p class="workflow-seq-empty" style="padding:12px 24px;">Conferindo mais ${faltando} tarefa${faltando > 1 ? "s" : ""}...</p>`);
    }
  };

  desenhar();
  lista.forEach(t => {
    if (t._temSequencia !== undefined) return; // já sabemos, não gasta chamada
    garantirClassificacaoSequencia(t).then(() => {
      clearTimeout(_repasseFillTimeout);
      _repasseFillTimeout = setTimeout(desenhar, 250);
    });
  });
}

// Aba "Prioridades": mesma ordenação por Entrega das outras abas, mas
// numa lista corrida só (sem coluna por cliente) — por isso cada card
// leva a tagzinha do cliente, pra não perder essa informação.
function renderRepasseListaFlat(board, lista) {
  lista = ordenarComPosicaoFixa(lista);

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
  lista = ordenarComPosicaoFixa(lista);

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

    abrirCalendarioColmeia({
      ancoraEl: valorBtn,
      valorInicial: valorAtualISO,
      onEscolher: novaData => salvarDataRepasseNoPill(t, campo, novaData, valorAtualISO, item, lista),
    });
  });
}

// Salva a data escolhida no calendário — otimista (já mostra a data
// nova na hora, sem deixar o campo travado esperando o Runrun.it
// responder); se o Runrun.it recusar, volta pro valor antigo sozinho
// e avisa com um toast, em vez de travar a tela toda esperando.
function salvarDataRepasseNoPill(t, campo, novaData, valorAtualISO, item, lista) {
  if (!novaData || novaData === valorAtualISO) return;

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
      // Se o login já trouxe o ID, usa ele direto e nem precisa procurar
      // na lista comparando nome (que confundiria nomes parecidos).
      let meuId = DESIGNER_ID_LOGADO;
      if (!meuId) {
        const usuarios = await buscarUsuariosRunrun();
        const eu = usuarios.find(u => nomesCorrespondem(u.nome, DESIGNER_LOGADO));
        meuId = eu ? eu.id : null;
      }
      if (!meuId) {
        btn.disabled = false;
        btn.textContent = "Ficar comigo";
        mostrarToast("Não consegui te encontrar na lista de usuários do Runrun.it.", "erro");
        return;
      }
      const ok = await reatribuirTarefaNoBackend(t.id, meuId);
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

// ============================================
// ABA "APROVAÇÕES" — o que foi mandado pro cliente e ainda não voltou
// ============================================
//
// Protótipo aprovado pelo Cláudio (2026-08-04): três colunas por
// situação, em vez de uma lista só — "o que preciso cobrar" e "o que
// voltou pedindo ajuste" ficam separados do que já está resolvido.
//
// Diferente das outras abas, essa NÃO sai das tarefas do quadro: os
// dados vêm da planilha de aprovações (listarAprovacoesPendentes,
// Aprovacao.gs), porque um link de aprovação existe independente de a
// tarefa ainda estar aberta no Runrun.it.

let aprovacoesCache = null;   // null = ainda não buscou nesta sessão

// Depois de quantos dias esperando o tempo vira alerta vermelho. É isso
// que faz a aba responder "o que eu preciso cobrar hoje" em vez de ser
// só um histórico.
const APROVACAO_DIAS_ALERTA = 3;

const APROVACAO_COLUNAS = [
  { chave: "pendente", nome: "Aguardando o cliente", dot: "esperando" },
  { chave: "ajuste", nome: "Pediu ajuste", dot: "ajuste" },
  { chave: "aprovado", nome: "Aprovadas", dot: "aprovado" },
];

async function carregarAprovacoesDoRepasse() {
  const data = await chamarBackend({ acao: "listarAprovacoesPendentes" });
  if (caiuARede(data) || !data.ok) return null;
  return data.aprovacoes || [];
}

function renderAprovacoesRepasse(board) {
  // Primeira vez na aba: mostra o esqueleto e busca. Nas próximas, já
  // desenha o que tem e atualiza por baixo (a lista muda quando o
  // cliente responde, então rebusca sempre que a aba é aberta).
  if (aprovacoesCache === null) {
    board.innerHTML = `<p class="workflow-seq-empty" style="padding:24px;">Buscando as aprovações...</p>`;
  } else {
    desenharAprovacoesRepasse(board);
  }

  carregarAprovacoesDoRepasse().then(lista => {
    // Trocou de aba enquanto buscava? Não desenha por cima da outra.
    if (repasseViewMode !== "aprovacoes") return;
    if (lista === null) {
      // Sem rede: mantém o que já estava na tela em vez de zerar.
      if (aprovacoesCache === null) {
        board.innerHTML = `<p class="workflow-seq-empty" style="padding:24px;">Não consegui buscar as aprovações agora.</p>`;
      }
      return;
    }
    aprovacoesCache = lista;
    atualizarBadgeAprovacoes();
    desenharAprovacoesRepasse(board);
  });
}

function desenharAprovacoesRepasse(board) {
  let lista = aprovacoesCache || [];

  if (repasseSearch.trim()) {
    const alvo = normalizarParaComparar(repasseSearch);
    lista = lista.filter(a =>
      normalizarParaComparar(a.cliente || "").includes(alvo) ||
      normalizarParaComparar(a.tituloTarefa || "").includes(alvo) ||
      normalizarParaComparar(a.nomeArquivo || "").includes(alvo));
  }

  if (!lista.length) {
    board.innerHTML = `<p class="workflow-seq-empty" style="padding:24px;">${repasseSearch.trim()
      ? "Nenhuma aprovação com esse termo."
      : "Nenhum link de aprovação enviado ainda. Eles aparecem aqui assim que você gerar um pelo card da tarefa."}</p>`;
    return;
  }

  board.innerHTML = APROVACAO_COLUNAS.map(col => {
    const daColuna = lista.filter(a => (a.status || "pendente") === col.chave);
    return `
      <section class="repasse-column aprov-column">
        <div class="repasse-column-header">
          <span class="repasse-column-nome"><span class="aprov-dot ${col.dot}"></span>${col.nome}</span>
          <span class="repasse-column-count">${daColuna.length}</span>
        </div>
        <div class="repasse-column-body">
          ${daColuna.length
            ? daColuna.map(a => cardDeAprovacaoHTML(a)).join("")
            : `<p class="aprov-vazio">${textoVazioDaColuna(col.chave)}</p>`}
        </div>
      </section>
    `;
  }).join("");

  wireCardsDeAprovacao(board);
}

function textoVazioDaColuna(chave) {
  if (chave === "pendente") return "Nada esperando resposta agora.";
  if (chave === "ajuste") return "Quando o cliente pede ajuste, a peça cai aqui — e o comentário dele já entra na tarefa sozinho.";
  return "Nenhuma aprovada nos últimos 7 dias.";
}

/** "há 2 dias" / "hoje, 09:40" — e se passou do limite, vira alerta. */
function tempoDeEsperaDaAprovacao(a) {
  const quando = Number(a.respondidoEm || a.criadoEm) || 0;
  if (!quando) return { texto: "", alerta: false };

  const dias = Math.floor((Date.now() - quando) / 86400000);
  const hora = new Date(quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if ((a.status || "pendente") === "pendente") {
    if (dias === 0) return { texto: `⏱ enviado hoje, ${hora}`, alerta: false };
    if (dias === 1) return { texto: "⏱ esperando desde ontem", alerta: false };
    return { texto: `⏱ esperando há ${dias} dias`, alerta: dias >= APROVACAO_DIAS_ALERTA };
  }

  const prefixo = a.status === "aprovado" ? "✅ aprovado" : "respondeu";
  if (dias === 0) return { texto: `${prefixo} hoje, ${hora}`, alerta: false };
  if (dias === 1) return { texto: `${prefixo} ontem`, alerta: false };
  return { texto: `${prefixo} há ${dias} dias`, alerta: false };
}

function cardDeAprovacaoHTML(a) {
  const tempo = tempoDeEsperaDaAprovacao(a);
  const status = a.status || "pendente";
  const nomes = String(a.nomeArquivo || "").split("|").filter(Boolean);
  const legendaPecas = a.quantasPecas > 1
    ? `${a.quantasPecas} peças · ${nomes.join(", ")}`
    : (nomes[0] || "");

  return `
    <article class="repasse-card aprov-card ${tempo.alerta ? "urgente" : ""}" data-codigo="${escaparHTML(a.codigo)}" data-task-id="${escaparHTML(String(a.taskId || ""))}">
      <div class="repasse-card-top">
        <span class="repasse-client-pill">${escaparHTML(a.cliente || "Sem cliente")}</span>
        <span class="aprov-thumb ${a.ehVideo ? "video" : "img"}">${a.ehVideo ? "🎬" : "🖼️"}</span>
      </div>
      <div class="repasse-card-title">${escaparHTML(a.tituloTarefa || "Peça pra aprovação")}</div>
      ${legendaPecas ? `<div class="aprov-peca">${escaparHTML(legendaPecas)}</div>` : ""}
      <div class="repasse-card-tempo ${tempo.alerta ? "aprov-alerta" : ""}">${tempo.texto}</div>
      ${a.avisoPendente ? `<div class="aprov-preso">⚠️ O cliente já respondeu, mas o Runrun.it estava fora do ar e o aviso ainda não entrou na tarefa. O Colmeia reenvia sozinho assim que eles voltarem.</div>` : ""}
      ${status === "aprovado" && a.quemAprovou ? `<div class="aprov-quem">✓ Aprovado por <b>${escaparHTML(a.quemAprovou)}</b></div>` : ""}
      ${a.respostaTexto ? `<div class="aprov-resposta">“${escaparHTML(a.respostaTexto)}”</div>` : ""}
      ${a.quantosPins ? `<span class="aprov-pins">📍 ${a.quantosPins} ponto${a.quantosPins > 1 ? "s" : ""} marcado${a.quantosPins > 1 ? "s" : ""}</span>` : ""}
      <div class="repasse-card-actions">
        ${status === "pendente"
          ? `<button type="button" class="repasse-btn ${tempo.alerta ? "repasse-btn-ficar" : ""}" data-acao="whats">💬 Cobrar no WhatsApp</button>
             <button type="button" class="repasse-btn" data-acao="copiar">🔗 copiar link</button>`
          : status === "ajuste"
            ? `<button type="button" class="repasse-btn repasse-btn-ficar" data-acao="abrir">Abrir tarefa</button>
               <button type="button" class="repasse-btn" data-acao="copiar">🔗 novo link</button>`
            : `<button type="button" class="repasse-btn" data-acao="abrir">Abrir tarefa</button>`}
        <button type="button" class="repasse-btn repasse-btn-icon repasse-btn-excluir" data-acao="excluir" title="Excluir este link de aprovação">🗑️</button>
      </div>
    </article>
  `;
}

function urlDeAprovacao(codigo) {
  // Mesma técnica do resto do app: a base vem do endereço em que o
  // Colmeia está publicado agora (ver ROTA_BASE, js/roteador-url.js).
  return new URL(".", location.href).href + "aprovar.html?codigo=" + codigo;
}

function wireCardsDeAprovacao(board) {
  board.querySelectorAll(".aprov-card").forEach(card => {
    const codigo = card.dataset.codigo;
    const taskId = card.dataset.taskId;

    card.querySelectorAll("[data-acao]").forEach(btn => {
      btn.addEventListener("click", async ev => {
        ev.stopPropagation();
        const acao = btn.dataset.acao;

        if (acao === "abrir") {
          if (taskId) abrirTarefaPorId(Number(taskId));
          return;
        }

        if (acao === "copiar") {
          const url = urlDeAprovacao(codigo);
          try {
            await navigator.clipboard.writeText(url);
            mostrarToast("Link de aprovação copiado.", "sucesso");
          } catch (err) {
            mostrarToast(`Link (não consegui copiar sozinho): ${url}`);
          }
          return;
        }

        if (acao === "whats") {
          // Sem número no link (wa.me/?text=...), igual já é feito na
          // página de aprovação: abre o seletor de conversa do próprio
          // WhatsApp pra você escolher o grupo do cliente, em vez de o
          // Colmeia decidir um número.
          const titulo = card.querySelector(".repasse-card-title")?.textContent || "a peça";
          const texto = `Oi! Passando pra saber se conseguiu dar uma olhada em "${titulo}".\n\n${urlDeAprovacao(codigo)}`;
          window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
          return;
        }

        if (acao === "excluir") {
          // Pedido do Cláudio (2026-08-06): links de teste ficavam
          // acumulados sem jeito de tirar — este card é reaproveitado tanto
          // na Fila de repasse (Colmeia) quanto na Central do Atendimento,
          // então o botão vale nos dois lugares de uma vez.
          if (!confirm("Excluir este link de aprovação? Não dá pra desfazer.")) return;
          btn.disabled = true;
          const data = await chamarBackend({ acao: "excluirLinkDeAprovacao", codigo });
          if (!data.ok) {
            mostrarToast(data.error || "Não consegui excluir agora.", "erro");
            btn.disabled = false;
            return;
          }
          mostrarToast("Link excluído.", "sucesso");
          if (Array.isArray(aprovacoesCache)) aprovacoesCache = aprovacoesCache.filter(a => a.codigo !== codigo);
          if (typeof centralAprovacoesCache !== "undefined" && Array.isArray(centralAprovacoesCache)) {
            centralAprovacoesCache = centralAprovacoesCache.filter(a => a.codigo !== codigo);
          }
          card.remove();
          atualizarBadgeAprovacoes();
          if (typeof centralAtualizarBadges === "function") centralAtualizarBadges();
        }
      });
    });
  });
}

/** O contador vermelho na aba: só o que precisa de você (esperando + ajuste). */
function atualizarBadgeAprovacoes() {
  const badge = document.getElementById("repasseAprovBadge");
  if (!badge) return;
  const precisamDeMim = (aprovacoesCache || []).filter(a => (a.status || "pendente") !== "aprovado").length;
  badge.textContent = precisamDeMim > 99 ? "99+" : String(precisamDeMim);
  badge.hidden = precisamDeMim === 0;
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

  const novaTarefaBtn = document.getElementById("novaTarefaBtn");
  if (novaTarefaBtn) novaTarefaBtn.hidden = !(page === "kanban" && PAPEL_LOGADO === "coordenador");

  if (page === "clientes") buildClientsPage();
  if (page === "atendimento") buildAtendimentoPage();
  if (page === "tipos") buildTiposPage();
  if (page === "repasse") buildRepassePage();
  if (page === "runrun") buildRunrunCompletoPage();
  // A aprovação do atendimento ainda é um esqueleto (ver
  // js/pagina-aprovacao.js) — a chamada já fica ligada aqui pra quem for
  // implementar só precisar preencher a função por dentro.
  if (page === "aprovacao") buildAprovacaoPage();
  // A página de horas tem um cronômetro que anda de 1 em 1 segundo — ele
  // precisa parar quando a pessoa sai dela, senão fica rodando à toa pelo
  // resto da sessão (ver iniciarRelogioDaPaginaHoras, js/pagina-horas.js).
  if (page === "horas") abrirPaginaHoras();
  else if (typeof fecharPaginaHoras === "function") fecharPaginaHoras();

  // A aba Bee abre o painel de verdade dela (o mesmo #beePainel da
  // bolinha flutuante) já aberto, ocupando o lugar do chat ao lado do
  // feed — e fecha sozinho ao sair, senão ficaria aberto em cima de
  // qualquer outra página (ver js/pagina-bee.js).
  if (page === "bee" && typeof abrirPaginaBee === "function") abrirPaginaBee();
  else if (typeof fecharPaginaBee === "function") fecharPaginaBee();

  // Deixa o endereço lá em cima do navegador combinando com a página
  // (ver js/roteador-url.js) — permite link direto, F5 sem perder o
  // lugar, e o botão Voltar funcionando.
  if (typeof roteadorAoMostrarPagina === "function") roteadorAoMostrarPagina(page);
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
  if (!document.getElementById("page-runrun").hidden) buildRunrunCompletoPage();
  // Busca profunda (dentro de comentários/descrição) mora em
  // notificacoes-avisos.js, carregado DEPOIS deste arquivo.
  if (typeof agendarBuscaProfunda === "function") agendarBuscaProfunda(searchQuery, tasks);
});

document.getElementById("verTodasBtn").addEventListener("click", () => {
  searchQuery = "";
  document.getElementById("searchInput").value = "";
  render();
  if (!document.getElementById("page-runrun").hidden) buildRunrunCompletoPage();
});

document.getElementById("nowPlaying").addEventListener("click", () => {
  // Filtra por quem está logado, igual updateNowPlaying já faz pro TEXTO da
  // pílula — sem isso, no login do coordenador vendo "Todos juntos", o
  // clique podia abrir a tarefa rodando de OUTRA pessoa (a primeira do
  // array com running=true), não a que a pílula estava mostrando.
  const idx = tasks.findIndex(t => t.running && ehMinhaTarefa(t));
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
