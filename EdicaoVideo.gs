/**
 * Prepara a pasta de um card de vídeo pra edição fora do Colmeia: grava um
 * card.json na raiz da pasta do card (briefing resumido, datas, roteiro) e
 * copia os takes citados na descrição pra Arquivos\TAKE 01.mp4, TAKE
 * 02.mp4... Com isso o editor só precisa dizer "edita o card 8" — o
 * card.json tem tudo que a skill de edição de vídeo precisa.
 *
 * ---------------------------------------------------------------------
 * Faz parte do backend do Colmeia (ver o cabeçalho de Drive.gs sobre os
 * arquivos .gs compartilharem o mesmo espaço de nomes). Este arquivo
 * precisa ser liberado no .claspignore, senão as funções daqui nunca
 * chegam em produção (ver CLAUDE.md, seção "Estrutura do backend (.gs)").
 * ---------------------------------------------------------------------
 *
 * NÃO cria a pasta do card por conta própria — espera que
 * criarPastaDoCardNoDrive (Drive.gs) já tenha rodado. De propósito: um
 * card de vídeo sem pasta ainda não tem "Arquivos" pra receber nada, e
 * criar a pasta aqui duplicaria a decisão de onde ela fica (cliente, mês
 * do projeto) que já mora só em criarPastaDoCardNoDrive.
 *
 * Pode ser chamado de novo sem duplicar nada: um take que já foi copiado
 * antes (mesmo nome final em Arquivos\) é detectado por nome e pulado; o
 * card.json é sempre substituído do zero, porque ele é um retrato de
 * AGORA (atualizado_em), não um histórico.
 */
function prepararPastaDeEdicao(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var pastaInfo = buscarPastaSalvaDoCard(taskId);
  if (!pastaInfo.ok || !pastaInfo.url) {
    return { ok: false, error: 'Esse card ainda não tem pasta no Drive. Crie a pasta do card primeiro.' };
  }

  var pastaCard;
  try {
    pastaCard = DriveApp.getFolderById(extrairIdDeUrlDrive(pastaInfo.url));
  } catch (err) {
    return { ok: false, error: 'Não consegui abrir a pasta do card: ' + err.message };
  }

  var tarefa;
  try {
    tarefa = runrunFetch('/tasks/' + taskId);
  } catch (err) {
    return { ok: false, error: 'Não consegui ler a tarefa no Runrun.it: ' + err.message };
  }
  if (!tarefa) return { ok: false, error: 'Tarefa não encontrada no Runrun.it.' };

  var descricaoInfo = buscarDescricao(taskId);
  var descricaoTexto = (descricaoInfo.ok ? descricaoInfo.descricao : '') || '';
  var partes = separarRoteiroETakesDaDescricao(descricaoTexto);

  var pastaArquivos = getOuCriarSubpasta(pastaCard, 'Arquivos');
  var copiaInfo = copiarTakesParaArquivos(pastaArquivos, partes.takes);

  var mapaVinculos = buscarVinculosDoPainel();
  var nomeClienteBruto = tarefa.client_name || 'Sem cliente';
  var nomeClienteResolvido = resolverNomeCanonico(nomeClienteBruto, mapaVinculos);
  var tipoTarefa = extrairTipoTarefa(tarefa);

  var json = {
    versao: 1,
    atualizado_em: new Date().toISOString(),
    card: {
      id: String(taskId),
      numero: tarefa.id,
      titulo: tarefa.title || null,
      url: 'https://runrun.it/tasks/' + taskId,
      tipo_tarefa: tipoTarefa,
      status: tarefa.board_stage_name || tarefa.task_state_name || null
    },
    cliente: {
      nome: nomeClienteResolvido,
      pasta_cliente: nomeClienteResolvido
    },
    briefing: {
      formato: tipoTarefa,
      tipo_conteudo: tipoTarefa,
      descricao: partes.descricaoRestante || descricaoTexto || null,
      instrucoes: partes.instrucoes || null,
      roteiro: partes.roteiro || null
    },
    datas: {
      entrega_desejada: tarefa.desired_date ? String(tarefa.desired_date).substring(0, 10) : null,
      publicacao: (typeof extrairDataPublicacaoTarefa === 'function') ? extrairDataPublicacaoTarefa(tarefa) : null
    },
    atendimento: nomeDoAtendimentoDoCliente(nomeClienteResolvido),
    pasta: {
      caminho: caminhoCompletoDaPastaCard(pastaCard),
      drive_folder_id: pastaCard.getId()
    },
    takes: copiaInfo.takes
  };

  var arquivo;
  try {
    arquivo = gravarCardJsonNaPasta(pastaCard, json);
  } catch (err) {
    // A peça já foi preparada até aqui (takes copiados); só o retrato
    // final não foi gravado — avisa em vez de fingir sucesso.
    return { ok: false, error: 'Preparei os takes, mas não consegui gravar o card.json: ' + err.message };
  }

  return {
    ok: true,
    cardJsonUrl: arquivo.getUrl(),
    totalTakes: copiaInfo.takes.length,
    takesCopiados: copiaInfo.takes.filter(function (t) { return t.copiado; }).length,
    falhas: copiaInfo.takes
      .filter(function (t) { return !t.copiado; })
      .map(function (t) { return t.rotulo + ': ' + (t.erro || 'motivo desconhecido'); })
  };
}

/**
 * Separa roteiro, instruções e takes de uma descrição em texto livre, do
 * jeito que o atendimento escreve no Runrun.it hoje: linhas como
 * "Roteiro:", "Instruções:" e "Take 1:"/"Take 2:" marcando onde cada
 * pedaço começa. Sem nenhum marcador reconhecido, devolve a descrição
 * INTEIRA em descricaoRestante e takes vazio — nunca inventa um take que
 * não foi marcado (pedido explícito da especificação). Se esse padrão se
 * mostrar frágil em uso real, a saída é um campo próprio no briefing, não
 * um regex mais complicado — decisão pro Cláudio, não automática.
 */
function separarRoteiroETakesDaDescricao(texto) {
  var resultado = { roteiro: null, instrucoes: null, takes: [], descricaoRestante: texto || null };
  if (!texto) return resultado;

  // A descrição do Runrun.it vem em HTML (<p>, <br>) — normaliza pra
  // quebra de linha antes de procurar os marcadores, senão eles nunca
  // ficam no início de uma linha de texto puro.
  var normalizado = String(texto)
    .replace(/<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  var regexMarcador = /(roteiro|instru[cç][aã]o|instru[cç][oõ]es|take\s*\d+)\s*:/gi;
  var marcadores = [];
  var m;
  while ((m = regexMarcador.exec(normalizado))) {
    marcadores.push({ nome: m[1].toLowerCase().replace(/\s+/g, ' '), inicio: m.index, fimRotulo: m.index + m[0].length });
  }
  if (!marcadores.length) return resultado;

  var sobrouAntesDoPrimeiro = normalizado.substring(0, marcadores[0].inicio).trim();
  resultado.descricaoRestante = sobrouAntesDoPrimeiro || null;

  var regexUrlDrive = /https?:\/\/drive\.google\.com\/\S+/i;

  for (var i = 0; i < marcadores.length; i++) {
    var inicioConteudo = marcadores[i].fimRotulo;
    var fimConteudo = (i + 1 < marcadores.length) ? marcadores[i + 1].inicio : normalizado.length;
    var conteudo = normalizado.substring(inicioConteudo, fimConteudo).trim();
    var nome = marcadores[i].nome;

    if (nome === 'roteiro') {
      resultado.roteiro = conteudo || null;
    } else if (nome.indexOf('instru') === 0) {
      resultado.instrucoes = conteudo || null;
    } else {
      var numero = parseInt(nome.replace(/[^\d]/g, ''), 10) || (resultado.takes.length + 1);
      var urlMatch = conteudo.match(regexUrlDrive);
      resultado.takes.push({
        ordem: numero,
        rotulo: 'Take ' + numero,
        url: urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : null
      });
    }
  }
  resultado.takes.sort(function (a, b) { return a.ordem - b.ordem; });
  return resultado;
}

/**
 * O ID de um arquivo do Google Drive a partir do link de ARQUIVO
 * (".../file/d/<id>/view" ou "...?id=<id>"). Diferente de
 * extrairIdDeUrlDrive (Drive.gs), que só reconhece link de PASTA
 * (".../folders/<id>") — confirmado lendo o código de produção: um link
 * de take (que é um arquivo de vídeo) não casava com aquele regex.
 */
function extrairIdDeArquivoDrive(url) {
  if (!url) return null;
  var texto = String(url);
  var m = texto.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || texto.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * A extensão de um nome de arquivo, com o ponto (".mov", ".mp4"...), ou
 * '' se não tiver nenhuma.
 */
function extensaoDoNome(nome) {
  var pontoIdx = String(nome || '').lastIndexOf('.');
  return pontoIdx > -1 ? nome.substring(pontoIdx) : '';
}

/**
 * Procura em `pasta` um arquivo cujo nome, SEM extensão e sem diferenciar
 * maiúsculas/minúsculas, seja igual a `baseNome` (ex: "TAKE 01"). Dá pra
 * achar "TAKE 01.MOV" mesmo comparando com a base "TAKE 01" — é o que
 * reconhece um take que alguém já colocou à mão em Arquivos\, com
 * qualquer extensão, e evita copiar de novo por cima dele.
 */
function acharArquivoPorBaseDeNome(pasta, baseNome) {
  var alvo = baseNome.toLowerCase();
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    var nome = arquivo.getName();
    var ext = extensaoDoNome(nome);
    var base = ext ? nome.substring(0, nome.length - ext.length) : nome;
    if (base.toLowerCase() === alvo) return arquivo;
  }
  return null;
}

/**
 * Copia cada take pra Arquivos\TAKE 0N.<extensão original> dentro da
 * pasta do card, sem baixar o vídeo (DriveApp.makeCopy roda no servidor
 * do Drive, não passa pelo Apps Script) — por isso copiar vários takes
 * custa pouco tempo de execução cada, mesmo que os arquivos sejam
 * grandes.
 *
 * ⚠️ A extensão NUNCA é forçada pra .mp4 — mantém a do arquivo original
 * (confirmado em card real: os takes da agência chegam como .MOV, não
 * .mp4). Rodar de novo não duplica: a checagem de "já existe" ignora
 * extensão e maiúsculas/minúsculas (`acharArquivoPorBaseDeNome`), então
 * um "TAKE 01.MOV" colocado à mão em Arquivos\ também é reconhecido —
 * é o que faz "repetir" ser seguro de clicar de novo. Falha num take
 * não impede os outros de serem tentados.
 */
function copiarTakesParaArquivos(pastaArquivos, takesBrutos) {
  var takes = [];
  (takesBrutos || []).forEach(function (bruto) {
    var numero = bruto.ordem;
    var baseNome = 'TAKE ' + (numero < 10 ? '0' + numero : numero);
    var item = {
      ordem: numero,
      rotulo: bruto.rotulo,
      drive_file_id: null,
      url: bruto.url || null,
      arquivo_local: null,
      copiado: false
    };

    if (!bruto.url) {
      item.erro = 'Não achei um link do Drive pra esse take na descrição.';
      takes.push(item);
      return;
    }

    var fileId = extrairIdDeArquivoDrive(bruto.url);
    if (!fileId) {
      item.erro = 'O link não parece um link de arquivo do Google Drive (".../file/d/<id>/...").';
      takes.push(item);
      return;
    }
    item.drive_file_id = fileId;

    var existente = acharArquivoPorBaseDeNome(pastaArquivos, baseNome);
    if (existente) {
      item.copiado = true; // já estava lá (desta preparação ou colocado à mão) — não duplica
      item.arquivo_local = 'Arquivos/' + existente.getName();
      takes.push(item);
      return;
    }

    try {
      var original = DriveApp.getFileById(fileId);
      var nomeFinal = baseNome + extensaoDoNome(original.getName());
      original.makeCopy(nomeFinal, pastaArquivos);
      item.copiado = true;
      item.arquivo_local = 'Arquivos/' + nomeFinal;
    } catch (err) {
      // Cai aqui, por exemplo, se o arquivo original não foi compartilhado
      // com a conta do Apps Script (ver "Takes de outra conta" nos pontos
      // a resolver da especificação) — o motivo vai pro item, pra tela
      // mostrar qual take falhou e por quê, sem travar os outros.
      item.erro = 'Não consegui copiar: ' + err.message;
    }
    takes.push(item);
  });
  return { takes: takes };
}

/**
 * Grava (ou substitui) o card.json na raiz da pasta do card. Sempre
 * recriado do zero — card.json é um retrato de AGORA (tem
 * atualizado_em), não um histórico de versões; por isso qualquer arquivo
 * antigo com esse nome é apagado antes de criar o novo, em vez de
 * acumular "card (1).json", "card (2).json"...
 */
function gravarCardJsonNaPasta(pastaCard, dados) {
  var nome = 'card.json';
  var existentes = pastaCard.getFilesByName(nome);
  while (existentes.hasNext()) {
    existentes.next().setTrashed(true);
  }
  var texto = JSON.stringify(dados, null, 2);
  var blob = Utilities.newBlob(texto, 'application/json', nome);
  return pastaCard.createFile(blob);
}

/**
 * O caminho legível da pasta do card, subindo pelos pais até a pasta raiz
 * do Drive da agência (ROOT_FOLDER_ID_DRIVE, Drive.gs — normalmente a
 * própria pasta "Clientes"), com teto de segurança de 10 níveis. Dá
 * "Clientes/<cliente>/Publicações/<ano>/<mês>/<card>", igual ao exemplo
 * da especificação.
 */
function caminhoCompletoDaPastaCard(pastaCard) {
  var nomes = [];
  var atual = pastaCard;
  for (var i = 0; i < 10 && atual; i++) {
    nomes.unshift(atual.getName());
    if (atual.getId() === ROOT_FOLDER_ID_DRIVE) break;
    var pais = atual.getParents();
    atual = pais.hasNext() ? pais.next() : null;
  }
  return nomes.join('/');
}

/**
 * Nome do atendimento responsável por um cliente, pelo mesmo vínculo que
 * a Central do Atendimento já usa (mapaClienteParaAtendimento,
 * AprovacaoInterna.gs — lê o painel-designers-beeon). Best-effort: sem
 * vínculo cadastrado ou com o painel fora do ar, devolve null em vez de
 * travar a preparação da pasta por um dado que "ajuda, mas a edição
 * funciona sem ele" (ver a especificação).
 */
function nomeDoAtendimentoDoCliente(nomeCliente) {
  try {
    var mapa = mapaClienteParaAtendimento();
    return mapa[normalizarNomeParaComparar(nomeCliente || '')] || null;
  } catch (e) {
    return null;
  }
}
