let _timeoutAtualizacaoKanban = null;
function agendarAtualizacaoKanban() {
  clearTimeout(_timeoutAtualizacaoKanban);
  _timeoutAtualizacaoKanban = setTimeout(atualizarKanbanEmBackground, 900);
}

// Além de atualizar depois de cada ação, também atualiza sozinho de
// tempos em tempos (pega mudanças feitas por outras pessoas do time).
// A checagem de DESIGNER_LOGADO evita ficar buscando o quadro inteiro a
// cada minuto com a tela de login aberta, sem ninguém logado — um
// navegador esquecido nessa tela consumia servidor pra sempre à toa.
setInterval(() => {
  if (!DESIGNER_LOGADO) return;
  atualizarKanbanEmBackground();
}, 60000);

async function salvarPrioridadeNoBackend(taskId, prioridade) {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1 || !taskId) return;
  try {
    // Passa pela fila: se a internet estiver fora, a prioridade fica
    // guardada e vai sozinha quando voltar (ver js/fila-offline.js).
    await enviarEscritaNoBackend({ acao: "definirPrioridade", taskId, prioridade }, "mudar a prioridade");
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
  // Compara por ID, nunca por referência de objeto (`t !== exceto`): quem
  // chama pode estar segurando uma referência velha da tarefa, recriada
  // por atualizarKanbanEmBackground. Comparando por referência, a tarefa
  // que a pessoa acabou de tocar não "batia" com nenhuma das vivas e era
  // pausada junto — bug recorrente documentado no CLAUDE.md.
  const idExceto = exceto && exceto.id ? String(exceto.id) : null;
  tasks.forEach(t => {
    const ehAMesma = idExceto ? String(t.id) === idExceto : t === exceto;
    if (t.running && !ehAMesma) {
      t.running = false;
      t._runningToggleEm = Date.now();
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
 *
 * Busca o objeto VIVO em `tasks` pelo id antes de mexer em `.running`
 * — quem chama essa função pode estar segurando uma referência de
 * `task` que já ficou velha (ex: atualizarKanbanEmBackground rodou e
 * recriou os objetos enquanto o pop-up estava aberto). Sem isso, o
 * `.running = false` era escrito num objeto "fantasma" que não é mais
 * o que o cronômetro global (setInterval em detalhe-modal.js) lê a
 * cada segundo — aí o cronômetro visual continuava rodando mesmo
 * depois de repassar a tarefa pro próximo (o pause no Runrun.it até
 * funcionava, só o relógio na tela que não parava). Mesmo bug de
 * comparação por referência documentado no CLAUDE.md.
 */
async function pararCronometroAoTransferir(task) {
  const tarefaViva = (task.id && tasks.find(t => String(t.id) === String(task.id))) || task;
  if (!tarefaViva.running) return true;
  tarefaViva.running = false;
  render();
  updateNowPlaying();
  const detailPlayBtn = document.getElementById("detailPlay");
  if (detailPlayBtn) {
    detailPlayBtn.innerHTML = playIcon;
    detailPlayBtn.setAttribute("aria-label", "Iniciar tarefa");
  }
  const detailTimerEl = document.getElementById("detailTimer");
  if (detailTimerEl) detailTimerEl.textContent = formatTime(tarefaViva.timerSeconds);
  return await pausarTarefaNoBackend(tarefaViva.id);
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
// IMPORTANTE: devolve `erro: true` quando a busca FALHOU, pra quem chama
// poder diferenciar isso de "essa tarefa realmente não tem sequência".
// Antes os dois casos devolviam lista vazia igual, e isso era perigoso:
// numa oscilação de internet, uma subtarefa aparecia como "sem sequência"
// e o botão de CONCLUIR/ENTREGAR tomava o lugar das setas de avançar (dava
// pra entregar uma tarefa por engano achando que estava só repassando).
// Na Fila de repasse o erro também ficava gravado em cache, jogando a
// tarefa pra aba errada até dar F5.
async function buscarSequenciaDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { sequencia: [], workflowId: null, erro: true };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarSequencia", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar sequência de responsáveis:", data.error);
      return { sequencia: [], workflowId: null, erro: true };
    }
    return { sequencia: data.sequencia || [], workflowId: data.workflowId || null, erro: false };
  } catch (err) {
    console.error("Falha ao buscar sequência no Runrun.it:", err);
    return { sequencia: [], workflowId: null, erro: true };
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
