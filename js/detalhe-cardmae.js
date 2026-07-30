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
    if (resultado.ok && resultado.temPai) cardMaeCache.set(taskId, resultado);
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

  if (resultado.cardMae.descricao === undefined) {
    const descricao = await buscarDescricaoDoBackend(resultado.cardMae.id);
    resultado.cardMae.descricao = descricao || "";
    if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId) || !descMaeAberta) return;
  }
  textoEl.innerHTML = resultado.cardMae.descricao
    ? formatarDescricaoRunrun(resultado.cardMae.descricao)
    : "Sem descrição cadastrada no card mãe.";
}

// taskId da subtarefa -> resultado de buscarCardMaeDoBackend (já com
// temPai/cardMae/subtarefas prontos). Guardado num Map à parte (não no
// objeto da tarefa) pra sobreviver mesmo se atualizarKanbanEmBackground
// trocar os objetos de tasks[] por outros novos enquanto isso.
const cardMaeCache = new Map();

/**
 * Busca o card mãe (e já deixa os comentários dele cacheados também,
 * ver chatMaeCache em js/chat-comentarios.js) assim que uma subtarefa
 * termina de abrir — sem esperar a pessoa clicar na seta pra cima.
 * Assim, quando ela clicar de verdade, abrirCardMae já acha tudo pronto
 * (abre na hora, sem esperar o Runrun.it responder de novo) e a aba
 * "Comentários card mãe" do chat também já nasce carregada.
 */
async function precarregarCardMaeEmBackground(taskId) {
  if (cardMaeCache.has(taskId)) return;
  const resultado = await buscarCardMaeDoBackend(taskId);
  if (!resultado.ok || !resultado.temPai) return;
  cardMaeCache.set(taskId, resultado);
  if (!chatMaeCache.has(taskId)) {
    const comentarios = await buscarComentariosDoBackend(resultado.cardMae.id);
    chatMaeCache.set(taskId, { id: resultado.cardMae.id, title: resultado.cardMae.title, comments: comentarios });
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
  // IA (isso é só o briefing da própria subtarefa).
  resultado.cardMae.descricao = await buscarDescricaoDoBackend(resultado.cardMae.id);
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
    if (resultado.ok && resultado.temPai) cardMaeCache.set(task.id, resultado);
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
  _cardMaeFluxoTimeout = setTimeout(() => {
    // Confere de novo aqui dentro (não só lá fora, antes do delay) — a
    // pessoa pode ter trocado de tarefa nesses ~700ms de espera.
    const aindaNaMesmaTarefa = tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id);
    if (devePerguntar && aindaNaMesmaTarefa) mostrarPerguntaTransferirNoPill(resultado.cardMae, task.id);
    else esconderFluxoCardMaeNoPill();
  }, 700);
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
  pill.classList.add("card-mae-modo", "card-mae-ativo");
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
      <span class="pill-cardmae-icone">${reopenIcon}</span>
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
        <span>${escaparHTML(destino.label)}</span>
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

  // Deixa a animação terminar antes de redesenhar (o pill volta a mostrar
  // o crachá normal, já que o card mãe entrou no quadro). Se o Runrun.it
  // demorou mais que a animação, redesenha na hora.
  const faltando = Math.max(0, 1000 - (Date.now() - comecouEm));
  setTimeout(() => {
    if (document.getElementById("pillCardMaeTransfer")) rerenderFacePillRegraCardMae(cardMaeTask, taskAtualId);
  }, faltando);
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
      // Só ESCOLHE o destino — não mexe em nada no Runrun.it. Quem
      // transfere de verdade é a setinha do meio.
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
      prevBtn.disabled = true;
      await pararCronometroAoTransferir(cardMaeTask);
      const novoResponsavel = await desfazerWorkflowNoBackend(cardMaeTask.id);
      if (novoResponsavel) { cardMaeTask.assignee = novoResponsavel; agendarAtualizacaoKanban(); }
      await recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId);
    });
  }
  const nextBtn = face.querySelector("#navNextArrow");
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      nextBtn.disabled = true;
      await pararCronometroAoTransferir(cardMaeTask);
      const resultadoAvanco = await avancarWorkflowNoBackend(cardMaeTask.id);
      if (resultadoAvanco.novoResponsavel) { cardMaeTask.assignee = resultadoAvanco.novoResponsavel; agendarAtualizacaoKanban(); }
      if (!resultadoAvanco.ok) mostrarToast("Não consegui avançar a sequência do card mãe agora.", "erro");
      await recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId);
    });
  }
  const addPersonBtn = face.querySelector("#navAddPersonBtn");
  if (addPersonBtn) {
    addPersonBtn.addEventListener("click", () => abrirQuickPickerCardMaeNoPill(cardMaeTask, taskAtualId, addPersonBtn));
  }
  const deliverBtn = face.querySelector("#navDeliverBtn");
  if (deliverBtn && !cardMaeTask.entregue) {
    deliverBtn.addEventListener("click", async () => {
      deliverBtn.disabled = true;
      await pararCronometroAoTransferir(cardMaeTask);
      let ok;
      if (cardMaeTask.sequencia && cardMaeTask.sequencia.length > 0) {
        const resultadoAvanco = await avancarWorkflowNoBackend(cardMaeTask.id);
        ok = resultadoAvanco.ok;
      } else {
        ok = await entregarTarefaNoBackend(cardMaeTask.id);
      }
      if (ok) {
        mostrarToast("Card mãe entregue.");
        esconderFluxoCardMaeNoPill();
        agendarAtualizacaoKanban();
      } else {
        deliverBtn.disabled = false;
        mostrarToast("Não consegui entregar o card mãe agora.", "erro");
      }
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
      ${avatarHTML(u.nome, "avatar-sm", u.foto)} <span>${u.nome}</span>
    </button>
  `).join("");
  posicionarPopupFixo(menu, btn); // recalcula já com a altura real da lista

  menu.querySelectorAll("button").forEach(opt => {
    opt.addEventListener("click", async () => {
      fechar();
      if (!cardMaeTask.workflowId) {
        const criado = await criarRegraNoBackend(cardMaeTask.id);
        if (!criado.ok) { mostrarToast("Não consegui criar a sequência do card mãe agora.", "erro"); return; }
        cardMaeTask.workflowId = criado.workflowId;
      }
      const ok = await adicionarNaRegraNoBackend(cardMaeTask.workflowId, opt.dataset.userId);
      if (!ok) mostrarToast("Não consegui adicionar essa pessoa na sequência agora.", "erro");
      await recarregarRegraCardMaeNoPill(cardMaeTask, taskAtualId);
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
  if (!COLMEIA_API_URL || !taskId) return { ok: false, error: "Backend não configurado." };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarCardMae", taskId }),
    });
    return await res.json();
  } catch (err) {
    console.error("Falha ao buscar o card mãe no Runrun.it:", err);
    return { ok: false, error: "Falha de conexão com o Runrun.it." };
  }
}

/**
 * Confere se a tarefa aberta é, ela mesma, um card mãe (tem subtarefas)
 * e liga a setinha pra baixo — mesmo quando ela chegou pro designer
 * direto numa etapa normal (ex: "Revisão"), sem passar pela etapa
 * "Card mãe" nem ter sido aberta a partir de uma subtarefa dela.
 */
async function carregarFilhosSeForCardMae(task) {
  if (!task.id || task.isMotherCard || task.parentTaskId) return;
  const taskId = task.id;
  const resultado = await buscarSubtarefasDoCardMaeNoBackend(taskId);
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return; // usuário já trocou de tarefa
  if (!resultado.ok || !resultado.ehCardMae) return;
  tasks[detailIdx].isMotherCard = true;
  tasks[detailIdx].subtarefasResumo = resultado.subtarefas || [];
  renderDetail();
}

async function buscarSubtarefasDoCardMaeNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return { ok: false, error: "Backend não configurado." };
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarSubtarefasDoCardMae", taskId }),
    });
    return await res.json();
  } catch (err) {
    console.error("Falha ao checar se a tarefa é um card mãe:", err);
    return { ok: false, error: "Falha de conexão com o Runrun.it." };
  }
}
