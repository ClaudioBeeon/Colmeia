// Notificações reais: comentários novos nas tarefas do designer logado,
// guardadas aqui (nesse navegador) por até NOTIF_RETENCAO_MS, mesmo
// depois de abertas/lidas — antes, assim que o sino era aberto, a
// notificação já desaparecia da lista pra sempre. Cada item:
// {taskId, taskTitle, autor, texto, comentarioId, criadoEm, vista}
let notificacoes = [];
const NOTIF_LOG_KEY = "colmeia_notificacoes_log_v2";
const NOTIF_RETENCAO_MS = 2 * 24 * 60 * 60 * 1000; // 2 dias

// Marca o instante em que o Colmeia abriu — usado pra garantir que o
// pop-up (a pílula/ilha) só aparece pra coisa que aconteceu DE VERDADE
// depois disso, nunca pra comentário antigo (ex: uma tarefa que só
// agora entrou na lista de "minhas tarefas" traz junto um monte de
// comentário de dias atrás, e sem esse corte cada um virava um pop-up).
// O painel do sino (histórico) continua mostrando tudo, sem esse corte.
const _colmeiaIniciadoEm = Date.now();

// O Runrun.it manda menção como "<mention>Nome</mention>" dentro do
// texto cru do comentário — só isso vira pop-up (ver verificarNotificacoes
// abaixo); comentário comum, sem te mencionar, só entra no sino.
function comentarioMencionaDesigner(texto) {
  if (!texto || !DESIGNER_LOGADO) return false;
  const mencoes = [...texto.matchAll(/<mention>(.*?)<\/mention>/gi)].map(m => m[1]);
  return mencoes.some(nome => nomesCorrespondem(nome, DESIGNER_LOGADO));
}

function carregarNotificacoesLog() {
  let bruto = [];
  try { bruto = JSON.parse(localStorage.getItem(NOTIF_LOG_KEY) || "[]"); } catch (err) { bruto = []; }
  const agora = Date.now();
  // A retenção de 2 dias tem que contar a partir de quando O COLMEIA
  // VIU o comentário (registradoEm), NUNCA da data do comentário em si
  // (criadoEm) — um comentário de semanas atrás que a pessoa nunca
  // tinha visto antes (ex: tarefa velha reaberta) é "novo" pra nós no
  // dia em que apareceu. Usar criadoEm aqui fazia esse comentário ser
  // filtrado pra fora do log LOGO DEPOIS de ser salvo (já nasce "velho"
  // pelos padrões dos 2 dias) — daí a próxima checagem não achava mais
  // ele salvo, achava de novo que era novo, mostrava a notificação nele,
  // salvava, filtrava de novo... um loop sem fim mostrando a mesma
  // notificação de comentário antigo repetidamente.
  return bruto.filter(n => n && (n.registradoEm || n.criadoEm) && (agora - (n.registradoEm || n.criadoEm)) < NOTIF_RETENCAO_MS);
}
function salvarNotificacoesLog(lista) {
  try { localStorage.setItem(NOTIF_LOG_KEY, JSON.stringify(lista)); } catch (err) { /* sem problema */ }
}

/**
 * Varre as tarefas em aberto do designer logado, busca os comentários
 * de cada uma e registra no log (localStorage) qualquer comentário de
 * outra pessoa que ainda não estava lá — dedupe por comentário (não
 * por "lido"), então o item continua na lista mesmo depois de visto,
 * até completar os 2 dias de retenção.
 */
// Comentários buscados há pouco tempo (pelo sino ou pelo chat) ficam
// guardados aqui por um tempinho curto — evita refazer uma busca de
// rede por tarefa toda vez que o sino é aberto de novo em seguida
// (ex: abrir/fechar sem querer, ou dar uma segunda olhada logo depois).
const CACHE_COMENTARIOS_TTL_MS = 30 * 1000;
const cacheComentariosPorTarefa = new Map(); // taskId -> { comentarios, quando, lastActivityAt }

/**
 * Busca os comentários de uma tarefa, mas SÓ vai à rede se algo tiver
 * mudado nela de verdade.
 *
 * Por que isso importa: verificarNotificacoes roda depois de QUALQUER
 * atualização do quadro (a cada 60s e ~1s depois de cada ação) e chamava
 * isso pra cada tarefa sua. Com 15 tarefas eram ~15 idas ao Apps Script
 * por minuto, por pessoa — a maior fonte de tráfego do app, competindo
 * com as ações de verdade e deixando tudo mais lento.
 *
 * O Runrun.it já devolve `lastActivityAt` (updated_at) de cada tarefa na
 * busca do quadro, que a gente pega "de graça". Se ele não mudou desde a
 * última vez que buscamos os comentários, não tem comentário novo — então
 * reaproveita o que já está guardado, sem gastar nenhuma chamada. Na
 * maioria dos ciclos isso cai pra ZERO chamadas.
 */
// Teto de segurança: mesmo que a data de atividade da tarefa não mude,
// rebusca de tempos em tempos. É uma rede de proteção caso o Runrun.it
// não atualize `updated_at` ao receber um comentário — sem isso, a
// notificação daquela tarefa poderia nunca mais ser checada. Continua
// cortando a grande maioria das chamadas, e o pior caso vira "o sino
// demora até 10 min", nunca "o sino não avisa".
const TETO_REBUSCA_COMENTARIOS_MS = 10 * 60 * 1000;

async function buscarComentariosComCache(taskId, lastActivityAt) {
  const cache = cacheComentariosPorTarefa.get(taskId);
  if (cache) {
    const idade = Date.now() - cache.quando;
    const aindaFresco = idade < CACHE_COMENTARIOS_TTL_MS;
    // "Nada mudou na tarefa desde a última busca" só vale quando as duas
    // pontas realmente têm essa data — sem ela, cai na regra de tempo de
    // sempre, pra nunca deixar de perceber um comentário novo.
    const nadaMudouNaTarefa = !!lastActivityAt && !!cache.lastActivityAt
      && String(lastActivityAt) === String(cache.lastActivityAt)
      && idade < TETO_REBUSCA_COMENTARIOS_MS;
    if (aindaFresco || nadaMudouNaTarefa) return cache.comentarios;
  }
  const comentarios = await buscarComentariosDoBackend(taskId);
  cacheComentariosPorTarefa.set(taskId, { comentarios, quando: Date.now(), lastActivityAt: lastActivityAt || null });
  return comentarios;
}

// Se true, é a primeira checagem dessa sessão (assim que o Colmeia
// carrega) — nesse caso não mostra a ilha pra cada comentário "novo"
// encontrado, senão a pessoa levaria uma enxurrada de avisos só de
// abrir o app depois de um tempo fora. A ilha só avisa de comentário
// que chegou DE VERDADE enquanto a pessoa já estava usando o Colmeia.
let _primeiraChecagemNotificacoes = true;

// Trava contra chamadas simultâneas — verificarNotificacoes agora roda
// depois de QUALQUER ação no app (atualizarKanbanEmBackground chama ela),
// que dispara com muita frequência. Sem essa trava, duas chamadas podiam
// se sobrepor: as duas liam o mesmo log do localStorage ANTES de
// qualquer uma salvar, então as duas achavam os mesmos comentários
// "novos" e mostravam a ilha em dobro (ou mais) pra cada um — era isso
// que fazia a notificação parecer não parar de aparecer.
let _verificandoNotificacoes = false;

async function verificarNotificacoes() {
  if (!DESIGNER_LOGADO || _verificandoNotificacoes) return;
  _verificandoNotificacoes = true;
  try {
    await _verificarNotificacoesImpl();
  } finally {
    _verificandoNotificacoes = false;
  }
}

async function _verificarNotificacoesImpl() {
  const primeiraVez = _primeiraChecagemNotificacoes;
  _primeiraChecagemNotificacoes = false;
  const minhasTarefas = tasks.filter(t => t.id && nomesCorrespondem(t.assignee, DESIGNER_LOGADO));
  let log = carregarNotificacoesLog();
  const chavesExistentes = new Set(log.map(n => n.taskId + "::" + n.comentarioId));
  const novos = [];

  await Promise.all(minhasTarefas.map(async t => {
    // Passa a data de última atividade da tarefa: se ela não mudou, o
    // cache responde sem gastar chamada nenhuma (ver buscarComentariosComCache).
    const comentarios = await buscarComentariosComCache(t.id, t.lastActivityAt);
    t.comments = comentarios; // aproveita e já deixa cacheado pro chat também
    comentarios
      .filter(c => !nomesCorrespondem(c.autor, DESIGNER_LOGADO))
      .forEach(c => {
        const chave = t.id + "::" + (c.id || 0);
        if (chavesExistentes.has(chave)) return;
        chavesExistentes.add(chave);
        const item = {
          tipo: "comentario",
          chave: t.id + "::" + (c.id || 0),
          taskId: t.id,
          taskTitle: t.title,
          taskClient: t.client,
          autor: c.autor,
          texto: c.texto,
          comentarioId: c.id || 0,
          criadoEm: c.data ? new Date(c.data).getTime() : Date.now(),
          registradoEm: Date.now(), // quando O COLMEIA viu esse comentário pela 1a vez — ver carregarNotificacoesLog
          vista: false,
        };
        log.push(item);
        novos.push(item);
      });
  }));

  log = log.filter(n => (Date.now() - (n.registradoEm || n.criadoEm)) < NOTIF_RETENCAO_MS);
  log.sort((a, b) => b.criadoEm - a.criadoEm);
  salvarNotificacoesLog(log);
  notificacoes = log;
  atualizarBadgeNotificacoes();

  if (!primeiraVez) {
    // Pop-up (pílula/ilha) pra comentário em tarefa sua (já é sempre o
    // caso aqui — minhasTarefas só tem tarefa alocada a você) ou que te
    // mencionou — nunca pra coisa de antes do Colmeia estar aberto (ver
    // _colmeiaIniciadoEm acima), senão o backlog de comentário antigo de
    // uma tarefa que só agora entrou na sua lista vira uma enxurrada de
    // pop-up de uma vez.
    novos
      .filter(n => n.criadoEm >= _colmeiaIniciadoEm)
      .forEach(n => {
        const mencionou = comentarioMencionaDesigner(n.texto);
        mostrarNotifNaPill({
          icone: chatIcon,
          titulo: mencionou ? `${n.autor} te mencionou` : `${n.autor} comentou`,
          subtitulo: n.taskTitle,
          onClick: async () => {
            const idx = tasks.findIndex(x => String(x.id) === String(n.taskId));
            if (idx === -1) return;
            mostrarPagina("kanban");
            openDetail(idx);
            await esperar(150);
            abrirChatPanel(tasks[detailIdx]);
          },
        });
      });
  }
}

function atualizarBadgeNotificacoes() {
  const badge = document.getElementById("notificationsBadge");
  if (!badge) return;
  const total = notificacoes.filter(n => !n.vista).length;
  badge.hidden = total === 0;
  badge.textContent = total > 9 ? "9+" : String(total);
}

/**
 * Registra no MESMO log/painel dos comentários (o sino) qualquer outro
 * tipo de notificação (reunião nova, card repassado pra você, card que
 * entrou em Ajustes com você) — antes essas só apareciam como pill/ilha
 * passageira e, se a pessoa não visse na hora, sumiam pra sempre. Agora
 * ficam registradas por até NOTIF_RETENCAO_MS igual comentário, mesmo
 * depois de vistas. `chave` precisa ser única e estável (ex: sempre a
 * mesma pra aquele evento/tarefa) — é o que evita duplicar entrada a
 * cada checagem repetida da mesma coisa.
 */
function registrarNotificacaoGenerica({ tipo, chave, titulo, subtitulo, icone, taskId, link }) {
  let log = carregarNotificacoesLog();
  if (log.some(n => n.chave === chave)) return;
  const item = { chave, tipo, titulo, subtitulo, icone, taskId, link, criadoEm: Date.now(), registradoEm: Date.now(), vista: false };
  log.push(item);
  log = log.filter(n => (Date.now() - (n.registradoEm || n.criadoEm)) < NOTIF_RETENCAO_MS);
  log.sort((a, b) => b.criadoEm - a.criadoEm);
  salvarNotificacoesLog(log);
  notificacoes = log;
  atualizarBadgeNotificacoes();
}

// Tempo relativo mais fino que tempoRelativoAviso (minutos importam
// bastante pra notificação de comentário — "agora há pouco" o dia
// inteiro não ajuda a saber se é recém-chegada ou de ontem).
function tempoRelativoNotificacao(criadoEm) {
  const ms = Date.now() - Number(criadoEm);
  const minutos = Math.floor(ms / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

function renderNotificacoes() {
  const body = document.getElementById("notificationsBody");
  if (!body) return;
  if (notificacoes.length === 0) {
    body.innerHTML = `<p class="quick-access-empty">Nenhuma notificação por enquanto.</p>`;
    return;
  }
  body.innerHTML = notificacoes.map((n, i) => {
    // Comentário mostra a foto de quem comentou; os outros tipos
    // (reunião, card repassado, card em ajustes) mostram um ícone —
    // não tem "autor" nesse sentido.
    if (n.tipo && n.tipo !== "comentario") {
      return `
        <div class="notif-card notif-card-generica ${n.vista ? "" : "unread"}" data-i="${i}">
          <span class="notif-card-icone">${n.icone || chatIcon}</span>
          <div class="notif-card-body">
            <div class="notif-card-top">
              <span class="notif-card-autor">${escaparHTML(n.titulo)}</span>
              <span class="notif-card-tempo">${tempoRelativoNotificacao(n.criadoEm)}</span>
            </div>
            <p class="notif-card-texto">${escaparHTML(n.subtitulo || "")}</p>
          </div>
          ${n.vista ? "" : `<span class="notif-card-dot" title="Novo"></span>`}
        </div>
      `;
    }
    return `
      <div class="notif-card ${n.vista ? "" : "unread"}" data-i="${i}">
        ${avatarHTML(n.autor, "avatar-sm notif-card-avatar")}
        <div class="notif-card-body">
          <div class="notif-card-top">
            <span class="notif-card-autor">${escaparHTML(n.autor)}</span>
            <span class="notif-card-tempo">${tempoRelativoNotificacao(n.criadoEm)}</span>
          </div>
          <p class="notif-card-texto">${prepararTextoComentario(n.texto)}</p>
          <span class="notif-card-tarefa">${escaparHTML(n.taskTitle)}${n.taskClient ? ` · ${escaparHTML(n.taskClient)}` : ""}</span>
        </div>
        ${n.vista ? "" : `<span class="notif-card-dot" title="Novo"></span>`}
      </div>
    `;
  }).join("");
  body.querySelectorAll(".notif-card").forEach(el => {
    el.addEventListener("click", async () => {
      const n = notificacoes[Number(el.dataset.i)];
      document.getElementById("notificationsPanel").classList.remove("open");
      if (n.tipo === "reuniao") {
        if (n.link) window.open(n.link, "_blank");
        return;
      }
      // Por id, não por referência — se o quadro atualizou sozinho
      // enquanto o painel de notificações estava aberto, a tarefa daquele
      // momento pode não ser mais o mesmo objeto em tasks[].
      const idxExistente = tasks.findIndex(t => String(t.id) === String(n.taskId));
      if (idxExistente !== -1) {
        mostrarPagina("kanban");
        openDetail(idxExistente);
      }
      if (!n.tipo || n.tipo === "comentario") {
        await esperar(150);
        abrirChatPanel(tasks[detailIdx]);
      }
    });
  });
}

// Notificações reais: comentários novos nas tarefas do designer logado.
document.getElementById("notificationsBtn").addEventListener("click", async () => {
  const panel = document.getElementById("notificationsPanel");
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) {
    // Mostra NA HORA o que já está guardado no navegador (o log de
    // notificações dos últimos 2 dias) em vez de exibir "Carregando..." e
    // esperar a busca de todas as tarefas. A atualização acontece por trás
    // e a lista se completa sozinha quando termina.
    if (notificacoes.length === 0) notificacoes = carregarNotificacoesLog();
    renderNotificacoes();
    await verificarNotificacoes();
    renderNotificacoes();
    // Abrir o sino zera o contador, mas os cards continuam na lista —
    // só somem sozinhos depois de NOTIF_RETENCAO_MS (2 dias).
    notificacoes.forEach(n => {
      n.vista = true;
      // Mantém o pontinho de "não lido" do chat de cada tarefa em sincronia
      // com o sino (só funciona se essa tarefa já tinha comentários
      // carregados nessa sessão — senão não faz diferença), só faz
      // sentido pra notificação de comentário.
      if (!n.tipo || n.tipo === "comentario") {
        const t = tasks.find(x => String(x.id) === String(n.taskId));
        if (t) marcarChatVisto(t);
      }
    });
    salvarNotificacoesLog(notificacoes);
    const badge = document.getElementById("notificationsBadge");
    if (badge) badge.hidden = true;
  }
});
document.getElementById("notificationsClose").addEventListener("click", () => {
  document.getElementById("notificationsPanel").classList.remove("open");
});

// ===== Painel de Avisos (coordenador lança, todo mundo vê) =====
const AVISOS_VISTOS_KEY = "colmeia_avisos_vistos_ids";
function idsAvisosVistos() {
  try { return new Set(JSON.parse(localStorage.getItem(AVISOS_VISTOS_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function marcarAvisosVistos(lista) {
  try {
    const vistos = idsAvisosVistos();
    lista.forEach(a => vistos.add(a.id));
    localStorage.setItem(AVISOS_VISTOS_KEY, JSON.stringify(Array.from(vistos)));
  } catch (e) { /* sem problema */ }
}

let avisosCache = [];

async function buscarAvisosDoBackend() {
  if (!COLMEIA_API_URL) return [];
  try {
    const res = await fetch(COLMEIA_API_URL, { method: "POST", body: JSON.stringify({ acao: "listarAvisos" }) });
    const data = await res.json();
    return data.ok ? data.avisos : [];
  } catch (err) {
    console.error("Falha ao buscar avisos:", err);
    return [];
  }
}

function tempoRelativoAviso(criadoEm) {
  const ms = Date.now() - Number(criadoEm);
  const horas = Math.floor(ms / 3600000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias > 1 ? "s" : ""}`;
}

function renderAvisos() {
  const body = document.getElementById("avisosBody");
  if (!body) return;
  if (avisosCache.length === 0) {
    body.innerHTML = `<p class="quick-access-empty">Nenhum aviso por enquanto.</p>`;
    return;
  }
  body.innerHTML = avisosCache.map(a => `
    <div class="aviso-item" data-id="${a.id}">
      <div class="aviso-item-top">
        <span class="aviso-item-autor">${a.autor}</span>
        <span class="aviso-item-tempo">${tempoRelativoAviso(a.criadoEm)}</span>
      </div>
      <p class="aviso-item-texto">${escaparHTML(a.texto)}</p>
      ${souClaudio() ? `<button type="button" class="aviso-item-excluir" data-id="${a.id}" aria-label="Excluir aviso">×</button>` : ""}
    </div>
  `).join("");

  body.querySelectorAll(".aviso-item-excluir").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.disabled = true;
      // O try/catch aqui não é enfeite: sem ele, uma queda de internet no
      // meio do caminho estourava um erro e o botão ficava desabilitado
      // PARA SEMPRE (só F5 resolvia), sem nenhuma mensagem explicando.
      // Mesmo cuidado do resto do app — sempre devolver o botão ao normal.
      try {
        const res = await fetch(COLMEIA_API_URL, { method: "POST", body: JSON.stringify({ acao: "excluirAviso", id }) });
        const data = await res.json();
        if (data.ok) {
          avisosCache = avisosCache.filter(a => a.id !== id);
          renderAvisos();
          return;
        }
        btn.disabled = false;
        mostrarToast(data.error || "Não consegui excluir esse aviso agora.", "erro");
      } catch (err) {
        console.error("Falha ao excluir aviso:", err);
        btn.disabled = false;
        mostrarToast("Falha de conexão. Não consegui excluir esse aviso agora.", "erro");
      }
    });
  });
}

const avisosPanel = document.getElementById("avisosPanel");
document.getElementById("avisosBtn").addEventListener("click", async () => {
  avisosPanel.classList.toggle("open");
  if (!avisosPanel.classList.contains("open")) return;

  const novoWrap = document.getElementById("avisosNovoWrap");
  if (novoWrap) novoWrap.hidden = !souClaudio(); // só o Cláudio lança aviso novo — os outros só veem

  // O app já busca os avisos sozinho a cada 5 minutos, então quase sempre
  // temos a lista em mãos — mostra ela na hora em vez de "Carregando..."
  // e só atualiza por trás. Sem nada guardado ainda (primeira abertura da
  // sessão), aí sim mostra o aviso de carregando.
  if (avisosCache.length > 0) renderAvisos();
  else document.getElementById("avisosBody").innerHTML = `<p class="quick-access-empty">Carregando...</p>`;
  avisosCache = await buscarAvisosDoBackend();
  renderAvisos();
  // Abrir o painel já marca tudo como visto — o contador zera na hora.
  marcarAvisosVistos(avisosCache);
  const badge = document.getElementById("avisosBadge");
  if (badge) badge.hidden = true;
});
document.getElementById("avisosClose").addEventListener("click", () => {
  avisosPanel.classList.remove("open");
});
document.getElementById("avisosNovoBtn").addEventListener("click", async () => {
  const textarea = document.getElementById("avisosNovoTexto");
  const texto = textarea.value.trim();
  if (!texto) return;
  const btn = document.getElementById("avisosNovoBtn");
  btn.disabled = true;
  btn.textContent = "Lançando...";
  // O `finally` garante que o botão SEMPRE volta ao normal — antes, uma
  // falha de conexão no meio do envio deixava ele preso em "Lançando..."
  // desabilitado pra sempre (só F5 resolvia), e o texto do aviso ficava
  // refém dele. O texto digitado só é apagado quando o envio dá certo.
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "criarAviso", autor: DESIGNER_LOGADO, texto }),
    });
    const data = await res.json();
    if (data.ok) {
      textarea.value = "";
      avisosCache = await buscarAvisosDoBackend();
      renderAvisos();
      marcarAvisosVistos(avisosCache);
    } else {
      mostrarToast(data.error || "Não consegui lançar o aviso agora.", "erro");
    }
  } catch (err) {
    console.error("Falha ao lançar aviso:", err);
    mostrarToast("Falha de conexão. O aviso não foi lançado — o texto continua aí, tenta de novo.", "erro");
  } finally {
    btn.disabled = false;
    btn.textContent = "Lançar aviso";
  }
});

// Mesma lógica do _primeiraChecagemNotificacoes: não avisa na pílula
// pra cada aviso "velho" encontrado na primeira checagem da sessão
// (senão enche a tela de aviso antigo só de abrir o Colmeia).
let _primeiraChecagemAvisos = true;

// Checa avisos novos sozinho de vez em quando (mesmo sem o painel
// aberto), pra acender o sino e avisar na pílula quando chegar aviso novo.
async function atualizarBadgeAvisos() {
  const badge = document.getElementById("avisosBadge");
  if (!badge || !COLMEIA_API_URL) return;
  // Não fica buscando avisos com a tela de login aberta (ninguém logado) —
  // mesmo motivo da checagem no polling do quadro.
  if (!DESIGNER_LOGADO) return;
  avisosCache = await buscarAvisosDoBackend();
  const vistos = idsAvisosVistos();
  const novosAvisos = avisosCache.filter(a => !vistos.has(a.id));
  if (novosAvisos.length > 0) { badge.textContent = novosAvisos.length > 99 ? "99+" : String(novosAvisos.length); badge.hidden = false; }
  else badge.hidden = true;

  if (!_primeiraChecagemAvisos) {
    novosAvisos.forEach(a => {
      mostrarNotifNaPill({
        icone: `<svg viewBox="0 0 24 24" fill="none"><path d="M3 11l18-7-7 18-2.5-7.5L3 11z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        titulo: `Aviso de ${a.autor}`,
        subtitulo: a.texto,
        onClick: () => document.getElementById("avisosBtn").click(),
      });
    });
  }
  _primeiraChecagemAvisos = false;
}
atualizarBadgeAvisos();
setInterval(atualizarBadgeAvisos, 5 * 60 * 1000); // a cada 5 minutos

// ===== Reuniões da Google Agenda =====
// Avisa (pop-up na pílula) quando uma reunião de hoje está prestes a
// começar — o backend lê direto do Google Agenda de cada designer (ver
// buscarReunioesDeHoje em Código.gs), sem precisar de login separado
// (a conta que roda o Web App já enxerga a agenda de todo mundo).
const calendarIcon = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const _reunioesJaAvisadas = new Set();
let _reunioesDeHojeCache = [];

// IDs de reunião já vistos nessa sessão (localStorage, sobrevive a
// fechar/abrir o Colmeia) — usado só pra saber quais são "novas" (convite
// que acabou de chegar na agenda), pra mostrar a notificação de convite
// com Aceitar/Recusar. Igual ao padrão de _primeiraChecagemNotificacoes:
// na PRIMEIRA checagem da sessão isso só populariza o cache sem avisar
// de nada — senão toda reunião de hoje já cadastrada de antes apareceria
// como "nova" só por abrir o Colmeia.
const REUNIOES_VISTAS_KEY = "colmeia_reunioes_vistas_v1";
function idsReunioesVistas() {
  try { return new Set(JSON.parse(localStorage.getItem(REUNIOES_VISTAS_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function marcarReunioesComoVistas(ids) {
  try {
    const vistas = idsReunioesVistas();
    ids.forEach(id => vistas.add(id));
    // Mantém só as últimas 300 pra não crescer pra sempre no localStorage.
    localStorage.setItem(REUNIOES_VISTAS_KEY, JSON.stringify(Array.from(vistas).slice(-300)));
  } catch (e) { /* sem problema */ }
}
let _primeiraChecagemReunioes = true;
let _erroReuniaoJaAvisado = false;

async function verificarReunioesProximas() {
  if (!COLMEIA_API_URL || !DESIGNER_LOGADO) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "buscarReunioesHoje", designer: DESIGNER_LOGADO }),
    });
    const data = await res.json();
    if (!data.ok) {
      // Antes isso falhava em silêncio (sem badge, sem notificação, sem
      // pista nenhuma do motivo). Mostra o erro real UMA vez por sessão
      // pra dar pra diagnosticar (ex: permissão da agenda não autorizada
      // pra conta que publicou o Web App).
      if (!_erroReuniaoJaAvisado) {
        _erroReuniaoJaAvisado = true;
        mostrarToast("Não consegui checar sua agenda: " + (data.error || "erro desconhecido"), "erro");
      }
      return;
    }
    _reunioesDeHojeCache = data.reunioes;

    const vistas = idsReunioesVistas();
    const novas = data.reunioes.filter(r => !vistas.has(r.id));
    if (!_primeiraChecagemReunioes) {
      novas.forEach(r => {
        mostrarConviteDeReuniao(r);
        registrarNotificacaoGenerica({
          tipo: "reuniao",
          chave: "reuniao::" + r.id,
          titulo: `Nova reunião: ${r.titulo}`,
          subtitulo: `${new Date(r.inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${new Date(r.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${r.organizadorNome ? " · convite de " + r.organizadorNome : ""}`,
          icone: calendarIcon,
          link: r.link || null,
        });
      });
    }
    marcarReunioesComoVistas(data.reunioes.map(r => r.id));
    _primeiraChecagemReunioes = false;

    const agora = Date.now();
    data.reunioes.forEach(r => {
      const faltamMs = r.inicio - agora;
      // Só avisa (pop-up) quando falta até 15 min pra começar (e ainda
      // não começou) — e só uma vez por reunião (por id), mesmo que essa
      // checagem rode de novo várias vezes antes dela começar. O selo
      // FIXO (ver atualizarSeloReuniao) é separado disso — esse aqui é
      // só o aviso passageiro, de 15 min pra frente.
      if (faltamMs > 0 && faltamMs <= 15 * 60 * 1000 && !_reunioesJaAvisadas.has(r.id)) {
        _reunioesJaAvisadas.add(r.id);
        const minutos = Math.max(1, Math.round(faltamMs / 60000));
        mostrarNotifNaPill({
          icone: calendarIcon,
          titulo: `Reunião em ${minutos} min`,
          subtitulo: r.titulo,
          onClick: r.link ? () => window.open(r.link, "_blank") : undefined,
        });
      }
    });
    atualizarSeloReuniao();
  } catch (err) {
    console.error("Falha ao checar reuniões da agenda:", err);
  }
}
verificarReunioesProximas();
setInterval(verificarReunioesProximas, 3 * 60 * 1000); // a cada 3 minutos
// Rechecha na hora assim que a aba volta a ficar em foco — o momento
// mais comum de ter acabado de aceitar um convite em outra aba/app e
// voltado pro Colmeia, sem precisar esperar até 3 min pelo próximo poll.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") verificarReunioesProximas();
});

// Notificação de "convite novo" — mostra dia/hora, quem convidou e os
// botões de Aceitar/Recusar direto na ilha (a pílula compacta não tem
// espaço pra dois botões, por isso usa mostrarIlha diretamente em vez
// de mostrarNotifNaPill).
function mostrarConviteDeReuniao(r) {
  const dataObj = new Date(r.inicio);
  const hoje = new Date();
  const ehHoje = dataObj.toDateString() === hoje.toDateString();
  const diaLabel = ehHoje ? "hoje" : dataObj.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const horaLabel = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  mostrarIlha({
    icone: calendarIcon,
    titulo: `Nova reunião: ${r.titulo}`,
    subtitulo: `${diaLabel} às ${horaLabel}${r.organizadorNome ? " · convite de " + r.organizadorNome : ""}`,
    acoes: [
      { label: "Recusar", onClick: () => responderConviteReuniao(r.id, "nao") },
      { label: "Aceitar", principal: true, onClick: () => responderConviteReuniao(r.id, "sim") },
    ],
  });
}

async function responderConviteReuniao(eventId, resposta) {
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "responderReuniao", designer: DESIGNER_LOGADO, eventId, resposta }),
    });
    const data = await res.json();
    if (!data.ok) mostrarToast(data.error || "Não consegui responder o convite agora.", "erro");
  } catch (err) {
    console.error("Falha ao responder convite de reunião:", err);
    mostrarToast("Não consegui responder o convite agora.", "erro");
  }
}


// Selo fixo (não passageiro) no canto da pílula amarela, visível o
// tempo todo enquanto falta até 1h pra próxima reunião — some sozinho
// ~2 min depois do horário marcado (dá tempo de entrar na call sem o
// selo insistir "agora" pra sempre). Roda com mais frequência que a
// busca no backend (essa parte não precisa de rede, só reler o cache).
let _reuniaoAtualId = null;
function atualizarSeloReuniao() {
  const badge = document.getElementById("reuniaoBadge");
  const wrap = document.getElementById("nowPlayingWrap");
  const textoEl = document.getElementById("reuniaoBadgeTexto");
  if (!badge || !wrap || !textoEl) return;

  const agora = Date.now();
  // Entre as reuniões de hoje, pega a mais próxima que ainda faz sentido
  // mostrar (começa em até 1h, ou começou há até 2 min).
  const candidata = _reunioesDeHojeCache
    .filter(r => (r.inicio - agora) <= 60 * 60 * 1000 && (r.inicio - agora) >= -2 * 60 * 1000)
    .sort((a, b) => a.inicio - b.inicio)[0];

  if (!candidata) {
    badge.hidden = true;
    wrap.classList.remove("tem-reuniao-proxima");
    _reuniaoAtualId = null;
    return;
  }

  // Mostra o horário exato (ex: "Reunião às 15:30") em vez de uma
  // contagem em minutos — a contagem tinha que ficar sendo reavaliada
  // toda hora e passava a impressão de errar/pular quando o degrau
  // mudava; o horário fixo não muda nunca até a reunião acontecer.
  const horaLabel = new Date(candidata.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  textoEl.textContent = `Reunião às ${horaLabel}`;
  badge.title = candidata.titulo;
  badge.onclick = candidata.link ? () => window.open(candidata.link, "_blank") : null;
  badge.classList.toggle("clicavel", !!candidata.link);
  badge.hidden = false;
  wrap.classList.add("tem-reuniao-proxima");
  _reuniaoAtualId = candidata.id;
}
setInterval(atualizarSeloReuniao, 20 * 1000); // recalcula o texto a cada 20s (sem precisar de rede)

// Acesso rápido — painel lateral recolhível
const quickAccessPanel = document.getElementById("quickAccessPanel");
document.getElementById("quickAccessBtn").addEventListener("click", () => {
  quickAccessPanel.classList.toggle("open");
});
document.getElementById("quickAccessClose").addEventListener("click", () => {
  quickAccessPanel.classList.remove("open");
});

// Modal "Ver regra"
const ruleModalOverlay = document.getElementById("ruleModalOverlay");
document.getElementById("ruleModalClose").addEventListener("click", () => {
  ruleModalOverlay.hidden = true;
});
ruleModalOverlay.addEventListener("click", e => {
  if (e.target === ruleModalOverlay) ruleModalOverlay.hidden = true;
});

// Modal "Pessoas conhecidas" (aberto clicando no perfil na barra lateral)
const peopleModalOverlay = document.getElementById("peopleModalOverlay");
document.getElementById("sidebarProfileLink").addEventListener("click", e => {
  e.preventDefault();
  if (PAPEL_LOGADO !== "coordenador") return; // só o coordenador mexe nessas configurações
  abrirPainelPessoas();
});
document.getElementById("peopleModalClose").addEventListener("click", () => {
  peopleModalOverlay.hidden = true;
});
peopleModalOverlay.addEventListener("click", e => {
  if (e.target === peopleModalOverlay) peopleModalOverlay.hidden = true;
});
document.getElementById("configTabPessoas").addEventListener("click", () => {
  configTabAtiva = "pessoas";
  atualizarAbasConfig();
});
document.getElementById("configTabClientes").addEventListener("click", () => {
  configTabAtiva = "clientes";
  atualizarAbasConfig();
});

/**
 * Roda tudo que o Colmeia precisa pra funcionar de verdade — só chamada
 * depois que o login (ou uma sessão salva) confirma quem está usando.
 */
