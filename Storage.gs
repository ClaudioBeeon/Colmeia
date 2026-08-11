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
function urlPublicaDaPeca(fileId) {
  if (!fileId || !supabaseConfigurado()) return null;

  var jaTem = urlPublicadaGuardada(fileId);
  if (jaTem) return jaTem;

  try {
    var arquivo = DriveApp.getFileById(fileId);
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
          // Um ano de cache no navegador: o conteúdo daquele caminho nunca
          // muda — versão nova da peça é outro arquivo, com outro UUID.
          'Cache-Control': 'max-age=31536000'
        },
        muteHttpExceptions: true
      }
    );
    if (resposta.getResponseCode() < 200 || resposta.getResponseCode() >= 300) return null;

    var url = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BALDE + '/' + caminho;
    guardarUrlPublicada(fileId, caminho, url);
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

function urlPublicadaGuardada(fileId) {
  var r = supabaseBuscar('arquivos_publicados',
    'select=url&file_id=eq.' + encodeURIComponent(String(fileId)) + '&limit=1');
  if (!r.ok || !Array.isArray(r.dados) || !r.dados.length) return null;
  return r.dados[0].url || null;
}

function guardarUrlPublicada(fileId, caminho, url) {
  supabaseSalvar('arquivos_publicados', {
    file_id: String(fileId), caminho: caminho, url: url, quando: new Date().getTime()
  });
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
