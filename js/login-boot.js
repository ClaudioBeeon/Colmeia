function iniciarAppPosLogin() {
  // Liga o nome (e o e-mail, quando existe) a partir daqui — é o que faz
  // erro e replay do PostHog dizerem "foi a Laura", em vez de uma sessão
  // anônima qualquer. `person_profiles: 'identified_only'` no snippet do
  // index.html já evita perfil pra quem nem chegou a logar.
  if (typeof posthog !== "undefined") {
    try {
      posthog.identify(DESIGNER_LOGADO, typeof EMAIL_LOGADO !== "undefined" && EMAIL_LOGADO ? { email: EMAIL_LOGADO } : undefined);
    } catch (err) { /* PostHog fora do ar não pode travar o login */ }
  }

  document.getElementById("loginScreen").hidden = true;
  document.getElementById("page").hidden = false;

  document.getElementById("sidebarNomeUsuario").textContent = DESIGNER_LOGADO;
  // Começa nas iniciais e vira a foto assim que ela chegar — as fotos vêm
  // de carregarPessoasSalvas() e carregarDadosPainelBeeon(), logo abaixo,
  // e as duas chamam atualizarAvatarDaSidebar() quando terminam.
  document.getElementById("sidebarAvatarIniciais").textContent = initials(DESIGNER_LOGADO);
  atualizarAvatarDaSidebar();
  precarregarFotosConhecidas();
  document.getElementById("sidebarProfileLink").title = PAPEL_LOGADO === "coordenador" ? "Configurações" : DESIGNER_LOGADO;

  // Fila de repasse é só do Cláudio (ele que atende os clientes e
  // decide o que repassar) — os outros nem veem o ícone.
  const repasseNav = document.querySelector('.nav-ic[data-page="repasse"]');
  if (repasseNav) repasseNav.hidden = !souClaudio();

  // A conferência interna é de quem tem papel "atendimento" na planilha de
  // login — mais o Cláudio, que coordena e precisa poder cobrir/testar.
  // Designer não vê: ele MANDA pra conferência (pelo card ou pela fala da
  // Bee), não confere. O item nasce `hidden` no index.html de propósito,
  // então quem não se encaixa aqui simplesmente nunca vê a página.
  const podeConferir = PAPEL_LOGADO === "atendimento" || souClaudio();
  // ⚠️ O Cláudio pediu (2026-08-09) pra tirar este ícone do menu dele: a
  // MESMA fila de conferência já abre pelos grupos "Esperando você" e
  // "Prontas pra enviar" da Central do Atendimento (centralAbrirGrupo →
  // apvAbrirConferencia, a mesma tela) — não é uma perda de função, é um
  // caminho de entrada a menos pra decidir entre. Continua funcionando
  // por trás (a rota /aprovacoes e o papel "atendimento" seguem intactos)
  // — só o ÍCONE some especificamente pro Cláudio.
  const aprovacaoNav = document.querySelector('.nav-ic[data-page="aprovacao"]');
  if (aprovacaoNav) aprovacaoNav.hidden = !podeConferir || souClaudio();
  if (podeConferir && typeof atualizarBadgeAprovacao === "function") atualizarBadgeAprovacao();

  // A Central do Atendimento (2026-08-06) é uma área SEPARADA do resto do
  // Colmeia — ver o comentário grande em cima de #centralAtendimento no
  // index.html. O ícone pra abri-la (escondido por padrão) aparece pra quem
  // coordena (Cláudio, João Paulo, Lucas — ver souCoordenadorDoAtendimento);
  // quem tem papel "atendimento" comum nem precisa dele — cai direto lá
  // embaixo, sem ver o quadro/sidebar normal. ⚠️ Até 2026-08-12 isso só
  // olhava `souClaudio()`: João Paulo e Lucas já eram tratados como
  // coordenadores DENTRO da Central (o "vê tudo" do time), mas o ícone pra
  // abrir ela nem aparecia pros dois — pedido do Cláudio pra corrigir.
  const centralNav = document.getElementById("centralAtendimentoNavBtn");
  if (centralNav) centralNav.hidden = !souCoordenadorDoAtendimento();

  // Painel de Designers (2026-08-10) — mesma regra da Central acima, desde
  // 2026-08-12 (antes era só Cláudio). A Fila de repasse continua SÓ dele
  // de propósito (ver o comentário ali embaixo) — ele é quem atende os
  // clientes e decide o que repassar, papel diferente de "coordenar".
  // A aba "Vincular clientes" das Configurações do coordenador vem junto,
  // porque é o mesmo dado do mesmo painel.
  const painelDesignersNav = document.querySelector('.nav-ic[data-page="painel-designers"]');
  if (painelDesignersNav) painelDesignersNav.hidden = !souCoordenadorDoAtendimento();
  const configTabVinculos = document.getElementById("configTabVinculos");
  if (configTabVinculos) configTabVinculos.hidden = !souCoordenadorDoAtendimento();
  // ⚠️ Exceção (2026-08-12): se a rota é /coordenacao, quem abre a Central
  // é o roteador (roteadorAbrirRotaInicial, js/roteador-url.js — chamado
  // logo abaixo), não aqui. Sem essa exceção, /coordenacao abriria a
  // Central DUAS vezes seguidas pro João Paulo e pro Lucas (os dois têm
  // papel "atendimento", que sempre passaria por aqui primeiro) — inofensivo,
  // mas redundante. Em qualquer outra URL, o comportamento de sempre continua.
  const veioParaCoordenacao = typeof roteadorInterpretarRota === "function" && (() => {
    const rota = roteadorInterpretarRota();
    return rota.tipo === "pagina" && rota.pagina === "coordenacao";
  })();
  if (PAPEL_LOGADO === "atendimento" && !veioParaCoordenacao && typeof abrirCentralAtendimento === "function") {
    abrirCentralAtendimento();
  }

  // Desenha na hora a última foto do quadro guardada nesse navegador (ver
  // restaurarSnapshotDoQuadro, js/pessoas-fotos.js) — assim o quadro
  // aparece instantâneo em vez de esperar o Apps Script "acordar" com a
  // tela da abelhinha na frente. A abelhinha continua aparecendo no
  // primeiro acesso de cada navegador, quando não tem foto guardada ainda.
  // A versão de verdade chega logo depois, em carregarTarefasReais().
  restaurarSnapshotDoQuadro();
  buildBoard();
  render();
  // Abre a página/tarefa certa lendo o que estiver na barra de endereço
  // (ver js/roteador-url.js) — sem isso, sempre caía no quadro fixo,
  // mesmo quando a pessoa chegou por um link direto de tarefa.
  if (typeof roteadorAbrirRotaInicial === "function") roteadorAbrirRotaInicial();
  else mostrarPagina("kanban");
  carregarTarefasReais();
  // A foto de ontem (ou de um F5 recente) aparece ANTES do fetch de
  // verdade — é o que faz "Meus clientes" nunca abrir na tela de
  // "Carregando..." quando já se tem alguma coisa pra mostrar. Ver o
  // comentário grande em cima de carregarDadosPainelBeeon,
  // js/notificacoes-uploads.js.
  if (typeof restaurarSnapshotDoPainelBeeon === "function" && restaurarSnapshotDoPainelBeeon()) {
    buildClientsPage();
    buildAtendimentoPage();
    buildTiposPage();
  }
  carregarDadosPainelBeeon();
  carregarPessoasSalvas();
  carregarLinksClientes();
  carregarProgressoClientes();
  carregarClientesOcultos();
  // As decisões de "Ficar comigo" da Fila de repasse (aba RepasseIgnorados
  // da planilha). Antes isso vivia só no localStorage — e sumiu inteiro
  // quando o Colmeia mudou de endereço. Essa busca também SOBE o que
  // ainda estiver guardado só neste navegador, então quem tinha decisões
  // antigas não precisa clicar tudo de novo.
  carregarRepasseIgnoradosDoBackend();
  // Avisos e agenda agora só são buscados com alguém logado (antes ficavam
  // rodando até na tela de senha, à toa). As duas checagens periódicas
  // continuam ligadas nos arquivos delas — aqui é só pra fazer a PRIMEIRA
  // acontecer na hora que a pessoa entra, em vez de esperar o próximo
  // ciclo (até 5 min pros avisos, até 3 min pra agenda).
  atualizarBadgeAvisos();
  verificarReunioesProximas();
  // A bolinha da Bee no canto (a conversa livre, sem tarefa nenhuma).
  ligarJanelaDaBee();
  // Lista de pessoas do Runrun.it (usada pra reatribuir e pra "Adicionar
  // próxima pessoa" no modal "Ver regra") — pré-carregada aqui, em segundo
  // plano, já no login. Antes só era buscada na hora que alguém abria um
  // desses dois lugares pela primeira vez (usuariosRunrunCache ainda vazio,
  // ver js/regras-briefing.js), e aí aparecia "Carregando pessoas..." por
  // um instante. Buscando cedo, o cache já está pronto quando a pessoa
  // realmente precisa dele.
  buscarUsuariosRunrun();
  // Poda as marcações velhas guardadas no navegador (uploads dispensados e
  // chats lidos) — elas nunca eram limpas e só cresciam.
  limparLixoAntigoDoNavegador();
}

// Algumas coisas (Fila de Repasse, lançar Avisos) são só do Cláudio,
// não de qualquer coordenador — centraliza essa checagem aqui pra
// trocar fácil se um dia isso mudar.
function souClaudio() {
  return nomesCorrespondem(DESIGNER_LOGADO, "Claudio");
}

// Dentro do atendimento, João Paulo e Lucas TAMBÉM coordenam (pedido do
// Cláudio, 2026-08-06: "são coordenadores então eles podem ter a visão
// geral que eu tenho também") — mesmo entrando pelo código+nome como
// qualquer atendimento (PAPEL_LOGADO fica "atendimento" pros três, não
// tem um papel "coordenador do atendimento" separado na planilha), a
// Central trata os três igual pra fins de "ver tudo x ver só meu": os
// dois veem geral por padrão, com a opção de filtrar por uma pessoa
// específica (ver centralFiltroPessoa, js/central-atendimento.js). Os
// demais (Laura, Manu, Giovanna) continuam só com os próprios clientes.
function souCoordenadorDoAtendimento() {
  return souClaudio()
    || nomesCorrespondem(DESIGNER_LOGADO, "João Paulo")
    || nomesCorrespondem(DESIGNER_LOGADO, "Lucas");
}

// ===== Login e sessão =====
// Guarda {nome, papel} no navegador depois de logar, pra não pedir
// senha de novo toda vez que abrir o Colmeia nesse computador.
const SESSAO_CHAVE = "colmeia_sessao";

function lerSessaoSalva() {
  try {
    const bruto = localStorage.getItem(SESSAO_CHAVE);
    return bruto ? JSON.parse(bruto) : null;
  } catch (err) {
    return null;
  }
}

function salvarSessao(nome, papel, runrunId, email) {
  try {
    // Guarda também o ID no Runrun.it, pra "essa tarefa é minha?" continuar
    // sendo decidido por ID (e não por nome parecido) quando a pessoa
    // reabrir o Colmeia sem digitar a senha de novo. Ver ehMinhaTarefa.
    // E o e-mail (quando a entrada foi pelo Google), pra a foto e o nome do
    // perfil continuarem certos ao reabrir sem logar. Ver resolverPessoa.
    localStorage.setItem(SESSAO_CHAVE, JSON.stringify({
      nome, papel, runrunId: runrunId || null, email: email || "",
    }));
  } catch (err) {
    console.error("Não consegui salvar a sessão:", err);
  }
}

function sairDoColmeia() {
  try { localStorage.removeItem(SESSAO_CHAVE); } catch (err) { /* sem problema */ }
  location.reload();
}

document.getElementById("sidebarLogout").addEventListener("click", sairDoColmeia);

/**
 * Busca uma frase engraçada gerada pela IA baseada no dia/período de
 * agora, pra mostrar na tela de login. Já deixa uma frase padrão
 * escrita enquanto espera (a tela de login não pode ficar vazia).
 */
async function buscarFraseDoDia() {
  if (!COLMEIA_API_URL) return;
  try {
    const data = await chamarBackend({ acao: "gerarFraseDoDia" });
    if (data.ok && data.frase) {
      const el = document.getElementById("loginFrase");
      if (el) el.textContent = data.frase;
    }
  } catch (err) {
    console.error("Falha ao buscar a frase do dia:", err);
  }
}

document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const senha = document.getElementById("loginSenha").value;
  const btn = document.getElementById("loginSubmit");
  const erroEl = document.getElementById("loginErro");
  erroEl.hidden = true;

  if (!senha) return;
  btn.disabled = true;

  try {
    const data = await chamarBackend({ acao: "login", senha });
    btn.disabled = false;

    if (!data.ok) {
      erroEl.textContent = data.error || "Não consegui entrar.";
      erroEl.hidden = false;
      return;
    }

    DESIGNER_LOGADO = data.nome;
    PAPEL_LOGADO = data.papel;
    DESIGNER_ID_LOGADO = data.runrunId || null;
    salvarSessao(data.nome, data.papel, data.runrunId);
    iniciarAppPosLogin();
  } catch (err) {
    console.error("Falha ao tentar logar:", err);
    btn.disabled = false;
    erroEl.textContent = "Falha de conexão. Tente de novo.";
    erroEl.hidden = false;
  }
});

// ===== ENTRAR COM O GOOGLE (2026-08-10) =====
//
// É uma ADIÇÃO, não uma troca: a chave de acesso continua igual, e quem
// preferir seguir com ela não precisa mudar nada. O ganho é que este
// caminho identifica a PESSOA — a chave sozinha não faz isso (duas
// pessoas com a mesma chave entram uma como a outra, tanto que existe um
// diagnóstico no backend caçando chaves repetidas).
//
// O CRACHÁ NÃO É CONFERIDO AQUI. O navegador só recebe do Google e
// repassa; quem confere pra quem ele foi emitido é o backend
// (`loginComGoogle`, Planilha.gs). Conferir no navegador não valeria nada
// — qualquer um pode mandar o que quiser daqui.

function ligarEntrarComGoogle() {
  // Sem o identificador configurado, o bloco continua escondido: melhor
  // não ter botão do que ter um botão que não funciona.
  if (typeof GOOGLE_CLIENT_ID === "undefined" || !GOOGLE_CLIENT_ID) return;
  if (typeof google === "undefined" || !google.accounts || !google.accounts.id) return;

  const bloco = document.getElementById("loginGoogleBloco");
  const alvo = document.getElementById("loginGoogleBtn");
  if (!bloco || !alvo) return;

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: entrarComCredencialDoGoogle
  });
  google.accounts.id.renderButton(alvo, {
    theme: "filled_black", size: "large", shape: "pill",
    text: "signin_with", locale: "pt-BR", width: 260
  });
  bloco.hidden = false;
}

async function entrarComCredencialDoGoogle(resposta) {
  const erroEl = document.getElementById("loginErro");
  if (erroEl) erroEl.hidden = true;

  const data = await chamarBackend({
    acao: "loginComGoogle",
    credential: resposta && resposta.credential
  });

  if (!data || !data.ok) {
    if (erroEl) {
      // A mensagem do backend é específica de propósito ("o e-mail X não
      // está vinculado a ninguém") — repeti-la é o que diz pra pessoa o
      // que fazer, em vez de um "não deu" que não ajuda ninguém.
      erroEl.textContent = (data && data.error) || "Não consegui entrar com o Google.";
      erroEl.hidden = false;
    }
    return;
  }

  DESIGNER_LOGADO = data.nome;
  PAPEL_LOGADO = data.papel;
  DESIGNER_ID_LOGADO = data.runrunId || null;
  EMAIL_LOGADO = data.email || "";
  salvarSessao(data.nome, data.papel, data.runrunId, data.email);
  iniciarAppPosLogin();
}

// O script do Google carrega sozinho (async, no index.html) e pode chegar
// antes ou depois deste arquivo — daí tentar nos dois momentos.
window.addEventListener("load", ligarEntrarComGoogle);
ligarEntrarComGoogle();

// ===== A entrada do ATENDIMENTO =====
//
// Elas não têm conta no Colmeia: chegam por um link de conferência colado
// num comentário do Runrun.it, muitas vezes noutro navegador ou numa aba
// anônima. Antes disso, batiam numa tela de senha que nunca ia funcionar
// pra elas — o link simplesmente não servia pra quem ele foi feito.
//
// Dois passos, cada um resolvendo uma coisa: o CÓDIGO (um só, do time
// inteiro) mantém a tela fechada pra quem só esbarrou no endereço; o NOME
// resolve a identidade. Sem o nome, o pedido de alteração sairia no
// Runrun.it na conta errada, que é justamente o que os tokens por pessoa
// acabaram de corrigir.
//
// Isso NÃO afrouxa o app: a senha do Colmeia sempre protegeu só a tela —
// nenhuma ação do backend confere sessão nenhuma. Os designers continuam
// entrando com a chave de acesso de sempre; só quem cai num link de
// conferência sem sessão vê esta tela.

/** A URL de entrada é um link de conferência (ou a fila de aprovações)? */
function chegouPorLinkDeConferencia() {
  if (typeof roteadorInterpretarRota !== "function") return false;
  const rota = roteadorInterpretarRota();
  return rota.tipo === "conferencia" || (rota.tipo === "pagina" && rota.pagina === "aprovacao");
}

// Link por pessoa (colmeia.beeon.com.br/Laura, ver js/roteador-url.js) —
// guarda o nome-alvo pra, depois do código validado, pular direto pra essa
// pessoa em vez de mostrar a lista "quem é você?" (ver o fim do handler de
// atdCodigoForm, mais abaixo).
let centralNomeAlvoDoLink = null;
function chegouPorLinkDePessoa() {
  if (typeof roteadorInterpretarRota !== "function") return null;
  const rota = roteadorInterpretarRota();
  return rota.tipo === "pessoa" ? rota.nome : null;
}

/** O mesmo passo de sempre (escolher quem é você) — extraído pra poder
 *  ser chamado tanto pelo clique no nome quanto pelo link direto/pessoa. */
function entrarComoAtendimento(nome) {
  DESIGNER_LOGADO = nome;
  PAPEL_LOGADO = "atendimento";
  // O atendimento não tem quadro, então não tem id de responsável no
  // Runrun.it — `ehMinhaTarefa` cai na comparação por nome, que é o
  // caminho de reserva que já existe. Não faz diferença aqui: elas não
  // têm tarefas próprias no quadro.
  DESIGNER_ID_LOGADO = null;
  salvarSessao(nome, "atendimento", null);
  iniciarAppPosLogin();
}

function mostrarEntradaDoAtendimento(mostrar) {
  document.getElementById("loginForm").hidden = mostrar;
  document.getElementById("loginAtendimento").hidden = !mostrar;
  document.getElementById("loginErro").hidden = true;
  const troca = document.getElementById("loginTrocaModo");
  troca.hidden = false;
  troca.textContent = mostrar ? "Sou do time de design" : "Sou do atendimento";
  (mostrar ? document.getElementById("atdCodigo") : document.getElementById("loginSenha")).focus();
}

document.getElementById("loginTrocaModo").addEventListener("click", () => {
  mostrarEntradaDoAtendimento(document.getElementById("loginAtendimento").hidden);
});

document.getElementById("atdCodigoForm").addEventListener("submit", async e => {
  e.preventDefault();
  const codigo = document.getElementById("atdCodigo").value;
  const btn = document.getElementById("atdCodigoBtn");
  const erroEl = document.getElementById("loginErro");
  erroEl.hidden = true;
  if (!codigo) return;
  btn.disabled = true;

  const data = await chamarBackend({ acao: "entrarComoAtendimento", codigo });
  btn.disabled = false;

  if (!data || !data.ok) {
    erroEl.textContent = caiuARede(data)
      ? "Sem conexão com o servidor. Tenta de novo em instantes."
      : (data.error || "Não consegui entrar.");
    erroEl.hidden = false;
    return;
  }

  // Veio de um link por pessoa (colmeia.beeon.com.br/Laura) E o nome bate
  // com alguém da lista de verdade? Pula a pergunta "quem é você" — é
  // exatamente o que esse link promete. `nomesCorrespondem` (não
  // igualdade exata) porque "joao-paulo" na URL vira "João Paulo" com
  // acento, mas ainda assim tem que bater sem exigir digitar acento certo
  // em lugar nenhum.
  const alvo = centralNomeAlvoDoLink;
  const pessoaBatendo = alvo && (data.pessoas || []).find(nome => nomesCorrespondem(nome, alvo));
  if (pessoaBatendo) {
    entrarComoAtendimento(pessoaBatendo);
    return;
  }

  // Passo 2: quem é você. O código sai da tela — já cumpriu o papel, e
  // deixá-lo ali sugeriria que ainda falta alguma coisa nele.
  document.getElementById("atdCodigoForm").hidden = true;
  const quem = document.getElementById("atdQuem");
  document.getElementById("atdQuemLista").innerHTML = (data.pessoas || []).map(nome => `
    <button type="button" class="atd-pessoa" data-atd-nome="${escaparHTML(nome)}">
      ${avatarAtendimentoHTML(nome, "avatar-sm")}
      <span>${escaparHTML(nome)}</span>
    </button>
  `).join("");
  quem.hidden = false;

  quem.querySelectorAll("[data-atd-nome]").forEach(btn2 => {
    btn2.addEventListener("click", () => entrarComoAtendimento(btn2.dataset.atdNome));
  });
});

// Se já tiver uma sessão salva nesse navegador, entra direto sem pedir
// senha de novo.
const sessaoSalva = lerSessaoSalva();
if (sessaoSalva && sessaoSalva.nome && sessaoSalva.papel) {
  DESIGNER_LOGADO = sessaoSalva.nome;
  PAPEL_LOGADO = sessaoSalva.papel;
  // Sessão salva antes dessa mudança não tem o id — aí ehMinhaTarefa volta
  // a comparar por nome, como antes, até a pessoa logar de novo. Mesma
  // coisa pro e-mail: sem ele, o perfil é achado pelo nome, como sempre foi.
  DESIGNER_ID_LOGADO = sessaoSalva.runrunId || null;
  EMAIL_LOGADO = sessaoSalva.email || "";
  iniciarAppPosLogin();
} else {
  buscarFraseDoDia();
  centralNomeAlvoDoLink = chegouPorLinkDePessoa();
  // Chegou por um link de conferência, ou um link por pessoa
  // (colmeia.beeon.com.br/Laura), sem sessão salva? É quase sempre o
  // atendimento — abre já na entrada delas, em vez da senha que elas não
  // têm. Quem for do design troca no botão logo abaixo. O código ainda é
  // pedido normalmente (é o que protege o link de ser usado por qualquer
  // um) — só o passo "quem é você" depois dele é que some, direto pro
  // nome do link (ver o fim do handler de atdCodigoForm).
  if (chegouPorLinkDeConferencia() || centralNomeAlvoDoLink) mostrarEntradaDoAtendimento(true);
}
// Senão, a tela de login (já visível por padrão no HTML) fica esperando
// o formulário ser enviado — o resto acontece no listener do submit acima.
