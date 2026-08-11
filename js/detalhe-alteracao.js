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
          <span class="alteracao-resumo-titulo"><span class="bee-selo-mini" title="Resumo da Bee">${beeIcon}</span>O que foi pedido pra mudar</span>
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

// ===========================================================================
// O PEDIDO DE AJUSTE DENTRO DO CARD, com os pontos marcados na peça
// ===========================================================================
//
// Pedido do Cláudio (2026-08-04): "se tiver uma solução para a alteração
// aparecer dentro do card seria perfeito". O problema real: o atendimento
// marca pontos com o mouse na tela de conferência, mas o pedido vai parar no
// Runrun.it, que não sabe desenhar marcação em imagem — do outro lado sobrava
// só "(alto à esquerda) trocar o logo", e o designer ficava adivinhando qual
// elemento era.
//
// São DOIS caminhos pro mesmo conteúdo, e os dois precisam existir:
//   - aqui, no topo do card, pra quem já está no Colmeia;
//   - ajuste.html, o link que vai no texto do pedido, pra quem abriu a
//     tarefa direto no Runrun.it (que é onde o time também trabalha).

/**
 * Desenha, no topo da descrição do card, o que o atendimento pediu pra mudar
 * — com os pontos em cima da peça.
 *
 * Fica FORA de aba nenhuma de propósito: numa tarefa de alteração isso não é
 * contexto de apoio, é a instrução principal. Escondido atrás de uma aba,
 * seria exatamente a informação que a pessoa não veria antes de começar a
 * trabalhar.
 *
 * Some sozinho em qualquer tarefa que não veio de uma devolução (a busca
 * devolve `devolucao: null` e o bloco continua escondido), então dá pra
 * chamar sem checar nada antes.
 */
async function renderDevolucaoNoCard(task) {
  const bloco = document.getElementById("devolucaoBloco");
  if (!bloco || !task.id) return;
  const taskId = task.id;

  // Já buscado nesta tarefa? Não pergunta de novo — o pedido de ajuste não
  // muda depois de feito, e openDetail pode rodar várias vezes na mesma
  // tarefa (o quadro se redesenha sozinho em segundo plano).
  if (task._devolucaoHTML !== undefined) {
    bloco.innerHTML = task._devolucaoHTML;
    bloco.hidden = !task._devolucaoHTML;
    return;
  }

  const data = await chamarBackend({ acao: "buscarDevolucaoDaTarefa", taskId });

  // Trocou de tarefa enquanto carregava? Compara por id, nunca por
  // referência (bug recorrente do CLAUDE.md) — e busca o elemento de novo,
  // já que o pop-up pode ter sido redesenhado nesse meio-tempo.
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return;
  const blocoAgora = document.getElementById("devolucaoBloco");
  if (!blocoAgora) return;

  // Falha de rede não vira "não tem pedido nenhum": deixa o bloco escondido
  // sem guardar nada, pra tentar de novo na próxima abertura.
  if (!data || !data.ok || caiuARede(data)) return;

  const d = data.devolucao;
  if (!d) {
    task._devolucaoHTML = "";
    blocoAgora.hidden = true;
    return;
  }

  // Um pedido pode cobrir VÁRIAS peças do mesmo lote (ver devolverParaDesigner,
  // AprovacaoInterna.gs) — cada uma com os próprios pontos marcados. Sem
  // `pecas` (devolução antiga, gravada antes disso existir), cai numa lista
  // de uma peça só a partir dos campos singulares de compat.
  const pecas = Array.isArray(d.pecas) && d.pecas.length
    ? d.pecas
    : [{ nomePeca: d.nomePeca, fileId: d.fileId, nomeArquivo: d.nomeArquivo, mimeType: d.mimeType, pins: d.pins || [], ehVideo: d.ehVideo }];

  const html = `
    <div class="devolucao-topo">
      <span class="devolucao-selo">Pedido de ajuste</span>
      <span class="devolucao-quando">${pecas.length > 1 ? pecas.length + " peças" : escaparHTML(pecas[0].nomePeca || "")}</span>
    </div>
    ${d.motivo ? `<p class="devolucao-motivo">${escaparHTML(d.motivo)}</p>` : ""}
    ${pecas.map((p, i) => {
      const pins = p.pins || [];
      if (!pins.length) return "";
      return `
        ${pecas.length > 1 ? `<p class="devolucao-peca-nome">${escaparHTML(p.nomePeca || "")}</p>` : ""}
        <div class="devolucao-palco" id="devolucaoPalco-${i}" data-file-id="${escaparHTML(p.fileId || "")}" data-video="${p.ehVideo ? "1" : ""}">
          <div class="devolucao-carregando">Carregando a peça com os pontos...</div>
        </div>
        <div class="devolucao-lista">
          ${pins.map((pt, j) => `
            <div class="devolucao-linha">
              <span class="devolucao-num">${j + 1}</span>
              <span>${escaparHTML(pt.texto || "(sem descrição)")}</span>
            </div>`).join("")}
        </div>
      `;
    }).join("")}
  `;

  task._devolucaoHTML = html;
  blocoAgora.innerHTML = html;
  blocoAgora.hidden = false;

  pecas.forEach((p, i) => {
    if ((p.pins || []).length) carregarPecaDaDevolucao(p, p.pins, i);
  });
}

/**
 * Põe a peça no bloco e desenha os pontos em cima dela.
 *
 * A imagem vem pelo backend (buscarImagemCheiaDrive), nunca apontando a <img>
 * direto pro Drive: nem todo arquivo tem "qualquer pessoa com o link" ligado.
 *
 * Em VÍDEO os pontos não são desenhados — o quadro muda o tempo todo, e uma
 * marcação fixa apontaria pro lugar errado em quase todos eles. Fica o player
 * e a lista escrita, que continua valendo.
 */
async function carregarPecaDaDevolucao(d, pins, indice) {
  const id = "devolucaoPalco" + (indice !== undefined ? "-" + indice : "");
  const palco = document.getElementById(id);
  if (!palco || !d.fileId) return;

  if (d.ehVideo) {
    palco.innerHTML = `<iframe class="devolucao-video" src="https://drive.google.com/file/d/${encodeURIComponent(d.fileId)}/preview" allow="autoplay" allowfullscreen title="${escaparHTML(d.nomeArquivo || "")}"></iframe>`;
    return;
  }

  const img = await chamarBackend({ acao: "buscarImagemCheiaDrive", fileId: d.fileId });
  const palcoAgora = document.getElementById(id);
  if (!palcoAgora) return;

  if (!img || !img.ok || (!img.url && !img.base64)) {
    palcoAgora.innerHTML = `<p class="devolucao-carregando">Não consegui carregar a peça — ela pode ter sido movida ou renomeada no Drive. Os pontos estão descritos abaixo.</p>`;
    return;
  }

  // x/y estão em PORCENTAGEM da imagem (nunca em pixel) — é o que mantém
  // cada ponto no lugar certo em qualquer largura de tela.
  palcoAgora.innerHTML = `
    <img class="devolucao-img" src="${img.url || `data:${img.mimeType || d.mimeType};base64,${img.base64}`}" alt="${escaparHTML(d.nomeArquivo || "")}">
    ${pins.map((p, i) => `<span class="devolucao-ponto" style="left:${Number(p.x)}%;top:${Number(p.y)}%">${i + 1}</span>`).join("")}
  `;
}
