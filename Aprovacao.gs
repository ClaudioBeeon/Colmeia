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
  // Coluna N: "1" enquanto o aviso na tarefa não saiu porque o Runrun.it
  // estava fora do ar (ver reenviarAvisosDeAprovacaoPendentes).
  if (sheet.getLastColumn() < 14) sheet.getRange(1, 14).setValue('aviso_pendente');
  // Coluna O: o nome que o CLIENTE digitou na caixinha "Quem está
  // aprovando?" (pedido do Cláudio, 2026-08-05) — só existe quando ele
  // aprovou; pedido de ajuste não pergunta isso.
  if (sheet.getLastColumn() < 15) sheet.getRange(1, 15).setValue('quem_aprovou');
  return sheet;
}

/**
 * Agrupa as imagens/vídeos da pasta do card em PEÇAS distintas — pedido
 * do Cláudio (2026-08-04): "quando sobe duas versões, stories e feed?
 * já aparece no mesmo link quando tem mais de uma opção?". Não aparecia:
 * antes, gerarLinkDeAprovacao varria a pasta inteira e escolhia UM
 * arquivo (o de maior "- vN"), então "Feed - v1" e "Stories - v1" (duas
 * peças de verdade, não duas versões da mesma) empatavam e uma delas
 * sumia sem avisar.
 *
 * O nome ANTES do "- vN" é o que define a peça (ex: "Feed - v1.png" e
 * "Feed - v2.png" são a MESMA peça, fica só a v2; "Stories - v1.mp4" é
 * outra peça). Arquivo sem esse padrão vira peça própria, pelo nome
 * inteiro. Usado pelo front pra mostrar uma escolha quando tem mais de
 * uma peça — com só uma, gera o link direto, sem perguntar nada.
 */
function listarPecasDaPastaDoCard(taskId) {
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

  var re = / - v(\d+)\.[^.]+$/i;
  var grupos = {}; // nome-base -> {versao, atualizadoEm, arquivo}
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var arq = arquivos.next();
    var tipo = arq.getMimeType();
    if (tipo.indexOf('image/') !== 0 && tipo.indexOf('video/') !== 0) continue;
    var nome = arq.getName();
    var m = nome.match(re);
    var chave = m ? nome.slice(0, m.index) : nome;
    var atual = grupos[chave];
    if (m) {
      var versao = parseInt(m[1], 10);
      if (!atual || atual.versao === null || versao > atual.versao) {
        grupos[chave] = { versao: versao, atualizadoEm: arq.getLastUpdated().getTime(), arquivo: arq };
      }
    } else {
      var quando = arq.getLastUpdated().getTime();
      if (!atual || quando > atual.atualizadoEm) {
        grupos[chave] = { versao: null, atualizadoEm: quando, arquivo: arq };
      }
    }
  }

  var lista = Object.keys(grupos).map(function (chave) {
    var g = grupos[chave];
    return { fileId: g.arquivo.getId(), nome: g.arquivo.getName(), mimeType: g.arquivo.getMimeType(), atualizadoEm: g.atualizadoEm };
  });
  lista.sort(function (a, b) { return b.atualizadoEm - a.atualizadoEm; });
  return { ok: true, pecas: lista };
}

/**
 * Cria um link novo pra uma peça específica. Se `fileId` vier (pessoa
 * escolheu entre várias peças — ver listarPecasDaPastaDoCard), usa esse
 * arquivo direto. Sem `fileId` (caminho de sempre, pasta com uma peça
 * só), varre a pasta e pega a IMAGEM ou VÍDEO mais recente (mesma lógica
 * de versão "- vN" de compararVersoesDoCard, Bee.gs).
 *
 * Devolve só o CÓDIGO — quem chama (frontend) monta a URL completa,
 * porque só o frontend sabe o endereço de onde o Colmeia está publicado
 * hoje (ver ROTA_BASE, js/roteador-url.js — mesmo motivo de lá: assim
 * não quebra quando o domínio mudar pra colmeia.beeon.com.br).
 */
function gerarLinkDeAprovacao(taskId, cliente, tituloTarefa, autor, fileId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var escolhido = null;
  // `fileId` pode vir como LISTA (o Cláudio escolheu 2 vídeos pra mandar
  // no mesmo link) ou como um id só (caminho de sempre). Normaliza os
  // dois no mesmo formato pra não ter dois caminhos de código.
  var idsEscolhidos = Array.isArray(fileId) ? fileId.filter(function (x) { return !!x; }) : (fileId ? [fileId] : []);

  if (idsEscolhidos.length > 1) {
    var arquivos = [];
    for (var iId = 0; iId < idsEscolhidos.length; iId++) {
      var arqEscolhido;
      try {
        arqEscolhido = DriveApp.getFileById(idsEscolhidos[iId]);
      } catch (eMulti) {
        return { ok: false, error: 'Não consegui acessar um dos arquivos escolhidos no Drive.' };
      }
      var tipoMulti = arqEscolhido.getMimeType();
      if (tipoMulti.indexOf('image/') !== 0 && tipoMulti.indexOf('video/') !== 0) {
        return { ok: false, error: 'Um dos arquivos escolhidos não é imagem nem vídeo.' };
      }
      liberarArquivoParaAprovacao(arqEscolhido);
      arquivos.push(arqEscolhido);
    }
    return gravarLinhaDeAprovacao(taskId, cliente, tituloTarefa, autor, arquivos);
  }

  if (idsEscolhidos.length === 1) {
    try {
      escolhido = DriveApp.getFileById(idsEscolhidos[0]);
    } catch (e) {
      return { ok: false, error: 'Não consegui acessar esse arquivo no Drive.' };
    }
    var tipoEscolhido = escolhido.getMimeType();
    if (tipoEscolhido.indexOf('image/') !== 0 && tipoEscolhido.indexOf('video/') !== 0) {
      return { ok: false, error: 'Esse arquivo não é imagem nem vídeo.' };
    }
  } else {
    var pastaInfo = buscarPastaSalvaDoCard(taskId);
    if (!pastaInfo.ok || !pastaInfo.url) {
      return { ok: false, error: 'Essa tarefa ainda não tem uma pasta do card vinculada no Drive. Crie a pasta do card primeiro.' };
    }

    var pasta;
    try {
      pasta = DriveApp.getFolderById(extrairIdDeUrlDrive(pastaInfo.url));
    } catch (e2) {
      return { ok: false, error: 'Não consegui acessar a pasta do card no Drive.' };
    }

    var comPadrao = [];
    var semPadrao = [];
    var re = / - v(\d+)\.[^.]+$/i;
    var arquivos = pasta.getFiles();
    while (arquivos.hasNext()) {
      var arq = arquivos.next();
      var tipo = arq.getMimeType();
      // Aceita imagem OU vídeo — antes só imagem, e um card com Stories
      // em vídeo dava "não encontrei nenhuma imagem" mesmo tendo arquivo
      // novo na pasta (pedido do Cláudio, 2026-08-04).
      if (tipo.indexOf('image/') !== 0 && tipo.indexOf('video/') !== 0) continue;
      var m = arq.getName().match(re);
      if (m) comPadrao.push({ versao: parseInt(m[1], 10), arquivo: arq });
      else semPadrao.push({ atualizadoEm: arq.getLastUpdated().getTime(), arquivo: arq });
    }

    if (comPadrao.length) {
      comPadrao.sort(function (a, b) { return b.versao - a.versao; });
      escolhido = comPadrao[0].arquivo;
    } else if (semPadrao.length) {
      semPadrao.sort(function (a, b) { return b.atualizadoEm - a.atualizadoEm; });
      escolhido = semPadrao[0].arquivo;
    }
    if (!escolhido) {
      return { ok: false, error: 'Não encontrei nenhuma imagem ou vídeo na pasta do card pra gerar o link.' };
    }
  }

  liberarArquivoParaAprovacao(escolhido);
  return gravarLinhaDeAprovacao(taskId, cliente, tituloTarefa, autor, [escolhido]);
}

/**
 * Grava a linha da aprovação. Vários arquivos são guardados na MESMA
 * célula, separados por "|" — id do Drive nunca tem esse caractere, e
 * assim nada muda pra quem lê uma linha antiga (um id só continua sendo
 * uma lista de um item, ver idsDaLinhaDeAprovacao).
 */
function gravarLinhaDeAprovacao(taskId, cliente, tituloTarefa, autor, arquivos) {
  var ids = arquivos.map(function (a) { return a.getId(); }).join('|');
  var nomes = arquivos.map(function (a) { return a.getName(); }).join('|');
  var tipos = arquivos.map(function (a) { return a.getMimeType(); }).join('|');

  var codigo = Utilities.getUuid().replace(/-/g, '');
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getAprovacoesSheet();
    sheet.appendRow([
      codigo, taskId, cliente || '', tituloTarefa || '', ids, nomes,
      tipos, new Date().getTime(), 'pendente', '', '', autor || ''
    ]);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    codigo: codigo,
    nomeArquivo: arquivos.map(function (a) { return a.getName(); }).join(', '),
    quantasPecas: arquivos.length
  };
}

/**
 * Deixa o arquivo visível por "qualquer pessoa com o link" — decisão do
 * Cláudio (2026-08-04), e é o que faz VÍDEO funcionar na página pública.
 *
 * Por que é obrigatório pra vídeo: a página de aprovação não tem login, e
 * o cliente não tem conta no Drive da Beeon. Imagem a gente consegue
 * mandar embutida na resposta (base64), mas vídeo estoura o limite de
 * 25MB do Apps Script na primeira tentativa — a única forma que funciona
 * é o player do próprio Drive, que exige o arquivo acessível.
 *
 * Libera SÓ o arquivo mandado pra aprovação, nunca a pasta: o resto do
 * Drive continua privado. Falhar aqui não impede gerar o link (imagem
 * continua funcionando por base64) — por isso não estoura erro.
 */
function liberarArquivoParaAprovacao(arquivo) {
  try {
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // Drive compartilhado com política restritiva, arquivo de terceiro,
    // etc. A imagem ainda vai por base64; o vídeo é que não vai abrir.
    Logger.log('Não consegui liberar o arquivo pra aprovação: ' + e.message);
  }
}

/** Uma célula pode ter vários ids separados por "|" (ver gravarLinhaDeAprovacao). */
function idsDaLinhaDeAprovacao(valor) {
  return String(valor || '').split('|').filter(function (x) { return !!x; });
}

/**
 * O que a página pública (aprovar.html) precisa pra se desenhar: nome do
 * arquivo/cliente/tarefa e a peça em si (base64 — mesmo caminho de
 * buscarImagemCheiaDrive, Drive.gs — imagem OU vídeo, ver 2026-08-04).
 * Devolve também o status atual — se já foi respondido, a página mostra
 * "você já respondeu" em vez dos botões de novo, pra não deixar
 * aprovar/pedir ajuste duas vezes.
 */
function buscarAprovacaoPublica(codigo) {
  if (!codigo) return { ok: false, error: 'Link inválido.' };
  var linha = acharLinhaDeAprovacao(codigo);
  if (!linha) return { ok: false, error: 'Não encontrei essa aprovação — o link pode estar errado.' };

  // Um link pode ter VÁRIAS peças (ver gravarLinhaDeAprovacao). Uma peça
  // que falhar não derruba as outras: ela vira um item com `erro`, e a
  // página mostra o aviso só naquele quadro.
  var ids = idsDaLinhaDeAprovacao(linha.fileId);
  var nomes = String(linha.nomeArquivo || '').split('|');
  if (!ids.length) {
    return { ok: false, error: 'Esse link não tem nenhuma peça vinculada.' };
  }

  var pecas = ids.map(function (id, i) {
    var nomeFallback = nomes[i] || linha.nomeArquivo || '';
    var arquivo;
    try {
      arquivo = DriveApp.getFileById(id);
    } catch (e) {
      return { nome: nomeFallback, erro: 'Não consegui carregar essa peça — pode ter sido movida ou apagada do Drive.' };
    }

    var tipo = arquivo.getMimeType();

    // VÍDEO nunca vai embutido: um vídeo passa dos 25MB que cabem na
    // resposta do Apps Script já na primeira tentativa (era exatamente
    // isso que dava "pode ter sido movida ou apagada do Drive" mesmo com
    // o arquivo lá — o erro real era de tamanho, não de arquivo sumido).
    // Em vez disso, o player do próprio Drive por iframe.
    if (tipo.indexOf('video/') === 0) {
      liberarArquivoParaAprovacao(arquivo); // garante links antigos também
      return {
        nome: arquivo.getName(),
        mimeType: tipo,
        ehVideo: true,
        previewUrl: 'https://drive.google.com/file/d/' + id + '/preview'
      };
    }

    try {
      var blob = arquivo.getBlob();
      var bytes = blob.getBytes();
      var LIMITE_BYTES = 25 * 1024 * 1024;
      if (bytes.length > LIMITE_BYTES) {
        // Imagem gigante: em vez de falhar, cai no mesmo player do Drive.
        liberarArquivoParaAprovacao(arquivo);
        return {
          nome: arquivo.getName(), mimeType: tipo, ehVideo: false,
          previewUrl: 'https://drive.google.com/file/d/' + id + '/preview'
        };
      }
      return {
        nome: arquivo.getName(),
        mimeType: blob.getContentType(),
        ehVideo: false,
        base64: Utilities.base64Encode(bytes)
      };
    } catch (e2) {
      return { nome: nomeFallback, erro: 'Não consegui carregar essa peça — pode ter sido movida ou apagada do Drive.' };
    }
  });

  var primeira = pecas[0];
  return {
    ok: true,
    cliente: linha.cliente,
    tituloTarefa: linha.tituloTarefa,
    nomeArquivo: linha.nomeArquivo,
    status: linha.status,
    respostaTexto: linha.respostaTexto,
    quemAprovou: linha.quemAprovou,
    pins: parsearPins(linha.pins),
    pecas: pecas,
    // Campos antigos, só pra uma aba já aberta com a versão anterior do
    // aprovar.html não quebrar de vez enquanto o GitHub Pages atualiza.
    base64: primeira.base64 || null,
    mimeType: primeira.mimeType || null
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
 *
 * `quemRespondeu` (pedido do Cláudio, 2026-08-05: "pra gente ter um
 * controle e saber quem aprovou") — o nome que o cliente escreveu numa
 * caixinha antes de confirmar a APROVAÇÃO (aprovar.html pergunta isso só
 * nesse caminho; pedido de ajuste continua sem perguntar, o texto do
 * pedido já identifica o suficiente). Fica gravado na planilha e entra
 * no comentário automático, pra saber de quem foi o "sim" se precisar
 * confirmar depois.
 */
function responderAprovacaoPublica(codigo, aprovado, respostaTexto, pins, quemRespondeu) {
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
      return { ok: true, jaRespondido: true, status: linha.status, respostaTexto: linha.respostaTexto, pins: parsearPins(linha.pins), quemAprovou: linha.quemAprovou };
    }
    var status = aprovado ? 'aprovado' : 'ajuste';
    var pinsTexto = (pins && pins.length) ? JSON.stringify(pins) : '';
    var nomeAprovador = aprovado ? String(quemRespondeu || '').trim() : '';
    sheet.getRange(indice + 1, 9, 1, 3).setValues([[status, respostaTexto || '', new Date().getTime()]]);
    sheet.getRange(indice + 1, 13).setValue(pinsTexto);
    sheet.getRange(indice + 1, 15).setValue(nomeAprovador);
    linha.status = status;
    linha.pins = pinsTexto;
    linha.quemAprovou = nomeAprovador;
  } finally {
    lock.releaseLock();
  }

  var avisoChegou = false;
  try {
    var pinsList = parsearPins(linha.pins);
    // Cabeçalho fixo "Alterações do cliente" — pedido do Cláudio
    // (2026-08-04): o comentário sai sempre com a conta dele (é o
    // coordenador, tudo bem usar a foto dele), mas o texto tem que
    // deixar claro na hora que é o CLIENTE falando, relayed através do
    // link de aprovação — não uma opinião pessoal dele.
    var partes = ['Alterações do cliente (via link de aprovação):'];
    partes.push(aprovado
      ? '✅ Aprovou "' + linha.nomeArquivo + '"' + (linha.quemAprovou ? ' — ' + linha.quemAprovou : '') + '.'
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
    var envio = adicionarComentario(linha.taskId, partes.join('\n'), null);
    avisoChegou = !!(envio && envio.ok);
  } catch (e) {
    // A resposta do cliente já está salva na planilha (acima) — ela nunca
    // se perde por causa disso. O que falhou foi só AVISAR a equipe.
    avisoChegou = false;
  }

  // O Runrun.it estava fora: marca pra reenviar depois (ver
  // reenviarAvisosDeAprovacaoPendentes) e conta a verdade pro cliente, em
  // vez de mostrar "deu tudo certo" e ninguém ficar sabendo — que era
  // exatamente o que acontecia antes: silencioso dos dois lados.
  if (!avisoChegou) {
    marcarAvisoDeAprovacaoPendente(codigo);
  }

  return { ok: true, status: linha.status, avisoChegou: avisoChegou, quemAprovou: linha.quemAprovou };
}

// Coluna N da aba Aprovacoes: "1" enquanto o aviso na tarefa não saiu.
var COLUNA_AVISO_PENDENTE = 14;

function marcarAvisoDeAprovacaoPendente(codigo) {
  try {
    var lock = LockService.getScriptLock();
    pegarTravaDaPlanilha(lock);
    try {
      var sheet = getAprovacoesSheet();
      var linhas = sheet.getDataRange().getValues();
      for (var i = 1; i < linhas.length; i++) {
        if (String(linhas[i][0]) === String(codigo)) {
          sheet.getRange(i + 1, COLUNA_AVISO_PENDENTE).setValue('1');
          return;
        }
      }
    } finally {
      lock.releaseLock();
    }
  } catch (e) { /* nem isso deu — o cliente ainda vai ser orientado a mandar no WhatsApp */ }
}

/**
 * Reenvia pras tarefas os avisos que não saíram porque o Runrun.it estava
 * fora do ar na hora em que o cliente respondeu.
 *
 * Roda junto do backup diário e também quando alguém abre a aba
 * "Aprovações" (listarAprovacoesPendentes) — assim, na prática, o aviso
 * chega poucos minutos depois do Runrun.it voltar, sem ninguém fazer nada.
 */
function reenviarAvisosDeAprovacaoPendentes() {
  var sheet = getAprovacoesSheet();
  var linhas = sheet.getDataRange().getValues();
  var reenviados = 0;

  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][COLUNA_AVISO_PENDENTE - 1] || '') !== '1') continue;
    var obj = linhaParaObjetoDeAprovacao(linhas[i]);
    if (!obj.taskId) continue;

    var partes = ['Alterações do cliente (via link de aprovação):'];
    partes.push(obj.status === 'aprovado'
      ? '✅ Aprovou "' + obj.nomeArquivo + '".'
      : '✏️ Pediu ajuste em "' + obj.nomeArquivo + '".');
    if (obj.respostaTexto) partes.push(obj.respostaTexto);
    var pinsList = parsearPins(obj.pins);
    if (pinsList.length) {
      partes.push((pinsList.length === 1 ? '1 ponto marcado' : pinsList.length + ' pontos marcados') +
        ' na imagem — abre o link de aprovação de novo pra ver exatamente onde:');
      pinsList.forEach(function (p, n) { partes.push((n + 1) + '. ' + (p.texto || '(sem descrição)')); });
    }
    // Deixa claro que é um aviso atrasado: quem lê precisa saber que o
    // cliente respondeu ANTES, não agora.
    partes.push('(aviso atrasado — o Runrun.it estava fora do ar quando o cliente respondeu, em ' +
      Utilities.formatDate(new Date(Number(obj.respondidoEm) || new Date().getTime()),
        'America/Sao_Paulo', 'dd/MM à\'s\' HH:mm') + ')');

    var envio;
    try {
      envio = adicionarComentario(obj.taskId, partes.join('\n'), null);
    } catch (e) {
      envio = null;
    }
    // Ainda fora do ar: para por aqui e tenta tudo de novo na próxima —
    // insistir nas outras linhas só ia falhar igual e gastar tempo.
    if (!envio || !envio.ok) break;

    try { sheet.getRange(i + 1, COLUNA_AVISO_PENDENTE).setValue(''); } catch (e) { /* segue */ }
    reenviados++;
  }
  return { ok: true, reenviados: reenviados };
}

function linhaParaObjetoDeAprovacao(linha) {
  return {
    codigo: linha[0], taskId: linha[1], cliente: linha[2], tituloTarefa: linha[3],
    fileId: linha[4], nomeArquivo: linha[5], mimeType: linha[6], criadoEm: linha[7],
    status: linha[8], respostaTexto: linha[9], respondidoEm: linha[10], autor: linha[11],
    pins: linha[12] || '', quemAprovou: linha[14] || ''
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

/**
 * TODAS as aprovações que ainda pedem atenção, de todos os clientes —
 * é o que alimenta a aba "Aprovações" da Fila de repasse (protótipo
 * aprovado pelo Cláudio em 2026-08-04).
 *
 * O que entra:
 *   - `pendente` e `ajuste`: sempre, independente da idade. Enquanto o
 *     cliente não responde (ou pediu ajuste e ninguém mexeu), continua
 *     sendo trabalho em aberto.
 *   - `aprovado`: só os últimos 7 dias. Serve pra fechar o ciclo ("saiu
 *     hoje"), não pra virar um arquivo morto que só cresce.
 */
var APROVADAS_JANELA_DIAS = 7;

function listarAprovacoesPendentes() {
  // Aproveita a abertura da aba pra tentar mandar os avisos que ficaram
  // presos (Runrun.it fora do ar quando o cliente respondeu). Na prática
  // é o que faz o aviso chegar poucos minutos depois dele voltar, sem
  // ninguém precisar fazer nada. Nunca derruba a listagem.
  try { reenviarAvisosDeAprovacaoPendentes(); } catch (e) { /* segue */ }

  var sheet = getAprovacoesSheet();
  var linhas = sheet.getDataRange().getValues();
  var corteAprovadas = new Date().getTime() - APROVADAS_JANELA_DIAS * 24 * 60 * 60 * 1000;
  var lista = [];

  for (var i = 1; i < linhas.length; i++) {
    if (!linhas[i][0]) continue;
    var obj = linhaParaObjetoDeAprovacao(linhas[i]);
    var status = obj.status || 'pendente';

    if (status === 'aprovado') {
      var quando = Number(obj.respondidoEm || obj.criadoEm) || 0;
      if (quando < corteAprovadas) continue;
    }

    lista.push({
      codigo: obj.codigo,
      taskId: obj.taskId,
      cliente: obj.cliente,
      tituloTarefa: obj.tituloTarefa,
      // Vários arquivos vão separados por "|" na mesma célula (ver
      // gravarLinhaDeAprovacao) — o front mostra "2 peças · nome, nome".
      nomeArquivo: obj.nomeArquivo,
      quantasPecas: idsDaLinhaDeAprovacao(obj.fileId).length || 1,
      ehVideo: String(obj.mimeType || '').indexOf('video/') !== -1,
      status: status,
      criadoEm: obj.criadoEm,
      respondidoEm: obj.respondidoEm,
      respostaTexto: obj.respostaTexto,
      quemAprovou: obj.quemAprovou,
      quantosPins: parsearPins(obj.pins).length,
      // O cliente respondeu, mas o aviso ainda não chegou na tarefa (o
      // Runrun.it estava fora) — a aba mostra isso pra você não achar
      // que ninguém respondeu.
      avisoPendente: String(linhas[i][COLUNA_AVISO_PENDENTE - 1] || '') === '1'
    });
  }

  // Mais recente primeiro dentro de cada coluna — quem agrupa por status
  // é o front-end (ver renderAprovacoesRepasse, js/pagina-repasse.js).
  lista.sort(function (a, b) {
    return Number(b.respondidoEm || b.criadoEm || 0) - Number(a.respondidoEm || a.criadoEm || 0);
  });
  return { ok: true, aprovacoes: lista };
}

function acharLinhaDeAprovacao(codigo) {
  var sheet = getAprovacoesSheet();
  var linhas = sheet.getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(codigo)) return linhaParaObjetoDeAprovacao(linhas[i]);
  }
  return null;
}
