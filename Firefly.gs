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
 * ⚠️ LIMITAÇÃO CONFIRMADA (2026-08-03): não tem como conseguir
 * refresh_token com a credencial atual. Investigado a fundo com o
 * Cláudio direto no Adobe Developer Console:
 *   - o escopo "offline_access" (que normalmente traz o refresh_token)
 *     é recusado com "invalid_scope" pra essa credencial;
 *   - "Server-to-Server Authentication" aparece CINZA/desabilitado pra
 *     essa conta — só "User Authentication" está disponível;
 *   - removendo e reconectando a API do zero ao projeto (pra tentar
 *     escolher escopos diferentes), a Adobe nem oferece tela de escolha
 *     de escopo — ela simplesmente não existe pra esse produto.
 * Ou seja: com o plano/produto que a Beeon tem hoje ("Adobe Express API
 * - Firefly Services (beta)"), o token dura só algumas horas e NUNCA vai
 * durar mais que isso — não é uma configuração faltando, é como esse
 * produto funciona. Pra ter geração de imagem automática de verdade
 * (sem ninguém precisando logar de novo periodicamente), precisaria de
 * um produto/plano diferente da Adobe com liberação pra
 * Server-to-Server — isso é decisão de conta/contrato com a Adobe, não
 * dá pra resolver só no código.
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

// ✅ CONFIRMADO (2026-08-02, documentação da Adobe): pra credencial
// "Adobe Express API - Firefly Services (beta)" — que é a que a Beeon
// tem — o escopo certo é este, não "firefly_api,ff_apis" (chute
// anterior, causava erro "invalid_scope" da Adobe antes mesmo de
// mostrar a tela de login).
//
// ⚠️ TENTATIVA (2026-08-03): a resposta vinha com access_token mas sem
// refresh_token, então acrescentei "offline_access" (é esse escopo que
// normalmente faz a Adobe incluir o refresh_token). Só que a Adobe
// recusou com "invalid_scope" ANTES de mostrar a tela de login — sinal
// de que esse escopo não está liberado pra essa credencial específica no
// Adobe Developer Console (nem toda combinação de produto/credencial
// pode pedir todo escopo). Voltado pro que funcionava (sem
// offline_access) até confirmar do lado da Adobe se dá pra liberar.
// Ver o aviso grande no topo deste arquivo.
var FIREFLY_SCOPES = 'openid,AdobeID,ee.express_api';

function fireflyClientId() {
  return PropertiesService.getScriptProperties().getProperty('FIREFLY_CLIENT_ID');
}
function fireflyClientSecret() {
  return PropertiesService.getScriptProperties().getProperty('FIREFLY_CLIENT_SECRET');
}

// A própria URL do Web App do Colmeia — igual à COLMEIA_API_URL do
// js/config.js do front-end (sempre a MESMA implantação, nunca muda,
// ver deploy automático no CLAUDE.md). Fixa na mão em vez de
// ScriptApp.getService().getUrl(): essa função devolve uma URL
// DIFERENTE (termina em "/dev", com outro ID) quando rodada a partir
// do botão "Executar" do editor em vez de um pedido HTTP de verdade —
// confirmado na prática (foi o que gerou o "A Adobe não mandou o
// código" na primeira tentativa). Fixando aqui, o endereço é sempre o
// mesmo não importa de onde essa função é chamada.
function redirectUriFirefly() {
  return 'https://script.google.com/macros/s/AKfycbxSKcto3u-463xmhUm2xGUIylkWzYyeU-L-QHEz0bnFPImsl7Vlum5bZJU5vDT-5gOI/exec?fireflyAuth=callback';
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

  if (codigo >= 200 && codigo < 300 && corpo.access_token && !corpo.refresh_token) {
    // Caso específico já visto na prática (2026-08-03): a Adobe autoriza
    // normal (200, com access_token), mas sem "offline_access" no escopo
    // ela não manda refresh_token. Detectado à parte pra dar uma mensagem
    // que aponta a causa, em vez de um "a Adobe recusou" genérico e
    // confuso pra quem está vendo um 200 na tela.
    Logger.log('Firefly: veio access_token mas sem refresh_token (faltava offline_access no escopo).');
    return {
      ok: false,
      error: 'A Adobe autorizou, mas não mandou o "refresh_token" (só um token que expira em algumas horas). ' +
             'Faltava o escopo "offline_access" no pedido — se isso já foi corrigido no código, tenta autorizar de novo.',
      detalheStatus: codigo
    };
  }

  if (codigo < 200 || codigo >= 300 || !corpo.refresh_token) {
    var corpoBruto = resposta.getContentText();
    Logger.log('Firefly: falha ao trocar code por token (status ' + codigo + '): ' + corpoBruto);
    // O detalhe vai JUNTO na resposta (não só no Log de execução) — a tela
    // de callback (tratarFireflyAuthGet, Código.gs) mostra isso direto no
    // navegador. Antes disso, achar esse erro exigia caçar a execução
    // certa na lista "Execuções" do Apps Script, uma tela que se mostrou
    // difícil de navegar sem prática (cliques não abriam o painel de
    // detalhe, provavelmente por causa do zoom/tamanho da janela).
    return {
      ok: false,
      error: 'A Adobe recusou (status ' + codigo + ').',
      detalheStatus: codigo,
      detalheBruto: corpoBruto.substring(0, 500)
    };
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
      // A palavra é "expirou", não "ainda não foi autorizada" — com o
      // plano atual da Adobe (ver o aviso de LIMITAÇÃO CONFIRMADA no topo
      // do arquivo) isso é esperado acontecer de novo periodicamente
      // (a cada poucas horas), não é um erro de configuração.
      semAutorizacaoFirefly: true,
      error: 'A autorização da Firefly expirou (isso acontece de tempos em tempos, o token da Adobe não dura muito com o plano atual). Peça pro Cláudio abrir a URL do Colmeia (COLMEIA_API_URL) + "?fireflyAuth=iniciar" num navegador e autorizar de novo — leva só alguns segundos.'
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

/**
 * CAMINHO ALTERNATIVO DE AUTORIZAÇÃO — rode esta função aqui pelo
 * editor do Apps Script (menu "Executar") e copie do Log a URL que ela
 * imprime; cole essa URL direto na barra do navegador.
 *
 * Existe porque a página "?fireflyAuth=iniciar" depende do Web App
 * responder a um GET no navegador, e isso pode falhar por motivo que
 * não tem nada a ver com a Firefly (domínio do Workspace, extensão do
 * navegador, implantação desatualizada). Por aqui, o primeiro passo não
 * depende do Web App — só o retorno da Adobe (o "callback") depende, e
 * esse a Adobe abre sozinha.
 *
 * Também confere, antes de mais nada, se as duas chaves estão
 * cadastradas — o motivo mais comum de "não funciona" é essa parte.
 */
function mostrarUrlDeAutorizacaoFirefly() {
  if (!fireflyClientId() || !fireflyClientSecret()) {
    Logger.log('FALTA CADASTRAR: preencha FIREFLY_CLIENT_ID e FIREFLY_CLIENT_SECRET em ' +
      'Configurações do projeto > Propriedades do script, e rode de novo.');
    return;
  }
  Logger.log('1) Confira se este endereço está cadastrado como Redirect URI na Adobe:');
  Logger.log(redirectUriFirefly());
  Logger.log('');
  Logger.log('2) Copie a URL abaixo e cole na barra do navegador pra autorizar:');
  Logger.log(urlDeAutorizacaoFirefly());
}

// Rode manualmente pelo editor pra confirmar que a geração funciona de
// verdade antes de confiar na Bee usando isso sozinha.
function diagnosticoGerarImagemFirefly() {
  var resultado = gerarImagemFirefly('um sol amarelo bem simples, estilo ícone, fundo branco');
  Logger.log(JSON.stringify(resultado, null, 2));
}

// Escapa texto antes de pôr dentro de HTML — usado só aqui porque o
// detalhe do erro (vindo da Adobe) agora aparece direto na tela de
// callback. Sem isso, texto com "<" ou "&" no meio quebraria a página, e
// na teoria a Adobe poderia devolver algo malicioso ali.
function escaparHtmlSimples(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serve as duas telas do fluxo de autorização (chamada pelo doGet,
 * Código.gs, antes de cair no roteamento normal de ações).
 *
 * O detalhe do erro (o que a Adobe respondeu, e o status) aparece DIRETO
 * NA TELA agora, escapado — antes só ia pro "Log de execução" do Apps
 * Script, uma tela que se mostrou difícil de navegar sem prática (o
 * clique numa linha não abria o painel de detalhe, dependendo do zoom/
 * tamanho da janela do navegador). Assim o Cláudio só precisa olhar a
 * própria página, ou tirar um print dela.
 */
function tratarFireflyAuthGet(e) {
  var acao = e.parameter.fireflyAuth;
  var ESTILO_CAIXA = 'font-family:sans-serif;padding:24px;line-height:1.6;max-width:640px';
  var ESTILO_ERRO = 'background:#FDECEC;color:#8A1C1C;border-radius:10px;padding:14px 16px;margin-top:14px;font-size:13px;white-space:pre-wrap;word-break:break-word';

  if (acao === 'iniciar') {
    // Um LINK pra clicar, não um redirecionamento automático: o
    // HtmlService serve essa página dentro de um quadro isolado
    // (iframe com sandbox), onde mexer em window.location só navega o
    // quadro de dentro — e a navegação pro topo costuma ser barrada.
    // target="_top" é o que faz o clique trocar a página inteira.
    var url = urlDeAutorizacaoFirefly();
    return HtmlService.createHtmlOutput(
      '<div style="' + ESTILO_CAIXA + '">' +
      '<p>Clique pra autorizar a Bee a usar a Adobe Firefly:</p>' +
      '<p><a href="' + url.replace(/"/g, '&quot;') + '" target="_top" ' +
      'style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">Autorizar na Adobe</a></p>' +
      '</div>'
    );
  }

  if (acao === 'callback') {
    var code = e.parameter.code;
    if (!code) {
      // Quando a própria Adobe recusa antes de voltar pro Colmeia, ela manda
      // "error" e "error_description" na URL em vez do "code" — mostra isso
      // também, é a pista mais direta que existe.
      var erroAdobe = e.parameter.error;
      var descricaoAdobe = e.parameter.error_description;
      return HtmlService.createHtmlOutput(
        '<div style="' + ESTILO_CAIXA + '">' +
        '<p>A Adobe não mandou o código de autorização.</p>' +
        (erroAdobe ? '<div style="' + ESTILO_ERRO + '">' + escaparHtmlSimples(erroAdobe) +
          (descricaoAdobe ? '\n' + escaparHtmlSimples(descricaoAdobe) : '') + '</div>' : '') +
        '</div>'
      );
    }
    var resultado = trocarCodigoPorTokenFirefly(code);
    if (!resultado.ok) {
      return HtmlService.createHtmlOutput(
        '<div style="' + ESTILO_CAIXA + '">' +
        '<p>Não consegui autorizar a Firefly agora.</p>' +
        '<div style="' + ESTILO_ERRO + '">' +
        escaparHtmlSimples(resultado.error) +
        (resultado.detalheBruto ? '\n\n' + escaparHtmlSimples(resultado.detalheBruto) : '') +
        '</div>' +
        '<p style="margin-top:14px;font-size:13px;color:#666">Tira um print desta página e manda pro Claude.</p>' +
        '</div>'
      );
    }
    return HtmlService.createHtmlOutput('<p>Autorizado! Pode fechar essa aba — a Bee já pode gerar imagem pela Firefly agora.</p>');
  }

  return HtmlService.createHtmlOutput('<p>Ação de autorização da Firefly desconhecida.</p>');
}
