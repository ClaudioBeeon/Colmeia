/**
 * STORAGE — as imagens das peças deixam de passar por dentro do Apps Script.
 *
 * ---------------------------------------------------------------------
 * O PROBLEMA
 *
 * O caminho de hoje é: o Drive entrega o arquivo pro Apps Script, o Apps
 * Script transforma a imagem inteira em texto (base64), manda esse texto
 * pro navegador, e o navegador desmonta de volta. Isso acontece TODA VEZ
 * que alguém olha a peça — e o navegador não consegue guardar nada disso,
 * porque não é um endereço de imagem, é texto no meio de uma resposta.
 *
 * E tem teto: 25 MB (`LIMITE_BYTES`, Drive.gs). Vídeo já foi tirado desse
 * caminho em 2026-08-04, depois de simplesmente não abrir na página do
 * cliente — com uma mensagem que dizia "o arquivo pode ter sido movido ou
 * apagado" quando o problema era tamanho. Imagem grande cai no mesmo
 * buraco, só que mais raramente, o que é pior: parece aleatório.
 *
 * A SAÍDA
 *
 * Uma cópia da imagem no Supabase Storage, feita UMA vez, e o endereço
 * dela guardado. A partir daí as telas usam <img src="..."> normal: o
 * navegador guarda, a segunda visita é instantânea, e não existe mais
 * limite de tamanho. O Drive continua sendo o DONO do arquivo — isto aqui
 * é só a cópia que o navegador enxerga.
 * ---------------------------------------------------------------------
 *
 * ⚠️ SOBRE EXPOR A PEÇA
 *
 * O endereço é público pra quem tiver o link (é o que faz funcionar numa
 * página sem login), mas o caminho é um UUID sorteado — não dá pra
 * adivinhar nem pra listar o que existe no balde. É a MESMA proteção que
 * o link de aprovação do cliente já usa hoje: o que protege é o código
 * aleatório, não uma parede.
 *
 * ⚠️ QUANDO A CÓPIA É APAGADA — e por que NÃO é quando a conferência acaba
 *
 * A ideia original era apagar assim que a peça fosse aprovada ou
 * devolvida. Está errada: o passo seguinte à aprovação interna é
 * exatamente o link do cliente, que precisa da MESMA imagem. Apagar ali
 * quebraria o fluxo inteiro no momento em que ele mais importa.
 *
 * Então some por IDADE, na limpeza diária (`limparArquivosPublicadosAntigos`),
 * bem depois de qualquer aprovação ou conferência ter se resolvido. Se
 * alguém abrir um link velho depois disso, o Apps Script republica na
 * hora — a tabela é um atalho, não a fonte da verdade.
 */

var STORAGE_BALDE = 'pecas';
var PUBLICADOS_RETENCAO_DIAS = 120;

/**
 * O endereço público da imagem — publicando ela se for a primeira vez.
 *
 * Devolve null quando não deu (Storage desligado, arquivo sumido, falha
 * de rede). Quem chama tem que continuar funcionando pelo caminho antigo
 * do base64: esta é uma melhoria de velocidade, não uma dependência nova.
 */
/**
 * @param {string} fileId
 * @param {number} [atualizadoEm] Quando o arquivo foi modificado no Drive
 *   (epoch ms). Quem já tem esse dado em mãos — a fila de conferência
 *   lista a pasta e recebe `atualizadoEm` de graça — deve passar, pra
 *   poupar uma ida ao Drive. Sem ele, é lido aqui.
 *
 * ⚠️ A DATA É PARTE DA IDENTIDADE DA CÓPIA, não um detalhe (2026-08-11).
 * O designer SUBSTITUI o arquivo no Drive mantendo o mesmo id: conteúdo
 * novo, id igual. Antes, a busca era só por `file_id`, achava a linha
 * antiga e devolvia a cópia velha — foi assim que um cliente recebeu o
 * link de aprovação e viu a arte anterior à alteração que ele mesmo tinha
 * pedido. Procurando por `file_id + atualizado_em`, arquivo substituído
 * não casa com nada e é publicado de novo, com outro UUID.
 */
function urlPublicaDaPeca(fileId, atualizadoEm) {
  if (!fileId || !supabaseConfigurado()) return null;

  try {
    var arquivo = DriveApp.getFileById(fileId);
    // Só a data, antes de qualquer coisa cara: `getBlob()` baixa os bytes,
    // e na maioria das chamadas a cópia já existe e não precisamos deles.
    var quandoDrive = Number(atualizadoEm) || arquivo.getLastUpdated().getTime();

    var jaTem = urlPublicadaGuardada(fileId, quandoDrive);
    if (jaTem) return jaTem;

    var blob = arquivo.getBlob();
    var tipo = blob.getContentType() || 'application/octet-stream';

    // Vídeo continua fora: ele já é servido pelo player do Drive, e
    // copiar dezenas de MB pro Storage a cada peça não paga o que
    // resolve. Aqui a conversa é sobre IMAGEM.
    if (tipo.indexOf('image/') !== 0) return null;

    // UUID no caminho: impossível de adivinhar. O nome do arquivo original
    // vai junto só pra facilitar a vida de quem for olhar o balde por
    // dentro — não é ele que protege nada.
    var caminho = Utilities.getUuid() + '/' + nomeSeguroParaStorage(arquivo.getName());

    var resposta = UrlFetchApp.fetch(
      SUPABASE_URL + '/storage/v1/object/' + STORAGE_BALDE + '/' + caminho,
      {
        method: 'post',
        contentType: tipo,
        payload: blob.getBytes(),
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          // Um ano de cache no navegador. Isto agora é VERDADE: o caminho
          // carrega um UUID novo a cada publicação, e a busca é por
          // `file_id + atualizado_em` — então versão nova é sempre outro
          // endereço, e este aqui de fato nunca muda de conteúdo. (Era
          // exatamente isso que estava errado antes de 2026-08-11.)
          'Cache-Control': 'max-age=31536000'
        },
        muteHttpExceptions: true
      }
    );
    if (resposta.getResponseCode() < 200 || resposta.getResponseCode() >= 300) return null;

    var url = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BALDE + '/' + caminho;
    guardarUrlPublicada(fileId, caminho, url, quandoDrive);
    return url;
  } catch (err) {
    return null; // segue pelo base64
  }
}

/** Tira do nome tudo que atrapalharia num endereço. */
function nomeSeguroParaStorage(nome) {
  return String(nome || 'peca')
    // A faixa u0300-u036f e a dos acentos. Escrita como TEXTO num
    // new RegExp, e nao com os caracteres de verdade: eles sao
    // invisiveis no editor, e um apagado sem querer viraria um erro
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 80);
}

/** A cópia DESTA versão do arquivo, se ela já existir no balde. */
function urlPublicadaGuardada(fileId, atualizadoEm) {
  var r = supabaseBuscar('arquivos_publicados',
    'select=url&file_id=eq.' + encodeURIComponent(String(fileId))
    + '&atualizado_em=eq.' + encodeURIComponent(String(Number(atualizadoEm) || 0))
    + '&limit=1');
  if (!r.ok || !Array.isArray(r.dados) || !r.dados.length) return null;
  return r.dados[0].url || null;
}

function guardarUrlPublicada(fileId, caminho, url, atualizadoEm) {
  supabaseSalvar('arquivos_publicados', {
    file_id: String(fileId), caminho: caminho, url: url,
    // `quando` é quando o Colmeia publicou (é o que a limpeza dos 120 dias
    // usa). `atualizado_em` é quando o arquivo mudou NO DRIVE — e é essa
    // que identifica a versão.
    quando: new Date().getTime(),
    atualizado_em: Number(atualizadoEm) || 0
  });
}

/**
 * Todas as cópias já publicadas de uma peça, da mais nova pra mais velha.
 *
 * O Drive guarda só a última (o designer substitui o arquivo), então esta
 * é a única memória que existe das versões anteriores — é daqui que sai o
 * "v1, v2" do card.
 */
function versoesPublicadasDaPeca(fileId) {
  if (!fileId || !supabaseConfigurado()) return [];
  var r = supabaseBuscar('arquivos_publicados',
    'select=url,atualizado_em,quando&file_id=eq.' + encodeURIComponent(String(fileId))
    + '&order=atualizado_em.desc');
  if (!r.ok || !Array.isArray(r.dados)) return [];
  var total = r.dados.length;
  return r.dados.map(function (linha, i) {
    return {
      url: linha.url,
      atualizadoEm: Number(linha.atualizado_em) || 0,
      // A mais antiga é a v1; a mais nova tem o número maior. Como a lista
      // vem em ordem decrescente, o índice conta ao contrário.
      versao: total - i,
      atual: i === 0
    };
  });
}

/**
 * AS URLS DE UMA LISTA INTEIRA, DE UMA VEZ (2026-08-11).
 *
 * ---------------------------------------------------------------------
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * A lista de peças da Central (49 itens num dia normal) pedia a miniatura
 * de cada uma por `buscarThumbnailDrive`: 49 idas ao Apps Script, cada uma
 * abrindo o Drive e voltando com a imagem em base64. Some a latência de 49
 * chamadas com o fato de que NADA disso o navegador consegue guardar (não
 * é endereço, é texto no meio da resposta) — e a tela demorava tanto que o
 * Cláudio relatou como inutilizável. Pior: cada filtro, troca de
 * agrupamento ou clique refazia as 49.
 *
 * ---------------------------------------------------------------------
 * COMO FICA
 *
 * Uma chamada só devolve `{fileId: url}`. Pra imagem JÁ publicada isso é
 * uma consulta única na `arquivos_publicados` — instantânea, sem tocar no
 * Drive. O navegador então usa `<img src="...">` normal: baixa tudo em
 * paralelo direto do Supabase, e guarda em cache (o Storage manda um ano
 * de validade), então a segunda visita não baixa nada.
 *
 * ⚠️ PUBLICAR custa: é ler o arquivo no Drive e subir a cópia. Por isso o
 * teto de `STORAGE_MAX_PUBLICAR_POR_VEZ` — sem ele, a primeira abertura de
 * uma lista grande estouraria o tempo da requisição e a pessoa não veria
 * NADA, que é pior do que ver metade. O que não coube volta sem url e a
 * tela cai no caminho antigo (miniatura em base64, só pra essas); a
 * chamada seguinte publica mais um tanto, e em poucas visitas a lista
 * inteira está publicada.
 */
var STORAGE_MAX_PUBLICAR_POR_VEZ = 12;

/**
 * @param {string[]} fileIds
 * @param {Object<string,number>} [atualizadosPorId] fileId → data de
 *   modificação no Drive. Quem já sabe (a fila de conferência lista a
 *   pasta e recebe isso de graça) passa; quem não sabe deixa vazio, e aí
 *   cada peça que faltar é resolvida lendo o Drive dentro de
 *   `urlPublicaDaPeca`.
 *
 * ⚠️ Sem `atualizadosPorId`, a consulta em lote não tem como saber se a
 * cópia guardada ainda vale — ela devolve a MAIS NOVA que existe no
 * balde. Isso é seguro pra uma LISTA (a tela mostra miniatura; se estiver
 * um passo atrás, a próxima visita já corrige), mas não seria pro link do
 * cliente — e por isso `buscarAprovacaoPublica` não usa esta função: ela
 * chama `urlPublicaDaPeca` peça por peça, com a data em mãos.
 */
function urlsPublicasDasPecas(fileIds, atualizadosPorId) {
  var saida = {};
  if (!Array.isArray(fileIds) || !fileIds.length) return { ok: true, urls: saida };
  if (!supabaseConfigurado()) return { ok: true, urls: saida };
  atualizadosPorId = atualizadosPorId || {};

  // Sem repetidos: a mesma peça pode aparecer duas vezes na lista (um
  // arquivo que está em dois lotes, por exemplo).
  var unicos = [];
  var visto = {};
  fileIds.forEach(function (id) {
    var s = String(id || '');
    if (s && !visto[s]) { visto[s] = true; unicos.push(s); }
  });

  // UMA consulta pra todas as já publicadas. `in.(a,b,c)` é o "está nesta
  // lista" do PostgREST; as aspas duplas em volta de cada id são
  // obrigatórias porque id do Drive tem `-` e `_`.
  try {
    var lista = unicos.map(function (id) { return '"' + id + '"'; }).join(',');
    var r = supabaseBuscar('arquivos_publicados',
      'select=file_id,url,atualizado_em&file_id=in.(' + encodeURIComponent(lista)
      + ')&order=atualizado_em.desc');
    if (r.ok && Array.isArray(r.dados)) {
      var melhor = {}; // fileId -> a data da cópia que escolhemos
      r.dados.forEach(function (linha) {
        if (!linha.file_id || !linha.url) return;
        var data = Number(linha.atualizado_em) || 0;
        var esperada = atualizadosPorId[linha.file_id];
        // Quando quem chamou sabe a data do Drive, só serve a cópia
        // DAQUELA versão — cópia de versão antiga é justamente o erro que
        // isto conserta. Sem saber, fica a mais nova publicada.
        if (esperada && data !== Number(esperada)) return;
        if (melhor[linha.file_id] !== undefined && melhor[linha.file_id] >= data) return;
        melhor[linha.file_id] = data;
        saida[linha.file_id] = linha.url;
      });
    }
  } catch (err) {
    // Sem a consulta, todas caem como "ainda não publicadas" — o pior caso
    // é a tela usar o caminho antigo, nunca ficar sem imagem.
  }

  // As que faltam: publica algumas agora, dentro do teto.
  var publicadas = 0;
  for (var i = 0; i < unicos.length && publicadas < STORAGE_MAX_PUBLICAR_POR_VEZ; i++) {
    if (saida[unicos[i]]) continue;
    var url = urlPublicaDaPeca(unicos[i], atualizadosPorId[unicos[i]]); // null em vídeo e em falha
    if (url) { saida[unicos[i]] = url; publicadas++; }
  }

  return { ok: true, urls: saida };
}

/**
 * Apaga as cópias velhas — do Storage E da tabela, nessa ordem, pra nunca
 * sobrar uma linha apontando pra um arquivo que já não existe (que faria
 * a tela mostrar uma imagem quebrada em vez de republicar).
 *
 * Roda junto do backup diário. 120 dias é folga de sobra: a conferência é
 * podada em 30 e a aprovação em bem menos que isso.
 */
function limparArquivosPublicadosAntigos() {
  if (!supabaseConfigurado()) return;
  var corte = new Date().getTime() - PUBLICADOS_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

  var velhos = supabaseBuscar('arquivos_publicados',
    'select=file_id,caminho&quando=lt.' + corte + '&limit=200');
  if (!velhos.ok || !Array.isArray(velhos.dados) || !velhos.dados.length) return;

  velhos.dados.forEach(function (linha) {
    try {
      UrlFetchApp.fetch(
        SUPABASE_URL + '/storage/v1/object/' + STORAGE_BALDE + '/' + linha.caminho,
        {
          method: 'delete',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
          muteHttpExceptions: true
        }
      );
    } catch (e) { /* se o arquivo já não estava lá, tanto faz */ }
    supabaseApagar('arquivos_publicados',
      'file_id=eq.' + encodeURIComponent(String(linha.file_id)));
  });
}

/**
 * Uma peça qualquer que já esteve na conferência — só pra ter o que
 * testar. Pega da fonte que estiver mandando (banco ou planilha), então
 * funciona antes e depois da virada da chave.
 */
function umaImagemQualquerDaConferencia() {
  try {
    var linhas = linhasDaConferencia();
    // De trás pra frente: as últimas peças são as que mais provavelmente
    // ainda existem no Drive.
    for (var i = linhas.length - 1; i >= 1; i--) {
      var fileId = String(linhas[i][6] || '');   // coluna file_id
      var tipo = String(linhas[i][8] || '');     // coluna mime_type
      if (fileId && tipo.indexOf('image/') === 0) return fileId;
    }
  } catch (e) { /* sem fila ainda */ }
  return '';
}

/**
 * Teste de bancada — rodar no editor do Apps Script, SEM argumento
 * nenhum, pra confirmar que o balde existe e está com as permissões
 * certas ANTES de depender disso numa tela.
 */
function testarStorage(fileId) {
  // Sem argumento, acha uma imagem sozinha: o editor do Apps Script não
  // tem onde digitar um argumento, e mandar alguém editar o código pra
  // colar um id no meio da função é pedir pra quebrar alguma coisa.
  if (!fileId) {
    fileId = umaImagemQualquerDaConferencia();
    if (!fileId) {
      Logger.log('Não achei nenhuma imagem na fila de conferência pra testar.');
      Logger.log('Mande uma peça pra revisão e rode isto de novo — ou passe');
      Logger.log('um id na mão: testarStorage("1AbC...").');
      return;
    }
    Logger.log('Testando com uma peça da fila de conferência (id ' + fileId + ').');
  }
  var url = urlPublicaDaPeca(fileId);
  if (url) {
    Logger.log('✅ Publicado. Abra no navegador pra conferir:');
    Logger.log(url);
  } else {
    Logger.log('❌ Não consegui publicar. Confira, nesta ordem:');
    Logger.log('   1. O balde "' + STORAGE_BALDE + '" existe e está marcado como público?');
    Logger.log('   2. A tabela arquivos_publicados foi criada (08-storage.sql)?');
    Logger.log('   3. O arquivo é mesmo uma imagem? (vídeo é ignorado de propósito)');
  }
}
