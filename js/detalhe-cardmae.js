// Fluxo do CARD MÃE dentro do pop-up de tarefa: buscar o card mãe de uma
// subtarefa, pré-carregar tudo dele em segundo plano, a aba "Descrição card
// mãe", e o "carrossel" do pill preto/amarelo do cabeçalho (entregue ->
// transferir o card mãe -> editar a regra dele ali mesmo).
//
// Faz parte do antigo js/detalhe-modal.js, que passou de 2.000 linhas e foi
// dividido em três. Carregado DEPOIS do detalhe-modal.js — ver a ordem das
// tags <script> no index.html, que é obrigatória (regra de ouro do
// CLAUDE.md).

/**
 * Mostra a descrição do CARD MÃE dentro da própria aba de descrição da
 * subtarefa (aba "Descrição card mãe") — pedido do Cláudio: quando
 * chega uma subtarefa com nome genérico (ex: "Alteração 01"), não dá
 * pra saber do que se trata só pelo título; como o card mãe já é
 * pré-carregado em segundo plano assim que a subtarefa abre (ver
 * precarregarCardMaeEmBackground/cardMaeCache), só falta buscar a
 * descrição dele (endpoint separado no Runrun.it, não vem junto) e
 * mostrar o NOME do card mãe junto, bem em cima, pra dar contexto na
 * hora — sem precisar sair da subtarefa pra ir ver o card mãe.
 */
async function carregarDescricaoCardMae(task) {
  const tituloEl = document.getElementById("descMaeTitulo");
  const textoEl = document.getElementById("descMaeTextReal");
  if (!textoEl) return;
  const taskId = task.id;

  let resultado = cardMaeCache.get(taskId);
  if (!resultado) {
    if (tituloEl) tituloEl.textContent = "Carregando...";
    textoEl.innerHTML = "Carregando...";
    resultado = await buscarCardMaeDoBackend(taskId);
    if (resultado.ok && resultado.temPai) { cardMaeCache.set(taskId, resultado); podarCacheMap(cardMaeCache, MAX_ITENS_CACHE_CARDMAE); }
  }
  // A pessoa pode ter trocado de tarefa (ou voltado pra aba Descrição)
  // enquanto isso carregava — compara por id, nunca por referência.
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId) || !descMaeAberta) return;

  if (!resultado.ok || !resultado.temPai) {
    if (tituloEl) tituloEl.textContent = "";
    textoEl.innerHTML = "Essa tarefa não tem card mãe.";
    return;
  }

  if (tituloEl) tituloEl.textContent = resultado.cardMae.title;

  if (resultado.cardMae.descricao === undefined || resultado.cardMae.descricao === null) {
    const descricao = await buscarDescricaoDoBackend(resultado.cardMae.id);
    if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId) || !descMaeAberta) return;
    if (descricao === null) {
      // Não chegou (ver buscarDescricaoDoBackend). Não guarda como "" —
      // senão o card mãe ficaria dizendo "sem descrição" pra sempre, mesmo
      // depois da internet voltar, porque nunca mais tentaria de novo.
      textoEl.innerHTML = "Não consegui carregar a descrição do card mãe agora.";
      return;
    }
    resultado.cardMae.descricao = descricao;
  }
  textoEl.innerHTML = resultado.cardMae.descricao
    ? formatarDescricaoRunrun(resultado.cardMae.descricao)
    : "Sem descrição cadastrada no card mãe.";
  carregarImagensDaDescricao(textoEl);
}

// taskId da subtarefa -> resultado de buscarCardMaeDoBackend (já com
// temPai/cardMae/subtarefas prontos). Guardado num Map à parte (não no
// objeto da tarefa) pra sobreviver mesmo se atualizarKanbanEmBackground
// trocar os objetos de tasks[] por outros novos enquanto isso.
const cardMaeCache = new Map();

/**
 * Busca o card mãe (e já deixa os comentários dele cacheados também,
 * ver a fonte única em js/chat-comentarios.js) assim que uma subtarefa
 * termina de abrir — sem esperar a pessoa clicar na seta pra cima.
 * Assim, quando ela clicar de verdade, abrirCardMae já acha tudo pronto
 * (abre na hora, sem esperar o Runrun.it responder de novo) e a aba
 * "Comentários card mãe" do chat também já nasce carregada.
 */
// Buscas de card mãe EM VOO agora — id -> a mesma Promise.
//
// Sem isto, duas partes do app pedindo o card mãe ao mesmo tempo (o
// openDetail e o renderDevolucaoNoCard, nas alterações) disparavam DUAS
// buscas idênticas: a trava `cardMaeCache.has(...)` não segura nada
// porque nenhuma das duas terminou ainda quando a outra começa. Guardando
// a Promise, a segunda chamada espera a primeira em vez de abrir outra —
// é o mesmo remédio já usado em `filhosEmVoo`, logo abaixo.
const cardMaeEmVoo = new Map();

function precarregarCardMaeEmBackground(taskId) {
  if (cardMaeCache.has(taskId)) return Promise.resolve();
  const chave = String(taskId);
  if (cardMaeEmVoo.has(chave)) return cardMaeEmVoo.get(chave);
  const promessa = _precarregarCardMaeDeVerdade(taskId).finally(() => cardMaeEmVoo.delete(chave));
  cardMaeEmVoo.set(chave, promessa);
  return promessa;
}

async function _precarregarCardMaeDeVerdade(taskId) {
  if (cardMaeCache.has(taskId)) return;

  // UMA ida traz o card mãe, os comentários, a sequência e a descrição
  // (ver abrirCardMaeCompleto, RunrunLeitura.gs). Antes eram QUATRO, uma
  // esperando a outra — e as três últimas nem dependiam uma da outra.
  // Cada ida ocupa um lugar na fila única do Apps Script, então isso
  // valia quatro lugares em sequência (ver "Por que o card demora a
  // abrir" no CLAUDE.md).
  const tudo = await chamarBackend({ acao: "abrirCardMaeCompleto", taskId });
  if (tudo && tudo.ok) {
    if (!tudo.temPai) return;
    cardMaeCache.set(taskId, { ok: true, temPai: true, cardMae: tudo.cardMae, subtarefas: tudo.subtarefas || [] });
    podarCacheMap(cardMaeCache, MAX_ITENS_CACHE_CARDMAE);
    // Os comentários do card mãe vão pra FONTE ÚNICA, sob o id DELE (ver
    // o bloco "A FONTE ÚNICA" em js/chat-comentarios.js) — não num cache
    // separado indexado pela subtarefa, como já foi. Assim a aba "Card
    // mãe" e a lista unificada leem exatamente o mesmo dado.
    if (Array.isArray(tudo.comentarios) && typeof guardarFonteDeComentarios === "function") {
      guardarFonteDeComentarios(tudo.cardMae.id, tudo.comentarios);
    }
    return;
  }

  // Reserva: backend publicado ainda não conhece a ação nova (ou ela deu
  // erro). Faz do jeito antigo, em quatro idas — mesmo padrão que
  // carregarTudoDaTarefa usa pra "abrirTarefa".
  await precarregarCardMaeEmQuatroIdas(taskId);
}

/** O caminho antigo, mantido como reserva. Ver o comentário acima. */
async function precarregarCardMaeEmQuatroIdas(taskId) {
  const resultado = await buscarCardMaeDoBackend(taskId);
  if (!resultado.ok || !resultado.temPai) return;
  cardMaeCache.set(taskId, resultado);
  podarCacheMap(cardMaeCache, MAX_ITENS_CACHE_CARDMAE);
  if (comentariosDaFonte(resultado.cardMae.id) === null) {
    const comentarios = await buscarComentariosDoBackend(resultado.cardMae.id);
    // Só registra se a resposta CHEGOU (`null` = não chegou, ver
    // buscarComentariosDoBackend). Registrar uma lista vazia aqui deixaria
    // a aba "Comentários card mãe" vazia até trocar de tarefa, mesmo com a
    // internet já de volta — este é um pré-carregamento silencioso, então
    // é melhor não ter nada do que ter dado errado.
    if (comentarios !== null) guardarFonteDeComentarios(resultado.cardMae.id, comentarios);
  }
  // Já aproveita e busca a Sequência de responsáveis do card mãe
  // também, em segundo plano — assim, se a pessoa concluir a subtarefa
  // e quiser transferir o card mãe na hora (ver verificarTransferirCardMae
  // logo abaixo), tanto saber se ele "está com ela" quanto o modal
  // "Ver regra" que abre em seguida já ficam prontos na hora, sem mais
  // nenhuma ida ao Runrun.it esperando.
  const seqResultado = await buscarSequenciaDoBackend(resultado.cardMae.id);
  resultado.cardMae.sequencia = seqResultado.sequencia;
  resultado.cardMae.workflowId = seqResultado.workflowId;
  // Idem pra descrição do card mãe (aba "Descrição card mãe") — sem
  // isso, ela só era buscada na hora de clicar na aba, deixando a
  // troca lenta mesmo com o card mãe todo já pré-carregado. É a
  // descrição ORIGINAL crua, direto do Runrun.it — essa aba nunca usa
  // IA (isso é só o briefing da própria subtarefa). Se não chegar, deixa
  // `undefined` mesmo (não guarda o `null`): assim a aba tenta buscar de
  // novo quando for aberta, em vez de exibir "sem descrição" pra sempre.
  const descricaoMae = await buscarDescricaoDoBackend(resultado.cardMae.id);
  if (descricaoMae !== null) resultado.cardMae.descricao = descricaoMae;
}

async function abrirCardMae(task) {
  if (!task.id) {
    console.warn("Essa tarefa não está conectada ao Runrun.it, não tem card mãe pra abrir.");
    return;
  }

  const panel = document.getElementById("taskDetail");
  const inner = panel.querySelector(".detail-inner");
  if (inner) inner.classList.add("panel-exit-up");
  await esperar(200);

  // Se já foi pré-carregado (ver precarregarCardMaeEmBackground, chamado
  // assim que essa subtarefa abriu), usa direto — sem tela de
  // "Buscando..." nem espera nenhuma do Runrun.it.
  let resultado = cardMaeCache.get(task.id);
  if (!resultado) {
    mostrarCardEmBranco("Buscando o card mãe...");
    resultado = await buscarCardMaeDoBackend(task.id);
    if (resultado.ok && resultado.temPai) { cardMaeCache.set(task.id, resultado); podarCacheMap(cardMaeCache, MAX_ITENS_CACHE_CARDMAE); }
  }

  if (!resultado.ok) {
    mostrarCardEmBranco(resultado.error || "Não consegui buscar o card mãe.");
    return;
  }
  if (!resultado.temPai) {
    mostrarCardEmBranco("Essa tarefa não tem card mãe.");
    return;
  }

  let idx = tasks.findIndex(t => t.id === resultado.cardMae.id);
  if (idx === -1) {
    const novaMae = mapearTarefaDoBackend(resultado.cardMae);
    tasks.push(novaMae);
    idx = tasks.length - 1;
  }
  tasks[idx].isMotherCard = true;
  tasks[idx].subtarefasResumo = resultado.subtarefas || [];

  openDetail(idx, "panel-enter-below");
}

/**
 * Chamada depois de concluir uma subtarefa: se o card mãe dela estiver
 * com VOCÊ agora (você é o responsável atual), pergunta — dentro do
 * próprio pill da tarefa (ver mostrarFluxoCardMaeNoPill logo abaixo) —
 * se quer transferir ele pro próximo já, sem precisar sair da
 * subtarefa pra ir procurar o card mãe. Como o card mãe (e a sequência
 * dele) já foram pré-carregados assim que a subtarefa abriu (ver
 * precarregarCardMaeEmBackground), isso normalmente já bate direto no
 * cache — sem esperar o Runrun.it responder de novo.
 */
async function verificarTransferirCardMae(task) {
  const resultado = cardMaeCache.get(task.id) || await buscarCardMaeDoBackend(task.id);
  // Por ID quando dá (o card mãe vem do backend com assigneeId), não por
  // nome parecido — ver ehMinhaTarefa em js/paginas-designers.js.
  const devePerguntar = resultado.ok && resultado.temPai && resultado.cardMae
    && ehMinhaTarefa(resultado.cardMae);
  // Dá um tempinho pro "Entregue ✓" (já mostrado antes de chamar essa
  // função) ser lido antes de trocar de figura — some direto se não tem
  // nada a perguntar, ou passa pra pergunta de transferir se tem.
  clearTimeout(_cardMaeFluxoTimeout);
  // O "Entregue ✓" já ficou visível durante toda a ida e volta ao
  // Runrun.it que aconteceu ANTES desta função ser chamada (ver
  // enviarComentarioNoBackend/avancarWorkflowNoBackend no chamador) —
  // isso já dá tempo de sobra pra ler. Por isso a pausa aqui é curta
  // (mesma duração usada no resto do app pra dar um respiro entre
  // trocas de tela, ver `esperar(450)`), só pra não ficar abrupto.
  _cardMaeFluxoTimeout = setTimeout(() => {
    // Confere de novo aqui dentro (não só lá fora, antes do delay) — a
    // pessoa pode ter trocado de tarefa nesse meio-tempo.
    const aindaNaMesmaTarefa = tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id);
    if (devePerguntar && aindaNaMesmaTarefa) mostrarPerguntaTransferirNoPill(resultado.cardMae, task.id);
    else esconderFluxoCardMaeNoPill();
  }, 350);
}

/**
 * "Carrossel" do fluxo entregar → transferir card mãe → regra, tudo
 * dentro do próprio pill preto/amarelo do cabeçalho da tarefa (não um
 * pop-up separado) — protótipo 2 aprovado pelo Cláudio em 2026-07-28
 * (ver memória "barra_amarela_dynamic_island"). As duas faces do pill
 * (.pill-face-normal e #pillCardMaeFace) ficam empilhadas uma sobre a
 * outra; a classe .card-mae-ativo desliza as duas ao mesmo tempo — a
 * normal sobe e sai, a do card mãe sobe e aparece. Tirar a classe faz
 * o caminho contrário (desce), sem precisar de nenhuma animação extra.
 */
let _cardMaeFluxoTimeout = null;

// Ajusta a altura do pill pro tamanho real do conteúdo da face do card
// mãe — CALCULADO, não chutado (dois chutes fixos, 46px e depois 56px,
// ainda cortavam em produção: fonte/renderização real deixa o conteúdo
// mais alto do que no teste). O filho direto de #pillCardMaeFace
// (.pill-cardmae-conteudo/.pill-cardmae-regra) não é esticado
// (align-items:center no pai), então o offsetHeight dele já reflete o
// espaço que o conteúdo precisa de verdade, mesmo com o pill ainda
// "trancado" na altura antiga (position:absolute não impede medir o
// filho, só limita o que fica visível). Chamar sempre que o innerHTML
// da face mudar.
function ajustarAlturaCardMaeNoPill() {
  const pill = document.getElementById("detailHeaderPill");
  const face = document.getElementById("pillCardMaeFace");
  const conteudo = face && face.firstElementChild;
  if (!pill || !conteudo) return;
  const PADDING_VERTICAL_PILL = 16; // 8px em cima + 8px embaixo (.detail-header-pill)
  const FOLGA = 4; // margininha de segurança (arredondamento de sub-pixel)
  pill.style.height = Math.max(46, conteudo.offsetHeight + PADDING_VERTICAL_PILL + FOLGA) + "px";
}

function mostrarEntregueNoPill() {
  const pill = document.getElementById("detailHeaderPill");
  const face = document.getElementById("pillCardMaeFace");
  if (!pill || !face) return;
  face.hidden = false;
  face.innerHTML = `
    <span class="pill-cardmae-conteudo centralizado pill-cardmae-pop">
      <span class="pill-cardmae-icone entregue"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="pill-cardmae-texto">Entregue ✓</span>
    </span>
  `;
  // Fica verde já nessa animação de subida (não só depois, quando o
  // pop-up reconstrói do zero) — pedido do Cláudio pra virar verde
  // "junto" com o resto da informação subindo, não só depois de pronto.
  // Não sai mais sozinho (ver esconderFluxoCardMaeNoPill), então o pill
  // continua verde mesmo depois do carrossel voltar pro modo normal.
  pill.classList.add("card-mae-modo", "card-mae-ativo", "entregue-modo");
  ajustarAlturaCardMaeNoPill();
}

// Volta o pill pro normal (desliza pra baixo) — some sozinho depois de
// entregar uma tarefa que não tem card mãe pra perguntar sobre.
function esconderFluxoCardMaeNoPill() {
  clearTimeout(_cardMaeFluxoTimeout);
  const pill = document.getElementById("detailHeaderPill");
  if (!pill) return;
  pill.classList.remove("card-mae-ativo");
  setTimeout(() => {
    const face = document.getElementById("pillCardMaeFace");
    // Só esconde de vez (e só tira o pill do "modo carrossel", voltando
    // a crescer livre pro tamanho natural do conteúdo normal) se
    // ninguém reativou o carrossel nesse meio-tempo.
    if (face && !pill.classList.contains("card-mae-ativo")) {
      face.hidden = true;
      face.innerHTML = "";
      pill.classList.remove("card-mae-modo");
      pill.style.height = ""; // volta a crescer livre (era calculado na hora, via ajustarAlturaCardMaeNoPill)
    }
  }, 340);
}

function mostrarPerguntaTransferirNoPill(cardMaeRaw, taskAtualId) {
  const pill = document.getElementById("detailHeaderPill");
  const face = document.getElementById("pillCardMaeFace");
  if (!pill || !face) return;
  face.hidden = false;
  face.innerHTML = `
    <span class="pill-cardmae-conteudo centralizado pill-cardmae-pop">
      <span class="pill-cardmae-icone bee-modo" title="Sugestão da Bee">${beeIcon}</span>
      <span class="pill-cardmae-texto">Transferir o card mãe também?</span>
      <span class="pill-cardmae-acoes">
        <button type="button" id="pillCardMaeNao">Não</button>
        <button type="button" class="principal" id="pillCardMaeSim">Sim</button>
      </span>
    </span>
  `;
  pill.classList.add("card-mae-modo", "card-mae-ativo");
  ajustarAlturaCardMaeNoPill();
  document.getElementById("pillCardMaeNao").addEventListener("click", esconderFluxoCardMaeNoPill);
  document.getElementById("pillCardMaeSim").addEventListener("click", () => mostrarRegraCardMaeNoPill(cardMaeRaw, taskAtualId));
}

// Etapa final: a própria regra (sequência) do card mãe, editável ali
// dentro do pill — 3 zonas: etapa (status) na esquerda, nome + regra
// centralizados no meio, fechar na direita. A regra reaproveita
// renderSequenciaHTML/as mesmas flechinhas (voltar/avançar/adicionar/
// entregar) já usadas no pill normal — mesmo padrão visual do resto do
// app, só redesenhando #pillCardMaeSeq em vez de #workflowSeqGroup
// depois de cada ação (é outra tarefa, o card mãe, não a que está
// aberta). Otimista: mexe na tela na hora, confirma de verdade com o
// Runrun.it em segundo plano.
function mostrarRegraCardMaeNoPill(cardMaeRaw, taskAtualId) {
  const pill = document.getElementById("detailHeaderPill");
  const face = document.getElementById("pillCardMaeFace");
  if (!pill || !face) return;
  const cardMaeTask = mapearTarefaDoBackend(cardMaeRaw);
  cardMaeTask.sequencia = cardMaeRaw.sequencia || [];
  cardMaeTask.workflowId = cardMaeRaw.workflowId || null;
  // Guarda a etapa/estado ORIGINAL em que o card mãe estava quando foi
  // buscado (normalmente "Cards Mães", de verdade no Runrun.it) — ela
  // não é uma das 5 colunas fixas do quadro (sem chave em
  // COLUNA_STAGE_IDS no backend), então sem guardar isso não teria como
  // oferecer "voltar pra Cards Mães" no menu de etapa depois que a
  // pessoa transfere/muda pra outra (ex: Revisão). moverEtapaArbitrariaNoBackend
  // usa esse taskStateId direto, sem precisar de uma coluna fixa.
  cardMaeTask.etapaOriginalLabel = cardMaeTask.runrunStage;
  cardMaeTask.etapaOriginalStateId = cardMaeTask.taskStateId;

  face.hidden = false;
  pill.classList.add("card-mae-modo", "card-mae-ativo");
  rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId, true);
}

// Pra onde o card mãe costuma ir quando sai de "Cards Mães". Fica
// guardado no navegador (preferência por designer, mesmo padrão do resto
// do app) — quem sempre manda pra outra etapa não precisa escolher de
// novo toda vez. O padrão continua sendo a Revisão.
const DESTINO_CARDMAE_CHAVE = "colmeia_destino_cardmae_v1";

function destinoDoCardMae() {
  let salvo = null;
  try { salvo = localStorage.getItem(DESTINO_CARDMAE_CHAVE); } catch (err) { /* navegador sem localStorage */ }
  return columnsDef.find(c => c.key === salvo)
    || columnsDef.find(c => c.key === ETAPA_SUGERIDA_SAINDO_DE_FORA)
    || columnsDef[0];
}

function guardarDestinoDoCardMae(chave) {
  try { localStorage.setItem(DESTINO_CARDMAE_CHAVE, chave); } catch (err) { /* segue sem guardar */ }
}

/**
 * A etapa dentro do pill do card mãe. Enquanto ele está numa etapa FORA
 * das 5 colunas do quadro (o caso normal: "Cards Mães"), mostra o
 * caminho inteiro montado e fixo — "Cards Mães → Revisão" — em vez de
 * esconder isso dentro de um menu. As três partes fazem coisas
 * diferentes: a etapa da esquerda troca a etapa de agora, a setinha do
 * meio TRANSFERE e a etapa da direita escolhe pra onde vai.
 *
 * Depois de transferido, o card mãe passa a estar dentro do quadro e não
 * tem mais pra onde transferir — aí vira o crachá de etapa normal.
 */
function renderEtapaDoCardMaeHTML(cardMaeTask) {
  if (cardMaeTask.status) {
    return `
      <div class="status-wrap">
        <button type="button" class="status-badge" id="pillCardMaeStatusBadge">${escaparHTML(rotuloDaEtapa(cardMaeTask))}</button>
      </div>
    `;
  }
  const destino = destinoDoCardMae();
  return `
    <div class="etapa-transfer" id="pillCardMaeTransfer">
      <button type="button" class="etapa-chip de" id="pillCardMaeEtapaDe" title="Trocar a etapa de agora">${escaparHTML(cardMaeTask.runrunStage || "Sem etapa")}</button>
      <button type="button" class="etapa-transfer-seta" id="pillCardMaeTransferir" title="Transferir para ${escaparHTML(destino.label)}" aria-label="Transferir para ${escaparHTML(destino.label)}">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 12h13m0 0l-5-5m5 5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="etapa-chip para" id="pillCardMaeEtapaPara" title="Escolher pra onde o card mãe vai">
        <span class="etapa-chip-texto">${escaparHTML(destino.label)}</span>
        <svg class="etapa-chip-check" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
}

// `pop`: só true quando essa tela está aparecendo pela primeira vez
// (troca de tela de verdade, ex: pergunta -> regra) — nas atualizações
// em cima da MESMA tela (trocar etapa, transferir, avançar/desfazer a
// sequência) fica false, pra não tocar a animação de entrada de novo em
// cima de conteúdo que já estava visível (ver .pill-cardmae-pop no
// css/03-detalhe.css).
function renderFacePillRegraCardMae(cardMaeTask, pop) {
  return `
    <span class="pill-cardmae-conteudo pill-cardmae-regra${pop ? " pill-cardmae-pop" : ""}">
      ${renderEtapaDoCardMaeHTML(cardMaeTask)}
      <span class="pill-cardmae-regra-centro">
        <span class="pill-cardmae-nome">${escaparHTML(cardMaeTask.title)}</span>
        <div class="nav-dots-group" id="pillCardMaeSeq">
          ${renderSequenciaHTML(cardMaeTask)}
        </div>
      </span>
      <button type="button" class="pill-cardmae-fechar" id="pillCardMaeFechar" title="Voltar (sem alterar a regra)">
        <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
    </span>
  `;
}

// Só redesenha a partir do que já está em memória em cardMaeTask (sem
// ida ao Runrun.it) — usado depois de uma mudança otimista (ex: trocar
// a etapa) que não afeta a sequência.
function rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId, pop = false) {
  const face = document.getElementById("pillCardMaeFace");
  if (!face) return;
  face.innerHTML = renderFacePillRegraCardMae(cardMaeTask, pop);
  wireFacePillRegraCardMae(cardMaeTask, taskAtualId);
  ajustarAlturaCardMaeNoPill();
}

// Busca a sequência real do card mãe de novo e redesenha — usado depois
// de qualquer ação que mexe nela (avançar, desfazer, adicionar, remover
// pessoa), pra sincronizar com o estado de verdade no Runrun.it.
async function recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId) {
  const resultado = await buscarSequenciaDoBackend(cardMaeTask.id);
  cardMaeTask.sequencia = resultado.sequencia || [];
  cardMaeTask.workflowId = resultado.workflowId || cardMaeTask.workflowId;
  // Já saiu dessa etapa (voltou, fechou a tarefa) enquanto isso rodava?
  if (!document.getElementById("pillCardMaeSeq")) return;
  rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId);
}

/**
 * Menu de "pra onde vai" — só escolhe o destino guardado no navegador,
 * sem mexer em nada no Runrun.it. É de propósito parecido com o menu de
 * etapa (mesma classe .status-menu), pra não inventar um visual novo.
 */
function abrirMenuEscolherDestino(ancora, chaveAtual, aoEscolher) {
  document.querySelectorAll(".status-menu").forEach(el => el.remove());
  const menu = document.createElement("div");
  menu.className = "status-menu";
  menu.innerHTML = columnsDef
    .map(c => `<button type="button" data-status="${c.key}" class="${c.key === chaveAtual ? "active" : ""}">${c.label}</button>`)
    .join("");
  document.body.appendChild(menu);
  posicionarPopupFixo(menu, ancora);
  requestAnimationFrame(() => menu.classList.add("open"));

  function fechar() {
    menu.classList.remove("open");
    setTimeout(() => menu.remove(), 160);
    document.removeEventListener("click", clickFora);
  }
  function clickFora(ev) {
    if (!menu.contains(ev.target) && ev.target !== ancora) fechar();
  }
  setTimeout(() => document.addEventListener("click", clickFora), 0);

  menu.querySelectorAll("button").forEach(opt => {
    opt.addEventListener("click", ev => {
      ev.stopPropagation();
      fechar();
      aoEscolher(opt.dataset.status);
    });
  });
}

/**
 * A setinha do meio: transfere o card mãe pra etapa de destino.
 *
 * A animação conta a história em três tempos: (1) a setinha dispara pra
 * direita e some, (2) a etapa de agora encolhe até desaparecer e — como
 * as três partes estão lado a lado — a etapa de destino desliza sozinha
 * pro lugar dela, (3) ela dá um pulinho e fica verde com um ✓. O CSS
 * cuida do movimento; aqui só entram as classes na hora certa.
 *
 * Otimista, como o resto do app: a tela reage na hora e o Runrun.it
 * confirma em segundo plano. Se ele recusar, desfaz e avisa.
 */
async function transferirCardMaeParaDestino(cardMaeTask, taskAtualId) {
  const wrap = document.getElementById("pillCardMaeTransfer");
  if (!wrap || wrap.classList.contains("disparando")) return; // já está transferindo
  const destino = destinoDoCardMae();
  const statusAntigo = cardMaeTask.status;
  const etapaAntiga = cardMaeTask.runrunStage;
  const comecouEm = Date.now();

  wrap.classList.add("disparando");
  setTimeout(() => wrap.classList.add("transferindo"), 170);
  setTimeout(() => wrap.classList.add("chegou"), 520);

  cardMaeTask.status = destino.key;
  cardMaeTask.runrunStage = destino.label;

  const ok = await moverEtapaNoBackend(cardMaeTask.id, destino.key);
  if (!ok) {
    cardMaeTask.status = statusAntigo;
    cardMaeTask.runrunStage = etapaAntiga;
    rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId); // desfaz a animação junto
    mostrarToast("Não consegui transferir o card mãe agora.", "erro");
    return;
  }
  agendarAtualizacaoKanban();
  // De propósito NÃO redesenha a face depois de transferir: o resultado
  // da animação (o chip verde "Revisão ✓") é o próprio estado certo, e
  // redesenhar só trocaria ele pelo crachá comum, jogando fora o que
  // acabou de acontecer na frente da pessoa. O chip continua clicável e
  // passa a fazer o papel do crachá de etapa — ver o clique em
  // #pillCardMaeEtapaPara, em wireFacePillRegraCardMae.
}

/**
 * Troca a etapa do card mãe pelo chip verde que sobrou da transferência.
 * Enquanto a etapa nova for uma das 5 colunas, só troca o TEXTO do chip,
 * sem redesenhar a face — assim o verde e o ✓ continuam onde estão. Só
 * volta a redesenhar quando o card mãe sai do quadro (ex: voltou pra
 * "Cards Mães"), porque aí o transferidor precisa aparecer de novo.
 */
function aplicarTrocaDeEtapaNoChip(cardMaeTask, taskAtualId) {
  const texto = document.querySelector("#pillCardMaeEtapaPara .etapa-chip-texto");
  if (!cardMaeTask.status || !texto) {
    rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId);
    return;
  }
  texto.textContent = rotuloDaEtapa(cardMaeTask);
}

// IMPORTANTE: toda busca aqui dentro tem que ser RELATIVA a #pillCardMaeFace
// (nunca document.getElementById solto). A regra do card mãe reaproveita
// os MESMOS ids de navegação (navPrevArrow/navNextArrow/navAddPersonBtn/
// navDeliverBtn) que a sequência normal da tarefa aberta usa — se ela
// também tiver uma sequência de verdade (ou o botão de concluir, no caso
// "sem sequência"), esses ids ficam DUPLICADOS no DOM ao mesmo tempo (um
// dentro de #workflowSeqGroup, escondido atrás do carrossel, e outro
// dentro de #pillCardMaeSeq). document.getElementById sempre pega o
// PRIMEIRO (o da tarefa aberta, não o do card mãe) — foi isso que fazia
// clicar numa seta/botão do card mãe às vezes entregar ou mexer na
// tarefa aberta por engano, e o clique no X (voltar) esbarrar em outro
// listener preso sem querer no botão errado.
function wireFacePillRegraCardMae(cardMaeTask, taskAtualId) {
  const face = document.getElementById("pillCardMaeFace");
  if (!face) return;
  const fecharBtn = face.querySelector("#pillCardMaeFechar");
  if (fecharBtn) fecharBtn.addEventListener("click", esconderFluxoCardMaeNoPill);

  // --- "Cards Mães → Revisão": as três partes do transferidor ---
  const chipDe = face.querySelector("#pillCardMaeEtapaDe");
  if (chipDe) {
    chipDe.addEventListener("click", e => {
      e.stopPropagation();
      // Mesmo menu de sempre, só que ancorado na etapa da esquerda: serve
      // pra corrigir a etapa de AGORA (não pra transferir).
      abrirMenuEtapa(cardMaeTask, chipDe, () => rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId));
    });
  }

  const chipPara = face.querySelector("#pillCardMaeEtapaPara");
  if (chipPara) {
    chipPara.addEventListener("click", e => {
      e.stopPropagation();
      const wrap = face.querySelector("#pillCardMaeTransfer");
      if (wrap && wrap.classList.contains("chegou")) {
        // Já transferiu: esse mesmo chip verde agora é o crachá de etapa
        // do card mãe. Clicar TROCA a etapa — inclusive voltando pra
        // "Cards Mães", que não é uma das 5 colunas (por isso vai pelo
        // etapaOriginalStateId, igual ao crachá comum aqui embaixo).
        abrirMenuEtapa(
          cardMaeTask,
          chipPara,
          () => aplicarTrocaDeEtapaNoChip(cardMaeTask, taskAtualId),
          cardMaeTask.etapaOriginalStateId
            ? { label: cardMaeTask.etapaOriginalLabel || "Cards Mães", taskStateId: cardMaeTask.etapaOriginalStateId }
            : null
        );
        return;
      }
      // Ainda não transferiu: aqui o chip só ESCOLHE o destino — não mexe
      // em nada no Runrun.it. Quem transfere é a setinha do meio.
      abrirMenuEscolherDestino(chipPara, destinoDoCardMae().key, chave => {
        guardarDestinoDoCardMae(chave);
        rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId);
      });
    });
  }

  const setaTransferir = face.querySelector("#pillCardMaeTransferir");
  if (setaTransferir) {
    setaTransferir.addEventListener("click", e => {
      e.stopPropagation();
      transferirCardMaeParaDestino(cardMaeTask, taskAtualId);
    });
  }

  const statusBadge = face.querySelector("#pillCardMaeStatusBadge");
  if (statusBadge) {
    statusBadge.addEventListener("click", e => {
      e.stopPropagation();
      // Usa o menu FLUTUANTE (abrirMenuEtapa, que gruda no <body>), não um
      // menu dentro do pill. O pill em modo carrossel tem altura fixa com
      // corte E usa transformação pra deslizar as faces — e, com um
      // ancestral transformado, nem position:fixed escapa do corte. Era
      // isso que fazia o menu do card mãe abrir "dentro" do pill, cortado,
      // sem dar pra escolher a etapa (ex: mandar pra Revisão).
      // Como o card mãe fica em "Cards Mães" (fora das 5 colunas), o menu
      // já mostra em destaque o atalho de um clique pra Revisão.
      // Depois que o card mãe já está numa das 5 colunas (ex: Revisão),
      // esse crachá normal é a ÚNICA forma de mexer na etapa dele aqui —
      // por isso também oferece o caminho de volta pra "Cards Mães" (a
      // etapa original guardada em etapaOriginalStateId), senão não
      // tinha como desfazer.
      abrirMenuEtapa(cardMaeTask, statusBadge, () => {
        rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId);
      }, cardMaeTask.etapaOriginalStateId ? { label: cardMaeTask.etapaOriginalLabel || "Cards Mães", taskStateId: cardMaeTask.etapaOriginalStateId } : null);
    });
  }

  const prevBtn = face.querySelector("#navPrevArrow");
  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      // Mesma trava/mesmo conserto do pill da tarefa aberta (2026-08-13,
      // relatado pelo Cláudio nesse exato fluxo — "transferir o card mãe
      // ali dentro do pill"): a tela mudava só DEPOIS de esperar o
      // backend, então ficava parada por segundos parecendo travada; e um
      // segundo clique durante essa espera nem tinha trava nenhuma. Ver o
      // comentário grande em wireWorkflowArrows, js/detalhe-modal.js.
      if (cardMaeTask._sequenciaAcaoEmAndamento) { avisarAcaoDeSequenciaOcupada(); return; }
      cardMaeTask._sequenciaAcaoEmAndamento = true;
      prevBtn.disabled = true;

      // Muda a tela JÁ, antes de qualquer `await`.
      if (cardMaeTask.sequencia && cardMaeTask.sequencia.length) {
        const atualIdx = cardMaeTask.sequencia.findIndex(s => s.atual);
        if (atualIdx > 0) {
          cardMaeTask.sequencia[atualIdx].atual = false;
          cardMaeTask.sequencia[atualIdx - 1].atual = true;
          cardMaeTask.sequencia[atualIdx - 1].concluido = false;
          rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId);
          const seqEl = document.getElementById("pillCardMaeSeq");
          if (seqEl) animarMudancaDaSequencia(seqEl);
        }
      }

      const [, novoResponsavel] = await Promise.all([
        pararCronometroAoTransferir(cardMaeTask),
        desfazerWorkflowNoBackend(cardMaeTask.id),
      ]);
      if (novoResponsavel) { cardMaeTask.assignee = novoResponsavel; agendarAtualizacaoKanban(); }
      await recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId);
      cardMaeTask._sequenciaAcaoEmAndamento = false;
    });
  }
  const nextBtn = face.querySelector("#navNextArrow");
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      if (cardMaeTask._sequenciaAcaoEmAndamento) { avisarAcaoDeSequenciaOcupada(); return; }
      cardMaeTask._sequenciaAcaoEmAndamento = true;
      nextBtn.disabled = true;

      // Muda a tela JÁ, antes de qualquer `await`.
      if (cardMaeTask.sequencia && cardMaeTask.sequencia.length) {
        const atualIdx = cardMaeTask.sequencia.findIndex(s => s.atual);
        if (atualIdx !== -1 && atualIdx < cardMaeTask.sequencia.length - 1) {
          cardMaeTask.sequencia[atualIdx].atual = false;
          cardMaeTask.sequencia[atualIdx].concluido = true;
          cardMaeTask.sequencia[atualIdx + 1].atual = true;
          rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId);
          const seqEl = document.getElementById("pillCardMaeSeq");
          if (seqEl) animarMudancaDaSequencia(seqEl);
        }
      }

      const [, resultadoAvanco] = await Promise.all([
        pararCronometroAoTransferir(cardMaeTask),
        avancarWorkflowNoBackend(cardMaeTask.id),
      ]);
      if (resultadoAvanco.novoResponsavel) { cardMaeTask.assignee = resultadoAvanco.novoResponsavel; agendarAtualizacaoKanban(); }
      if (!resultadoAvanco.ok) mostrarToast("Não consegui avançar a sequência do card mãe agora.", "erro");
      await recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId);
      cardMaeTask._sequenciaAcaoEmAndamento = false;
    });
  }
  const addPersonBtn = face.querySelector("#navAddPersonBtn");
  if (addPersonBtn) {
    addPersonBtn.addEventListener("click", () => abrirQuickPickerCardMaeNoPill(cardMaeTask, taskAtualId, addPersonBtn));
  }
  const deliverBtn = face.querySelector("#navDeliverBtn");
  // REGRA: card mãe só é entregue pelo atendimento (ou coordenador),
  // NUNCA pelo designer (2026-08-14, pedido do Cláudio: um designer
  // entregou a PRÓPRIA subtarefa, o carrossel de "transferir o card mãe"
  // apareceu do jeito normal, e o botão "Entregar" ali dentro confundiu
  // -- ele não devia nem poder entregar o card mãe, só o atendimento
  // decide isso). Esconde o botão inteiro em vez de só travar o clique:
  // um botão visível e morto confunde mais do que a ausência dele. O
  // resto do carrossel (avançar/voltar a sequência, adicionar pessoa)
  // continua igual -- só "concluir o card mãe de vez" é vedado aqui.
  if (deliverBtn && typeof PAPEL_LOGADO !== "undefined" && PAPEL_LOGADO === "designer") {
    deliverBtn.hidden = true;
  } else if (deliverBtn && !cardMaeTask.entregue) {
    deliverBtn.addEventListener("click", async () => {
      if (cardMaeTask._sequenciaAcaoEmAndamento) { avisarAcaoDeSequenciaOcupada(); return; }
      cardMaeTask._sequenciaAcaoEmAndamento = true;
      deliverBtn.disabled = true;
      // Pausar o cronômetro e entregar/avançar de verdade correm juntos
      // (não um esperando o outro) — mesmo conserto de velocidade do
      // avançar/desfazer acima.
      const temSequencia = cardMaeTask.sequencia && cardMaeTask.sequencia.length > 0;
      const [, ok] = await Promise.all([
        pararCronometroAoTransferir(cardMaeTask),
        temSequencia
          ? avancarWorkflowNoBackend(cardMaeTask.id).then(r => r.ok)
          : entregarTarefaNoBackend(cardMaeTask.id),
      ]);
      if (ok) {
        mostrarToast("Card mãe entregue.");
        esconderFluxoCardMaeNoPill();
        agendarAtualizacaoKanban();
      } else {
        deliverBtn.disabled = false;
        mostrarToast("Não consegui entregar o card mãe agora.", "erro");
      }
      cardMaeTask._sequenciaAcaoEmAndamento = false;
    });
  }
}

async function abrirQuickPickerCardMaeNoPill(cardMaeTask, taskAtualId, btn) {
  document.querySelectorAll(".pill-cardmae-quickpick").forEach(el => el.remove());
  const menu = document.createElement("div");
  menu.className = "pill-cardmae-quickpick";
  menu.innerHTML = `<div class="assignee-menu-loading">Carregando pessoas...</div>`;
  document.body.appendChild(menu);
  posicionarPopupFixo(menu, btn);

  const usuarios = ordenarUsuariosParaRegra(await buscarUsuariosRunrun());
  if (!menu.isConnected) return; // fechou enquanto carregava
  menu.innerHTML = usuarios.map(u => `
    <button type="button" data-user-id="${u.id}" data-user-nome="${u.nome}" data-user-foto="${u.foto || ""}">
      ${avatarHTML(u.nome, "avatar-sm", u.foto, { runrunId: u.id, email: u.email })} <span>${escaparHTML(nomeOficialDe({ nome: u.nome, runrunId: u.id, email: u.email }))}</span>
    </button>
  `).join("");
  posicionarPopupFixo(menu, btn); // recalcula já com a altura real da lista

  menu.querySelectorAll("button").forEach(opt => {
    opt.addEventListener("click", async () => {
      fechar();
      // A fotinho entra na fileira NA HORA, sem esperar o Runrun.it —
      // mesmo desenho de adicionarPessoaOtimista (js/regras-briefing.js) e
      // de adicionarPessoaViaQuickPicker (js/pagina-repasse.js). Antes daqui
      // pra frente o pill ficava parado por segundos, sem sinal nenhum de
      // que o clique tinha valido.
      cardMaeTask.sequencia = construirSequenciaOtimistaComNovaPessoa(cardMaeTask, {
        id: opt.dataset.userId,
        nome: opt.dataset.userNome,
        foto: opt.dataset.userFoto || null,
      });
      // ⚠️ MESMO CADEADO das setas de transferir/voltar logo abaixo neste
      // arquivo (2026-08-14, ver o comentário grande em cima de
      // adicionarPessoaOtimista, js/regras-briefing.js, pro porquê:
      // "complete_workflow_step" entrega a tarefa em vez de transferir se
      // rodar antes desta adição confirmar no Runrun.it). Sem isto, clicar
      // em "Transferir" no pill logo depois de adicionar alguém aqui tinha
      // o mesmo risco de entregar a tarefa por engano.
      cardMaeTask._sequenciaAcaoEmAndamento = true;
      rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId, true);

      try {
        if (!cardMaeTask.workflowId) {
          const criado = await criarRegraNoBackend(cardMaeTask.id);
          if (!criado.ok) {
            mostrarToast("Não consegui criar a sequência do card mãe agora.", "erro");
            await recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId); // desfaz a fotinho otimista
            return;
          }
          cardMaeTask.workflowId = criado.workflowId;
        }
        const ok = await adicionarNaRegraNoBackend(cardMaeTask.workflowId, opt.dataset.userId);
        if (!ok) mostrarToast("Não consegui adicionar essa pessoa na sequência agora.", "erro");
        await recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId);
      } finally {
        cardMaeTask._sequenciaAcaoEmAndamento = false;
      }
    });
  });

  function fechar() {
    menu.remove();
    document.removeEventListener("click", clickFora);
  }
  function clickFora(ev) {
    if (!menu.contains(ev.target) && ev.target !== btn) fechar();
  }
  setTimeout(() => document.addEventListener("click", clickFora), 0);
}

async function buscarCardMaeDoBackend(taskId) {
  if (!taskId) return { ok: false, error: "Backend não configurado." };
  return await chamarBackend({ acao: "buscarCardMae", taskId });
}

/**
 * Confere se a tarefa aberta é, ela mesma, um card mãe (tem subtarefas)
 * e liga a setinha pra baixo — mesmo quando ela chegou pro designer
 * direto numa etapa normal (ex: "Revisão"), sem passar pela etapa
 * "Card mãe" nem ter sido aberta a partir de uma subtarefa dela.
 */
// Quais tarefas já têm uma busca de subtarefas EM VOO agora. Desde que a
// abertura do card passou a acontecer duas vezes (uma com o cache local,
// outra com a resposta do servidor — ver aplicarDadosDaTarefa em
// js/chat-comentarios.js), sem isso as duas disparavam a mesma busca e
// gastavam dois lugares na fila do Apps Script pra trazer a mesma coisa.
const filhosEmVoo = new Set();

async function carregarFilhosSeForCardMae(task) {
  if (!task.id || task.isMotherCard || task.parentTaskId) return;
  const taskId = task.id;
  if (filhosEmVoo.has(String(taskId))) return;
  filhosEmVoo.add(String(taskId));
  let resultado;
  try {
    resultado = await buscarSubtarefasDoCardMaeNoBackend(taskId);
  } finally {
    filhosEmVoo.delete(String(taskId));
  }
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return; // usuário já trocou de tarefa
  if (!resultado.ok || !resultado.ehCardMae) return;
  tasks[detailIdx].isMotherCard = true;
  tasks[detailIdx].subtarefasResumo = resultado.subtarefas || [];
  renderDetail();
}

async function buscarSubtarefasDoCardMaeNoBackend(taskId) {
  if (!taskId) return { ok: false, error: "Backend não configurado." };
  return await chamarBackend({ acao: "buscarSubtarefasDoCardMae", taskId });
}
