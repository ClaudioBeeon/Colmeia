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
  carregarCronometroReal(tasks[detailIdx]);
  carregarFilhosSeForCardMae(tasks[detailIdx]);
  if (tasks[detailIdx].parentTaskId) precarregarCardMaeEmBackground(tasks[detailIdx].id);
  renderNotificacoesUpload(tasks[detailIdx]);
  iniciarChecagemUploadEmSegundoPlano(tasks[detailIdx]);
  if (tasks[detailIdx].id) gerarBriefingComIA(tasks[detailIdx]);
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
  const taskId = task.id;
  const resultado = await buscarSequenciaDoBackend(taskId);
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
  const prevBtn = document.getElementById("navPrevArrow");
  const nextBtn = document.getElementById("navNextArrow");
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
          mostrarToast("Não consegui reabrir essa tarefa agora.", "erro");
        }
      });
    } else {
      deliverBtn.addEventListener("click", async () => {
        // Tudo isso acontece NA HORA, antes de qualquer resposta do
        // Runrun.it: já marca como entregue, já re-renderiza o botão
        // inteiro (não só o ícone!) mostrando reciclagem, e já faz o
        // pill preto varrer de verde. Re-renderizar o GRUPO inteiro
        // (não só trocar o innerHTML do ícone) é importante — é o que
        // garante que o clique do botão já fica ligado no "reabrir"
        // de verdade, em vez de continuar ligado no "concluir" antigo
        // (esse era o bug: o ícone mudava mas o clique continuava
        // sendo o de concluir, então "reabrir" nunca funcionava).
        const entregueOtimista = task.entregue;
        const sequenciaOtimista = task.sequencia;
        task.entregue = true;

        const pillEl = document.querySelector(".detail-header-pill");
        if (pillEl) {
          pillEl.classList.remove("entregando"); // reinicia se já tinha rodado antes
          void pillEl.offsetWidth; // força o navegador a "esquecer" a animação anterior
          pillEl.classList.add("entregando");
        }

        const seqEl = document.getElementById("workflowSeqGroup");
        if (seqEl) {
          seqEl.innerHTML = renderSequenciaHTML(task);
          wireWorkflowArrows(task);
        }
        // Pega o botão novo (o de cima foi substituído no re-render
        // acima) pra poder desabilitar enquanto fala com o Runrun.it.
        const novoDeliverBtn = document.getElementById("navDeliverBtn");
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
          render();
          updateNowPlaying();
          mostrarIlha({
            icone: `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            titulo: "Entregue ✓",
            subtitulo: task.title,
          });
          // Acabou de concluir uma SUBtarefa? Confere se o card mãe dela
          // está com você — se estiver, pergunta se quer transferir ele
          // também, direto daqui, sem precisar ir lá procurar o card mãe.
          // Chamado JÁ AQUI (antes da espera/recarga da sequência abaixo,
          // que não tem nada a ver com o card mãe) porque os dados do
          // card mãe já vieram pré-carregados em segundo plano — não
          // tem por que o aviso esperar mais ~2s pra aparecer.
          if (task.parentTaskId) verificarTransferirCardMae(task);
          await esperar(450);
          await carregarSequencia(task);
          agendarAtualizacaoKanban();
        } else {
          // Runrun.it recusou — volta tudo sozinho pro estado original
          // (ícone de concluir e o clique certo de novo inclusos).
          task.entregue = entregueOtimista;
          task.sequencia = sequenciaOtimista;
          if (pillEl) pillEl.classList.remove("entregando");
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
          <button type="button" class="detail-taskname-copy" id="detailTaskNameCopy" title="Copiar nome da tarefa" aria-label="Copiar nome da tarefa">
            <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
          <span class="header-priority pv-${task.priority}">${priorityLabels[task.priority]}</span>
          <div class="detail-header-pill-right">
            <div class="nav-dots-group" id="workflowSeqGroup">
              ${renderSequenciaHTML(task)}
            </div>
            <div class="status-wrap">
              <button type="button" class="status-badge" id="statusBadge">${columnsDef.find(c => c.key === task.status)?.label || task.runrunStage || "Sem etapa"}</button>
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
              <button type="button" class="pasta-copy-link-pill" id="pastaCopyLinkBtn" hidden>
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 12a4 4 0 004 4h1a4 4 0 000-8h-1M15 12a4 4 0 00-4-4H10a4 4 0 000 8h1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>Copiar link da pasta</span>
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
        ${task.id ? `<button type="button" class="upload-check-btn" id="uploadCheckBtn" title="Verificar se subiu algum arquivo novo na pasta do card">↻ Verificar upload</button>` : ""}
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

  document.getElementById("detailPlay").addEventListener("click", () => {
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
    if (tarefaViva.running) tocarTarefaNoBackend(tarefaViva.id, tarefaViva.title);
    else pausarTarefaNoBackend(tarefaViva.id);
    renderDetail();
    render();
    applyCommentsState();
    updateNowPlaying();
  });

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
  // O card mãe também pode ser movido de etapa — a trava que bloqueava
  // isso não fazia sentido, já que o Runrun.it trata ele como uma
  // tarefa normal (só fica numa etapa própria, "Cards Mães", até
  // alguém mudar).
  statusBadge.addEventListener("click", e => {
    e.stopPropagation();
    statusMenu.classList.toggle("open");
  });
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
        mostrarToast("Não consegui mover essa tarefa de etapa agora.", "erro");
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
      mostrarToast("Não consegui enviar esse comentário agora.", "erro");
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
  if (chatTabAqui) chatTabAqui.addEventListener("click", () => abrirThreadAqui(tasks[detailIdx] || task));

  const chatTabMae = document.getElementById("chatTabMae");
  if (chatTabMae) chatTabMae.addEventListener("click", () => abrirThreadDoCardMae(tasks[detailIdx] || task));

  const uploadCheckBtn = document.getElementById("uploadCheckBtn");
  if (uploadCheckBtn) {
    uploadCheckBtn.addEventListener("click", async () => {
      uploadCheckBtn.disabled = true;
      uploadCheckBtn.textContent = "Verificando...";
      await renderNotificacoesUpload(task);
      uploadCheckBtn.disabled = false;
      uploadCheckBtn.textContent = "↻ Verificar upload";
    });
  }

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

// taskId da subtarefa -> resultado de buscarCardMaeDoBackend (já com
// temPai/cardMae/subtarefas prontos). Guardado num Map à parte (não no
// objeto da tarefa) pra sobreviver mesmo se atualizarKanbanEmBackground
// trocar os objetos de tasks[] por outros novos enquanto isso.
const cardMaeCache = new Map();

/**
 * Busca o card mãe (e já deixa os comentários dele cacheados também,
 * ver chatMaeCache em js/chat-comentarios.js) assim que uma subtarefa
 * termina de abrir — sem esperar a pessoa clicar na seta pra cima.
 * Assim, quando ela clicar de verdade, abrirCardMae já acha tudo pronto
 * (abre na hora, sem esperar o Runrun.it responder de novo) e a aba
 * "Comentários card mãe" do chat também já nasce carregada.
 */
async function precarregarCardMaeEmBackground(taskId) {
  if (cardMaeCache.has(taskId)) return;
  const resultado = await buscarCardMaeDoBackend(taskId);
  if (!resultado.ok || !resultado.temPai) return;
  cardMaeCache.set(taskId, resultado);
  if (!chatMaeCache.has(taskId)) {
    const comentarios = await buscarComentariosDoBackend(resultado.cardMae.id);
    chatMaeCache.set(taskId, { id: resultado.cardMae.id, title: resultado.cardMae.title, comments: comentarios });
  }
  // Já aproveita e busca a Sequência de responsáveis do card mãe
  // também, em segundo plano — assim, se a pessoa concluir a subtarefa
  // e quiser transferir o card mãe na hora (ver verificarTransferirCardMae
  // logo abaixo), tanto saber se ele "está com ela" quanto o modal
  // "Ver regra" que abre em seguida já ficam prontos na hora, sem mais
  // nenhuma ida ao Runrun.it esperando.
  const seqResultado = await buscarSequenciaDoBackend(resultado.cardMae.id);
  resultado.cardMae.sequencia = seqResultado.sequencia;
  resultado.cardMae.workflowId = seqResultado.workflowId;
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

  // Se já foi pré-carregado (ver precarregarCardMaeEmBackground, chamado
  // assim que essa subtarefa abriu), usa direto — sem tela de
  // "Buscando..." nem espera nenhuma do Runrun.it.
  let resultado = cardMaeCache.get(task.id);
  if (!resultado) {
    mostrarCardEmBranco("Buscando o card mãe...");
    resultado = await buscarCardMaeDoBackend(task.id);
    if (resultado.ok && resultado.temPai) cardMaeCache.set(task.id, resultado);
  }

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

/**
 * Chamada depois de concluir uma subtarefa: se o card mãe dela estiver
 * com VOCÊ agora (você é o responsável atual), pergunta — num pop-up
 * grudado embaixo do botão de concluir (mesmo estilo do calendário) —
 * se quer transferir ele pro próximo já, sem precisar sair da
 * subtarefa pra ir procurar o card mãe. Como o card mãe (e a sequência
 * dele) já foram pré-carregados assim que a subtarefa abriu (ver
 * precarregarCardMaeEmBackground), isso normalmente já bate direto no
 * cache — sem esperar o Runrun.it responder de novo.
 */
async function verificarTransferirCardMae(task) {
  const resultado = cardMaeCache.get(task.id) || await buscarCardMaeDoBackend(task.id);
  if (!resultado.ok || !resultado.temPai || !resultado.cardMae) return;
  if (!nomesCorrespondem(resultado.cardMae.assignee, DESIGNER_LOGADO)) return; // card mãe não é seu, nada a fazer
  // Só mostra se a pessoa ainda estiver olhando essa mesma subtarefa
  // (não trocou de tela nesse meio-tempo).
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return;
  mostrarPromptTransferirCardMae(resultado.cardMae);
}

// Usa a ilha do topbar em vez de um pop-up preso ao botão "Concluir" —
// aquele pop-up podia ficar escondido atrás do próprio modal de detalhe
// (que fica por cima dele). A ilha fica sempre visível (position: fixed,
// z-index acima de tudo) e com botões de ação não some sozinha, só
// quando a pessoa decidir.
function mostrarPromptTransferirCardMae(cardMaeRaw) {
  mostrarIlha({
    icone: reopenIcon,
    titulo: "Transferir o card mãe?",
    subtitulo: cardMaeRaw.title,
    acoes: [
      { label: "Agora não" },
      {
        label: "Transferir",
        principal: true,
        onClick: () => {
          // Abre o modal "Ver regra" do card mãe por cima, SEM sair da
          // subtarefa — reaproveita um objeto solto (não precisa empurrar
          // pra tasks[]/navegar pra lá só pra revisar a regra). A sequência
          // já veio pré-carregada junto com o card mãe, então o modal já
          // abre pronto, sem spinner de "carregando".
          const cardMaeTask = mapearTarefaDoBackend(cardMaeRaw);
          cardMaeTask.sequencia = cardMaeRaw.sequencia;
          cardMaeTask.workflowId = cardMaeRaw.workflowId;
          abrirModalRegra(cardMaeTask);
        },
      },
    ],
  });
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

/**
 * Confere se a tarefa aberta é, ela mesma, um card mãe (tem subtarefas)
 * e liga a setinha pra baixo — mesmo quando ela chegou pro designer
 * direto numa etapa normal (ex: "Revisão"), sem passar pela etapa
 * "Card mãe" nem ter sido aberta a partir de uma subtarefa dela.
 */
async function carregarFilhosSeForCardMae(task) {
  if (!task.id || task.isMotherCard || task.parentTaskId) return;
  const taskId = task.id;
  const resultado = await buscarSubtarefasDoCardMaeNoBackend(taskId);
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return; // usuário já trocou de tarefa
  if (!resultado.ok || !resultado.ehCardMae) return;
  tasks[detailIdx].isMotherCard = true;
  tasks[detailIdx].subtarefasResumo = resultado.subtarefas || [];
  renderDetail();
}

async function buscarSubtarefasDoCardMaeNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { ok: false, error: "Backend não configurado." };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarSubtarefasDoCardMae", taskId }),
    });
    return await res.json();
  } catch (err) {
    console.error("Falha ao checar se a tarefa é um card mãe:", err);
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
  // Sem isso, uma tarefa concluída (que o Colmeia mantém viva em
  // `tasks` só pra não fechar o pop-up sozinho — ver
  // atualizarKanbanEmBackground) continuaria sendo "readicionada" pra
  // sempre a cada atualização em segundo plano, mesmo depois de a
  // pessoa já ter fechado o pop-up manualmente.
  detailIdx = -1;
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
  const running = tasks.find(t => t.running && nomesCorrespondem(t.assignee, DESIGNER_LOGADO));
  if (!running) return;
  running.running = false;
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

