/**
 * A última tarefa que a PESSOA pausou de propósito (não uma que o
 * próprio Colmeia pausou sozinho — ver os comentários "AUTOMÁTICO, não
 * conta" espalhados abaixo) — { id, title, client } ou null.
 *
 * É o que faz o selo "↻ Retomar" aparecer do lado esquerdo da pílula do
 * topo — INDEPENDENTE de ter outra tarefa rodando ou não: pausou pra
 * atender uma prioridade, o selo fica ali esperando, mesmo que você dê
 * play em outra coisa logo em seguida.
 */
let ultimaTarefaPausada = null;

// Quantas tarefas DIFERENTES da pausada já tocaram desde então — usado
// pra decidir quando o selo desiste de esperar (ver tocarTarefaNoBackend
// mais abaixo). Um Set, não um número: tocar a MESMA outra tarefa de
// novo (parar e retomar ela) não deve contar duas vezes.
let _outrasTarefasTocadasDesdeQuePausou = new Set();

/** Chamado só pelos cliques de pausar de VERDADE (a pessoa escolheu parar). */
function marcarUltimaTarefaPausada(taskId) {
  const t = tasks.find(x => String(x.id) === String(taskId));
  ultimaTarefaPausada = t ? { id: t.id, title: t.title, client: t.client || "" } : null;
  _outrasTarefasTocadasDesdeQuePausou = new Set();
  if (typeof updateNowPlaying === "function") updateNowPlaying();
}

let _timeoutAtualizacaoKanban = null;
function agendarAtualizacaoKanban() {
  clearTimeout(_timeoutAtualizacaoKanban);
  _timeoutAtualizacaoKanban = setTimeout(atualizarKanbanEmBackground, 900);
}

// Além de atualizar depois de cada ação, também atualiza sozinho de
// tempos em tempos (pega mudanças feitas por outras pessoas do time).
// A checagem de podeBaterNoBackendAgora() (js/config.js) evita dois
// desperdícios: buscar o quadro inteiro com a tela de login aberta, sem
// ninguém logado, e — desde 2026-08-13 — continuar buscando com a aba
// escondida. Este era o maior consumidor da fila do Apps Script: o quadro
// INTEIRO, de cada aba aberta do escritório, todo minuto, olhando ou não.
setInterval(() => {
  if (!podeBaterNoBackendAgora()) return;
  atualizarKanbanEmBackground();
}, 60000);

// A outra metade da moeda: voltou pra aba, atualiza NA HORA.
//
// Sem isto, pausar o poll seria trocar um problema por outro — a pessoa
// voltaria de uma reunião e olharia pra um quadro de 40 minutos atrás,
// achando que está vendo o de agora. É o pior tipo de erro: silencioso e
// convincente. Com isto, o quadro fica parado só enquanto ninguém está
// vendo, e volta a valer no instante em que alguém olha.
//
// `_ultimaAtualizacaoDoQuadro` evita rajada: alternar entre abas várias
// vezes seguidas (o que todo mundo faz) dispararia uma busca do quadro
// inteiro a cada alternância. Menos de 30 segundos desde a última, deixa
// quieto — o poll normal já cobre.
let _ultimaAtualizacaoDoQuadro = 0;
const INTERVALO_MINIMO_AO_VOLTAR_MS = 30000;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (!podeBaterNoBackendAgora()) return;
  if (Date.now() - _ultimaAtualizacaoDoQuadro < INTERVALO_MINIMO_AO_VOLTAR_MS) return;
  _ultimaAtualizacaoDoQuadro = Date.now();
  atualizarKanbanEmBackground();
});

async function salvarPrioridadeNoBackend(taskId, prioridade) {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1 || !taskId) return;
  try {
    // donoDaTarefa/tituloDaTarefa não mudam nada na prioridade em si —
    // são só o contexto pro feed da aba Bee saber DE QUEM é essa tarefa
    // (quem deve ver "fulano mudou a prioridade de X"). Ver
    // registrarEventosDoFeed em Código.gs.
    const t = tasks.find(x => String(x.id) === String(taskId))
      || (typeof tasksTodas !== "undefined" ? tasksTodas.find(x => String(x.id) === String(taskId)) : null);
    // Passa pela fila: se a internet estiver fora, a prioridade fica
    // guardada e vai sozinha quando voltar (ver js/fila-offline.js).
    await enviarEscritaNoBackend({
      acao: "definirPrioridade", taskId, prioridade,
      autorDoFeed: DESIGNER_LOGADO,
      donoDaTarefa: t ? t.assignee : null,
      tituloDaTarefa: t ? t.title : "",
    }, "mudar a prioridade");
  } catch (err) {
    console.error("Não consegui salvar a prioridade no backend:", err);
  }
}

/**
 * Dá play numa tarefa de verdade no Runrun.it.
 *
 * ⚠️ Quem chama essa função já marcou `task.running = true` NA HORA
 * (otimista, antes de qualquer resposta) e o cronômetro de 1s
 * (detalhe-modal.js) já está somando segundo a segundo em cima disso.
 * Se o Runrun.it recusar ou a chamada nem chegar, essa função DESFAZ o
 * otimismo — sem isso, o relógio do Colmeia continuava contando pra
 * sempre (a tarefa nunca tinha começado a rodar de verdade lá), e
 * ninguém percebia até checar o Runrun.it e ver zerado. Busca o objeto
 * VIVO em `tasks` de novo (não fecha sobre o de quando foi chamada):
 * pode ter sido recriado por atualizarKanbanEmBackground enquanto essa
 * chamada estava no ar.
 */
async function tocarTarefaNoBackend(taskId, taskTitle) {
  if (!COLMEIA_API_URL || !taskId) return;
  // Decide se o selo "Retomar" continua valendo (ver ultimaTarefaPausada
  // acima). Tocou a PRÓPRIA tarefa pausada: resolvido, some na hora — é
  // exatamente pra isso que o selo existe. Tocou OUTRA: só conta como
  // "seguiu em frente de vez" na SEGUNDA tarefa diferente — uma pausa
  // rápida pra apagar um incêndio não deve fazer a pessoa perder o fio
  // do que estava fazendo antes.
  if (ultimaTarefaPausada) {
    if (String(ultimaTarefaPausada.id) === String(taskId)) {
      ultimaTarefaPausada = null;
      _outrasTarefasTocadasDesdeQuePausou = new Set();
    } else {
      _outrasTarefasTocadasDesdeQuePausou.add(String(taskId));
      if (_outrasTarefasTocadasDesdeQuePausou.size >= 2) {
        ultimaTarefaPausada = null;
        _outrasTarefasTocadasDesdeQuePausou = new Set();
      }
    }
    if (typeof updateNowPlaying === "function") updateNowPlaying();
  }

  // Dar play sempre avança a tarefa pra "Fazendo" (pedido do Cláudio): o
  // /play do Runrun.it só liga o cronômetro, não move a etapa sozinho —
  // sem isso o card ficava tocando mas preso em Pendentes/Prioridades até
  // alguém arrastar ele na mão. Só move quem ainda não tinha começado —
  // retomar uma tarefa que já está em Revisão/Ajustes continua onde está.
  const tarefaViva = tasks.find(t => String(t.id) === String(taskId));
  if (tarefaViva && (tarefaViva.status === "pendentes" || tarefaViva.status === "prioridades")) {
    tarefaViva.status = "fazendo";
    if (typeof render === "function") render();
    if (typeof moverEtapaNoBackend === "function") moverEtapaNoBackend(taskId, "fazendo");
  }

  let data;
  try {
    data = await chamarBackend({ acao: "tocarTarefa", taskId, taskTitle, designer: DESIGNER_LOGADO });
  } catch (err) {
    console.error("Falha ao dar play no Runrun.it:", err);
    data = { ok: false };
  }
  if (!data.ok) {
    console.error("Runrun.it recusou o play:", data.error);
    desfazerPlayOtimista(taskId, data.error);
  }
}

/**
 * Desfaz o "já mostra rodando" de tocarTarefaNoBackend quando o play não
 * chegou a valer de verdade no Runrun.it. Para o relógio local (senão
 * ele fica contando um tempo que não existe pra ninguém além do
 * navegador) e avisa — sem aviso, a pessoa segue achando que está
 * batendo ponto normalmente.
 */
function desfazerPlayOtimista(taskId, motivo) {
  const tarefaViva = tasks.find(t => String(t.id) === String(taskId));
  if (tarefaViva && tarefaViva.running) {
    tarefaViva.running = false;
    tarefaViva._runningToggleEm = Date.now();
    if (typeof render === "function") render();
    if (typeof renderDetail === "function" && typeof detailIdx !== "undefined" && tasks[detailIdx] && String(tasks[detailIdx].id) === String(taskId)) {
      renderDetail();
    }
    if (typeof updateNowPlaying === "function") updateNowPlaying();
  }
  if (typeof mostrarToast === "function") {
    mostrarToast(`Não consegui iniciar essa tarefa no Runrun.it${motivo ? ": " + String(motivo).slice(0, 60) : ""}. O cronômetro foi parado — dá play de novo.`, "erro");
  }
  // Busca o tempo real de novo em breve — os poucos segundos que o
  // cronômetro local somou entre o clique e essa resposta ficam
  // "sobrando" até essa sincronização (o clamp em pessoas-fotos.js só
  // protege tempo pra frente enquanto `running` é true, então essa
  // rodada já vai corrigir pro valor de verdade do Runrun.it).
  if (typeof agendarAtualizacaoKanban === "function") agendarAtualizacaoKanban();
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
    if (!t.running || ehAMesma) return;
    // SÓ AS MINHAS (2026-08-14). O quadro mostra as tarefas do time
    // inteiro, e isto aqui pausava QUALQUER uma que estivesse rodando —
    // inclusive a de outra pessoa, que naquele instante estava com o
    // cronômetro dela ligado, trabalhando. Dois estragos de uma vez:
    //
    //  - no Runrun.it a chamada era recusada com 403 (o token de quem
    //    clicou não manda na tarefa de outro) — foi o erro que mais
    //    apareceu no painel de diagnóstico, em pares e repetido;
    //  - na TELA de quem clicou, o cronômetro do colega parava do mesmo
    //    jeito (`t.running = false` acontecia antes da recusa chegar), e
    //    só voltava na atualização seguinte.
    //
    // A regra de "uma tarefa rodando por vez" é por PESSOA, não pelo
    // quadro. O botão da pílula de "tocando agora" já filtrava por
    // ehMinhaTarefa; aqui faltava.
    if (typeof ehMinhaTarefa === "function" && !ehMinhaTarefa(t)) return;
    t.running = false;
    t._runningToggleEm = Date.now();
    pausarTarefaNoBackend(t.id);
  });
}

// "Mantém viva" — mitigação pro relato do Cláudio de o cronômetro parar
// sozinho quando a tela fica em descanso ("precisa clicar pra voltar a
// rodar"). A auditoria não achou nenhum código do Colmeia que pause a
// tarefa por inatividade — toda chamada de pausarTarefaNoBackend vem de
// um clique de verdade ou de transferir/entregar. A hipótese mais
// provável é o Runrun.it parar o `is_working_on` sozinho, do lado dele,
// depois de um tempo sem nenhuma chamada relacionada à tarefa — então,
// enquanto a aba está visível e uma tarefa MINHA está rodando, o Colmeia
// reforça o play de tempos em tempos. `manterTarefaViva` (RunrunEscrita.gs)
// chama o mesmo endpoint de play, mas sem registrar um play novo no log.
const MANTER_VIVA_INTERVALO_MS = 5 * 60 * 1000;
setInterval(() => {
  if (!podeBaterNoBackendAgora()) return;
  const rodando = tasks.find(t => t.running && typeof ehMinhaTarefa === "function" && ehMinhaTarefa(t));
  if (!rodando) return;
  chamarBackend({ acao: "manterTarefaViva", taskId: rodando.id, designer: DESIGNER_LOGADO }).catch(() => {});
}, MANTER_VIVA_INTERVALO_MS);

async function pausarTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const data = await chamarBackend({ acao: "pausarTarefa", taskId });
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
    // autor/tituloDaTarefa: contexto pro feed da aba Bee ("fulano te
    // passou a tarefa X"). Quem RECEBEU o backend descobre sozinho, pela
    // resposta do Runrun.it. Ver registrarEventosDoFeed em Código.gs.
    const t = tasks.find(x => String(x.id) === String(taskId))
      || (typeof tasksTodas !== "undefined" ? tasksTodas.find(x => String(x.id) === String(taskId)) : null);
    const data = await chamarBackend({
      acao: "avancarWorkflow", taskId,
      autorDoFeed: DESIGNER_LOGADO,
      tituloDaTarefa: t ? t.title : "",
    });
    if (!data.ok) console.error("Runrun.it recusou avançar a sequência:", data.error);
    return { ok: !!data.ok, novoResponsavel: data.novoResponsavel || null };
  } catch (err) {
    console.error("Falha ao avançar a sequência no Runrun.it:", err);
    return { ok: false, novoResponsavel: null };
  }
}

async function reatribuirTarefaNoBackend(taskId, responsavelId, nomeDoNovoResponsavel) {
  if (!COLMEIA_API_URL || !taskId || !responsavelId) return false;
  try {
    // nomeDoNovoResponsavel é opcional e só alimenta o feed da aba Bee —
    // aqui, diferente do avancarWorkflow, o Runrun.it não devolve o nome
    // de quem passou a ser o responsável, então quem sabe é quem clicou.
    const t = tasks.find(x => String(x.id) === String(taskId))
      || (typeof tasksTodas !== "undefined" ? tasksTodas.find(x => String(x.id) === String(taskId)) : null);
    const data = await chamarBackend({
      acao: "reatribuir", taskId, responsavelId,
      autorDoFeed: DESIGNER_LOGADO,
      nomeDoNovoResponsavel: nomeDoNovoResponsavel || null,
      tituloDaTarefa: t ? t.title : "",
    });
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
    const data = await chamarBackend({ acao: "buscarSequencia", taskId });
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
    const data = await chamarBackend({ acao: "criarRegra", taskId });
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
    const data = await chamarBackend({ acao: "adicionarNaRegra", workflowId, userId });
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
