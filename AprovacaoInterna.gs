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
  var linhas = sheet.getDataRange().getValues();
  var itens = [];
  var cachePastas = {};

  for (var i = 1; i < linhas.length; i++) {
    var l = linhas[i];
    var status = String(l[11]);
    if (status !== 'pendente' && status !== 'aprovada') continue;

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
      // `versaoPedida` 0 significa "não sei" (linha antiga, célula vazia),
      // não "versão zero" — e nesse caso QUALQUER arquivo na pasta parecia
      // versão nova, acendendo o aviso pra sempre numa peça em que ninguém
      // tinha subido nada. Sem saber, não avisa.
      temVersaoNova: versaoPedida > 0 && versaoAtual > versaoPedida,
      // A peça sumiu da pasta depois do pedido (renomeada, movida,
      // apagada). Some da fila silenciosamente seria pior: quem pediu a
      // conferência acha que ela está na fila, e não está mais.
      arquivoSumiu: !ultima,
      pedidoEm: l[10],
      // 'pendente' = ainda não conferida; 'aprovada' = já aprovada
      // internamente, falta só mandar pro cliente (ver o comentário da
      // função). O card da fila usa isso pra badge diferente e pra pular
      // direto pro painel de envio ao reabrir.
      status: status,
      aprovadoPor: status === 'aprovada' ? l[12] : ''
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
    var atual = {
      // O id de quem REALMENTE tem a conferência — é pra ele que o link do
      // botão precisa apontar, não pro card que está aberto agora.
      taskId: String(linhas[i][0]),
      nomePeca: linhas[i][3],
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

  // Se essa peça já foi aprovada internamente (ou já está pendente há um
  // tempo), a tela precisa saber pra abrir no painel certo — sem isso, dar
  // F5 depois de aprovar (mas antes de mandar pro cliente) jogava a pessoa
  // de volta pro painel "o que foi pedido", como se a aprovação não tivesse
  // acontecido (era exatamente isso, e não outra coisa, que tinha sido
  // salvo — só a TELA que esquecia).
  var linhaConferencia = acharLinhaDaConferencia(getConferenciasSheet().getDataRange().getValues(), taskId, peca.nomePeca);
  var statusConferencia = 'pendente';
  var aprovadoPor = '';
  var aprovadoEm = '';
  if (linhaConferencia) {
    var valoresLinha = getConferenciasSheet().getRange(linhaConferencia, 1, 1, 15).getValues()[0];
    statusConferencia = String(valoresLinha[11]) || 'pendente';
    aprovadoPor = valoresLinha[12] || '';
    aprovadoEm = valoresLinha[13] || '';
  }

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
    // A pasta do card no Drive. Quem confere às vezes precisa ver o
    // arquivo de verdade (abrir em tamanho real, olhar as outras peças,
    // conferir o que mais tem lá) — e sem isso a única saída era pedir o
    // link pro designer. `listarVersoesDasPecas` já sabia a pasta; só não
    // estava contando.
    pastaUrl: lista.pastaUrl || '',
    peca: peca,
    outrasPecas: lista.pecas.filter(function (p) { return p.nomePeca !== peca.nomePeca; }),
    statusConferencia: statusConferencia,
    aprovadoPor: aprovadoPor,
    aprovadoEm: aprovadoEm
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
// O briefing da conferência: o que foi pedido, juntando os dois cards
// ---------------------------------------------------------------------

var BRIEFING_CONFERENCIA_VERSAO = 'conf-v1';

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
 *   - COPY: os textos que têm que aparecer na peça, pra bater com o que
 *     está na arte, palavra por palavra.
 *   - O RESTO do que foi pedido.
 *
 * E quando a peça é uma ALTERAÇÃO, o que mudar entra em separado — não
 * misturado com o pedido original, porque são coisas diferentes: o pedido
 * original já foi atendido, o que está em jogo é a mudança.
 *
 * Mesma disciplina do resto da Bee: cada item aponta a mensagem de onde
 * saiu, e item sem fonte válida é descartado — é o sintoma de a IA ter
 * inventado o item junto com a fonte.
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
    '- Português do Brasil, frases curtas, tom de colega. Sem "olá", sem emoji.\n\n' +
    'SEPARE EM TRÊS COISAS:\n' +
    '- "formato": tamanho, dimensões, proporção ou onde a peça vai ser publicada ' +
    '(ex: "1080x1350, feed", "Reels 9:16 até 20s"). "" se não estiver escrito.\n' +
    '- "copy": os TEXTOS que têm que aparecer na peça (chamada, oferta, telefone, ' +
    'condição). Copie a palavra exata quando estiver escrita. Lista vazia se não houver.\n' +
    '- "itens": o resto do que foi pedido.\n' +
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

  var briefing = {
    formato: String(dados.formato || ''),
    copy: limpar(dados.copy, true),
    itens: limpar(dados.itens, true),
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

  // ATALHO DIRETO: a propriedade de script STAGE_ID_APROVACAO_CLIENTE, se
  // existir, ganha de tudo. A varredura por nome é conveniente mas depende
  // de o Runrun.it devolver o nome da etapa na listagem — e quando isso
  // falha, não há nada que o Cláudio possa fazer sozinho. Com a
  // propriedade, ele resolve na hora, sem depender de deploy nem de mim.
  // Ver diagnosticoEtapasDoRunrun() logo abaixo pra descobrir o número.
  if (alvos.indexOf(normalizarNomeDeEtapa(ETAPA_APROVACAO_CLIENTE)) !== -1) {
    var fixo = PropertiesService.getScriptProperties().getProperty('STAGE_ID_APROVACAO_CLIENTE');
    if (fixo) return String(fixo).trim();
  }

  var chaveCache = 'colmeia_etapa_id_' + alvos[0];
  var cache = CacheService.getScriptCache();
  var guardado = cache.get(chaveCache);
  if (guardado) return guardado;
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

/**
 * A peça saiu de vez da fila de quem confere: o link já foi copiado pra
 * mandar pro cliente (ver apvCopiarLinkCliente, js/pagina-aprovacao.js).
 * Até aqui ela ficava em 'aprovada' de propósito — só sai da fila quando
 * o envio de verdade acontece, não quando só aprova (ver o comentário de
 * listarConferenciasPendentes). Falhar aqui não é grave: na pior das
 * hipóteses a peça continua aparecendo na fila como "aprovada, falta
 * enviar" mesmo já tendo sido mandada — chato, não perigoso.
 */
function marcarConferenciaEnviada(taskId, nomePeca) {
  var sheet = getConferenciasSheet();
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var linha = acharLinhaDaConferencia(sheet.getDataRange().getValues(), taskId, nomePeca);
    if (!linha) return { ok: false, error: 'Não achei essa peça na fila de conferência.' };
    sheet.getRange(linha, 12, 1, 1).setValues([['enviada']]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
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
