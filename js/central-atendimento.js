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
  ["hoje", "clientes", "aprovacoes", "metricas"].forEach(nome => {
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

// Pra saber se "Voltou com ajuste" SUBIU desde a última vez que esta aba foi
// desenhada nesta mesma sessão (dispara o selo "novo") — comparação em
// memória, não em localStorage: é "chegou agora enquanto eu tava de olho
// (ou desde a última vez que abri a Central)", não um "lido/não lido"
// persistente por dispositivo.
let centralHojeUltimaContagemAjuste = null;

/**
 * ABA HOJE (2026-08-07) — mosaico no mesmo espírito de "Minhas métricas"
 * (protótipo aprovado pelo Cláudio, artifact "Central do Atendimento — 3
 * protótipos de tela inicial"): foto + cartões, cada cartão também
 * funcionando como atalho pra abrir aquele assunto, e um card preto de
 * ALTURA TOTAL — a Timeline — com os eventos mais recentes (ver
 * centralConstruirTimeline). Substitui o layout anterior (kanban +
 * cartões de número na lateral, pedido em 2026-08-06).
 *
 * 2026-08-08 — os quatro cartões de número viraram "blocos cheios" (amarelo,
 * preto e dois brancos com gráfico dentro) e ganharam uma FAIXA DE NÚMEROS
 * acima deles, entre a barra preta e o mosaico. Os dois protótipos foram
 * aprovados pelo Cláudio (artifacts "3 jeitos de mostrar os números" e "3
 * jeitos pros números do topo", este último na referência de dashboard que
 * ele mandou). A Timeline NÃO foi tocada nessa mudança — ver o pedido dele:
 * "ela já foi ajustada, tamanho e tudo, não alterar nada nela".
 */
function centralRenderHoje() {
  const el = document.getElementById("centralTabHoje");
  if (!el) return;

  const esperandoVoce = centralFilaPor("pendente");
  const prontasEnviar = centralFilaPor("aprovada");
  const comCliente = centralAprovacoesPor("pendente");
  const voltouAjuste = centralAprovacoesPor("ajuste");

  const souCoord = typeof souCoordenadorDoAtendimento === "function" && souCoordenadorDoAtendimento();
  const nomeExibido = (souCoord && centralFiltroPessoa) ? centralFiltroPessoa : (DESIGNER_LOGADO || "");

  const { nomes: nomesRadar, porCliente: radarPorCliente } = centralAgruparClientesPorAlerta();
  const limiteAlerta = typeof APROVACAO_DIAS_ALERTA === "number" ? APROVACAO_DIAS_ALERTA : 3;

  const ajusteSubiu = centralHojeUltimaContagemAjuste !== null && voltouAjuste.length > centralHojeUltimaContagemAjuste;
  centralHojeUltimaContagemAjuste = voltouAjuste.length;

  el.innerHTML = `
    ${centralHojeFaixaDeNumerosHTML(nomeExibido, esperandoVoce, prontasEnviar, comCliente, voltouAjuste, limiteAlerta)}

    <div class="central-hoje-grid">
      <div class="hr-card central-hoje-tile central-hoje-foto">
        <div class="central-hoje-foto-img" id="chFotoImg"></div>
        <div class="central-hoje-foto-scrim"></div>
        <div class="central-hoje-foto-info"><b id="chFotoNome"></b><span id="chFotoPapel"></span></div>
      </div>

      ${centralHojeCartaoEsperando(esperandoVoce)}
      ${centralHojeCartaoProntas(prontasEnviar)}
      ${centralHojeCartaoComCliente(comCliente, limiteAlerta)}
      ${centralHojeCartaoAjuste(voltouAjuste, ajusteSubiu)}

      <div class="hr-card central-hoje-tile central-hoje-timeline">
        <div class="central-hoje-timeline-head"><span class="central-hoje-timeline-livedot"></span>Timeline</div>
        <div class="central-hoje-timeline-list" id="chTimelineList"></div>
      </div>

      <button type="button" class="hr-card central-hoje-tile clicavel central-hoje-wide" id="chRadarBtn">
        <div class="central-hoje-wide-head"><span class="central-section-dot ambar"></span>Radar de clientes</div>
        <div class="central-hoje-wide-rows">
          ${nomesRadar.length ? nomesRadar.slice(0, 2).map(nome => {
            const c = radarPorCliente[nome];
            const alerta = c.maxDias >= limiteAlerta;
            return `
              <div class="central-hoje-wide-row">
                <span>${escaparHTML(nome)}</span>
                ${alerta
                  ? `<span class="central-hoje-flag">parado há ${c.maxDias} dia${c.maxDias === 1 ? "" : "s"}</span>`
                  : `<span class="central-hoje-muted">${c.esperando} esperando</span>`}
              </div>
            `;
          }).join("") : `<div class="central-hoje-wide-vazio">Nada esperando cliente agora. 🎉</div>`}
        </div>
      </button>
    </div>
  `;

  centralPreencherFotoAtendimento("ch", nomeExibido, false);
  centralRenderTimelineHoje();

  // Os quatro cartões abrem o POP-UP DOS GRUPOS (2026-08-08), não mais a
  // aba Aprovações: ali a pessoa saía da tela onde estava pra ver uma
  // lista, e voltava clicando de novo. O pop-up abre por cima e a pílula
  // preta dele troca entre os quatro grupos sem fechar nada.
  // `centralAbrirAprovacoesEm` continua existindo — é pra onde o "ver
  // todas" do pop-up leva, e é o caminho de quem quer a tela inteira.
  el.querySelectorAll("[data-central-stat-ir]").forEach(btn => {
    btn.addEventListener("click", () => centralAbrirGrupo(btn.dataset.centralStatIr));
  });
  document.getElementById("chRadarBtn")?.addEventListener("click", () => centralTrocarAba("clientes"));

  // Os números do topo levam pra ABA que responde aquele número (não pra
  // uma coluna, como os cartões de baixo): "no fluxo" é a lista inteira de
  // Aprovações, "aprovadas na semana" é a tela de Métricas e "peça mais
  // parada" é o Radar de clientes, que já vem ordenado por quem está
  // esperando há mais tempo. A setinha redonda só existe onde há pra onde ir.
  el.querySelectorAll("[data-central-topo-ir]").forEach(btn => {
    btn.addEventListener("click", () => centralTrocarAba(btn.dataset.centralTopoIr));
  });
}

/**
 * A FAIXA DE NÚMEROS do topo (2026-08-08) — protótipo "sem cartão nenhum",
 * aprovado pelo Cláudio a partir da referência de dashboard que ele mandou:
 * número grande, legenda miudinha embaixo e a setinha redonda, soltos no
 * fundo, sem moldura nem sombra.
 *
 * Os três números são de OUTRAS contas, de propósito — repetir aqui os
 * mesmos quatro números dos cartões logo abaixo seria dizer duas vezes a
 * mesma coisa. Tudo sai do que já está em cache: nenhuma busca nova.
 */
function centralHojeFaixaDeNumerosHTML(nomeExibido, esperando, prontas, comCliente, ajuste, limiteAlerta) {
  const noFluxo = esperando.length + prontas.length + comCliente.length + ajuste.length;

  const seteDiasAtras = Date.now() - 7 * 86400000;
  const aprovadasSemana = centralAprovacoesPor("aprovado")
    .filter(a => Number(a.respondidoEm) >= seteDiasAtras).length;

  // "Peça mais parada" = a que está esperando resposta do cliente há mais
  // tempo (mesma conta do Radar de clientes, que é pra onde ela leva).
  const diasParada = Math.max(0, ...comCliente.map(a => centralDiasDesde(Number(a.criadoEm))));
  const alerta = diasParada >= limiteAlerta;

  const primeiroNome = String(nomeExibido || "").trim().split(/\s+/)[0] || "";
  const hora = new Date().getHours();
  // Sem nome (sessão antiga, coordenador sem "ver como"), a vírgula ficaria
  // pendurada no nada — nesse caso a saudação vira o título sozinha.
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  const seta = `<span class="central-hoje-seta"><svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  const numero = (valor, rotulo, destino, classe = "") => `
    <button type="button" class="central-hoje-n ${classe}" data-central-topo-ir="${destino}">
      <span class="central-hoje-n-linha"><b>${valor}</b>${seta}</span>
      <em>${rotulo}</em>
    </button>`;

  return `
    <div class="central-hoje-topo">
      <div class="central-hoje-saud">
        ${primeiroNome
          ? `<span>${saudacao},</span><b>${escaparHTML(primeiroNome)}</b>`
          : `<b>${saudacao}</b>`}
      </div>
      <div class="central-hoje-nums">
        ${numero(noFluxo, "peças no fluxo", "aprovacoes")}
        ${numero(aprovadasSemana, "aprovadas na semana", "metricas")}
        ${numero(diasParada, `dia${diasParada === 1 ? "" : "s"} na peça mais parada`, "clientes", alerta ? "alerta" : "")}
      </div>
    </div>`;
}

/** Quantos dias inteiros já se passaram desde `quandoMs` (0 = hoje). */
function centralDiasDesde(quandoMs) {
  if (!quandoMs) return 0;
  return Math.max(0, Math.floor((Date.now() - quandoMs) / 86400000));
}

/** "40min" / "6h" / "3d" — o tempo curtinho que cabe no rodapé de um cartão. */
function centralIdadeCurta(ms) {
  const horas = ms / 3600000;
  if (horas < 1) return Math.max(1, Math.round(ms / 60000)) + "min";
  if (horas < 24) return Math.round(horas) + "h";
  return Math.round(horas / 24) + "d";
}

/**
 * Uma barrinha por peça esperando, altura = há quanto tempo ela espera
 * (as mais antigas primeiro, no máximo 8).
 *
 * NÃO é um gráfico de "chegadas por dia": `listarConferenciasPendentes`
 * (AprovacaoInterna.gs) só devolve o que ainda está em aberto — o que já
 * foi conferido não vem, então uma série histórica aqui seria inventada.
 * Isto mostra o que existe de verdade: o tamanho e a IDADE da fila de agora.
 * Barra escura = passou de um dia esperando.
 */
function centralHojeBarrasDeEspera(itens) {
  if (!itens.length) return "";

  const agora = Date.now();
  const idades = itens
    .map(it => ({ ms: agora - (Date.parse(it.pedidoEm) || agora), cliente: it.cliente || "" }))
    .filter(x => x.ms >= 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8);
  if (!idades.length) return "";

  // Teto de 24h no mínimo: com a fila toda nova, uma peça de 20 minutos
  // encostaria no topo da barra e pareceria urgente sem ser.
  const teto = Math.max(86400000, ...idades.map(x => x.ms));
  // Raiz quadrada em vez de proporção direta: com uma peça de 3 dias ao lado
  // de outra de 2 horas, a proporção crua deixaria a segunda como um risco
  // de 3% — invisível, como se ela não estivesse ali. A raiz aproxima as
  // pequenas do meio da altura sem nunca inverter a ordem (a mais velha
  // continua sendo sempre a mais alta).
  return `
    <div class="central-hoje-barras" aria-hidden="true">
      ${idades.map(x => `
        <i class="${x.ms >= 86400000 ? "velha" : ""}" style="height:${Math.max(16, Math.round(Math.sqrt(x.ms / teto) * 100))}%"
           title="${escaparHTML(x.cliente)} · esperando há ${centralIdadeCurta(x.ms)}"></i>
      `).join("")}
    </div>`;
}

/** Cartão amarelo cheio: o que está esperando a conferência do atendimento. */
function centralHojeCartaoEsperando(itens) {
  const agora = Date.now();
  const inicioDeHoje = new Date(); inicioDeHoje.setHours(0, 0, 0, 0);
  const chegaramHoje = itens.filter(it => (Date.parse(it.pedidoEm) || 0) >= inicioDeHoje.getTime()).length;
  const maisVelha = itens.length ? Math.max(...itens.map(it => agora - (Date.parse(it.pedidoEm) || agora))) : 0;

  const pe = !itens.length ? "fila vazia 🎉"
    : chegaramHoje ? `${chegaramHoje} ${chegaramHoje === 1 ? "chegou" : "chegaram"} hoje`
    : `a mais velha: ${centralIdadeCurta(maisVelha)}`;

  return `
    <button type="button" class="hr-card central-hoje-tile clicavel central-hoje-stat cheio-amarelo" data-central-stat-ir="esperando">
      <span class="central-hoje-rot">Esperando você</span>
      <b>${itens.length}</b>
      ${centralHojeBarrasDeEspera(itens)}
      <span class="central-hoje-pe">${pe}</span>
    </button>`;
}

/** Cartão preto cheio: já conferido, falta só mandar pro cliente. */
function centralHojeCartaoProntas(itens) {
  const agora = Date.now();
  const maisVelha = itens.length ? Math.max(...itens.map(it => agora - (Date.parse(it.pedidoEm) || agora))) : 0;
  const pe = !itens.length ? "nada esperando envio" : `a mais velha: ${centralIdadeCurta(maisVelha)}`;

  return `
    <button type="button" class="hr-card central-hoje-tile clicavel central-hoje-stat cheio-preto" data-central-stat-ir="prontas">
      <span class="central-hoje-rot">Prontas pra enviar</span>
      <b>${itens.length}</b>
      ${centralHojeBarrasDeEspera(itens)}
      <span class="central-hoje-pe">${pe}</span>
    </button>`;
}

/**
 * Cartão branco: o que está com o cliente. A barrinha divide as peças pela
 * IDADE (até o limite de alerta × passou dele) — é o que separa "mandei
 * ontem" de "esse cliente sumiu", que o número sozinho não conta.
 */
function centralHojeCartaoComCliente(itens, limiteAlerta) {
  const velhas = itens.filter(a => centralDiasDesde(Number(a.criadoEm)) >= limiteAlerta).length;
  const novas = itens.length - velhas;
  const pctNovas = itens.length ? (novas / itens.length) * 100 : 0;

  const barra = itens.length
    ? `<div class="central-hoje-idade" role="img" aria-label="${novas} com até ${limiteAlerta - 1} dias, ${velhas} com ${limiteAlerta} dias ou mais">
         ${novas ? `<span style="width:${pctNovas}%;background:var(--kanban-yellow)"></span>` : ""}
         ${velhas ? `<span style="width:${100 - pctNovas}%;background:var(--warning)"></span>` : ""}
       </div>
       <div class="central-hoje-idade-leg">
         <span>${novas} · até ${limiteAlerta - 1} dia${limiteAlerta - 1 === 1 ? "" : "s"}</span>
         <span>${velhas} · ${limiteAlerta} dias ou +</span>
       </div>`
    : `<span class="central-hoje-pe">ninguém esperando resposta</span>`;

  return `
    <button type="button" class="hr-card central-hoje-tile clicavel central-hoje-stat" data-central-stat-ir="comCliente">
      <span class="central-hoje-rot">Com o cliente</span>
      <b>${itens.length}</b>
      ${barra}
    </button>`;
}

/** Cartão branco: o que o cliente devolveu pedindo mudança. Zero vira um selo. */
function centralHojeCartaoAjuste(itens, ajusteSubiu) {
  const maisVelho = itens.length
    ? Math.max(...itens.map(a => centralDiasDesde(Number(a.respondidoEm))))
    : 0;
  const pe = !itens.length
    ? "nada pendente"
    : (maisVelho === 0 ? "voltou hoje" : `o mais antigo: há ${maisVelho} dia${maisVelho === 1 ? "" : "s"}`);

  const check = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return `
    <button type="button" class="hr-card central-hoje-tile clicavel central-hoje-stat ${itens.length ? "ambar" : ""}" data-central-stat-ir="ajuste">
      ${ajusteSubiu ? `<span class="central-hoje-badge">novo</span>` : ""}
      <span class="central-hoje-rot">Voltou com ajuste</span>
      ${itens.length
        ? `<b>${itens.length}</b>`
        : `<span class="central-hoje-zero"><span class="central-hoje-ok">${check}</span><b>0</b></span>`}
      <span class="central-hoje-pe">${pe}</span>
    </button>`;
}

/**
 * Junta os eventos mais recentes de DUAS fontes que a Central já busca —
 * peça nova pedindo conferência (fila, `pedidoEm`) e cliente respondendo
 * (aprovações, `respondidoEm`, ajuste ou aprovado) — ordenados por hora,
 * mais recente primeiro. NENHUMA busca nova ao backend: é só reler o que
 * já está em cache.
 *
 * De propósito NÃO tem "comentário" aqui: isso viveria num registro de
 * eventos do atendimento que ainda não existe (o FeedEventos de hoje é só
 * pra designer — comentário/prioridade/tarefa recebida, ver Planilha.gs).
 * Dá pra somar depois; por enquanto a Timeline é honesta sobre o que
 * consegue mostrar com o que já é buscado.
 */
function centralConstruirTimeline() {
  const eventos = [];

  centralFilaPor("pendente").forEach(item => {
    const quando = Date.parse(item.pedidoEm) || 0;
    if (!quando) return;
    const pecas = item.pecas || [];
    const primeira = pecas[0] || {};
    const rotulo = pecas.length > 1 ? `${pecas.length} peças` : (primeira.nomePeca || item.tituloTarefa || "uma peça");
    eventos.push({
      tipo: "novo",
      quando,
      quem: item.designer || "Alguém",
      inicial: typeof initials === "function" ? initials(item.designer || "?") : "?",
      texto: `Mandou <b>${escaparHTML(rotulo)}</b> pra conferência`,
      cliente: item.cliente || "",
      // Vídeo não ganha miniatura (mesma regra do resto do app — ver
      // ehImagemPreviewable, js/notificacoes-uploads.js).
      fileId: (primeira.fileId && String(primeira.mimeType || "").indexOf("video/") !== 0) ? primeira.fileId : null,
      loteId: item.loteId || null,
      taskId: item.taskId || null,
    });
  });

  centralMinhasAprovacoes().forEach(a => {
    const status = a.status || "pendente";
    if (status !== "ajuste" && status !== "aprovado") return;
    const quando = Number(a.respondidoEm) || 0;
    if (!quando) return;
    const peca = a.tituloTarefa || a.nomeArquivo || "uma peça";
    eventos.push({
      tipo: status,
      quando,
      quem: a.cliente || "Cliente",
      inicial: typeof initials === "function" ? initials(a.cliente || "?") : "?",
      texto: status === "ajuste"
        ? `Pediu ajuste em <b>${escaparHTML(peca)}</b>`
        : `Aprovou <b>${escaparHTML(peca)}</b>`,
      cliente: a.cliente || "",
      // FOTO SÓ NO "MANDOU PRA CONFERÊNCIA" (pedido do Cláudio,
      // 2026-08-08). Ajuste e aprovação são notícia sobre uma peça que já
      // passou por aqui — a arte já foi vista. Quem manda algo NOVO é o
      // único caso em que a imagem é a informação, não enfeite; e sem foto
      // esses eventos encolhem sozinhos, o que dá espaço pros que têm.
      fileId: null,
      // O que o cliente escreveu, na íntegra — é a instrução, e ficava
      // invisível aqui (só aparecia depois de abrir a conferência).
      citacao: status === "ajuste" ? (a.respostaTexto || "") : "",
      // Só o "pediu ajuste" é clicável — abre a conferência já no modo do
      // pedido do cliente (ver o wiring em centralRenderTimelineHoje). O
      // "aprovou" é só informativo, não tem nada a fazer com ele aqui.
      codigo: status === "ajuste" ? a.codigo : null,
    });
  });

  return eventos.sort((a, b) => b.quando - a.quando).slice(0, 20);
}

/** O rótulo curto da pastilha de status, no canto do cabeçalho do post. */
const CENTRAL_TL_SELO = { novo: "conferir", ajuste: "ajuste", aprovado: "aprovada" };

function centralRenderTimelineHoje() {
  const lista = document.getElementById("chTimelineList");
  if (!lista) return;

  const eventos = centralConstruirTimeline();
  if (!eventos.length) {
    lista.innerHTML = `<div class="central-hoje-timeline-vazio">Nada novo por aqui ainda.</div>`;
    return;
  }

  // O FEED (2026-08-08, protótipo "Feed cheio" aprovado pelo Cláudio).
  // Cada evento é um post: avatar grande, quem em destaque, a hora
  // embaixo do nome, a pastilha de status à direita, a frase, e — só
  // quando tem arte nova — a peça em tamanho cheio com o nome do cliente
  // e o "Conferir" por cima dela.
  lista.innerHTML = eventos.map(ev => `
    <div class="central-tl-post ${ev.codigo ? "clicavel" : ""}" ${ev.codigo ? `data-central-tl-abrir="${escaparHTML(ev.codigo)}"` : ""}>
      <div class="central-tl-cab">
        <span class="central-tl-avatar ${ev.tipo}">${escaparHTML(ev.inicial)}</span>
        <span class="central-tl-quem">
          <b>${escaparHTML(ev.quem || "")}</b>
          <span class="central-tl-time">${centralTempoRelativo(ev.quando)}</span>
        </span>
        <span class="central-tl-selo ${ev.tipo}">${CENTRAL_TL_SELO[ev.tipo] || ""}</span>
      </div>
      <span class="central-tl-txt">${ev.texto}</span>
      ${ev.fileId ? `
        <div class="central-tl-arte" data-central-tl-thumb="${escaparHTML(ev.fileId)}"
             ${ev.loteId ? `data-central-tl-conferir="${escaparHTML(ev.taskId || "")}|${escaparHTML(ev.loteId)}"` : ""}>
          ${ev.cliente ? `<span class="central-tl-arte-cli">${escaparHTML(ev.cliente)}</span>` : ""}
          ${ev.loteId ? `<span class="central-tl-arte-cta">CONFERIR</span>` : ""}
        </div>` : ""}
      ${ev.citacao ? `
        <div class="central-tl-cita">
          <span class="central-tl-cita-rot">o que o cliente escreveu</span>
          ${escaparHTML(ev.citacao)}
        </div>` : ""}
    </div>
  `).join("");

  // O "Conferir" em cima da arte abre a conferência daquela peça direto —
  // é o mesmo destino do card na aba Aprovações, um clique mais curto.
  // `stopPropagation` porque o post inteiro pode ser clicável (ajuste), e
  // aí os dois disparariam.
  lista.querySelectorAll("[data-central-tl-conferir]").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      const [taskId, loteId] = String(el.dataset.centralTlConferir).split("|");
      if (taskId && loteId && typeof apvAbrirConferencia === "function") apvAbrirConferencia(taskId, loteId);
    });
  });

  // Miniaturas entram depois, uma a uma — cada uma é uma ida ao Drive, e
  // segurar a Timeline inteira esperando por elas atrasaria a única coisa
  // que importa mais rápido (mesmo padrão de apvCarregarMiniatura,
  // js/pagina-aprovacao.js).
  lista.querySelectorAll("[data-central-tl-thumb]").forEach(el => {
    const fileId = el.dataset.centralTlThumb;
    if (fileId) centralCarregarMiniaturaTimeline(fileId, el);
  });

  // "Pediu ajuste" abre a MESMA tela de conferência, já no modo do pedido
  // do cliente (pílula amarela, texto dele, pontos marcados) — ver
  // apvAbrirParaAlteracaoDoCliente, js/pagina-aprovacao.js. Pedido do
  // Cláudio (2026-08-07): "poder clicar e ver ali mesmo".
  lista.querySelectorAll("[data-central-tl-abrir]").forEach(el => {
    el.addEventListener("click", () => {
      const codigo = el.dataset.centralTlAbrir;
      const a = centralAprovacoesCache.find(x => x.codigo === codigo);
      if (a && typeof apvAbrirParaAlteracaoDoCliente === "function") apvAbrirParaAlteracaoDoCliente(a);
    });
  });
}

async function centralCarregarMiniaturaTimeline(fileId, el) {
  const data = await chamarBackend({ acao: "buscarThumbnailDrive", fileId });
  if (!el.isConnected) return; // saiu da tela (redesenhou) enquanto a miniatura vinha
  if (!data || !data.ok || !data.base64) {
    // Sem imagem, o bloco só continua existindo se ele carregar o
    // "Conferir" — perder o botão porque uma miniatura falhou seria
    // trocar um problema de aparência por um de função. Sem botão, ele
    // não tem mais nada dentro e sai.
    if (!el.querySelector(".central-tl-arte-cta")) el.remove();
    else el.classList.add("sem-imagem");
    return;
  }
  el.style.backgroundImage = `url("data:${data.mimeType || "image/jpeg"};base64,${data.base64}")`;
}

/** "agora", "4 min atrás", "2 h atrás", "3 dias atrás" — pro texto da Timeline. */
function centralTempoRelativo(quandoMs) {
  const min = Math.max(0, Math.round((Date.now() - quandoMs) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h atrás`;
  const d = Math.round(h / 24);
  return `${d} dia${d === 1 ? "" : "s"} atrás`;
}

/**
 * Abre a aba Aprovações já com a coluna pedida em destaque. O realce
 * (.destacada) some sozinho depois de um instante — é só pra guiar o olho
 * até o lugar certo, não um estado que a pessoa precise desfazer.
 */
function centralAbrirAprovacoesEm(chaveColuna) {
  // Vindo de um cartão de número, a pessoa quer ver a LISTA daquilo — os
  // filtros (o de atraso e o de cliente) esconderiam parte dela, e o
  // número do cartão deixaria de bater com o que aparece na coluna.
  centralFiltroAprovacoes = "tudo";
  centralFiltroCliente = "";
  centralTrocarAba("aprovacoes");
  centralRenderAprovacoes();

  const col = document.querySelector(`#centralTabAprovacoes [data-central-col="${chaveColuna}"]`);
  if (!col) return;
  col.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  col.classList.add("destacada");
  setTimeout(() => col.classList.remove("destacada"), 1600);
}

/**
 * Cartão de número grande — as MESMAS classes do card "Resolvidas na
 * semana" de Minhas Métricas (.hr-card > .hr-card-cab > .hr-card-titulo,
 * depois .hr-prog-num com o número grande), não um estilo parecido: é o
 * mesmo cabeçalho, a mesma tipografia do número, o mesmo espaçamento.
 */
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

/**
 * Peças da fila de conferência interna (ainda não mandadas pro cliente) —
 * desenhadas como CARD DE VERDADE do Colmeia (.task-card, css/02-quadro.css,
 * o mesmo do quadro), não uma linha simples. Pedido do Cláudio (2026-08-06).
 */
function centralPreencherSecaoFila(idCorpo, itens, status) {
  const corpo = document.getElementById(idCorpo);
  if (!corpo) return;
  if (!itens.length) {
    corpo.innerHTML = `<div class="central-section-empty">${status === "pendente" ? "Nada esperando conferência agora." : "Nada pronto pra enviar agora."}</div>`;
    return;
  }

  corpo.innerHTML = itens.map((item, i) => {
    const pecas = item.pecas || [];
    const rotulo = pecas.length > 1 ? `${pecas.length} peças` : (pecas[0] ? pecas[0].nomePeca : "");
    const entrega = item.prazo ? new Date(item.prazo) : null;
    const atrasada = entrega && entrega < new Date(new Date().toDateString());
    // O tipo da peça (foto/vídeo) sai de graça do mimeType já carregado —
    // mesmos badges coloridos que o card de tarefa normal já usa
    // (.badge-video/.badge-estatico), só emprestados pra dizer o formato
    // da peça em vez do tipo de tarefa.
    const mime = (pecas[0] && pecas[0].mimeType) || "";
    const ehVideo = mime.indexOf("video/") === 0;

    return `
      <button type="button" class="task-card central-kanban-card" data-central-fila="${i}">
        <div class="card-top">
          <span class="badge ${ehVideo ? "badge-video" : "badge-estatico"}">${ehVideo ? "Vídeo" : "Imagem"}</span>
          ${pecas.length > 1 ? `<span class="card-priority-tag">${pecas.length} peças</span>` : ""}
        </div>
        <div class="card-title">${escaparHTML(rotulo)}</div>
        <div class="card-client">${escaparHTML(item.cliente || "Sem cliente")}</div>
        <div class="card-bottom">
          <div class="assignee-wrap">${typeof avatarHTML === "function" ? avatarHTML(item.designer, "avatar-sm") : ""}</div>
          ${status === "aprovada"
            ? `<span class="card-due-simple">✓ ${item.aprovadoPor ? escaparHTML(item.aprovadoPor) : "aprovada"}</span>`
            : `<span class="card-due-simple ${atrasada ? "overdue" : ""}">${entrega ? "entrega " + apvDataCurta(item.prazo) : apvTempoDeEspera(item.pedidoEm)}</span>`}
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

/**
 * Agrupa as aprovações em aberto por cliente (esperando/ajustes/maxDias),
 * ordenado por quem está parado há mais tempo primeiro. Reaproveitado pela
 * aba Radar de clientes inteira E pelo cartão "Radar de clientes" resumido
 * da aba Hoje (que só mostra os 2 primeiros).
 */
function centralAgruparClientesPorAlerta() {
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
  return { porCliente, nomes };
}

function centralRenderClientes() {
  const el = document.getElementById("centralTabClientes");
  if (!el) return;

  const { porCliente, nomes } = centralAgruparClientesPorAlerta();
  if (!nomes.length) {
    el.innerHTML = `<div class="central-vazio-inline">Nenhum cliente com aprovação em aberto agora.</div>`;
    return;
  }

  const limite = typeof APROVACAO_DIAS_ALERTA === "number" ? APROVACAO_DIAS_ALERTA : 3;
  // Clicável (2026-08-06): era a única aba da Central onde dava pra olhar
  // mas não agir — cada card mostrava números e acabava ali. Agora leva pra
  // Aprovações já filtrada naquele cliente.
  el.innerHTML = `<div class="central-clients-grid">${nomes.map(nome => {
    const c = porCliente[nome];
    const alerta = c.maxDias >= limite;
    return `
      <button type="button" class="central-client-card" data-central-cliente="${escaparHTML(nome)}">
        <div class="central-client-top">
          <span class="central-client-dot ${alerta ? "ambar" : "ok"}"></span>
          <span class="central-client-name">${escaparHTML(nome)}</span>
        </div>
        <div class="central-client-stats">
          <div class="central-client-stat"><b>${c.esperando}</b><span>esperando</span></div>
          <div class="central-client-stat"><b>${c.ajustes}</b><span>ajustes</span></div>
        </div>
        ${alerta ? `<span class="central-client-flag">Parado há ${c.maxDias} dia${c.maxDias === 1 ? "" : "s"}</span>` : ""}
      </button>
    `;
  }).join("")}</div>`;

  el.querySelectorAll("[data-central-cliente]").forEach(btn => {
    btn.addEventListener("click", () => {
      centralFiltroCliente = btn.dataset.centralCliente;
      centralFiltroAprovacoes = "tudo";
      centralTrocarAba("aprovacoes");
      centralRenderAprovacoes();
    });
  });
}

// ---------------------------------------------------------------------------
// ABA: APROVAÇÕES — mesma fila e mesmas aprovações do "Hoje", só que em
// colunas por estado em vez de feed — pra quem prefere visão de quadro.
// ---------------------------------------------------------------------------

// O filtro que substituiu a aba "Cobranças" (2026-08-06). "tudo" mostra as
// 4 colunas; "atrasadas" mostra só o que precisa ser cobrado hoje — cliente
// sem responder há 3+ dias e ajuste que voltou e ninguém repassou, que era
// exatamente o recorte daquela aba.
let centralFiltroAprovacoes = "tudo";

// "" = todos os clientes. Vem de clicar num card do Radar de clientes, e
// aparece como uma pílula com × pra tirar — nunca é um estado escondido.
let centralFiltroCliente = "";

function centralRenderAprovacoes() {
  const el = document.getElementById("centralTabAprovacoes");
  if (!el) return;

  const limite = typeof APROVACAO_DIAS_ALERTA === "number" ? APROVACAO_DIAS_ALERTA : 3;
  const soAtrasadas = centralFiltroAprovacoes === "atrasadas";
  const paradaHaMuito = a => Math.floor((Date.now() - (Number(a.criadoEm) || 0)) / 86400000) >= limite;
  const doCliente = x => !centralFiltroCliente
    || normalizarParaComparar(x.cliente || "") === normalizarParaComparar(centralFiltroCliente);

  // No modo "atrasadas" as duas primeiras colunas somem: uma peça esperando
  // conferência é trabalho SEU, não cobrança de ninguém.
  const esperandoVoce = soAtrasadas ? [] : centralFilaPor("pendente").filter(doCliente);
  const prontasEnviar = soAtrasadas ? [] : centralFilaPor("aprovada").filter(doCliente);
  const comCliente = (soAtrasadas ? centralAprovacoesPor("pendente").filter(paradaHaMuito) : centralAprovacoesPor("pendente")).filter(doCliente);
  const voltouAjuste = centralAprovacoesPor("ajuste").filter(doCliente);

  const quantasAtrasadas = centralAprovacoesPor("pendente").filter(paradaHaMuito).length + voltouAjuste.length;

  const coluna = (titulo, itens, id, chave) => `
    <div class="central-approvals-col" data-central-col="${chave}">
      <div class="central-approvals-col-head"><span class="central-approvals-col-title">${titulo}</span><span class="central-approvals-col-count">${itens.length}</span></div>
      <div class="central-section-body" id="${id}"></div>
    </div>`;

  el.innerHTML = `
    <div class="central-filtro-linha">
      <button type="button" class="central-filtro-pill ${soAtrasadas ? "" : "ativa"}" data-central-filtro="tudo">Tudo</button>
      <button type="button" class="central-filtro-pill ${soAtrasadas ? "ativa" : ""}" data-central-filtro="atrasadas">
        Só o que precisa cobrar${quantasAtrasadas ? ` <span class="central-filtro-conta">${quantasAtrasadas}</span>` : ""}
      </button>
      ${centralFiltroCliente ? `
        <button type="button" class="central-filtro-pill ativa central-filtro-cliente" id="centralTirarFiltroCliente">
          ${escaparHTML(centralFiltroCliente)} <span class="central-filtro-x" aria-hidden="true">×</span>
        </button>` : ""}
    </div>
    <div class="central-approvals-cols">
      ${soAtrasadas ? "" : coluna("Esperando você", esperandoVoce, "aColEsperando", "esperando")}
      ${soAtrasadas ? "" : coluna("Prontas pra enviar", prontasEnviar, "aColProntas", "prontas")}
      ${coluna(soAtrasadas ? `Cliente sem responder há ${limite}+ dias` : "Com o cliente", comCliente, "aColCliente", "comCliente")}
      ${coluna("Voltou com ajuste", voltouAjuste, "aColAjuste", "ajuste")}
    </div>
  `;

  if (!soAtrasadas) {
    centralPreencherSecaoFila("aColEsperando", esperandoVoce, "pendente");
    centralPreencherSecaoFila("aColProntas", prontasEnviar, "aprovada");
  }
  centralPreencherSecaoAprovacoes("aColCliente", comCliente, soAtrasadas ? "Ninguém atrasado. 🎉" : "Nada aqui.");
  centralPreencherSecaoAprovacoes("aColAjuste", voltouAjuste, "Nada aqui.");

  el.querySelectorAll("[data-central-filtro]").forEach(btn => {
    btn.addEventListener("click", () => {
      centralFiltroAprovacoes = btn.dataset.centralFiltro;
      centralRenderAprovacoes();
    });
  });

  document.getElementById("centralTirarFiltroCliente")?.addEventListener("click", () => {
    centralFiltroCliente = "";
    centralRenderAprovacoes();
  });
}

// A ABA "COBRANÇAS" VIROU UM FILTRO (2026-08-06)
//
// Ela mostrava a MESMA lista de aprovações, só recortada por "cliente sem
// responder há 3+ dias" e "voltou com ajuste". Eram três abas (Hoje,
// Aprovações, Cobranças) em cima do mesmo dado, e quem usava passeava
// entre elas procurando o que já tinha visto.
//
// Hoje isso é a pílula "Só o que precisa cobrar" no topo de Aprovações
// (ver centralRenderAprovacoes). Os textos de cobrança prontos não se
// perderam: "Cobrar no WhatsApp" (cliente) já existia no card de aprovação
// e "Cobrar designer" foi pra lá também — os dois em cardDeAprovacaoHTML/
// wireCardsDeAprovacao (js/pagina-repasse.js), que é o card reaproveitado
// pelas duas telas.

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

  // O que precisa ser cobrado NÃO tem mais ícone próprio na sidebar (a aba
  // "Cobranças" virou filtro dentro de Aprovações). O número dele aparece
  // na própria pílula do filtro, desenhada por centralRenderAprovacoes —
  // por isso aqui não sobrou badge nenhum pra atualizar.
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

/**
 * Preenche o cartão de foto (foto/iniciais + nome + papel) — reaproveitado
 * pelas abas Hoje e Minhas métricas, só o prefixo dos ids muda (`ch` na
 * Hoje, `cm` em Métricas). Só Métricas mostra o pill de "N clientes"
 * embaixo (o protótipo aprovado da Hoje não tinha isso).
 */
function centralPreencherFotoAtendimento(prefixo, nome, comValor) {
  const img = document.getElementById(prefixo + "FotoImg");
  const nomeEl = document.getElementById(prefixo + "FotoNome");
  const papel = document.getElementById(prefixo + "FotoPapel");
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

  if (comValor) {
    const valor = document.getElementById(prefixo + "FotoValor");
    if (valor) {
      const clientes = new Set(centralMinhasAprovacoes().map(a => normalizarParaComparar(a.cliente || "")).filter(Boolean));
      valor.textContent = clientes.size ? `${clientes.size} cliente${clientes.size > 1 ? "s" : ""}` : "—";
    }
  }
}

function centralRenderFotoMetricas(nome) {
  centralPreencherFotoAtendimento("cm", nome, true);
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

  // A MÉTRICA DE GARGALO (2026-08-06). As três de cima medem VOLUME — o
  // que passou, o que foi aprovado de primeira. Nenhuma media a única coisa
  // que a conferência realmente controla: quanto tempo uma peça fica
  // parada esperando VOCÊ olhar. Se o portão que criamos virar o gargalo
  // da produção, é aqui que isso tem que aparecer, não numa reclamação.
  //
  // Sai da fila que já está carregada (pedidoEm de cada lote pendente),
  // sem nada novo no backend: é o tempo de espera de AGORA, não uma média
  // histórica — e é justamente o de agora que dá pra resolver hoje.
  const esperando = centralFilaPor("pendente")
    .map(it => Date.now() - (Date.parse(it.pedidoEm) || Date.now()))
    .filter(ms => ms >= 0);
  const piorEspera = esperando.length ? Math.max(...esperando) : 0;
  const horasPior = piorEspera / 3600000;
  const textoPior = !esperando.length ? "—"
    : horasPior < 1 ? Math.max(1, Math.round(piorEspera / 60000)) + "min"
    : horasPior < 24 ? Math.round(horasPior) + "h"
    : Math.round(horasPior / 24) + "d";

  alvo.innerHTML = `
    <div class="hr-metrica"><b>${resolvidasSemana}</b><span>${icRelogio} Resolvidas esta semana</span></div>
    <div class="hr-metrica"><b>${pctDireto === null ? "—" : pctDireto + "%"}</b><span>${icCheck} Aprovadas sem ajuste</span></div>
    <div class="hr-metrica"><b>${aguardando}</b><span>${icAlerta} Aguardando resposta</span></div>
    <div class="hr-metrica ${horasPior >= 24 ? "cm-metrica-alerta" : ""}"><b>${textoPior}</b><span>${icRelogio} Mais tempo parado com você</span></div>
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

// ---------------------------------------------------------------------------
// O POP-UP DOS GRUPOS (2026-08-08)
//
// Clicar num dos quatro cartões de número da aba Hoje abre este pop-up por
// cima da Central, com a pílula preta no topo — e é nela que se troca entre
// os quatro grupos, sem fechar nada. Antes o clique levava pra aba
// Aprovações e destacava uma coluna lá: a pessoa saía do lugar onde estava
// pra ver uma lista, e voltava clicando de novo.
//
// O QUE ELE NÃO FAZ, de propósito: não aprova, não devolve, não manda link.
// Clicar num card abre a MESMA tela de conferência de sempre, que é onde
// essas decisões moram. Duplicar a decisão em dois lugares seria a chance
// de alguém resolver uma peça sem ter olhado a arte direito.
// ---------------------------------------------------------------------------

/**
 * Os quatro grupos, num lugar só. Cada um sabe o próprio rótulo, de onde
 * vêm os itens, e — o que mais importa — QUAL informação o card mostra:
 * em "Esperando você" o que pesa é há quanto tempo espera; em "Prontas pra
 * enviar", quem conferiu; nos dois do cliente, há quanto tempo está com
 * ele. Sem isso, três dos quatro grupos mostrariam um dado que não serve.
 */
const CENTRAL_GRUPOS = {
  esperando: {
    rotulo: "Esperando você",
    sub: n => `<b>${n} ${n === 1 ? "peça" : "peças"}</b> ${n === 1 ? "esperando" : "esperando"} sua conferência`,
    vazio: "Nada esperando conferência agora. 🎉",
    itens: () => centralFilaPor("pendente"),
  },
  prontas: {
    rotulo: "Prontas pra enviar",
    sub: n => `<b>${n} ${n === 1 ? "peça conferida" : "peças conferidas"}</b>, ${n === 1 ? "pronta" : "prontas"} pra mandar pro cliente`,
    vazio: "Nada pronto pra enviar agora.",
    itens: () => centralFilaPor("aprovada"),
  },
  comCliente: {
    rotulo: "Com o cliente",
    sub: n => `<b>${n} ${n === 1 ? "peça" : "peças"}</b> esperando resposta do cliente`,
    vazio: "Nenhuma peça esperando cliente agora.",
    itens: () => centralAprovacoesPor("pendente"),
  },
  ajuste: {
    rotulo: "Voltou com ajuste",
    alerta: true,
    sub: n => `<b>${n} ${n === 1 ? "peça voltou" : "peças voltaram"}</b> com pedido de ajuste`,
    vazio: "Nada voltou com ajuste. 🎉",
    itens: () => centralAprovacoesPor("ajuste"),
  },
};

let centralGrupoAtual = null;

function centralAbrirGrupo(chave) {
  if (!CENTRAL_GRUPOS[chave]) return;
  centralGrupoAtual = chave;
  const pop = document.getElementById("centralGrupo");
  const fundo = document.getElementById("centralGrupoFundo");
  if (!pop || !fundo) return;
  fundo.hidden = false;
  pop.hidden = false;
  centralRenderGrupo();
}

function centralFecharGrupo() {
  const pop = document.getElementById("centralGrupo");
  const fundo = document.getElementById("centralGrupoFundo");
  if (pop) pop.hidden = true;
  if (fundo) fundo.hidden = true;
  centralGrupoAtual = null;
}

/**
 * Desenha a pílula (com os quatro contadores, sempre) e a grade do grupo
 * ativo. Os contadores são recalculados aqui a cada desenho, não guardados:
 * trocar de grupo depois de conferir uma peça tem que mostrar o número
 * novo, e a fonte deles é o mesmo cache que o resto da Central já lê.
 */
function centralRenderGrupo() {
  if (!centralGrupoAtual) return;
  const seg = document.getElementById("centralGrupoSeg");
  const grade = document.getElementById("centralGrupoGrade");
  const sub = document.getElementById("centralGrupoSub");
  if (!seg || !grade) return;

  seg.innerHTML = Object.keys(CENTRAL_GRUPOS).map(chave => {
    const g = CENTRAL_GRUPOS[chave];
    const n = g.itens().length;
    return `
      <button type="button" role="tab" data-central-grupo="${chave}"
              aria-selected="${chave === centralGrupoAtual ? "true" : "false"}"
              class="central-grupo-aba ${chave === centralGrupoAtual ? "ativa" : ""} ${g.alerta && n ? "alerta" : ""}">
        ${escaparHTML(g.rotulo)} <span class="n">${n}</span>
      </button>`;
  }).join("");
  seg.querySelectorAll("[data-central-grupo]").forEach(b => {
    b.addEventListener("click", () => { centralGrupoAtual = b.dataset.centralGrupo; centralRenderGrupo(); });
  });

  const grupo = CENTRAL_GRUPOS[centralGrupoAtual];
  const itens = grupo.itens();
  if (sub) sub.innerHTML = itens.length ? grupo.sub(itens.length) : "";

  if (!itens.length) {
    grade.innerHTML = `<div class="central-grupo-vazio">${escaparHTML(grupo.vazio)}</div>`;
    return;
  }

  const daFila = centralGrupoAtual === "esperando" || centralGrupoAtual === "prontas";
  grade.innerHTML = itens.map((it, i) => centralCardDoGrupoHTML(it, i, daFila)).join("");

  // A miniatura entra depois, uma a uma — cada uma é uma ida ao Drive, e
  // segurar a grade inteira esperando por elas atrasaria o que importa
  // mais rápido (mesmo padrão da Timeline e de apvCarregarMiniatura).
  grade.querySelectorAll("[data-central-gc-thumb]").forEach(el => {
    const fileId = el.dataset.centralGcThumb;
    if (fileId) centralCarregarMiniaturaGrupo(fileId, el);
  });

  grade.querySelectorAll("[data-central-gc]").forEach(btn => {
    const item = itens[Number(btn.dataset.centralGc)];
    btn.addEventListener("click", () => centralAbrirDoGrupo(item, daFila));
  });
}

/** O card. Um desenho só pros quatro grupos; o que muda é o texto. */
function centralCardDoGrupoHTML(it, i, daFila) {
  const pecas = it.pecas || [];
  const primeira = pecas[0] || {};

  // Nome, cliente e miniatura saem de lugares diferentes nos dois tipos de
  // item (fila de conferência × link de aprovação), mas o card é o mesmo.
  const nome = daFila
    ? (pecas.length > 1 ? `${pecas.length} peças` : (primeira.nomePeca || it.tituloTarefa || "Peça"))
    : (it.tituloTarefa || String(it.nomeArquivo || "").split("|")[0] || "Peça");
  const cliente = it.cliente || "Sem cliente";
  const ehVideo = daFila
    ? String(primeira.mimeType || "").indexOf("video/") === 0
    : !!it.ehVideo;
  const fileId = ehVideo ? "" : (daFila ? (primeira.fileId || "") : (it.fileId || ""));

  // O selo do canto responde a pergunta daquele grupo, e só ela.
  let selo = "", classeSelo = "";
  if (centralGrupoAtual === "esperando") {
    selo = typeof apvTempoDeEspera === "function" ? apvTempoDeEspera(it.pedidoEm) : "";
    const dias = typeof centralDiasDesde === "function" ? centralDiasDesde(Date.parse(it.pedidoEm)) : 0;
    if (dias >= 1) classeSelo = "alerta";
  } else if (centralGrupoAtual === "prontas") {
    selo = it.aprovadoPor ? `conferida por ${it.aprovadoPor}` : "conferida";
    classeSelo = "ok";
  } else {
    const base = Number(it.respondidoEm) || Number(it.criadoEm) || 0;
    const dias = typeof centralDiasDesde === "function" ? centralDiasDesde(base) : 0;
    const limite = typeof APROVACAO_DIAS_ALERTA === "number" ? APROVACAO_DIAS_ALERTA : 3;
    selo = dias >= 1 ? `há ${dias} dia${dias === 1 ? "" : "s"}` : "hoje";
    if (dias >= limite) classeSelo = "alerta";
  }

  return `
    <button type="button" class="central-gc" data-central-gc="${i}">
      <span class="central-gc-arte" ${fileId ? `data-central-gc-thumb="${escaparHTML(fileId)}"` : ""}></span>
      <span class="central-gc-cima">
        ${selo ? `<span class="central-gc-selo ${classeSelo}">${escaparHTML(selo)}</span>` : ""}
        ${daFila && pecas.length > 1 ? `<span class="central-gc-selo">${pecas.length} peças</span>` : ""}
      </span>
      <span class="central-gc-prat">
        <span class="central-gc-t">
          <span class="central-gc-nome">${escaparHTML(nome)}</span>
          <span class="central-gc-cli">${escaparHTML(cliente)}</span>
        </span>
        <span class="central-gc-seta" aria-hidden="true">›</span>
      </span>
    </button>
  `;
}

async function centralCarregarMiniaturaGrupo(fileId, el) {
  const data = await chamarBackend({ acao: "buscarThumbnailDrive", fileId });
  if (!el.isConnected) return;   // a grade foi redesenhada enquanto vinha
  if (!data || !data.ok || !data.base64) return;   // fica o cinza do palco
  el.style.backgroundImage = `url("data:${data.mimeType || "image/jpeg"};base64,${data.base64}")`;
}

/**
 * O clique no card. Fecha o pop-up ANTES de abrir a conferência: as duas
 * são camadas sobrepostas, e deixar o pop-up aberto por trás faria o Esc
 * da conferência devolver pra ele em vez de pra Central.
 *
 * "Voltou com ajuste" abre no modo do pedido do CLIENTE (pílula amarela,
 * o texto dele, os pontos marcados) — é a mesma peça, mas a pergunta ali
 * é outra: não é "isso está bom?", é "o que ele pediu?".
 */
function centralAbrirDoGrupo(item, daFila) {
  // Lê o grupo ANTES de fechar: `centralFecharGrupo` zera
  // `centralGrupoAtual`, então checar depois daria sempre falso e o
  // "voltou com ajuste" nunca abriria no modo do cliente.
  const grupo = centralGrupoAtual;
  centralFecharGrupo();
  if (daFila) {
    if (typeof apvAbrirConferencia === "function") apvAbrirConferencia(item.taskId, item.loteId);
    return;
  }
  if (grupo === "ajuste" && typeof apvAbrirParaAlteracaoDoCliente === "function") {
    apvAbrirParaAlteracaoDoCliente(item);
    return;
  }
  // "Com o cliente": a peça está fora, esperando resposta — não existe
  // conferência pra abrir. Leva pra coluna dela na aba Aprovações, que é
  // onde moram copiar o link e cobrar no WhatsApp.
  centralAbrirAprovacoesEm("comCliente");
}

document.getElementById("centralGrupoFechar")?.addEventListener("click", centralFecharGrupo);
document.getElementById("centralGrupoFundo")?.addEventListener("click", centralFecharGrupo);
// Esc fecha — em fase de captura e checando que ele está aberto, pra não
// roubar o Esc de quem está por cima (a conferência) nem de quem está por
// baixo (a Central).
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  const pop = document.getElementById("centralGrupo");
  if (!pop || pop.hidden) return;
  ev.stopPropagation();
  centralFecharGrupo();
}, true);
