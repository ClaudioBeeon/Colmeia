/**
 * Tudo que LÊ do Runrun.it: as chamadas base da API, a tradução de
 * uma tarefa do formato dele pro formato do Colmeia, e as buscas (quadro,
 * card mãe, sequência de responsáveis, comentários, anexos, descrição).
 * Nada aqui altera nada lá — só leitura.
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

/**
 * Como runrunFetch, mas busca VÁRIOS endereços do Runrun.it AO MESMO TEMPO
 * (UrlFetchApp.fetchAll) em vez de um depois do outro.
 *
 * Por que isso importa: sem isso, juntar várias buscas numa única chamada
 * do Colmeia sairia mais LENTO do que o jeito antigo. Antes, o navegador
 * pedia 8 a 12 coisas em paralelo; se o backend fosse buscar tudo em fila
 * indiana, o tempo total seria a soma de todas. Com fetchAll, o Colmeia
 * paga uma ida ao Apps Script só (o que é caro) e as buscas no Runrun.it
 * acontecem juntas (o que é rápido).
 *
 * Devolve uma lista na MESMA ordem dos caminhos pedidos. Um endereço que
 * falhar vira { erroFetch: true } naquela posição, sem derrubar os outros.
 */
function runrunFetchAll(caminhos) {
  if (!caminhos || !caminhos.length) return [];
  var pedidos = caminhos.map(function (caminho) {
    return {
      url: RUNRUN_BASE_URL + caminho,
      method: 'get',
      headers: {
        'App-Key': RUNRUN_APP_KEY,
        'User-Token': RUNRUN_USER_TOKEN,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
  });
  var respostas;
  try {
    respostas = UrlFetchApp.fetchAll(pedidos);
  } catch (e) {
    // fetchAll indisponível ou recusado — cai pro jeito um-a-um, que
    // funciona igual, só mais devagar.
    return caminhos.map(function (c) { return runrunFetch(c); });
  }
  return respostas.map(function (res) {
    var codigo = res.getResponseCode();
    var corpo = res.getContentText();
    try {
      return JSON.parse(corpo);
    } catch (e) {
      return { erroFetch: true, status: codigo, corpoBruto: corpo.substring(0, 300) };
    }
  });
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

// A lista de usuários do Runrun.it é a MESMA o dia inteiro (id de pessoa
// não muda), mas era buscada do zero em toda varredura do quadro e em toda
// abertura do "Ver regra" — uma ida à rede inteira, repetida, no caminho
// crítico. Agora fica guardada por 6 horas.
//
// Chaves separadas de propósito: `usuariosRunrunCompletos` é a lista bruta
// (nome + foto de TODO mundo, usada pra reatribuir/montar regra) e
// `idsResponsaveisRunrun` é só o mapinha e-mail -> id dos 3 designers do
// COLMEIA, que é o que a varredura do quadro precisa.
var CACHE_USUARIOS_SEGUNDOS = 6 * 60 * 60;

function buscarUsuariosRunrunComCache() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get('usuariosRunrunCompletos');
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* busca de novo abaixo */ }
  }
  var usuarios = runrunFetch('/users');
  if (!Array.isArray(usuarios)) return null; // não guarda erro em cache
  try {
    cache.put('usuariosRunrunCompletos', JSON.stringify(usuarios), CACHE_USUARIOS_SEGUNDOS);
  } catch (e) { /* lista grande demais pro cache — segue sem guardar */ }
  return usuarios;
}

/**
 * Lista de projetos do Runrun.it (é DENTRO de um projeto que uma tarefa
 * nova é criada — ver criarTarefaRunrun, RunrunEscrita.gs). Fica em cache
 * 20 min: muda pouco (só quando cadastra projeto novo no Runrun.it), e sem
 * cache seria buscado de novo toda vez que o coordenador abrisse
 * "Nova tarefa".
 *
 * IMPORTANTE — projeto NÃO é cliente. O nome de um projeto no Runrun.it é
 * o do período/frente de trabalho ("[AGO2026] PERFORMANCE"), e vários
 * clientes diferentes têm projetos com nomes IGUAIS. A lista sozinha era
 * impossível de usar: aparecia só "[AGO2026] PERFORMANCE" repetido, sem
 * dizer de quem era. Por isso cada projeto sai daqui com o `cliente` junto
 * (`nome` continua sendo só o do projeto, `rotulo` é o texto pronto pra
 * mostrar na tela: "Cliente · Projeto").
 */
function buscarProjetosRunrun() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get('projetosRunrunV2'); // V2: formato novo, com cliente
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* busca de novo abaixo */ }
  }
  var projetos = runrunFetch('/projects?limit=200');
  if (!Array.isArray(projetos)) return null; // não guarda erro em cache

  var nomesDeClientes = buscarClientesRunrunPorId();
  var lista = projetos.map(function (p) {
    var nomeProjeto = p.name || p.title || ('Projeto ' + p.id);
    // O nome do cliente pode vir junto no próprio projeto (depende da
    // versão da API); quando não vem, procura pelo id na lista de clientes.
    var cliente = p.client_name || (p.client && p.client.name) || nomesDeClientes[p.client_id] || '';
    return {
      id: p.id,
      nome: nomeProjeto,
      cliente: cliente,
      rotulo: cliente ? (cliente + ' · ' + nomeProjeto) : nomeProjeto
    };
  }).filter(function (p) { return p.id && p.nome; });

  try { cache.put('projetosRunrunV2', JSON.stringify(lista), 20 * 60); } catch (e) { /* segue sem guardar */ }
  return lista;
}

/**
 * Mapa id -> nome dos clientes do Runrun.it. Serve pra dizer de QUEM é cada
 * projeto na hora de criar uma tarefa (ver buscarProjetosRunrun). Cliente
 * cadastrado muda raramente, então fica 6h em cache, igual à lista de
 * usuários.
 */
function buscarClientesRunrunPorId() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get('clientesRunrunPorId');
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* busca de novo abaixo */ }
  }
  var clientes = runrunFetch('/clients?limit=200');
  var mapa = {};
  if (!Array.isArray(clientes)) return mapa; // não guarda erro em cache
  clientes.forEach(function (c) {
    if (c && c.id) mapa[c.id] = c.name || c.title || '';
  });
  try { cache.put('clientesRunrunPorId', JSON.stringify(mapa), 6 * 60 * 60); } catch (e) { /* segue */ }
  return mapa;
}

/**
 * Acha o id de verdade de um dos 3 designers do Colmeia (Cláudio, Gustavo,
 * Erick) pelo NOME — usado pra criar uma tarefa nova já com responsável
 * (ver criarTarefaRunrun). Reaproveita o mapa email->id já existente
 * (buscarIdsResponsaveisRunrun) em vez de duplicar a busca.
 */
function idDoDesignerPorNome(nome) {
  if (!nome) return null;
  var mapa = buscarIdsResponsaveisRunrun(); // email -> id
  var emailAlvo = null;
  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    if (RUNRUN_USUARIOS[email] === nome) emailAlvo = email;
  });
  return emailAlvo ? (mapa[emailAlvo] || null) : null;
}

/**
 * Igual idDoDesignerPorNome, mas vale pra QUALQUER pessoa do Runrun.it —
 * não só os 3 nomes de RUNRUN_USUARIOS. Usada como reserva na criação de
 * tarefa: antes, escolher alguém de fora dessa lista devolvia null e a
 * tarefa nascia sem dono caladinha.
 */
function idDoUsuarioRunrunPorNome(nome) {
  if (!nome) return null;
  var direto = idDoDesignerPorNome(nome);
  if (direto) return direto;

  var usuarios = buscarUsuariosRunrunComCache();
  if (!Array.isArray(usuarios)) return null;
  var alvo = nome.toString().trim().toLowerCase();
  for (var i = 0; i < usuarios.length; i++) {
    var u = usuarios[i];
    if ((u.name || '').toString().trim().toLowerCase() === alvo) return u.id;
  }
  return null;
}

function buscarIdsResponsaveisRunrun() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get('idsResponsaveisRunrun');
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* recalcula abaixo */ }
  }
  var usuarios = buscarUsuariosRunrunComCache();
  var mapa = {};
  if (!Array.isArray(usuarios)) return mapa;
  usuarios.forEach(function (u) {
    if (u.email && RUNRUN_USUARIOS.hasOwnProperty(u.email)) {
      mapa[u.email] = u.id;
    }
  });
  // Só guarda se achou alguém — um mapa vazio grudado por 6h deixaria o
  // quadro em branco pra todo mundo até o cache vencer.
  if (Object.keys(mapa).length) {
    try { cache.put('idsResponsaveisRunrun', JSON.stringify(mapa), CACHE_USUARIOS_SEGUNDOS); } catch (e) { /* segue */ }
  }
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

/**
 * Junta, UMA VEZ SÓ, os dois mapas do painel-designers-beeon que toda
 * tarefa precisa (vínculos de nome de cliente + tempo médio por cliente).
 *
 * Por que isso existe: transformarTarefaParaColmeia era chamada pra cada
 * tarefa e chamava buscarVinculosDoPainel()/buscarTempoMedioDoPainel()
 * lá dentro. Mesmo com o cache de 10 minutos, cada chamada dessas é uma
 * leitura no CacheService (ida à rede interna do Google) + um JSON.parse
 * do mapa inteiro. Com ~100 tarefas davam ~200 leituras repetidas em CADA
 * getTarefasColmeia — que roda a cada 60s pra todo mundo do time. Agora
 * quem processa uma LISTA de tarefas monta esse contexto uma vez e passa
 * adiante; quem processa uma tarefa só continua funcionando sem passar
 * nada (aí ele monta na hora, que é o comportamento antigo).
 */
function contextoDosPaineis() {
  return {
    vinculos: buscarVinculosDoPainel(),
    tempoMedio: buscarTempoMedioDoPainel()
  };
}

function transformarTarefaParaColmeia(t, nomeDesignerFallback, contexto) {
  var mapaVinculos = (contexto && contexto.vinculos) || buscarVinculosDoPainel();
  var mapaTempoMedio = (contexto && contexto.tempoMedio) || buscarTempoMedioDoPainel();
  var nomeEtapa = t.board_stage_name || t.task_state_name || '';
  var chaveColuna = nomeColunaParaChave(nomeEtapa);
  // Resolve o nome do cliente pro nome canônico vinculado no painel (ex:
  // "ALDEN 348 LTDA" no Runrun.it -> "Alden", que é como o coordenador
  // conhece o cliente e como as pastas do Drive estão organizadas).
  var nomeClienteBruto = t.client_name || 'Sem cliente';
  var nomeClienteResolvido = resolverNomeCanonico(nomeClienteBruto, mapaVinculos);
  var tempoMedioMinutos = mapaTempoMedio[normalizarNomeParaComparar(nomeClienteResolvido)] || 0;
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
    // ID de verdade de quem está com a tarefa no Runrun.it. Antes o Colmeia
    // só tinha o NOME, e decidia "essa tarefa é minha?" comparando nomes por
    // "um é começo do outro" — o que acerta "Gio" = "Giovanna", mas "Manu"
    // bateria tanto com "Manuel" quanto com "Manuela". Com o id, essa
    // decisão passa a ser exata (ver ehMinhaTarefa no front-end).
    assigneeId: t.responsible_id || null,
    assigneeAvatarUrl: extrairFotoResponsavel(t),
    estimateMinutes: Math.round((t.current_estimate_seconds || 0) / 60),
    // Meta da barra de progresso do card: tempo médio de criação DESSE
    // cliente, cadastrado manualmente no painel-designers-beeon (não é
    // mais a estimativa do Runrun.it, que é outra coisa).
    tempoMedioMinutos: tempoMedioMinutos,
    workedSeconds: tempoTrabalhadoAoVivo(t),
    isRunning: !!t.is_working_on,
    boardStageId: t.board_stage_id || null,
    // Esse (diferente do boardStageId, que é só leitura) é o campo certo
    // pra ESCREVER quando move uma tarefa de etapa — usado pelo
    // arrastar-e-soltar da página "Runrun completo" (ver
    // moverParaEtapaArbitraria).
    taskStateId: t.task_state_id || null,
    parentTaskId: t.parent_task_id || null,
    runrunStage: nomeEtapa,
    status: chaveColuna,
    isOutraEtapa: chaveColuna === null,
    // Estado real de entregue (is_closed) — sem isso, o botão de reabrir
    // (o ícone de reciclagem) só aparecia pra tarefas entregues NA MESMA
    // sessão, porque o front-end tratava "entregue" como um estado só de
    // memória. Isso quebrava toda vez que a pessoa abria uma tarefa já
    // entregue de antes (ex: pela aba "Runrun completo > Entregues") —
    // o botão de reabrir simplesmente não existia.
    entregue: !!t.is_closed,
    attachmentsCount: t.attachments_count || 0,
    // Não temos um campo de "desde quando é dessa pessoa" de verdade —
    // isso é a melhor aproximação disponível (data da última mudança na
    // tarefa no Runrun.it), usada na Fila de Repasse pra mostrar "há
    // quanto tempo está parada".
    lastActivityAt: t.updated_at || null,
    // Data de criação da tarefa no Runrun.it — usada pra ordenar listas
    // "do mais antigo pro mais novo" (ex: página Runrun completo).
    createdAt: t.created_at || null,
    // Campo "Projeto" do Runrun.it (ex: "APsystems > [MAIO26] INBOUND...")
    // — é ONDE o mês/ano do projeto mora de verdade (não no título da
    // tarefa). Usado pro pill de mês no hub do cliente e pra decidir em
    // que mês criar a pasta automática do card (ver extrairMesAnoDoProjeto
    // em js/config.js e Drive.gs).
    projeto: extrairNomeProjeto(t),
    link: 'https://runrun.it/tasks/' + t.id
  };
}

// Chave do cache onde a busca principal deixa os cards mãe que ela já
// encontrou (e descarta) — pra página "Runrun completo" reaproveitar em
// vez de repaginar TODAS as tarefas abertas do time de novo só pra achar
// eles. Ver buscarExtrasRunrunCompleto.
var CACHE_CARD_MAE_ABERTOS = 'cardMaeAbertos';

/**
 * Varre as tarefas ABERTAS do time uma única vez e devolve as duas
 * categorias separadas: as normais (que vão pro quadro) e os cards mãe
 * (que o quadro nunca mostra). Antes essa varredura acontecia duas vezes
 * — uma aqui, jogando os cards mãe no lixo, e outra em
 * buscarExtrasRunrunCompleto só pra recuperá-los.
 */
function buscarTarefasAbertasSeparadas() {
  var normais = [];
  var cardMae = [];
  var idsPorEmail = buscarIdsResponsaveisRunrun();
  // Monta os mapas do painel UMA vez pra todas as tarefas (ver
  // contextoDosPaineis) em vez de uma vez por tarefa.
  var contexto = contextoDosPaineis();

  // Quem realmente tem id no Runrun.it (quem não tem, fica de fora).
  var designers = [];
  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    if (idsPorEmail[email]) {
      designers.push({ nome: RUNRUN_USUARIOS[email], runrunId: idsPorEmail[email] });
    }
  });
  if (!designers.length) return { normais: [], cardMae: [] };

  function caminhoDaPagina(runrunId, pagina) {
    return '/tasks?responsible_id=' + encodeURIComponent(runrunId) +
      '&is_closed=false&sort=desired_date&sortDir=asc&limit=100&page=' + pagina;
  }

  // EM PARALELO, uma RODADA por página. Antes isso era uma fila indiana:
  // buscava tudo do primeiro designer, esperava terminar, ia pro segundo,
  // esperava, ia pro terceiro — e essa espera é o que fazia o quadro
  // demorar a atualizar. Agora a página 1 dos três sai junto (uma única
  // ida à rede, ver runrunFetchAll), depois a página 2 de quem ainda tem
  // mais, e assim por diante.
  //
  // Como quase sempre cada designer cabe numa página só, na prática isso
  // vira UMA rodada em vez de três idas seguidas.
  var pendentes = designers.slice(); // quem ainda pode ter mais página
  var pagina = 1;
  while (pendentes.length && pagina <= 5) {
    var caminhos = pendentes.map(function (d) { return caminhoDaPagina(d.runrunId, pagina); });
    var lotes = runrunFetchAll(caminhos);

    var aindaPendentes = [];
    for (var i = 0; i < pendentes.length; i++) {
      var lote = lotes[i];
      if (!Array.isArray(lote) || lote.length === 0) continue; // acabou pra esse designer
      var nomeDesigner = pendentes[i].nome;
      lote.forEach(function (t) {
        if (tarefaEhCardMae(t)) cardMae.push(transformarTarefaParaColmeia(t, nomeDesigner, contexto));
        else normais.push(transformarTarefaParaColmeia(t, nomeDesigner, contexto));
      });
      // Página cheia = pode ter mais; página pela metade = acabou.
      if (lote.length >= 100) aindaPendentes.push(pendentes[i]);
    }
    pendentes = aindaPendentes;
    pagina++;
  }

  // Deixa os cards mãe prontos pra página "Runrun completo" pegar sem
  // repetir a varredura. TTL de 120s porque o quadro atualiza a cada 60s,
  // então esse cache fica praticamente sempre quente.
  try {
    CacheService.getScriptCache().put(CACHE_CARD_MAE_ABERTOS, JSON.stringify(cardMae), 120);
  } catch (e) { /* cache cheio/indisponível — a página busca do jeito antigo */ }

  return { normais: normais, cardMae: cardMae };
}

function buscarTarefasRunrun() {
  return buscarTarefasAbertasSeparadas().normais;
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
  var entregues = [];
  var idsPorEmail = buscarIdsResponsaveisRunrun();
  var corte = Date.now() - JANELA_ENTREGUES_RUNRUN_COMPLETO_MS;
  var contexto = contextoDosPaineis();

  // Card mãe: a busca principal do quadro (buscarTarefasAbertasSeparadas)
  // já os encontrou e deixou prontos no cache — não repagina TODAS as
  // tarefas abertas do time de novo só por causa deles. Só cai na
  // varredura própria se o cache estiver vazio (ex: primeira chamada do
  // dia, antes de qualquer atualização do quadro).
  var cardMae = null;
  try {
    var cacheadoCardMae = CacheService.getScriptCache().get(CACHE_CARD_MAE_ABERTOS);
    if (cacheadoCardMae) cardMae = JSON.parse(cacheadoCardMae);
  } catch (e) { cardMae = null; }
  if (!cardMae) cardMae = buscarTarefasAbertasSeparadas().cardMae;

  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    var nomeDesigner = RUNRUN_USUARIOS[email];
    var runrunId = idsPorEmail[email];
    if (!runrunId) return;

    // Entregues: tarefas fechadas, mais recentes primeiro, parando assim
    // que sair da janela de 15 dias.
    var pagina = 1;
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
        entregues.push(transformarTarefaParaColmeia(t, nomeDesigner, contexto));
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

/**
 * ATENÇÃO: é a chamada mais pesada do backend — varre TODAS as tarefas do
 * time, abertas E fechadas (até 10 páginas de 100 por designer). Por isso
 * o resultado fica 10 minutos em cache (mesmo padrão de
 * buscarVinculosDoPainel/buscarTempoMedioDoPainel): é um número de
 * acompanhamento mensal, não muda de minuto em minuto, e antes disso ela
 * rodava inteira a cada vez que alguém abria o Colmeia.
 */
var CACHE_PROGRESSO_CLIENTES = 'progressoMensalClientes';

function buscarProgressoMensalClientes() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(CACHE_PROGRESSO_CLIENTES);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* recalcula abaixo */ }
  }

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

  var resultado = { ok: true, progresso: Object.keys(progresso).map(function (k) { return progresso[k]; }) };
  try { cache.put(CACHE_PROGRESSO_CLIENTES, JSON.stringify(resultado), 600); } catch (e) { /* cache indisponível, segue sem ele */ }
  return resultado;
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
    var bytes = blob.getBytes();
    // Apps Script tem um limite de tamanho pra resposta do Web App (~50MB)
    // e base64 aumenta o tamanho em ~33% — sem essa checagem, um anexo
    // grande (ex: vídeo) não dava erro claro nenhum, só a mensagem
    // genérica de "não consegui baixar", sem dar pra saber o motivo real.
    var LIMITE_BYTES = 25 * 1024 * 1024;
    if (bytes.length > LIMITE_BYTES) {
      return { ok: false, arquivoGrande: true, error: 'Esse arquivo tem ' + Math.round(bytes.length / 1024 / 1024) + ' MB, grande demais pra baixar por aqui. Abre direto no Runrun.it.' };
    }
    return {
      ok: true,
      base64: Utilities.base64Encode(bytes),
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

/**
 * TUDO que o pop-up de uma tarefa precisa, numa única resposta.
 *
 * Antes, abrir um card disparava de 8 a 12 pedidos separados ao Apps
 * Script (comentários, descrição, sequência, anexos, cronômetro, "é card
 * mãe?", pasta do Drive, briefing...). Cada pedido desses tem um custo fixo
 * alto de partida — é por isso que o card aparecia em pedaços. Aqui é UM
 * pedido, e as buscas no Runrun.it acontecem em paralelo lá dentro
 * (runrunFetchAll), em duas rodadas: a segunda depende do que a primeira
 * descobre (o id da sequência de responsáveis).
 *
 * Os anexos saem DE GRAÇA: no Runrun.it eles vivem dentro dos comentários,
 * que já estamos buscando — então não custa nenhuma chamada a mais.
 *
 * O briefing por IA e o card mãe continuam à parte de propósito: o briefing
 * porque pode demorar (é a IA) e não deve segurar o resto do card; o card
 * mãe porque já é um pré-carregamento em segundo plano que não bloqueia
 * nada.
 */
function abrirTarefaParaColmeia(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  // Rodada 1: a tarefa, os comentários e a descrição — nada aqui depende
  // de nada, então vão todos juntos.
  var r1 = runrunFetchAll([
    '/tasks/' + taskId,
    '/tasks/' + taskId + '/comments',
    '/tasks/' + taskId + '/description'
  ]);
  var tarefaCrua = r1[0];
  var comentariosCrus = r1[1];
  var descricaoCrua = r1[2];

  if (!tarefaCrua || tarefaCrua.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };
  }

  // Rodada 2: a sequência de responsáveis, que só dá pra pedir depois de
  // saber o workflow_id (que veio na tarefa acima).
  var sequencia = [];
  if (tarefaCrua.workflow_id) {
    var elementos = runrunFetch('/workflows/' + tarefaCrua.workflow_id + '/workflow_elements');
    if (Array.isArray(elementos)) {
      sequencia = elementos
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
    }
  }

  // Comentários e anexos, os dois vindos da MESMA resposta.
  var comentarios = [];
  var anexos = [];
  if (Array.isArray(comentariosCrus)) {
    comentarios = comentariosCrus
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

    comentariosCrus.forEach(function (c) {
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
  }

  var descricao = '';
  if (typeof descricaoCrua === 'string') {
    descricao = descricaoCrua;
  } else if (descricaoCrua && typeof descricaoCrua === 'object' && !descricaoCrua.erroFetch) {
    descricao = descricaoCrua.description || descricaoCrua.text || descricaoCrua.html || descricaoCrua.content || '';
  }

  // Leitura na planilha (instantânea, não toca no Drive): a pasta do card,
  // que antes era mais um pedido separado do navegador.
  var pastaUrl = null;
  try {
    var salvo = buscarPastaSalvaDoCard(taskId);
    if (salvo.ok) pastaUrl = salvo.url || null;
  } catch (e) { /* segue sem a pasta — o botão volta a checar sozinho */ }

  return {
    ok: true,
    tarefa: transformarTarefaParaColmeia(tarefaCrua),
    temSubtarefas: !!(tarefaCrua.subtask_ids && tarefaCrua.subtask_ids.length),
    comentarios: comentarios,
    anexos: anexos,
    descricao: descricao,
    sequencia: sequencia,
    workflowId: tarefaCrua.workflow_id || null,
    pastaUrl: pastaUrl
  };
}

function buscarTarefaCompleta(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var t = runrunFetch('/tasks/' + taskId);
  if (!t || t.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };
  }
  // Devolve junto se a tarefa tem subtarefas (ou seja, se ela é um card
  // mãe). Assim o front-end descobre isso NA MESMA chamada que já usa pra
  // pegar o tempo trabalhado — antes ele fazia duas chamadas seguidas que
  // liam a MESMA tarefa no Runrun.it (uma pro cronômetro, outra só pra
  // perguntar "isso é card mãe?"). A lista de subtarefas em si continua
  // vindo à parte (buscarSubtarefasDoCardMae), porque ela custa uma
  // leitura por subtarefa e só vale a pena quando realmente é card mãe.
  return {
    ok: true,
    tarefa: transformarTarefaParaColmeia(t),
    temSubtarefas: !!(t.subtask_ids && t.subtask_ids.length)
  };
}

function montarResumoSubtarefas(idsSubtarefas) {
  return (idsSubtarefas || []).map(function (id) {
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

  return {
    ok: true,
    temPai: true,
    cardMae: transformarTarefaParaColmeia(cardMaeRaw),
    subtarefas: montarResumoSubtarefas(cardMaeRaw.subtask_ids)
  };
}

// Usada quando um card que JÁ é o card mãe aparece direto pro designer
// (ex: numa etapa normal como "Revisão", sem passar pela etapa "Card
// mãe"). Diferente de buscarCardMae (que parte de uma SUBtarefa pra
// achar o pai), essa parte direto do próprio id da tarefa e só devolve
// alguma coisa se ela realmente tiver subtarefas (subtask_ids).
function buscarSubtarefasDoCardMae(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var t = runrunFetch('/tasks/' + taskId);
  if (!t || t.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };
  }
  var idsSubtarefas = t.subtask_ids || [];
  if (!idsSubtarefas.length) {
    return { ok: true, ehCardMae: false };
  }

  return {
    ok: true,
    ehCardMae: true,
    subtarefas: montarResumoSubtarefas(idsSubtarefas)
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

function listarTodosUsuariosRunrun() {
  // Mesma lista cacheada usada pela varredura do quadro (ver
  // buscarUsuariosRunrunComCache) — antes essa ação buscava tudo de novo,
  // e ela é chamada toda vez que alguém abre "Ver regra" ou troca o
  // responsável de uma tarefa.
  var usuarios = buscarUsuariosRunrunComCache();
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
