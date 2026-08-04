/**
 * Link de aprovação pro cliente — pedido do Cláudio (2026-08-03): uma
 * página só com a peça e dois botões ("Aprovar" / "Pedir ajuste"), SEM
 * LOGIN nenhum pro cliente.
 *
 * Segurança: cada link carrega um CÓDIGO longo e aleatório
 * (Utilities.getUuid(), sem os traços — 32 caracteres), impossível de
 * adivinhar. Não tem senha porque não precisa: é o mesmo modelo de
 * segurança que o resto do backend do Colmeia já usa — quem tem a URL da
 * API + o dado certo (aqui, o código) consegue chamar a ação. Não existe
 * hoje nenhum token de sessão protegendo as ações do Colmeia (a "senha"
 * do login só controla a TELA, ver login/senha em Planilha.gs) — então
 * isso não abre nenhuma porta que já não estivesse aberta.
 *
 * A página pública em si (aprovar.html, na raiz do repositório) é HTML
 * puro publicado no mesmo GitHub Pages do resto do Colmeia — não precisa
 * de nada novo de hospedagem.
 *
 * ---------------------------------------------------------------------
 * Faz parte do backend do Colmeia, que era um Código.gs único de ~3.000
 * linhas e foi dividido por assunto. TODOS os arquivos .gs do projeto do
 * Apps Script compartilham o mesmo espaço de nomes — é como se ainda
 * fosse um arquivo só, então qualquer função aqui pode ser chamada de
 * qualquer outro arquivo, sem "importar" nada. As rotas continuam todas
 * no Código.gs.
 * ---------------------------------------------------------------------
 */

function getAprovacoesSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Aprovacoes');
  if (!sheet) {
    sheet = ss.insertSheet('Aprovacoes');
    sheet.getRange('A1:M1').setValues([[
      'codigo', 'taskId', 'cliente', 'tituloTarefa', 'fileId', 'nomeArquivo',
      'mimeType', 'criadoEm', 'status', 'respostaTexto', 'respondidoEm', 'autor', 'pins'
    ]]);
  }
  // Planilhas criadas antes dos pins (2026-08-04) não têm a coluna M —
  // cria ela sozinha na primeira vez que alguém ler/gravar depois dessa
  // versão (mesmo padrão de getLinksClientesSheet, Planilha.gs).
  if (sheet.getLastColumn() < 13) sheet.getRange(1, 13).setValue('pins');
  return sheet;
}

/**
 * Cria um link novo pra uma peça específica — pega a IMAGEM mais recente
 * da pasta do card no Drive (mesma varredura de compararVersoesDoCard,
 * Bee.gs: procura o maior "- vN" no nome; se não achar nenhuma com esse
 * padrão — ex: pasta com upload feito por fora do Colmeia — usa a
 * imagem mais recente da pasta, sem exigir o padrão de nome).
 *
 * Devolve só o CÓDIGO — quem chama (frontend) monta a URL completa,
 * porque só o frontend sabe o endereço de onde o Colmeia está publicado
 * hoje (ver ROTA_BASE, js/roteador-url.js — mesmo motivo de lá: assim
 * não quebra quando o domínio mudar pra colmeia.beeon.com.br).
 */
function gerarLinkDeAprovacao(taskId, cliente, tituloTarefa, autor) {
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

  var comPadrao = [];
  var semPadrao = [];
  var re = / - v(\d+)\.[^.]+$/i;
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var arq = arquivos.next();
    if (arq.getMimeType().indexOf('image/') !== 0) continue;
    var m = arq.getName().match(re);
    if (m) comPadrao.push({ versao: parseInt(m[1], 10), arquivo: arq });
    else semPadrao.push({ atualizadoEm: arq.getLastUpdated().getTime(), arquivo: arq });
  }

  var escolhido = null;
  if (comPadrao.length) {
    comPadrao.sort(function (a, b) { return b.versao - a.versao; });
    escolhido = comPadrao[0].arquivo;
  } else if (semPadrao.length) {
    semPadrao.sort(function (a, b) { return b.atualizadoEm - a.atualizadoEm; });
    escolhido = semPadrao[0].arquivo;
  }
  if (!escolhido) {
    return { ok: false, error: 'Não encontrei nenhuma imagem na pasta do card pra gerar o link.' };
  }

  var codigo = Utilities.getUuid().replace(/-/g, '');
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getAprovacoesSheet();
    sheet.appendRow([
      codigo, taskId, cliente || '', tituloTarefa || '', escolhido.getId(), escolhido.getName(),
      escolhido.getMimeType(), new Date().getTime(), 'pendente', '', '', autor || ''
    ]);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, codigo: codigo, nomeArquivo: escolhido.getName() };
}

/**
 * O que a página pública (aprovar.html) precisa pra se desenhar: nome do
 * arquivo/cliente/tarefa e a imagem em si (base64 — mesmo caminho de
 * buscarImagemCheiaDrive, Drive.gs). Devolve também o status atual —
 * se já foi respondido, a página mostra "você já respondeu" em vez dos
 * botões de novo, pra não deixar aprovar/pedir ajuste duas vezes.
 */
function buscarAprovacaoPublica(codigo) {
  if (!codigo) return { ok: false, error: 'Link inválido.' };
  var linha = acharLinhaDeAprovacao(codigo);
  if (!linha) return { ok: false, error: 'Não encontrei essa aprovação — o link pode estar errado.' };

  var imagem;
  try {
    var blob = DriveApp.getFileById(linha.fileId).getBlob();
    imagem = { base64: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType() };
  } catch (e) {
    return { ok: false, error: 'Não consegui carregar a imagem dessa aprovação — pode ter sido movida ou apagada do Drive.' };
  }

  return {
    ok: true,
    cliente: linha.cliente,
    tituloTarefa: linha.tituloTarefa,
    nomeArquivo: linha.nomeArquivo,
    status: linha.status,
    respostaTexto: linha.respostaTexto,
    pins: parsearPins(linha.pins),
    base64: imagem.base64,
    mimeType: imagem.mimeType
  };
}

function parsearPins(json) {
  if (!json) return [];
  try {
    var lista = JSON.parse(json);
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

/**
 * O cliente respondeu (Aprovar ou Pedir ajuste). Grava a resposta + os
 * PINS (pontos marcados na imagem — ver aprovar.html, pedido do Cláudio
 * 2026-08-04: "ícones de pins pro cliente marcar algo na arte") E avisa
 * o designer com um comentário automático na tarefa — fecha o ciclo sem
 * precisar de mais nenhuma tela (mesmo espírito do "comenta sozinho" do
 * upload arrastado, ver subirArquivoNoCard, Drive.gs).
 *
 * Os pins não viram imagem marcada dentro do comentário do Runrun.it
 * (o Apps Script não tem como desenhar em cima da imagem) — o
 * comentário lista o texto de cada pin numerado e aponta de volta pro
 * MESMO link de aprovação, que passa a mostrar os pins de verdade,
 * sobre a imagem, na posição exata onde o cliente marcou.
 */
function responderAprovacaoPublica(codigo, aprovado, respostaTexto, pins) {
  if (!codigo) return { ok: false, error: 'Link inválido.' };

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  var linha;
  try {
    var sheet = getAprovacoesSheet();
    var linhas = sheet.getDataRange().getValues();
    var indice = -1;
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(codigo)) { indice = i; break; }
    }
    if (indice === -1) { lock.releaseLock(); return { ok: false, error: 'Não encontrei essa aprovação.' }; }
    linha = linhaParaObjetoDeAprovacao(linhas[indice]);
    if (linha.status !== 'pendente') {
      lock.releaseLock();
      return { ok: true, jaRespondido: true, status: linha.status, respostaTexto: linha.respostaTexto, pins: parsearPins(linha.pins) };
    }
    var status = aprovado ? 'aprovado' : 'ajuste';
    var pinsTexto = (pins && pins.length) ? JSON.stringify(pins) : '';
    sheet.getRange(indice + 1, 9, 1, 3).setValues([[status, respostaTexto || '', new Date().getTime()]]);
    sheet.getRange(indice + 1, 13).setValue(pinsTexto);
    linha.status = status;
    linha.pins = pinsTexto;
  } finally {
    lock.releaseLock();
  }

  try {
    var pinsList = parsearPins(linha.pins);
    // Cabeçalho fixo "Alterações do cliente" — pedido do Cláudio
    // (2026-08-04): o comentário sai sempre com a conta dele (é o
    // coordenador, tudo bem usar a foto dele), mas o texto tem que
    // deixar claro na hora que é o CLIENTE falando, relayed através do
    // link de aprovação — não uma opinião pessoal dele.
    var partes = ['Alterações do cliente (via link de aprovação):'];
    partes.push(aprovado
      ? '✅ Aprovou "' + linha.nomeArquivo + '".'
      : '✏️ Pediu ajuste em "' + linha.nomeArquivo + '".');
    if (respostaTexto) partes.push(respostaTexto);
    if (pinsList.length) {
      partes.push((pinsList.length === 1 ? '1 ponto marcado' : pinsList.length + ' pontos marcados') +
        ' na imagem — abre o link de aprovação de novo pra ver exatamente onde:');
      pinsList.forEach(function (p, i) {
        partes.push((i + 1) + '. ' + (p.texto || '(sem descrição)'));
      });
    }
    // Sem "autor" — cai sozinho na conta padrão (o coordenador), de
    // propósito: não é a conta de quem gerou o link, é sempre a mesma.
    adicionarComentario(linha.taskId, partes.join('\n'), null);
  } catch (e) { /* a resposta já foi salva na planilha — o comentário é um extra, não trava por causa dele */ }

  return { ok: true, status: linha.status };
}

function linhaParaObjetoDeAprovacao(linha) {
  return {
    codigo: linha[0], taskId: linha[1], cliente: linha[2], tituloTarefa: linha[3],
    fileId: linha[4], nomeArquivo: linha[5], mimeType: linha[6], criadoEm: linha[7],
    status: linha[8], respostaTexto: linha[9], respondidoEm: linha[10], autor: linha[11],
    pins: linha[12] || ''
  };
}

/**
 * Lista as aprovações já enviadas de um cliente, mais recente primeiro —
 * pedido do Cláudio (2026-08-04): "ver os que foram enviados daquele
 * cliente, o que está esperando aprovação ou que teve ajustes", pra
 * organizar isso dentro do Hub do cliente (ver abrirHubDoCliente,
 * js/paginas-designers.js). Só as últimas 30, pra não devolver o
 * histórico inteiro de um cliente antigo.
 */
function listarAprovacoesDoCliente(cliente) {
  if (!cliente) return { ok: false, error: 'cliente não informado.' };
  var sheet = getAprovacoesSheet();
  var linhas = sheet.getDataRange().getValues();
  var alvo = normalizarNomeParaComparar(cliente);
  var lista = [];
  for (var i = 1; i < linhas.length; i++) {
    if (normalizarNomeParaComparar(linhas[i][2]) !== alvo) continue;
    var obj = linhaParaObjetoDeAprovacao(linhas[i]);
    lista.push({
      codigo: obj.codigo,
      taskId: obj.taskId,
      tituloTarefa: obj.tituloTarefa,
      nomeArquivo: obj.nomeArquivo,
      status: obj.status,
      criadoEm: obj.criadoEm,
      respondidoEm: obj.respondidoEm,
      respostaTexto: obj.respostaTexto
    });
  }
  lista.sort(function (a, b) { return b.criadoEm - a.criadoEm; });
  return { ok: true, aprovacoes: lista.slice(0, 30) };
}

function acharLinhaDeAprovacao(codigo) {
  var sheet = getAprovacoesSheet();
  var linhas = sheet.getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(codigo)) return linhaParaObjetoDeAprovacao(linhas[i]);
  }
  return null;
}
