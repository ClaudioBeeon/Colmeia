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

  // Setinhas de transferir/voltar direto aqui dentro do modal — pra não
  // precisar fechar ele e usar as setas do cabeçalho só pra avançar ou
  // desfazer uma etapa. Só aparecem se já tiver uma sequência de verdade
  // (e "Voltar" só habilita se tiver alguém antes pra voltar).
  const atualIdx = seq.findIndex(s => s.atual);
  const temEtapaAtualDeVerdade = atualIdx !== -1 && !seq[atualIdx].pendente;
  const podeVoltar = temEtapaAtualDeVerdade && atualIdx > 0;
  const podeAvancar = temEtapaAtualDeVerdade;

  body.innerHTML = `
    ${seq.length > 0 ? `
      <div class="rule-modal-transfer-row">
        <button type="button" class="rule-modal-nav-btn" id="ruleModalPrevArrow" ${podeVoltar ? "" : "disabled"} title="Voltar pro responsável anterior">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Voltar</span>
        </button>
        <button type="button" class="rule-modal-nav-btn" id="ruleModalNextArrow" ${podeAvancar ? "" : "disabled"} title="Transferir pro próximo responsável">
          <span>Transferir</span>
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    ` : ""}
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

  const prevArrow = document.getElementById("ruleModalPrevArrow");
  if (prevArrow && podeVoltar) {
    prevArrow.addEventListener("click", async () => {
      prevArrow.disabled = true;
      await pararCronometroAoTransferir(task);
      const novoResponsavel = await desfazerWorkflowNoBackend(task.id);
      if (novoResponsavel) {
        task.assignee = novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
        agendarAtualizacaoKanban();
        // Mesma proteção do botão de avançar direto no card da fila de
        // Repasse (ver confirmarEAvancarSequenciaCard, js/pagina-repasse.js):
        // sem isso, transferir por AQUI (dentro do modal "Ver regra") fazia
        // o card sumir da fila sozinho assim que a atualização em segundo
        // plano rodava, porque a tarefa deixava de ser seu "de verdade".
        if (typeof repasseRecemAvancados !== "undefined") repasseRecemAvancados.add(task.id);
      }
      await atualizarSequenciaEModal(task); // sincroniza com o real — desfaz sozinho se recusou
    });
  }
  const nextArrow = document.getElementById("ruleModalNextArrow");
  if (nextArrow && podeAvancar) {
    nextArrow.addEventListener("click", async () => {
      nextArrow.disabled = true;
      await pararCronometroAoTransferir(task);
      // Guarda quem estava com a tarefa ANTES de tentar avançar, pra
      // poder conferir com o estado real do Runrun.it depois — o
      // Apps Script às vezes demora demais e devolve erro mesmo quando
      // a transferência aconteceu de verdade do outro lado (ex: outras
      // checagens em segundo plano sobrecarregando ele no mesmo
      // instante). Sem essa conferência, o usuário via um "erro" que
      // não era real.
      const atualIdxAntes = (task.sequencia || []).findIndex(s => s.atual);
      const nomeAtualAntes = atualIdxAntes !== -1 ? task.sequencia[atualIdxAntes].nome : null;
      const resultado = await avancarWorkflowNoBackend(task.id);
      if (resultado.novoResponsavel) {
        task.assignee = resultado.novoResponsavel;
        task.assigneeAvatarUrl = null;
        render();
        agendarAtualizacaoKanban();
        // Ver comentário equivalente no prevArrow acima.
        if (typeof repasseRecemAvancados !== "undefined") repasseRecemAvancados.add(task.id);
      }
      await atualizarSequenciaEModal(task); // sincroniza com o real ANTES de decidir se mostra erro
      const atualIdxDepois = (task.sequencia || []).findIndex(s => s.atual);
      const nomeAtualDepois = atualIdxDepois !== -1 ? task.sequencia[atualIdxDepois].nome : null;
      const realmenteNaoAvancou = nomeAtualDepois === nomeAtualAntes;
      if (!resultado.ok && realmenteNaoAvancou) mostrarToast("Não consegui avançar a sequência dessa tarefa agora.", "erro");
    });
  }

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
    const data = await chamarBackend({ acao: "removerDaRegra", workflowId, elementId });
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
    const data = await chamarBackend({ acao: "entregarTarefa", taskId });
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
    const data = await chamarBackend({ acao: "reabrirTarefa", taskId });
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
    // Passa pela fila de ações: se a internet estiver fora, isso fica
    // guardado e vai sozinho quando voltar (ver js/fila-offline.js).
    const data = await enviarEscritaNoBackend({ acao: "alterarEntrega", taskId, novaData }, "mudar a Entrega Desejada");
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
    // Passa pela fila de ações: se a internet estiver fora, isso fica
    // guardado e vai sozinho quando voltar (ver js/fila-offline.js).
    const data = await enviarEscritaNoBackend({ acao: "alterarPublicacao", taskId, novaData }, "mudar a Data de Publicação");
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
    // Passa pela fila de ações: se a internet estiver fora, isso fica
    // guardado e vai sozinho quando voltar (ver js/fila-offline.js).
    const data = await enviarEscritaNoBackend({ acao: "moverEtapa", taskId, chaveColuna }, "mover de coluna");
    if (!data.ok) console.error("Runrun.it recusou mover a etapa:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao mover a etapa no Runrun.it:", err);
    return false;
  }
}

// Igual moverEtapaNoBackend, mas pra qualquer etapa de verdade do
// Runrun.it (taskStateId, não a chave fixa das 5 colunas) — usada pelo
// arrastar-e-soltar da página "Runrun completo".
async function moverEtapaArbitrariaNoBackend(taskId, taskStateId) {
  if (!COLMEIA_API_URL || !taskId || !taskStateId) return false;
  try {
    // Passa pela fila de ações: se a internet estiver fora, isso fica
    // guardado e vai sozinho quando voltar (ver js/fila-offline.js).
    const data = await enviarEscritaNoBackend({ acao: "moverEtapaArbitraria", taskId, taskStateId }, "mover de etapa");
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
    // Passa pela fila de ações: se a internet estiver fora, isso fica
    // guardado e vai sozinho quando voltar (ver js/fila-offline.js).
    const data = await enviarEscritaNoBackend({ acao: "ajustarEstimativa", taskId, minutos }, "ajustar a estimativa");
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
    const data = await chamarBackend({ acao: "desfazerWorkflow", taskId });
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
    const data = await chamarBackend({ acao: "listarUsuarios" });
    if (!data.ok) {
      console.error("Erro ao listar usuários do Runrun.it:", data.error);
      return [];
    }
    usuariosRunrunCache = data.usuarios || [];
    // As fotos dessa lista são exatamente as que a animação de "adicionar
    // pessoa" na regra vai precisar mostrar na hora (ver
    // adicionarPessoaOtimista, mais abaixo) — precarrega pra não esperar
    // o <img> baixar no meio da animação (ver precarregarFotosConhecidas,
    // js/pessoas-fotos.js).
    precarregarFotosConhecidas();
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

// Existiam DUAS funções quase iguais pra transformar link em clicável
// (essa e linkifyTexto, em js/chat-comentarios.js), então qualquer
// correção tinha que ser feita nas duas. Agora essa só escapa o texto e
// entrega pra outra fazer o trabalho — de brinde, os campos do briefing
// passaram a reconhecer link começando com "www." e a não engolir
// pontuação colada no fim do endereço, que a outra já tratava.
function linkificarTexto(texto) {
  return linkifyTexto(escaparHTML(texto));
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
    // Briefing guardado no navegador (ver js/cache-tarefas.js): aparece na
    // hora e continua sendo conferido por trás. Só preenche se a tarefa
    // ainda não tem nada na tela — nunca sobrescreve um briefing que já
    // foi desenhado nesta sessão.
    if (task.briefingHTML === undefined && typeof lerDetalheDoCache === "function") {
      try {
        const guardado = await lerDetalheDoCache(task.id);
        const elCache = document.getElementById("briefingResult");
        const taskDaVez = tasks[detailIdx];
        if (typeof medirOrigemDoDado === "function") {
          medirOrigemDoDado("briefing", guardado && guardado.briefingHTML ? "cache" : "servidor");
        }
        if (guardado && guardado.briefingHTML && elCache && taskDaVez
            && String(taskDaVez.id) === String(task.id)) {
          elCache.innerHTML = guardado.briefingHTML;
          task.briefingHTML = guardado.briefingHTML;
          wireBriefingCopyButtons(elCache);
          wireBriefingVersaoOriginalToggles(elCache);
        }
      } catch (err) { /* sem cache: segue no caminho normal */ }
    }

    const data = await chamarBackend({ acao: "gerarBriefing", taskId: task.id });

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
      <span class="bee-selo-mini" title="Organizado pela Bee">${beeIcon}</span>
      ${(plataformas.length || formatos.length) ? `
        <div class="ai-briefing-tags">
          ${plataformas.map(p => `<span class="ai-briefing-plataforma-tag">${escaparHTML(p)}</span>`).join("")}
          ${formatos.map((f, i) => `<div class="format-box format-box-sm ${CORES_FORMATO_BOX[i % CORES_FORMATO_BOX.length]}">${escaparHTML(f)}</div>`).join("")}
        </div>
      ` : ""}
      ${resumo ? `<p class="ai-briefing-resumo">${escaparHTML(resumo)}</p>` : ""}
      ${campoDestaque ? `
        <div class="ai-briefing-destaque">
          <div class="ai-briefing-destaque-corpo">
            <p class="ai-briefing-destaque-label">${escaparHTML(campoDestaque.pergunta)}</p>
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
                    <span class="ai-briefing-cat-label">${escaparHTML(c.pergunta)}</span>
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
              ${vazios.map(c => `<span class="ai-briefing-vazio-bolha" title="${escaparHTML(c.pergunta)}">${c.pergunta.trim().charAt(0).toUpperCase()}</span>`).join("")}
            </div>
          ` : ""}
        `;
      })()}
    `;

    task.briefingHTML = resultEl.innerHTML; // guarda pronto — não perde mais em re-renders (ex: ao dar play)
    // E também no navegador, pra sobreviver ao F5 e ao dia seguinte.
    // Só o briefing MONTADO (este caminho de sucesso): as mensagens de
    // erro e de "sem descrição" acima ficam de fora de propósito, senão
    // um soluço de hoje viraria "essa tarefa não tem descrição" pra sempre.
    if (typeof guardarDetalheNoCache === "function") {
      guardarDetalheNoCache(task.id, { briefingHTML: task.briefingHTML });
    }
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

/**
 * Devolve o texto da descrição, `""` quando a tarefa realmente não tem
 * descrição, e `null` quando NÃO DEU pra perguntar (rede fora, servidor
 * mudo). Antes devolvia `""` nos três casos — e aí uma piscada de
 * internet fazia o card AFIRMAR "Sem descrição cadastrada nessa tarefa"
 * numa tarefa que tinha descrição sim. Quem chama tem que tratar o
 * `null` preservando o que já está na tela.
 */
async function buscarDescricaoDoBackend(taskId) {
  if (!taskId) return "";
  const data = await chamarBackend({ acao: "buscarDescricao", taskId });
  if (caiuARede(data)) return null;
  if (!data.ok) return null; // o backend respondeu, mas com erro — também não sabemos a descrição
  return data.descricao || "";
}

async function salvarDescricaoNoBackend(taskId, texto) {
  if (!COLMEIA_API_URL || !taskId) return false;
  try {
    // Passa pela fila de ações: se a internet estiver fora, isso fica
    // guardado e vai sozinho quando voltar (ver js/fila-offline.js).
    const data = await enviarEscritaNoBackend({ acao: "salvarDescricao", taskId, texto }, "salvar a descrição");
    if (!data.ok) console.error("Runrun.it recusou salvar a descrição:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao salvar a descrição no Runrun.it:", err);
    return false;
  }
}

/**
 * Devolve a lista de comentários, `[]` quando a tarefa realmente não tem
 * nenhum, e `null` quando NÃO DEU pra perguntar (rede fora, servidor
 * mudo).
 *
 * Essa distinção é o que impede o pior efeito colateral que o app tinha:
 * antes, uma falha de rede virava `[]`, o chat era redesenhado com essa
 * lista vazia e a CONVERSA INTEIRA sumia da tela ("Nenhum comentário
 * ainda"), mesmo estando tudo salvo no Runrun.it. Quem chama tem que
 * tratar o `null` preservando o que já está na tela.
 */
async function buscarComentariosDoBackend(taskId) {
  if (!taskId) return [];
  const data = await chamarBackend({ acao: "listarComentarios", taskId });
  if (caiuARede(data)) return null;
  if (!data.ok) return null; // o backend respondeu, mas com erro — não é "não tem comentário"
  return data.comentarios || [];
}

/**
 * Devolve { ok, enfileirado } — não só um booleano. "adicionarComentario"
 * está em ACOES_QUE_PODEM_ESPERAR (js/fila-offline.js): quando a rede
 * falha na hora, `enviarEscritaNoBackend` NÃO manda o comentário pro
 * Runrun.it agora — guarda pra mandar sozinho depois — mas já devolve
 * `ok:true` (é assim que a fila funciona pra toda ação). Sem diferenciar
 * os dois casos, quem chama (enviarParaAlvo, js/detalhe-modal.js) tratava
 * "guardado pra depois" como "já está lá" e recarregava a conversa na
 * hora — como o comentário ainda não existe de verdade no Runrun.it, essa
 * recarga reescrevia a tela SEM ele, e a pessoa via o próprio comentário
 * sumir (mesmo ele estando salvo e indo ser enviado sozinho em breve).
 */
async function enviarComentarioNoBackend(taskId, texto) {
  if (!COLMEIA_API_URL || !taskId || !texto) return { ok: false };
  try {
    // donoDaTarefa/tituloDaTarefa não mudam o comentário em nada — são só
    // o contexto pro feed da aba Bee saber quem deve ver "fulano comentou
    // em X" (ver registrarEventosDoFeed em Código.gs). O backend já ignora
    // sozinho quando o autor é o próprio dono.
    const t = (typeof tasks !== "undefined" ? tasks.find(x => String(x.id) === String(taskId)) : null)
      || (typeof tasksTodas !== "undefined" ? tasksTodas.find(x => String(x.id) === String(taskId)) : null);
    // Passa pela fila de ações: se a internet estiver fora, isso fica
    // guardado e vai sozinho quando voltar (ver js/fila-offline.js).
    const data = await enviarEscritaNoBackend({
      acao: "adicionarComentario", taskId, texto,
      autorDoFeed: DESIGNER_LOGADO,
      donoDaTarefa: t ? t.assignee : null,
      tituloDaTarefa: t ? t.title : "",
    }, "enviar o comentário");
    if (!data.ok) console.error("Runrun.it recusou o comentário:", data.error);
    return { ok: data.ok, enfileirado: !!data.enfileirado, error: data.error };
  } catch (err) {
    console.error("Falha ao enviar comentário pro Runrun.it:", err);
    return { ok: false };
  }
}

async function reagirComentarioNoBackend(commentId, emoji) {
  if (!COLMEIA_API_URL || !commentId || !emoji) return false;
  try {
    const data = await chamarBackend({ acao: "reagirComentario", commentId, emoji });
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
    const data = await chamarBackend({ acao: "excluirComentario", commentId });
    if (!data.ok) console.error("Runrun.it recusou excluir o comentário:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao excluir comentário no Runrun.it:", err);
    return false;
  }
}

async function editarComentarioNoBackend(commentId, texto) {
  if (!COLMEIA_API_URL || !commentId || !texto) return false;
  try {
    const data = await chamarBackend({ acao: "editarComentario", commentId, texto });
    if (!data.ok) console.error("Runrun.it recusou editar o comentário:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao editar comentário no Runrun.it:", err);
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
    const data = await chamarBackend({
        acao: "adicionarComentarioComAnexo",
        taskId, texto,
        nomeArquivo: arquivo.name,
        mimeType: arquivo.type || "application/octet-stream",
        base64Dados,
      });
    if (!data.ok) console.error("Runrun.it recusou o anexo:", data.error);
    return data.ok;
  } catch (err) {
    console.error("Falha ao enviar anexo pro Runrun.it:", err);
    return false;
  }
}

// Dados fake usados só se o backend falhar de verdade (ver
// carregarTarefasReais) — nunca aparecem enquanto está carregando.
