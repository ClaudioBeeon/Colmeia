/**
 * Tudo de IA: as chamadas ao Groq e ao Gemini, a frase do dia da tela de
 * login, o briefing organizado da tarefa e o resumo do que foi pedido numa
 * subtarefa de alteração. O cache dos resultados fica na aba "Briefings".
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
// ============ IA (Groq / Gemini) ============

function chamarGroq(prompt) {
  var url = 'https://api.groq.com/openai/v1/chat/completions';
  var payload = {
    model: GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + GROQ_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var codigo = res.getResponseCode();
  var corpo = res.getContentText();

  var parsed;
  try {
    parsed = JSON.parse(corpo);
  } catch (e) {
    return { ok: false, error: 'Resposta inesperada do Groq (status ' + codigo + ').' };
  }
  if (codigo < 200 || codigo >= 300) {
    var msg = (parsed.error && parsed.error.message) || ('Groq recusou (status ' + codigo + ').');
    return { ok: false, error: msg };
  }
  var texto = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
  if (!texto) return { ok: false, error: 'Groq não devolveu nenhum texto.' };

  var dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: 'Groq devolveu algo que não é um JSON válido: ' + texto.substring(0, 200) };
  }
  return { ok: true, dados: dados };
}

function chamarGemini(prompt) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': GEMINI_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var codigo = res.getResponseCode();
  var corpo = res.getContentText();

  var parsed;
  try {
    parsed = JSON.parse(corpo);
  } catch (e) {
    return { ok: false, error: 'Resposta inesperada do Gemini (status ' + codigo + ').' };
  }
  if (codigo < 200 || codigo >= 300) {
    var msg = (parsed.error && parsed.error.message) || ('Gemini recusou (status ' + codigo + ').');
    return { ok: false, error: msg };
  }
  var candidato = parsed.candidates && parsed.candidates[0];
  var texto = candidato && candidato.content && candidato.content.parts && candidato.content.parts[0] && candidato.content.parts[0].text;
  if (!texto) return { ok: false, error: 'Gemini não devolveu nenhum texto.' };

  var dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: 'Gemini devolveu algo que não é um JSON válido: ' + texto.substring(0, 200) };
  }
  return { ok: true, dados: dados };
}

function gerarFraseDoDia() {
  var agora = new Date();
  var diaSemana = Utilities.formatDate(agora, 'America/Sao_Paulo', 'EEEE');
  var hora = Number(Utilities.formatDate(agora, 'America/Sao_Paulo', 'H'));
  var periodo = hora < 12 ? 'manhã' : (hora < 18 ? 'tarde' : 'noite');

  var prompt = 'Você escreve frases curtas, engraçadas e espirituosas pro topo da tela de login de um ' +
    'sistema interno de uma agência de design chamada Colmeia.\n' +
    'Agora é ' + diaSemana + ' de ' + periodo + ' (horário de Brasília).\n' +
    'Escreva UMA frase curta (no máximo 12 palavras), engraçada, que combine com esse dia/período — ' +
    'pode brincar com o dia da semana, o cansaço do trabalho, café, prazos de agência, ou humor leve de ' +
    'escritório. Não seja genérico, seja espirituoso e específico pro momento.\n' +
    'Responda SOMENTE em JSON, neste formato: {"frase": "..."}';

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;
  return { ok: true, frase: (resultado.dados && resultado.dados.frase) || null };
}

function getBriefingsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Briefings');
  if (!sheet) {
    sheet = ss.insertSheet('Briefings');
    sheet.getRange('A1:D1').setValues([['task_id', 'hash_descricao', 'briefing_json', 'atualizado_em']]);
  }
  return sheet;
}

function hashTexto(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto || '', Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function buscarBriefingCacheado(taskId, hash) {
  var sheet = getBriefingsSheet();
  var linhas = sheet.getDataRange().getValues();
  for (var i = 1; i < linhas.length; i++) {
    if (String(linhas[i][0]) === String(taskId)) {
      if (String(linhas[i][1]) === hash) {
        try { return JSON.parse(linhas[i][2]); } catch (e) { return null; }
      }
      return null;
    }
  }
  return null;
}

function salvarBriefingCacheado(taskId, hash, briefing) {
  var lock = LockService.getScriptLock();
  pegarTravaDaPlanilha(lock);
  try {
    var sheet = getBriefingsSheet();
    var linhas = sheet.getDataRange().getValues();
    var linhaValores = [hash, JSON.stringify(briefing), new Date().getTime()];
    for (var i = 1; i < linhas.length; i++) {
      if (String(linhas[i][0]) === String(taskId)) {
        sheet.getRange(i + 1, 2, 1, 3).setValues([linhaValores]);
        return;
      }
    }
    sheet.appendRow([taskId].concat(linhaValores));
  } finally {
    lock.releaseLock();
  }
}

function gerarBriefingDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var bruto = runrunFetch('/tasks/' + taskId + '/description');
  var descricaoHtml = '';
  if (typeof bruto === 'string') {
    descricaoHtml = bruto;
  } else if (bruto && typeof bruto === 'object') {
    descricaoHtml = bruto.description || bruto.text || bruto.html || bruto.content || '';
  }
  if (!descricaoHtml) return { ok: true, semDescricao: true };

  // A versão entra no hash de propósito: sempre que o PROMPT mudar de
  // um jeito que muda o resultado (ex: 2026-07-28, prompt reforçado
  // contra resumir demais), sobe esse número — isso invalida sozinho
  // todo o cache antigo (mesmo sem a descrição da tarefa ter mudado),
  // sem precisar apagar a aba "Briefings" na mão.
  var BRIEFING_PROMPT_VERSAO = 'v5';
  var hash = hashTexto(descricaoHtml + '|' + BRIEFING_PROMPT_VERSAO);
  var cacheado = buscarBriefingCacheado(taskId, hash);
  if (cacheado) return { ok: true, briefing: cacheado, doCache: true };

  var prompt = 'Você é um redator de briefing sênior de uma agência de marketing premiada, especialista ' +
    'em organizar descrições de tarefas de design pra outros profissionais da equipe executarem sem ' +
    'precisar perguntar nada de novo pra ninguém. Seu trabalho é ORGANIZAR e deixar fácil de escanear — ' +
    'não é encurtar. Completude é mais importante que brevidade.\n' +
    'Você vai receber a descrição em HTML de uma tarefa do Runrun.it. Ela pode ter checklists no ' +
    'formato <ul data-checked="true"> (marcado) ou <ul data-checked="false"> (não marcado), com <li> dentro, ' +
    'seguidos de perguntas em texto livre.\n\n' +
    'REGRAS IMPORTANTES — siga à risca, é o que mais importa aqui:\n' +
    '- Cada campo tem DOIS valores: "resposta" (versão organizada) e "respostaOriginal" (cópia literal).\n' +
    '- "respostaOriginal" é uma cópia EXATA, palavra por palavra, do texto de origem daquele campo — ' +
    'sem editar nada, é a rede de segurança caso "resposta" tenha perdido algo.\n' +
    '- "resposta" é a versão organizada: reescreva pra ficar mais fácil de ler e mais profissional ' +
    '(arrume formatação bagunçada, organize em lista quando fizer sentido, deixe escaneável) — MAS sem ' +
    'tirar nenhuma informação de fato. Todo link, número, nome e observação do original tem que estar ' +
    'representado em "resposta" também (nunca só em "respostaOriginal").\n' +
    '- Cuidado especial com listas de vários links: se cada item tiver alguma informação própria e ' +
    'diferente dos outros (ex: "Depoimento do cliente: url", "Making of: url"), mantenha um item pra ' +
    'cada um em "resposta", só formatado. MAS se for só uma numeração de itens idênticos sem nenhuma ' +
    'informação própria além do número (ex: "Vídeo 1: url, Vídeo 2: url, Vídeo 3: url..." — nenhuma ' +
    'descrição do que é cada vídeo), listar cada um separado não ajuda ninguém: em "resposta", junte ' +
    'num ÚNICO link representando o conjunto (prefira um link de pasta/hub se existir um entre eles; ' +
    'senão, use o primeiro link da lista). A lista completa, com todos os links, continua preservada ' +
    'sem perder nada em "respostaOriginal" — é pra isso que ela existe.\n' +
    '- Resumir tirando detalhe É ERRADO. Mas ORGANIZAR também inclui não repetir a mesma informação ' +
    'redundante várias vezes só porque veio assim no original — o objetivo é o profissional que for ' +
    'executar a tarefa conseguir ler rápido, sem perder nenhuma informação real que exista.\n' +
    '- EXCEÇÃO: se o campo for sobre o TEXTO QUE VAI DENTRO DA ARTE/PEÇA (a copy final que o designer ' +
    'vai colar direto no design), "resposta" tem que ser IDÊNTICA a "respostaOriginal" — nunca reescreva ' +
    'texto que vai virar copy visível na peça, nem um detalhe de pontuação.\n' +
    '- Vasculhe a descrição inteira e identifique TODAS as perguntas/campos que existirem, mesmo os que ' +
    'parecerem secundários — não pule nenhum.\n' +
    '- Se a resposta original de um campo só disser que não tem nada (ex: "Nenhuma.", "N/A", "-", ' +
    '"Nenhum", vazio de verdade), NÃO escreva "Nenhuma." em "resposta" — devolva null nos dois campos ' +
    '("resposta" e "respostaOriginal"), como se a pergunta não tivesse sido respondida. Isso evita que ' +
    'uma caixinha inteira apareça no briefing só pra dizer que não tem nada.\n' +
    '- "resumo" NÃO é um resumo que substitui o resto do briefing — é só uma frase curta de CONTEXTO ' +
    '(do que se trata a peça, pra quem, com que objetivo) pra alguém entender o panorama antes de ler ' +
    'os campos detalhados. Nunca coloque em "resumo" uma informação que só existe ali — ela também tem ' +
    'que aparecer em "campos", completa.\n' +
    '- "plataformas" e "formatos" são só etiquetas curtas (ex: "Instagram", "Stories", "Feed") — não ' +
    'jogue texto longo ali.\n\n' +
    'Responda SOMENTE com um JSON válido, exatamente neste formato, sem nenhum texto antes ou depois:\n' +
    '{"plataformas": ["..."], "formatos": ["..."], "resumo": "...", "campos": [{"pergunta": "...", ' +
    '"resposta": "..." ou null, "respostaOriginal": "..." ou null}]}\n\n' +
    // marcarImagensNoTexto (Bee.gs): print colado vira "[IMAGEM colada
    // aqui]" em vez de um <img src=...> comprido e ilegível — assim a IA
    // sabe que existe imagem sem gastar o prompt com o endereço dela.
    'Descrição da tarefa (HTML):\n' + marcarImagensNoTexto(descricaoHtml);

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;
  salvarBriefingCacheado(taskId, hash, resultado.dados);
  return { ok: true, briefing: resultado.dados };
}

/**
 * Resume, em tópicos, O QUE O CLIENTE PEDIU PRA MUDAR numa subtarefa de
 * alteração — a versão de verdade do que a antiga aba "Alteração 01" (de
 * protótipo) fingia ser.
 *
 * Junta as três pontas que contam a história da mudança: a descrição da
 * própria alteração, os comentários dela, e os comentários do card mãe e
 * da tarefa original que chegaram DEPOIS da última atividade da tarefa
 * original (é aí que mora o pedido do cliente — antes disso é a conversa
 * da produção da peça, que não é "alteração").
 *
 * Cacheado na mesma aba "Briefings" já usada pelo briefing normal, com a
 * chave prefixada por "alt-" pra não misturar os dois. O hash é do
 * conteúdo, então o resumo só é gerado de novo quando chega comentário ou
 * descrição nova de verdade.
 */
function resumirAlteracao(taskId, idOriginal) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };

  var alteracao = runrunFetch('/tasks/' + taskId);
  if (!alteracao || alteracao.erroFetch) {
    return { ok: false, error: 'Não consegui ler essa tarefa no Runrun.it.' };
  }

  var descricao = marcarImagensNoTexto(buscarDescricao(taskId).descricao || '');
  var comentariosAlteracao = listarComentarios(taskId);
  var textosAlteracao = comentariosAlteracao.ok
    ? comentariosAlteracao.comentarios.map(function (c) { return c.autor + ': ' + c.texto; })
    : [];

  // Corte de tempo: só interessa o que foi dito a partir de quando a peça
  // original teve a última movimentação. Sem esse corte, o resumo puxava a
  // conversa inteira da produção original e dizia "o cliente pediu" pra
  // coisas que nem eram alteração.
  var corte = 0;
  if (idOriginal) {
    var original = runrunFetch('/tasks/' + idOriginal);
    if (original && !original.erroFetch && original.updated_at) {
      corte = new Date(original.updated_at).getTime();
    }
  }
  // Rede de segurança: se não deu pra saber, usa a criação da alteração —
  // a alteração nasceu depois do pedido, então é uma referência razoável.
  if (!corte && alteracao.created_at) {
    corte = new Date(alteracao.created_at).getTime() - 3 * 24 * 60 * 60 * 1000;
  }

  function comentariosRecentesDe(idTarefa, rotulo) {
    if (!idTarefa) return [];
    var r = listarComentarios(idTarefa);
    if (!r.ok) return [];
    return r.comentarios
      .filter(function (c) { return !corte || (c.data && new Date(c.data).getTime() >= corte); })
      .map(function (c) { return '[' + rotulo + '] ' + c.autor + ': ' + c.texto; });
  }

  var textosContexto = []
    .concat(comentariosRecentesDe(alteracao.parent_task_id, 'card mãe'))
    .concat(comentariosRecentesDe(idOriginal, 'tarefa original'));

  var material = 'TÍTULO DA ALTERAÇÃO: ' + (alteracao.title || '') + '\n\n' +
    'DESCRIÇÃO DA ALTERAÇÃO:\n' + (descricao || '(vazia)') + '\n\n' +
    'COMENTÁRIOS NA ALTERAÇÃO:\n' + (textosAlteracao.join('\n') || '(nenhum)') + '\n\n' +
    'COMENTÁRIOS RECENTES NO CARD MÃE E NA TAREFA ORIGINAL:\n' + (textosContexto.join('\n') || '(nenhum)');

  var temConteudo = descricao || textosAlteracao.length || textosContexto.length;
  if (!temConteudo) return { ok: true, semMaterial: true };

  var VERSAO_PROMPT = 'v1';
  var hash = hashTexto(material + '|' + VERSAO_PROMPT);
  var chaveCache = 'alt-' + taskId;
  var cacheado = buscarBriefingCacheado(chaveCache, hash);
  if (cacheado) return { ok: true, resumo: cacheado, doCache: true };

  var prompt = 'Você organiza pedidos de alteração pra uma equipe de design de uma agência de marketing.\n' +
    'Vou te dar o material de uma subtarefa de ALTERAÇÃO (uma peça já feita que o cliente pediu pra mudar).\n' +
    'Sua tarefa: dizer, em tópicos curtos e diretos, O QUE PRECISA SER MUDADO na peça.\n\n' +
    'REGRAS:\n' +
    '- Cada tópico é UMA mudança concreta, na voz de quem vai executar (ex: "Trocar o fundo pra tons mais claros", ' +
    '"Ajustar o texto do CTA pra: Compre agora").\n' +
    '- Copie valores exatos (textos, cores, nomes, medidas, datas) do original — nunca reescreva copy que vai pra peça.\n' +
    '- NÃO invente nada. Se o material não diz claramente o que mudar, devolve a lista vazia e explique no campo ' +
    '"observacao" o que está faltando (ex: "o pedido não está escrito em nenhum lugar, só o título da subtarefa").\n' +
    '- Ignore conversa que não é pedido de mudança (bom dia, combinados de prazo, "obrigado").\n' +
    '- No máximo 8 tópicos. Se tiver mais, junte os parecidos.\n' +
    '- "quemPediu" é o nome de quem pediu a mudança, se der pra saber pelos comentários; senão, null.\n\n' +
    'Responda SOMENTE em JSON, neste formato:\n' +
    '{"mudancas": ["..."], "quemPediu": "..." ou null, "observacao": "..." ou null}\n\n' +
    'MATERIAL:\n' + material;

  var resultado = chamarGemini(prompt);
  if (!resultado.ok) return resultado;
  salvarBriefingCacheado(chaveCache, hash, resultado.dados);
  return { ok: true, resumo: resultado.dados };
}
