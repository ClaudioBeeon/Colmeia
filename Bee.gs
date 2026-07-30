// A BEE — a assistente do Colmeia dentro do card da tarefa.
//
// Ela faz duas coisas bem diferentes, e é importante não confundir:
//
//  1) A PRIMEIRA MENSAGEM (beeResumo): um resumo do que a tarefa pede,
//     montado SÓ com o que está escrito (descrição, comentários da tarefa,
//     do card mãe e da peça original). Nada de ideia dela aqui — e cada
//     item aponta pra mensagem exata de onde saiu, pra dar pra conferir.
//
//  2) A CONVERSA (beeConversar): a partir do momento em que o designer
//     pergunta alguma coisa. Aí sim ela pode opinar, sugerir caminho
//     criativo, redigir um recado pro atendimento ou montar um prompt de
//     imagem pro Firefly. Palpite só existe se alguém pediu.
//
// Ela NUNCA escreve no Runrun.it sozinha. O que ela diz fica só no
// Colmeia; mandar algo pra lá é sempre um clique do designer (ver o
// ícone "mandar pro Runrun" em js/bee.js).
//
// A conversa fica guardada na planilha, UMA LINHA POR TAREFA (a conversa
// inteira dentro de uma célula), e é apagada 15 dias depois da entrega.

// ============ MATERIAL: o que a Bee leu ============

/**
 * Junta tudo que está escrito sobre uma tarefa numa lista de mensagens
 * NUMERADAS. O número é o que permite a Bee dizer "isso saiu da mensagem
 * 3" e o Colmeia transformar isso num link clicável — pedir pra ela
 * repetir o id do comentário daria erro toda hora; pedir um número de
 * uma lista que a gente mesmo montou é confiável.
 */
function beeMaterialDaTarefa(taskId, idOriginal) {
  var tarefa = runrunFetch('/tasks/' + taskId);
  if (!tarefa || tarefa.erroFetch) return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };

  var mensagens = [];

  function adicionar(texto, autor, data, onde, idTarefa, comentarioId) {
    if (!texto || !String(texto).trim()) return;
    mensagens.push({
      n: mensagens.length + 1,
      texto: String(texto).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      autor: autor || 'alguém',
      data: data || '',
      onde: onde,
      taskId: idTarefa || null,
      comentarioId: comentarioId || null
    });
  }

  function comentariosDe(idTarefa, onde) {
    if (!idTarefa) return;
    var r = listarComentarios(idTarefa);
    if (!r.ok) return;
    r.comentarios.forEach(function (c) {
      adicionar(c.texto, c.autor, c.data, onde, idTarefa, c.id);
    });
  }

  // A descrição entra como mensagem também: muitas vezes o pedido inteiro
  // está lá, e sem isso a Bee não teria de onde tirar item nenhum.
  adicionar(buscarDescricao(taskId).descricao, 'descrição da tarefa', tarefa.created_at, 'descricao', taskId, null);
  comentariosDe(taskId, 'aqui');
  comentariosDe(tarefa.parent_task_id, 'card mãe');
  if (idOriginal && String(idOriginal) !== String(taskId)) comentariosDe(idOriginal, 'tarefa original');

  // Ordem de hora: a Bee lê a história na ordem em que ela aconteceu.
  mensagens.sort(function (a, b) {
    return new Date(a.data || 0) - new Date(b.data || 0);
  });
  mensagens.forEach(function (m, i) { m.n = i + 1; });

  return {
    ok: true,
    titulo: tarefa.title || '',
    cliente: (tarefa.project && tarefa.project.name) || tarefa.project_name || '',
    ehAlteracao: /altera[cç][aã]o/i.test(tarefa.title || ''),
    mensagens: mensagens
  };
}

function beeTextoDoMaterial(material) {
  return material.mensagens.map(function (m) {
    return '[' + m.n + '] (' + m.onde + ') ' + m.autor +
      (m.data ? ' em ' + beeDataCurta(m.data) : '') + ': ' + m.texto;
  }).join('\n');
}

function beeDataCurta(iso) {
  try {
    return Utilities.formatDate(new Date(iso), 'America/Sao_Paulo', 'dd/MM');
  } catch (e) {
    return '';
  }
}

// ============ 1) A PRIMEIRA MENSAGEM (o resumo) ============

var BEE_VERSAO_PROMPT = 'bee-v1';

function beeResumo(taskId, idOriginal) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var material = beeMaterialDaTarefa(taskId, idOriginal);
  if (!material.ok) return material;
  if (!material.mensagens.length) return { ok: true, semMaterial: true, mensagens: [] };

  var textoMaterial = beeTextoDoMaterial(material);
  var hash = hashTexto(textoMaterial + '|' + BEE_VERSAO_PROMPT);
  var chaveCache = 'bee-' + taskId;
  var cacheado = buscarBriefingCacheado(chaveCache, hash);
  if (cacheado) return { ok: true, resumo: cacheado, mensagens: material.mensagens, doCache: true };

  var prompt = 'Você é a Bee, assistente da Colmeia, ferramenta de trabalho dos designers da Beeon ' +
    '(agência de marketing).\n\n' +
    'Abaixo está TUDO que está escrito sobre uma tarefa: a descrição, os comentários dela e — quando ' +
    'existem — os comentários do card mãe e da peça original. Cada mensagem tem um número entre ' +
    'colchetes.\n\n' +
    'Sua função nesta mensagem é UMA só: dizer ao designer o que essa tarefa pede.\n\n' +
    'REGRAS DURAS:\n' +
    '- Só diga o que está escrito no material. Nunca complete, nunca deduza, nunca sugira nada aqui.\n' +
    '- Para cada item, informe o NÚMERO da mensagem de onde ele saiu. Se você não conseguir apontar ' +
    'uma mensagem, não escreva o item.\n' +
    '- Se não houver nada escrito sobre o que fazer, devolva a lista vazia. É melhor que inventar.\n' +
    '- Não dê ideias, não elogie, não faça perguntas. Isso vem depois, e só se o designer pedir.\n\n' +
    'FORMATO DE CADA ITEM:\n' +
    '- Frase curta e direta, no imperativo ("trocar o azul do fundo por verde"). Sem enrolação.\n' +
    '- Português do Brasil, tom de colega de trabalho. Sem "olá", sem "claro!", sem emoji.\n' +
    (material.ehAlteracao
      ? '- Esta tarefa é uma ALTERAÇÃO: os itens são o que precisa MUDAR numa peça que já existe.\n'
      : '- Esta tarefa é uma criação normal: os itens são o que precisa SER FEITO.\n') +
    '\nTAREFA: ' + material.titulo + '\n' +
    (material.cliente ? 'CLIENTE: ' + material.cliente + '\n' : '') +
    '\nMATERIAL:\n' + textoMaterial + '\n\n' +
    'Responda SOMENTE em JSON, neste formato:\n' +
    '{"itens":[{"texto":"...","fonte":3}],"observacao":"..."}\n' +
    'A "observacao" é opcional: use só se houver algo importante que não é um pedido ' +
    '(ex: prazo citado, arquivo que falta). Deixe "" se não houver.';

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;

  var dados = resultado.dados || {};
  var porNumero = {};
  material.mensagens.forEach(function (m) { porNumero[m.n] = m; });

  // Descarta item que aponta pra uma mensagem que não existe — é o
  // sintoma de a IA ter inventado o item junto com a fonte.
  var itens = (dados.itens || []).filter(function (it) {
    return it && it.texto && porNumero[Number(it.fonte)];
  }).map(function (it) {
    var fonte = porNumero[Number(it.fonte)];
    return {
      texto: String(it.texto),
      autor: fonte.autor,
      quando: beeDataCurta(fonte.data),
      onde: fonte.onde,
      comentarioId: fonte.comentarioId,
      taskId: fonte.taskId
    };
  });

  var resumo = { itens: itens, observacao: dados.observacao || '' };
  salvarBriefingCacheado(chaveCache, hash, resumo);
  return { ok: true, resumo: resumo, mensagens: material.mensagens };
}

// ============ 2) A CONVERSA ============

/**
 * Igual ao chamarGemini, mas devolve TEXTO livre em vez de JSON — numa
 * conversa a resposta é um texto pra pessoa ler, não uma estrutura.
 */
function chamarGeminiTexto(prompt, modelo) {
  modelo = modelo || GEMINI_MODEL;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent';
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': GEMINI_API_KEY },
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    muteHttpExceptions: true
  });
  var codigo = res.getResponseCode();
  var parsed;
  try {
    parsed = JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, error: 'Resposta inesperada do Gemini (status ' + codigo + ').' };
  }
  // Nome de modelo que não existe (o Google devolve 404, às vezes 400):
  // em vez de deixar a Bee muda, cai no modelo rápido, que sempre existe.
  // Isso protege o dia em que o nome do modelo forte mudar do lado do
  // Google — a conversa fica mais rasa, mas continua funcionando.
  if ((codigo === 404 || codigo === 400) && modelo !== GEMINI_MODEL) {
    Logger.log('Modelo "' + modelo + '" indisponível, usando ' + GEMINI_MODEL + '. Resposta: ' + res.getContentText().substring(0, 200));
    return chamarGeminiTexto(prompt, GEMINI_MODEL);
  }
  if (codigo < 200 || codigo >= 300) {
    return { ok: false, error: (parsed.error && parsed.error.message) || ('Gemini recusou (status ' + codigo + ').') };
  }
  var c = parsed.candidates && parsed.candidates[0];
  var texto = c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text;
  if (!texto) return { ok: false, error: 'Gemini não devolveu nenhum texto.' };
  return { ok: true, texto: texto };
}

var BEE_INSTRUCOES_CONVERSA =
  'Você é a Bee, assistente da Colmeia, ferramenta de trabalho dos designers da Beeon ' +
  '(agência de marketing).\n\n' +
  'Você é especialista em design gráfico e criação publicitária, e conhece esta tarefa: leu a ' +
  'descrição, todos os comentários, o card mãe e a peça original. Agora o designer está ' +
  'conversando com você.\n\n' +
  'O QUE VOCÊ FAZ:\n' +
  '- Responde dúvidas sobre a tarefa a partir do que está escrito.\n' +
  '- Ajuda na criação quando pedirem: caminhos visuais, referências, como resolver um pedido vago.\n' +
  '- Escreve rascunhos de mensagem pro atendimento ou pro cliente, quando pedirem.\n' +
  '- Monta prompts de imagem ou vídeo pro Adobe Firefly (regras abaixo).\n\n' +
  'REGRAS DURAS:\n' +
  '- Separe sempre o que ESTÁ ESCRITO do que é IDEIA SUA. Ao afirmar algo sobre o pedido, diga de ' +
  'onde tirou ("a Marina escreveu no dia 14 que..."). Ao sugerir, deixe explícito que é sugestão sua.\n' +
  '- Nunca invente que o cliente pediu algo. Se não sabe, diga que não sabe.\n' +
  '- Você NÃO escreve no Runrun.it. Nada do que você disser vai pra lá sozinho — quem decide é o designer.\n' +
  '- Quando a pergunta fugir do que dá pra responder pelo que está escrito (escopo, prazo, aprovação ' +
  'do cliente, verba, mudança grande de direção), NÃO chute: diga que isso é com o atendimento e ' +
  'sugira chamar a pessoa responsável, que o Colmeia mostra ali no card.\n\n' +
  'TOM:\n' +
  '- Português do Brasil, direto, curto. Colega de trabalho, não assistente animada. Sem "claro!", ' +
  'sem "ótima pergunta", sem emoji, sem se desculpar.\n' +
  '- Respostas curtas por padrão. Só se alongue se pedirem.\n\n' +
  'PROMPTS PARA O FIREFLY:\n' +
  '- Escreva em inglês.\n' +
  '- No máximo 40 palavras. Precisa caber confortavelmente no campo do Firefly — prompt longo lá é ' +
  'pior, não melhor.\n' +
  '- Descreva nesta ordem: o que é a imagem, estilo, iluminação, enquadramento, proporção.\n' +
  '- Nunca use nome de marca, nome de artista vivo, nem pessoa real.\n' +
  '- Entregue o prompt sozinho, numa linha que começa com "FIREFLY:" e nada mais nessa linha. ' +
  'O Colmeia transforma essa linha num botão que abre o Firefly.\n';

var BEE_MAX_MENSAGENS_CONTEXTO = 12;

/**
 * Monta o pedaço do prompt que diz COM QUEM ela está falando. O nome vem
 * do login do Colmeia (DESIGNER_LOGADO no front), não de adivinhação.
 */
function beeQuemEstaFalando(designer) {
  if (!designer) return '';
  var primeiroNome = String(designer).trim().split(' ')[0];
  return '\nQUEM ESTÁ FALANDO COM VOCÊ: ' + designer + ' (chame de "' + primeiroNome + '").\n' +
    'Cumprimente pelo primeiro nome na primeira resposta da conversa, de um jeito natural e curto ' +
    '("Oi, ' + primeiroNome + '." e já vai ao assunto). Nas seguintes, não repita o cumprimento.\n';
}

function beeConversar(taskId, pergunta, idOriginal, designer) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  if (!pergunta || !String(pergunta).trim()) return { ok: false, error: 'Escreve a pergunta.' };

  var material = beeMaterialDaTarefa(taskId, idOriginal);
  if (!material.ok) return material;

  var conversa = lerConversaBee(taskId);
  // Só as últimas trocas vão junto: conversa longa demais deixa a resposta
  // lenta e cara sem melhorar nada.
  var recentes = conversa.slice(-BEE_MAX_MENSAGENS_CONTEXTO);
  var historico = recentes.map(function (m) {
    return (m.autor === 'bee' ? 'BEE: ' : (m.quem || 'DESIGNER') + ': ') + m.texto;
  }).join('\n');

  var prompt = BEE_INSTRUCOES_CONVERSA +
    beeQuemEstaFalando(designer) +
    '\nTAREFA: ' + material.titulo + '\n' +
    (material.cliente ? 'CLIENTE: ' + material.cliente + '\n' : '') +
    '\nTUDO QUE ESTÁ ESCRITO SOBRE ELA:\n' + (beeTextoDoMaterial(material) || '(nada escrito ainda)') + '\n' +
    (historico ? '\nCONVERSA ATÉ AQUI:\n' + historico + '\n' : '') +
    '\n' + (designer || 'DESIGNER') + ': ' + String(pergunta).trim() + '\n\nBEE:';

  var resultado = chamarGeminiTexto(prompt, GEMINI_MODEL_CONVERSA);
  if (!resultado.ok) return resultado;

  var agora = new Date().getTime();
  conversa.push({ autor: 'designer', quem: designer || '', texto: String(pergunta).trim(), quando: agora });
  conversa.push({ autor: 'bee', texto: resultado.texto.trim(), quando: agora + 1 });
  salvarConversaBee(taskId, conversa);

  return { ok: true, resposta: resultado.texto.trim(), conversa: conversa };
}

// ============ 3) A BEE SOLTA (sem tarefa nenhuma) ============
//
// A bolinha no canto da tela: aqui ela não lê tarefa, não resume nada e
// não tem contexto de Runrun.it. É só uma especialista em design com quem
// dá pra pensar em voz alta — a mesma Bee, sem crachá.
//
// A conversa é guardada por PESSOA (uma linha na mesma aba BeeChat, com a
// chave "livre-<nome>"), e a limpeza dos 45 dias sem uso vale igual.

var BEE_INSTRUCOES_LIVRE =
  'Você é a Bee, a assistente da Colmeia — a ferramenta de trabalho dos designers da Beeon, ' +
  'uma agência de marketing.\n\n' +
  'Aqui você NÃO está dentro de nenhuma tarefa: não tem briefing, não tem cliente, não tem ' +
  'comentário pra ler. É uma conversa livre com o designer, e você é uma especialista em design ' +
  'gráfico, direção de arte e criação publicitária.\n\n' +
  'O QUE VOCÊ FAZ AQUI:\n' +
  '- Ajuda a pensar: composição, tipografia, cor, hierarquia, grid, ritmo, contraste.\n' +
  '- Sugere caminhos criativos e referências (descrevendo o estilo, não citando artista vivo).\n' +
  '- Resolve dúvidas técnicas de ferramenta (Photoshop, Illustrator, After Effects, Figma), ' +
  'formato, resolução, cor pra impressão x tela, exportação.\n' +
  '- Ajuda a escrever texto curto de peça (título, chamada, legenda).\n' +
  '- Monta prompts de imagem ou vídeo pro Adobe Firefly (regras abaixo).\n\n' +
  'REGRAS:\n' +
  '- Não invente informação sobre tarefa, cliente ou prazo — aqui você não tem acesso a nada disso. ' +
  'Se perguntarem sobre uma tarefa específica, diga que pra isso é só abrir o card e falar com você ' +
  'por lá, onde você lê tudo.\n' +
  '- Opinião é bem-vinda aqui: se pedirem sua preferência entre dois caminhos, escolha um e diga por quê.\n\n' +
  'TOM:\n' +
  '- Português do Brasil, direto, curto. Colega de trabalho experiente, não assistente animada. ' +
  'Sem "claro!", sem "ótima pergunta", sem emoji, sem se desculpar.\n' +
  '- Respostas curtas por padrão. Só se alongue se pedirem.\n\n' +
  'PROMPTS PARA O FIREFLY:\n' +
  '- Escreva em inglês, no máximo 40 palavras.\n' +
  '- Descreva nesta ordem: o que é a imagem, estilo, iluminação, enquadramento, proporção.\n' +
  '- Nunca use nome de marca, nome de artista vivo, nem pessoa real.\n' +
  '- Entregue o prompt sozinho, numa linha que começa com "FIREFLY:" e nada mais nessa linha.\n';

function beeChaveLivre(designer) {
  return 'livre-' + String(designer || 'sem-nome').trim().toLowerCase();
}

function beeConversarLivre(pergunta, designer) {
  if (!pergunta || !String(pergunta).trim()) return { ok: false, error: 'Escreve a pergunta.' };
  var chave = beeChaveLivre(designer);
  var conversa = lerConversaBee(chave);
  var recentes = conversa.slice(-BEE_MAX_MENSAGENS_CONTEXTO);
  var historico = recentes.map(function (m) {
    return (m.autor === 'bee' ? 'BEE: ' : (m.quem || 'DESIGNER') + ': ') + m.texto;
  }).join('\n');

  var prompt = BEE_INSTRUCOES_LIVRE +
    beeQuemEstaFalando(designer) +
    (historico ? '\nCONVERSA ATÉ AQUI:\n' + historico + '\n' : '') +
    '\n' + (designer || 'DESIGNER') + ': ' + String(pergunta).trim() + '\n\nBEE:';

  var resultado = chamarGeminiTexto(prompt, GEMINI_MODEL_CONVERSA);
  if (!resultado.ok) return resultado;

  var agora = new Date().getTime();
  conversa.push({ autor: 'designer', quem: designer || '', texto: String(pergunta).trim(), quando: agora });
  conversa.push({ autor: 'bee', texto: resultado.texto.trim(), quando: agora + 1 });
  salvarConversaBee(chave, conversa);

  return { ok: true, resposta: resultado.texto.trim(), conversa: conversa };
}

// ============ ONDE A CONVERSA FICA GUARDADA ============
//
// UMA LINHA POR TAREFA, com a conversa inteira dentro de uma célula só
// (uma célula do Sheets aguenta 50 mil caracteres, o que dá umas 100
// mensagens). Guardar uma linha por mensagem faria a aba crescer rápido
// demais e deixaria a leitura lenta.

var BEE_DIAS_APOS_ENTREGA = 15;
var BEE_DIAS_SEM_MEXER = 45; // rede de segurança pra linha que nunca recebeu carimbo de entrega

function getBeeChatSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('BeeChat');
  if (!sheet) {
    sheet = ss.insertSheet('BeeChat');
    sheet.getRange('A1:D1').setValues([['task_id', 'conversa_json', 'entregue_em', 'atualizado_em']]);
  }
  return sheet;
}

function beeLinhaDaTarefa(sheet, taskId) {
  var linhas = sheet.getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(taskId)) return { indice: i + 1, valores: linhas[i] };
  }
  return null;
}

function lerConversaBee(taskId) {
  if (!taskId) return [];
  var linha = beeLinhaDaTarefa(getBeeChatSheet(), taskId);
  if (!linha) return [];
  try {
    var lista = JSON.parse(linha.valores[1] || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

function salvarConversaBee(taskId, mensagens) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getBeeChatSheet();
    var texto = JSON.stringify(mensagens || []);
    // Uma célula do Sheets aguenta 50 mil caracteres. Se estourar, joga
    // fora as mensagens mais antigas — perder o começo é bem melhor do
    // que a gravação falhar e perder a conversa inteira.
    while (texto.length > 45000 && mensagens.length > 2) {
      mensagens = mensagens.slice(2);
      texto = JSON.stringify(mensagens);
    }
    var agora = new Date().getTime();
    var linha = beeLinhaDaTarefa(sheet, taskId);
    if (linha) {
      sheet.getRange(linha.indice, 2).setValue(texto);
      sheet.getRange(linha.indice, 4).setValue(agora);
    } else {
      sheet.appendRow([String(taskId), texto, '', agora]);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Carimba a data de entrega da tarefa, que é o que dispara a contagem
 * dos 15 dias. Chamado quando a entrega acontece PELO Colmeia — é de
 * longe o jeito mais barato de saber disso (perguntar pro Runrun.it
 * sobre cada tarefa todo dia seria lento e caro).
 */
function marcarEntregaParaBee(taskId) {
  if (!taskId) return;
  try {
    var sheet = getBeeChatSheet();
    var linha = beeLinhaDaTarefa(sheet, taskId);
    if (linha) sheet.getRange(linha.indice, 3).setValue(new Date().getTime());
  } catch (e) { /* sem conversa guardada dessa tarefa — nada a carimbar */ }
}

/**
 * Limpeza diária: apaga a conversa 15 dias depois da entrega. A rede de
 * segurança dos 45 dias cobre a tarefa que nunca foi entregue pelo
 * Colmeia (entregue direto no Runrun.it, por exemplo) — senão a linha
 * dela ficaria ali pra sempre.
 */
function limparConversasBeeAntigas() {
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getBeeChatSheet();
    var linhas = sheet.getDataRange().getValues();
    var agora = new Date().getTime();
    var limiteEntrega = BEE_DIAS_APOS_ENTREGA * 24 * 60 * 60 * 1000;
    var limiteSemMexer = BEE_DIAS_SEM_MEXER * 24 * 60 * 60 * 1000;
    var apagadas = 0;
    // De baixo pra cima: apagar linha muda o número das de baixo.
    for (var i = linhas.length - 1; i >= 1; i--) {
      var entregueEm = Number(linhas[i][2]) || 0;
      var atualizadoEm = Number(linhas[i][3]) || 0;
      var venceuPelaEntrega = entregueEm && (agora - entregueEm) > limiteEntrega;
      var venceuPorAbandono = !entregueEm && atualizadoEm && (agora - atualizadoEm) > limiteSemMexer;
      if (venceuPelaEntrega || venceuPorAbandono) {
        sheet.deleteRow(i + 1);
        apagadas++;
      }
    }
    return { ok: true, apagadas: apagadas };
  } finally {
    lock.releaseLock();
  }
}
