// A BEE no chat da tarefa.
//
// O painel de comentários agora tem dois chats, escolhidos pelos ícones
// do topo: "Comentários" (o de sempre, que vai pro Runrun.it) e "Bee"
// (que fica só no Colmeia). A separação é proposital — o maior risco de
// juntar os dois num campo só é alguém mandar pro cliente uma pergunta
// que era pra ela, ou perguntar pra ela algo que o atendimento precisava ver.
//
// A primeira fala dela é sempre o RESUMO do que a tarefa pede, montado
// só com o que está escrito, e cada item aponta pra mensagem exata de
// onde saiu (clicável). Palpite dela só existe depois, e só se o
// designer perguntar — ver Bee.gs, que tem os dois prompts separados
// justamente por isso.
//
// Nada daqui vai pro Runrun.it sozinho: mandar pra lá é sempre um clique
// no ícone que existe em cada mensagem (ver mandarMensagemProRunrun).
//
// Carregado depois de detalhe-alteracao.js — ver a ordem das tags
// <script> no index.html, que é obrigatória (regra de ouro do CLAUDE.md).

// taskId -> [{autor: "bee"|"designer", texto, quando}]
const beeConversas = new Map();
// taskId -> {itens:[...], observacao} | {semMaterial:true} | {erro:"..."}
const beeResumos = new Map();
const beeCarregando = new Set();

const beeIcon = `<svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="14" rx="5" ry="6" fill="currentColor" opacity="0.9"/><path d="M7 12h10M7 15h10M8 18h8" stroke="var(--card-bg, #fff)" stroke-width="1.4" stroke-linecap="round"/><path d="M9 8c-2-2-5-2.5-6-1s1 3.5 3.5 3.5M15 8c2-2 5-2.5 6-1s-1 3.5-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="4.5" r="1" fill="currentColor"/><circle cx="14" cy="4.5" r="1" fill="currentColor"/></svg>`;

const BEE_FIREFLY_BASE = "https://firefly.adobe.com/generate/images";

// ===== Abrir o chat da Bee =====

/**
 * Troca o painel pro chat da Bee. O resumo e o histórico são buscados
 * uma vez por tarefa e ficam guardados aqui — voltar e ir de novo não
 * gera outro pedido à IA (o backend também guarda o resumo em cache,
 * então nem uma segunda abertura do card custa uma nova geração).
 */
async function abrirThreadBee(task) {
  chatThreadAtivo = "bee";
  chatAlvoTaskId = null; // nada daqui vai pro Runrun.it por engano
  marcarAbaBeeAtiva(true);

  const titulo = document.getElementById("chatPanelTitle");
  if (titulo) titulo.textContent = "Bee · " + task.title;
  atualizarCampoParaBee(true);

  const taskId = task.id;
  if (!beeResumos.has(taskId) && !beeCarregando.has(taskId)) {
    desenharThreadBee(task); // já mostra "lendo a tarefa..."
    await carregarBeeDaTarefa(task);
    if (chatThreadAtivo !== "bee" || !tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return;
  }
  desenharThreadBee(task);
}

function marcarAbaBeeAtiva(ativa) {
  ["chatTabAqui", "chatTabMae", "chatTabTudo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  });
  const grupoComentarios = document.getElementById("chatGrupoComentarios");
  if (grupoComentarios) grupoComentarios.classList.toggle("escondido", ativa);
  const botaoBee = document.getElementById("chatIconeBee");
  if (botaoBee) botaoBee.classList.toggle("active", ativa);
  const botaoComentarios = document.getElementById("chatIconeComentarios");
  if (botaoComentarios) botaoComentarios.classList.toggle("active", !ativa);
}

/**
 * Volta pro chat de comentários (o que vai pro Runrun.it). Numa
 * alteração abre direto na Linha do tempo: é a única aba que mostra a
 * história completa — o pedido quase sempre está no card mãe ou na peça
 * original, não em "Comentários aqui".
 */
function abrirThreadComentarios(task) {
  marcarAbaBeeAtiva(false);
  atualizarCampoParaBee(false);
  if (ehTarefaDeAlteracao(task)) abrirThreadLinhaDoTempo(task);
  else abrirThreadAqui(task);
}

// Muda a cara do campo de escrever conforme o chat ativo, pra ninguém
// escrever no lugar errado sem perceber.
function atualizarCampoParaBee(ehBee) {
  const campo = document.getElementById("commentInput");
  if (campo) campo.placeholder = ehBee ? "Perguntar pra Bee (fica só no Colmeia)..." : "Escreva sua mensagem...";
  const caixa = document.querySelector(".comment-input");
  if (caixa) caixa.classList.toggle("modo-bee", !!ehBee);
}

async function carregarBeeDaTarefa(task) {
  const taskId = task.id;
  if (!taskId) return;
  beeCarregando.add(taskId);
  try {
    const original = typeof acharTarefaOriginalDaAlteracao === "function"
      ? acharTarefaOriginalDaAlteracao(task)
      : null;
    const [resumo, historico] = await Promise.all([
      chamarBackend({ acao: "beeResumo", taskId, idOriginal: original ? original.id : null }),
      chamarBackend({ acao: "beeHistorico", taskId }),
    ]);

    if (!resumo || !resumo.ok) {
      beeResumos.set(taskId, { erro: (resumo && resumo.error) || "Não consegui ler essa tarefa agora." });
    } else if (resumo.semMaterial) {
      beeResumos.set(taskId, { semMaterial: true });
    } else {
      beeResumos.set(taskId, resumo.resumo || { itens: [] });
    }
    if (historico && historico.ok) beeConversas.set(taskId, historico.conversa || []);
    else if (!beeConversas.has(taskId)) beeConversas.set(taskId, []);

    // A peça original (o arquivo que vai ser alterado) entra como
    // pastilha na mensagem dela — o designer vê do que se trata sem sair
    // da conversa. Em segundo plano: se não vier, a mensagem fica igual.
    if (original && typeof buscarAnexosDeUmaTarefa === "function") {
      buscarAnexosDeUmaTarefa(original.id).then(anexos => {
        if (!anexos || !anexos.length) return;
        const guardado = beeResumos.get(taskId);
        if (!guardado || guardado.erro) return;
        guardado.peca = { anexo: anexos[anexos.length - 1], taskId: original.id };
        if (chatThreadAtivo === "bee" && tasks[detailIdx] && String(tasks[detailIdx].id) === String(taskId)) {
          desenharThreadBee(tasks[detailIdx]);
        }
      });
    }
  } finally {
    beeCarregando.delete(taskId);
  }
}

// ===== Desenhar =====

function desenharThreadBee(task) {
  const thread = document.getElementById("commentsThread");
  if (!thread) return;
  const taskId = task.id;

  if (beeCarregando.has(taskId) && !beeResumos.has(taskId)) {
    thread.innerHTML = `<p class="comments-empty">A Bee está lendo a tarefa...</p>`;
    return;
  }

  const resumo = beeResumos.get(taskId);
  const conversa = beeConversas.get(taskId) || [];
  thread.innerHTML = renderPrimeiraFalaDaBee(task, resumo)
    + conversa.map((m, i) => renderMensagemDaConversa(m, i)).join("");
  wireThreadBee(task);
  thread.scrollTop = thread.scrollHeight;
}

function renderPrimeiraFalaDaBee(task, resumo) {
  if (!resumo) return "";
  if (resumo.erro) {
    return bolhaDaBee(`<p class="bee-aviso">${escaparHTML(resumo.erro)}</p>`, -1);
  }
  if (resumo.semMaterial) {
    return bolhaDaBee(`
      <p>Li a descrição e todos os comentários e não achei nada escrito sobre o que fazer nessa tarefa.</p>
      <button type="button" class="bee-acao" id="beePerguntarAtendimento">Perguntar pro atendimento</button>
    `, -1);
  }

  const itens = resumo.itens || [];
  const corpo = `
    <p class="bee-titulo">${ehTarefaDeAlteracao(task) ? "O que foi pedido pra mudar" : "O que essa tarefa pede"}</p>
    ${itens.length
      ? `<ul class="bee-lista">${itens.map((it, i) => `
          <li>
            <span class="bee-item-texto">${escaparHTML(it.texto)}</span>
            <button type="button" class="bee-origem" data-item="${i}" title="Ver a mensagem original">${escaparHTML(rotuloDaOrigem(it))}</button>
          </li>
        `).join("")}</ul>`
      : `<p>Não consegui apontar nenhum pedido com origem clara. Vale conferir na Linha do tempo.</p>`}
    ${resumo.observacao ? `<p class="bee-obs">${escaparHTML(resumo.observacao)}</p>` : ""}
    ${resumo.peca ? `
      <button type="button" class="bee-peca" id="beePecaBtn" data-doc-id="${resumo.peca.anexo.id}" data-nome="${escaparHTML(resumo.peca.anexo.nome)}" data-task-id="${resumo.peca.taskId}">
        a peça: ${escaparHTML(resumo.peca.anexo.nome)}
      </button>
    ` : ""}
  `;
  return bolhaDaBee(corpo, -1);
}

function rotuloDaOrigem(item) {
  if (item.onde === "descricao") return "descrição";
  const quem = (item.autor || "").split(" ")[0] || "alguém";
  return item.quando ? `${quem}, ${item.quando}` : quem;
}

function bolhaDaBee(corpoHTML, indice) {
  return `
    <div class="comment-bubble bee-bubble" data-bee-indice="${indice}">
      <span class="bee-avatar" aria-hidden="true">${beeIcon}</span>
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">Bee</span>
          <span class="bee-selo" title="Nada daqui vai pro Runrun.it sozinho">só no Colmeia</span>
          ${indice >= 0 ? `<button type="button" class="bee-mandar" data-indice="${indice}" title="Mandar isso pro Runrun.it">${iconeMandarProRunrun}</button>` : ""}
        </div>
        <div class="comment-text">${corpoHTML}</div>
      </div>
    </div>
  `;
}

const iconeMandarProRunrun = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12l16-7-6.5 16-2.5-6.5L4 12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderMensagemDaConversa(m, indice) {
  if (m.autor === "bee") return bolhaDaBee(formatarFalaDaBee(m.texto), indice);
  return `
    <div class="comment-bubble mine" data-bee-indice="${indice}">
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">Você</span>
          <button type="button" class="bee-mandar" data-indice="${indice}" title="Mandar isso pro Runrun.it">${iconeMandarProRunrun}</button>
        </div>
        <div class="comment-text">${linkifyTexto(escaparHTML(m.texto))}</div>
      </div>
    </div>
  `;
}

/**
 * A linha que começa com "FIREFLY:" vira um bloco com o prompt pronto
 * pra copiar e um botão que abre o Adobe Firefly. O botão "copiar"
 * existe de propósito mesmo quando o link funciona: se o Firefly um dia
 * parar de aceitar o texto pelo endereço, o caminho manual continua ali.
 */
function formatarFalaDaBee(texto) {
  return escaparHTML(texto)
    .split("\n")
    .map(linha => {
      const match = linha.match(/^\s*FIREFLY:\s*(.+)$/i);
      if (!match) return linha;
      const prompt = match[1].trim();
      return `
        <div class="bee-firefly">
          <code class="bee-firefly-prompt">${prompt}</code>
          <div class="bee-firefly-acoes">
            <button type="button" class="bee-acao" data-copiar="${prompt.replace(/"/g, "&quot;")}">Copiar</button>
            <a class="bee-acao principal" href="${BEE_FIREFLY_BASE}?prompt=${encodeURIComponent(prompt)}" target="_blank" rel="noopener">Abrir no Firefly</a>
          </div>
        </div>
      `;
    })
    .join("<br>")
    .replace(/<br>(\s*<div class="bee-firefly")/g, "$1");
}

// ===== Cliques =====

function wireThreadBee(task) {
  const thread = document.getElementById("commentsThread");
  if (!thread) return;
  const resumo = beeResumos.get(task.id) || {};

  thread.querySelectorAll(".bee-origem").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = (resumo.itens || [])[Number(btn.dataset.item)];
      if (item) irParaOrigemDoItem(task, item);
    });
  });

  const conversa = beeConversas.get(task.id) || [];
  thread.querySelectorAll(".bee-mandar").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = conversa[Number(btn.dataset.indice)];
      if (m) mandarMensagemProRunrun(task, m.texto);
    });
  });

  thread.querySelectorAll("[data-copiar]").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copiar)
        .then(() => mostrarToast("Prompt copiado."))
        .catch(() => mostrarToast("Não consegui copiar. Selecione o texto e copie na mão.", "erro"));
    });
  });

  const pecaBtn = thread.querySelector("#beePecaBtn");
  if (pecaBtn) {
    pecaBtn.addEventListener("click", () => {
      baixarAnexo(pecaBtn.dataset.docId, pecaBtn.dataset.nome, pecaBtn, pecaBtn.dataset.taskId);
    });
  }

  const perguntarBtn = thread.querySelector("#beePerguntarAtendimento");
  if (perguntarBtn) perguntarBtn.addEventListener("click", () => prepararPerguntaProAtendimento(task));
}

/**
 * Leva pro comentário exato que gerou aquele item. Numa alteração abre a
 * Linha do tempo (que junta as três pontas); numa tarefa comum, o chat
 * dela mesma. A descrição também aparece lá, como a primeira mensagem —
 * por isso um item que veio dela também tem pra onde apontar.
 */
async function irParaOrigemDoItem(task, item) {
  marcarAbaBeeAtiva(false);
  atualizarCampoParaBee(false);
  if (ehTarefaDeAlteracao(task)) await abrirThreadLinhaDoTempo(task);
  else await abrirThreadAqui(task);

  const alvo = item.onde === "descricao" ? "descricao" : item.comentarioId;
  const el = document.querySelector(`.comment-bubble[data-comment-id="${alvo}"]`);
  if (!el) {
    mostrarToast("Não achei essa mensagem na conversa — ela pode ter sido apagada.", "erro");
    return;
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("comment-destacado");
  setTimeout(() => el.classList.remove("comment-destacado"), 2200);
}

/**
 * Manda uma mensagem da conversa com a Bee pro Runrun.it, como
 * comentário da tarefa. É o único caminho de saída — e passa pelo campo
 * de escrever de propósito, pra dar a chance de revisar antes.
 */
function mandarMensagemProRunrun(task, texto) {
  abrirThreadComentarios(task);
  const campo = document.getElementById("commentInput");
  if (!campo) return;
  campo.value = texto;
  campo.focus();
  mostrarToast("Revisa e aperta enviar — aí sim vai pro Runrun.it.");
}

/**
 * Quando a Bee não achou nada escrito: já deixa o comentário pronto,
 * marcando o atendimento responsável daquele cliente (o mesmo nome que
 * o card já mostra no bloco "Atendimento responsável").
 */
function prepararPerguntaProAtendimento(task) {
  const nome = (typeof getAtendimentoDoCliente === "function" && getAtendimentoDoCliente(task.client)) || "";
  abrirThreadComentarios(task);
  const campo = document.getElementById("commentInput");
  if (!campo) return;
  campo.value = (nome ? `@${nome} ` : "") + "não achei o que precisa ser feito nessa tarefa — consegue detalhar aqui o que o cliente pediu?";
  campo.focus();
}

/**
 * Manda a Bee ler a tarefa em segundo plano, sem trocar de chat. O
 * resultado fica guardado aqui e no cache do backend (por conteúdo:
 * enquanto ninguém escrever nada novo, não gera outro pedido à IA).
 */
async function precarregarBee(task) {
  if (!task || !task.id) return;
  if (beeResumos.has(task.id) || beeCarregando.has(task.id)) return;
  await carregarBeeDaTarefa(task);
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return;
  if (chatThreadAtivo === "bee") desenharThreadBee(task);
  else inserirLinhaDaBeeNaThread(task);
}

/**
 * A linha fininha que aparece no FIM da conversa de comentários,
 * apontando pro chat da Bee. Ela existe pra não perder o "está tudo
 * ali": o resumo mora no chat dela, mas quem está lendo os comentários
 * vê que ele existe e chega lá num clique — sem repetir o texto em dois
 * lugares. Só aparece quando ela realmente tem algo resumido.
 */
function inserirLinhaDaBeeNaThread(task) {
  const thread = document.getElementById("commentsThread");
  if (!thread || !task || !task.id) return;
  const resumo = beeResumos.get(task.id);
  const itens = resumo && resumo.itens;
  if (!itens || !itens.length) return;
  if (thread.querySelector(".bee-linha")) return;

  thread.insertAdjacentHTML("beforeend", `
    <button type="button" class="bee-linha" id="beeLinhaAtalho">
      <span class="bee-linha-icone">${beeIcon}</span>
      <span>Bee resumiu o que foi pedido — ${itens.length} ${itens.length === 1 ? "item" : "itens"}</span>
      <span class="bee-linha-abrir">abrir</span>
    </button>
  `);
  const btn = document.getElementById("beeLinhaAtalho");
  if (btn) btn.addEventListener("click", () => abrirThreadBee(tasks[detailIdx] || task));
}

// ===== A BEE SOLTA: a bolinha no canto e o painel dela =====
//
// Aqui ela não lê tarefa, não sabe de cliente, não tem contexto nenhum do
// Runrun.it — é só uma especialista em design com quem dá pra pensar em
// voz alta. A Bee que CONHECE a tarefa é a de dentro do card; essa
// diferença está escrita na tela inicial pra não confundir.
//
// O painel tem DUAS telas: a inicial (atalhos + conversas recentes) e a
// conversa. Diferente de um pop-up, ele é um item flex do .page — por
// isso empurra o quadro pra esquerda em vez de cobrir.

let beeConversaAtual = null;   // {chave, titulo, mensagens} da conversa aberta
let beeRecentesLista = null;   // null = ainda não buscou
let beePensandoLivre = false;

// Atalhos da tela inicial. Cada um é só uma pergunta pronta — nenhum
// deles precisa de nada novo no backend, então nenhum é um botão morto.
const BEE_ATALHOS = [
  {
    icone: "✏️",
    titulo: "Gerar prompt<br>de imagem",
    pergunta: "Quero um prompt de imagem pro Firefly. Me pergunta o que você precisa saber (peça, clima, formato) e depois monta o prompt.",
  },
  {
    icone: "🎲",
    titulo: "Me inspirar",
    pergunta: "Preciso de referência visual. Me pergunta sobre o que é a peça e depois me dá caminhos de busca prontos no Behance, Pinterest, Mobbin e Awwwards, com os termos certos em inglês.",
  },
  {
    icone: "📐",
    titulo: "Formatos<br>e medidas",
    pergunta: "Me lembra os formatos e medidas certos pra essa peça. Me pergunta onde ela vai ser publicada.",
  },
  {
    icone: "✍️",
    titulo: "Revisar<br>meu texto",
    pergunta: "Vou colar um texto de peça e quero que você revise: clareza, tamanho, e se a chamada funciona. Pode pedir o texto.",
  },
];

function beeAbrirPainel() {
  document.body.classList.add("bee-aberta");
  const painel = document.getElementById("beePainel");
  if (painel) painel.setAttribute("aria-hidden", "false");
  if (beeRecentesLista === null) carregarRecentesDaBee();
  beeMostrarTela("inicio");
}

function beeFecharPainel() {
  document.body.classList.remove("bee-aberta");
  const painel = document.getElementById("beePainel");
  if (painel) painel.setAttribute("aria-hidden", "true");
}

function beeAlternarPainel() {
  if (document.body.classList.contains("bee-aberta")) beeFecharPainel();
  else beeAbrirPainel();
}

function beeMostrarTela(qual) {
  const inicio = document.getElementById("beeTelaInicio");
  const chat = document.getElementById("beeTelaChat");
  if (!inicio || !chat) return;
  inicio.hidden = qual !== "inicio";
  chat.hidden = qual !== "chat";
  const campo = document.getElementById(qual === "chat" ? "beeInputChat" : "beeInputInicio");
  if (campo) campo.focus();
}

// ===== Tela inicial =====

function desenharAtalhosDaBee() {
  const grid = document.getElementById("beeGrid");
  if (!grid) return;
  grid.innerHTML = BEE_ATALHOS.map((a, i) => `
    <button type="button" class="bee-card" data-atalho="${i}">
      <span class="bee-card-ico">${a.icone}</span>
      <span class="bee-card-nome">${a.titulo} <span class="bee-card-seta">→</span></span>
    </button>
  `).join("");
  grid.querySelectorAll("[data-atalho]").forEach(btn => {
    btn.addEventListener("click", () => {
      const atalho = BEE_ATALHOS[Number(btn.dataset.atalho)];
      if (atalho) beeNovaConversaCom(atalho.pergunta);
    });
  });
}

async function carregarRecentesDaBee() {
  const alvo = document.getElementById("beeRecentes");
  if (alvo) alvo.innerHTML = `<p class="bee-vazio">Carregando conversas...</p>`;
  const data = await chamarBackend({ acao: "beeConversasLivres", designer: DESIGNER_LOGADO });
  beeRecentesLista = (data && data.ok && data.conversas) ? data.conversas : [];
  desenharRecentesDaBee();
}

function desenharRecentesDaBee(filtro) {
  const alvo = document.getElementById("beeRecentes");
  if (!alvo) return;
  const termo = (filtro || "").trim().toLowerCase();
  const lista = (beeRecentesLista || []).filter(c =>
    !termo || (c.titulo + " " + c.previa).toLowerCase().indexOf(termo) !== -1
  );
  if (!lista.length) {
    alvo.innerHTML = `<p class="bee-vazio">${beeRecentesLista && beeRecentesLista.length
      ? "Nenhuma conversa com esse termo."
      : "Nenhuma conversa ainda. Escreve aí embaixo ou escolhe um atalho."}</p>`;
    return;
  }
  alvo.innerHTML = lista.map(c => `
    <button type="button" class="bee-recente" data-chave="${escaparHTML(c.chave)}">
      <span class="bee-avatar">${beeIcon}</span>
      <span class="bee-recente-txt">
        <span class="bee-recente-t">${escaparHTML(c.titulo)}</span>
        <span class="bee-recente-s">${escaparHTML(c.previa)}</span>
      </span>
      <span class="bee-recente-h">${tempoRelativoCurto(c.quando)}</span>
    </button>
  `).join("");
  alvo.querySelectorAll("[data-chave]").forEach(btn => {
    btn.addEventListener("click", () => beeAbrirConversa(btn.dataset.chave));
  });
}

// "2 h", "ontem", "3 d" — o suficiente pra situar sem ocupar espaço.
function tempoRelativoCurto(quando) {
  if (!quando) return "";
  const min = Math.floor((Date.now() - Number(quando)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return min + " min";
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas + " h";
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ontem" : dias + " d";
}

// ===== Tela de conversa =====

async function beeAbrirConversa(chave) {
  const info = (beeRecentesLista || []).find(c => c.chave === chave);
  beeConversaAtual = { chave, titulo: (info && info.titulo) || "Conversa", mensagens: [] };
  beeMostrarTela("chat");
  desenharTituloDaConversa();
  const thread = document.getElementById("beeThread");
  if (thread) thread.innerHTML = `<p class="bee-vazio">Abrindo...</p>`;

  const data = await chamarBackend({ acao: "beeHistoricoLivre", chave, designer: DESIGNER_LOGADO });
  // Trocou de conversa enquanto carregava? Compara pela chave.
  if (!beeConversaAtual || beeConversaAtual.chave !== chave) return;
  beeConversaAtual.mensagens = (data && data.ok && data.conversa) ? data.conversa : [];
  desenharConversaDaBee();
}

function beeNovaConversaCom(perguntaInicial) {
  beeConversaAtual = { chave: null, titulo: "Nova conversa", mensagens: [] };
  beeMostrarTela("chat");
  desenharTituloDaConversa();
  desenharConversaDaBee();
  if (perguntaInicial) enviarParaBeeLivre(perguntaInicial);
}

function desenharTituloDaConversa() {
  const el = document.getElementById("beeChatTitulo");
  if (el) el.textContent = (beeConversaAtual && beeConversaAtual.titulo) || "Conversa";
}

function desenharConversaDaBee() {
  const thread = document.getElementById("beeThread");
  if (!thread) return;
  const mensagens = (beeConversaAtual && beeConversaAtual.mensagens) || [];

  if (!mensagens.length && !beePensandoLivre) {
    const primeiroNome = (DESIGNER_LOGADO || "").split(" ")[0];
    thread.innerHTML = `
      <div class="comment-bubble bee-bubble">
        <span class="bee-avatar">${beeIcon}</span>
        <div class="comment-body">
          <div class="comment-meta"><span class="comment-author">Bee</span></div>
          <div class="comment-text">Oi${primeiroNome ? ", " + escaparHTML(primeiroNome) : ""}. Manda a pergunta.</div>
        </div>
      </div>`;
    return;
  }

  thread.innerHTML = mensagens.map(m => m.autor === "bee"
    ? `<div class="comment-bubble bee-bubble">
         <span class="bee-avatar">${beeIcon}</span>
         <div class="comment-body">
           <div class="comment-meta"><span class="comment-author">Bee</span></div>
           <div class="comment-text">${formatarFalaDaBee(m.texto)}</div>
         </div>
       </div>`
    : `<div class="comment-bubble mine">
         <div class="comment-body">
           <div class="comment-meta"><span class="comment-author">Você</span></div>
           <div class="comment-text">${linkifyTexto(escaparHTML(m.texto))}</div>
         </div>
       </div>`
  ).join("");

  if (beePensandoLivre) {
    thread.insertAdjacentHTML("beforeend", `<p class="bee-vazio">A Bee está pensando...</p>`);
  }
  // Os botões de copiar do bloco do Firefly são recriados a cada
  // redesenho (o innerHTML acima troca todos os elementos), então
  // precisam ser religados aqui.
  thread.querySelectorAll("[data-copiar]").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copiar)
        .then(() => mostrarToast("Prompt copiado."))
        .catch(() => mostrarToast("Não consegui copiar. Selecione o texto e copie na mão.", "erro"));
    });
  });
  thread.scrollTop = thread.scrollHeight;
}

async function enviarParaBeeLivre(textoDireto) {
  const campoChat = document.getElementById("beeInputChat");
  const campoInicio = document.getElementById("beeInputInicio");
  const texto = (textoDireto || (campoChat && !document.getElementById("beeTelaChat").hidden
    ? campoChat.value
    : (campoInicio ? campoInicio.value : ""))).trim();
  if (!texto || beePensandoLivre) return;
  if (campoChat) campoChat.value = "";
  if (campoInicio) campoInicio.value = "";

  // Escreveu direto na tela inicial: começa uma conversa nova.
  if (!beeConversaAtual) {
    beeConversaAtual = { chave: null, titulo: "Nova conversa", mensagens: [] };
    beeMostrarTela("chat");
    desenharTituloDaConversa();
  }

  beeConversaAtual.mensagens.push({ autor: "designer", texto, quando: Date.now() });
  beePensandoLivre = true;
  desenharConversaDaBee();

  const chaveNaHoraDoEnvio = beeConversaAtual.chave;
  const data = await chamarBackend({
    acao: "beeConversarLivre",
    pergunta: texto,
    designer: DESIGNER_LOGADO,
    chave: chaveNaHoraDoEnvio,
  });
  beePensandoLivre = false;

  // Trocou de conversa enquanto ela pensava? A resposta já foi salva no
  // backend, então não se perde — só não redesenha por cima da outra.
  const aindaNaMesma = beeConversaAtual && beeConversaAtual.chave === chaveNaHoraDoEnvio;

  if (!data || !data.ok) {
    if (aindaNaMesma) {
      // Tira a pergunta da lista: ela não virou conversa de verdade, e
      // deixar ali daria a impressão de que a Bee ignorou.
      const lista = beeConversaAtual.mensagens;
      if (lista.length && lista[lista.length - 1].autor === "designer") lista.pop();
      desenharConversaDaBee();
      const campo = document.getElementById("beeInputChat");
      if (campo && !campo.value.trim()) campo.value = texto; // devolve o que foi escrito
    }
    mostrarToast((data && data.error) || "A Bee não conseguiu responder agora.", "erro");
    return;
  }

  if (!aindaNaMesma) return;
  beeConversaAtual.chave = data.chave || beeConversaAtual.chave;
  beeConversaAtual.titulo = data.titulo || beeConversaAtual.titulo;
  beeConversaAtual.mensagens = data.conversa || beeConversaAtual.mensagens;
  desenharTituloDaConversa();
  desenharConversaDaBee();
  carregarRecentesDaBee(); // a lista de recentes mudou (conversa nova ou hora nova)
}

function ligarJanelaDaBee() {
  const fab = document.getElementById("beeFabBtn");
  if (fab) {
    fab.innerHTML = beeIcon;
    fab.addEventListener("click", beeAlternarPainel);
  }
  const avatar = document.getElementById("beeAvatarGrande");
  if (avatar) avatar.innerHTML = beeIcon;

  ["beeFechar", "beeFecharChat"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", beeFecharPainel);
  });

  const voltar = document.getElementById("beeVoltar");
  if (voltar) voltar.addEventListener("click", () => { beeConversaAtual = null; beeMostrarTela("inicio"); });

  const novo = document.getElementById("beeNovoChat");
  if (novo) novo.addEventListener("click", () => beeNovaConversaCom(null));

  [["beeEnviarInicio", "beeInputInicio"], ["beeEnviarChat", "beeInputChat"]].forEach(([botao, campo]) => {
    const b = document.getElementById(botao);
    if (b) b.addEventListener("click", () => enviarParaBeeLivre());
    const c = document.getElementById(campo);
    if (c) c.addEventListener("keydown", e => { if (e.key === "Enter") enviarParaBeeLivre(); });
  });

  const busca = document.getElementById("beeBusca");
  if (busca) busca.addEventListener("input", () => desenharRecentesDaBee(busca.value));

  desenharAtalhosDaBee();
}

/**
 * Manda a Bee ler a tarefa em segundo plano, sem trocar de chat. O
 * resultado fica guardado aqui e no cache do backend (por conteúdo:
 * enquanto ninguém escrever nada novo, não gera outro pedido à IA).
 */
async function precarregarBee(task) {
  if (!task || !task.id) return;
  if (beeResumos.has(task.id) || beeCarregando.has(task.id)) return;
  await carregarBeeDaTarefa(task);
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return;
  if (chatThreadAtivo === "bee") desenharThreadBee(task);
  else inserirLinhaDaBeeNaThread(task);
}

/**
 * A linha fininha que aparece no FIM da conversa de comentários,
 * apontando pro chat da Bee. Ela existe pra não perder o "está tudo
 * ali": o resumo mora no chat dela, mas quem está lendo os comentários
 * vê que ele existe e chega lá num clique — sem repetir o texto em dois
 * lugares. Só aparece quando ela realmente tem algo resumido.
 */
function inserirLinhaDaBeeNaThread(task) {
  const thread = document.getElementById("commentsThread");
  if (!thread || !task || !task.id) return;
  const resumo = beeResumos.get(task.id);
  const itens = resumo && resumo.itens;
  if (!itens || !itens.length) return;
  if (thread.querySelector(".bee-linha")) return;

  thread.insertAdjacentHTML("beforeend", `
    <button type="button" class="bee-linha" id="beeLinhaAtalho">
      <span class="bee-linha-icone">${beeIcon}</span>
      <span>Bee resumiu o que foi pedido — ${itens.length} ${itens.length === 1 ? "item" : "itens"}</span>
      <span class="bee-linha-abrir">abrir</span>
    </button>
  `);
  const btn = document.getElementById("beeLinhaAtalho");
  if (btn) btn.addEventListener("click", () => abrirThreadBee(tasks[detailIdx] || task));
}

// ===== A BEE SOLTA: a bolinha no canto da tela =====
//
// Aqui ela não lê tarefa, não sabe de cliente, não tem contexto nenhum do
// Runrun.it — é só uma especialista em design com quem dá pra pensar em
// voz alta. A Bee que CONHECE a tarefa é a de dentro do card; essa
// diferença está escrita no topo da janela pra não confundir.

let beeLivreConversa = null;   // null = ainda não buscou o histórico
let beeLivrePensando = false;

function alternarJanelaDaBee() {
  const janela = document.getElementById("beeJanela");
  if (!janela) return;
  if (janela.hidden) abrirJanelaDaBee();
  else janela.hidden = true;
}

async function abrirJanelaDaBee() {
  const janela = document.getElementById("beeJanela");
  if (!janela) return;
  janela.hidden = false;
  const campo = document.getElementById("beeJanelaInput");
  if (campo) campo.focus();

  if (beeLivreConversa === null) {
    desenharJanelaDaBee("<p class=\"comments-empty\">Abrindo...</p>");
    const data = await chamarBackend({ acao: "beeHistoricoLivre", designer: DESIGNER_LOGADO });
    beeLivreConversa = (data && data.ok && data.conversa) ? data.conversa : [];
  }
  desenharJanelaDaBee();
}

function desenharJanelaDaBee(htmlProvisorio) {
  const thread = document.getElementById("beeJanelaThread");
  if (!thread) return;
  if (htmlProvisorio) { thread.innerHTML = htmlProvisorio; return; }

  const conversa = beeLivreConversa || [];
  if (!conversa.length) {
    const primeiroNome = (DESIGNER_LOGADO || "").split(" ")[0];
    thread.innerHTML = `
      <div class="comment-bubble bee-bubble">
        <span class="bee-avatar">${beeIcon}</span>
        <div class="comment-body">
          <div class="comment-meta"><span class="comment-author">Bee</span></div>
          <div class="comment-text">
            <p>Oi${primeiroNome ? ", " + escaparHTML(primeiroNome) : ""}. Aqui eu não vejo suas tarefas — pra isso é só abrir o card e falar comigo por lá.</p>
            <p style="margin-top:6px">Nesta janela dá pra pensar em design: composição, cor, tipografia, referência, dúvida de ferramenta, texto de peça, ou montar um prompt de imagem pro Firefly.</p>
          </div>
        </div>
      </div>
    `;
  } else {
    thread.innerHTML = conversa.map(m => m.autor === "bee"
      ? `<div class="comment-bubble bee-bubble">
           <span class="bee-avatar">${beeIcon}</span>
           <div class="comment-body">
             <div class="comment-meta"><span class="comment-author">Bee</span></div>
             <div class="comment-text">${formatarFalaDaBee(m.texto)}</div>
           </div>
         </div>`
      : `<div class="comment-bubble mine">
           <div class="comment-body">
             <div class="comment-meta"><span class="comment-author">Você</span></div>
             <div class="comment-text">${linkifyTexto(escaparHTML(m.texto))}</div>
           </div>
         </div>`
    ).join("");
  }
  if (beeLivrePensando) {
    thread.insertAdjacentHTML("beforeend", `<p class="comments-empty">A Bee está pensando...</p>`);
  }
  // Os botões de copiar do bloco do Firefly precisam ser religados a cada
  // redesenho (o innerHTML acima recria todos os elementos).
  thread.querySelectorAll("[data-copiar]").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copiar)
        .then(() => mostrarToast("Prompt copiado."))
        .catch(() => mostrarToast("Não consegui copiar. Selecione o texto e copie na mão.", "erro"));
    });
  });
  thread.scrollTop = thread.scrollHeight;
}

async function enviarParaBeeLivre() {
  const campo = document.getElementById("beeJanelaInput");
  if (!campo) return;
  const texto = campo.value.trim();
  if (!texto || beeLivrePensando) return;
  campo.value = "";

  beeLivreConversa = (beeLivreConversa || []).concat([{ autor: "designer", texto, quando: Date.now() }]);
  beeLivrePensando = true;
  desenharJanelaDaBee();

  const data = await chamarBackend({ acao: "beeConversarLivre", pergunta: texto, designer: DESIGNER_LOGADO });
  beeLivrePensando = false;

  if (!data || !data.ok) {
    // Tira a pergunta da lista: ela não virou conversa de verdade, e
    // deixar ali daria a impressão de que a Bee ignorou.
    beeLivreConversa = beeLivreConversa.filter((m, i) => !(i === beeLivreConversa.length - 1 && m.autor === "designer"));
    desenharJanelaDaBee();
    // Devolve o texto pro campo em vez de perder o que foi escrito.
    if (campo && !campo.value.trim()) campo.value = texto;
    mostrarToast((data && data.error) || "A Bee não conseguiu responder agora.", "erro");
    return;
  }
  beeLivreConversa = data.conversa || beeLivreConversa;
  desenharJanelaDaBee();
}

function ligarJanelaDaBee() {
  const fab = document.getElementById("beeFabBtn");
  if (fab) {
    fab.innerHTML = beeIcon;
    fab.addEventListener("click", alternarJanelaDaBee);
  }
  const icone = document.getElementById("beeJanelaIcone");
  if (icone) icone.innerHTML = beeIcon;

  const fechar = document.getElementById("beeJanelaFechar");
  if (fechar) fechar.addEventListener("click", () => {
    const janela = document.getElementById("beeJanela");
    if (janela) janela.hidden = true;
  });

  const enviar = document.getElementById("beeJanelaEnviar");
  if (enviar) enviar.addEventListener("click", enviarParaBeeLivre);

  const campo = document.getElementById("beeJanelaInput");
  if (campo) {
    campo.addEventListener("keydown", e => {
      if (e.key === "Enter") enviarParaBeeLivre();
    });
  }
}

// ===== Perguntar pra Bee =====

async function perguntarParaBee(task, texto) {
  const taskId = task.id;
  if (!taskId || !texto) return;

  const conversa = beeConversas.get(taskId) || [];
  conversa.push({ autor: "designer", texto, quando: Date.now() });
  beeConversas.set(taskId, conversa);
  desenharThreadBee(task);

  const thread = document.getElementById("commentsThread");
  if (thread) {
    thread.insertAdjacentHTML("beforeend", `<p class="comments-empty" id="beePensando">A Bee está pensando...</p>`);
    thread.scrollTop = thread.scrollHeight;
  }

  const original = typeof acharTarefaOriginalDaAlteracao === "function"
    ? acharTarefaOriginalDaAlteracao(task)
    : null;
  const data = await chamarBackend({
    acao: "beeConversar",
    taskId,
    pergunta: texto,
    idOriginal: original ? original.id : null,
    // Quem está falando: é isso que faz ela chamar cada um pelo nome.
    designer: DESIGNER_LOGADO,
  });

  // Trocou de tarefa ou de chat enquanto ela pensava? A resposta fica
  // guardada mesmo assim (o backend já salvou) — só não redesenha aqui.
  const aindaAqui = chatThreadAtivo === "bee" && tasks[detailIdx] && String(tasks[detailIdx].id) === String(taskId);

  if (!data || !data.ok) {
    // Tira a pergunta da lista: ela não chegou a virar conversa de
    // verdade, e deixar ali daria a impressão de que a Bee ignorou.
    const lista = beeConversas.get(taskId) || [];
    if (lista.length && lista[lista.length - 1].autor === "designer") lista.pop();
    beeConversas.set(taskId, lista);
    if (aindaAqui) desenharThreadBee(task);
    mostrarToast((data && data.error) || "A Bee não conseguiu responder agora.", "erro");
    return;
  }

  beeConversas.set(taskId, data.conversa || conversa);
  if (aindaAqui) desenharThreadBee(task);
}
