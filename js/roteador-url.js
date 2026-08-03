/**
 * ===================================================================
 * O ROTEADOR DE URL — links diretos pra tarefa e pra página
 * ===================================================================
 *
 * Faz o endereço lá em cima do navegador virar algo útil:
 *   .../11503              → a tarefa de ID 11503, aberta
 *   .../minhas-horas       → a página "Minhas horas"
 *   .../ (sem nada depois) → o quadro (kanban), a página inicial
 *
 * Isso permite: mandar o link de uma tarefa pra alguém (abre direto
 * nela), apertar F5 sem perder o lugar, e o botão Voltar/Avançar do
 * navegador funcionando de verdade dentro do app.
 *
 * COMO FUNCIONA SEM SERVIDOR (o Colmeia é só arquivo estático no
 * GitHub Pages): a navegação DENTRO do app (clicar num card, trocar de
 * página) usa `history.pushState` — só troca o que aparece na barra de
 * endereço, sem recarregar nada, então nunca passa perto do GitHub.
 * O caso chato é o link sendo aberto DE FORA (colado, favoritos) ou um
 * F5: aí o GitHub Pages recebe um pedido por um arquivo chamado
 * "11503" que não existe, cai no 404.html da raiz do repositório, e
 * esse arquivo devolve a pessoa pra cá com uma "encomenda" dizendo qual
 * era o endereço de verdade — `restaurarRotaPendente` mais abaixo lê
 * essa encomenda antes de qualquer outra coisa.
 *
 * BASE SEM CHUTE: `ROTA_BASE` usa `new URL(".", location.href)` em vez
 * de escrever "/Colmeia/" na mão — assim continua certo tanto na URL
 * de hoje (github.io/Colmeia/...) quanto na de amanhã
 * (colmeia.beeon.com.br/...), sem precisar mexer neste arquivo quando
 * o domínio virar realidade.
 *
 * A TRAVA `roteadorReagindoAoHistorico`: existem dois momentos em que o
 * app precisa se ATUALIZAR a partir da URL, em vez de ATUALIZAR a URL a
 * partir do que a pessoa clicou — o carregamento inicial (link colado,
 * F5) e o botão Voltar/Avançar. Nos dois, a URL certa já está lá; se
 * `mostrarPagina`/`openDetail`/`closeDetail` tentassem mexer nela de
 * novo por cima (através dos ganchos abaixo), o passo de reconciliação
 * ("mostra o quadro por baixo, depois abre a tarefa") escreveria uma
 * URL errada no meio do caminho. A trava desliga os ganchos só durante
 * esses dois momentos.
 *
 * SEM DUPLICAR ENTRADA NO HISTÓRICO: toda troca de URL feita por um
 * clique de verdade passa por `roteadorIrPara`, que só empilha
 * (`pushState`) se o endereço for DIFERENTE do atual. Sem essa
 * checagem, reabrir a mesma página (ex: clicar num aviso que já leva
 * pro quadro, estando já no quadro) empilharia uma entrada idêntica, e
 * o botão Voltar pareceria não fazer nada na primeira vez que a pessoa
 * clicasse nele.
 *
 * CUIDADO AO MEXER: assim como js/paleta-comando.js, este arquivo é
 * carregado quase por último (só antes do login-boot.js) porque usa
 * função de quase todo mundo — mostrarPagina, openDetail, closeDetail,
 * abrirTarefaPorId, tasks/tasksTodas.
 */

// A "pasta" onde o próprio index.html está publicado — ver explicação
// no topo do arquivo. Calculado uma vez só, no carregamento da página.
const ROTA_BASE = new URL(".", location.href).pathname;

// De qual página vem cada "nome bonito" na URL, e vice-versa. Só as
// páginas que fazem sentido linkar diretamente entram aqui — o quadro
// (kanban) é o padrão, então não precisa de nome nenhum na URL.
const ROTEADOR_SLUGS = {
  clientes: "meus-clientes",
  atendimento: "clientes-por-atendimento",
  tipos: "tipos-de-tarefas",
  runrun: "runrun-completo",
  horas: "minhas-horas",
  repasse: "fila-de-repasse",
};
const ROTEADOR_SLUGS_INVERSO = Object.fromEntries(
  Object.entries(ROTEADOR_SLUGS).map(([pagina, slug]) => [slug, pagina])
);

// Ver explicação da trava no topo do arquivo.
let roteadorReagindoAoHistorico = false;

/**
 * Se tinha uma "encomenda" deixada pelo 404.html (link colado, F5,
 * etc.), conserta a URL visível JÁ, antes até da tela de login — assim
 * some o pulo pelo 404.html/index.html. A parte de verdade (abrir a
 * tarefa/página) só acontece depois do login, em
 * `roteadorAbrirRotaInicial`, que lê essa mesma URL já consertada.
 */
(function restaurarRotaPendente() {
  let encomenda = null;
  try {
    encomenda = sessionStorage.getItem("colmeiaRotaPendente");
    sessionStorage.removeItem("colmeiaRotaPendente");
  } catch (e) {
    // Sem sessionStorage, segue sem restaurar nada — cai na tela normal.
  }
  if (encomenda) {
    try { history.replaceState(null, "", encomenda); } catch (e) { /* navegador antigo, sem problema */ }
  }
})();

/** O que sobra da URL depois de tirar a base e as barras das pontas. */
function roteadorCaminhoAtual() {
  let caminho = location.pathname;
  if (caminho.startsWith(ROTA_BASE)) caminho = caminho.slice(ROTA_BASE.length);
  return caminho.replace(/^\/+|\/+$/g, "");
}

/**
 * Lê a URL atual e devolve o que ela quer dizer:
 *   { tipo: "tarefa", id: "11503" }
 *   { tipo: "pagina", pagina: "horas" }
 *   { tipo: "kanban" }               — vazio, ou uma URL que não bate
 *                                      com nada conhecido (nunca dá erro
 *                                      feio, só cai no quadro).
 */
function roteadorInterpretarRota() {
  const caminho = roteadorCaminhoAtual();
  if (!caminho) return { tipo: "kanban" };
  if (/^\d+$/.test(caminho)) return { tipo: "tarefa", id: caminho };
  const pagina = ROTEADOR_SLUGS_INVERSO[caminho];
  if (pagina) return { tipo: "pagina", pagina };
  return { tipo: "kanban" };
}

/**
 * Empilha uma URL nova no histórico — mas só se ela for diferente da
 * atual. `estadoExtra` entra junto no `history.state` (ver
 * `roteadorAoAbrirTarefa`, que grava ali "pra onde fechar deve voltar").
 */
function roteadorIrPara(url, estadoExtra) {
  if (roteadorReagindoAoHistorico) return;
  if (location.pathname === url) return;
  try { history.pushState({ colmeiaRota: true, ...estadoExtra }, "", url); } catch (e) { /* sem problema */ }
}

/**
 * Devolve a URL pra página que está por baixo, SEM empilhar uma
 * entrada nova (`replaceState`) — usada só quando NÃO dá pra "desfazer"
 * a abertura da tarefa com um passo de Voltar de verdade (ver
 * `roteadorAoFecharTarefa`, que decide qual dos dois usar).
 */
function roteadorSubstituirPelaPaginaAtual() {
  if (roteadorReagindoAoHistorico) return;
  const pagina = roteadorPaginaVisivelNoDOM();
  const slug = ROTEADOR_SLUGS[pagina];
  const url = slug ? ROTA_BASE + slug : ROTA_BASE;
  if (location.pathname === url) return;
  try { history.replaceState({ colmeiaRota: true }, "", url); } catch (e) { /* sem problema */ }
}

/** Qual `.app-page` está visível agora — fonte da verdade, sem guardar estado à parte. */
function roteadorPaginaVisivelNoDOM() {
  const ativa = document.querySelector(".app-page:not([hidden])");
  return ativa ? ativa.id.replace(/^page-/, "") : "kanban";
}

/**
 * Espera o painel #taskDetail existir de verdade no DOM — ele só é
 * criado dentro de buildBoard() (js/kanban-board.js) quando
 * `carregandoTarefas` vira false. Ver o comentário em
 * roteadorAbrirRotaInicial pra entender por que isso é preciso.
 */
function roteadorEsperarPainelPronto() {
  if (document.getElementById("taskDetail")) return Promise.resolve();
  return new Promise(resolve => {
    const intervalo = setInterval(() => {
      if (document.getElementById("taskDetail")) {
        clearInterval(intervalo);
        resolve();
      }
    }, 50);
  });
}

// ===== Os três ganchos, chamados de dentro de mostrarPagina/openDetail/closeDetail =====

/** Chamado no fim de mostrarPagina (js/pagina-repasse.js). */
function roteadorAoMostrarPagina(pagina) {
  const slug = ROTEADOR_SLUGS[pagina];
  roteadorIrPara(slug ? ROTA_BASE + slug : ROTA_BASE);
}

/** Chamado no fim de openDetail (js/detalhe-modal.js). */
function roteadorAoAbrirTarefa(tarefa) {
  if (!tarefa || tarefa.id === undefined || tarefa.id === null) return;
  // Guarda a URL de onde a pessoa estava ANTES de abrir esta tarefa —
  // é o que `roteadorAoFecharTarefa` usa pra saber que dá pra "desfazer"
  // esse passo com um Voltar de verdade, em vez de escrever uma URL nova
  // que pode ficar idêntica à entrada anterior (ver comentário lá).
  roteadorIrPara(ROTA_BASE + tarefa.id, { colmeiaVoltarPara: location.pathname });
}

/**
 * Chamado no fim de closeDetail (js/detalhe-modal.js).
 *
 * Se ESTA entrada de histórico foi empilhada por nós ao abrir a tarefa
 * (tem `colmeiaVoltarPara` no state — ver `roteadorAoAbrirTarefa`),
 * fechar é o mesmo que apertar Voltar uma vez: `history.back()` desfaz
 * exatamente esse passo, sem criar nem substituir nada. Fazer isso com
 * `replaceState` em vez de `back()` tem um problema sutil: se a página
 * de baixo (ex: "/minhas-horas") já era a entrada ANTERIOR no histórico
 * (o caso comum — abriu a tarefa de dentro dessa página), substituir
 * cria uma SEGUNDA entrada idêntica logo depois da primeira, e o botão
 * Voltar parece "não fazer nada" da primeira vez que a pessoa aperta.
 *
 * Só cai no `replaceState` (via `roteadorSubstituirPelaPaginaAtual`)
 * quando a tarefa foi aberta por um link direto (chegou já nela, sem
 * nenhuma página "de baixo" nesta aba pra voltar com segurança).
 */
function roteadorAoFecharTarefa() {
  const estado = history.state;
  if (estado && typeof estado.colmeiaVoltarPara === "string") {
    if (!roteadorReagindoAoHistorico) history.back();
    return;
  }
  roteadorSubstituirPelaPaginaAtual();
}

/**
 * Lê a URL de entrada (já sem a "encomenda" do 404.html, se tinha uma)
 * e abre a tarefa/página certa. Chamado UMA VEZ, em iniciarAppPosLogin
 * (js/login-boot.js), no lugar do antigo `mostrarPagina("kanban")` fixo.
 *
 * Roda com a trava ligada: os passos daqui (mostrar o quadro de fundo,
 * abrir a tarefa por cima) não podem escrever por cima da URL que já
 * está certa — ela é a ENTRADA desta função, não uma consequência dela.
 */
async function roteadorAbrirRotaInicial() {
  const rota = roteadorInterpretarRota();
  roteadorReagindoAoHistorico = true;
  try {
    if (rota.tipo === "tarefa") {
      // O quadro entra como pano de fundo (mesmo comportamento de
      // sempre) e a tarefa abre por cima dele. `abrirTarefaPorId` já
      // sabe buscar a tarefa avulsa no Runrun.it quando ela ainda não
      // está carregada — que é sempre o caso aqui, recém logado.
      mostrarPagina("kanban");
      // O painel #taskDetail é criado dentro de buildBoard() (ver
      // js/kanban-board.js) — mas SÓ depois que `carregandoTarefas`
      // vira false, o que só acontece quando o quadro de verdade chega
      // (snapshot salvo neste navegador, ou a resposta de
      // carregarTarefasReais() logo depois desta função). Num link
      // aberto pela PRIMEIRA vez num navegador (sem nenhum snapshot —
      // exatamente o caso de alguém clicando o link de uma tarefa que
      // mandaram pra ela), esse painel ainda não existe no instante em
      // que chegamos aqui. Espera ele existir antes de continuar, ou
      // `abrirTarefaPorId` tentaria desenhar dentro de um painel que
      // ainda não foi criado.
      await roteadorEsperarPainelPronto();
      await abrirTarefaPorId(rota.id);
    } else if (rota.tipo === "pagina") {
      mostrarPagina(rota.pagina);
    } else {
      mostrarPagina("kanban");
    }
  } finally {
    roteadorReagindoAoHistorico = false;
  }
}

/**
 * Botão Voltar/Avançar do navegador. Roda com a mesma trava: a URL já
 * mudou (o navegador que trocou), então só espelha isso no app, sem
 * empilhar nem substituir nada de novo.
 */
window.addEventListener("popstate", async () => {
  const rota = roteadorInterpretarRota();
  roteadorReagindoAoHistorico = true;
  try {
    const painelAberto = document.getElementById("taskDetail").classList.contains("open");
    if (rota.tipo === "tarefa") {
      await abrirTarefaPorId(rota.id);
    } else {
      if (painelAberto) closeDetail();
      mostrarPagina(rota.tipo === "pagina" ? rota.pagina : "kanban");
    }
  } finally {
    roteadorReagindoAoHistorico = false;
  }
});
