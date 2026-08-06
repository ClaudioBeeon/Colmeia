// ============================================================================
// CENTRAL DO ATENDIMENTO (2026-08-06)
// ============================================================================
//
// Área nova e SEPARADA do resto do Colmeia (pedido do Cláudio: "não é pra
// substituir nada, vão ser coisas separadas a central do atendimento e o
// Colmeia. A central é outra área, vai usar o colmeia mas a interface tudo é
// algo novo para o atendimento"). Por isso:
//
//   - NÃO usa mostrarPagina()/.app-page — é um overlay próprio (#centralAtendimento,
//     ver index.html), fixed, cobrindo o viewport inteiro por cima de tudo.
//   - Quem tem papel "atendimento" cai aqui direto ao logar (ver o fim de
//     iniciarAppPosLogin, js/login-boot.js) e nunca vê o quadro/sidebar normal.
//   - O Cláudio abre pelo ícone escondido da sidebar normal, pra cobrir/testar
//     (ver toggleCentralAtendimento aqui embaixo).
//
// DADO: nada aqui pede informação nova ao backend — reaproveita as DUAS ações
// que já existem e já são buscadas em outras telas:
//   - listarConferenciasPendentes (fila de conferência interna, mesma da
//     página de Aprovações do atendimento, AprovacaoInterna.gs)
//   - listarAprovacoesPendentes (o que já foi mandado pro cliente, mesma da
//     aba "Aprovações" da Fila de repasse, Aprovacao.gs)
// As quatro abas daqui são views diferentes do MESMO par de listas — zero
// rota nova no backend, zero risco de dessincronizar com o resto do app.
//
// AÇÕES: clicar numa peça da fila abre a MESMA tela de conferência de sempre
// (apvAbrirConferencia, js/pagina-aprovacao.js) — aprovar/pedir ajuste
// continuam acontecendo exatamente como já existiam, sem duplicar lógica.
// Clicar numa aprovação já enviada reaproveita cardDeAprovacaoHTML/
// wireCardsDeAprovacao (js/pagina-repasse.js) — os mesmos botões de
// WhatsApp/copiar link/abrir tarefa que a aba "Aprovações" da Fila de
// repasse já usa.
// ============================================================================

let centralFilaCache = [];
let centralAprovacoesCache = [];
let centralCarregado = false;
let centralAbaAtiva = "hoje";

// Ligado no carregamento do script (mesmo padrão do #sidebarLogout,
// js/login-boot.js) — não pode esperar a Central abrir uma vez pra só
// então funcionar, senão o Cláudio nunca conseguiria abrir a primeira vez.
// O botão nasce `hidden` no index.html; quem libera é iniciarAppPosLogin.
document.getElementById("centralAtendimentoNavBtn")?.addEventListener("click", e => {
  e.preventDefault();
  abrirCentralAtendimento();
});

/** Abre a Central — chamada no login (papel atendimento) ou pelo ícone do Cláudio. */
function abrirCentralAtendimento() {
  const overlay = document.getElementById("centralAtendimento");
  if (!overlay) return;

  document.getElementById("centralNomeUsuario").textContent = DESIGNER_LOGADO || "";
  document.getElementById("centralAvatarIniciais").textContent = typeof initials === "function" ? initials(DESIGNER_LOGADO || "") : "";
  document.getElementById("centralDateText").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "long" });

  // "Voltar pro Colmeia" só existe pra quem tem uma Colmeia de verdade
  // atrás pra voltar — o atendimento não tem (entrou direto aqui, nunca
  // viu o quadro), só "Sair" faz sentido pra eles.
  document.getElementById("centralVoltarBtn").hidden = !(typeof souClaudio === "function" && souClaudio());

  centralLigarEventosUmaVez();

  overlay.hidden = false;
  if (!centralCarregado) {
    centralCarregarDados();
  } else {
    // Reabriu (o Cláudio saiu e voltou) — redesenha com o que já tinha,
    // na hora, e busca de novo por baixo.
    centralRenderTudo();
    centralCarregarDados();
  }
}

function fecharCentralAtendimento() {
  document.getElementById("centralAtendimento").hidden = true;
}

let centralEventosLigados = false;
function centralLigarEventosUmaVez() {
  if (centralEventosLigados) return;
  centralEventosLigados = true;

  document.querySelectorAll(".central-nav-ic[data-central-tab]").forEach(btn => {
    btn.addEventListener("click", () => centralTrocarAba(btn.dataset.centralTab));
  });

  document.getElementById("centralVoltarBtn").addEventListener("click", fecharCentralAtendimento);
  document.getElementById("centralLogoutBtn").addEventListener("click", () => {
    if (typeof sairDoColmeia === "function") sairDoColmeia();
  });
}

function centralTrocarAba(aba) {
  centralAbaAtiva = aba;
  document.querySelectorAll(".central-nav-ic[data-central-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.centralTab === aba);
  });
  ["hoje", "clientes", "aprovacoes", "cobrancas"].forEach(nome => {
    const el = document.getElementById("centralTab" + nome.charAt(0).toUpperCase() + nome.slice(1));
    if (el) el.hidden = nome !== aba;
  });
}

async function centralCarregarDados() {
  const [fila, aprovacoes] = await Promise.all([
    chamarBackend({ acao: "listarConferenciasPendentes" }),
    // Reaproveita a MESMA função de pagina-repasse.js — já cuida de
    // reenviar avisos presos e de "sem rede devolve null" (caiuARede).
    (typeof carregarAprovacoesDoRepasse === "function") ? carregarAprovacoesDoRepasse() : null,
  ]);

  if (!caiuARede(fila) && fila && fila.ok) centralFilaCache = fila.itens || [];
  if (aprovacoes !== null) centralAprovacoesCache = aprovacoes || [];

  centralCarregado = true;
  centralRenderTudo();
}

function centralRenderTudo() {
  centralRenderHoje();
  centralRenderClientes();
  centralRenderAprovacoes();
  centralRenderCobrancas();
  centralAtualizarBadges();
}

// ---------------------------------------------------------------------------
// Helpers de dado — nada aqui busca nada, só recorta o que já está em cache.
// ---------------------------------------------------------------------------

function centralFilaPor(status) {
  return centralFilaCache.filter(it => it.status === status);
}
function centralAprovacoesPor(status) {
  return centralAprovacoesCache.filter(a => (a.status || "pendente") === status);
}

// ---------------------------------------------------------------------------
// ABA: HOJE — feed em seções por estado, cada uma respondendo uma pergunta
// direta ("o que eu faço primeiro?"). Ver o mesmo padrão em apvRenderFila.
// ---------------------------------------------------------------------------

function centralRenderHoje() {
  const el = document.getElementById("centralTabHoje");
  if (!el) return;

  const esperandoVoce = centralFilaPor("pendente");
  const prontasEnviar = centralFilaPor("aprovada");
  const comCliente = centralAprovacoesPor("pendente");
  const voltouAjuste = centralAprovacoesPor("ajuste");

  el.innerHTML = [
    centralSecaoHTML("Esperando você", "neutro", esperandoVoce.length, "sHoje1"),
    centralSecaoHTML("Prontas pra enviar", "verde", prontasEnviar.length, "sHoje2"),
    centralSecaoHTML("Com o cliente", "neutro", comCliente.length, "sHoje3"),
    centralSecaoHTML("Voltou com ajuste", voltouAjuste.length ? "ambar" : "neutro", voltouAjuste.length, "sHoje4", voltouAjuste.length === 0),
  ].join("");

  centralPreencherSecaoFila("sHoje1", esperandoVoce, "pendente");
  centralPreencherSecaoFila("sHoje2", prontasEnviar, "aprovada");
  centralPreencherSecaoAprovacoes("sHoje3", comCliente, "Nada esperando resposta do cliente agora.");
  centralPreencherSecaoAprovacoes("sHoje4", voltouAjuste, "Nada voltou pedindo ajuste.");

  centralLigarSecoesColapsaveis(el);
}

function centralSecaoHTML(titulo, cor, contagem, idCorpo, colapsada) {
  return `
    <div class="central-section ${colapsada ? "colapsada" : ""}" data-central-section>
      <button type="button" class="central-section-head" data-central-toggle>
        <span class="central-section-dot ${cor}"></span>
        <span class="central-section-title">${titulo}</span>
        <span class="central-section-count">${contagem}</span>
        <span class="central-section-caret"><svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button>
      <div class="central-section-body" id="${idCorpo}"></div>
    </div>
  `;
}

function centralLigarSecoesColapsaveis(container) {
  container.querySelectorAll("[data-central-toggle]").forEach(head => {
    head.addEventListener("click", () => head.closest("[data-central-section]").classList.toggle("colapsada"));
  });
}

/** Peças da fila de conferência interna (ainda não mandadas pro cliente). */
function centralPreencherSecaoFila(idCorpo, itens, status) {
  const corpo = document.getElementById(idCorpo);
  if (!corpo) return;
  if (!itens.length) {
    corpo.innerHTML = `<div class="central-section-empty">${status === "pendente" ? "Nada esperando conferência agora." : "Nada pronto pra enviar agora."}</div>`;
    return;
  }

  corpo.innerHTML = itens.map((item, i) => {
    const pecas = item.pecas || [];
    const rotulo = pecas.length > 1 ? `${pecas.length} peças (${pecas.map(p => p.nomePeca).join(", ")})` : (pecas[0] ? pecas[0].nomePeca : "");
    const entrega = item.prazo ? new Date(item.prazo) : null;
    const atrasada = entrega && entrega < new Date(new Date().toDateString());
    return `
      <button type="button" class="central-item central-item-clicavel" data-central-fila="${i}" data-central-fila-status="${status}">
        <div class="central-item-thumb" data-central-thumb="${escaparHTML((pecas[0] && pecas[0].fileId) || "")}">🖼️</div>
        <div class="central-item-body">
          <span class="central-item-cliente">${escaparHTML(item.cliente || "Sem cliente")}</span>
          <span class="central-item-peca">${escaparHTML(rotulo)}</span>
        </div>
        <div class="central-item-meta">
          ${entrega ? `<span class="central-chip ${atrasada ? "central-chip-vermelho" : "central-chip-neutro"}">entrega ${apvDataCurta(item.prazo)}</span>` : ""}
          ${status === "aprovada"
            ? `<span class="central-chip central-chip-verde">${item.aprovadoPor ? "aprovada por " + escaparHTML(item.aprovadoPor) : "aprovada"}</span>`
            : `<span class="central-chip central-chip-neutro">${apvTempoDeEspera(item.pedidoEm)}</span>`}
        </div>
      </button>
    `;
  }).join("");

  corpo.querySelectorAll("[data-central-fila]").forEach(btn => {
    const item = itens[Number(btn.dataset.centralFila)];
    btn.addEventListener("click", () => {
      // Abre a MESMA tela de conferência de sempre — aprovar/pedir ajuste
      // continuam acontecendo lá, sem duplicar nada aqui.
      if (typeof apvAbrirConferencia === "function") apvAbrirConferencia(item.taskId, item.loteId);
    });
    const thumbEl = btn.querySelector("[data-central-thumb]");
    const fileId = thumbEl && thumbEl.dataset.centralThumb;
    if (fileId && typeof apvCarregarMiniatura === "function") apvCarregarMiniatura(fileId, thumbEl);
  });
}

/** Peças já enviadas pro cliente (reaproveita o card pronto da Fila de repasse). */
function centralPreencherSecaoAprovacoes(idCorpo, itens, textoVazio) {
  const corpo = document.getElementById(idCorpo);
  if (!corpo) return;
  if (!itens.length) {
    corpo.innerHTML = `<div class="central-section-empty">${textoVazio}</div>`;
    return;
  }
  if (typeof cardDeAprovacaoHTML !== "function") { corpo.innerHTML = ""; return; }
  corpo.innerHTML = itens.map(cardDeAprovacaoHTML).join("");
  if (typeof wireCardsDeAprovacao === "function") wireCardsDeAprovacao(corpo);
}

// ---------------------------------------------------------------------------
// ABA: RADAR DE CLIENTES — agrupa listarAprovacoesPendentes por cliente.
// Cálculo 100% no navegador, em cima do que já veio — nenhuma busca nova.
// ---------------------------------------------------------------------------

function centralRenderClientes() {
  const el = document.getElementById("centralTabClientes");
  if (!el) return;

  const porCliente = {};
  centralAprovacoesCache.forEach(a => {
    const nome = a.cliente || "Sem cliente";
    if (!porCliente[nome]) porCliente[nome] = { esperando: 0, ajustes: 0, maxDias: 0 };
    const status = a.status || "pendente";
    if (status === "pendente" || status === "ajuste") porCliente[nome].esperando++;
    if (status === "ajuste") porCliente[nome].ajustes++;
    if (status === "pendente") {
      const dias = Math.floor((Date.now() - (Number(a.criadoEm) || 0)) / 86400000);
      porCliente[nome].maxDias = Math.max(porCliente[nome].maxDias, dias);
    }
  });

  const nomes = Object.keys(porCliente).sort((a, b) => porCliente[b].maxDias - porCliente[a].maxDias);
  if (!nomes.length) {
    el.innerHTML = `<div class="central-vazio-inline">Nenhum cliente com aprovação em aberto agora.</div>`;
    return;
  }

  const limite = typeof APROVACAO_DIAS_ALERTA === "number" ? APROVACAO_DIAS_ALERTA : 3;
  el.innerHTML = `<div class="central-clients-grid">${nomes.map(nome => {
    const c = porCliente[nome];
    const alerta = c.maxDias >= limite;
    return `
      <div class="central-client-card">
        <div class="central-client-top">
          <span class="central-client-dot ${alerta ? "ambar" : "ok"}"></span>
          <span class="central-client-name">${escaparHTML(nome)}</span>
        </div>
        <div class="central-client-stats">
          <div class="central-client-stat"><b>${c.esperando}</b><span>esperando</span></div>
          <div class="central-client-stat"><b>${c.ajustes}</b><span>ajustes</span></div>
        </div>
        ${alerta ? `<span class="central-client-flag">Parado há ${c.maxDias} dia${c.maxDias === 1 ? "" : "s"}</span>` : ""}
      </div>
    `;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// ABA: APROVAÇÕES — mesma fila e mesmas aprovações do "Hoje", só que em
// colunas por estado em vez de feed — pra quem prefere visão de quadro.
// ---------------------------------------------------------------------------

function centralRenderAprovacoes() {
  const el = document.getElementById("centralTabAprovacoes");
  if (!el) return;

  const esperandoVoce = centralFilaPor("pendente");
  const prontasEnviar = centralFilaPor("aprovada");
  const comCliente = centralAprovacoesPor("pendente");
  const voltouAjuste = centralAprovacoesPor("ajuste");

  el.innerHTML = `
    <div class="central-approvals-cols">
      <div class="central-approvals-col">
        <div class="central-approvals-col-head"><span class="central-approvals-col-title">Esperando você</span><span class="central-approvals-col-count">${esperandoVoce.length}</span></div>
        <div class="central-section-body" id="aColEsperando"></div>
      </div>
      <div class="central-approvals-col">
        <div class="central-approvals-col-head"><span class="central-approvals-col-title">Prontas pra enviar</span><span class="central-approvals-col-count">${prontasEnviar.length}</span></div>
        <div class="central-section-body" id="aColProntas"></div>
      </div>
      <div class="central-approvals-col">
        <div class="central-approvals-col-head"><span class="central-approvals-col-title">Com o cliente</span><span class="central-approvals-col-count">${comCliente.length}</span></div>
        <div class="central-section-body" id="aColCliente"></div>
      </div>
      <div class="central-approvals-col">
        <div class="central-approvals-col-head"><span class="central-approvals-col-title">Voltou com ajuste</span><span class="central-approvals-col-count">${voltouAjuste.length}</span></div>
        <div class="central-section-body" id="aColAjuste"></div>
      </div>
    </div>
  `;

  centralPreencherSecaoFila("aColEsperando", esperandoVoce, "pendente");
  centralPreencherSecaoFila("aColProntas", prontasEnviar, "aprovada");
  centralPreencherSecaoAprovacoes("aColCliente", comCliente, "Nada aqui.");
  centralPreencherSecaoAprovacoes("aColAjuste", voltouAjuste, "Nada aqui.");
}

// ---------------------------------------------------------------------------
// ABA: COBRANÇAS — rascunhos prontos pra revisar e mandar. Sem IA por
// enquanto (nada vai pro Runrun.it/WhatsApp sozinho de qualquer jeito):
// um texto-modelo já identifica cliente/peça/tempo de espera, que é o que
// mais falta na hora de cobrar. Reaproveita o MESMO link wa.me/?text= sem
// número (abre o seletor de conversa do WhatsApp do atendimento) que a aba
// Aprovações da Fila de repasse já usa.
// ---------------------------------------------------------------------------

function centralRenderCobrancas() {
  const el = document.getElementById("centralTabCobrancas");
  if (!el) return;

  const limite = typeof APROVACAO_DIAS_ALERTA === "number" ? APROVACAO_DIAS_ALERTA : 3;
  const paradas = centralAprovacoesPor("pendente").filter(a => {
    const dias = Math.floor((Date.now() - (Number(a.criadoEm) || 0)) / 86400000);
    return dias >= limite;
  });
  const semRepasse = centralAprovacoesPor("ajuste");

  el.innerHTML = [
    centralSecaoHTML("Cliente sem responder", "ambar", paradas.length, "cCobranca1", paradas.length === 0),
    centralSecaoHTML("Ajuste voltou, ainda dá pra cobrar o designer", "neutro", semRepasse.length, "cCobranca2", semRepasse.length === 0),
  ].join("");

  centralPreencherSecaoCobranca("cCobranca1", paradas, "cliente");
  centralPreencherSecaoCobranca("cCobranca2", semRepasse, "designer");
  centralLigarSecoesColapsaveis(el);

  if (!paradas.length && !semRepasse.length) {
    el.innerHTML = `<div class="central-vazio-inline">Nada pra cobrar agora. 🎉</div>`;
  }
}

function centralPreencherSecaoCobranca(idCorpo, itens, tipo) {
  const corpo = document.getElementById(idCorpo);
  if (!corpo) return;
  if (!itens.length) { corpo.innerHTML = ""; return; }

  corpo.innerHTML = itens.map((a, i) => {
    const dias = Math.floor((Date.now() - (Number(a.criadoEm) || 0)) / 86400000);
    const texto = tipo === "cliente"
      ? `Oi! Passando pra saber se você já conseguiu dar uma olhada em "${a.tituloTarefa || a.nomeArquivo || "a peça"}" — ela está esperando resposta há ${dias} dia${dias === 1 ? "" : "s"}. Qualquer coisa é só chamar 🙂`
      : `Oi! O cliente ${escaparParaTexto(a.cliente || "")} pediu ajuste em "${a.tituloTarefa || a.nomeArquivo || "a peça"}"${a.respostaTexto ? `: "${a.respostaTexto}"` : ""}. Você já viu?`;
    return `
      <div class="central-item">
        <div class="central-item-thumb">${a.ehVideo ? "🎬" : "🖼️"}</div>
        <div class="central-item-body">
          <span class="central-item-cliente">${escaparHTML(a.cliente || "Sem cliente")}</span>
          <span class="central-item-peca">${escaparHTML(a.tituloTarefa || a.nomeArquivo || "")}</span>
          <p class="central-cobranca-texto">${escaparHTML(texto)}</p>
        </div>
        <div class="central-item-actions">
          <button type="button" class="central-act-btn cobrar" data-central-cobrar="${i}" title="Mandar no WhatsApp">
            <svg viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join("");

  corpo.querySelectorAll("[data-central-cobrar]").forEach(btn => {
    const a = itens[Number(btn.dataset.centralCobrar)];
    btn.addEventListener("click", () => {
      const texto = btn.closest(".central-item").querySelector(".central-cobranca-texto").textContent;
      const link = tipo === "cliente" && a.codigo && typeof urlDeAprovacao === "function" ? "\n\n" + urlDeAprovacao(a.codigo) : "";
      window.open("https://wa.me/?text=" + encodeURIComponent(texto + link), "_blank", "noopener");
    });
  });
}

/** Mesmo escape de HTML, só que devolvendo texto puro (pra montar dentro de outra string antes de escapar tudo junto). */
function escaparParaTexto(t) { return String(t == null ? "" : t); }

// ---------------------------------------------------------------------------
// Contadores nos ícones da sidebar própria.
// ---------------------------------------------------------------------------

function centralAtualizarBadges() {
  const precisamDeVoce = centralFilaPor("pendente").length + centralFilaPor("aprovada").length;
  const badgeAprov = document.getElementById("centralBadgeAprovacoes");
  if (badgeAprov) {
    badgeAprov.textContent = precisamDeVoce > 99 ? "99+" : String(precisamDeVoce);
    badgeAprov.hidden = precisamDeVoce === 0;
  }

  const limite = typeof APROVACAO_DIAS_ALERTA === "number" ? APROVACAO_DIAS_ALERTA : 3;
  const cobrancas = centralAprovacoesPor("pendente").filter(a => Math.floor((Date.now() - (Number(a.criadoEm) || 0)) / 86400000) >= limite).length
    + centralAprovacoesPor("ajuste").length;
  const badgeCobr = document.getElementById("centralBadgeCobrancas");
  if (badgeCobr) {
    badgeCobr.textContent = cobrancas > 99 ? "99+" : String(cobrancas);
    badgeCobr.hidden = cobrancas === 0;
  }
}
