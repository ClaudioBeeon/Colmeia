/**
 * Tudo do Google Drive: achar/criar a pasta de um card, ler os uploads
 * recentes, montar as atividades da página Histórico, e o backup diário da
 * planilha.
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
var MESES_ABREV_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Lê o "mês do projeto" que fica entre colchetes no campo PROJETO da
 * tarefa no Runrun.it (ex: "APsystems > [MAIO26] INBOUND..." →
 * maio/2026) — NÃO é no título da tarefa (título costuma ser genérico).
 * Usado em criarPastaDoCardNoDrive pra criar a pasta no mês de quando o
 * projeto É, não no mês de quando alguém clicou em "Criar pasta do
 * card" (uma tarefa atrasada de maio, criada em julho, tem que cair na
 * pasta de maio). O mês pode vir abreviado (MAI) ou por extenso (MAIO)
 * — por isso confere só as 3 primeiras letras. Espelha
 * extrairMesAnoDoProjeto em js/config.js — mudou o formato aqui, muda
 * lá também.
 */
function extrairMesAnoDoProjeto(projeto) {
  if (!projeto) return null;
  var m = String(projeto).match(/\[\s*([A-Za-zÇç]{3,})\D{0,2}(\d{2,4})\s*\]/);
  if (!m) return null;
  var mesIndex = MESES_ABREV_PT.indexOf(m[1].toLowerCase().slice(0, 3));
  if (mesIndex === -1) return null;
  var anoStr = m[2];
  var ano = anoStr.length === 2 ? 2000 + parseInt(anoStr, 10) : parseInt(anoStr, 10);
  return { mesIndex: mesIndex, ano: ano };
}

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

function criarPastaDoCardNoDrive(cliente, tituloCard, taskId, projeto) {
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
    // Se o campo Projeto tem o "mês do projeto" entre colchetes (ex:
    // [MAIO26]), usa ELE pra decidir a pasta — não a data de hoje. Uma
    // tarefa atrasada de maio, criada em julho, tem que cair na pasta de
    // maio. Se o front-end não mandou o projeto (ex: chamada antiga em
    // cache), busca a tarefa de novo no Runrun.it só pra pegar esse campo.
    var agora = new Date();
    var projetoTexto = projeto;
    if (!projetoTexto && taskId) {
      try {
        var tarefaFresca = runrunFetch('/tasks/' + taskId);
        projetoTexto = tarefaFresca ? extrairNomeProjeto(tarefaFresca) : '';
      } catch (e) { /* segue sem — cai no mês atual abaixo */ }
    }
    var mesDoProjeto = extrairMesAnoDoProjeto(projetoTexto);
    var ano = String(mesDoProjeto ? mesDoProjeto.ano : agora.getFullYear());
    var mesIndex = mesDoProjeto ? mesDoProjeto.mesIndex : agora.getMonth();
    var pastaAno = getOuCriarSubpasta(pastaPublicacoes, ano);
    var pastaMes = getOuCriarPastaMes(pastaAno, mesIndex);

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

/**
 * Vincula manualmente a pasta certa do Drive numa tarefa — pra quando a
 * detecção/criação automática (criarPastaDoCardNoDrive) erra o caminho
 * (ex: a pasta já existia com um nome levemente diferente do título da
 * tarefa). Confere se o link é mesmo de uma pasta acessível do Drive
 * antes de salvar (nunca salva um link quebrado/sem acesso sem avisar).
 */
function linkarPastaManualNoDrive(taskId, url) {
  if (!taskId || !url) return { ok: false, error: 'Faltou o id da tarefa ou o link da pasta.' };
  var match = String(url).match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) return { ok: false, error: 'Isso não parece um link de pasta do Google Drive.' };
  try {
    var pasta = DriveApp.getFolderById(match[1]); // dispara erro se não existir/sem acesso
    salvarPastaDoCard(taskId, pasta.getUrl());
    return { ok: true, url: pasta.getUrl() };
  } catch (err) {
    return { ok: false, error: 'Não consegui acessar essa pasta — confere se o link está certo e se você tem acesso a ela.' };
  }
}

/**
 * Recebe um arquivo arrastado pro card no navegador e sobe pra pasta do
 * Drive dele — cria a pasta na hora se ainda não existir (mesmo caminho de
 * criarPastaDoCardNoDrive, então nunca duplica uma pasta que já existe).
 * O nome final segue o padrão da agência (ver nomeArquivoPadronizado logo
 * abaixo): "<título do card> - vN.<extensão>", numerando a versão sozinho.
 */
function subirArquivoNoCard(dados) {
  if (!dados || !dados.taskId || !dados.nomeArquivo || !dados.base64Dados) {
    return { ok: false, error: 'Dados do arquivo incompletos.' };
  }
  var pastaInfo = criarPastaDoCardNoDrive(dados.cliente, dados.tituloCard, dados.taskId, dados.projeto);
  if (!pastaInfo.ok) return pastaInfo;

  try {
    var pastaCard = DriveApp.getFolderById(extrairIdDeUrlDrive(pastaInfo.url));
    var nomeFinal = nomeArquivoPadronizado(pastaCard, dados.tituloCard, dados.nomeArquivo);
    var bytes = Utilities.base64Decode(dados.base64Dados);
    var blob = Utilities.newBlob(bytes, dados.mimeType || 'application/octet-stream', nomeFinal);
    var arquivo = pastaCard.createFile(blob);
    // O cache de 15s de `buscarUploadsRecentesDoCard` foi feito pro
    // POLLING de 8s, não pra este momento: sem limpar, a fala da Bee sobre
    // o arquivo novo podia demorar até 15 segundos pra aparecer depois de
    // um upload que acabou de acontecer aqui dentro. Quem escreve na
    // pasta é quem sabe que o que estava guardado ficou velho.
    invalidarCacheDeUploadsDoCard(dados.taskId);
    // Mesmo motivo, pro cache de 90s da varredura de versões que a fila de
    // conferência usa (ver listarVersoesDasPecas, AprovacaoInterna.gs):
    // sem isso, "subiu a v2" demoraria até 90s pra aparecer na conferência.
    invalidarCacheDeVersoesDasPecas(dados.taskId);
    return { ok: true, url: arquivo.getUrl(), nomeFinal: nomeFinal, pastaUrl: pastaInfo.url };
  } catch (err) {
    return { ok: false, error: 'Erro ao subir o arquivo: ' + err.message };
  }
}

/**
 * Monta o nome padrão da agência pra um arquivo novo dentro da pasta do
 * card: "<título do card> - vN.<extensão>". A versão (vN) é calculada
 * sozinha, olhando o que já tem na pasta com essa mesma base de nome —
 * primeiro upload vira "v1", o próximo "v2", e assim por diante. Isso já
 * deixa o material pronto pra uma comparação futura "o que mudou da V1 pra
 * V2" (ideia pendente, ver CLAUDE.md).
 *
 * Sanitiza caracteres que o Drive aceita mas Windows/Mac não usariam num
 * nome de arquivo (: / \ * ? " < > |), pra não dar dor de cabeça em quem
 * baixar o arquivo depois.
 */
function nomeArquivoPadronizado(pastaCard, tituloCard, nomeOriginal) {
  var pontoIdx = nomeOriginal.lastIndexOf('.');
  var extensao = pontoIdx > -1 ? nomeOriginal.substring(pontoIdx) : '';
  var baseBruta = tituloCard || nomeOriginal.substring(0, pontoIdx > -1 ? pontoIdx : nomeOriginal.length);
  var base = String(baseBruta).replace(/[\/\\:*?"<>|]/g, '-').trim().substring(0, 80);

  var escapado = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp('^' + escapado + ' - v(\\d+)', 'i');
  var maiorVersao = 0;
  var arquivos = pastaCard.getFiles();
  while (arquivos.hasNext()) {
    var m = arquivos.next().getName().match(re);
    if (m) {
      var v = parseInt(m[1], 10);
      if (v > maiorVersao) maiorVersao = v;
    }
  }
  return base + ' - v' + (maiorVersao + 1) + extensao;
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
function chaveDoCacheDeUploads(taskId) {
  return 'uploadsCard_' + taskId;
}

/**
 * Joga fora o que está guardado sobre os uploads desta tarefa. Chamada
 * por quem ACABOU de mexer na pasta (ver subirArquivoNoCard) — o cache
 * existe pro polling de 8s não varrer o Drive toda hora, e não deve
 * atrasar a fala da Bee sobre um arquivo que o próprio Colmeia subiu.
 */
function invalidarCacheDeUploadsDoCard(taskId) {
  if (!taskId) return;
  try {
    CacheService.getScriptCache().remove(chaveDoCacheDeUploads(taskId));
  } catch (e) { /* cache indisponível: a próxima varredura resolve sozinha */ }
}

function buscarUploadsRecentesDoCard(taskId, cliente) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  // Cache curto (15s) pra não varrer a pasta do mês inteira do cliente
  // (com todas as subpastas) a cada 8s que o front-end faz polling
  // enquanto o card fica aberto — isso que estava deixando a notificação
  // de upload lenta. Com o cache, só 1 em cada ~2 checagens bate no Drive
  // de verdade; as outras usam o resultado recém-calculado.
  var chaveCache = chaveDoCacheDeUploads(taskId);
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(chaveCache);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* recalcula abaixo */ }
  }

  var uploadsDaPastaDoCard = [];
  var pastaCardUrl = null;
  var pastaCardNome = null;
  var salvo = buscarPastaSalvaDoCard(taskId);
  if (salvo.ok && salvo.url) {
    pastaCardUrl = salvo.url;
    var folderIdCard = extrairIdDeUrlDrive(salvo.url);
    if (folderIdCard) {
      try {
        var folderCard = DriveApp.getFolderById(folderIdCard);
        pastaCardNome = folderCard.getName(); // nome real da pasta (não um texto fixo)
        uploadsDaPastaDoCard = listarUploadsRecentesDaPasta(folderCard);
      } catch (e) { /* segue mesmo assim pra checagem do mês */ }
    }
  }

  var uploadsDoMes = [];
  var pastaMesUrl = null;
  var pastaMesNome = null;
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
        pastaMesNome = pastaMes.getName();
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
    // Nome de verdade da pasta (normalmente o próprio título da tarefa),
    // não mais um texto fixo tipo "pasta do card" — isso fazia a
    // notificação no front-end mostrar "na pasta pasta do card".
    pastaNome: pastaCardNome || pastaMesNome || null
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
    // id + mimeType: o front-end usa isso pra saber se o arquivo é uma
    // imagem (PNG/JPG) e, se for, buscar uma miniatura pra mostrar dentro
    // da própria fala da Bee (ver buscarThumbnailDrive/buscarImagemCheiaDrive
    // mais abaixo e renderNotificacoesUpload em js/notificacoes-uploads.js).
    uploads.push({
      arquivo: arq.getName(),
      quando: criadoEm,
      quem: nomeDeQuemSubiuArquivo(arq),
      id: arq.getId(),
      mimeType: arq.getMimeType()
    });
  }
  return uploads;
}

/**
 * TODOS os arquivos que já passaram pela pasta do card, sem corte de
 * tempo (diferente de buscarUploadsRecentesDoCard, que só olha os
 * últimos 30 min) — usado pela "História da peça" (ver
 * buscarHistoriaDaTarefa, Código.gs), a linha do tempo dentro do card.
 */
function buscarHistoricoDeArquivosDoCard(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var salvo = buscarPastaSalvaDoCard(taskId);
  if (!salvo.ok || !salvo.url) return { ok: true, arquivos: [] };
  var folderId = extrairIdDeUrlDrive(salvo.url);
  if (!folderId) return { ok: true, arquivos: [] };
  try {
    var pasta = DriveApp.getFolderById(folderId);
    var arquivos = [];
    var iter = pasta.getFiles();
    while (iter.hasNext()) {
      var arq = iter.next();
      arquivos.push({ nome: arq.getName(), quando: arq.getDateCreated().getTime() });
    }
    return { ok: true, arquivos: arquivos };
  } catch (e) {
    // Pasta ainda não existe, ou id salvo ficou inválido — a linha do
    // tempo só fica sem os eventos de arquivo, não quebra o resto.
    return { ok: true, arquivos: [] };
  }
}

// ============ PREVIEW DE IMAGEM DO DRIVE (dentro do Colmeia) ============
// Duas ações separadas de propósito: a miniatura (getThumbnail) é um JPEG
// baixinho que o próprio Google já gera, rápida de buscar — usada no
// preview pequeno dentro da fala da Bee. A imagem cheia (getBlob) só é
// buscada quando a pessoa CLICA pra ampliar, porque é mais pesada.
// Passar pelo backend (em vez de linkar a URL do Drive direto na tag
// <img>) evita o problema de permissão: nem todo arquivo tem
// "qualquer pessoa com o link" habilitado, e a conta de serviço do
// Apps Script já tem acesso à pasta de qualquer jeito.
function buscarThumbnailDrive(fileId) {
  if (!fileId) return { ok: false, error: 'fileId não informado.' };
  try {
    var arquivo = DriveApp.getFileById(fileId);
    var thumb = arquivo.getThumbnail();
    if (!thumb) return { ok: false, error: 'Esse arquivo não tem miniatura.' };
    return {
      ok: true,
      base64: Utilities.base64Encode(thumb.getBytes()),
      mimeType: thumb.getContentType() || 'image/jpeg'
    };
  } catch (err) {
    return { ok: false, error: 'Erro ao buscar a miniatura: ' + err.message };
  }
}

function buscarImagemCheiaDrive(fileId) {
  if (!fileId) return { ok: false, error: 'fileId não informado.' };

  // CAMINHO NOVO (2026-08-10): se a imagem já está publicada no Storage —
  // ou se der pra publicar agora —, devolve só o ENDEREÇO dela. A resposta
  // deixa de carregar megabytes de texto, o navegador passa a guardar a
  // imagem (segunda visita instantânea) e some o teto de 25 MB de baixo.
  //
  // Falhar aqui não é erro: cai no base64 de sempre, logo abaixo. Ver
  // Storage.gs pro porquê disso ser um atalho e não uma dependência.
  var url = urlPublicaDaPeca(fileId);
  if (url) return { ok: true, url: url };

  try {
    var arquivo = DriveApp.getFileById(fileId);
    var blob = arquivo.getBlob();
    var bytes = blob.getBytes();
    // Mesmo limite e mesmo motivo do baixarDocumentoAnexo (RunrunLeitura.gs):
    // acima disso não cabe direito na resposta do Apps Script.
    var LIMITE_BYTES = 25 * 1024 * 1024;
    if (bytes.length > LIMITE_BYTES) {
      return { ok: false, arquivoGrande: true, error: 'Essa imagem tem ' + Math.round(bytes.length / 1024 / 1024) + ' MB, grande demais pra abrir por aqui. Abre direto no Drive.' };
    }
    return {
      ok: true,
      base64: Utilities.base64Encode(bytes),
      mimeType: blob.getContentType() || 'image/jpeg'
    };
  } catch (err) {
    return { ok: false, error: 'Erro ao buscar a imagem: ' + err.message };
  }
}

// ============ ATIVIDADES DO DRIVE (aba "Histórico" > Atividades recentes) ============
var JANELA_ATIVIDADES_DRIVE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
var MAX_ATIVIDADES_DRIVE = 30;

/**
 * Busca os arquivos mais recentes enviados pelo PRÓPRIO designer (filtra
 * por dono do arquivo no Drive == o e-mail dele em RUNRUN_USUARIOS) — cada
 * um só vê a própria atividade, não a dos outros. Usa DriveApp.searchFiles
 * (busca indexada do Google, rápida) em vez de varrer pasta por pasta de
 * cada cliente: mesma estratégia já confirmada rápida no
 * painel-designers-beeon (calcularAtividadesDrive() de lá, que o Cláudio
 * mandou de referência em 2026-07-28) — a versão anterior daqui varria
 * pasta por pasta e além de lenta ainda dava erro de chave de cache grande
 * demais quando o designer tinha muitos clientes.
 * Cacheado por 3 minutos (ainda precisa subir a árvore de pastas pra
 * descobrir o cliente de cada arquivo, que é a parte mais lenta).
 */
function buscarAtividadesDrive(designer) {
  if (!designer) return { ok: true, atividades: [] };

  var email = null;
  for (var e in RUNRUN_USUARIOS) {
    if (RUNRUN_USUARIOS[e].toLowerCase().trim() === designer.toLowerCase().trim()) { email = e; break; }
  }
  if (!email) return { ok: true, atividades: [] }; // designer sem e-mail conhecido — não tem como filtrar por dono

  var chaveCache = 'atividadesDrive_' + email;
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(chaveCache);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (err) { /* recalcula abaixo */ }
  }

  try {
    var beeonFolder = DriveApp.getFolderById(ROOT_FOLDER_ID_DRIVE);
    var clientesFolder = (beeonFolder.getName() === 'Clientes') ? beeonFolder : getSubfolderPorNome(beeonFolder, 'Clientes');
    if (!clientesFolder) return { ok: false, error: 'Pasta "Clientes" não encontrada dentro da pasta Beeon.' };
    var clientesId = clientesFolder.getId();

    var limite = new Date().getTime() - JANELA_ATIVIDADES_DRIVE_MS;
    var isoCutoff = Utilities.formatDate(new Date(limite), 'GMT', "yyyy-MM-dd'T'HH:mm:ss");
    var query = "modifiedDate > '" + isoCutoff + "' and trashed = false and mimeType != '" + MimeType.FOLDER + "' and '" + email + "' in owners";
    var resultados = DriveApp.searchFiles(query);

    var atividades = [];
    var cachePastas = {};
    var cacheBreadcrumbs = {};
    var checados = 0;
    while (resultados.hasNext() && checados < 60 && atividades.length < MAX_ATIVIDADES_DRIVE) {
      var arquivo = resultados.next();
      checados++;
      var quando = arquivo.getLastUpdated().getTime();
      if (quando < limite) continue;

      var pastasPais = arquivo.getParents();
      if (!pastasPais.hasNext()) continue;
      var pastaPublicacao = pastasPais.next();
      var parentId = pastaPublicacao.getId();

      var nomeCliente;
      if (cachePastas.hasOwnProperty(parentId)) {
        nomeCliente = cachePastas[parentId];
      } else {
        nomeCliente = acharClienteDaPastaDoDrive(pastaPublicacao, clientesId);
        cachePastas[parentId] = nomeCliente;
      }
      if (!nomeCliente) continue;

      var breadcrumb;
      if (cacheBreadcrumbs.hasOwnProperty(parentId)) {
        breadcrumb = cacheBreadcrumbs[parentId];
      } else {
        breadcrumb = montarBreadcrumbPasta(pastaPublicacao, clientesId);
        cacheBreadcrumbs[parentId] = breadcrumb;
      }

      atividades.push({
        cliente: nomeCliente,
        arquivo: arquivo.getName(),
        quando: quando,
        pastaUrl: pastaPublicacao.getUrl(),
        pastaNome: pastaPublicacao.getName(),
        breadcrumb: breadcrumb
      });
    }

    atividades.sort(function (a, b) { return b.quando - a.quando; });
    var resultado = { ok: true, atividades: atividades };
    try { cache.put(chaveCache, JSON.stringify(resultado), 180); } catch (err) { /* cache indisponível, segue sem ele */ }
    return resultado;
  } catch (err) {
    return { ok: false, error: 'Erro ao ler o Drive: ' + err.message };
  }
}

// A partir de uma pasta, sobe na árvore de pastas até achar "Clientes" — a
// pasta logo abaixo dela nesse caminho é o nome do cliente (mesma lógica
// do painel-designers-beeon, acharClienteDaPasta).
function acharClienteDaPastaDoDrive(pastaInicial, clientesId) {
  var atual = pastaInicial;
  var anterior = null;
  var profundidade = 0;
  while (atual && profundidade < 10) {
    if (atual.getId() === clientesId) {
      return anterior ? anterior.getName() : null;
    }
    anterior = atual;
    var pais = atual.getParents();
    atual = pais.hasNext() ? pais.next() : null;
    profundidade++;
  }
  return null;
}

// Monta o "caminho" da pasta pro card de atividade (ex: "Alden 348 >
// Publicações > 2026 > Julho") — sobe de pastaInicial até (mas sem
// incluir) a pasta "Clientes", juntando os nomes na ordem certa.
function montarBreadcrumbPasta(pastaInicial, clientesId) {
  var nomes = [];
  var atual = pastaInicial;
  var profundidade = 0;
  while (atual && profundidade < 10) {
    if (atual.getId() === clientesId) break;
    nomes.unshift(atual.getName());
    var pais = atual.getParents();
    atual = pais.hasNext() ? pais.next() : null;
    profundidade++;
  }
  return nomes.join(' > ');
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

// ============ BACKUP AUTOMÁTICO DA PLANILHA ============
// A planilha ativa deste script é o "banco de dados" do Colmeia
// (prioridades, Log de Plays, PastasCards, etc) — além do histórico de
// versões nativo do próprio Google Sheets (Arquivo > Histórico de
// versões, já existe sozinho, sem precisar de nada daqui), isso faz uma
// cópia completa e separada da planilha 1x por dia, guardada numa pasta
// à parte no Drive, apagando sozinho as cópias mais velhas que
// BACKUP_RETENCAO_DIAS pra não acumular pra sempre.
var BACKUP_PASTA_NOME = 'Backups Colmeia';
var BACKUP_RETENCAO_DIAS = 14;

function getOuCriarPastaBackups() {
  var pastas = DriveApp.getFoldersByName(BACKUP_PASTA_NOME);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(BACKUP_PASTA_NOME);
}

function fazerBackupDaPlanilha() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pastaBackups = getOuCriarPastaBackups();
    var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    var nomeBackup = ss.getName() + ' — backup ' + hoje;

    var arquivoOriginal = DriveApp.getFileById(ss.getId());
    var copia = arquivoOriginal.makeCopy(nomeBackup, pastaBackups);

    limparBackupsAntigos(pastaBackups);
    Logger.log('Backup criado: ' + copia.getUrl());
  } catch (err) {
    Logger.log('Erro ao fazer backup da planilha: ' + err.message);
  }
  // Aproveita a mesma passada diária pra podar o "Log de Plays" — ele só
  // crescia, e buscarPlaysDeHoje lê a aba INTEIRA a cada abertura da
  // página Histórico. Sem isso, a página vai ficando mais lenta pra
  // sempre. Roda depois do backup de propósito: a cópia do dia guarda o
  // histórico completo antes da poda.
  limparLogDePlaysAntigo();
  // Mesma ideia pras conversas com a Bee: elas somem 15 dias depois da
  // entrega da tarefa (ver limparConversasBeeAntigas em Bee.gs). Também
  // depois do backup, pra cópia do dia ainda ter tudo.
  try {
    limparConversasBeeAntigas();
  } catch (err) {
    Logger.log('Erro ao limpar conversas antigas da Bee: ' + err.message);
  }
  // E pro feed da aba Bee (ver FEED_RETENCAO_DIAS em Planilha.gs): sem
  // poda, a aba só cresce e buscarFeedEventos lê ela inteira toda vez
  // que alguém abre a aba.
  try {
    limparFeedEventosAntigos();
    limparMonitoramentoAntigo();
    limparArquivosPublicadosAntigos();
  } catch (err) {
    Logger.log('Erro ao limpar eventos antigos do feed: ' + err.message);
  }
  // E pros pedidos de atenção da Central (ver PEDIDOS_ATENCAO_RETENCAO_DIAS
  // em Planilha.gs): pedido de duas semanas atrás é sobre uma postagem que
  // já aconteceu — não serve mais pra evitar cobrança repetida.
  try {
    limparPedidosDeAtencaoAntigos();
  } catch (err) {
    Logger.log('Erro ao limpar pedidos de atenção antigos: ' + err.message);
  }
  // Mesma ideia pra fila da conferência interna (AprovacaoInterna.gs):
  // linha já decidida vira histórico e é podada em 30 dias. O que está
  // "pendente" nunca é apagado, por mais velho que seja — é trabalho em
  // aberto.
  try {
    limparConferenciasAntigas();
  } catch (err) {
    Logger.log('Erro ao limpar conferências antigas: ' + err.message);
  }
  // O e-mail diário da fila pro atendimento (AprovacaoInterna.gs). Pega
  // carona nesta passada diária em vez de ter gatilho próprio. Enquanto
  // EMAIL_FILA_LIGADO for false ele só escreve no log, sem mandar nada.
  try {
    enviarEmailDiarioDaFila();
  } catch (err) {
    Logger.log('Erro ao enviar o e-mail diário da fila: ' + err.message);
  }
  // Mesma ideia pra aba "Aprovacoes" (link que o cliente abre): linha já
  // decidida (aprovado/ajuste) vira histórico e é podada em 30 dias. O
  // que está "pendente" nunca é apagado.
  try {
    limparAprovacoesAntigas();
  } catch (err) {
    Logger.log('Erro ao limpar aprovações antigas: ' + err.message);
  }
  // Respostas de cliente que não chegaram na tarefa porque o Runrun.it
  // estava fora do ar na hora (ver reenviarAvisosDeAprovacaoPendentes,
  // Aprovacao.gs). A aba "Aprovações" também tenta a cada abertura — isso
  // aqui é a rede de segurança pro caso de ninguém abrir ela.
  try {
    var reenvio = reenviarAvisosDeAprovacaoPendentes();
    if (reenvio && reenvio.reenviados) {
      Logger.log('Avisos de aprovação reenviados: ' + reenvio.reenviados);
    }
  } catch (err) {
    Logger.log('Erro ao reenviar avisos de aprovação: ' + err.message);
  }
  // Reconstrói o índice de nomes do Drive (ver montarIndiceDoDrive em
  // Bee.gs) — é o que faz a busca da Bee ser instantânea em vez de
  // varrer o Drive a cada pergunta. Por último de propósito: é a parte
  // mais demorada, e se estourar o tempo do Apps Script o backup e a
  // limpeza já terminaram.
  try {
    var indice = montarIndiceDoDrive();
    Logger.log('Índice do Drive: ' + (indice.ok ? indice.itens + ' itens' : indice.error));
  } catch (err) {
    Logger.log('Erro ao montar o índice do Drive: ' + err.message);
  }
  // Mesma ideia pro índice de links dos comentários (ver montarIndiceDeLinks
  // em Bee.gs) — é o que faz "achar o link perdido" ser instantâneo.
  try {
    var indiceLinks = montarIndiceDeLinks();
    Logger.log('Índice de links: ' + (indiceLinks.ok ? indiceLinks.itens + ' itens' : indiceLinks.error));
  } catch (err) {
    Logger.log('Erro ao montar o índice de links: ' + err.message);
  }
}

function limparBackupsAntigos(pastaBackups) {
  var limite = new Date().getTime() - BACKUP_RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  var arquivos = pastaBackups.getFiles();
  while (arquivos.hasNext()) {
    var arq = arquivos.next();
    if (arq.getDateCreated().getTime() < limite) arq.setTrashed(true);
  }
}

/**
 * RODE ESTA FUNÇÃO UMA ÚNICA VEZ, manualmente, pelo editor do Apps
 * Script (escolha "configurarGatilhoBackup" no menu ao lado do botão
 * "Executar", clique em "Executar" e autorize o acesso ao Drive se
 * pedir) — isso configura o gatilho automático que faz backup 1x por
 * dia (de madrugada) sozinho, sem precisar de nenhuma ação do Colmeia.
 * Não precisa rodar de novo depois — o gatilho fica salvo.
 */
function configurarGatilhoBackup() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'fazerBackupDaPlanilha') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('fazerBackupDaPlanilha').timeBased().everyDays(1).atHour(3).create();
  fazerBackupDaPlanilha(); // já roda uma vez agora, pra não ficar sem nenhum backup até amanhã de madrugada
  Logger.log('Gatilho configurado: fazerBackupDaPlanilha vai rodar sozinho todo dia por volta das 3h da manhã.');
}
