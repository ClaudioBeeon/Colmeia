// Subtarefas de ALTERAÇÃO ("Alteração 01"): tudo que dá contexto a elas —
// reconhecer que uma tarefa é uma alteração, achar a peça original entre as
// subtarefas irmãs do mesmo card mãe, o resumo por IA do que o cliente
// pediu pra mudar, e a aba "Tarefa original".
//
// Faz parte do antigo js/detalhe-modal.js, que passou de 2.000 linhas e foi
// dividido em três. Carregado por último dos três — ver a ordem das tags
// <script> no index.html, que é obrigatória (regra de ouro do CLAUDE.md).

/**
 * Mostra, no topo da aba "Tarefa original", a listinha do que o cliente
 * pediu pra mudar — montada pela IA a partir da descrição da alteração e
 * dos comentários recentes do card mãe e da tarefa original (ver
 * resumirAlteracao no Código.gs).
 *
 * É a versão de verdade do que a antiga aba "Alteração 01" fingia ser: o
 * texto de lá era fixo e inventado. Aqui, quando o pedido não está escrito
 * em lugar nenhum, o Colmeia DIZ isso em vez de inventar uma mudança.
 *
 * O resultado fica guardado no objeto da tarefa (e em cache na planilha,
 * no backend), então voltar pra aba não gera outro pedido à IA.
 */
async function carregarResumoDaAlteracao(task, idOriginal) {
  const el = document.getElementById("alteracaoResumo");
  if (!el || !task.id) return;
  const taskId = task.id;

  if (task._resumoAlteracaoHTML !== undefined) {
    el.innerHTML = task._resumoAlteracaoHTML;
    return;
  }

  el.innerHTML = `<p class="workflow-seq-empty">Vendo o que foi pedido...</p>`;
  const data = await chamarBackend({ acao: "resumirAlteracao", taskId, idOriginal });
  // Trocou de tarefa/aba enquanto carregava? Compara por id, nunca por
  // referência — e busca o elemento de novo, já que o pop-up pode ter sido
  // redesenhado nesse meio-tempo.
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return;
  const elAgora = document.getElementById("alteracaoResumo");
  if (!elAgora) return;

  let html = "";
  if (!data.ok) {
    html = `<p class="workflow-seq-empty">${escaparHTML(data.error || "Não consegui resumir o que mudou.")}</p>`;
  } else if (data.semMaterial) {
    html = `<div class="alteracao-resumo-box vazio">Não achei nada escrito sobre o que mudar — nem na descrição dessa alteração, nem nos comentários. Vale perguntar pro atendimento.</div>`;
  } else {
    const r = data.resumo || {};
    const mudancas = r.mudancas || [];
    html = `
      <div class="alteracao-resumo-box">
        <div class="alteracao-resumo-head">
          <span class="alteracao-resumo-titulo">O que foi pedido pra mudar</span>
          ${r.quemPediu ? `<span class="alteracao-resumo-quem">pedido de ${escaparHTML(r.quemPediu)}</span>` : ""}
        </div>
        ${mudancas.length
          ? `<ul class="alteracao-resumo-lista">${mudancas.map(m => `<li>${escaparHTML(m)}</li>`).join("")}</ul>`
          : ""}
        ${r.observacao ? `<p class="alteracao-resumo-obs">${escaparHTML(r.observacao)}</p>` : ""}
        <p class="alteracao-resumo-rodape">Resumo automático — confira na Linha do tempo se ficou faltando algo.</p>
      </div>
    `;
  }
  task._resumoAlteracaoHTML = html;
  elAgora.innerHTML = html;
}

/**
 * Preenche a aba "Tarefa original" de uma subtarefa de alteração: mostra
 * QUAL peça essa alteração está pedindo pra mudar (nome, quem fez, em que
 * etapa está, se já foi entregue) e a descrição/briefing original dela,
 * pra dar o contexto que o título "Alteração 01" não dá.
 *
 * Os dados do card mãe e das irmãs já vêm pré-carregados em segundo plano
 * quando a subtarefa abre (precarregarCardMaeEmBackground); aqui só falta
 * buscar a descrição da tarefa original, que é um endpoint separado.
 */
async function carregarTarefaOriginalDaAlteracao(task) {
  const tituloEl = document.getElementById("originalTitulo");
  const metaEl = document.getElementById("originalMeta");
  const textoEl = document.getElementById("originalTextReal");
  if (!tituloEl || !textoEl) return;
  const taskId = task.id;

  // O pré-carregamento pode ainda não ter terminado — nesse caso espera
  // ele antes de dizer que não achou nada.
  if (!cardMaeCache.has(taskId)) {
    tituloEl.textContent = "Procurando a tarefa original...";
    if (metaEl) metaEl.innerHTML = "";
    textoEl.innerHTML = "";
    await precarregarCardMaeEmBackground(taskId);
    // Trocou de tarefa (ou de aba) enquanto isso? Compara por id, nunca
    // por referência — mesmo cuidado do resto do app.
    if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId) || !originalAberta) return;
  }

  const original = acharTarefaOriginalDaAlteracao(task);
  // O resumo do que mudou não depende de achar a tarefa original (o pedido
  // pode estar só nos comentários do card mãe), então dispara sempre.
  carregarResumoDaAlteracao(task, original ? original.id : null);
  if (!original) {
    tituloEl.textContent = "Não achei a tarefa original";
    if (metaEl) metaEl.innerHTML = "";
    textoEl.innerHTML = "Essa alteração é a única subtarefa do card mãe, ou as outras também são alterações. Dá uma olhada em \"Descrição card mãe\" pra ter o contexto.";
    return;
  }

  tituloEl.textContent = original.title;
  if (metaEl) {
    metaEl.innerHTML = `
      <span class="original-meta-item">${avatarHTML(original.responsavel, "avatar-xs")} ${escaparHTML(original.responsavel || "Sem responsável")}</span>
      ${original.etapa ? `<span class="original-meta-item">${escaparHTML(original.etapa)}</span>` : ""}
      ${original.fechada ? `<span class="original-meta-item entregue">Entregue ✓</span>` : ""}
      <button type="button" class="ai-briefing-toggle" id="abrirOriginalBtn">Abrir essa tarefa</button>
    `;
    const abrirBtn = document.getElementById("abrirOriginalBtn");
    if (abrirBtn) abrirBtn.addEventListener("click", () => abrirTarefaPorId(Number(original.id)));
  }

  // Guarda a descrição no próprio item pra não rebuscar a cada vez que a
  // pessoa vai e volta nessa aba.
  if (original.descricao === undefined) {
    textoEl.innerHTML = "Carregando o briefing da tarefa original...";
    const descricao = await buscarDescricaoDoBackend(original.id);
    if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId) || !originalAberta) return;
    if (descricao === null) {
      // Não chegou (ver buscarDescricaoDoBackend). Não guarda nada, pra a
      // aba tentar de novo na próxima abertura em vez de cravar "não tem
      // descrição" numa tarefa que provavelmente tem.
      textoEl.innerHTML = "Não consegui carregar o briefing da tarefa original agora.";
      return;
    }
    original.descricao = descricao;
  }
  textoEl.innerHTML = original.descricao
    ? formatarDescricaoRunrun(original.descricao)
    : "Essa tarefa não tem descrição cadastrada.";
}

/**
 * ===== Subtarefas de "Alteração" =====
 *
 * Como funciona o fluxo na Beeon: cada card mãe tem subtarefas, uma pra
 * cada responsável (redação, design...). Quando o cliente pede mudança,
 * chega uma subtarefa NOVA no mesmo card mãe, chamada "Alteração 01" (ou
 * só "Alteração"). O problema era que ela chegava sem contexto nenhum:
 * pelo título não dá pra saber de qual peça ela fala nem o que foi pedido.
 *
 * O Colmeia já tem tudo o que precisa pra resolver isso — quando uma
 * subtarefa abre, precarregarCardMaeEmBackground já traz o card mãe E a
 * lista de subtarefas irmãs. É daí que sai a "tarefa original".
 */
function ehTarefaDeAlteracao(task) {
  if (!task || !task.parentTaskId) return false;
  return normalizarParaComparar(task.title).includes("alteracao");
}

/**
 * Acha, entre as subtarefas irmãs (mesmo card mãe), qual é a tarefa
 * "original" — a peça que foi trabalhada e que essa alteração está
 * pedindo pra mudar. Descarta a própria alteração aberta e as outras
 * alterações; entre as que sobram, a primeira é a mais antiga (a ordem
 * vem do próprio Runrun.it, por criação).
 *
 * Devolve null quando não dá pra saber (card mãe ainda não carregado, ou
 * a alteração é a única subtarefa) — nesse caso a aba avisa isso em vez
 * de mostrar a tarefa errada.
 */
function acharTarefaOriginalDaAlteracao(task) {
  const info = cardMaeCache.get(task.id);
  if (!info || !info.ok || !info.temPai) return null;
  const irmas = (info.subtarefas || []).filter(s =>
    String(s.id) !== String(task.id) && !normalizarParaComparar(s.title).includes("alteracao")
  );
  return irmas.length ? irmas[0] : null;
}

/**
 * Versão INSTANTÂNEA e sem custo do acima, pra usar no card do quadro:
 * procura a peça original entre as tarefas que o Colmeia já carregou.
 * Duas subtarefas do mesmo card mãe têm o mesmo parentTaskId — então dá
 * pra achar a irmã sem nenhuma ida ao Runrun.it.
 *
 * Devolve só o NOME (string) ou null. Null acontece quando a peça original
 * já foi entregue (tarefa fechada não vem na lista do quadro) — nesse caso
 * o card não mostra nada, e a aba "Tarefa original" dentro do pop-up
 * continua achando ela normalmente, porque lá o card mãe é buscado.
 */
function nomeDaPecaOriginalRapido(task) {
  if (!task.parentTaskId) return null;
  // 1) De graça: entre as tarefas já carregadas (irmãs ainda em aberto).
  const irma = tasksTodas.find(t =>
    String(t.id) !== String(task.id)
    && t.parentTaskId && String(t.parentTaskId) === String(task.parentTaskId)
    && !normalizarParaComparar(t.title).includes("alteracao")
  );
  if (irma) return irma.title;
  // 2) Se essa tarefa já foi aberta alguma vez, o card mãe dela está em
  // cache e traz as irmãs (inclusive as já entregues).
  const original = acharTarefaOriginalDaAlteracao(task);
  return original ? original.title : null;
}
