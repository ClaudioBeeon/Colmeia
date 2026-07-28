/**
 * Backend do Colmeia — Quadro de tarefas Beeon
 * (deploy automático via GitHub Actions + clasp v3, configurado em 2026-07-28 — teste com Apps Script API habilitada)
 * ---------------------------------------------
 * Este script tem duas fontes de dados:
 *
 * 1) RUNRUN.IT (fonte da verdade pra tarefas): título, cliente, etapa
 *    (coluna), data de entrega desejada, tipo de tarefa e responsável
 *    vêm sempre ao vivo da API do Runrun.it. Não guardamos cópia disso
 *    na planilha.
 *
 * 2) PLANILHA "Extras" (só o que o Runrun.it não tem): guarda a
 *    prioridade de cada tarefa (Alta/Média/Baixa), escolhida manualmente
 *    dentro do Colmeia. Cada linha é 1 tarefa: [task_id, prioridade,
 *    atualizado_em].
 *
 * IMPORTANTE — reaproveitado do painel-designers-beeon:
 * As credenciais do Runrun.it (RUNRUN_APP_KEY / RUNRUN_USER_TOKEN) e a
 * lista RUNRUN_USUARIOS são as mesmas de lá. Se mudar o token num dos
 * dois projetos, troque no outro também.
 *
 * CRONÔMETRO E COMENTÁRIOS:
 * O play/pause e os comentários batem de verdade na API do Runrun.it
 * (não são simulados no Colmeia). O endpoint de play/pause foi
 * implementado por inferência (não veio 100% confirmado na
 * documentação) — rode diagnosticoPlayPause(taskId) manualmente pelo
 * editor antes de confiar cegamente nele em produção.
 */

// ============ CONFIGURAÇÃO ============

// As chaves/senhas de verdade NÃO ficam mais escritas aqui no código (o
// GitHub bloqueou o envio por isso — chave exposta em texto puro é
// insegura, qualquer um com acesso ao código consegue usá-la). Elas
// ficam guardadas em "Propriedades do Script", uma área separada e
// privada do próprio Apps Script. Pra configurar (só precisa fazer uma
// vez): no editor do Apps Script, vá em "Configurações do projeto" (ícone
// de engrenagem) > "Propriedades do script" > "Adicionar propriedade
// do script", e cadastre cada uma destas com o valor de verdade:
// RUNRUN_APP_KEY, GROQ_API_KEY, GEMINI_API_KEY, RUNRUN_USER_TOKEN.
var RUNRUN_APP_KEY = PropertiesService.getScriptProperties().getProperty('RUNRUN_APP_KEY');
var GROQ_API_KEY = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
var GROQ_MODEL = 'llama-3.3-70b-versatile';
var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
var GEMINI_MODEL = 'gemini-3.1-flash-lite';
var RUNRUN_USER_TOKEN = PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN');
var RUNRUN_BASE_URL = 'https://secure.runrun.it/api/v1.0';

// URL do Web App do painel-designers-beeon (o outro painel, já publicado).
// O Colmeia só faz LEITURA aqui — nunca escreve nada nesse painel. Usado
// pra reaproveitar os vínculos manuais de cliente (mesmo cliente com
// nomes diferentes no painel/Runrun.it/Drive) já cadastrados lá, em vez
// de o Colmeia tentar adivinhar por nome parecido de novo.
var PAINEL_BEEON_API_URL = 'https://script.google.com/macros/s/AKfycbzzWtG4jkVpLvPwOAHaj-h9KK9k_8N6YWGUXfFtUDSXRiCj7ILDPvuSy9VJXhglTrzEQQ/exec';

var RUNRUN_USUARIOS = {
  'claudio@beeon.com.br': 'Cláudio',
  'gustavo@beeon.com.br': 'Gustavo',
  'erick@beeon.com.br': 'Erick'
};

var COLUNAS_PRINCIPAIS = {
  pendentes: 'Pendentes',
  prioridades: 'Prioridades',
  fazendo: 'Fazendo',
  revisao: 'Revisão',
  ajustes: 'Ajuste/Refação'
};

var CAMPO_TIPO_TAREFA = 'Tipo';

var COLUNA_STAGE_IDS = {
  pendentes: 1280747,
  prioridades: 2349713,
  fazendo: 1280748,
  revisao: 1296178,
  ajustes: 1296184
};

// ============ ENTRADA (doGet / doPost) ============

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  var output;
  try {
    var tipo = e && e.parameter ? e.parameter.tipo : null;

    if (tipo === 'tarefas') {
      output = getTarefasColmeia();
    } else if (method === 'POST') {
      var body = JSON.parse(e.postData.contents);

      if (body.acao === 'login') {
        output = verificarLogin(body.senha);
      } else if (body.acao === 'gerarFraseDoDia') {
        output = gerarFraseDoDia();
      } else if (body.acao === 'definirPrioridade') {
        output = definirPrioridade(body.taskId, body.prioridade);
      } else if (body.acao === 'tocarTarefa') {
        output = tocarTarefa(body.taskId, body.taskTitle, body.designer);
      } else if (body.acao === 'buscarTarefasHoje') {
        output = buscarPlaysDeHoje(body.designer);
      } else if (body.acao === 'pausarTarefa') {
        output = pausarTarefa(body.taskId);
      } else if (body.acao === 'listarComentarios') {
        output = listarComentarios(body.taskId);
      } else if (body.acao === 'buscarDescricao') {
        output = buscarDescricao(body.taskId);
      } else if (body.acao === 'salvarDescricao') {
        output = salvarDescricao(body.taskId, body.texto);
      } else if (body.acao === 'buscarAnexos') {
        output = buscarAnexosTarefa(body.taskId);
      } else if (body.acao === 'baixarAnexo') {
        output = baixarDocumentoAnexo(body.documentId);
      } else if (body.acao === 'gerarBriefing') {
        output = gerarBriefingDaTarefa(body.taskId);
      } else if (body.acao === 'adicionarComentario') {
        output = adicionarComentario(body.taskId, body.texto);
      } else if (body.acao === 'excluirComentario') {
        output = excluirComentario(body.commentId);
      } else if (body.acao === 'reagirComentario') {
        output = reagirComentario(body.commentId, body.emoji);
      } else if (body.acao === 'adicionarComentarioComAnexo') {
        output = adicionarComentarioComAnexo(body.taskId, body.texto, body.nomeArquivo, body.mimeType, body.base64Dados);
      } else if (body.acao === 'avancarWorkflow') {
        output = avancarWorkflowTarefa(body.taskId);
      } else if (body.acao === 'desfazerWorkflow') {
        output = desfazerWorkflowTarefa(body.taskId);
      } else if (body.acao === 'buscarSequencia') {
        output = buscarSequenciaResponsaveis(body.taskId);
      } else if (body.acao === 'buscarCardMae') {
        output = buscarCardMae(body.taskId);
      } else if (body.acao === 'buscarTarefaCompleta') {
        output = buscarTarefaCompleta(body.taskId);
      } else if (body.acao === 'entregarTarefa') {
        output = entregarTarefa(body.taskId);
      } else if (body.acao === 'reabrirTarefa') {
        output = reabrirTarefa(body.taskId);
      } else if (body.acao === 'adicionarNaRegra') {
        output = adicionarPessoaNaRegra(body.workflowId, body.userId);
      } else if (body.acao === 'removerDaRegra') {
        output = removerDaRegra(body.workflowId, body.elementId);
      } else if (body.acao === 'reatribuir') {
        output = reatribuirTarefa(body.taskId, body.responsavelId);
      } else if (body.acao === 'moverEtapa') {
        output = moverEtapaTarefa(body.taskId, body.chaveColuna);
      } else if (body.acao === 'alterarEntrega') {
        output = alterarDataEntregaTarefa(body.taskId, body.novaData);
      } else if (body.acao === 'alterarPublicacao') {
        output = alterarDataPublicacaoTarefa(body.taskId, body.novaData);
      } else if (body.acao === 'ajustarEstimativa') {
        output = ajustarEstimativaTarefa(body.taskId, body.minutos);
      } else if (body.acao === 'buscarExtrasRunrunCompleto') {
        output = buscarExtrasRunrunCompleto();
      } else if (body.acao === 'listarUsuarios') {
        output = listarTodosUsuariosRunrun();
      } else if (body.acao === 'listarPessoas') {
        output = listarPessoasSalvas();
      } else if (body.acao === 'salvarPessoa') {
        output = salvarPessoa(body.nome, body.foto, body.aliases, body.discord);
      } else if (body.acao === 'excluirPessoasPorNomes') {
        output = excluirPessoasPorNomes(body.nomes);
      } else if (body.acao === 'listarLinksClientes') {
        output = listarLinksClientes();
      } else if (body.acao === 'salvarLinksCliente') {
        output = salvarLinksCliente(body.cliente, body.dados);
      } else if (body.acao === 'excluirClientesPorNomes') {
        output = excluirClientesPorNomes(body.nomes);
      } else if (body.acao === 'listarPastasClientesDrive') {
        output = listarPastasDeClientesNoDrive();
      } else if (body.acao === 'criarPastaDoCard') {
        output = criarPastaDoCardNoDrive(body.cliente, body.tituloCard, body.taskId);
      } else if (body.acao === 'buscarPastaCard') {
        output = buscarPastaSalvaDoCard(body.taskId);
      } else if (body.acao === 'buscarUploadsRecentesDoCard') {
        output = buscarUploadsRecentesDoCard(body.taskId, body.cliente);
      } else if (body.acao === 'buscarProgressoClientes') {
        output = buscarProgressoMensalClientes();
      } else if (body.acao === 'listarClientesOcultos') {
        output = listarClientesOcultos();
      } else if (body.acao === 'ocultarCliente') {
        output = ocultarClienteDesigner(body.designer, body.cliente);
      } else if (body.acao === 'restaurarCliente') {
        output = restaurarClienteDesigner(body.designer, body.cliente);
      } else if (body.acao === 'criarAviso') {
        output = criarAviso(body.autor, body.texto);
      } else if (body.acao === 'listarAvisos') {
        output = listarAvisos();
      } else if (body.acao === 'excluirAviso') {
        output = excluirAviso(body.id);
      } else {
        output = { ok: false, error: 'Ação POST desconhecida: ' + body.acao };
      }
    } else {
      output = { ok: false, error: 'Use ?tipo=tarefas pra buscar o quadro.' };
    }
  } catch (err) {
    output = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ RUNRUN.IT — LEITURA (GET) ============

function runrunFetch(caminho) {
  var res = UrlFetchApp.fetch(RUNRUN_BASE_URL + caminho, {
    method: 'get',
    headers: {
      'App-Key': RUNRUN_APP_KEY,
      'User-Token': RUNRUN_USER_TOKEN,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  });
  var codigo = res.getResponseCode();
  var corpo = res.getContentText();
  try {
    return JSON.parse(corpo);
  } catch (e) {
    return { erroFetch: true, status: codigo, corpoBruto: corpo.substring(0, 300) };
  }
}

function runrunRequest(caminho, metodo, payload) {
  var opcoes = {
    method: metodo,
    headers: {
      'App-Key': RUNRUN_APP_KEY,
      'User-Token': RUNRUN_USER_TOKEN,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  if (payload) {
    opcoes.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(RUNRUN_BASE_URL + caminho, opcoes);
  var codigo = res.getResponseCode();
  var corpo = res.getContentText();
  var corpoJson = null;
  if (corpo) {
    try {
      corpoJson = JSON.parse(corpo);
    } catch (e) {
      corpoJson = { erroFetch: true, corpoBruto: corpo.substring(0, 300) };
    }
  }
  return {
    ok: codigo >= 200 && codigo < 300,
    status: codigo,
    body: corpoJson
  };
}

function runrunPost(caminho, payload) {
  return runrunRequest(caminho, 'post', payload);
}

/**
 * Vínculos de cliente (nomes diferentes = mesmo cliente) já cadastrados
 * pelo coordenador no painel-designers-beeon (aba "VinculosClientes" de
 * lá). O Colmeia só lê — quem cadastra/edita continua sendo o painel,
 * na tela de "Configurações" dele.
 *
 * Fica em cache por 10 minutos (CacheService) pra não bater na API do
 * painel numa chamada a mais por request do Colmeia.
 */
function buscarVinculosDoPainel() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get('vinculosClientesPainel');
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* recalcula abaixo */ }
  }

  var mapa = {};
  try {
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL + '?tipo=configClientes', { muteHttpExceptions: true });
    var dados = JSON.parse(res.getContentText());
    if (dados && dados.ok && Array.isArray(dados.vinculos)) {
      dados.vinculos.forEach(function (v) {
        if (v.origem) mapa[normalizarNomeParaComparar(v.origem)] = v.canonico;
      });
    }
  } catch (err) {
    // Painel fora do ar ou mudou de endereço — o Colmeia segue funcionando
    // normalmente, só sem resolver os nomes vinculados dessa vez.
  }

  cache.put('vinculosClientesPainel', JSON.stringify(mapa), 600); // 10 min
  return mapa;
}

// Mesma normalização usada no painel-designers-beeon, pra bater os nomes
// certinho (sem acento, minúsculo, sem espaço nas pontas).
function normalizarNomeParaComparar(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function resolverNomeCanonico(nome, mapaVinculos) {
  var canonico = mapaVinculos && mapaVinculos[normalizarNomeParaComparar(nome)];
  return canonico || nome;
}

function tarefaEhCardMae(tarefa) {
  var etapa = ((tarefa.board_stage_name || '') + ' ' + (tarefa.task_state_name || '')).toLowerCase().trim();
  return etapa.indexOf('card mãe') !== -1 ||
    etapa.indexOf('card mae') !== -1 ||
    etapa.indexOf('cards mães') !== -1 ||
    etapa.indexOf('cards maes') !== -1;
}

function buscarIdsResponsaveisRunrun() {
  var usuarios = runrunFetch('/users');
  var mapa = {};
  if (!Array.isArray(usuarios)) return mapa;
  usuarios.forEach(function (u) {
    if (u.email && RUNRUN_USUARIOS.hasOwnProperty(u.email)) {
      mapa[u.email] = u.id;
    }
  });
  return mapa;
}

function extrairTipoTarefa(tarefa) {
  var bruto = '';

  if (Array.isArray(tarefa.custom_fields)) {
    for (var i = 0; i < tarefa.custom_fields.length; i++) {
      var campo = tarefa.custom_fields[i];
      var nomeCampo = (campo.name || campo.title || '').toString().trim().toLowerCase();
      if (nomeCampo === CAMPO_TIPO_TAREFA.toLowerCase()) {
        bruto = (campo.value || campo.option_name || '').toString();
        break;
      }
    }
  }

  if (!bruto && tarefa.type_name) bruto = tarefa.type_name;

  bruto = bruto.toLowerCase();
  if (bruto.indexOf('víde') !== -1 || bruto.indexOf('vide') !== -1) return 'video';
  if (bruto.indexOf('mail') !== -1) return 'email';
  if (bruto.indexOf('está') !== -1 || bruto.indexOf('esta') !== -1) return 'estatico';
  return 'estatico';
}

function extrairFotoResponsavel(tarefa) {
  if (Array.isArray(tarefa.assignments) && tarefa.assignments.length > 0) {
    return tarefa.assignments[0].assignee_avatar_url || null;
  }
  return null;
}

function nomeColunaParaChave(nomeEtapa) {
  var chaves = Object.keys(COLUNAS_PRINCIPAIS);
  for (var i = 0; i < chaves.length; i++) {
    if (COLUNAS_PRINCIPAIS[chaves[i]] === nomeEtapa) return chaves[i];
  }
  return null;
}

/**
 * O Runrun.it só "persiste" de verdade o tempo trabalhado de tempos em
 * tempos — enquanto a pessoa está com o play apertado, o tempo rodando
 * nessa sessão atual fica num campo separado, "time_worked_not_persisted",
 * dentro do assignment de cada responsável (confirmado na documentação
 * oficial: https://runrun.it/api/documentation, junto com
 * "automatic_time_worked_updated_at"). Antes o Colmeia só lia o total
 * já persistido (t.current_worked_time / t.time_worked) — por isso,
 * ao dar F5 numa tarefa que estava rodando, o cronômetro voltava pra
 * um valor mais baixo (às vezes 00:00) mesmo o Runrun.it mostrando o
 * tempo certo. Esta função soma os dois pra sempre bater com o
 * Runrun.it de verdade.
 */
// Campo personalizado onde o Runrun.it guarda a Data de Publicação
// (diferente da Entrega Desejada) — mesmo campo já confirmado e usado
// no painel-designers-beeon (custom_24).
var CAMPO_DATA_PUBLICACAO = 'custom_24';

function extrairDataPublicacaoTarefa(t) {
  if (t.custom_fields && t.custom_fields[CAMPO_DATA_PUBLICACAO]) {
    return String(t.custom_fields[CAMPO_DATA_PUBLICACAO]).substring(0, 10);
  }
  return null;
}

function tempoTrabalhadoAoVivo(t) {
  var persistido = t.current_worked_time || t.time_worked || 0;
  var assignments = Array.isArray(t.assignments) ? t.assignments : [];
  var assignment =
    assignments.filter(function (a) { return String(a.assignee_id) === String(t.responsible_id); })[0] ||
    assignments.filter(function (a) { return a.is_working_on; })[0] ||
    assignments[0];
  if (!assignment) return persistido;

  // Descoberto testando ao vivo: enquanto a tarefa está rodando, o
  // Runrun.it NÃO atualiza time_worked / time_worked_not_persisted em
  // tempo real — eles ficam parados no valor do último "instantâneo"
  // (marcado em automatic_time_worked_updated_at), que pode ter sido
  // há muito tempo. O jeito certo de saber o tempo real é somar, a
  // esse instantâneo, quanto tempo passou de verdade desde então.
  if (assignment.is_working_on && assignment.automatic_time_worked_updated_at) {
    var basePersistida = Math.max(persistido, assignment.time_worked || 0);
    var ultimaAtualizacao = new Date(assignment.automatic_time_worked_updated_at).getTime();
    var decorrido = Math.max(0, Math.floor((new Date().getTime() - ultimaAtualizacao) / 1000));
    return basePersistida + decorrido;
  }

  var naoPersistido = (assignment && assignment.time_worked_not_persisted) || 0;
  return persistido + naoPersistido;
}

// Função de teste do diagnóstico acima — troque o número pelo ID da
// tarefa que quiser conferir, selecione "diagnosticoTempoTrabalhadoTeste"
// no menu ao lado de "Executar" e rode.
function diagnosticoTempoTrabalhadoTeste() {
  diagnosticoTempoTrabalhado(111951);
}

// Rode manualmente pelo editor (com o ID de uma tarefa que você está
// rodando o play agora) se o cronômetro ainda não bater direito com o
// Runrun.it depois de dar F5 — mostra os campos brutos envolvidos pra
// confirmar/ajustar a conta de tempoTrabalhadoAoVivo() acima.
function diagnosticoTempoTrabalhado(taskId) {
  var t = runrunFetch('/tasks/' + taskId);
  Logger.log('time_worked: ' + t.time_worked);
  Logger.log('current_worked_time: ' + t.current_worked_time);
  Logger.log('responsible_id: ' + t.responsible_id);
  Logger.log('assignments: ' + JSON.stringify(t.assignments, null, 2));
  Logger.log('tempoTrabalhadoAoVivo() calculado: ' + tempoTrabalhadoAoVivo(t) + ' segundos');
}

/**
 * Busca o "tempo médio" (em minutos) cadastrado por cliente no painel-
 * designers-beeon — o mesmo número que aparece no card do cliente lá
 * (ex: Alden 348 → 20min, na aba do Gustavo). Esse número é digitado à
 * mão pelo coordenador no painel; o Colmeia só lê, pra usar como meta
 * da barra de progresso do card. Cruza só pelo nome do CLIENTE (não
 * pelo designer) — o tempo médio de um cliente vale igual não importa
 * quem, no Runrun.it, está com a tarefa dele — igual o próprio painel
 * já faz internamente (construirMapaTempoMedioPorCliente lá).
 *
 * Fica em cache por 10 minutos (mesmo padrão de buscarVinculosDoPainel).
 */
function buscarTempoMedioDoPainel() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get('tempoMedioClientesPainel');
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* recalcula abaixo */ }
  }

  var mapa = {};
  try {
    // Sem "?tipo=", o painel devolve o estado completo (readState): os
    // clientes cadastrados de cada designer, cada um com seu "tempo".
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL, { muteHttpExceptions: true });
    var resposta = JSON.parse(res.getContentText());
    if (resposta && resposta.ok && !resposta.empty && resposta.data) {
      var designers = resposta.data.designers || [];
      var state = resposta.data.state || {};
      designers.forEach(function (d) {
        (state[d] || []).forEach(function (c) {
          if (!c.cliente) return;
          mapa[normalizarNomeParaComparar(c.cliente)] = Number(c.tempo) || 0;
        });
      });
    }
  } catch (err) {
    // Painel fora do ar ou mudou de endereço — segue sem tempo médio
    // dessa vez; a barra de progresso fica sem meta (0%) até a próxima
    // tentativa, mas o resto do Colmeia continua funcionando normal.
  }

  cache.put('tempoMedioClientesPainel', JSON.stringify(mapa), 600); // 10 min
  return mapa;
}

function transformarTarefaParaColmeia(t, nomeDesignerFallback) {
  var nomeEtapa = t.board_stage_name || t.task_state_name || '';
  var chaveColuna = nomeColunaParaChave(nomeEtapa);
  // Resolve o nome do cliente pro nome canônico vinculado no painel (ex:
  // "ALDEN 348 LTDA" no Runrun.it -> "Alden", que é como o coordenador
  // conhece o cliente e como as pastas do Drive estão organizadas).
  var nomeClienteBruto = t.client_name || 'Sem cliente';
  var nomeClienteResolvido = resolverNomeCanonico(nomeClienteBruto, buscarVinculosDoPainel());
  var tempoMedioMinutos = buscarTempoMedioDoPainel()[normalizarNomeParaComparar(nomeClienteResolvido)] || 0;
  return {
    id: t.id,
    title: t.title,
    client: nomeClienteResolvido,
    type: extrairTipoTarefa(t),
    due: t.desired_date ? String(t.desired_date).substring(0, 10) : null,
    // Data de Publicação (campo próprio no Runrun.it, diferente da
    // Entrega Desejada) — mesmo campo custom_24 já confirmado e usado
    // no painel-designers-beeon.
    dataPublicacao: extrairDataPublicacaoTarefa(t),
    assignee: nomeDesignerFallback || t.responsible_name || 'Sem responsável',
    assigneeAvatarUrl: extrairFotoResponsavel(t),
    estimateMinutes: Math.round((t.current_estimate_seconds || 0) / 60),
    // Meta da barra de progresso do card: tempo médio de criação DESSE
    // cliente, cadastrado manualmente no painel-designers-beeon (não é
    // mais a estimativa do Runrun.it, que é outra coisa).
    tempoMedioMinutos: tempoMedioMinutos,
    workedSeconds: tempoTrabalhadoAoVivo(t),
    isRunning: !!t.is_working_on,
    boardStageId: t.board_stage_id || null,
    parentTaskId: t.parent_task_id || null,
    runrunStage: nomeEtapa,
    status: chaveColuna,
    isOutraEtapa: chaveColuna === null,
    attachmentsCount: t.attachments_count || 0,
    // Não temos um campo de "desde quando é dessa pessoa" de verdade —
    // isso é a melhor aproximação disponível (data da última mudança na
    // tarefa no Runrun.it), usada na Fila de Repasse pra mostrar "há
    // quanto tempo está parada".
    lastActivityAt: t.updated_at || null,
    // Data de criação da tarefa no Runrun.it — usada pra ordenar listas
    // "do mais antigo pro mais novo" (ex: página Runrun completo).
    createdAt: t.created_at || null,
    link: 'https://runrun.it/tasks/' + t.id
  };
}

function buscarTarefasRunrun() {
  var tarefas = [];
  var idsPorEmail = buscarIdsResponsaveisRunrun();

  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    var nomeDesigner = RUNRUN_USUARIOS[email];
    var runrunId = idsPorEmail[email];
    if (!runrunId) return;

    var pagina = 1;
    while (pagina <= 5) {
      var lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
        '&is_closed=false&sort=desired_date&sortDir=asc&limit=100&page=' + pagina);
      if (!Array.isArray(lote) || lote.length === 0) break;

      lote.forEach(function (t) {
        if (tarefaEhCardMae(t)) return;
        tarefas.push(transformarTarefaParaColmeia(t, nomeDesigner));
      });

      if (lote.length < 100) break;
      pagina++;
    }
  });

  return tarefas;
}

var JANELA_ENTREGUES_RUNRUN_COMPLETO_MS = 15 * 24 * 60 * 60 * 1000; // 15 dias

/**
 * Busca extra usada só pela página "Runrun completo" (não entra no
 * polling normal do quadro, pra não deixar o refresh de todo mundo mais
 * lento): tarefas de "card mãe" em aberto (que buscarTarefasRunrun
 * sempre ignora) e tarefas entregues (is_closed=true) nos últimos 15
 * dias. Runrun.it não tem filtro de data na API, então pedimos
 * ordenado por atualização mais recente e paramos de virar página assim
 * que a tarefa já é mais velha que a janela (updated_at é a mesma
 * aproximação de "quando fechou" já usada em lastActivityAt).
 */
function buscarExtrasRunrunCompleto() {
  var cardMae = [];
  var entregues = [];
  var idsPorEmail = buscarIdsResponsaveisRunrun();
  var corte = Date.now() - JANELA_ENTREGUES_RUNRUN_COMPLETO_MS;

  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    var nomeDesigner = RUNRUN_USUARIOS[email];
    var runrunId = idsPorEmail[email];
    if (!runrunId) return;

    // Card mãe: reaproveita a mesma busca de tarefas abertas, só que
    // guardando (em vez de descartar) as que são card mãe.
    var pagina = 1;
    while (pagina <= 5) {
      var loteAbertas = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
        '&is_closed=false&sort=desired_date&sortDir=asc&limit=100&page=' + pagina);
      if (!Array.isArray(loteAbertas) || loteAbertas.length === 0) break;
      loteAbertas.forEach(function (t) {
        if (tarefaEhCardMae(t)) cardMae.push(transformarTarefaParaColmeia(t, nomeDesigner));
      });
      if (loteAbertas.length < 100) break;
      pagina++;
    }

    // Entregues: tarefas fechadas, mais recentes primeiro, parando assim
    // que sair da janela de 15 dias.
    pagina = 1;
    while (pagina <= 5) {
      var loteFechadas = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
        '&is_closed=true&sort=updated_at&sortDir=desc&limit=100&page=' + pagina);
      if (!Array.isArray(loteFechadas) || loteFechadas.length === 0) break;

      var saiuDaJanela = false;
      for (var i = 0; i < loteFechadas.length; i++) {
        var t = loteFechadas[i];
        var atualizadoEm = t.updated_at ? new Date(t.updated_at).getTime() : 0;
        if (atualizadoEm < corte) { saiuDaJanela = true; break; }
        if (tarefaEhCardMae(t)) continue;
        entregues.push(transformarTarefaParaColmeia(t, nomeDesigner));
      }
      if (saiuDaJanela || loteFechadas.length < 100) break;
      pagina++;
    }
  });

  return { ok: true, cardMae: cardMae, entregues: entregues };
}

var MESES_TAG = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function tagDoMesAtual() {
  var agora = new Date();
  var anoCurto = String(agora.getFullYear()).slice(-2);
  return '[' + MESES_TAG[agora.getMonth()] + anoCurto + ']';
}

function extrairNomeProjeto(t) {
  return (t.project_name || (t.project && t.project.name) || t.board_name || '').toString();
}

function buscarProgressoMensalClientes() {
  var idsPorEmail = buscarIdsResponsaveisRunrun();
  var tagMes = tagDoMesAtual();
  var progresso = {};

  function chave(designer, cliente) { return designer + '||' + cliente; }
  function garantir(designer, cliente) {
    var k = chave(designer, cliente);
    if (!progresso[k]) progresso[k] = { designer: designer, cliente: cliente, entregues: 0, total: 0 };
    return progresso[k];
  }

  var mapaVinculos = buscarVinculosDoPainel();

  function processarTarefa(t, nomeDesigner) {
    if (tarefaEhCardMae(t)) return;
    var projeto = extrairNomeProjeto(t).toUpperCase();
    if (projeto.indexOf(tagMes) === -1) return;
    var cliente = resolverNomeCanonico(t.client_name || 'Sem cliente', mapaVinculos);
    var reg = garantir(nomeDesigner, cliente);
    reg.total++;
    if (t.is_closed) reg.entregues++;
  }

  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    var nomeDesigner = RUNRUN_USUARIOS[email];
    var runrunId = idsPorEmail[email];
    if (!runrunId) return;

    ['false', 'true'].forEach(function (fechada) {
      var pagina = 1;
      while (pagina <= 5) {
        var lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
          '&is_closed=' + fechada + '&limit=100&page=' + pagina);
        if (!Array.isArray(lote) || lote.length === 0) break;
        lote.forEach(function (t) { processarTarefa(t, nomeDesigner); });
        if (lote.length < 100) break;
        pagina++;
      }
    });
  });

  return { ok: true, progresso: Object.keys(progresso).map(function (k) { return progresso[k]; }) };
}

// ============ PESSOAS ============

// ============ LINKS DE CLIENTES ============

function getLinksClientesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LinksClientes');
  if (!sheet) {
    sheet = ss.insertSheet('LinksClientes');
    sheet.getRange('A1:I1').setValues([['cliente', 'drive', 'bancoImagens', 'bibliotecaAdobe', 'pastaPublicacoes', 'extras', 'pastaDriveVinculada', 'descricao', 'aliases']]);
  }
  // Planilhas criadas antes desse recurso não têm a coluna I — cria ela
  // sozinho na primeira vez que alguém salvar/ler depois dessa versão.
  if (sheet.getLastColumn() < 9) {
    sheet.getRange(1, 9).setValue('aliases');
  }
  return sheet;
}

var ROOT_FOLDER_ID_DRIVE = '1oBIGX6OTW3KuDs5LqUpW6YMqF05QSAit';

function getSubfolderPorNome(pastaMae, nome) {
  var sub = pastaMae.getFoldersByName(nome);
  return sub.hasNext() ? sub.next() : null;
}

function listarPastasDeClientesNoDrive() {
  try {
    var beeonFolder = DriveApp.getFolderById(ROOT_FOLDER_ID_DRIVE);
    var clientesFolder = (beeonFolder.getName() === 'Clientes') ? beeonFolder : getSubfolderPorNome(beeonFolder, 'Clientes');
    if (!clientesFolder) {
      return { ok: false, error: 'Pasta "Clientes" não encontrada dentro da pasta Beeon.' };
    }
    var pastas = clientesFolder.getFolders();
    var lista = [];
    while (pastas.hasNext()) {
      var p = pastas.next();
      var pastaPublicacoes = getSubfolderPorNome(p, 'Publicações');
      lista.push({
        nome: p.getName(),
        driveUrl: p.getUrl(),
        pastaPublicacoesUrl: pastaPublicacoes ? pastaPublicacoes.getUrl() : null
      });
    }
    return { ok: true, clientes: lista };
  } catch (err) {
    return { ok: false, error: 'Erro ao ler o Drive: ' + err.message };
  }
}

var MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function getOuCriarPastaMes(pastaAno, mesIndex) {
  var mesNome = MESES_PT[mesIndex];
  var alvo = mesNome.toLowerCase();
  var pastas = pastaAno.getFolders();
  while (pastas.hasNext()) {
    var p = pastas.next();
    if (p.getName().toLowerCase().indexOf(alvo) !== -1) return p;
  }
  return pastaAno.createFolder(mesNome);
}

function extrairIdDeUrlDrive(url) {
  var m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function getSubfolderParecida(pastaMae, nome) {
  // Compara ignorando acentos/cedilha (normalizarNomeParaComparar já
  // remove esses sinais), pra achar a pasta mesmo se ela estiver com
  // grafia levemente diferente no Drive (ex: "Publicações" vs
  // "Publicacões", sem o Ç) em vez de criar uma pasta nova duplicada.
  var alvo = normalizarNomeParaComparar(nome);
  var pastas = pastaMae.getFolders();
  while (pastas.hasNext()) {
    var p = pastas.next();
    if (normalizarNomeParaComparar(p.getName()) === alvo) return p;
  }
  return null;
}

function getOuCriarSubpasta(pastaMae, nome) {
  var existente = getSubfolderParecida(pastaMae, nome);
  if (existente) return existente;
  return pastaMae.createFolder(nome);
}

function acharPastaDoCliente(clientesFolder, nomeCliente) {
  var linksSalvos = listarLinksClientes();
  if (linksSalvos.ok) {
    var alvo = nomeCliente.toString().trim().toLowerCase();
    for (var i = 0; i < linksSalvos.links.length; i++) {
      if (linksSalvos.links[i].cliente.toString().trim().toLowerCase() === alvo && linksSalvos.links[i].pastaDriveVinculada) {
        var id = extrairIdDeUrlDrive(linksSalvos.links[i].pastaDriveVinculada);
        if (id) {
          try { return DriveApp.getFolderById(id); } catch (e) { /* segue pro nome mesmo */ }
        }
      }
    }
  }
  return getSubfolderParecida(clientesFolder, nomeCliente);
}

function criarPastaDoCardNoDrive(cliente, tituloCard, taskId) {
  if (!cliente || !tituloCard) return { ok: false, error: 'Cliente ou título ausente.' };
  try {
    var beeonFolder = DriveApp.getFolderById(ROOT_FOLDER_ID_DRIVE);
    var clientesFolder = (beeonFolder.getName() === 'Clientes') ? beeonFolder : getSubfolderPorNome(beeonFolder, 'Clientes');
    if (!clientesFolder) return { ok: false, error: 'Pasta "Clientes" não encontrada dentro da pasta Beeon.' };

    var pastaCliente = acharPastaDoCliente(clientesFolder, cliente);
    if (!pastaCliente) return { ok: false, error: 'Não achei a pasta do cliente "' + cliente + '" no Drive. Vincule ela manualmente em Links de clientes primeiro.' };

    // A pasta "Publicações" nunca é criada automaticamente: se não achar
    // (nem com grafia parecida, sem acento/cedilha), é melhor avisar do
    // que criar uma pasta nova duplicada dentro do cliente.
    var pastaPublicacoes = getSubfolderParecida(pastaCliente, 'Publicações');
    if (!pastaPublicacoes) {
      return { ok: false, error: 'Não encontrei a pasta "Publicações" (nem com grafia parecida) dentro do cliente "' + cliente + '". Pra eu não criar uma pasta duplicada, me mostre o caminho certo dela no Drive.' };
    }
    var agora = new Date();
    var ano = String(agora.getFullYear());
    var pastaAno = getOuCriarSubpasta(pastaPublicacoes, ano);
    var pastaMes = getOuCriarPastaMes(pastaAno, agora.getMonth());

    var jaExistia = !!getSubfolderParecida(pastaMes, tituloCard);
    var pastaCard = getOuCriarSubpasta(pastaMes, tituloCard);

    if (taskId) {
      salvarPastaDoCard(taskId, pastaCard.getUrl());
    }

    return {
      ok: true,
      url: pastaCard.getUrl(),
      jaExistia: jaExistia,
      caminho: cliente + ' > Publicações > ' + ano + ' > ' + pastaMes.getName() + ' > ' + tituloCard
    };
  } catch (err) {
    return { ok: false, error: 'Erro ao criar a pasta: ' + err.message };
  }
}

// ============ PASTAS DE CARDS JÁ CRIADAS (cache — evita re-perguntar toda vez) ============
// Guarda numa aba própria "PastasCards": task_id -> url da pasta do
// Drive criada pra ela. Serve pra: (1) o botão "Criar pasta do card"
// já abrir direto como "Acessar pasta" sem pedir confirmação de novo
// quando a pessoa reabre a tarefa; (2) achar rapidinho a pasta certa
// pra checar uploads recentes, sem precisar procurar por nome de novo.

function getPastasCardsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PastasCards');
  if (!sheet) {
    sheet = ss.insertSheet('PastasCards');
    sheet.getRange('A1:C1').setValues([['task_id', 'pasta_url', 'criado_em']]);
  }
  return sheet;
}

function salvarPastaDoCard(taskId, url) {
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getPastasCardsSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(taskId)) {
        sheet.getRange(i + 1, 2, 1, 2).setValues([[url, new Date().getTime()]]);
        return;
      }
    }
    sheet.appendRow([taskId, url, new Date().getTime()]);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Devolve a URL da pasta já criada pra essa tarefa, sem tocar no Drive
 * — é uma leitura pura na planilha, então é instantâneo. Se a pasta
 * ainda não foi criada, devolve url: null (não é erro).
 */
/**
 * Painel de Avisos: o coordenador lança avisos rápidos (tipo "Fulana
 * está de férias, os clientes dela ficam com Beltrana até dia X") que
 * aparecem pra todo mundo. Guardado numa aba própria da planilha,
 * criada sozinha na primeira vez que alguém usar.
 */
function getAvisosSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Avisos');
  if (!sheet) {
    sheet = ss.insertSheet('Avisos');
    sheet.appendRow(['ID', 'Autor', 'Texto', 'CriadoEm']);
  }
  return sheet;
}

function criarAviso(autor, texto) {
  texto = (texto || '').toString().trim();
  if (!texto) return { ok: false, error: 'Escreve alguma coisa antes de lançar o aviso.' };
  var sheet = getAvisosSheet();
  var id = 'aviso-' + new Date().getTime();
  sheet.appendRow([id, autor || 'Coordenador', texto, new Date().getTime()]);
  return { ok: true, id: id };
}

function listarAvisos() {
  var sheet = getAvisosSheet();
  var dados = sheet.getDataRange().getValues();
  var avisos = [];
  for (var i = 1; i < dados.length; i++) {
    if (!dados[i][0]) continue;
    avisos.push({ id: dados[i][0], autor: dados[i][1], texto: dados[i][2], criadoEm: dados[i][3] });
  }
  avisos.sort(function (a, b) { return b.criadoEm - a.criadoEm; });
  return { ok: true, avisos: avisos.slice(0, 40) }; // só os 40 mais recentes
}

function excluirAviso(id) {
  if (!id) return { ok: false, error: 'id não informado.' };
  var sheet = getAvisosSheet();
  var dados = sheet.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Aviso não encontrado (talvez já tenha sido apagado).' };
}

function buscarPastaSalvaDoCard(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var sheet = getPastasCardsSheet();
  var linhas = sheet.getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(taskId)) {
      return { ok: true, url: linhas[i][1] || null };
    }
  }
  return { ok: true, url: null };
}

/**
 * Verifica, direto na pasta do Drive da tarefa (sem depender do cache
 * de 10 minutos do painel-designers-beeon), se teve upload de arquivo
 * novo nas últimas 3 horas. Como já sabemos exatamente qual pasta é
 * (salva em PastasCards), essa checagem é rápida — olha só 1 pasta.
 */
var JANELA_UPLOAD_RECENTE_MS = 3 * 60 * 60 * 1000; // 3 horas

/**
 * Antes só olhava a pasta exata do card — se ela nunca tivesse sido
 * criada pelo botão "Criar pasta do card" (ex: o arquivo foi jogado
 * direto na pasta do mês do cliente, sem passar por lá), a checagem
 * não achava nada, mesmo com o arquivo lá. Agora olha as DUAS coisas:
 * (1) a pasta exata do card, se já existir (mais rápido/preciso), e
 * (2) a pasta "Publicações > ano > mês" do cliente inteira — soltos
 * ali e dentro de cada subpasta de card (1 nível) — cobrindo o caso de
 * upload direto na pasta do mês. Ainda assim só olha 1 cliente e 1 mês
 * (não o Drive inteiro, ao contrário do painel-designers-beeon, que é
 * lento porque varre tudo).
 */
function buscarUploadsRecentesDoCard(taskId, cliente) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  // Cache curto (15s) pra não varrer a pasta do mês inteira do cliente
  // (com todas as subpastas) a cada 8s que o front-end faz polling
  // enquanto o card fica aberto — isso que estava deixando a notificação
  // de upload lenta. Com o cache, só 1 em cada ~2 checagens bate no Drive
  // de verdade; as outras usam o resultado recém-calculado.
  var chaveCache = 'uploadsCard_' + taskId;
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(chaveCache);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* recalcula abaixo */ }
  }

  var uploadsDaPastaDoCard = [];
  var pastaCardUrl = null;
  var salvo = buscarPastaSalvaDoCard(taskId);
  if (salvo.ok && salvo.url) {
    pastaCardUrl = salvo.url;
    var folderIdCard = extrairIdDeUrlDrive(salvo.url);
    if (folderIdCard) {
      try {
        uploadsDaPastaDoCard = listarUploadsRecentesDaPasta(DriveApp.getFolderById(folderIdCard));
      } catch (e) { /* segue mesmo assim pra checagem do mês */ }
    }
  }

  var uploadsDoMes = [];
  var pastaMesUrl = null;
  if (cliente) {
    try {
      var beeonFolder = DriveApp.getFolderById(ROOT_FOLDER_ID_DRIVE);
      var clientesFolder = (beeonFolder.getName() === 'Clientes') ? beeonFolder : getSubfolderPorNome(beeonFolder, 'Clientes');
      var pastaCliente = clientesFolder && acharPastaDoCliente(clientesFolder, cliente);
      var pastaPublicacoes = pastaCliente && getSubfolderPorNome(pastaCliente, 'Publicações');
      var pastaAno = pastaPublicacoes && getSubfolderPorNome(pastaPublicacoes, String(new Date().getFullYear()));
      var pastaMes = pastaAno && getPastaMesSemCriar(pastaAno, new Date().getMonth());
      if (pastaMes) {
        pastaMesUrl = pastaMes.getUrl();
        uploadsDoMes = listarUploadsRecentesDaPasta(pastaMes); // arquivos soltos direto no mês
        var subpastas = pastaMes.getFolders();
        while (subpastas.hasNext()) {
          uploadsDoMes = uploadsDoMes.concat(listarUploadsRecentesDaPasta(subpastas.next()));
        }
      }
    } catch (e) {
      // Não trava a checagem principal (a do card) por causa de um
      // problema aqui — só fica sem o resultado extra do mês.
    }
  }

  var vistos = {};
  var uploads = [];
  uploadsDaPastaDoCard.concat(uploadsDoMes).forEach(function (u) {
    var chave = u.arquivo + '|' + u.quando;
    if (!vistos[chave]) { vistos[chave] = true; uploads.push(u); }
  });

  var resultado = {
    ok: true,
    uploads: uploads,
    pastaUrl: pastaCardUrl || pastaMesUrl,
    pastaNome: pastaCardUrl ? 'pasta do card' : 'pasta do mês'
  };
  try { cache.put(chaveCache, JSON.stringify(resultado), 15); } catch (e) { /* cache indisponível, segue sem ele */ }
  return resultado;
}

function listarUploadsRecentesDaPasta(pasta) {
  var agora = new Date().getTime();
  var uploads = [];
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var arq = arquivos.next();
    var criadoEm = arq.getDateCreated().getTime();
    if ((agora - criadoEm) > JANELA_UPLOAD_RECENTE_MS) continue;
    uploads.push({ arquivo: arq.getName(), quando: criadoEm, quem: nomeDeQuemSubiuArquivo(arq) });
  }
  return uploads;
}

// Igual getOuCriarPastaMes, mas NUNCA cria pasta — só serve pra
// checagem de leitura (não faz sentido criar uma pasta de mês só
// porque fomos ver se tinha upload novo).
function getPastaMesSemCriar(pastaAno, mesIndex) {
  var alvo = MESES_PT[mesIndex].toLowerCase();
  var pastas = pastaAno.getFolders();
  while (pastas.hasNext()) {
    var p = pastas.next();
    if (p.getName().toLowerCase().indexOf(alvo) !== -1) return p;
  }
  return null;
}

/**
 * Tenta descobrir quem subiu um arquivo. IMPORTANTE: se a pasta
 * "Clientes" fica dentro de um Drive Compartilhado (bem comum em
 * empresa), arq.getOwner() quase sempre devolve null — em Drives
 * Compartilhados o "dono" de um arquivo não é mais uma pessoa, é o
 * Drive Compartilhado em si. Isso fazia a notificação de upload nunca
 * aparecer (o filtro "isso é meu?" no front-end sempre dava falso).
 * Por isso: (1) tenta getOwner() primeiro (funciona em Meu Drive
 * normal); (2) se não vier nada, tenta getEditors() como fallback
 * (quem tem acesso de edição recente); se mesmo assim não identificar
 * ninguém, devolve null e o Colmeia agora mostra a notificação mesmo
 * assim (não exige mais saber exatamente quem foi — a pasta já é
 * específica dessa tarefa, então qualquer upload recente ali é
 * relevante pra quem está vendo o card).
 */
function nomeDeQuemSubiuArquivo(arq) {
  try {
    var dono = arq.getOwner();
    if (dono) {
      var email = dono.getEmail();
      if (email && RUNRUN_USUARIOS.hasOwnProperty(email)) return RUNRUN_USUARIOS[email];
    }
  } catch (e) { /* comum em Drives Compartilhados — segue pro fallback */ }

  try {
    var editores = arq.getEditors();
    for (var i = 0; i < editores.length; i++) {
      var emailEditor = editores[i].getEmail();
      if (emailEditor && RUNRUN_USUARIOS.hasOwnProperty(emailEditor)) return RUNRUN_USUARIOS[emailEditor];
    }
  } catch (e) { /* sem problema, fica null mesmo */ }

  return null;
}

// Rode manualmente pelo editor (com o ID de uma tarefa e o nome do
// cliente exatamente como aparece no Colmeia) se a notificação de
// upload ainda não aparecer depois de subir um arquivo de teste —
// mostra exatamente o que buscarUploadsRecentesDoCard está vendo: a
// pasta do card (se existir), a pasta do mês do cliente, e todos os
// arquivos encontrados nas duas.
function diagnosticoUploadsDoCard(taskId, cliente) {
  var resultado = buscarUploadsRecentesDoCard(taskId, cliente);
  Logger.log('Resultado completo: ' + JSON.stringify(resultado, null, 2));

  var salvo = buscarPastaSalvaDoCard(taskId);
  Logger.log('Pasta do card salva (PastasCards): ' + JSON.stringify(salvo));

  if (!cliente) {
    Logger.log('Passe o nome do cliente como 2º argumento (igual aparece no Colmeia) pra também checar a pasta do mês.');
  }
}

function listarLinksClientes() {
  var sheet = getLinksClientesSheet();
  var linhas = sheet.getDataRange().getValues();
  var links = [];
  for (var i = 1; i < linhas.length; i++) {
    if (!linhas[i][0]) continue;
    var extras = [];
    try { extras = linhas[i][5] ? JSON.parse(linhas[i][5]) : []; } catch (e) { extras = []; }
    links.push({
      cliente: linhas[i][0],
      drive: linhas[i][1] || '',
      bancoImagens: linhas[i][2] || '',
      bibliotecaAdobe: linhas[i][3] || '',
      pastaPublicacoes: linhas[i][4] || '',
      extras: extras,
      pastaDriveVinculada: linhas[i][6] || '',
      descricao: linhas[i][7] || '',
      aliases: linhas[i][8] ? String(linhas[i][8]).split('|').map(function (s) { return s.trim(); }).filter(Boolean) : []
    });
  }
  return { ok: true, links: links };
}

function salvarLinksCliente(cliente, dados) {
  if (!cliente) return { ok: false, error: 'Cliente não informado.' };
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getLinksClientesSheet();
    var linhas = sheet.getDataRange().getValues();
    var extrasTexto = JSON.stringify(dados.extras || []);
    var aliasesTexto = (dados.aliases || []).join('|');
    var linhaValores = [
      dados.drive || '',
      dados.bancoImagens || '',
      dados.bibliotecaAdobe || '',
      dados.pastaPublicacoes || '',
      extrasTexto,
      dados.pastaDriveVinculada || '',
      dados.descricao || '',
      aliasesTexto
    ];
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(cliente)) {
        sheet.getRange(i + 1, 2, 1, 8).setValues([linhaValores]);
        return { ok: true };
      }
    }
    sheet.appendRow([cliente].concat(linhaValores));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Remove da aba LinksClientes as linhas com esses nomes exatos — usada
 * depois de "linkar" vários nomes de cliente num só: os nomes que
 * viraram apelido do canônico não devem continuar existindo como linha
 * própria (senão uma busca por eles ainda acharia o registro antigo
 * em vez de cair no apelido do cliente certo).
 */
function excluirClientesPorNomes(nomes) {
  if (!nomes || !nomes.length) return { ok: false, error: 'Nenhum nome informado.' };
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getLinksClientesSheet();
    var linhas = sheet.getDataRange().getValues();
    var alvo = nomes.map(function (n) { return String(n).toLowerCase().trim(); });
    for (var i = linhas.length - 1; i >= 1; i--) {
      if (alvo.indexOf(String(linhas[i][0]).toLowerCase().trim()) !== -1) {
        sheet.deleteRow(i + 1);
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ============ CLIENTES OCULTOS ============

function getClientesOcultosSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ClientesOcultos');
  if (!sheet) {
    sheet = ss.insertSheet('ClientesOcultos');
    sheet.getRange('A1:B1').setValues([['designer', 'cliente']]);
  }
  return sheet;
}

function listarClientesOcultos() {
  var sheet = getClientesOcultosSheet();
  var linhas = sheet.getDataRange().getValues();
  var lista = [];
  for (var i = 1; i < linhas.length; i++) {
    if (linhas[i][0] && linhas[i][1]) lista.push({ designer: linhas[i][0], cliente: linhas[i][1] });
  }
  return { ok: true, ocultos: lista };
}

function ocultarClienteDesigner(designer, cliente) {
  if (!designer || !cliente) return { ok: false, error: 'Designer ou cliente ausente.' };
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getClientesOcultosSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(designer) && String(linhas[i][1]) === String(cliente)) {
        return { ok: true };
      }
    }
    sheet.appendRow([designer, cliente]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function restaurarClienteDesigner(designer, cliente) {
  if (!designer || !cliente) return { ok: false, error: 'Designer ou cliente ausente.' };
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getClientesOcultosSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(designer) && String(linhas[i][1]) === String(cliente)) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ============ LOGIN ============

function getLoginSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Login');
  if (!sheet) {
    sheet = ss.insertSheet('Login');
    sheet.getRange('A1:C1').setValues([['nome', 'senhaHash', 'papel']]);
  }
  return sheet;
}

function normalizarNomeLogin(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function gerarHashSenha(senha) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function verificarLogin(senha) {
  if (!senha) return { ok: false, error: 'Digite a senha.' };
  var sheet = getLoginSheet();
  var linhas = sheet.getDataRange().getValues();
  var hashDigitado = gerarHashSenha(senha);
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][1]) === hashDigitado) {
      return { ok: true, nome: linhas[i][0], papel: linhas[i][2] || 'designer' };
    }
  }
  return { ok: false, error: 'Senha incorreta.' };
}

function salvarLoginDaPessoa(nome, senha, papel) {
  var sheet = getLoginSheet();
  var linhas = sheet.getDataRange().getValues();
  var hash = gerarHashSenha(senha);
  for (var i = 1; i < linhas.length; i++) {
    if (normalizarNomeLogin(linhas[i][0]) === normalizarNomeLogin(nome)) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[hash, papel]]);
      Logger.log('Login de "' + nome + '" atualizado.');
      return;
    }
  }
  sheet.appendRow([nome, hash, papel]);
  Logger.log('Login de "' + nome + '" criado.');
}

function getPessoasSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Pessoas');
  if (!sheet) {
    sheet = ss.insertSheet('Pessoas');
    sheet.getRange('A1:D1').setValues([['nome', 'foto', 'aliases', 'discord']]);
  }
  return sheet;
}

function listarPessoasSalvas() {
  var sheet = getPessoasSheet();
  var linhas = sheet.getDataRange().getValues();
  var pessoas = [];
  for (var i = 1; i < linhas.length; i++) {
    if (!linhas[i][0]) continue;
    pessoas.push({
      nome: linhas[i][0],
      foto: linhas[i][1] || '',
      aliases: linhas[i][2] ? String(linhas[i][2]).split('|').map(function (s) { return s.trim(); }).filter(Boolean) : [],
      discord: linhas[i][3] || ''
    });
  }
  return { ok: true, pessoas: pessoas };
}

function salvarPessoa(nome, foto, aliases, discord) {
  if (!nome) return { ok: false, error: 'Nome não informado.' };
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getPessoasSheet();
    var linhas = sheet.getDataRange().getValues();
    var aliasesTexto = (aliases || []).join('|');
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(nome)) {
        sheet.getRange(i + 1, 2, 1, 3).setValues([[foto || '', aliasesTexto, discord || '']]);
        return { ok: true };
      }
    }
    sheet.appendRow([nome, foto || '', aliasesTexto, discord || '']);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Remove da aba Pessoas as linhas com esses nomes exatos — usada depois
 * de "linkar" vários nomes numa pessoa só: os nomes que viraram apelido
 * da pessoa principal não devem continuar existindo como linha própria.
 */
function excluirPessoasPorNomes(nomes) {
  if (!nomes || !nomes.length) return { ok: false, error: 'Nenhum nome informado.' };
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getPessoasSheet();
    var linhas = sheet.getDataRange().getValues();
    var alvo = nomes.map(function (n) { return String(n).toLowerCase().trim(); });
    for (var i = linhas.length - 1; i >= 1; i--) {
      if (alvo.indexOf(String(linhas[i][0]).toLowerCase().trim()) !== -1) {
        sheet.deleteRow(i + 1);
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ============ PRIORIDADE ============

function getExtrasSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Extras');
  if (!sheet) {
    sheet = ss.insertSheet('Extras');
    sheet.getRange('A1:C1').setValues([['task_id', 'prioridade', 'atualizado_em']]);
  }
  return sheet;
}

function getPrioridadesSalvas() {
  var sheet = getExtrasSheet();
  var linhas = sheet.getDataRange().getValues();
  var mapa = {};
  for (var i = 1; i < linhas.length; i++) {
    if (linhas[i][0]) mapa[linhas[i][0]] = linhas[i][1];
  }
  return mapa;
}

function definirPrioridade(taskId, prioridade) {
  if (!taskId || ['alta', 'media', 'baixa'].indexOf(prioridade) === -1) {
    return { ok: false, error: 'taskId ou prioridade inválidos.' };
  }

  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getExtrasSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(taskId)) {
        sheet.getRange(i + 1, 2).setValue(prioridade);
        sheet.getRange(i + 1, 3).setValue(new Date().getTime());
        return { ok: true };
      }
    }
    sheet.appendRow([taskId, prioridade, new Date().getTime()]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ============ CRONÔMETRO ============

function tocarTarefa(taskId, taskTitle, designer) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/play');
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou o play (status ' + resultado.status + ').' };
  }
  registrarPlay(taskId, taskTitle, designer);
  return { ok: true };
}

function pausarTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/pause');
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou o pause (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

// ============ LOG DE PLAYS (aba "Minhas tarefas de hoje") ============

function getLogPlaysSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Log de Plays');
  if (!sheet) {
    sheet = ss.insertSheet('Log de Plays');
    sheet.getRange('A1:E1').setValues([['task_id', 'titulo', 'designer', 'quando', 'data']]);
  }
  return sheet;
}

/**
 * Registra 1 linha toda vez que alguém dá play numa tarefa. Não junta
 * com plays anteriores da mesma tarefa no mesmo dia — é só um registro
 * cru; quem lê depois (buscarPlaysDeHoje) que agrupa por tarefa.
 */
function registrarPlay(taskId, taskTitle, designer) {
  if (!taskId || !designer) return;
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getLogPlaysSheet();
    var agora = new Date();
    var dataISO = Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd');
    sheet.appendRow([taskId, taskTitle || '', designer, agora.getTime(), dataISO]);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Devolve, pro designer informado, a lista de tarefas que tiveram play
 * hoje — 1 item por tarefa (mesmo com vários plays no dia), já com o
 * horário (em milissegundos) do 1º e do último play.
 */
function buscarPlaysDeHoje(designer) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var sheet = getLogPlaysSheet();
  var linhas = sheet.getDataRange().getValues();
  var hojeISO = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var porTarefa = {};
  for (var i = 1; i < linhas.length; i++) {
    var taskId = linhas[i][0], titulo = linhas[i][1], nomeDesigner = linhas[i][2], quando = linhas[i][3], data = linhas[i][4];
    if (data !== hojeISO) continue;
    if (String(nomeDesigner).toLowerCase().trim() !== String(designer).toLowerCase().trim()) continue;
    if (!porTarefa[taskId]) {
      porTarefa[taskId] = { taskId: taskId, titulo: titulo, primeiroPlay: quando, ultimoPlay: quando };
    } else {
      if (quando < porTarefa[taskId].primeiroPlay) porTarefa[taskId].primeiroPlay = quando;
      if (quando > porTarefa[taskId].ultimoPlay) porTarefa[taskId].ultimoPlay = quando;
    }
  }
  var lista = Object.keys(porTarefa).map(function (k) { return porTarefa[k]; });
  lista.sort(function (a, b) { return b.ultimoPlay - a.ultimoPlay; });
  return { ok: true, tarefas: lista };
}

// ============ IA (Groq / Gemini) ============

function chamarGroq(prompt) {
  var url = 'https://api.groq.com/openai/v1/chat/completions';
  var payload = {
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var codigo = res.getResponseCode();
  var corpo = res.getContentText();

  var parsed;
  try {
    parsed = JSON.parse(corpo);
  } catch (e) {
    return { ok: false, error: 'Resposta inesperada do Groq (status ' + codigo + ').' };
  }
  if (codigo < 200 || codigo >= 300) {
    var msg = (parsed.error && parsed.error.message) || ('Groq recusou (status ' + codigo + ').');
    return { ok: false, error: msg };
  }
  var texto = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
  if (!texto) return { ok: false, error: 'Groq não devolveu nenhum texto.' };

  var dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: 'Groq devolveu algo que não é um JSON válido: ' + texto.substring(0, 200) };
  }
  return { ok: true, dados: dados };
}

function chamarGemini(prompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': GEMINI_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var codigo = res.getResponseCode();
  var corpo = res.getContentText();

  var parsed;
  try {
    parsed = JSON.parse(corpo);
  } catch (e) {
    return { ok: false, error: 'Resposta inesperada do Gemini (status ' + codigo + ').' };
  }
  if (codigo < 200 || codigo >= 300) {
    var msg = (parsed.error && parsed.error.message) || ('Gemini recusou (status ' + codigo + ').');
    return { ok: false, error: msg };
  }
  var candidato = parsed.candidates && parsed.candidates[0];
  var texto = candidato && candidato.content && candidato.content.parts && candidato.content.parts[0] && candidato.content.parts[0].text;
  if (!texto) return { ok: false, error: 'Gemini não devolveu nenhum texto.' };

  var dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: 'Gemini devolveu algo que não é um JSON válido: ' + texto.substring(0, 200) };
  }
  return { ok: true, dados: dados };
}

function gerarFraseDoDia() {
  var agora = new Date();
  var diaSemana = Utilities.formatDate(agora, 'America/Sao_Paulo', 'EEEE');
  var hora = Number(Utilities.formatDate(agora, 'America/Sao_Paulo', 'H'));
  var periodo = hora < 12 ? 'manhã' : (hora < 18 ? 'tarde' : 'noite');

  var prompt = 'Você escreve frases curtas, engraçadas e espirituosas pro topo da tela de login de um ' +
    'sistema interno de uma agência de design chamada Colmeia.\n' +
    'Agora é ' + diaSemana + ' de ' + periodo + ' (horário de Brasília).\n' +
    'Escreva UMA frase curta (no máximo 12 palavras), engraçada, que combine com esse dia/período — ' +
    'pode brincar com o dia da semana, o cansaço do trabalho, café, prazos de agência, ou humor leve de ' +
    'escritório. Não seja genérico, seja espirituoso e específico pro momento.\n' +
    'Responda SOMENTE em JSON, neste formato: {"frase": "..."}';

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;
  return { ok: true, frase: (resultado.dados && resultado.dados.frase) || null };
}

function getBriefingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Briefings');
  if (!sheet) {
    sheet = ss.insertSheet('Briefings');
    sheet.getRange('A1:D1').setValues([['task_id', 'hash_descricao', 'briefing_json', 'atualizado_em']]);
  }
  return sheet;
}

function hashTexto(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto || '', Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function buscarBriefingCacheado(taskId, hash) {
  var sheet = getBriefingsSheet();
  var linhas = sheet.getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(taskId)) {
      if (String(linhas[i][1]) === hash) {
        try { return JSON.parse(linhas[i][2]); } catch (e) { return null; }
      }
      return null;
    }
  }
  return null;
}

function salvarBriefingCacheado(taskId, hash, briefing) {
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    var sheet = getBriefingsSheet();
    var linhas = sheet.getDataRange().getValues();
    var linhaValores = [hash, JSON.stringify(briefing), new Date().getTime()];
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(taskId)) {
        sheet.getRange(i + 1, 2, 1, 3).setValues([linhaValores]);
        return;
      }
    }
    sheet.appendRow([taskId].concat(linhaValores));
  } finally {
    lock.releaseLock();
  }
}

function gerarBriefingDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var bruto = runrunFetch('/tasks/' + taskId + '/description');
  var descricaoHtml = '';
  if (typeof bruto === 'string') {
    descricaoHtml = bruto;
  } else if (bruto && typeof bruto === 'object') {
    descricaoHtml = bruto.description || bruto.text || bruto.html || bruto.content || '';
  }
  if (!descricaoHtml) return { ok: true, semDescricao: true };

  var hash = hashTexto(descricaoHtml);
  var cacheado = buscarBriefingCacheado(taskId, hash);
  if (cacheado) return { ok: true, briefing: cacheado, doCache: true };

  var prompt = 'Você organiza briefings de tarefas de design de uma agência de marketing.\n' +
    'Você vai receber a descrição em HTML de uma tarefa do Runrun.it. Ela pode ter checklists no ' +
    'formato <ul data-checked="true"> (marcado) ou <ul data-checked="false"> (não marcado), com <li> dentro, ' +
    'seguidos de perguntas em texto livre.\n\n' +
    'Responda SOMENTE com um JSON válido, exatamente neste formato, sem nenhum texto antes ou depois:\n' +
    '{"plataformas": ["..."], "formatos": ["..."], "resumo": "...", ' +
    '"campos": [{"pergunta": "...", "resposta": "..." ou null}]}\n\n' +
    'Descrição da tarefa (HTML):\n' + descricaoHtml;

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;
  salvarBriefingCacheado(taskId, hash, resultado.dados);
  return { ok: true, briefing: resultado.dados };
}

function buscarDescricao(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var bruto = runrunFetch('/tasks/' + taskId + '/description');
  var texto = '';
  if (typeof bruto === 'string') {
    texto = bruto;
  } else if (bruto && typeof bruto === 'object') {
    texto = bruto.description || bruto.text || bruto.html || bruto.content || '';
  }
  return { ok: true, descricao: texto };
}

function salvarDescricao(taskId, texto) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var tentativa1 = runrunRequest('/tasks/' + taskId + '/description', 'put', { description: texto });
  if (tentativa1.ok) return { ok: true };

  var tentativa2 = runrunRequest('/tasks/' + taskId, 'put', { description: texto });
  if (tentativa2.ok) return { ok: true };

  return {
    ok: false,
    error: 'Runrun.it recusou salvar a descrição (status ' + tentativa1.status + ' e ' + tentativa2.status + '). Precisa de diagnóstico.'
  };
}

function buscarAnexosTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var comentarios = runrunFetch('/tasks/' + taskId + '/comments');
  if (!Array.isArray(comentarios)) {
    return { ok: false, error: 'Resposta inesperada do Runrun.it ao buscar anexos.' };
  }
  var anexos = [];
  comentarios.forEach(function (c) {
    (c.documents || []).forEach(function (d) {
      if (d.is_deleted) return;
      anexos.push({
        id: d.id,
        nome: d.file_name || 'Anexo',
        tamanho: d.file_size || 0,
        extensao: d.file_extension || ''
      });
    });
  });
  return { ok: true, anexos: anexos };
}

function baixarDocumentoAnexo(documentId) {
  if (!documentId) return { ok: false, error: 'documentId não informado.' };
  try {
    var res = UrlFetchApp.fetch(RUNRUN_BASE_URL + '/documents/' + documentId + '/download', {
      method: 'get',
      headers: {
        'App-Key': RUNRUN_APP_KEY,
        'User-Token': RUNRUN_USER_TOKEN
      },
      muteHttpExceptions: true
    });
    var codigo = res.getResponseCode();
    if (codigo < 200 || codigo >= 300) {
      return { ok: false, error: 'Runrun.it recusou o download (status ' + codigo + ').' };
    }
    var blob = res.getBlob();
    return {
      ok: true,
      base64: Utilities.base64Encode(blob.getBytes()),
      mimeType: blob.getContentType() || 'application/octet-stream'
    };
  } catch (err) {
    return { ok: false, error: 'Erro ao baixar anexo: ' + err.message };
  }
}

// ============ COMENTÁRIOS ============

function formatarNomeSlug(slug) {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function (letra) { return letra.toUpperCase(); });
}

function listarComentarios(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var bruto = runrunFetch('/tasks/' + taskId + '/comments');
  if (!Array.isArray(bruto)) {
    return { ok: false, error: 'Resposta inesperada do Runrun.it ao listar comentários.' };
  }
  var comentarios = bruto
    .filter(function (c) { return !c.is_system_message; })
    .map(function (c) {
      var autor = c.commenter_name || c.user_name || (c.user_id ? formatarNomeSlug(c.user_id) : null) || 'Desconhecido';
      return {
        id: c.id,
        autor: autor,
        texto: c.text || c.description || '',
        data: c.created_at || c.date || null,
        reactions: c.reactions || []
      };
    })
    .sort(function (a, b) { return new Date(a.data || 0) - new Date(b.data || 0); });
  return { ok: true, comentarios: comentarios };
}

function adicionarComentario(taskId, texto) {
  if (!taskId || !texto) return { ok: false, error: 'taskId ou texto ausente.' };
  var resultado = runrunPost('/tasks/' + taskId + '/comments', { text: texto });
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou o comentário (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function excluirComentario(commentId) {
  if (!commentId) return { ok: false, error: 'commentId ausente.' };
  var resultado = runrunRequest('/comments/' + commentId, 'delete', null);
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou excluir (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function reagirComentario(commentId, emoji) {
  if (!commentId || !emoji) return { ok: false, error: 'commentId ou emoji ausente.' };
  var resultado = runrunPost('/comments/' + commentId + '/reaction', { emoji: emoji });
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou a reação (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function adicionarComentarioComAnexo(taskId, texto, nomeArquivo, mimeType, base64Dados) {
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
        'User-Token': RUNRUN_USER_TOKEN
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

function avancarWorkflowTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/complete_workflow_step');
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou avançar a sequência (status ' + resultado.status + '). Talvez essa tarefa não tenha uma Sequência de responsáveis configurada.' };
  }
  return { ok: true, novoResponsavel: resultado.body ? resultado.body.responsible_name : null };
}

function desfazerWorkflowTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/undo_workflow_step');
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou desfazer (status ' + resultado.status + ').' };
  }
  return { ok: true, novoResponsavel: resultado.body ? resultado.body.responsible_name : null };
}

function buscarTarefaCompleta(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var t = runrunFetch('/tasks/' + taskId);
  if (!t || t.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };
  }
  return { ok: true, tarefa: transformarTarefaParaColmeia(t) };
}

function buscarCardMae(subtaskId) {
  if (!subtaskId) return { ok: false, error: 'subtaskId não informado.' };

  var subtarefa = runrunFetch('/tasks/' + subtaskId);
  if (!subtarefa || subtarefa.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };
  }
  if (!subtarefa.parent_task_id) {
    return { ok: true, temPai: false };
  }

  var cardMaeRaw = runrunFetch('/tasks/' + subtarefa.parent_task_id);
  if (!cardMaeRaw || cardMaeRaw.erroFetch) {
    return { ok: false, error: 'Não consegui ler o card mãe no Runrun.it.' };
  }

  var idsSubtarefas = cardMaeRaw.subtask_ids || [];
  var subtarefas = idsSubtarefas.map(function (id) {
    var t = runrunFetch('/tasks/' + id);
    if (!t || t.erroFetch) return null;
    return {
      id: t.id,
      title: t.title,
      etapa: t.board_stage_name || t.task_state_name || '',
      tipo: t.type_name || '',
      responsavel: t.responsible_name || '',
      foto: extrairFotoResponsavel(t),
      fechada: !!t.is_closed,
      link: 'https://runrun.it/tasks/' + t.id
    };
  }).filter(function (t) { return t !== null; });

  return {
    ok: true,
    temPai: true,
    cardMae: transformarTarefaParaColmeia(cardMaeRaw),
    subtarefas: subtarefas
  };
}

function buscarSequenciaResponsaveis(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var tarefa = runrunFetch('/tasks/' + taskId);
  if (!tarefa || tarefa.erroFetch || !tarefa.workflow_id) {
    return { ok: true, sequencia: [] };
  }

  var elementos = runrunFetch('/workflows/' + tarefa.workflow_id + '/workflow_elements');
  if (!Array.isArray(elementos)) {
    return { ok: false, error: 'Resposta inesperada do Runrun.it ao buscar a sequência.' };
  }

  var sequencia = elementos
    .sort(function (a, b) { return a.order - b.order; })
    .map(function (el, i, lista) {
      return {
        id: el.id,
        nome: el.user_name,
        foto: el.user_avatar_url || null,
        atual: !!el.is_current,
        concluido: !!el.is_completed,
        ultimo: i === lista.length - 1
      };
    });

  return { ok: true, sequencia: sequencia, workflowId: tarefa.workflow_id };
}

function entregarTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/deliver');
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou entregar a tarefa (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function reabrirTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var resultado = runrunPost('/tasks/' + taskId + '/reopen');
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou reabrir a tarefa (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

/**
 * ⚠️ AINDA NÃO CONFIRMADA — inferida pelo mesmo padrão que o resto da
 * API do Runrun.it já usa (ex: POST /tasks/:id/checklist pra criar um
 * checklist na tarefa). Cria a "Sequência de responsáveis" do zero
 * numa tarefa que ainda não tem nenhuma — segundo o Cláudio, ao fazer
 * isso pela tela do Runrun.it, ele mesmo (quem está logado) já entra
 * automaticamente como primeira pessoa da sequência.
 *
 * NÃO está ligada em nenhum fluxo de verdade ainda. Rode
 * diagnosticoCriarWorkflowTeste() numa tarefa de TESTE (trocando o
 * número), confira no "Registro de execução" e no próprio Runrun.it
 * se criou a sequência certinho, antes de eu ligar isso no Repassar.
 */
function criarWorkflowDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId ausente.' };
  var resultado = runrunRequest('/tasks/' + taskId + '/workflow', 'post', {});
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou criar a sequência (status ' + resultado.status + ').', bodyBruto: resultado.body };
  }
  var workflowId = resultado.body && (resultado.body.id || resultado.body.workflow_id);
  return { ok: true, workflowId: workflowId, bodyBruto: resultado.body };
}

function diagnosticoCriarWorkflowTeste() {
  var taskId = 109278; // troque pelo ID de uma tarefa de TESTE, sem sequência configurada ainda
  var resultado = criarWorkflowDaTarefa(taskId);
  Logger.log('Resultado: ' + JSON.stringify(resultado, null, 2));
  if (resultado.ok) {
    var sequenciaDepois = buscarSequenciaResponsaveis(taskId);
    Logger.log('Sequência depois de criar: ' + JSON.stringify(sequenciaDepois, null, 2));
  }
}

function adicionarPessoaNaRegra(workflowId, userId) {
  if (!workflowId || !userId) return { ok: false, error: 'workflowId ou userId ausente.' };
  var resultado = runrunRequest('/workflows/' + workflowId + '/workflow_elements', 'post', { user_id: userId });
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou adicionar na regra (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function removerDaRegra(workflowId, elementId) {
  if (!workflowId || !elementId) return { ok: false, error: 'workflowId ou elementId ausente.' };
  var resultado = runrunRequest('/workflows/' + workflowId + '/workflow_elements/' + elementId, 'delete', null);
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou remover da regra (status ' + resultado.status + ').' };
  }
  return { ok: true };
}

function reatribuirTarefa(taskId, responsavelId) {
  if (!taskId || !responsavelId) return { ok: false, error: 'taskId ou responsavelId ausente.' };

  var tentativaUserId = runrunRequest('/tasks/' + taskId, 'put', { user_id: responsavelId });
  if (tentativaUserId.ok) return { ok: true };

  var tentativaAssignment = runrunRequest('/tasks/' + taskId + '/assignments', 'post', { assignee_id: responsavelId });
  if (tentativaAssignment.ok) return { ok: true };

  return {
    ok: false,
    error: 'Runrun.it recusou reatribuir a tarefa (status ' + tentativaUserId.status + ' e ' + tentativaAssignment.status + '). Precisa de diagnóstico.'
  };
}

function listarTodosUsuariosRunrun() {
  var usuarios = runrunFetch('/users');
  if (!Array.isArray(usuarios)) {
    return { ok: false, error: 'Resposta inesperada do Runrun.it ao listar usuários.' };
  }
  var lista = usuarios.map(function (u) {
    return {
      id: u.id,
      nome: u.name,
      foto: u.avatar_url || u.avatar || u.picture_url || null
    };
  });
  return { ok: true, usuarios: lista };
}

// ============ JUNTA TUDO PRO FRONT-END ============

function getTarefasColmeia() {
  try {
    var tarefas = buscarTarefasRunrun();
    var prioridadesSalvas = getPrioridadesSalvas();

    tarefas.forEach(function (t) {
      if (prioridadesSalvas.hasOwnProperty(t.id)) {
        t.priority = prioridadesSalvas[t.id];
      } else if (t.status === 'prioridades') {
        t.priority = 'alta';
      } else {
        t.priority = 'media';
      }
    });

    return { ok: true, tarefas: tarefas, colunas: Object.keys(COLUNAS_PRINCIPAIS) };
  } catch (err) {
    return { ok: false, error: 'Erro ao buscar tarefas do Runrun.it: ' + err.message };
  }
}

/**
 * Move a tarefa de verdade pra outra etapa/coluna no Runrun.it.
 * ✅ CONFIRMADO: o campo certo pra ESCREVER é "task_state_id", não
 * "board_stage_id" — esse último é só leitura.
 */
function moverEtapaTarefa(taskId, chaveColuna) {
  if (!taskId || !chaveColuna) return { ok: false, error: 'taskId ou coluna ausente.' };
  var novoStageId = COLUNA_STAGE_IDS[chaveColuna];
  if (!novoStageId) return { ok: false, error: 'Coluna "' + chaveColuna + '" sem ID configurado em COLUNA_STAGE_IDS.' };

  var resultado = runrunRequest('/tasks/' + taskId, 'put', { task_state_id: novoStageId });
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
function alterarDataEntregaTarefa(taskId, novaData) {
  if (!taskId || !novaData) return { ok: false, error: 'taskId ou novaData ausente.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, error: 'Formato de data inválido (esperado AAAA-MM-DD).' };
  var resultado = runrunRequest('/tasks/' + taskId, 'put', {
    desired_date: novaData,
    desired_date_with_time: novaData + 'T18:00:00-03:00'
  });
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
function alterarDataPublicacaoTarefa(taskId, novaData) {
  if (!taskId || !novaData) return { ok: false, error: 'taskId ou novaData ausente.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) return { ok: false, error: 'Formato de data inválido (esperado AAAA-MM-DD).' };
  var camposCustom = {};
  camposCustom[CAMPO_DATA_PUBLICACAO] = novaData;
  var resultado = runrunRequest('/tasks/' + taskId, 'put', { custom_fields: camposCustom });
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
 * Ajusta a estimativa de horas de uma tarefa.
 */
function ajustarEstimativaTarefa(taskId, minutos) {
  if (!taskId || !minutos) return { ok: false, error: 'taskId ou minutos ausente.' };
  var segundos = Math.round(Number(minutos) * 60);
  if (!segundos || segundos <= 0) return { ok: false, error: 'Valor de horas inválido.' };

  var resultado = runrunRequest('/tasks/' + taskId, 'put', { current_estimate_seconds: segundos });
  if (!resultado.ok) {
    return { ok: false, error: 'Runrun.it recusou ajustar a estimativa (status ' + resultado.status + ').' };
  }
  return { ok: true };
}