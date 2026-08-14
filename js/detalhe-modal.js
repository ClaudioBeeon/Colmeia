/**
 * Sugestão de qual programa abrir, baseada no TÍTULO da tarefa (não a
 * descrição — ela só chega em `carregarTudoDaTarefa`, depois do
 * primeiro desenho do card, e essa sugestão precisa estar certa já na
 * primeira olhada). Pedido do Cláudio: peça de feed/stories sugere
 * Photoshop e Illustrator. Só essas duas por enquanto — Premiere/After
 * Effects ficam de fora até ter um link de abrir programa pra elas
 * (Adobe não tem um esquema `app://` oficial pra elas, diferente do
 * Photoshop/Illustrator, que o Cláudio configurou por fora).
 */
const SUGESTOES_DE_PROGRAMA = [
  {
    termos: ["feed", "stories", "story", "storys"],
    apps: [
      { nome: "Photoshop", sigla: "Ps", link: "adbps:///", corFundo: "#001E36", corTexto: "#31A8FF" },
      { nome: "Illustrator", sigla: "Ai", link: "adbai:///", corFundo: "#330000", corTexto: "#FF9A00" },
    ],
  },
];

function sugestoesDeProgramaParaTarefa(task) {
  const texto = normalizarParaComparar(task.title || "");
  const apps = [];
  const vistos = new Set();
  SUGESTOES_DE_PROGRAMA.forEach(regra => {
    const bateu = regra.termos.some(t => texto.includes(normalizarParaComparar(t)));
    if (!bateu) return;
    regra.apps.forEach(app => {
      if (vistos.has(app.nome)) return;
      vistos.add(app.nome);
      apps.push(app);
    });
  });
  return apps;
}

function sugestaoDeProgramaHTML(task) {
  const apps = sugestoesDeProgramaParaTarefa(task);
  if (!apps.length) return "";
  return `
    <div class="side-block">
      <span class="side-label">Sugestão pra abrir</span>
      <div class="hub-grid">
        ${apps.map(app => `
          <a href="${app.link}" class="hub-pill" style="background:${app.corFundo};color:${app.corTexto}" title="Abrir ${escaparHTML(app.nome)}">${escaparHTML(app.sigla)} ${escaparHTML(app.nome)}</a>
        `).join("")}
      </div>
    </div>
  `;
}

// Guarda quem tinha o foco antes de abrir o painel (o card do quadro,
// normalmente), pra devolver o foco pra lá quando o painel fecha — ver
// openDetail/closeDetail.
let _elementoFocoAntesDoPainel = null;

function openDetail(idx, entradaAnimacao) {
  detailIdx = Number(idx);
  childrenOpen = false;
  descMaeAberta = false;
  anexosAberta = false;
  // Subtarefa de ALTERAÇÃO abre na Descrição, igual qualquer outra tarefa
  // — NÃO na aba "Tarefa original" (2026-08-13, relatado pelo Cláudio: "o
  // pedido de ajuste está na descrição").
  //
  // Isso já foi diferente de propósito (a ideia era que a descrição dessas
  // subtarefas "costuma ser genérica ou vazia"), mas essa premissa não é
  // mais verdade: `devolverParaDesigner` (AprovacaoInterna.gs) grava o
  // MOTIVO do ajuste (+ os pontos marcados na peça) direto na descrição da
  // subtarefa, no momento em que ela é criada — é o mesmo motivo que faz
  // `renderDevolucaoNoCard` (js/detalhe-alteracao.js) desenhar a peça
  // marcada no TOPO da descrição, fora de qualquer aba, com o comentário
  // "isso não é contexto de apoio, é a instrução principal". Abrir por
  // padrão em "Tarefa original" escondia exatamente esse conteúdo atrás
  // de um clique.
  //
  // Continua abrindo o chat em "Todos os comentários" (mais rápido que
  // "Linha do tempo") — essa parte não tinha relação com o bug.
  const abrirNoContextoDeAlteracao = ehTarefaDeAlteracao(tasks[Number(idx)]);
  originalAberta = false;
  fecharChatPanel();
  renderDetail();
  const panel = document.getElementById("taskDetail");
  document.querySelectorAll(".task-card").forEach(c => c.classList.remove("selected"));
  const cardEl = document.querySelector(`.task-card[data-idx="${idx}"]`);
  if (cardEl) cardEl.classList.add("selected");
  panel.classList.add("visible");
  requestAnimationFrame(() => panel.classList.add("open"));
  // Foco entra no painel ao abrir, e volta pro card que abriu ele quando
  // fecha (2026-08-14, achado do impeccable critique: por teclado/leitor
  // de tela, abrir a tarefa não movia o foco pra lugar nenhum — ele
  // ficava preso no quadro atrás do painel). `panel.tabIndex = -1`
  // (kanban-board.js) deixa focar por JS sem entrar na ordem do Tab.
  _elementoFocoAntesDoPainel = document.activeElement;
  panel.focus({ preventScroll: true });
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
    // o chat em Todos os comentários (mais rápido que Linha do tempo,
    // que também busca os eventos do sistema — a pessoa pede essa se
    // quiser, clicando na pílula).
    abrirChatPanel(tasks[detailIdx]);
    abrirThreadTodos(tasks[detailIdx]);
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

  // O que o atendimento pediu pra mudar, com os pontos marcados na peça
  // (js/detalhe-alteracao.js). Some sozinho em tarefa que não veio de uma
  // devolução, então não precisa de checagem aqui.
  if (typeof renderDevolucaoNoCard === "function") renderDevolucaoNoCard(tasks[detailIdx]);

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
        ${avatarHTML(task.assignee, "avatar-xs", task.assigneeAvatarUrl, { runrunId: task.assigneeId })}
      </div>
    `;
    if (task.entregue) {
      return `
        <div class="workflow-seq-dots">${responsavelAtualHTML}</div>
        <button type="button" class="nav-arrow nav-deliver delivered" id="navDeliverBtn" title="Reabrir tarefa">
          ${reopenIcon}<span class="nav-deliver-label">Reabrir</span>
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
          <span class="nav-deliver-label">Entregar</span>
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
        ${reopenIcon}<span class="nav-deliver-label">Reabrir</span>
      </button>
    ` : semNinguemNaFrente ? `
      <button type="button" class="nav-arrow" id="navAddPersonBtn" title="Adicionar próxima pessoa na sequência">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="nav-arrow nav-deliver" id="navDeliverBtn" title="Entregar tarefa (não tem mais ninguém na frente)">
        <span class="nav-deliver-label">Entregar</span>
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
 * Clicou em avançar/voltar bem no meio de outra mudança na sequência
 * (adicionar/remover pessoa, ou outro avançar/voltar ainda confirmando)?
 * O cadeado `_sequenciaAcaoEmAndamento` já impede a ação de rodar — isto
 * aqui só avisa por quê, pra não parecer que o clique simplesmente não
 * funcionou (2026-08-14). Sem aviso nenhum, alguém que acabou de
 * adicionar uma pessoa e clicasse "Transferir" na sequência via só a
 * tela travada, sem entender que é de propósito e passageiro.
 */
function avisarAcaoDeSequenciaOcupada() {
  mostrarToast("Espera confirmar a mudança anterior na sequência pra continuar.", "erro");
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
      // Trava contra clique duplo (2026-08-13, bug real: mostrar a
      // animação JÁ, antes do backend confirmar, tem um efeito colateral
      // — o botão de baixo é recriado do zero no redesenho otimista, e um
      // segundo clique durante a espera caía no botão NOVO, que nasce sem
      // `disabled`. Dois avanços seguidos empurravam a sequência dois
      // passos de uma vez (relatado pelo Cláudio: acabou entregando a
      // tarefa, que era pra ficar com a próxima pessoa). O campo mora no
      // `task` (não no botão) porque é o `task` que sobrevive à
      // recriação do botão a cada redesenho.
      if (task._sequenciaAcaoEmAndamento) { avisarAcaoDeSequenciaOcupada(); return; }
      task._sequenciaAcaoEmAndamento = true;
      prevBtn.disabled = true;

      // MUDA A TELA JÁ (2026-08-13, pedido do Cláudio: "assim que eu
      // clicar já muda, se der errado desfaz depois, não quero ficar
      // esperando"). Antes disso a animação só rodava DEPOIS de esperar
      // `pararCronometroAoTransferir` terminar — e aquele `await` é uma
      // ida de verdade ao Runrun.it (pausar o cronômetro), que com a fila
      // do Apps Script congestionada passava de segundos parado sem nada
      // acontecer na tela. Agora a troca visual é a PRIMEIRA coisa, antes
      // de qualquer `await`; se o Runrun.it recusar, `carregarSequencia`
      // no fim busca o estado real e desfaz sozinha.
      if (task.sequencia && task.sequencia.length) {
        const atualIdx = task.sequencia.findIndex(s => s.atual);
        if (atualIdx > 0) {
          task.sequencia[atualIdx].atual = false;
          task.sequencia[atualIdx - 1].atual = true;
          task.sequencia[atualIdx - 1].concluido = false;
          const seqEl = document.getElementById("workflowSeqGroup");
          if (seqEl) {
            seqEl.innerHTML = renderSequenciaHTML(task);
            wireWorkflowArrows(task);
            animarMudancaDaSequencia(seqEl);
          }
        }
      }

      // As duas idas ao Runrun.it correm JUNTAS (nenhuma espera a outra
      // pra começar) — a tela já mudou, então não tem mais nada visual
      // dependendo delas; é só a confirmação de verdade chegando por trás.
      const [, novoResponsavel] = await Promise.all([
        pararCronometroAoTransferir(task),
        desfazerWorkflowNoBackend(task.id),
      ]);
      if (novoResponsavel) {
        task.assignee = novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
        agendarAtualizacaoKanban();
      }
      // Sincroniza com o Runrun.it de verdade — se a chamada acima
      // falhou, isso já devolve a sequência real (volta sozinho).
      await carregarSequencia(task);
      task._sequenciaAcaoEmAndamento = false;
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      // Trava contra clique duplo — mesmo motivo do botão de desfazer,
      // acima (ver o comentário grande lá).
      if (task._sequenciaAcaoEmAndamento) { avisarAcaoDeSequenciaOcupada(); return; }
      task._sequenciaAcaoEmAndamento = true;
      nextBtn.disabled = true;

      // Guarda quem estava com a tarefa ANTES de mexer em qualquer coisa
      // (nem a animação otimista logo abaixo ainda) — usado depois pra
      // conferir com o estado real do Runrun.it se a transferência
      // aconteceu de verdade, mesmo que a chamada abaixo devolva erro
      // (ex: Apps Script sobrecarregado/lento nesse instante).
      const atualIdxAntesDeTudo = task.sequencia && task.sequencia.length ? task.sequencia.findIndex(s => s.atual) : -1;
      const nomeAtualAntes = atualIdxAntesDeTudo !== -1 ? task.sequencia[atualIdxAntesDeTudo].nome : null;

      // MUDA A TELA JÁ, antes de qualquer `await` (mesmo motivo do botão
      // de desfazer, acima): já mostra a transferência acontecendo na
      // hora, mesmo sem confirmação nenhuma do Runrun.it ainda — se a
      // chamada de baixo falhar, o carregarSequencia final busca o estado
      // real e desfaz a animação sozinho.
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
            animarMudancaDaSequencia(seqEl);
          }
        }
      }

      // Pausar o cronômetro e avançar de verdade no Runrun.it acontecem
      // JUNTOS (não um esperando o outro terminar) — é o que tira o maior
      // pedaço da espera, já que a tela nem depende mais dessas duas
      // respostas pra parecer que "aconteceu".
      const [, resultadoAvanco] = await Promise.all([
        pararCronometroAoTransferir(task),
        avancarWorkflowNoBackend(task.id),
      ]);
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
      task._sequenciaAcaoEmAndamento = false;
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
        // Freio de segurança (2026-08-13, pedido do Cláudio): entregar uma
        // peça sem que o link de aprovação tenha sido reconhecido pelo
        // Colmeia é o erro que este freio existe pra pegar. Só interrompe
        // quando faz sentido perguntar — sem isso, some direto.
        const podeEntregar = await confirmarLinkDeAprovacaoAntesDeEntregar(task, deliverBtn);
        if (!podeEntregar) return;

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
          // Esse pause é AUTOMÁTICO (entrega), não a pessoa escolhendo
          // parar pra fazer outra coisa — não oferece "Retomar" uma
          // tarefa que acabou de ser entregue.
          if (ultimaTarefaPausada && String(ultimaTarefaPausada.id) === String(task.id)) {
            ultimaTarefaPausada = null;
            if (typeof updateNowPlaying === "function") updateNowPlaying();
          }
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
 * A "animação bem legal" pedida pelo Cláudio (2026-08-13) pra quando a
 * sequência avança/desfaz na hora do clique: um "pop" na bolinha que
 * virou a atual, o ✓ estourando na que acabou de ficar concluída, e a
 * linha entre elas crescendo da esquerda pra direita — em vez de só
 * aparecer tudo já pronto, sem transição nenhuma (o `innerHTML` inteiro é
 * trocado a cada clique, então CSS `transition` sozinho não pega: os
 * elementos nascem já no estado novo, não têm "de onde" transicionar).
 * Chamado logo depois de redesenhar `#workflowSeqGroup` com o estado
 * otimista, tanto no avançar quanto no desfazer.
 */
function animarMudancaDaSequencia(seqEl) {
  const dotAtual = seqEl.querySelector(".wf-dot.current");
  if (dotAtual) {
    dotAtual.classList.add("wf-dot-pop");
    dotAtual.addEventListener("animationend", () => dotAtual.classList.remove("wf-dot-pop"), { once: true });
  }
  seqEl.querySelectorAll(".wf-check").forEach(c => c.classList.add("wf-check-pop"));
  seqEl.querySelectorAll(".wf-line.done").forEach(l => l.classList.add("wf-line-pop"));
}

/**
 * Freio de segurança antes de marcar a tarefa como ENTREGUE (2026-08-13,
 * pedido do Cláudio): se ela tem peça (pasta do card com arquivo) e o
 * Colmeia ainda não reconheceu que foi mandada pra conferência do
 * atendimento, interrompe com a escolha "entregar assim mesmo" ou "gerar
 * link de aprovação" — em vez de deixar a peça sair de cena sem que
 * ninguém tenha pedido a conferência dela.
 *
 * Reaproveita o MESMO estado que já controla o botão "Enviar para
 * revisão"/"Acessar página de aprovação" (`task._conferenciaInfo`, ver
 * verificarRevisaoJaEnviada em js/pagina-aprovacao.js) — não existe uma
 * segunda fonte de verdade pra "isso já foi mandado?".
 *
 * Só interrompe quando faz sentido: tarefa sem pasta/peça nenhuma
 * (reunião, ajuste interno, tarefa administrativa...) segue direto, sem
 * perguntar nada — é o "só quem tem peça" que o Cláudio pediu.
 *
 * Devolve `true` quando pode entregar na hora (já tinha reconhecido, ou
 * a pessoa escolheu "entregar assim mesmo"), `false` quando parou pra
 * perguntar — escolher "gerar link" NÃO entrega sozinho depois: a pessoa
 * clica em "Entregar" de novo quando quiser (aí já não interrompe mais).
 */
async function confirmarLinkDeAprovacaoAntesDeEntregar(task, deliverBtn) {
  if (!task || !task.id) return true;

  if (task._conferenciaInfo === undefined) {
    await verificarRevisaoJaEnviada(task, document.getElementById("apvPedirBtn"));
  }
  if (task._conferenciaInfo) return true; // já reconheceu, segue normal

  const dataPecas = await chamarBackend({ acao: "listarVersoesDasPecas", taskId: task.id });
  // Sem pasta ou sem nenhuma peça pra essa tarefa: não é o tipo de tarefa
  // que passa por conferência — segue sem perguntar.
  if (!dataPecas || !dataPecas.ok || !(dataPecas.pecas || []).length) return true;

  // As duas idas ao servidor acima levam um tempinho — confere se ainda é
  // esta tarefa que está na tela antes de interromper (bug recorrente do
  // CLAUDE.md: nunca decidir em cima de uma tarefa que já não é mais a
  // que está aberta).
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return true;

  return new Promise(resolve => abrirAvisoLinkNaoReconhecido(task, deliverBtn, resolve));
}

/**
 * O popup do freio acima — mesmo vocabulário visual de abrirEscolhaDePeca
 * (cartão flutuante ancorado no botão que abriu, mais abaixo neste
 * arquivo).
 */
function abrirAvisoLinkNaoReconhecido(task, btn, resolve) {
  document.getElementById("pecasEscolhaMenu")?.remove();
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.id = "pecasEscolhaMenu";
  menu.className = "pecas-escolha-menu aviso-link-menu";
  menu.style.left = Math.round(Math.max(8, rect.right - 260)) + "px";
  menu.innerHTML = `
    <div class="pecas-escolha-titulo">Ainda não reconheci o link de aprovação</div>
    <div class="aviso-link-texto">Essa peça ainda não foi mandada pra conferência do atendimento. Quer entregar assim mesmo, ou gerar o link agora?</div>
    <button type="button" class="pecas-escolha-confirmar" id="avisoLinkGerar">Gerar link de aprovação</button>
    <button type="button" class="aviso-link-secundario" id="avisoLinkEnviar">Entregar assim mesmo</button>
  `;
  document.body.appendChild(menu);

  const alturaMenu = menu.getBoundingClientRect().height;
  const topIdeal = rect.bottom + 6;
  const top = (topIdeal + alturaMenu > window.innerHeight - 8)
    ? Math.max(8, window.innerHeight - 8 - alturaMenu)
    : topIdeal;
  menu.style.top = Math.round(top) + "px";

  let decidido = false;
  const fecharSeForaDoMenu = e => {
    if (menu.isConnected && !menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("click", fecharSeForaDoMenu, true);
      // Fechou sem escolher (clicou fora): trata como "não decidiu ainda",
      // não entrega — mais seguro que assumir qualquer um dos dois lados.
      if (!decidido) { decidido = true; resolve(false); }
    }
  };
  setTimeout(() => document.addEventListener("click", fecharSeForaDoMenu, true), 0);

  menu.querySelector("#avisoLinkEnviar").addEventListener("click", () => {
    decidido = true;
    menu.remove();
    resolve(true);
  });
  menu.querySelector("#avisoLinkGerar").addEventListener("click", async () => {
    decidido = true;
    menu.remove();
    resolve(false);
    if (typeof escolherPecasParaRevisao === "function") {
      await escolherPecasParaRevisao(task, document.getElementById("apvPedirBtn"));
    }
  });
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
      // A varredura do quadro roda 900ms depois de qualquer clique e traz o
      // estado que o Runrun.it AINDA tem (a escrita nem chegou lá) — sem
      // marcar, a etapa voltava sozinha pra antiga por um instante antes de
      // ir pra nova. Ver marcarEscritaOtimista, js/fila-offline.js.
      marcarEscritaOtimista(task, { status: null, runrunStage: voltarBtn.dataset.voltarLabel });
      redesenhar();
      const ok = await moverEtapaArbitrariaNoBackend(task.id, voltarBtn.dataset.voltarStateId);
      if (!ok) {
        task.status = statusAntigo; // Runrun.it recusou — volta pro estado real
        task.runrunStage = runrunStageAntigo;
        desmarcarEscritaOtimista(task, ["status", "runrunStage"]);
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
      // Atualiza também o nome da etapa: sem isso, um card que estava numa
      // etapa fora do quadro ("Cards Mães") continuava mostrando esse nome
      // antigo no crachá, porque é ele que aparece quando não bate com
      // nenhuma das 5 colunas.
      const colunaEscolhida = columnsDef.find(c => c.key === opt.dataset.status);
      marcarEscritaOtimista(task, {
        status: opt.dataset.status,
        runrunStage: colunaEscolhida ? colunaEscolhida.label : runrunStageAntigo,
      });
      redesenhar();
      const ok = await moverEtapaNoBackend(task.id, opt.dataset.status);
      if (!ok) {
        task.status = statusAntigo; // Runrun.it recusou — volta pro estado real
        task.runrunStage = runrunStageAntigo;
        desmarcarEscritaOtimista(task, ["status", "runrunStage"]);
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
          <span class="detail-taskname" id="detailTaskName" title="${escaparHTML(task.title)}">${escaparHTML(task.title)}</span>
          ${task.entregue ? `<span class="pill-horas-trabalhadas" title="Tempo total trabalhado nessa tarefa">${formatTime(task.timerSeconds)}</span>` : ""}
          <button type="button" class="detail-taskname-copy" id="detailTaskNameCopy" title="Copiar nome da tarefa" aria-label="Copiar nome da tarefa">
            <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>
          <!-- A pílula de prioridade (baixa/média/alta) saiu daqui
               (2026-08-14, pedido do Cláudio: "não usamos, pelo menos
               ali no pill" — o crítico já tinha notado que "baixa"
               virava ruído, sempre visível, na faixa mais cheia da
               tela). A etapa (status-badge, "Fazendo" etc.) veio pro
               lugar dela, perto do título — antes ficava lá no canto
               direito, longe de onde o olho já está. -->
          <div class="status-wrap">
            <button type="button" class="status-badge ${task.entregue ? "entregue" : ""}" id="statusBadge">${escaparHTML(rotuloDaEtapa(task))}</button>
          </div>
          <div class="detail-header-pill-right">
            <div class="nav-dots-group" id="workflowSeqGroup">
              ${renderSequenciaHTML(task)}
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
          <div class="detail-tabs" role="tablist">
            <button type="button" class="detail-tab active" id="tabDesc" role="tab" aria-selected="true">Descrição</button>
            ${task.parentTaskId ? `
              <button type="button" class="detail-tab" id="tabDescMae" role="tab" aria-selected="false">Descrição card mãe</button>
            ` : ""}
            ${ehTarefaDeAlteracao(task) ? `
              <button type="button" class="detail-tab" id="tabOriginal" role="tab" aria-selected="false" title="Ver a peça que essa alteração está pedindo pra mudar">Tarefa original</button>
            ` : ""}
            <div class="detail-tabs-spacer"></div>
            ${task.id ? `
              <button type="button" class="detail-tab anexos-tab" id="tabAnexos" role="tab" aria-selected="false" title="Arquivos da tarefa, do card mãe e das subtarefas, tudo junto">
                Anexos <span class="anexos-tab-count" id="anexosTabCount" hidden>0</span>
              </button>
            ` : ""}
          </div>
          <div class="desc-stack">
            <div class="desc-content" id="descContent">
              <!-- O que o atendimento pediu pra mudar, com os pontos marcados
                   NA IMAGEM. Fica no TOPO da descrição, fora de aba nenhuma:
                   numa tarefa de alteração isso não é contexto de apoio, é a
                   instrução principal — quem abre o card precisa ver os
                   pontos antes de qualquer outra coisa. Preenchido por
                   renderDevolucaoNoCard (js/detalhe-alteracao.js); fica
                   escondido em toda tarefa que não veio de uma devolução. -->
              <div class="devolucao-bloco" id="devolucaoBloco" hidden></div>
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
            ${task.id ? `
              <div class="anexos-content" id="anexosContent" hidden>
                <div class="anexos-secao">
                  <div class="anexos-secao-label"><span>Ações da pasta do card</span></div>
                  <div class="pill-row">
                    <button type="button" class="acao-pill" id="beeConferirBtn" title="A Bee compara o que foi pedido com o que você subiu no Drive">🐝 conferir o que falta</button>
                    <button type="button" class="acao-pill" id="beeCompararVersoesBtn" title="A Bee compara as duas versões mais recentes (arquivos '- v1', '- v2'...) da pasta do card">🔍 comparar versões</button>
                  </div>
                </div>
                <div class="anexos-secao">
                  <div class="anexos-secao-label">
                    <span>Arquivos</span>
                    <button type="button" class="acao-pill baixar-todos-pill" id="downloadAllBtn" hidden>Baixar todos</button>
                  </div>
                  <div class="pill-row" id="attachList">
                    <p class="attach-empty">Carregando anexos...</p>
                  </div>
                </div>
              </div>
            ` : ""}
          </div>
        </div>

        <div class="detail-side">
          ${task.id ? `
            <button type="button" class="apv-pedir-btn side-action-primary" id="apvPedirBtn">
              <span class="apv-pedir-btn-icone">
                <svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <span class="apv-pedir-btn-txt" id="apvPedirBtnLabel">Enviar para revisão</span>
            </button>
          ` : ""}
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
          ${sugestaoDeProgramaHTML(task)}
          <!-- Tipo + Cliente fundidos num bloco denso só (2026-08-14,
               achado do impeccable critique: 8 cards com o mesmo peso
               visual escondiam a ação principal no meio deles). -->
          <div class="side-block side-block-denso">
            <div class="side-linha-densa">
              <span class="side-label">Tipo de tarefa</span>
              <span class="badge ${type.class}">${type.label}</span>
            </div>
            <div class="side-linha-densa">
              <span class="side-label">Cliente</span>
              <div class="side-badges-row">
                <span class="badge badge-cliente">${escaparHTML(task.client)}</span>
                ${(() => {
                  const mesProjeto = extrairMesAnoDoProjeto(task.projeto);
                  return mesProjeto ? `<span class="badge badge-projeto" title="Mês do projeto (campo Projeto do Runrun.it)">${mesProjeto.label}</span>` : "";
                })()}
              </div>
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
              // Sem nenhum dos dois cadastrado: uma linha de texto avisando,
              // não dois botões fantasma a 40% de opacidade ocupando espaço
              // (2026-08-14, achado do impeccable critique).
              if (!linkPessoa && !linkCliente) {
                return ""; // Sem link nenhum cadastrado: nada aparece (2026-08-14, pedido do Cláudio)
              }
              return `
                <div class="discord-ctas">
                  ${linkPessoa ? `
                    <a href="${linkPessoa}" target="_blank" rel="noopener" class="discord-cta">
                      <span class="discord-cta-icon">${discordIcon}</span>
                      <span>Chamar no Discord</span>
                    </a>
                  ` : ""}
                  ${linkCliente ? `
                    <a href="${linkCliente}" target="_blank" rel="noopener" class="discord-cta ghost">
                      <span class="discord-cta-icon">${discordIcon}</span>
                      <span>Canal do cliente</span>
                    </a>
                  ` : ""}
                </div>
              `;
            })()}
          </div>
        </div>
      </div>

      <button type="button" class="chat-fab" id="chatFabBtn" aria-label="Abrir comentários" title="Comentários">
        ${chatIcon}
        <span class="chat-fab-badge" id="chatFabBadge" hidden>0</span>
      </button>
    </div>

    <div class="chat-panel" id="chatPanel" hidden>
      <!-- Cabeçalho: voltar na esquerda, e uma barra preta dividida em 2
           gomos — Comentários (que não muda mais de nome: quem mostra
           qual conversa está aberta é a fileira de pílulas cinzas logo
           abaixo, ver .chat-subpills) e a Bee. O botão "Verificar
           upload" saiu: o Colmeia já checa sozinho a cada 8s e sempre
           que a aba do navegador volta a ficar em foco (ver
           iniciarChecagemUploadEmSegundoPlano). -->
      <div class="chat-panel-header">
        <button type="button" class="chat-hdr-back" id="chatPanelClose" aria-label="Voltar">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="chat-hdr-bar">
          <div class="chat-abas-wrap">
            <button type="button" class="chat-aba-atual" id="chatPanelMenuBtn" aria-label="Comentários">
              <span class="chat-hdr-avatar chat-hdr-avatar-comentarios" aria-hidden="true">${chatIcon}</span>
              <span class="chat-panel-title" id="chatPanelTitle">Comentários</span>
            </button>
          </div>
          <div class="chat-hdr-bee-wrap">
            ${task.id ? `
              <button type="button" class="chat-hdr-bee" id="chatIconeBee" aria-label="Falar com a Bee" title="Bee — fica só no Colmeia">
                <span class="chat-hdr-avatar chat-hdr-avatar-bee" aria-hidden="true">${beeIcon}</span>
                <span class="chat-hdr-bee-texto">Bee</span>
              </button>
            ` : `<span class="chat-hdr-bee chat-hdr-bee-vazio" aria-hidden="true"></span>`}
          </div>
        </div>
      </div>
      ${task.id ? `
        <div class="chat-subpills" id="chatSubpills" role="tablist">
          <button type="button" class="chat-subpill active" id="chatSubAqui" role="tab" aria-selected="true">Comentários</button>
          <button type="button" class="chat-subpill" id="chatSubMae" role="tab" aria-selected="false" ${task.parentTaskId ? "" : "hidden"}>Card mãe</button>
          <button type="button" class="chat-subpill" id="chatSubTodos" role="tab" aria-selected="false" title="Comentários desta tarefa, do card mãe, da tarefa original e da Bee, tudo junto por hora">Todos os comentários</button>
          <button type="button" class="chat-subpill" id="chatSubLinha" role="tab" aria-selected="false" title="Todos os comentários + eventos do sistema (criada, começou a trabalhar, arquivo, entregue)">Linha do tempo</button>
        </div>
        <div class="chat-bee-toggle-row" id="chatBeeToggleRow" hidden>
          <label class="chat-bee-toggle">
            <input type="checkbox" id="chatBeeToggleInput" ${chatMostrarBeeNoUnificado ? "checked" : ""}>
            <span class="chat-bee-toggle-track"><span class="chat-bee-toggle-bolinha"></span></span>
            <span class="chat-bee-toggle-label">Mostrar comentários da Bee</span>
          </label>
        </div>
      ` : ""}
      <div class="comments-thread" id="commentsThread" aria-live="polite">
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
        <div class="chat-hdr-menu chat-destino-menu" id="chatDestinoMenu" hidden>
          <button type="button" class="chat-panel-tab" data-destino="aqui">Nesta tarefa</button>
          <button type="button" class="chat-panel-tab" id="chatDestinoMae" data-destino="mae" hidden>Card mãe</button>
          <button type="button" class="chat-panel-tab" id="chatDestinoOriginal" data-destino="original" hidden>Tarefa principal</button>
          <button type="button" class="chat-panel-tab" id="chatDestinoTodos" data-destino="todos">Todos</button>
        </div>
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
    else { pausarTarefaNoBackend(tarefaViva.id); marcarUltimaTarefaPausada(tarefaViva.id); }
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

  // O caminho MANUAL de mandar a peça pra conferência do atendimento. O
  // caminho automático é a fala da Bee de "arquivo novo"
  // (js/notificacoes-uploads.js) — este botão existe porque aquela fala
  // depende de uma varredura de 8s da pasta e some quando é dispensada.
  // Sem ele, uma peça podia ficar parada só porque a notificação passou
  // batido. Mesmo par de "Criar pasta do card" + "Linkar pasta certa".
  const apvPedirBtn = document.getElementById("apvPedirBtn");
  if (apvPedirBtn && typeof pedirAprovacaoDoAtendimento === "function") {
    apvPedirBtn.addEventListener("click", () => {
      // Já mandada: o botão vira um atalho pra própria página de
      // aprovação, em vez de mandar de novo (ver verificarRevisaoJaEnviada).
      const link = apvPedirBtn.dataset.linkRevisao;
      if (link) { window.open(link, "_blank", "noopener"); return; }
      pedirAprovacaoDoAtendimento(task, apvPedirBtn);
    });
    verificarRevisaoJaEnviada(task, apvPedirBtn);
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
      // Otimista: a estimativa nova já vale na tela (a barra de progresso
      // do card se recalcula em cima dela), e volta sozinha se o Runrun.it
      // recusar.
      const estimativaAntes = task.estimateMinutes;
      marcarEscritaOtimista(task, { estimateMinutes: Math.round(horas * 60) });
      render();
      ajustarEstimativaNoBackend(task.id, horas * 60).then(ok => {
        if (ok) return;
        task.estimateMinutes = estimativaAntes;
        desmarcarEscritaOtimista(task, ["estimateMinutes"]);
        render();
        mostrarToast("Não consegui ajustar a estimativa agora. Tenta de novo em alguns segundos.", "erro");
      });
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

    document.getElementById("descEditSalvar").addEventListener("click", () => {
      const original = document.getElementById("descTextReal");
      const novoHtml = original.innerHTML;
      // Otimista: fecha o editor na hora, sem o botão virar "Salvando...".
      // Se o Runrun.it recusar, o editor VOLTA a abrir com o texto que a
      // pessoa escreveu — o trabalho dela nunca se perde por causa disso.
      original.contentEditable = "false";
      original.classList.remove("editando");
      document.getElementById("descEditActions").hidden = true;
      editarDescricaoBtn.hidden = false;

      salvarDescricaoNoBackend(task.id, novoHtml).then(ok => {
        if (ok) return;
        const aindaAberta = document.getElementById("descTextReal");
        if (aindaAberta && tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id)) {
          aindaAberta.innerHTML = novoHtml;
          aindaAberta.contentEditable = "true";
          aindaAberta.classList.add("editando");
          document.getElementById("descEditActions").hidden = false;
          editarDescricaoBtn.hidden = true;
        }
        mostrarToast("Não consegui salvar a descrição agora. Tenta de novo em alguns segundos.", "erro");
      });
    });
  }

  // ===== Abas Descrição / Descrição card mãe / Tarefa original
  // (sem re-renderizar, com transição) =====
  document.getElementById("tabDesc").addEventListener("click", () => {
    descMaeAberta = false;
    originalAberta = false;
    anexosAberta = false;
    applyCommentsState();
  });
  const tabDescMae = document.getElementById("tabDescMae");
  if (tabDescMae) {
    tabDescMae.addEventListener("click", () => {
      descMaeAberta = true;
      originalAberta = false;
      anexosAberta = false;
      applyCommentsState();
      carregarDescricaoCardMae(tasks[detailIdx] || task);
    });
  }
  const tabOriginal = document.getElementById("tabOriginal");
  if (tabOriginal) {
    tabOriginal.addEventListener("click", () => {
      originalAberta = true;
      descMaeAberta = false;
      anexosAberta = false;
      applyCommentsState();
      carregarTarefaOriginalDaAlteracao(tasks[detailIdx] || task);
    });
  }
  const tabAnexos = document.getElementById("tabAnexos");
  if (tabAnexos) {
    tabAnexos.addEventListener("click", () => {
      anexosAberta = true;
      descMaeAberta = false;
      originalAberta = false;
      applyCommentsState();
      // Já buscou antes (voltou pra essa aba de novo)? Não busca de novo
      // — evita repetir a busca da família inteira (card mãe + irmãs) a
      // cada troca de aba. redesenharAnexosGuardados no fim do
      // renderDetail cobre o caso de reabrir depois de um re-render.
      const alvo = tasks[detailIdx] || task;
      if (!anexosJaBuscados.has(String(alvo.id))) carregarAnexos(alvo);
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
  // Anexos tem o mesmo cuidado, mas via redesenharAnexosGuardados no
  // fim desta função (chamado sempre, não só quando anexosAberta).
  if (descMaeAberta) carregarDescricaoCardMae(tasks[detailIdx] || task);
  if (originalAberta) carregarTarefaOriginalDaAlteracao(tasks[detailIdx] || task);

  const commentInput = document.getElementById("commentInput");
  let arquivoParaAnexar = null;

  /**
   * O envio de verdade — manda pra UM destino (alvoId). Compartilhado
   * entre o caminho normal (Comentários/Card mãe, onde o destino já é
   * óbvio) e o seletor de destino de Todos os comentários/Linha do
   * tempo (onde a pessoa escolhe, e "Todos" chama isso uma vez por
   * destino em sequência).
   */
  async function enviarParaAlvo(alvoId, texto, arquivoAtual, ofereceRepetir) {
    // No Runrun.it de verdade, "@Nome" escolhido na lista vira uma menção
    // de verdade (a pessoa é avisada) — não é só texto colorido. O jeito
    // que o Runrun.it manda ISSO pra gente quando LÊ um comentário é
    // "<mention>@Nome</mention>" dentro do texto (ver formatarMencoes,
    // js/regras-briefing.js) — então é essa mesma marcação que a gente
    // manda de volta pra ELE reconhecer como menção de verdade ao criar
    // o comentário, não só "@Nome" solto.
    const textoParaEnviar = converterMencoesParaTagRunrun(texto);

    // Mostra a bolha na hora (opaca/pendente), antes mesmo do Runrun.it
    // confirmar — assim que confirma, ela "acende" (muda de cor).
    const thread = document.getElementById("commentsThread");
    const idTemporario = "pendente-" + Date.now() + "-" + alvoId;
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

    // adicionarComentarioComAnexo NÃO passa pela fila offline (não está em
    // ACOES_QUE_PODEM_ESPERAR — anexo é grande demais pra guardar no
    // localStorage), então só tem sim/não. O comentário de texto puro
    // passa pela fila, e "enfileirado" é um terceiro estado: NEM chegou a
    // ir pro Runrun.it ainda, NEM falhou — está guardado, vai sozinho
    // quando a internet voltar (ver enviarComentarioNoBackend e o
    // comentário grande logo abaixo, no "if (enfileirado)").
    const resultado = arquivoAtual
      ? { ok: await enviarComentarioComAnexoNoBackend(alvoId, textoParaEnviar, arquivoAtual) }
      : await enviarComentarioNoBackend(alvoId, textoParaEnviar);
    const ok = resultado.ok;
    const enfileirado = !!resultado.enfileirado;

    const bolhaTemporaria = document.querySelector(`.comment-bubble[data-comment-id="${idTemporario}"]`);
    if (enfileirado) {
      // ⚠️ NÃO chama recarregarThreadAtiva aqui: esse comentário ainda
      // NÃO existe no Runrun.it (só foi guardado localmente pra mandar
      // quando a internet voltar). Rebuscar os comentários agora traria a
      // lista de volta SEM ele, e a recarga apagaria a bolha que acabou
      // de aparecer — era esse o bug: a pessoa comentava, via a bolha, e
      // ela sumia sozinha (mesmo o comentário estando salvo e indo ser
      // enviado de verdade em breve — js/fila-offline.js reenvia sozinho
      // e, quando conseguir, também atualiza essa conversa se ainda
      // estiver aberta na tela).
      if (bolhaTemporaria) {
        bolhaTemporaria.classList.remove("pending");
        bolhaTemporaria.classList.add("aguardando-rede");
        const horaEl = bolhaTemporaria.querySelector(".comment-time");
        if (horaEl) horaEl.textContent = "Sem internet — envio sozinho quando voltar";
      }
      mostrarToast("Sem internet agora. Guardei o comentário e mando sozinho quando a conexão voltar.", "erro");
    } else if (ok) {
      // Confirma visualmente (some o opaco/pendente) até a lista real
      // substituir tudo.
      if (bolhaTemporaria) bolhaTemporaria.classList.remove("pending");
      // O comentário criado JÁ VEIO na resposta do envio (ver
      // adicionarComentario, RunrunEscrita.gs): acrescenta ele na fonte
      // única e redesenha a partir dela — SEM rebuscar nada. Antes, aqui
      // ia uma rebusca da conversa (e, nas abas unificadas, uma remontagem
      // que buscava de novo a tarefa original, o card mãe, a Bee e os
      // eventos): ~5 idas ao servidor pra mostrar o que a pessoa acabou de
      // escrever e que já estava na tela — a "piscada ao comentar".
      //
      // Sem o objeto (backend antigo, ou o Runrun.it respondendo sem
      // corpo), cai no caminho de sempre — nada quebra, só volta a ser
      // lento nesse caso.
      if (resultado.comentario && typeof acrescentarComentarioNaFonte === "function") {
        acrescentarComentarioNaFonte(alvoId, resultado.comentario);
        if (bolhaTemporaria) bolhaTemporaria.remove(); // a definitiva entra no lugar
        redesenharThreadAtiva();
      } else {
        // ESPERA a thread recarregar antes de oferecer o "repetir no card
        // mãe?" — a recarga redesenha a conversa e levava o aviso junto,
        // então ele aparecia e sumia num piscar.
        await recarregarThreadAtiva();
      }
      agendarAtualizacaoKanban();
      if (ofereceRepetir && task.parentTaskId && texto) mostrarPromptRepetirComentario(task, textoParaEnviar);
      // Link do Drive colado num comentário normal (sem arrastar
      // arquivo nenhum) — pedido do Cláudio (2026-08-04): "comentei o
      // link do drive, mas não apareceu a mensagem da Bee". Mesmas 3
      // ações da pasta, só que avisadas por PALAVRA, não por upload de
      // verdade (ver beeAvisarLinkDriveNoComentario, Bee.gs).
      if (texto && /drive\.google\.com\/\S+/i.test(texto)) avisarBeeSobreLinkDriveNoComentario(alvoId);
    } else {
      if (bolhaTemporaria) bolhaTemporaria.remove(); // não foi enviado — some a bolha
      mostrarToast("Não consegui enviar esse comentário agora.", "erro");
    }
    return ok;
  }

  /**
   * Lista de destinos possíveis pra essa tarefa — usada tanto pra
   * decidir quais botões mostrar no seletor quanto pra resolver a
   * escolha "Todos".
   */
  function destinosDisponiveis(t) {
    const destinos = { aqui: t.id, mae: idDoCardMae(t), original: null };
    const original = acharTarefaOriginalDaAlteracao(t);
    if (original) destinos.original = original.id;
    return destinos;
  }

  /**
   * Todos os comentários/Linha do tempo escrevem em MAIS de um lugar
   * possível — em vez de escolher um destino sozinho, pergunta onde a
   * pessoa quer comentar (pedido do Cláudio). "Todos" manda a MESMA
   * mensagem, em sequência, pra cada destino que existir.
   */
  function abrirEscolhaDeDestino() {
    const menu = document.getElementById("chatDestinoMenu");
    if (!menu) return;
    const t = tasks[detailIdx] || task;
    const destinos = destinosDisponiveis(t);
    const maeBtn = document.getElementById("chatDestinoMae");
    if (maeBtn) maeBtn.hidden = !destinos.mae;
    const originalBtn = document.getElementById("chatDestinoOriginal");
    if (originalBtn) originalBtn.hidden = !destinos.original;
    // "Todos" só faz sentido quando existe mais de um destino de verdade
    // — com só "Nesta tarefa" disponível, seria um botão duplicado.
    const todosBtn = document.getElementById("chatDestinoTodos");
    if (todosBtn) todosBtn.hidden = !destinos.mae && !destinos.original;
    menu.hidden = false;
  }

  const chatDestinoMenu = document.getElementById("chatDestinoMenu");
  if (chatDestinoMenu) {
    chatDestinoMenu.addEventListener("click", async e => {
      const btn = e.target.closest("button[data-destino]");
      if (!btn) return;
      chatDestinoMenu.hidden = true;
      const texto = commentInput.value.trim();
      if (!texto && !arquivoParaAnexar) return;
      const arquivoAtual = arquivoParaAnexar;
      commentInput.value = "";
      commentInput.disabled = true;
      limparAnexoSelecionado();

      const t = tasks[detailIdx] || task;
      const destinos = destinosDisponiveis(t);
      const escolha = btn.dataset.destino;
      const alvos = escolha === "todos"
        ? [destinos.aqui, destinos.mae, destinos.original].filter(Boolean)
        : [destinos[escolha]].filter(Boolean);

      for (const alvoId of alvos) await enviarParaAlvo(alvoId, texto, arquivoAtual, false);
      commentInput.disabled = false;
    });
  }

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
    // Todos os comentários/Linha do tempo: não manda direto, pergunta
    // onde primeiro (ver abrirEscolhaDeDestino).
    if (chatThreadAtivo === "todos" || chatThreadAtivo === "linha") {
      abrirEscolhaDeDestino();
      return;
    }
    if (!chatAlvoTaskId) {
      console.warn("Essa tarefa não está conectada ao Runrun.it, não dá pra comentar de verdade.");
      return;
    }
    const alvoId = chatAlvoTaskId;
    const arquivoAtual = arquivoParaAnexar;
    commentInput.value = "";
    commentInput.disabled = true;
    limparAnexoSelecionado();
    await enviarParaAlvo(alvoId, texto, arquivoAtual, chatThreadAtivo === "aqui");
    commentInput.disabled = false;
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
  if (sendBtn) {
    sendBtn.addEventListener("click", e => {
      // stopPropagation: enviarComentarioAtual() pode abrir o seletor de
      // destino (#chatDestinoMenu) nos merges — sem isso, esse MESMO
      // clique borbulhava até o handler global de "fechar tudo" (fim de
      // js/kanban-board.js) e fechava o menu no instante em que abria.
      e.stopPropagation();
      enviarComentarioAtual();
    });
  }

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

  // Clicar no gomo "Comentários" do cabeçalho enquanto a Bee está aberta
  // volta pra última conversa de comentários (mesma ideia do botão da
  // Bee, que faz o caminho contrário) — um controle segmentado, clicar
  // no lado apagado acende ele.
  const chatPanelMenuBtn = document.getElementById("chatPanelMenuBtn");
  if (chatPanelMenuBtn) {
    chatPanelMenuBtn.addEventListener("click", () => {
      if (chatThreadAtivo === "bee") abrirThreadComentarios(tasks[detailIdx] || task);
    });
  }

  // As pílulas cinzas logo abaixo do cabeçalho — cada uma troca de
  // conversa sem reabrir o painel inteiro.
  const chatSubAqui = document.getElementById("chatSubAqui");
  if (chatSubAqui) chatSubAqui.addEventListener("click", () => abrirThreadAqui(tasks[detailIdx] || task));

  const chatSubMae = document.getElementById("chatSubMae");
  if (chatSubMae) chatSubMae.addEventListener("click", () => abrirThreadDoCardMae(tasks[detailIdx] || task));

  const chatSubTodos = document.getElementById("chatSubTodos");
  if (chatSubTodos) chatSubTodos.addEventListener("click", () => abrirThreadTodos(tasks[detailIdx] || task));

  const chatSubLinha = document.getElementById("chatSubLinha");
  if (chatSubLinha) chatSubLinha.addEventListener("click", () => abrirThreadLinha(tasks[detailIdx] || task));

  // Interruptor "mostrar comentários da Bee" — só aparece em Todos os
  // comentários/Linha do tempo (ver marcarAbaBeeAtiva e as duas funções
  // acima, que mostram/escondem #chatBeeToggleRow conforme a pílula).
  const chatBeeToggleInput = document.getElementById("chatBeeToggleInput");
  if (chatBeeToggleInput) {
    chatBeeToggleInput.addEventListener("change", () => alternarBeeNoUnificado(chatBeeToggleInput.checked));
  }

  const beeConferirBtn = document.getElementById("beeConferirBtn");
  if (beeConferirBtn) beeConferirBtn.addEventListener("click", () => conferirEntregaComABee(tasks[detailIdx] || task, beeConferirBtn));

  const beeCompararVersoesBtn = document.getElementById("beeCompararVersoesBtn");
  if (beeCompararVersoesBtn) beeCompararVersoesBtn.addEventListener("click", () => compararVersoesComABee(tasks[detailIdx] || task, beeCompararVersoesBtn));

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

  atualizarSubpillsAtivas();
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
  const tabAnexos = document.getElementById("tabAnexos");
  const descContent = document.getElementById("descContent");
  const descMaeContent = document.getElementById("descMaeContent");
  const originalContent = document.getElementById("originalContent");
  const anexosContent = document.getElementById("anexosContent");
  if (childrenPanel) childrenPanel.classList.toggle("open", childrenOpen);
  // Abas mutuamente exclusivas: Descrição (a padrão), Descrição card mãe,
  // Tarefa original (só em subtarefa de alteração), Anexos.
  const descAberta = !descMaeAberta && !originalAberta && !anexosAberta;
  if (tabDesc) { tabDesc.classList.toggle("active", descAberta); tabDesc.setAttribute("aria-selected", String(descAberta)); }
  if (tabDescMae) { tabDescMae.classList.toggle("active", descMaeAberta); tabDescMae.setAttribute("aria-selected", String(descMaeAberta)); }
  if (tabOriginal) { tabOriginal.classList.toggle("active", originalAberta); tabOriginal.setAttribute("aria-selected", String(originalAberta)); }
  if (tabAnexos) { tabAnexos.classList.toggle("active", anexosAberta); tabAnexos.setAttribute("aria-selected", String(anexosAberta)); }
  if (descContent) descContent.hidden = descMaeAberta || originalAberta || anexosAberta;
  if (descMaeContent) descMaeContent.hidden = !descMaeAberta;
  if (originalContent) originalContent.hidden = !originalAberta;
  if (anexosContent) anexosContent.hidden = !anexosAberta;
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

  // Devolve o foco pra quem tinha ele antes de abrir (o card do quadro,
  // normalmente) — ver openDetail. `isConnected` porque o card pode ter
  // sumido da tela enquanto a tarefa estava aberta (movida de coluna,
  // atualização em segundo plano).
  if (_elementoFocoAntesDoPainel && _elementoFocoAntesDoPainel.isConnected) {
    _elementoFocoAntesDoPainel.focus({ preventScroll: true });
  }
  _elementoFocoAntesDoPainel = null;
}

/**
 * Esc fecha só a camada de cima, não o painel inteiro de uma vez
 * (2026-08-14, achado do impeccable critique: Esc era global e
 * incondicional — apagava um comentário meio escrito, ou fechava o
 * painel com o seletor de destino/emoji/menções ainda aberto). Cada
 * `if` aqui é uma camada; a primeira que estiver mesmo aberta ganha o
 * Esc e para a função ali — o painel só fecha quando nenhuma delas
 * está no caminho.
 */
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const panel = document.getElementById("taskDetail");
  if (!panel || !panel.classList.contains("open")) return;

  const mentionList = document.getElementById("mentionList");
  if (mentionList && !mentionList.hidden) { mentionList.hidden = true; return; }

  const emojiPicker = document.getElementById("emojiPicker");
  if (emojiPicker && !emojiPicker.hidden) { emojiPicker.hidden = true; return; }

  const reactPicker = document.querySelector(".comment-react-picker:not([hidden])");
  if (reactPicker) { reactPicker.hidden = true; return; }

  const chatDestinoMenu = document.getElementById("chatDestinoMenu");
  if (chatDestinoMenu && !chatDestinoMenu.hidden) { chatDestinoMenu.hidden = true; return; }

  const descEditando = document.getElementById("descTextReal");
  if (descEditando && descEditando.classList.contains("editando")) {
    document.getElementById("descEditCancelar")?.click();
    return;
  }

  // Comentário com texto ainda não enviado: o primeiro Esc só tira o
  // foco (chance de perceber e não perder o que escreveu), o segundo
  // fecha o painel de verdade.
  const commentInput = document.getElementById("commentInput");
  if (commentInput && commentInput.value.trim() && document.activeElement === commentInput) {
    commentInput.blur();
    return;
  }

  if (panel.classList.contains("chat-open")) { fecharChatPanel(); return; }

  closeDetail();
});

/**
 * Arrastar arquivo pro card — sobe pro Drive na pasta certa e comenta
 * sozinho (pedido do Cláudio, 2026-08-03). Jogar um arquivo do computador
 * em cima do card aberto sobe ele pra pasta do Drive dela (cria a pasta na
 * hora se ainda não existir, mesmo caminho do botão "Criar pasta do
 * card") e posta um comentário avisando — sem precisar abrir o Drive nem
 * escrever nada.
 *
 * TUDO ligado no `document`, não no `#taskDetail` — bug encontrado em
 * 2026-08-04: até essa data, `#taskDetail` era recriado do zero a cada
 * `buildBoard()` (js/kanban-board.js, removia o painel antigo e criava um
 * elemento novo com o mesmo id, TODA vez que rodava — poll de fundo
 * incluso). `wireArrastarArquivoParaCard()` só roda UMA vez, na carga do
 * script — antes de `buildBoard()` sequer ter rodado — então o
 * `document.getElementById("taskDetail")` daquela hora dava `null` e a
 * função saía sem religar nada em lugar nenhum. Todo drop, mesmo com o
 * card aberto de verdade, caía direto na rede de segurança (o aviso "abra
 * uma tarefa primeiro"), porque não existia NENHUM escutador preso no
 * painel de verdade.
 *
 * A troca: em vez de escutar no painel, escuta no `document` sempre, e
 * cada evento decide na hora se o mouse está `.closest("#taskDetail")`
 * ou não. `buildBoard()` HOJE (2026-08-13) só cria o painel se ele ainda
 * não existir — não recria mais a cada rodada (era a causa de um bug
 * parecido: link direto pra tarefa que fechava sozinho, o painel sendo
 * arrancado da tela no meio do carregamento) — mas o padrão de escutar no
 * `document` continua sendo o certo aqui: mais simples que reconciliar o
 * listener toda vez que o painel precisar ser recriado por qualquer outro
 * motivo no futuro.
 */
const LIMITE_UPLOAD_ARRASTADO_BYTES = 30 * 1024 * 1024; // 30MB — folgado pra imagem/PSD comum, sem travar o navegador com vídeo grande

function temArquivoNoDrag(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
}

function wireArrastarArquivoParaCard() {
  document.addEventListener("dragover", e => {
    if (!temArquivoNoDrag(e)) return;
    e.preventDefault();
    const panel = e.target.closest && e.target.closest("#taskDetail");
    document.querySelectorAll(".arquivo-sobre-card").forEach(el => {
      if (el !== panel) el.classList.remove("arquivo-sobre-card");
    });
    if (panel) panel.classList.add("arquivo-sobre-card");
  });

  document.addEventListener("dragend", () => {
    document.querySelectorAll(".arquivo-sobre-card").forEach(el => el.classList.remove("arquivo-sobre-card"));
  });

  document.addEventListener("drop", e => {
    if (!temArquivoNoDrag(e)) return;
    e.preventDefault();
    document.querySelectorAll(".arquivo-sobre-card").forEach(el => el.classList.remove("arquivo-sobre-card"));

    const panel = e.target.closest && e.target.closest("#taskDetail");
    if (!panel) {
      // Drop fora de qualquer card aberto — sem isso, o PRÓPRIO
      // NAVEGADOR assume o drop e abre o arquivo direto na aba, saindo
      // do Colmeia inteiro (foi o que aconteceu quando o Cláudio testou
      // em 2026-08-03: "a foto abriu no navegador").
      mostrarToast("Abra uma tarefa primeiro pra soltar o arquivo nela.", "erro");
      return;
    }
    const task = tasks[detailIdx];
    if (!task || !task.id) return;
    Array.from(e.dataTransfer.files || []).forEach(arquivo => subirArquivoArrastadoParaCard(task, arquivo));
  });
}

async function subirArquivoArrastadoParaCard(task, arquivo) {
  if (arquivo.size > LIMITE_UPLOAD_ARRASTADO_BYTES) {
    mostrarToast(`“${arquivo.name}” passa de 30MB — sobe direto pela pasta do Drive.`, "erro");
    return;
  }
  const idAoSoltar = task.id;
  try {
    const base64Dados = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.readAsDataURL(arquivo);
    });
    const data = await chamarBackend({
      acao: "subirArquivoNoCard",
      dados: {
        taskId: idAoSoltar,
        cliente: task.client,
        tituloCard: task.title,
        projeto: task.projeto,
        nomeArquivo: arquivo.name,
        mimeType: arquivo.type || "application/octet-stream",
        base64Dados,
      },
    });
    if (!data.ok) {
      mostrarToast(data.error || `Não consegui subir "${arquivo.name}" pro Drive agora.`, "erro");
      return;
    }
    // A tarefa pode ter trocado enquanto o upload rodava (fechou o card,
    // abriu outro) — o comentário vai pra tarefa CERTA (idAoSoltar) do
    // mesmo jeito; só a pílula da pasta na tela é que só faz sentido
    // atualizar se o card daquele arquivo ainda for o que está aberto.
    if (tasks[detailIdx] && String(tasks[detailIdx].id) === String(idAoSoltar)) {
      tasks[detailIdx].pastaUrlSalva = data.pastaUrl;
      mostrarPillCopiarLinkDaPasta(data.pastaUrl);
    }
    mostrarToast(`“${data.nomeFinal}” enviado pro Drive.`, "sucesso");
    enviarEscritaNoBackend(
      { acao: "adicionarComentario", taskId: idAoSoltar, texto: `📎 Novo arquivo na pasta do card: ${data.nomeFinal}` },
      "avisar sobre o arquivo novo"
    );
    avisarBeeSobreUploadNovo(idAoSoltar, data.nomeFinal);
    // Puxa a fala do arquivo novo AGORA, sem esperar a varredura de 8s
    // (pedido do Cláudio, 2026-08-08: ela é que traz "Enviar para
    // revisão", e chegava bem depois da outra). O backend acabou de
    // limpar o cache de 15s dessa tarefa em subirArquivoNoCard, então
    // esta chamada já enxerga o arquivo que acabou de subir.
    if (tasks[detailIdx] && String(tasks[detailIdx].id) === String(idAoSoltar)) {
      renderNotificacoesUpload(tasks[detailIdx]);
    }
  } catch (err) {
    console.error("Falha ao subir arquivo arrastado:", err);
    mostrarToast(`Falha de conexão ao subir “${arquivo.name}”.`, "erro");
  }
}

/**
 * Depois de subir um arquivo arrastado, a Bee registra uma fala DE
 * VERDADE (persistida — ver beeAvisarUploadNovo, Bee.gs) oferecendo as
 * 3 ações da pasta do card. Pedido do Cláudio (2026-08-04): "esse é um
 * comentário real da Bee, que fica ali". beeConversas/desenharThreadBee
 * são de js/bee.js, carregado DEPOIS deste arquivo — daí o typeof-guard.
 */
async function avisarBeeSobreUploadNovo(taskId, nomeArquivo) {
  registrarFalaDaBeeSobrePasta(taskId, await chamarBackend({ acao: "beeAvisarUploadNovo", taskId, nomeArquivo }), "upload");
}

/**
 * Mesmas 3 ações da pasta do card, avisadas a partir de um link do Drive
 * colado num comentário normal (em vez de um arquivo arrastado de
 * verdade) — ver beeAvisarLinkDriveNoComentario, Bee.gs, e o gancho em
 * enviarParaAlvo, acima.
 */
async function avisarBeeSobreLinkDriveNoComentario(taskId) {
  registrarFalaDaBeeSobrePasta(taskId, await chamarBackend({ acao: "beeAvisarLinkDriveNoComentario", taskId }), "link");
}

/**
 * `origem` diz de onde veio a fala — "upload" (arquivo arrastado pro card)
 * ou "link" (link do Drive colado num comentário). Só o segundo desenha a
 * bolha automática aqui; ver o comentário longo lá embaixo.
 */
function registrarFalaDaBeeSobrePasta(taskId, dataBee, origem) {
  if (!dataBee || !dataBee.ok) return;
  if (typeof beeConversas === "undefined") return;
  beeConversas.set(taskId, dataBee.conversa);
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return; // saiu da tarefa nesse meio-tempo

  // Trocar de aba sozinho pra Bee foi tentado (2026-08-04) e o Cláudio
  // pediu pra tirar: ele quer ver a oferta DENTRO do chat de Comentários,
  // sem ser levado pra dentro da conversa da Bee ("Bee resumiu essas
  // coisas..."). A fala continua sendo salva de verdade na conversa dela
  // (pra quem abrir a aba da Bee depois ver no histórico); só a
  // exibição automática agora é local, no mesmo lugar do aviso "repetir
  // no card mãe?" (mostrarPromptRepetirComentario,
  // js/notificacoes-uploads.js) — #beeInlineAvisos, fora da lista de
  // comentários, imune a ela ser redesenhada sozinha.
  if (chatThreadAtivo === "bee" && typeof desenharThreadBee === "function") {
    desenharThreadBee(tasks[detailIdx]);
    return;
  }

  // DUAS FALAS PRO MESMO ARQUIVO, e o Cláudio pediu pra ficar uma só
  // (2026-08-08). Quem sobe um arquivo arrastando via UPLOAD DO COLMEIA
  // recebia esta bolha ("Subiu X na pasta do card. Quer que eu faça algo
  // com isso?", com conferir/comparar) e, alguns segundos depois, a de
  // renderNotificacoesUpload (js/notificacoes-uploads.js) — a que tem o
  // mosaico de miniaturas E o "Enviar para revisão", que é a ação que
  // importa. Duas bolhas sobre o mesmo arquivo, uma sem a ação principal.
  //
  // A fala continua sendo GRAVADA na conversa da Bee (beeConversas acima):
  // quem abrir a aba dela depois vê o histórico completo, como sempre. O
  // que saiu foi só a bolha automática aqui no chat de Comentários.
  //
  // ⚠️ O caminho do LINK DO DRIVE COLADO num comentário
  // (avisarBeeSobreLinkDriveNoComentario) continua mostrando ela, e tem
  // que continuar: ali não subiu arquivo nenhum pela pasta, então
  // renderNotificacoesUpload não tem o que encontrar — sem esta bolha, a
  // Bee ficaria muda naquele caso.
  if (origem === "upload") return;

  const ultimaFala = (dataBee.conversa || [])[dataBee.conversa.length - 1];
  mostrarAvisoAcoesPastaInline(tasks[detailIdx], (ultimaFala && ultimaFala.texto) || "Quer que eu faça algo com isso?");
}

/**
 * A oferta das ações da pasta ("conferir o que falta"/"comparar versões")
 * aparecendo DIRETO no chat de Comentários — não troca de
 * aba, não mexe na conversa da Bee que está na tela. Reaproveita
 * bolhaDaBee/renderAcoesPastaHTML (js/bee.js, carregado depois — daí o
 * typeof-guard) só pro VISUAL da bolha; os botões chamam as mesmas ações
 * de sempre, que continuam livres pra abrir a aba da Bee se precisarem
 * mostrar um resultado mais longo (ex: conferirEntregaComABee).
 */
function mostrarAvisoAcoesPastaInline(task, texto) {
  const avisos = document.getElementById("beeInlineAvisos");
  if (!avisos || typeof bolhaDaBee !== "function" || typeof renderAcoesPastaHTML !== "function") return;
  document.getElementById("beeAcoesPastaAviso")?.remove();
  avisos.insertAdjacentHTML("beforeend", `<div id="beeAcoesPastaAviso">${bolhaDaBee(renderAcoesPastaHTML({ texto }), -1)}</div>`);
  const wrap = document.getElementById("beeAcoesPastaAviso");
  wrap.querySelectorAll("[data-acao-pasta]").forEach(btn => {
    btn.addEventListener("click", () => {
      const alvo = tasks[detailIdx] || task;
      if (btn.dataset.acaoPasta === "conferir") conferirEntregaComABee(alvo, btn);
      else if (btn.dataset.acaoPasta === "comparar") compararVersoesComABee(alvo, btn);
      wrap.remove();
    });
  });
}

wireArrastarArquivoParaCard();

/**
 * ONDE FOI PARAR O "LINK DE APROVAÇÃO" (2026-08-06)
 *
 * Este arquivo tinha o botão que gerava o link do cliente direto do card
 * (`gerarLinkDeAprovacaoParaTarefa`, `abrirLinksExistentesDeAprovacao`,
 * `gerarECopiarLinkDeAprovacao`, `mostrarLinkDeAprovacaoDaBee`). Ele foi
 * REMOVIDO de propósito, a pedido do Cláudio.
 *
 * O motivo é de produto, não de código: enquanto ele existisse, todo o
 * portão da conferência do atendimento era opcional — dava pra mandar uma
 * peça pro cliente sem ninguém conferir, que é exatamente o erro que
 * aquelas telas foram feitas pra evitar. Dois caminhos pro mesmo destino,
 * e o errado era o mais curto.
 *
 * Hoje o link do cliente NASCE SÓ na tela de conferência (apvGarantirLink,
 * js/pagina-aprovacao.js), e o "já existe um link / excluir / gerar outro"
 * mora lá também (apvRenderLinksExistentes). O que sobrou aqui é
 * `abrirEscolhaDePeca`, que continua sendo usado pra escolher QUAIS peças
 * vão pra revisão (escolherPecasParaRevisao, js/pagina-aprovacao.js).
 */

/**
 * Popup simples, criado na hora, encostado no botão que chamou —
 * `position:fixed` porque `getBoundingClientRect()` já é relativo à tela,
 * do mesmo jeito.
 *
 * Hoje serve a UM momento: escolher quais peças da pasta vão pra revisão
 * interna (escolherPecasParaRevisao, js/pagina-aprovacao.js). Servia
 * também pra escolher as peças do link do cliente, mas esse botão saiu do
 * card em 2026-08-06 (ver o bloco acima) — por isso `aoConfirmar` agora é
 * obrigatório em vez de ter um padrão: sem ele, o menu não teria o que
 * fazer com a escolha.
 */
function abrirEscolhaDePeca(task, btn, pecas, opcoes) {
  opcoes = opcoes || {};
  const titulo = opcoes.titulo || "Quais peças?";
  const rotuloBotao = opcoes.rotuloBotao || "Confirmar";
  const aoConfirmar = opcoes.aoConfirmar;
  if (typeof aoConfirmar !== "function") return;
  document.getElementById("pecasEscolhaMenu")?.remove();
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.id = "pecasEscolhaMenu";
  menu.className = "pecas-escolha-menu";
  menu.style.left = Math.round(Math.max(8, rect.right - 240)) + "px";
  // Dá pra marcar VÁRIAS peças e mandar todas no MESMO link (pedido do
  // Cláudio, 2026-08-04: "são dois vídeos"). Antes era escolha única —
  // clicava numa e o menu fechava, então não tinha como mandar as duas.
  // Começa com todas marcadas: quem abriu esse menu quase sempre quer
  // mandar tudo que subiu; desmarcar é o caso raro.
  // A lista fica num `<div>` PRÓPRIO (`.pecas-escolha-lista`) que rola por
  // dentro quando passa do teto de altura do CSS — título e botão de
  // confirmar ficam de fora do scroll, sempre visíveis. Sem essa divisão,
  // com muitas peças o botão de confirmar saía pela borda de baixo da
  // tela, sem jeito de rolar até ele (bug relatado pelo Cláudio).
  menu.innerHTML = `
    <div class="pecas-escolha-titulo">${escaparHTML(titulo)}</div>
    <div class="pecas-escolha-lista">
      ${pecas.map((p, i) => `
        <label class="pecas-escolha-item">
          <input type="checkbox" data-idx="${i}" checked>
          <span>${p.mimeType.indexOf("video/") === 0 ? "🎬" : p.mimeType === "text/html" ? "🌐" : "🖼️"}</span>
          <span>${escaparHTML(p.nome)}</span>
        </label>
      `).join("")}
    </div>
    <button type="button" class="pecas-escolha-confirmar" id="pecasEscolhaOk">${escaparHTML(rotuloBotao)}</button>
  `;
  document.body.appendChild(menu);

  // Encosta embaixo do botão que abriu, mas nunca deixa o menu passar do
  // fim da tela: mede a altura DEPOIS de já estar no DOM (o teto de
  // `max-height` do CSS já valeu nessa hora), e sobe o suficiente pra
  // caber inteiro. `Math.max(8, ...)` é o piso — numa tela bem baixa, cola
  // 8px do topo em vez de subir pra fora dela.
  const alturaMenu = menu.getBoundingClientRect().height;
  const topIdeal = rect.bottom + 6;
  const top = (topIdeal + alturaMenu > window.innerHeight - 8)
    ? Math.max(8, window.innerHeight - 8 - alturaMenu)
    : topIdeal;
  menu.style.top = Math.round(top) + "px";

  menu.querySelector("#pecasEscolhaOk").addEventListener("click", () => {
    const escolhidas = Array.from(menu.querySelectorAll("input[type=checkbox]"))
      .filter(c => c.checked)
      .map(c => pecas[Number(c.dataset.idx)]);
    if (!escolhidas.length) {
      mostrarToast("Marca pelo menos uma peça.", "erro");
      return;
    }
    menu.remove();
    aoConfirmar(escolhidas);
  });

  // Clicar fora fecha — a mesma técnica do resto do app (ex: chatHdrMenu),
  // adiada um tick pra não fechar sozinho com o MESMO clique que abriu.
  setTimeout(() => {
    const fecharSeForaDoMenu = e => {
      if (menu.isConnected && !menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", fecharSeForaDoMenu, true);
      }
    };
    document.addEventListener("click", fecharSeForaDoMenu, true);
  }, 0);
}

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
  atualizarBadgeRetomar();
}

/**
 * O selo "Retomar" é INDEPENDENTE do carrossel acima — fica visível
 * mesmo com outra tarefa rodando (a pessoa pausou uma pra atender
 * prioridade, sem entregar nem passar pra frente). Ver
 * ultimaTarefaPausada em js/kanban-polling.js pra saber quando ele
 * aparece/some.
 */
function atualizarBadgeRetomar() {
  const badge = document.getElementById("retomarBadge");
  if (!badge) return;
  const wrap = document.getElementById("nowPlayingWrap");
  if (ultimaTarefaPausada) {
    badge.hidden = false;
    if (wrap) wrap.classList.add("tem-retomar");
    const tituloEl = document.getElementById("retomarBadgeTitulo");
    if (tituloEl) tituloEl.textContent = ultimaTarefaPausada.title;
  } else {
    badge.hidden = true;
    if (wrap) wrap.classList.remove("tem-retomar");
  }
}

// "Retomar" — dá play de novo na última tarefa que a pessoa pausou de
// propósito, direto da pílula, sem precisar procurar o card no quadro.
document.getElementById("retomarBadge")?.addEventListener("click", (ev) => {
  ev.stopPropagation();
  if (!ultimaTarefaPausada) return;
  const tarefaViva = tasks.find(t => String(t.id) === String(ultimaTarefaPausada.id));
  if (!tarefaViva) {
    // Saiu do quadro enquanto ficou pausada (entregue, movida pra outro
    // designer...) — sem o objeto vivo não dá pra retomar.
    ultimaTarefaPausada = null;
    updateNowPlaying();
    mostrarToast("Não achei mais essa tarefa no quadro.", "erro");
    return;
  }
  pararOutrasTarefasRodando(tarefaViva);
  tarefaViva.running = true;
  tarefaViva._runningToggleEm = Date.now();
  tocarTarefaNoBackend(tarefaViva.id, tarefaViva.title);
  if (tasks[detailIdx] && String(tasks[detailIdx].id) === String(tarefaViva.id)) renderDetail();
  render();
  updateNowPlaying();
});

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
  marcarUltimaTarefaPausada(running.id);
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

