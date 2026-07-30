// ============================================
// FILA DE AÇÕES QUANDO A INTERNET CAI
// ============================================
// Antes, se a conexão caísse no meio de uma ação (trocar a data, comentar,
// mover de coluna), o pedido simplesmente se perdia: a tela mostrava um
// erro e pronto — a pessoa tinha que refazer, se lembrasse. Agora essas
// ações ficam guardadas no navegador e são enviadas sozinhas quando a
// internet volta.
//
// SÓ ENTRA NA FILA o que continua CERTO se chegar atrasado — coisas do tipo
// "deixe assim" (a data é essa, a coluna é essa, a prioridade é essa) e
// "adicione isso" (um comentário). Ações que dependem do momento ou do
// estado atual NÃO entram, de propósito:
//
//  - play/pause: um play de 20 minutos atrás marcaria hora errada no
//    Runrun.it;
//  - avançar/desfazer sequência, entregar, reabrir: são "dê um passo a
//    partir de onde está". Se fossem enviadas atrasadas, e a pessoa tivesse
//    tentado de novo no meio, a tarefa avançaria DUAS etapas.
//
// Essas continuam avisando o erro na hora, como antes, pra pessoa decidir.

const FILA_OFFLINE_CHAVE = "colmeia_fila_offline_v1";
const FILA_OFFLINE_MAX = 60;          // teto pra não crescer sem fim
const FILA_OFFLINE_VALIDADE_MS = 12 * 60 * 60 * 1000; // 12h: depois disso, tarde demais

// Ações que podem esperar a internet voltar. Qualquer outra ação passa
// direto e falha na hora, como antes.
const ACOES_QUE_PODEM_ESPERAR = [
  "definirPrioridade",
  "moverEtapa",
  "moverEtapaArbitraria",
  "alterarEntrega",
  "alterarPublicacao",
  "ajustarEstimativa",
  "salvarDescricao",
  "adicionarComentario",
];

function lerFilaOffline() {
  try { return JSON.parse(localStorage.getItem(FILA_OFFLINE_CHAVE) || "[]"); }
  catch (err) { return []; }
}

function salvarFilaOffline(lista) {
  try { localStorage.setItem(FILA_OFFLINE_CHAVE, JSON.stringify(lista)); }
  catch (err) { /* espaço cheio / aba privada — segue sem fila */ }
}

function tamanhoDaFilaOffline() {
  return lerFilaOffline().length;
}

function enfileirarAcaoOffline(corpo, descricao) {
  const fila = lerFilaOffline();
  fila.push({ corpo, descricao, quando: Date.now() });
  salvarFilaOffline(fila.slice(-FILA_OFFLINE_MAX));
  mostrarToast(`Sem internet. Guardei "${descricao}" e envio sozinho quando a conexão voltar.`, "erro");
}

/**
 * Manda uma ação de escrita pro backend. Se o pedido NÃO CHEGAR (internet
 * fora, servidor inacessível), guarda na fila e devolve
 * { ok: true, enfileirado: true }.
 *
 * Por que devolver "ok" nesse caso: quem chama já mostrou a mudança na tela
 * (o padrão otimista do Colmeia). Como a fila garante que a ação vai ser
 * enviada, desfazer na tela agora só pra refazer depois seria pior e mais
 * confuso. A pessoa é avisada pelo avisinho de que ficou guardado.
 *
 * IMPORTANTE: um "não" do backend (ok:false) NÃO passa por aqui — aquilo é
 * uma recusa de verdade (o Runrun.it não aceitou), não falta de internet, e
 * continua desfazendo na tela como sempre.
 */
async function enviarEscritaNoBackend(corpo, descricao) {
  const data = await chamarBackend(corpo);
  // Só entra na fila quando o pedido NÃO CHEGOU (ver caiuARede em
  // js/config.js). Uma recusa de verdade do backend (ok:false sem semRede)
  // continua passando reto pra quem chamou desfazer na tela, como sempre.
  if (caiuARede(data) && ACOES_QUE_PODEM_ESPERAR.indexOf(corpo.acao) !== -1) {
    enfileirarAcaoOffline(corpo, descricao);
    return { ok: true, enfileirado: true };
  }
  return data;
}

let _esvaziandoFila = false;

/**
 * Tenta enviar o que está guardado, um por um e na ordem em que foi feito
 * (importante: duas trocas de data na mesma tarefa têm que ser aplicadas na
 * ordem certa, senão vale a antiga). Para na primeira que não chegar — se a
 * internet ainda está fora, não faz sentido insistir no resto agora.
 */
async function tentarEsvaziarFilaOffline() {
  if (_esvaziandoFila) return;
  let fila = lerFilaOffline();
  if (fila.length === 0) return;
  _esvaziandoFila = true;

  try {
    // Descarta o que ficou velho demais pra ainda fazer sentido.
    const agora = Date.now();
    const validas = fila.filter(item => (agora - item.quando) < FILA_OFFLINE_VALIDADE_MS);
    const vencidas = fila.length - validas.length;
    fila = validas;
    if (vencidas > 0) {
      // GRAVA a lista já limpa AGORA, antes de qualquer envio. Sem isso as
      // ações vencidas continuavam guardadas no navegador (a gravação só
      // acontecia dentro do laço de envio logo abaixo, que nem chega a
      // rodar quando TODAS venceram) — e o aviso abaixo voltava a cada 30
      // segundos, pra sempre, porque a cada rodada ele "descobria" de novo
      // exatamente as mesmas ações vencidas.
      salvarFilaOffline(fila);
      mostrarToast(`Descartei ${vencidas} ação(ões) guardada(s) de mais de 12 horas atrás.`, "erro");
    }

    let enviadas = 0;
    while (fila.length) {
      const item = fila[0];
      const data = await chamarBackend(item.corpo);
      if (caiuARede(data)) break; // internet ainda fora — para aqui e tenta de novo mais tarde
      // Chegou. Tira da fila mesmo se o backend recusou: insistir numa
      // recusa (ex: a tarefa já foi entregue por outra pessoa) repetiria o
      // erro pra sempre. Avisa a pessoa quando isso acontece.
      fila.shift();
      salvarFilaOffline(fila);
      if (data && data.ok) enviadas++;
      else mostrarToast(`Não consegui enviar "${item.descricao}" quando a internet voltou: ${(data && data.error) || "recusado"}`, "erro");
    }

    if (enviadas > 0) {
      mostrarToast(`Internet de volta: enviei ${enviadas} ação(ões) que estavam guardadas.`);
      if (typeof agendarAtualizacaoKanban === "function") agendarAtualizacaoKanban();
    }
  } finally {
    _esvaziandoFila = false;
  }
}

// Tenta assim que o navegador avisa que a internet voltou, quando a aba
// volta pro foco, e de tempo em tempo (o evento "online" não é 100%
// confiável — às vezes o Wi-Fi "volta" mas ainda não passa dado).
window.addEventListener("online", tentarEsvaziarFilaOffline);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tentarEsvaziarFilaOffline();
});
setInterval(tentarEsvaziarFilaOffline, 30000);
