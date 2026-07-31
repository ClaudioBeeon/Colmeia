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
    + conversa.map((m, i) => renderMensagemDaConversa(m, i, taskId)).join("")
    + `<div class="bee-pastilhas"><button type="button" class="bee-acao" id="beeInspirarBtn">🎲 Me inspirar nessa peça</button></div>`;
  wireThreadBee(task);
  ligarCliquesDeResultadoFuncional(thread);
  ligarChecklistsDaBee(thread);
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

function renderMensagemDaConversa(m, indice, chaveConversa) {
  if (m.autor === "bee") {
    if (m._funcional) return bolhaDaBee(renderRespostaFuncional(m._funcional), indice);
    const extra = m._inspiracao ? renderLinksDeInspiracao(m._inspiracao.termos) : "";
    return bolhaDaBee(formatarFalaDaBee(m.texto, chaveConversa, indice) + extra, indice);
  }
  return `
    <div class="comment-bubble mine" data-bee-indice="${indice}">
      ${avatarHTML(DESIGNER_LOGADO, "avatar-sm comment-avatar")}
      <div class="comment-body">
        <div class="comment-meta">
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
// "- [ ] item" ou "- [x] item" — a Bee escreve nesse formato quando
// pedem um checklist (ver BEE_INSTRUCOES_CONVERSA/LIVRE em Bee.gs).
const REGEX_CHECKLIST_ITEM = /^\s*-\s*\[( |x|X)\]\s*(.+)$/;

/**
 * @param {string} texto
 * @param {string|number} [chaveConversa]  taskId (chat da tarefa) ou a
 *        chave da conversa livre — sem isso os itens de checklist
 *        aparecem só como texto (não dá pra marcar sem saber ONDE salvar).
 * @param {number} [indiceMensagem]  posição dessa mensagem no array da
 *        conversa — junto com o índice da LINHA, é o endereço completo
 *        de um item, usado pra reescrever só aquela linha ao marcar.
 */
function formatarFalaDaBee(texto, chaveConversa, indiceMensagem) {
  return escaparHTML(texto)
    .split("\n")
    .map((linha, i) => {
      const itemChecklist = linha.match(REGEX_CHECKLIST_ITEM);
      if (itemChecklist && chaveConversa != null && indiceMensagem != null) {
        const marcado = /x/i.test(itemChecklist[1]);
        return `
          <label class="bee-checklist-item">
            <input type="checkbox" ${marcado ? "checked" : ""}
              data-checklist-chave="${escaparHTML(String(chaveConversa))}"
              data-checklist-msg="${indiceMensagem}" data-checklist-linha="${i}">
            <span>${itemChecklist[2]}</span>
          </label>
        `;
      }
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
    .replace(/<br>(\s*<div class="bee-firefly")/g, "$1")
    .replace(/<br>(\s*<label class="bee-checklist-item")/g, "$1")
    .replace(/(<\/label>\s*)<br>/g, "$1");
}

/**
 * Marca/desmarca um item de checklist DENTRO do texto da mensagem —
 * reescreve só a linha certa ("- [ ]" vira "- [x]" ou o contrário) e
 * salva no backend. Otimista: o checkbox já mudou na tela pelo próprio
 * clique nativo do navegador, então aqui só persiste.
 */
async function alternarItemDeChecklist(input) {
  const chave = input.dataset.checklistChave;
  const indiceMsg = Number(input.dataset.checklistMsg);
  const indiceLinha = Number(input.dataset.checklistLinha);
  if (!chave) return;

  // A mesma chave serve tanto pra conversa de uma tarefa (beeConversas,
  // chave = taskId) quanto pra livre (beeConversaAtual) — descobre qual
  // é olhando onde essa chave está guardada.
  let mensagens = beeConversas.get(chave) || beeConversas.get(Number(chave));
  let ehLivre = false;
  if (!mensagens && beeConversaAtual && String(beeConversaAtual.chave) === String(chave)) {
    mensagens = beeConversaAtual.mensagens;
    ehLivre = true;
  }
  const msg = mensagens && mensagens[indiceMsg];
  if (!msg) return;

  const linhas = msg.texto.split("\n");
  const linha = linhas[indiceLinha];
  const item = linha && linha.match(REGEX_CHECKLIST_ITEM);
  if (!item) return;
  linhas[indiceLinha] = linha.replace(REGEX_CHECKLIST_ITEM, `- [${input.checked ? "x" : " "}] ${item[2]}`);
  msg.texto = linhas.join("\n");

  const data = await chamarBackend({ acao: "beeAtualizarMensagem", chave, indice: indiceMsg, texto: msg.texto });
  if (!data || !data.ok) {
    input.checked = !input.checked; // não salvou — desfaz o clique
    mostrarToast("Não consegui salvar essa marcação agora.", "erro");
  }
}

function ligarChecklistsDaBee(escopo) {
  escopo.querySelectorAll("[data-checklist-chave]").forEach(input => {
    input.addEventListener("change", () => alternarItemDeChecklist(input));
  });
}

// ===== Perguntas FUNCIONAIS =====
//
// Achar link, achar responsável, achar card mãe: são coisas que dá pra
// responder na hora com uma busca/consulta direta, sem precisar da IA
// "pensar" — e são mais confiáveis assim (é dado de verdade, não texto
// gerado). Por isso, antes de mandar a pergunta pro Gemini, o Colmeia
// tenta reconhecer esses três casos e responde direto, com um cartão
// clicável dentro da própria bolha da Bee — funciona tanto no chat da
// tarefa quanto na Bee solta (a bolinha do canto).
//
// Se nada bater, cai no fluxo normal (a conversa com a IA), sem custar
// nada a mais.

/**
 * @param {string} pergunta
 * @param {Object} [contexto]  { cliente } quando a pergunta é dentro de
 *                              uma tarefa — já sabe de qual cliente é,
 *                              sem precisar adivinhar pelo texto.
 * @returns {Promise<{tipo, dados}|null>}  null = não reconheceu nada,
 *                              segue pro fluxo normal com a IA.
 */
async function beeReconhecerPerguntaFuncional(pergunta, contexto) {
  const texto = normalizarParaComparar(pergunta);
  const clientes = typeof listarTodosClientesConhecidos === "function" ? listarTodosClientesConhecidos() : [];
  const clienteDoContexto = (contexto && contexto.cliente) || null;
  const clienteCitado = clientes.find(c => texto.includes(normalizarParaComparar(c)));
  const cliente = clienteCitado || clienteDoContexto;

  if (/\b(link|url)\b/.test(texto) && /\b(cad[eê]|onde|achar|acha|procura)\b/.test(texto)) {
    const data = await chamarBackend({ acao: "beeBuscarLink", termo: pergunta, cliente });
    return { tipo: "link", pergunta, cliente, resultados: (data && data.ok) ? data.resultados : [] };
  }

  if (/atendimento|discord|quem cuida|quem.*respons[aá]vel/.test(texto)) {
    const alvo = cliente || clientes.find(c => texto.includes(normalizarParaComparar(c)));
    if (alvo) return { tipo: "responsavel", pergunta, cliente: alvo };
  }

  if (/campanha|card m[aã]e/.test(texto)) {
    const data = await chamarBackend({ acao: "beeAcharCardMae", termo: pergunta, cliente });
    return { tipo: "cardmae", pergunta, cliente, resultados: (data && data.ok) ? data.resultados : [] };
  }

  // "Localizar tal arte no drive", "cadê o brandbook no drive" — sem essa
  // entrada, isso caía direto na conversa livre, que genuinamente NÃO tem
  // acesso ao Drive (só a busca funcional tem) e só respondia "não tenho
  // acesso" — o mesmo bug do "achar a tarefa de X" de baixo, mas pro Drive.
  if (/\bdrive\b/.test(texto) && /\b(cad[eê]|onde|achar|acha|procura|procurar|tem|alguma|manda|link)\b/.test(texto)) {
    const data = await chamarBackend({ acao: "beeBuscarDrive", termo: pergunta, cliente });
    return { tipo: "arquivo", pergunta, cliente, resultados: (data && data.ok) ? data.resultados : [] };
  }

  // Caso mais comum de todos, e o que faltava: "achar a tarefa de X",
  // "onde está o card de Y", "qual é a tarefa do Z" — sem essa entrada
  // genérica, qualquer pergunta assim caía direto na conversa livre, que
  // NÃO tem acesso a tarefa nenhuma (de propósito) e só respondia "não
  // tenho acesso" — verdade, mas inútil, já que o Colmeia TEM esse dado.
  if (/\b(cad[eê]|onde|achar|acha|procura|procurar|qual)\b/.test(texto)) {
    const achadas = buscarTarefasPorAssunto(pergunta);
    if (achadas.length) return { tipo: "tarefa", pergunta, resultados: achadas };
  }

  return null;
}

// Palavras que não ajudam a achar nada (a pergunta inteira vira "achar
// a tarefa de comunicação de vagas" → o que importa é "comunicação" e
// "vagas", não "achar"/"a"/"tarefa"/"de"). Comparar a FRASE inteira
// contra o título nunca bateria; comparar palavra por palavra, sim.
const BEE_PALAVRAS_VAZIAS = new Set([
  "achar", "acha", "procurar", "procura", "cade", "cadê", "onde", "fica", "ficou",
  "qual", "quais", "tem", "alguma", "algum", "alguem", "alguém", "a", "o", "as", "os",
  "de", "da", "do", "das", "dos", "em", "no", "na", "pra", "pro", "para", "por",
  "sobre", "que", "foi", "e", "é", "esta", "está", "tarefa", "card", "favor",
  "voce", "você", "me", "consegue", "preciso", "gostaria", "queria", "quero",
]);

function buscarTarefasPorAssunto(pergunta) {
  const chaves = normalizarParaComparar(pergunta).split(/\s+/).filter(p => p.length > 2 && !BEE_PALAVRAS_VAZIAS.has(p));
  if (!chaves.length) return [];
  const lista = (typeof tasksTodas !== "undefined" && tasksTodas.length) ? tasksTodas : tasks;
  return lista
    .map(t => {
      const alvo = normalizarParaComparar(t.title + " " + (t.client || ""));
      const pontos = chaves.reduce((acc, p) => acc + (alvo.includes(p) ? 1 : 0), 0);
      return { t, pontos };
    })
    .filter(x => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 8)
    .map(x => x.t);
}

// Vira uma "fala da Bee" comum (mesmo formato das outras), só que com
// _funcional guardando o tipo/resultado — é isso que faz desenharThreadBee/
// desenharJanelaDaBee saberem montar o cartão certo em vez de markdown.
function beeMensagemFuncional(resultado) {
  return { autor: "bee", texto: "", quando: Date.now(), _funcional: resultado };
}

function renderRespostaFuncional(f) {
  if (f.tipo === "link") {
    if (!f.resultados.length) {
      return `<p>Não achei nenhum link ${f.cliente ? "do cliente " + escaparHTML(f.cliente) : ""} batendo com isso. Pode ter sumido do índice — ele é atualizado 1x por dia.</p>`;
    }
    return `<p class="bee-titulo">Achei ${f.resultados.length === 1 ? "este link" : "estes links"}</p>` +
      `<div class="bee-cards">` + f.resultados.map(r => `
        <div class="bee-card-resultado">
          <div class="bee-card-resultado-topo">
            <span class="bee-card-resultado-titulo">${escaparHTML(r.tarefa || "tarefa")}</span>
            ${r.cliente ? `<span class="bee-card-resultado-tag">${escaparHTML(r.cliente)}</span>` : ""}
          </div>
          ${r.trecho ? `<p class="bee-card-resultado-trecho">"...${escaparHTML(r.trecho)}"</p>` : ""}
          <div class="bee-card-resultado-meta">${escaparHTML(r.autor || "")}${r.data ? " · " + beeDataCurtaFront(r.data) : ""}</div>
          <div class="bee-card-resultado-acoes">
            <a class="bee-acao principal" href="${escaparHTML(r.url)}" target="_blank" rel="noopener">Abrir link</a>
            <button type="button" class="bee-acao" data-abrir-tarefa="${Number(r.taskId)}">Abrir tarefa</button>
          </div>
        </div>
      `).join("") + `</div>`;
  }

  if (f.tipo === "arquivo") {
    if (!f.resultados.length) {
      return `<p>Não achei nada no Drive ${f.cliente ? "do cliente " + escaparHTML(f.cliente) : ""} batendo com isso.</p>`;
    }
    return `<p class="bee-titulo">Achei ${f.resultados.length === 1 ? "isto" : "estes"} no Drive</p>` +
      `<div class="bee-cards">` + f.resultados.map(a => `
        <div class="bee-card-resultado">
          <div class="bee-card-resultado-topo">
            <span class="bee-card-resultado-titulo">${escaparHTML(a.nome)}</span>
            ${a.tipo === "pasta" ? `<span class="bee-card-resultado-tag">pasta</span>` : ""}
          </div>
          ${a.caminho ? `<p class="bee-card-resultado-trecho">${escaparHTML(a.caminho)}</p>` : ""}
          <div class="bee-card-resultado-acoes">
            <a class="bee-acao principal" href="${escaparHTML(a.url)}" target="_blank" rel="noopener">Abrir</a>
          </div>
        </div>
      `).join("") + `</div>`;
  }

  if (f.tipo === "cardmae") {
    if (!f.resultados.length) {
      return `<p>Não achei nenhuma campanha ${f.cliente ? "do cliente " + escaparHTML(f.cliente) : ""} batendo com isso.</p>`;
    }
    return `<p class="bee-titulo">Achei ${f.resultados.length === 1 ? "esta campanha" : "estas campanhas"}</p>` +
      `<div class="bee-cards">` + f.resultados.map(r => `
        <button type="button" class="bee-card-resultado bee-card-resultado-clicavel" data-abrir-tarefa="${Number(r.taskId)}">
          <div class="bee-card-resultado-topo">
            <span class="bee-card-resultado-titulo">${escaparHTML(r.titulo)}</span>
            ${r.cliente ? `<span class="bee-card-resultado-tag">${escaparHTML(r.cliente)}</span>` : ""}
          </div>
          <div class="bee-card-resultado-meta">${escaparHTML(r.etapa || "Card mãe")}</div>
        </button>
      `).join("") + `</div>`;
  }

  if (f.tipo === "tarefa") {
    if (!f.resultados.length) return `<p>Não achei nenhuma tarefa batendo com isso.</p>`;
    return `<p class="bee-titulo">Achei ${f.resultados.length === 1 ? "esta tarefa" : "estas tarefas"}</p>` +
      `<div class="bee-cards">` + f.resultados.map(t => `
        <button type="button" class="bee-card-resultado bee-card-resultado-clicavel" data-abrir-tarefa="${Number(t.id)}">
          <div class="bee-card-resultado-topo">
            <span class="bee-card-resultado-titulo">${escaparHTML(t.title)}</span>
            ${t.client ? `<span class="bee-card-resultado-tag">${escaparHTML(t.client)}</span>` : ""}
          </div>
          ${t.runrunStage ? `<div class="bee-card-resultado-meta">${escaparHTML(t.runrunStage)}</div>` : ""}
        </button>
      `).join("") + `</div>`;
  }

  if (f.tipo === "responsavel") {
    const nomeAtendimento = (typeof getAtendimentoDoCliente === "function" && getAtendimentoDoCliente(f.cliente)) || null;
    if (!nomeAtendimento) {
      return `<p>Não achei quem atende o cliente ${escaparHTML(f.cliente)}. Vale conferir em Configurações › Clientes por atendimento.</p>`;
    }
    const linkPessoa = typeof getDiscordDaPessoa === "function" ? getDiscordDaPessoa(nomeAtendimento) : null;
    const avatar = typeof avatarAtendimentoHTML === "function" ? avatarAtendimentoHTML(nomeAtendimento, "avatar-sm") : "";
    return `
      <p class="bee-titulo">Atendimento de ${escaparHTML(f.cliente)}</p>
      <div class="bee-pessoa-resultado">
        ${avatar}
        <span class="bee-pessoa-resultado-nome">${escaparHTML(nomeAtendimento)}</span>
      </div>
      ${linkPessoa
        ? `<a class="bee-acao principal" href="${escaparHTML(linkPessoa)}" target="_blank" rel="noopener">${discordIcon} Chamar no Discord</a>`
        : `<p class="bee-aviso">Sem Discord cadastrado pra essa pessoa (Configurações › Pessoas).</p>`}
    `;
  }

  return "";
}

function beeDataCurtaFront(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch (e) {
    return "";
  }
}

function ligarCliquesDeResultadoFuncional(escopo) {
  escopo.querySelectorAll("[data-abrir-tarefa]").forEach(el => {
    el.addEventListener("click", () => {
      beeFecharPainel();
      abrirTarefaPorId(Number(el.dataset.abrirTarefa));
    });
  });
}

// ===== Ações da Bee dentro da tarefa =====

/**
 * "🎲 Inspirar": ela lê a tarefa e devolve por onde procurar referência.
 * O Colmeia NÃO consegue trazer as imagens do Behance/Pinterest (esses
 * sites bloqueiam robô), então o que ela entrega são os TERMOS certos,
 * em inglês, já virados em links de busca. Ela não escolhe a referência
 * por você — te põe na prateleira certa.
 */
async function inspirarComABee(task) {
  const taskId = task.id;
  if (!taskId) return;
  abrirThreadBee(task);

  const conversa = beeConversas.get(taskId) || [];
  conversa.push({ autor: "designer", texto: "Me dá referência pra essa peça.", quando: Date.now() });
  beeConversas.set(taskId, conversa);
  desenharThreadBee(task);

  const thread = document.getElementById("commentsThread");
  if (thread) {
    thread.insertAdjacentHTML("beforeend", `<p class="comments-empty">A Bee está pensando na referência...</p>`);
    thread.scrollTop = thread.scrollHeight;
  }

  const original = typeof acharTarefaOriginalDaAlteracao === "function" ? acharTarefaOriginalDaAlteracao(task) : null;
  const data = await chamarBackend({ acao: "beeInspirar", taskId, idOriginal: original ? original.id : null });
  const aindaAqui = chatThreadAtivo === "bee" && tasks[detailIdx] && String(tasks[detailIdx].id) === String(taskId);

  if (!data || !data.ok) {
    const lista = beeConversas.get(taskId) || [];
    if (lista.length && lista[lista.length - 1].autor === "designer") lista.pop();
    if (aindaAqui) desenharThreadBee(task);
    mostrarToast((data && data.error) || "A Bee não conseguiu pensar na referência agora.", "erro");
    return;
  }

  conversa.push({ autor: "bee", texto: textoDaInspiracao(data), quando: Date.now(), _inspiracao: data });
  beeConversas.set(taskId, conversa);
  if (aindaAqui) desenharThreadBee(task);
}

const BEE_SITES_REFERENCIA = [
  { nome: "Behance", url: t => "https://www.behance.net/search/projects?search=" + encodeURIComponent(t) },
  { nome: "Pinterest", url: t => "https://br.pinterest.com/search/pins/?q=" + encodeURIComponent(t) },
  { nome: "Mobbin", url: t => "https://mobbin.com/search?q=" + encodeURIComponent(t) },
  { nome: "Awwwards", url: t => "https://www.awwwards.com/websites/?text=" + encodeURIComponent(t) },
];

// A resposta dela vira texto (pra ficar guardada na conversa como
// qualquer outra) e os links são montados na hora de desenhar.
function textoDaInspiracao(data) {
  const partes = [];
  if (data.caminhos && data.caminhos.length) {
    partes.push("Três caminhos possíveis:");
    data.caminhos.forEach(c => partes.push("• " + c));
  }
  if (data.observacao) partes.push(data.observacao);
  if (data.termos && data.termos.length) {
    partes.push("");
    partes.push("Procura por: " + data.termos.join(" · "));
  }
  return partes.join("\n");
}

function renderLinksDeInspiracao(termos) {
  if (!termos || !termos.length) return "";
  return `
    <div class="bee-inspirar">
      ${termos.map(t => `
        <div class="bee-inspirar-linha">
          <span class="bee-inspirar-termo">${escaparHTML(t)}</span>
          <span class="bee-inspirar-sites">
            ${BEE_SITES_REFERENCIA.map(s => `<a class="bee-acao" href="${s.url(t)}" target="_blank" rel="noopener">${s.nome}</a>`).join("")}
          </span>
        </div>
      `).join("")}
    </div>
  `;
}

/**
 * "Conferir o que falta": compara o que foi pedido com os arquivos que
 * subiram na pasta do card. Só roda no clique — nunca sozinha.
 */
async function conferirEntregaComABee(task, btn) {
  if (!task || !task.id) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Conferindo...";
  abrirThreadBee(task);

  const data = await chamarBackend({
    acao: "beeConferirEntrega",
    taskId: task.id,
    idOriginal: (typeof acharTarefaOriginalDaAlteracao === "function" && acharTarefaOriginalDaAlteracao(task) || {}).id || null,
    cliente: task.client || null,
  });

  const btnAgora = document.getElementById("beeConferirBtn");
  if (btnAgora) { btnAgora.disabled = false; btnAgora.textContent = original; }

  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "A Bee não conseguiu conferir agora.", "erro");
    return;
  }
  beeConversas.set(task.id, data.conversa || beeConversas.get(task.id) || []);
  if (chatThreadAtivo === "bee" && tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id)) {
    desenharThreadBee(task);
  }
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

  const inspirarBtn = thread.querySelector("#beeInspirarBtn");
  if (inspirarBtn) inspirarBtn.addEventListener("click", () => inspirarComABee(task));

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
  beeMostrarTela("inicio");
  // Busca as recentes só DEPOIS do primeiro quadro da animação — antes,
  // o innerHTML "Carregando conversas..." era escrito no mesmíssimo
  // instante em que a classe .bee-aberta entrava, competindo pela
  // thread com o primeiro frame da transição (que mexe em margin-right,
  // uma propriedade de layout) e deixando a ABERTURA travada. O fechar
  // nunca teve esse problema por não disparar nenhum trabalho extra.
  requestAnimationFrame(() => {
    if (beeRecentesLista === null) carregarRecentesDaBee();
  });
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
      <span class="bee-recente-excluir" data-excluir="${escaparHTML(c.chave)}" title="Excluir">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </button>
  `).join("");
  alvo.querySelectorAll("[data-chave]").forEach(btn => {
    btn.addEventListener("click", () => beeAbrirConversa(btn.dataset.chave));
  });
  alvo.querySelectorAll("[data-excluir]").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      excluirConversaLivre(el.dataset.excluir);
    });
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

/**
 * Apaga uma conversa livre — chamado tanto pelo "x" na lista de
 * recentes quanto pelo ícone de lixeira dentro do próprio chat.
 * Otimista: some da lista na hora, sem esperar o backend confirmar.
 */
async function excluirConversaLivre(chave) {
  if (!chave) return;
  const antes = beeRecentesLista;
  beeRecentesLista = (beeRecentesLista || []).filter(c => c.chave !== chave);
  desenharRecentesDaBee();
  const data = await chamarBackend({ acao: "beeExcluirConversaLivre", chave });
  if (!data || !data.ok) {
    beeRecentesLista = antes; // Runrun.it recusou (não deveria acontecer aqui) — volta como estava
    desenharRecentesDaBee();
    mostrarToast((data && data.error) || "Não consegui excluir essa conversa agora.", "erro");
  }
}

function excluirConversaAtual() {
  if (!beeConversaAtual || !beeConversaAtual.chave) {
    // Conversa nova, ainda sem nada salvo no backend — só fecha.
    beeConversaAtual = null;
    beeMostrarTela("inicio");
    return;
  }
  if (!confirm("Excluir essa conversa com a Bee?")) return;
  const chave = beeConversaAtual.chave;
  beeConversaAtual = null;
  beeMostrarTela("inicio");
  excluirConversaLivre(chave);
}

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

  const chaveAtual = beeConversaAtual && beeConversaAtual.chave;
  thread.innerHTML = mensagens.map((m, i) => m.autor === "bee"
    ? `<div class="comment-bubble bee-bubble">
         <span class="bee-avatar">${beeIcon}</span>
         <div class="comment-body">
           <div class="comment-meta"><span class="comment-author">Bee</span></div>
           <div class="comment-text">${m._funcional ? renderRespostaFuncional(m._funcional) : formatarFalaDaBee(m.texto, chaveAtual, i)}</div>
         </div>
       </div>`
    : `<div class="comment-bubble mine">
         ${avatarHTML(DESIGNER_LOGADO, "avatar-sm comment-avatar")}
         <div class="comment-body">
           <div class="comment-meta"><span class="comment-author">Você</span></div>
           <div class="comment-text">${linkifyTexto(escaparHTML(m.texto))}</div>
         </div>
       </div>`
  ).join("");

  if (beePensandoLivre) {
    thread.insertAdjacentHTML("beforeend", `<p class="bee-vazio">A Bee está pensando...</p>`);
  }
  ligarCliquesDeResultadoFuncional(thread);
  ligarChecklistsDaBee(thread);
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

  // Pergunta funcional? Responde na hora, sem gastar IA nem gravar no
  // backend — a Bee solta não guarda histórico de resultado de busca, só
  // de conversa de verdade.
  const reconhecida = await beeReconhecerPerguntaFuncional(texto, {});
  if (reconhecida) {
    beePensandoLivre = false;
    beeConversaAtual.mensagens.push(beeMensagemFuncional(reconhecida));
    desenharConversaDaBee();
    return;
  }

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

// ===== Busca universal =====
//
// Divisão de trabalho de propósito: o que o Colmeia JÁ TEM na memória
// (tarefas, clientes, conversas com a Bee) é procurado aqui mesmo, na
// hora e de graça. Só os arquivos e pastas do Drive precisam do backend
// — e lá a busca lê um índice montado 1x por dia, então também é rápida.
//
// Comentários ficaram de fora por enquanto: procurar neles exigiria
// buscar tarefa por tarefa no Runrun.it a cada tecla digitada.

let _buscaTimer = null;
let _buscaSequencia = 0;

function agendarBuscaUniversal(termo) {
  clearTimeout(_buscaTimer);
  const texto = (termo || "").trim();
  const wrap = document.getElementById("beeBuscaClienteWrap");
  if (texto.length < 2) {
    if (wrap) wrap.hidden = true;
    desenharRecentesDaBee(texto);
    return;
  }
  prepararSeletorDeCliente(texto);
  // Mostra na hora o que é local; o Drive chega logo depois.
  desenharResultadosDaBusca(texto, buscarLocalmente(texto), null);
  _buscaTimer = setTimeout(() => buscarNoDrivePelaBee(texto), 420);
}

// Qual cliente está escolhido pra busca no Drive. "" = todos.
let beeClienteDaBusca = "";

/**
 * Mostra o seletor de cliente e tenta adivinhar sozinho: se o que a
 * pessoa digitou contém o nome de um cliente conhecido, já escolhe ele.
 * "brandbook do beeon" vira busca só na pasta do Beeon, sem ninguém
 * precisar clicar em nada.
 */
function prepararSeletorDeCliente(termo) {
  const wrap = document.getElementById("beeBuscaClienteWrap");
  const select = document.getElementById("beeBuscaCliente");
  if (!wrap || !select) return;
  wrap.hidden = false;

  const clientes = typeof listarTodosClientesConhecidos === "function" ? listarTodosClientesConhecidos() : [];
  if (!select.options.length) {
    select.innerHTML = `<option value="">todos os clientes</option>`
      + clientes.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(c)}</option>`).join("");
    select.addEventListener("change", () => {
      beeClienteDaBusca = select.value;
      select.dataset.escolhaManual = "1";
      const campo = document.getElementById("beeBusca");
      if (campo && campo.value.trim().length >= 2) {
        desenharResultadosDaBusca(campo.value.trim(), buscarLocalmente(campo.value.trim()), null);
        buscarNoDrivePelaBee(campo.value.trim());
      }
    });
  }

  // Só adivinha enquanto ninguém escolheu na mão — senão o palpite
  // ficaria trocando a escolha da pessoa a cada tecla.
  if (select.dataset.escolhaManual === "1") return;
  const alvo = normalizarParaComparar(termo);
  const achado = clientes.find(c => alvo.includes(normalizarParaComparar(c)));
  beeClienteDaBusca = achado || "";
  select.value = beeClienteDaBusca;
}

function buscarLocalmente(termo) {
  const alvo = normalizarParaComparar(termo);
  const bate = t => normalizarParaComparar(t || "").includes(alvo);

  const lista = (typeof tasksTodas !== "undefined" && tasksTodas.length) ? tasksTodas : tasks;
  const tarefas = lista.filter(t => bate(t.title) || bate(t.client)).slice(0, 6);

  const clientes = (typeof listarTodosClientesConhecidos === "function"
    ? listarTodosClientesConhecidos()
    : []).filter(bate).slice(0, 4);

  const conversas = (beeRecentesLista || [])
    .filter(c => bate(c.titulo) || bate(c.previa)).slice(0, 4);

  return { tarefas, clientes, conversas };
}

async function buscarNoDrivePelaBee(termo) {
  const meu = ++_buscaSequencia;
  const data = await chamarBackend({ acao: "beeBuscarDrive", termo, cliente: beeClienteDaBusca || null });
  // Chegou depois de uma busca mais nova? Descarta — senão a tela pisca
  // com o resultado de um termo que a pessoa já apagou.
  if (meu !== _buscaSequencia) return;
  const campo = document.getElementById("beeBusca");
  if (!campo || campo.value.trim() !== termo) return;
  desenharResultadosDaBusca(termo, buscarLocalmente(termo), (data && data.ok) ? data.resultados : []);
}

function desenharResultadosDaBusca(termo, local, arquivos) {
  const alvo = document.getElementById("beeRecentes");
  if (!alvo) return;
  const blocos = [];

  if (local.tarefas.length) {
    blocos.push(blocoDeBusca("Tarefas", local.tarefas.map(t => ({
      titulo: t.title,
      sub: t.client || "",
      acao: `abrirTarefaPorId(${Number(t.id)})`,
    }))));
  }
  if (arquivos && arquivos.length) {
    blocos.push(blocoDeBusca(beeClienteDaBusca ? `No Drive · ${escaparHTML(beeClienteDaBusca)}` : "No Drive", arquivos.map(a => ({
      titulo: a.nome,
      sub: (a.tipo === "pasta" ? "pasta · " : "") + (a.caminho || ""),
      url: a.url,
    }))));
  } else if (arquivos === null) {
    blocos.push(`<p class="bee-vazio">Procurando no Drive...</p>`);
  }
  if (local.clientes.length) {
    blocos.push(blocoDeBusca("Clientes", local.clientes.map(c => ({ titulo: c, sub: "" }))));
  }
  if (local.conversas.length) {
    blocos.push(blocoDeBusca("Conversas com a Bee", local.conversas.map(c => ({
      titulo: c.titulo, sub: c.previa, chave: c.chave,
    }))));
  }

  alvo.innerHTML = blocos.length
    ? blocos.join("")
    : `<p class="bee-vazio">Não achei nada com "${escaparHTML(termo)}".</p>`;

  alvo.querySelectorAll("[data-chave-busca]").forEach(btn => {
    btn.addEventListener("click", () => beeAbrirConversa(btn.dataset.chaveBusca));
  });
  alvo.querySelectorAll("[data-task-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      beeFecharPainel();
      abrirTarefaPorId(Number(btn.dataset.taskId));
    });
  });
}

function blocoDeBusca(titulo, itens) {
  return `
    <div class="bee-busca-bloco">
      <p class="bee-busca-lab">${titulo}</p>
      ${itens.map(i => {
        const conteudo = `
          <span class="bee-recente-txt">
            <span class="bee-recente-t">${escaparHTML(i.titulo)}</span>
            ${i.sub ? `<span class="bee-recente-s">${escaparHTML(i.sub)}</span>` : ""}
          </span>`;
        if (i.url) {
          return `<a class="bee-recente" href="${i.url}" target="_blank" rel="noopener">${conteudo}<span class="bee-recente-h">abrir</span></a>`;
        }
        if (i.chave) {
          return `<button type="button" class="bee-recente" data-chave-busca="${escaparHTML(i.chave)}">${conteudo}</button>`;
        }
        if (i.acao) {
          const id = i.acao.match(/\d+/);
          return `<button type="button" class="bee-recente" data-task-id="${id ? id[0] : ""}">${conteudo}</button>`;
        }
        return `<div class="bee-recente">${conteudo}</div>`;
      }).join("")}
    </div>
  `;
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

  const avatarChat = document.getElementById("beeChatAvatar");
  if (avatarChat) avatarChat.innerHTML = beeIcon;

  const voltar = document.getElementById("beeVoltar");
  if (voltar) voltar.addEventListener("click", () => { beeConversaAtual = null; beeMostrarTela("inicio"); });

  const excluir = document.getElementById("beeExcluirConversa");
  if (excluir) excluir.addEventListener("click", excluirConversaAtual);

  const novo = document.getElementById("beeNovoChat");
  if (novo) novo.addEventListener("click", () => beeNovaConversaCom(null));

  [["beeEnviarInicio", "beeInputInicio"], ["beeEnviarChat", "beeInputChat"]].forEach(([botao, campo]) => {
    const b = document.getElementById(botao);
    if (b) b.addEventListener("click", () => enviarParaBeeLivre());
    const c = document.getElementById(campo);
    if (c) c.addEventListener("keydown", e => { if (e.key === "Enter") enviarParaBeeLivre(); });
  });

  // O campo do topo NUNCA é uma barra de pesquisa (o Cláudio foi claro
  // sobre isso): digitar filtra as conversas recentes na hora, só pra
  // ajudar a achar uma conversa antiga — mas apertar Enter sempre abre
  // uma conversa NOVA com o que foi escrito, e a Bee tenta responder de
  // verdade (usando achar tarefa/link/campanha por trás quando dá).
  const busca = document.getElementById("beeBusca");
  if (busca) {
    busca.addEventListener("input", () => agendarBuscaUniversal(busca.value));
    busca.addEventListener("keydown", e => {
      if (e.key !== "Enter" || !busca.value.trim()) return;
      const pergunta = busca.value.trim();
      busca.value = "";
      desenharRecentesDaBee();
      beeNovaConversaCom(pergunta);
    });
  }

  desenharAtalhosDaBee();
}

// ===== Perguntar pra Bee =====

async function perguntarParaBee(task, texto) {
  const taskId = task.id;
  if (!taskId || !texto) return;

  const conversa = beeConversas.get(taskId) || [];
  conversa.push({ autor: "designer", texto, quando: Date.now() });
  beeConversas.set(taskId, conversa);
  desenharThreadBee(task);

  // Pergunta funcional (achar link, achar responsável, achar card mãe)?
  // Responde na hora com dado de verdade, sem gastar IA nenhuma.
  const reconhecida = await beeReconhecerPerguntaFuncional(texto, { cliente: task.client });
  if (reconhecida) {
    conversa.push(beeMensagemFuncional(reconhecida));
    beeConversas.set(taskId, conversa);
    desenharThreadBee(task);
    return;
  }

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
