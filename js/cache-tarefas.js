// ============================================================================
// CACHE DO DETALHE DAS TAREFAS (IndexedDB) — 2026-08-13
// ============================================================================
//
// Por que existe: o Erick reclamou de "1 minuto pra abrir uma tarefa",
// enquanto pra outras pessoas abria normal. A causa não é o computador
// dele — o Web App do Apps Script roda como USER_DEPLOYING, então TODOS
// os pedidos de TODAS as pessoas (mais o poll de 60s de cada aba aberta)
// entram na MESMA fila de execução do Google. Quem clica com a fila cheia
// espera. Parece "só o Erick" porque ele trabalha no horário de pico.
//
// A correção de verdade é ler do Supabase em vez do Apps Script (está no
// plano, é o passo seguinte). Enquanto isso não acontece, este arquivo
// tira a espera da frente da pessoa: o detalhe das tarefas do dia é
// buscado ANTES de alguém clicar, guardado aqui, e a abertura do card
// passa a ser instantânea — a busca de verdade continua acontecendo por
// trás e sobrescreve quando chega (o padrão "mostra o guardado, confere
// depois").
//
// POR QUE IndexedDB E NÃO localStorage (importante):
// o localStorage é síncrono — ler/escrever nele TRAVA a tela enquanto
// acontece — e aguenta só ~5MB. Aqui a gente guarda descrição, comentários
// e briefing de dezenas de tarefas, o que passa fácil desse limite e
// deixaria o app mais engasgado do que já está. O IndexedDB é assíncrono
// (não trava nada) e tem espaço de sobra. O snapshot do QUADRO
// (SNAPSHOT_QUADRO_KEY, js/pessoas-fotos.js) continua no localStorage de
// propósito: lá é um dado só, pequeno, e que precisa estar pronto no
// primeiro instante do boot.
//
// Carregado logo depois do config.js: não depende de mais ninguém, e
// precisa existir antes de chat-comentarios.js e regras-briefing.js, que
// são quem usa.
// ============================================================================

const CACHE_TAREFAS_BANCO = "colmeia";
const CACHE_TAREFAS_LOJA = "detalhesTarefa";
const CACHE_TAREFAS_VALIDADE_MS = 24 * 60 * 60 * 1000; // 1 dia

// Uma tarefa aberta hoje não interessa mais amanhã, mas também não vale a
// pena apagar na hora — a limpeza roda uma vez por sessão, sem pressa.
let _cacheTarefasBanco = null;
let _cacheTarefasIndisponivel = false;

/**
 * Abre (uma vez só) o banco local. Devolve null — sem estourar erro — em
 * qualquer navegador ou situação onde IndexedDB não funciona: aba
 * anônima, armazenamento bloqueado, navegador antigo. Nesses casos o app
 * inteiro continua funcionando exatamente como antes, só sem o ganho de
 * velocidade.
 */
function abrirBancoDoCacheDeTarefas() {
  if (_cacheTarefasIndisponivel) return Promise.resolve(null);
  if (_cacheTarefasBanco) return Promise.resolve(_cacheTarefasBanco);

  return new Promise(resolve => {
    let pedido;
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) {
        _cacheTarefasIndisponivel = true;
        resolve(null);
        return;
      }
      pedido = indexedDB.open(CACHE_TAREFAS_BANCO, 1);
    } catch (err) {
      _cacheTarefasIndisponivel = true;
      resolve(null);
      return;
    }

    pedido.onupgradeneeded = ev => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(CACHE_TAREFAS_LOJA)) {
        db.createObjectStore(CACHE_TAREFAS_LOJA, { keyPath: "id" });
      }
    };
    pedido.onsuccess = ev => {
      _cacheTarefasBanco = ev.target.result;
      resolve(_cacheTarefasBanco);
    };
    pedido.onerror = () => {
      _cacheTarefasIndisponivel = true;
      resolve(null);
    };
    // Acontece quando outra aba do Colmeia está segurando uma versão
    // diferente do banco. Não é erro pra mostrar pra ninguém: só desiste
    // do cache nesta aba.
    pedido.onblocked = () => {
      _cacheTarefasIndisponivel = true;
      resolve(null);
    };
  });
}

/**
 * Anota no PostHog se o card abriu com dado guardado ou teve que esperar.
 *
 * Sem isto, a medição que já existe (`backend_chamada`, js/config.js) diz
 * quanto cada pedido demorou, mas NÃO diz se o pedido foi preciso — ou
 * seja, não dá pra responder "o cache está funcionando?". Aqui é o outro
 * lado: de onde veio o que a pessoa está vendo.
 *
 * `origem`: "cache" (apareceu na hora), "servidor" (esperou a fila), e o
 * `parte` diz o quê — o conteúdo do card, o briefing ou o resumo da Bee.
 */
function medirOrigemDoDado(parte, origem) {
  try {
    if (typeof posthog === "undefined" || !posthog || !posthog.capture) return;
    posthog.capture("cache_tarefa", { parte: parte, origem: origem });
  } catch (err) { /* medir nunca pode quebrar o app */ }
}

/**
 * Lê o que estiver guardado sobre uma tarefa. Devolve null se não tem
 * nada, se venceu, ou se foi guardado por OUTRA pessoa (o computador pode
 * ser compartilhado — mesma proteção do snapshot do quadro).
 */
async function lerDetalheDoCache(taskId) {
  if (!taskId) return null;
  const db = await abrirBancoDoCacheDeTarefas();
  if (!db) return null;

  return new Promise(resolve => {
    let pedido;
    try {
      pedido = db.transaction(CACHE_TAREFAS_LOJA, "readonly")
        .objectStore(CACHE_TAREFAS_LOJA)
        .get(String(taskId));
    } catch (err) {
      resolve(null);
      return;
    }
    pedido.onsuccess = () => {
      const reg = pedido.result;
      if (!reg || !reg.quando) { resolve(null); return; }
      if (Date.now() - reg.quando > CACHE_TAREFAS_VALIDADE_MS) { resolve(null); return; }
      if (reg.designer && typeof nomesCorrespondem === "function"
          && !nomesCorrespondem(reg.designer, DESIGNER_LOGADO)) {
        resolve(null);
        return;
      }
      resolve(reg);
    };
    pedido.onerror = () => resolve(null);
  });
}

/**
 * Guarda (ou atualiza) pedaços do detalhe de uma tarefa. Junta com o que
 * já estava lá em vez de substituir: `abrir` e `briefing` chegam em
 * momentos diferentes, e salvar um não pode apagar o outro.
 */
async function guardarDetalheNoCache(taskId, campos) {
  if (!taskId || !campos) return;
  const db = await abrirBancoDoCacheDeTarefas();
  if (!db) return;

  // ⚠️ O ler-junta-grava acontece DENTRO DE UMA TRANSAÇÃO SÓ, e isso é
  // essencial, não firula: ao abrir um card, três gravações partem quase
  // ao mesmo tempo (o conteúdo do card, o resumo da Bee e o briefing).
  // Lendo fora da transação, as três liam o registro vazio e a última a
  // gravar apagava as outras duas — testado, e sobrava só um dos três
  // campos. Duas transações "readwrite" na mesma loja o navegador põe em
  // fila, então aqui cada uma enxerga o que a anterior gravou.
  return new Promise(resolve => {
    let loja;
    try {
      loja = db.transaction(CACHE_TAREFAS_LOJA, "readwrite").objectStore(CACHE_TAREFAS_LOJA);
    } catch (err) {
      resolve();
      return;
    }
    const busca = loja.get(String(taskId));
    busca.onsuccess = () => {
      const anterior = busca.result || {};
      // Registro de outra pessoa (computador compartilhado) não se junta
      // com o desta: começa do zero, senão o dado de um vazaria pro outro.
      const mesmaPessoa = !anterior.designer
        || typeof nomesCorrespondem !== "function"
        || nomesCorrespondem(anterior.designer, DESIGNER_LOGADO);
      const base = mesmaPessoa ? anterior : {};
      const registro = Object.assign({}, base, campos, {
        id: String(taskId),
        quando: Date.now(),
        designer: typeof DESIGNER_LOGADO !== "undefined" ? DESIGNER_LOGADO : null,
      });
      try {
        loja.put(registro);
      } catch (err) {
        // Cota estourada: não é problema — a resposta de verdade já está
        // na tela, só não vai estar guardada pra próxima.
      }
      resolve();
    };
    busca.onerror = () => resolve();
  });
}

/**
 * Joga fora o que venceu. Roda uma vez por sessão, sem pressa e sem
 * segurar ninguém — só pra o banco não crescer pra sempre.
 */
async function limparDetalhesVelhosDoCache() {
  const db = await abrirBancoDoCacheDeTarefas();
  if (!db) return;
  try {
    const loja = db.transaction(CACHE_TAREFAS_LOJA, "readwrite").objectStore(CACHE_TAREFAS_LOJA);
    const cursor = loja.openCursor();
    cursor.onsuccess = ev => {
      const c = ev.target.result;
      if (!c) return;
      const reg = c.value;
      if (!reg || !reg.quando || (Date.now() - reg.quando) > CACHE_TAREFAS_VALIDADE_MS) {
        try { c.delete(); } catch (e) { /* segue */ }
      }
      c.continue();
    };
  } catch (err) { /* sem limpeza desta vez, sem problema */ }
}

// ===== Pré-carregamento das tarefas do dia =====
//
// O Cláudio pediu exatamente este recorte (2026-08-13): "só carregaria das
// tarefas atrasadas e marcada com a data de hoje, peças futuras continua
// esperando para carregar". Faz sentido — pré-carregar o mês inteiro
// encheria a fila do Apps Script justamente pra piorar o problema que a
// gente está tentando resolver.

const PRECARGA_PAUSA_MS = 1500;   // respiro entre uma tarefa e outra
const PRECARGA_MAX_TAREFAS = 40;  // teto de segurança pra fila nunca virar enxurrada

let precargaRodando = false;

/**
 * Enfileira o detalhe das tarefas de hoje e das atrasadas e busca UMA POR
 * VEZ, com pausa entre elas.
 *
 * Por que uma por vez e devagar: o gargalo é a fila de execução do Apps
 * Script, que é compartilhada por todo mundo. Disparar 30 pedidos de uma
 * vez deixaria ESTE navegador rápido e o de todos os colegas lento — o
 * oposto do objetivo. Aqui a gente usa a fila só quando ela está sobrando.
 */
async function precarregarDetalhesDoDia() {
  if (precargaRodando) return;
  if (typeof DESIGNER_LOGADO === "undefined" || !DESIGNER_LOGADO) return;
  if (typeof tasks === "undefined" || !Array.isArray(tasks)) return;

  const db = await abrirBancoDoCacheDeTarefas();
  if (!db) return; // sem cache local, pré-carregar não serviria pra nada

  const hoje = hojeISO();
  const daVez = tasks
    .filter(t => t.id && t.dueISO && t.dueISO <= hoje && !t.entregue)
    .slice(0, PRECARGA_MAX_TAREFAS);
  if (!daVez.length) return;

  precargaRodando = true;
  try {
    for (const t of daVez) {
      // Parou de valer a pena no meio do caminho? (pessoa saiu, ou a aba
      // foi escondida — nesse caso ela não vai clicar em nada mesmo, e a
      // fila é melhor ficar livre pros colegas que estão trabalhando).
      if (!DESIGNER_LOGADO) break;
      if (document.hidden) break;

      await buscarEGuardarDetalhe(t, PRECARGA_PAUSA_MS);
    }
  } finally {
    precargaRodando = false;
  }
}

/**
 * Busca o que falta de UMA tarefa e guarda. Usada pela fila da manhã e
 * pelo passar-o-mouse — as duas precisam exatamente disso, e ter dois
 * lugares fazendo o mesmo seria pedir pra elas divergirem com o tempo.
 *
 * @param {number} pausaMs respiro DEPOIS de cada pedido. A fila usa uma
 *   pausa longa (ela tem o dia todo); o hover manda 0, porque ali a
 *   pessoa está prestes a clicar.
 */
async function buscarEGuardarDetalhe(t, pausaMs) {
  if (!t || !t.id) return;
  const guardado = await lerDetalheDoCache(t.id);
  const faltaAbrir = !guardado || !guardado.abrir;
  const faltaBee = !guardado || !guardado.beeResumo;
  // O briefing (o painel "organizado pela IA") tinha ficado de fora daqui
  // (2026-08-13) — por isso ele SEMPRE aparecia "Carregando briefing..."
  // mesmo em tarefa já pré-carregada: o card e o resumo da Bee vinham do
  // cache, mas o briefing sempre ia buscar na hora, ao vivo, e essa é a
  // chamada mais lenta e mais sujeita a "High demand" (ver
  // gemini_fetchComRetentativas, IA.gs).
  const faltaBriefing = !guardado || !guardado.briefingHTML;
  if (!faltaAbrir && !faltaBee && !faltaBriefing) return; // já temos tudo

  if (faltaAbrir) {
    try {
      const data = await chamarBackend({ acao: "abrirTarefa", taskId: t.id });
      if (data && data.ok) await guardarDetalheNoCache(t.id, { abrir: data });
    } catch (err) {
      // Uma tarefa que não veio não estraga a fila — segue pra próxima.
    }
    if (pausaMs) await new Promise(r => setTimeout(r, pausaMs));
  }

  // O resumo da Bee é o mais caro de todos (é uma chamada de IA) e o
  // mais frustrante de esperar, porque é a primeira coisa que o
  // designer lê pra entender o que a tarefa pede. Ele só vivia na
  // memória da aba, então sumia a cada F5 — agora fica guardado.
  if (faltaBee) {
    try {
      const original = typeof acharTarefaOriginalDaAlteracao === "function"
        ? acharTarefaOriginalDaAlteracao(t)
        : null;
      const r = await chamarBackend({
        acao: "beeResumo",
        taskId: t.id,
        idOriginal: original ? original.id : null,
      });
      // Só guarda resposta boa: "deu erro" e "sem material" têm que ser
      // tentados de novo quando a pessoa abrir de verdade.
      if (r && r.ok && !r.semMaterial && r.resumo) {
        await guardarDetalheNoCache(t.id, { beeResumo: r.resumo });
      }
    } catch (err) { /* segue pra próxima */ }
    if (pausaMs) await new Promise(r => setTimeout(r, pausaMs));
  }

  // O briefing (o painel "organizado pela IA") é a chamada mais lenta de
  // todas — pensa em cima da descrição — e a que mais sofre com o
  // Gemini sobrecarregado (ver "High demand" em IA.gs). `montarBriefingDaTarefaHTML`
  // (js/regras-briefing.js) é a MESMA função que a abertura ao vivo usa,
  // então o que fica guardado aqui é byte a byte o que a pessoa veria se
  // esperasse a resposta na hora.
  if (faltaBriefing) {
    try {
      const r = await chamarBackend({ acao: "gerarBriefing", taskId: t.id });
      // Só guarda o CAMINHO DE SUCESSO (briefing montado de verdade).
      // Erro e "sem descrição" ficam de fora de propósito: um soluço na
      // pré-carga não pode virar "essa tarefa não tem descrição" pra
      // sempre — tem que tentar de novo quando a pessoa abrir de fato.
      if (r && r.ok && !r.semDescricao && r.briefing && typeof montarBriefingDaTarefaHTML === "function") {
        await guardarDetalheNoCache(t.id, { briefingHTML: montarBriefingDaTarefaHTML(r) });
      }
    } catch (err) { /* segue pra próxima */ }
    if (pausaMs) await new Promise(r => setTimeout(r, pausaMs));
  }
}

// ===== Passar o mouse já prepara a tarefa =====
//
// O sinal mais forte que existe de "vou abrir esta": a pessoa parou o
// mouse em cima do card. A fila da manhã cobre hoje/atrasadas; isto cobre
// o resto — tarefa futura, tarefa que acabou de chegar, tarefa que a fila
// ainda não alcançou.
//
// Três cuidados pra isto não virar o problema que veio resolver:
// - ESPERA a pessoa parar (ver PAUSA). Passar o mouse atravessando o
//   quadro cruza dezenas de cards em um segundo; sem isso, cada um viraria
//   um pedido, e a fila do Apps Script entupia na hora.
// - UMA POR VEZ. Se já tem uma preparação em voo, a próxima espera.
// - Nada com a aba escondida, nada sem alguém logado.

const HOVER_PAUSA_MS = 180;   // quanto o mouse precisa ficar parado
let _hoverTimer = null;
let _hoverEmVoo = false;

/**
 * Chamado no mouseenter de cada card do quadro. Não faz nada na hora —
 * só marca a intenção; quem decide é o relógio de HOVER_PAUSA_MS.
 */
function prepararTarefaAoPassarOMouse(taskId) {
  if (!taskId) return;
  clearTimeout(_hoverTimer);
  _hoverTimer = setTimeout(async () => {
    if (_hoverEmVoo) return;
    if (typeof podeBaterNoBackendAgora === "function" && !podeBaterNoBackendAgora()) return;
    const t = (typeof tasks !== "undefined" && Array.isArray(tasks))
      ? tasks.find(x => String(x.id) === String(taskId))
      : null;
    if (!t) return;
    _hoverEmVoo = true;
    try {
      // pausaMs 0: aqui a pessoa está a um clique de distância, não faz
      // sentido dar respiro entre um pedido e outro.
      await buscarEGuardarDetalhe(t, 0);
    } finally {
      _hoverEmVoo = false;
    }
  }, HOVER_PAUSA_MS);
}

/** Saiu de cima antes de completar a pausa: desiste, não era intenção. */
function cancelarPreparoAoSairDoCard() {
  clearTimeout(_hoverTimer);
}

// A fila para quando a aba fica escondida (pra não roubar lugar na fila do
// Apps Script de quem está trabalhando de verdade). Sem isto aqui, ela
// parava e NUNCA MAIS voltava: quem abrisse o Colmeia e fosse fazer outra
// coisa nos 10 segundos seguintes ficava sem pré-carga o dia inteiro,
// justamente o caso mais comum de manhã. Ao voltar pra aba, retoma de onde
// parou (as que já foram pro cache são puladas na hora).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (typeof DESIGNER_LOGADO === "undefined" || !DESIGNER_LOGADO) return;
  precarregarDetalhesDoDia();
});
