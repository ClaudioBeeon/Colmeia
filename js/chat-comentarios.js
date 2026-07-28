let detailIdx = null;
let changeOpen = false;
let childrenOpen = false;

// ===== Chat flutuante (comentários em pop-up separado, fora do card) =====
let chatThreadAtivo = "aqui"; // "aqui" (a tarefa aberta) ou "mae" (o card mãe dela)
let chatAlvoTaskId = null;    // id de quem recebe o próximo comentário enviado
const chatMaeCache = new Map(); // taskId (da subtarefa) -> {id, title, comments}

function chaveVistoChat(taskId) {
  return "colmeia_chat_visto_" + taskId;
}
function marcarChatVisto(task) {
  if (!task.id || !task.comments || task.comments.length === 0) return;
  const maiorId = Math.max(...task.comments.map(c => c.id || 0));
  try { localStorage.setItem(chaveVistoChat(task.id), String(maiorId)); } catch (err) { /* sem problema */ }
}
function contarComentariosNaoLidos(task) {
  if (!task.id || !task.comments || task.comments.length === 0) return 0;
  let visto = 0;
  try { visto = Number(localStorage.getItem(chaveVistoChat(task.id))) || 0; } catch (err) { /* sem problema */ }
  return task.comments.filter(c => !nomesCorrespondem(c.autor, DESIGNER_LOGADO) && (c.id || 0) > visto).length;
}
function atualizarBadgeChat(task) {
  const badge = document.getElementById("chatFabBadge");
  if (!badge) return;
  const qtd = contarComentariosNaoLidos(task);
  badge.hidden = qtd === 0;
  badge.textContent = qtd > 9 ? "9+" : String(qtd);
}

/**
 * Abre o pop-up de chat pra tarefa aberta: divide a tela (o card
 * encolhe pra ~30%, o chat ocupa o resto), sempre começando na aba
 * "Comentários aqui".
 */
function abrirChatPanel(task) {
  const painel = document.getElementById("taskDetail");
  const chatPanel = document.getElementById("chatPanel");
  if (!painel || !chatPanel) return;
  painel.classList.add("chat-open");
  chatPanel.hidden = false;
  abrirThreadAqui(task);
}

function fecharChatPanel() {
  const painel = document.getElementById("taskDetail");
  const chatPanel = document.getElementById("chatPanel");
  if (painel) painel.classList.remove("chat-open");
  if (chatPanel) chatPanel.hidden = true;
}

function abrirThreadAqui(task) {
  chatThreadAtivo = "aqui";
  chatAlvoTaskId = task.id;
  const tabAqui = document.getElementById("chatTabAqui");
  const tabMae = document.getElementById("chatTabMae");
  if (tabAqui) tabAqui.classList.add("active");
  if (tabMae) tabMae.classList.remove("active");
  const titulo = document.getElementById("chatPanelTitle");
  if (titulo) titulo.textContent = task.title;
  const thread = document.getElementById("commentsThread");
  if (thread) {
    thread.innerHTML = renderComentariosHTML(task);
    wireExcluirComentario();
    thread.scrollTop = thread.scrollHeight;
  }
  marcarChatVisto(task);
  atualizarBadgeChat(task);
}

/**
 * Troca o chat pra mostrar os comentários do card mãe (só existe o
 * botão se a tarefa tiver parentTaskId). Busca uma vez só e guarda em
 * cache — trocar de aba de volta e pra frente não busca de novo.
 */
async function abrirThreadDoCardMae(task) {
  chatThreadAtivo = "mae";
  chatAlvoTaskId = null;
  const tabAqui = document.getElementById("chatTabAqui");
  const tabMae = document.getElementById("chatTabMae");
  if (tabMae) tabMae.classList.add("active");
  if (tabAqui) tabAqui.classList.remove("active");
  const thread = document.getElementById("commentsThread");
  if (thread) thread.innerHTML = `<p class="comments-empty">Carregando comentários do card mãe...</p>`;

  let cache = chatMaeCache.get(task.id);
  if (!cache) {
    const resultado = await buscarCardMaeDoBackend(task.id);
    if (!resultado.ok || !resultado.temPai) {
      if (chatThreadAtivo === "mae" && tasks[detailIdx] && tasks[detailIdx].id === task.id && thread) {
        thread.innerHTML = `<p class="comments-empty">Essa tarefa não tem card mãe.</p>`;
      }
      return;
    }
    const comentarios = await buscarComentariosDoBackend(resultado.cardMae.id);
    cache = { id: resultado.cardMae.id, title: resultado.cardMae.title, comments: comentarios };
    chatMaeCache.set(task.id, cache);
  }
  if (chatThreadAtivo !== "mae" || !tasks[detailIdx] || tasks[detailIdx].id !== task.id) return; // trocou de aba/tarefa enquanto carregava
  chatAlvoTaskId = cache.id;
  const titulo = document.getElementById("chatPanelTitle");
  if (titulo) titulo.textContent = cache.title;
  if (thread) {
    thread.innerHTML = renderComentariosHTML({ id: cache.id, comments: cache.comments });
    wireExcluirComentario();
    thread.scrollTop = thread.scrollHeight;
  }
}

/**
 * Recarrega a thread que está sendo mostrada agora no chat (a da
 * própria tarefa ou a do card mãe) — usado depois de enviar, excluir
 * ou reagir a um comentário.
 */
async function recarregarThreadAtiva() {
  const task = tasks[detailIdx];
  if (chatThreadAtivo === "aqui") {
    await carregarComentarios(task);
    return;
  }
  const cache = chatMaeCache.get(task.id);
  if (!cache) return;
  cache.comments = await buscarComentariosDoBackend(cache.id);
  chatMaeCache.set(task.id, cache);
  if (chatThreadAtivo !== "mae" || !tasks[detailIdx] || tasks[detailIdx].id !== task.id) return;
  const thread = document.getElementById("commentsThread");
  if (thread) {
    thread.innerHTML = renderComentariosHTML({ id: cache.id, comments: cache.comments });
    wireExcluirComentario();
  }
}

/**
 * Desenha a lista de comentários de uma tarefa. Enquanto ainda não
 * carregou (task.comments === undefined), mostra "Carregando...".
 * Tarefas sem id real (dados fake) nunca terão comentários reais.
 */
function formatarHoraComentario(dataISO) {
  if (!dataISO) return "";
  const d = new Date(dataISO);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Transforma links soltos (http://..., https://..., www...) dentro do
 * texto de um comentário em links de verdade, clicáveis. Se o texto já
 * vier com um <a> pronto (o Runrun.it às vezes já manda formatado),
 * não mexe em nada pra não linkificar duas vezes.
 */
function linkifyTexto(texto) {
  if (!texto) return "";
  if (/<a\s/i.test(texto)) return texto;
  const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/gi;
  return texto.replace(urlRegex, url => {
    const limpo = url.replace(/[.,;:)\]]+$/, ""); // não pega pontuação colada no final
    const sobra = url.slice(limpo.length);
    const href = limpo.startsWith("http") ? limpo : "https://" + limpo;
    return `<a href="${href}" target="_blank" rel="noopener">${limpo}</a>${sobra}`;
  });
}

function renderComentariosHTML(task) {
  if (!task.id) {
    return `<p class="comments-empty">Essa tarefa ainda não está conectada ao Runrun.it.</p>`;
  }
  if (task.comments === undefined) {
    return `<p class="comments-empty">Carregando comentários...</p>`;
  }
  if (task.comments.length === 0) {
    return `<p class="comments-empty">Nenhum comentário ainda.</p>`;
  }
  return task.comments.map(c => {
    const minha = nomesCorrespondem(c.autor, DESIGNER_LOGADO);
    return `
    <div class="comment-bubble ${minha ? "mine" : ""}" data-comment-id="${c.id}">
      ${minha ? "" : avatarHTML(c.autor, "avatar-sm comment-avatar")}
      <div class="comment-body">
        <div class="comment-meta"><span class="comment-author">${minha ? "Você" : c.autor}</span><span class="comment-time">${formatarHoraComentario(c.data)}</span></div>
        <div class="comment-text">${linkifyTexto(c.texto)}</div>
        ${(c.reactions || []).length ? `
          <div class="comment-reactions">
            ${c.reactions.map(r => `<span class="comment-reaction-chip" title="${(r.users || []).map(u => u.name).join(", ")}">${r.emoji} ${r.count}</span>`).join("")}
          </div>
        ` : ""}
      </div>
      <button type="button" class="comment-react-btn" data-comment-id="${c.id}" title="Reagir" aria-label="Reagir">🙂</button>
      <div class="comment-react-picker" data-comment-id="${c.id}" hidden></div>
      <button type="button" class="comment-delete-btn" data-comment-id="${c.id}" title="Excluir comentário" aria-label="Excluir comentário">
        <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>
  `;
  }).join("");
}

/**
 * Busca os comentários reais no Runrun.it e atualiza só a lista na tela
 * (sem re-renderizar o pop-up inteiro, pra não perder o foco do campo
 * de texto nem fechar menus abertos).
 */
/**
 * O Runrun.it devolve a descrição em HTML (editor de texto rico), com
 * checklists no formato <ul data-checked="true/false"><li>...</li></ul>.
 * Essa função troca isso por ☑/☐ de verdade na frente de cada item, e
 * tira estilos/cores que vieram do editor de lá pra não conflitar com o
 * visual do Colmeia.
 */
function formatarDescricaoRunrun(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("ul[data-checked]").forEach(ul => {
    const marcado = ul.getAttribute("data-checked") === "true";
    ul.querySelectorAll("li").forEach(li => {
      li.textContent = (marcado ? "☑ " : "☐ ") + li.textContent;
      li.style.listStyle = "none";
    });
  });

  // Remove cor/estilo herdados do editor do Runrun.it (ex: texto azulado
  // de "Legenda:"), deixando só a formatação básica (negrito, parágrafos).
  doc.querySelectorAll("[style]").forEach(el => el.removeAttribute("style"));
  doc.querySelectorAll("[class]").forEach(el => el.removeAttribute("class"));

  return doc.body.innerHTML;
}

/**
 * Busca a descrição real no Runrun.it e atualiza só o texto na tela
 * (sem re-renderizar o pop-up inteiro).
 */
async function carregarDescricao(task) {
  if (!task.id) return;
  const taskId = task.id;
  const texto = await buscarDescricaoDoBackend(taskId);
  // Compara pelo ID, não pela referência do objeto: o array `tasks` pode
  // ter sido substituído por atualizarKanbanEmBackground() enquanto essa
  // busca estava em andamento (troca os objetos por outros novos, mesmo
  // sendo a mesma tarefa), o que fazia esse "if" falhar sempre na
  // primeira abertura e a descrição só aparecer ao reabrir o card.
  if (tasks[detailIdx] && tasks[detailIdx].id === taskId) {
    const el = document.getElementById("descTextReal");
    if (el) el.innerHTML = texto ? formatarDescricaoRunrun(texto) : "Sem descrição cadastrada nessa tarefa.";
  }
}

async function carregarComentarios(task) {
  if (!task.id) return;
  const taskId = task.id;
  task.comments = await buscarComentariosDoBackend(taskId);
  // Só atualiza a tela se o usuário ainda estiver vendo essa mesma tarefa
  // (compara por ID, não por referência — ver comentário em carregarDescricao).
  if (tasks[detailIdx] && tasks[detailIdx].id === taskId) {
    atualizarBadgeChat(task);
    const chatPanel = document.getElementById("chatPanel");
    const chatAberto = chatPanel && !chatPanel.hidden;
    if (chatAberto && chatThreadAtivo === "aqui") {
      marcarChatVisto(task);
      atualizarBadgeChat(task);
      const thread = document.getElementById("commentsThread");
      if (thread) {
        thread.innerHTML = renderComentariosHTML(task);
        wireExcluirComentario();
      }
    }
  }
}

/**
 * Busca os anexos de verdade da tarefa (antes disso mostrava "Anexo
 * 01, 02, 03, 04" fixos, sem vir do Runrun.it de verdade). Só faz a
 * chamada se a tarefa realmente tiver anexo (attachmentsCount > 0) —
 * economiza uma chamada à toa pra maioria das tarefas, que não tem.
 */
function formatarTamanhoArquivo(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function carregarAnexos(task) {
  if (!task.id || !task.attachmentsCount) return;
  let anexos = [];
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarAnexos", taskId: task.id }),
    });
    const data = await res.json();
    if (data.ok) anexos = data.anexos || [];
  } catch (err) {
    console.error("Falha ao buscar anexos:", err);
  }
  if (!tasks[detailIdx] || tasks[detailIdx].id !== task.id) return; // trocou de tarefa enquanto carregava
  const listaEl = document.getElementById("attachList");
  if (!listaEl) return;
  if (anexos.length === 0) {
    listaEl.innerHTML = `<p class="attach-empty">Nenhum anexo nessa tarefa.</p>`;
    return;
  }
  listaEl.innerHTML = anexos.map(a => `
    <button type="button" class="attach-item" data-doc-id="${a.id}" data-nome="${a.nome}">
      <span>${a.nome}${a.tamanho ? ` <span class="attach-size">${formatarTamanhoArquivo(a.tamanho)}</span>` : ""}</span>
      <svg viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `).join("");
  listaEl.querySelectorAll(".attach-item").forEach(btn => {
    btn.addEventListener("click", () => baixarAnexo(btn.dataset.docId, btn.dataset.nome, btn));
  });
}

/**
 * Busca o tempo trabalhado de verdade no Runrun.it toda vez que o card
 * é aberto, em vez de confiar só no cronômetro local ou na atualização
 * automática de 60s (que só cobre tarefas EM ABERTO — uma tarefa já
 * entregue/fechada para de ser sincronizada e o número local podia
 * ficar congelado errado pra sempre). Nunca deixa o tempo voltar pra
 * trás, mesmo raciocínio do merge da atualização em segundo plano.
 */
async function carregarCronometroReal(task) {
  if (!task.id) return;
  const resultado = await buscarTarefaCompletaDoBackend(task.id);
  if (!resultado.ok) return;
  const fresco = mapearTarefaDoBackend(resultado.tarefa);
  task.timerSeconds = Math.max(task.timerSeconds, fresco.timerSeconds);
  task.tempoMedioMinutos = fresco.tempoMedioMinutos;
  task.estimatePct = calcularEstimatePct(task.timerSeconds, task.tempoMedioMinutos);
  if (tasks[detailIdx] && tasks[detailIdx].id === task.id) {
    const timerEl = document.getElementById("detailTimer");
    if (timerEl) timerEl.textContent = formatTime(task.timerSeconds);
  }
}

/**
 * Baixa o anexo de verdade: pede o arquivo em base64 pro backend (que
 * busca autenticado no Runrun.it) e monta o download no navegador.
 */
async function baixarAnexo(documentId, nome, btnEl) {
  const original = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.innerHTML = `<span>Baixando...</span>`;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "baixarAnexo", documentId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Falha ao baixar.");

    const binario = atob(data.base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const blob = new Blob([bytes], { type: data.mimeType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = nome || "anexo";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Falha ao baixar anexo:", err);
    alert("Não consegui baixar esse anexo agora. Tenta de novo em alguns segundos.");
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = original;
  }
}

const MESES_PT_JS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/**
 * Confirma com o coordenador antes de criar de verdade a pasta da
 * tarefa no Drive, dentro de Clientes > cliente > Publicações > ano >
 * mês > nome da tarefa.
 */
/**
 * Abre o modal de confirmação de verdade (não é mais o alerta feio do
 * navegador) e devolve true/false conforme o que a pessoa escolher.
 */
function confirmarCriacaoDePasta(mensagemHtml) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirmPastaModalOverlay");
    document.getElementById("confirmPastaModalTexto").innerHTML = mensagemHtml;
    overlay.hidden = false;

    const btnConfirmar = document.getElementById("confirmPastaConfirmar");
    const btnCancelar = document.getElementById("confirmPastaCancelar");
    const btnFechar = document.getElementById("confirmPastaModalClose");

    function fechar(valor) {
      overlay.hidden = true;
      btnConfirmar.removeEventListener("click", onConfirmar);
      btnCancelar.removeEventListener("click", onCancelar);
      btnFechar.removeEventListener("click", onCancelar);
      resolve(valor);
    }
    function onConfirmar() { fechar(true); }
    function onCancelar() { fechar(false); }

    btnConfirmar.addEventListener("click", onConfirmar);
    btnCancelar.addEventListener("click", onCancelar);
    btnFechar.addEventListener("click", onCancelar);
  });
}

/**
 * Anima a troca do texto do botão (o texto antigo sobe e some, o novo
 * entra de baixo) — usado quando a pasta é criada com sucesso.
 */
function trocarTextoBotaoPasta(novoTexto) {
  const label = document.querySelector("#criarPastaDriveBtn .pasta-drive-btn-label");
  if (!label) return;
  label.classList.add("saindo");
  setTimeout(() => {
    label.textContent = novoTexto;
    label.classList.remove("saindo");
    label.classList.add("entrando");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => label.classList.remove("entrando"));
    });
  }, 260);
}

async function confirmarECriarPastaDoCard(task) {
  const btn = document.getElementById("criarPastaDriveBtn");

  // Se ainda está em andamento a checagem automática de "essa pasta já
  // existe?" (corrida entre o clique e essa checagem), espera ela
  // terminar antes de decidir se cria uma pasta nova ou só abre a que
  // já existe — é exatamente essa corrida que fazia o Colmeia às vezes
  // não reconhecer uma pasta já criada.
  if (task._pastaCheckPromise) {
    btn.disabled = true;
    trocarTextoBotaoPasta("Verificando...");
    await task._pastaCheckPromise;
    btn.disabled = false;
  }

  // Se a pasta já foi criada antes (guardado no objeto da tarefa, então
  // sobrevive a qualquer re-render do pop-up — não só no dataset do
  // botão, que é recriado do zero toda vez), o botão vira link de acesso.
  const urlJaSalva = btn.dataset.pastaUrl || task.pastaUrlSalva;
  if (urlJaSalva) {
    trocarTextoBotaoPasta("Acessar pasta do card");
    window.open(urlJaSalva, "_blank");
    return;
  }

  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = MESES_PT_JS[agora.getMonth()];
  const caminho = `${task.client} &gt; Publicações &gt; ${ano} &gt; ${mes} &gt; ${task.title}`;

  const confirmado = await confirmarCriacaoDePasta(`Deseja criar a pasta <strong>"${task.title}"</strong> em<br>${caminho}?`);
  if (!confirmado) return;

  btn.disabled = true;
  trocarTextoBotaoPasta("Criando pasta...");

  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "criarPastaDoCard", cliente: task.client, tituloCard: task.title, taskId: task.id }),
    });
    const data = await res.json();
    btn.disabled = false;

    if (!data.ok) {
      trocarTextoBotaoPasta(data.error ? data.error.slice(0, 40) : "Não consegui criar a pasta");
      return;
    }
    btn.dataset.pastaUrl = data.url;
    task.pastaUrlSalva = data.url; // guarda no objeto da tarefa — reconhece na hora se reabrir de novo
    trocarTextoBotaoPasta("Acessar pasta do card");
    mostrarPillCopiarLinkDaPasta(data.url);
  } catch (err) {
    console.error("Falha ao criar pasta do card no Drive:", err);
    btn.disabled = false;
    trocarTextoBotaoPasta("Falha de conexão");
  }
}

/**
 * Ao abrir o pop-up da tarefa, checa (leitura rápida na planilha, sem
 * tocar no Drive) se a pasta do card já foi criada antes — assim o
 * botão já nasce como "Acessar pasta do card" em vez de pedir
 * confirmação de criação de novo toda vez que a tarefa é reaberta.
 *
 * O resultado fica guardado em task.pastaUrlSalva (não só no dataset
 * do botão, que é recriado do zero a cada renderDetail) — assim, se o
 * pop-up re-renderizar por qualquer motivo (dar play, mudar de coluna,
 * etc), o botão já nasce certo na hora, sem esperar o fetch de novo e
 * sem correr o risco de "esquecer" que a pasta já existe.
 */
function mostrarPillCopiarLinkDaPasta(url) {
  const pill = document.getElementById("pastaCopyLinkBtn");
  if (!pill) return;
  pill.dataset.url = url;
  pill.hidden = false;
}

async function verificarPastaJaSalva(task, btn) {
  if (!task.id) return;

  if (task.pastaUrlSalva !== undefined) {
    if (task.pastaUrlSalva) {
      btn.dataset.pastaUrl = task.pastaUrlSalva;
      const label = btn.querySelector(".pasta-drive-btn-label");
      if (label) label.textContent = "Acessar pasta do card";
      mostrarPillCopiarLinkDaPasta(task.pastaUrlSalva);
    }
    return;
  }

  if (!task._pastaCheckPromise) {
    task._pastaCheckPromise = (async () => {
      try {
        const res = await fetch(COLMEIA_API_URL, {
          method: "POST",
          body: JSON.stringify({ acao: "buscarPastaCard", taskId: task.id }),
        });
        const data = await res.json();
        task.pastaUrlSalva = (data.ok && data.url) ? data.url : null;
      } catch (err) {
        console.error("Falha ao checar se a pasta do card já existe:", err);
        // Não guarda nada em caso de erro — deixa tentar de novo da
        // próxima vez que a tarefa for aberta, em vez de travar como
        // "sem pasta" pra sempre por causa de uma falha de rede.
      } finally {
        task._pastaCheckPromise = null;
      }
    })();
  }

  await task._pastaCheckPromise;
  if (tasks[detailIdx] !== task) return; // trocou de tarefa enquanto carregava
  if (task.pastaUrlSalva) {
    btn.dataset.pastaUrl = task.pastaUrlSalva;
    const label = btn.querySelector(".pasta-drive-btn-label");
    if (label) label.textContent = "Acessar pasta do card";
    mostrarPillCopiarLinkDaPasta(task.pastaUrlSalva);
  }
}

/**
 * Deixa a "Entrega desejada" editável: clicar no lápis troca o texto
 * por um <input type="date"> nativo; ao escolher uma data nova, salva
 * de verdade no Runrun.it e atualiza a tela (card + pop-up) sem
 * precisar recarregar tudo.
 */
function wireEdicaoEntregaDesejada(task) {
  const btn = document.getElementById("dueDateEditBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const row = document.getElementById("dueDateRow");
    if (!row) return;
    // Usa a data ISO (ano-mês-dia) de verdade como valor inicial do
    // input — usar o texto já formatado ("22 jul") aqui quebrava o
    // calendário nativo (ele não reconhece esse formato) e depois
    // salvava o valor cru (ex: "2026-07-27") no lugar do "22 jul"
    // bonito, que era o bug reportado.
    row.innerHTML = `<input type="date" class="side-date-input" id="dueDateInput" value="${task.dueISO || ""}">`;
    const input = document.getElementById("dueDateInput");
    input.focus();
    // Abre o calendário nativo direto (em vez de deixar a pessoa
    // digitar a data na mão) — dá a sensação de um seletor moderno.
    if (typeof input.showPicker === "function") {
      try { input.showPicker(); } catch (e) { /* alguns navegadores recusam fora de um clique direto — sem problema, o campo continua clicável normalmente */ }
    }

    async function salvar() {
      const novaData = input.value; // sempre no formato AAAA-MM-DD
      if (!novaData || novaData === task.dueISO) {
        renderDetail();
        return;
      }
      row.innerHTML = `<span class="side-date-saving">Salvando...</span>`;
      try {
        const res = await fetch(COLMEIA_API_URL, {
          method: "POST",
          body: JSON.stringify({ acao: "alterarEntrega", taskId: task.id, novaData }),
        });
        const data = await res.json();
        if (!data.ok) {
          row.innerHTML = `<span class="side-date-saving">${data.error ? data.error.slice(0, 40) : "Não consegui salvar"}</span>`;
          setTimeout(() => renderDetail(), 1800);
          return;
        }
        // Mantém sempre o mesmo padrão visual de antes (ex: "27 jul"),
        // nunca a data crua (AAAA-MM-DD) — isso é que ficava feio.
        const [ano, mes, dia] = novaData.split("-").map(Number);
        task.dueISO = novaData;
        task.due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
        renderDetail();
        render(); // atualiza a data no card do quadro também
        agendarAtualizacaoKanban();
      } catch (err) {
        console.error("Falha ao trocar a Entrega desejada:", err);
        row.innerHTML = `<span class="side-date-saving">Falha de conexão</span>`;
        setTimeout(() => renderDetail(), 1800);
      }
    }

    input.addEventListener("change", salvar);
    input.addEventListener("blur", () => {
      // Se saiu do campo sem trocar nada, só volta pro texto normal.
      if (document.getElementById("dueDateInput")) renderDetail();
    });
  });
}

function wireExcluirComentario() {
  document.querySelectorAll(".comment-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esse comentário?")) return;
      const bolha = btn.closest(".comment-bubble");
      if (bolha) bolha.style.opacity = "0.4";
      const ok = await excluirComentarioNoBackend(btn.dataset.commentId);
      if (ok) recarregarThreadAtiva();
      else if (bolha) bolha.style.opacity = "1";
    });
  });

  const EMOJIS_REACAO = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
  document.querySelectorAll(".comment-react-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const picker = document.querySelector(`.comment-react-picker[data-comment-id="${CSS.escape(btn.dataset.commentId)}"]`);
      document.querySelectorAll(".comment-react-picker").forEach(p => { if (p !== picker) p.hidden = true; });
      if (!picker) return;
      if (picker.innerHTML === "") {
        picker.innerHTML = EMOJIS_REACAO.map(em => `<button type="button" class="emoji-opt">${em}</button>`).join("");
        picker.querySelectorAll(".emoji-opt").forEach(emojiBtn => {
          emojiBtn.addEventListener("click", async () => {
            picker.hidden = true;
            const ok = await reagirComentarioNoBackend(btn.dataset.commentId, emojiBtn.textContent);
            if (ok) recarregarThreadAtiva();
          });
        });
      }
      picker.hidden = !picker.hidden;
    });
  });
}


function taskDescription(task) {
  return `Produção de conteúdo do tipo ${typeLabels[task.type].label.toLowerCase()} para o cliente ${task.client}. Seguir o briefing combinado com o time de atendimento, manter a identidade visual do cliente e alinhar qualquer dúvida antes da entrega final.`;
}

const formatsByType = {
  estatico: [
    { label: "Feed 1x1", cls: "fb-purple" },
    { label: "Stories 9:16", cls: "fb-pink" },
  ],
  video: [
    { label: "Vídeo Feed 1x1", cls: "fb-blue" },
    { label: "Vídeo Stories 9:16", cls: "fb-teal" },
  ],
  email: [
    { label: "Banner desktop", cls: "fb-orange" },
    { label: "Banner mobile", cls: "fb-purple" },
  ],
};

function priorityVar(p) {
  return p === "alta" ? "danger" : p === "media" ? "warning" : "success";
}

