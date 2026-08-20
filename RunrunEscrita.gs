/**
 * Tudo que ALTERA algo no Runrun.it: play/pause, comentários, avançar e
 * desfazer a sequência de responsáveis, entregar/reabrir, mover de etapa,
 * trocar datas, reatribuir e ajustar estimativa.
 *
 * Está separado da leitura de propósito: é aqui que mora o risco de mexer
 * em dado de verdade do time, então vale olhar com mais cuidado.
 *
 * ---------------------------------------------------------------------
 * Faz parte do backend do Colmeia, que era um Código.gs único de ~3.000
 * linhas e foi dividido por assunto. TODOS os arquivos .gs do projeto do
 * Apps Script compartilham o mesmo espaço de nomes — é como se ainda fosse
 * um arquivo só, então qualquer função aqui pode ser chamada de qualquer
 * outro arquivo, sem "importar" nada. As rotas (quem responde a qual ação
 * do Colmeia) continuam todas no Código.gs.
 * ---------------------------------------------------------------------
 */
// ============ CRONÔMETRO ============

function tocarTarefa(taskId, taskTitle, designer) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/play', null, tokenRunrunDoAutor(designer));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou o play (status ' + resultado.status + ').' };
  }
  registrarPlay(taskId, taskTitle, designer);
  return { ok: true };
}

/**
 * "Batimento cardíaco" do cronômetro: chama o MESMO endpoint de play,
 * mas sem registrar um play novo no log (ver tocarTarefa acima) — existe
 * só pra manter a tarefa marcada como rodando no Runrun.it enquanto o
 * Colmeia fica com a aba aberta e visível, na hipótese de que o
 * Runrun.it para o cronômetro sozinho depois de um tempo sem nenhuma
 * chamada (relatado pelo Cláudio: "para quando a tela fica em
 * descanso"). Chamada em js/kanban-polling.js, de tempos em tempos,
 * só enquanto uma tarefa MINHA está rodando e a aba está visível.
 */
function manterTarefaViva(taskId, designer) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/play', null, tokenRunrunDoAutor(designer));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou manter a tarefa viva (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function pausarTarefa(taskId, autor) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/pause', null, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou o pause (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

/**
 * Apaga do cache compartilhado uma leitura que acabou de ficar velha
 * (ver runrunFetchCacheado, RunrunLeitura.gs). Sem isso, quem editasse a
 * descrição ou a regra veria o valor ANTIGO voltar por alguns minutos —
 * o clássico "salvei e não mudou nada".
 */
function esquecerLeituraCacheada(caminho) {
  try {
    CacheService.getScriptCache().remove('rrfetch_' + hashTexto(caminho));
  } catch (e) { /* sem cache pra limpar, segue */ }
}

function esquecerDescricaoCacheada(taskId) {
  esquecerLeituraCacheada('/tasks/' + taskId + '/description');
}

function esquecerSequenciaCacheada(workflowId) {
  esquecerLeituraCacheada('/workflows/' + workflowId + '/workflow_elements');
}

function salvarDescricao(taskId, texto, autor) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var token = tokenRunrunDoAutor(autor);

  // Antes de tudo: o que estiver guardado sobre essa descrição já morreu.
  // Limpa ANTES de escrever (e não depois) porque se a escrita der certo
  // mas o código quebrar no meio do caminho, é melhor ter cache de menos
  // do que cache errado.
  esquecerDescricaoCacheada(taskId);

  var tentativa1 = runrunRequest('/tasks/' + taskId + '/description', 'put', { description: texto }, token);
  if (tentativa1.ok) return { ok: true };

  var tentativa2 = runrunRequest('/tasks/' + taskId, 'put', { description: texto }, token);
  if (tentativa2.ok) return { ok: true };

  return {
    ok: false,
    error: 'Runrun.it recusou salvar a descrição (status ' + tentativa1.status + ' e ' + tentativa2.status + '). Precisa de diagnóstico.'
  };
}

function adicionarComentario(taskId, texto, autor) {
  if (!taskId || !texto) return { ok: false, error: 'taskId ou texto ausente.' };
  var resultado = runrunPost('/tasks/' + taskId + '/comments', { text: texto }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou o comentário (status ' + resultado.status + ').' };
  }
  // DEVOLVE o comentário criado (2026-08-13). O Runrun.it já responde com
  // ele — id e horário de verdade — e isso vinha sendo jogado fora, com o
  // `return { ok: true }` seco de antes. Por causa disso, o front-end
  // tinha que REBUSCAR a conversa inteira depois de cada envio só pra
  // descobrir o que ele mesmo acabou de escrever: era a "piscada ao
  // comentar" e ~5 idas ao servidor por mensagem (ver o item A da
  // auditoria dos comentários no CLAUDE.md).
  //
  // `comentario` pode vir null se o Runrun.it responder 2xx sem corpo —
  // o front-end trata isso caindo no caminho antigo, de rebuscar.
  return { ok: true, comentario: comentarioParaColmeia(resultado.body) };
}

function excluirComentario(commentId, autor) {
  if (!commentId) return { ok: false, error: 'commentId ausente.' };
  var resultado = runrunRequest('/comments/' + commentId, 'delete', null, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou excluir (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function editarComentario(commentId, texto, autor) {
  if (!commentId || !texto) return { ok: false, error: 'commentId ou texto ausente.' };
  var resultado = runrunRequest('/comments/' + commentId, 'put', { text: texto }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou editar o comentário (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function reagirComentario(commentId, emoji, autor) {
  if (!commentId || !emoji) return { ok: false, error: 'commentId ou emoji ausente.' };
  var resultado = runrunPost('/comments/' + commentId + '/reaction', { emoji: emoji }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou a reação (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function adicionarComentarioComAnexo(taskId, texto, nomeArquivo, mimeType, base64Dados, autor) {
  if (!taskId || !nomeArquivo || !base64Dados) {
    return { ok: false, error: 'Dados do arquivo incompletos.' };
  }
  try {
    var bytes = Utilities.base64Decode(base64Dados);
    var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', nomeArquivo);
    var opcoes = {
      method: 'post',
      headers: {
        'App-Key': RUNRUN_APP_KEY,
        'User-Token': tokenRunrunDoAutor(autor)
      },
      payload: {
        text: texto || '',
        document: blob
      },
      muteHttpExceptions: true
    };
    var res = UrlFetchApp.fetch(RUNRUN_BASE_URL + '/tasks/' + taskId + '/comments', opcoes);
    var codigo = res.getResponseCode();
    if (codigo < 200 || codigo >= 300) {
      return { ok: false, error: 'Runrun.it recusou o anexo (status ' + codigo + '): ' + res.getContentText().substring(0, 200) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Erro ao montar o anexo: ' + err.message };
  }
}

// ============ MOVER ETAPA, DATA E REATRIBUIR ============

/**
 * Descobre o workflow_id de uma tarefa pra poder limpar o cache da
 * sequência dela depois de avançar/desfazer. `runrunPost` da ação em si
 * não devolve o workflow_id no corpo — só o novo responsável — então
 * precisa de uma leitura extra da tarefa.
 */
function workflowIdDaTarefa(taskId) {
  var tarefa = runrunFetch('/tasks/' + taskId);
  return (tarefa && !tarefa.erroFetch) ? tarefa.workflow_id : null;
}

function avancarWorkflowTarefa(taskId, autor) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/complete_workflow_step', null, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou avançar a sequência (status ' + resultado.status + '). Talvez essa tarefa não tenha uma Sequência de responsáveis configurada.' };
  }
  // ⚠️ Sem isso, a próxima leitura da sequência (buscarSequenciaResponsaveis,
  // usada por carregarSequencia/recarregarRegraCardMaeNoPill pra
  // reconciliar depois da animação otimista) servia o cache de 10 min de
  // ANTES do avanço — a tela mostrava certo na hora e, uns segundos
  // depois, "voltava sozinha" pro estado velho (2026-08-13, relatado pelo
  // Cláudio: "no Runrun.it funcionou... no Colmeia voltou pra mim
  // sozinho"). `adicionarPessoaNaRegra`/`removerDaRegra`, mais abaixo,
  // já faziam essa limpeza — só avançar/desfazer tinham ficado de fora.
  var workflowId = workflowIdDaTarefa(taskId);
  if (workflowId) esquecerSequenciaCacheada(workflowId);
  return { ok: true, novoResponsavel: resultado.body ? resultado.body.responsible_name : null };
}

function desfazerWorkflowTarefa(taskId, autor) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/undo_workflow_step', null, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou desfazer (status ' + resultado.status + ').' };
  }
  // Mesmo motivo do avançar, acima.
  var workflowId = workflowIdDaTarefa(taskId);
  if (workflowId) esquecerSequenciaCacheada(workflowId);
  return { ok: true, novoResponsavel: resultado.body ? resultado.body.responsible_name : null };
}

function entregarTarefa(taskId, autor) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/deliver', null, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou entregar a tarefa (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function reabrirTarefa(taskId, autor) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/reopen', null, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou reabrir a tarefa (status ' + resultado.status + ').' };
  }
  // O /reopen do Runrun.it sozinho manda a tarefa de volta pra etapa
  // dele por padrão ("Aprovação do Cliente"), não pra onde o Colmeia
  // quer — força explicitamente pra Pendentes logo em seguida. Não
  // aborta se essa segunda chamada falhar: a tarefa já reabriu de
  // verdade, só não caiu na coluna certa (a pessoa ainda pode mover à
  // mão, melhor que a reabertura inteira falhar por causa disso).
  moverEtapaTarefa(taskId, 'pendentes', autor);
  return { ok: true };
}

/**
 * Cria a "Sequência de responsáveis" do zero numa tarefa que ainda não
 * tem nenhuma — quem estiver logado no Runrun.it (o dono da API key
 * configurada no backend) já entra automaticamente como primeira
 * pessoa da sequência. Confirmado funcionando de verdade em
 * 2026-07-28 (diagnosticoCriarWorkflowTeste na tarefa 111787). Ligada
 * no dispatcher (ação 'criarRegra'), chamada por adicionarPessoaOtimista
 * (js/regras-briefing.js) sempre que a tarefa ainda não tem workflowId.
 */
function criarWorkflowDaTarefa(taskId, autor) {
  if (!taskId) return { ok: false, error: 'taskId ausente.' };
  var resultado = runrunRequest('/tasks/' + taskId + '/workflow', 'post', {}, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou criar a sequência (status ' + resultado.status + ').', bodyBruto: resultado.body };
  }
  var workflowId = resultado.body && (resultado.body.id || resultado.body.workflow_id);
  return { ok: true, workflowId: workflowId, bodyBruto: resultado.body };
}

function diagnosticoCriarWorkflowTeste() {
  var taskId = 111787; // tarefa de teste indicada pelo Cláudio (2026-07-28)
  var resultado = criarWorkflowDaTarefa(taskId);
  Logger.log('Resultado: ' + JSON.stringify(resultado, null, 2));
  if (resultado.ok) {
    var sequenciaDepois = buscarSequenciaResponsaveis(taskId);
    Logger.log('Sequência depois de criar: ' + JSON.stringify(sequenciaDepois, null, 2));
  }
}

function adicionarPessoaNaRegra(workflowId, userId, autor) {
  if (!workflowId || !userId) return { ok: false, error: 'workflowId ou userId ausente.' };
  esquecerSequenciaCacheada(workflowId);
  var resultado = runrunRequest('/workflows/' + workflowId + '/workflow_elements', 'post', { user_id: userId }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou adicionar na regra (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function removerDaRegra(workflowId, elementId, autor) {
  if (!workflowId || !elementId) return { ok: false, error: 'workflowId ou elementId ausente.' };
  esquecerSequenciaCacheada(workflowId);
  var resultado = runrunRequest('/workflows/' + workflowId + '/workflow_elements/' + elementId, 'delete', null, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou remover da regra (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

/**
 * Confere, LENDO a tarefa de volta, se a pessoa está mesmo alocada nela.
 *
 * Por que isso existe: o Runrun.it tem o hábito de responder "200 OK" pra
 * uma alteração que ele simplesmente ignorou — foi exatamente o que
 * aconteceu com a Entrega Desejada (ver alterarDataEntregaTarefa) e é o
 * que acontecia aqui. Sem ler de volta, o Colmeia acreditava no 200 e
 * dizia "alocado!" pra uma tarefa que continuava sem dono.
 */
function tarefaEstaAlocadaPara(taskId, responsavelId) {
  var leitura = runrunRequest('/tasks/' + taskId, 'get', null);
  if (!leitura.ok || !leitura.body) return false;
  var t = leitura.body;
  if (String(t.user_id || '') === String(responsavelId)) return true;
  if (Array.isArray(t.assignments)) {
    for (var i = 0; i < t.assignments.length; i++) {
      var a = t.assignments[i];
      if (String(a.assignee_id || a.user_id || '') === String(responsavelId)) return true;
    }
  }
  return false;
}

/**
 * Aloca alguém numa tarefa, tentando os caminhos possíveis da API do
 * Runrun.it EM ORDEM e conferindo o resultado de verdade depois de cada
 * um (ver tarefaEstaAlocadaPara). Para no primeiro que realmente pegou.
 *
 * Devolve também `diagnostico`: o que foi tentado e o que cada tentativa
 * respondeu. É isso que aparece no aviso quando a alocação falha — sem
 * ele, "não consegui alocar" não dá nenhuma pista do motivo.
 */
function alocarResponsavelNaTarefa(taskId, responsavelId, autor) {
  if (!taskId || !responsavelId) return { ok: false, error: 'taskId ou responsavelId ausente.' };
  var token = tokenRunrunDoAutor(autor);

  var tentativas = [
    { nome: 'PUT assignments', executar: function () {
      return runrunRequest('/tasks/' + taskId, 'put', { assignments: [{ assignee_id: responsavelId }] }, token);
    } },
    { nome: 'POST /assignments', executar: function () {
      return runrunRequest('/tasks/' + taskId + '/assignments', 'post', { assignee_id: responsavelId }, token);
    } },
    { nome: 'PUT user_id', executar: function () {
      return runrunRequest('/tasks/' + taskId, 'put', { user_id: responsavelId }, token);
    } },
    { nome: 'PUT task.assignments', executar: function () {
      return runrunRequest('/tasks/' + taskId, 'put', { task: { assignments: [{ assignee_id: responsavelId }] } }, token);
    } }
  ];

  var log = [];
  for (var i = 0; i < tentativas.length; i++) {
    var r = tentativas[i].executar();
    if (r.ok && tarefaEstaAlocadaPara(taskId, responsavelId)) {
      return { ok: true, comoFoi: tentativas[i].nome };
    }
    log.push(tentativas[i].nome + ' → ' + (r.ok ? 'respondeu 200 mas não alocou' : 'status ' + r.status));
  }

  return { ok: false, error: 'Runrun.it não alocou a pessoa.', diagnostico: log.join(' | ') };
}

function reatribuirTarefa(taskId, responsavelId, autor) {
  return alocarResponsavelNaTarefa(taskId, responsavelId, autor);
}

/**
 * Move a tarefa de verdade pra outra etapa/coluna no Runrun.it.
 * ✅ CONFIRMADO: o campo certo pra ESCREVER é "task_state_id", não
 * "board_stage_id" — esse último é só leitura.
 */
function moverEtapaTarefa(taskId, chaveColuna, autor) {
  if (!taskId || !chaveColuna) return { ok: false, error: 'taskId ou coluna ausente.' };
  var novoStageId = COLUNA_STAGE_IDS[chaveColuna];
  if (!novoStageId) return { ok: false, error: 'Coluna "' + chaveColuna + '" sem ID configurado em COLUNA_STAGE_IDS.' };

  var resultado = runrunRequest('/tasks/' + taskId, 'put', { task_state_id: novoStageId }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou mover a etapa (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

/**
 * Igual moverEtapaTarefa, mas pra QUALQUER etapa de verdade do
 * Runrun.it (não só as 5 fixas de COLUNA_STAGE_IDS) — usada pelo
 * arrastar-e-soltar da página "Runrun completo", que mostra as etapas
 * reais (Design, Revisão de layout, Aprovação do Cliente, etc.), não as
 * 5 colunas do Kanban principal. taskStateId vem do próprio frontend,
 * pego de outra tarefa que já está naquela coluna (ver
 * transformarTarefaParaColmeia -> taskStateId).
 */
function moverParaEtapaArbitraria(taskId, taskStateId, autor) {
  if (!taskId || !taskStateId) return { ok: false, error: 'taskId ou taskStateId ausente.' };
  var resultado = runrunRequest('/tasks/' + taskId, 'put', { task_state_id: taskStateId }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou mover a etapa (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

/**
 * Altera a data de entrega desejada (desired_date) de uma tarefa.
 * ✅ Mesma implementação que já funciona no painel-designers-beeon:
 * o pulo do gato é mandar "desired_date_with_time" JUNTO com
 * "desired_date" — sem isso o Runrun.it aceita a chamada (status 200)
 * mas ignora o valor e a Entrega Desejada não muda de verdade. O
 * horário fica fixo em 18:00 (horário de Brasília).
 */
function alterarDataEntregaTarefa(taskId, novaData, autor) {
  if (!taskId || !novaData) return { ok: false, error: 'taskId ou novaData ausente.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, error: 'Formato de data inválido (esperado AAAA-MM-DD).' };
  var resultado = runrunRequest('/tasks/' + taskId, 'put', {
    desired_date: novaData,
    desired_date_with_time: novaData + 'T18:00:00-03:00'
  }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou alterar a data de entrega (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

/**
 * Grava a Data de Publicação (campo custom_24, diferente da Entrega
 * Desejada) de volta no Runrun.it. IMPORTANTE: como esse é um campo
 * personalizado (não um campo nativo tipo desired_date), o formato exato
 * que a API espera pra escrever nele não foi confirmado ainda na prática
 * — só o formato de LEITURA (`extrairDataPublicacaoTarefa`) já era usado
 * e funciona. Antes de confiar 100% nisso, rode
 * `diagnosticoAlterarDataPublicacao` manualmente pelo editor numa tarefa
 * de teste e confira no Log se a data realmente mudou.
 */
function alterarDataPublicacaoTarefa(taskId, novaData, autor) {
  if (!taskId || !novaData) return { ok: false, error: 'taskId ou novaData ausente.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, error: 'Formato de data inválido (esperado AAAA-MM-DD).' };
  var camposCustom = {};
  camposCustom[CAMPO_DATA_PUBLICACAO] = novaData;
  var resultado = runrunRequest('/tasks/' + taskId, 'put', { custom_fields: camposCustom }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou alterar a Data de Publicação (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

// Rode manualmente pelo editor numa tarefa de teste, pra confirmar que
// a Data de Publicação realmente muda (o formato de escrita de campo
// personalizado ainda não foi confirmado ao vivo, só o de leitura).
function diagnosticoAlterarDataPublicacao() {
  var taskId = 57295; // troque pelo ID de uma tarefa de teste
  var novaData = '2026-08-20'; // troque pela data de teste (AAAA-MM-DD)
  var camposCustom = {};
  camposCustom[CAMPO_DATA_PUBLICACAO] = novaData;
  var resultado = runrunRequest('/tasks/' + taskId, 'put', { custom_fields: camposCustom });
  Logger.log('TROCAR PUBLICAÇÃO -> status ' + resultado.status + ': ' + JSON.stringify(resultado.body, null, 2));
  var leitura = runrunFetch('/tasks/' + taskId);
  Logger.log('LEITURA DEPOIS -> data publicação: ' + extrairDataPublicacaoTarefa(leitura));
}

// TEMPORÁRIO (2026-08-20): versão HTTP do diagnóstico abaixo, só pra
// investigar ao vivo por que "Entrega desejada" está caindo em 00:00 em
// vez de 18:00 mesmo mandando desired_date_with_time — sem acesso ao
// editor do Apps Script nesta sessão. Remover depois de usar.
function diagnosticoAlterarDataEntregaHTTP(taskId, novaData, autor) {
  if (!taskId || !novaData) return { ok: false, error: 'taskId ou novaData ausente.' };
  var token = tokenRunrunDoAutor(autor);
  function ler() {
    var t = runrunFetch('/tasks/' + taskId);
    return { desired_date: t.desired_date, desired_date_with_time: t.desired_date_with_time };
  }
  var tentativas = [];

  // Tentativa A: só desired_date_with_time, SEM desired_date junto — pra
  // ver se mandar os dois juntos é o que faz o Runrun.it ignorar a hora.
  var a = runrunRequest('/tasks/' + taskId, 'put', {
    desired_date_with_time: novaData + 'T18:00:00-03:00'
  }, token);
  tentativas.push({ tentativa: 'so_with_time', status: a.status, depois: ler() });

  // Tentativa B: desired_date_with_time sem o offset -03:00 (só a hora local crua).
  var b = runrunRequest('/tasks/' + taskId, 'put', {
    desired_date_with_time: novaData + 'T18:00:00'
  }, token);
  tentativas.push({ tentativa: 'sem_offset', status: b.status, depois: ler() });

  // Tentativa C: campo estimated_delivery_date (o único que já vinha com
  // hora de verdade na leitura) — só pra registrar se ele reage, não é o
  // campo certo pra "Entrega Desejada" mas ajuda a entender o padrão.
  var c = runrunRequest('/tasks/' + taskId, 'put', {
    desired_date: novaData,
    desired_date_with_time: novaData + 'T18:00:00-03:00',
    estimated_delivery_date: novaData + 'T18:00:00-03:00'
  }, token);
  tentativas.push({ tentativa: 'com_estimated_delivery_date', status: c.status, depois: ler() });

  return {
    ok: true,
    tentativas: tentativas
  };
}

// Rode manualmente pelo editor numa tarefa de teste, pra confirmar que
// a data realmente muda (não só aceita com status 200 e ignora).
function diagnosticoAlterarDataEntrega() {
  var taskId = 57295; // troque pelo ID de uma tarefa de teste
  var novaData = '2026-08-15'; // troque pela data de teste (AAAA-MM-DD)
  var resultado = runrunRequest('/tasks/' + taskId, 'put', {
    desired_date: novaData,
    desired_date_with_time: novaData + 'T18:00:00-03:00'
  });
  Logger.log('TROCAR DATA -> status ' + resultado.status + ': ' + JSON.stringify(resultado.body, null, 2));
  var leitura = runrunFetch('/tasks/' + taskId);
  Logger.log('LEITURA DEPOIS -> desired_date: ' + leitura.desired_date + ' | desired_date_with_time: ' + leitura.desired_date_with_time);
}

/**
 * Cria uma tarefa nova no Runrun.it — só o coordenador tem essa opção no
 * Colmeia (ver botão "+ Nova tarefa" no quadro).
 *
 * ⚠️ PRIMEIRA VERSÃO, AINDA NÃO TESTADA COM UMA TAREFA DE VERDADE: os
 * campos "project_id"/"user_id"/"desired_date" seguem o mesmo formato já
 * CONFIRMADO nas outras funções de escrita deste arquivo (reatribuirTarefa,
 * alterarDataEntregaTarefa), mas o Colmeia nunca tinha CRIADO uma tarefa
 * antes — só editado tarefas existentes. Testar numa tarefa de teste antes
 * de confiar 100%; se o Runrun.it recusar (status != 2xx), o `bodyBruto`
 * devolvido tem a mensagem de erro dele pra ajustar o formato.
 *
 * O "Tipo" (campo personalizado — Estático/Vídeo/E-mail) NÃO é gravado
 * como campo personalizado de verdade aqui: o id interno desse campo
 * (tipo "custom_24" da Data de Publicação, ver CAMPO_DATA_PUBLICACAO)
 * nunca foi descoberto pro campo "Tipo". Por segurança, ele entra só
 * como uma linha no começo da descrição — o coordenador pode marcar o
 * campo de verdade pelo próprio Runrun.it depois, ou me pedir pra
 * descobrir o id certo (mesmo jeito que a Data de Publicação foi
 * confirmada, ver diagnosticoAlterarDataPublicacao) e automatizar 100%.
 *
 * dados = { titulo, projectId, responsavelNome, tipo, prioridade,
 *           desiredDate (AAAA-MM-DD, opcional), descricao (opcional) }
 */
function criarTarefaRunrun(dados) {
  if (!dados || !dados.titulo) {
    return { ok: false, error: 'Faltam campos obrigatórios (título).' };
  }
  // Subtarefa herda o projeto do card mãe: quem cria uma Alteração não
  // deveria precisar escolher o cliente de novo — é sempre o mesmo do pai.
  if (!dados.projectId && dados.parentTaskId) {
    var pai = runrunFetch('/tasks/' + dados.parentTaskId);
    if (pai && !pai.erroFetch && pai.project_id) dados.projectId = pai.project_id;
  }
  if (!dados.projectId) {
    return { ok: false, error: 'Faltam campos obrigatórios (cliente/projeto).' };
  }
  var token = tokenRunrunDoAutor(dados.autor);

  // O front-end manda o ID direto (a lista de "quem vai trabalhar" agora é
  // a de TODO MUNDO do Runrun.it, não só os 3 designers). O caminho por
  // nome fica como reserva: idDoDesignerPorNome só conhece os 3 nomes de
  // RUNRUN_USUARIOS, então qualquer outra pessoa voltava null ali — e uma
  // tarefa criada pra ela nascia sem dono, sem ninguém avisar.
  var responsavelId = dados.responsavelId || null;
  if (!responsavelId && dados.responsavelNome) {
    responsavelId = idDoUsuarioRunrunPorNome(dados.responsavelNome);
  }

  var corpoTask = {
    project_id: dados.projectId,
    title: dados.titulo,
  };
  // SUBTAREFA de um card mãe (usado pelo fluxo de Alteração: o
  // atendimento reprova e o Colmeia abre a subtarefa sozinho). Igual ao
  // caso do `assignments`, o Runrun.it pode responder 200 e ignorar isso
  // — por isso o vínculo é CONFERIDO depois, mais abaixo.
  if (dados.parentTaskId) corpoTask.parent_task_id = dados.parentTaskId;
  // Alocar já na criação, no formato que a API documenta (`assignments`).
  // O `user_id` que estava aqui antes era aceito com 200 e ignorado — a
  // tarefa nascia com "Alocados" vazio.
  if (responsavelId) corpoTask.assignments = [{ assignee_id: responsavelId }];
  if (dados.desiredDate) {
    corpoTask.desired_date = dados.desiredDate;
    corpoTask.desired_date_with_time = dados.desiredDate + 'T18:00:00-03:00';
  }

  var descricaoFinal = '';
  if (dados.tipo) descricaoFinal += 'Tipo: ' + dados.tipo + '\n\n';
  if (dados.descricao) descricaoFinal += dados.descricao;

  var resultado = runrunRequest('/tasks', 'post', { task: corpoTask }, token);
  if (!resultado.ok || !resultado.body || !resultado.body.id) {
    return {
      ok: false,
      error: 'Runrun.it recusou criar a tarefa (status ' + resultado.status + ').',
      bodyBruto: resultado.body
    };
  }
  var novoId = resultado.body.id;

  // CONFERIR a alocação — e insistir se não pegou.
  //
  // Mesmo mandando `assignments` na criação, o Runrun.it pode responder
  // 200 e não alocar ninguém. Então aqui a gente LÊ a tarefa de volta; só
  // se ela realmente não estiver alocada é que entram as outras tentativas
  // (ver alocarResponsavelNaTarefa).
  var alocou = true;
  var diagnosticoAlocacao = '';
  if (responsavelId) {
    if (tarefaEstaAlocadaPara(novoId, responsavelId)) {
      alocou = true;
    } else {
      var r = alocarResponsavelNaTarefa(novoId, responsavelId, dados.autor);
      alocou = !!r.ok;
      diagnosticoAlocacao = r.diagnostico || r.error || '';
    }
  }

  // CONFERIR o vínculo de subtarefa — mesmo cuidado da alocação: o
  // Runrun.it já respondeu 200 e ignorou campo mais de uma vez (aconteceu
  // com assignments, com a Entrega Desejada e com a Data de Publicação).
  var virouSubtarefa = true;
  var diagnosticoSubtarefa = '';
  if (dados.parentTaskId) {
    var r = vincularComoSubtarefa(novoId, dados.parentTaskId, dados.autor);
    virouSubtarefa = !!r.ok;
    diagnosticoSubtarefa = r.diagnostico || r.comoFoi || '';
  }

  // Prioridade é só do Colmeia (planilha própria) — não é campo do
  // Runrun.it. Descrição vem numa segunda chamada, mesmo padrão de
  // salvarDescricao.
  if (dados.prioridade) definirPrioridade(novoId, dados.prioridade);
  if (descricaoFinal) runrunRequest('/tasks/' + novoId, 'put', { description: descricaoFinal }, token);

  // A tarefa foi criada de qualquer jeito — `alocou: false` só avisa o
  // front-end pra ele dizer que ficou faltando escolher o responsável, em
  // vez de deixar a pessoa descobrir isso sozinha depois.
  return {
    ok: true,
    taskId: novoId,
    alocou: alocou,
    diagnosticoAlocacao: diagnosticoAlocacao,
    virouSubtarefa: virouSubtarefa,
    diagnosticoSubtarefa: diagnosticoSubtarefa,
    link: 'https://runrun.it/tasks/' + novoId
  };
}

/**
 * Garante que a tarefa virou FILHA do card mãe — conferindo de verdade,
 * não confiando no status 200. Mesma estratégia de
 * alocarResponsavelNaTarefa: se o jeito da criação não pegou, tenta
 * outros formatos e devolve um diagnóstico do que cada um respondeu.
 */
function vincularComoSubtarefa(taskId, parentTaskId, autor) {
  if (!taskId || !parentTaskId) return { ok: false, error: 'taskId ou parentTaskId ausente.' };
  var token = tokenRunrunDoAutor(autor);

  // Já nasceu filha (o parent_task_id da criação funcionou)? Nada a fazer.
  if (tarefaEhFilhaDe(taskId, parentTaskId)) {
    return { ok: true, comoFoi: 'já nasceu como subtarefa' };
  }

  var tentativas = [
    { nome: 'PUT parent_task_id', executar: function () {
      return runrunRequest('/tasks/' + taskId, 'put', { parent_task_id: parentTaskId }, token);
    } },
    { nome: 'PUT task.parent_task_id', executar: function () {
      return runrunRequest('/tasks/' + taskId, 'put', { task: { parent_task_id: parentTaskId } }, token);
    } },
    { nome: 'POST /subtasks no pai', executar: function () {
      return runrunRequest('/tasks/' + parentTaskId + '/subtasks', 'post', { subtask_id: taskId }, token);
    } }
  ];

  var log = [];
  for (var i = 0; i < tentativas.length; i++) {
    var r = tentativas[i].executar();
    if (r.ok && tarefaEhFilhaDe(taskId, parentTaskId)) {
      return { ok: true, comoFoi: tentativas[i].nome };
    }
    log.push(tentativas[i].nome + ' → ' + (r.ok ? 'respondeu 200 mas não vinculou' : 'status ' + r.status));
  }
  return { ok: false, error: 'Runrun.it não vinculou como subtarefa.', diagnostico: log.join(' | ') };
}

/** Lê a tarefa de volta e confere de quem ela é filha de verdade. */
function tarefaEhFilhaDe(taskId, parentTaskId) {
  var t = runrunFetch('/tasks/' + taskId);
  if (!t || t.erroFetch) return false;
  return String(t.parent_task_id || '') === String(parentTaskId);
}

/**
 * DIAGNÓSTICO — rode esta função no editor do Apps Script pra confirmar,
 * contra o Runrun.it de verdade, duas coisas de uma vez:
 *   1) dá pra criar uma tarefa já como SUBTAREFA de um card mãe;
 *   2) dá pra ela nascer com o responsável ALOCADO.
 *
 * É o teste que decide se o fluxo de Alteração (o atendimento reprova e o
 * Colmeia abre a subtarefa sozinho) é viável — não dá pra confiar na
 * documentação aqui: este backend já foi enganado pelo Runrun.it com
 * status 200 ignorando campo em pelo menos três casos.
 *
 * CRIA UMA TAREFA DE VERDADE. O título começa com "TESTE —" e o log
 * termina dizendo como apagar.
 */
function testarCriarSubtarefaAlteracao() {
  // Troque aqui se quiser testar em outro card mãe.
  var CARD_MAE = 112383;
  var QUEM = 'Cláudio';

  Logger.log('=== TESTE: criar subtarefa alocada ===');
  Logger.log('Card mãe: ' + CARD_MAE + ' | Alocar pra: ' + QUEM);
  Logger.log('');

  var pai = runrunFetch('/tasks/' + CARD_MAE);
  if (!pai || pai.erroFetch) {
    Logger.log('!! Não consegui ler o card mãe. Resposta: ' + JSON.stringify(pai));
    return;
  }
  Logger.log('Card mãe lido: "' + pai.title + '"');
  Logger.log('  project_id: ' + pai.project_id);
  Logger.log('  subtarefas hoje: ' + ((pai.subtask_ids || []).length));

  // O Runrun.it recusa criar tarefa em projeto FECHADO ("O projeto da
  // tarefa deve estar aberto", 422) — conferir isso antes evita gastar a
  // tentativa e, mais importante, é o mesmo problema que o fluxo de
  // Alteração vai encontrar em peça de mês antigo.
  var projeto = runrunFetch('/projects/' + pai.project_id);
  if (projeto && !projeto.erroFetch) {
    Logger.log('  projeto: "' + (projeto.name || '?') + '" | is_closed: ' + projeto.is_closed);
    if (projeto.is_closed) {
      Logger.log('');
      Logger.log('❌ ESSE PROJETO ESTÁ FECHADO — o Runrun.it não deixa criar tarefa nele.');
      Logger.log('   Não é problema de subtarefa; a criação nem chega a ser testada.');
      Logger.log('   Rode listarProjetosAbertosParaTeste() pra achar um card mãe testável.');
      return;
    }
  }
  Logger.log('');

  var meuId = idDoUsuarioRunrunPorNome(QUEM);
  Logger.log('ID de ' + QUEM + ' no Runrun.it: ' + meuId);
  if (!meuId) Logger.log('  !! sem id, a alocação vai falhar');
  Logger.log('');

  Logger.log('--- Criando... ---');
  var r = criarTarefaRunrun({
    titulo: 'TESTE — Alteração V1 (pode apagar)',
    parentTaskId: CARD_MAE,
    responsavelId: meuId,
    descricao: 'Tarefa de teste criada pelo Colmeia pra validar o fluxo de Alteração. Pode apagar.',
    autor: QUEM
  });

  Logger.log('Resposta: ' + JSON.stringify(r));
  Logger.log('');
  Logger.log('--- RESULTADO ---');
  if (!r.ok) {
    Logger.log('❌ Não criou. Motivo: ' + r.error);
    return;
  }
  Logger.log('✅ Tarefa criada: ' + r.link);
  Logger.log((r.virouSubtarefa ? '✅' : '❌') + ' Virou subtarefa do card mãe' +
    (r.diagnosticoSubtarefa ? ' (' + r.diagnosticoSubtarefa + ')' : ''));
  Logger.log((r.alocou ? '✅' : '❌') + ' Alocou ' + QUEM +
    (r.diagnosticoAlocacao ? ' (' + r.diagnosticoAlocacao + ')' : ''));
  Logger.log('');

  // Confere lendo de volta — a prova final, independente do que a
  // resposta da criação disse.
  var nova = runrunFetch('/tasks/' + r.taskId);
  if (nova && !nova.erroFetch) {
    Logger.log('Conferindo a tarefa criada:');
    Logger.log('  parent_task_id: ' + nova.parent_task_id + (String(nova.parent_task_id) === String(CARD_MAE) ? '  ← certo' : '  ← NÃO é filha!'));
    Logger.log('  responsible_name: ' + nova.responsible_name);
    Logger.log('  assignments: ' + JSON.stringify(nova.assignments || []));
  }

  Logger.log('');
  Logger.log('Pra apagar: abre ' + r.link + ' e exclui, ou roda no editor:');
  Logger.log('  runrunRequest("/tasks/' + r.taskId + '", "delete", null, RUNRUN_USER_TOKEN)');
  Logger.log('=== FIM. Copie TUDO acima e mande pro Claude. ===');
}

/**
 * DIAGNÓSTICO — o projeto fechado bloqueia SÓ criar tarefa, ou bloqueia
 * também comentar e reatribuir?
 *
 * Isso decide o plano B do fluxo de Alteração (ideia do Cláudio): quando
 * o projeto estiver fechado e não der pra abrir a subtarefa, o Colmeia
 * comenta no card mãe marcando o designer e passa o card pra ele.
 *
 * SEGURANÇA: o comentário é aditivo (dá pra apagar). A reatribuição é
 * testada alocando a tarefa pra QUEM JÁ É O DONO dela — se a API aceitar,
 * sabemos que reatribuir funciona em projeto fechado, sem trocar o
 * responsável de ninguém nem disparar notificação indevida.
 */
function testarComentarEReatribuirEmProjetoFechado() {
  var CARD_FECHADO = 110172; // o do teste anterior, projeto arquivado
  var QUEM_MARCAR = 'Cláudio';

  Logger.log('=== TESTE: projeto fechado bloqueia o quê? ===');
  Logger.log('Card: ' + CARD_FECHADO);
  Logger.log('');

  var t = runrunFetch('/tasks/' + CARD_FECHADO);
  if (!t || t.erroFetch) {
    Logger.log('!! Não consegui ler a tarefa: ' + JSON.stringify(t));
    return;
  }
  Logger.log('Tarefa: "' + t.title + '"');
  Logger.log('  responsável atual: ' + t.responsible_name + ' (' + t.responsible_id + ')');

  var p = runrunFetch('/projects/' + t.project_id);
  Logger.log('  projeto: "' + (p && p.name) + '" | is_closed: ' + (p && p.is_closed));
  if (p && !p.is_closed) {
    Logger.log('');
    Logger.log('⚠ Esse projeto NÃO está fechado — o teste não prova nada.');
    Logger.log('  Troque CARD_FECHADO por uma tarefa de projeto arquivado.');
    return;
  }
  Logger.log('');

  // ---- 1) Dá pra COMENTAR? ----
  Logger.log('--- 1) Comentar (com menção) ---');
  var texto = 'TESTE do Colmeia (pode apagar) — <mention>@' + QUEM_MARCAR + '</mention> ' +
    'conferindo se dá pra comentar em projeto fechado.';
  var c = adicionarComentario(CARD_FECHADO, texto, null);
  Logger.log('Resposta: ' + JSON.stringify(c));
  Logger.log(c && c.ok ? '✅ COMENTAR FUNCIONA em projeto fechado' : '❌ Comentar TAMBÉM é bloqueado');
  Logger.log('');

  // ---- 2) Dá pra REATRIBUIR? ----
  // Aloca pro MESMO dono atual: inofensivo, mas passa pelo mesmo caminho
  // de API que uma reatribuição de verdade passaria.
  Logger.log('--- 2) Reatribuir (pro mesmo dono, sem mudar nada) ---');
  if (!t.responsible_id) {
    Logger.log('⚠ A tarefa não tem responsável — não dá pra testar sem trocar o dono de verdade.');
  } else {
    var r = alocarResponsavelNaTarefa(CARD_FECHADO, t.responsible_id, QUEM_MARCAR);
    Logger.log('Resposta: ' + JSON.stringify(r));
    Logger.log(r && r.ok ? '✅ REATRIBUIR FUNCIONA em projeto fechado' : '❌ Reatribuir é bloqueado');
  }

  Logger.log('');
  Logger.log('--- CONCLUSÃO ---');
  Logger.log('Se os dois deram ✅, o plano B do Cláudio funciona:');
  Logger.log('  projeto fechado → comenta no card mãe marcando o designer + passa o card pra ele.');
  Logger.log('');
  Logger.log('Lembre de apagar o comentário de teste no card ' + CARD_FECHADO + '.');
  Logger.log('=== FIM. Copie TUDO acima e mande pro Claude. ===');
}

/**
 * DIAGNÓSTICO — acha sozinho um card mãe que dê pra usar no teste acima,
 * pra ninguém precisar caçar isso na mão: varre as tarefas ABERTAS do
 * time, pega as que têm subtarefas (ou seja, são card mãe) e confere se
 * o projeto delas está aberto.
 */
function listarProjetosAbertosParaTeste() {
  Logger.log('=== Procurando um card mãe testável ===');
  Logger.log('(card mãe = tem subtarefas; testável = projeto aberto)');
  Logger.log('');

  var lote = runrunFetch('/tasks?is_closed=false&sort=updated_at&sortDir=desc&limit=100');
  if (!Array.isArray(lote)) {
    Logger.log('!! Não consegui listar tarefas: ' + JSON.stringify(lote));
    return;
  }
  Logger.log('Tarefas abertas lidas: ' + lote.length);

  var projetosVistos = {};
  var achados = 0;

  for (var i = 0; i < lote.length && achados < 5; i++) {
    var t = lote[i];
    if (!t.subtask_ids || !t.subtask_ids.length) continue; // não é card mãe
    if (!t.project_id) continue;

    var aberto = projetosVistos[t.project_id];
    if (aberto === undefined) {
      var p = runrunFetch('/projects/' + t.project_id);
      aberto = !!(p && !p.erroFetch && !p.is_closed);
      projetosVistos[t.project_id] = aberto;
    }
    if (!aberto) continue;

    achados++;
    Logger.log('');
    Logger.log('✅ ' + achados + ') CARD_MAE = ' + t.id);
    Logger.log('   "' + t.title + '"');
    Logger.log('   cliente: ' + (t.client_name || '?') + ' | subtarefas: ' + t.subtask_ids.length);
    Logger.log('   https://runrun.it/tasks/' + t.id);
  }

  Logger.log('');
  if (!achados) {
    Logger.log('❌ Não achei nenhum card mãe em projeto aberto entre as 100 tarefas mais recentes.');
    Logger.log('   Isso já é uma resposta importante — ver a conversa.');
  } else {
    Logger.log('Pegue um ID acima, troque o CARD_MAE em testarCriarSubtarefaAlteracao e rode de novo.');
  }
  Logger.log('=== FIM. Copie TUDO acima e mande pro Claude. ===');
}

/**
 * Ajusta a estimativa de horas de uma tarefa.
 */
function ajustarEstimativaTarefa(taskId, minutos, autor) {
  if (!taskId || !minutos) return { ok: false, error: 'taskId ou minutos ausente.' };
  var segundos = Math.round(Number(minutos) * 60);
  if (!segundos || segundos <= 0) return { ok: false, error: 'Valor de horas inválido.' };

  var resultado = runrunRequest('/tasks/' + taskId, 'put', { current_estimate_seconds: segundos }, tokenRunrunDoAutor(autor));
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou ajustar a estimativa (status ' + resultado.status + ').' };
  }
  return { ok: true };
}
