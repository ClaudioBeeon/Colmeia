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
/**
 * Troca cada <img> do texto por uma frase que a IA consegue ler.
 *
 * Todo lugar que manda texto pra IA faz `replace(/<[^>]*>/g, ' ')` pra
 * tirar as marcações de formatação. O problema é que uma imagem colada
 * TAMBÉM é uma marcação — então ela virava um espaço em branco e a IA
 * nunca ficava sabendo que existia. Na prática a Bee dizia "não tem
 * referência" numa tarefa onde a referência estava colada na descrição.
 *
 * Não dá pra IA "ver" a imagem por aqui (ela recebe só texto nessa
 * chamada), mas saber que existe uma já muda a resposta: ela passa a
 * apontar a imagem em vez de fingir que a tarefa não tem material.
 */
function marcarImagensNoTexto(html) {
  if (!html) return '';
  return String(html).replace(/<img\b[^>]*>/gi, function (tag) {
    var alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    var descricao = alt && alt[1] ? alt[1].trim() : '';
    return descricao
      ? ' [IMAGEM colada aqui: ' + descricao + '] '
      : ' [IMAGEM colada aqui — abrir a tarefa pra ver] ';
  });
}

function beeMaterialDaTarefa(taskId, idOriginal) {
  var tarefa = runrunFetch('/tasks/' + taskId);
  if (!tarefa || tarefa.erroFetch) return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };

  var mensagens = [];

  function adicionar(texto, autor, data, onde, idTarefa, comentarioId) {
    if (!texto || !String(texto).trim()) return;
    mensagens.push({
      n: mensagens.length + 1,
      // marcarImagensNoTexto ANTES de tirar as marcações: senão o print
      // colado (que é uma marcação <img>) virava um espaço em branco e a
      // Bee lia a descrição como se a imagem não existisse — ela dizia
      // "não tem referência" numa tarefa que tinha a referência colada ali.
      texto: String(marcarImagensNoTexto(texto)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
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
  // A DESCRIÇÃO do card mãe, não só os comentários dele. Faltava, e era um
  // buraco grande: na Beeon o pedido inteiro do mês costuma estar escrito
  // na descrição do card mãe, e cada subtarefa nasce só com o nome da peça.
  // Sem isso a Bee lia uma tarefa vazia e dizia "não tem nada escrito
  // sobre o que fazer" numa peça que tinha briefing completo — só que um
  // andar acima.
  if (tarefa.parent_task_id) {
    var descMae = buscarDescricao(tarefa.parent_task_id);
    adicionar(descMae && descMae.descricao, 'descrição do card mãe', tarefa.created_at, 'card mãe', tarefa.parent_task_id, null);
  }
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
  'O Colmeia transforma essa linha num botão que abre o Firefly.\n\n' +
  'CHECKLIST:\n' +
  '- Quando pedirem um checklist (ex: "faz uma lista pra eu conferir se fiz tudo"), escreva CADA item ' +
  'numa linha própria, começando exatamente com "- [ ] " (hífen, espaço, colchete, espaço, colchete, ' +
  'espaço) seguido do texto do item. O Colmeia transforma cada uma dessas linhas numa caixinha de ' +
  'marcar de verdade — por isso o formato tem que ser exato, sem enfeite antes do hífen.\n';

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
    beeTrechoDoDna(material.cliente) +
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
  '- Entregue o prompt sozinho, numa linha que começa com "FIREFLY:" e nada mais nessa linha.\n\n' +
  'CHECKLIST:\n' +
  '- Quando pedirem um checklist, escreva CADA item numa linha própria, começando exatamente com ' +
  '"- [ ] " (hífen, espaço, colchete, espaço, colchete, espaço) seguido do texto do item. O Colmeia ' +
  'transforma cada uma dessas linhas numa caixinha de marcar de verdade.\n';

function beePrefixoLivre(designer) {
  return 'livre-' + String(designer || 'sem-nome').trim().toLowerCase() + '-';
}

// A chave antiga, de quando existia UMA conversa livre por pessoa. Fica
// aqui pra conversa de antes dessa mudança não sumir da lista.
function beeChaveLivre(designer) {
  return 'livre-' + String(designer || 'sem-nome').trim().toLowerCase();
}

/**
 * O título de uma conversa é a primeira coisa que a pessoa perguntou,
 * cortada. Sai de graça e é sempre mais útil que "Conversa 3".
 */
function beeTituloDaConversa(mensagens) {
  for (var i = 0; i < mensagens.length; i++) {
    if (mensagens[i].autor === 'designer' && mensagens[i].texto) {
      var t = String(mensagens[i].texto).trim();
      return t.length > 48 ? t.substring(0, 47) + '…' : t;
    }
  }
  return 'Conversa';
}

/**
 * Lista as conversas livres de uma pessoa, da mais recente pra mais
 * antiga — é o que alimenta "Conversas recentes" na tela inicial da Bee.
 */
function beeListarConversasLivres(designer) {
  var sheet = getBeeChatSheet();
  var linhas = sheet.getDataRange().getValues();
  var prefixo = beePrefixoLivre(designer);
  var antiga = beeChaveLivre(designer);
  var lista = [];
  for (var i = 1; i < linhas.length; i++) {
    var chave = String(linhas[i][0]);
    if (chave.indexOf(prefixo) !== 0 && chave !== antiga) continue;
    var mensagens = [];
    try { mensagens = JSON.parse(linhas[i][1] || '[]'); } catch (e) { mensagens = []; }
    if (!mensagens.length) continue;
    var ultima = mensagens[mensagens.length - 1];
    lista.push({
      chave: chave,
      titulo: linhas[i][4] || beeTituloDaConversa(mensagens),
      previa: String((ultima && ultima.texto) || '').substring(0, 70),
      quando: Number(linhas[i][3]) || 0
    });
  }
  lista.sort(function (a, b) { return b.quando - a.quando; });
  return { ok: true, conversas: lista };
}

function beeConversarLivre(pergunta, designer, chaveConversa) {
  if (!pergunta || !String(pergunta).trim()) return { ok: false, error: 'Escreve a pergunta.' };
  // Sem chave = conversa nova. O carimbo de hora no nome garante que
  // cada "novo chat" vira uma linha própria na planilha.
  var chave = chaveConversa || (beePrefixoLivre(designer) + new Date().getTime());
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
  salvarConversaBee(chave, conversa, beeTituloDaConversa(conversa));

  return { ok: true, resposta: resultado.texto.trim(), conversa: conversa, chave: chave, titulo: beeTituloDaConversa(conversa) };
}

// ============ 4) A MEMÓRIA DO CLIENTE ============
//
// As manias de cada cliente ("sempre pede pra aumentar a logo", "não
// gosta de fundo escuro"), tiradas das tarefas antigas dele. É a coisa
// que uma IA genérica NUNCA vai saber — está na conversa do time, não na
// internet — e é o que um designer novo levaria meses pra aprender.
//
// É de longe a coisa mais cara que a Bee faz: precisa ler os comentários
// de várias tarefas. Por isso roda no máximo 1x por semana por cliente e
// fica guardada na aba MemoriaCliente. Nos outros 6 dias e 23 horas,
// abrir um card não custa nada — só lê o que já está lá.

var MEMORIA_CLIENTE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;
var MEMORIA_CLIENTE_MAX_TAREFAS = 15;

function getMemoriaClienteSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('MemoriaCliente');
  if (!sheet) {
    sheet = ss.insertSheet('MemoriaCliente');
    sheet.getRange('A1:C1').setValues([['cliente', 'memoria_json', 'atualizado_em']]);
  }
  return sheet;
}

function lerMemoriaCliente(cliente) {
  var sheet = getMemoriaClienteSheet();
  var linhas = sheet.getDataRange().getValues();
  var alvo = String(cliente || '').trim().toLowerCase();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]).trim().toLowerCase() === alvo) {
      try {
        return { indice: i + 1, memoria: JSON.parse(linhas[i][1] || '{}'), quando: Number(linhas[i][2]) || 0 };
      } catch (e) {
        return { indice: i + 1, memoria: null, quando: 0 };
      }
    }
  }
  return null;
}

function salvarMemoriaCliente(cliente, memoria) {
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getMemoriaClienteSheet();
    var existente = lerMemoriaCliente(cliente);
    var agora = new Date().getTime();
    if (existente) {
      sheet.getRange(existente.indice, 2).setValue(JSON.stringify(memoria));
      sheet.getRange(existente.indice, 3).setValue(agora);
    } else {
      sheet.appendRow([String(cliente), JSON.stringify(memoria), agora]);
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * @param {string} cliente  nome do cliente
 * @param {Array}  taskIds  ids das tarefas DELE, mais recentes primeiro —
 *                          mandados pelo front, que já tem o quadro
 *                          inteiro em memória. Evita o backend ter que
 *                          repaginar o Runrun.it inteiro só pra descobrir
 *                          quais tarefas são desse cliente.
 * @param {boolean} forcar  ignora a validade de 7 dias e refaz agora
 */
function beeMemoriaDoCliente(cliente, taskIds, forcar) {
  if (!cliente) return { ok: false, error: 'cliente não informado.' };

  var guardada = lerMemoriaCliente(cliente);
  var agora = new Date().getTime();
  if (!forcar && guardada && guardada.memoria && (agora - guardada.quando) < MEMORIA_CLIENTE_VALIDADE_MS) {
    return { ok: true, memoria: guardada.memoria, doCache: true, quando: guardada.quando };
  }

  var ids = (taskIds || []).slice(0, MEMORIA_CLIENTE_MAX_TAREFAS);
  if (!ids.length) return { ok: true, semMaterial: true };

  var conversas = [];
  ids.forEach(function (id) {
    var r = listarComentarios(id);
    if (!r.ok) return;
    r.comentarios.forEach(function (c) {
      var texto = String(marcarImagensNoTexto(c.texto)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (texto) conversas.push(c.autor + ': ' + texto);
    });
  });
  if (!conversas.length) return { ok: true, semMaterial: true };

  // Conversa demais estoura o pedido e não melhora o resultado: as
  // manias aparecem repetidas, não escondidas no fim.
  var material = conversas.slice(0, 400).join('\n');

  var prompt = 'Você é a Bee, assistente dos designers da Beeon (agência de marketing).\n\n' +
    'Abaixo estão os comentários das últimas tarefas do cliente "' + cliente + '". Sua função é ' +
    'dizer ao designer COMO ESSE CLIENTE É — as manias dele, o que ele sempre pede pra mudar, o ' +
    'que ele não gosta. É a informação que um designer novo levaria meses pra aprender no tapa.\n\n' +
    'REGRAS DURAS:\n' +
    '- Só aponte um padrão se ele aparecer em PELO MENOS 3 tarefas diferentes. Uma reclamação isolada, ou repetida uma vez só, não é mania — é caso pontual.\n' +
    '- Nada de generalidade ("gosta de qualidade", "é exigente"). Se não for específico e acionável, corta.\n' +
    '- Fale de design e de processo, não da pessoa. Nunca escreva algo que seria constrangedor se o ' +
    'cliente lesse.\n' +
    '- Se não der pra tirar nenhum padrão claro, devolva a lista vazia.\n\n' +
    'FORMATO: no máximo 5 itens, frase curta e direta em português do Brasil ' +
    '("sempre pede pra aumentar a logo depois da primeira versão").\n\n' +
    'COMENTÁRIOS:\n' + material + '\n\n' +
    'Responda SOMENTE em JSON: {"manias":["...","..."],"observacao":""}\n' +
    'A "observacao" é opcional: use pra algo do processo que ajude o designer (ex: "costuma responder ' +
    'só no fim da tarde"). Deixe "" se não houver.';

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) {
    // Se a IA falhou mas existe uma memória velha guardada, devolve a
    // velha: informação de uma semana atrás é muito melhor que nenhuma.
    if (guardada && guardada.memoria) return { ok: true, memoria: guardada.memoria, doCache: true, quando: guardada.quando };
    return resultado;
  }

  var memoria = {
    manias: (resultado.dados && resultado.dados.manias) || [],
    observacao: (resultado.dados && resultado.dados.observacao) || '',
    tarefasLidas: ids.length
  };
  salvarMemoriaCliente(cliente, memoria);
  return { ok: true, memoria: memoria, quando: agora };
}

// ============ 4b) MEMÓRIAS ESCRITAS À MÃO ============
//
// O que você e o time digitam em "Memórias da Bee" (Configurações). É a
// base do DNA do cliente: informação que ninguém precisa deduzir porque
// alguém simplesmente SABE ("esse cliente não usa serifa", "aprova mais
// rápido quando tem foto real").
//
// Elas ficam numa aba separada da memória deduzida, mas a Bee lê as duas
// juntas na hora de conversar — foi assim que o Cláudio pediu.

function getMemoriasBeeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('MemoriasBee');
  if (!sheet) {
    sheet = ss.insertSheet('MemoriasBee');
    sheet.getRange('A1:E1').setValues([['id', 'cliente', 'texto', 'autor', 'criado_em']]);
  }
  return sheet;
}

function listarMemoriasBee(cliente) {
  var sheet = getMemoriasBeeSheet();
  var linhas = sheet.getDataRange().getValues();
  var alvo = cliente ? String(cliente).trim().toLowerCase() : null;
  var lista = [];
  for (var i = 1; i < linhas.length; i++) {
    if (!linhas[i][0]) continue;
    if (alvo && String(linhas[i][1]).trim().toLowerCase() !== alvo) continue;
    lista.push({
      id: String(linhas[i][0]),
      cliente: String(linhas[i][1]),
      texto: String(linhas[i][2]),
      autor: String(linhas[i][3]),
      criadoEm: Number(linhas[i][4]) || 0
    });
  }
  lista.sort(function (a, b) { return b.criadoEm - a.criadoEm; });
  return { ok: true, memorias: lista };
}

function adicionarMemoriaBee(cliente, texto, autor) {
  if (!cliente || !String(cliente).trim()) return { ok: false, error: 'Escolhe o cliente.' };
  if (!texto || !String(texto).trim()) return { ok: false, error: 'Escreve a memória.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getMemoriasBeeSheet();
    var id = 'mem-' + new Date().getTime();
    sheet.appendRow([id, String(cliente).trim(), String(texto).trim(), autor || '', new Date().getTime()]);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function excluirMemoriaBee(id) {
  if (!id) return { ok: false, error: 'id não informado.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getMemoriasBeeSheet();
    var linhas = sheet.getDataRange().getValues();
    for (var i = linhas.length - 1; i >= 1; i--) {
      if (String(linhas[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Memória não encontrada.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sugestões que alguém já descartou. Sem isso, a Bee ressugeriria a
 * mesma coisa toda semana, quando reler as tarefas — e uma sugestão
 * recusada que volta é pior que sugestão nenhuma.
 */
function getMemoriasDescartadasSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('MemoriasDescartadas');
  if (!sheet) {
    sheet = ss.insertSheet('MemoriasDescartadas');
    sheet.getRange('A1:C1').setValues([['cliente', 'texto', 'quando']]);
  }
  return sheet;
}

function listarDescartadas(cliente) {
  var linhas = getMemoriasDescartadasSheet().getDataRange().getValues();
  var alvo = String(cliente || '').trim().toLowerCase();
  var lista = [];
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]).trim().toLowerCase() === alvo) lista.push(String(linhas[i][1]).trim().toLowerCase());
  }
  return lista;
}

function descartarSugestaoDeMemoria(cliente, texto) {
  if (!cliente || !texto) return { ok: false, error: 'cliente ou texto não informado.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    getMemoriasDescartadasSheet().appendRow([String(cliente).trim(), String(texto).trim(), new Date().getTime()]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * O DNA do cliente numa resposta só: o que foi escrito à mão e o que a
 * Bee deduziu, juntos — sem separar, como o Cláudio pediu. A origem
 * continua guardada em cada item (campo "escrita") porque isso é de
 * graça e permite separar de novo um dia, se ele mudar de ideia; a tela
 * simplesmente não usa esse campo hoje.
 */
function beeDnaDoCliente(cliente) {
  if (!cliente) return { ok: false, error: 'cliente não informado.' };
  var manuais = listarMemoriasBee(cliente).memorias.map(function (m) {
    return { id: m.id, texto: m.texto, autor: m.autor, escrita: true };
  });
  var deduzida = lerMemoriaCliente(cliente);
  // Fora do DNA: o que já foi descartado e o que já foi fixado à mão
  // (senão a mesma frase apareceria duas vezes na lista).
  var descartadas = listarDescartadas(cliente);
  var jaEscritas = manuais.map(function (m) { return m.texto.trim().toLowerCase(); });
  var automaticas = (deduzida && deduzida.memoria && deduzida.memoria.manias || [])
    .filter(function (t) {
      var chave = String(t).trim().toLowerCase();
      return descartadas.indexOf(chave) === -1 && jaEscritas.indexOf(chave) === -1;
    })
    .map(function (t) {
      return { id: null, texto: t, autor: 'Bee', escrita: false };
    });
  return {
    ok: true,
    cliente: cliente,
    itens: manuais.concat(automaticas),
    observacao: (deduzida && deduzida.memoria && deduzida.memoria.observacao) || '',
    deduzidoEm: (deduzida && deduzida.quando) || 0
  };
}

/**
 * O pedaço de prompt com o DNA do cliente. Entra nas conversas da Bee
 * (na tarefa e na livre, quando o cliente é conhecido) — é isso que faz
 * ela "conhecer" o cliente em vez de responder no genérico.
 */
function beeTrechoDoDna(cliente) {
  if (!cliente) return '';
  var dna = beeDnaDoCliente(cliente);
  if (!dna.ok || !dna.itens.length) return '';
  var linhas = dna.itens.map(function (i) { return '- ' + i.texto; }).join('\n');
  return '\nO QUE VOCÊ JÁ SABE SOBRE O CLIENTE ' + cliente + ':\n' + linhas +
    (dna.observacao ? '\n- ' + dna.observacao : '') +
    '\nUse isso quando for útil, sem repetir a lista pra pessoa. Se algo aqui contradisser o que ' +
    'está escrito na tarefa, o que está na tarefa vale mais — isso aqui é histórico, aquilo é o pedido de agora.\n';
}

// ============ 5) CONFERIR O QUE FALTA (antes de entregar) ============
//
// Compara o que foi PEDIDO (a mesma leitura da primeira fala dela) com o
// que foi FEITO (os arquivos que subiram na pasta do card) e aponta o que
// parece ter ficado de fora. Só roda quando o designer clica — nunca
// sozinha, nunca na abertura do card.

function beeConferirEntrega(taskId, idOriginal, cliente) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var material = beeMaterialDaTarefa(taskId, idOriginal);
  if (!material.ok) return material;
  if (!material.mensagens.length) {
    return { ok: true, resposta: 'Não tem nada escrito sobre o que essa tarefa pede, então não tenho com o que comparar.' };
  }

  var arquivos = [];
  try {
    var uploads = buscarUploadsRecentesDoCard(taskId, cliente);
    if (uploads && uploads.ok) {
      arquivos = (uploads.arquivos || []).map(function (a) { return a.nome || a.name || ''; }).filter(String);
    }
  } catch (e) { /* sem pasta no Drive ainda — segue só com o que foi pedido */ }

  var prompt = 'Você é a Bee, assistente dos designers da Beeon (agência de marketing).\n\n' +
    'O designer está prestes a entregar uma tarefa e quer conferir se não esqueceu nada.\n\n' +
    'Abaixo está TUDO que foi pedido (descrição e comentários) e a LISTA DE ARQUIVOS que ele subiu ' +
    'na pasta do card.\n\n' +
    'Sua função: apontar o que parece ter FICADO DE FORA. Compare o que foi pedido com o que existe.\n\n' +
    'REGRAS DURAS:\n' +
    '- Só aponte o que está escrito no pedido. Não invente entregável que ninguém pediu.\n' +
    '- Nome de arquivo é pista, não prova: você não vê o conteúdo. Escreva como dúvida ("não achei ' +
    'nenhum arquivo que pareça o story — subiu?"), nunca como acusação.\n' +
    '- Se estiver tudo aparentemente lá, diga isso em uma linha e pare. Não invente ressalva pra ' +
    'parecer útil.\n' +
    '- Português do Brasil, curto e direto, em tópicos. Sem emoji, sem enrolação.\n\n' +
    'O QUE FOI PEDIDO:\n' + beeTextoDoMaterial(material) + '\n\n' +
    'ARQUIVOS NA PASTA DO CARD:\n' + (arquivos.join('\n') || '(nenhum arquivo encontrado na pasta)');

  var resultado = chamarGeminiTexto(prompt, GEMINI_MODEL_CONVERSA);
  if (!resultado.ok) return resultado;

  // Entra na conversa como uma fala dela: fica registrado junto com o
  // resto, em vez de sumir quando o card fechar.
  var conversa = lerConversaBee(taskId);
  var agora = new Date().getTime();
  conversa.push({ autor: 'designer', texto: 'Confere o que falta antes de eu entregar.', quando: agora });
  conversa.push({ autor: 'bee', texto: resultado.texto.trim(), quando: agora + 1 });
  salvarConversaBee(taskId, conversa);

  return { ok: true, resposta: resultado.texto.trim(), conversa: conversa };
}

// ============ 5c) COMPARAR VERSÕES (diff visual) ============
//
// Pedido do Cláudio (2026-08-03): "o que mudou da V1 pra V2, escrito
// sozinho". Pega as duas imagens mais recentes da pasta do card com o
// nome no padrão "<título> - vN.<extensão>" (ver nomeArquivoPadronizado,
// Drive.gs — todo upload feito arrastando um arquivo pro card já nasce
// com esse padrão) e manda as DUAS pro Gemini de uma vez, pedindo pra
// apontar as diferenças — é a primeira vez que a Bee realmente OLHA o
// conteúdo de uma imagem, não só o nome do arquivo (ver a ressalva "você
// não vê o conteúdo" em beeConferirEntrega, logo acima).
//
// Só funciona com IMAGEM (PNG/JPG/etc — o que o Gemini consegue ver).
// PSD/AI cru não entra na comparação.
function compararVersoesDoCard(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var pastaInfo = buscarPastaSalvaDoCard(taskId);
  if (!pastaInfo.ok || !pastaInfo.url) {
    return { ok: false, error: 'Essa tarefa ainda não tem uma pasta do card vinculada no Drive.' };
  }

  var pasta;
  try {
    pasta = DriveApp.getFolderById(extrairIdDeUrlDrive(pastaInfo.url));
  } catch (e) {
    return { ok: false, error: 'Não consegui acessar a pasta do card no Drive.' };
  }

  var versoes = [];
  var re = / - v(\d+)\.[^.]+$/i;
  var arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    var arq = arquivos.next();
    if (arq.getMimeType().indexOf('image/') !== 0) continue;
    var m = arq.getName().match(re);
    if (m) versoes.push({ versao: parseInt(m[1], 10), arquivo: arq });
  }

  if (versoes.length < 2) {
    return {
      ok: false,
      poucasVersoes: true,
      error: versoes.length === 0
        ? 'Não achei nenhuma imagem com o padrão de nome "- v1", "- v2" etc nessa pasta — só arquivo subido arrastando pro card ganha esse padrão sozinho.'
        : 'Só achei uma versão com esse padrão de nome — precisa de pelo menos duas pra comparar.'
    };
  }

  versoes.sort(function (a, b) { return b.versao - a.versao; });
  var nova = versoes[0];
  var anterior = versoes[1];

  var imagens = [nova, anterior].map(function (v) {
    var blob = v.arquivo.getBlob();
    return { base64: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType() };
  });

  var prompt = 'Estas são duas versões da mesma peça de design, NESTA ORDEM: a PRIMEIRA imagem é a versão ' +
    'mais nova (v' + nova.versao + '), a SEGUNDA é a versão anterior (v' + anterior.versao + ').\n\n' +
    'Compare as duas e liste, em português do Brasil, de forma curta e objetiva, o que mudou da versão ' +
    'anterior pra nova (texto, cor, layout, imagem usada, proporção, elementos que sumiram/apareceram). ' +
    'Se não conseguir ver nenhuma diferença real, diga isso em vez de inventar.\n\n' +
    'Responda SOMENTE em JSON, neste formato: {"resumo": "uma frase curta resumindo", "mudancas": ["mudança 1", "mudança 2"]}';

  var resultado = chamarGeminiComImagens(prompt, imagens);
  if (!resultado.ok) return resultado;

  var resumo = (resultado.dados && resultado.dados.resumo) || '';
  var mudancas = (resultado.dados && resultado.dados.mudancas) || [];
  var textoBee = resumo + (mudancas.length ? '\n\n' + mudancas.map(function (m) { return '• ' + m; }).join('\n') : '');

  // Entra na conversa como uma fala dela, igual beeConferirEntrega —
  // fica registrado, sobrevive a fechar e reabrir o card. Só o TEXTO
  // fica salvo; os thumbnails (idArquivoNovo/idArquivoAnterior, devolvidos
  // abaixo) são só pra essa resposta na hora, não persistem no histórico.
  var conversa = lerConversaBee(taskId);
  var agora = new Date().getTime();
  conversa.push({ autor: 'designer', texto: 'Compara a versão v' + nova.versao + ' com a v' + anterior.versao + '.', quando: agora });
  conversa.push({ autor: 'bee', texto: textoBee.trim(), quando: agora + 1 });
  salvarConversaBee(taskId, conversa);

  return {
    ok: true,
    versaoNova: nova.versao,
    versaoAnterior: anterior.versao,
    nomeArquivoNovo: nova.arquivo.getName(),
    nomeArquivoAnterior: anterior.arquivo.getName(),
    idArquivoNovo: nova.arquivo.getId(),
    idArquivoAnterior: anterior.arquivo.getId(),
    resumo: resumo,
    mudancas: mudancas,
    conversa: conversa
  };
}

// ============ 5d) AVISAR SOBRE UPLOAD NOVO (arquivo arrastado pro card) ============
//
// Pedido do Cláudio (2026-08-04): depois que um arquivo é arrastado pro
// card (ver subirArquivoNoCard, Drive.gs — que já comenta sozinho no
// Runrun.it), a Bee registra uma fala DE VERDADE oferecendo as 3 ações
// relacionadas à pasta do card. "De verdade" quer dizer: fica salva na
// conversa (lerConversaBee/salvarConversaBee), sobrevive a fechar e
// reabrir o card — diferente do aviso antigo de upload (ver
// js/notificacoes-uploads.js), que é só um lembrete na tela, não uma
// fala persistida.

function beeAvisarUploadNovo(taskId, nomeArquivo) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var conversa = lerConversaBee(taskId);
  var agora = new Date().getTime();
  conversa.push({
    autor: 'bee',
    texto: 'Subiu "' + (nomeArquivo || 'um arquivo novo') + '" na pasta do card. Quer que eu faça algo com isso?',
    quando: agora,
    _acoesPasta: true
  });
  salvarConversaBee(taskId, conversa);
  return { ok: true, conversa: conversa };
}

// Mesma fala/mesmos 3 botões de cima, mas pro outro caminho de chegar um
// link do Drive na conversa: colar o link direto num comentário normal,
// em vez de arrastar o arquivo (que já sobe pro Drive sozinho). Pedido do
// Cláudio (2026-08-04): "comentei o link do drive, mas não apareceu a
// mensagem da Bee". Texto diferente de propósito — aqui não foi o
// Colmeia que subiu nada, só percebeu o link no que a pessoa escreveu.
function beeAvisarLinkDriveNoComentario(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var conversa = lerConversaBee(taskId);
  var agora = new Date().getTime();
  conversa.push({
    autor: 'bee',
    texto: 'Vi que você colou um link do Drive aqui. Quer que eu faça algo com isso?',
    quando: agora,
    _acoesPasta: true
  });
  salvarConversaBee(taskId, conversa);
  return { ok: true, conversa: conversa };
}

// ============ 5b) INSPIRAR ============
//
// O Colmeia NÃO consegue entrar no Behance/Pinterest e trazer as
// imagens: esses sites bloqueiam robô e o Apps Script não passa. O que
// funciona de verdade — e funciona sempre — é a Bee ler a tarefa,
// entender do que é a peça, e devolver os TERMOS DE BUSCA certos (em
// inglês, que é onde o acervo bom está). O front monta os links.
//
// Ou seja: ela não escolhe a referência por você, ela te põe na
// prateleira certa. É honesto e é útil.

function beeInspirar(taskId, idOriginal) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var material = beeMaterialDaTarefa(taskId, idOriginal);
  if (!material.ok) return material;

  var prompt = 'Você é a Bee, diretora de arte da Beeon (agência de marketing). Um designer vai ' +
    'começar uma peça e quer referência visual.\n\n' +
    'Leia o que a tarefa pede e devolva por onde ele deve procurar.\n\n' +
    'REGRAS:\n' +
    '- Os TERMOS DE BUSCA vão em INGLÊS (é onde está o acervo bom desses sites) e são curtos: ' +
    '2 a 4 palavras cada. Nada de frase.\n' +
    '- Termos de ESTILO e FORMATO, não do assunto literal. "post sobre vaga de emprego" vira ' +
    '"minimal recruitment social post", não "job vacancy".\n' +
    '- Nunca cite marca, artista vivo ou pessoa real.\n' +
    '- Os CAMINHOS são direções criativas diferentes entre si (não três jeitos de dizer a mesma ' +
    'coisa), uma frase curta cada, em português.\n' +
    '- Se a tarefa não disser quase nada, diga isso em "observacao" e devolva termos genéricos do ' +
    'formato mesmo assim — é melhor que nada.\n\n' +
    beeTrechoDoDna(material.cliente) +
    '\nTAREFA: ' + material.titulo + '\n' +
    (material.cliente ? 'CLIENTE: ' + material.cliente + '\n' : '') +
    '\nO QUE ESTÁ ESCRITO:\n' + (beeTextoDoMaterial(material) || '(nada escrito)') + '\n\n' +
    'Responda SOMENTE em JSON:\n' +
    '{"termos":["...","...","..."],"caminhos":["...","...","..."],"observacao":""}\n' +
    'Exatamente 3 termos e no máximo 3 caminhos.';

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;
  var dados = resultado.dados || {};
  return {
    ok: true,
    termos: (dados.termos || []).slice(0, 3),
    caminhos: (dados.caminhos || []).slice(0, 3),
    observacao: dados.observacao || ''
  };
}

// ============ 6) BUSCA: ÍNDICE DO DRIVE + AO VIVO ============
//
// "Onde está o modelo de vagas?", "onde fica o brandbook?" — procurar
// isso varrendo o Drive na hora demoraria mais que o Apps Script aguenta.
// Então uma rotina diária guarda os NOMES de pastas e arquivos numa aba
// (o índice), e a busca lê essa aba: instantânea e barata.
//
// Se o índice não achar nada, aí sim vale a pena a busca ao vivo — é o
// caso raro (arquivo criado hoje), e aí a demora se justifica.

var INDICE_MAX_PROFUNDIDADE = 4;   // Clientes > cliente > ano > mês > card
var INDICE_MAX_ITENS = 6000;       // teto de segurança: aba gigante fica lenta de ler
var INDICE_MAX_ARQUIVOS_POR_PASTA = 40;

function getIndiceDriveSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('IndiceDrive');
  if (!sheet) {
    sheet = ss.insertSheet('IndiceDrive');
    sheet.getRange('A1:E1').setValues([['nome', 'tipo', 'caminho', 'url', 'cliente']]);
  }
  return sheet;
}

/**
 * Roda 1x por dia, junto do backup. Percorre a pasta Beeon do Drive até
 * uma profundidade limitada e guarda nome, tipo, caminho e link de cada
 * pasta/arquivo. Não desce infinitamente de propósito: o objetivo é
 * ACHAR onde as coisas estão, não copiar o Drive inteiro.
 */
function montarIndiceDoDrive() {
  var linhas = [];
  var raiz;
  try {
    raiz = DriveApp.getFolderById(ROOT_FOLDER_ID_DRIVE);
  } catch (e) {
    return { ok: false, error: 'Não consegui abrir a pasta raiz do Drive: ' + e.message };
  }

  function percorrer(pasta, caminho, profundidade, cliente) {
    if (linhas.length >= INDICE_MAX_ITENS || profundidade > INDICE_MAX_PROFUNDIDADE) return;

    var arquivos = pasta.getFiles();
    var contador = 0;
    while (arquivos.hasNext() && contador < INDICE_MAX_ARQUIVOS_POR_PASTA && linhas.length < INDICE_MAX_ITENS) {
      var arq = arquivos.next();
      linhas.push([arq.getName(), 'arquivo', caminho, arq.getUrl(), cliente || '']);
      contador++;
    }

    var subs = pasta.getFolders();
    while (subs.hasNext() && linhas.length < INDICE_MAX_ITENS) {
      var sub = subs.next();
      var nome = sub.getName();
      var caminhoFilho = caminho ? caminho + ' › ' + nome : nome;
      linhas.push([nome, 'pasta', caminho, sub.getUrl(), cliente || '']);
      // No nível de "Clientes", o nome da subpasta É o cliente — daí em
      // diante todo mundo lá dentro herda esse cliente.
      var clienteFilho = cliente || (/clientes/i.test(pasta.getName()) ? nome : '');
      percorrer(sub, caminhoFilho, profundidade + 1, clienteFilho);
    }
  }

  percorrer(raiz, raiz.getName(), 0, '');

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getIndiceDriveSheet();
    sheet.clear();
    sheet.getRange('A1:E1').setValues([['nome', 'tipo', 'caminho', 'url', 'cliente']]);
    if (linhas.length) {
      sheet.getRange(2, 1, linhas.length, 5).setValues(linhas);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true, itens: linhas.length };
}

// Tira acento, deixa minúsculo — pra "publicações" achar "publicacoes".
function normalizarBusca(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

// Sinônimos do dia a dia da agência: quem procura "logo" quer achar
// "marca"/"identidade"; quem procura "vaga" quer achar "recrutamento".
// É uma lista curta de propósito — sinônimo demais traz lixo.
var BEE_SINONIMOS = {
  'logo': ['marca', 'identidade', 'logotipo'],
  'marca': ['logo', 'identidade', 'brandbook', 'manual'],
  'brandbook': ['manual', 'marca', 'identidade'],
  'vaga': ['vagas', 'recrutamento', 'contratacao', 'job'],
  'post': ['feed', 'publicacao', 'arte'],
  'story': ['stories', 'storie'],
  'modelo': ['template', 'padrao', 'base'],
  'template': ['modelo', 'padrao'],
  'foto': ['imagem', 'banco de imagens', 'fotos'],
  'video': ['reels', 'motion', 'animacao'],
  'apresentacao': ['slide', 'deck', 'ppt'],
};

function termosDaBusca(termo) {
  var base = normalizarBusca(termo);
  var palavras = base.split(/\s+/).filter(function (p) { return p.length > 2; });
  var todos = palavras.slice();
  palavras.forEach(function (p) {
    (BEE_SINONIMOS[p] || []).forEach(function (s) {
      if (todos.indexOf(s) === -1) todos.push(normalizarBusca(s));
    });
  });
  return { palavras: palavras, todos: todos };
}

function buscarNoIndiceDoDrive(termo, limite, clienteAlvo) {
  var sheet = getIndiceDriveSheet();
  var linhas = sheet.getDataRange().getValues();
  if (linhas.length < 2) return [];

  var t = termosDaBusca(termo);
  if (!t.palavras.length) return [];
  var achados = [];
  var filtro = clienteAlvo ? normalizarBusca(clienteAlvo) : null;

  for (var i = 1; i < linhas.length; i++) {
    var nome = normalizarBusca(linhas[i][0]);
    var caminho = normalizarBusca(linhas[i][2]);
    var cliente = normalizarBusca(linhas[i][4]);
    // Com cliente escolhido, só o que está DENTRO da pasta dele — é o
    // que faz a busca parar de trazer o arquivo parecido de outros 30
    // clientes. O caminho entra na conta porque a pasta do próprio
    // cliente não tem o campo "cliente" preenchido (ela é o cliente).
    if (filtro && cliente.indexOf(filtro) === -1 && caminho.indexOf(filtro) === -1 && nome.indexOf(filtro) === -1) continue;
    var alvo = nome + ' ' + caminho + ' ' + cliente;

    // Pontuação simples: bater a palavra que a pessoa digitou vale mais
    // que bater um sinônimo, e bater no NOME vale mais que no caminho.
    var pontos = 0;
    t.palavras.forEach(function (p) {
      if (nome.indexOf(p) !== -1) pontos += 10;
      else if (alvo.indexOf(p) !== -1) pontos += 4;
    });
    t.todos.forEach(function (p) {
      if (t.palavras.indexOf(p) === -1 && alvo.indexOf(p) !== -1) pontos += 2;
    });
    if (!pontos) continue;
    if (linhas[i][1] === 'pasta') pontos += 3; // "onde fica" quase sempre é pasta

    achados.push({
      nome: linhas[i][0], tipo: linhas[i][1], caminho: linhas[i][2],
      url: linhas[i][3], cliente: linhas[i][4], pontos: pontos
    });
  }
  achados.sort(function (a, b) { return b.pontos - a.pontos; });
  return achados.slice(0, limite || 8);
}

/**
 * O caso raro: o índice não achou nada (arquivo criado hoje, por
 * exemplo). Aí sim pergunta pro Drive na hora, com um teto baixo de
 * resultados pra não estourar o tempo do Apps Script.
 */
/**
 * Busca ao vivo DENTRO da pasta de um cliente. Muito mais barata que
 * varrer o Drive inteiro — e é o caso normal, já que quase toda pergunta
 * é sobre um cliente específico.
 */
function buscarAoVivoNaPastaDoCliente(termo, cliente) {
  var achados = [];
  try {
    var beeonFolder = DriveApp.getFolderById(ROOT_FOLDER_ID_DRIVE);
    var clientesFolder = (beeonFolder.getName() === 'Clientes') ? beeonFolder : getSubfolderPorNome(beeonFolder, 'Clientes');
    if (!clientesFolder) return [];
    var pastaCliente = acharPastaDoCliente(clientesFolder, cliente);
    if (!pastaCliente) return [];

    var t = termosDaBusca(termo);
    var visitadas = 0;

    function varrer(pasta, caminho, profundidade) {
      if (achados.length >= 10 || visitadas > 120 || profundidade > 3) return;
      visitadas++;
      var arquivos = pasta.getFiles();
      while (arquivos.hasNext() && achados.length < 10) {
        var a = arquivos.next();
        if (bateComOsTermos(a.getName(), t)) {
          achados.push({ nome: a.getName(), tipo: 'arquivo', caminho: caminho, url: a.getUrl(), cliente: cliente });
        }
      }
      var subs = pasta.getFolders();
      while (subs.hasNext() && achados.length < 10) {
        var sub = subs.next();
        var nome = sub.getName();
        if (bateComOsTermos(nome, t)) {
          achados.push({ nome: nome, tipo: 'pasta', caminho: caminho, url: sub.getUrl(), cliente: cliente });
        }
        varrer(sub, caminho + ' › ' + nome, profundidade + 1);
      }
    }
    varrer(pastaCliente, cliente, 0);
  } catch (e) { /* sem acesso à pasta do cliente — devolve o que deu */ }
  return achados;
}

function bateComOsTermos(nome, t) {
  var alvo = normalizarBusca(nome);
  for (var i = 0; i < t.todos.length; i++) {
    if (alvo.indexOf(t.todos[i]) !== -1) return true;
  }
  return false;
}

function buscarNoDriveAoVivo(termo) {
  var achados = [];
  var busca = String(termo).replace(/'/g, "\\'");
  try {
    var arquivos = DriveApp.searchFiles('title contains \'' + busca + '\' and trashed = false');
    var n = 0;
    while (arquivos.hasNext() && n < 6) {
      var a = arquivos.next();
      achados.push({ nome: a.getName(), tipo: 'arquivo', caminho: '(busca ao vivo)', url: a.getUrl(), cliente: '' });
      n++;
    }
    var pastas = DriveApp.searchFolders('title contains \'' + busca + '\' and trashed = false');
    var m = 0;
    while (pastas.hasNext() && m < 4) {
      var p = pastas.next();
      achados.push({ nome: p.getName(), tipo: 'pasta', caminho: '(busca ao vivo)', url: p.getUrl(), cliente: '' });
      m++;
    }
  } catch (e) { /* Drive recusou a busca — devolve o que deu */ }
  return achados;
}

/**
 * @param {string} termo    o que a pessoa digitou
 * @param {string} [cliente] quando vem, procura SÓ dentro da pasta desse
 *                           cliente — tanto no índice quanto na busca ao
 *                           vivo. Sem isso, uma busca por "brandbook"
 *                           traz o brandbook de todo mundo.
 */
function beeBuscarNoDrive(termo, cliente) {
  if (!termo || !String(termo).trim()) return { ok: true, resultados: [] };
  var doIndice = buscarNoIndiceDoDrive(termo, 8, cliente);
  if (doIndice.length) return { ok: true, resultados: doIndice, origem: 'indice', cliente: cliente || null };
  // Nada no índice: cai pra busca ao vivo. Com cliente, varre só a pasta
  // dele; sem cliente, aí sim pergunta pro Drive inteiro.
  var aoVivo = cliente ? buscarAoVivoNaPastaDoCliente(termo, cliente) : buscarNoDriveAoVivo(termo);
  return { ok: true, resultados: aoVivo, origem: 'aovivo', cliente: cliente || null };
}

// ============ 7) ACHAR O LINK PERDIDO ============
//
// "Cadê o link de aprovação que a Marina mandou?" — links importantes
// se perdem no meio de uma conversa de comentários, e não tem busca
// nenhuma pra isso hoje. Mesmo princípio do índice do Drive: um índice
// montado 1x por dia (não dá pra varrer comentário de toda tarefa aberta
// a cada pergunta), guardando cada URL encontrada com o contexto dela.

var INDICE_LINKS_MAX_TAREFAS = 400;   // teto de segurança pra não estourar o tempo do gatilho diário
var INDICE_LINKS_MAX_ITENS = 3000;
var REGEX_URL = /https?:\/\/[^\s<>"')\]]+/g;

function getIndiceLinksSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('IndiceLinks');
  if (!sheet) {
    sheet = ss.insertSheet('IndiceLinks');
    sheet.getRange('A1:G1').setValues([['url', 'task_id', 'tarefa', 'cliente', 'autor', 'data', 'trecho']]);
  }
  return sheet;
}

/**
 * Roda 1x por dia, junto do backup e do índice do Drive. Percorre as
 * tarefas ABERTAS (normais + card mãe — é onde a conversa de verdade
 * acontece) e tira todo link dos comentários delas.
 */
function montarIndiceDeLinks() {
  var comecouEm = new Date().getTime();
  var LIMITE_MS = 4 * 60 * 1000; // pára de propósito antes do teto do gatilho (6 min), pra sempre terminar salvando algo

  var separadas = buscarTarefasAbertasSeparadas();
  var tarefas = separadas.normais.concat(separadas.cardMae).slice(0, INDICE_LINKS_MAX_TAREFAS);

  var linhas = [];
  for (var i = 0; i < tarefas.length; i++) {
    if (linhas.length >= INDICE_LINKS_MAX_ITENS) break;
    if ((new Date().getTime() - comecouEm) > LIMITE_MS) break; // tempo esgotando: salva o que já tem, não trava o gatilho

    var t = tarefas[i];
    var r = listarComentarios(t.id);
    if (!r.ok) continue;

    r.comentarios.forEach(function (c) {
      if (linhas.length >= INDICE_LINKS_MAX_ITENS) return;
      var texto = String(c.texto || '').replace(/<[^>]*>/g, ' ');
      var urls = texto.match(REGEX_URL);
      if (!urls) return;
      urls.forEach(function (url) {
        if (linhas.length >= INDICE_LINKS_MAX_ITENS) return;
        var pos = texto.indexOf(url);
        var trecho = texto.substring(Math.max(0, pos - 40), pos).trim() ;
        linhas.push([url, t.id, t.title || '', t.client || '', c.autor || '', c.data || '', trecho]);
      });
    });
  }

  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getIndiceLinksSheet();
    sheet.clear();
    sheet.getRange('A1:G1').setValues([['url', 'task_id', 'tarefa', 'cliente', 'autor', 'data', 'trecho']]);
    if (linhas.length) sheet.getRange(2, 1, linhas.length, 7).setValues(linhas);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, itens: linhas.length, tarefasVarridas: tarefas.length };
}

function beeBuscarLink(termo, cliente) {
  if (!termo || !String(termo).trim()) return { ok: true, resultados: [] };
  var sheet = getIndiceLinksSheet();
  var linhas = sheet.getDataRange().getValues();
  if (linhas.length < 2) return { ok: true, resultados: [] };

  var t = termosDaBusca(termo);
  var filtroCliente = cliente ? normalizarBusca(cliente) : null;
  var achados = [];

  for (var i = 1; i < linhas.length; i++) {
    var tarefa = normalizarBusca(linhas[i][2]);
    var clienteLinha = normalizarBusca(linhas[i][3]);
    var trecho = normalizarBusca(linhas[i][6]);
    if (filtroCliente && clienteLinha.indexOf(filtroCliente) === -1) continue;

    var alvo = tarefa + ' ' + trecho;
    var pontos = 0;
    t.todos.forEach(function (p) { if (alvo.indexOf(p) !== -1) pontos += 1; });
    // Sem nenhum termo batendo: só entra se tiver cliente escolhido (aí a
    // pergunta já é "os links desse cliente", não precisa achar palavra.
    if (!pontos && !filtroCliente) continue;

    achados.push({
      url: linhas[i][0], taskId: linhas[i][1], tarefa: linhas[i][2],
      cliente: linhas[i][3], autor: linhas[i][4], data: linhas[i][5],
      trecho: linhas[i][6], pontos: pontos
    });
  }
  achados.sort(function (a, b) { return b.pontos - a.pontos; });
  return { ok: true, resultados: achados.slice(0, 8) };
}

// ============ 8) ACHAR O CARD MÃE POR ASSUNTO ============
//
// "Qual é a campanha do post de aniversário do cliente X?" — quando a
// pessoa lembra do ASSUNTO mas não do nome exato da tarefa. Os cards mãe
// ficam fora do quadro normal (etapa "Cards Mães"), então busca comum de
// tarefa nunca os acha. Usa o mesmo cache do board scan de sempre — não
// gera nenhuma ida a mais ao Runrun.it na maioria das vezes.

function beeAcharCardMae(termo, cliente) {
  if (!termo || !String(termo).trim()) return { ok: true, resultados: [] };

  var cardMae = null;
  try {
    var cacheado = CacheService.getScriptCache().get(CACHE_CARD_MAE_ABERTOS);
    if (cacheado) cardMae = JSON.parse(cacheado);
  } catch (e) { /* cache indisponível — busca fresco abaixo */ }
  if (!cardMae) cardMae = buscarTarefasAbertasSeparadas().cardMae;

  var t = termosDaBusca(termo);
  var filtroCliente = cliente ? normalizarBusca(cliente) : null;
  var achados = [];

  cardMae.forEach(function (c) {
    var clienteNorm = normalizarBusca(c.client);
    if (filtroCliente && clienteNorm.indexOf(filtroCliente) === -1) return;
    var alvo = normalizarBusca(c.title) + ' ' + clienteNorm;
    var pontos = 0;
    t.todos.forEach(function (p) { if (alvo.indexOf(p) !== -1) pontos += 1; });
    if (!pontos) return;
    achados.push({ taskId: c.id, titulo: c.title, cliente: c.client, etapa: c.runrunStage || '', pontos: pontos });
  });
  achados.sort(function (a, b) { return b.pontos - a.pontos; });
  return { ok: true, resultados: achados.slice(0, 8) };
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
    sheet.getRange('A1:E1').setValues([['task_id', 'conversa_json', 'entregue_em', 'atualizado_em', 'titulo']]);
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

/**
 * Apaga uma conversa da aba BeeChat pela chave (usado hoje só nas
 * conversas livres — apagar a conversa DE UMA TAREFA não faz sentido,
 * ela é o registro do que já foi discutido sobre aquele card).
 */
function excluirConversaBee(chave) {
  if (!chave) return { ok: false, error: 'chave não informada.' };
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getBeeChatSheet();
    var linha = beeLinhaDaTarefa(sheet, chave);
    if (linha) sheet.deleteRow(linha.indice);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reescreve UMA mensagem dentro de uma conversa já salva — usado hoje só
 * pra marcar/desmarcar item de checklist (o front já manda o texto certo
 * da linha, com "[ ]" ou "[x]" trocado). Não mexe em mais nada da
 * conversa, só naquele índice.
 */
function atualizarMensagemBee(chave, indice, texto) {
  if (!chave) return { ok: false, error: 'chave não informada.' };
  var conversa = lerConversaBee(chave);
  if (!conversa[indice]) return { ok: false, error: 'Mensagem não encontrada.' };
  conversa[indice].texto = String(texto || '');
  salvarConversaBee(chave, conversa);
  return { ok: true };
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

function salvarConversaBee(taskId, mensagens, titulo) {
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
      if (titulo) sheet.getRange(linha.indice, 5).setValue(titulo);
    } else {
      sheet.appendRow([String(taskId), texto, '', agora, titulo || '']);
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
