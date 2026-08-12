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
  // Coluna K: o logo do cliente (2026-08-11), pro feed da Central do
  // Atendimento — é a bolinha redonda de cada card, no lugar das
  // iniciais. Vazia significa "mostra as iniciais", que é como todo
  // cliente começa e continua até alguém colar um endereço aqui.
  if (sheet.getLastColumn() < 11) {
    sheet.getRange(1, 11).setValue('logo');
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
      sigla: linhas[i][9] ? String(linhas[i][9]).trim() : '',
      logo: linhas[i][10] ? String(linhas[i][10]).trim() : ''
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
      normalizarSiglaDeCliente(dados.sigla),
      String(dados.logo || '').trim()
    ];
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(cliente)) {
        sheet.getRange(i + 1, 2, 1, 10).setValues([linhaValores]);
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
  var quando = new Date().getTime();

  // Grava nos DOIS lugares enquanto a migração está em andamento. Não é
  // desperdício: é o que deixa comparar os dois lados e voltar atrás sem
  // perder nada. Quando o Supabase estiver mandando há tempo suficiente,
  // esta metade da planilha sai daqui.
  try {
    var sheet = getFeedEventosSheet();
    sheet.appendRow([
      quando, dono, tipo, autor || '', taskId ? String(taskId) : '',
      titulo || '', detalhe || ''
    ]);
  } catch (e) { /* feed é extra: falhar aqui não pode quebrar a ação */ }

  if (supabaseConfigurado()) {
    // supabaseInserir nunca estoura (devolve {ok:false}) — mesmo motivo do
    // try/catch acima: o feed é um extra e não pode derrubar a ação de
    // verdade que o usuário acabou de fazer dar certo.
    supabaseInserir('feed_eventos', {
      quando: quando, dono: dono, tipo: tipo, autor: autor || '',
      task_id: taskId ? String(taskId) : '', titulo: titulo || '', detalhe: detalhe || ''
    });
  }
}

function buscarFeedEventos(designer) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var corte = new Date().getTime() - FEED_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

  if (supabaseManda('feed_eventos')) {
    var r = buscarFeedEventosNoSupabase(designer, corte);
    // Se o Supabase não respondeu, cai na planilha em vez de mostrar um
    // feed vazio: "não deu pra perguntar" não é a mesma coisa que "não
    // tem nada" — o mesmo cuidado que o chamarBackend do front-end tem.
    if (r) return r;
  }

  var sheet = getFeedEventosSheet();
  var linhas = sheet.getDataRange().getValues();
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
 * A cópia inicial do feed. Rodar uma vez, ANTES de virar a chave — o
 * porquê e as regras estão em supabaseCopiaInicial (Supabase.gs).
 * Linha mais velha que a validade fica de fora: seria podada logo.
 */
function migrarFeedEventosParaSupabase() {
  supabaseCopiaInicial('feed_eventos', getFeedEventosSheet(), corteDoFeed(), 0, feedEventoDaLinha);
}

/**
 * Confere se os dois lados do feed ainda batem. Ver supabaseConferir.
 * Vale rodar de vez em quando mesmo depois da virada: enquanto a gravação
 * é nos dois lugares, os dois TÊM que continuar iguais — se um dia
 * pararem, é sinal de que alguma gravação está falhando calada de um lado.
 */
function conferirFeedEventos() {
  supabaseConferir('feed_eventos', getFeedEventosSheet(), corteDoFeed(), 0, feedEventoDaLinha);
}

function corteDoFeed() {
  return new Date().getTime() - FEED_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
}

/** Como uma linha do feed é lida — um lugar só, pra cópia e conferência não divergirem. */
function feedEventoDaLinha(linha) {
  return {
    quando: Number(linha[0]) || 0,
    dono: String(linha[1] || ''),
    tipo: String(linha[2] || ''),
    autor: String(linha[3] || ''),
    task_id: String(linha[4] || ''),
    titulo: String(linha[5] || ''),
    detalhe: String(linha[6] || '')
  };
}

/**
 * A mesma busca de cima, feita pelo banco em vez de pelo laço.
 * Filtro e ordenação vão no pedido: o banco devolve só as linhas desta
 * pessoa, dentro da janela de 14 dias, já da mais nova pra mais velha.
 * Devolve null quando não deu pra perguntar (quem chama cai na planilha).
 */
function buscarFeedEventosNoSupabase(designer, corte) {
  var dono = encodeURIComponent(String(designer).toLowerCase().trim());
  var r = supabaseBuscar('feed_eventos',
    'select=quando,tipo,autor,task_id,titulo,detalhe' +
    '&dono_norm=eq.' + dono +
    '&quando=gte.' + corte +
    '&order=quando.desc');
  if (!r.ok || !Array.isArray(r.dados)) return null;
  return {
    ok: true,
    eventos: r.dados.map(function (linha) {
      return {
        quando: Number(linha.quando) || 0,
        tipo: String(linha.tipo || ''),
        autor: String(linha.autor || ''),
        taskId: String(linha.task_id || ''),
        titulo: String(linha.titulo || ''),
        detalhe: String(linha.detalhe || '')
      };
    })
  };
}

/**
 * Joga fora o que passou da validade. Roda junto do backup diário (mesmo
 * lugar da limpeza das conversas da Bee) — sem isso a aba cresceria pra
 * sempre e a leitura do feed ia ficando mais lenta a cada dia.
 */
function limparFeedEventosAntigos() {
  // No banco, "joga fora o que passou da validade" é UM comando — não
  // precisa de trava nenhuma nem de apagar linha por linha de trás pra
  // frente. Fica fora do lock de propósito: não tem nada a ver com a
  // planilha e não deve ficar preso na fila dela.
  if (supabaseConfigurado()) {
    var corteSb = new Date().getTime() - FEED_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    supabaseApagar('feed_eventos', 'quando=lt.' + corteSb);
  }

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
  // Coluna D: o e-mail Google da pessoa, pro "Entrar com o Google"
  // (2026-08-10). Nasce sozinha na primeira leitura depois desta versão —
  // mesmo padrão de getLinksClientesSheet e getAprovacoesSheet. Vazia
  // significa "essa pessoa só entra pela chave de acesso", não erro.
  if (sheet.getLastColumn() < 4) sheet.getRange(1, 4).setValue('email');
  return sheet;
}

// ---------------------------------------------------------------------
// ENTRAR COM O GOOGLE (2026-08-10)
//
// Some ADIÇÃO: a chave de acesso continua exatamente como era, e quem
// preferir seguir usando ela não precisa fazer nada. O que muda é existir
// um segundo caminho — e um caminho que, ao contrário do primeiro,
// identifica a PESSOA de verdade.
//
// Por que isso importa: `verificarLogin` reconhece alguém só pela senha.
// Duas pessoas com a mesma chave entram uma como a outra — tanto que já
// existe `diagnosticoSenhasRepetidas` pra caçar isso na mão. Com o
// Google, quem entra é dono de um e-mail, e não há como confundir.
//
// NINGUÉM É CRIADO AQUI. O e-mail precisa já estar na coluna D da aba
// Login. Um e-mail desconhecido é recusado com um recado claro, em vez de
// virar uma conta nova — este é um app interno com uma lista fechada de
// pessoas, e é assim que ele deve continuar.
// ---------------------------------------------------------------------

/**
 * Confere o crachá que o Google devolveu ao navegador e entra.
 *
 * O `idToken` é assinado pelo Google; quem confere é o próprio Google
 * (endereço `tokeninfo`). Fazer essa conferência no BACKEND, e não no
 * navegador, é o ponto todo: um token colado por qualquer um não passa,
 * porque é aqui que se checa pra QUEM ele foi emitido.
 */
function loginComGoogle(idToken) {
  if (!idToken) return { ok: false, error: 'Faltou o crachá do Google.' };

  var clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) {
    return { ok: false, error: 'A entrada pelo Google ainda não foi configurada.' };
  }

  var dados;
  try {
    var resposta = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resposta.getResponseCode() !== 200) {
      return { ok: false, error: 'O Google não reconheceu essa entrada. Tente de novo.' };
    }
    dados = JSON.parse(resposta.getContentText());
  } catch (e) {
    return { ok: false, error: 'Não consegui falar com o Google agora.' };
  }

  // As três checagens que fazem isso valer alguma coisa:
  // 1. o crachá foi emitido PRA ESTE app (sem isso, um token de qualquer
  //    outro site entraria aqui);
  if (String(dados.aud || '') !== String(clientId)) {
    return { ok: false, error: 'Essa entrada não foi emitida pro Colmeia.' };
  }
  // 2. o e-mail é confirmado pelo Google;
  if (String(dados.email_verified) !== 'true') {
    return { ok: false, error: 'Esse e-mail não está confirmado no Google.' };
  }
  // 3. e o crachá não venceu (o Google já recusaria, mas custa uma linha).
  if (Number(dados.exp || 0) * 1000 < new Date().getTime()) {
    return { ok: false, error: 'Essa entrada expirou. Tente de novo.' };
  }

  var email = String(dados.email || '').toLowerCase().trim();
  var pessoa = acharPessoaPorEmail(email);
  if (!pessoa) {
    return {
      ok: false,
      error: 'O e-mail ' + email + ' não está vinculado a ninguém no Colmeia. ' +
             'Peça pro Cláudio vincular e tente de novo.'
    };
  }

  return {
    ok: true, nome: pessoa.nome, papel: pessoa.papel,
    runrunId: runrunIdDoDesigner(pessoa.nome),
    // O e-mail volta junto (2026-08-11) porque ele é a identificação mais
    // firme que o Colmeia tem dessa pessoa: com ele o app acha o perfil
    // dela (foto, apelidos, nome oficial) sem depender do nome da linha de
    // acesso estar escrito igual ao do perfil. Ver resolverPessoa,
    // js/pessoas-fotos.js.
    email: email
  };
}

/**
 * De quem é este e-mail? Procura na coluna D da aba Login e, se não
 * achar, no RUNRUN_USUARIOS (Código.gs) — que já mapeia e-mail pra nome
 * pra ler a agenda. Essa segunda fonte faz o Cláudio, o Gustavo e o Erick
 * conseguirem entrar pelo Google sem ninguém precisar preencher nada.
 */
function acharPessoaPorEmail(email) {
  if (!email) return null;
  var linhas = getLoginSheet().getDataRange().getValues();

  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][3] || '').toLowerCase().trim() === email) {
      return { nome: linhas[i][0], papel: linhas[i][2] || 'designer' };
    }
  }

  var nomeConhecido = RUNRUN_USUARIOS[email];
  if (nomeConhecido) {
    // Ainda assim só entra quem já tem linha na aba Login: o papel
    // (designer / atendimento / coordenador) sai de lá, e sem ele não dá
    // pra saber o que a pessoa pode ver.
    for (var j = 1; j < linhas.length; j++) {
      if (String(linhas[j][0]).toLowerCase().trim() === String(nomeConhecido).toLowerCase().trim()) {
        return { nome: linhas[j][0], papel: linhas[j][2] || 'designer' };
      }
    }
  }
  return null;
}

// =====================================================================
// QUEM ENTRA NO COLMEIA — o cadastro de acessos (2026-08-10)
//
// Fica na aba Login: nome, chave, papel e e-mail. Até aqui só dava pra
// mexer nisso abrindo a planilha na mão; agora tem tela (Configurações →
// Acessos), porque entrar e sair gente é rotina de agência, não exceção.
//
// ⚠️ O QUE ESTAS FUNÇÕES **NÃO** FAZEM, e precisa continuar claro:
//
// 1. NÃO dão acesso ao Runrun.it. Pra alguém do atendimento comentar e
//    aprovar com a PRÓPRIA conta, o token dela tem que existir numa
//    propriedade `RUNRUN_TOKEN_ATEND_<Nome>` (ver tokensDoAtendimento,
//    Código.gs). Sem isso ela entra no Colmeia, mas escreveria no
//    Runrun.it com a conta de outra pessoa — por isso `substituirPessoa`
//    avisa disso alto e claro em vez de deixar passar em silêncio.
//
// 2. NÃO transferem a carteira de clientes. Quem cliente é de quem mora
//    no painel-designers-beeon, que é outro projeto — o Colmeia só LÊ
//    (ver mapaClienteParaAtendimento). A troca tem que ser feita lá.
// =====================================================================

/** Quem pode entrar hoje. A chave nunca sai daqui — só se ela existe. */
function listarPessoasDoLogin() {
  var linhas = getLoginSheet().getDataRange().getValues();
  var pessoas = [];
  for (var i = 1; i < linhas.length; i++) {
    var nome = String(linhas[i][0] || '').trim();
    if (!nome) continue;
    pessoas.push({
      nome: nome,
      papel: String(linhas[i][2] || 'designer'),
      email: String(linhas[i][3] || ''),
      temChave: !!String(linhas[i][1] || '').trim()
    });
  }
  pessoas.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  return { ok: true, pessoas: pessoas };
}

/**
 * Cria ou atualiza uma pessoa.
 *
 * `chave` vazia numa pessoa NOVA é permitido de propósito: quem entra só
 * pelo Google não precisa de chave nenhuma. Numa pessoa que já existe,
 * chave vazia significa "não mexe na que ela já tem" — assim editar o
 * papel de alguém não apaga o acesso dela sem querer.
 */
function salvarPessoaDoLogin(dados) {
  dados = dados || {};
  var nome = String(dados.nome || '').trim();
  if (!nome) return { ok: false, error: 'Falta o nome.' };

  var papel = String(dados.papel || 'designer').trim().toLowerCase();
  if (['designer', 'atendimento', 'coordenador'].indexOf(papel) === -1) {
    return { ok: false, error: 'Papel inválido: use designer, atendimento ou coordenador.' };
  }
  var email = String(dados.email || '').trim().toLowerCase();
  var chave = String(dados.chave || '').trim();

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getLoginSheet();
    var linhas = sheet.getDataRange().getValues();
    var alvo = normalizarNomeLogin(nome);

    // O e-mail é a identidade de quem entra pelo Google — deixar dois
    // cadastros com o mesmo faria a entrada cair sempre no primeiro, sem
    // ninguém entender por quê.
    for (var v = 1; v < linhas.length; v++) {
      if (!email) break;
      if (normalizarNomeLogin(linhas[v][0]) === alvo) continue;
      if (String(linhas[v][3] || '').toLowerCase().trim() === email) {
        return { ok: false, error: 'Esse e-mail já é de ' + linhas[v][0] + '.' };
      }
    }

    for (var i = 1; i < linhas.length; i++) {
      if (normalizarNomeLogin(linhas[i][0]) !== alvo) continue;
      sheet.getRange(i + 1, 3).setValue(papel);
      sheet.getRange(i + 1, 4).setValue(email);
      if (chave) sheet.getRange(i + 1, 2).setValue(gerarHashSenha(chave));
      return { ok: true, criada: false };
    }

    sheet.appendRow([nome, chave ? gerarHashSenha(chave) : '', papel, email]);
    return { ok: true, criada: true };
  } finally {
    lock.releaseLock();
  }
}

/** Tira o acesso de alguém. Não apaga nada do trabalho dela. */
function removerPessoaDoLogin(nome) {
  if (!nome) return { ok: false, error: 'Falta o nome.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getLoginSheet();
    var linhas = sheet.getDataRange().getValues();
    var alvo = normalizarNomeLogin(nome);
    for (var i = 1; i < linhas.length; i++) {
      if (normalizarNomeLogin(linhas[i][0]) === alvo) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Não achei "' + nome + '" no cadastro.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * SUBSTITUIR: alguém saiu e outra pessoa assume o lugar.
 *
 * Tira o acesso de quem saiu e cria quem entrou com o MESMO papel — que é
 * a parte que o Colmeia sabe fazer sozinho.
 *
 * E devolve, em `pendencias`, o que ele NÃO tem como fazer. Isso não é
 * enfeite: uma substituição pela metade é pior que nenhuma. Sem o token,
 * a pessoa nova comenta no Runrun.it com a conta de quem saiu; sem trocar
 * a carteira no painel, a fila de conferência dela chega vazia.
 */
function substituirPessoaDoLogin(nomeAntigo, dadosNovos) {
  dadosNovos = dadosNovos || {};
  var nomeNovo = String(dadosNovos.nome || '').trim();
  if (!nomeAntigo || !nomeNovo) return { ok: false, error: 'Falta quem sai ou quem entra.' };

  var lista = listarPessoasDoLogin();
  var antiga = (lista.pessoas || []).filter(function (p) {
    return normalizarNomeLogin(p.nome) === normalizarNomeLogin(nomeAntigo);
  })[0];
  if (!antiga) return { ok: false, error: 'Não achei "' + nomeAntigo + '" no cadastro.' };

  var criada = salvarPessoaDoLogin({
    nome: nomeNovo,
    papel: dadosNovos.papel || antiga.papel, // herda o papel de quem saiu
    email: dadosNovos.email || '',
    chave: dadosNovos.chave || ''
  });
  if (!criada.ok) return criada;

  var saiu = removerPessoaDoLogin(antiga.nome);
  if (!saiu.ok) {
    return { ok: false, error: 'Criei ' + nomeNovo + ', mas não consegui tirar ' + antiga.nome + ': ' + saiu.error };
  }

  var pendencias = [];
  if (antiga.papel === 'atendimento') {
    pendencias.push(
      'Crie a propriedade de script RUNRUN_TOKEN_ATEND_' + nomeNovo.replace(/\s+/g, '_') +
      ' com o token de ' + nomeNovo + ' no Runrun.it — sem isso ela entra no Colmeia, ' +
      'mas comentaria no Runrun.it com a conta de ' + antiga.nome + '.'
    );
    pendencias.push(
      'Apague a propriedade RUNRUN_TOKEN_ATEND_' + antiga.nome.replace(/\s+/g, '_') +
      ' (ou a linha de ' + antiga.nome + ' em RUNRUN_TOKENS_ATENDIMENTO, no Código.gs).'
    );
  }
  pendencias.push(
    'Troque a carteira de clientes de ' + antiga.nome + ' para ' + nomeNovo +
    ' no painel-designers-beeon — o Colmeia só lê esse vínculo, não escreve.'
  );

  return { ok: true, saiu: antiga.nome, entrou: nomeNovo, papel: antiga.papel, pendencias: pendencias };
}

// ---------------------------------------------------------------------
// VINCULAR OS E-MAILS PELO RUNRUN.IT (2026-08-10)
//
// Todo mundo do time já usa o e-mail da Beeon no Runrun.it, e o `/users`
// de lá devolve nome e e-mail juntos — então dá pra preencher a coluna D
// sem ninguém digitar nada.
//
// ⚠️ POR QUE ISSO É EM DOIS PASSOS, E NÃO UM BOTÃO SÓ
//
// Casar por NOME é arriscado, e aqui o erro é grave de um jeito
// específico: um vínculo errado faz uma pessoa **entrar como outra**. É o
// mesmo cuidado que o CLAUDE.md pede em "essa tarefa é minha?", só que
// com uma consequência pior.
//
// Por isso:
//   1. `verEmailsDoRunrun()`      — só MOSTRA o que faria. Não grava nada.
//   2. `vincularEmailsDoRunrun()` — grava, depois de você conferir.
//
// E o casamento é conservador de propósito: só aceita nome IGUAL, ou um
// primeiro nome que aponte pra UMA pessoa só. Qualquer dúvida vira um
// aviso pra você resolver na mão, nunca um palpite gravado.
// ---------------------------------------------------------------------

/**
 * Quem existe no Runrun.it e ainda NÃO tem acesso ao Colmeia.
 *
 * Alimenta a lista "adicionar com um clique" da aba Acessos. Não cria
 * ninguém sozinho de propósito: o Runrun.it tem gente que não é do
 * Colmeia, e o PAPEL (designer / atendimento / coordenador) não dá pra
 * adivinhar de lá — é justamente o que define o que a pessoa enxerga.
 * Então o Colmeia traz o nome e o e-mail prontos, e quem escolhe o papel
 * é você, com um clique em vez de digitação.
 */
function listarPessoasDoRunrunSemAcesso() {
  var usuarios = buscarUsuariosRunrunComCache();
  if (!Array.isArray(usuarios)) {
    return { ok: false, error: 'Não consegui ler os usuários do Runrun.it agora.' };
  }

  var jaTem = {};
  var linhas = getLoginSheet().getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (linhas[i][0]) jaTem[normalizarNomeLogin(linhas[i][0])] = true;
    var email = String(linhas[i][3] || '').toLowerCase().trim();
    if (email) jaTem['@' + email] = true;
  }

  var faltando = [];
  usuarios.forEach(function (u) {
    var nome = String(u.name || '').trim();
    var email = String(u.email || '').toLowerCase().trim();
    if (!nome || !email) return;
    // Só gente da casa: o Runrun.it pode ter convidado, cliente ou conta
    // de outra agência, e nada disso deve virar sugestão de acesso.
    if (email.indexOf('@beeon.com.br') === -1) return;
    if (jaTem[normalizarNomeLogin(nome)] || jaTem['@' + email]) return;
    faltando.push({ nome: nome, email: email });
  });

  faltando.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  return { ok: true, pessoas: faltando };
}

/** Só mostra o que o vínculo automático faria. Não grava nada. */
function verEmailsDoRunrun() {
  relatorioDeEmailsDoRunrun(false);
}

/** Grava os vínculos seguros. Rode `verEmailsDoRunrun()` antes. */
function vincularEmailsDoRunrun() {
  relatorioDeEmailsDoRunrun(true);
}

function relatorioDeEmailsDoRunrun(gravar) {
  var usuarios = buscarUsuariosRunrunComCache();
  if (!Array.isArray(usuarios)) {
    Logger.log('❌ Não consegui ler os usuários do Runrun.it agora. Tente de novo em instantes.');
    return;
  }

  var sheet = getLoginSheet();
  var linhas = sheet.getDataRange().getValues();

  var vaiGravar = [];   // { linha, nome, email }
  var jaTinha = [];
  var duvidosos = [];
  var semEmail = [];

  for (var i = 1; i < linhas.length; i++) {
    var nome = String(linhas[i][0] || '').trim();
    if (!nome) continue;
    if (String(linhas[i][3] || '').trim()) { jaTinha.push(nome); continue; }

    var achados = usuariosDoRunrunQueBatem(usuarios, nome);
    if (achados.length === 1 && achados[0].email) {
      vaiGravar.push({ linha: i + 1, nome: nome, email: String(achados[0].email).toLowerCase().trim() });
    } else if (achados.length > 1) {
      duvidosos.push(nome + ' → ' + achados.map(function (u) { return u.email || '(sem e-mail)'; }).join(' OU '));
    } else {
      semEmail.push(nome);
    }
  }

  Logger.log(gravar ? '=== VINCULANDO ===' : '=== PRÉVIA (nada foi gravado) ===');

  if (vaiGravar.length) {
    Logger.log(gravar ? 'Vinculados:' : 'Seriam vinculados:');
    vaiGravar.forEach(function (v) { Logger.log('  ✅ ' + v.nome + ' → ' + v.email); });
  } else {
    Logger.log('Nada novo pra vincular.');
  }

  if (duvidosos.length) {
    Logger.log('');
    Logger.log('⚠️ Mais de uma pessoa possível — NÃO vinculei, resolva na mão:');
    duvidosos.forEach(function (d) { Logger.log('  ? ' + d); });
    Logger.log("  Use: vincularEmailDeLogin('Nome', 'email@beeon.com.br')");
  }
  if (semEmail.length) {
    Logger.log('');
    Logger.log('Sem correspondente no Runrun.it (seguem só com a chave de acesso): ' + semEmail.join(', '));
  }
  if (jaTinha.length) {
    Logger.log('');
    Logger.log('Já tinham e-mail (não toquei): ' + jaTinha.join(', '));
  }

  if (!gravar) {
    Logger.log('');
    Logger.log('Conferiu e está tudo certo? Rode vincularEmailsDoRunrun() pra gravar.');
    return;
  }

  if (!vaiGravar.length) return;
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    vaiGravar.forEach(function (v) { sheet.getRange(v.linha, 4).setValue(v.email); });
    Logger.log('');
    Logger.log('✅ ' + vaiGravar.length + ' pessoa(s) agora entram com o Google.');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Quem, no Runrun.it, pode ser esta pessoa.
 *
 * Duas tentativas, da mais segura pra menos:
 *   1. nome INTEIRO igual (sem acento, sem maiúscula) — é o caso normal;
 *   2. primeiro nome igual — só serve se apontar pra UMA pessoa só.
 *
 * Devolver a lista inteira (em vez de "o melhor palpite") é o que permite
 * a quem chama recusar quando há mais de um. "Manu" batendo em "Manuel" e
 * "Manuela" tem que virar pergunta, nunca escolha.
 */
function usuariosDoRunrunQueBatem(usuarios, nome) {
  var alvo = normalizarNomeLogin(nome);

  var iguais = usuarios.filter(function (u) {
    return normalizarNomeLogin(u.name || '') === alvo;
  });
  if (iguais.length) return iguais;

  var primeiro = alvo.split(' ')[0];
  if (!primeiro) return [];
  return usuarios.filter(function (u) {
    return normalizarNomeLogin(u.name || '').split(' ')[0] === primeiro;
  });
}

/**
 * Vincula UM e-mail a uma pessoa que já existe na aba Login — o conserto
 * manual pros casos que o automático recusou por dúvida.
 *
 * Ex: vincularEmailDeLogin('Laura', 'laura@beeon.com.br')
 */
function vincularEmailDeLogin(nome, email) {
  if (!nome || !email) {
    Logger.log("Use assim: vincularEmailDeLogin('Laura', 'laura@beeon.com.br')");
    return;
  }
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getLoginSheet();
    var linhas = sheet.getDataRange().getValues();
    var alvo = String(nome).toLowerCase().trim();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]).toLowerCase().trim() === alvo) {
        sheet.getRange(i + 1, 4).setValue(String(email).toLowerCase().trim());
        Logger.log('✅ ' + linhas[i][0] + ' agora entra com ' + email + '.');
        return;
      }
    }
    Logger.log('❌ Não achei ninguém chamado "' + nome + '" na aba Login.');
    Logger.log('   Os nomes cadastrados são: ' +
      linhas.slice(1).map(function (l) { return l[0]; }).filter(String).join(', '));
  } finally {
    lock.releaseLock();
  }
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
    sheet.getRange('A1:E1').setValues([['nome', 'foto', 'aliases', 'discord', 'emails']]);
  }
  // Coluna E: os e-mails dessa pessoa (2026-08-11). É a mesma ideia da
  // coluna `aliases` — outro jeito de chamar a mesma pessoa — só que um
  // jeito que não erra: "Manu" pode ser duas pessoas, um e-mail não.
  // Nasce sozinha na primeira leitura depois desta versão, igual à coluna
  // de e-mail da aba Login. Vazia significa "essa pessoa só é reconhecida
  // pelo nome/apelido", que é exatamente como tudo funcionava antes.
  if (sheet.getLastColumn() < 5) sheet.getRange(1, 5).setValue('emails');
  return sheet;
}

/** Quebra uma célula "a|b|c" na lista dela, sem sobras vazias. */
function separarPorBarra(valor) {
  return valor
    ? String(valor).split('|').map(function (s) { return s.trim(); }).filter(Boolean)
    : [];
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
      aliases: separarPorBarra(linhas[i][2]),
      discord: linhas[i][3] || '',
      emails: separarPorBarra(linhas[i][4]).map(function (e) { return e.toLowerCase(); })
    });
  }
  return { ok: true, pessoas: pessoas };
}

function salvarPessoa(nome, foto, aliases, discord, emails) {
  if (!nome) return { ok: false, error: 'Nome não informado.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getPessoasSheet();
    var linhas = sheet.getDataRange().getValues();
    var aliasesTexto = (aliases || []).join('|');
    var emailsLimpos = (emails || [])
      .map(function (e) { return String(e || '').toLowerCase().trim(); })
      .filter(Boolean);

    // Um e-mail só pode apontar pra uma pessoa. Se dois cadastros
    // tivessem o mesmo, a foto (e o nome oficial) de quem entrasse por ele
    // dependeria da ordem das linhas da planilha — ou seja, mudaria
    // sozinho um dia desses, sem ninguém entender por quê. Mesma regra que
    // já vale na aba Login (ver salvarPessoaDoLogin).
    for (var v = 1; v < linhas.length; v++) {
      if (String(linhas[v][0]) === String(nome)) continue;
      var emailsDaOutra = separarPorBarra(linhas[v][4]).map(function (e) { return e.toLowerCase(); });
      for (var e = 0; e < emailsLimpos.length; e++) {
        if (emailsDaOutra.indexOf(emailsLimpos[e]) !== -1) {
          return { ok: false, error: 'O e-mail ' + emailsLimpos[e] + ' já é de ' + linhas[v][0] + '.' };
        }
      }
    }

    var emailsTexto = emailsLimpos.join('|');
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(nome)) {
        sheet.getRange(i + 1, 2, 1, 4).setValues([[foto || '', aliasesTexto, discord || '', emailsTexto]]);
        return { ok: true };
      }
    }
    sheet.appendRow([nome, foto || '', aliasesTexto, discord || '', emailsTexto]);
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

// ---------------------------------------------------------------------
// DE QUEM É ESTE E-MAIL? — as sugestões de vínculo (2026-08-11)
//
// O Colmeia conhece a mesma pessoa por três listas diferentes: a aba
// Login (quem entra, e com qual e-mail do Google), o Runrun.it (quem
// executa) e a aba Pessoas (a foto e os apelidos). Até aqui as três só se
// falavam pelo NOME escrito igual — e é por isso que a foto cadastrada
// sumia justamente quando o nome vinha diferente de uma fonte pra outra.
//
// A coluna `emails` da aba Pessoas conserta isso na raiz: o e-mail vira
// mais um jeito de chamar a pessoa, só que um jeito que não erra.
//
// ⚠️ ESTA FUNÇÃO NÃO GRAVA NADA, e isso é de propósito — o mesmo cuidado
// de `verEmailsDoRunrun` mais acima. Ela só diz "este e-mail PARECE ser
// desta pessoa"; quem confirma é o coordenador, clicando. Um vínculo
// errado aqui gruda a foto e o nome de alguém em outra pessoa pelo app
// inteiro, e ninguém desconfiaria de onde veio.
// ---------------------------------------------------------------------

/**
 * Os e-mails que o Colmeia conhece (da aba Login e do Runrun.it) e que
 * ainda não estão vinculados a nenhum perfil da aba Pessoas.
 *
 * `certeza` diz o quanto dá pra confiar em cada palpite:
 *   'exata'   — o nome bate igualzinho com a pessoa ou com um apelido dela
 *   'palpite' — só o primeiro nome bate, e bate com UMA pessoa só
 * Quando o primeiro nome bate com mais de uma pessoa, não vira sugestão
 * nenhuma: é exatamente o caso em que um palpite entregaria a foto de uma
 * pessoa pra outra.
 */
function sugerirVinculosDeEmail() {
  var pessoas = listarPessoasSalvas().pessoas || [];

  // Todo e-mail que já está vinculado a alguém — não vira sugestão.
  var jaVinculados = {};
  pessoas.forEach(function (p) {
    (p.emails || []).forEach(function (e) { jaVinculados[e] = p.nome; });
  });

  // Junta os e-mails das duas fontes. Um mesmo e-mail costuma aparecer nas
  // duas (o e-mail do Google normalmente é o mesmo do Runrun.it) — nesse
  // caso as fontes vão somadas no MESMO item, pra virar uma linha só na
  // tela em vez de duas iguais.
  var candidatos = {}; // email -> { email, nomeNaFonte, fontes: [] }
  function anotar(email, nome, fonte) {
    email = String(email || '').toLowerCase().trim();
    nome = String(nome || '').trim();
    if (!email || !nome || jaVinculados[email]) return;
    if (!candidatos[email]) {
      candidatos[email] = { email: email, nomeNaFonte: nome, fontes: [] };
    }
    if (candidatos[email].fontes.indexOf(fonte) === -1) {
      candidatos[email].fontes.push(fonte);
    }
  }

  var linhasLogin = getLoginSheet().getDataRange().getValues();
  for (var i = 1; i < linhasLogin.length; i++) {
    anotar(linhasLogin[i][3], linhasLogin[i][0], 'acesso');
  }

  var usuarios = buscarUsuariosRunrunComCache();
  var runrunFora = !Array.isArray(usuarios);
  if (!runrunFora) {
    usuarios.forEach(function (u) {
      // Só gente da casa, mesma regra de listarPessoasDoRunrunSemAcesso: o
      // Runrun.it tem convidado e conta de cliente, e nada disso é pessoa
      // do Colmeia pra ganhar perfil.
      var email = String(u.email || '').toLowerCase().trim();
      if (email.indexOf('@beeon.com.br') === -1) return;
      anotar(email, u.name, 'runrun');
    });
  }

  var sugestoes = [];
  Object.keys(candidatos).forEach(function (email) {
    var c = candidatos[email];
    var achado = pessoaProvavelPeloNome(pessoas, c.nomeNaFonte);
    if (!achado) return;
    sugestoes.push({
      email: c.email,
      nomeNaFonte: c.nomeNaFonte,
      fontes: c.fontes,
      pessoa: achado.pessoa.nome,
      foto: achado.pessoa.foto || '',
      certeza: achado.certeza
    });
  });

  // Os vínculos certos primeiro: são os que o coordenador confirma
  // batendo o olho, sem precisar parar pra pensar em cada um.
  sugestoes.sort(function (a, b) {
    if (a.certeza !== b.certeza) return a.certeza === 'exata' ? -1 : 1;
    return a.pessoa.localeCompare(b.pessoa, 'pt-BR');
  });

  return { ok: true, sugestoes: sugestoes, runrunFora: runrunFora };
}

/**
 * Qual perfil da aba Pessoas é provavelmente deste nome? Devolve null
 * quando não dá pra ter certeza — que é a resposta certa sempre que a
 * alternativa seria chutar.
 */
function pessoaProvavelPeloNome(pessoas, nome) {
  var alvo = normalizarNomeLogin(nome);
  if (!alvo) return null;

  for (var i = 0; i < pessoas.length; i++) {
    var p = pessoas[i];
    if (normalizarNomeLogin(p.nome) === alvo) return { pessoa: p, certeza: 'exata' };
    for (var a = 0; a < (p.aliases || []).length; a++) {
      if (normalizarNomeLogin(p.aliases[a]) === alvo) return { pessoa: p, certeza: 'exata' };
    }
  }

  // Nada igual: tenta pelo primeiro nome, e só aceita se apontar pra UMA
  // pessoa. Um "Lucas" que serve pra dois Lucas não é sugestão — é cara ou
  // coroa com a identidade de alguém.
  var primeiro = alvo.split(' ')[0];
  if (!primeiro || primeiro.length < 3) return null;
  var candidatas = pessoas.filter(function (p) {
    if (normalizarNomeLogin(p.nome).split(' ')[0] === primeiro) return true;
    return (p.aliases || []).some(function (a) {
      return normalizarNomeLogin(a).split(' ')[0] === primeiro;
    });
  });
  return candidatas.length === 1 ? { pessoa: candidatas[0], certeza: 'palpite' } : null;
}

/**
 * Confirma um vínculo: acrescenta o e-mail à pessoa, sem mexer em mais
 * nada dela (foto, apelidos e discord ficam como estão). É o passo 2 —
 * chamado pelo clique do coordenador, nunca sozinho.
 */
function vincularEmailAPessoa(nomePessoa, email) {
  nomePessoa = String(nomePessoa || '').trim();
  email = String(email || '').toLowerCase().trim();
  if (!nomePessoa || !email) return { ok: false, error: 'Falta o nome ou o e-mail.' };

  var pessoas = listarPessoasSalvas().pessoas || [];
  var alvo = null;
  for (var i = 0; i < pessoas.length; i++) {
    if (String(pessoas[i].nome) === nomePessoa) { alvo = pessoas[i]; break; }
  }
  if (!alvo) return { ok: false, error: 'Não achei o perfil de ' + nomePessoa + '.' };

  var emails = (alvo.emails || []).slice();
  if (emails.indexOf(email) === -1) emails.push(email);
  return salvarPessoa(alvo.nome, alvo.foto, alvo.aliases, alvo.discord, emails);
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
  var agora = new Date();
  var dataISO = Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd');

  if (supabaseConfigurado()) {
    supabaseInserir('log_plays', {
      task_id: String(taskId), titulo: taskTitle || '', designer: designer,
      quando: agora.getTime(), data: dataISO
    });
  }

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    getLogPlaysSheet().appendRow([taskId, taskTitle || '', designer, agora.getTime(), dataISO]);
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
  // Vindo do banco, o filtro (esta pessoa, dentro da janela) já foi feito
  // lá — chega só o que interessa, em vez da aba inteira. O agrupamento
  // por tarefa continua aqui, igual pros dois caminhos: é pouca linha a
  // essa altura, e manter um cálculo só evita os dois lados divergirem.
  if (supabaseManda('log_plays')) {
    var doBanco = buscarPlaysNoSupabase(designer, corte);
    if (doBanco) linhas = doBanco; // já no formato de linha da planilha
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
 * Os plays desta pessoa dentro da janela, vindos do banco — devolvidos no
 * MESMO formato de linha da planilha (e com uma linha falsa de cabeçalho
 * na frente), pra quem chama poder trocar a fonte sem mudar o resto.
 * Devolve null quando não deu pra perguntar: aí o caminho da planilha
 * segue normal, em vez de a tela mostrar um dia vazio que não é verdade.
 */
function buscarPlaysNoSupabase(designer, corte) {
  var alvo = encodeURIComponent(String(designer).toLowerCase().trim());
  var r = supabaseBuscar('log_plays',
    'select=task_id,titulo,designer,quando' +
    '&designer_norm=eq.' + alvo +
    '&quando=gte.' + corte);
  if (!r.ok || !Array.isArray(r.dados)) return null;
  var linhas = [['task_id', 'titulo', 'designer', 'quando']]; // cabeçalho de mentira
  r.dados.forEach(function (p) {
    linhas.push([String(p.task_id), String(p.titulo || ''), String(p.designer || ''), Number(p.quando) || 0]);
  });
  return linhas;
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

  if (supabaseManda('log_plays')) {
    var r = supabaseBuscar('log_plays',
      'select=designer,quando&task_id=eq.' + encodeURIComponent(String(taskId)));
    if (r.ok && Array.isArray(r.dados)) {
      return {
        ok: true,
        plays: r.dados.map(function (p) {
          return { designer: String(p.designer || ''), quando: Number(p.quando) || 0 };
        })
      };
    }
    // Não deu pra perguntar: cai na planilha em vez de dizer que a tarefa
    // nunca teve play nenhum.
  }

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
  // No banco isso é um comando só, sem apagar linha por linha de trás pra
  // frente — e é a aba que mais cresce do Colmeia, então é onde essa
  // diferença mais aparece.
  if (supabaseConfigurado()) {
    supabaseApagar('log_plays',
      'quando=lt.' + (new Date().getTime() - LOG_PLAYS_RETENCAO_DIAS * 24 * 60 * 60 * 1000));
  }

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

/** A cópia inicial do Log de Plays. Ver supabaseCopiaInicial (Supabase.gs). */
function migrarLogPlaysParaSupabase() {
  // 3 = aqui o carimbo de tempo é a 4ª coluna, não a 1ª.
  supabaseCopiaInicial('log_plays', getLogPlaysSheet(), corteDoLogPlays(), 3, playDaLinha);
}

/** Confere se os dois lados do Log de Plays ainda batem. Ver supabaseConferir. */
function conferirLogPlays() {
  supabaseConferir('log_plays', getLogPlaysSheet(), corteDoLogPlays(), 3, playDaLinha);
}

function corteDoLogPlays() {
  return new Date().getTime() - LOG_PLAYS_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
}

/**
 * A coluna "data" guarda um texto "yyyy-MM-dd" (registrarPlay), mas o
 * Sheets promove sozinho um texto com essa cara pra uma célula de DATA de
 * verdade — aí `getValues()` devolve um objeto Date, não o texto que foi
 * escrito. `String(dataDeVerdade)` vira "Tue Aug 11 2026 00:00:00
 * GMT-0300 (...)", que nunca bate com o texto puro guardado no Supabase.
 * Isso não perde o play (a linha continua lá) — só fazia a conferência
 * (supabaseConferir) acusar diferença numa linha que é a mesma dos dois
 * lados. Normaliza de volta pro mesmo "yyyy-MM-dd" nos dois casos.
 */
function playDaLinha(linha) {
  var bruto = linha[4];
  var data = (bruto instanceof Date)
    ? Utilities.formatDate(bruto, 'America/Sao_Paulo', 'yyyy-MM-dd')
    : String(bruto || '');
  return {
    task_id: String(linha[0] || ''),
    titulo: String(linha[1] || ''),
    designer: String(linha[2] || ''),
    quando: Number(linha[3]) || 0,
    data: data
  };
}

// ===========================================================================
// PEDIDOS DE ATENÇÃO (2026-08-09)
//
// O atendimento abre a pílula "Precisa de atenção" na Timeline da Central,
// vê as peças que postam hoje/amanhã e ainda não ficaram prontas, e decide
// uma a uma: PEDIR ATENÇÃO (chega no sino de quem coordena e vira um evento
// na Timeline, pra ninguém cobrar duas vezes) ou SEGURAR (não faz barulho
// nenhum — ver o comentário em js/central-atencao.js).
//
// Aba PRÓPRIA, e não uma linha a mais no FeedEventos, por dois motivos:
// o FeedEventos é por DONO (cada designer lê só o que é dele) e o pedido
// aqui precisa ser lido por TODO o atendimento — é justamente isso que
// impede a segunda cobrança. E o pedido é uma decisão de trabalho: se
// sumisse, alguém cobraria de novo achando que ninguém tinha cobrado.
// ===========================================================================

var PEDIDOS_ATENCAO_RETENCAO_DIAS = 14;

function getPedidosAtencaoSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PedidosAtencao');
  if (!sheet) {
    sheet = ss.insertSheet('PedidosAtencao');
    sheet.getRange('A1:H1').setValues([[
      'quando', 'task_id', 'titulo', 'cliente', 'publicacao', 'quem_pediu', 'designer', 'motivo'
    ]]);
  }
  return sheet;
}

/**
 * Grava o pedido. `publicacao` é a data de postagem daquela peça
 * ("AAAA-MM-DD", a mesma de calendarioDePostagens) — é ela que diz se o
 * pedido ainda vale hoje ou já é história.
 */
function registrarPedidoDeAtencao(dados) {
  dados = dados || {};
  if (!dados.taskId) return { ok: false, error: 'Sem tarefa pra pedir atenção.' };

  var agora = new Date().getTime();

  if (supabaseConfigurado()) {
    supabaseInserir('pedidos_atencao', {
      quando: agora, task_id: String(dados.taskId), titulo: dados.titulo || '',
      cliente: dados.cliente || '', publicacao: dados.publicacao || '',
      quem_pediu: dados.quemPediu || '', designer: dados.designer || '',
      motivo: dados.motivo || ''
    });
  }

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    getPedidosAtencaoSheet().appendRow([
      agora,
      String(dados.taskId),
      dados.titulo || '',
      dados.cliente || '',
      dados.publicacao || '',
      dados.quemPediu || '',
      dados.designer || '',
      dados.motivo || ''
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Não consegui gravar o pedido: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

/** Os pedidos dos últimos PEDIDOS_ATENCAO_RETENCAO_DIAS dias, mais novo primeiro. */
function listarPedidosDeAtencao() {
  var corte = new Date().getTime() - PEDIDOS_ATENCAO_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

  if (supabaseManda('pedidos_atencao')) {
    var r = supabaseBuscar('pedidos_atencao',
      'select=*&quando=gte.' + corte + '&order=quando.desc');
    if (r.ok && Array.isArray(r.dados)) {
      return {
        ok: true,
        pedidos: r.dados.map(function (p) {
          return {
            quando: Number(p.quando) || 0,
            taskId: String(p.task_id || ''),
            titulo: String(p.titulo || ''),
            cliente: String(p.cliente || ''),
            publicacao: String(p.publicacao || ''),
            quemPediu: String(p.quem_pediu || ''),
            designer: String(p.designer || ''),
            motivo: String(p.motivo || '')
          };
        })
      };
    }
    // Não deu pra perguntar: cai na planilha. Aqui isso importa mais que
    // nos outros — uma lista vazia faria o atendimento cobrar de novo uma
    // peça que já foi cobrada, que é exatamente o que essa aba evita.
  }

  var sheet = getPedidosAtencaoSheet();
  var linhas = sheet.getDataRange().getValues();
  var pedidos = [];
  for (var i = 1; i < linhas.length; i++) {
    var quando = Number(linhas[i][0]) || 0;
    if (quando < corte) continue;
    pedidos.push({
      quando: quando,
      taskId: String(linhas[i][1] || ''),
      titulo: String(linhas[i][2] || ''),
      cliente: String(linhas[i][3] || ''),
      publicacao: String(linhas[i][4] || ''),
      quemPediu: String(linhas[i][5] || ''),
      designer: String(linhas[i][6] || ''),
      motivo: String(linhas[i][7] || '')
    });
  }
  pedidos.sort(function (a, b) { return b.quando - a.quando; });
  return { ok: true, pedidos: pedidos };
}

/** A cópia inicial dos Pedidos de Atenção. Ver supabaseCopiaInicial (Supabase.gs). */
function migrarPedidosAtencaoParaSupabase() {
  supabaseCopiaInicial('pedidos_atencao', getPedidosAtencaoSheet(), corteDosPedidos(), 0, pedidoDeAtencaoDaLinha);
}

/** Confere se os dois lados dos Pedidos de Atenção ainda batem. Ver supabaseConferir. */
function conferirPedidosAtencao() {
  supabaseConferir('pedidos_atencao', getPedidosAtencaoSheet(), corteDosPedidos(), 0, pedidoDeAtencaoDaLinha);
}

function corteDosPedidos() {
  return new Date().getTime() - PEDIDOS_ATENCAO_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
}

function pedidoDeAtencaoDaLinha(linha) {
  return {
    quando: Number(linha[0]) || 0,
    task_id: String(linha[1] || ''),
    titulo: String(linha[2] || ''),
    cliente: String(linha[3] || ''),
    publicacao: String(linha[4] || ''),
    quem_pediu: String(linha[5] || ''),
    designer: String(linha[6] || ''),
    motivo: String(linha[7] || '')
  };
}

/** Poda junto do backup diário, mesma ideia do FeedEventos. */
function limparPedidosDeAtencaoAntigos() {
  if (supabaseConfigurado()) {
    supabaseApagar('pedidos_atencao',
      'quando=lt.' + (new Date().getTime() - PEDIDOS_ATENCAO_RETENCAO_DIAS * 24 * 60 * 60 * 1000));
  }

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getPedidosAtencaoSheet();
    var linhas = sheet.getDataRange().getValues();
    var corte = new Date().getTime() - PEDIDOS_ATENCAO_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    // De trás pra frente: apagar uma linha muda o índice das de baixo.
    for (var i = linhas.length - 1; i >= 1; i--) {
      if ((Number(linhas[i][0]) || 0) < corte) sheet.deleteRow(i + 1);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
