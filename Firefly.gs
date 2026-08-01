/**
 * Integração com a API da Adobe Firefly — a Bee gera imagem de verdade,
 * usando os modelos (inclusive customizados) da própria agência, em vez
 * de só montar um link pra abrir o Firefly manualmente (isso continua
 * existindo à parte, ver BEE_FIREFLY_BASE em Bee.gs).
 *
 * ⚠️ PRIMEIRA VERSÃO, AINDA NÃO TESTADA COM UMA GERAÇÃO DE VERDADE.
 * A conta da Beeon na Adobe não tem liberação pra "Server-to-Server"
 * (token direto, sem ninguém logar) — só "User Authentication": alguém
 * (o Cláudio) loga UMA VEZ, autoriza, e o Colmeia guarda um "refresh
 * token" que permite pedir tokens novos sozinho depois disso, sem
 * precisar logar de novo, até esse refresh token ser revogado do lado
 * da Adobe. Os nomes exatos dos campos da API de geração (endpoint,
 * "model_id" x "modelId", nomes dos parâmetros, escopos do OAuth) não
 * foram confirmados na prática — rode diagnosticoGerarImagemFirefly()
 * manualmente pelo editor numa frase de teste antes de confiar 100%
 * nisso, do mesmo jeito que outras integrações novas deste projeto
 * (ver o comentário em cima de criarTarefaRunrun, RunrunEscrita.gs).
 *
 * COMO AUTORIZAR (só precisa fazer 1 vez):
 * 1. No Adobe Developer Console, crie a credencial "OAuth Web App" pra
 *    API da Firefly, com o Redirect URI = a própria URL do Colmeia +
 *    "?fireflyAuth=callback" (a mesma URL que fica em COLMEIA_API_URL
 *    no js/config.js do front-end) — ver redirectUriFirefly() abaixo.
 * 2. Cadastre FIREFLY_CLIENT_ID e FIREFLY_CLIENT_SECRET (os valores que
 *    a Adobe gerou) nas Propriedades do Script.
 * 3. Abra a URL do Colmeia + "?fireflyAuth=iniciar" num navegador.
 * 4. Loga na Adobe, autoriza, e pronto — o Colmeia guarda o resto
 *    sozinho (a propriedade FIREFLY_REFRESH_TOKEN é criada automático).
 */

var FIREFLY_IMS_AUTORIZAR = 'https://ims-na1.adobelogin.com/ims/authorize/v2';
var FIREFLY_IMS_TOKEN = 'https://ims-na1.adobelogin.com/ims/token/v3';
var FIREFLY_API_BASE = 'https://firefly-api.adobe.io/v3';

// Escopos pedidos pra Adobe — combinação documentada pra API da
// Firefly. Se a tela de login da Adobe não pedir nenhuma permissão de
// imagem/geração, é sinal de que esses nomes mudaram e precisam ser
// ajustados (ver o "Learn more" da credencial no Developer Console).
var FIREFLY_SCOPES = 'openid,AdobeID,firefly_api,ff_apis';

function fireflyClientId() {
  return PropertiesService.getScriptProperties().getProperty('FIREFLY_CLIENT_ID');
}
function fireflyClientSecret() {
  return PropertiesService.getScriptProperties().getProperty('FIREFLY_CLIENT_SECRET');
}

// A própria URL do Web App do Colmeia, pega em tempo de execução (em
// vez de copiada à mão) — assim nunca fica desatualizada se o projeto
// for redeployado com uma URL diferente.
function redirectUriFirefly() {
  return ScriptApp.getService().getUrl() + '?fireflyAuth=callback';
}

function urlDeAutorizacaoFirefly() {
  var params = {
    client_id: fireflyClientId(),
    redirect_uri: redirectUriFirefly(),
    response_type: 'code',
    scope: FIREFLY_SCOPES
  };
  var query = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k] || '');
  }).join('&');
  return FIREFLY_IMS_AUTORIZAR + '?' + query;
}

/**
 * Troca o "code" que a Adobe manda de volta (depois do Cláudio logar e
 * autorizar) por um refresh_token de verdade, e guarda ele. Chamada só
 * pela tela de callback (tratarFireflyAuthGet, Código.gs).
 */
function trocarCodigoPorTokenFirefly(code) {
  var resposta = UrlFetchApp.fetch(FIREFLY_IMS_TOKEN, {
    method: 'post',
    payload: {
      grant_type: 'authorization_code',
      client_id: fireflyClientId(),
      client_secret: fireflyClientSecret(),
      code: code,
      redirect_uri: redirectUriFirefly()
    },
    muteHttpExceptions: true
  });
  var codigo = resposta.getResponseCode();
  var corpo = {};
  try { corpo = JSON.parse(resposta.getContentText()); } catch (e) { /* segue com objeto vazio */ }
  if (codigo < 200 || codigo >= 300 || !corpo.refresh_token) {
    Logger.log('Firefly: falha ao trocar code por token (status ' + codigo + '): ' + resposta.getContentText());
    return { ok: false, error: 'A Adobe recusou (status ' + codigo + '). Veja o Log de execução do Apps Script pra detalhe.' };
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('FIREFLY_REFRESH_TOKEN', corpo.refresh_token);
  if (corpo.access_token) {
    CacheService.getScriptCache().put('fireflyAccessToken', corpo.access_token, Math.max(60, (corpo.expires_in || 3600) - 120));
  }
  return { ok: true };
}

/**
 * Devolve um access_token válido, renovando sozinho a partir do
 * refresh_token guardado quando precisar (o access_token dura pouco,
 * geralmente horas; o refresh_token dura muito mais e não exige login
 * de novo pra ser trocado por um access_token novo).
 */
function tokenFireflyValido() {
  var cache = CacheService.getScriptCache();
  var emCache = cache.get('fireflyAccessToken');
  if (emCache) return emCache;

  var refreshToken = PropertiesService.getScriptProperties().getProperty('FIREFLY_REFRESH_TOKEN');
  if (!refreshToken) return null; // ninguém autorizou ainda — ver instruções no topo do arquivo

  var resposta = UrlFetchApp.fetch(FIREFLY_IMS_TOKEN, {
    method: 'post',
    payload: {
      grant_type: 'refresh_token',
      client_id: fireflyClientId(),
      client_secret: fireflyClientSecret(),
      refresh_token: refreshToken
    },
    muteHttpExceptions: true
  });
  var codigo = resposta.getResponseCode();
  var corpo = {};
  try { corpo = JSON.parse(resposta.getContentText()); } catch (e) { /* segue com objeto vazio */ }
  if (codigo < 200 || codigo >= 300 || !corpo.access_token) {
    Logger.log('Firefly: falha ao renovar token (status ' + codigo + '): ' + resposta.getContentText());
    return null;
  }

  // A Adobe às vezes manda um refresh_token NOVO junto — se mandar,
  // precisa guardar esse, senão o antigo para de funcionar.
  if (corpo.refresh_token) {
    PropertiesService.getScriptProperties().setProperty('FIREFLY_REFRESH_TOKEN', corpo.refresh_token);
  }
  cache.put('fireflyAccessToken', corpo.access_token, Math.max(60, (corpo.expires_in || 3600) - 120));
  return corpo.access_token;
}

/**
 * Gera uma imagem de verdade pela Firefly.
 * opcoes.modeloCustomizado (opcional): usa um modelo treinado da
 * própria agência em vez do modelo padrão da Firefly — o id desse
 * modelo customizado vem do painel de modelos da Beeon na Adobe.
 */
function gerarImagemFirefly(prompt, opcoes) {
  if (!prompt) return { ok: false, error: 'Descreva o que a imagem deve ter.' };
  var accessToken = tokenFireflyValido();
  if (!accessToken) {
    return {
      ok: false,
      error: 'A Bee ainda não tem autorização pra usar a Firefly. Peça pro Cláudio abrir a URL do Colmeia (COLMEIA_API_URL) + "?fireflyAuth=iniciar" num navegador e autorizar uma vez.'
    };
  }
  opcoes = opcoes || {};

  var corpo = {
    prompt: prompt,
    numVariations: 1,
    size: { width: 2048, height: 2048 }
  };
  if (opcoes.modeloCustomizado) corpo.customModelId = opcoes.modeloCustomizado;

  var resposta = UrlFetchApp.fetch(FIREFLY_API_BASE + '/images/generate', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'x-api-key': fireflyClientId()
    },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
  var codigo = resposta.getResponseCode();
  var corpoResposta = {};
  try { corpoResposta = JSON.parse(resposta.getContentText()); } catch (e) { /* segue com objeto vazio */ }

  if (codigo < 200 || codigo >= 300) {
    Logger.log('Firefly: geração recusada (status ' + codigo + '): ' + resposta.getContentText());
    return { ok: false, error: 'A Firefly recusou gerar a imagem (status ' + codigo + '). Veja o Log de execução do Apps Script pra detalhe.' };
  }

  var urls = (corpoResposta.outputs || [])
    .map(function (o) { return o.image && o.image.url; })
    .filter(function (u) { return !!u; });

  if (!urls.length) {
    return { ok: false, error: 'A Firefly respondeu, mas sem nenhuma imagem no resultado.' };
  }
  return { ok: true, urls: urls };
}

// Rode manualmente pelo editor pra confirmar que a geração funciona de
// verdade antes de confiar na Bee usando isso sozinha.
function diagnosticoGerarImagemFirefly() {
  var resultado = gerarImagemFirefly('um sol amarelo bem simples, estilo ícone, fundo branco');
  Logger.log(JSON.stringify(resultado, null, 2));
}

/**
 * Serve as duas telas do fluxo de autorização (chamada pelo doGet,
 * Código.gs, antes de cair no roteamento normal de ações). Nunca
 * imprime texto vindo da Adobe direto no HTML (evita qualquer risco de
 * injeção) — detalhe de erro sempre só no Log de execução.
 */
function tratarFireflyAuthGet(e) {
  var acao = e.parameter.fireflyAuth;

  if (acao === 'iniciar') {
    var url = urlDeAutorizacaoFirefly();
    return HtmlService.createHtmlOutput(
      '<p>Redirecionando pra Adobe...</p><script>window.location.href = ' + JSON.stringify(url) + ';</script>'
    );
  }

  if (acao === 'callback') {
    var code = e.parameter.code;
    if (!code) {
      return HtmlService.createHtmlOutput('<p>A Adobe não mandou o código de autorização. Veja o Log de execução do Apps Script pra detalhe.</p>');
    }
    var resultado = trocarCodigoPorTokenFirefly(code);
    if (!resultado.ok) {
      return HtmlService.createHtmlOutput('<p>Não consegui autorizar a Firefly agora. Veja o Log de execução do Apps Script pra detalhe.</p>');
    }
    return HtmlService.createHtmlOutput('<p>Autorizado! Pode fechar essa aba — a Bee já pode gerar imagem pela Firefly agora.</p>');
  }

  return HtmlService.createHtmlOutput('<p>Ação de autorização da Firefly desconhecida.</p>');
}
