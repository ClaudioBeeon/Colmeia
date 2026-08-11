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

/**
 * Acha o token de API certo pra usar numa chamada de ESCRITA no
 * Runrun.it, a partir do NOME de quem está fazendo aquilo no Colmeia
 * (vem em `body.autor`, injetado sozinho em toda chamada por
 * chamarBackend, ver js/config.js). Sem isso — ou sem o token dessa
 * pessoa cadastrado ainda em RUNRUN_TOKENS_POR_EMAIL — cai pro token do
 * Cláudio, que é o comportamento de ANTES (funciona, só com a
 * atribuição errada). Leitura nunca precisa disso: dado do Runrun.it é
 * o mesmo pra qualquer token que perguntar.
 */
function tokenRunrunDoAutor(nomeAutor) {
  if (!nomeAutor) return RUNRUN_USER_TOKEN;
  var alvo = normalizarNomeParaComparar(nomeAutor);
  for (var email in RUNRUN_USUARIOS) {
    if (normalizarNomeParaComparar(RUNRUN_USUARIOS[email]) === alvo) {
      return RUNRUN_TOKENS_POR_EMAIL[email] || RUNRUN_USER_TOKEN;
    }
  }
  // O atendimento não tem quadro, então não está em RUNRUN_USUARIOS — mas
  // escreve de verdade no Runrun.it (o comentário do pedido de alteração,
  // a reatribuição do card). Ver RUNRUN_TOKENS_ATENDIMENTO, Código.gs.
  var tokens = tokensDoAtendimento();
  for (var nome in tokens) {
    if (normalizarNomeParaComparar(nome) === alvo && tokens[nome]) {
      return tokens[nome];
    }
  }
  return RUNRUN_USER_TOKEN;
}

// ===== "O Runrun.it está fora do ar?" =====
//
// Eles caem de vez em quando, e quando isso acontece TUDO no Colmeia que
// depende deles falha junto (quadro, play, comentário, aprovação). Sem
// isso, cada tela inventava a sua própria mensagem de erro técnica e
// ninguém entendia que o problema era do outro lado.
//
// O marcador vive no cache (não na planilha): é um estado passageiro, e
// ele expira sozinho — se o Runrun.it voltar e ninguém mais chamar nada,
// o aviso some em 2 minutos em vez de ficar preso pra sempre.
var CACHE_RUNRUN_FORA = 'runrunForaDoAr';
var CACHE_RUNRUN_FORA_SEGUNDOS = 120;

function marcarRunrunForaDoAr(status) {
  try {
    CacheService.getScriptCache().put(
      CACHE_RUNRUN_FORA, String(status || 'sem resposta'), CACHE_RUNRUN_FORA_SEGUNDOS);
  } catch (e) { /* sem cache: o app só não mostra a faixa de aviso */ }
}

function marcarRunrunDeVolta() {
  try { CacheService.getScriptCache().remove(CACHE_RUNRUN_FORA); } catch (e) { /* segue */ }
}

function runrunPareceForaDoAr() {
  try { return !!CacheService.getScriptCache().get(CACHE_RUNRUN_FORA); }
  catch (e) { return false; }
}

/**
 * Só conta como "fora do ar" o que é problema DELES (5xx, 0, 429) ou uma
 * resposta que nem JSON é. 401/403/404 são problema nosso (token errado,
 * id que não existe) e não devem acender o aviso de servidor caído.
 */
function ehQuedaDoRunrun(status) {
  var n = Number(status) || 0;
  return n === 0 || n === 429 || n >= 500;
}

function runrunFetch(caminho, token) {
  var res;
  try {
    res = UrlFetchApp.fetch(RUNRUN_BASE_URL + caminho, {
      method: 'get',
      headers: {
        'App-Key': RUNRUN_APP_KEY,
        'User-Token': token || RUNRUN_USER_TOKEN,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
  } catch (e) {
    // Nem chegou a responder (fora do ar, DNS, timeout da rede).
    marcarRunrunForaDoAr(0);
    return { erroFetch: true, status: 0, corpoBruto: String(e && e.message || e) };
  }
  var codigo = res.getResponseCode();
  var corpo = res.getContentText();
  try {
    var json = JSON.parse(corpo);
    // Respondeu JSON de verdade: está de pé. Limpa qualquer marca antiga
    // pra faixa de aviso sumir sozinha assim que eles voltam.
    if (codigo < 400) marcarRunrunDeVolta();
    return json;
  } catch (e) {
    if (ehQuedaDoRunrun(codigo)) marcarRunrunForaDoAr(codigo);
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

function runrunRequest(caminho, metodo, payload, token) {
  var opcoes = {
    method: metodo,
    headers: {
      'App-Key': RUNRUN_APP_KEY,
      'User-Token': token || RUNRUN_USER_TOKEN,
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

function runrunPost(caminho, payload, token) {
  return runrunRequest(caminho, 'post', payload, token);
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

/**
 * A Data de Publicação da tarefa, em "AAAA-MM-DD", ou null.
 *
 * ⚠️ ISSO ESTAVA QUEBRADO DESDE O COMEÇO (achado em 2026-08-09, quando o
 * calendário da Central insistia em abrir vazio). A versão antiga era:
 *
 *     if (t.custom_fields && t.custom_fields['custom_24']) ...
 *
 * ou seja, tratava `custom_fields` como um OBJETO com chave 'custom_24'.
 * Só que `extrairTipoTarefa`, aqui em cima — que funciona há meses e é
 * quem põe o ícone de tipo em todo card do quadro — trata o MESMO campo
 * como um ARRAY de `{name, value}`. Os dois não podem estar certos, e
 * quem tem prova de funcionamento é o array: o resultado é que a data
 * saía `null` em TODA tarefa, e qualquer tela que dependesse dela
 * (calendário de postagens, coluna Publicação da Fila de repasse)
 * aparecia vazia sem nenhum erro na tela.
 *
 * Agora lê nos três formatos possíveis, sem depender de adivinhar qual a
 * API devolve: array de campos, objeto com chave, e o campo solto na
 * raiz da tarefa. No array, casa tanto pelo ID (`custom_24`) quanto pelo
 * NOME ("Data de Publicação") — se um dia a agência recriar o campo, o id
 * muda mas o nome não.
 */
function extrairDataPublicacaoTarefa(t) {
  if (!t) return null;

  // 1) Array de campos — o formato que extrairTipoTarefa já usa.
  if (Array.isArray(t.custom_fields)) {
    for (var i = 0; i < t.custom_fields.length; i++) {
      var campo = t.custom_fields[i];
      if (!campo) continue;
      var id = String(campo.id || campo.custom_field_id || campo.key || '').toLowerCase();
      var nome = String(campo.name || campo.title || campo.label || '').toLowerCase();
      var ehOId = id === CAMPO_DATA_PUBLICACAO || id === CAMPO_DATA_PUBLICACAO.replace('custom_', '');
      var ehONome = nome.indexOf('publica') !== -1;   // "Data de Publicação", "Publicação"
      if (!ehOId && !ehONome) continue;
      var data = normalizarDataPublicacao(campo.value !== undefined ? campo.value : (campo.option_name || campo.date || campo.text));
      if (data) return data;
    }
  }

  // 2) Objeto com o id como chave (o formato que a escrita usa).
  if (t.custom_fields && !Array.isArray(t.custom_fields)) {
    var direto = normalizarDataPublicacao(t.custom_fields[CAMPO_DATA_PUBLICACAO]);
    if (direto) return direto;
    for (var chave in t.custom_fields) {
      if (String(chave).toLowerCase().indexOf('publica') === -1) continue;
      var achado = normalizarDataPublicacao(t.custom_fields[chave]);
      if (achado) return achado;
    }
  }

  // 3) Campo solto na raiz da tarefa (algumas respostas vêm assim).
  return normalizarDataPublicacao(t[CAMPO_DATA_PUBLICACAO]);
}

/** Aceita ISO, dd/mm/aaaa, {value|date}, Date ou timestamp — devolve "AAAA-MM-DD". */
function normalizarDataPublicacao(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (typeof valor === 'object') {
    if (valor instanceof Date) {
      return Utilities.formatDate(valor, 'America/Sao_Paulo', 'yyyy-MM-dd');
    }
    return normalizarDataPublicacao(valor.value !== undefined ? valor.value : (valor.date || valor.text));
  }

  var texto = String(valor).trim();
  if (!texto) return null;

  // Já vem "AAAA-MM-DD" (com ou sem hora atrás).
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.substring(0, 10);

  // "dd/mm/aaaa" — o formato que o Runrun.it mostra na tela pra quem é do Brasil.
  var br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return br[3] + '-' + br[2] + '-' + br[1];

  // Timestamp em milissegundos.
  if (/^\d{10,}$/.test(texto)) {
    return Utilities.formatDate(new Date(Number(texto)), 'America/Sao_Paulo', 'yyyy-MM-dd');
  }

  // Último recurso: deixa o próprio JS tentar entender (ex: "2026-08-09T12:00:00Z").
  var d = new Date(texto);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd');

  return null;
}

/**
 * SÓ LEITURA — rode pelo editor do Apps Script e mande o log se o
 * calendário ainda aparecer vazio. Mostra, de tarefas de verdade, como o
 * Runrun.it está mandando os campos personalizados: se é array ou objeto,
 * que nomes e ids existem, e o que `extrairDataPublicacaoTarefa` conseguiu
 * tirar de cada uma. É o que responde, sem chute, se a data não está sendo
 * LIDA ou se ela simplesmente não está PREENCHIDA nas tarefas.
 */
function diagnosticoDataPublicacao() {
  var idsPorEmail = buscarIdsResponsaveisRunrun();
  var comData = 0, semData = 0, olhadas = 0;

  Logger.log('=== DIAGNÓSTICO: Data de Publicação (custom_24) ===');
  for (var email in RUNRUN_USUARIOS) {
    var runrunId = idsPorEmail[email];
    if (!runrunId) continue;
    var lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) + '&is_closed=false&limit=20&page=1');
    if (!Array.isArray(lote)) continue;

    Logger.log('--- ' + RUNRUN_USUARIOS[email] + ': ' + lote.length + ' tarefa(s) abertas nesta página');
    for (var i = 0; i < lote.length && i < 5; i++) {
      var t = lote[i];
      olhadas++;
      var lida = extrairDataPublicacaoTarefa(t);
      if (lida) comData++; else semData++;
      Logger.log('  #' + t.id + ' "' + String(t.title).substring(0, 40) + '"');
      Logger.log('     custom_fields é ' + (Array.isArray(t.custom_fields) ? 'ARRAY' : (t.custom_fields ? 'OBJETO' : 'AUSENTE')));
      Logger.log('     bruto: ' + JSON.stringify(t.custom_fields));
      Logger.log('     >>> data lida: ' + (lida || 'NADA'));
    }
  }
  Logger.log('=== RESUMO: ' + olhadas + ' tarefas olhadas | com data: ' + comData + ' | sem data: ' + semData + ' ===');
  return { ok: true, olhadas: olhadas, comData: comData, semData: semData };
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
    // A prioridade DO RUNRUN.IT (diferente da coluna "Prioridades" do
    // quadro do Colmeia, que é outra coisa) — usada pelo KPI "Prioridades"
    // da página Painel de Designers (js/pagina-painel-designers.js), que
    // reproduz o mesmo campo que o painel-designers-beeon já usava.
    isUrgent: !!t.is_urgent,
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

var CACHE_TERMOMETRO_CLIENTES = 'termometroClientes_v1';

/**
 * "Termômetro do cliente" — pedido do Cláudio (2026-08-03): "está mais
 * exigente que o normal esse mês?". Mede isso de forma OBJETIVA, sem IA
 * opinando: a TAXA DE ALTERAÇÃO de cada cliente (quantas tarefas viraram
 * subtarefa "Alteração", ver ehAlteracao abaixo — mesma regra de
 * ehTarefaDeAlteracao, js/detalhe-alteracao.js) nesse mês, comparada com
 * a média dos meses anteriores que a varredura consegue enxergar.
 *
 * Reusa o MESMO jeito de buscar de buscarProgressoMensalClientes, logo
 * acima (todas as tarefas abertas+fechadas dos 3 designers) mas bucketa
 * por MÊS (a partir da tag [MES+ANO] no campo Projeto — ver
 * extrairMesAnoDoProjeto, Drive.gs) em vez de olhar só o mês atual —
 * dado separado, cache próprio (mesmos 10 min).
 *
 * Só roda quando a página que mostra isso é aberta — NUNCA no polling de
 * 60s do quadro (mesmo cuidado de buscarExtrasRunrunCompleto).
 */
function buscarTermometroClientes() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(CACHE_TERMOMETRO_CLIENTES);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* recalcula abaixo */ }
  }

  var idsPorEmail = buscarIdsResponsaveisRunrun();
  var mapaVinculos = buscarVinculosDoPainel();
  var buckets = {}; // "cliente||anoMesIndex" -> { cliente, mesChave, originais, alteracoes }

  function ehAlteracao(t) {
    return !!t.parent_task_id && normalizarNomeParaComparar(t.title || '').indexOf('alteracao') !== -1;
  }
  function garantir(cliente, mesChave) {
    var k = cliente + '||' + mesChave;
    if (!buckets[k]) buckets[k] = { cliente: cliente, mesChave: mesChave, originais: 0, alteracoes: 0 };
    return buckets[k];
  }
  function processar(t) {
    if (tarefaEhCardMae(t)) return;
    var mesInfo = extrairMesAnoDoProjeto(extrairNomeProjeto(t));
    if (!mesInfo) return; // sem tag de mês no projeto — não dá pra bucketar, ignora
    var mesChave = mesInfo.ano + '-' + mesInfo.mesIndex;
    var cliente = resolverNomeCanonico(t.client_name || 'Sem cliente', mapaVinculos);
    var reg = garantir(cliente, mesChave);
    if (ehAlteracao(t)) reg.alteracoes++;
    else reg.originais++;
  }

  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    var runrunId = idsPorEmail[email];
    if (!runrunId) return;
    ['false', 'true'].forEach(function (fechada) {
      var pagina = 1;
      while (pagina <= 5) {
        var lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
          '&is_closed=' + fechada + '&limit=100&page=' + pagina);
        if (!Array.isArray(lote) || lote.length === 0) break;
        lote.forEach(processar);
        if (lote.length < 100) break;
        pagina++;
      }
    });
  });

  var mesAtualInfo = extrairMesAnoDoProjeto(tagDoMesAtual());
  var mesAtualChave = mesAtualInfo ? (mesAtualInfo.ano + '-' + mesAtualInfo.mesIndex) : null;

  var porCliente = {};
  Object.keys(buckets).forEach(function (k) {
    var b = buckets[k];
    if (!porCliente[b.cliente]) porCliente[b.cliente] = { atual: null, anteriores: [] };
    var totalMes = b.originais + b.alteracoes;
    var registro = { taxa: totalMes > 0 ? (b.alteracoes / totalMes) : null, total: totalMes };
    if (b.mesChave === mesAtualChave) porCliente[b.cliente].atual = registro;
    else if (registro.taxa !== null) porCliente[b.cliente].anteriores.push(registro);
  });

  var lista = Object.keys(porCliente)
    .map(function (cliente) {
      var reg = porCliente[cliente];
      var mediaAnterior = reg.anteriores.length
        ? reg.anteriores.reduce(function (s, r) { return s + r.taxa; }, 0) / reg.anteriores.length
        : null;
      return {
        cliente: cliente,
        taxaAtual: reg.atual ? reg.atual.taxa : null,
        totalAtual: reg.atual ? reg.atual.total : 0,
        mediaAnterior: mediaAnterior,
        mesesAnteriores: reg.anteriores.length
      };
    })
    // Só entra quem tem volume mínimo esse mês (senão 1 tarefa virando
    // alteração já dá "100%" e assusta à toa sem significar nada) e
    // histórico suficiente pra ter uma média de verdade pra comparar.
    .filter(function (r) { return r.totalAtual >= 2 && r.taxaAtual !== null && r.mediaAnterior !== null; })
    .map(function (r) {
      r.diferenca = r.taxaAtual - r.mediaAnterior; // positivo = pedindo mais alteração que o normal
      return r;
    })
    .sort(function (a, b) { return b.diferenca - a.diferenca; });

  var resultado = { ok: true, clientes: lista, mesAtual: mesAtualChave };
  try { cache.put(CACHE_TERMOMETRO_CLIENTES, JSON.stringify(resultado), 600); } catch (e) { /* segue sem cache */ }
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

/**
 * Baixa uma IMAGEM COLADA na descrição (ou num comentário) do Runrun.it e
 * devolve ela embutida, pro navegador conseguir mostrar.
 *
 * Por que isso precisa existir: quando alguém cola um print direto no
 * editor do Runrun.it, o que fica salvo na descrição é um <img> apontando
 * pro servidor DELES — e esse endereço só entrega a imagem pra quem manda
 * as chaves de acesso (App-Key/User-Token) no pedido. O navegador do
 * designer não tem essas chaves e nunca vai ter (elas não podem sair
 * daqui de dentro), então ele pedia a imagem, tomava "não autorizado" de
 * volta e desenhava aquele ícone de imagem quebrada.
 *
 * Aqui o Apps Script busca a imagem COM as chaves e devolve os bytes
 * dela junto da resposta — o navegador então mostra a imagem sem precisar
 * pedir nada pro Runrun.it.
 *
 * SEGURANÇA: só aceita endereço do próprio Runrun.it. Sem essa trava,
 * essa ação viraria um "busque qualquer endereço da internet pra mim,
 * autenticado" pra quem descobrisse a URL do backend.
 */
var LIMITE_IMAGEM_DESCRICAO_BYTES = 8 * 1024 * 1024;

function hostDaUrl(url) {
  var m = String(url || '').match(/^https:\/\/([^\/:?#]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function urlEhDoRunrun(url) {
  var host = hostDaUrl(url);
  if (!host) return false;
  // ".runrun.it" tem 10 caracteres — pegar o tamanho errado aqui faria o
  // backend recusar justamente "secure.runrun.it", que é o endereço que o
  // Runrun.it usa de verdade.
  return host === 'runrun.it' || host.slice(-10) === '.runrun.it';
}

/**
 * Endereço que NÃO pode ser buscado de jeito nenhum: coisas de rede
 * interna. Buscar imagem em servidor de fora é o normal aqui (o print
 * colado fica no armazenamento do Runrun.it, que é outro domínio) — o
 * que não pode é usar essa ação pra espiar endereço interno.
 */
function urlEhEnderecoInterno(url) {
  var host = hostDaUrl(url);
  if (!host) return true;
  if (host === 'localhost' || host.slice(-6) === '.local') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true;
  if (host.indexOf('metadata') === 0 || host === '169.254.169.254') return true;
  return false;
}

function baixarImagemDaDescricao(url) {
  if (!url) return { ok: false, error: 'URL não informada.' };
  if (!hostDaUrl(url)) return { ok: false, error: 'Endereço inválido (só https é aceito).' };
  if (urlEhEnderecoInterno(url)) return { ok: false, error: 'Endereço não permitido.' };

  try {
    // As CHAVES da conta só vão pro próprio Runrun.it. Pra qualquer outro
    // servidor a busca é anônima, igual à que o navegador faria — assim
    // essa ação nunca vira um jeito de usar as chaves da Beeon em
    // endereço de terceiro.
    var opcoes = {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true
    };
    if (urlEhDoRunrun(url)) {
      opcoes.headers = {
        'App-Key': RUNRUN_APP_KEY,
        'User-Token': RUNRUN_USER_TOKEN
      };
    }
    var res = UrlFetchApp.fetch(url, opcoes);
    var codigo = res.getResponseCode();
    if (codigo < 200 || codigo >= 300) {
      return { ok: false, error: 'Runrun.it recusou entregar a imagem (status ' + codigo + ').' };
    }
    var blob = res.getBlob();
    var tipo = blob.getContentType() || '';
    // Se não voltou uma imagem, não adianta embutir — normalmente é uma
    // página de login em HTML, sinal de que as chaves não serviram.
    if (tipo.indexOf('image/') !== 0) {
      return { ok: false, error: 'O endereço não devolveu uma imagem (veio "' + tipo + '").' };
    }
    var bytes = blob.getBytes();
    if (bytes.length > LIMITE_IMAGEM_DESCRICAO_BYTES) {
      return { ok: false, error: 'Imagem grande demais pra mostrar embutida (' + Math.round(bytes.length / 1024 / 1024) + ' MB).' };
    }
    return { ok: true, base64: Utilities.base64Encode(bytes), mimeType: tipo };
  } catch (err) {
    return { ok: false, error: 'Erro ao buscar a imagem: ' + err.message };
  }
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

/**
 * Histórico de tarefas entregues de UM designer — usado pelo card escuro
 * da página "Minhas horas".
 *
 * Não reaproveita buscarExtrasRunrunCompleto de propósito: aquela varre as
 * entregues do TIME INTEIRO e é a chamada mais pesada do backend. Aqui é
 * uma página só, de uma pessoa só, ordenada da mais recente pra mais
 * antiga — o suficiente pra encher a lista da tela.
 */
function buscarEntreguesDoDesigner(designer, limite) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var quantos = Math.min(Number(limite) || 12, 50);

  var runrunId = idDoUsuarioRunrunPorNome(designer);
  if (!runrunId) return { ok: false, error: 'Não achei o id de ' + designer + ' no Runrun.it.' };

  var lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
    '&is_closed=true&sort=close_date&sortDir=desc&limit=' + quantos);

  // Se o Runrun.it não aceitar ordenar por close_date, tenta o campo que
  // a varredura do quadro já usa e que sabemos que funciona.
  if (!Array.isArray(lote)) {
    lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
      '&is_closed=true&sort=updated_at&sortDir=desc&limit=' + quantos);
  }
  if (!Array.isArray(lote)) {
    return { ok: false, error: 'Resposta inesperada do Runrun.it ao buscar entregues.' };
  }

  var entregues = lote
    .filter(function (t) { return !tarefaEhCardMae(t); })
    .map(function (t) {
      var quando = t.close_date || t.updated_at || null;
      return {
        id: t.id,
        titulo: t.title || '',
        cliente: (t.client_name || (t.client && t.client.name) || '').toString(),
        projeto: extrairNomeProjeto(t),
        tipo: extrairTipoTarefa(t),
        quando: quando ? new Date(quando).getTime() : null
      };
    });

  return { ok: true, entregues: entregues };
}
