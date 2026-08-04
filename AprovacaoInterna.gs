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
    sheet.getRange('A1:O1').setValues([[
      'task_id', 'cliente', 'titulo_tarefa', 'nome_peca', 'designer', 'designer_id',
      'file_id', 'nome_arquivo', 'mime_type', 'versao_pedida',
      'pedido_em', 'status', 'decidido_por', 'decidido_em', 'motivo'
    ]]);
  }
  return sheet;
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
    if (tipo.indexOf('image/') !== 0 && tipo.indexOf('video/') !== 0) continue;
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

  var lista = listarVersoesDasPecas(dados.taskId);
  if (!lista.ok) return lista;
  if (!lista.pecas.length) {
    return { ok: false, error: 'Não encontrei nenhuma imagem ou vídeo na pasta do card pra mandar pra conferência.' };
  }

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
    var criadas = [];

    alvos.forEach(function (peca) {
      var ultima = peca.ultima;
      var valores = [
        String(dados.taskId), dados.cliente || '', dados.tituloTarefa || '', peca.nomePeca,
        dados.designer || '', dados.designerId || '',
        ultima.fileId, ultima.nome, ultima.mimeType, ultima.versao === null ? ultima.ordem : ultima.versao,
        agora, 'pendente', '', '', ''
      ];
      var existente = acharLinhaDaConferencia(linhas, dados.taskId, peca.nomePeca);
      if (existente) sheet.getRange(existente, 1, 1, valores.length).setValues([valores]);
      else sheet.appendRow(valores);
      criadas.push(peca.nomePeca);
    });

    return { ok: true, pecas: criadas };
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
 * A fila do atendimento: o que está esperando conferência.
 *
 * Lê o Drive de cada peça pra saber se chegou versão nova DEPOIS do
 * pedido — é o `temVersaoNova` que acende o aviso no card da fila e, mais
 * pra frente, dispara a única interrupção do fluxo (ver apvAprovar no
 * front-end). Isso custa uma leitura de pasta por peça, o que é aceitável
 * numa fila de 10 a 20 itens e NÃO está no caminho da varredura do quadro.
 */
function listarConferenciasPendentes() {
  var sheet = getConferenciasSheet();
  var linhas = sheet.getDataRange().getValues();
  var itens = [];
  var cachePastas = {};

  for (var i = 1; i < linhas.length; i++) {
    var l = linhas[i];
    if (String(l[11]) !== 'pendente') continue;

    var taskId = String(l[0]);
    var nomePeca = String(l[3]);
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

    itens.push({
      taskId: taskId,
      cliente: l[1],
      tituloTarefa: l[2],
      nomePeca: nomePeca,
      designer: l[4],
      designerId: l[5],
      fileId: ultima ? ultima.fileId : l[6],
      nomeArquivo: ultima ? ultima.nome : l[7],
      mimeType: ultima ? ultima.mimeType : l[8],
      versaoPedida: versaoPedida,
      versaoAtual: versaoAtual,
      totalVersoes: atual ? atual.versoes.length : 1,
      temVersaoNova: versaoAtual > versaoPedida,
      // A peça sumiu da pasta depois do pedido (renomeada, movida,
      // apagada). Some da fila silenciosamente seria pior: quem pediu a
      // conferência acha que ela está na fila, e não está mais.
      arquivoSumiu: !ultima,
      pedidoEm: l[10]
    });
  }

  itens.sort(function (a, b) { return String(a.pedidoEm).localeCompare(String(b.pedidoEm)); });
  return { ok: true, itens: itens };
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
function buscarConferenciaDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var linhas = getConferenciasSheet().getDataRange().getValues();
  var achada = null;
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) !== String(taskId)) continue;
    var atual = { nomePeca: linhas[i][3], status: linhas[i][11], pedidoEm: linhas[i][10] };
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
function dadosDaConferencia(taskId, nomePeca) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var tarefa = runrunFetch('/tasks/' + taskId);
  if (!tarefa || tarefa.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.', runrunFora: runrunPareceForaDoAr() };
  }

  var lista = listarVersoesDasPecas(taskId);
  if (!lista.ok) return lista;

  var peca = null;
  for (var i = 0; i < lista.pecas.length; i++) {
    if (!nomePeca || lista.pecas[i].nomePeca === nomePeca) { peca = lista.pecas[i]; break; }
  }
  if (!peca) return { ok: false, error: 'Não achei essa peça na pasta do card. Ela pode ter sido movida ou renomeada.' };

  var cardMaeId = tarefa.parent_task_id || null;
  var projetoFechado = projetoDaTarefaEstaFechado(tarefa);

  return {
    ok: true,
    taskId: String(taskId),
    titulo: tarefa.title || '',
    cliente: tarefa.client_name || '',
    descricao: tarefa.description || '',
    prazo: tarefa.desired_date || null,
    designer: tarefa.responsible_name || '',
    designerId: tarefa.user_id || '',
    cardMaeId: cardMaeId,
    cardMaeLink: cardMaeId ? 'https://runrun.it/tasks/' + cardMaeId : '',
    projetoFechado: projetoFechado,
    peca: peca,
    outrasPecas: lista.pecas.filter(function (p) { return p.nomePeca !== peca.nomePeca; })
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
function aprovarInternamente(taskId, nomePeca, aprovadoPor) {
  if (!taskId || !aprovadoPor) return { ok: false, error: 'taskId ou quem aprovou não informado.' };

  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linha = acharLinhaDaConferencia(sheet.getDataRange().getValues(), taskId, nomePeca);
    if (!linha) return { ok: false, error: 'Não achei essa peça na fila de conferência.' };
    var agora = new Date().toISOString();
    sheet.getRange(linha, 12, 1, 3).setValues([['aprovada', aprovadoPor, agora]]);
    return { ok: true, aprovadoPor: aprovadoPor, aprovadoEm: agora };
  } finally {
    lock.releaseLock();
  }
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
  var designerId = dados.designerId || tarefa.user_id || '';

  var fechado = projetoDaTarefaEstaFechado(tarefa);

  // Guarda a devolução ANTES de escrever no Runrun.it: é dela que sai o
  // link, e o link precisa estar dentro do texto que vai ser escrito.
  var codigo = gravarDevolucao({
    taskIdOrigem: taskId,
    cardMaeId: cardMaeId,
    cliente: dados.cliente || tarefa.client_name || '',
    nomePeca: dados.nomePeca || '',
    fileId: dados.fileId || '',
    nomeArquivo: dados.nomeArquivo || '',
    mimeType: dados.mimeType || '',
    motivo: motivo,
    pins: dados.pins || []
  });

  var textoPins = textoDosPins(dados.pins);
  var corpo = motivo + (textoPins ? '\n\n' + textoPins : '');

  // O LINK que abre a peça com os pontos desenhados em cima. Só a
  // interface sabe em que endereço o Colmeia está publicado hoje (mesmo
  // motivo de gerarLinkDeAprovacao), então a base vem de lá — sem ela, o
  // pedido ainda funciona, só sem o link.
  if (Array.isArray(dados.pins) && dados.pins.length && dados.baseUrl) {
    corpo += '\n\nVer os pontos marcados na peça: ' + dados.baseUrl + 'ajuste.html?codigo=' + codigo;
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

    marcarConferenciaDevolvida(taskId, dados.nomePeca, dados.autorNome, motivo);
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
  var criada = criarTarefaRunrun({
    titulo: 'Alteração V' + numero + ' — ' + (dados.nomePeca || tarefa.title || ''),
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

  marcarConferenciaDevolvida(taskId, dados.nomePeca, dados.autorNome, motivo);
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

// ---------------------------------------------------------------------
// A devolução guardada: é o que faz os pinos sobreviverem à ida pro
// Runrun.it, onde marcação em imagem não existe
// ---------------------------------------------------------------------

function getDevolucoesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Devolucoes');
  if (!sheet) {
    sheet = ss.insertSheet('Devolucoes');
    sheet.getRange('A1:L1').setValues([[
      'codigo', 'task_id_alteracao', 'task_id_origem', 'card_mae_id', 'cliente',
      'nome_peca', 'file_id', 'nome_arquivo', 'mime_type', 'motivo', 'pins', 'devolvido_em'
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
    sheet.appendRow([
      codigo,
      dados.taskIdAlteracao || '',
      dados.taskIdOrigem || '',
      dados.cardMaeId || '',
      dados.cliente || '',
      dados.nomePeca || '',
      dados.fileId || '',
      dados.nomeArquivo || '',
      dados.mimeType || '',
      dados.motivo || '',
      JSON.stringify(dados.pins || []),
      new Date().toISOString()
    ]);
  } finally {
    lock.releaseLock();
  }
  return codigo;
}

function linhaParaDevolucao(l) {
  var pins = [];
  try { pins = JSON.parse(l[10] || '[]'); } catch (e) { pins = []; }
  return {
    codigo: l[0],
    taskIdAlteracao: String(l[1] || ''),
    taskIdOrigem: String(l[2] || ''),
    cardMaeId: String(l[3] || ''),
    cliente: l[4],
    nomePeca: l[5],
    fileId: l[6],
    nomeArquivo: l[7],
    mimeType: l[8],
    motivo: l[9],
    pins: pins,
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
    var ehVideo = String(d.mimeType || '').indexOf('video/') === 0;
    if (!ehVideo && d.fileId) {
      var img = buscarImagemCheiaDrive(d.fileId);
      if (img && img.ok) {
        d.base64 = img.base64;
        d.mimeType = img.mimeType || d.mimeType;
      } else {
        // A peça pode ter sido movida/renomeada depois. O pedido não se
        // perde por causa disso — o motivo e a lista de pontos continuam
        // aparecendo, com um aviso no lugar da imagem.
        d.semImagem = true;
      }
    }
    d.ehVideo = ehVideo;
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
  achada.ehVideo = String(achada.mimeType || '').indexOf('video/') === 0;
  return { ok: true, devolucao: achada };
}

function regiaoDoPonto(x, y) {
  var vertical = y < 33 ? 'alto' : (y > 66 ? 'baixo' : 'meio');
  var horizontal = x < 33 ? 'à esquerda' : (x > 66 ? 'à direita' : 'ao centro');
  return vertical + ' ' + horizontal;
}

function marcarConferenciaDevolvida(taskId, nomePeca, quem, motivo) {
  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linha = acharLinhaDaConferencia(sheet.getDataRange().getValues(), taskId, nomePeca);
    if (!linha) return;
    sheet.getRange(linha, 12, 1, 4).setValues([['devolvida', quem || '', new Date().toISOString(), motivo || '']]);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Poda as linhas já decididas com mais de 30 dias. Roda junto do backup
 * diário, mesmo lugar de `limparFeedEventosAntigos`.
 */
function limparConferenciasAntigas() {
  var sheet = getConferenciasSheet();
  var linhas = sheet.getDataRange().getValues();
  var limite = Date.now() - CONFERENCIA_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    for (var i = linhas.length - 1; i >= 1; i--) {
      if (String(linhas[i][11]) === 'pendente') continue;
      var quando = Date.parse(linhas[i][13] || linhas[i][10]);
      if (quando && quando < limite) sheet.deleteRow(i + 1);
    }
  } finally {
    lock.releaseLock();
  }
}
