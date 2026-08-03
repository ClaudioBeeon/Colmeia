function openDetail(idx, entradaAnimacao) {
  detailIdx = Number(idx);
  childrenOpen = false;
  descMaeAberta = false;
  // Subtarefa de ALTERAÇÃO abre direto no contexto, não na Descrição (que
  // nessas subtarefas costuma ser genérica ou vazia): a aba "Tarefa
  // original" já vem aberta do lado da descrição, e o chat já abre na
  // "Linha do tempo" (são painéis diferentes, então dá pra fazer as duas
  // coisas ao mesmo tempo). Qualquer outra tarefa segue abrindo como antes.
  const abrirNoContextoDeAlteracao = ehTarefaDeAlteracao(tasks[Number(idx)]);
  originalAberta = abrirNoContextoDeAlteracao;
  fecharChatPanel();
  renderDetail();
  const panel = document.getElementById("taskDetail");
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  const cardEl = document.querySelector(`.task-card[data-idx="${idx}"]`);
  if (cardEl) cardEl.classList.add("selected");
  panel.classList.add("visible");
  requestAnimationFrame(() => panel.classList.add("open"));
  // Esconde a bolinha da Bee solta enquanto o card está aberto: ela fica
  // no mesmo canto do botão de comentários da tarefa, e as duas juntas
  // viravam um monte de bolinha empilhada. Dentro do card, a Bee que
  // importa é a que lê a tarefa (o ícone dela no painel de comentários).
  document.body.classList.add("card-aberto");
  if (entradaAnimacao) {
    const inner = panel.querySelector(".detail-inner");
    if (inner) {
      inner.classList.add(entradaAnimacao);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => inner.classList.remove(entradaAnimacao));
      });
    }
  }
  // UM pedido só traz comentários, descrição, sequência, anexos,
  // cronômetro, "é card mãe?" e a pasta do Drive (ver carregarTudoDaTarefa
  // em js/chat-comentarios.js). Antes eram de 8 a 12 pedidos separados, e
  // era por isso que o card aparecia em pedaços.
  carregarTudoDaTarefa(tasks[detailIdx]);
  if (tasks[detailIdx].parentTaskId) precarregarCardMaeEmBackground(tasks[detailIdx].id);
  renderNotificacoesUpload(tasks[detailIdx]);
  iniciarChecagemUploadEmSegundoPlano(tasks[detailIdx]);
  if (abrirNoContextoDeAlteracao) {
    // A aba de contexto já foi carregada pelo renderDetail() de cima
    // (originalAberta já estava true antes dele rodar) — só falta deixar
    // o chat na Linha do tempo.
    abrirChatPanel(tasks[detailIdx]);
    abrirThreadLinhaDoTempo(tasks[detailIdx]);
  }
  // Só pede o briefing pra IA quando ainda não temos ele — antes pedia
  // sempre, mesmo com o resultado pronto e já na tela, gastando uma ida ao
  // servidor (+ leitura da descrição no Runrun.it) a cada abertura do card.
  if (tasks[detailIdx].id && tasks[detailIdx].briefingHTML === undefined) gerarBriefingComIA(tasks[detailIdx]);
  // Se já tinha sido gerado antes (task.briefingHTML cacheado), o
  // template já usa o cache direto — só precisa religar os botões de
  // copiar e os toggles de "ver versão original", já que o innerHTML
  // foi todo recriado do zero.
  else if (tasks[detailIdx].briefingHTML !== undefined) {
    const resultEl = document.getElementById("briefingResult");
    if (resultEl) {
      wireBriefingCopyButtons(resultEl);
      wireBriefingVersaoOriginalToggles(resultEl);
    }
  }

  // Deixa o endereço lá em cima do navegador virar o ID desta tarefa
  // (ver js/roteador-url.js) — permite mandar o link pra alguém, F5 sem
  // perder o lugar, e o botão Voltar funcionando.
  if (typeof roteadorAoAbrirTarefa === "function") roteadorAoAbrirTarefa(tasks[detailIdx]);
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
    if (task.parentTaskId || task.isMotherCard) {
      // Subtarefa OU card mãe sem "Sequência de responsáveis"
      // configurada — o botão de concluir/entregar é obrigatório aqui,
      // senão não tem outro jeito de marcar como entregue.
      return `
        <div class="workflow-seq-dots">${responsavelAtualHTML}</div>
        <button type="button" class="nav-arrow nav-deliver" id="navDeliverBtn" title="Concluir e entregar essa tarefa">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      `;
    }
    return `<div class="workflow-seq-dots">${responsavelAtualHTML}</div>`;
  }
  const atualIdx = task.sequencia.findIndex(s => s.atual);
  const semNinguemNaFrente = atualIdx !== -1 && task.sequencia[atualIdx].ultimo;
  // Mesma janela de 3 usada na fila de repasse (ver renderRepasseSeqHTML,
  // js/pagina-repasse.js) — regra longa cortava os últimos pontinhos pra
  // fora do espaço fixo do cabeçalho do card. Mostra sempre só quem veio
  // antes (pra dar pra voltar), o atual (centralizado) e o próximo/último.
  const idxCentro = atualIdx !== -1 ? atualIdx : 0;
  const janela = [idxCentro - 1, idxCentro, idxCentro + 1].filter(i => i >= 0 && i < task.sequencia.length);
  return `
    <button type="button" class="nav-arrow" id="navPrevArrow" title="Desfazer (voltar etapa)">
      <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="workflow-seq-dots">
      ${janela.map((idx, pos) => `
        ${pos > 0 ? `<div class="wf-line ${task.sequencia[janela[pos - 1]].concluido ? "done" : ""}"></div>` : ""}
        <div class="wf-dot ${task.sequencia[idx].atual ? "current" : ""} ${task.sequencia[idx].concluido ? "completed" : ""}" title="${task.sequencia[idx].nome}">
          ${avatarHTML(task.sequencia[idx].nome, "avatar-xs", task.sequencia[idx].foto)}
          ${task.sequencia[idx].concluido ? `<span class="wf-check">✓</span>` : ""}
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
  const taskId = task.id;
  const resultado = await buscarSequenciaDoBackend(taskId);
  // Falhou a busca? NÃO grava lista vazia — isso faria a tarefa parecer
  // "sem sequência" e o botão de concluir/entregar aparecer no lugar das
  // setas (risco de entregar por engano). Mantém o que já tínhamos: se
  // nunca carregou, segue mostrando "Carregando sequência..."; se já
  // tinha carregado antes, segue com a última versão boa.
  if (resultado.erro) return;
  task.sequencia = resultado.sequencia;
  task.workflowId = resultado.workflowId;
  if (!tasks[detailIdx] || tasks[detailIdx].id !== taskId) return; // usuário já trocou de tarefa
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
  // Escopado dentro de #workflowSeqGroup (não document.getElementById
  // solto) — o mesmo id (navPrevArrow/navNextArrow/navAddPersonBtn/
  // navDeliverBtn) também existe dentro do pill do card mãe quando ele
  // está mostrando a própria regra ao mesmo tempo (ver comentário grande
  // em wireFacePillRegraCardMae mais abaixo nesse arquivo). Sem escopar,
  // document.getElementById pegava o botão ERRADO (o do card mãe) e
  // ligava dois cliques ao mesmo tempo no mesmo botão — foi isso que
  // fazia clicar em "+" abrir o pop-up rápido do card mãe E o modal
  // "Ver regra" da tarefa aberta, juntos.
  const grupo = document.getElementById("workflowSeqGroup");
  const prevBtn = grupo ? grupo.querySelector("#navPrevArrow") : null;
  const nextBtn = grupo ? grupo.querySelector("#navNextArrow") : null;
  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      prevBtn.disabled = true;
      await pararCronometroAoTransferir(task);
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
      await pararCronometroAoTransferir(task);

      // Guarda quem estava com a tarefa ANTES de mexer em qualquer coisa
      // (nem a animação otimista logo abaixo ainda) — usado depois pra
      // conferir com o estado real do Runrun.it se a transferência
      // aconteceu de verdade, mesmo que a chamada abaixo devolva erro
      // (ex: Apps Script sobrecarregado/lento nesse instante).
      const atualIdxAntesDeTudo = task.sequencia && task.sequencia.length ? task.sequencia.findIndex(s => s.atual) : -1;
      const nomeAtualAntes = atualIdxAntesDeTudo !== -1 ? task.sequencia[atualIdxAntesDeTudo].nome : null;

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

      const resultadoAvanco = await avancarWorkflowNoBackend(task.id);
      if (resultadoAvanco.novoResponsavel) {
        task.assignee = resultadoAvanco.novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
        agendarAtualizacaoKanban();
      }
      if (!resultadoAvanco.ok) mostrarToast("Não consegui avançar a sequência dessa tarefa agora.", "erro");
      // Sincroniza com o Runrun.it de verdade (confirma ou desfaz a
      // animação otimista de cima, se o Runrun.it recusou) ANTES de
      // decidir se mostra o erro — só reclama se de fato não avançou.
      await carregarSequencia(task);
      const atualIdxDepois = task.sequencia && task.sequencia.length ? task.sequencia.findIndex(s => s.atual) : -1;
      const nomeAtualDepois = atualIdxDepois !== -1 ? task.sequencia[atualIdxDepois].nome : null;
      const realmenteNaoAvancou = nomeAtualDepois === nomeAtualAntes;
      if (!resultadoAvanco.ok && realmenteNaoAvancou) mostrarToast("Não consegui avançar a sequência dessa tarefa agora.", "erro");
    });
  }
  const addPersonBtn = grupo ? grupo.querySelector("#navAddPersonBtn") : null;
  if (addPersonBtn) {
    addPersonBtn.addEventListener("click", () => abrirModalRegra(task));
  }
  const deliverBtn = grupo ? grupo.querySelector("#navDeliverBtn") : null;
  if (deliverBtn) {
    if (task.entregue) {
      deliverBtn.addEventListener("click", async () => {
        deliverBtn.disabled = true;
        const ok = await reabrirTarefaNoBackend(task.id);
        if (ok) {
          task._entregueEm = null; // reabriu: não tem mais "entrega recente" pra proteger
          // Busca a etapa/status de verdade (o servidor já moveu pra
          // Pendentes) — sem isso, task.status/runrunStage ficavam com o
          // valor antigo (ex: "Entregues") e o crachá não voltava certo.
          await sincronizarTarefaAposReabrir(task);
          await carregarSequencia(task);
          // Antes só atualizava o crachá de etapa e a fileira de
          // sequência — o cabeçalho inteiro (play/pause, cronômetro,
          // seta pro card mãe) continuava com a cara de "entregue"
          // porque esse pedaço só é montado uma vez, dentro do HTML de
          // renderDetail(). Reabrir precisa refazer tudo, não só um
          // pedacinho, senão o play/pause nunca volta.
          if (tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id)) {
            renderDetail();
            render();
            agendarAtualizacaoKanban();
          }
        } else {
          deliverBtn.disabled = false;
          mostrarToast("Não consegui reabrir essa tarefa agora.", "erro");
        }
      });
    } else {
      deliverBtn.addEventListener("click", async () => {
        // Tudo isso acontece NA HORA, antes de qualquer resposta do
        // Runrun.it: já marca como entregue e já sobe o carrossel do pill
        // mostrando "Entregue ✓" (mesma técnica do fluxo de transferir
        // card mãe) — sem esperar a ida e volta ao backend pra reagir.
        const entregueOtimista = task.entregue;
        const sequenciaOtimista = task.sequencia;
        task.entregue = true;
        // Marca QUANDO foi entregue: a atualização automática só preserva
        // esse estado local por alguns segundos (ver atualizarKanbanEmBackground
        // em js/pessoas-fotos.js). Depois disso vale o que o Runrun.it diz —
        // é o que faz o Colmeia perceber uma tarefa reaberta por lá.
        task._entregueEm = Date.now();

        mostrarEntregueNoPill();

        const seqEl = document.getElementById("workflowSeqGroup");
        if (seqEl) {
          seqEl.innerHTML = renderSequenciaHTML(task);
          wireWorkflowArrows(task);
        }
        // Pega o botão novo (o de cima foi substituído no re-render
        // acima) pra poder desabilitar enquanto fala com o Runrun.it.
        const novoDeliverBtn = seqEl ? seqEl.querySelector("#navDeliverBtn") : null;
        if (novoDeliverBtn) novoDeliverBtn.disabled = true;

        await pararCronometroAoTransferir(task);

        // Se a tarefa tem sequência, esse botão "Concluir" só aparece
        // quando você é a ÚLTIMA pessoa dela (renderSequenciaHTML só
        // desenha ele nesse caso) — e fechar a etapa da última pessoa
        // (avancarWorkflowNoBackend) JÁ entrega a tarefa de verdade no
        // Runrun.it, sozinho. Chamar "entregar" (entregarTarefaNoBackend)
        // DEPOIS disso é redundante e falha (a tarefa já está entregue),
        // e era exatamente isso que fazia a animação voltar pro estado
        // de "não concluído" mesmo a tarefa já tendo sido entregue de
        // verdade no Runrun.it (o Colmeia achava que tinha dado erro).
        // Só chama entregarTarefaNoBackend direto quando NÃO tem
        // sequência nenhuma (ex: subtarefa/card mãe sem regra).
        let ok;
        if (sequenciaOtimista && sequenciaOtimista.length > 0) {
          const resultadoAvanco = await avancarWorkflowNoBackend(task.id);
          ok = resultadoAvanco.ok;
        } else {
          ok = await entregarTarefaNoBackend(task.id);
        }
        if (ok) {
          task.entregue = true;
          task._entregueEm = Date.now();
          // Segurança extra: garante que o Runrun.it recebeu o pause.
          pausarTarefaNoBackend(task.id);
          // O cronômetro já foi parado no objeto capturado no início
          // (pararCronometroAoTransferir), mas se o quadro atualizou
          // sozinho em segundo plano nesse meio-tempo (atualizarKanbanEmBackground
          // troca os objetos de tarefa por outros novos), o objeto de
          // verdade em tasks[] pode ter voltado a vir com running=true
          // do Runrun.it antes do pause acima ter sido processado lá.
          // Por isso força de novo, comparando por id (nunca por
          // referência — mesmo bug documentado no restante do app).
          const tarefaViva = tasks.find(x => String(x.id) === String(task.id));
          if (tarefaViva) tarefaViva.running = false;
          if (tarefaViva) { tarefaViva.entregue = true; tarefaViva._entregueEm = Date.now(); }
          // O crachá de etapa tem que virar "Entregue ✓" na hora: entregar no
          // Runrun.it FECHA a tarefa mas não muda a etapa dela, então sem
          // isso o pop-up continuava afirmando "Fazendo" depois da entrega.
          atualizarCrachaDeEtapa(task);
          render();
          updateNowPlaying();
          // Acabou de concluir uma SUBtarefa? Confere se o card mãe dela
          // está com você — se estiver, pergunta se quer transferir ele
          // também, direto ali dentro do próprio pill (ver
          // verificarTransferirCardMae/mostrarFluxoCardMaeNoPill mais
          // abaixo). Chamado JÁ AQUI (antes da espera/recarga da
          // sequência logo abaixo, que não tem nada a ver com o card
          // mãe) porque os dados do card mãe já vieram pré-carregados em
          // segundo plano — não tem por que o aviso esperar mais ~2s.
          if (task.parentTaskId) verificarTransferirCardMae(task);
          else _cardMaeFluxoTimeout = setTimeout(esconderFluxoCardMaeNoPill, 1000);
          await esperar(450);
          await carregarSequencia(task);
          agendarAtualizacaoKanban();
        } else {
          // Runrun.it recusou — volta tudo sozinho pro estado original
          // (ícone de concluir e o clique certo de novo inclusos).
          task.entregue = entregueOtimista;
          task._entregueEm = null; // não foi entregue de verdade — desliga a proteção
          atualizarCrachaDeEtapa(task);
          task.sequencia = sequenciaOtimista;
          esconderFluxoCardMaeNoPill();
          if (seqEl) {
            seqEl.innerHTML = renderSequenciaHTML(task);
            wireWorkflowArrows(task);
          }
          mostrarToast("Não consegui concluir essa tarefa agora.", "erro");
        }
      });
    }
  }
}

/**
 * Abre o menu de escolher etapa como um pop-up de verdade, grudado no
 * botão (mesma técnica de posicionamento do calendário e do pop-up de
 * transferir card mãe — position: fixed, gruda no <body>, se posiciona
 * sozinho por JS). Antes, o menu vivia dentro do pill do cabeçalho
 * (position: absolute) e ficava fisicamente cortado por ela, mesmo
 * mandando abrir pra baixo — escapar pro <body> resolve isso de vez.
 */
/**
 * Texto do crachá de etapa de uma tarefa.
 *
 * Tarefa ENTREGUE ganha "Entregue ✓", não a coluna onde ela estava. Antes o
 * crachá continuava dizendo "Fazendo" depois de entregar: no Runrun.it,
 * entregar FECHA a tarefa mas não muda a etapa dela, então o Colmeia estava
 * mostrando um dado verdadeiro que dava a informação errada — a pessoa
 * entregava e o pop-up continuava afirmando que estava em Fazendo.
 */
function rotuloDaEtapa(task) {
  if (!task) return "Sem etapa";
  if (task.entregue) return "Entregue ✓";
  const coluna = columnsDef.find(c => c.key === task.status);
  return (coluna && coluna.label) || task.runrunStage || "Sem etapa";
}

/**
 * Atualiza SÓ o crachá de etapa do pop-up, sem redesenhar o resto.
 *
 * É chamado depois de entregar/reabrir. Não usa renderDetail de propósito:
 * na hora da entrega o pill está no meio da animação do "Entregue ✓"
 * (carrossel do card mãe), e reconstruir o pop-up inteiro cortaria essa
 * animação no meio.
 */
/**
 * Depois de reabrir uma tarefa, o servidor já move ela pra Pendentes de
 * verdade (ver reabrirTarefa, Código.gs) — mas o objeto local só tinha
 * `task.entregue` zerado; `task.status`/`task.runrunStage` continuavam
 * com o valor antigo (ex: "Entregues", que nem é uma das 5 colunas de
 * verdade), então o crachá de etapa ficava preso mostrando isso em vez
 * de "Pendentes". Busca a tarefa fresca no Runrun.it e sincroniza tudo
 * que mudou (etapa, sequência, workflow) de uma vez.
 */
async function sincronizarTarefaAposReabrir(task) {
  const resultado = await buscarTarefaCompletaDoBackend(task.id);
  if (!resultado.ok) return;
  const fresca = mapearTarefaDoBackend(resultado.tarefa);
  task.status = fresca.status;
  task.runrunStage = fresca.runrunStage;
  task.isOutraEtapa = fresca.isOutraEtapa;
  task.taskStateId = fresca.taskStateId;
  task.entregue = fresca.entregue;
  // Sequência/regra vêm de um endpoint à parte (ver carregarSequencia) —
  // quem chama essa função também chama carregarSequencia logo em seguida.
}

function atualizarCrachaDeEtapa(task) {
  const badge = document.getElementById("statusBadge");
  if (!badge || !task) return;
  badge.textContent = rotuloDaEtapa(task);
  badge.classList.toggle("entregue", !!task.entregue);
}

// Pra onde vai uma tarefa que está numa etapa FORA das 5 colunas do quadro
// (o caso mais comum: um card mãe, que fica em "Cards Mães"). Quando é esse
// o caso, o menu de etapa mostra esse caminho em destaque, como um atalho de
// um clique — em vez de obrigar a caçar a coluna certa numa lista.
const ETAPA_SUGERIDA_SAINDO_DE_FORA = "revisao";

/**
 * @param {Object} task          tarefa que vai mudar de etapa
 * @param {HTMLElement} statusBadge  botão onde o menu vai encostar
 * @param {function} [aoMudar]   chamado depois de mexer em task.status, pra
 *                               quem chama redesenhar o que for dele. Sem
 *                               isso, redesenha o pop-up e o quadro (que é o
 *                               certo quando a tarefa é a que está aberta).
 * @param {{label: string, taskStateId: string}} [voltarInfo]  quando a
 *                               tarefa tem uma etapa ORIGINAL fora das 5
 *                               colunas (guardada de antes, ex: card mãe
 *                               que já foi transferido pra "Revisão" mas
 *                               veio de "Cards Mães" — ver
 *                               etapaOriginalStateId em js/detalhe-cardmae.js),
 *                               mostra um atalho pra voltar pra ela. Sem
 *                               isso não tem como desfazer, já que "Cards
 *                               Mães" não é uma das 5 colunas com
 *                               moverEtapaNoBackend/COLUNA_STAGE_IDS —
 *                               usa moverEtapaArbitrariaNoBackend com o
 *                               taskStateId de verdade em vez de uma
 *                               chave de coluna.
 */
function abrirMenuEtapa(task, statusBadge, aoMudar, voltarInfo) {
  document.querySelectorAll(".status-menu").forEach(el => el.remove());

  const redesenhar = aoMudar || (() => { renderDetail(); render(); });

  // Tarefa numa etapa fora do quadro (card mãe em "Cards Mães", etapa de
  // atendimento etc): oferece o próximo passo direto, em destaque.
  const etapaAtualForaDoQuadro = !task.status;
  const destino = columnsDef.find(c => c.key === ETAPA_SUGERIDA_SAINDO_DE_FORA);
  const atalhoHTML = (etapaAtualForaDoQuadro && destino) ? `
    <button type="button" class="status-menu-atalho" data-status="${destino.key}">
      <span class="status-menu-atalho-de">${escaparHTML(task.runrunStage || "Etapa atual")}</span>
      <span class="status-menu-atalho-seta">→</span>
      <span class="status-menu-atalho-para">${destino.label}</span>
    </button>
    <div class="status-menu-sep"></div>
  ` : "";

  // Caminho de volta pra etapa original (fora do quadro) — só faz sentido
  // quando a tarefa JÁ está dentro de uma das 5 colunas (senão já é a
  // própria etapa atual, o atalho acima já cobre o caminho de ida).
  const voltarHTML = (voltarInfo && task.status) ? `
    <button type="button" class="status-menu-atalho" data-voltar-state-id="${escaparHTML(voltarInfo.taskStateId)}" data-voltar-label="${escaparHTML(voltarInfo.label)}">
      <span class="status-menu-atalho-de">${escaparHTML(task.runrunStage || "Etapa atual")}</span>
      <span class="status-menu-atalho-seta">→</span>
      <span class="status-menu-atalho-para">${escaparHTML(voltarInfo.label)}</span>
    </button>
    <div class="status-menu-sep"></div>
  ` : "";

  const menu = document.createElement("div");
  menu.className = "status-menu";
  menu.innerHTML = voltarHTML + atalhoHTML
    + columnsDef.map(c => `<button type="button" data-status="${c.key}" class="${c.key === task.status ? "active" : ""}">${c.label}</button>`).join("");
  document.body.appendChild(menu);
  posicionarPopupFixo(menu, statusBadge);
  requestAnimationFrame(() => menu.classList.add("open"));

  function fechar() {
    menu.classList.remove("open");
    setTimeout(() => menu.remove(), 160);
    document.removeEventListener("click", clickFora);
  }
  function clickFora(ev) {
    if (!menu.contains(ev.target) && ev.target !== statusBadge) fechar();
  }
  setTimeout(() => document.addEventListener("click", clickFora), 0);

  const voltarBtn = menu.querySelector("[data-voltar-state-id]");
  if (voltarBtn) {
    voltarBtn.addEventListener("click", async e => {
      e.stopPropagation();
      fechar();
      const statusAntigo = task.status;
      const runrunStageAntigo = task.runrunStage;
      task.status = null;
      task.runrunStage = voltarBtn.dataset.voltarLabel;
      redesenhar();
      const ok = await moverEtapaArbitrariaNoBackend(task.id, voltarBtn.dataset.voltarStateId);
      if (!ok) {
        task.status = statusAntigo; // Runrun.it recusou — volta pro estado real
        task.runrunStage = runrunStageAntigo;
        redesenhar();
        mostrarToast("Não consegui mover essa tarefa de etapa agora.", "erro");
      } else {
        agendarAtualizacaoKanban();
      }
    });
  }

  menu.querySelectorAll("button[data-status]").forEach(opt => {
    opt.addEventListener("click", async e => {
      e.stopPropagation();
      fechar();
      const statusAntigo = task.status;
      const runrunStageAntigo = task.runrunStage;
      task.status = opt.dataset.status;
      // Atualiza também o nome da etapa: sem isso, um card que estava numa
      // etapa fora do quadro ("Cards Mães") continuava mostrando esse nome
      // antigo no crachá, porque é ele que aparece quando não bate com
      // nenhuma das 5 colunas.
      const colunaEscolhida = columnsDef.find(c => c.key === opt.dataset.status);
      if (colunaEscolhida) task.runrunStage = colunaEscolhida.label;
      redesenhar();
      const ok = await moverEtapaNoBackend(task.id, opt.dataset.status);
      if (!ok) {
        task.status = statusAntigo; // Runrun.it recusou — volta pro estado real
        task.runrunStage = runrunStageAntigo;
        redesenhar();
        mostrarToast("Não consegui mover essa tarefa de etapa agora.", "erro");
      } else {
        agendarAtualizacaoKanban();
      }
    });
  });
}

function renderDetail() {
  const task = tasks[detailIdx];
  const type = typeLabels[task.type];
  const panel = document.getElementById("taskDetail");

  panel.innerHTML = `
    <div class="detail-inner">
      <div class="detail-header">
        <div class="detail-header-pill ${task.entregue ? "entregue-modo" : ""}" id="detailHeaderPill">
          <div class="pill-face pill-face-normal">
          ${task.entregue ? "" : `
            <button type="button" class="play-btn" id="detailPlay" aria-label="${task.running ? "Pausar" : "Iniciar"} tarefa">${task.running ? pauseIcon : playIcon}</button>
            <span class="timer-text" id="detailTimer">${formatTime(task.timerSeconds)}</span>
            ${typeof focoBotaoHTML === "function" ? focoBotaoHTML() : ""}
            <span class="detail-sep">|</span>
          `}
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
                      <span class="child-title">${escaparHTML(s.title)}</span>
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
          <span class="detail-taskname">${escaparHTML(task.title)}</span>
          ${task.entregue ? `<span class="pill-horas-trabalhadas" title="Tempo total trabalhado nessa tarefa">${formatTime(task.timerSeconds)}</span>` : ""}
          <button type="button" class="detail-taskname-copy" id="detailTaskNameCopy" title="Copiar nome da tarefa" aria-label="Copiar nome da tarefa">
            <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
          <span class="header-priority pv-${task.priority}">${priorityLabels[task.priority] || ""}</span>
          <div class="detail-header-pill-right">
            <div class="nav-dots-group" id="workflowSeqGroup">
              ${renderSequenciaHTML(task)}
            </div>
            <div class="status-wrap">
              <button type="button" class="status-badge ${task.entregue ? "entregue" : ""}" id="statusBadge">${escaparHTML(rotuloDaEtapa(task))}</button>
            </div>
          </div>
          </div>
          <!-- "Carrossel" do card mãe (entregue/transferir/regra) — ver
               mostrarFluxoCardMaeNoPill mais abaixo neste arquivo. Some
               nesse mesmo espaço quando não está em uso. -->
          <div class="pill-face pill-face-cardmae" id="pillCardMaeFace" hidden></div>
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
            ${task.parentTaskId ? `
              <button type="button" class="detail-tab" id="tabDescMae">Descrição card mãe</button>
            ` : ""}
            ${ehTarefaDeAlteracao(task) ? `
              <button type="button" class="detail-tab" id="tabOriginal" title="Ver a peça que essa alteração está pedindo pra mudar">Tarefa original</button>
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
            ${task.parentTaskId ? `
              <div class="descmae-content" id="descMaeContent" hidden>
                <div class="descmae-titulo" id="descMaeTitulo">Carregando...</div>
                <div class="desc-text-real" id="descMaeTextReal">Carregando...</div>
              </div>
            ` : ""}
            ${ehTarefaDeAlteracao(task) ? `
              <div class="original-content" id="originalContent" hidden>
                <div class="alteracao-resumo" id="alteracaoResumo"></div>
                <div class="descmae-titulo" id="originalTitulo">Procurando a tarefa original...</div>
                <div class="original-meta" id="originalMeta"></div>
                <div class="desc-text-real" id="originalTextReal"></div>
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
              <button type="button" class="pasta-copy-link-pill" id="pastaCopyLinkBtn" hidden>
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 12a4 4 0 004 4h1a4 4 0 000-8h-1M15 12a4 4 0 00-4-4H10a4 4 0 000 8h1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Copiar link da pasta</span>
              </button>
              <button type="button" class="pasta-link-manual-btn" id="pastaLinkManualBtn">Linkar pasta certa</button>
            </div>
          ` : ""}
          <div class="side-block">
            <span class="side-label">Tipo de tarefa</span>
            <span class="badge ${type.class}">${type.label}</span>
          </div>
          <div class="side-block">
            <span class="side-label">Cliente</span>
            <div class="side-badges-row">
              <span class="badge badge-cliente">${escaparHTML(task.client)}</span>
              ${(() => {
                const mesProjeto = extrairMesAnoDoProjeto(task.projeto);
                return mesProjeto ? `<span class="badge badge-projeto" title="Mês do projeto (campo Projeto do Runrun.it)">${mesProjeto.label}</span>` : "";
              })()}
            </div>
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
              <button type="button" class="download-all-btn" id="downloadAllBtn" ${task.attachmentsCount ? "" : "hidden"}>Baixar todos</button>
              ${task.id ? `<button type="button" class="download-all-btn bee-conferir-btn" id="beeConferirBtn" title="A Bee compara o que foi pedido com o que você subiu no Drive">🐝 conferir o que falta</button>` : ""}
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
      <!-- Cabeçalho em 3 zonas: voltar na esquerda, NOME DA ABA ATIVA no
           meio (com uma setinha pra trocar de aba ali mesmo) e o ícone da
           Bee na direita, no lugar onde ficavam os "..." — clicar nele
           entra no chat dela, clicar de novo volta pros comentários.
           O botão "Verificar upload" saiu: o Colmeia já checa sozinho a
           cada 8s e sempre que a aba do navegador volta a ficar em foco
           (ver iniciarChecagemUploadEmSegundoPlano). -->
      <div class="chat-panel-header">
        <button type="button" class="chat-hdr-btn" id="chatPanelClose" aria-label="Voltar">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="chat-hdr-menu-wrap chat-abas-wrap">
          <button type="button" class="chat-aba-atual" id="chatPanelMenuBtn" aria-label="Trocar de conversa">
            <span class="chat-panel-title" id="chatPanelTitle">Comentários</span>
            <svg class="chat-aba-seta" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="chat-hdr-menu" id="chatPanelMenu" hidden>
            <button type="button" class="chat-panel-tab active" id="chatTabAqui">Comentários <em>vão pro Runrun.it</em></button>
            <button type="button" class="chat-panel-tab" id="chatTabMae" ${task.parentTaskId ? "" : "hidden"}>Card mãe</button>
            ${ehTarefaDeAlteracao(task) ? `
              <button type="button" class="chat-panel-tab" id="chatTabTudo" title="Todos os comentários desta alteração, da tarefa original e do card mãe, em ordem de hora">Linha do tempo</button>
            ` : ""}
          </div>
        </div>
        ${task.id ? `
          <button type="button" class="chat-hdr-btn chat-hdr-bee" id="chatIconeBee" aria-label="Falar com a Bee" title="Bee — fica só no Colmeia">
            ${beeIcon}
          </button>
        ` : `<span class="chat-hdr-btn" aria-hidden="true"></span>`}
      </div>
      <div class="comments-thread" id="commentsThread">
        ${renderComentariosHTML(task)}
      </div>
      <!-- Fica FORA da thread de propósito: #commentsThread é reconstruído
           do zero (thread.innerHTML = ...) toda vez que os comentários são
           recarregados (depois de enviar um, a cada 8s de checagem de
           upload etc.) — um aviso da Bee inserido lá dentro sumia sozinho
           1s depois, assim que a primeira recarga acontecesse, sem dar
           tempo de clicar em nada. Aqui ele fica parado, imune a isso. -->
      <div class="bee-inline-avisos" id="beeInlineAvisos"></div>
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

  const copyNameBtn = document.getElementById("detailTaskNameCopy");
  if (copyNameBtn) {
    copyNameBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(task.title);
        copyNameBtn.classList.add("copied");
        setTimeout(() => copyNameBtn.classList.remove("copied"), 1200);
      } catch (err) {
        console.error("Falha ao copiar nome da tarefa:", err);
      }
    });
  }

  // Some quando a tarefa está entregue (só volta quando reabrir) — dá pra
  // ser null aqui.
  document.getElementById("detailPlay")?.addEventListener("click", () => {
    // Não achado pela busca literal "tasks[detailIdx] === task", mas é
    // a mesma família de bug: "task" aqui é a referência capturada
    // quando o pop-up foi desenhado, que pode já estar obsoleta se
    // atualizarKanbanEmBackground trocou os objetos de tarefa enquanto
    // o pop-up ficou aberto (sem o usuário clicar em nada nesse meio-
    // tempo). Mexer em ".running" nesse objeto velho não aparecia em
    // lugar nenhum, porque renderDetail() sempre lê tasks[detailIdx] de
    // novo — e pararOutrasTarefasRodando(task) comparava por referência
    // contra objetos vivos que nunca iam bater, parando tarefas erradas.
    const tarefaViva = (task.id && tasks.find(x => String(x.id) === String(task.id))) || task;
    const vaiComecar = !tarefaViva.running;
    if (vaiComecar) pararOutrasTarefasRodando(tarefaViva);
    tarefaViva.running = vaiComecar;
    tarefaViva._runningToggleEm = Date.now();
    if (tarefaViva.running) tocarTarefaNoBackend(tarefaViva.id, tarefaViva.title);
    else pausarTarefaNoBackend(tarefaViva.id);
    renderDetail();
    render();
    applyCommentsState();
    updateNowPlaying();
  });

  if (typeof focoWireBotao === "function") focoWireBotao();

  // ===== Menu de mais opções (⋮) =====
  const criarPastaBtn = document.getElementById("criarPastaDriveBtn");
  const copyLinkPill = document.getElementById("pastaCopyLinkBtn");
  if (criarPastaBtn) {
    criarPastaBtn.addEventListener("click", () => confirmarECriarPastaDoCard(task));
    verificarPastaJaSalva(task, criarPastaBtn);
  }
  if (copyLinkPill) {
    copyLinkPill.addEventListener("click", () => {
      const url = copyLinkPill.dataset.url;
      if (!url) return;
      navigator.clipboard.writeText(url).then(() => {
        const original = copyLinkPill.querySelector("span").textContent;
        copyLinkPill.querySelector("span").textContent = "Link copiado!";
        setTimeout(() => { copyLinkPill.querySelector("span").textContent = original; }, 1200);
      });
    });
  }
  const linkManualBtn = document.getElementById("pastaLinkManualBtn");
  if (linkManualBtn) linkManualBtn.addEventListener("click", () => abrirLinkarPastaManual(task, criarPastaBtn));

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
  // O card mãe também pode ser movido de etapa — a trava que bloqueava
  // isso não fazia sentido, já que o Runrun.it trata ele como uma
  // tarefa normal (só fica numa etapa própria, "Cards Mães", até
  // alguém mudar).
  statusBadge.addEventListener("click", e => {
    e.stopPropagation();
    abrirMenuEtapa(task, statusBadge);
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
        task._entregueEm = null; // reabriu: não tem mais "entrega recente" pra proteger
        // Busca a etapa/status de verdade (o servidor já moveu pra
        // Pendentes) — ver comentário em sincronizarTarefaAposReabrir.
        await sincronizarTarefaAposReabrir(task);
        await carregarSequencia(task);
        // Mesmo motivo do outro botão de reabrir (ver comentário lá) —
        // precisa refazer o cabeçalho inteiro, não só um pedacinho.
        if (tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id)) {
          renderDetail();
          render();
          agendarAtualizacaoKanban();
        }
      } else {
        mostrarToast("Não consegui reabrir essa tarefa agora. Tenta de novo em alguns segundos.", "erro");
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
        mostrarToast("Digita um número de horas válido (maior que zero).", "erro");
        return;
      }
      const ok = await ajustarEstimativaNoBackend(task.id, horas * 60);
      if (ok) {
        task.estimateMinutes = Math.round(horas * 60);
        render();
      } else {
        mostrarToast("Não consegui ajustar a estimativa agora. Tenta de novo em alguns segundos.", "erro");
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
        mostrarToast("Não consegui salvar a descrição agora. Tenta de novo em alguns segundos.", "erro");
      }
    });
  }

  // ===== Abas Descrição / Descrição card mãe / Tarefa original (sem
  // re-renderizar, com transição) =====
  document.getElementById("tabDesc").addEventListener("click", () => {
    descMaeAberta = false;
    originalAberta = false;
    applyCommentsState();
  });
  const tabDescMae = document.getElementById("tabDescMae");
  if (tabDescMae) {
    tabDescMae.addEventListener("click", () => {
      descMaeAberta = true;
      originalAberta = false;
      applyCommentsState();
      carregarDescricaoCardMae(tasks[detailIdx] || task);
    });
  }
  const tabOriginal = document.getElementById("tabOriginal");
  if (tabOriginal) {
    tabOriginal.addEventListener("click", () => {
      originalAberta = true;
      descMaeAberta = false;
      applyCommentsState();
      carregarTarefaOriginalDaAlteracao(tasks[detailIdx] || task);
    });
  }

  // renderDetail() reconstrói o pop-up inteiro do zero — inclusive
  // quando é chamado por causa de outra coisa (ex: clicar em play/pause
  // não devia mexer na aba de descrição, mas rebuild o HTML inteiro
  // junto). Se a aba "Descrição card mãe"/"Tarefa original" estava
  // aberta, o conteúdo já carregado sumia e nada recarregava ele — a
  // aba ficava selecionada mas vazia/"Carregando..." pra sempre. Busca
  // nada aqui se não tiver nada carregado ainda; se já tiver
  // (cardMaeCache/cache da alteração), volta na hora, sem esperar rede.
  if (descMaeAberta) carregarDescricaoCardMae(tasks[detailIdx] || task);
  if (originalAberta) carregarTarefaOriginalDaAlteracao(tasks[detailIdx] || task);

  const commentInput = document.getElementById("commentInput");
  let arquivoParaAnexar = null;

  async function enviarComentarioAtual() {
    const texto = commentInput.value.trim();
    if (!texto && !arquivoParaAnexar) return;
    // No chat da Bee o mesmo campo fala com ela, e NADA vai pro
    // Runrun.it por aqui (ver js/bee.js).
    if (chatThreadAtivo === "bee") {
      if (!texto) return;
      commentInput.value = "";
      await perguntarParaBee(tasks[detailIdx] || task, texto);
      return;
    }
    if (!chatAlvoTaskId) {
      console.warn("Essa tarefa não está conectada ao Runrun.it, não dá pra comentar de verdade.");
      return;
    }
    const alvoId = chatAlvoTaskId;
    // "aqui" e "tudo" (Linha do tempo) escrevem os dois na PRÓPRIA tarefa
    // — então nos dois casos faz sentido a Bee perguntar se é pra repetir
    // no card mãe. Antes só valia pra "aqui", e quem comentava pela Linha
    // do tempo (o caminho normal numa alteração) nunca recebia a oferta.
    const eraThreadAqui = chatThreadAtivo === "aqui" || chatThreadAtivo === "tudo";
    const arquivoAtual = arquivoParaAnexar;
    // No Runrun.it de verdade, "@Nome" escolhido na lista vira uma menção
    // de verdade (a pessoa é avisada) — não é só texto colorido. O jeito
    // que o Runrun.it manda ISSO pra gente quando LÊ um comentário é
    // "<mention>@Nome</mention>" dentro do texto (ver formatarMencoes,
    // js/regras-briefing.js) — então é essa mesma marcação que a gente
    // manda de volta pra ELE reconhecer como menção de verdade ao criar
    // o comentário, não só "@Nome" solto.
    const textoParaEnviar = converterMencoesParaTagRunrun(texto);
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
          ${avatarHTML(DESIGNER_LOGADO, "avatar-sm comment-avatar")}
          <div class="comment-body">
            <div class="comment-meta"><span class="comment-author">Você</span><span class="comment-time">Enviando...</span></div>
            <div class="comment-text">${linkifyTexto(escaparHTML(texto))}</div>
          </div>
        </div>
      `);
      thread.scrollTop = thread.scrollHeight;
    }

    const ok = arquivoAtual
      ? await enviarComentarioComAnexoNoBackend(alvoId, textoParaEnviar, arquivoAtual)
      : await enviarComentarioNoBackend(alvoId, textoParaEnviar);

    commentInput.disabled = false;
    const bolhaTemporaria = document.querySelector(`.comment-bubble[data-comment-id="${idTemporario}"]`);
    if (ok) {
      // Confirma visualmente (some o opaco/pendente) até a lista real
      // (com a bolha de verdade vinda do Runrun.it) substituir tudo.
      if (bolhaTemporaria) bolhaTemporaria.classList.remove("pending");
      // ESPERA a thread recarregar antes de oferecer o "repetir no card
      // mãe?" — a recarga redesenha a conversa e levava o aviso junto,
      // então ele aparecia e sumia num piscar.
      await recarregarThreadAtiva();
      agendarAtualizacaoKanban();
      if (eraThreadAqui && task.parentTaskId && texto) mostrarPromptRepetirComentario(task, textoParaEnviar);
    } else {
      if (bolhaTemporaria) bolhaTemporaria.remove(); // não foi enviado — some a bolha
      // Devolve o texto pro campo em vez de perder o que a pessoa escreveu:
      // o campo é limpo ANTES da resposta chegar (pra bolha aparecer na
      // hora), então numa falha o texto simplesmente evaporava e tinha que
      // ser digitado de novo. Só devolve se a pessoa ainda não começou a
      // escrever outra coisa nesse meio-tempo — nunca sobrescreve o que
      // ela está digitando agora.
      const campoAgora = document.getElementById("commentInput");
      if (campoAgora && !campoAgora.value.trim() && texto) {
        campoAgora.value = texto;
        campoAgora.focus();
      }
      mostrarToast("Não consegui enviar esse comentário agora. Seu texto voltou pro campo.", "erro");
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
      if (e.key !== "Enter") return;
      // A lista de sugestões de @nome é só uma ajuda pra digitar certo —
      // igual no Runrun.it de verdade, "@fulano" não vira uma menção
      // especial nenhuma, é só texto normal do comentário. Antes, com a
      // lista aberta, apertar Enter não fazia NADA (nem enviava, nem
      // escolhia ninguém) — parecia que o comentário tinha travado.
      if (mentionListAberta()) mentionList.hidden = true;
      enviarComentarioAtual();
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
  const EMOJIS_COMUNS = [
    "😀","😁","😂","🤣","😅","😊","🙂","😉","😍","😘","😜","🤔","😐","😴","😭","😢",
    "😡","🥳","🤯","😱","🙄","😇","🤗","😅","🤝","👏","🙏","💪","👍","👎","👌","✌️",
    "🤞","👀","🙌","💯","🔥","🚀","💡","⚠️","✅","❌","⭐","✨","🎉","🎯","📌","📎",
    "📅","⏰","💬","📸","🎨","🖥️","📱","🔗","❤️","🧡","💛","💚","💙","💜","🖤","🤍",
    "💔","🐝","☀️","🌙","☕","🍕","🎂","👋","🙋","🤦","🤷","😬","🥲","😎","🤩","🫡"
  ];
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
  // Troca "@Nome" (de gente conhecida de verdade) por "<mention>@Nome</mention>"
  // antes de mandar pro Runrun.it — é assim que ELE manda de volta uma menção
  // de verdade quando a gente LÊ um comentário (ver formatarMencoes), então é
  // essa marcação que ele deve reconhecer ao CRIAR também. Nomes maiores
  // primeiro ("Ana Paula" antes de "Ana"), pra não cortar no meio.
  function converterMencoesParaTagRunrun(texto) {
    if (!texto || texto.indexOf("@") === -1) return texto;
    const nomes = todosNomesParaMencao().sort((a, b) => b.length - a.length);
    let resultado = texto;
    nomes.forEach(nome => {
      const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp("@" + escapado + "(?![\\wÀ-ÿ])", "gi");
      resultado = resultado.replace(regex, `<mention>@${nome}</mention>`);
    });
    return resultado;
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

  // Listinha de trocar de conversa, que abre na setinha do nome da aba.
  // Fecha sozinha ao escolher qualquer opção (e ao clicar fora — ver o
  // handler global de clique no fim de js/kanban-board.js).
  const chatPanelMenuBtn = document.getElementById("chatPanelMenuBtn");
  const chatPanelMenu = document.getElementById("chatPanelMenu");
  if (chatPanelMenuBtn && chatPanelMenu) {
    chatPanelMenuBtn.addEventListener("click", e => {
      e.stopPropagation();
      chatPanelMenu.hidden = !chatPanelMenu.hidden;
    });
    chatPanelMenu.addEventListener("click", e => {
      if (e.target.closest("button")) chatPanelMenu.hidden = true;
    });
  }

  const chatTabAqui = document.getElementById("chatTabAqui");
  if (chatTabAqui) chatTabAqui.addEventListener("click", () => abrirThreadAqui(tasks[detailIdx] || task));

  const chatTabMae = document.getElementById("chatTabMae");
  if (chatTabMae) chatTabMae.addEventListener("click", () => abrirThreadDoCardMae(tasks[detailIdx] || task));

  const chatTabTudo = document.getElementById("chatTabTudo");
  if (chatTabTudo) chatTabTudo.addEventListener("click", () => abrirThreadLinhaDoTempo(tasks[detailIdx] || task));

  const beeConferirBtn = document.getElementById("beeConferirBtn");
  if (beeConferirBtn) beeConferirBtn.addEventListener("click", () => conferirEntregaComABee(tasks[detailIdx] || task, beeConferirBtn));

  // Um botão só, que vai e volta: nos comentários ele leva pra Bee, e
  // dentro da Bee ele traz de volta pros comentários.
  const chatIconeBee = document.getElementById("chatIconeBee");
  if (chatIconeBee) {
    chatIconeBee.addEventListener("click", () => {
      const alvo = tasks[detailIdx] || task;
      if (chatThreadAtivo === "bee") abrirThreadComentarios(alvo);
      else abrirThreadBee(alvo);
    });
  }

  atualizarTituloDoChat();
  atualizarBadgeChat(task);

  // O pop-up foi redesenhado do zero, então a lista de anexos voltou a
  // ser o "Carregando anexos...". Se esses anexos já tinham sido
  // buscados, redesenha na hora — senão a mensagem ficava eternamente
  // na tela, porque a busca só acontecia na abertura do card.
  redesenharAnexosGuardados(task);

  applyCommentsState();
}

function applyCommentsState() {
  const tabDesc = document.getElementById("tabDesc");
  const childrenPanel = document.getElementById("childrenPanel");
  const tabDescMae = document.getElementById("tabDescMae");
  const tabOriginal = document.getElementById("tabOriginal");
  const descContent = document.getElementById("descContent");
  const descMaeContent = document.getElementById("descMaeContent");
  const originalContent = document.getElementById("originalContent");
  if (childrenPanel) childrenPanel.classList.toggle("open", childrenOpen);
  // Três abas mutuamente exclusivas: Descrição (a padrão), Descrição card
  // mãe e Tarefa original (essa última só existe em subtarefa de alteração).
  if (tabDesc) tabDesc.classList.toggle("active", !descMaeAberta && !originalAberta);
  if (tabDescMae) tabDescMae.classList.toggle("active", descMaeAberta);
  if (tabOriginal) tabOriginal.classList.toggle("active", originalAberta);
  if (descContent) descContent.hidden = descMaeAberta || originalAberta;
  if (descMaeContent) descMaeContent.hidden = !descMaeAberta;
  if (originalContent) originalContent.hidden = !originalAberta;
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

  // String() nos dois lados: quem chama pode vir com o ID como texto (o
  // roteador de URL, js/roteador-url.js, lê da barra de endereço) ou
  // como número (task.id do backend) — comparar direto (===) sem isso
  // deixava passar batido um link direto pra uma tarefa que JÁ estava
  // carregada, indo pro caminho mais lento de buscar ela de novo à toa.
  const idxExistente = tasks.findIndex(t => String(t.id) === String(taskId));
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
  if (!taskId) return { ok: false, error: "Backend não configurado." };
  return await chamarBackend({ acao: "buscarTarefaCompleta", taskId });
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
  // Garante que o pop-up esteja aberto pra essa mensagem ser vista de fato.
  // Antes essa função só era chamada com um card já aberto e não precisava
  // disso; hoje ela também aparece vindo do quadro (ex: logo depois de
  // criar uma tarefa nova), quando o pop-up ainda está fechado — e aí a
  // mensagem era escrita num painel invisível.
  panel.classList.add("visible");
  requestAnimationFrame(() => panel.classList.add("open"));
  document.body.classList.add("card-aberto");
}

function closeDetail() {
  pararChecagemUploadEmSegundoPlano();
  clearTimeout(_cardMaeFluxoTimeout);
  // A pílula do topbar acabou de ficar livre de novo (não tem mais
  // painel de detalhe cobrindo ela) — se tinha alguma notificação
  // ambiente flutuando na ilha só por causa disso, muda ela pra pílula
  // agora, em vez de deixar flutuando à toa.
  migrarIlhaAmbienteParaPill();
  const panel = document.getElementById("taskDetail");
  panel.classList.remove("open");
  document.body.classList.remove("card-aberto");
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  setTimeout(() => panel.classList.remove("visible"), 250);
  // Sem isso, uma tarefa concluída (que o Colmeia mantém viva em
  // `tasks` só pra não fechar o pop-up sozinho — ver
  // atualizarKanbanEmBackground) continuaria sendo "readicionada" pra
  // sempre a cada atualização em segundo plano, mesmo depois de a
  // pessoa já ter fechado o pop-up manualmente.
  detailIdx = -1;

  // Devolve o endereço do navegador pra página que estava por baixo
  // (ver js/roteador-url.js).
  if (typeof roteadorAoFecharTarefa === "function") roteadorAoFecharTarefa();
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
  const running = tasks.find(t => t.running && ehMinhaTarefa(t));
  if (running) {
    el.hidden = false;
    if (idle) idle.hidden = true;
    document.getElementById("nowPlayingTitle").textContent = running.title;
    document.getElementById("nowPlayingTime").textContent = formatTime(running.timerSeconds);
    const clienteEl = document.getElementById("nowPlayingClient");
    if (clienteEl) clienteEl.textContent = running.client || "";
  } else {
    el.hidden = true;
    if (idle) idle.hidden = false;
  }
}

// Pausar direto pela pílula do topbar, sem precisar abrir a tarefa — só
// existe uma tarefa rodando por vez (a pílula só mostra quando tem
// alguma), então aqui é sempre "pausar", nunca "tocar".
document.getElementById("nowPlayingPause").addEventListener("click", (ev) => {
  ev.stopPropagation(); // não deixa o clique também abrir a tarefa (listener do próprio #nowPlaying)
  const running = tasks.find(t => t.running && ehMinhaTarefa(t));
  if (!running) return;
  running.running = false;
  running._runningToggleEm = Date.now();
  pausarTarefaNoBackend(running.id);
  if (tasks[detailIdx] && String(tasks[detailIdx].id) === String(running.id)) renderDetail();
  render();
  applyCommentsState();
  updateNowPlaying();
});

// avança a barra de progresso e o cronômetro das tarefas em execução
setInterval(() => {
  tasks.forEach((task, idx) => {
    if (task.running) {
      task.timerSeconds++;
      const timerEl = document.querySelector(`.timer-text[data-idx="${idx}"]`);
      if (timerEl) timerEl.textContent = formatTime(task.timerSeconds);
      // Compara os ÍNDICES (idx === detailIdx), não os objetos por
      // referência — aqui os dois efetivamente sempre vêm do mesmo
      // array tasks[] no mesmo instante, então não era um bug de
      // verdade, mas comparar por índice é mais simples e não deixa
      // esse padrão (=== entre objetos de tarefa) se espalhar pelo
      // código feito exemplo pra copiar em outro lugar onde SERIA bug.
      if (idx === detailIdx) {
        const detailTimerEl = document.getElementById("detailTimer");
        if (detailTimerEl) detailTimerEl.textContent = formatTime(task.timerSeconds);
      }
      if (task.tempoMedioMinutos) {
        task.estimatePct = calcularEstimatePct(task.timerSeconds, task.tempoMedioMinutos);
        const fill = document.querySelector(`.progress-fill[data-idx="${idx}"]`);
        if (fill) fill.style.width = task.estimatePct + "%";
      }
      if (ehTarefaDeCoordenacao(task)) {
        const pillTimerEl = document.querySelector(".coordenacao-pill-timer");
        if (pillTimerEl) pillTimerEl.textContent = formatTime(task.timerSeconds);
      }
    }
  });
  updateNowPlaying();
}, 1000);

// ===== Dark mode =====
// O tema escolhido fica salvo no navegador (mesma convenção das outras
// preferências por designer, tipo a ordem das abas do Runrun completo) —
// antes ele voltava pro claro a cada F5, o que dava a impressão de que a
// escolha não tinha "pegado".
const TEMA_CHAVE = "colmeia_tema_v1";

function aplicarTema(modo) {
  if (modo === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  document.querySelectorAll("#themeSwitch button").forEach(b => {
    b.classList.toggle("on", b.dataset.mode === modo);
  });
}

document.querySelectorAll("#themeSwitch button").forEach(btn => {
  btn.addEventListener("click", () => {
    const modo = btn.dataset.mode === "dark" ? "dark" : "light";
    aplicarTema(modo);
    try { localStorage.setItem(TEMA_CHAVE, modo); } catch (err) { /* sem problema, só não lembra */ }
  });
});

// Restaura o tema salvo assim que a página carrega (inclusive na tela de
// login, antes de qualquer login).
(function restaurarTemaSalvo() {
  let salvo = null;
  try { salvo = localStorage.getItem(TEMA_CHAVE); } catch (err) { /* sem problema */ }
  if (salvo === "dark" || salvo === "light") aplicarTema(salvo);
})();

