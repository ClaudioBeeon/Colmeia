function renderModalRegra(task) {
  const body = document.getElementById("ruleModalBody");
  const seq = task.sequencia || [];

  const listaHtml = seq.length === 0
    ? `<p class="workflow-seq-empty">Sem sequência configurada nessa tarefa.</p>`
    : seq.map((s, i) => `
        <div class="rule-row ${s.atual ? "current" : ""} ${s.pendente ? "pendente" : ""}" data-element-id="${s.id}">
          <span class="rule-row-order">${i + 1}</span>
          ${avatarHTML(s.nome, "avatar-sm", s.foto)}
          <span class="rule-row-name">${s.nome}</span>
          ${s.pendente ? `<span class="rule-row-spinner"></span>` :
            s.concluido ? `<span class="rule-row-status done">Concluído</span>` :
            s.atual ? `<span class="rule-row-status current">Atual</span>` :
            `<span class="rule-row-status">Aguardando</span>`}
          ${(!s.concluido && !s.atual && !s.pendente) ? `
            <button type="button" class="rule-row-remove" data-element-id="${s.id}" title="Remover da sequência">
              <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
          ` : ""}
        </div>
      `).join("");

  body.innerHTML = `
    <div class="rule-list" id="ruleList">${listaHtml}</div>
    <div class="rule-add-section">
      <span class="side-label">Adicionar próxima pessoa</span>
      <input type="text" class="rule-add-search" id="ruleAddSearch" placeholder="Buscar pessoa...">
      <div class="rule-add-list" id="ruleAddList">
        <div class="assignee-menu-loading">Carregando pessoas...</div>
      </div>
    </div>
  `;

  body.querySelectorAll(".rule-row-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      removerPessoaOtimista(task, btn.dataset.elementId);
    });
  });

  document.getElementById("ruleAddSearch").addEventListener("input", e => {
    renderizarListaAdicionarRegra(task, usuariosParaAdicionarRegra, e.target.value);
  });

  buscarUsuariosRunrun().then(usuarios => {
    usuariosParaAdicionarRegra = ordenarUsuariosParaRegra(usuarios);
    renderizarListaAdicionarRegra(task, usuariosParaAdicionarRegra, "");
  });
}

/**
 * Remove a linha na hora (otimista, sem esperar o servidor responder)
 * e só depois confirma de verdade com o Runrun.it em segundo plano.
 */
/**
 * Depois que a resposta de verdade do Runrun.it chega, atualiza tanto o
 * cabeçalho quanto a lista dentro do modal "Ver regra" (se ele ainda
 * estiver aberto) — sem isso, a linha otimista ficava presa girando
 * pra sempre, mesmo depois de já ter confirmado de verdade.
 */
async function atualizarSequenciaEModal(task) {
  await carregarSequencia(task);
  const overlay = document.getElementById("ruleModalOverlay");
  if (overlay && !overlay.hidden) renderModalRegra(task);
  renderRepasseCardSeAberta(task);
}

function removerPessoaOtimista(task, elementId) {
  const row = document.querySelector(`.rule-row[data-element-id="${elementId}"]`);
  if (row) {
    row.classList.add("saindo");
    setTimeout(() => row.remove(), 200);
  }
  task.sequencia = task.sequencia.filter(s => String(s.id) !== String(elementId));
  removerDaRegraNoBackend(task.workflowId, elementId).then(() => atualizarSequenciaEModal(task));
}

async function removerDaRegraNoBackend(workflowId, elementId) {
  if (!COLMEIA_API_URL || !workflowId || !elementId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "removerDaRegra", workflowId, elementId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou remover da regra:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao remover da regra no Runrun.it:", err);
    return false;
  }
}

// Guarda a lista de usuários carregada, pra filtrar sem buscar de novo
// a cada letra digitada na busca do modal.
let usuariosParaAdicionarRegra = [];

// Ordem fixa pra QUALQUER lista de escolher gente pra sequência (modal
// "Ver regra" e o pop-up rápido da aba de Repasse): Erick primeiro,
// Gustavo em segundo, todo mundo depois em ordem alfabética — pedido
// explícito, já que são as pessoas mais escolhidas.
const ORDEM_FIXA_REGRA = ["erick", "gustavo"];
function ordenarUsuariosParaRegra(usuarios) {
  return usuarios.slice().sort((a, b) => {
    const nomeA = normalizarParaComparar(a.nome);
    const nomeB = normalizarParaComparar(b.nome);
    const idxA = ORDEM_FIXA_REGRA.findIndex(nome => nomeA.startsWith(nome));
    const idxB = ORDEM_FIXA_REGRA.findIndex(nome => nomeB.startsWith(nome));
    const rankA = idxA === -1 ? ORDEM_FIXA_REGRA.length : idxA;
    const rankB = idxB === -1 ? ORDEM_FIXA_REGRA.length : idxB;
    if (rankA !== rankB) return rankA - rankB;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

function renderizarListaAdicionarRegra(task, usuariosOrdenados, filtro) {
  const listEl = document.getElementById("ruleAddList");
  if (!listEl) return;
  if (usuariosOrdenados.length === 0) {
    listEl.innerHTML = `<div class="assignee-menu-loading">Não consegui buscar a lista.</div>`;
    return;
  }
  const alvo = normalizarParaComparar(filtro);
  const filtrados = alvo ? usuariosOrdenados.filter(u => normalizarParaComparar(u.nome).includes(alvo)) : usuariosOrdenados;
  listEl.innerHTML = filtrados.map(u => `
    <button type="button" data-user-id="${u.id}" data-user-nome="${u.nome}" data-user-foto="${u.foto || ""}">
      ${avatarHTML(u.nome, "avatar-sm", u.foto)} <span>${u.nome}</span>
    </button>
  `).join("");
  listEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", e => {
      animarPessoaSubindo(btn, e);
      adicionarPessoaOtimista(task, {
        id: btn.dataset.userId,
        nome: btn.dataset.userNome,
        foto: btn.dataset.userFoto || null,
      });
    });
  });
}

/**
 * Monta a lista otimista de depois de adicionar uma pessoa na
 * sequência — usada tanto pelo modal "Ver regra" quanto pelo pop-up
 * rápido da aba de Repasse (js/pagina-repasse.js). Se a tarefa ainda
 * não tinha NENHUMA sequência, o próprio Runrun.it sempre entra com
 * quem está com a tarefa agora (o responsável atual) como primeiro
 * elemento assim que uma regra é criada do zero — então a versão
 * otimista já reflete isso na hora, em vez de mostrar só a pessoa nova
 * sozinha (o que fazia sua foto "sumir" até a resposta real confirmar).
 */
function construirSequenciaOtimistaComNovaPessoa(task, usuario) {
  const novoElemento = {
    id: "pendente-" + Date.now(),
    nome: usuario.nome,
    foto: usuario.foto,
    atual: false,
    concluido: false,
    ultimo: true,
    pendente: true,
  };
  const seqAntes = task.sequencia || [];
  if (seqAntes.length === 0) {
    return [
      { id: "eu-atual", nome: task.assignee, foto: task.assigneeAvatarUrl, atual: true, concluido: false, ultimo: false },
      novoElemento,
    ];
  }
  seqAntes.forEach(s => { s.ultimo = false; });
  return [...seqAntes, novoElemento];
}

/**
 * Adiciona a pessoa na hora na lista (otimista, com um spinner bem
 * discreto na linha dela), sem esperar o Runrun.it responder. Confirma
 * de verdade em segundo plano e substitui pela sequência real quando
 * a resposta chegar.
 */
async function adicionarPessoaOtimista(task, usuario) {
  task.sequencia = construirSequenciaOtimistaComNovaPessoa(task, usuario);
  renderModalRegra(task);
  renderSequenciaNoHeaderSeAberta(task);
  renderRepasseCardSeAberta(task);

  // Tarefa que ainda não tem NENHUMA sequência configurada no Runrun.it
  // não tem workflowId — antes disso, o Colmeia tentava adicionar a
  // pessoa direto e a chamada era abortada em silêncio (nunca ia pro ar
  // request nenhum), então a "pessoa otimista" simplesmente sumia da
  // tela sem explicação nenhuma. Agora, nesse caso, primeiro cria a
  // sequência do zero no Runrun.it (ele mesmo já entra com quem estiver
  // logado como 1ª pessoa) e só then adiciona de verdade.
  if (!task.workflowId) {
    const criado = await criarRegraNoBackend(task.id);
    if (!criado.ok) {
      console.error("Não consegui criar a sequência do zero:", criado.error);
      await atualizarSequenciaEModal(task); // desfaz a linha otimista
      return;
    }
    task.workflowId = criado.workflowId;
  }

  adicionarNaRegraNoBackend(task.workflowId, usuario.id).then(() => atualizarSequenciaEModal(task));
}

/**
 * Se o pop-up da tarefa ainda estiver aberto nela, atualiza também a
 * sequência mostrada no cabeçalho (fora do modal), pra não ficar
 * desatualizada enquanto o modal está aberto por cima.
 */
function renderSequenciaNoHeaderSeAberta(task) {
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return;
  const el = document.getElementById("workflowSeqGroup");
  if (el) el.innerHTML = renderSequenciaHTML(task);
}

/**
 * Mesma ideia de renderSequenciaNoHeaderSeAberta, só que pro card da
 * aba de Repasse: se o modal "Ver regra" foi aberto a partir de lá
 * (repasseModalTaskAtual, definida em js/pagina-repasse.js), redesenha
 * a fileira de fotinhos do card NA HORA a cada mudança otimista — sem
 * isso, a foto nova só aparecia depois de fechar o modal E esperar uma
 * busca nova no Runrun.it, o que demorava mais do que precisava.
 */
function renderRepasseCardSeAberta(task) {
  if (typeof repasseModalTaskAtual === "undefined" || !repasseModalTaskAtual) return;
  if (String(repasseModalTaskAtual.id) !== String(task.id)) return;
  if (typeof montarSequenciaCard === "function") montarSequenciaCard(task);
}

/**
 * Efeito visual: clona a fotinho de quem foi clicado e faz ela "subir"
 * do botão até a lista da sequência, dando a sensação de que a pessoa
 * está entrando ali de verdade.
 */
function animarPessoaSubindo(btn) {
  const lista = document.getElementById("ruleList");
  if (!lista) return;
  const origemRect = btn.getBoundingClientRect();
  const destinoRect = lista.getBoundingClientRect();

  const clone = btn.querySelector(".avatar")?.cloneNode(true);
  if (!clone) return;
  clone.classList.add("avatar-flying");
  clone.style.left = origemRect.left + "px";
  clone.style.top = origemRect.top + "px";
  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    clone.style.left = destinoRect.left + 16 + "px";
    clone.style.top = destinoRect.bottom - 30 + "px";
    clone.style.opacity = "0";
    clone.style.transform = "scale(0.6)";
  });

  setTimeout(() => clone.remove(), 650);
}

async function entregarTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "entregarTarefa", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou entregar a tarefa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao entregar a tarefa no Runrun.it:", err);
    return false;
  }
}

async function reabrirTarefaNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "reabrirTarefa", taskId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou reabrir a tarefa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao reabrir a tarefa no Runrun.it:", err);
    return false;
  }
}

/**
 * Move a tarefa de verdade pra outra etapa/coluna no Runrun.it — usada
 * tanto pelo drag-and-drop do Kanban quanto pelo menu de status do
 * pop-up de detalhe.
 */
async function alterarEntregaNoBackend(taskId, novaData) {
  if (!COLMEIA_API_URL || !taskId || !novaData) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "alterarEntrega", taskId, novaData }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou alterar a Entrega Desejada:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao alterar a Entrega Desejada no Runrun.it:", err);
    return false;
  }
}

async function alterarPublicacaoNoBackend(taskId, novaData) {
  if (!COLMEIA_API_URL || !taskId || !novaData) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "alterarPublicacao", taskId, novaData }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou alterar a Data de Publicação:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao alterar a Data de Publicação no Runrun.it:", err);
    return false;
  }
}

async function moverEtapaNoBackend(taskId, chaveColuna) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "moverEtapa", taskId, chaveColuna }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou mover a etapa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao mover a etapa no Runrun.it:", err);
    return false;
  }
}

async function ajustarEstimativaNoBackend(taskId, minutos) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "ajustarEstimativa", taskId, minutos }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou ajustar a estimativa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao ajustar a estimativa no Runrun.it:", err);
    return false;
  }
}

async function desfazerWorkflowNoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return null;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "desfazerWorkflow", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Runrun.it recusou desfazer a sequência:", data.error);
      return null;
    }
    return data.novoResponsavel || null;
  } catch (err) {
    console.error("Falha ao desfazer a sequência no Runrun.it:", err);
    return null;
  }
}

// Cache com todo mundo do Runrun.it, carregado só na primeira vez que
// alguém clicar numa foto pra reatribuir (evita buscar toda hora).
let usuariosRunrunCache = null;

async function buscarUsuariosRunrun() {
  if (usuariosRunrunCache) return usuariosRunrunCache;
  if (!COLMEIA_API_URL) return [];
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarUsuarios" }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao listar usuários do Runrun.it:", data.error);
      return [];
    }
    usuariosRunrunCache = data.usuarios || [];
    return usuariosRunrunCache;
  } catch (err) {
    console.error("Falha ao listar usuários do Runrun.it:", err);
    return [];
  }
}

/**
 * Busca os comentários reais de uma tarefa no Runrun.it. Devolve uma
 * lista (pode ser vazia) — nunca null, pra não quebrar o render.
 */
/**
 * Busca a descrição real de uma tarefa no Runrun.it. Devolve sempre uma
 * string (vazia se não tiver descrição ou der erro).
 */
/**
 * Categoriza um campo do briefing por cor, baseado em palavras-chave na
 * própria pergunta (funciona mesmo com perguntas diferentes de tarefa
 * pra tarefa, já que olha só se tem certas palavras, não o texto exato).
 */
/**
 * Filtro de segurança: mesmo que a IA erre e devolva de novo a
 * pergunta de plataformas ou formatos dentro de "campos" (já mostrada
 * separada em cima), esconde a duplicata aqui.
 */
function ehCampoDuplicadoDePlataformaOuFormato(pergunta) {
  const p = normalizarParaComparar(pergunta);
  const ehPlataforma = p.includes("publicad") || (p.includes("onde") && p.includes("conteudo"));
  const ehFormato = p.includes("formato") && (p.includes("necess") || p.includes("quais"));
  return ehPlataforma || ehFormato;
}

function categoriaCampoBriefing(pergunta) {
  const p = normalizarParaComparar(pergunta);
  if (p.includes("referencia") || p.includes("link")) return "cat-blue";
  if (p.includes("instrucao") || p.includes("redacao")) return "cat-purple";
  if (p.includes("observa") || p.includes("expectativa")) return "cat-pink";
  if (p.includes("comentario") || p.includes("legenda") || p.includes("arte")) return "cat-teal";
  return "cat-gray";
}

/**
 * Identifica se uma pergunta é sobre o texto que vai dentro da arte
 * (varia de redação entre tarefas: "informações textuais", "texto na
 * arte" etc.) — não depende de vir sempre com as mesmas palavras exatas,
 * só que tenha "texto" e "arte" nela.
 */
function ehCampoTextoNaArte(pergunta) {
  const p = normalizarParaComparar(pergunta);
  return (p.includes("texto") || p.includes("textu")) && p.includes("arte");
}

// Respostas que "tecnicamente" vieram preenchidas mas só dizem que não
// tem nada (ex: "Nenhuma.", "N/A", "-") não ajudam ninguém ocupando
// espaço como se fossem informação de verdade — tratamos como campo
// vazio (some da descrição, vira só uma bolhinha em "Vazios").
const RESPOSTAS_VAZIAS = ["", "nenhum", "nenhuma", "nenhumas", "nenhuns", "na", "nao", "nda", "sem", "none", "vazio"];
function respostaEhVazia(resposta) {
  if (!resposta) return true;
  // normalizarParaComparar já troca pontuação por espaço e tira acento
  // — "Nenhuma.", "N/A" e "-" (sozinho) todos caem num desses casos.
  const normalizado = normalizarParaComparar(resposta).replace(/\s+/g, "");
  return RESPOSTAS_VAZIAS.includes(normalizado);
}

// Serviços conhecidos pra reconhecer o link e mostrar "Ver no X" em vez
// da URL crua. Se não reconhecer o domínio, usa o próprio domínio como
// nome (ex: "Ver no meusite.com").
const SERVICOS_LINK = {
  "docs.google.com": "Docs",
  "drive.google.com": "Drive",
  "sheets.google.com": "Planilhas",
  "slides.google.com": "Slides",
  "forms.google.com": "Formulários",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "figma.com": "Figma",
  "notion.so": "Notion",
  "canva.com": "Canva",
  "trello.com": "Trello",
  "dropbox.com": "Dropbox",
};

function detectarServicoDoLink(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const dominio in SERVICOS_LINK) {
      if (host.includes(dominio)) return SERVICOS_LINK[dominio];
    }
    return host;
  } catch (err) {
    return null;
  }
}

/**
 * Desenha o valor de um campo do briefing:
 *  - se o valor inteiro for só um link, mostra uma etiqueta "Ver no
 *    Docs ↗" (ou o serviço que for) em vez da URL crua.
 *  - se for uma LISTA de links (ex: "Vídeo 1: url\nVídeo 2: url..." —
 *    veio de um campo com vários vídeos/arquivos), mostra um pill pra
 *    cada linha, usando o texto antes do link como rótulo — em vez de
 *    despejar tudo cru numa linha só atrás da outra.
 *  - senão, usa o texto normal com qualquer link dentro dele virando
 *    clicável.
 */
function renderValorCampo(valor) {
  const soLink = /^https?:\/\/\S+$/.test(valor.trim());
  if (soLink) {
    const url = valor.trim();
    const servico = detectarServicoDoLink(url) || "link";
    return `<a href="${url}" target="_blank" rel="noopener" class="ai-briefing-link-pill">Ver no ${servico} ↗</a>`;
  }

  const linhas = valor.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const ehListaDeLinks = linhas.length > 1 && linhas.every(l => /^https?:\/\/\S+/.test(l) || /https?:\/\/\S+$/.test(l));
  if (ehListaDeLinks) {
    const pills = linhas.map(linha => {
      const match = linha.match(/https?:\/\/\S+/);
      if (!match) return "";
      const url = match[0];
      const rotulo = linha.replace(url, "").replace(/[:\-–—]\s*$/, "").trim();
      const servico = detectarServicoDoLink(url) || "link";
      return `<a href="${url}" target="_blank" rel="noopener" class="ai-briefing-link-pill">${escaparHTML(rotulo) || `Ver no ${servico}`} ↗</a>`;
    }).join("");
    return `<div class="ai-briefing-link-lista">${pills}</div>`;
  }

  return linkificarTexto(valor);
}

/**
 * Monta o botão "Ver versão original" + o painel escondido embaixo
 * dele, pra quem quiser conferir o texto exatamente como veio na
 * descrição da tarefa (antes da IA organizar). Só aparece se a versão
 * organizada realmente for diferente do original — não faz sentido
 * mostrar o botão se não mudou nada.
 */
function blocoVersaoOriginalHTML(resposta, respostaOriginal) {
  if (!respostaOriginal) return "";
  if (respostaOriginal.trim() === (resposta || "").trim()) return "";
  return `
    <button type="button" class="ai-briefing-toggle ai-briefing-ver-original-box">Ver versão original</button>
    <div class="ai-briefing-original-texto" hidden>${linkificarTexto(respostaOriginal)}</div>
  `;
}

/**
 * Liga o clique de cada botão "Ver versão original" dentro das
 * caixinhas do briefing — precisa ser chamado de novo toda vez que o
 * innerHTML do briefing é redesenhado (os botões são recriados do
 * zero), igual já acontece com wireBriefingCopyButtons.
 */
function wireBriefingVersaoOriginalToggles(resultEl) {
  resultEl.querySelectorAll(".ai-briefing-ver-original-box").forEach(btn => {
    btn.addEventListener("click", () => {
      const painel = btn.nextElementSibling;
      if (!painel) return;
      const abrindo = painel.hidden;
      painel.hidden = !abrindo;
      btn.textContent = abrindo ? "Ocultar versão original" : "Ver versão original";
    });
  });
}

/**
 * Escapa HTML (evita que o texto quebre a página se tiver < ou &, por
 * exemplo) e transforma links (http/https) em links clicáveis de
 * verdade — usado nos campos do briefing gerado pela IA, já que um
 * deles pode ser um link do Google Drive ou de referência.
 */
function escaparHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function linkificarTexto(texto) {
  const escapado = escaparHTML(texto);
  return escapado.replace(/(https?:\/\/[^\s<]+)/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

/**
 * O Runrun.it manda menções de comentário cruas, tipo
 * "<mention>@fulano</mention> confere isso aí". Antes de escapar/exibir
 * o texto em qualquer lugar (chat, notificações do sino), passa por
 * aqui pra virar destaque de verdade em vez de aparecer a tag crua ou
 * sumir sem querer.
 */
function formatarMencoes(texto) {
  if (!texto) return "";
  return texto.replace(/<mention>(.*?)<\/mention>/gi, (match, nome) => `__MENTION_START__${nome}__MENTION_END__`);
}
function aplicarMarcadoresDeMencao(textoEscapado) {
  return textoEscapado
    .replace(/__MENTION_START__/g, '<strong class="mention-tag">')
    .replace(/__MENTION_END__/g, "</strong>");
}

// Cores pra alternar entre os formatos gerados pela IA (mesmo estilo
// visual dos boxes que já existiam, só que agora com dados reais).
const CORES_FORMATO_BOX = ["fb-blue", "fb-purple", "fb-orange", "fb-teal", "fb-pink"];

/**
 * Chama o Gemini (via backend) pra organizar a descrição real da
 * tarefa em plataformas + formatos + um resumo do briefing, e desenha
 * o resultado no lugar do botão.
 */
function wireBriefingCopyButtons(resultEl) {
  resultEl.querySelectorAll(".ai-briefing-copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.texto).then(() => {
        const original = btn.innerHTML;
        btn.innerHTML = "✓";
        setTimeout(() => { btn.innerHTML = original; }, 1200);
      });
    });
  });
}

async function gerarBriefingComIA(task) {
  if (!document.getElementById("briefingResult")) return;

  if (!COLMEIA_API_URL) {
    const resultElInicial = document.getElementById("briefingResult");
    resultElInicial.innerHTML = `<p class="workflow-seq-empty">Backend não configurado.</p>`;
    task.briefingHTML = resultElInicial.innerHTML;
    return;
  }

  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "gerarBriefing", taskId: task.id }),
    });
    const data = await res.json();

    // Se o usuário já trocou de tarefa enquanto isso carregava, não
    // atualiza o pop-up de outra tarefa. Compara por id (não por
    // referência!) porque atualizarKanbanEmBackground() recria os
    // objetos de tarefa periodicamente — inclusive quando dá play/pausa.
    const taskAtual = tasks[detailIdx];
    if (!taskAtual || String(taskAtual.id) !== String(task.id)) return;

    // Busca o elemento DE NOVO (não usa uma referência guardada lá em
    // cima): se o pop-up foi redesenhado nesse meio-tempo — ex: o
    // usuário clicou em play/pausa, que chama renderDetail() na hora —
    // o elemento antigo já foi removido da tela, e escrever nele não
    // aparece pra ninguém (é como escrever numa folha que já foi pro lixo).
    const resultEl = document.getElementById("briefingResult");
    if (!resultEl) return;

    if (!data.ok) {
      resultEl.innerHTML = `<p class="workflow-seq-empty">${data.error || "Não consegui gerar o briefing."}</p>`;
      task.briefingHTML = resultEl.innerHTML;
      return;
    }
    if (data.semDescricao) {
      resultEl.innerHTML = `<p class="workflow-seq-empty">Essa tarefa não tem descrição pra organizar.</p>`;
      task.briefingHTML = resultEl.innerHTML;
      return;
    }

    const b = data.briefing || {};
    const plataformas = b.plataformas || [];
    const formatos = b.formatos || [];
    const resumo = b.resumo || "";
    // Campos dinâmicos — a IA identifica sozinha quais perguntas existem
    // na descrição (varia de tarefa pra tarefa) e devolve a resposta de
    // cada uma, exatamente como está escrita (nunca reescrita).
    const campos = (b.campos || []).filter(c => !ehCampoDuplicadoDePlataformaOuFormato(c.pergunta));

    // O campo de "texto na arte" ganha destaque especial (o designer vai
    // copiar isso direto pra peça) — identificado pela pergunta conter
    // as palavras "texto" e "arte", não importa a redação exata.
    const idxDestaque = campos.findIndex(c => ehCampoTextoNaArte(c.pergunta) && c.resposta);
    const campoDestaque = idxDestaque !== -1 ? campos[idxDestaque] : null;
    const camposSecundarios = campos.filter((c, i) => i !== idxDestaque);

    resultEl.innerHTML = `
      ${(plataformas.length || formatos.length) ? `
        <div class="ai-briefing-tags">
          ${plataformas.map(p => `<span class="ai-briefing-plataforma-tag">${p}</span>`).join("")}
          ${formatos.map((f, i) => `<div class="format-box format-box-sm ${CORES_FORMATO_BOX[i % CORES_FORMATO_BOX.length]}">${f}</div>`).join("")}
        </div>
      ` : ""}
      ${resumo ? `<p class="ai-briefing-resumo">${resumo}</p>` : ""}
      ${campoDestaque ? `
        <div class="ai-briefing-destaque">
          <div class="ai-briefing-destaque-corpo">
            <p class="ai-briefing-destaque-label">${campoDestaque.pergunta}</p>
            <p class="ai-briefing-destaque-valor">${escaparHTML(campoDestaque.resposta)}</p>
            ${blocoVersaoOriginalHTML(campoDestaque.resposta, campoDestaque.respostaOriginal)}
          </div>
          <button type="button" class="ai-briefing-copy-btn" data-texto="${escaparHTML(campoDestaque.resposta).replace(/"/g, "&quot;")}" title="Copiar texto">
            <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.8"/></svg>
          </button>
        </div>
      ` : ""}
      ${(() => {
        const preenchidos = camposSecundarios.filter(c => !respostaEhVazia(c.resposta));
        const vazios = camposSecundarios.filter(c => respostaEhVazia(c.resposta));
        return `
          ${preenchidos.length ? `
            <div class="ai-briefing-preenchidos">
              ${preenchidos.map(c => `
                <div class="ai-briefing-cat ${categoriaCampoBriefing(c.pergunta)}">
                  <div class="ai-briefing-cat-head">
                    <span class="ai-briefing-cat-icon">${c.pergunta.trim().charAt(0).toUpperCase()}</span>
                    <span class="ai-briefing-cat-label">${c.pergunta}</span>
                  </div>
                  <div class="ai-briefing-cat-corpo">
                    <div class="ai-briefing-cat-valor">${renderValorCampo(c.resposta)}</div>
                    ${blocoVersaoOriginalHTML(c.resposta, c.respostaOriginal)}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : ""}
          ${vazios.length ? `
            <div class="ai-briefing-vazios">
              <span class="ai-briefing-vazios-label">Vazios</span>
              ${vazios.map(c => `<span class="ai-briefing-vazio-bolha" title="${c.pergunta}">${c.pergunta.trim().charAt(0).toUpperCase()}</span>`).join("")}
            </div>
          ` : ""}
        `;
      })()}
    `;

    task.briefingHTML = resultEl.innerHTML; // guarda pronto — não perde mais em re-renders (ex: ao dar play)
    wireBriefingCopyButtons(resultEl);
    wireBriefingVersaoOriginalToggles(resultEl);
  } catch (err) {
    console.error("Falha ao gerar briefing com IA:", err);
    const resultElErro = document.getElementById("briefingResult");
    if (resultElErro && tasks[detailIdx] && String(tasks[detailIdx].id) === String(task.id)) {
      resultElErro.innerHTML = `<p class="workflow-seq-empty">Falha de conexão.</p>`;
      task.briefingHTML = resultElErro.innerHTML;
    }
  }
}

async function buscarDescricaoDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return "";
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarDescricao", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar descrição:", data.error);
      return "";
    }
    return data.descricao || "";
  } catch (err) {
    console.error("Falha ao buscar descrição no Runrun.it:", err);
    return "";
  }
}

async function salvarDescricaoNoBackend(taskId, texto) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "salvarDescricao", taskId, texto }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou salvar a descrição:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao salvar a descrição no Runrun.it:", err);
    return false;
  }
}

async function buscarComentariosDoBackend(taskId) {
  if (!COLMEIA_API_URL || !taskId) return [];
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarComentarios", taskId }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar comentários:", data.error);
      return [];
    }
    return data.comentarios || [];
  } catch (err) {
    console.error("Falha ao buscar comentários no Runrun.it:", err);
    return [];
  }
}

async function enviarComentarioNoBackend(taskId, texto) {
  if (!COLMEIA_API_URL || !taskId || !texto) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "adicionarComentario", taskId, texto }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o comentário:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao enviar comentário pro Runrun.it:", err);
    return false;
  }
}

async function reagirComentarioNoBackend(commentId, emoji) {
  if (!COLMEIA_API_URL || !commentId || !emoji) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "reagirComentario", commentId, emoji }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou a reação:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao reagir no Runrun.it:", err);
    return false;
  }
}

async function excluirComentarioNoBackend(commentId) {
  if (!COLMEIA_API_URL || !commentId) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "excluirComentario", commentId }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou excluir o comentário:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao excluir comentário no Runrun.it:", err);
    return false;
  }
}

async function enviarComentarioComAnexoNoBackend(taskId, texto, arquivo) {
  if (!COLMEIA_API_URL || !taskId || !arquivo) return false;
  try {
    const base64Dados = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
      reader.readAsDataURL(arquivo);
    });
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({
        acao: "adicionarComentarioComAnexo",
        taskId, texto,
        nomeArquivo: arquivo.name,
        mimeType: arquivo.type || "application/octet-stream",
        base64Dados,
      }),
    });
    const data = await res.json();
    if (!data.ok) console.error("Runrun.it recusou o anexo:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao enviar anexo pro Runrun.it:", err);
    return false;
  }
}

// Dados fake usados só se o backend falhar de verdade (ver
// carregarTarefasReais) — nunca aparecem enquanto está carregando.
