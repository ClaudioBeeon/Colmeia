function fotoDoDesigner(nomeDesigner) {
  if (!painelBeeonData || !painelBeeonData.photos) return null;
  const chave = Object.keys(painelBeeonData.photos).find(d => nomesCorrespondem(d, nomeDesigner));
  return chave ? painelBeeonData.photos[chave] : null;
}

// Fotos de quem faz o atendimento dos clientes. No painel-designers-beeon
// essa lista é fixa dentro do próprio código (não vem do backend), então
// copiei ela de lá — se alguém novo entrar no atendimento ou uma foto
// mudar, é só atualizar aqui também.
const ATENDIMENTO_PHOTOS_BEEON = {
  "Manu": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833487/Firefly_gpt-image_Transforme_essa_pessoa_em_um_emoji_do_IOS_em_um_fundo_amarelo_claro_mantendo_as_mes_372247_biwncc.png",
  "Laura": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833986/Firefly_gpt-image_Altere_o_fundo_para_roxo_bem_claro_22904_s2j7cx.png",
  "Giovanna": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833487/Firefly_gpt-image_Transforme_essa_pessoa_em_um_emoji_do_IOS_em_um_fundo_azul_claro_mantendo_as_mesmas_372247_1_eroaek.png",
  "João Teles": "https://link-da-foto-do-joao.jpg",
  "Lucas": "https://res.cloudinary.com/dzqsqxrkw/image/upload/v1784833905/Firefly_gpt-image_Transforme_essa_pessoa_em_um_emoji_do_IOS_em_um_fundo_laranja_bem_claro_mantendo_as_372247_sdfav1.png",
};

// Pessoas cadastradas manualmente pelo coordenador (foto customizada,
// apelidos e e-mails vinculados), carregadas do backend do Colmeia.
let pessoasSalvas = []; // [{nome, foto, aliases: [...], discord, emails: [...]}]

// Todo nome que o código encontra e mostra um avatar, guardado aqui pra
// alimentar a tela de configuração de Pessoas. Chave = nome normalizado.
const nomesVistos = new Map(); // nomeNormalizado -> { nomeOriginal, fotoAtual }

function registrarNomeVisto(nome, foto) {
  if (!nome) return;
  const chave = normalizarParaComparar(nome);
  if (!chave) return;
  const existente = nomesVistos.get(chave);
  nomesVistos.set(chave, {
    nomeOriginal: nome,
    fotoAtual: foto || (existente ? existente.fotoAtual : null),
  });
}

// =====================================================================
// QUEM É ESTA PESSOA? — a única resposta do Colmeia (2026-08-11)
//
// O mesmo ser humano chega até aqui por três portas diferentes, e cada
// uma escreve o nome dele do seu jeito: a aba Login (quem entra, com o
// e-mail do Google), o Runrun.it (quem executa a tarefa) e a aba Pessoas
// (a foto e os apelidos que o coordenador cadastrou).
//
// Antes, cada canto do app resolvia isso por conta própria — e resolvia
// diferente. `resolverFotoManual` olhava apelidos, `getDiscordDaPessoa`
// não olhava, `fotoDoDesigner` comparava nome puro. O resultado prático
// era a foto cadastrada aparecer num lugar e sumir no outro, sem padrão
// nenhum que desse pra explicar.
//
// Agora existe uma pergunta só, feita num lugar só: você entrega a pista
// que tiver em mãos — nome, apelido, e-mail ou id do Runrun.it — e sempre
// volta a MESMA pessoa.
//
// A ordem importa e vai da certeza pro palpite:
//   1. e-mail        — não erra: e-mail é de uma pessoa só
//   2. nome/apelido igual — o cadastro explícito do coordenador
//   3. nome parecido — o `nomesCorrespondem` de sempre, o último recurso
// =====================================================================

/**
 * Acha o perfil cadastrado de alguém a partir de qualquer pista.
 *
 * @param {string|{nome?:string, email?:string, runrunId?:(string|number)}} pista
 * @returns {{nome, foto, aliases, discord, emails}|null}
 */
function resolverPessoa(pista) {
  if (!pista) return null;
  const dados = typeof pista === "string" ? { nome: pista } : pista;

  // O id do Runrun.it não fica guardado no perfil — o que liga os dois é o
  // e-mail. A lista de usuários já veio com ele (ver listarTodosUsuariosRunrun).
  let email = (dados.email || "").toLowerCase().trim();
  if (!email && dados.runrunId && typeof usuariosRunrunCache !== "undefined" && usuariosRunrunCache) {
    const u = usuariosRunrunCache.find(x => String(x.id) === String(dados.runrunId));
    if (u && u.email) email = String(u.email).toLowerCase().trim();
  }

  if (email) {
    const porEmail = pessoasSalvas.find(p => (p.emails || []).includes(email));
    if (porEmail) return porEmail;
  }

  const alvo = normalizarParaComparar(dados.nome);
  if (!alvo) return null;

  const exata = pessoasSalvas.find(p =>
    normalizarParaComparar(p.nome) === alvo
    || (p.aliases || []).some(a => normalizarParaComparar(a) === alvo));
  if (exata) return exata;

  // Último recurso: "Manu" batendo com "Manuela". É o que já valia antes
  // em quase todo lugar — fica por último de propósito, porque é o único
  // passo daqui que pode errar.
  return pessoasSalvas.find(p =>
    nomesCorrespondem(p.nome, dados.nome)
    || (p.aliases || []).some(a => nomesCorrespondem(a, dados.nome))) || null;
}

/**
 * O nome que o Colmeia deve MOSTRAR pra essa pessoa — o cadastrado no
 * perfil dela, não o que veio da fonte da vez. Sem isso a mesma pessoa
 * aparece "Maria Eduarda" no card (nome do Runrun.it), "Manu" no
 * comentário (apelido) e "Manuela" na sidebar (nome do login).
 *
 * Sem perfil cadastrado, devolve o nome que chegou — ou seja, quem ainda
 * não foi cadastrado continua aparecendo exatamente como antes.
 */
function nomeOficialDe(pista) {
  const p = resolverPessoa(pista);
  if (p) return p.nome;
  return typeof pista === "string" ? pista : (pista && pista.nome) || "";
}

/**
 * Confere se o coordenador já cadastrou manualmente uma foto pra essa
 * pessoa. Tem prioridade sobre qualquer outra fonte.
 */
function resolverFotoManual(pista) {
  const p = resolverPessoa(pista);
  return (p && p.foto) || null;
}

async function carregarPessoasSalvas() {
  if (!COLMEIA_API_URL) return;
  try {
    const data = await chamarBackend({ acao: "listarPessoas" });
    if (data.ok) {
      pessoasSalvas = data.pessoas || [];
      // É aqui que as fotos cadastradas chegam — sem isso a bolinha da
      // barra lateral ficaria nas iniciais pra sempre, porque ela é
      // desenhada no login, antes desta busca terminar.
      atualizarAvatarDaSidebar();
      precarregarFotosConhecidas();
    }
  } catch (err) {
    console.error("Falha ao carregar pessoas salvas:", err);
  }
}

/**
 * Põe a foto de quem está logado na bolinha da barra lateral (embaixo, o
 * atalho de Configurações). Antes ali era só um círculo azul com as
 * iniciais, mesmo com a pessoa tendo foto cadastrada.
 *
 * A foto é a MESMA que aparece nos cards e comentários — sai de
 * resolverFotoManual (a cadastrada no painel de Pessoas) ou de
 * fotoDoDesigner (a do painel-designers-beeon). Não tem foto nova pra
 * cadastrar em lugar nenhum: é a que já está lá.
 *
 * Pode ser chamada quantas vezes for preciso. Ela é chamada de novo
 * sempre que uma dessas duas fontes termina de carregar (as duas chegam
 * DEPOIS do login) e sempre que o coordenador troca uma foto.
 */
function atualizarAvatarDaSidebar() {
  const el = document.getElementById("sidebarAvatarIniciais");
  if (!el || !DESIGNER_LOGADO) return;

  // Quem está logado é a pessoa que o Colmeia conhece melhor: quando a
  // entrada foi pelo Google, temos o e-mail dela — e aí a identificação
  // não depende do nome do login estar escrito igual ao do perfil.
  const quem = { nome: DESIGNER_LOGADO, email: typeof EMAIL_LOGADO !== "undefined" ? EMAIL_LOGADO : "" };

  // O nome mostrado é o do perfil, não o da linha de acesso — é o mesmo
  // que aparece nos cards e comentários, então a pessoa se vê escrita do
  // mesmo jeito no app inteiro. Só muda quando existe perfil cadastrado;
  // sem perfil, continua o nome do login, como sempre foi.
  const nomeEl = document.getElementById("sidebarNomeUsuario");
  if (nomeEl) nomeEl.textContent = nomeOficialDe(quem);

  const foto = resolverFotoManual(quem) || fotoDoDesigner(DESIGNER_LOGADO);
  if (!foto) {
    // Sem foto cadastrada: volta pro círculo com as iniciais.
    el.style.backgroundImage = "";
    el.classList.remove("com-foto");
    el.textContent = initials(nomeOficialDe(quem));
    return;
  }

  // Só troca se mudou — sem isso, cada chamada remontaria a imagem e ela
  // piscaria à toa.
  if (el.dataset.foto === foto) return;

  // Confere que a foto carrega ANTES de mostrar. Se o link estiver
  // quebrado, um background-image simplesmente não aparece e sobraria uma
  // bolinha vazia, pior que as iniciais.
  const teste = new Image();
  teste.onload = () => {
    el.dataset.foto = foto;
    el.textContent = "";
    el.classList.add("com-foto");
    el.style.backgroundImage = `url("${foto}")`;
  };
  teste.onerror = () => {
    el.style.backgroundImage = "";
    el.classList.remove("com-foto");
    el.textContent = initials(nomeOficialDe(quem));
  };
  teste.src = foto;
}

const _fotosJaPrecarregadas = new Set();

/**
 * Precarrega no navegador as fotos conhecidas da equipe (designers,
 * atendimento, gente cadastrada manualmente, e quem aparece na lista de
 * "adicionar pessoa" da regra) — pedido do Cláudio (2026-08-04): a foto
 * de quem entra numa Sequência de responsáveis (ou pra quem a tarefa é
 * transferida) demorava pra aparecer. A animação em si já é instantânea
 * (ver adicionarPessoaOtimista, js/regras-briefing.js, e as animações
 * otimistas em wireWorkflowArrows, js/detalhe-modal.js) — o que demorava
 * era o `<img src="...">` baixando a foto pela PRIMEIRA vez, só no
 * instante em que a animação precisava dela. Isso busca os bytes de
 * antemão, uma vez, e deixa no cache do próprio navegador — quando a
 * animação precisa mostrar a foto, ela já está lá, sem esperar rede.
 *
 * Chamado nos mesmos lugares que já chamam atualizarAvatarDaSidebar()
 * (assim que cada fonte de foto termina de carregar) + quando a lista de
 * usuários do Runrun.it chega (buscarUsuariosRunrun, js/regras-briefing.js
 * — carrega DEPOIS deste arquivo, daí o typeof-guard ali dentro).
 */
function precarregarFotosConhecidas() {
  const urls = new Set();
  pessoasSalvas.forEach(p => { if (p.foto) urls.add(p.foto); });
  Object.values(ATENDIMENTO_PHOTOS_BEEON).forEach(u => urls.add(u));
  if (painelBeeonData && painelBeeonData.photos) {
    Object.values(painelBeeonData.photos).forEach(u => { if (u) urls.add(u); });
  }
  if (typeof usuariosRunrunCache !== "undefined" && usuariosRunrunCache) {
    usuariosRunrunCache.forEach(u => { if (u.foto) urls.add(u.foto); });
  }
  urls.forEach(url => {
    if (_fotosJaPrecarregadas.has(url)) return;
    _fotosJaPrecarregadas.add(url);
    new Image().src = url;
  });
}

async function salvarPessoaNoBackend(nome, foto, aliases, discord, emails) {
  if (!COLMEIA_API_URL || !nome) return false;
  try {
    const data = await chamarBackend({ acao: "salvarPessoa", nome, foto, aliases, discord, emails });
    // O backend recusa e-mail que já é de outra pessoa (ver salvarPessoa,
    // Planilha.gs) — sem mostrar o motivo, o coordenador só veria o
    // "Salvar" não fazer nada e não teria como saber por quê.
    if (!data.ok && data.error) alert(data.error);
    return !!data.ok;
  } catch (err) {
    console.error("Falha ao salvar pessoa no backend:", err);
    return false;
  }
}

// Remove da planilha de Pessoas as linhas de nomes que acabaram de virar
// apelido de outra pessoa (chamado depois de vincular, pra não deixar
// linha duplicada/solta pra esse nome).
async function excluirPessoasPorNomesNoBackend(nomes) {
  if (!COLMEIA_API_URL || !nomes || !nomes.length) return false;
  try {
    const data = await chamarBackend({ acao: "excluirPessoasPorNomes", nomes });
    return !!data.ok;
  } catch (err) {
    console.error("Falha ao excluir pessoas vinculadas no backend:", err);
    return false;
  }
}

function fotoDoAtendimento(nomeAtendimento) {
  const chave = Object.keys(ATENDIMENTO_PHOTOS_BEEON).find(d => nomesCorrespondem(d, nomeAtendimento));
  return chave ? ATENDIMENTO_PHOTOS_BEEON[chave] : null;
}

function avatarAtendimentoHTML(nome, sizeClass, pista) {
  const quem = { nome, ...(pista || {}) };
  const oficial = nomeOficialDe(quem);
  const foto = resolverFotoManual(quem)
    || fotoDoAtendimento(oficial) || fotoDoAtendimento(nome)
    || fotoDoDesigner(oficial) || fotoDoDesigner(nome);
  // Registra o nome CRU (não o oficial) de propósito: é assim que uma
  // grafia ainda não vinculada aparece na aba Pessoas pra ser linkada. Se
  // registrássemos o oficial, a variante nunca apareceria — e o
  // coordenador nunca ficaria sabendo que ela existe.
  registrarNomeVisto(nome, foto);
  if (foto) {
    return `<img class="avatar ${sizeClass || ""}" src="${foto}" data-nome="${escaparHTML(oficial)}" alt="${escaparHTML(oficial)}" title="${escaparHTML(oficial)}" onerror="handleAvatarImgError(this)">`;
  }
  return `<div class="avatar ${sizeClass || ""}" title="${escaparHTML(oficial)}">${initials(oficial)}</div>`;
}

/**
 * Busca o link do Discord (DM) de uma pessoa, cadastrado manualmente
 * no painel "Pessoas conhecidas".
 *
 * Passa pelo resolvedor como todo o resto desde 2026-08-11 — antes isso
 * comparava só o nome principal, então o link simplesmente não era achado
 * quando a pessoa aparecia pelo apelido (que é o caso mais comum, já que
 * é o apelido que vem do Runrun.it).
 */
function getDiscordDaPessoa(pista) {
  const p = resolverPessoa(pista);
  return (p && p.discord) || null;
}

/**
 * Busca o link do canal do Discord do cliente — procurado dentro dos
 * links extras cadastrados pra esse cliente (basta nomear um link
 * extra como "Discord").
 */
function getDiscordDoCliente(nomeCliente) {
  const dados = getLinksDoCliente(nomeCliente);
  if (!dados || !dados.extras) return null;
  const extra = dados.extras.find(e => normalizarParaComparar(e.nome).includes("discord"));
  return extra ? extra.url : null;
}

/**
 * Acha quem é o atendimento responsável (c.atend) de um cliente,
 * procurando nos clientes de todos os designers no painel-beeon.
 * Devolve null se o cliente não for encontrado lá (ex: dados fake).
 */
function getAtendimentoDoCliente(nomeCliente) {
  if (!painelBeeonData || !painelBeeonData.state) return null;
  const alvo = normalizarParaComparar(nomeCliente);
  for (const designer of Object.keys(painelBeeonData.state)) {
    const cliente = (painelBeeonData.state[designer] || []).find(c => normalizarParaComparar(c.cliente) === alvo);
    if (cliente && cliente.atend) return cliente.atend;
  }
  return null;
}

/**
 * Se a foto não carregar (link quebrado, offline, etc), troca a imagem
 * pelas iniciais do nome, em vez de deixar o ícone de imagem quebrada.
 */
function handleAvatarImgError(img) {
  const nome = img.getAttribute("data-nome") || "";
  const div = document.createElement("div");
  div.className = img.className;
  div.title = nome;
  div.textContent = initials(nome);
  img.replaceWith(div);
}

/**
 * @param {object} [pista] e-mail e/ou id do Runrun.it de quem é esse
 *   avatar, quando quem chama souber — é o que faz a foto certa aparecer
 *   mesmo quando o nome vem escrito diferente do cadastrado.
 */
function avatarHTML(nomeDesigner, sizeClass, avatarUrlDireto, pista) {
  const quem = { nome: nomeDesigner, ...(pista || {}) };
  const oficial = nomeOficialDe(quem);
  // Prioridade: 1) foto cadastrada manualmente pelo coordenador, 2) foto
  // do painel-designers-beeon, 3) foto que veio do Runrun.it.
  const foto = resolverFotoManual(quem)
    || fotoDoDesigner(oficial) || fotoDoDesigner(nomeDesigner)
    || avatarUrlDireto;
  // Nome CRU aqui — ver o porquê em avatarAtendimentoHTML.
  registrarNomeVisto(nomeDesigner, foto);
  if (foto) {
    return `<img class="avatar ${sizeClass || ""}" src="${foto}" data-nome="${escaparHTML(oficial)}" alt="${escaparHTML(oficial)}" title="${escaparHTML(oficial)}" onerror="handleAvatarImgError(this)">`;
  }
  return `<div class="avatar ${sizeClass || ""}" title="${escaparHTML(oficial)}">${initials(oficial)}</div>`;
}

// Frases divertidas do tema colmeia, mostradas em rodízio na tela de
// carregando (em vez de "Atualizando informações do Runrun.it...").
const mensagensCarregando = [
  "Preparando o melzinho...",
  "Ajeitando os favos...",
  "Organizando as abelhinhas...",
  "Polinizando as tarefas...",
  "Zunzunzum no Runrun.it...",
  "Arrumando a colmeia...",
];
let intervalMsgCarregando = null;

function iniciarMensagensCarregando() {
  clearInterval(intervalMsgCarregando);
  let indice = 0;
  intervalMsgCarregando = setInterval(() => {
    indice = (indice + 1) % mensagensCarregando.length;
    const el = document.getElementById("loadingMsg");
    if (!el) { clearInterval(intervalMsgCarregando); return; }
    el.classList.remove("fade-in");
    void el.offsetWidth; // reinicia a animação CSS
    el.textContent = mensagensCarregando[indice];
    el.classList.add("fade-in");
  }, 1800);
}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mapearTarefaDoBackend(t) {
  let day = null, due = "—";
  if (t.due) {
    const [ano, mes, dia] = t.due.split("-").map(Number);
    day = dia;
    due = `${String(dia).padStart(2, "0")} ${MESES_ABREV[mes - 1]}`;
  }
  return {
    id: t.id,
    title: t.title,
    client: t.client,
    type: t.type,
    priority: t.priority,
    day,
    due,
    dueISO: t.due || null, // data completa (ano-mês-dia), usada pra ordenar e saber se está atrasada
    dataPublicacao: t.dataPublicacao || null,
    status: t.status,
    runrunStage: t.runrunStage,
    // Campo de escrita de verdade pra mover a tarefa de etapa arbitrária
    // (não confundir com boardStageId, que é só leitura) — usado pelo
    // arrastar-e-soltar da página "Runrun completo".
    taskStateId: t.taskStateId || null,
    isOutraEtapa: t.isOutraEtapa,
    // Estado real de entregue, vindo do backend (is_closed no Runrun.it) —
    // é o que faz o botão de reabrir (reciclagem) aparecer mesmo numa
    // tarefa que já estava entregue de antes, não só numa que você
    // acabou de entregar nessa mesma sessão.
    entregue: !!t.entregue,
    parentTaskId: t.parentTaskId || null,
    link: t.link,
    attachmentsCount: t.attachmentsCount || 0,
    lastActivityAt: t.lastActivityAt || null,
    createdAt: t.createdAt || null,
    // Campo "Projeto" do Runrun.it — é onde mora o mês/ano de verdade do
    // projeto (ex: "APsystems > [MAIO26] INBOUND..."), não no título.
    projeto: t.projeto || "",
    assignee: t.assignee,
    // ID de verdade de quem está com a tarefa — usado por ehMinhaTarefa pra
    // decidir "essa tarefa é minha?" sem depender de nome parecido.
    assigneeId: t.assigneeId || null,
    assigneeAvatarUrl: t.assigneeAvatarUrl || null,
    // Até quando o responsável está em modo foco (epoch ms), se estiver
    // — ver js/modo-foco.js e o badge no card, js/kanban-board.js.
    assigneeEmFocoAte: t.assigneeEmFocoAte || null,
    timerSeconds: t.workedSeconds || 0,
    running: !!t.isRunning,
    estimateMinutes: t.estimateMinutes || 30,
    // Meta da barra de progresso: tempo médio de criação desse cliente
    // (cadastrado no painel-designers-beeon, ex: 20min pro Alden 348).
    // 0% quando o cronômetro está em 00:00, 100% ao bater esse tempo.
    // Sem tempo médio cadastrado pro cliente, a barra fica em 0% (não
    // dá pra calcular meta nenhuma).
    tempoMedioMinutos: t.tempoMedioMinutos || 0,
    estimatePct: calcularEstimatePct(t.workedSeconds || 0, t.tempoMedioMinutos || 0),
    // is_urgent do Runrun.it — usado pelo KPI "Prioridades" do Painel de
    // Designers (js/pagina-painel-designers.js). Não confundir com
    // task.status === "prioridades" (etapa do quadro do Colmeia).
    isUrgent: !!t.isUrgent,
  };
}

// Percentual da barra de progresso do card: proporção do tempo já
// trabalhado (segundos reais, vindos do Runrun.it) sobre o tempo médio
// de criação daquele cliente (minutos, cadastrado no painel-designers-
// beeon). Sem tempo médio cadastrado, não dá pra saber a meta — fica 0%.
function calcularEstimatePct(timerSeconds, tempoMedioMinutos) {
  if (!tempoMedioMinutos) return 0;
  const metaSegundos = tempoMedioMinutos * 60;
  return Math.max(0, Math.min(100, Math.round((timerSeconds / metaSegundos) * 100)));
}

/**
 * "Assinatura" do que está desenhado no quadro: junta, de cada tarefa, só
 * os campos que o desenho do card realmente usa. Se a assinatura não
 * mudou de uma atualização automática pra outra, não tem nada novo pra
 * mostrar — e redesenhar seria só piscar a tela à toa.
 *
 * Não inclui cronômetro nem barra de progresso de propósito: eles mudam a
 * cada segundo e já são atualizados direto no lugar, sem redesenho.
 */
let _ultimaAssinaturaQuadro = null;

function assinaturaDoQuadro(lista) {
  return lista.map(t => [
    t.id, t.status, t.priority, t.title, t.client, t.type,
    t.dueISO, t.assignee, t.running ? 1 : 0,
  ].join("~")).join("|");
}

// ===== Foto do quadro guardada no navegador (abertura instantânea) =====
// O Apps Script demora alguns segundos pra "acordar", e nesse tempo o
// Colmeia só mostrava a tela da abelhinha ("Preparando o melzinho..."):
// era a maior espera do app. Agora a última resposta boa do backend fica
// guardada aqui no navegador e é desenhada NA HORA que a pessoa entra,
// enquanto a versão de verdade chega por trás e substitui.
// Guarda o formato CRU que veio do backend (não o já mapeado), pra
// restaurar passando pelo mesmo mapearTarefaDoBackend de sempre.
const SNAPSHOT_QUADRO_KEY = "colmeia_snapshot_quadro_v1";
const SNAPSHOT_QUADRO_VALIDADE_MS = 24 * 60 * 60 * 1000; // quadro de dias atrás não ajuda ninguém

function salvarSnapshotDoQuadro(tarefasCruas) {
  if (!DESIGNER_LOGADO || !Array.isArray(tarefasCruas) || tarefasCruas.length === 0) return;
  try {
    localStorage.setItem(SNAPSHOT_QUADRO_KEY, JSON.stringify({
      designer: DESIGNER_LOGADO,
      quando: Date.now(),
      tarefas: tarefasCruas,
    }));
  } catch (err) {
    // Espaço do navegador cheio (ou aba privada): não é problema nenhum —
    // sem a foto guardada, o Colmeia só volta a abrir com a abelhinha.
    // Limpa qualquer sobra pela metade pra não restaurar lixo depois.
    try { localStorage.removeItem(SNAPSHOT_QUADRO_KEY); } catch (e) { /* sem problema */ }
  }
}

function restaurarSnapshotDoQuadro() {
  if (!DESIGNER_LOGADO) return false;
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(SNAPSHOT_QUADRO_KEY) || "null"); }
  catch (err) { return false; }
  if (!salvo || !Array.isArray(salvo.tarefas) || salvo.tarefas.length === 0) return false;
  // Só aproveita a foto se for da MESMA pessoa (o computador pode ser
  // compartilhado) e se ainda estiver recente.
  if (!nomesCorrespondem(salvo.designer, DESIGNER_LOGADO)) return false;
  if (!salvo.quando || (Date.now() - salvo.quando) > SNAPSHOT_QUADRO_VALIDADE_MS) return false;

  const todasMapeadas = salvo.tarefas.map(mapearTarefaDoBackend);
  // NUNCA restaura tarefa como "rodando": o estado do cronômetro é de
  // agora, não de quando a foto foi tirada. Sem isso, a pílula amarela
  // podia aparecer dizendo que algo está rodando (e o cronômetro começar a
  // contar em cima de um número velho) durante os segundos até a resposta
  // de verdade chegar.
  todasMapeadas.forEach(t => { t.running = false; });
  tasksTodas = todasMapeadas;
  tasks = todasMapeadas.filter(t => !t.isOutraEtapa);
  carregandoTarefas = false;
  return true;
}

async function carregarTarefasReais() {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1) {
    // Web App ainda não configurado — usa os dados fake só nesse caso.
    tasks = tasksFake;
    carregandoTarefas = false;
    buildBoard();
    render();
    return;
  }
  try {
    const data = await chamarBackendGet("?tipo=tarefas");
    if (!data.ok) {
      console.error("Erro ao buscar tarefas do Colmeia:", data.error);
      // Se o problema é o Runrun.it estar fora, avisa em português em vez
      // de deixar a pessoa achando que o Colmeia está quebrado.
      if (typeof mostrarAvisoRunrunFora === "function") mostrarAvisoRunrunFora(data.runrunFora);
      tasks = tasksFake;
      carregandoTarefas = false;
      buildBoard();
      render();
      return;
    }
    // `daFoto` = o Runrun.it não respondeu e o backend devolveu a última
    // foto conhecida no lugar (ver lerFotoDoQuadro, Código.gs). Vem com
    // ok:true porque tem quadro pra mostrar — mas NÃO é o quadro de
    // agora, e as duas coisas abaixo dependem dessa diferença.
    if (typeof mostrarAvisoRunrunFora === "function") {
      mostrarAvisoRunrunFora(!!data.daFoto || !!data.runrunFora, data.fotoQuando);
    }
    // Só guarda foto de varredura de verdade. Guardar uma foto vinda de
    // outra foto carimbaria a hora de agora num quadro velho — e aí ele
    // se passaria por atual na próxima abertura, que é exatamente o que
    // essa arquitetura foi desenhada pra nunca deixar acontecer.
    if (!data.daFoto) salvarSnapshotDoQuadro(data.tarefas);
    const todasMapeadas = data.tarefas.map(mapearTarefaDoBackend);
    tasksTodas = todasMapeadas;
    tasks = todasMapeadas.filter(t => !t.isOutraEtapa);
    tasks.forEach(t => { t.estimatePct = t.estimatePct || 0; });
    carregandoTarefas = false;
    buildBoard();
    render();
    verificarNotificacoes();
    atualizarBadgeRepasse();
  } catch (err) {
    console.error("Falha ao conectar com o backend do Colmeia:", err);
    tasks = tasksFake;
    carregandoTarefas = false;
    buildBoard();
    render();
  }
}

/**
 * Busca de novo as tarefas reais do Runrun.it e atualiza o quadro sem
 * mostrar a tela de "Carregando..." e sem fechar o pop-up de detalhe
 * que estiver aberto — usada depois de qualquer ação (comentário,
 * concluir, avançar responsável, mudar coluna etc) pra que tarefas que
 * mudaram de dono/etapa já sumam do quadro sozinhas, e tarefas novas já
 * apareçam, sem precisar dar F5.
 */
async function atualizarKanbanEmBackground() {
  if (!COLMEIA_API_URL || COLMEIA_API_URL.indexOf("COLE_AQUI") !== -1) return;
  try {
    const data = await chamarBackendGet("?tipo=tarefas");
    if (!data.ok) {
      // A atualização de fundo é o lugar mais provável de PERCEBER que o
      // Runrun.it caiu (roda a cada 60s), e também de perceber que voltou.
      if (typeof mostrarAvisoRunrunFora === "function") mostrarAvisoRunrunFora(data.runrunFora);
      return;
    }
    // Mesma distinção da carga inicial: foto não é quadro de agora.
    if (typeof mostrarAvisoRunrunFora === "function") {
      mostrarAvisoRunrunFora(!!data.daFoto || !!data.runrunFora, data.fotoQuando);
    }

    if (!data.daFoto) salvarSnapshotDoQuadro(data.tarefas); // mantém a foto do quadro sempre fresca
    const todasMapeadas = data.tarefas.map(mapearTarefaDoBackend);

    // Preserva o cache da "Sequência de responsáveis" (usado na aba de
    // Repasse) de uma atualização pra outra. Sem isso, toda vez que o
    // quadro atualizava sozinho em segundo plano (a cada 60s, ou 900ms
    // depois de qualquer ação em qualquer lugar do app) os objetos de
    // tarefa eram recriados do zero e a aba de Repasse tinha que buscar
    // a sequência de novo no Runrun.it pra cada card — fazendo a
    // fileira de fotinhos sumir e voltar ("Carregando sequência...")
    // por 1-2s toda hora, mesmo sem nada ter mudado de verdade (e às
    // vezes fechando um pop-up de confirmação que a pessoa tinha acabado
    // de abrir, bem na hora de clicar).
    const antigasPorId = {};
    tasksTodas.forEach(t => { antigasPorId[t.id] = t; });
    // Detecta "alguém acabou de te repassar essa tarefa" (mudou de
    // responsável) e "essa tarefa entrou em Ajustes/Refação com você"
    // (mudou de etapa), comparando com o poll anterior — só depois da
    // primeira carga (tasksTodas começa vazio no load inicial, então
    // antiga nunca existe ali, e por sorte isso já evita disparar aviso
    // pra toda a fila de uma vez só quando o Colmeia abre).
    //
    // ⚠️ Nunca a partir de uma FOTO. Toda essa detecção é "o que mudou de
    // um instante pro outro", e a foto é de vários minutos ATRÁS: comparar
    // com ela inverteria o sentido das mudanças e avisaria que você
    // recebeu uma tarefa que na verdade você já tinha passado adiante.
    // Mostrar o quadro velho ajuda; inventar novidade a partir dele, não.
    const podeAvisarDeMudanca = !data.daFoto;
    const recebidasAgora = [];
    const emAjustesAgora = [];
    todasMapeadas.forEach(nova => {
      const antiga = antigasPorId[nova.id];
      if (antiga && antiga.sequencia !== undefined) {
        nova.sequencia = antiga.sequencia;
        nova.workflowId = antiga.workflowId;
        nova._temSequencia = antiga._temSequencia;
        if (antiga._repasseEntregue) nova._repasseEntregue = antiga._repasseEntregue;
      }
      // "Entregue" é marcado na hora do clique, antes do Runrun.it
      // confirmar (ver detalhe-modal.js). Preservamos esse estado local por
      // uns segundos pra a atualização automática não desfazer o clique na
      // tela enquanto o Runrun.it ainda não processou — mesma ideia da
      // proteção do play/pausa logo abaixo.
      // IMPORTANTE: é só uma JANELA de tempo, não pra sempre. Antes isso
      // ficava grudado na tarefa eternamente, então se alguém reabrisse ela
      // pelo Runrun.it o Colmeia continuava mostrando o ícone de "reabrir"
      // (achando que estava entregue) até a pessoa dar F5.
      const RECEM_ENTREGUE_MS = 15000;
      if (antiga && antiga.entregue && antiga._entregueEm
        && (Date.now() - antiga._entregueEm) < RECEM_ENTREGUE_MS) {
        nova.entregue = true;
        nova._entregueEm = antiga._entregueEm;
      }
      if (podeAvisarDeMudanca && antiga && DESIGNER_LOGADO
        && !ehMinhaTarefa(antiga)
        && ehMinhaTarefa(nova)) {
        recebidasAgora.push(nova);
      }
      if (podeAvisarDeMudanca && DESIGNER_LOGADO && nova.status === "ajustes"
        && ehMinhaTarefa(nova)
        && (!antiga || antiga.status !== "ajustes")) {
        emAjustesAgora.push(nova);
      }
    });
    // Cooldown por tarefa+evento: sem isso, uma tarefa cujo campo de
    // responsável/etapa "pisca" entre dois valores de um poll pro outro
    // (glitch pontual da API) fica repetindo o mesmo pop-up sem parar —
    // era esse o bug de "notificação de uma única tarefa não para de
    // aparecer". Ver _jaNotificadoRecentemente/_marcarNotificadoAgora.
    recebidasAgora
      .filter(t => !_jaNotificadoRecentemente("repasse::" + t.id))
      .forEach(t => {
        _marcarNotificadoAgora("repasse::" + t.id);
        mostrarNotifNaPill({
          icone: reopenIcon,
          titulo: "Você recebeu uma tarefa",
          subtitulo: t.title,
          onClick: () => {
            const idx = tasks.findIndex(x => String(x.id) === String(t.id));
            if (idx !== -1) openDetail(idx);
          },
        });
        // Também registra no sino (não só na pill passageira) — ver
        // registrarNotificacaoGenerica em js/notificacoes-avisos.js.
        // Usa o timestamp na chave porque a mesma tarefa pode ser
        // repassada de novo mais tarde e continuar sendo "nova" de novo.
        if (typeof registrarNotificacaoGenerica === "function") {
          registrarNotificacaoGenerica({
            tipo: "repasse",
            chave: "repasse::" + t.id + "::" + Date.now(),
            titulo: "Você recebeu uma tarefa",
            subtitulo: t.title,
            icone: reopenIcon,
            taskId: t.id,
          });
        }
      });
    emAjustesAgora
      .filter(t => !_jaNotificadoRecentemente("ajustes::" + t.id))
      .forEach(t => {
        _marcarNotificadoAgora("ajustes::" + t.id);
        mostrarNotifNaPill({
          icone: reopenIcon,
          titulo: "Tarefa em Ajustes",
          subtitulo: t.title,
          onClick: () => {
            const idx = tasks.findIndex(x => String(x.id) === String(t.id));
            if (idx !== -1) openDetail(idx);
          },
        });
        if (typeof registrarNotificacaoGenerica === "function") {
          registrarNotificacaoGenerica({
            tipo: "ajustes",
            chave: "ajustes::" + t.id + "::" + Date.now(),
            titulo: "Tarefa em Ajustes",
            subtitulo: t.title,
            icone: reopenIcon,
            taskId: t.id,
          });
        }
      });

    tasksTodas = todasMapeadas;
    const novasTarefas = todasMapeadas.filter(t => !t.isOutraEtapa);

    // Preserva o progresso visual (barra) e não deixa o cronômetro
    // "voltar no tempo" se, por acaso, o Runrun.it ainda não processou
    // os últimos segundos rodados localmente.
    novasTarefas.forEach(nova => {
      const antiga = tasks.find(t => t.id === nova.id);
      if (antiga) {
        // Nunca deixa o tempo "voltar" pra trás, mesmo que o Runrun.it
        // ainda não tenha confirmado que a tarefa está rodando (a API
        // dele às vezes demora a refletir isso, e aí devolvia um valor
        // mais baixo — às vezes 0 — que sobrescrevia o tempo certo).
        nova.timerSeconds = Math.max(nova.timerSeconds, antiga.timerSeconds);
        // A barra de progresso é sempre recalculada a partir do tempo real
        // (já protegido contra "voltar no tempo" acima) e do tempo médio do
        // cliente — nunca travada no valor antigo, senão ela para de andar
        // depois da primeira atualização em segundo plano.
        nova.estimatePct = calcularEstimatePct(nova.timerSeconds, nova.tempoMedioMinutos);
        // Preserva os comentários já carregados — sem isso, toda
        // atualização automática do quadro trocava a tarefa por um
        // objeto novo sem comentários, e quem estivesse com o card
        // aberto via eles "sumirem" até recarregar de novo.
        if (antiga.comments !== undefined) nova.comments = antiga.comments;
        // Mesma ideia pro briefing já organizado pela IA: sem preservar, a
        // atualização automática apagava ele a cada 60s e o Colmeia pedia
        // tudo de novo pro servidor na próxima abertura do card, mesmo já
        // tendo o resultado pronto.
        if (antiga.briefingHTML !== undefined) nova.briefingHTML = antiga.briefingHTML;
        // Mesmo problema do timerSeconds acima, mas pro "está rodando":
        // o Runrun.it às vezes demora alguns segundos pra confirmar o
        // play/pause (mesmo já tendo aceitado a chamada) — sem essa
        // proteção, uma atualização automática do quadro que caísse
        // bem nesse meio-tempo trazia "running: false" de volta do
        // Runrun.it e desfazia visualmente o play que a pessoa acabou
        // de dar (o card voltava, o pill amarelo sumia), mesmo a tarefa
        // já estando rodando de verdade lá. Confia no estado local por
        // uns segundos depois de QUALQUER toggle (play OU pause,
        // próprio ou de outra tarefa parada junto), depois volta a
        // confiar no Runrun.it normalmente.
        const RECEM_MEXIDO_MS = 8000;
        if (antiga._runningToggleEm && (Date.now() - antiga._runningToggleEm) < RECEM_MEXIDO_MS) {
          nova.running = antiga.running;
          nova._runningToggleEm = antiga._runningToggleEm;
        }
      }
    });

    const idAberto = (tasks[detailIdx] && tasks[detailIdx].id) || null;
    const tarefaAbertaAntes = tasks[detailIdx] || null;
    tasks = novasTarefas;

    if (idAberto) {
      const novoIdx = tasks.findIndex(t => t.id === idAberto);
      if (novoIdx !== -1) {
        detailIdx = novoIdx;
      } else if (tarefaAbertaAntes) {
        // A tarefa aberta não veio nessa busca — pode ser porque foi
        // entregue agora há pouco, porque é um card mãe (o backend não
        // devolve cards mãe na lista normal de propósito), uma
        // subtarefa, ou qualquer outro caso "fora do quadro". Em NENHUM
        // desses casos o pop-up deve fechar sozinho — só a própria
        // pessoa fechando manualmente. Mantém a tarefa viva com os
        // dados que já tínhamos; um status que não bate com nenhuma
        // coluna garante que ela não volte a aparecer no quadro.
        tarefaAbertaAntes.status = "__fora_do_quadro__";
        tasks.push(tarefaAbertaAntes);
        detailIdx = tasks.length - 1;
      }
    }

    // Só redesenha o quadro se algo que APARECE nele mudou de verdade.
    // Antes, a cada 60 segundos o quadro inteiro era reconstruído e todos
    // os cliques religados mesmo sem nenhuma mudança — é o que causava
    // aquelas "piscadas" e menus que fechavam sozinhos na cara da pessoa.
    // O cronômetro e a barrinha de progresso não entram nessa comparação
    // de propósito: eles mudam a cada segundo e já são atualizados
    // direto no lugar, sem redesenhar o quadro (ver o setInterval de 1s
    // em js/detalhe-modal.js).
    const assinaturaAgora = assinaturaDoQuadro(tasks);
    if (assinaturaAgora !== _ultimaAssinaturaQuadro) {
      _ultimaAssinaturaQuadro = assinaturaAgora;
      render();
    }
    updateNowPlaying();
    atualizarBadgeRepasse();
    verificarNotificacoes();
    // Não redesenha a fila de repasse por baixo de um pop-up que a
    // pessoa acabou de abrir (confirmar repasse/entrega, ou o "+" de
    // adicionar pessoa) — senão ele some sozinho no meio da decisão. Os
    // dados (tasksTodas) já foram atualizados acima de qualquer forma;
    // a tela só sincroniza visualmente quando o pop-up fechar (próxima
    // atualização automática, ação do usuário, ou refresh).
    const repassePagina = document.getElementById("page-repasse");
    const temPopupAbertoNaFila = document.querySelector("#repasseBoard .repasse-card-popup-aberto");
    if (repassePagina && !repassePagina.hidden && !temPopupAbertoNaFila) renderRepasse();
  } catch (err) {
    console.error("Falha ao atualizar o kanban em background:", err);
  }
}

// Agenda a atualização em background com um pequeno atraso (dá tempo
// do Runrun.it processar a mudança) e "debounca" — se vários cliques
// pedirem atualização em sequência, só dispara uma vez.
