// ============================================================================
// PRECISA DE ATENÇÃO (2026-08-09)
// ============================================================================
//
// A pílula no RODAPÉ da Timeline da Central (protótipo 2, aprovado pelo
// Cláudio): peças que postam HOJE ou AMANHÃ e ainda não ficaram prontas.
// Clicar nela faz o card preto inteiro virar a revisão — uma peça de cada
// vez, num baralho de cartões — e cada cartão sai por um de dois lados:
//
//   PEDIR ATENÇÃO (direita, amarelo) — grava o pedido na planilha, avisa
//     quem coordena no sino do Colmeia e vira um evento vermelho na própria
//     Timeline. O pedido é uma COISA QUE ACONTECEU, não um aviso que some:
//     quem abrir a Central depois vê que aquela peça já foi cobrada, em vez
//     de cobrar de novo.
//
//   SEGURAR (esquerda, cinza) — não grava nada, não avisa ninguém: só tira
//     o cartão da frente até o fim do dia. É o lado BARATO da decisão, de
//     propósito. Por isso mora no `localStorage` e não na planilha, o que
//     contraria a regra do CLAUDE.md só na aparência: o que doeria perder é
//     a COBRANÇA (essa vai pra planilha); perder um "segurar" custa ver o
//     mesmo cartão de novo amanhã, que é justamente o que se quer quando a
//     peça continua sem ficar pronta.
//
// DADO: a fila sai de `centralPostagens` — o MESMO array que o calendário de
// postagens já busca uma vez por sessão (`calendarioDePostagens`,
// AprovacaoInterna.gs). Zero chamada nova pra montar a pílula.
//
// Carregado depois de js/central-atendimento.js: usa função de lá o tempo
// todo (centralClienteEhDoLogado, centralRenderTimelineHoje, escaparHTML).
// ============================================================================

let centralPedidosAtencao = [];        // o que já foi cobrado (vem da planilha)
let centralAtencaoAberta = false;      // a revisão está por cima da Timeline?
let centralAtencaoIdx = 0;             // qual cartão do baralho está na frente
let centralAtencaoFilaAtual = [];      // a fila congelada enquanto a revisão está aberta
let centralAtencaoPlacar = { pedidos: 0, segurados: 0 };

// ===== "Segurar" — só neste navegador, e só até o fim do dia =====
const CENTRAL_ATENCAO_SEGURADAS_KEY = "colmeia_atencao_seguradas_v1";

function centralAtencaoChaveSeguradas() {
  const quem = typeof normalizarParaComparar === "function"
    ? normalizarParaComparar(DESIGNER_LOGADO || "sem-login") : "sem-login";
  return `${CENTRAL_ATENCAO_SEGURADAS_KEY}_${quem}`;
}

/** { taskId: "AAAA-MM-DD" } — o dia em que foi segurada. Outro dia, volta. */
function centralAtencaoSeguradas() {
  try {
    const bruto = JSON.parse(localStorage.getItem(centralAtencaoChaveSeguradas()) || "{}");
    const hoje = centralCalChave(new Date());
    const limpo = {};
    Object.keys(bruto).forEach(id => { if (bruto[id] === hoje) limpo[id] = hoje; });
    return limpo;
  } catch (e) { return {}; }
}

function centralAtencaoSegurar(taskId) {
  const atual = centralAtencaoSeguradas();
  atual[String(taskId)] = centralCalChave(new Date());
  try { localStorage.setItem(centralAtencaoChaveSeguradas(), JSON.stringify(atual)); } catch (e) { /* cota cheia: paciência */ }
}

// ===== A fila =====

/**
 * As peças que postam hoje ou amanhã e ainda não foram entregues, já sem
 * as que alguém segurou hoje e sem as que JÁ FORAM COBRADAS pra aquela
 * data de postagem — cobrar duas vezes a mesma peça é exatamente o que a
 * gravação do pedido existe pra evitar.
 *
 * Devolve [] enquanto o calendário ainda não chegou (centralPostagens ===
 * null): sem dado, a pílula simplesmente não aparece, em vez de aparecer
 * zerada e piscar quando o dado chega.
 */
function centralAtencaoFila() {
  if (!Array.isArray(centralPostagens)) return [];

  const hoje = centralCalChave(new Date());
  const amanha = centralCalChave(new Date(Date.now() + 86400000));
  const seguradas = centralAtencaoSeguradas();
  const jaCobradas = new Set(centralPedidosAtencao.map(p => `${p.taskId}::${p.publicacao}`));

  return centralPostagens
    .filter(p => p.publicacao === hoje || p.publicacao === amanha)
    // Só o que ainda não ficou pronto. "Entregue" aqui já leva em conta as
    // subtarefas: com etapas abertas no Runrun.it, a peça continua em pé
    // mesmo que o card mãe pareça parado (ver calendarioDePostagens).
    //
    // Card mãe NÃO é excluído de propósito: é nele que a data de
    // publicação é marcada, então ele É a peça — quem tem a entrega
    // desejada e o designer é a subtarefa, e o backend já junta os dois.
    .filter(p => !p.entregue)
    .filter(p => centralClienteEhDoLogado(p.cliente))
    .filter(p => !centralClienteAtivo || (p.cliente || "") === centralClienteAtivo)
    .filter(p => !seguradas[String(p.id)])
    .filter(p => !jaCobradas.has(`${p.id}::${p.publicacao}`))
    // Quem posta hoje na frente; dentro do mesmo dia, sem designer primeiro
    // (é o caso mais grave: ninguém sequer começou).
    .sort((a, b) => {
      if (a.publicacao !== b.publicacao) return a.publicacao < b.publicacao ? -1 : 1;
      return (a.designer ? 1 : 0) - (b.designer ? 1 : 0);
    });
}

/** Quantas dessas postam HOJE — o número que a pílula destaca. */
function centralAtencaoQuantasHoje(fila) {
  const hoje = centralCalChave(new Date());
  return fila.filter(p => p.publicacao === hoje).length;
}

// ===== A pílula =====

const CENTRAL_ATENCAO_ICONES = {
  raio: `<svg viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
  mao: `<svg viewBox="0 0 24 24" fill="none"><path d="M10 4v8m4-9v9m4-6v10a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-4-2L3 15a2 2 0 0 1 3-3l1.5 1.5M6 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none"><path d="m20 6-11 11-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/**
 * Desenha (ou apaga) a pílula no rodapé da Timeline. Sem fila, ela some
 * sozinha e o card volta a ser só a Timeline — é o que impede a pílula de
 * virar um enfeite permanente que ninguém mais lê.
 */
function centralRenderPilulaAtencao() {
  const pe = document.getElementById("chTimelinePe");
  if (!pe) return;

  const fila = centralAtencaoFila();
  if (!fila.length) { pe.innerHTML = ""; return; }

  const hoje = centralAtencaoQuantasHoje(fila);
  const amanha = fila.length - hoje;
  const beeSvg = typeof beeIcon === "string" ? beeIcon : CENTRAL_ATENCAO_ICONES.raio;

  const linhaDeBaixo = fila.length === 1
    ? `${hoje ? "posta hoje" : "posta amanhã"} e ainda não ficou pronta`
    : `${[hoje ? `${hoje} hoje` : "", amanha ? `${amanha} amanhã` : ""].filter(Boolean).join(" · ")} — nenhuma ficou pronta`;

  // A BEE É QUEM ALERTA (pedido do Cláudio): a carinha dela no lugar do
  // sino genérico do protótipo. É a mesma que já avisa de arquivo novo no
  // card e conversa no chat da tarefa — quem já usa o Colmeia reconhece
  // de quem é o recado antes de ler o texto.
  // A Bee fica à ESQUERDA, com o pontinho vermelho no ombro dela: além de
  // ler melhor ("é ela avisando", igual à foto de quem fala num chat), é o
  // que tira o ícone de baixo da bolinha flutuante da Bee, que mora
  // exatamente no canto de baixo à direita da tela — na direita, os dois
  // se sobrepunham.
  pe.innerHTML = `
    <button type="button" class="central-atencao-pill" id="chAtencaoPill">
      <span class="central-atencao-bee">${beeSvg}<i class="central-atencao-ponto"></i></span>
      <span class="central-atencao-pill-txt">
        <b>${fila.length} peça${fila.length === 1 ? "" : "s"} pedindo atenção</b>
        <span>${linhaDeBaixo}</span>
      </span>
    </button>`;

  document.getElementById("chAtencaoPill")?.addEventListener("click", centralAbrirRevisaoAtencao);
}

// ===== A revisão (o card preto vira a tela de decidir) =====

function centralAbrirRevisaoAtencao() {
  const card = document.querySelector(".central-hoje-timeline");
  if (!card || centralAtencaoAberta) return;

  centralAtencaoFilaAtual = centralAtencaoFila();
  if (!centralAtencaoFilaAtual.length) return;
  centralAtencaoIdx = 0;
  centralAtencaoPlacar = { pedidos: 0, segurados: 0 };
  centralAtencaoAberta = true;

  const camada = document.createElement("div");
  camada.className = "central-atencao-revisao";
  camada.id = "chAtencaoRevisao";
  camada.innerHTML = `
    <div class="central-atencao-cab">
      <b>Precisa de atenção</b>
      <span class="central-atencao-passos" id="chAtencaoPassos"></span>
      <button type="button" class="central-atencao-x" id="chAtencaoFechar" aria-label="Fechar">${CENTRAL_ATENCAO_ICONES.x}</button>
    </div>
    <div class="central-atencao-baralho" id="chAtencaoBaralho"></div>
    <div class="central-atencao-acoes" id="chAtencaoAcoes">
      <span class="central-atencao-acao">
        <button type="button" class="central-atencao-redondo segurar" data-central-atencao="segurar" aria-label="Segurar">${CENTRAL_ATENCAO_ICONES.mao}</button>
        <span>Segurar</span>
      </span>
      <span class="central-atencao-acao">
        <button type="button" class="central-atencao-redondo atencao" data-central-atencao="atencao" aria-label="Pedir atenção">${CENTRAL_ATENCAO_ICONES.raio}</button>
        <span>Pedir atenção</span>
      </span>
    </div>`;
  card.appendChild(camada);
  // A bolinha da Bee fica no canto de baixo à direita da tela, exatamente
  // por cima do botão "Pedir atenção" (a Timeline é a coluna da direita).
  // Some enquanto a revisão está aberta, do mesmo jeito que já some com um
  // card aberto (body.card-aberto, css/05-componentes.css).
  document.body.classList.add("central-atencao-revisando");

  camada.querySelectorAll("[data-central-atencao]").forEach(b => {
    b.addEventListener("click", () => centralAtencaoDecidir(b.dataset.centralAtencao));
  });
  document.getElementById("chAtencaoFechar")?.addEventListener("click", centralFecharRevisaoAtencao);
  document.addEventListener("keydown", centralAtencaoTecla, true);

  centralAtencaoRenderBaralho();
}

function centralFecharRevisaoAtencao() {
  if (!centralAtencaoAberta) return;
  centralAtencaoAberta = false;
  document.removeEventListener("keydown", centralAtencaoTecla, true);
  document.body.classList.remove("central-atencao-revisando");
  document.getElementById("chAtencaoRevisao")?.remove();
  // A Timeline pode ter ganhado eventos novos (cada "pedir atenção" vira
  // um) e a pílula pode ter zerado — redesenha as duas.
  centralRenderTimelineHoje();
  centralRenderPilulaAtencao();
}

/**
 * Esc fecha, ← segura, → pede atenção. Em fase de CAPTURA, mesmo padrão da
 * paleta de comando e do visualizador de imagem: sem isso, o Esc com a
 * revisão aberta fecharia a Central inteira por baixo dela.
 */
function centralAtencaoTecla(e) {
  if (!centralAtencaoAberta) return;
  if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); centralFecharRevisaoAtencao(); return; }
  if (e.key === "ArrowLeft") { e.preventDefault(); centralAtencaoDecidir("segurar"); }
  if (e.key === "ArrowRight") { e.preventDefault(); centralAtencaoDecidir("atencao"); }
}

// ===== O cartão =====

/**
 * O formato da peça, adivinhado pelo TÍTULO da tarefa — mesma ideia (e as
 * mesmas palavras) da sugestão de programa pra abrir do card do designer
 * (SUGESTOES_DE_PROGRAMA, js/detalhe-modal.js). É um palpite, então só
 * aparece quando o título diz com todas as letras; sem palavra conhecida,
 * a pastilha simplesmente não existe — melhor faltar do que chutar errado.
 */
const CENTRAL_ATENCAO_FORMATOS = [
  { chave: "carrossel", rotulo: "Carrossel" },
  { chave: "stories", rotulo: "Stories" },
  { chave: "story", rotulo: "Stories" },
  { chave: "reels", rotulo: "Reels" },
  { chave: "feed", rotulo: "Feed" },
  { chave: "video", rotulo: "Vídeo" },
  { chave: "e-mail", rotulo: "E-mail" },
  { chave: "banner", rotulo: "Banner" },
];

function centralAtencaoFormato(titulo) {
  const limpo = centralSemAcento(String(titulo || ""));
  const achado = CENTRAL_ATENCAO_FORMATOS.find(f => limpo.includes(f.chave));
  return achado ? achado.rotulo : "";
}

/**
 * A frase que responde "por que essa peça está na minha frente?" — montada
 * do próprio estado da tarefa, sem nada inventado. É a informação que faz
 * a decisão ser rápida: sem ela, quem confere tem que juntar as pastilhas
 * de cabeça pra chegar na mesma conclusão.
 */
function centralAtencaoMotivo(p, postaHoje) {
  const quando = postaHoje ? "posta hoje" : "posta amanhã";
  if (!p.designer) return `Ninguém pegou essa tarefa ainda, e ela ${quando}.`;
  const etapa = centralSemAcento(p.etapa || "");
  if (etapa.includes("ajuste")) return `Está em ajustes com ${p.designer} e ${quando}.`;
  if (etapa.includes("conferencia") || etapa.includes("revisao")) {
    return `Está esperando conferência e ${quando}.`;
  }
  return `Está com ${p.designer}${p.etapa ? ` em "${p.etapa}"` : ""} e ${quando}.`;
}

function centralAtencaoCartaoHTML(p, pos, total) {
  const hoje = centralCalChave(new Date());
  const postaHoje = p.publicacao === hoje;
  const formato = centralAtencaoFormato(p.titulo);
  const foto = typeof avatarHTML === "function" && p.designer
    ? avatarHTML(p.designer, "central-atencao-foto")
    : `<span class="central-atencao-foto sem">?</span>`;

  return `
    <span class="central-atencao-carimbo esq">segurar</span>
    <span class="central-atencao-carimbo dir">pedir atenção</span>

    <div class="central-atencao-topo">
      <div class="central-atencao-topo-txt">
        <span class="central-atencao-cli">${escaparHTML(p.cliente || "Sem cliente")}${p.id ? ` · #${escaparHTML(String(p.id))}` : ""}</span>
        <h3>${escaparHTML(p.titulo || "Sem título")}</h3>
      </div>
      <span class="central-atencao-conta">${pos} de ${total}</span>
    </div>

    <div class="central-atencao-pastilhas">
      ${formato ? `<span class="central-atencao-pastilha">${escaparHTML(formato)}</span>` : ""}
      <span class="central-atencao-pastilha ${postaHoje ? "urgente" : "amanha"}">
        posta ${postaHoje ? "hoje" : "amanhã"}
      </span>
      ${p.etapa ? `<span class="central-atencao-pastilha">${escaparHTML(p.etapa)}</span>` : ""}
      ${p.designer ? "" : `<span class="central-atencao-pastilha urgente">sem designer</span>`}
    </div>

    <div class="central-atencao-motivo">
      <span class="central-atencao-motivo-bee">${typeof beeIcon === "string" ? beeIcon : ""}</span>
      <span>${escaparHTML(centralAtencaoMotivo(p, postaHoje))}</span>
    </div>

    <div class="central-atencao-pe">
      <div class="central-atencao-datas">
        <span class="central-atencao-data">
          <em>Posta</em>
          <b class="${postaHoje ? "urgente" : ""}">${escaparHTML(centralCalDiaPorExtenso(p.publicacao))}</b>
        </span>
        <span class="central-atencao-data">
          <em>Entrega combinada</em>
          <b>${p.entrega ? escaparHTML(centralCalCurta(p.entrega)) : "sem data"}</b>
        </span>
      </div>
      <div class="central-atencao-quem">
        ${foto}
        <span class="central-atencao-quem-txt">
          <b>${escaparHTML(p.designer || "Ninguém pegou ainda")}</b>
          <span>${p.designer ? "responsável no Runrun.it" : "a tarefa está sem responsável"}</span>
        </span>
      </div>
    </div>`;
}

/** Desenha as 3 de cima do baralho — as de trás só espiam por cima. */
function centralAtencaoRenderBaralho() {
  const baralho = document.getElementById("chAtencaoBaralho");
  if (!baralho) return;

  const total = centralAtencaoFilaAtual.length;
  const restantes = centralAtencaoFilaAtual.slice(centralAtencaoIdx, centralAtencaoIdx + 3);
  const acoes = document.getElementById("chAtencaoAcoes");

  if (!restantes.length) {
    baralho.innerHTML = `
      <div class="central-atencao-fim">
        <span class="central-atencao-fim-ok">${CENTRAL_ATENCAO_ICONES.check}</span>
        <b>Revisado, sem fila</b>
        <span>${centralAtencaoPlacar.pedidos} ${centralAtencaoPlacar.pedidos === 1 ? "pedido" : "pedidos"} de atenção ·
        ${centralAtencaoPlacar.segurados} ${centralAtencaoPlacar.segurados === 1 ? "segurada" : "seguradas"}</span>
      </div>`;
    if (acoes) acoes.hidden = true;
    centralAtencaoAtualizarPassos();
    return;
  }

  if (acoes) acoes.hidden = false;
  baralho.innerHTML = restantes.map((p, k) => `
    <div class="central-atencao-carta ${k === 0 ? "frente" : ""}" data-k="${k}"
         style="z-index:${10 - k}; transform: translateY(${k * 10}px) scale(${1 - k * 0.045}); opacity:${k === 2 ? .5 : 1}">
      ${centralAtencaoCartaoHTML(p, centralAtencaoIdx + 1, total)}
    </div>`).reverse().join("");

  const frente = baralho.querySelector(".central-atencao-carta.frente");
  if (frente) centralAtencaoLigarArrasto(frente);
  centralAtencaoAtualizarPassos();
}

function centralAtencaoAtualizarPassos() {
  const passos = document.getElementById("chAtencaoPassos");
  if (!passos) return;
  passos.innerHTML = centralAtencaoFilaAtual.map((_, k) =>
    `<i class="${k < centralAtencaoIdx ? "feito" : k === centralAtencaoIdx ? "agora" : ""}"></i>`).join("");
}

// ===== Arrastar pro lado =====

const CENTRAL_ATENCAO_LIMITE = 78;

function centralAtencaoLigarArrasto(carta) {
  let x0 = 0, y0 = 0, dx = 0, arrastando = false, ponteiro = null;
  const cDir = carta.querySelector(".central-atencao-carimbo.dir");
  const cEsq = carta.querySelector(".central-atencao-carimbo.esq");

  carta.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    arrastando = true; ponteiro = e.pointerId; x0 = e.clientX; y0 = e.clientY;
    carta.setPointerCapture(ponteiro);
    carta.classList.add("arrastando");
    carta.classList.remove("assentando");
  });

  carta.addEventListener("pointermove", e => {
    if (!arrastando || e.pointerId !== ponteiro) return;
    dx = e.clientX - x0;
    const dy = (e.clientY - y0) * 0.25;
    carta.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.045}deg)`;
    const forca = Math.min(1, Math.abs(dx) / CENTRAL_ATENCAO_LIMITE);
    if (cDir) cDir.style.opacity = dx > 0 ? forca : 0;
    if (cEsq) cEsq.style.opacity = dx < 0 ? forca : 0;
  });

  const soltar = e => {
    if (!arrastando || (e.pointerId != null && e.pointerId !== ponteiro)) return;
    arrastando = false;
    carta.classList.remove("arrastando");
    if (Math.abs(dx) >= CENTRAL_ATENCAO_LIMITE) {
      centralAtencaoDecidir(dx > 0 ? "atencao" : "segurar");
    } else {
      // Não passou do limite: volta pro lugar em vez de decidir por engano.
      carta.classList.add("assentando");
      carta.style.transform = "translateY(0px) scale(1)";
      if (cDir) cDir.style.opacity = 0;
      if (cEsq) cEsq.style.opacity = 0;
    }
    dx = 0;
  };
  carta.addEventListener("pointerup", soltar);
  carta.addEventListener("pointercancel", soltar);
}

// ===== A decisão =====

function centralAtencaoDecidir(tipo) {
  const item = centralAtencaoFilaAtual[centralAtencaoIdx];
  if (!item) return;

  if (tipo === "atencao") {
    centralAtencaoPlacar.pedidos++;
    centralPedirAtencaoNaPeca(item);
  } else {
    centralAtencaoPlacar.segurados++;
    centralAtencaoSegurar(item.id);
  }

  // Manda a carta da frente pro lado antes de trocar — sem isso a próxima
  // aparece no lugar da anterior sem nada acontecer na tela, e a pessoa
  // não sabe se o clique pegou.
  const frente = document.querySelector("#chAtencaoBaralho .central-atencao-carta.frente");
  if (frente) {
    frente.classList.add("saindo");
    frente.style.transform = `translate(${tipo === "atencao" ? 420 : -420}px, 40px) rotate(${tipo === "atencao" ? 18 : -18}deg)`;
    frente.style.opacity = "0";
  }

  centralAtencaoIdx++;
  setTimeout(centralAtencaoRenderBaralho, 190);
}

/**
 * Grava o pedido e avisa. O evento entra na Timeline NA HORA (sem esperar
 * a planilha responder) porque a resposta do Apps Script demora alguns
 * segundos e a pessoa está decidindo uma peça atrás da outra — se falhar,
 * o aviso conta o que aconteceu e o pedido volta pra fila na próxima
 * varredura, em vez de sumir fingindo que deu certo.
 */
async function centralPedirAtencaoNaPeca(item) {
  const pedido = {
    taskId: String(item.id),
    titulo: item.titulo || "",
    cliente: item.cliente || "",
    publicacao: item.publicacao || "",
    quemPediu: DESIGNER_LOGADO || "",
    designer: item.designer || "",
    motivo: item.designer ? (item.etapa || "") : "sem designer",
  };

  const otimista = { ...pedido, quando: Date.now() };
  centralPedidosAtencao.unshift(otimista);

  const resposta = await chamarBackend({ acao: "pedirAtencaoNaTarefa", pedido });
  if (!resposta || !resposta.ok) {
    // Tira da lista de cobradas ESTE item (comparação por referência, não
    // por taskId): se já existia um pedido antigo pra mesma peça, filtrar
    // por id apagaria junto um pedido que está na planilha de verdade.
    centralPedidosAtencao = centralPedidosAtencao.filter(p => p !== otimista);
    mostrarToast(caiuARede(resposta)
      ? "Sem internet: o pedido de atenção não foi registrado."
      : "Não consegui registrar o pedido de atenção.", "erro");
    return;
  }
  mostrarToast(`Pedido de atenção enviado — ${item.titulo || "a peça"}`, "sucesso");
}

// ===== O que já foi cobrado =====

/**
 * Busca os pedidos gravados. Chamada junto do resto dos dados da Central
 * (centralCarregarDados) — é o que faz "já foi cobrada" valer pra TODO o
 * atendimento, e não só pra quem clicou.
 */
async function centralCarregarPedidosDeAtencao() {
  const data = await chamarBackend({ acao: "listarPedidosDeAtencao" });
  if (!data || !data.ok) return;   // sem rede: fica com o que já tinha
  centralPedidosAtencao = data.pedidos || [];
}

/**
 * Os pedidos viram eventos da Timeline (fonte nova de
 * centralConstruirTimeline). Só os de hoje e ontem: pedido de três dias
 * atrás é sobre uma postagem que já passou e só ocuparia espaço no feed.
 */
function centralEventosDePedidosDeAtencao() {
  const corte = Date.now() - 2 * 86400000;
  return centralPedidosAtencao
    .filter(p => Number(p.quando) >= corte)
    .filter(p => centralClienteEhDoLogado(p.cliente))
    .map(p => ({
      tipo: "atencao",
      quando: Number(p.quando) || 0,
      quem: p.quemPediu || "Alguém",
      inicial: typeof initials === "function" ? initials(p.quemPediu || "?") : "?",
      texto: `Pediu atenção em <b>${escaparHTML(p.titulo || "uma peça")}</b>${p.designer ? ` — com ${escaparHTML(p.designer)}` : " — sem designer"}`,
      cliente: p.cliente || "",
      fileId: null,
    }));
}

// ===== O sino de quem coordena =====

// Uma busca a cada 3 min, no máximo: o sino roda depois de QUALQUER
// atualização do quadro (a cada ~45s), e isso aqui não precisa dessa
// pressa — um pedido de atenção é sobre o dia, não sobre o minuto.
let _centralAtencaoUltimaChecagemSino = 0;
const CENTRAL_ATENCAO_INTERVALO_SINO = 3 * 60 * 1000;

/**
 * Põe no sino do Colmeia os pedidos de atenção das últimas 24h. Só pra
 * quem coordena: é a pessoa a quem o pedido é dirigido — pro resto do time
 * seria um aviso sobre uma cobrança que não é com eles.
 *
 * Chamada no fim de _verificarNotificacoesImpl (js/notificacoes-avisos.js).
 * `registrarNotificacaoGenerica` já ignora chave repetida, então rodar de
 * novo não duplica nada.
 */
async function centralChecarPedidosDeAtencaoNoSino() {
  if (typeof souClaudio !== "function" || !souClaudio()) return;
  if (Date.now() - _centralAtencaoUltimaChecagemSino < CENTRAL_ATENCAO_INTERVALO_SINO) return;
  _centralAtencaoUltimaChecagemSino = Date.now();

  const data = await chamarBackend({ acao: "listarPedidosDeAtencao" });
  if (!data || !data.ok) return;
  centralPedidosAtencao = data.pedidos || [];

  // Só as últimas 24h: a planilha guarda 14 dias, e registrar tudo faria a
  // primeira abertura do dia despejar duas semanas de aviso de uma vez —
  // todos carimbados como "agora", que é quando o sino os viu.
  const ontem = Date.now() - 86400000;
  centralPedidosAtencao
    .filter(p => Number(p.quando) >= ontem)
    .filter(p => !nomesCorrespondem(p.quemPediu || "", DESIGNER_LOGADO || ""))
    .forEach(p => {
      registrarNotificacaoGenerica({
        tipo: "atencao",
        chave: `atencao::${p.taskId}::${p.quando}`,
        titulo: `${p.quemPediu || "Alguém"} pediu atenção`,
        subtitulo: `${p.titulo || "uma peça"}${p.cliente ? ` · ${p.cliente}` : ""}`,
        icone: typeof beeIcon === "string" ? beeIcon : "",
        taskId: p.taskId,
      });
    });
}
