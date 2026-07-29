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

// Pessoas cadastradas manualmente pelo coordenador (foto customizada e
// apelidos vinculados), carregadas do backend do Colmeia.
let pessoasSalvas = []; // [{nome, foto, aliases: [...]}]

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

/**
 * Confere se o coordenador já cadastrou manualmente uma foto pra esse
 * nome (ou um apelido dele). Tem prioridade sobre qualquer outra fonte.
 */
function resolverFotoManual(nome) {
  const alvo = normalizarParaComparar(nome);
  for (const p of pessoasSalvas) {
    if (normalizarParaComparar(p.nome) === alvo) return p.foto || null;
    if (p.aliases.some(a => normalizarParaComparar(a) === alvo)) return p.foto || null;
  }
  return null;
}

async function carregarPessoasSalvas() {
  if (!COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "listarPessoas" }),
    });
    const data = await res.json();
    if (data.ok) {
      pessoasSalvas = data.pessoas || [];
    }
  } catch (err) {
    console.error("Falha ao carregar pessoas salvas:", err);
  }
}

async function salvarPessoaNoBackend(nome, foto, aliases, discord) {
  if (!COLMEIA_API_URL || !nome) return false;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "salvarPessoa", nome, foto, aliases, discord }),
    });
    const data = await res.json();
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
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "excluirPessoasPorNomes", nomes }),
    });
    const data = await res.json();
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

function avatarAtendimentoHTML(nome, sizeClass) {
  const foto = resolverFotoManual(nome) || fotoDoAtendimento(nome) || fotoDoDesigner(nome);
  registrarNomeVisto(nome, foto);
  if (foto) {
    return `<img class="avatar ${sizeClass || ""}" src="${foto}" data-nome="${nome}" alt="${nome}" title="${nome}" onerror="handleAvatarImgError(this)">`;
  }
  return `<div class="avatar ${sizeClass || ""}" title="${nome}">${initials(nome)}</div>`;
}

/**
 * Busca o link do Discord (DM) de uma pessoa, cadastrado manualmente
 * no painel "Pessoas conhecidas".
 */
function getDiscordDaPessoa(nome) {
  const p = pessoasSalvas.find(x => nomesCorrespondem(x.nome, nome));
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

function avatarHTML(nomeDesigner, sizeClass, avatarUrlDireto) {
  // Prioridade: 1) foto cadastrada manualmente pelo coordenador, 2) foto
  // do painel-designers-beeon, 3) foto que veio do Runrun.it.
  const foto = resolverFotoManual(nomeDesigner) || fotoDoDesigner(nomeDesigner) || avatarUrlDireto;
  registrarNomeVisto(nomeDesigner, foto);
  if (foto) {
    return `<img class="avatar ${sizeClass || ""}" src="${foto}" data-nome="${nomeDesigner}" alt="${nomeDesigner}" title="${nomeDesigner}" onerror="handleAvatarImgError(this)">`;
  }
  return `<div class="avatar ${sizeClass || ""}" title="${nomeDesigner}">${initials(nomeDesigner)}</div>`;
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
    parentTaskId: t.parentTaskId || null,
    link: t.link,
    attachmentsCount: t.attachmentsCount || 0,
    lastActivityAt: t.lastActivityAt || null,
    createdAt: t.createdAt || null,
    assignee: t.assignee,
    assigneeAvatarUrl: t.assigneeAvatarUrl || null,
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
    hasChange: false,
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
    const res = await fetch(COLMEIA_API_URL + "?tipo=tarefas");
    const data = await res.json();
    if (!data.ok) {
      console.error("Erro ao buscar tarefas do Colmeia:", data.error);
      tasks = tasksFake;
      carregandoTarefas = false;
      buildBoard();
      render();
      return;
    }
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
    const res = await fetch(COLMEIA_API_URL + "?tipo=tarefas");
    const data = await res.json();
    if (!data.ok) return;

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
      // O backend não devolve "entregue" (é um estado só de sessão, marcado
      // na hora que a pessoa clica em concluir — ver detalhe-modal.js). Sem
      // preservar aqui, toda atualização automática do quadro recriava a
      // tarefa do zero sem esse flag, e o botão de reabrir sumia sozinho
      // (voltava a mostrar "concluir" como se nunca tivesse sido entregue).
      if (antiga && antiga.entregue) nova.entregue = true;
      if (antiga && DESIGNER_LOGADO
        && !nomesCorrespondem(antiga.assignee, DESIGNER_LOGADO)
        && nomesCorrespondem(nova.assignee, DESIGNER_LOGADO)) {
        recebidasAgora.push(nova);
      }
      if (DESIGNER_LOGADO && nova.status === "ajustes"
        && nomesCorrespondem(nova.assignee, DESIGNER_LOGADO)
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

    render();
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
