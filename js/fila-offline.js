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
  // "Ficar comigo" da Fila de repasse: a tela já esconde o card na hora
  // (a decisão fica no localStorage), então esperar a internet voltar pra
  // gravar na planilha não atrapalha ninguém — e sem isso a decisão só
  // existiria neste navegador, que é exatamente o problema que levou essa
  // lista pra planilha (ver Planilha.gs, seção "FICAR COMIGO").
  "ignorarNoRepasse",
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
      if (data && data.ok) {
        enviadas++;
        // O comentário guardado (ver enviarParaAlvo, js/detalhe-modal.js)
        // ficou na tela com a bolha em "aguardando-rede" até aqui — agora
        // que ele chegou de verdade no Runrun.it, se a MESMA tarefa ainda
        // estiver aberta, recarrega a conversa pra trocar essa bolha
        // provisória pela de verdade (com o autor/hora reais que vieram
        // de lá). Guards por typeof: fila-offline.js carrega antes de
        // detalhe-modal.js/chat-comentarios.js (ver ordem no CLAUDE.md).
        if (item.corpo.acao === "adicionarComentario"
          && typeof tasks !== "undefined" && typeof detailIdx !== "undefined"
          && tasks[detailIdx] && String(tasks[detailIdx].id) === String(item.corpo.taskId)
          && typeof recarregarThreadAtiva === "function") {
          recarregarThreadAtiva();
        }
      } else {
        mostrarToast(`Não consegui enviar "${item.descricao}" quando a internet voltou: ${(data && data.error) || "recusado"}`, "erro");
      }
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

// ============================================
// ESCRITAS OTIMISTAS: SEGURAR O QUE ACABOU DE MUDAR NA TELA
// ============================================
// O Colmeia muda a tela ANTES do Runrun.it confirmar (é o padrão do app
// inteiro). Só que o quadro se atualiza sozinho 900ms depois de qualquer
// clique (agendarAtualizacaoKanban) e de 60 em 60 segundos — e essa busca
// traz o estado que o Runrun.it ainda tem, que é o ANTIGO, porque a escrita
// nem chegou lá. Resultado: a mudança aparecia e sumia sozinha alguns
// instantes depois ("aparece e volta", relatado pelo Cláudio no painel dos
// designers).
//
// Cada conserto pontual disso virava mais uma linha na lista de campos
// preservados de atualizarKanbanEmBackground (js/pessoas-fotos.js) — e a
// lista só cresce, esquecer um campo novo não dá erro nenhum, só some da
// tela. Aqui a coisa é ao contrário: quem faz a mudança otimista DECLARA
// isso, e a varredura respeita a declaração sem precisar saber que campo é.
//
// É uma JANELA de tempo, não pra sempre: passados alguns segundos volta a
// valer o que o Runrun.it diz — senão uma alteração feita por outra pessoa
// (ou pelo próprio Runrun.it) nunca mais chegaria nesta tela.
const ESCRITA_OTIMISTA_MS = 25000;

/**
 * "Mudei estes campos na tela agora; não deixe a varredura desfazer."
 * Já aplica os valores também, pra quem chama não precisar fazer as duas
 * coisas separadas e esquecer uma.
 *
 *   marcarEscritaOtimista(t, { dueISO: "2026-08-20", due: "20 ago" });
 */
function marcarEscritaOtimista(task, campos) {
  if (!task || !campos) return;
  if (!task._otimista) task._otimista = {};
  const ate = Date.now() + ESCRITA_OTIMISTA_MS;
  Object.keys(campos).forEach(campo => {
    task[campo] = campos[campo];
    task._otimista[campo] = ate;
  });
}

/**
 * O Runrun.it recusou e quem chamou já devolveu os valores antigos — tira a
 * proteção na hora, senão a varredura ficaria segurando o valor ERRADO
 * (o que a pessoa tentou pôr) pelo resto da janela.
 */
function desmarcarEscritaOtimista(task, nomesDosCampos) {
  if (!task || !task._otimista) return;
  nomesDosCampos.forEach(campo => { delete task._otimista[campo]; });
}

/**
 * Chamado pela varredura do quadro pra cada tarefa: copia pro objeto novo
 * os campos que ainda estão dentro da janela de proteção.
 *
 * Repare que NÃO se apaga a marca quando o Runrun.it confirma: logo depois
 * de uma escrita, a leitura dele ainda devolve o valor velho por alguns
 * segundos (é a mesma razão de o cronômetro ter a proteção dele). Deixar a
 * janela vencer sozinha cobre os dois casos com uma regra só.
 */
function preservarEscritasOtimistas(antiga, nova) {
  if (!antiga || !nova || !antiga._otimista) return;
  const agora = Date.now();
  const aindaValendo = {};
  Object.keys(antiga._otimista).forEach(campo => {
    if (antiga._otimista[campo] <= agora) return;
    nova[campo] = antiga[campo];
    aindaValendo[campo] = antiga._otimista[campo];
  });
  if (Object.keys(aindaValendo).length) nova._otimista = aindaValendo;
}
