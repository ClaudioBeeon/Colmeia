/**
 * Tudo que lê e grava na planilha (o "banco de dados" do Colmeia): links
 * de clientes, pastas de cards já criadas, avisos, clientes ocultos, login,
 * pessoas, prioridades e o log de plays.
 *
 * Toda gravação passa por pegarTravaDaPlanilha (a primeira função daqui) —
 * é o que evita duas gravações se atropelarem.
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
// ============ PESSOAS ============

// ============ LINKS DE CLIENTES ============

function getLinksClientesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('LinksClientes');
  if (!sheet) {
    sheet = ss.insertSheet('LinksClientes');
    sheet.getRange('A1:J1').setValues([['cliente', 'drive', 'bancoImagens', 'bibliotecaAdobe', 'pastaPublicacoes', 'extras', 'pastaDriveVinculada', 'descricao', 'aliases', 'sigla']]);
  }
  // Planilhas criadas antes desses recursos não têm as colunas I/J — são
  // criadas sozinhas na primeira vez que alguém salvar/ler depois desta
  // versão. `sigla` (coluna J) entrou em 2026-08-08 com o link curto de
  // aprovação (ver montarCodigoDeAprovacao, Aprovacao.gs): vazia significa
  // "usa a sigla automática", não "cliente sem sigla".
  if (sheet.getLastColumn() < 9) {
    sheet.getRange(1, 9).setValue('aliases');
  }
  if (sheet.getLastColumn() < 10) {
    sheet.getRange(1, 10).setValue('sigla');
  }
  return sheet;
}

// ============ PASTAS DE CARDS JÁ CRIADAS (cache — evita re-perguntar toda vez) ============
// Guarda numa aba própria "PastasCards": task_id -> url da pasta do
// Drive criada pra ela. Serve pra: (1) o botão "Criar pasta do card"
// já abrir direto como "Acessar pasta" sem pedir confirmação de novo
// quando a pessoa reabre a tarefa; (2) achar rapidinho a pasta certa
// pra checar uploads recentes, sem precisar procurar por nome de novo.

/**
 * Pega a "trava" de escrita da planilha — ou avisa alto e claro que não
 * conseguiu.
 *
 * Antes, todos os pontos de gravação chamavam lock.tryLock(5000) e
 * IGNORAVAM a resposta: se a trava não viesse em 5 segundos, o código
 * escrevia na planilha do mesmo jeito, e duas gravações simultâneas podiam
 * se atropelar (uma sobrescrevendo a linha da outra). Agora, se não
 * conseguir, o erro sobe até handleRequest e o Colmeia mostra "não
 * consegui salvar" — bem melhor do que salvar torto em silêncio.
 */
function pegarTravaDaPlanilha(lock) {
  if (!lock.tryLock(15000)) {
    throw new Error('A planilha está ocupada com outra gravação agora. Tenta de novo em alguns segundos.');
  }
}

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
  pegarTravaDaPlanilha(lock);
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

/**
 * Painel "Acesso rápido": cada designer tem seus próprios links (Drive,
 * planilhas, ferramentas do dia a dia), mas o Cláudio (coordenador) pode
 * fixar alguns que aparecem pra TODO MUNDO e ninguém além dele consegue
 * apagar. Guardado numa aba própria, uma linha por acesso — coluna
 * "Designer" fica vazia pros fixos (não pertencem a uma pessoa só).
 */
function getAcessoRapidoSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('AcessoRapido');
  if (!sheet) {
    sheet = ss.insertSheet('AcessoRapido');
    sheet.appendRow(['ID', 'Designer', 'Nome', 'Link', 'CorFundo', 'CorTexto', 'Fixo', 'CriadoEm']);
  }
  return sheet;
}

// Só o coordenador pode criar/apagar um acesso FIXO — mesmo padrão
// "confia no nome que o front manda" já usado no resto do backend
// (o Colmeia é uma ferramenta interna, não tem usuário mal-intencionado
// pra se preocupar em travar de verdade contra isso).
function ehCoordenador(designer) {
  return !!designer && designer.toString().toLowerCase().trim() === 'cláudio';
}

function listarAcessoRapido(designer) {
  var sheet = getAcessoRapidoSheet();
  var dados = sheet.getDataRange().getValues();
  var alvo = (designer || '').toLowerCase().trim();
  var acessos = [];
  for (var i = 1; i < dados.length; i++) {
    if (!dados[i][0]) continue;
    var fixo = dados[i][6] === true || dados[i][6] === 'TRUE';
    var dono = (dados[i][1] || '').toString();
    if (!fixo && dono.toLowerCase().trim() !== alvo) continue; // acesso pessoal de outra pessoa — não mostra
    acessos.push({
      id: dados[i][0],
      designer: dono,
      nome: dados[i][2],
      link: dados[i][3],
      corFundo: corHexValida(dados[i][4], '#16181D'),
      corTexto: corHexValida(dados[i][5], '#FFFFFF'),
      fixo: fixo,
      criadoEm: dados[i][7]
    });
  }
  // Fixos primeiro (são os do coordenador, servem de referência pra
  // todo mundo), depois os pessoais na ordem em que foram criados.
  acessos.sort(function (a, b) {
    if (a.fixo !== b.fixo) return a.fixo ? -1 : 1;
    return (a.criadoEm || 0) - (b.criadoEm || 0);
  });
  return { ok: true, acessos: acessos };
}

// A cor entra no HTML da página (atributo `style` do cartãozinho), então
// só pode ser exatamente uma cor hexadecimal — qualquer outra coisa é
// descartada e vira o padrão. Sem isso, um valor estranho gravado na
// planilha escaparia do atributo e injetaria HTML na tela de todo mundo.
function corHexValida(valor, padrao) {
  var texto = (valor || '').toString().trim();
  return /^#[0-9A-Fa-f]{6}$/.test(texto) ? texto : padrao;
}

function salvarAcessoRapido(designer, dados) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  dados = dados || {};
  var nome = (dados.nome || '').toString().trim();
  var link = (dados.link || '').toString().trim();
  if (!nome || !link) return { ok: false, error: 'Preenche o nome e o link.' };
  // Só completa com "https://" quando não tem NENHUM protocolo — antes
  // só aceitava http/https, então um link de abrir programa direto
  // (ex: "adbps:///", "premierepro://") virava "https://adbps:///" (o
  // endereço de verdade ficava colado atrás de um https:// que não
  // devia estar ali, e o navegador não sabia mais abrir). Qualquer
  // "algumacoisa://" já é um protocolo válido e passa direto.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(link)) link = 'https://' + link;
  var fixo = !!dados.fixo;
  if (fixo && !ehCoordenador(designer)) {
    return { ok: false, error: 'Só o coordenador pode criar um acesso fixo.' };
  }
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getAcessoRapidoSheet();
    var id = 'acesso-' + new Date().getTime();
    sheet.appendRow([
      id,
      fixo ? '' : designer,
      nome,
      link,
      corHexValida(dados.corFundo, '#16181D'),
      corHexValida(dados.corTexto, '#FFFFFF'),
      fixo,
      new Date().getTime()
    ]);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function excluirAcessoRapido(id, designer) {
  if (!id) return { ok: false, error: 'id não informado.' };
  var sheet = getAcessoRapidoSheet();
  var dados = sheet.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][0] !== id) continue;
    var fixo = dados[i][6] === true || dados[i][6] === 'TRUE';
    var dono = (dados[i][1] || '').toString().toLowerCase().trim();
    if (fixo && !ehCoordenador(designer)) {
      return { ok: false, error: 'Esse acesso é fixo — só o coordenador pode remover.' };
    }
    if (!fixo && dono !== (designer || '').toLowerCase().trim()) {
      return { ok: false, error: 'Esse acesso não é seu.' };
    }
    sheet.deleteRow(i + 1);
    return { ok: true };
  }
  return { ok: false, error: 'Acesso não encontrado (talvez já tenha sido apagado).' };
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
 * Como buscarPastaSalvaDoCard, mas pra uma subtarefa nova (ex: uma
 * "Alteração 02") que nunca teve o botão "Criar pasta do card" clicado
 * nela mesma: se ela não tem pasta própria ainda, procura entre os ids
 * relacionados (o card mãe e as tarefas irmãs, que o front-end já tem
 * carregados em memória) se alguma já tem pasta registrada — e se
 * achar, vincula essa mesma pasta na subtarefa também, silenciosamente
 * (sem perguntar nada), pra não precisar criar uma pasta duplicada nem
 * a pessoa ter que ir procurar a pasta certa na mão.
 */
function buscarOuHerdarPastaCard(taskId, idsRelacionados) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var sheet = getPastasCardsSheet();
  var linhas = sheet.getDataRange().getValues();
  var mapaPorId = {};
  for (var i = 1; i < linhas.length; i++) {
    if (linhas[i][0]) mapaPorId[String(linhas[i][0])] = linhas[i][1] || null;
  }
  if (mapaPorId[String(taskId)]) {
    return { ok: true, url: mapaPorId[String(taskId)], herdada: false };
  }
  var ids = idsRelacionados || [];
  for (var j = 0; j < ids.length; j++) {
    var urlEncontrada = mapaPorId[String(ids[j])];
    if (urlEncontrada) {
      salvarPastaDoCard(taskId, urlEncontrada);
      return { ok: true, url: urlEncontrada, herdada: true };
    }
  }
  return { ok: true, url: null, herdada: false };
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
      aliases: linhas[i][8] ? String(linhas[i][8]).split('|').map(function (s) { return s.trim(); }).filter(Boolean) : [],
      sigla: linhas[i][9] ? String(linhas[i][9]).trim() : ''
    });
  }
  return { ok: true, links: links };
}

function salvarLinksCliente(cliente, dados) {
  if (!cliente) return { ok: false, error: 'Cliente não informado.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
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
      aliasesTexto,
      // Normalizada aqui, na porta de entrada, e não na hora de montar o
      // link: assim o que está guardado é sempre o que vai aparecer na URL
      // — sem espaço, sem acento, sem maiúscula.
      normalizarSiglaDeCliente(dados.sigla)
    ];
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(cliente)) {
        sheet.getRange(i + 1, 2, 1, 9).setValues([linhaValores]);
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
  pegarTravaDaPlanilha(lock);
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
  pegarTravaDaPlanilha(lock);
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
  pegarTravaDaPlanilha(lock);
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

// ============ FILA DE REPASSE: "FICAR COMIGO" ============
//
// Quando alguém clica "Ficar comigo" num card da Fila de repasse, a tarefa
// continua com a pessoa (o responsável não muda no Runrun.it) — então, sem
// guardar essa decisão em algum lugar, ela voltaria pra fila pra sempre.
//
// Isso morava só no localStorage do navegador (`colmeia_repasse_ignorados_ids`)
// e por isso SUMIU quando o Colmeia mudou de endereço (claudiobeeon.github.io
// -> colmeia.beeon.com.br): localStorage é separado por domínio, então o
// endereço novo começou do zero e a fila inteira voltou a aparecer.
// Guardar na planilha resolve isso de vez — e de quebra funciona em qualquer
// navegador/computador da pessoa, não só naquele onde ela clicou.
//
// Diferente das PREFERÊNCIAS por designer (ordem de abas etc.), que o
// CLAUDE.md manda deixar em localStorage de propósito: isso aqui não é
// preferência visual, é uma decisão de trabalho que não pode se perder.

function getRepasseIgnoradosSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('RepasseIgnorados');
  if (!sheet) {
    sheet = ss.insertSheet('RepasseIgnorados');
    sheet.getRange('A1:C1').setValues([['designer', 'task_id', 'quando']]);
  }
  return sheet;
}

function listarRepasseIgnorados(designer) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var sheet = getRepasseIgnoradosSheet();
  var linhas = sheet.getDataRange().getValues();
  var ids = [];
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(designer) && linhas[i][1]) {
      ids.push(String(linhas[i][1]));
    }
  }
  return { ok: true, ids: ids };
}

/**
 * `taskIds` é uma LISTA, não um id só, de propósito: além do clique normal
 * ("ficar com essa"), o front-end manda de uma vez o que ainda estiver
 * guardado no localStorage antigo na primeira vez que a pessoa entra (ver
 * migrarIgnoradosDoNavegador em js/pagina-repasse.js) — mandar um pedido
 * por tarefa nessa hora seria dezenas de chamadas de uma vez só.
 */
function ignorarNoRepasseBackend(designer, taskIds) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var lista = Array.isArray(taskIds) ? taskIds : [taskIds];
  lista = lista.filter(function (id) { return id !== null && id !== undefined && id !== ''; });
  if (!lista.length) return { ok: true, gravados: 0 };

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getRepasseIgnoradosSheet();
    var linhas = sheet.getDataRange().getValues();
    var jaTem = {};
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(designer) && linhas[i][1]) {
        jaTem[String(linhas[i][1])] = true;
      }
    }
    var novas = [];
    var agora = new Date().getTime();
    lista.forEach(function (id) {
      if (jaTem[String(id)]) return;
      jaTem[String(id)] = true; // a própria lista pode vir com id repetido
      novas.push([designer, String(id), agora]);
    });
    // Uma escrita só pro bloco inteiro, em vez de um appendRow por tarefa:
    // appendRow em laço é a coisa mais lenta que existe no Apps Script.
    if (novas.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, novas.length, 3).setValues(novas);
    }
    return { ok: true, gravados: novas.length };
  } finally {
    lock.releaseLock();
  }
}

/** Devolve a tarefa pra fila (desfaz o "Ficar comigo"). */
function desfazerIgnorarNoRepasse(designer, taskId) {
  if (!designer || !taskId) return { ok: false, error: 'designer ou taskId ausente.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getRepasseIgnoradosSheet();
    var linhas = sheet.getDataRange().getValues();
    // De trás pra frente: apagar uma linha muda o índice das de baixo.
    for (var i = linhas.length - 1; i >= 1; i--) {
      if (String(linhas[i][0]) === String(designer) && String(linhas[i][1]) === String(taskId)) {
        sheet.deleteRow(i + 1);
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ============ FEED DA ABA "BEE" ============
//
// O feed mostra o que aconteceu NAS SUAS TAREFAS. Boa parte disso o
// Runrun.it não conta pra gente depois do fato: quem mudou a prioridade e
// quando, quem comentou onde, quem te passou uma tarefa. A API só devolve
// o ESTADO atual (a prioridade é X), não a história (fulano mudou pra X
// às 14h). Por isso o Colmeia anota, na hora que a ação passa por ele.
//
// Consequências disso, de propósito:
//   - só entra o que passou PELO COLMEIA. Comentário feito direto no
//     site do Runrun.it não aparece aqui — não temos como saber.
//   - o feed começa vazio e vai enchendo a partir de agora; não dá pra
//     reconstruir o passado.
//
// A anotação acontece num lugar só (registrarEventosDoFeed, chamada no
// fim do handleRequest em Código.gs, depois da ação dar certo) em vez de
// espalhada por dentro de cada função de escrita — assim nenhuma função
// que mexe em dado de verdade do time precisou ser alterada.

var FEED_RETENCAO_DIAS = 14;

function getFeedEventosSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('FeedEventos');
  if (!sheet) {
    sheet = ss.insertSheet('FeedEventos');
    sheet.getRange('A1:G1').setValues([['quando', 'dono', 'tipo', 'autor', 'task_id', 'titulo', 'detalhe']]);
  }
  return sheet;
}

/**
 * Anota um evento pro feed de UMA pessoa (`dono` — quem vai ver isso).
 * Nunca estoura: o feed é um extra, não pode derrubar a ação de verdade
 * que acabou de dar certo (mudar prioridade, comentar, repassar).
 */
function registrarEventoFeed(dono, tipo, autor, taskId, titulo, detalhe) {
  if (!dono || !tipo) return;
  // Não faz sentido se avisar do que você mesmo acabou de fazer — o feed
  // é "o que aconteceu nas suas tarefas", não um espelho dos seus cliques.
  if (autor && String(autor).toLowerCase().trim() === String(dono).toLowerCase().trim()) return;
  try {
    var sheet = getFeedEventosSheet();
    sheet.appendRow([
      new Date().getTime(), dono, tipo, autor || '', taskId ? String(taskId) : '',
      titulo || '', detalhe || ''
    ]);
  } catch (e) { /* feed é extra: falhar aqui não pode quebrar a ação */ }
}

function buscarFeedEventos(designer) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var sheet = getFeedEventosSheet();
  var linhas = sheet.getDataRange().getValues();
  var corte = new Date().getTime() - FEED_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  var eventos = [];
  for (var i = 1; i < linhas.length; i++) {
    var quando = Number(linhas[i][0]) || 0;
    if (quando < corte) continue;
    if (String(linhas[i][1]).toLowerCase().trim() !== String(designer).toLowerCase().trim()) continue;
    eventos.push({
      quando: quando,
      tipo: String(linhas[i][2]),
      autor: String(linhas[i][3] || ''),
      taskId: String(linhas[i][4] || ''),
      titulo: String(linhas[i][5] || ''),
      detalhe: String(linhas[i][6] || '')
    });
  }
  eventos.sort(function (a, b) { return b.quando - a.quando; });
  return { ok: true, eventos: eventos };
}

/**
 * Joga fora o que passou da validade. Roda junto do backup diário (mesmo
 * lugar da limpeza das conversas da Bee) — sem isso a aba cresceria pra
 * sempre e a leitura do feed ia ficando mais lenta a cada dia.
 */
function limparFeedEventosAntigos() {
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getFeedEventosSheet();
    var linhas = sheet.getDataRange().getValues();
    var corte = new Date().getTime() - FEED_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    // De trás pra frente: apagar uma linha muda o índice das de baixo.
    for (var i = linhas.length - 1; i >= 1; i--) {
      if ((Number(linhas[i][0]) || 0) < corte) sheet.deleteRow(i + 1);
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

/**
 * Descobre o ID do usuário no Runrun.it a partir do nome de login.
 *
 * Faz isso pela lista RUNRUN_USUARIOS (nome -> e-mail), que é uma lista
 * nossa, curada, com 3 pessoas — e a comparação aqui é EXATA (só ignora
 * acento e maiúscula), nunca "um nome é começo do outro". É bem diferente
 * de adivinhar nome parecido: se não achar, devolve null e o Colmeia
 * continua funcionando pelo nome, como antes.
 */
function runrunIdDoDesigner(nome) {
  if (!nome) return null;
  var alvo = normalizarNomeLogin(nome);
  var email = null;
  for (var e in RUNRUN_USUARIOS) {
    if (normalizarNomeLogin(RUNRUN_USUARIOS[e]) === alvo) { email = e; break; }
  }
  if (!email) return null;
  try {
    var ids = buscarIdsResponsaveisRunrun();
    return ids[email] || null;
  } catch (err) {
    return null;
  }
}

function verificarLogin(senha) {
  if (!senha) return { ok: false, error: 'Digite a senha.' };
  var sheet = getLoginSheet();
  var linhas = sheet.getDataRange().getValues();
  var hashDigitado = gerarHashSenha(senha);
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][1]) === hashDigitado) {
      var nome = linhas[i][0];
      // Devolve também o ID dessa pessoa no Runrun.it, pra o Colmeia poder
      // decidir "essa tarefa é minha?" comparando IDs em vez de nomes
      // parecidos. Se não der pra descobrir, vem null e o front-end volta a
      // comparar por nome (ver ehMinhaTarefa).
      return { ok: true, nome: nome, papel: linhas[i][2] || 'designer', runrunId: runrunIdDoDesigner(nome) };
    }
  }
  return { ok: false, error: 'Senha incorreta.' };
}

function salvarLoginDaPessoa(nome, senha, papel) {
  var sheet = getLoginSheet();
  var linhas = sheet.getDataRange().getValues();
  var hash = gerarHashSenha(senha);

  // IMPORTANTE: verificarLogin identifica a pessoa SÓ pela senha (devolve a
  // primeira linha cuja senha bate) — a tela de login nem pede o nome. Se
  // duas pessoas escolhessem a mesma senha, a segunda entraria logada COMO
  // A PRIMEIRA, com as tarefas e as permissões dela. Por isso recusa aqui,
  // antes de deixar essa situação existir.
  for (var j = 1; j < linhas.length; j++) {
    if (String(linhas[j][1]) === hash && normalizarNomeLogin(linhas[j][0]) !== normalizarNomeLogin(nome)) {
      Logger.log('RECUSADO: essa senha já é de "' + linhas[j][0] + '". Escolha outra — o login reconhece a pessoa pela senha, então ela precisa ser única.');
      return { ok: false, error: 'Essa senha já está em uso por outra pessoa. Escolha outra.' };
    }
  }

  for (var i = 1; i < linhas.length; i++) {
    if (normalizarNomeLogin(linhas[i][0]) === normalizarNomeLogin(nome)) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[hash, papel]]);
      Logger.log('Login de "' + nome + '" atualizado.');
      return { ok: true };
    }
  }
  sheet.appendRow([nome, hash, papel]);
  Logger.log('Login de "' + nome + '" criado.');
  return { ok: true };
}

/**
 * RODE UMA VEZ pelo editor do Apps Script pra conferir se alguma senha já
 * cadastrada está repetida entre duas pessoas (o que faria uma entrar como
 * a outra). Só mostra os NOMES envolvidos no Log — nunca a senha, que não
 * fica guardada em texto puro em lugar nenhum, só o "resumo" dela (hash).
 * Se aparecer alguma dupla, troque a senha de uma delas com
 * salvarLoginDaPessoa(nome, senhaNova, papel).
 */
function diagnosticoSenhasRepetidas() {
  var linhas = getLoginSheet().getDataRange().getValues();
  var porHash = {};
  for (var i = 1; i < linhas.length; i++) {
    if (!linhas[i][0]) continue;
    var h = String(linhas[i][1]);
    if (!porHash[h]) porHash[h] = [];
    porHash[h].push(linhas[i][0]);
  }
  var achou = false;
  Object.keys(porHash).forEach(function (h) {
    if (porHash[h].length > 1) {
      achou = true;
      Logger.log('SENHA REPETIDA entre: ' + porHash[h].join(', ') + ' — quem entrar com ela vai logar como "' + porHash[h][0] + '".');
    }
  });
  if (!achou) Logger.log('Tudo certo: nenhuma senha repetida entre as pessoas cadastradas.');
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
  pegarTravaDaPlanilha(lock);
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
  pegarTravaDaPlanilha(lock);
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

// As prioridades ficam guardadas por alguns minutos: essa aba é lida
// INTEIRA a cada varredura do quadro e ganha uma linha por tarefa que
// alguém já priorizou — ou seja, ela só cresce e vai deixando o quadro
// mais lento com o tempo. `definirPrioridade` limpa esse cache na hora
// que alguém muda alguma coisa, então a troca continua aparecendo na
// mesma hora pra quem mexeu.
var CACHE_PRIORIDADES_CHAVE = 'prioridadesSalvasColmeia';
var CACHE_PRIORIDADES_SEGUNDOS = 300; // 5 min

function getPrioridadesSalvas() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(CACHE_PRIORIDADES_CHAVE);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* relê da planilha abaixo */ }
  }
  var sheet = getExtrasSheet();
  var linhas = sheet.getDataRange().getValues();
  var mapa = {};
  for (var i = 1; i < linhas.length; i++) {
    if (linhas[i][0]) mapa[linhas[i][0]] = linhas[i][1];
  }
  try {
    cache.put(CACHE_PRIORIDADES_CHAVE, JSON.stringify(mapa), CACHE_PRIORIDADES_SEGUNDOS);
  } catch (e) { /* mapa grande demais pro cache — segue lendo da planilha */ }
  return mapa;
}

function invalidarCacheDePrioridades() {
  try { CacheService.getScriptCache().remove(CACHE_PRIORIDADES_CHAVE); } catch (e) { /* segue */ }
}

// ============ MODO FOCO (aba "Foco") ============
// Uma linha por designer, sempre a mesma (é encontrada e sobrescrita, não
// acumula histórico) — só interessa o estado ATUAL de cada um. O cache
// curto (1 min) é o que faz o resto do time enxergar "Fulano em foco até
// 15:40" na varredura do quadro (ver getTarefasColmeia, Código.gs), sem
// precisar ler a planilha a cada 60s de polling de cada pessoa.
var CACHE_FOCOS_CHAVE = 'focosAtivosColmeia';
var CACHE_FOCOS_SEGUNDOS = 60;

function getFocoSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Foco');
  if (!sheet) {
    sheet = ss.insertSheet('Foco');
    sheet.getRange('A1:C1').setValues([['designer', 'ate_quando', 'atualizado_em']]);
  }
  return sheet;
}

/**
 * Mapa { designer: ateQuando } só com quem está em foco DE VERDADE agora
 * (já filtra fora quem passou do horário — sem isso, "sairDoFoco" nunca
 * chamado por algum motivo deixaria a pessoa "em foco" pra sempre aos
 * olhos do resto do time).
 */
function getFocosAtivos() {
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(CACHE_FOCOS_CHAVE);
  var mapa;
  if (cacheado) {
    try { mapa = JSON.parse(cacheado); } catch (e) { mapa = null; }
  }
  if (!mapa) {
    var sheet = getFocoSheet();
    var linhas = sheet.getDataRange().getValues();
    mapa = {};
    for (var i = 1; i < linhas.length; i++) {
      if (linhas[i][0]) mapa[linhas[i][0]] = Number(linhas[i][1]) || 0;
    }
    try { cache.put(CACHE_FOCOS_CHAVE, JSON.stringify(mapa), CACHE_FOCOS_SEGUNDOS); } catch (e) { /* segue sem cache */ }
  }
  var agora = new Date().getTime();
  var ativos = {};
  Object.keys(mapa).forEach(function (designer) {
    if (mapa[designer] > agora) ativos[designer] = mapa[designer];
  });
  return ativos;
}

function invalidarCacheDeFocos() {
  try { CacheService.getScriptCache().remove(CACHE_FOCOS_CHAVE); } catch (e) { /* segue */ }
}

function entrarEmFoco(designer, ateQuando) {
  if (!designer || !ateQuando) return { ok: false, error: 'designer ou ateQuando inválidos.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getFocoSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(designer)) {
        sheet.getRange(i + 1, 2).setValue(ateQuando);
        sheet.getRange(i + 1, 3).setValue(new Date().getTime());
        invalidarCacheDeFocos();
        return { ok: true };
      }
    }
    sheet.appendRow([designer, ateQuando, new Date().getTime()]);
    invalidarCacheDeFocos();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function sairDoFoco(designer) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getFocoSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(designer)) {
        // Zera em vez de apagar a linha: mais simples (não precisa
        // deslocar as linhas de baixo) e "0" já é sempre "no passado",
        // então getFocosAtivos filtra ela fora sozinho.
        sheet.getRange(i + 1, 2).setValue(0);
        invalidarCacheDeFocos();
        break;
      }
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function definirPrioridade(taskId, prioridade) {
  if (!taskId || ['alta', 'media', 'baixa'].indexOf(prioridade) === -1) {
    return { ok: false, error: 'taskId ou prioridade inválidos.' };
  }

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getExtrasSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(taskId)) {
        sheet.getRange(i + 1, 2).setValue(prioridade);
        sheet.getRange(i + 1, 3).setValue(new Date().getTime());
        invalidarCacheDePrioridades();
        return { ok: true };
      }
    }
    sheet.appendRow([taskId, prioridade, new Date().getTime()]);
    invalidarCacheDePrioridades();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
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
  pegarTravaDaPlanilha(lock);
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
 * dentro da janela pedida — 1 item por tarefa (mesmo com vários plays
 * na janela), já com o horário (em milissegundos) do 1º e do último
 * play. `janela` aceita "hoje" (desde a meia-noite de hoje, horário de
 * Brasília), "48h" (últimas 48h corridas) ou "semana" (últimos 7 dias
 * corridos) — usa o timestamp de verdade (quando), não a data em texto,
 * pra "48h"/"semana" cortarem na hora certa, não só no dia.
 */
function buscarPlaysDeHoje(designer, janela) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var sheet = getLogPlaysSheet();
  var linhas = sheet.getDataRange().getValues();
  var agora = new Date();
  var corte;
  if (janela === '48h') {
    corte = agora.getTime() - 48 * 60 * 60 * 1000;
  } else if (janela === 'semana') {
    corte = agora.getTime() - 7 * 24 * 60 * 60 * 1000;
  } else {
    // "hoje" (padrão): meia-noite de hoje, horário de Brasília.
    var hojeISO = Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd');
    corte = new Date(hojeISO + 'T00:00:00-03:00').getTime();
  }
  var porTarefa = {};
  for (var i = 1; i < linhas.length; i++) {
    var taskId = linhas[i][0], titulo = linhas[i][1], nomeDesigner = linhas[i][2], quando = linhas[i][3];
    if (Number(quando) < corte) continue;
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

/**
 * Todos os plays já registrados de UMA tarefa específica (sem corte de
 * data) — usado pela "História da peça" (ver buscarHistoriaDaTarefa,
 * Código.gs), a linha do tempo dentro do card. O log só guarda o
 * instante de cada play (não quando pausou), então isso vira "começou a
 * trabalhar às HH:MM" — não uma duração de sessão.
 */
function buscarHistoricoDePlaysDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var sheet = getLogPlaysSheet();
  var linhas = sheet.getDataRange().getValues();
  var eventos = [];
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(taskId)) {
      eventos.push({ designer: linhas[i][2], quando: Number(linhas[i][3]) || 0 });
    }
  }
  return { ok: true, plays: eventos };
}

// Quanto tempo de histórico de plays vale manter na planilha. A tela mais
// longa da página Histórico é "última semana", então 60 dias é folga de
// sobra — o resto já está guardado nos backups diários.
var LOG_PLAYS_RETENCAO_DIAS = 60;

function limparLogDePlaysAntigo() {
  try {
    var sheet = getLogPlaysSheet();
    var linhas = sheet.getDataRange().getValues();
    if (linhas.length <= 1) return;
    var corte = new Date().getTime() - LOG_PLAYS_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

    // Apaga de baixo pra cima: deletar uma linha embaralha os índices das
    // que estão DEPOIS dela, então percorrer ao contrário é o que mantém
    // as posições válidas durante o laço.
    var apagadas = 0;
    for (var i = linhas.length - 1; i >= 1; i--) {
      var quando = Number(linhas[i][3]);
      if (quando && quando < corte) {
        sheet.deleteRow(i + 1);
        apagadas++;
      }
    }
    if (apagadas) Logger.log('Log de Plays: ' + apagadas + ' linha(s) com mais de ' + LOG_PLAYS_RETENCAO_DIAS + ' dias apagada(s).');
  } catch (err) {
    Logger.log('Erro ao limpar o Log de Plays antigo: ' + err.message);
  }
}
