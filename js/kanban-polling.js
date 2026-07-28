let _timeoutAtualizacaoKanban = null;
function agendarAtualizacaoKanban() {
  clearTimeout(_timeoutAtualizacaoKanban);
  _timeoutAtualizacaoKanban = setTimeout(atualizarKanbanEmBackground, 900);
}

// Além de atualizar depois de cada ação, também atualiza sozinho de
// tempos em tempos (pega mudanças feitas por outras pessoas do time).
setInterval(atualizarKanbanEmBackground, 60000);

async function salvarPrioridadeNoBackend(taskId, prioridade) {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1 || !taskId) return;
  try {
    await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "definirPrioridade", taskId, prioridade }),
    });
  } catch (err) {
    console.error("Não consegui salvar a prioridade no backend:", err);
  }
}

/**
 * Dá play numa tarefa de verdade no Runrun.it. Se der erro (ex: endpoint
 * ainda não confirmado), avisa no console mas não trava a tela — o
 * cronômetro local continua rodando mesmo assim.
 */
async function tocarTarefaNoBackend(taskId, taskTitle) {
  if (!COLMEIA_API_URL || !taskId) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "tocarTarefa", taskId, taskTitle, designer: DESIGNER_LOGADO }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o play:", data.error);
  } catch (err) {
    console.error("Falha ao dar play no Runrun.it:", err);
  }
}

/**
 * Só pode ter UMA tarefa rodando por vez — antes disso, dar play numa
 * tarefa nova não parava a que já estava rodando, então o cronômetro
 * da antiga continuava contando escondido (e os dois batiam ponto ao
 * mesmo tempo no Runrun.it). Chama isso sempre antes de iniciar um play.
 */
function pararOutrasTarefasRodando(exceto) {
  tasks.forEach(t => {
    if (t.running && t !== exceto) {
      t.running = false;
      pausarTarefaNoBackend(t.id);
    }
  });
}

async function pausarTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "pausarTarefa", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o pause:", data.error);
    return !!data.ok;
  } catch (err) {
    console.error("Falha ao pausar no Runrun.it:", err);
    return false;
  }
}

/**
 * Para o cronômetro (visual + Runrun.it) automaticamente sempre que a
 * tarefa é transferida pro próximo responsável ou concluída — não faz
 * sentido o cronômetro continuar rodando numa tarefa que já não é mais
 * "sua" ou que já foi entregue.
 *
 * IMPORTANTE: agora é assíncrona e espera o Runrun.it confirmar o
 * pause de verdade antes de devolver — se o Colmeia tentasse entregar
 * ou avançar a tarefa enquanto o pause ainda estava "no ar", o
 * Runrun.it podia recusar (tarefa ainda "rodando" do lado de lá) e o
 * ícone/cronômetro pareciam não ter feito nada.
 */
async function pararCronometroAoTransferir(task) {
  if (!task.running) return true;
  task.running = false;
  render();
  updateNowPlaying();
  const detailPlayBtn = document.getElementById("detailPlay");
  if (detailPlayBtn) {
    detailPlayBtn.innerHTML = playIcon;
    detailPlayBtn.setAttribute("aria-label", "Iniciar tarefa");
  }
  const detailTimerEl = document.getElementById("detailTimer");
  if (detailTimerEl) detailTimerEl.textContent = formatTime(task.timerSeconds);
  return await pausarTarefaNoBackend(task.id);
}

/**
 * Move a tarefa pra outra coluna de verdade no Runrun.it. A regra
 * automática de transferir pro próximo responsável é do próprio
 * Runrun.it — o Colmeia só avisa "mudou de etapa".
 */
/**
 * Avança a tarefa pra próxima pessoa na Sequência de responsáveis
 * (workflow do Runrun.it) — CONFIRMADO funcionando. Diferente de mudar
 * a coluna no Colmeia (isso continua só visual por enquanto, o endpoint
 * de mover coluna ainda não foi confirmado).
 */
// Devolve { ok, novoResponsavel } — não só o nome, porque "sem próximo
// responsável" (tarefa entregue por completar a última etapa) e "o
// Runrun.it recusou" davam os dois null antes, sem jeito de diferenciar
// sucesso de falha (foi isso que causava o botão "Concluir" animar,
// enviar de verdade pro Runrun.it e depois voltar sozinho pro estado
// antigo — o Colmeia achava que tinha falhado só porque não veio nome).
async function avancarWorkflowNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { ok: false, novoResponsavel: null };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "avancarWorkflow", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou avançar a sequência:", data.error);
    return { ok: !!data.ok, novoResponsavel: data.novoResponsavel || null };
  } catch (err) {
    console.error("Falha ao avançar a sequência no Runrun.it:", err);
    return { ok: false, novoResponsavel: null };
  }
}

async function reatribuirTarefaNoBackend(taskId, responsavelId) {
  if (!COLMEIA_API_URL || !taskId || !responsavelId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "reatribuir", taskId, responsavelId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou reatribuir:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao reatribuir no Runrun.it:", err);
    return false;
  }
}

/**
 * Busca a Sequência de responsáveis real de uma tarefa (a aba "Regras"
 * no Runrun.it). Devolve uma lista (vazia se não tiver sequência
 * configurada) — nunca null, pra não quebrar o render.
 */
async function buscarSequenciaDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { sequencia: [], workflowId: null };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarSequencia", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar sequência de responsáveis:", data.error);
      return { sequencia: [], workflowId: null };
    }
    return { sequencia: data.sequencia || [], workflowId: data.workflowId || null };
  } catch (err) {
    console.error("Falha ao buscar sequência no Runrun.it:", err);
    return { sequencia: [], workflowId: null };
  }
}

// Cria a "Sequência de responsáveis" do zero numa tarefa que ainda não
// tem nenhuma (sem isso, workflowId fica null e não tem como adicionar
// a 1ª pessoa) — ver comentário em adicionarPessoaOtimista, js/regras-briefing.js.
async function criarRegraNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { ok: false, error: "Backend não configurado." };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "criarRegra", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou criar a sequência do zero:", data.error);
    return data;
  } catch (err) {
    console.error("Falha ao criar a sequência do zero no Runrun.it:", err);
    return { ok: false, error: "Falha de conexão." };
  }
}

async function adicionarNaRegraNoBackend(workflowId, userId) {
  if (!COLMEIA_API_URL || !workflowId || !userId) {
    console.error("adicionarNaRegraNoBackend: chamada abortada — workflowId ou userId ausente.", { workflowId, userId });
    return false;
  }
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "adicionarNaRegra", workflowId, userId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou adicionar na regra:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao adicionar na regra no Runrun.it:", err);
    return false;
  }
}

/**
 * Abre o painel "Pessoas conhecidas" — lista todo nome que o Colmeia já
 * viu na sessão atual, com a foto atual, e deixa o coordenador trocar a
 * foto ou vincular apelidos (ex: "Manu" = "Manuela Mendonça").
 */
// Qual aba do painel do coordenador está ativa agora.
