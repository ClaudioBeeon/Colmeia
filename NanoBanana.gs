/**
 * Geração de imagem de verdade pela Bee, usando o Gemini 2.5 Flash Image
 * (apelido popular: "Nano Banana") — o mesmo modelo do Google que
 * apareceu no dropdown de parceiros do site do Firefly.
 *
 * Por que este caminho, e não pelo Firefly: o produto que a Beeon tem na
 * Adobe ("Adobe Express API - Firefly Services beta") NÃO é uma API de
 * gerar imagem por texto — é uma API de trocar elementos dentro de
 * templates prontos do Adobe Express. Pra gerar imagem livre pela Adobe
 * precisaria do produto "Firefly API" (Enterprise, Server-to-Server),
 * que é outro contrato — e nem a autorização daquele chegou a funcionar.
 * O Firefly.gs, que tentava esse caminho, foi removido em 2026-08-03 a
 * pedido do Cláudio; o site do Firefly continua sendo usado à mão, pelo
 * botão que a Bee monta com o prompt pronto (ver Bee.gs).
 *
 * O Gemini já está configurado no Colmeia (GEMINI_API_KEY, mesma chave
 * usada pros textos da Bee em IA.gs) — geração de imagem usa a MESMA
 * chave, só muda o modelo e o formato da resposta.
 *
 * ⚠️ PRIMEIRA VERSÃO, AINDA NÃO CONFIRMADA COM UMA GERAÇÃO DE VERDADE.
 * O nome exato do modelo e o formato da resposta (onde vem a imagem
 * dentro do JSON) são o melhor palpite a partir do que se sabe do Gemini
 * — rode diagnosticoGerarImagemNanoBanana() manualmente pelo editor antes
 * de confiar nisso, do mesmo jeito que toda integração nova deste
 * projeto (ver o comentário em cima de criarTarefaRunrun, RunrunEscrita.gs).
 */

// Nome do modelo — PALPITE (mesmo padrão de nomenclatura que o Google usa
// pros outros modelos Gemini já confirmados neste projeto, ver GEMINI_MODEL
// em Código.gs). Se o diagnóstico abaixo devolver 404 "model not found",
// é sinal de que o nome oficial é outro — o próprio erro do Google
// costuma listar nomes parecidos como sugestão.
var NANO_BANANA_MODEL = 'gemini-2.5-flash-image';

/**
 * Gera uma imagem de verdade a partir de uma descrição em texto.
 * Devolve { ok: true, base64, mimeType } ou { ok: false, error }.
 */
function gerarImagemNanoBanana(prompt) {
  if (!prompt) return { ok: false, error: 'Descreva o que a imagem deve ter.' };
  if (!GEMINI_API_KEY) return { ok: false, error: 'GEMINI_API_KEY não está configurada nas Propriedades do Script.' };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + NANO_BANANA_MODEL + ':generateContent';
  var payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': GEMINI_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var codigo = res.getResponseCode();
  var corpoBruto = res.getContentText();

  var parsed;
  try { parsed = JSON.parse(corpoBruto); } catch (e) {
    return { ok: false, error: 'Resposta inesperada do Gemini (status ' + codigo + ').' };
  }
  if (codigo < 200 || codigo >= 300) {
    var msg = (parsed.error && parsed.error.message) || ('Gemini recusou (status ' + codigo + ').');
    Logger.log('Nano Banana: recusado (status ' + codigo + '): ' + corpoBruto.substring(0, 500));
    return { ok: false, error: msg, detalheStatus: codigo };
  }

  // A imagem vem como um dos "parts" da resposta, em inlineData (base64 +
  // mimeType) — igual ao padrão do Gemini pra qualquer mídia de saída.
  // Procura em TODOS os parts porque o modelo às vezes também manda um
  // texto explicando a imagem junto, numa part separada.
  var partes = (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content &&
    parsed.candidates[0].content.parts) || [];
  var parteComImagem = partes.filter(function (p) { return p.inlineData && p.inlineData.data; })[0];

  if (!parteComImagem) {
    Logger.log('Nano Banana: resposta sem imagem: ' + corpoBruto.substring(0, 500));
    return { ok: false, error: 'O Gemini respondeu, mas sem nenhuma imagem no resultado.' };
  }

  return {
    ok: true,
    base64: parteComImagem.inlineData.data,
    mimeType: parteComImagem.inlineData.mimeType || 'image/png'
  };
}

/**
 * Rode manualmente pelo editor (menu "Executar") pra confirmar que a
 * geração funciona de verdade antes de ligar isso na Bee.
 *
 * Bem mais barato que o diagnóstico equivalente da Firefly — o Gemini
 * cobra centavos por imagem (ou nada, se a conta ainda estiver na faixa
 * gratuita), não "créditos" de um plano fechado — mas ainda É uma
 * chamada de verdade, não é de graça garantido.
 */
function diagnosticoGerarImagemNanoBanana() {
  var resultado = gerarImagemNanoBanana('um sol amarelo bem simples, estilo ícone, fundo branco');
  if (resultado.ok) {
    Logger.log('✅ FUNCIONOU — imagem gerada (' + resultado.mimeType + '), ' +
      Math.round(resultado.base64.length * 0.75 / 1024) + ' KB aproximados.');
    Logger.log('Os primeiros 80 caracteres do base64 (só pra conferir que não está vazio): ' +
      resultado.base64.substring(0, 80));
  } else {
    Logger.log('❌ Não funcionou: ' + JSON.stringify(resultado, null, 2));
  }
}
