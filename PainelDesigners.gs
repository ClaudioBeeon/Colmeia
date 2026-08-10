/**
 * PONTE PRO PAINEL DE DESIGNERS (2026-08-10)
 * -------------------------------------------
 * A "tela principal" do painel-designers-beeon (o cadastro de designers e
 * clientes, com criativos/tempo médio/home office) e a tela de
 * Configurações dele ("Vincular clientes duplicados") passaram a viver
 * dentro do Colmeia, como página de coordenador — ver
 * js/pagina-painel-designers.js.
 *
 * O DADO continua morando na planilha do painel-designers-beeon (projeto
 * de Apps Script separado, `PAINEL_BEEON_API_URL`), de propósito: essa é
 * a rota RÁPIDA da integração (trazer a TELA pra cá primeiro), sem
 * arriscar mexer em onde o dado já mora. Se um dia fizer sentido juntar
 * as duas planilhas de vez, é só trocar o "de dentro" destas funções —
 * o front-end continua chamando as mesmas ações.
 *
 * Todas as funções aqui são um proxy: o Colmeia recebe a ação do
 * front-end, repassa pro Apps Script do painel, e devolve a resposta —
 * o mesmo padrão que `buscarVinculosDoPainel`/`buscarTempoMedioDoPainel`
 * (RunrunLeitura.gs) já usam pra LER de lá, só que agora também pra
 * ESCREVER.
 *
 * ⚠️ Os dois caches próprios do Colmeia que dependem desses dados
 * (`vinculosClientesPainel`, `tempoMedioClientesPainel`, 10 min cada, em
 * RunrunLeitura.gs) são limpos sempre que uma escrita daqui muda o que
 * está neles — senão uma mudança feita agora (novo vínculo, novo tempo
 * médio) só valeria pro resto do Colmeia depois de até 10 minutos.
 */

/** Limpa os dois caches que RunrunLeitura.gs mantém sobre o painel. */
function invalidarCachesDoPainel() {
  try {
    CacheService.getScriptCache().removeAll(['vinculosClientesPainel', 'tempoMedioClientesPainel']);
  } catch (e) { /* sem cache pra limpar, segue */ }
}

/**
 * Lê o estado completo (designers, clientes de cada um, cores, fotos,
 * home office) direto da fonte — SEM cache, de propósito: esta é a tela
 * onde o coordenador está editando ao vivo, e um retrato de minutos atrás
 * faria ele sobrescrever algo que acabou de mudar (mesmo raciocínio de
 * `pedirConferenciaInterna` usar `listarVersoesDasPecasSemCache`).
 */
function painelLerEstado() {
  try {
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL, { muteHttpExceptions: true });
    var resposta = JSON.parse(res.getContentText());
    if (!resposta || typeof resposta.ok === 'undefined') {
      return { ok: false, error: 'O painel respondeu algo inesperado.' };
    }
    return resposta;
  } catch (err) {
    return { ok: false, error: 'Não consegui falar com o painel de designers agora: ' + err.message };
  }
}

/**
 * Grava o estado completo — o painel guarda tudo como um bloco só (não
 * dá pra gravar "só um designer"), então quem chama manda o objeto
 * inteiro já com a mudança aplicada, do mesmo jeito que o próprio painel
 * sempre fez (`buildPayload()`/`doSave()` no script.js dele).
 */
function painelSalvarEstado(dados) {
  if (!dados) return { ok: false, error: 'Nada pra salvar.' };
  try {
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({ data: dados }),
      muteHttpExceptions: true
    });
    var resposta = JSON.parse(res.getContentText());
    // O tempo médio por cliente mora dentro desse mesmo estado — se a
    // gravação mexeu nele, o cache do Colmeia fica velho até isso limpar.
    if (resposta && resposta.ok) invalidarCachesDoPainel();
    return resposta;
  } catch (err) {
    return { ok: false, error: 'Não consegui salvar no painel agora: ' + err.message };
  }
}

/**
 * A lista pra tela "Vincular clientes duplicados": os nomes que aparecem
 * no painel, no Runrun.it e no Drive, mais os vínculos já feitos. O
 * painel monta essa lista do lado dele (varre o Drive, entre outras
 * coisas) — aqui só repassa.
 */
function painelListarClientesParaVinculo() {
  try {
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL + '?tipo=configClientes', { muteHttpExceptions: true });
    return JSON.parse(res.getContentText());
  } catch (err) {
    return { ok: false, error: 'Não consegui buscar a lista de clientes agora: ' + err.message };
  }
}

/** Liga 2+ nomes como sendo o mesmo cliente — ver salvarVinculoClientes no painel. */
function painelLinkarClientes(nomes) {
  if (!Array.isArray(nomes) || nomes.length < 2) {
    return { ok: false, error: 'Selecione pelo menos 2 nomes pra linkar.' };
  }
  try {
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({ acao: 'linkarClientes', nomes: nomes }),
      muteHttpExceptions: true
    });
    var resposta = JSON.parse(res.getContentText());
    if (resposta && resposta.ok) invalidarCachesDoPainel();
    return resposta;
  } catch (err) {
    return { ok: false, error: 'Não consegui linkar esses clientes agora: ' + err.message };
  }
}

/** Desfaz um vínculo — ver removerVinculoCliente no painel. */
function painelDesvincularCliente(nomeOrigem) {
  if (!nomeOrigem) return { ok: false, error: 'nomeOrigem ausente.' };
  try {
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({ acao: 'desvincularCliente', nomeOrigem: nomeOrigem }),
      muteHttpExceptions: true
    });
    var resposta = JSON.parse(res.getContentText());
    if (resposta && resposta.ok) invalidarCachesDoPainel();
    return resposta;
  } catch (err) {
    return { ok: false, error: 'Não consegui desvincular agora: ' + err.message };
  }
}

/**
 * As atividades recentes do Drive que o painel já varre e cacheia
 * (`?tipo=atividades`) — o mesmo endpoint que `buscarAtividadesPainelBeeon`
 * (js/config.js) já chama direto do navegador. Esta versão passa pelo
 * Colmeia pra a página nova não precisar saber de PAINEL_BEEON_API_URL
 * nenhuma — só chamarBackend, como o resto do app.
 */
function painelAtividadesRecentes() {
  try {
    var res = UrlFetchApp.fetch(PAINEL_BEEON_API_URL + '?tipo=atividades', { muteHttpExceptions: true });
    return JSON.parse(res.getContentText());
  } catch (err) {
    return { ok: false, error: 'Não consegui buscar as atividades agora: ' + err.message };
  }
}
