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

// "" = coordenador vendo TUDO (o padrão); um nome = coordenador vendo como
// se fosse aquela pessoa. Só existe de verdade pra quem souCoordenadorDoAtendimento()
// — pra Laura/Manu/Giovanna nunca muda (elas nem veem o seletor).
let centralFiltroPessoa = "";

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

  // O seletor "ver como" é só pra quem coordena (Cláudio, João Paulo,
  // Lucas — ver souCoordenadorDoAtendimento, js/login-boot.js).
  const filtroWrap = document.getElementById("centralFiltroPessoaWrap");
  const souCoord = typeof souCoordenadorDoAtendimento === "function" && souCoordenadorDoAtendimento();
  if (filtroWrap) {
    filtroWrap.hidden = !souCoord;
    if (souCoord) centralPopularFiltroPessoa();
  }

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

/** A Central está aberta na tela agora? Ver o gancho em carregarDadosPainelBeeon (js/notificacoes-uploads.js). */
function centralAtendimentoAberta() {
  const overlay = document.getElementById("centralAtendimento");
  return !!overlay && !overlay.hidden;
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

  document.getElementById("centralFiltroPessoaSelect")?.addEventListener("change", e => {
    centralFiltroPessoa = e.target.value;
    centralRenderTudo();
  });
}

/** Preenche o seletor "ver como" com um nome por pessoa do atendimento — uma vez só. */
function centralPopularFiltroPessoa() {
  const select = document.getElementById("centralFiltroPessoaSelect");
  if (!select || select.dataset.populado) return;
  select.dataset.populado = "1";

  // Mesma lista do link por pessoa (ROTEADOR_SLUGS_PESSOA,
  // js/roteador-url.js) — é o mesmo roster de atendimento, só que aqui
  // como "Nome de verdade" direto (não precisa do slug da URL).
  const nomes = typeof ROTEADOR_SLUGS_PESSOA === "object" ? Object.values(ROTEADOR_SLUGS_PESSOA) : [];
  nomes.forEach(nome => {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    select.appendChild(opt);
  });
}

function centralTrocarAba(aba) {
  centralAbaAtiva = aba;
  document.querySelectorAll(".central-nav-ic[data-central-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.centralTab === aba);
  });
  ["hoje", "clientes", "aprovacoes", "cobrancas", "metricas"].forEach(nome => {
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

  // Guarda os dados CRUS — sem filtrar por cliente aqui (ver o porquê no
  // comentário de centralClienteEhDoLogado, mais abaixo).
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
  centralRenderMetricas();
  centralAtualizarBadges();
}

// ---------------------------------------------------------------------------
// Helpers de dado — nada aqui busca nada, só recorta o que já está em cache.
// ---------------------------------------------------------------------------

// Cada atendimento vê só os PRÓPRIOS clientes (pedido do Cláudio,
// 2026-08-06); o Cláudio continua vendo tudo, porque coordena todo mundo.
// O filtro é aplicado AQUI, na LEITURA do cache (não guardado já filtrado
// em centralFilaCache/centralAprovacoesCache) de propósito: painelBeeonData
// (de onde vem o vínculo cliente→atendimento) busca em paralelo com a fila/
// aprovações, e pode chegar DEPOIS. Se o filtro fosse aplicado só uma vez
// na busca, a Central abriria mostrando tudo (sem vínculo carregado ainda)
// e nunca corrigiria sozinha — filtrar na leitura faz o redesenho que vem
// do gancho em carregarDadosPainelBeeon (js/notificacoes-uploads.js)
// aplicar o filtro certo assim que o vínculo chegar.
function centralFilaPor(status) {
  return centralFilaCache.filter(it => it.status === status && centralClienteEhDoLogado(it.cliente));
}
function centralAprovacoesPor(status) {
  return centralAprovacoesCache.filter(a => (a.status || "pendente") === status && centralClienteEhDoLogado(a.cliente));
}

/**
 * Coordenador (Cláudio, João Paulo, Lucas — ver souCoordenadorDoAtendimento,
 * js/login-boot.js) vê TUDO por padrão, ou pode filtrar como se fosse uma
 * pessoa só (centralFiltroPessoa, escolhido no seletor "ver como" do topo).
 * Quem não coordena (Laura, Manu, Giovanna) só vê os PRÓPRIOS clientes,
 * sempre — não tem seletor pra elas mudarem isso.
 *
 * Reaproveita o MESMO vínculo cliente→atendimento que a página "Clientes
 * por atendimento" já lê do painel-designers-beeon
 * (painelBeeonData.state[designer][i].atend — ver pdTodosClientesPlano,
 * js/paginas-designers.js) — nenhum cadastro novo.
 *
 * Cliente sem vínculo cadastrado lá aparece pra todo mundo: melhor mostrar
 * a mais do que esconder trabalho de verdade por um cadastro que faltou.
 */
function centralClienteEhDoLogado(nomeCliente) {
  const souCoord = typeof souCoordenadorDoAtendimento === "function" && souCoordenadorDoAtendimento();
  if (souCoord && !centralFiltroPessoa) return true; // coordenador vendo tudo (padrão)

  const nomeAlvo = souCoord ? centralFiltroPessoa : DESIGNER_LOGADO;
  if (typeof pdTodosClientesPlano !== "function") return true;

  const alvo = normalizarParaComparar(nomeCliente || "");
  const encontrado = pdTodosClientesPlano().find(({ c }) => c && c.cliente && normalizarParaComparar(c.cliente) === alvo);
  const atend = encontrado && encontrado.c.atend;
  if (!atend) return true;
  return typeof nomesCorrespondem === "function" && nomesCorrespondem(atend, nomeAlvo);
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
  centralAprovacoesCache.filter(a => centralClienteEhDoLogado(a.cliente)).forEach(a => {
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

// ---------------------------------------------------------------------------
// ABA: MINHAS MÉTRICAS — mesma composição visual de "Minhas horas" (o
// painel do designer), reaproveitando as classes hr-* (css/04-paginas.css)
// com dado de peças/aprovações no lugar de horas. Ver o markup em
// index.html (#centralTabMetricas) pro porquê dos ids com prefixo `cm`.
// Nada aqui busca nada no backend — tudo em cima de centralFilaCache/
// centralAprovacoesCache, já filtrados por centralClienteEhDoLogado.
// ---------------------------------------------------------------------------

const CENTRAL_DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Segunda-feira da semana de hoje (mesma regra de segundaDaSemana, js/pagina-horas.js). */
function centralSegundaDaSemana() {
  const d = new Date();
  const diaDaSemana = d.getDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  d.setDate(d.getDate() - recuo);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** As aprovações que valem pra ESTA pessoa (mesmo filtro do resto da Central). */
function centralMinhasAprovacoes() {
  return centralAprovacoesCache.filter(a => centralClienteEhDoLogado(a.cliente));
}

function centralRenderMetricas() {
  const pagina = document.getElementById("centralTabMetricas");
  if (!pagina) return;

  const titulo = document.getElementById("cmTitulo");
  const souCoord = typeof souCoordenadorDoAtendimento === "function" && souCoordenadorDoAtendimento();
  const nomeExibido = (souCoord && centralFiltroPessoa) ? centralFiltroPessoa : (DESIGNER_LOGADO || "");
  if (titulo) titulo.textContent = `Suas métricas${nomeExibido ? ", " + nomeExibido : ""}`;

  const itens = centralMinhasAprovacoes();

  centralRenderFotoMetricas(nomeExibido);
  centralRenderMetricasTopo(itens);
  centralRenderProgSemana(itens);
  centralRenderAnelAprovacaoDireta(itens);
  centralRenderSemanaMetricas(itens);
  centralRenderAprovadasRecentes(itens);
  centralRenderAtividadeRecente(itens);
  centralRenderClientesEspera(itens);
}

function centralRenderFotoMetricas(nome) {
  const img = document.getElementById("cmFotoImg");
  const nomeEl = document.getElementById("cmFotoNome");
  const papel = document.getElementById("cmFotoPapel");
  const valor = document.getElementById("cmFotoValor");
  if (!img) return;

  // Mesma cadeia de foto que o resto do app já usa pro atendimento — ver
  // avatarAtendimentoHTML, js/pessoas-fotos.js.
  const foto = (typeof resolverFotoManual === "function" && resolverFotoManual(nome))
    || (typeof fotoDoAtendimento === "function" && fotoDoAtendimento(nome))
    || (typeof fotoDoDesigner === "function" && fotoDoDesigner(nome));
  if (foto) {
    img.style.backgroundImage = `url("${foto}")`;
    img.classList.remove("sem-foto");
    img.textContent = "";
  } else {
    img.style.backgroundImage = "";
    img.classList.add("sem-foto");
    img.textContent = typeof initials === "function" ? initials(nome) : "";
  }
  if (nomeEl) nomeEl.textContent = nome || "";
  if (papel) {
    const souCoord = typeof souCoordenadorDoAtendimento === "function" && souCoordenadorDoAtendimento();
    papel.textContent = souCoord ? "Coordenador" : "Atendimento";
  }

  const clientes = new Set(centralMinhasAprovacoes().map(a => normalizarParaComparar(a.cliente || "")).filter(Boolean));
  if (valor) valor.textContent = clientes.size ? `${clientes.size} cliente${clientes.size > 1 ? "s" : ""}` : "—";
}

function centralRenderMetricasTopo(itens) {
  const alvo = document.getElementById("cmMetricas");
  if (!alvo) return;

  const seteDiasAtras = Date.now() - 7 * 86400000;
  const resolvidasSemana = itens.filter(a => a.status !== "pendente" && Number(a.respondidoEm) >= seteDiasAtras).length;
  const aguardando = itens.filter(a => (a.status || "pendente") === "pendente").length;

  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const doMes = itens.filter(a => a.status !== "pendente" && Number(a.respondidoEm) >= inicioMes.getTime());
  const aprovadasMes = doMes.filter(a => a.status === "aprovado").length;
  const pctDireto = doMes.length ? Math.round((aprovadasMes / doMes.length) * 100) : null;

  const icRelogio = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const icCheck = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const icAlerta = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16.5v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>`;

  alvo.innerHTML = `
    <div class="hr-metrica"><b>${resolvidasSemana}</b><span>${icRelogio} Resolvidas esta semana</span></div>
    <div class="hr-metrica"><b>${pctDireto === null ? "—" : pctDireto + "%"}</b><span>${icCheck} Aprovadas sem ajuste</span></div>
    <div class="hr-metrica"><b>${aguardando}</b><span>${icAlerta} Aguardando resposta</span></div>
  `;
}

/** Quantas peças foram RESPONDIDAS (aprovado/ajuste) em cada dia desta semana. */
function centralContagemPorDiaDaSemana(itens) {
  const segunda = centralSegundaDaSemana();
  const contagem = [0, 0, 0, 0, 0, 0, 0];
  itens.forEach(a => {
    if ((a.status || "pendente") === "pendente" || !a.respondidoEm) return;
    const dias = Math.floor((Number(a.respondidoEm) - segunda.getTime()) / 86400000);
    if (dias >= 0 && dias < 7) contagem[dias]++;
  });
  return contagem;
}

function centralRenderProgSemana(itens) {
  const graf = document.getElementById("cmProgGraf");
  const total = document.getElementById("cmProgTotal");
  if (!graf) return;

  const contagem = centralContagemPorDiaDaSemana(itens);
  const soma = contagem.reduce((s, n) => s + n, 0);
  if (total) total.textContent = String(soma);

  const teto = Math.max(1, ...contagem);
  const hojeIdx = (centralSegundaDaSemana().getDay() === 0) ? 6 : new Date().getDay() - 1;

  graf.innerHTML = contagem.map((n, i) => {
    const ehHoje = i === hojeIdx;
    const altura = n === 0 ? 2 : Math.max(4, Math.round((n / teto) * 100));
    return `
      <span class="hr-prog-dia" title="${CENTRAL_DIAS_CURTOS[i]}: ${n}">
        <span class="hr-prog-tip">${n}</span>
        <span class="hr-prog-trilho"><span class="hr-prog-barra ${ehHoje ? "hoje" : ""}" style="height:${altura}%"></span></span>
        <span class="hr-prog-rot ${ehHoje ? "hoje" : ""}">${CENTRAL_DIAS_CURTOS[i][0]}</span>
      </span>
    `;
  }).join("");
}

function centralRenderAnelAprovacaoDireta(itens) {
  const pctEl = document.getElementById("cmAnelPct");
  const arco = document.getElementById("cmAnelArco");
  if (!pctEl || !arco) return;

  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const doMes = itens.filter(a => a.status !== "pendente" && Number(a.respondidoEm) >= inicioMes.getTime());
  const aprovadas = doMes.filter(a => a.status === "aprovado").length;
  const pct = doMes.length ? aprovadas / doMes.length : null;

  pctEl.textContent = pct === null ? "—" : Math.round(pct * 100) + "%";
  const volta = 351.9;
  arco.setAttribute("stroke-dashoffset", String(volta - volta * (pct || 0)));
}

function centralRenderSemanaMetricas(itens) {
  const rots = document.getElementById("cmSemanaRots");
  const barra = document.getElementById("cmSemanaBarra");
  const pctEl = document.getElementById("cmSemanaPct");
  if (!rots || !barra) return;

  const hojeIdx = (centralSegundaDaSemana().getDay() === 0) ? 6 : new Date().getDay() - 1;
  rots.innerHTML = CENTRAL_DIAS_CURTOS.map((nome, i) => `<span class="${i === hojeIdx ? "hoje" : ""}">${nome}</span>`).join("");

  const contagem = centralContagemPorDiaDaSemana(itens);
  barra.innerHTML = contagem.map((n, i) => {
    const classe = i === hojeIdx ? "hoje" : (n > 0 ? "cheia" : "");
    return `<span class="hr-semana-seg ${classe}">${n || "·"}</span>`;
  }).join("");

  const seteDiasAtras = Date.now() - 7 * 86400000;
  const daSemana = itens.filter(a => a.status !== "pendente" && Number(a.respondidoEm) >= seteDiasAtras);
  const aprovadasSemana = daSemana.filter(a => a.status === "aprovado").length;
  if (pctEl) pctEl.textContent = daSemana.length ? Math.round((aprovadasSemana / daSemana.length) * 100) + "%" : "—";
}

function centralRenderAprovadasRecentes(itens) {
  const alvo = document.getElementById("cmAprovadasRecentes");
  if (!alvo) return;

  const recentes = itens.filter(a => a.status === "aprovado" && a.respondidoEm)
    .sort((a, b) => Number(b.respondidoEm) - Number(a.respondidoEm))
    .slice(0, 8);

  if (!recentes.length) {
    alvo.innerHTML = `<p class="hr-esc-vazio">Nenhuma aprovação ainda.</p>`;
    return;
  }
  alvo.innerHTML = recentes.map(a => centralMetricaItemHTML(a, true)).join("");
}

function centralRenderAtividadeRecente(itens) {
  const alvo = document.getElementById("cmAtividadeRecente");
  if (!alvo) return;

  // De propósito só "voltou com ajuste" aqui — a lista escura ao lado já
  // mostra as aprovadas; misturar as duas de novo seria repetir a mesma
  // informação duas vezes na mesma tela.
  const recentes = itens.filter(a => a.status === "ajuste" && a.respondidoEm)
    .sort((a, b) => Number(b.respondidoEm) - Number(a.respondidoEm))
    .slice(0, 8);

  if (!recentes.length) {
    alvo.innerHTML = `<p class="hr-vazio">Nenhum ajuste pedido recentemente.</p>`;
    return;
  }
  alvo.innerHTML = recentes.map(a => centralMetricaItemHTML(a, false)).join("");
}

const CENTRAL_ICONE_AJUSTE = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CENTRAL_ICONE_APROVADO = `<svg viewBox="0 0 24 24" fill="none"><path d="M4.5 12.5l5 5 10-11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function centralMetricaItemHTML(a, escuro) {
  const quando = a.respondidoEm
    ? new Date(Number(a.respondidoEm)).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      + " · " + new Date(Number(a.respondidoEm)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const nomeCls = escuro ? "hr-esc-nome" : "hr-ativ-nome";
  const subCls = escuro ? "hr-esc-sub" : "hr-ativ-sub";
  const icCls = escuro ? "hr-esc-ic" : "hr-ativ-ic";
  const itemCls = escuro ? "hr-esc-item" : "hr-ativ-item";
  return `
    <div class="${itemCls}">
      <span class="${icCls}">${a.status === "aprovado" ? CENTRAL_ICONE_APROVADO : CENTRAL_ICONE_AJUSTE}</span>
      <span class="${escuro ? "hr-esc-txt" : "hr-ativ-txt"}">
        <span class="${nomeCls}">${escaparHTML(a.tituloTarefa || a.nomeArquivo || "")}</span>
        <span class="${subCls}">${escaparHTML(a.cliente || "")}${quando ? " · " + quando : ""}</span>
      </span>
    </div>
  `;
}

function centralRenderClientesEspera(itens) {
  const alvo = document.getElementById("cmClientesEspera");
  if (!alvo) return;

  const porCliente = {};
  itens.filter(a => (a.status || "pendente") === "pendente").forEach(a => {
    const nome = a.cliente || "Sem cliente";
    const dias = Math.floor((Date.now() - (Number(a.criadoEm) || 0)) / 86400000);
    if (!porCliente[nome] || dias > porCliente[nome]) porCliente[nome] = dias;
  });

  const nomes = Object.keys(porCliente).sort((a, b) => porCliente[b] - porCliente[a]).slice(0, 5);
  if (!nomes.length) {
    alvo.innerHTML = `<p class="hr-vazio">Ninguém esperando resposta agora. 🎉</p>`;
    return;
  }
  alvo.innerHTML = nomes.map(nome => `
    <div class="hr-ativ-item">
      <span class="hr-ativ-txt">
        <span class="hr-ativ-nome">${escaparHTML(nome)}</span>
        <span class="hr-ativ-sub">esperando há ${porCliente[nome]} dia${porCliente[nome] === 1 ? "" : "s"}</span>
      </span>
    </div>
  `).join("");
}
