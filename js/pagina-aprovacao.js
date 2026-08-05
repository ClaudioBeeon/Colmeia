// ============================================================================
// APROVAÇÃO INTERNA DO ATENDIMENTO (2026-08-04)
// ============================================================================
//
// A camada visual (index.html + css/06-aprovacao.css) foi desenhada e revisada
// com o Cláudio; este arquivo é a parte funcional. O layout entregue foi
// MANTIDO como estava — aqui só entram os dados de verdade.
//
// ----------------------------------------------------------------------------
// O QUE ESSA TELA RESOLVE
// ----------------------------------------------------------------------------
// Antes disso, qualquer pessoa gerava o link do cliente direto, sem ninguém
// conferir. O fluxo passou a ser:
//
//   Designer conclui a peça
//        ↓  pede a conferência (fala da Bee de upload, ou o botão no card)
//   ATENDIMENTO confere aqui
//        ↓  aprovar prepara o link
//   Cliente aprova ou pede ajuste (aprovar.html, já existia)
//
// O erro que tudo isso existe pra evitar: mandar pro cliente a peça errada, a
// VERSÃO errada, ou uma peça que não atende o briefing. Toda decisão aqui deve
// ser avaliada por quanto reduz a chance disso.
//
// ----------------------------------------------------------------------------
// QUEM USA — a restrição mais importante
// ----------------------------------------------------------------------------
// O atendimento NÃO usa o Colmeia. Eles trabalham no Runrun.it e entram aqui só
// pra isso. Não conhecem a navegação, os ícones nem o vocabulário do app.
// Consequências que já estão respeitadas no HTML e devem continuar:
//
//   - nenhum ícone sem rótulo, nenhum atalho escondido como único caminho;
//   - botões escritos por extenso ("Aprovar e preparar envio", não "Aprovar");
//   - a conferência cobre o app inteiro, pra nada competir por atenção;
//   - volume de 10 a 20 peças por dia: vale "aprovar e ir pra próxima", mas
//     NÃO vale atalho de teclado nem aprovação em lote.
//
// ----------------------------------------------------------------------------
// AS 5 TELAS E ONDE ELAS ESTÃO NO HTML
// ----------------------------------------------------------------------------
//   1. Fila               #page-aprovacao      → lista o que espera conferência
//   2. Conferência        #apvConferencia      → briefing | peça (overlay)
//   3. Envio              #apvPainelEnvio      → MESMA tela da 2, painel esquerdo trocado
//   4. Devolver           #apvOverlayDevolver  → painel lateral
//   5. Projeto fechado    #apvExcecaoFechado   → dentro do MESMO painel da 4
//
// ----------------------------------------------------------------------------
// AS TRÊS DECISÕES QUE ESTAVAM EM ABERTO — resolvidas
// ----------------------------------------------------------------------------
// (a) O QUE PÕE UMA PEÇA NA FILA. Não é etapa nova no quadro: é o DESIGNER que
//     manda, em dois pontos de entrada (decisão do Cláudio, 04/08) — a fala da
//     Bee quando ele sobe arquivo novo (js/notificacoes-uploads.js) e o botão
//     "Enviar para revisão" no card (js/detalhe-modal.js). Os dois
//     chamam a MESMA ação `pedirConferenciaInterna`. Dois caminhos porque a
//     fala da Bee depende de uma varredura de 8s e pode ter sido dispensada;
//     o botão garante que nada fique parado por causa disso.
//
//     Mandar pra revisão faz DUAS coisas, e as duas importam: põe a peça na
//     fila desta tela E deixa no campo de comentário um texto com o link
//     direto da conferência, pro designer revisar e enviar. O comentário não
//     é enfeite — o atendimento trabalha no Runrun.it e não fica olhando a
//     fila daqui sozinho; é o comentário que avisa e traz eles até cá. Nada
//     vai pro Runrun.it sozinho (ver rascunharComentarioDeRevisao).
//
// (b) A NUMERAÇÃO DA SUBTAREFA. "Alteração V1" fixo quebraria na segunda
//     devolução da mesma peça. `proximoNumeroDeAlteracao` (AprovacaoInterna.gs)
//     conta as que já existem no card mãe e segue: V1, V2, V3.
//
// (c) QUEM ENXERGA A PÁGINA. Quem tem papel "atendimento" na planilha de login,
//     e o Cláudio (coordenação). Ver iniciarAppPosLogin (js/login-boot.js).
//
// ----------------------------------------------------------------------------
// A SUBTAREFA DE ALTERAÇÃO NASCE EM AJUSTES, COM ENTREGA HOJE ÀS 18h
// ----------------------------------------------------------------------------
// Pedido do Cláudio: "se não o card se perde". Uma tarefa sem prazo afunda no
// fim da coluna (que é ordenada por entrega) e uma que fica em Pendentes se
// mistura com trabalho novo. As duas coisas são feitas no backend, dentro de
// `devolverParaDesigner` — ver os comentários lá.
//
// ----------------------------------------------------------------------------
// ORDEM DE CARREGAMENTO
// ----------------------------------------------------------------------------
// Carregado depois de js/modo-foco.js e antes de js/login-boot.js — usa função
// de quase todo mundo (chamarBackend, mostrarToast, escaparHTML, mostrarPagina).
// Mesma regra de ouro do CLAUDE.md: um arquivo pode usar o que vem antes dele,
// nunca o que vem depois.
// ============================================================================

// ---------------------------------------------------------------------------
// Estado do módulo
// ---------------------------------------------------------------------------

// A fila como veio do backend (ver listarConferenciasPendentes).
let apvFila = [];

// A fila já foi buscada ao menos uma vez nesta sessão? Serve pra separar
// "não tem nada esperando" de "ainda não perguntei" — a mesma distinção que
// o resto do arquivo faz na tela.
let apvFilaCarregada = false;

// A peça aberta na conferência agora — os dados de `dadosDaConferencia`.
// Nunca guardar referência de objeto de TAREFA aqui: o quadro se recria
// sozinho em segundo plano e a referência fica velha em silêncio (bug
// recorrente do CLAUDE.md). Aqui o objeto é nosso, montado na hora, então é
// seguro — mas a comparação com o quadro continua sendo sempre por id.
let apvPecaAberta = null;

// Qual versão está NA TELA agora (o campo `ordem`, 1..N). Pode ser diferente
// da mais recente — é justamente esse descompasso que apvAprovar vigia.
let apvVersaoNaTela = null;

// O "Ver como o cliente vê" já foi aberto pra ESTA seleção de peças? Os botões
// de envio só acendem depois. Ver apvAoVerPreview().
let apvPreviewVisto = false;

// O link do cliente, depois de gerado. Trocar a seleção de peças zera ele —
// senão dava pra revisar um link e mandar outro.
let apvLinkGerado = "";

// Pontos marcados na imagem ao devolver: [{ x, y, texto }], x/y em PORCENTAGEM
// da imagem (0 a 100), nunca em pixel — mesmo formato que aprovar.html usa, e é
// o que mantém o ponto no lugar certo em qualquer tamanho de tela.
let apvPinsDevolucao = [];

// Modo "clicar na peça marca um ponto" ligado/desligado.
let apvMarcando = false;

// Fase do botão de ação da pílula (ver apvClickAcao):
//   "aprovar"  → clicar chama apvAprovar()
//   "animando" → clique ignorado, o rótulo está deslizando sozinho
//   "enviar"   → clicar copia o link pro cliente
let apvFaseAcao = "aprovar";

// Quando ESTA peça foi pedida pra conferência (peca.pedidoEm da fila),
// guardado no momento de abrir — apvFila já pode ter perdido o item depois
// de aprovar (ele é filtrado antes do painel de envio desenhar).
let apvPedidoEmAtual = null;

// ---------------------------------------------------------------------------
// TELA 1 — Fila de aprovação
// ---------------------------------------------------------------------------

/**
 * Ponto de entrada da página, chamado por mostrarPagina("aprovacao")
 * (js/pagina-repasse.js).
 *
 * "Nenhuma peça esperando" e "ainda não carregou" são coisas MUITO diferentes
 * pra quem está olhando — mostrar uma pela outra faz a pessoa ir embora achando
 * que não tem trabalho. Por isso o estado de carregando é explícito, e falha de
 * rede (ver caiuARede, js/config.js) nunca vira lista vazia.
 */
async function buildAprovacaoPage() {
  const lista = document.getElementById("apvFilaLista");
  if (!lista) return;
  lista.innerHTML = `<div class="apv-vazio">Buscando o que está esperando conferência...</div>`;

  const data = await chamarBackend({ acao: "listarConferenciasPendentes" });

  if (caiuARede(data)) {
    lista.innerHTML = `
      <div class="apv-vazio">
        Não consegui falar com o servidor agora, então não dá pra saber o que está esperando.
        <br><br>
        <button type="button" class="apv-btn apv-btn-neutro apv-btn-p" onclick="buildAprovacaoPage()">Tentar de novo</button>
      </div>`;
    return;
  }
  if (!data.ok) {
    lista.innerHTML = `<div class="apv-vazio">${escaparHTML(data.error || "Não consegui carregar a fila.")}</div>`;
    return;
  }

  apvFila = data.itens || [];
  apvFilaCarregada = true;
  apvRenderFila(apvFila);
  atualizarBadgeAprovacao();
}

/**
 * Desenha a lista dentro de #apvFilaLista.
 *
 * ORDENAÇÃO: o backend devolve por ordem de pedido (quem está esperando há mais
 * tempo primeiro), e o tempo de espera fica visível no card. O prazo do cliente
 * seria um critério melhor de urgência — ficou registrado com o Cláudio como
 * possível ajuste depois de umas semanas de uso real.
 */
function apvRenderFila(itens) {
  const lista = document.getElementById("apvFilaLista");
  if (!lista) return;

  if (!itens.length) {
    lista.innerHTML = `
      <div class="apv-vazio">
        Nada esperando conferência agora. 🎉
        <br><br>
        Quando um designer terminar uma peça e mandar pra cá, ela aparece nesta lista.
      </div>`;
    return;
  }

  lista.innerHTML = itens.map((item, i) => `
    <article class="apv-card" data-apv-idx="${i}">
      <div class="apv-card-mini" data-apv-thumb="${escaparHTML(item.fileId || "")}"></div>
      <div class="apv-card-corpo">
        <span class="apv-card-cliente">${escaparHTML(item.cliente || "Sem cliente")}</span>
        <span class="apv-card-peca">${escaparHTML(item.nomePeca || item.tituloTarefa || "")}</span>
        <div class="apv-card-meta">
          <span class="apv-card-designer">${escaparHTML(item.designer || "")}</span>
          <span class="apv-pill apv-pill-versao">versão ${item.versaoAtual || 1}</span>
          <span class="apv-pill apv-pill-espera">${apvTempoDeEspera(item.pedidoEm)}</span>
          ${item.temVersaoNova ? `<span class="apv-pill apv-pill-nova">versão nova chegou</span>` : ""}
          ${item.arquivoSumiu ? `<span class="apv-pill apv-pill-nova">o arquivo saiu da pasta</span>` : ""}
        </div>
      </div>
      <div class="apv-card-acao">
        <button type="button" class="apv-btn apv-btn-primario" data-apv-conferir="${i}">Conferir</button>
      </div>
    </article>
  `).join("");

  lista.querySelectorAll("[data-apv-conferir]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = apvFila[Number(btn.dataset.apvConferir)];
      if (item) apvAbrirConferencia(item.taskId, item.nomePeca);
    });
  });

  // As miniaturas entram depois, uma por uma: são uma ida ao Drive cada, e
  // segurar a lista inteira esperando por elas atrasaria a única coisa que a
  // pessoa realmente precisa ver (o que está na fila).
  lista.querySelectorAll("[data-apv-thumb]").forEach(el => {
    const fileId = el.dataset.apvThumb;
    if (fileId) apvCarregarMiniatura(fileId, el);
  });
}

async function apvCarregarMiniatura(fileId, el) {
  const data = await chamarBackend({ acao: "buscarThumbnailDrive", fileId });
  if (!data || !data.ok || !data.base64) return;
  el.style.background = `center/cover no-repeat url("data:${data.mimeType || "image/jpeg"};base64,${data.base64}")`;
}

/** "2 h esperando", "40 min esperando" — o mesmo vocabulário do resto do app. */
function apvTempoDeEspera(iso) {
  const quando = Date.parse(iso);
  if (!quando) return "esperando";
  const min = Math.max(1, Math.round((Date.now() - quando) / 60000));
  if (min < 60) return `${min} min esperando`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h esperando`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"} esperando`;
}

/**
 * O contador vermelho no ícone da barra lateral. Buscado no login e depois de
 * cada decisão — quem confere precisa saber que tem coisa esperando sem
 * precisar abrir a página.
 */
async function atualizarBadgeAprovacao() {
  const badge = document.getElementById("aprovacaoBadge");
  if (!badge) return;

  // Sem a fila carregada ainda (a chamada que vem do login), busca. Depois
  // disso o número sai do que já está na memória — uma fila vazia é uma
  // resposta legítima, e ir buscar de novo toda vez que ela esvazia faria
  // uma ida ao servidor a cada peça decidida, à toa.
  if (!apvFilaCarregada) {
    const data = await chamarBackend({ acao: "listarConferenciasPendentes" });
    if (!data || !data.ok) return;
    apvFila = data.itens || [];
    apvFilaCarregada = true;
  }
  badge.textContent = String(apvFila.length);
  badge.hidden = apvFila.length === 0;
}

// ---------------------------------------------------------------------------
// TELAS 2 e 3 — Conferência e envio
// ---------------------------------------------------------------------------

/**
 * Abre o overlay de conferência de uma peça.
 *
 * A entrada é em DOIS PASSOS, igual ao pop-up de tarefa: primeiro `visible`
 * (que só faz o elemento existir na tela), depois `open` no quadro seguinte
 * (que dispara a transição). Sem os dois passos o navegador pula a animação,
 * porque o elemento nasce e muda de estado no mesmo instante.
 */
async function apvAbrirConferencia(taskId, nomePeca) {
  const overlay = document.getElementById("apvConferencia");
  if (!overlay) return;

  apvPecaAberta = null;
  apvVersaoNaTela = null;
  apvPreviewVisto = false;
  apvLinkGerado = "";
  apvPinsDevolucao = [];
  apvMarcando = false;
  apvPedidoEmAtual = null;

  // Volta pro painel "o que foi pedido" — a tela pode ter ficado no painel
  // de envio da peça anterior. E o botão de ação volta pro início da
  // pilha (Aprovar), destravado.
  document.getElementById("apvPainelBriefing").hidden = false;
  document.getElementById("apvPainelEnvio").hidden = true;
  document.getElementById("apvAcoesDevolver").hidden = false;
  apvFaseAcao = "aprovar";
  document.getElementById("apvAcaoTrack").style.transform = "translateY(0)";
  document.getElementById("apvAcaoCopiado").classList.remove("mostra");
  document.getElementById("apvBtnAprovar").classList.remove("travado");
  document.getElementById("apvContextoId").hidden = true;
  document.getElementById("apvPalcoSlot").innerHTML = `<div class="apv-vazio">Carregando a peça...</div>`;
  document.getElementById("apvContextoCliente").textContent = "";
  document.getElementById("apvContextoPeca").textContent = "Carregando...";

  overlay.classList.add("visible");
  requestAnimationFrame(() => overlay.classList.add("open"));

  // Guarda de quando foi o pedido ANTES de qualquer coisa filtrar a fila
  // (apvConfirmarAprovacao remove o item de apvFila assim que aprova).
  const itemDaFila = apvFila.find(i => String(i.taskId) === String(taskId) && i.nomePeca === nomePeca);
  apvPedidoEmAtual = itemDaFila ? itemDaFila.pedidoEm : null;

  const data = await chamarBackend({ acao: "dadosDaConferencia", taskId, nomePeca });

  if (caiuARede(data) || !data.ok) {
    document.getElementById("apvPalcoSlot").innerHTML = `
      <div class="apv-vazio">${escaparHTML(
        caiuARede(data)
          ? "Não consegui falar com o servidor agora. A peça continua na fila — tenta de novo em instantes."
          : (data.error || "Não consegui carregar essa peça.")
      )}</div>`;
    return;
  }

  apvPecaAberta = data;
  apvVersaoNaTela = data.peca.versoes.length; // começa na mais recente

  document.getElementById("apvContextoCliente").textContent = data.cliente || "";
  document.getElementById("apvContextoPeca").textContent = data.peca.nomePeca || data.titulo || "";
  const restam = Math.max(0, apvFila.length - 1);
  document.getElementById("apvContextoRestam").textContent =
    restam ? `${restam} ${restam === 1 ? "peça ainda esperando" : "peças ainda esperando"}` : "última da fila";

  apvRenderBriefing(data);
  apvRenderPeca(data);
}

/** Fecha a conferência e volta pra fila. Caminho inverso da abertura. */
function apvFecharConferencia() {
  const overlay = document.getElementById("apvConferencia");
  if (!overlay) return;
  overlay.classList.remove("open");
  setTimeout(() => overlay.classList.remove("visible"), 220);
  apvPecaAberta = null;
}

/**
 * Coluna da ESQUERDA — o que foi pedido.
 *
 * Só o texto de verdade escrito na tarefa (sem resumo por IA) e sem repetir
 * cliente/peça/designer — esses já aparecem na pílula de cima.
 *
 * Entrega estourada é o ÚNICO caso de vermelho nesta tela (classe .atencao);
 * todo o resto de aviso é amarelo, seguindo o app.
 */
function apvRenderBriefing(peca) {
  // O número em cima é do CARD MÃE quando existe (é o que o time reconhece
  // como "a tarefa"); sem card mãe (peça avulsa), mostra o id dela mesma.
  const idChip = document.getElementById("apvContextoId");
  const idMostrado = peca.cardMaeId || peca.taskId;
  idChip.textContent = "#" + idMostrado;
  idChip.href = peca.cardMaeLink || `https://runrun.it/tasks/${peca.taskId}`;
  idChip.hidden = false;

  const texto = document.getElementById("apvBriefTexto");
  // A descrição vem do Runrun.it já como HTML. É conteúdo de dentro de casa
  // (escrito pelo próprio time no Runrun.it), o mesmo tratamento que o pop-up
  // de tarefa já dá pra ela — não é entrada de fora.
  texto.innerHTML = peca.descricao
    ? peca.descricao
    : `<p class="apv-vazio-inline">Essa tarefa não tem descrição escrita no Runrun.it. Vale conferir com quem pediu antes de aprovar.</p>`;

  const entrega = peca.prazo ? new Date(peca.prazo) : null;
  const atrasada = entrega && entrega < new Date(new Date().toDateString());
  document.getElementById("apvBriefSpecs").innerHTML = `
    <div class="apv-spec">
      <span class="apv-spec-rotulo">Entrega desejada</span>
      <span class="apv-spec-valor ${atrasada ? "atencao" : ""}">${entrega ? apvDataCurta(peca.prazo) : "sem data"}</span>
    </div>
  `;
}

function apvDataCurta(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  if (mesmoDia) return "hoje";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

/** Coluna da DIREITA — o que foi feito. */
function apvRenderPeca(peca) {
  apvRenderSeletorDeVersao(peca);
  apvRenderAvisoVersaoNova(peca);
  apvMostrarNoPalco(peca, apvVersaoNaTela);
}

/**
 * O seletor ‹ v1 v2 ●v3 ›.
 *
 * Fica SEMPRE visível, nunca escondido atrás de menu: se a versão não aparece
 * na tela, mandar a versão errada é questão de tempo. O nome do arquivo ao lado
 * muda junto — é a única informação da tela que não mente sobre qual arquivo
 * vai pro cliente.
 */
function apvRenderSeletorDeVersao(peca) {
  const switchEl = document.getElementById("apvVersaoSwitch");
  const versoes = peca.peca.versoes;
  const atual = apvVersaoNaTela;

  switchEl.innerHTML = `
    <button type="button" class="apv-versao-seta" data-apv-versao-passo="-1" aria-label="Versão anterior" ${atual <= 1 ? "disabled" : ""}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    ${versoes.map(v => `
      <button type="button" class="apv-versao-btn ${v.ordem === atual ? "ativa" : ""}" data-apv-versao="${v.ordem}">v${v.versao === null ? v.ordem : v.versao}</button>
    `).join("")}
    <button type="button" class="apv-versao-seta" data-apv-versao-passo="1" aria-label="Próxima versão" ${atual >= versoes.length ? "disabled" : ""}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `;

  switchEl.querySelectorAll("[data-apv-versao]").forEach(btn => {
    btn.addEventListener("click", () => apvIrParaVersao(Number(btn.dataset.apvVersao)));
  });
  switchEl.querySelectorAll("[data-apv-versao-passo]").forEach(btn => {
    btn.addEventListener("click", () => apvIrParaVersao(atual + Number(btn.dataset.apvVersaoPasso)));
  });

  const eUltima = atual === versoes.length;
  document.getElementById("apvVersaoLegenda").innerHTML = eUltima
    ? `Esta é a <b>versão mais recente</b> que o designer entregou.`
    : `Você está vendo uma <b>versão anterior</b> — a mais recente é a v${versoes[versoes.length - 1].versao || versoes.length}.`;
  document.getElementById("apvArquivo").textContent = versoes[atual - 1].nome;
}

/**
 * Troca a versão exibida.
 *
 * Micro-interação que importa: o palco pisca ao trocar (classe .trocou,
 * reiniciada com um reflow). Duas versões da mesma peça são parecidas de
 * propósito, e sem um sinal de mudança a pessoa clica em "v2" e não registra
 * que algo mudou.
 */
function apvIrParaVersao(versao) {
  if (!apvPecaAberta) return;
  const total = apvPecaAberta.peca.versoes.length;
  if (versao < 1 || versao > total || versao === apvVersaoNaTela) return;

  apvVersaoNaTela = versao;
  apvRenderSeletorDeVersao(apvPecaAberta);
  apvMostrarNoPalco(apvPecaAberta, versao);

  const palco = document.getElementById("apvPalco");
  palco.classList.remove("trocou");
  void palco.offsetWidth;
  palco.classList.add("trocou");
}

/**
 * Coloca a peça no palco.
 *
 * IMAGEM vem pelo backend em base64 (buscarImagemCheiaDrive), nunca apontando a
 * <img> direto pro Drive: nem todo arquivo tem "qualquer pessoa com o link"
 * ligado, e a conta do Apps Script já tem acesso à pasta de qualquer jeito.
 *
 * VÍDEO usa o player do próprio Drive num iframe — o mesmo caminho que a página
 * do cliente já usa, porque qualquer vídeo estoura o limite de 25MB do Apps
 * Script. Aqui, diferente de lá, o arquivo NÃO é liberado publicamente: a peça
 * ainda pode ser devolvida, e liberar antes da aprovação seria expor uma coisa
 * que talvez nunca vá pro cliente. Quem confere abre logado na conta da
 * agência, que já tem acesso à pasta.
 *
 * Sem width/height fixos no elemento de propósito — é o que deixa a regra de
 * `object-fit: contain` do CSS caber a peça inteira sem cortar.
 */
async function apvMostrarNoPalco(peca, versao) {
  const slot = document.getElementById("apvPalcoSlot");
  const arquivo = peca.peca.versoes[versao - 1];
  if (!arquivo) return;

  if ((arquivo.mimeType || "").indexOf("video/") === 0) {
    slot.innerHTML = `
      <iframe class="apv-palco-video" src="https://drive.google.com/file/d/${encodeURIComponent(arquivo.fileId)}/preview"
              allow="autoplay" allowfullscreen title="${escaparHTML(arquivo.nome)}"></iframe>
      <a class="apv-palco-drive" href="https://drive.google.com/file/d/${encodeURIComponent(arquivo.fileId)}/view" target="_blank" rel="noopener">Abrir no Drive</a>`;
    return;
  }

  slot.innerHTML = `<div class="apv-vazio">Carregando a peça...</div>`;
  const data = await chamarBackend({ acao: "buscarImagemCheiaDrive", fileId: arquivo.fileId });

  // A tela pode ter mudado enquanto a imagem vinha (trocou de versão, fechou a
  // conferência) — buscar o elemento de novo e conferir se ainda é esta peça
  // que está na tela. É o segundo cuidado do "bug recorrente" do CLAUDE.md:
  // nunca escrever num pedaço de tela que já foi redesenhado.
  const slotAgora = document.getElementById("apvPalcoSlot");
  if (!slotAgora || !apvPecaAberta || apvVersaoNaTela !== versao) return;

  if (!data || !data.ok || !data.base64) {
    slotAgora.innerHTML = `
      <div class="apv-vazio">
        Não consegui carregar essa peça pra mostrar aqui.
        <br><br>
        <a class="apv-palco-drive" href="https://drive.google.com/file/d/${encodeURIComponent(arquivo.fileId)}/view" target="_blank" rel="noopener">Abrir no Drive</a>
      </div>`;
    return;
  }
  slotAgora.innerHTML = `<img class="apv-palco-img" src="data:${data.mimeType || arquivo.mimeType};base64,${data.base64}" alt="${escaparHTML(arquivo.nome)}">`;
}

/**
 * O aviso "chegou uma versão mais nova".
 *
 * INFORMA, NÃO BLOQUEIA — enquanto a pessoa confere, é só um aviso amarelo com
 * um botão pra ver a nova. O único momento em que isso vira interrupção é na
 * hora de aprovar (ver apvAprovar).
 */
function apvRenderAvisoVersaoNova(peca) {
  const aviso = document.getElementById("apvAvisoNova");
  const daFila = apvFila.find(i => String(i.taskId) === String(peca.taskId) && i.nomePeca === peca.peca.nomePeca);
  const temNova = daFila && daFila.temVersaoNova;

  aviso.hidden = !temNova;
  if (!temNova) return;

  const ultima = peca.peca.versoes[peca.peca.versoes.length - 1];
  document.getElementById("apvAvisoNovaTxt").textContent =
    `${peca.designer || "O designer"} subiu a v${ultima.versao || peca.peca.versoes.length} depois de mandar essa peça pra conferência.`;
}

/**
 * Aprovar internamente.
 *
 * ESTE É O PONTO MAIS IMPORTANTE DO ARQUIVO.
 *
 * Se a versão na tela NÃO é a mais recente (seja porque a pessoa voltou pra uma
 * antiga, seja porque chegou uma nova enquanto ela conferia), abre a
 * confirmação ANTES de aprovar. O botão principal de lá é "Ver a mais nova",
 * não "seguir": dá pra aprovar a antiga de propósito (às vezes é mesmo o
 * certo), só não pode ser o caminho fácil.
 *
 * É o ÚNICO ponto do fluxo que interrompe alguém, de propósito — é exatamente o
 * erro que estas telas existem pra evitar, e interromper só aqui é o que faz a
 * interrupção continuar significando alguma coisa. Não adicionar confirmação em
 * mais nada sem uma razão do mesmo peso.
 */
function apvAprovar() {
  if (!apvPecaAberta) return;
  const total = apvPecaAberta.peca.versoes.length;

  if (apvVersaoNaTela < total) {
    const naTela = apvPecaAberta.peca.versoes[apvVersaoNaTela - 1];
    const maisNova = apvPecaAberta.peca.versoes[total - 1];
    document.getElementById("apvConfirmaTxt").textContent =
      `Você está aprovando a ${naTela.nome}, mas o designer já subiu a ${maisNova.nome} depois dela. ` +
      `Se for de propósito, pode seguir — só confere antes.`;
    document.getElementById("apvConfirmaFundo").hidden = false;
    return;
  }
  apvConfirmarAprovacao();
}

/**
 * Registra a aprovação e troca o painel da coluna ESQUERDA (briefing → envio).
 *
 * NÃO troca de tela: o #apvPainelBriefing some, o #apvPainelEnvio aparece, e a
 * peça continua ali do lado, sempre visível. Quem acabou de aprovar quer
 * mandar agora, não navegar. O botão de ação (na pílula de cima) anima pra
 * "Aprovado" e depois pra "Enviar para o cliente" — ver apvIniciarAnimacaoAprovado.
 */
async function apvConfirmarAprovacao() {
  if (!apvPecaAberta) return;
  document.getElementById("apvConfirmaFundo").hidden = true;

  const btn = document.getElementById("apvBtnAprovar");
  btn.disabled = true;

  const data = await chamarBackend({
    acao: "aprovarInternamente",
    taskId: apvPecaAberta.taskId,
    nomePeca: apvPecaAberta.peca.nomePeca,
    aprovadoPor: DESIGNER_LOGADO,
  });

  btn.disabled = false;

  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "Não consegui registrar a aprovação agora.", "erro");
    return;
  }

  apvFila = apvFila.filter(i => !(String(i.taskId) === String(apvPecaAberta.taskId) && i.nomePeca === apvPecaAberta.peca.nomePeca));
  atualizarBadgeAprovacao();

  document.getElementById("apvPainelBriefing").hidden = true;
  document.getElementById("apvPainelEnvio").hidden = false;
  document.getElementById("apvAcoesDevolver").hidden = true;
  apvRenderEnvio(apvPecaAberta, data);
  apvIniciarAnimacaoAprovado();
}

/**
 * O clique único do botão da pílula: o que ele faz depende da FASE
 * (apvFaseAcao) — nunca da posição visual do rótulo, que é só animação.
 */
function apvClickAcao() {
  if (apvFaseAcao === "aprovar") { apvAprovar(); return; }
  if (apvFaseAcao === "animando") return; // clique no meio da animação: ignora
  apvCopiarLinkCliente(); // apvFaseAcao === "enviar"
}

/**
 * Desliza o rótulo do botão em DUAS etapas — Aprovar → Aprovado → Enviar
 * para o cliente — dentro do mesmo botão, na pílula de cima. A largura do
 * botão é fixa (CSS) de propósito: só o texto mudando de tamanho no meio da
 * animação faria ele pular de largura.
 *
 * A altura do item é lida do próprio DOM (offsetHeight), nunca um número
 * fixo repetido aqui — evita o CSS e o JS descombinarem se a altura mudar
 * um dia.
 */
function apvIniciarAnimacaoAprovado() {
  const track = document.getElementById("apvAcaoTrack");
  const item = track.children[0];
  const altura = item ? item.offsetHeight : 42;
  const reduzMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  apvFaseAcao = "animando";
  track.style.transform = `translateY(-${altura}px)`;

  setTimeout(() => {
    track.style.transform = `translateY(-${altura * 2}px)`;
    apvFaseAcao = "enviar";
  }, reduzMovimento ? 0 : 900);
}

/**
 * Copia o link do cliente (+ a mensagem, se tiver escrito uma) — é o que o
 * botão "Enviar para o cliente" faz ao ser clicado. Reusa o MESMO link
 * gerado no "Ver como o cliente vê" (apvGarantirLink nunca gera dois).
 */
async function apvCopiarLinkCliente() {
  const link = await apvGarantirLink();
  if (!link) return;

  const msg = (document.getElementById("apvMsgCliente").value || "").trim();
  const texto = (msg ? msg + "\n\n" : "") + link;

  try {
    await navigator.clipboard.writeText(texto);
  } catch (err) {
    mostrarToast("Não consegui copiar sozinho — o link é: " + link, "erro");
    return;
  }

  const flash = document.getElementById("apvAcaoCopiado");
  flash.classList.add("mostra");
  setTimeout(() => flash.classList.remove("mostra"), 1400);
}

/**
 * Monta o estado de envio: selo de aprovado, quais peças vão no link, campo de
 * mensagem e os botões.
 *
 * O selo mostra quem aprovou e a que horas — é o registro de que existiu
 * conferência, e é o que dá sentido ao portão todo.
 *
 * A lista de peças inclui as OUTRAS peças da mesma pasta (quando o card tem
 * Feed e Stories, as duas podem ir no mesmo link, marcadas de forma
 * independente) — só a peça conferida vem marcada por padrão.
 */
function apvRenderEnvio(peca, aprovacao) {
  const hora = new Date(aprovacao.aprovadoEm || Date.now())
    .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("apvSeloTxt").textContent =
    `Aprovado internamente por ${aprovacao.aprovadoPor || DESIGNER_LOGADO} · ${hora}`;

  const revisaoTempo = document.getElementById("apvRevisaoTempo");
  if (apvPedidoEmAtual) {
    revisaoTempo.hidden = false;
    document.getElementById("apvRevisaoTempoTxt").textContent =
      `Pedida pra conferência há ${apvTempoDeEspera(apvPedidoEmAtual).replace(" esperando", "")}`;
  } else {
    revisaoTempo.hidden = true;
  }

  const versaoConferida = peca.peca.versoes[apvVersaoNaTela - 1];
  const opcoes = [
    { fileId: versaoConferida.fileId, nome: peca.peca.nomePeca, sub: `${versaoConferida.nome} · aprovada agora`, marcada: true },
    ...peca.outrasPecas.map(p => ({
      fileId: p.ultima.fileId,
      nome: p.nomePeca,
      sub: `${p.ultima.nome} · não passou pela conferência`,
      marcada: false,
    })),
  ];

  document.getElementById("apvListaPecasEnvio").innerHTML = opcoes.map(o => `
    <button type="button" class="apv-escolha ${o.marcada ? "marcada" : ""}" data-apv-file="${escaparHTML(o.fileId)}">
      <span class="apv-check"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="apv-escolha-mini" data-apv-thumb="${escaparHTML(o.fileId)}"></span>
      <span class="apv-escolha-nome">${escaparHTML(o.nome)}<span class="apv-escolha-sub">${escaparHTML(o.sub)}</span></span>
    </button>
  `).join("");

  document.querySelectorAll("#apvListaPecasEnvio [data-apv-file]").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("marcada");
      // Trocar a seleção invalida o link já gerado e volta a travar o envio:
      // revisar um link e mandar outro seria exatamente o erro que essa tela
      // existe pra evitar.
      apvLinkGerado = "";
      apvPreviewVisto = false;
      document.getElementById("apvBtnAprovar").classList.add("travado");
      document.getElementById("apvPreviewNota").textContent =
        "A seleção mudou — dá uma olhada de novo antes de mandar.";
    });
  });
  document.querySelectorAll("#apvListaPecasEnvio [data-apv-thumb]").forEach(el => {
    if (el.dataset.apvThumb) apvCarregarMiniatura(el.dataset.apvThumb, el);
  });

  document.getElementById("apvBtnAprovar").classList.add("travado");
  document.getElementById("apvPreviewNota").textContent =
    "Dá uma olhada antes de mandar — é a última chance de pegar algo errado.";
}

/** Os arquivos marcados pra ir no link. */
function apvArquivosEscolhidos() {
  return [...document.querySelectorAll("#apvListaPecasEnvio .apv-escolha.marcada")]
    .map(el => el.dataset.apvFile)
    .filter(Boolean);
}

/**
 * Gera o link de verdade e abre a página do cliente numa aba nova.
 *
 * O botão é o maior do painel DE PROPÓSITO, e o botão de enviar (na pílula
 * de cima) nasce apagado até ele ser usado. Botão grande sozinho é sugestão,
 * não proteção; a trava é o que de fato impede "mandei sem olhar", e custa
 * um clique.
 *
 * COMO TIRAR, se um dia incomodar: é só parar de pôr a classe .travado em
 * #apvBtnAprovar. O botão de enviar continua ali, sem a trava. Foi combinado
 * assim com o Cláudio — vale reavaliar depois de umas semanas.
 */
async function apvAoVerPreview() {
  const link = await apvGarantirLink();
  if (!link) return;
  apvPreviewVisto = true;
  document.getElementById("apvBtnAprovar").classList.remove("travado");
  document.getElementById("apvPreviewNota").textContent =
    "Você já viu como o cliente vê. O botão de enviar está liberado.";
  window.open(link, "_blank", "noopener");
}

/**
 * Gera o link do cliente uma vez e guarda — os botões de envio reusam o MESMO
 * link que foi revisado no preview, nunca um novo.
 */
async function apvGarantirLink() {
  if (apvLinkGerado) return apvLinkGerado;
  if (!apvPecaAberta) return "";

  const escolhidos = apvArquivosEscolhidos();
  if (!escolhidos.length) {
    mostrarToast("Marca pelo menos uma peça pra mandar.", "erro");
    return "";
  }

  const btn = document.getElementById("apvBtnPreview");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Preparando o link...";

  const data = await chamarBackend({
    acao: "gerarLinkDeAprovacao",
    taskId: apvPecaAberta.taskId,
    cliente: apvPecaAberta.cliente,
    tituloTarefa: apvPecaAberta.titulo,
    fileId: escolhidos,
  });

  btn.disabled = false;
  btn.innerHTML = original;

  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "Não consegui gerar o link agora.", "erro");
    return "";
  }

  // Mesma conta do resto do app: a base sai de onde o index.html está
  // publicado, então nada quebra quando o domínio mudar (ver ROTA_BASE,
  // js/roteador-url.js).
  apvLinkGerado = new URL(".", location.href).href + "aprovar.html?codigo=" + data.codigo;
  return apvLinkGerado;
}

// ---------------------------------------------------------------------------
// TELAS 4 e 5 — Devolver pro designer / projeto fechado
// ---------------------------------------------------------------------------

/**
 * Abre o painel de devolução.
 *
 * O caso do projeto fechado é detectado AO ABRIR — o backend já mandou
 * `projetoFechado` junto dos dados da conferência. O pior desenho possível
 * seria a pessoa escrever três parágrafos e só então descobrir que não dá.
 *
 * E o texto dela NÃO É PERDIDO nesse caso: vira o comentário no card mãe do
 * mesmo jeito. É isso que faz a exceção não parecer um beco sem saída — o
 * caminho muda, o trabalho da pessoa não.
 */
function apvAbrirDevolver() {
  if (!apvPecaAberta) return;
  const fechado = !!apvPecaAberta.projetoFechado;

  document.getElementById("apvExplicaNormal").hidden = fechado;
  document.getElementById("apvExcecaoFechado").hidden = !fechado;
  document.getElementById("apvBlocoLinkMae").hidden = !fechado;
  document.getElementById("apvErroMotivo").hidden = true;
  document.getElementById("apvMotivo").classList.remove("invalido");

  if (fechado) {
    document.getElementById("apvLinkMaeUrl").textContent =
      apvPecaAberta.cardMaeLink || "sem card mãe";
    document.getElementById("apvConfirmarDevolver").textContent =
      `Comentar e passar pro ${apvPecaAberta.designer || "designer"}`;
  } else {
    document.getElementById("apvConfirmarDevolver").textContent = "Devolver";
  }

  document.getElementById("apvOverlayDevolver").hidden = false;
  document.getElementById("apvMotivo").focus();
}

function apvFecharDevolver() {
  document.getElementById("apvOverlayDevolver").hidden = true;
  apvMarcando = false;
  document.getElementById("apvMarcarArea").hidden = true;
}

/**
 * Confirma a devolução.
 *
 * O motivo é OBRIGATÓRIO — sem ele o designer não sabe o que refazer, e a
 * devolução vira uma ida e volta perdida. O erro aparece NO CAMPO, não num
 * alerta que some sozinho, e some assim que a pessoa começa a digitar.
 */
async function apvConfirmarDevolucao() {
  if (!apvPecaAberta) return;
  const campo = document.getElementById("apvMotivo");
  const motivo = (campo.value || "").trim();

  if (!motivo) {
    document.getElementById("apvErroMotivo").hidden = false;
    campo.classList.add("invalido");
    campo.focus();
    return;
  }

  const versaoConferida = apvPecaAberta.peca.versoes[apvVersaoNaTela - 1];
  const btn = document.getElementById("apvConfirmarDevolver");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Devolvendo...";

  const data = await chamarBackend({
    acao: "devolverParaDesigner",
    taskId: apvPecaAberta.taskId,
    nomePeca: apvPecaAberta.peca.nomePeca,
    motivo,
    // Ponto marcado sem texto não vira nada do outro lado — o designer veria
    // "(alto à esquerda)" sozinho e não saberia o que fazer com aquilo.
    pins: apvPinsDevolucao.filter(p => String(p.texto || "").trim()),
    designer: apvPecaAberta.designer,
    designerId: apvPecaAberta.designerId,
    autorNome: DESIGNER_LOGADO,
    cliente: apvPecaAberta.cliente,
    // Qual arquivo estava sendo conferido — é em cima DELE que os pontos
    // foram marcados, e é ele que a página de ajuste vai mostrar.
    fileId: versaoConferida ? versaoConferida.fileId : "",
    nomeArquivo: versaoConferida ? versaoConferida.nome : "",
    mimeType: versaoConferida ? versaoConferida.mimeType : "",
    // Só a interface sabe onde o Colmeia está publicado hoje (mesmo motivo
    // de gerarLinkDeAprovacao) — sem essa base, o backend não teria como
    // montar o link dos pontos.
    baseUrl: new URL(".", location.href).href,
  });

  btn.disabled = false;
  btn.textContent = original;

  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "Não consegui devolver a peça agora.", "erro");
    return;
  }

  // O aviso conta o que REALMENTE aconteceu, peça por peça. Um "pronto!"
  // genérico esconderia, por exemplo, uma subtarefa criada que não foi pra
  // Ajustes — e é ali que o designer procura refação.
  if (data.caminho === "projetoFechado") {
    const partes = [`Comentei no card mãe marcando ${data.designer || "o designer"}`];
    if (data.passou) partes.push("e passei o card pra ele");
    if (data.foiProAjustes) partes.push("na coluna Ajustes");
    mostrarToast(partes.join(" ") + ".", "sucesso");
  } else {
    const partes = [`${data.titulo} criada pro ${data.designer || "designer"}`];
    partes.push(data.foiProAjustes ? "em Ajustes, com entrega hoje às 18h" : "— mas não consegui mover pra Ajustes, confere lá");
    if (!data.alocou) partes.push("(sem conseguir alocar — precisa escolher o responsável na mão)");
    mostrarToast(partes.join(" ") + ".", data.foiProAjustes && data.alocou ? "sucesso" : "erro");
  }

  apvFila = apvFila.filter(i => !(String(i.taskId) === String(apvPecaAberta.taskId) && i.nomePeca === apvPecaAberta.peca.nomePeca));
  campo.value = "";
  apvPinsDevolucao = [];
  apvFecharDevolver();
  apvFecharConferencia();
  apvRenderFila(apvFila);
  atualizarBadgeAprovacao();
}

/**
 * Marcar pontos na imagem (opcional).
 *
 * x/y ficam em PORCENTAGEM da imagem, nunca em pixel: assim o ponto continua no
 * lugar certo em qualquer tamanho de tela. Mesmo formato que aprovar.html usa.
 *
 * No Runrun.it não existe marcação em imagem, então cada ponto vira uma linha
 * de texto no pedido ("(alto à esquerda) trocar o logo") — ver textoDosPins,
 * AprovacaoInterna.gs.
 */
function apvAlternarMarcacao() {
  if (!apvPecaAberta) return;
  const area = document.getElementById("apvMarcarArea");
  apvMarcando = !apvMarcando;
  area.hidden = !apvMarcando;
  if (!apvMarcando) return;

  const arquivo = apvPecaAberta.peca.versoes[apvVersaoNaTela - 1];
  if ((arquivo.mimeType || "").indexOf("video/") === 0) {
    area.innerHTML = `<p class="apv-campo-ajuda">Essa peça é um vídeo — dá pra escrever o minuto no texto acima, mas não dá pra marcar ponto na tela.</p>`;
    return;
  }

  const palco = document.getElementById("apvMarcarPalco");
  // Reaproveita a imagem que já está no palco da conferência, em vez de buscar
  // de novo no Drive: é o mesmo arquivo, e já está carregado.
  const imgAtual = document.querySelector("#apvPalcoSlot .apv-palco-img");
  palco.innerHTML = imgAtual
    ? `<img class="apv-marcar-img" src="${imgAtual.src}" alt="${escaparHTML(arquivo.nome)}">`
    : `<p class="apv-campo-ajuda">A peça ainda está carregando.</p>`;

  const img = palco.querySelector(".apv-marcar-img");
  if (img) {
    // Clicar cria o ponto JÁ com um campo de texto vazio embaixo, em vez de
    // abrir uma caixinha do navegador perguntando: é o que o desenho previu
    // (.apv-marcar-linha input, css/06-aprovacao.css), e deixa escrever,
    // reler e corrigir os vários pontos lado a lado antes de mandar.
    img.addEventListener("click", (e) => {
      const r = img.getBoundingClientRect();
      apvPinsDevolucao.push({
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
        texto: "",
      });
      apvRenderPinsDevolucao();
      const campos = document.querySelectorAll("#apvMarcarLista input");
      if (campos.length) campos[campos.length - 1].focus();
    });
  }
  apvRenderPinsDevolucao();
}

function apvRenderPinsDevolucao() {
  const palco = document.getElementById("apvMarcarPalco");
  palco.querySelectorAll(".apv-marca").forEach(el => el.remove());
  apvPinsDevolucao.forEach((p, i) => {
    const marca = document.createElement("span");
    marca.className = "apv-marca";
    marca.style.left = p.x + "%";
    marca.style.top = p.y + "%";
    marca.textContent = String(i + 1);
    palco.appendChild(marca);
  });

  const lista = document.getElementById("apvMarcarLista");
  lista.innerHTML = apvPinsDevolucao.length
    ? apvPinsDevolucao.map((p, i) => `
        <div class="apv-marcar-linha">
          <span class="apv-marcar-num">${i + 1}</span>
          <input type="text" data-apv-pin-txt="${i}" value="${escaparHTML(p.texto)}" placeholder="O que muda aqui?">
          <button type="button" class="apv-marcar-remover" data-apv-pin="${i}" aria-label="Tirar esse ponto">×</button>
        </div>`).join("")
    : `<p class="apv-campo-ajuda">Clica na peça pra apontar exatamente onde.</p>`;

  lista.querySelectorAll("[data-apv-pin-txt]").forEach(campo => {
    campo.addEventListener("input", () => {
      apvPinsDevolucao[Number(campo.dataset.apvPinTxt)].texto = campo.value;
    });
  });
  lista.querySelectorAll("[data-apv-pin]").forEach(btn => {
    btn.addEventListener("click", () => {
      apvPinsDevolucao.splice(Number(btn.dataset.apvPin), 1);
      apvRenderPinsDevolucao();
    });
  });
}

// ---------------------------------------------------------------------------
// Ligações de evento
// ---------------------------------------------------------------------------

/**
 * Liga todos os cliques fixos desta área.
 *
 * Os elementos daqui são criados UMA vez no index.html e nunca recriados, ao
 * contrário dos cards do quadro — então dá pra ligar tudo na carga. Os cards da
 * fila e os botões de versão são gerados por JS e religados a cada render.
 */
function apvLigarEventos() {
  const liga = (id, evento, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evento, fn);
  };

  liga("apvBtnAprovar", "click", apvClickAcao);
  liga("apvBtnDevolver", "click", apvAbrirDevolver);
  liga("apvVerVersaoNova", "click", () => apvIrParaVersao(apvPecaAberta ? apvPecaAberta.peca.versoes.length : 1));

  liga("apvConfirmaVer", "click", () => {
    document.getElementById("apvConfirmaFundo").hidden = true;
    apvIrParaVersao(apvPecaAberta ? apvPecaAberta.peca.versoes.length : 1);
  });
  liga("apvConfirmaSegue", "click", apvConfirmarAprovacao);

  liga("apvBtnPreview", "click", apvAoVerPreview);

  liga("apvFecharPainel", "click", apvFecharDevolver);
  liga("apvCancelarDevolver", "click", apvFecharDevolver);
  liga("apvConfirmarDevolver", "click", apvConfirmarDevolucao);
  liga("apvMarcarBtn", "click", apvAlternarMarcacao);

  // O erro do motivo some assim que a pessoa começa a digitar, não só quando
  // reenvia — cobrar de novo o que ela já está corrigindo é ruído.
  liga("apvMotivo", "input", () => {
    document.getElementById("apvErroMotivo").hidden = true;
    document.getElementById("apvMotivo").classList.remove("invalido");
  });

  liga("apvCopiarLinkMae", "click", async () => {
    const url = document.getElementById("apvLinkMaeUrl").textContent;
    try {
      await navigator.clipboard.writeText(url);
      mostrarToast("Link do card mãe copiado.", "sucesso");
    } catch (err) {
      mostrarToast("Não consegui copiar sozinho — o link está aí na tela.", "erro");
    }
  });

  // Clicar no fundo escuro fecha o painel, mas só quando o clique COMEÇOU no
  // fundo: sem isso, arrastar pra selecionar texto de dentro e soltar por fora
  // fechava o painel e apagava o que a pessoa escreveu.
  const overlayDevolver = document.getElementById("apvOverlayDevolver");
  if (overlayDevolver) {
    let comecouNoFundo = false;
    overlayDevolver.addEventListener("mousedown", (e) => { comecouNoFundo = e.target === overlayDevolver; });
    overlayDevolver.addEventListener("click", (e) => {
      if (e.target === overlayDevolver && comecouNoFundo) apvFecharDevolver();
    });
  }

  // Esc fecha o de CIMA primeiro, nunca os dois de uma vez. Em fase de captura,
  // mesmo padrão da paleta de comando e do visualizador de imagem: sem isso, o
  // Esc chegaria antes em outro dono de tecla da tela.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("apvConfirmaFundo")?.hidden) {
      document.getElementById("apvConfirmaFundo").hidden = true;
      e.stopPropagation();
    } else if (!document.getElementById("apvOverlayDevolver")?.hidden) {
      apvFecharDevolver();
      e.stopPropagation();
    } else if (document.getElementById("apvConferencia")?.classList.contains("visible")) {
      apvFecharConferencia();
      e.stopPropagation();
    }
  }, true);
}

apvLigarEventos();

// ---------------------------------------------------------------------------
// O outro lado: o DESIGNER pedindo a conferência
// ---------------------------------------------------------------------------

/**
 * Manda a peça do card pra fila do atendimento.
 *
 * É o ponto único por onde uma peça entra na fila — os dois caminhos do
 * front-end (a fala da Bee de upload e o botão no card) chamam esta função, pra
 * não existirem duas regras diferentes de "o que é mandar pra conferência".
 *
 * @param {object} task      a tarefa (do quadro)
 * @param {HTMLElement} btn  o botão clicado, pra mostrar o progresso nele mesmo
 * @param {string} nomePeca  opcional; sem isso vai a peça mexida por último
 */
async function pedirAprovacaoDoAtendimento(task, btn, nomesPecas) {
  if (!task || !task.id) return;

  // Ainda não sabe quais peças? Pergunta antes — mas só quando há mais de
  // uma na pasta. Com uma peça só, perguntar seria atrito à toa; é a mesma
  // regra que o link de aprovação do cliente já segue.
  if (!nomesPecas) return escolherPecasParaRevisao(task, btn);

  const original = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Mandando...";
  }

  const data = await chamarBackend({
    acao: "pedirConferenciaInterna",
    taskId: task.id,
    cliente: task.client,
    tituloTarefa: task.title,
    designer: task.assignee || DESIGNER_LOGADO,
    designerId: task.assigneeId || DESIGNER_ID_LOGADO || "",
    nomesPecas: Array.isArray(nomesPecas) ? nomesPecas : [nomesPecas],
  });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = original;
  }

  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "Não consegui mandar pra revisão agora.", "erro");
    return false;
  }

  // Qual peça o backend realmente mandou — pode ser diferente do que veio
  // no parâmetro (sem `nomePeca`, ele escolhe a mexida por último).
  const pecaEnviada = (data.pecas || [])[0];
  rascunharComentarioDeRevisao(task, data.pecas || []);

  // O botão passa a ser um atalho pra página de aprovação, na hora — sem
  // esperar reabrir o card. Guarda também na tarefa, pra sobreviver ao
  // pop-up ser redesenhado sozinho pela varredura do quadro.
  task._conferenciaInfo = { taskId: String(task.id), nomePeca: pecaEnviada || "" };
  if (btn) marcarBotaoComoJaEnviado(btn, task.id, pecaEnviada);

  const nomes = (data.pecas || []).join(", ");
  mostrarToast(`${nomes || "A peça"} foi pro atendimento conferir.`, "sucesso");
  return true;
}

/**
 * Pergunta QUAIS peças da pasta vão pra revisão.
 *
 * Um card costuma ter mais de uma peça de verdade (Feed e Stories são
 * coisas diferentes; "Feed - v1" e "Feed - v2" são a mesma). Mandando
 * sempre a mexida por último, a outra ficava pra trás sem ninguém saber —
 * era o que estava acontecendo.
 *
 * Reaproveita `abrirEscolhaDePeca` (js/detalhe-modal.js), o mesmo menu do
 * link de aprovação do cliente: todas marcadas por padrão, porque quem
 * terminou o trabalho quase sempre quer mandar tudo que subiu.
 *
 * O NOME DA PEÇA é o que vai pro backend, não o fileId: a fila guarda a
 * peça, e qual arquivo dela está valendo é lido do Drive na hora — é isso
 * que faz a tela perceber sozinha quando chega uma versão nova depois do
 * pedido.
 */
async function escolherPecasParaRevisao(task, btn) {
  const original = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Procurando peças...";
  }

  const data = await chamarBackend({ acao: "listarVersoesDasPecas", taskId: task.id });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = original;
  }

  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "Não consegui procurar a pasta do card agora.", "erro");
    return false;
  }

  const pecas = data.pecas || [];
  if (!pecas.length) {
    mostrarToast("Não encontrei nenhuma imagem ou vídeo na pasta do card pra mandar pra revisão.", "erro");
    return false;
  }
  if (pecas.length === 1) return pedirAprovacaoDoAtendimento(task, btn, [pecas[0].nomePeca]);

  abrirEscolhaDePeca(
    task, btn,
    // O menu mostra o ARQUIVO mais recente de cada peça (é o que a pessoa
    // reconhece), mas o que segue pro backend é o nome da peça.
    pecas.map(p => ({ nome: p.ultima.nome, mimeType: p.ultima.mimeType, nomePeca: p.nomePeca })),
    {
      titulo: "Quais peças vão pra revisão?",
      rotuloBotao: "Enviar para revisão",
      aoConfirmar: escolhidas => pedirAprovacaoDoAtendimento(task, btn, escolhidas.map(p => p.nomePeca)),
    }
  );
  return true;
}

/**
 * O botão do card sabe em que estado está: antes de mandar diz "Enviar
 * para revisão"; depois vira "Acessar página de aprovação" e leva direto
 * pra peça.
 *
 * É o mesmo comportamento que o botão da pasta do card já tinha ("Criar
 * pasta do card" → "Acessar pasta do card", ver verificarPastaJaSalva em
 * js/chat-comentarios.js) — e existe pelo mesmo motivo: um botão que não
 * muda depois de usado convida a clicar de novo sem querer, e quem clica
 * não tem como saber se já mandou ou não.
 *
 * Guarda o resultado na própria tarefa (`_conferenciaInfo`), então reabrir
 * o mesmo card não pergunta de novo. Falha de rede não vira "nunca foi
 * mandada": o botão só fica no texto de sempre e tenta na próxima abertura.
 */
async function verificarRevisaoJaEnviada(task, btn) {
  if (!task.id) return;
  const taskId = task.id;

  if (task._conferenciaInfo !== undefined) {
    if (task._conferenciaInfo) marcarBotaoComoJaEnviado(btn, task._conferenciaInfo.taskId, task._conferenciaInfo.nomePeca);
    return;
  }

  const data = await chamarBackend({
    acao: "buscarConferenciaDaTarefa",
    taskId,
    // A pasta do card (e portanto as peças) é a MESMA do card mãe e das
    // subtarefas dele. Sem mandar a família junto, mandar pela subtarefa e
    // abrir o card mãe mostrava "Enviar para revisão" de novo, como se
    // nada tivesse acontecido — foi o que o Cláudio viu.
    idsRelacionados: await idsDaFamiliaDaTarefa(task),
  });
  if (!data || !data.ok || caiuARede(data)) return;

  // Trocou de tarefa enquanto carregava? Compara por id, nunca por
  // referência (bug recorrente do CLAUDE.md), e busca o botão de novo.
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(taskId)) return;
  const btnAgora = document.getElementById("apvPedirBtn");
  if (!btnAgora) return;

  const c = data.conferencia;
  task._conferenciaInfo = c ? { taskId: c.taskId, nomePeca: c.nomePeca || "" } : null;
  if (c) marcarBotaoComoJaEnviado(btnAgora, c.taskId, c.nomePeca);
}

/**
 * Os ids do card mãe e das subtarefas em volta desta tarefa.
 *
 * Existe porque várias coisas do Colmeia são da FAMÍLIA e não da tarefa
 * solta — a pasta do card já era assim (buscarOuHerdarPastaCard), e a
 * conferência é igual: a peça é a mesma, esteja o card mãe ou a subtarefa
 * aberto na frente. Reaproveita o cache que já é preenchido quando uma
 * subtarefa abre (precarregarCardMaeEmBackground), então quase sempre não
 * custa nenhuma ida a mais ao servidor.
 */
async function idsDaFamiliaDaTarefa(task) {
  try {
    if (task.parentTaskId) {
      if (typeof cardMaeCache !== "undefined" && !cardMaeCache.has(task.id)
          && typeof precarregarCardMaeEmBackground === "function") {
        await precarregarCardMaeEmBackground(task.id);
      }
      const info = typeof cardMaeCache !== "undefined" ? cardMaeCache.get(task.id) : null;
      if (info && info.ok && info.temPai && info.cardMae) {
        return [info.cardMae.id, ...(info.subtarefas || []).map(s => s.id)]
          .filter(id => String(id) !== String(task.id));
      }
      return [];
    }
    // A própria tarefa É o card mãe (ver carregarFilhosSeForCardMae).
    if (Array.isArray(task.subtarefasResumo)) return task.subtarefasResumo.map(s => s.id);
  } catch (err) {
    // Não achar a família não é erro: o botão só deixa de reconhecer o
    // estado dos parentes, e continua funcionando pra própria tarefa.
  }
  return [];
}

function marcarBotaoComoJaEnviado(btn, taskId, nomePeca) {
  if (typeof roteadorLinkDaConferencia !== "function") return;
  btn.dataset.linkRevisao = roteadorLinkDaConferencia(taskId, nomePeca);
  const label = document.getElementById("apvPedirBtnLabel");
  if (label) label.textContent = "Acessar página de aprovação";
}

/**
 * Escreve no campo de comentário um texto com o LINK DA REVISÃO — e para
 * por aí. Nada sai sozinho pro Runrun.it (pedido do Cláudio): o designer
 * lê, ajusta se quiser, e clica em enviar. É o mesmo comportamento do
 * "Adicionar ao comentário" que a fala da Bee já tinha.
 *
 * POR QUE O COMENTÁRIO É NECESSÁRIO, e não só a fila: o atendimento
 * trabalha no RUNRUN.IT, não aqui. A fila da tela de conferência é a lista
 * de trabalho de quem confere, mas ninguém fica olhando ela sozinho — o
 * comentário na tarefa é o que avisa e traz a pessoa até cá. Os dois
 * existem, cada um fazendo uma coisa.
 *
 * O link aponta pra PEÇA, não pra fila (ver roteadorLinkDaConferencia,
 * js/roteador-url.js): quem clica cai direto no que precisa conferir, em
 * vez de ter que procurar de novo numa lista.
 *
 * Fica no rascunho pros DOIS pontos de entrada (a fala da Bee e o botão do
 * card), porque os dois passam por `pedirAprovacaoDoAtendimento` — é o
 * mesmo gesto, e faria pouco sentido um deles avisar o atendimento e o
 * outro não.
 */
function rascunharComentarioDeRevisao(task, pecas) {
  const campo = document.getElementById("commentInput");
  if (!campo || typeof roteadorLinkDaConferencia !== "function") return;

  const lista = Array.isArray(pecas) ? pecas.filter(Boolean) : [pecas].filter(Boolean);
  // O link abre a primeira peça; a fila mostra as outras logo ali do lado.
  // Um link por peça encheria o comentário de endereços quase iguais.
  const link = roteadorLinkDaConferencia(task.id, lista[0]);
  const nomes = lista.join(" e ");
  const texto = lista.length > 1
    ? `${nomes} estão prontas pra revisão: ${link}`
    : `${nomes || "A peça"} está pronta pra revisão: ${link}`;

  // Acrescenta em vez de apagar o que a pessoa já estava digitando —
  // mesmo cuidado de adicionarComentarioDeUpload.
  campo.value = campo.value.trim() ? `${campo.value.trim()} ${texto}` : texto;
  campo.focus();
  campo.setSelectionRange(campo.value.length, campo.value.length);
}
