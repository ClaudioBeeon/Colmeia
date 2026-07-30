function chaveUploadVisto(link) {
  return "colmeia_upload_visto_" + link;
}
function uploadJaVisto(link) {
  try { return localStorage.getItem(chaveUploadVisto(link)) === "1"; } catch (err) { return false; }
}
function marcarUploadVisto(link) {
  // Guarda QUANDO foi dispensado (não só "1") pra dar pra limpar depois —
  // ver limparLixoAntigoDoNavegador. Continua sendo lido como "existe a
  // chave = já foi visto", então valores antigos ("1") seguem valendo.
  try { localStorage.setItem(chaveUploadVisto(link), String(Date.now())); } catch (err) { /* sem problema */ }
}

/**
 * Apaga do navegador as marcações antigas de "upload já dispensado" e de
 * "chat já lido". Essas duas listas nunca eram limpas: nascia uma chave
 * por conjunto de arquivos e uma por tarefa, e elas ficavam ali pra
 * sempre, fazendo o espaço guardado do navegador só crescer.
 *
 * Regras: upload dispensado só interessa por alguns dias (a notificação
 * dele só existe por 3 horas de qualquer forma); "chat já lido" é apagado
 * quando fica muito velho, mantendo um limite de quantidade — se um dia
 * uma tarefa antiga for reaberta, o pior que acontece é o pontinho de
 * "não lido" aparecer uma vez a mais.
 */
const LIXO_UPLOAD_VISTO_MS = 7 * 24 * 60 * 60 * 1000;  // 7 dias
const MAX_CHAVES_CHAT_VISTO = 400;

function limparLixoAntigoDoNavegador() {
  try {
    const agora = Date.now();
    const chatVistos = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (!chave) continue;
      if (chave.startsWith("colmeia_upload_visto_")) {
        const quando = Number(localStorage.getItem(chave));
        // Valor antigo ("1") não tem data: conta como velho e sai fora.
        if (!quando || (agora - quando) > LIXO_UPLOAD_VISTO_MS) chatVistos.push(chave);
      }
    }
    chatVistos.forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* segue */ } });

    // "Chat já lido": não tem data guardada (é o id do último comentário
    // visto), então a poda é por quantidade — mantém as mais recentes do
    // fim da lista e descarta o excesso.
    const chaves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave && chave.startsWith("colmeia_chat_visto_")) chaves.push(chave);
    }
    if (chaves.length > MAX_CHAVES_CHAT_VISTO) {
      chaves.slice(0, chaves.length - MAX_CHAVES_CHAT_VISTO)
        .forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* segue */ } });
    }
  } catch (err) {
    // Navegador sem acesso ao armazenamento (aba privada, por exemplo) —
    // não tem lixo pra limpar mesmo.
  }
}

/**
 * Mostra, dentro da aba Comentários, um aviso pra cada pasta onde o
 * designer logado subiu arquivo recentemente pro cliente dessa tarefa
 * — junto com "Copiar link" e "Ver", pra não precisar catar a pasta
 * certa no Drive na mão. Pode aparecer mais de um (ex: PSD numa pasta,
 * PNG em outra).
 *
 * Checa direto a pasta do card (Code.gs > buscarUploadsRecentesDoCard),
 * em vez do cache de 10 minutos do painel-designers-beeon — como o
 * Colmeia já sabe exatamente qual é a pasta dessa tarefa, a checagem é
 * instantânea (olha só 1 pasta, não o Drive inteiro).
 */
/**
 * Antes, a checagem de "você subiu um arquivo na pasta do card" só
 * rodava uma vez, no momento de abrir a tarefa — se o upload no Drive
 * acontecesse só depois (ex: em outra aba), a notificação nunca mais
 * aparecia até fechar e reabrir a tarefa. Agora, enquanto o pop-up da
 * tarefa fica aberto, o Colmeia rechecha sozinho a cada poucos
 * segundos (e também na hora, assim que a aba volta a ficar em foco —
 * o momento mais comum de ter acabado de subir algo no Drive em outra
 * aba/janela e voltado pro Colmeia pra copiar o link).
 */
let _intervalChecagemUpload = null;
function iniciarChecagemUploadEmSegundoPlano(task) {
  pararChecagemUploadEmSegundoPlano();
  if (!task.id) return;
  _intervalChecagemUpload = setInterval(() => {
    // Compara por id, não por referência — atualizarKanbanEmBackground()
    // recria os objetos de tarefa periodicamente, então "task" (capturado
    // no momento de abrir o card) deixa de ser === tasks[detailIdx] mesmo
    // continuando sendo a mesma tarefa. Isso fazia a checagem se
    // autodesligar sozinha pouco depois de abrir o card.
    const atual = tasks[detailIdx];
    if (!atual || String(atual.id) !== String(task.id)) { pararChecagemUploadEmSegundoPlano(); return; }
    renderNotificacoesUpload(atual);
  }, 8000);
}
function pararChecagemUploadEmSegundoPlano() {
  clearInterval(_intervalChecagemUpload);
  _intervalChecagemUpload = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && tasks[detailIdx] && tasks[detailIdx].id) {
    renderNotificacoesUpload(tasks[detailIdx]);
  }
});

async function renderNotificacoesUpload(task) {
  const container = document.getElementById("uploadNotifs");
  if (!container || !task.id) return;

  let resultado;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarUploadsRecentesDoCard", taskId: task.id, cliente: task.client }),
    });
    resultado = await res.json();
  } catch (err) {
    console.error("Falha ao checar uploads recentes da pasta do card:", err);
    return;
  }
  // Compara por id, não por referência (mesmo motivo do comentário acima).
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return; // trocou de tarefa enquanto carregava
  if (!resultado.ok || !resultado.uploads || !resultado.pastaUrl) {
    container.innerHTML = "";
    return;
  }

  const agora = Date.now();
  const arquivosRelevantes = resultado.uploads
    .filter(u =>
      // Antes exigia bater o nome de quem subiu com o designer logado —
      // mas em Drives Compartilhados o Google não expõe o dono do
      // arquivo (vem null), então essa checagem falhava sempre e a
      // notificação nunca aparecia. Como essa pasta já é específica
      // dessa tarefa, qualquer upload recente aqui é relevante — só
      // exclui se souber com certeza que foi outra pessoa.
      (u.quem === null || u.quem === undefined || nomesCorrespondem(u.quem, DESIGNER_LOGADO)) &&
      (agora - u.quando) < JANELA_NOTIFICACAO_UPLOAD_MS
    );

  if (arquivosRelevantes.length === 0) {
    container.innerHTML = "";
    return;
  }

  // IMPORTANTE: o "já visto" agora é por ESSE CONJUNTO EXATO de
  // arquivos, não pela pasta inteira — antes, dispensar a notificação
  // uma vez escondia a pasta pra sempre, mesmo quando um arquivo
  // totalmente novo aparecia nela depois. Assim que qualquer arquivo
  // novo entra na lista, a chave muda e a notificação volta a aparecer.
  const chaveConjunto = resultado.pastaUrl + "::" + arquivosRelevantes
    .map(u => u.arquivo + "@" + u.quando)
    .sort()
    .join("|");

  if (uploadJaVisto(chaveConjunto)) {
    container.innerHTML = "";
    return;
  }

  const nomesArquivos = arquivosRelevantes.map(u => u.arquivo);
  const grupos = [{ pasta: resultado.pastaNome || "pasta do card", link: resultado.pastaUrl, arquivos: nomesArquivos, chave: chaveConjunto }];

  // Upload não interrompe mais com pop-up (pílula/ilha) — só aparece
  // como aviso dentro da própria aba Comentários da tarefa
  // (container.innerHTML abaixo). Pop-up ficou reservado só pra menção
  // em comentário e tarefa recebida, ver pedido do Cláudio em
  // 2026-07-29 na memória "barra_amarela_dynamic_island".
  container.innerHTML = grupos.map(g => `
    <div class="upload-notif" data-link="${g.link}" data-chave="${escaparHTML(g.chave)}">
      <button type="button" class="upload-notif-dismiss" data-chave="${escaparHTML(g.chave)}" aria-label="Dispensar">×</button>
      <p class="upload-notif-text">Você adicionou ${g.arquivos.length} arquivo${g.arquivos.length > 1 ? "s" : ""} na pasta <strong>${g.pasta}</strong></p>
      <div class="upload-notif-actions">
        <button type="button" class="upload-notif-copy" data-link="${g.link}" data-chave="${escaparHTML(g.chave)}" data-qtd="${g.arquivos.length}">Adicionar ao comentário</button>
        <a href="${g.link}" target="_blank" rel="noopener" class="upload-notif-ver">Ver</a>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".upload-notif-copy").forEach(btn => {
    btn.addEventListener("click", () => {
      adicionarComentarioDeUpload(task, container, btn.dataset.link, Number(btn.dataset.qtd) || 1, btn.dataset.chave, btn);
    });
  });
  container.querySelectorAll(".upload-notif-dismiss").forEach(btn => {
    btn.addEventListener("click", () => {
      marcarUploadVisto(btn.dataset.chave);
      const el = container.querySelector(`.upload-notif[data-chave="${CSS.escape(btn.dataset.chave)}"]`);
      if (el) el.remove();
    });
  });
}

// Posta um comentário no Runrun.it com o link da pasta — usado tanto
// pelo botão "Adicionar ao comentário" dentro da aba Comentários quanto
// pela ação equivalente na ilha do topbar (mostrarIlha), que pode ser
// clicada bem depois, quando o `btn` original talvez nem exista mais na
// tela — por isso essa função nunca depende de um elemento de botão
// específico pra funcionar, só usa `btn` (opcional) pra dar feedback
// visual quando ele existe.
async function adicionarComentarioDeUpload(task, container, link, qtd, chave, btn) {
  if (!task.id) return;
  const original = btn ? btn.textContent : null;
  // Feedback NA HORA do clique — texto "Adicionado ✓" e o sumiço da
  // notificação acontecem antes de qualquer resposta do Runrun.it, sem
  // esperar a ida e volta (mesmo padrão otimista do resto do app). Só
  // desfaz tudo (e avisa por toast) se o Runrun.it recusar de verdade.
  if (btn) { btn.disabled = true; btn.textContent = "Adicionado ✓"; }
  const removerTimeout = setTimeout(() => {
    const el = container.querySelector(`.upload-notif[data-chave="${CSS.escape(chave)}"]`);
    if (el) el.remove();
  }, 900);

  const texto = `${qtd > 1 ? "Arquivos adicionados" : "Arquivo adicionado"} na pasta: ${link}`;
  const ok = await enviarComentarioNoBackend(task.id, texto);
  if (ok) {
    marcarUploadVisto(chave);
    if (chatThreadAtivo === "aqui" && chatAlvoTaskId === task.id) recarregarThreadAtiva();
  } else {
    clearTimeout(removerTimeout);
    if (btn) { btn.disabled = false; btn.textContent = original; }
    mostrarToast("Não consegui adicionar o comentário agora. Tenta de novo em alguns segundos.", "erro");
  }
}

/**
 * Depois de comentar numa subtarefa, pergunta se quer repetir o mesmo
 * comentário no card mãe também (evita ter que escrever duas vezes a
 * mesma coisa pro atendimento acompanhar).
 */
function mostrarPromptRepetirComentario(task, texto) {
  const el = document.getElementById("repetirComentarioPrompt");
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `
    <span>Repetir esse comentário no card mãe?</span>
    <button type="button" class="repetir-sim">Sim</button>
    <button type="button" class="repetir-nao">Não</button>
  `;
  el.querySelector(".repetir-nao").addEventListener("click", () => { el.hidden = true; });
  el.querySelector(".repetir-sim").addEventListener("click", async () => {
    el.innerHTML = `<span>Enviando pro card mãe...</span>`;
    const ok = await enviarComentarioNoBackend(task.parentTaskId, texto);
    el.innerHTML = ok ? `<span>✓ Repetido no card mãe.</span>` : `<span>Não consegui enviar pro card mãe.</span>`;
    setTimeout(() => { el.hidden = true; }, 2000);
  });
}

async function carregarDadosPainelBeeon() {
  if (!PAINEL_BEEON_API_URL) return;
  try {
    const res = await fetch(PAINEL_BEEON_API_URL);
    const resposta = await res.json();
    if (!resposta.ok) {
      console.error("Erro ao buscar dados do painel-designers-beeon:", resposta.error);
      return;
    }
    if (resposta.empty) {
      console.warn("O painel-designers-beeon respondeu, mas o estado está vazio (nada salvo lá ainda).");
      return;
    }

    // Log de diagnóstico — só na primeira carga, pra confirmarmos os
    // nomes exatos dos campos (principalmente onde ficam as fotos).
    console.log("[Colmeia] Estrutura recebida do painel-designers-beeon:", resposta.data);

    painelBeeonData = {
      designers: resposta.data.designers || [],
      roles: resposta.data.roles || {},
      state: resposta.data.state || {},
      photos: resposta.data.photos || {}, // designer -> URL da foto, confirmado no script.js do painel
    };

    // Depois de carregado, atualiza as páginas que dependem desses dados.
    buildClientsPage();
    buildAtendimentoPage();
    buildTiposPage();
    if (!document.getElementById("page-hoje").hidden) carregarAtividadesDrive();
  } catch (err) {
    console.error("Falha ao conectar com o painel-designers-beeon:", err);
  }
}

/**
 * Tenta achar a foto de um designer nos dados vindos do painel-beeon.
 * Confirmado no código-fonte do painel: o campo se chama "photos"
 * (designer -> URL da foto).
 */
