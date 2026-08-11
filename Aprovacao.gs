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
  // Coluna P: resposta POR PEÇA (M5, 2026-08-05) — JSON, um item por peça
  // do link (mesma ordem de idsDaLinhaDeAprovacao(fileId)), cada um
  // `null` (ainda não respondida) ou `{status, texto, quemAprovou,
  // respondidoEm}`. As colunas I/J/K/O continuam existindo como o
  // AGREGADO (preenchidas só quando TODAS as peças já têm resposta) —
  // é o que a aba "Aprovações" da Fila de repasse (que só olha o
  // agregado) continua enxergando sem precisar saber que isso existe.
  if (sheet.getLastColumn() < 16) sheet.getRange(1, 16).setValue('respostas_pecas');
  // Coluna Q: quando o cliente disse "vou consultar e te falo"
  // (2026-08-06). NÃO é um status — o link continua `pendente`, porque não
  // houve decisão nenhuma. É só a diferença entre "o cliente sumiu" e "o
  // cliente falou que está andando", que era invisível: ele fechava a aba e
  // do nosso lado parecia silêncio igual a quem nem abriu.
  if (sheet.getLastColumn() < 17) sheet.getRange(1, 17).setValue('consultando_em');
  return sheet;
}

/** Uma célula pode ter várias respostas, uma por peça (ver getAprovacoesSheet). */
// =====================================================================
// AS APROVAÇÕES NO SUPABASE (etapa 4 de 4 — a última, e a única que uma
// pessoa de fora da agência toca)
//
// Mesma técnica das etapas anteriores: o banco devolve linha no FORMATO
// da planilha, então `linhaParaObjetoDeAprovacao` e todos os leitores
// continuam valendo letra por letra.
//
// ⚠️ AS COLUNAS SAEM DAQUI, NUNCA DO CABEÇALHO DA ABA. O cabeçalho é
// escrito com 13 colunas (A:M) e nunca foi corrigido; as outras quatro
// foram penduradas depois, uma a uma, cada uma com um remendo
// `if (getLastColumn() < N)`. Quem for conferir a lista abaixo tem que
// comparar com `linhaParaObjetoDeAprovacao`, que é a verdade.
// =====================================================================

var COLUNAS_APROVACAO = [
  'codigo', 'task_id', 'cliente', 'titulo_tarefa', 'file_id', 'nome_arquivo',
  'mime_type', 'criado_em', 'status', 'resposta_texto', 'respondido_em', 'autor',
  'pins',            // M — os pontos marcados na peça
  'aviso_pendente',  // N — "1" enquanto o recado não entrou na tarefa
  'quem_aprovou',    // O — o nome que o CLIENTE digitou
  'respostas_pecas', // P — resposta por peça, quando o link tem várias
  'consultando_em'   // Q — "vou consultar e te falo"
];

/** Linha da planilha (array) → objeto do banco. */
function aprovacaoDaLinha(l) {
  var obj = {};
  COLUNAS_APROVACAO.forEach(function (nome, i) {
    obj[nome] = (l[i] === undefined || l[i] === null) ? '' : String(l[i]);
  });
  return obj;
}

/** Objeto do banco → linha no formato da planilha (o caminho de volta). */
function aprovacaoParaLinha(obj) {
  return COLUNAS_APROVACAO.map(function (nome) {
    return (obj[nome] === undefined || obj[nome] === null) ? '' : String(obj[nome]);
  });
}

/**
 * TODAS as aprovações, da fonte que estiver mandando, no formato da
 * planilha (com cabeçalho de mentira na posição 0).
 *
 * Cair na planilha quando o banco não responde importa mais aqui do que
 * em qualquer aba anterior: é isto que a página do cliente lê. Uma lista
 * vazia viraria "esse link de aprovação não existe mais" na cara de quem
 * está do lado de fora — a pior mensagem possível, e mentirosa.
 */
function linhasDeAprovacao(filtros) {
  if (supabaseManda('aprovacoes')) {
    var doBanco = supabaseBuscarTudo('aprovacoes', filtros || 'select=*&order=id.asc');
    if (doBanco) {
      var linhas = [COLUNAS_APROVACAO.slice()];
      doBanco.forEach(function (o) { linhas.push(aprovacaoParaLinha(o)); });
      return linhas;
    }
  }
  return getAprovacoesSheet().getDataRange().getValues();
}

/** Muda alguns campos de UMA aprovação, achada pelo código (indexado). */
function atualizarAprovacaoNoBanco(codigo, campos) {
  if (!supabaseConfigurado()) return;
  supabaseAtualizar('aprovacoes', 'codigo=eq.' + encodeURIComponent(String(codigo)), campos);
}

/** A cópia inicial das APROVAÇÕES. Ver supabaseCopiaInicial (Supabase.gs). */
function migrarAprovacoesParaSupabase() {
  supabaseCopiaInicial('aprovacoes', getAprovacoesSheet(), 0, 0, aprovacaoDaLinha);
}

/**
 * Compara os dois lados das aprovações. Rodar entre a cópia e a virada —
 * e aqui não é formalidade: é a única tabela cujo erro aparece pra alguém
 * de fora da agência, dias depois, sem tela nenhuma pra avisar antes.
 */
function conferirAprovacoes() {
  supabaseConferir('aprovacoes', getAprovacoesSheet(), 0, 0, aprovacaoDaLinha);
}

function parsearRespostasPecas(json, quantasPecas) {
  var lista = [];
  if (json) {
    try { lista = JSON.parse(json); } catch (e) { lista = []; }
  }
  if (!Array.isArray(lista)) lista = [];
  while (lista.length < quantasPecas) lista.push(null);
  return lista;
}

/**
 * Um arquivo da pasta do card "conta como peça"? Imagem e vídeo sempre
 * contaram; HTML entrou em 2026-08-07 (pedido do Cláudio: e-mail marketing
 * é entregue em HTML, e até então esses arquivos eram ignorados na pasta —
 * nem apareciam pra escolher, nem entravam no link de aprovação). Função
 * única porque o mesmo filtro se repete nos dois arquivos (aqui e em
 * AprovacaoInterna.gs) — mesmo espírito de nomeBaseDaPeca/versaoDoArquivo
 * logo abaixo.
 */
function ehTipoDePecaAceito(mimeType) {
  var tipo = String(mimeType || '');
  return tipo.indexOf('image/') === 0 || tipo.indexOf('video/') === 0 || tipo === 'text/html';
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
    if (!ehTipoDePecaAceito(tipo)) continue;
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
      if (!ehTipoDePecaAceito(tipoMulti)) {
        return { ok: false, error: 'Um dos arquivos escolhidos não é imagem, vídeo nem HTML.' };
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
    if (!ehTipoDePecaAceito(tipoEscolhido)) {
      return { ok: false, error: 'Esse arquivo não é imagem, vídeo nem HTML.' };
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
      // Aceita imagem, vídeo OU HTML — antes só imagem, e um card com
      // Stories em vídeo dava "não encontrei nenhuma imagem" mesmo tendo
      // arquivo novo na pasta (pedido do Cláudio, 2026-08-04; HTML entrou
      // em 2026-08-07, pro caso de e-mail marketing).
      if (!ehTipoDePecaAceito(tipo)) continue;
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

// ---------------------------------------------------------------------
// O código curto e legível do link (2026-08-08)
// ---------------------------------------------------------------------

/**
 * O PROBLEMA: o link do cliente era
 * `colmeia.beeon.com.br/aprovar.html?codigo=` + um UUID de 32 caracteres
 * — 80 caracteres no total. Chato de mandar por WhatsApp, e nos
 * comentários das tarefas ocupava três linhas sem dizer nada. Pior: não
 * dava pra olhar um link e saber de qual cliente ou tarefa ele era.
 *
 * O FORMATO NOVO (escolhido pelo Cláudio): `adn/11505-k7m2`, que vira
 * `colmeia.beeon.com.br/adn/11505-k7m2` — 42 caracteres, quase metade.
 *   - `adn`   = a sigla do cliente, pra bater o olho e reconhecer;
 *   - `11505` = o id da tarefa no Runrun.it, pelo mesmo motivo;
 *   - `k7m2`  = o cadeado, e é a parte que NÃO pode sair.
 *
 * POR QUE O CADEADO EXISTE: esta página não tem login — quem abre o link,
 * vê a peça e pode aprovar. Sigla e id são os dois adivinháveis (a sigla
 * sai do nome do cliente, e os ids do Runrun.it são sequenciais), então
 * sem as 4 letras finais qualquer pessoa que recebesse UM link conseguiria
 * abrir a peça de qualquer outro cliente trocando o número — e aprovar no
 * lugar dele. Com elas, são 1,6 milhão de combinações POR TAREFA, e não
 * existe lista de tarefas pra varrer.
 *
 * LINKS ANTIGOS CONTINUAM VALENDO: a busca é por igualdade exata do
 * código (acharLinhaDeAprovacao), que nunca dependeu do tamanho nem do
 * formato. Nada precisa ser migrado.
 */
var ALFABETO_CODIGO_APROVACAO = 'abcdefghijkmnpqrstuvwxyz23456789'; // sem l/o/0/1: confundem quem lê em voz alta

/**
 * Tira acento, espaço e maiúscula de uma sigla escrita à mão. É chamada na
 * gravação (salvarLinksCliente) e não na leitura, pra que o que está
 * guardado seja exatamente o que aparece na URL.
 */
function normalizarSiglaDeCliente(sigla) {
  if (!sigla) return '';
  return String(sigla)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '')
    .slice(0, 6);
}

/**
 * A sigla automática: a PRIMEIRA letra do nome, sempre, mais as
 * consoantes seguintes — que é o que sobra quando se abrevia um nome à
 * mão ("Bauducco" → bdc, "Alden" → ald, "Clínica São José" → cln).
 *
 * A primeira letra é mantida mesmo sendo vogal de propósito: só as
 * consoantes fariam "Alden" virar `ldn`, que ninguém reconhece como
 * Alden. Sobrando menos de 3 letras (nome curto, ou quase todo de
 * vogais), completa com as primeiras letras mesmo. Nome sem letra
 * nenhuma vira `cli` — nunca vazio, senão a URL ficaria com duas barras
 * seguidas e o link não abriria.
 */
function siglaAutomaticaDeCliente(nome) {
  var limpo = normalizarSiglaDeCliente(nome);
  if (!limpo) return 'cli';
  var sigla = limpo.charAt(0) + limpo.slice(1).replace(/[aeiou0-9]/g, '');
  if (sigla.length < 3) sigla = limpo;
  return sigla.slice(0, 3);
}

/**
 * A sigla que vale pra este cliente: a escrita à mão no painel de
 * Clientes quando existe, senão a automática.
 *
 * DUAS SIGLAS IGUAIS NÃO SÃO PROBLEMA aqui, e é de propósito: o que
 * identifica a aprovação é o código inteiro (sigla + id + cadeado), e o id
 * da tarefa já é único no Runrun.it. Se "Alden" e "Aldana" derem as duas
 * `adn`, os links continuam distintos e continuam abrindo a peça certa —
 * só fica menos óbvio de qual cliente é, que é justamente pra isso que o
 * campo editável existe.
 */
function siglaDoCliente(nome) {
  if (!nome) return 'cli';
  try {
    var lista = listarLinksClientes();
    if (lista && lista.ok) {
      for (var i = 0; i < lista.links.length; i++) {
        var l = lista.links[i];
        if (String(l.cliente).trim().toLowerCase() !== String(nome).trim().toLowerCase()) continue;
        if (l.sigla) return normalizarSiglaDeCliente(l.sigla);
        break;
      }
    }
  } catch (e) {
    // Planilha fora do ar não pode impedir um link de ser gerado — a
    // sigla automática dá um link perfeitamente funcional.
  }
  return siglaAutomaticaDeCliente(nome);
}

/**
 * Monta `sigla/taskId-cadeado`, conferindo que o resultado ainda não está
 * em uso. `linhas` é a planilha já lida por quem chamou (não relê à toa);
 * a repetição só é possível dentro da MESMA tarefa, porque o id entra no
 * código — então a chance de precisar de uma segunda volta é ínfima.
 */
function montarCodigoDeAprovacao(taskId, cliente, linhas) {
  var sigla = siglaDoCliente(cliente);
  var usados = {};
  for (var i = 1; i < (linhas || []).length; i++) {
    if (linhas[i][0]) usados[String(linhas[i][0])] = true;
  }
  for (var tentativa = 0; tentativa < 40; tentativa++) {
    var cadeado = '';
    for (var c = 0; c < 4; c++) {
      cadeado += ALFABETO_CODIGO_APROVACAO.charAt(Math.floor(Math.random() * ALFABETO_CODIGO_APROVACAO.length));
    }
    var codigo = sigla + '/' + taskId + '-' + cadeado;
    if (!usados[codigo]) return codigo;
  }
  // 40 sorteios batendo no mesmo código é impossível na prática, mas um
  // link sem código seria pior que um link feio: cai no formato antigo,
  // que é garantidamente único.
  return Utilities.getUuid().replace(/-/g, '');
}

/**
 * Grava a linha da aprovação. Vários arquivos são guardados na MESMA
 * célula, separados por "|" — id do Drive nunca tem esse caractere, e
 * assim nada muda pra quem lê uma linha antiga (um id só continua sendo
 * uma lista de um item, ver idsDaLinhaDeAprovacao).
 *
 * REAPROVEITA o código quando já existe um link PENDENTE (ainda sem
 * resposta) pra essa MESMA tarefa com o MESMO conjunto de peças — sem
 * isso, reabrir a conferência e mandar de novo (ex: depois de um F5)
 * criava uma linha nova a cada vez: dois cartões pra mesma peça na aba
 * Aprovações, e o link velho continuava "vivo" esperando uma resposta que
 * nunca ia chegar, porque ninguém estava mais olhando pra ele. Uma vez
 * que o cliente já respondeu (status deixou de ser 'pendente'), um novo
 * envio é mesmo uma rodada nova — aí cria linha nova normalmente.
 */
function gravarLinhaDeAprovacao(taskId, cliente, tituloTarefa, autor, arquivos) {
  var ids = arquivos.map(function (a) { return a.getId(); }).join('|');
  var nomes = arquivos.map(function (a) { return a.getName(); }).join('|');
  var tipos = arquivos.map(function (a) { return a.getMimeType(); }).join('|');

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getAprovacoesSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][1]) === String(taskId) && String(linhas[i][4]) === ids && String(linhas[i][8]) === 'pendente') {
        return {
          ok: true,
          codigo: linhas[i][0],
          nomeArquivo: arquivos.map(function (a) { return a.getName(); }).join(', '),
          quantasPecas: arquivos.length,
          reaproveitado: true
        };
      }
    }

    var codigo = montarCodigoDeAprovacao(taskId, cliente, linhas);
    var valores = [
      codigo, taskId, cliente || '', tituloTarefa || '', ids, nomes,
      tipos, new Date().getTime(), 'pendente', '', '', autor || ''
    ];
    if (supabaseConfigurado()) supabaseInserir('aprovacoes', aprovacaoDaLinha(valores));
    sheet.appendRow(valores);
    return {
      ok: true,
      codigo: codigo,
      nomeArquivo: arquivos.map(function (a) { return a.getName(); }).join(', '),
      quantasPecas: arquivos.length
    };
  } finally {
    lock.releaseLock();
  }
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
// Depois de 1 mês, o link para de abrir — pedido do Cláudio (2026-08-06):
// "pode expirar após 1 mês, o link do drive continua público". Só o
// CÓDIGO deixa de funcionar; o arquivo em si continua compartilhado como
// "qualquer pessoa com o link" no Drive (isso não muda), porque revogar
// ele exigiria saber com certeza que ninguém mais precisa acessar a peça
// por ali — e isso o Colmeia não tem como saber.
var APROVACAO_LINK_VALIDADE_DIAS = 30;

function buscarAprovacaoPublica(codigo) {
  if (!codigo) return { ok: false, error: 'Link inválido.' };
  var linha = acharLinhaDeAprovacao(codigo);
  if (!linha) return { ok: false, error: 'Não encontrei essa aprovação — o link pode estar errado.' };

  var idadeMs = new Date().getTime() - Number(linha.criadoEm || 0);
  if (idadeMs > APROVACAO_LINK_VALIDADE_DIAS * 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'Esse link venceu — ele tem ' + APROVACAO_LINK_VALIDADE_DIAS + ' dias de validade. Pede um link novo pra agência.', expirado: true };
  }

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

    // A peça publicada no Storage: o cliente recebe um ENDEREÇO em vez de
    // megabytes de texto. É onde isso mais vale — a página do cliente é
    // aberta muitas vezes, frequentemente em rede de celular ruim, e o
    // navegador dele passa a guardar a imagem entre uma visita e outra.
    var urlPublica = urlPublicaDaPeca(id);
    if (urlPublica) {
      return { nome: arquivo.getName(), mimeType: tipo, ehVideo: false, url: urlPublica };
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
    respondidoEm: linha.respondidoEm || null,
    quemAprovou: linha.quemAprovou,
    pins: parsearPins(linha.pins),
    pecas: pecas,
    // M5 (2026-08-05): resposta POR PEÇA — um item por peça, na mesma
    // ordem de `pecas` (null = essa peça ainda não foi respondida). Com
    // uma peça só isso sempre bate com o `status`/`respostaTexto` de cima;
    // é o que faz o front continuar funcionando sem checar isso quando o
    // link é de peça única.
    respostasPorPeca: parsearRespostasPecas(linha.respostasPecas, pecas.length),
    // "Preciso consultar antes" já foi clicado alguma vez? Sem isto, quem
    // clicava e recarregava a página via o botão do jeito normal de novo,
    // e clicava outra vez achando que não tinha funcionado (auditoria de
    // 2026-08-08). NÃO é status: o link continua `pendente`, e o cliente
    // segue podendo aprovar ou pedir ajuste normalmente.
    consultandoEm: linha.consultandoEm || null,
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
    var quandoRespondeu = new Date().getTime();
    atualizarAprovacaoNoBanco(codigo, {
      status: status, resposta_texto: respostaTexto || '', respondido_em: String(quandoRespondeu),
      pins: pinsTexto, quem_aprovou: nomeAprovador
    });
    sheet.getRange(indice + 1, 9, 1, 3).setValues([[status, respostaTexto || '', quandoRespondeu]]);
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

/**
 * O cliente respondeu UMA peça de um link com VÁRIAS (M5, 2026-08-05:
 * "o cliente não consegue responder peça por peça" — ele aprovava o Feed
 * e o Stories juntos, mesmo quando só um dos dois precisava de ajuste).
 *
 * Cada peça vira uma entrada independente em `respostas_pecas` (coluna P).
 * As colunas de sempre (status/respostaTexto/respondidoEm/quemAprovou, que
 * a aba "Aprovações" da Fila de repasse já lê) só são preenchidas quando
 * TODAS as peças do link já tiverem resposta — antes disso o link inteiro
 * continua "pendente" pra quem olha de fora, mesmo já tendo uma peça
 * decidida, porque ainda falta decisão de verdade sobre o resto.
 *
 * O AVISO NO RUNRUN.IT sai na hora, por peça — o designer não devia esperar
 * as outras duas peças serem respondidas pra saber que uma já pode seguir.
 */
function responderPecaAprovacaoPublica(codigo, indicePeca, aprovado, respostaTexto, pins, quemRespondeu) {
  if (!codigo) return { ok: false, error: 'Link inválido.' };

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  var linha, respostas, quantasPecas, todasRespondidas;
  try {
    var sheet = getAprovacoesSheet();
    var linhas = sheet.getDataRange().getValues();
    var indiceLinha = -1;
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(codigo)) { indiceLinha = i; break; }
    }
    if (indiceLinha === -1) { lock.releaseLock(); return { ok: false, error: 'Não encontrei essa aprovação.' }; }
    linha = linhaParaObjetoDeAprovacao(linhas[indiceLinha]);

    quantasPecas = idsDaLinhaDeAprovacao(linha.fileId).length || 1;
    if (indicePeca < 0 || indicePeca >= quantasPecas) { lock.releaseLock(); return { ok: false, error: 'Peça inválida.' }; }

    respostas = parsearRespostasPecas(linha.respostasPecas, quantasPecas);
    if (respostas[indicePeca]) {
      // Essa peça específica já tinha resposta — devolve o que já estava
      // gravado, sem sobrescrever (mesmo espírito do `jaRespondido` de
      // responderAprovacaoPublica).
      lock.releaseLock();
      return { ok: true, jaRespondido: true, status: respostas[indicePeca].status,
        respostaTexto: respostas[indicePeca].texto, quemAprovou: respostas[indicePeca].quemAprovou };
    }

    var statusPeca = aprovado ? 'aprovado' : 'ajuste';
    respostas[indicePeca] = {
      status: statusPeca,
      texto: respostaTexto || '',
      quemAprovou: aprovado ? String(quemRespondeu || '').trim() : '',
      respondidoEm: new Date().getTime()
    };

    // Junta os pins desta peça com os que já existiam de OUTRAS peças —
    // sem isso, responder a peça 2 apagaria os pontos já marcados na 1.
    var pinsExistentes = parsearPins(linha.pins).filter(function (p) { return Number(p.peca) !== indicePeca; });
    var pinsDestaPeca = (pins || []).map(function (p) { return { x: p.x, y: p.y, texto: p.texto, peca: indicePeca }; });
    var pinsTodos = pinsExistentes.concat(pinsDestaPeca);

    var pinsTexto = pinsTodos.length ? JSON.stringify(pinsTodos) : '';
    atualizarAprovacaoNoBanco(codigo, {
      respostas_pecas: JSON.stringify(respostas), pins: pinsTexto
    });
    sheet.getRange(indiceLinha + 1, 16).setValue(JSON.stringify(respostas));
    sheet.getRange(indiceLinha + 1, 13).setValue(pinsTexto);

    todasRespondidas = respostas.every(function (r) { return !!r; });
    if (todasRespondidas) {
      var todasAprovadas = respostas.every(function (r) { return r.status === 'aprovado'; });
      var primeiroAprovador = respostas.filter(function (r) { return r.quemAprovou; })[0];
      var textoAgregado = respostas
        .map(function (r, idx) { return r.texto ? '(' + (idx + 1) + ') ' + r.texto : ''; })
        .filter(function (t) { return !!t; }).join(' · ');
      // O AGREGADO, escrito só quando todas as peças já responderam — é o
      // que a aba "Aprovações" da Fila de repasse lê, sem saber que
      // resposta por peça existe.
      var statusFinal = todasAprovadas ? 'aprovado' : 'ajuste';
      var aprovadorFinal = todasAprovadas && primeiroAprovador ? primeiroAprovador.quemAprovou : '';
      var quandoFechou = new Date().getTime();
      atualizarAprovacaoNoBanco(codigo, {
        status: statusFinal, resposta_texto: textoAgregado,
        respondido_em: String(quandoFechou), quem_aprovou: aprovadorFinal
      });
      sheet.getRange(indiceLinha + 1, 9, 1, 3).setValues([[statusFinal, textoAgregado, quandoFechou]]);
      sheet.getRange(indiceLinha + 1, 15).setValue(aprovadorFinal);
    }
  } finally {
    lock.releaseLock();
  }

  var nomesPecas = String(linha.nomeArquivo || '').split('|');
  var nomeDaPeca = nomesPecas[indicePeca] || linha.nomeArquivo || ('peça ' + (indicePeca + 1));
  var avisoChegou = false;
  try {
    var partes = ['Alterações do cliente (via link de aprovação):'];
    partes.push(aprovado
      ? '✅ Aprovou "' + nomeDaPeca + '"' + (quemRespondeu ? ' — ' + quemRespondeu : '') + '.'
      : '✏️ Pediu ajuste em "' + nomeDaPeca + '".');
    if (respostaTexto) partes.push(respostaTexto);
    var pinsDaResposta = (pins || []);
    if (pinsDaResposta.length) {
      partes.push((pinsDaResposta.length === 1 ? '1 ponto marcado' : pinsDaResposta.length + ' pontos marcados') +
        ' nesta peça — abre o link de aprovação de novo pra ver exatamente onde:');
      pinsDaResposta.forEach(function (p, i) { partes.push((i + 1) + '. ' + (p.texto || '(sem descrição)')); });
    }
    if (quantasPecas > 1) {
      partes.push(todasRespondidas
        ? '(era a última peça deste link — todas já têm resposta)'
        : '(ainda faltam peças deste mesmo link pra responder)');
    }
    var envio = adicionarComentario(linha.taskId, partes.join('\n'), null);
    avisoChegou = !!(envio && envio.ok);
  } catch (e) {
    avisoChegou = false;
  }

  if (!avisoChegou) marcarAvisoDeAprovacaoPendente(codigo);

  return {
    ok: true,
    status: respostas[indicePeca].status,
    quemAprovou: respostas[indicePeca].quemAprovou,
    avisoChegou: avisoChegou,
    todasRespondidas: todasRespondidas
  };
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
          atualizarAprovacaoNoBanco(codigo, { aviso_pendente: '1' });
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
      ? '✅ Aprovou "' + obj.nomeArquivo + '"' + (obj.quemAprovou ? ' — ' + obj.quemAprovou : '') + '.'
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

    atualizarAprovacaoNoBanco(linhas[i][0], { aviso_pendente: '' });
    try { sheet.getRange(i + 1, COLUNA_AVISO_PENDENTE).setValue(''); } catch (e) { /* segue */ }
    reenviados++;
  }
  return { ok: true, reenviados: reenviados };
}

/**
 * O link de cliente mais recente pra uma tarefa (peça), qualquer que seja
 * o status. Usado por dadosDaConferencia (AprovacaoInterna.gs) pra
 * reconstruir a aba "Aprovação do cliente" ao reabrir uma peça já
 * mandada — sem isso, a tela esquecia que já tinha sido enviada e voltava
 * pro estado "ainda não foi enviado", mesmo já tendo sido.
 */
function buscarLinkClienteMaisRecente(taskId) {
  var linhas = linhasDeAprovacao();
  var achada = null;
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][1]) !== String(taskId)) continue;
    var obj = linhaParaObjetoDeAprovacao(linhas[i]);
    if (!achada || Number(obj.criadoEm) > Number(achada.criadoEm)) achada = obj;
  }
  if (!achada) return null;
  return { codigo: achada.codigo, status: achada.status, criadoEm: achada.criadoEm };
}

function linhaParaObjetoDeAprovacao(linha) {
  return {
    codigo: linha[0], taskId: linha[1], cliente: linha[2], tituloTarefa: linha[3],
    fileId: linha[4], nomeArquivo: linha[5], mimeType: linha[6], criadoEm: linha[7],
    status: linha[8], respostaTexto: linha[9], respondidoEm: linha[10], autor: linha[11],
    pins: linha[12] || '', quemAprovou: linha[14] || '', respostasPecas: linha[15] || '',
    consultandoEm: linha[16] || ''
  };
}

/**
 * "Vou consultar e te falo" — o terceiro caminho da página do cliente
 * (2026-08-06). Só existiam aprovar e pedir ajuste, e na vida real o
 * cliente frequentemente precisa mostrar pro chefe antes: ele fechava a
 * aba, e do nosso lado isso era indistinguível de quem nunca abriu o link.
 *
 * NÃO mexe no status de propósito: `pendente` continua sendo a verdade
 * (ninguém decidiu nada), e mudar isso quebraria as colunas da aba
 * "Aprovações" da Fila de repasse, que leem status. É só um carimbo à
 * parte, que a tela usa pra dizer "está andando" em vez de "sumiu".
 *
 * O aviso na tarefa sai pelo mesmo caminho de sempre, e falhar nele não
 * desfaz o carimbo — igual em responderAprovacaoPublica.
 */
function avisarQueVaiConsultar(codigo) {
  if (!codigo) return { ok: false, error: 'Link inválido.' };

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  var linha = null;
  try {
    var sheet = getAprovacoesSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) !== String(codigo)) continue;
      linha = linhaParaObjetoDeAprovacao(linhas[i]);
      if (linha.status !== 'pendente') { lock.releaseLock(); return { ok: true, jaRespondido: true }; }
      var quandoConsultou = new Date().getTime();
      atualizarAprovacaoNoBanco(codigo, { consultando_em: String(quandoConsultou) });
      sheet.getRange(i + 1, 17).setValue(quandoConsultou);
      break;
    }
    if (!linha) { lock.releaseLock(); return { ok: false, error: 'Não encontrei essa aprovação.' }; }
  } finally {
    lock.releaseLock();
  }

  var avisoChegou = false;
  try {
    var envio = adicionarComentario(linha.taskId,
      'Alterações do cliente (via link de aprovação):\n' +
      '🕒 O cliente avisou que vai consultar internamente antes de responder "' + linha.nomeArquivo + '".',
      null);
    avisoChegou = !!(envio && envio.ok);
  } catch (e) {
    avisoChegou = false;
  }

  return { ok: true, avisoChegou: avisoChegou };
}

/**
 * "O cliente já aprovou, só que por fora" (2026-08-09, pedido do Cláudio).
 *
 * Na vida real o cliente responde no grupo do WhatsApp, no e-mail ou na
 * reunião — e o link fica pendente pra sempre, cobrando uma resposta que
 * já veio. Antes disso o atendimento só tinha duas saídas ruins: excluir
 * o link (perde o registro de que a peça FOI aprovada) ou deixar lá
 * cobrando.
 *
 * O que grava é o MESMO que a resposta do cliente grava — status
 * `aprovado`, quem aprovou e o carimbo de hora — pra tudo que já lê essas
 * colunas (a aba "Aprovações" da Fila de repasse, o grupo "Concluídos" da
 * Central) continuar funcionando sem saber que existe esse caminho.
 *
 * ⚠️ O texto diz por onde veio E quem registrou. Uma aprovação que ninguém
 * consegue rastrear depois é pior que nenhuma: se der problema com a peça,
 * a primeira pergunta vai ser "quem disse que estava aprovado?".
 */
function aprovarAprovacaoPorFora(dados) {
  dados = dados || {};
  var codigo = dados.codigo;
  if (!codigo) return { ok: false, error: 'Link inválido.' };

  var quemRegistrou = String(dados.quemRegistrou || '').trim();
  var canal = String(dados.canal || '').trim();      // "WhatsApp", "E-mail", "Pessoalmente"...
  var quemAprovou = String(dados.quemAprovou || '').trim();

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
    // Já decidida: não sobrescreve. Uma resposta do próprio cliente vale
    // mais que um registro manual, e "aprovar de novo" não é uma ação.
    if (linha.status !== 'pendente') {
      lock.releaseLock();
      return { ok: false, error: 'Essa peça já tem resposta (' + linha.status + ').', jaRespondido: true, status: linha.status };
    }

    var texto = 'Aprovado por fora do link' + (canal ? ' (' + canal + ')' : '') +
      (quemRegistrou ? ' — registrado por ' + quemRegistrou : '');
    // A coluna "quem aprovou" é do lado do CLIENTE. Sem o nome dele, fica
    // o canal — nunca o nome de quem é da Beeon, que faria a lista de
    // "Concluídos" parecer que a agência aprovou a própria peça.
    var nomeAprovador = quemAprovou || (canal ? 'cliente (' + canal + ')' : 'cliente');

    var quandoPorFora = new Date().getTime();
    atualizarAprovacaoNoBanco(codigo, {
      status: 'aprovado', resposta_texto: texto, respondido_em: String(quandoPorFora),
      quem_aprovou: nomeAprovador
    });
    sheet.getRange(indice + 1, 9, 1, 3).setValues([['aprovado', texto, quandoPorFora]]);
    sheet.getRange(indice + 1, 15).setValue(nomeAprovador);
    linha.status = 'aprovado';
    linha.respostaTexto = texto;
    linha.quemAprovou = nomeAprovador;
  } finally {
    lock.releaseLock();
  }

  // Mesmo caminho (e mesma tolerância a falha) da resposta pelo link: o
  // registro já está salvo, o que pode falhar é só AVISAR na tarefa.
  var avisoChegou = false;
  try {
    var partes = ['Alterações do cliente (registrado pelo atendimento):'];
    partes.push('✅ Aprovou "' + linha.nomeArquivo + '"' +
      (canal ? ' por ' + canal : ' fora do link de aprovação') +
      (quemAprovou ? ' — ' + quemAprovou : '') + '.');
    if (quemRegistrou) partes.push('Registrado no Colmeia por ' + quemRegistrou + '.');
    var envio = adicionarComentario(linha.taskId, partes.join('\n'), null);
    avisoChegou = !!(envio && envio.ok);
  } catch (e) {
    avisoChegou = false;
  }
  if (!avisoChegou) marcarAvisoDeAprovacaoPendente(codigo);

  return { ok: true, status: 'aprovado', quemAprovou: linha.quemAprovou, avisoChegou: avisoChegou };
}

var APROVACOES_RETENCAO_DIAS = 30;

/**
 * Poda as linhas já decididas (aprovado/ajuste) com mais de 30 dias.
 * Roda junto do backup diário, mesmo padrão de `limparConferenciasAntigas`
 * (AprovacaoInterna.gs). O que está "pendente" nunca é apagado, por mais
 * velho que seja — é aprovação em aberto esperando o cliente.
 */
function limparAprovacoesAntigas() {
  var sheet = getAprovacoesSheet();
  var linhas = sheet.getDataRange().getValues();
  var limite = Date.now() - APROVACOES_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    for (var i = linhas.length - 1; i >= 1; i--) {
      if (String(linhas[i][8]) === 'pendente') continue;
      var quando = Number(linhas[i][10]) || Number(linhas[i][7]) || 0;
      if (quando && quando < limite) {
        // No banco, pelo código: número de linha só existe na planilha.
        if (supabaseConfigurado()) {
          supabaseApagar('aprovacoes', 'codigo=eq.' + encodeURIComponent(String(linhas[i][0])));
        }
        sheet.deleteRow(i + 1);
      }
    }
  } finally {
    lock.releaseLock();
  }
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
  var linhas = linhasDeAprovacao();
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
      respostaTexto: obj.respostaTexto,
      // M11 (2026-08-05): "quem aprovou" some do cartão da Fila de repasse
      // depois de 7 dias — este é o caminho que continua enxergando (até
      // os 30 dias de retenção da aba, ver limparAprovacoesAntigas): o Hub
      // do cliente já é, na prática, a busca de histórico por cliente que
      // faltava.
      quemAprovou: obj.quemAprovou
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

  var linhas = linhasDeAprovacao();
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
      // Só o PRIMEIRO id (sem o "|" de várias peças) — é só pra Central do
      // Atendimento buscar uma miniatura ilustrativa na Timeline (ver
      // buscarThumbnailDrive), não pra abrir a peça de verdade.
      fileId: idsDaLinhaDeAprovacao(obj.fileId)[0] || null,
      ehVideo: String(obj.mimeType || '').indexOf('video/') !== -1,
      status: status,
      criadoEm: obj.criadoEm,
      respondidoEm: obj.respondidoEm,
      respostaTexto: obj.respostaTexto,
      quemAprovou: obj.quemAprovou,
      quantosPins: parsearPins(obj.pins).length,
      // Os pontos de verdade (x/y em % + texto), não só a contagem — é o
      // que dá pra abrir a conferência a partir de um "voltou com ajuste"
      // já mostrando onde o cliente marcou (ver
      // apvAbrirParaAlteracaoDoCliente, js/pagina-aprovacao.js). Mesmo
      // formato de sempre (CLAUDE.md: "[{x,y,texto}]"), então entra direto
      // em apvPinsPorPeca sem converter nada.
      pins: parsearPins(obj.pins),
      // O cliente avisou que ia consultar antes de responder (ver
      // avisarQueVaiConsultar) — muda o que a tela diz sobre a espera,
      // não o status.
      consultandoEm: obj.consultandoEm || null,
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

/**
 * Exclui um link de aprovação (pedido do Cláudio, 2026-08-06: "tem vários
 * teste que fiz e continuam ali"). Some a linha inteira da aba
 * Aprovacoes — o código para de funcionar na hora. Não mexe no arquivo do
 * Drive (continua liberado do jeito que já estava).
 */
function excluirLinkDeAprovacao(codigo) {
  if (!codigo) return { ok: false, error: 'Código não informado.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getAprovacoesSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(codigo)) {
        if (supabaseConfigurado()) {
          supabaseApagar('aprovacoes', 'codigo=eq.' + encodeURIComponent(String(codigo)));
        }
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Não encontrei esse link — pode já ter sido excluído.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Todos os links já gerados pra uma tarefa, qualquer status, mais recente
 * primeiro. Usado por gerarLinkDeAprovacaoParaTarefa (front) pra avisar
 * "já existe link pra essa tarefa" antes de gerar outro, oferecendo
 * excluir os antigos e gerar de novo — em vez de só ir empilhando link
 * a cada teste.
 */
function listarLinksDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var linhas = linhasDeAprovacao();
  var lista = [];
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][1]) !== String(taskId)) continue;
    var obj = linhaParaObjetoDeAprovacao(linhas[i]);
    lista.push({
      codigo: obj.codigo,
      nomeArquivo: obj.nomeArquivo,
      status: obj.status || 'pendente',
      criadoEm: obj.criadoEm,
      quantasPecas: idsDaLinhaDeAprovacao(obj.fileId).length || 1
    });
  }
  lista.sort(function (a, b) { return Number(b.criadoEm) - Number(a.criadoEm); });
  return { ok: true, links: lista };
}

function acharLinhaDeAprovacao(codigo) {
  // É a função que a PÁGINA DO CLIENTE usa pra achar o link dela. Pelo
  // banco vem só a linha pedida (o código é indexado); pela planilha, a
  // aba inteira e a comparação no laço abaixo — que continua valendo pros
  // dois caminhos, sem duplicar a regra.
  var linhas = linhasDeAprovacao('select=*&codigo=eq.' + encodeURIComponent(String(codigo)));
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(codigo)) return linhaParaObjetoDeAprovacao(linhas[i]);
  }
  return null;
}
