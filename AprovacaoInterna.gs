/**
 * APROVAÇÃO INTERNA DO ATENDIMENTO (2026-08-04)
 * =============================================
 *
 * O portão que faltava. Até aqui, qualquer pessoa gerava o link do cliente
 * direto da pasta do card, sem ninguém conferir. Agora:
 *
 *   Designer termina a peça
 *        ↓  pede conferência (fala da Bee ou botão no card)
 *   ATENDIMENTO confere              ← a fila deste arquivo
 *        ↓  aprovar = o mesmo clique prepara o link
 *   Cliente aprova ou pede ajuste    ← Aprovacao.gs, já existia
 *
 * CUIDADO COM O NOME PARECIDO: `listarAprovacoesPendentes` (Aprovacao.gs)
 * é de OUTRA etapa — lista o que já foi mandado pro cliente e ainda não
 * voltou. Aqui é o passo ANTERIOR: o que o designer terminou e o
 * atendimento ainda não conferiu. As duas olham lados opostos do mesmo
 * fluxo e não devem ser ligadas uma na outra.
 *
 * ---------------------------------------------------------------------
 * O QUE FICA GUARDADO, E O QUE É LIDO AO VIVO
 * ---------------------------------------------------------------------
 * A planilha guarda só a DECISÃO (pediu conferência / aprovou / devolveu)
 * e qual versão estava valendo na hora do pedido. Os arquivos em si são
 * lidos do Drive toda vez — é isso que faz a tela perceber sozinha quando
 * o designer sobe uma versão nova depois de já ter pedido a conferência,
 * sem precisar de nenhum aviso extra.
 *
 * Critério do CLAUDE.md: preferência de exibição → localStorage; decisão
 * que doeria perder → planilha. "Esta peça está esperando conferência" é
 * decisão de trabalho, então mora na planilha.
 *
 * ---------------------------------------------------------------------
 * Faz parte do backend do Colmeia. TODOS os arquivos .gs do projeto do
 * Apps Script compartilham o mesmo espaço de nomes — qualquer função aqui
 * pode ser chamada de qualquer outro arquivo, sem "importar" nada. As
 * rotas continuam todas no Código.gs.
 * ---------------------------------------------------------------------
 */

// Uma peça devolvida ou aprovada some da fila, mas a linha fica na
// planilha pra virar histórico. Depois disso, é podada junto do backup
// diário — mesma ideia do FeedEventos.
var CONFERENCIA_RETENCAO_DIAS = 30;

function getConferenciasSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('ConferenciaInterna');
  if (!sheet) {
    sheet = ss.insertSheet('ConferenciaInterna');
    sheet.getRange('A1:P1').setValues([[
      'task_id', 'cliente', 'titulo_tarefa', 'nome_peca', 'designer', 'designer_id',
      'file_id', 'nome_arquivo', 'mime_type', 'versao_pedida',
      'pedido_em', 'status', 'decidido_por', 'decidido_em', 'motivo', 'lote_id'
    ]]);
  }
  return sheet;
}

/**
 * A identidade do LOTE de uma linha — o que agrupa várias peças mandadas
 * juntas numa conferência só (pedido do Cláudio, 2026-08-05: "13 posts
 * diferentes mandados de uma vez viram UM item na fila, com decisão única").
 *
 * Linha de ANTES dessa funcionalidade não tem a coluna `lote_id`
 * preenchida — nesse caso o lote dela é ela mesma (taskId+nomePeca), o
 * comportamento de sempre. Sem esse fallback, toda conferência pendente
 * na planilha no dia do deploy virava "sem lote" e sumia da fila.
 */
function loteIdDaLinha(l) {
  return String(l[15] || '') || (String(l[0]) + '::' + String(l[3]));
}

/** Todas as linhas (número 1-based da planilha) de um mesmo lote. */
function linhasDoLote(linhas, taskId, loteId) {
  var out = [];
  if (!loteId) return out;
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) !== String(taskId)) continue;
    if (loteIdDaLinha(linhas[i]) === loteId) out.push(i + 1);
  }
  return out;
}

// ---------------------------------------------------------------------
// Versões: ler a pasta do Drive e agrupar por peça
// ---------------------------------------------------------------------

/**
 * O nome que define a PEÇA, sem o "- vN" e sem a extensão.
 *
 * "Feed - v1.png" e "Feed - v2.png" são a mesma peça em duas versões;
 * "Stories - v1.mp4" é outra peça. Arquivo fora desse padrão vira peça
 * própria, com o nome inteiro. É a mesma regra que
 * `listarPecasDaPastaDoCard` (Aprovacao.gs) já usava — aqui ela virou
 * função com nome pra poder ser usada dos dois lados sem copiar.
 */
function nomeBaseDaPeca(nomeArquivo) {
  var m = String(nomeArquivo || '').match(/ - v(\d+)\.[^.]+$/i);
  return m ? nomeArquivo.slice(0, m.index) : nomeArquivo;
}

/** O número da versão pelo nome do arquivo, ou null se não segue o padrão. */
function versaoDoArquivo(nomeArquivo) {
  var m = String(nomeArquivo || '').match(/ - v(\d+)\.[^.]+$/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Todas as peças da pasta do card, cada uma com TODAS as suas versões.
 *
 * Diferente de `listarPecasDaPastaDoCard` (Aprovacao.gs), que devolve só
 * a versão mais recente de cada peça: aqui a tela de conferência precisa
 * da lista inteira, porque o seletor ‹ v1 v2 ●v3 › tem que existir e
 * porque dá pra conferir (e às vezes aprovar) uma versão anterior.
 */
function listarVersoesDasPecas(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  // ⚠️ ESTA É A FUNÇÃO MAIS CARA DA CENTRAL (2026-08-09). Varrer a pasta
  // do card no Drive não é uma chamada só: cada arquivo custa um pedido
  // por propriedade lida (nome, tipo, data), e `listarConferenciasPendentes`
  // chama isto UMA VEZ POR TAREFA da fila. Com uma fila de 15 tarefas de
  // 20 arquivos, é mais de mil idas ao Drive — era o grosso da demora pra
  // abrir a Central.
  //
  // O cache de 90s resolve porque a fila é aberta várias vezes seguidas
  // (e por várias pessoas do atendimento, que compartilham o mesmo cache
  // do script). Arquivo que sobe PELO Colmeia limpa o cache na hora
  // (`invalidarCacheDeVersoesDasPecas`, chamado por subirArquivoNoCard),
  // então o único atraso possível é o de quem sobe direto pelo Drive — e
  // aí são 90s, não a eternidade.
  var chaveCache = chaveDoCacheDeVersoes(taskId);
  var cache = CacheService.getScriptCache();
  try {
    var guardado = cache.get(chaveCache);
    if (guardado) return JSON.parse(guardado);
  } catch (e) { /* cache indisponível: varre na mão */ }

  var resultado = listarVersoesDasPecasSemCache(taskId);
  // Só guarda o que deu certo: erro em cache é erro repetido por 90s.
  if (resultado && resultado.ok) {
    try {
      cache.put(chaveCache, JSON.stringify(resultado), VERSOES_CACHE_SEGUNDOS);
    } catch (e) { /* passou do tamanho do cache: só não guarda */ }
  }
  return resultado;
}

var VERSOES_CACHE_SEGUNDOS = 90;

function chaveDoCacheDeVersoes(taskId) {
  return 'versoesPecas_' + taskId;
}

/** Limpa o cache da varredura de pasta de um card (ver listarVersoesDasPecas). */
function invalidarCacheDeVersoesDasPecas(taskId) {
  if (!taskId) return;
  try {
    CacheService.getScriptCache().remove(chaveDoCacheDeVersoes(taskId));
  } catch (e) { /* sem cache pra limpar */ }
}

function listarVersoesDasPecasSemCache(taskId) {
  var pastaInfo = buscarPastaSalvaDoCard(taskId);
  if (!pastaInfo.ok || !pastaInfo.url) {
    return { ok: false, error: 'Essa tarefa ainda não tem uma pasta do card vinculada no Drive. Crie a pasta do card primeiro.' };
  }

  var pasta;
  try {
    pasta = DriveApp.getFolderById(extrairIdDeUrlDrive(pastaInfo.url));
  } catch (e) {
    return { ok: false, error: 'Não consegui acessar a pasta do card no Drive.' };
  }

  var grupos = {};
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var arq = arquivos.next();
    var tipo = arq.getMimeType();
    if (!ehTipoDePecaAceito(tipo)) continue;
    var nome = arq.getName();
    var base = nomeBaseDaPeca(nome);
    if (!grupos[base]) grupos[base] = [];
    grupos[base].push({
      fileId: arq.getId(),
      nome: nome,
      mimeType: tipo,
      versao: versaoDoArquivo(nome),
      atualizadoEm: arq.getLastUpdated().getTime()
    });
  }

  var pecas = Object.keys(grupos).map(function (base) {
    var versoes = grupos[base];
    // Sem "- vN" no nome, a ordem de subida é a única noção de versão que
    // existe — por isso o desempate é pela data do arquivo.
    versoes.sort(function (a, b) {
      if (a.versao !== null && b.versao !== null) return a.versao - b.versao;
      return a.atualizadoEm - b.atualizadoEm;
    });
    // Numera de 1 a N pra tela, mesmo quando o nome do arquivo não traz
    // versão nenhuma: o seletor precisa de algo pra mostrar de qualquer
    // jeito, e "v1/v2" pela ordem de subida é honesto.
    versoes.forEach(function (v, i) { v.ordem = i + 1; });
    return {
      nomePeca: base,
      versoes: versoes,
      ultima: versoes[versoes.length - 1]
    };
  });

  pecas.sort(function (a, b) { return b.ultima.atualizadoEm - a.ultima.atualizadoEm; });
  return { ok: true, pecas: pecas, pastaUrl: pastaInfo.url };
}

// ---------------------------------------------------------------------
// A fila
// ---------------------------------------------------------------------

/**
 * O designer manda uma peça pra conferência do atendimento.
 *
 * Chamado dos DOIS pontos de entrada do front-end (a fala da Bee de
 * "arquivo novo" e o botão "Pedir aprovação do atendimento" no card) —
 * os dois caem aqui, então a regra de o que entra na fila mora num lugar
 * só.
 *
 * Pedir de novo a MESMA peça não cria linha nova: reaproveita a que já
 * existe. É o que faz clicar duas vezes sem querer não virar duas
 * entradas iguais na fila de quem confere.
 */
function pedirConferenciaInterna(dados) {
  dados = dados || {};
  if (!dados.taskId) return { ok: false, error: 'taskId não informado.' };

  // ⚠️ SEM CACHE de propósito, diferente de todo o resto: é AQUI que fica
  // gravado qual versão estava valendo no pedido, e é desse número que
  // sai o aviso de "tem versão nova" lá na conferência. Ler um retrato de
  // 90s atrás faria o designer subir a v2, mandar pra revisão na hora e o
  // sistema anotar v1 — o erro exato que esse campo existe pra pegar.
  var lista = listarVersoesDasPecasSemCache(dados.taskId);
  if (!lista.ok) return lista;
  if (!lista.pecas.length) {
    return { ok: false, error: 'Não encontrei nenhuma imagem ou vídeo na pasta do card pra mandar pra conferência.' };
  }
  // A pasta acabou de ser lida de verdade: joga fora o retrato velho pra
  // a fila de conferência já abrir com esta versão.
  invalidarCacheDeVersoesDasPecas(dados.taskId);

  // A interface pode mandar VÁRIAS peças (o card tem Feed e Stories, e as
  // duas ficaram prontas juntas) ou uma só. Sem nenhuma, vai a que foi
  // mexida por último — o caso da pasta com uma peça só, em que não há o
  // que escolher e perguntar seria atrito à toa.
  var pedidas = [];
  if (Array.isArray(dados.nomesPecas)) pedidas = dados.nomesPecas.filter(function (n) { return !!n; });
  else if (dados.nomePeca) pedidas = [dados.nomePeca];

  var alvos = pedidas.length
    ? lista.pecas.filter(function (p) { return pedidas.indexOf(p.nomePeca) !== -1; })
    : [lista.pecas[0]];
  if (!alvos.length) return { ok: false, error: 'Não achei essa peça na pasta do card. Ela pode ter sido movida ou renomeada.' };

  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linhas = sheet.getDataRange().getValues();
    var agora = new Date().toISOString();
    // Um id novo por ENVIO, não por peça: é o que agrupa tudo que foi
    // mandado junto numa fila (e numa conferência) só. Reenviar reatribui
    // a peça pro lote de agora — o que está sendo pedido junto AGORA é o
    // lote que interessa, mesmo que ela já pertencesse a outro antes.
    //
    // CURTO (6 caracteres), não um UUID de 32: este id vai inteiro dentro
    // do link que o designer cola no comentário da tarefa, e era ele que
    // fazia o comentário no Runrun.it ficar com um endereço de três linhas
    // (reclamação do time, 2026-08-08). Curto é seguro aqui porque
    // `linhasDoLote` filtra por taskId ANTES de comparar o lote — ou seja,
    // só precisa ser único DENTRO de uma tarefa, e são 1 bilhão de
    // combinações. Lotes antigos, de 32 caracteres, continuam batendo
    // normalmente: a comparação sempre foi por igualdade exata.
    var loteId = '';
    for (var iLote = 0; iLote < 6; iLote++) {
      loteId += ALFABETO_CODIGO_APROVACAO.charAt(Math.floor(Math.random() * ALFABETO_CODIGO_APROVACAO.length));
    }
    var criadas = [];

    alvos.forEach(function (peca) {
      var ultima = peca.ultima;
      var valores = [
        String(dados.taskId), dados.cliente || '', dados.tituloTarefa || '', peca.nomePeca,
        dados.designer || '', dados.designerId || '',
        ultima.fileId, ultima.nome, ultima.mimeType, ultima.versao === null ? ultima.ordem : ultima.versao,
        agora, 'pendente', '', '', '', loteId
      ];
      var existente = acharLinhaDaConferencia(linhas, dados.taskId, peca.nomePeca);
      if (existente) sheet.getRange(existente, 1, 1, valores.length).setValues([valores]);
      else sheet.appendRow(valores);
      criadas.push(peca.nomePeca);
    });

    return { ok: true, pecas: criadas, loteId: loteId };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Acha a linha de uma peça na planilha (1-based, como o Sheets conta), ou
 * 0 se não existe. Uma peça é identificada por tarefa + nome da peça:
 * um card com Feed e Stories tem duas linhas independentes.
 */
function acharLinhaDaConferencia(linhas, taskId, nomePeca) {
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(taskId) && String(linhas[i][3]) === String(nomePeca)) return i + 1;
  }
  return 0;
}

/**
 * A fila do atendimento: o que está esperando ALGUMA ação de quem confere —
 * ou ainda não olhou ('pendente'), ou já aprovou mas ainda não mandou pro
 * cliente ('aprovada'). As duas continuam na fila de propósito: se só a
 * 'pendente' contasse, dar F5 no meio do envio (depois de aprovar, antes de
 * copiar o link) fazia a peça sumir da lista sem deixar rastro — parecia
 * que a aprovação "não tinha ficado salva", quando na verdade só não tinha
 * mais como voltar pra ela. Só sai da fila de vez quando o link é copiado
 * de fato (ver marcarConferenciaEnviada, chamada por apvCopiarLinkCliente).
 *
 * Lê o Drive de cada peça pra saber se chegou versão nova DEPOIS do
 * pedido — é o `temVersaoNova` que acende o aviso no card da fila e, mais
 * pra frente, dispara a única interrupção do fluxo (ver apvAprovar no
 * front-end). Isso custa uma leitura de pasta por peça, o que é aceitável
 * numa fila de 10 a 20 itens e NÃO está no caminho da varredura do quadro.
 */
function listarConferenciasPendentes() {
  var sheet = getConferenciasSheet();
  var cachePastas = {};
  var cacheTarefas = {};

  // O ciclo se fecha sozinho (2026-08-06): peça devolvida ao designer que
  // ganhou versão nova volta pra fila. Antes ele consertava e tinha que
  // LEMBRAR de mandar pra revisão do zero — o pedido de alteração saía
  // daqui e nunca mais voltava por conta própria, então "conferir se o
  // ajuste ficou bom" dependia de alguém não esquecer.
  reabrirDevolvidasComVersaoNova(sheet, cachePastas);

  var linhas = sheet.getDataRange().getValues();

  // Agrupa por LOTE: cada linha é uma peça, mas o item da fila é o lote
  // inteiro — é o que faz 13 peças mandadas juntas aparecerem como UMA
  // coisa esperando decisão, não treze.
  var grupos = {};
  var ordem = [];

  for (var i = 1; i < linhas.length; i++) {
    var l = linhas[i];
    var status = String(l[11]);
    if (status !== 'pendente' && status !== 'aprovada') continue;

    var taskId = String(l[0]);
    var nomePeca = String(l[3]);
    var loteId = loteIdDaLinha(l);
    var versaoPedida = Number(l[9]) || 0;

    if (!cachePastas[taskId]) cachePastas[taskId] = listarVersoesDasPecas(taskId);
    var lista = cachePastas[taskId];

    var atual = null;
    if (lista.ok) {
      for (var p = 0; p < lista.pecas.length; p++) {
        if (lista.pecas[p].nomePeca === nomePeca) { atual = lista.pecas[p]; break; }
      }
    }
    var ultima = atual ? atual.ultima : null;
    var versaoAtual = ultima ? (ultima.versao === null ? ultima.ordem : ultima.versao) : versaoPedida;

    var peca = {
      nomePeca: nomePeca,
      fileId: ultima ? ultima.fileId : l[6],
      nomeArquivo: ultima ? ultima.nome : l[7],
      mimeType: ultima ? ultima.mimeType : l[8],
      versaoPedida: versaoPedida,
      versaoAtual: versaoAtual,
      totalVersoes: atual ? atual.versoes.length : 1,
      // `versaoPedida` 0 significa "não sei" (linha antiga, célula vazia),
      // não "versão zero" — e nesse caso QUALQUER arquivo na pasta parecia
      // versão nova, acendendo o aviso pra sempre numa peça em que ninguém
      // tinha subido nada. Sem saber, não avisa.
      temVersaoNova: versaoPedida > 0 && versaoAtual > versaoPedida,
      // A peça sumiu da pasta depois do pedido (renomeada, movida,
      // apagada). Some da fila silenciosamente seria pior: quem pediu a
      // conferência acha que ela está na fila, e não está mais.
      arquivoSumiu: !ultima
    };

    var chave = taskId + '::' + loteId;
    if (!grupos[chave]) {
      grupos[chave] = {
        taskId: taskId,
        loteId: loteId,
        cliente: l[1],
        tituloTarefa: l[2],
        designer: l[4],
        designerId: l[5],
        pedidoEm: l[10],
        // 'pendente' = ainda não conferida; 'aprovada' = já aprovada
        // internamente, falta só mandar pro cliente (ver o comentário da
        // função). O card da fila usa isso pra badge diferente e pra pular
        // direto pro painel de envio ao reabrir.
        status: status,
        aprovadoPor: status === 'aprovada' ? l[12] : '',
        pecas: []
      };
      ordem.push(chave);
    }
    var g = grupos[chave];
    if (String(l[10]) < String(g.pedidoEm)) g.pedidoEm = l[10];
    g.pecas.push(peca);
  }

  var itens = ordem.map(function (chave) { return grupos[chave]; });
  itens.forEach(function (it) {
    it.temVersaoNova = it.pecas.some(function (p) { return p.temVersaoNova; });
    it.arquivoSumiu = it.pecas.every(function (p) { return p.arquivoSumiu; });

    // Entrega desejada da tarefa (mesmo campo que a tela de conferência já
    // mostra, `dadosDaConferencia` -> `tarefa.desired_date`) — pedido do
    // Cláudio (M1, 2026-08-05): a fila ordenava só por quem chegou primeiro,
    // sem olhar o prazo do cliente. Uma leitura por taskId (cacheada aqui
    // dentro), não por lote — várias peças da mesma tarefa não pagam a busca
    // de novo.
    if (!(it.taskId in cacheTarefas)) {
      var t = runrunFetch('/tasks/' + it.taskId);
      cacheTarefas[it.taskId] = (t && !t.erroFetch) ? (t.desired_date || null) : null;
    }
    it.prazo = cacheTarefas[it.taskId];
  });

  // Ordena por URGÊNCIA DE VERDADE: quem tem prazo mais próximo vem
  // primeiro; quem não tem prazo (nunca deveria acontecer, mas por segurança)
  // vai pro fim. Dentro do mesmo prazo (ou mesma ausência dele), desempata
  // por quem está esperando há mais tempo — o critério antigo, que sozinho
  // não bastava (uma peça pedida há 20min com entrega hoje é mais urgente
  // que uma de 3h com entrega semana que vem).
  itens.sort(function (a, b) {
    var pa = a.prazo ? new Date(a.prazo).getTime() : Infinity;
    var pb = b.prazo ? new Date(b.prazo).getTime() : Infinity;
    if (pa !== pb) return pa - pb;
    return String(a.pedidoEm).localeCompare(String(b.pedidoEm));
  });
  return { ok: true, itens: itens };
}

/**
 * Peça devolvida pro designer que já ganhou versão nova volta pra fila,
 * sozinha (2026-08-06).
 *
 * A regra é a mesma que a tela já usa pra acender "versão nova chegou":
 * compara a versão que estava valendo quando a peça foi vista com a que
 * está na pasta agora. Se subiu, o designer entregou o ajuste — e isso é
 * exatamente o que precisa ser conferido de novo.
 *
 * A `versaoPedida` é reescrita junto: sem isso a linha voltaria pra fila
 * já com o aviso amarelo de "versão nova" aceso, apontando pra versão que
 * ela mesma acabou de aceitar.
 *
 * SÓ olha devolvidas dos últimos 30 dias (as mais velhas são podadas de
 * qualquer jeito, ver limparConferenciasAntigas) — cada uma custa uma
 * varredura da pasta do Drive, e isso roda em TODA abertura da fila.
 */
function reabrirDevolvidasComVersaoNova(sheet, cachePastas) {
  var linhas = sheet.getDataRange().getValues();
  var limite = Date.now() - CONFERENCIA_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  var reabrir = [];

  for (var i = 1; i < linhas.length; i++) {
    var l = linhas[i];
    if (String(l[11]) !== 'devolvida') continue;
    var quando = Date.parse(l[13] || l[10]);
    if (!quando || quando < limite) continue;

    var taskId = String(l[0]);
    var nomePeca = String(l[3]);
    var versaoPedida = Number(l[9]) || 0;
    // Sem saber qual versão estava valendo, não dá pra afirmar que subiu
    // outra — mesma cautela do `temVersaoNova` mais abaixo.
    if (!versaoPedida) continue;

    if (!cachePastas[taskId]) cachePastas[taskId] = listarVersoesDasPecas(taskId);
    var lista = cachePastas[taskId];
    if (!lista.ok) continue;

    for (var p = 0; p < lista.pecas.length; p++) {
      if (lista.pecas[p].nomePeca !== nomePeca) continue;
      var ultima = lista.pecas[p].ultima;
      if (!ultima) break;
      var versaoAtual = ultima.versao === null ? ultima.ordem : ultima.versao;
      if (versaoAtual > versaoPedida) reabrir.push({ linha: i + 1, versao: versaoAtual });
      break;
    }
  }

  if (!reabrir.length) return;

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var agora = new Date().toISOString();
    reabrir.forEach(function (r) {
      sheet.getRange(r.linha, 10).setValue(r.versao);        // versão que está valendo agora
      sheet.getRange(r.linha, 11).setValue(agora);           // "pedida" de novo agora
      sheet.getRange(r.linha, 12, 1, 3).setValues([['pendente', '', '']]);
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Essa tarefa já foi mandada pra revisão? Devolve a linha mais recente,
 * qualquer que seja a situação dela.
 *
 * Serve pro botão do card saber em que estado ele está: antes de mandar,
 * ele diz "Enviar para revisão"; depois, vira "Acessar página de
 * aprovação" e leva direto pra peça. Mesmo comportamento que o botão da
 * pasta do card já tinha ("Criar pasta" → "Acessar pasta") — um botão que
 * não muda depois de usado convida a clicar de novo sem querer.
 */
function buscarConferenciaDaTarefa(taskId, idsRelacionados) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  // A conferência é da PEÇA, e a peça mora na pasta do card — que é a
  // MESMA pro card mãe e pras subtarefas dele (ver buscarOuHerdarPastaCard,
  // Drive.gs, que resolve a pasta desse mesmo jeito). Então "essa peça já
  // foi mandada" vale pra família inteira: mandar pela subtarefa e abrir o
  // card mãe tem que mostrar o mesmo estado, senão a pessoa manda de novo
  // achando que não tinha mandado.
  var ids = {};
  ids[String(taskId)] = true;
  if (Array.isArray(idsRelacionados)) {
    idsRelacionados.forEach(function (id) { if (id) ids[String(id)] = true; });
  }

  var linhas = getConferenciasSheet().getDataRange().getValues();
  var achada = null;
  for (var i = 1; i < linhas.length; i++) {
    if (!ids[String(linhas[i][0])]) continue;
    // Descartada não conta como "já mandei pra revisão" — o botão do card
    // tem que voltar a dizer "Enviar para revisão", senão ele apontaria pra
    // uma conferência que não existe mais na fila (ver descartarConferencia).
    if (String(linhas[i][11]) === 'descartada') continue;
    var atual = {
      // O id de quem REALMENTE tem a conferência — é pra ele que o link do
      // botão precisa apontar, não pro card que está aberto agora.
      taskId: String(linhas[i][0]),
      nomePeca: linhas[i][3],
      loteId: loteIdDaLinha(linhas[i]),
      status: linhas[i][11],
      pedidoEm: linhas[i][10]
    };
    if (!achada || String(atual.pedidoEm) > String(achada.pedidoEm)) achada = atual;
  }
  return { ok: true, conferencia: achada };
}

/**
 * Tudo que a tela de conferência precisa, numa chamada só.
 *
 * Junta o que foi PEDIDO (descrição da tarefa, prazo, card mãe) com o que
 * foi FEITO (todas as versões da peça). Numa chamada só de propósito: são
 * quatro idas ao Runrun.it/Drive que, feitas uma de cada vez pelo
 * front-end, deixariam a tela montando aos pedaços na frente de quem
 * abriu — justamente a pessoa que não conhece o app.
 */
function dadosDaConferencia(taskId, loteId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var tarefa = runrunFetch('/tasks/' + taskId);
  if (!tarefa || tarefa.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.', runrunFora: runrunPareceForaDoAr() };
  }

  var lista = listarVersoesDasPecas(taskId);
  if (!lista.ok) return lista;

  var linhasSheet = getConferenciasSheet().getDataRange().getValues();
  // As linhas do lote dizem QUAIS peças foram pedidas juntas (na ordem em
  // que foram pedidas). Sem loteId (link antigo, de antes desta
  // funcionalidade, que mandava o NOME da peça direto) ou lote vazio,
  // `loteId` ainda funciona como nome de peça — é o mesmo caminho que
  // `dadosDaConferencia` sempre teve, só que agora é o caso de exceção.
  var linhasDoGrupo = linhasDoLote(linhasSheet, taskId, loteId);
  var nomesPedidos = linhasDoGrupo.map(function (n) { return String(linhasSheet[n - 1][3]); });

  var pecasEscolhidas;
  if (nomesPedidos.length) {
    pecasEscolhidas = lista.pecas.filter(function (p) { return nomesPedidos.indexOf(p.nomePeca) !== -1; });
    pecasEscolhidas.sort(function (a, b) { return nomesPedidos.indexOf(a.nomePeca) - nomesPedidos.indexOf(b.nomePeca); });
  } else if (loteId) {
    // Compat com link antigo: `loteId` era o nome da peça (nomePeca, o
    // nome "base" sem sufixo de versão). Também aceita o NOME DO ARQUIVO
    // de uma versão específica (ex: "Feed_v2.jpg") — é o que a aba
    // Aprovações guarda (gravarLinhaDeAprovacao salva o arquivo, não a
    // peça "base"), e é assim que a conferência abre a partir de um
    // "voltou com ajuste" do cliente (ver apvAbrirParaAlteracaoDoCliente,
    // js/pagina-aprovacao.js) sem precisar de um lote novo na planilha.
    pecasEscolhidas = lista.pecas.filter(function (p) {
      return p.nomePeca === loteId || p.versoes.some(function (v) { return v.nome === loteId; });
    });
  } else {
    pecasEscolhidas = lista.pecas.length ? [lista.pecas[0]] : [];
  }
  if (!pecasEscolhidas.length) return { ok: false, error: 'Não achei essa peça na pasta do card. Ela pode ter sido movida ou renomeada.' };

  var cardMaeId = tarefa.parent_task_id || null;
  var projetoFechado = projetoDaTarefaEstaFechado(tarefa);

  // Se esse lote já foi aprovado internamente (ou já está pendente há um
  // tempo), a tela precisa saber pra abrir no painel certo — sem isso, dar
  // F5 depois de aprovar (mas antes de mandar pro cliente) jogava a pessoa
  // de volta pro painel "o que foi pedido", como se a aprovação não tivesse
  // acontecido (era exatamente isso, e não outra coisa, que tinha sido
  // salvo — só a TELA que esquecia).
  var statusConferencia = 'pendente';
  var aprovadoPor = '';
  var aprovadoEm = '';
  if (linhasDoGrupo.length) {
    var valoresLinha = getConferenciasSheet().getRange(linhasDoGrupo[0], 1, 1, 16).getValues()[0];
    statusConferencia = String(valoresLinha[11]) || 'pendente';
    aprovadoPor = valoresLinha[12] || '';
    aprovadoEm = valoresLinha[13] || '';
  }

  // A peça já foi mandada pro cliente antes — a tela precisa do código do
  // link pra reconstruir a aba "Aprovação do cliente" ao reabrir (sem
  // isso, dar F5 depois de mandar fazia a tela esquecer e mostrar "ainda
  // não foi enviado", mesmo já tendo sido). Só busca quando faz sentido
  // (status "enviada") — é uma leitura a mais na planilha, sem custo nos
  // outros dois terços dos casos (pendente/aprovada).
  var linkCliente = statusConferencia === 'enviada' ? buscarLinkClienteMaisRecente(taskId) : null;

  var nomesEscolhidos = pecasEscolhidas.map(function (p) { return p.nomePeca; });

  return {
    ok: true,
    taskId: String(taskId),
    // O id do lote de verdade — pode ter vindo como "nome de peça" (link
    // antigo); a partir daqui a tela usa este valor pra aprovar/devolver/
    // marcar como enviado o lote inteiro.
    loteId: linhasDoGrupo.length ? loteIdDaLinha(linhasSheet[linhasDoGrupo[0] - 1]) : (loteId || pecasEscolhidas[0].nomePeca),
    titulo: tarefa.title || '',
    cliente: tarefa.client_name || '',
    descricao: tarefa.description || '',
    prazo: tarefa.desired_date || null,
    designer: tarefa.responsible_name || '',
    designerId: tarefa.user_id || '',
    cardMaeId: cardMaeId,
    cardMaeLink: cardMaeId ? 'https://runrun.it/tasks/' + cardMaeId : '',
    projetoFechado: projetoFechado,
    // A pasta do card no Drive. Quem confere às vezes precisa ver o
    // arquivo de verdade (abrir em tamanho real, olhar as outras peças,
    // conferir o que mais tem lá) — e sem isso a única saída era pedir o
    // link pro designer. `listarVersoesDasPecas` já sabia a pasta; só não
    // estava contando.
    pastaUrl: lista.pastaUrl || '',
    // TODAS as peças deste lote (o carrossel da tela de conferência
    // percorre esta lista — ver apvIrParaPeca, js/pagina-aprovacao.js).
    pecas: pecasEscolhidas,
    // Compat: a primeira peça do lote, pro que ainda lê o campo singular.
    peca: pecasEscolhidas[0],
    outrasPecas: lista.pecas.filter(function (p) { return nomesEscolhidos.indexOf(p.nomePeca) === -1; }),
    statusConferencia: statusConferencia,
    aprovadoPor: aprovadoPor,
    aprovadoEm: aprovadoEm,
    linkCliente: linkCliente
  };
}

/**
 * O projeto do mês já foi arquivado no Runrun.it?
 *
 * Importa porque projeto fechado NÃO aceita tarefa nova (confirmado na
 * prática: 422 "O projeto da tarefa deve estar aberto"), então a
 * devolução precisa mudar de caminho. Comentar e reatribuir continuam
 * funcionando normalmente — só criar é bloqueado.
 */
function projetoDaTarefaEstaFechado(tarefa) {
  if (!tarefa || !tarefa.project_id) return false;
  var projeto = runrunFetch('/projects/' + tarefa.project_id);
  if (!projeto || projeto.erroFetch) return false;
  return !!projeto.is_closed;
}

// ---------------------------------------------------------------------
// Aprovar
// ---------------------------------------------------------------------

/**
 * Carimba a aprovação interna. NÃO gera o link do cliente aqui de
 * propósito: quem gera é `gerarLinkDeAprovacao` (Aprovacao.gs), depois
 * que o atendimento escolher quais peças vão juntas e escrever a
 * mensagem. Separar os dois é o que permite mandar Feed e Stories no
 * mesmo link.
 */
function aprovarInternamente(taskId, loteId, aprovadoPor) {
  if (!taskId || !aprovadoPor) return { ok: false, error: 'taskId ou quem aprovou não informado.' };

  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linhas = linhasDoLote(sheet.getDataRange().getValues(), taskId, loteId);
    if (!linhas.length) return { ok: false, error: 'Não achei essa peça na fila de conferência.' };
    var agora = new Date().toISOString();
    // Aprova TODAS as peças do lote de uma vez — é a decisão única que o
    // Cláudio pediu: quem confere um lote de várias peças aprova (ou pede
    // alteração) o lote inteiro, não peça por peça.
    linhas.forEach(function (linha) {
      sheet.getRange(linha, 12, 1, 3).setValues([['aprovada', aprovadoPor, agora]]);
    });
  } finally {
    lock.releaseLock();
  }

  // Fecha o ciclo pro DESIGNER (2026-08-06). Até aqui o fluxo era
  // assimétrico: pedir alteração comentava na tarefa e ele ficava sabendo,
  // mas APROVAR não escrevia em lugar nenhum — só uma linha na planilha.
  // Ou seja, notícia ruim chegava e notícia boa não: ele mandava a peça e
  // ficava no escuro até ela virar link ou virar alteração.
  //
  // Sem `autor`: cai na conta padrão de propósito, igual ao aviso de
  // resposta do cliente (responderAprovacaoPublica, Aprovacao.gs) — o texto
  // já diz quem conferiu, e o que importa é o recado chegar. Falhar aqui
  // NÃO desfaz a aprovação: ela já está gravada, e travar a tela de quem
  // confere por causa de um comentário seria pior que o comentário faltar.
  try {
    adicionarComentario(taskId, '✅ Conferido por ' + aprovadoPor + ' — indo pro cliente.', null);
  } catch (e) {
    Logger.log('Não consegui avisar a aprovação interna na tarefa: ' + e.message);
  }

  return { ok: true, aprovadoPor: aprovadoPor, aprovadoEm: agora };
}

// ---------------------------------------------------------------------
// O briefing da conferência: o que foi pedido, juntando os dois cards
// ---------------------------------------------------------------------

var BRIEFING_CONFERENCIA_VERSAO = 'conf-v2';

/**
 * O "o que foi pedido" da tela de conferência.
 *
 * O PROBLEMA: a tela mostrava só a descrição da própria tarefa — e quase
 * sempre ela está vazia. Na Beeon o pedido do mês fica escrito no CARD
 * MÃE, e cada subtarefa nasce com pouco mais que o nome da peça. Resultado:
 * quem confere abria a tela e lia "essa tarefa não tem descrição", numa
 * peça que tinha briefing completo um andar acima.
 *
 * O QUE ELE FAZ: junta os dois lados (card mãe + tarefa do designer, mais
 * os comentários dos dois) e pede pra Bee separar em três coisas que quem
 * confere precisa conferir de verdade:
 *
 *   - FORMATO/TAMANHO: é o erro mais barato de pegar e o mais caro de
 *     deixar passar (peça no tamanho errado volta inteira).
 *   - COPY: os textos que têm que aparecer NA ARTE, pra bater com o que
 *     está na tela, palavra por palavra.
 *   - O RESTO do que foi pedido — só o que dá pra CONFERIR OLHANDO a arte.
 *
 * E quando a peça é uma ALTERAÇÃO, o que mudar entra em separado — não
 * misturado com o pedido original, porque são coisas diferentes: o pedido
 * original já foi atendido, o que está em jogo é a mudança.
 *
 * Mesma disciplina do resto da Bee: cada item aponta a mensagem de onde
 * saiu, e item sem fonte válida é descartado — é o sintoma de a IA ter
 * inventado o item junto com a fonte.
 *
 * OS TRÊS ERROS QUE A v2 CORRIGE (relatados pelo Cláudio, 2026-08-07) —
 * todos vinham de o prompt não saber como um briefing da Beeon é escrito
 * de verdade:
 *
 *   1. BRIEFING COM CAIXAS PRA MARCAR. Muito card mãe traz uma lista de
 *      formatos possíveis em caixinhas ("[ ] Feed  [x] Stories  [ ] Reels")
 *      e o atendimento marca só a que vale. A Bee lia a lista inteira e
 *      devolvia TODAS como se fossem o pedido — o atendimento então
 *      conferia um Stories procurando um Feed que ninguém pediu. Agora o
 *      prompt explica o que é uma caixa marcada e manda ignorar as vazias.
 *   2. LEGENDA ENTRANDO COMO COPY. Legenda é o texto do POST (vai no
 *      Instagram, escrito na hora de publicar), não o texto da ARTE. Ela
 *      não existe na peça que está na tela, então listá-la só fazia quem
 *      confere procurar na arte um texto que nunca ia estar lá.
 *   3. COPY VIRANDO OUTRA COISA. "Copy" estava sendo entendido como
 *      "o texto do pedido" em vez de "as palavras que aparecem na peça".
 *      O prompt agora define copy pelo teste que importa: dá pra LER isso
 *      na arte? Se não dá, não é copy.
 *
 * Mudar qualquer regra daqui exige subir `BRIEFING_CONFERENCIA_VERSAO` —
 * ela entra no hash do cache, então sem isso os resumos velhos (feitos com
 * o prompt antigo) continuariam sendo servidos como se nada tivesse mudado.
 */
function briefingDaConferencia(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var material = beeMaterialDaTarefa(taskId);
  if (!material.ok) return material;
  if (!material.mensagens.length) return { ok: true, semMaterial: true };

  var textoMaterial = beeTextoDoMaterial(material);

  // A devolução entra no material quando existe: numa alteração, o que o
  // atendimento escreveu é a instrução principal, não contexto de apoio.
  var devolucao = buscarDevolucaoDaTarefa(taskId);
  var textoDevolucao = '';
  if (devolucao.ok && devolucao.devolucao) {
    var d = devolucao.devolucao;
    textoDevolucao = '\n\nPEDIDO DE ALTERAÇÃO FEITO PELO ATENDIMENTO:\n' + (d.motivo || '') +
      (d.pins && d.pins.length ? '\n' + textoDosPins(d.pins) : '');
  }

  var hash = hashTexto(textoMaterial + textoDevolucao + '|' + BRIEFING_CONFERENCIA_VERSAO);
  var chaveCache = 'conf-' + taskId;
  var cacheado = buscarBriefingCacheado(chaveCache, hash);
  if (cacheado) return { ok: true, briefing: cacheado, doCache: true };

  var ehAlteracao = material.ehAlteracao || !!textoDevolucao;

  var prompt = 'Você é a Bee, assistente da Colmeia, ferramenta da Beeon (agência de marketing).\n\n' +
    'Quem vai ler isto é o ATENDIMENTO, conferindo uma peça pronta ANTES de mandar pro cliente. ' +
    'Ele precisa saber o que foi pedido pra comparar com a arte que está vendo na tela ao lado.\n\n' +
    'Abaixo está tudo que está escrito sobre a peça: a descrição do card mãe (o pedido do mês), a ' +
    'descrição da tarefa do designer e os comentários dos dois. Cada mensagem tem um número entre ' +
    'colchetes.\n\n' +
    'REGRAS DURAS:\n' +
    '- Só diga o que está escrito. Nunca complete, nunca deduza, nunca sugira.\n' +
    '- Cada item traz o NÚMERO da mensagem de onde saiu. Sem conseguir apontar, não escreva o item.\n' +
    '- Nada escrito sobre algo? Devolva vazio. É melhor que inventar.\n' +
    '- Seja CURTO. Isto é uma ficha de conferência, não um resumo do card. ' +
    'No máximo 5 itens em "itens". Se estiver na dúvida se algo entra, não entra.\n' +
    '- Português do Brasil, frases curtas, tom de colega. Sem "olá", sem emoji.\n\n' +
    // ---- Caixinhas de marcar: o erro nº 1 da v1 --------------------------
    'CAIXAS PRA MARCAR — LEIA COM ATENÇÃO:\n' +
    'Muito briefing daqui vem como uma LISTA DE OPÇÕES com caixinhas, e o atendimento marca ' +
    'só as que valem pra esta peça. Marcada é "[x]", "[X]", "☑", "✅", "(x)", ou a linha ' +
    'com um "x"/"sim" do lado. Vazia é "[ ]", "☐", "[]", "( )" ou nada.\n' +
    'A REGRA: só o que está MARCADO foi pedido. O que está desmarcado é opção que NÃO vale — ' +
    'não escreva, não cite, nem como observação. Se a lista existe mas nada parece marcado, ' +
    'não escolha por conta própria: deixe de fora e não invente.\n\n' +
    // ---- O que é copy, e o que não é ------------------------------------
    'O QUE É "COPY" (e o que não é):\n' +
    'Copy = as palavras que vão APARECER ESCRITAS DENTRO DA ARTE, pra quem confere ler na tela ' +
    'e comparar letra por letra: título, chamada, oferta, preço, condição, telefone, CTA.\n' +
    'O teste: "dá pra LER isso olhando a peça?" Se não dá, NÃO é copy.\n' +
    'NÃO é copy, e não deve entrar em lugar nenhum da resposta:\n' +
    '  - LEGENDA / caption / texto do post — é o que vai escrito no Instagram na hora de publicar, ' +
    'fora da arte. Mesmo quando o briefing traz a legenda inteira, ela NÃO entra.\n' +
    '  - hashtags, @arrobas, link da bio, roteiro de vídeo, sugestão de horário de publicação;\n' +
    '  - o pedido em si ("fazer um post sobre o combo"), que é descrição de tarefa, não texto da peça.\n\n' +
    'SEPARE EM TRÊS COISAS:\n' +
    '- "formato": só o que foi pedido DE VERDADE (respeitando as caixas marcadas) — tamanho, ' +
    'dimensões, proporção ou onde vai ser publicado (ex: "Stories 1080x1920"). Vários formatos ' +
    'marcados viram um texto só, separados por vírgula. "" se não estiver escrito.\n' +
    '- "copy": os textos que aparecem na arte, pela definição acima. Copie a palavra EXATA como ' +
    'está escrita, sem reescrever nem resumir. Lista vazia se não houver.\n' +
    '- "itens": só os detalhes de ARTE que dá pra conferir OLHANDO a peça — cor, logo, foto, ' +
    'fonte, elemento que tem que aparecer ou não pode aparecer. Um item por detalhe, curto. ' +
    'Prazo, quem faz, status, combinado de processo e qualquer coisa que não se vê na arte ' +
    'ficam DE FORA.\n' +
    (ehAlteracao
      ? '- "alteracao": esta peça JÁ FOI FEITA e voltou pra mudança. Aqui vai o que precisa MUDAR ' +
        'agora, separado do pedido original.\n'
      : '- "alteracao": deixe a lista vazia, esta peça não é uma alteração.\n') +
    '\nTAREFA: ' + material.titulo + '\n' +
    (material.cliente ? 'CLIENTE: ' + material.cliente + '\n' : '') +
    '\nMATERIAL:\n' + textoMaterial + textoDevolucao + '\n\n' +
    'Responda SOMENTE em JSON:\n' +
    '{"formato":"...","copy":[{"texto":"...","fonte":2}],' +
    '"itens":[{"texto":"...","fonte":3}],"alteracao":[{"texto":"...","fonte":5}]}';

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;

  var dados = resultado.dados || {};
  var porNumero = {};
  material.mensagens.forEach(function (m) { porNumero[m.n] = m; });

  // O pedido de alteração não é uma das mensagens numeradas (entrou no
  // material como bloco à parte), então itens de alteração são aceitos sem
  // fonte — para eles a origem é uma só e é conhecida.
  function limpar(lista, exigeFonte) {
    return (lista || []).filter(function (it) {
      return it && it.texto && (!exigeFonte || porNumero[Number(it.fonte)]);
    }).map(function (it) {
      var fonte = porNumero[Number(it.fonte)];
      return {
        texto: String(it.texto),
        onde: fonte ? fonte.onde : 'atendimento',
        autor: fonte ? fonte.autor : 'atendimento'
      };
    });
  }

  // O teto de 5 itens é repetido AQUI, além de estar escrito no prompt: o
  // prompt é um pedido, isto é uma garantia. A tela de conferência foi
  // desenhada pra uma ficha curta — uma lista de 20 linhas rolando dentro
  // do bloco é exatamente o "resumo gigante" que a v2 veio corrigir.
  var briefing = {
    formato: String(dados.formato || ''),
    copy: limpar(dados.copy, true),
    itens: limpar(dados.itens, true).slice(0, 5),
    alteracao: limpar(dados.alteracao, false)
  };
  salvarBriefingCacheado(chaveCache, hash, briefing);
  return { ok: true, briefing: briefing };
}

// ---------------------------------------------------------------------
// A entrada do atendimento (2026-08-05)
// ---------------------------------------------------------------------

/**
 * O atendimento entra na tela de conferência SEM senha pessoal.
 *
 * O PROBLEMA QUE ISSO RESOLVE: elas chegam por um link de comentário do
 * Runrun.it, muitas vezes noutro navegador ou numa aba anônima, e batiam
 * numa tela de senha — sendo que elas não têm conta no Colmeia. O link
 * simplesmente não funcionava pra quem ele foi feito.
 *
 * O QUE ISSO NÃO É: não é uma brecha nova. A senha do Colmeia sempre
 * protegeu só a TELA — nenhuma ação deste backend confere sessão nenhuma
 * (ver o comentário sobre segurança em Aprovacao.gs). Quem tem o endereço
 * da API já podia chamar qualquer coisa, logado ou não.
 *
 * O QUE ELE GANHA: um código único do time (não senha por pessoa), que
 * mantém a tela fechada pra quem só esbarrou no endereço, e a IDENTIDADE
 * — sem saber quem é, o pedido de alteração sairia no Runrun.it no nome
 * errado, justamente o que os tokens por pessoa acabaram de corrigir.
 *
 * O código fica em Propriedades do Script (CODIGO_ATENDIMENTO), nunca
 * aqui: este repositório é público. Sem a propriedade criada, a entrada é
 * RECUSADA — falhar fechado é o certo quando a dúvida é "posso deixar
 * entrar?".
 */
function entrarComoAtendimento(codigo) {
  var esperado = PropertiesService.getScriptProperties().getProperty('CODIGO_ATENDIMENTO');
  if (!esperado) {
    return { ok: false, error: 'A entrada do atendimento ainda não foi configurada. Fala com o Cláudio.' };
  }
  if (!codigo || String(codigo).trim().toLowerCase() !== String(esperado).trim().toLowerCase()) {
    return { ok: false, error: 'Código errado.' };
  }
  // A lista sai de RUNRUN_TOKENS_ATENDIMENTO (Código.gs) de propósito: é o
  // mesmo lugar que decide com qual conta do Runrun.it cada uma escreve.
  // Duas listas separadas viravam a chance de alguém aparecer aqui e não
  // ter token lá — entrando, mas comentando no nome do Cláudio.
  return { ok: true, pessoas: Object.keys(RUNRUN_TOKENS_ATENDIMENTO) };
}

// ---------------------------------------------------------------------
// Mandar o card mãe pra "Aprovação do Cliente"
// ---------------------------------------------------------------------

// Nome da etapa no Runrun.it, como está escrito lá. A comparação ignora
// acento e maiúscula (ver normalizarNomeDeEtapa), então pequenas
// diferenças de escrita não quebram nada.
// A etapa se chama "Aprovação Cliente" no Runrun.it — sem o "do". Em vez
// de trocar um texto exato por outro (e quebrar de novo no dia em que
// alguém renomear), a busca aceita uma LISTA de jeitos de escrever e
// ignora as palavrinhas de ligação (do/da/de) na comparação. O primeiro
// da lista é o que aparece escrito na tela.
var ETAPA_APROVACAO_CLIENTE = 'Aprovação Cliente';
var ETAPA_APROVACAO_CLIENTE_NOMES = ['Aprovação Cliente', 'Aprovação do Cliente', 'Aprovacao Cliente'];

// Uma tarefa que está NA coluna "Aprovação Cliente" (confirmada pelo
// Cláudio em 05/08). Serve só de semente pra descobrir o número da
// coluna — ver idDaEtapaPorNome. Não precisa continuar lá pra sempre: o
// nome é conferido antes de o número ser aceito, e se um dia ela sair da
// coluna o Colmeia cai nos outros caminhos em vez de errar calado. Dá
// pra trocar sem mexer no código, pela propriedade de script
// TAREFA_EXEMPLO_APROVACAO_CLIENTE.
var TAREFA_EXEMPLO_APROVACAO_CLIENTE = '112696';

/**
 * Move o card mãe pra etapa "Aprovação do Cliente" no Runrun.it.
 *
 * Pedido do Cláudio: quando o atendimento manda o link, o card mãe tem que
 * sair da fila de produção e ir pra aba onde o time acompanha o que está
 * esperando resposta do cliente. Sem isso ele continua parecendo trabalho
 * em aberto pra quem olha o quadro do Runrun.it.
 *
 * Vale pro CARD MÃE, não pra subtarefa: quem representa a peça no mês
 * inteiro é ele, e é ele que o time olha.
 */
function moverCardMaeParaAprovacaoCliente(taskId, autor) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var tarefa = runrunFetch('/tasks/' + taskId);
  if (!tarefa || tarefa.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.', runrunFora: runrunPareceForaDoAr() };
  }
  var cardMaeId = tarefa.parent_task_id || taskId;

  var stageId = idDaEtapaPorNome(ETAPA_APROVACAO_CLIENTE_NOMES);
  if (!stageId) {
    // Falha honesta: a interface avisa que o link foi gerado mas o card
    // não se moveu, em vez de dizer "pronto!" pra uma coisa que não
    // aconteceu.
    return { ok: false, error: 'Não achei a etapa "' + ETAPA_APROVACAO_CLIENTE + '" no Runrun.it. O link foi gerado; o card mãe precisa ser movido à mão.' };
  }

  var r = moverParaEtapaArbitraria(cardMaeId, stageId, autor);
  if (!r.ok) return { ok: false, error: r.error || 'O Runrun.it recusou mover o card mãe.' };
  return { ok: true, cardMaeId: cardMaeId, link: 'https://runrun.it/tasks/' + cardMaeId };
}

function normalizarNomeDeEtapa(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Tira as palavrinhas de ligação: "Aprovação do Cliente" e "Aprovação
    // Cliente" viram a mesma coisa. É a diferença que fez a busca falhar
    // na primeira tentativa, e é o tipo de detalhe que muda sozinho quando
    // alguém renomeia a coluna no Runrun.it.
    .replace(/\b(do|da|de|dos|das)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Descobre o id de uma etapa pelo NOME dela.
 *
 * O Runrun.it não tem (nem o Colmeia usa) um endpoint que liste as etapas
 * do quadro — o jeito que o app já usava pra isso, na página "Runrun
 * completo", é olhar uma tarefa que esteja na etapa e ler o
 * `task_state_id` dela. Aqui é a mesma ideia, procurando por nome.
 *
 * Por isso NÃO existe id escrito na mão: a agência pode renomear ou
 * recriar a etapa, e um número fixo aqui viraria uma dessas quebras
 * silenciosas que ninguém liga à causa. O id fica 6h em cache (etapa não
 * muda de id) pra não repetir a varredura a cada envio.
 */
function idDaEtapaPorNome(nomeProcurado) {
  // Aceita um nome ou uma LISTA de nomes possíveis — a mesma etapa pode
  // estar escrita de jeitos diferentes, e quem chama não deveria ter que
  // adivinhar qual.
  var nomes = Array.isArray(nomeProcurado) ? nomeProcurado : [nomeProcurado];
  var alvos = nomes.map(normalizarNomeDeEtapa).filter(function (n) { return !!n; });
  if (!alvos.length) return null;

  var ehAprovacaoCliente = alvos.indexOf(normalizarNomeDeEtapa(ETAPA_APROVACAO_CLIENTE)) !== -1;

  // 1) A propriedade de script, se alguém cadastrou, ganha de tudo.
  if (ehAprovacaoCliente) {
    var fixo = PropertiesService.getScriptProperties().getProperty('STAGE_ID_APROVACAO_CLIENTE');
    if (fixo) return String(fixo).trim();
  }

  var chaveCache = 'colmeia_etapa_id_' + alvos[0];
  var cache = CacheService.getScriptCache();
  var guardado = cache.get(chaveCache);
  if (guardado) return guardado;

  // 2) PELA TAREFA DE EXEMPLO. As etapas são as colunas do quadro
  //    (Pendentes, Fazendo, Aprovação Cliente...) e o número delas não
  //    aparece em lugar nenhum da tela do Runrun.it — nem existe endpoint
  //    que liste as colunas. Mas TODA tarefa carrega o número da coluna em
  //    que está: basta ler UMA que esteja lá.
  //
  //    É o caminho mais confiável, porque a leitura de uma tarefa devolve
  //    o registro completo (a listagem nem sempre traz o nome da etapa —
  //    foi o que fez a varredura do item 3 falhar em produção).
  //
  //    O nome é CONFERIDO antes de aceitar o número: se a tarefa de
  //    exemplo for movida pra outra coluna um dia, o Colmeia percebe e
  //    ignora, em vez de mandar todos os cards mãe pra coluna errada em
  //    silêncio — que seria bem pior que não mover nenhum.
  var idExemplo = PropertiesService.getScriptProperties().getProperty('TAREFA_EXEMPLO_APROVACAO_CLIENTE')
    || (ehAprovacaoCliente ? TAREFA_EXEMPLO_APROVACAO_CLIENTE : '');
  if (idExemplo) {
    var exemplo = runrunFetch('/tasks/' + String(idExemplo).trim());
    if (exemplo && !exemplo.erroFetch && exemplo.task_state_id) {
      var nomeExemplo = normalizarNomeDeEtapa(exemplo.board_stage_name || exemplo.task_state_name);
      if (alvos.indexOf(nomeExemplo) !== -1) {
        cache.put(chaveCache, String(exemplo.task_state_id), 6 * 60 * 60);
        return String(exemplo.task_state_id);
      }
    }
  }

  // 3) Última tentativa: varrer as tarefas abertas atrás de uma que esteja
  //    na etapa. Só funciona se a listagem devolver o nome da etapa.
  // Ordenado por atualização: a etapa que interessa é usada o tempo todo,
  // então aparece nas primeiras páginas. Para no que achar — e desiste
  // depois de 5 páginas pra nunca virar uma varredura infinita.
  for (var pagina = 1; pagina <= 5; pagina++) {
    var lote = runrunFetch('/tasks?is_closed=false&sort=updated_at&sortDir=desc&limit=100&page=' + pagina);
    if (!lote || lote.erroFetch || !lote.length) break;
    for (var i = 0; i < lote.length; i++) {
      var t = lote[i];
      var nomes = [t.board_stage_name, t.task_state_name];
      for (var n = 0; n < nomes.length; n++) {
        if (nomes[n] && alvos.indexOf(normalizarNomeDeEtapa(nomes[n])) !== -1 && t.task_state_id) {
          cache.put(chaveCache, String(t.task_state_id), 6 * 60 * 60);
          return String(t.task_state_id);
        }
      }
    }
    if (lote.length < 100) break;
  }
  return null;
}

// ---------------------------------------------------------------------
// Devolver pro designer
// ---------------------------------------------------------------------

/**
 * O atendimento reprova: o pedido volta pro designer.
 *
 * CAMINHO NORMAL — cria a subtarefa "Alteração VN" dentro do card mãe, já
 * alocada pro designer que fez a peça, com o motivo virando a descrição.
 *
 * CAMINHO DO PROJETO FECHADO — projeto arquivado não aceita tarefa nova.
 * Então comenta no card mãe marcando o designer (menção é notificação de
 * verdade no Runrun.it, não só texto colorido) e passa o card pra ele. O
 * texto escrito pelo atendimento vale igual, só vai por outro caminho —
 * é isso que faz a exceção não ser um beco sem saída.
 */
function devolverParaDesigner(dados) {
  dados = dados || {};
  var taskId = dados.taskId;
  var motivo = String(dados.motivo || '').trim();
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  if (!motivo) return { ok: false, error: 'O motivo é obrigatório — sem ele o designer não sabe o que refazer.' };

  var tarefa = runrunFetch('/tasks/' + taskId);
  if (!tarefa || tarefa.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.', runrunFora: runrunPareceForaDoAr() };
  }

  // A alteração nasce dentro do card mãe. Quando a peça JÁ é uma
  // subtarefa, o pai dela é o card mãe; quando é uma tarefa solta, ela
  // mesma faz esse papel.
  var cardMaeId = tarefa.parent_task_id || taskId;
  var designer = dados.designer || tarefa.responsible_name || '';
  // Quem vai fazer o ajuste pode NÃO ser quem fez a peça — o atendimento
  // escolhe na caixinha antes de mandar. Por isso, sem id, o NOME escolhido
  // é resolvido aqui; cair direto no `tarefa.user_id` mandaria a alteração
  // pro responsável antigo sem ninguém perceber.
  var designerId = dados.designerId || '';
  if (!designerId && designer) designerId = idDoUsuarioRunrunPorNome(designer) || '';
  if (!designerId) designerId = tarefa.user_id || '';

  var fechado = projetoDaTarefaEstaFechado(tarefa);

  // Uma ou várias peças no MESMO pedido de alteração (pedido do Cláudio,
  // 2026-08-05): quando o lote tinha várias peças, tudo volta junto, com o
  // que precisa mudar EM CADA UMA marcado nela — em vez de um pedido de
  // alteração por peça. `pecas` é o formato novo; sem ele (chamada
  // antiga, um card em cache de antes do deploy), cai no formato de
  // peça única de sempre.
  var pecas = Array.isArray(dados.pecas) && dados.pecas.length
    ? dados.pecas
    : [{
        nomePeca: dados.nomePeca || '',
        fileId: dados.fileId || '',
        nomeArquivo: dados.nomeArquivo || '',
        mimeType: dados.mimeType || '',
        pins: dados.pins || []
      }];
  var nomesPecas = pecas.map(function (p) { return p.nomePeca; }).filter(Boolean);

  // Guarda a devolução ANTES de escrever no Runrun.it: é dela que sai o
  // link, e o link precisa estar dentro do texto que vai ser escrito.
  var codigo = gravarDevolucao({
    taskIdOrigem: taskId,
    cardMaeId: cardMaeId,
    cliente: dados.cliente || tarefa.client_name || '',
    motivo: motivo,
    pecas: pecas
  });

  var temAlgumPin = pecas.some(function (p) { return Array.isArray(p.pins) && p.pins.length; });
  var corpo = motivo + '\n\n' + textoDosPinsPorPeca(pecas);

  // O LINK que abre a(s) peça(s) com os pontos desenhados em cima. Só a
  // interface sabe em que endereço o Colmeia está publicado hoje (mesmo
  // motivo de gerarLinkDeAprovacao), então a base vem de lá — sem ela, o
  // pedido ainda funciona, só sem o link.
  if (temAlgumPin && dados.baseUrl) {
    corpo += '\n\nVer os pontos marcados n' + (pecas.length > 1 ? 'as peças' : 'a peça') + ': ' + dados.baseUrl + 'ajuste.html?codigo=' + codigo;
  }

  var assinatura = '\n\n— pedido por ' + (dados.autorNome || 'atendimento') + ' na conferência interna do Colmeia';

  if (fechado) {
    // Menção de verdade: <mention>@Nome</mention> notifica a pessoa. Sem
    // isso o comentário é só texto e ninguém fica sabendo.
    var mencao = designer ? '<mention>@' + designer + '</mention> ' : '';
    var comentario = mencao + 'ajuste pedido na conferência interna:\n\n' + corpo + assinatura;
    var rComentario = adicionarComentario(cardMaeId, comentario, dados.autor);
    var rPasse = designerId ? alocarResponsavelNaTarefa(cardMaeId, designerId, dados.autor) : { ok: false, error: 'sem id do designer' };
    // Mesmo motivo do caminho normal: o card precisa cair em AJUSTES pra
    // o designer achar. Mover etapa funciona em projeto fechado (só
    // CRIAR é bloqueado). A entrega desejada do card mãe NÃO é mexida de
    // propósito — ele é o guarda-chuva do mês e pode ter um prazo de
    // cliente de verdade ali; sobrescrever isso apagaria um dado real.
    var rEtapaMae = moverEtapaTarefa(cardMaeId, 'ajustes', dados.autor);

    marcarConferenciaDevolvida(taskId, dados.loteId, dados.autorNome, motivo, nomesPecas);
    return {
      ok: true,
      caminho: 'projetoFechado',
      comentou: !!rComentario.ok,
      passou: !!rPasse.ok,
      foiProAjustes: !!rEtapaMae.ok,
      erroPasse: rPasse.ok ? '' : (rPasse.error || ''),
      cardMaeId: cardMaeId,
      cardMaeLink: 'https://runrun.it/tasks/' + cardMaeId,
      designer: designer,
      codigoAjuste: codigo
    };
  }

  var numero = proximoNumeroDeAlteracao(cardMaeId);
  var tituloPecas = nomesPecas.length > 1
    ? nomesPecas.length + ' peças (' + nomesPecas.join(', ') + ')'
    : (nomesPecas[0] || tarefa.title || '');
  var criada = criarTarefaRunrun({
    titulo: 'Alteração V' + numero + ' — ' + tituloPecas,
    parentTaskId: cardMaeId,
    responsavelId: designerId,
    responsavelNome: designer,
    descricao: corpo + assinatura,
    // Entrega HOJE — criarTarefaRunrun completa sozinho com as 18:00
    // (desired_date_with_time). Sem data, a tarefa nasce sem prazo e
    // afunda no fim da coluna, que é ordenada por entrega: o pedido do
    // Cláudio é exatamente esse, "se não o card se perde".
    desiredDate: hojeNoFusoDaAgencia(),
    autor: dados.autor
  });

  if (!criada.ok) {
    return { ok: false, error: criada.error || 'Não consegui criar a subtarefa de alteração.', bodyBruto: criada.bodyBruto };
  }

  // A subtarefa nasce em "Pendentes" (etapa padrão do Runrun.it) e
  // precisa ir pra AJUSTES: é a coluna onde o designer procura refação, e
  // é ela que separa "refazer" de "fazer do zero" no quadro dele. Não dá
  // pra mandar na criação — a etapa é um PUT separado (task_state_id, ver
  // moverEtapaTarefa). Se falhar, a tarefa continua existindo e alocada:
  // vale avisar, não vale derrubar a devolução inteira.
  var rEtapa = moverEtapaTarefa(criada.taskId, 'ajustes', dados.autor);

  // Agora que a subtarefa existe, a devolução passa a apontar pra ela — é
  // isso que faz o bloco com os pontos aparecer dentro do card quando o
  // designer abrir a alteração (ver buscarDevolucaoDaTarefa).
  vincularDevolucaoAAlteracao(codigo, criada.taskId);

  marcarConferenciaDevolvida(taskId, dados.loteId, dados.autorNome, motivo, nomesPecas);
  return {
    ok: true,
    caminho: 'subtarefa',
    taskIdAlteracao: criada.taskId,
    link: criada.link,
    titulo: 'Alteração V' + numero,
    alocou: criada.alocou,
    virouSubtarefa: criada.virouSubtarefa,
    foiProAjustes: !!rEtapa.ok,
    erroEtapa: rEtapa.ok ? '' : (rEtapa.error || ''),
    entregaEm: hojeNoFusoDaAgencia(),
    designer: designer,
    codigoAjuste: codigo
  };
}

/**
 * Liga a devolução já gravada à subtarefa que acabou de nascer. Só o
 * caminho normal chama isso — no projeto fechado não existe subtarefa, e
 * a devolução continua pendurada no card mãe.
 */
function vincularDevolucaoAAlteracao(codigo, taskIdAlteracao) {
  var sheet = getDevolucoesSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(codigo)) {
        sheet.getRange(i + 1, 2).setValue(String(taskIdAlteracao));
        return;
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * A data de hoje no formato que o Runrun.it espera (AAAA-MM-DD),
 * calculada no fuso da agência e não no do servidor do Google — sem isso,
 * um pedido feito à noite podia virar "amanhã" e a tarefa nascer com o
 * prazo errado.
 */
function hojeNoFusoDaAgencia() {
  return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
}

/**
 * Qual número a próxima alteração deve levar.
 *
 * O desenho original pedia "Alteração V1" fixo — o que quebra na segunda
 * devolução da mesma peça: ficariam duas "Alteração V1" no mesmo card
 * mãe, e ninguém saberia qual é qual. Aqui a gente conta as que já
 * existem e segue a numeração.
 */
function proximoNumeroDeAlteracao(cardMaeId) {
  var pai = runrunFetch('/tasks/' + cardMaeId);
  if (!pai || pai.erroFetch || !Array.isArray(pai.subtask_ids)) return 1;

  var maior = 0;
  for (var i = 0; i < pai.subtask_ids.length; i++) {
    var filha = runrunFetch('/tasks/' + pai.subtask_ids[i]);
    if (!filha || filha.erroFetch) continue;
    var m = String(filha.title || '').match(/altera[çc][ãa]o\s*v(\d+)/i);
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  }
  return maior + 1;
}

/**
 * Os pontos marcados na imagem viram texto no corpo do pedido.
 *
 * O Runrun.it não tem como mostrar marcação em imagem, então a posição
 * vira uma referência escrita ("no alto à esquerda"). Isso sozinho não
 * basta — "alto à esquerda" não diz de que tamanho nem exatamente onde —
 * por isso o pedido também leva um LINK que abre a peça com os pontos
 * desenhados em cima (ver gravarDevolucao e ajuste.html). O texto continua
 * existindo pra quem só vai ler o card correndo, e some sozinho quando
 * ninguém marcou nada.
 */
function textoDosPins(pins) {
  if (!Array.isArray(pins) || !pins.length) return '';
  var linhas = pins.map(function (p, i) {
    return (i + 1) + '. (' + regiaoDoPonto(p.x, p.y) + ') ' + String(p.texto || '').trim();
  });
  return 'Pontos marcados na peça:\n' + linhas.join('\n');
}

/**
 * A mesma coisa que `textoDosPins`, mas pra um LOTE de peças: com uma peça
 * só, o texto sai idêntico a antes (compat); com mais de uma, cada peça
 * que tem ponto marcado ganha o nome dela na frente, senão o designer não
 * saberia qual arte cada linha se refere.
 */
function textoDosPinsPorPeca(pecas) {
  if (!Array.isArray(pecas) || !pecas.length) return '';
  if (pecas.length === 1) return textoDosPins(pecas[0].pins);
  return pecas.map(function (p) {
    var texto = textoDosPins(p.pins);
    return texto ? (p.nomePeca + ':\n' + texto) : '';
  }).filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------
// A devolução guardada: é o que faz os pinos sobreviverem à ida pro
// Runrun.it, onde marcação em imagem não existe
// ---------------------------------------------------------------------

function getDevolucoesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Devolucoes');
  if (!sheet) {
    sheet = ss.insertSheet('Devolucoes');
    sheet.getRange('A1:M1').setValues([[
      'codigo', 'task_id_alteracao', 'task_id_origem', 'card_mae_id', 'cliente',
      'nome_peca', 'file_id', 'nome_arquivo', 'mime_type', 'motivo', 'pins', 'devolvido_em', 'pecas_json'
    ]]);
  }
  return sheet;
}

/**
 * Guarda a devolução inteira (motivo + pinos + qual arquivo estava sendo
 * conferido) e devolve o código do link.
 *
 * Por que precisa existir: o pedido de alteração vai parar no Runrun.it,
 * que não sabe desenhar ponto em cima de imagem. Sem guardar isso aqui, a
 * marcação que o atendimento fez com o mouse virava só "(alto à
 * esquerda)" — e o designer ficava adivinhando qual elemento era.
 *
 * `taskIdAlteracao` fica vazio no caminho do projeto fechado (não existe
 * subtarefa), e é por isso que a busca por tarefa (buscarDevolucaoDaTarefa)
 * aceita tanto o id da alteração quanto o do card mãe.
 */
function gravarDevolucao(dados) {
  var codigo = Utilities.getUuid().replace(/-/g, '');
  var sheet = getDevolucoesSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    // Um lote de várias peças grava a lista inteira em `pecas_json`; as
    // colunas antigas (nome_peca/file_id/...) continuam recebendo a
    // PRIMEIRA peça, pra qualquer leitor antigo (ou aba em cache de antes
    // do deploy) continuar enxergando alguma coisa em vez de vazio.
    var pecas = Array.isArray(dados.pecas) && dados.pecas.length
      ? dados.pecas
      : [{ nomePeca: dados.nomePeca || '', fileId: dados.fileId || '', nomeArquivo: dados.nomeArquivo || '', mimeType: dados.mimeType || '', pins: dados.pins || [] }];
    var primeira = pecas[0];
    sheet.appendRow([
      codigo,
      dados.taskIdAlteracao || '',
      dados.taskIdOrigem || '',
      dados.cardMaeId || '',
      dados.cliente || '',
      primeira.nomePeca || '',
      primeira.fileId || '',
      primeira.nomeArquivo || '',
      primeira.mimeType || '',
      dados.motivo || '',
      JSON.stringify(primeira.pins || []),
      new Date().toISOString(),
      JSON.stringify(pecas)
    ]);
  } finally {
    lock.releaseLock();
  }
  return codigo;
}

function linhaParaDevolucao(l) {
  var pins = [];
  try { pins = JSON.parse(l[10] || '[]'); } catch (e) { pins = []; }
  var pecas = [];
  try { pecas = JSON.parse(l[12] || '[]'); } catch (e) { pecas = []; }
  // Linha de antes de `pecas_json` existir: reconstrói uma peça só a
  // partir das colunas antigas, pra continuar lendo devolução gravada
  // antes deste deploy.
  if (!pecas.length) {
    pecas = [{ nomePeca: l[5], fileId: l[6], nomeArquivo: l[7], mimeType: l[8], pins: pins }];
  }
  return {
    codigo: l[0],
    taskIdAlteracao: String(l[1] || ''),
    taskIdOrigem: String(l[2] || ''),
    cardMaeId: String(l[3] || ''),
    cliente: l[4],
    // Compat: continuam existindo pra quem só lê a peça única (sempre a
    // primeira do lote) — quem quer o lote inteiro usa `pecas` abaixo.
    nomePeca: pecas[0].nomePeca,
    fileId: pecas[0].fileId,
    nomeArquivo: pecas[0].nomeArquivo,
    mimeType: pecas[0].mimeType,
    pins: pecas[0].pins || [],
    motivo: l[9],
    pecas: pecas,
    devolvidoEm: l[11]
  };
}

/**
 * A devolução pra página pública `ajuste.html` — a peça vem embutida em
 * base64, igual à página de aprovação do cliente, pra funcionar sem login
 * nenhum. É isso que faz o link colado no Runrun.it abrir direto.
 *
 * Vídeo não vai embutido (estoura o limite de 25MB do Apps Script): vai o
 * id, e a página usa o player do Drive. Nesse caso os pontos não são
 * desenhados em cima — sobra a lista escrita, que continua valendo.
 */
function buscarDevolucaoPublica(codigo) {
  if (!codigo) return { ok: false, error: 'codigo não informado.' };
  var linhas = getDevolucoesSheet().getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) !== String(codigo)) continue;
    var d = linhaParaDevolucao(linhas[i]);
    // Carrega a imagem de CADA peça do lote — ajuste.html mostra todas,
    // no mesmo estilo em carrossel que a página de aprovação do cliente
    // já usa pra várias peças no mesmo link.
    d.pecas.forEach(function (p) {
      p.ehVideo = String(p.mimeType || '').indexOf('video/') === 0;
      if (!p.ehVideo && p.fileId) {
        var img = buscarImagemCheiaDrive(p.fileId);
        if (img && img.ok) {
          p.base64 = img.base64;
          p.mimeType = img.mimeType || p.mimeType;
        } else {
          // A peça pode ter sido movida/renomeada depois. O pedido não se
          // perde por causa disso — o motivo e a lista de pontos continuam
          // aparecendo, com um aviso no lugar da imagem.
          p.semImagem = true;
        }
      }
    });
    // Compat: os campos singulares espelham a primeira peça, já com a
    // imagem carregada, pra quem só lê o formato antigo.
    var primeira = d.pecas[0];
    if (primeira) {
      d.base64 = primeira.base64;
      d.mimeType = primeira.mimeType;
      d.semImagem = primeira.semImagem;
      d.ehVideo = primeira.ehVideo;
    }
    return { ok: true, devolucao: d };
  }
  return { ok: false, error: 'Esse link de ajuste não existe mais.' };
}

/**
 * A devolução de uma tarefa, pra desenhar DENTRO do card no Colmeia (ver
 * renderDevolucaoNoCard, js/detalhe-alteracao.js). Aceita o id da
 * subtarefa de alteração ou o do card mãe — no caminho do projeto fechado
 * não existe subtarefa, e o pedido fica pendurado no card mãe mesmo.
 *
 * Devolve a mais recente: um card pode acumular várias devoluções ao
 * longo do mês, e a que interessa é sempre a última.
 */
function buscarDevolucaoDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var linhas = getDevolucoesSheet().getDataRange().getValues();
  var achada = null;
  for (var i = 1; i < linhas.length; i++) {
    var d = linhaParaDevolucao(linhas[i]);
    var bate = String(d.taskIdAlteracao) === String(taskId)
      || (!d.taskIdAlteracao && String(d.cardMaeId) === String(taskId));
    if (bate && (!achada || String(d.devolvidoEm) > String(achada.devolvidoEm))) achada = d;
  }
  if (!achada) return { ok: true, devolucao: null };
  achada.pecas.forEach(function (p) { p.ehVideo = String(p.mimeType || '').indexOf('video/') === 0; });
  achada.ehVideo = achada.pecas[0] ? achada.pecas[0].ehVideo : false;
  return { ok: true, devolucao: achada };
}

function regiaoDoPonto(x, y) {
  var vertical = y < 33 ? 'alto' : (y > 66 ? 'baixo' : 'meio');
  var horizontal = x < 33 ? 'à esquerda' : (x > 66 ? 'à direita' : 'ao centro');
  return vertical + ' ' + horizontal;
}

/**
 * A peça saiu de vez da fila de quem confere: o link já foi copiado pra
 * mandar pro cliente (ver apvCopiarLinkCliente, js/pagina-aprovacao.js).
 * Até aqui ela ficava em 'aprovada' de propósito — só sai da fila quando
 * o envio de verdade acontece, não quando só aprova (ver o comentário de
 * listarConferenciasPendentes). Falhar aqui não é grave: na pior das
 * hipóteses a peça continua aparecendo na fila como "aprovada, falta
 * enviar" mesmo já tendo sido mandada — chato, não perigoso.
 */
function marcarConferenciaEnviada(taskId, loteId) {
  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linhas = linhasDoLote(sheet.getDataRange().getValues(), taskId, loteId);
    if (!linhas.length) return { ok: false, error: 'Não achei essa peça na fila de conferência.' };
    linhas.forEach(function (linha) {
      sheet.getRange(linha, 12, 1, 1).setValues([['enviada']]);
    });
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * `nomesPecas` é o caminho de reserva: se por algum motivo o `loteId` não
 * bater com nenhuma linha (ex: um lote antigo, de antes da coluna
 * existir), ainda dá pra achar cada peça pelo nome — melhor que a linha
 * ficar 'pendente' pra sempre depois de já ter sido devolvida de verdade.
 */
function marcarConferenciaDevolvida(taskId, loteId, quem, motivo, nomesPecas) {
  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linhasTodas = sheet.getDataRange().getValues();
    var alvo = linhasDoLote(linhasTodas, taskId, loteId);
    if (!alvo.length && Array.isArray(nomesPecas)) {
      nomesPecas.forEach(function (nome) {
        var linha = acharLinhaDaConferencia(linhasTodas, taskId, nome);
        if (linha && alvo.indexOf(linha) === -1) alvo.push(linha);
      });
    }
    alvo.forEach(function (linha) {
      sheet.getRange(linha, 12, 1, 4).setValues([['devolvida', quem || '', new Date().toISOString(), motivo || '']]);
    });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// O E-MAIL DIÁRIO DA FILA (2026-08-06)
// ---------------------------------------------------------------------
//
// O buraco que isso tapa: o atendimento só descobria que tinha peça
// esperando se abrisse a Central por conta própria, ou se o designer
// lembrasse de clicar "enviar" no comentário rascunhado (que NÃO vai
// sozinho, de propósito). Um portão que trava a produção inteira dependia
// de alguém lembrar de olhar uma tela que não é onde essa pessoa trabalha
// — o atendimento vive no Runrun.it.
//
// Cada pessoa recebe SÓ os clientes dela (decisão do Cláudio, 2026-08-06),
// o mesmo recorte que a Central já faz na tela. O vínculo cliente→
// atendimento é lido do painel-designers-beeon, a MESMA fonte que
// centralClienteEhDoLogado usa no front — nenhum cadastro novo.
//
// ⚠️ LIGAR DEPOIS DE CONFERIR OS E-MAILS: os endereços abaixo são um
// palpite pelo padrão das contas que já existem no projeto
// (claudio@/gustavo@/erick@beeon.com.br). Enquanto EMAIL_FILA_LIGADO for
// false, nada é enviado — a função roda, monta e só registra no log, pra
// dar pra conferir sem mandar e-mail errado pra ninguém.
var EMAIL_FILA_LIGADO = false;

// O único lugar do BACKEND que precisa saber onde o Colmeia está
// publicado. Em todo o resto do app a base vem do front-end de propósito
// (ver ROTA_BASE, js/roteador-url.js) justamente pra não ter endereço
// escrito na mão — mas um e-mail é montado sem ninguém no navegador, então
// aqui não tem de onde tirar. Se o domínio mudar, é ESTE valor que muda.
var COLMEIA_URL_PUBLICA = 'https://colmeia.beeon.com.br/aprovacoes';

var EMAILS_ATENDIMENTO = {
  'Laura': 'laura@beeon.com.br',
  'Manu': 'manu@beeon.com.br',
  'Giovanna': 'giovanna@beeon.com.br',
  'João Paulo': 'joaopaulo@beeon.com.br',
  'Lucas': 'lucas@beeon.com.br',
  'Cláudio': 'claudio@beeon.com.br'
};

// Coordenação vê a fila inteira, igual na Central (souCoordenadorDoAtendimento,
// js/login-boot.js) — mesma lista, escrita aqui porque o backend não
// enxerga o front.
var COORDENACAO_ATENDIMENTO = ['Cláudio', 'João Paulo', 'Lucas'];

/**
 * Manda pra cada pessoa do atendimento o que está esperando conferência
 * dos clientes dela. Roda junto do backup diário.
 *
 * Só manda pra quem TEM alguma coisa esperando: e-mail diário que chega
 * dizendo "nada pra fazer" é o tipo de mensagem que se aprende a ignorar,
 * e aí o dia em que ele importa passa batido junto.
 */
function enviarEmailDiarioDaFila() {
  var fila = listarConferenciasPendentes();
  if (!fila.ok || !fila.itens.length) return { ok: true, enviados: 0 };

  var vinculos = mapaClienteParaAtendimento();
  var enviados = 0;

  for (var nome in EMAILS_ATENDIMENTO) {
    var ehCoordenacao = COORDENACAO_ATENDIMENTO.indexOf(nome) !== -1;
    var meus = fila.itens.filter(function (it) {
      if (ehCoordenacao) return true;
      var dono = vinculos[normalizarNomeParaComparar(it.cliente || '')];
      // Cliente sem vínculo cadastrado aparece pra todo mundo — melhor
      // avisar a mais do que esconder trabalho de verdade por um cadastro
      // que faltou (mesma regra de centralClienteEhDoLogado).
      if (!dono) return true;
      return normalizarNomeParaComparar(dono) === normalizarNomeParaComparar(nome);
    });
    if (!meus.length) continue;

    var assunto = meus.length === 1
      ? '1 peça esperando sua conferência'
      : meus.length + ' peças esperando sua conferência';

    var linhas = meus.map(function (it) {
      var pecas = (it.pecas || []).map(function (p) { return p.nomePeca; }).join(', ');
      var quando = it.prazo ? ' · entrega ' + Utilities.formatDate(new Date(it.prazo), 'America/Sao_Paulo', 'dd/MM') : '';
      return '• ' + (it.cliente || 'Sem cliente') + ' — ' + (pecas || it.tituloTarefa || '') +
             ' (' + (it.designer || 'designer') + ')' + quando;
    }).join('\n');

    var corpo = 'Oi, ' + nome + '!\n\n' + assunto + ':\n\n' + linhas +
      '\n\nPra conferir: ' + COLMEIA_URL_PUBLICA + '\n\n— Colmeia';

    if (!EMAIL_FILA_LIGADO) {
      Logger.log('[e-mail da fila DESLIGADO] iria pra ' + EMAILS_ATENDIMENTO[nome] + ':\n' + corpo);
      continue;
    }
    try {
      MailApp.sendEmail(EMAILS_ATENDIMENTO[nome], assunto, corpo);
      enviados++;
    } catch (e) {
      Logger.log('Não consegui mandar o e-mail da fila pra ' + nome + ': ' + e.message);
    }
  }
  return { ok: true, enviados: enviados };
}

/**
 * cliente (normalizado) -> nome do atendimento, lido do
 * painel-designers-beeon. Mesma fonte que a Central usa no front-end
 * (pdTodosClientesPlano, js/paginas-designers.js) — o painel é indexado por
 * designer, e cada cliente lá dentro traz o campo `atend`.
 */
function mapaClienteParaAtendimento() {
  var mapa = {};
  try {
    // Sem "?tipo=", o painel devolve o estado completo — mesmo caminho que
    // buscarTempoMedioDoPainel (RunrunLeitura.gs) já usa, incluindo o
    // formato da resposta (resposta.data.state).
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL, { muteHttpExceptions: true });
    var resposta = JSON.parse(res.getContentText());
    if (!resposta || !resposta.ok || !resposta.data) return mapa;
    var estado = resposta.data.state || {};
    (resposta.data.designers || Object.keys(estado)).forEach(function (designer) {
      (estado[designer] || []).forEach(function (c) {
        if (c && c.cliente && c.atend) mapa[normalizarNomeParaComparar(c.cliente)] = c.atend;
      });
    });
  } catch (e) {
    // Sem os vínculos, todo mundo recebe a fila inteira — chato, mas
    // melhor do que ninguém receber nada.
    Logger.log('Não consegui ler os vínculos de cliente do painel: ' + e.message);
  }
  return mapa;
}

/**
 * Tira o lote da fila sem aprovar nem devolver (2026-08-06).
 *
 * POR QUE PRECISA EXISTIR: antes disso, quem confere tinha exatamente duas
 * saídas, e as duas mexem em coisa de verdade — aprovar (que prepara o
 * link do cliente) ou pedir alteração (que CRIA uma subtarefa no
 * Runrun.it, aloca alguém e move pra Ajustes). Peça mandada por engano,
 * mandada duas vezes, ou mandada antes de ficar pronta não tinha saída
 * nenhuma: ou se criava lixo no Runrun.it, ou o item ficava encalhado pra
 * sempre na fila (e no contador vermelho), já que o que está `pendente`
 * nunca é podado.
 *
 * NÃO avisa o designer nem escreve nada no Runrun.it — decisão do Cláudio
 * (2026-08-06). O único cuidado que sobra é `buscarConferenciaDaTarefa`
 * ignorar as descartadas, senão o botão do card dele continuaria dizendo
 * "Acessar página de aprovação" apontando pra uma peça que saiu da fila.
 */
function descartarConferencia(taskId, loteId, quem) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linhas = linhasDoLote(sheet.getDataRange().getValues(), taskId, loteId);
    if (!linhas.length) return { ok: false, error: 'Não achei essa peça na fila de conferência.' };
    var agora = new Date().toISOString();
    linhas.forEach(function (linha) {
      sheet.getRange(linha, 12, 1, 3).setValues([['descartada', quem || '', agora]]);
    });
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * O REGISTRO QUE NÃO EVAPORA (2026-08-06).
 *
 * A aba de trabalho (`ConferenciaInterna`) é podada em 30 dias — o que é
 * certo: ela guarda peça, versão, fila, coisas que só importam enquanto o
 * trabalho está acontecendo. Mas junto ia embora a única resposta pra
 * "quem aprovou aquela peça?", que é justamente a pergunta que aparece
 * quando dá problema com o cliente — e quase sempre DEPOIS dos 30 dias.
 *
 * Este arquivo guarda só a DECISÃO (cliente, peça, quem, quando, o quê),
 * sem nada pesado, e nunca é podado. Uma linha por peça decidida, escrita
 * no momento da poda — assim existe um lugar só fazendo isso, e não tem
 * risco de gravar duas vezes a mesma decisão.
 */
function getHistoricoConferenciasSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('HistoricoConferencias');
  if (!sheet) {
    sheet = ss.insertSheet('HistoricoConferencias');
    sheet.getRange('A1:G1').setValues([[
      'taskId', 'cliente', 'tituloTarefa', 'nomePeca', 'decisao', 'quem', 'quando'
    ]]);
  }
  return sheet;
}

/**
 * Poda as linhas já decididas com mais de 30 dias — arquivando a decisão
 * de cada uma antes de apagar. Roda junto do backup diário, mesmo lugar de
 * `limparFeedEventosAntigos`.
 */
function limparConferenciasAntigas() {
  var sheet = getConferenciasSheet();
  var linhas = sheet.getDataRange().getValues();
  var limite = Date.now() - CONFERENCIA_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var paraArquivar = [];
    for (var i = linhas.length - 1; i >= 1; i--) {
      if (String(linhas[i][11]) === 'pendente') continue;
      var quando = Date.parse(linhas[i][13] || linhas[i][10]);
      if (!quando || quando >= limite) continue;

      var l = linhas[i];
      // Descartada não vira histórico: ela não é uma decisão sobre a peça,
      // é "isso não era pra estar na fila" (ver descartarConferencia).
      if (String(l[11]) !== 'descartada') {
        paraArquivar.push([l[0], l[1], l[2], l[3], l[11], l[12] || '', l[13] || l[10] || '']);
      }
      sheet.deleteRow(i + 1);
    }
    if (paraArquivar.length) {
      var hist = getHistoricoConferenciasSheet();
      // Uma escrita só pro bloco inteiro, em vez de appendRow por linha —
      // a poda pode pegar dezenas de linhas de uma vez.
      hist.getRange(hist.getLastRow() + 1, 1, paraArquivar.length, 7).setValues(paraArquivar);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Busca no histórico de decisões — "quem aprovou a peça X do cliente Y?".
 * Sem tela por enquanto: é consulta rara, feita quando dá problema, e
 * rodar à mão no editor do Apps Script resolve. Aceita parte do nome do
 * cliente ou da peça.
 */
function buscarNoHistoricoDeConferencias(termo) {
  var alvo = normalizarNomeParaComparar(termo || '');
  var linhas = getHistoricoConferenciasSheet().getDataRange().getValues();
  var achados = [];
  for (var i = 1; i < linhas.length; i++) {
    var l = linhas[i];
    var tudo = normalizarNomeParaComparar([l[1], l[2], l[3]].join(' '));
    if (alvo && tudo.indexOf(alvo) === -1) continue;
    achados.push({
      taskId: l[0], cliente: l[1], tituloTarefa: l[2], nomePeca: l[3],
      decisao: l[4], quem: l[5], quando: l[6]
    });
  }
  return { ok: true, itens: achados };
}

/**
 * DIAGNÓSTICO — roda à mão no editor do Apps Script.
 *
 * Lista as etapas que o Runrun.it está devolvendo de verdade, com o
 * número de cada uma. Existe porque a busca por NOME falhou em produção e
 * não dá pra descobrir o motivo de fora: pode ser o nome escrito
 * diferente, pode ser o campo vindo vazio na listagem.
 *
 * Como usar: abra o editor do Apps Script, escolha esta função na lista
 * de cima e clique em Executar. Depois abra "Registro de execução" e
 * copie o que apareceu.
 */
function diagnosticoEtapasDoRunrun() {
  Logger.log('=== ETAPAS QUE O RUNRUN.IT DEVOLVE ===');

  // 1) Uma tarefa que o Cláudio confirmou estar em "Aprovação Cliente".
  //    É a resposta mais confiável: vem do endpoint de UMA tarefa, que
  //    devolve o registro completo.
  var exemplo = runrunFetch('/tasks/112696');
  if (exemplo && !exemplo.erroFetch) {
    Logger.log('Tarefa 112696 ("' + (exemplo.title || '?') + '"):');
    Logger.log('  board_stage_name: ' + exemplo.board_stage_name);
    Logger.log('  task_state_name:  ' + exemplo.task_state_name);
    Logger.log('  task_state_id:    ' + exemplo.task_state_id + '   <<< é ESTE número');
    Logger.log('  board_stage_id:   ' + exemplo.board_stage_id);
  } else {
    Logger.log('Não consegui ler a tarefa 112696.');
  }

  // 2) O que a LISTAGEM devolve — é dela que a busca automática depende.
  Logger.log('\n=== Etapas distintas nas tarefas abertas (o que a varredura enxerga) ===');
  var vistas = {};
  for (var pagina = 1; pagina <= 3; pagina++) {
    var lote = runrunFetch('/tasks?is_closed=false&sort=updated_at&sortDir=desc&limit=100&page=' + pagina);
    if (!lote || lote.erroFetch || !lote.length) break;
    for (var i = 0; i < lote.length; i++) {
      var nome = lote[i].board_stage_name || lote[i].task_state_name || '(sem nome)';
      if (!vistas[nome]) vistas[nome] = lote[i].task_state_id;
    }
    if (lote.length < 100) break;
  }
  Object.keys(vistas).forEach(function (nome) {
    Logger.log('  "' + nome + '"  ->  ' + vistas[nome]);
  });
  if (!Object.keys(vistas).length) {
    Logger.log('  NENHUMA. A listagem não está devolvendo nome de etapa — é por isso');
    Logger.log('  que a busca automática falha. Use o número da tarefa 112696 acima.');
  }

  Logger.log('\n=== FIM. Copie TUDO acima e mande pro Claude. ===');
}

// ---------------------------------------------------------------------
// O calendário de postagens da Central (2026-08-08)
// ---------------------------------------------------------------------

/**
 * As tarefas que têm DATA DE PUBLICAÇÃO marcada, pro calendário da aba
 * Hoje da Central do Atendimento.
 *
 * NÃO FAZ NENHUMA CHAMADA NOVA AO RUNRUN.IT. Sai inteiro de
 * `getTarefasColmeia()` (Código.gs), que é a mesma varredura do quadro
 * que já roda em cache pra todo mundo — e que já traz `dataPublicacao`
 * pronta, extraída do campo personalizado do Runrun.it
 * (`extrairDataPublicacaoTarefa`, RunrunLeitura.gs). Uma busca própria
 * aqui seria varrer o Runrun.it de novo pelo mesmo dado.
 *
 * TRÊS FONTES (2026-08-09) — a primeira versão só usava a varredura do
 * quadro, e por isso o calendário mostrava o mês pela metade: a varredura
 * traz só tarefas ABERTAS e joga os cards mãe num balde separado (ver
 * buscarTarefasAbertasSeparadas, RunrunLeitura.gs). Faltavam as duas
 * pontas que mais importam num calendário:
 *
 *   1. ABERTAS — `getTarefasColmeia()`, o que está em produção agora.
 *   2. CARDS MÃE — o guarda-chuva do mês, onde muita data de publicação
 *      está marcada. Sai do MESMO cache que a varredura já preencheu
 *      (CACHE_CARD_MAE_ABERTOS): custo zero de rede.
 *   3. JÁ ENTREGUES E FECHADAS — sem elas, os dias que já passaram
 *      apareciam vazios, como se nada tivesse sido postado. Essa é a
 *      única que custa: é uma varredura própria das tarefas fechadas
 *      (`buscarPostagensFechadas` logo abaixo).
 *
 * Por causa da (3), o resultado inteiro fica CACHEADO por
 * CALENDARIO_CACHE_SEGUNDOS. Um calendário do mês não precisa da mesma
 * pressa do quadro (que atualiza a cada ~45s): a troco de alguns minutos
 * de atraso numa data recém-mudada, ninguém paga a varredura de novo ao
 * abrir a Central. `invalidarCacheDoQuadro` (Código.gs) limpa junto.
 *
 * Devolve a lista crua, sem agrupar por dia: quem monta o mês é o
 * front-end, que já sabe qual mês está na tela e não precisa pedir de
 * novo pra virar a página do calendário.
 */
var CALENDARIO_CACHE_CHAVE = 'calendarioPostagens';
var CALENDARIO_CACHE_SEGUNDOS = 600;   // 10 min

// Quanto tempo pra trás olhar nas tarefas JÁ FECHADAS. 45 dias cobre o mês
// na tela e o anterior inteiro — que é até onde as setas do calendário
// costumam ir. Mais que isso vira varredura cara por um dia que ninguém
// olha. (A janela é sobre `updated_at`, o único campo pelo qual o
// Runrun.it deixa ordenar — ver o comentário de buscarExtrasRunrunCompleto.)
var CALENDARIO_JANELA_FECHADAS_MS = 45 * 24 * 60 * 60 * 1000;

// Teto de leituras avulsas de card mãe (uma por mãe que não apareceu na
// varredura — ver o resgate dentro de calendarioDePostagens). Cada uma é
// uma ida ao Runrun.it; o teto é o que impede um mês atípico de virar
// cem chamadas. Como o calendário inteiro fica em cache, na prática isso
// é pago uma vez a cada CALENDARIO_CACHE_SEGUNDOS.
var CALENDARIO_MAX_MAES_AVULSAS = 40;

function calendarioDePostagens() {
  var cache = CacheService.getScriptCache();
  try {
    var pronto = cache.get(CALENDARIO_CACHE_CHAVE);
    if (pronto) return { ok: true, postagens: JSON.parse(pronto), doCache: true };
  } catch (e) { /* cache indisponível: monta na mão */ }

  var tarefas;
  try {
    tarefas = getTarefasColmeia();
  } catch (e) {
    return { ok: false, error: 'Não consegui ler as tarefas agora.' };
  }

  // ── Junta tudo num monte só, sem decidir nada ainda ──────────────────
  var todas = [];
  var porId = {};
  function empilhar(lista, ehCardMae, ehFechada) {
    if (!lista || !lista.length) return;
    for (var i = 0; i < lista.length; i++) {
      var t = lista[i];
      if (!t || !t.id || porId[t.id]) continue;
      t._cardMae = !!ehCardMae;
      t._fechada = ehFechada || !!t.entregue;
      porId[t.id] = t;
      todas.push(t);
    }
  }
  empilhar(tarefas, false, false);
  empilhar(cardMaeAbertosDoCache(), true, false);
  empilhar(buscarPostagensFechadas(), false, true);

  // ── Filhas por mãe ───────────────────────────────────────────────────
  var filhasPorMae = {};
  for (var f = 0; f < todas.length; f++) {
    var pai = todas[f].parentTaskId;
    if (!pai) continue;
    (filhasPorMae[pai] = filhasPorMae[pai] || []).push(todas[f]);
  }

  // ── Quem é PEÇA: quem tem data de publicação ─────────────────────────
  // Mais as mães que não vieram na varredura (não estão alocadas a
  // nenhum dos designers varridos, então nenhuma lista as trouxe) mas
  // são o pai de alguma subtarefa que veio. Sem esse resgate, a peça
  // inteira ficaria de fora do calendário — que é exatamente o buraco
  // que a data morar na mãe cria.
  var pecas = [];
  for (var i = 0; i < todas.length; i++) {
    if (todas[i].dataPublicacao) pecas.push(todas[i]);
  }

  var maesQueFaltam = [];
  var jaPedida = {};
  for (var s = 0; s < todas.length; s++) {
    var idPai = todas[s].parentTaskId;
    if (!idPai || porId[idPai] || jaPedida[idPai]) continue;
    jaPedida[idPai] = true;
    maesQueFaltam.push(idPai);
  }
  // ⚠️ Em PARALELO (runrunFetchAll), não uma de cada vez: eram até 40
  // idas ao Runrun.it em fila indiana, e só isso já estourava o prazo da
  // chamada — o calendário abria vazio sem dizer por quê.
  var caminhosDasMaes = maesQueFaltam
    .slice(0, CALENDARIO_MAX_MAES_AVULSAS)
    .map(function (idMae) { return '/tasks/' + idMae; });
  var maesCruas = caminhosDasMaes.length ? runrunFetchAll(caminhosDasMaes) : [];
  for (var m = 0; m < maesCruas.length; m++) {
    var crua = maesCruas[m];
    if (!crua || crua.erroFetch || !extrairDataPublicacaoTarefa(crua)) continue;
    var mae = transformarTarefaParaColmeia(crua);
    mae._cardMae = true;
    mae._fechada = !!mae.entregue;
    porId[mae.id] = mae;
    pecas.push(mae);
  }

  // ── Cada peça vira uma linha, puxando da subtarefa o que só ela tem ──
  var postagens = [];
  var jaEntrou = {};
  for (var p = 0; p < pecas.length; p++) {
    var peca = pecas[p];
    if (jaEntrou[peca.id]) continue;

    // Subtarefa cuja MÃE também é peça não vira linha própria: senão a
    // mesma peça apareceria duas (ou quatro) vezes no mesmo dia, uma por
    // etapa do fluxo.
    if (peca.parentTaskId && porId[peca.parentTaskId] && porId[peca.parentTaskId].dataPublicacao) continue;

    jaEntrou[peca.id] = true;
    var filhas = filhasPorMae[peca.id] || [];

    // ENTREGA DESEJADA: a da subtarefa, não a da mãe. A mãe é o
    // guarda-chuva (o prazo dela costuma ser o do cliente, ou nem existe);
    // quem tem a data de quando a peça fica PRONTA é a tarefa do designer.
    // Com mais de uma etapa aberta, vale a MAIS TARDE: é quando a peça
    // realmente termina.
    var entrega = peca.due || null;
    var designer = '';
    var etapa = peca.runrunStage || '';
    for (var k = 0; k < filhas.length; k++) {
      var filha = filhas[k];
      if (filha.due && (!entrega || filha.due > entrega)) entrega = filha.due;
      // Prefere quem ainda está com a peça na mão; sem ninguém aberto,
      // fica o último que passou por ela.
      if (!filha._fechada) { designer = filha.assignee || designer; etapa = filha.runrunStage || etapa; }
      else if (!designer) designer = filha.assignee || '';
    }
    if (!designer) designer = peca.assignee || '';

    // ENTREGUE: com subtarefas, a peça só está pronta quando TODAS
    // fecharam — uma etapa aberta significa que ainda tem trabalho.
    var entregue = filhas.length
      ? filhas.every(function (x) { return x._fechada; })
      : !!peca._fechada;

    postagens.push({
      id: peca.id,
      titulo: peca.title || '',
      cliente: peca.client || '',
      designer: designer,
      // "AAAA-MM-DD" — já vem cortado assim de extrairDataPublicacaoTarefa.
      publicacao: String(peca.dataPublicacao).substring(0, 10),
      // Os dois prazos juntos são o que responde "dá tempo?": publicar dia
      // 10 com entrega dia 12 é um problema que só se enxerga vendo os
      // dois lado a lado.
      entrega: entrega,
      etapa: etapa,
      entregue: entregue,
      fechada: !!peca._fechada,
      cardMae: !!peca._cardMae,
      // Quantas etapas a peça tem no Runrun.it — é o que explica, na
      // caixinha do dia, por que uma peça "com 3 subtarefas" ainda não
      // está pronta mesmo com duas delas fechadas.
      etapasAbertas: filhas.filter(function (x) { return !x._fechada; }).length,
      etapasTotal: filhas.length,
      link: peca.link || ''
    });
  }

  try {
    cache.put(CALENDARIO_CACHE_CHAVE, JSON.stringify(postagens), CALENDARIO_CACHE_SEGUNDOS);
  } catch (e) { /* passou do tamanho do cache: só não guarda */ }

  return { ok: true, postagens: postagens };
}

/**
 * Os cards mãe abertos, do cache que a varredura do quadro já deixa
 * pronto (mesmo caminho de buscarExtrasRunrunCompleto). Só cai na
 * varredura própria se o cache estiver frio.
 */
function cardMaeAbertosDoCache() {
  try {
    var cacheado = CacheService.getScriptCache().get(CACHE_CARD_MAE_ABERTOS);
    if (cacheado) return JSON.parse(cacheado);
  } catch (e) { /* segue pro caminho lento */ }
  try {
    return buscarTarefasAbertasSeparadas().cardMae;
  } catch (e) {
    return [];
  }
}

/**
 * As tarefas JÁ FECHADAS dos últimos CALENDARIO_JANELA_FECHADAS_MS.
 *
 * Mesmo padrão de buscarExtrasRunrunCompleto (RunrunLeitura.gs), e pelo
 * mesmo motivo: o Runrun.it não tem filtro de data na API de tarefas,
 * então se pede ordenado por `updated_at` decrescente e para de virar
 * página assim que a primeira tarefa fora da janela aparece.
 *
 * Diferente de lá, aqui os cards mãe fechados ENTRAM: é o guarda-chuva do
 * mês, e ele fechar não apaga o que foi postado. Uma falha de rede no meio
 * devolve o que já deu — o calendário fica incompleto no passado, nunca
 * quebrado.
 */
function buscarPostagensFechadas() {
  var fechadas = [];
  var idsPorEmail;
  try {
    idsPorEmail = buscarIdsResponsaveisRunrun();
  } catch (e) {
    return fechadas;
  }
  var corte = Date.now() - CALENDARIO_JANELA_FECHADAS_MS;
  var contexto = contextoDosPaineis();

  // ⚠️ Uma RODADA por página, com os designers em paralelo — o mesmo
  // padrão de buscarTarefasAbertasSeparadas (RunrunLeitura.gs), e pelo
  // mesmo motivo: em fila indiana isso era até 15 idas seguidas ao
  // Runrun.it, o suficiente pra estourar o prazo da chamada sozinho.
  // Quem "saiu da janela" (ou veio com página curta) não entra na
  // rodada seguinte.
  var ativos = [];
  Object.keys(RUNRUN_USUARIOS).forEach(function (email) {
    if (idsPorEmail[email]) {
      ativos.push({ nome: RUNRUN_USUARIOS[email], id: idsPorEmail[email] });
    }
  });

  for (var pagina = 1; pagina <= 5 && ativos.length; pagina++) {
    var caminhos = ativos.map(function (d) {
      return '/tasks?responsible_id=' + encodeURIComponent(d.id) +
        '&is_closed=true&sort=updated_at&sortDir=desc&limit=100&page=' + pagina;
    });
    var lotes = runrunFetchAll(caminhos);
    var seguem = [];

    for (var d = 0; d < ativos.length; d++) {
      var lote = lotes[d];
      if (!Array.isArray(lote) || lote.length === 0) continue;

      var saiuDaJanela = false;
      for (var i = 0; i < lote.length; i++) {
        var t = lote[i];
        var atualizadoEm = t.updated_at ? new Date(t.updated_at).getTime() : 0;
        if (atualizadoEm < corte) { saiuDaJanela = true; break; }
        // Só o que tem data de publicação interessa aqui — o resto seria
        // transformar tarefa à toa (transformarTarefaParaColmeia não é de
        // graça, roda pra cada uma).
        if (!extrairDataPublicacaoTarefa(t)) continue;
        fechadas.push(transformarTarefaParaColmeia(t, ativos[d].nome, contexto));
      }
      if (!saiuDaJanela && lote.length >= 100) seguem.push(ativos[d]);
    }
    ativos = seguem;
  }

  return fechadas;
}
