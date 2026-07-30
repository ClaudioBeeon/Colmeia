// ============================================
// Base do front-end: ícones, definição das colunas do quadro, URLs das
// APIs (Colmeia e painel-designers-beeon), calendário próprio, avisinhos
// (toast/ilha/pílula) e a notificação que sobe dentro da pílula amarela.
// É o primeiro arquivo carregado — todos os outros contam com o que está
// aqui, então nada aqui pode depender deles.
// ============================================

const dueIcon = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const discordIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 6.3a15 15 0 00-3.6-1.1l-.2.4a13 13 0 013.1 1.1 12.6 12.6 0 00-11.9 0 13 13 0 013.1-1.1l-.2-.4A15 15 0 005.6 6.3C3.6 9.3 3 12.2 3.2 15a15 15 0 004.4 2.2l.6-1a9.6 9.6 0 01-1.7-.8l.4-.3a11.3 11.3 0 009.8 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1A15 15 0 0020.8 15c.3-3.2-.5-6.1-1.9-8.7zM9.7 13.4c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5zm4.6 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5z"/></svg>`;
const chatIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 1112.6 6.5L4 21l1.9-6.1A7.96 7.96 0 014 12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const reopenIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4.5 15a8 8 0 0014.5 3.5M19.5 9A8 8 0 005 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Seta diagonal da "bolha" do canto dos cards orgânicos (página Histórico).
const abrirCantoIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// Setas do carrossel (Histórico/Atividades recentes) — avançar/voltar
// em vez de ter que arrastar o scroll pro lado.
const carrosselSetaIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Avatar de CLIENTE (inicial + cor fixa por nome) — usado em vez da
// foto de designer nos cards que representam um cliente/atividade (ex:
// Histórico, Atividades recentes), já que ali "quem é" o card é o
// cliente, não a pessoa. Mesmo cliente sempre cai na mesma cor (hash
// simples do nome), sem precisar cadastrar nada.
const CORES_AVATAR_CLIENTE = ["#F76707", "#1971C2", "#2F9E44", "#E8590C", "#7048E8", "#0CA678", "#C2255C", "#5C7CFA", "#F08C00", "#0C8599", "#D6336C", "#37B24D"];
function corDoCliente(nomeCliente) {
  const s = String(nomeCliente || "?");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return CORES_AVATAR_CLIENTE[hash % CORES_AVATAR_CLIENTE.length];
}
function avatarClienteHTML(nomeCliente, sizeClass) {
  const nome = (nomeCliente || "?").trim();
  const inicial = (nome.charAt(0) || "?").toUpperCase();
  return `<div class="avatar avatar-cliente ${sizeClass || ""}" style="background:${corDoCliente(nome)}" title="${escaparHTML(nome)}">${inicial}</div>`;
}

// Liga as setas de um carrossel horizontal (troca o "arrastar scroll pro
// lado" por um botão de avançar/voltar) — usado em Histórico e
// Atividades recentes. Habilita/desabilita sozinho conforme a posição.
function montarCarrosselSetas(trackEl, prevBtn, nextBtn) {
  if (!trackEl || !prevBtn || !nextBtn) return;
  const atualizar = () => {
    prevBtn.disabled = trackEl.scrollLeft <= 4;
    nextBtn.disabled = trackEl.scrollLeft >= trackEl.scrollWidth - trackEl.clientWidth - 4;
  };
  prevBtn.onclick = () => trackEl.scrollBy({ left: -(trackEl.clientWidth * 0.9), behavior: "smooth" });
  nextBtn.onclick = () => trackEl.scrollBy({ left: trackEl.clientWidth * 0.9, behavior: "smooth" });
  trackEl.onscroll = atualizar;
  atualizar();
}

const columnsDef = [
  { key: "pendentes", label: "Pendentes", hex: "var(--text-muted)" },
  { key: "prioridades", label: "Prioridades", hex: "var(--danger)" },
  { key: "fazendo", label: "Fazendo", hex: "var(--accent)" },
  { key: "revisao", label: "Revisão", hex: "var(--purple)" },
  { key: "ajustes", label: "Ajustes", hex: "var(--warning)" },
];

// dia 24 = "hoje" na simulação
// (o "hoje" de verdade agora vem de hojeISO(), calculado dinamicamente)

// ============================================
// INTEGRAÇÃO REAL — Google Apps Script (Code.gs) + Runrun.it
// ============================================
// Cole aqui a URL do seu Web App do Apps Script depois de publicar o
// Code.gs (Implantar > Nova implantação > Aplicativo da web).
// Enquanto não colar, o Colmeia continua usando os dados fake abaixo.
const COLMEIA_API_URL = "https://script.google.com/macros/s/AKfycbxSKcto3u-463xmhUm2xGUIylkWzYyeU-L-QHEz0bnFPImsl7Vlum5bZJU5vDT-5gOI/exec";

// URL do Web App do painel-designers-beeon (o outro painel, já publicado).
// O Colmeia só faz leitura aqui — nunca escreve nada nesse painel.
const PAINEL_BEEON_API_URL = "https://script.google.com/macros/s/AKfycbzzWtG4jkVpLvPwOAHaj-h9KK9k_8N6YWGUXfFtUDSXRiCj7ILDPvuSy9VJXhglTrzEQQ/exec";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_COMPLETOS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const DIAS_SEMANA_ABREV = ["D", "S", "T", "Q", "Q", "S", "S"];
(function atualizarPillDeData() {
  const el = document.getElementById("topbarDateText");
  if (!el) return;
  const agora = new Date();
  el.textContent = `${agora.getDate()} ${MESES_COMPLETOS[agora.getMonth()]}`;
})();

/**
 * Posiciona um elemento position:fixed grudado perto de uma âncora —
 * embaixo se tiver espaço na tela, em cima se não tiver (ex: perto do
 * fim da tela). Usado por qualquer pop-up "solto" (calendário, avisos
 * como o de transferir o card mãe) que abre fora do fluxo normal do
 * layout, direto no body.
 */
function posicionarPopupFixo(popupEl, ancoraEl) {
  const rect = ancoraEl.getBoundingClientRect();
  const alturaPopup = popupEl.offsetHeight || 220;
  const larguraPopup = popupEl.offsetWidth || 260;
  const espacoAbaixo = window.innerHeight - rect.bottom;
  const abrirParaCima = espacoAbaixo < alturaPopup + 12 && rect.top > alturaPopup + 12;

  let left = Math.min(rect.left, window.innerWidth - larguraPopup - 8);
  left = Math.max(8, left);
  popupEl.style.left = left + "px";
  popupEl.style.top = abrirParaCima ? (rect.top - alturaPopup - 8) + "px" : (rect.bottom + 8) + "px";
}

/**
 * Calendário próprio do Colmeia — substitui o <input type="date"> nativo
 * do navegador em todo lugar que edita data (card do quadro, pop-up de
 * detalhe, fila de repasse). Abre grudado perto de `ancoraEl` (embaixo
 * ou em cima, conforme o espaço na tela), com navegação de mês, destaque
 * pro dia de hoje e pro dia já selecionado.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.ancoraEl - elemento perto de onde abrir
 * @param {string} opts.valorInicial - data em AAAA-MM-DD (ou "" pra hoje)
 * @param {function} opts.onEscolher - chamado com a data escolhida (AAAA-MM-DD)
 * @param {function} [opts.onFechar] - chamado se fechar sem escolher nada
 */
function abrirCalendarioColmeia({ ancoraEl, valorInicial, onEscolher, onFechar }) {
  document.querySelectorAll(".colmeia-calendario").forEach(el => el.remove());

  const hoje = new Date();
  const partesIniciais = valorInicial ? valorInicial.split("-").map(Number) : null;
  let anoView = partesIniciais ? partesIniciais[0] : hoje.getFullYear();
  let mesView = partesIniciais ? partesIniciais[1] - 1 : hoje.getMonth(); // 0-indexado

  const cal = document.createElement("div");
  cal.className = "colmeia-calendario";
  document.body.appendChild(cal);

  function isoDia(ano, mesZero, dia) {
    return `${ano}-${String(mesZero + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  function renderCalendario() {
    const primeiroDiaSemana = new Date(anoView, mesView, 1).getDay();
    const totalDias = new Date(anoView, mesView + 1, 0).getDate();
    const hojeISOStr = isoDia(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const nomeMes = MESES_COMPLETOS[mesView][0] + MESES_COMPLETOS[mesView].slice(1).toLowerCase();

    let celulas = "";
    for (let i = 0; i < primeiroDiaSemana; i++) celulas += `<span class="colmeia-cal-dia vazio"></span>`;
    for (let d = 1; d <= totalDias; d++) {
      const iso = isoDia(anoView, mesView, d);
      const classes = ["colmeia-cal-dia"];
      if (iso === hojeISOStr) classes.push("hoje");
      if (iso === valorInicial) classes.push("selecionado");
      celulas += `<button type="button" class="${classes.join(" ")}" data-iso="${iso}">${d}</button>`;
    }

    cal.innerHTML = `
      <div class="colmeia-cal-head">
        <button type="button" class="colmeia-cal-nav" data-dir="-1" aria-label="Mês anterior">
          <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="colmeia-cal-titulo">${nomeMes} ${anoView}</span>
        <button type="button" class="colmeia-cal-nav" data-dir="1" aria-label="Próximo mês">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="colmeia-cal-semana">${DIAS_SEMANA_ABREV.map(d => `<span>${d}</span>`).join("")}</div>
      <div class="colmeia-cal-grid">${celulas}</div>
      <div class="colmeia-cal-footer">
        <button type="button" class="colmeia-cal-hoje">Hoje</button>
      </div>
    `;

    cal.querySelectorAll(".colmeia-cal-nav").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        mesView += Number(btn.dataset.dir);
        if (mesView < 0) { mesView = 11; anoView--; }
        if (mesView > 11) { mesView = 0; anoView++; }
        renderCalendario();
        posicionar();
      });
    });
    cal.querySelectorAll(".colmeia-cal-dia:not(.vazio)").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const iso = btn.dataset.iso;
        fechar();
        onEscolher(iso);
      });
    });
    cal.querySelector(".colmeia-cal-hoje").addEventListener("click", e => {
      e.stopPropagation();
      const iso = isoDia(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      fechar();
      onEscolher(iso);
    });
  }

  function posicionar() {
    posicionarPopupFixo(cal, ancoraEl);
  }

  function fechar() {
    cal.remove();
    document.removeEventListener("click", clickFora);
    document.removeEventListener("keydown", teclaEsc);
  }
  function clickFora(ev) {
    if (!cal.contains(ev.target) && ev.target !== ancoraEl && !ancoraEl.contains(ev.target)) {
      fechar();
      if (onFechar) onFechar();
    }
  }
  function teclaEsc(ev) {
    if (ev.key === "Escape") { fechar(); if (onFechar) onFechar(); }
  }

  renderCalendario();
  posicionar();
  setTimeout(() => {
    document.addEventListener("click", clickFora);
    document.addEventListener("keydown", teclaEsc);
  }, 0);
}

// Guarda os dados lidos do painel-designers-beeon (designers, clientes,
// atendimento, fotos) depois que carregarDadosPainelBeeon() rodar.
// Formato: { designers: [...], roles: {...}, state: {...}, fotos: {...} }
let painelBeeonData = null;

/**
 * Busca (só leitura, GET) o estado completo do painel-designers-beeon:
 * lista de designers, papel/especialidade de cada um, e o mapa
 * designer -> lista de clientes (com escopo, atendimento, serviços etc).
 *
 * IMPORTANTE: nunca faz POST pra esse painel — só GET. O Colmeia não
 * altera nada lá.
 *
 * Na primeira vez, mostra no console do navegador (F12 > Console) a
 * estrutura crua que veio, pra confirmarmos onde ficam as fotos de
 * cada designer/cliente (o nome exato do campo pode variar).
 */
/**
 * Busca as atividades recentes do Drive (uploads de arquivo) que já
 * existem no painel-designers-beeon — mesmo cache que alimenta o card
 * "Atividade recente" de lá.
 *
 * NÃO é mais usada pela notificação de upload dentro do pop-up de
 * tarefa (ver renderNotificacoesUpload) — aquela agora checa a pasta
 * do próprio card direto pelo Code.gs do Colmeia (instantâneo, sem
 * depender do cache de 10 minutos do painel). Deixada aqui por se um
 * dia precisar de uma visão geral de atividades fora do contexto de
 * uma tarefa específica.
 */
async function buscarAtividadesPainelBeeon() {
  if (!PAINEL_BEEON_API_URL) return [];
  try {
    const res = await fetch(PAINEL_BEEON_API_URL + "?tipo=atividades");
    const data = await res.json();
    return data.ok ? (data.atividades || []) : [];
  } catch (err) {
    console.error("Falha ao buscar atividades do painel-beeon:", err);
    return [];
  }
}

// Só avisa sobre upload que aconteceu nas últimas 3 horas — depois
// disso não faz mais sentido como "notificação" do momento.
const JANELA_NOTIFICACAO_UPLOAD_MS = 3 * 60 * 60 * 1000;

/**
 * Aviso rápido (toast) que aparece embaixo da tela e some sozinho —
 * usado quando uma ação que mexe em dado de verdade (mover etapa,
 * salvar comentário, repassar tarefa, etc) falha de verdade. Antes
 * essas falhas só apareciam no console do navegador (ninguém via).
 */
function mostrarToast(mensagem, tipo) {
  let container = document.getElementById("colmeiaToasts");
  if (!container) {
    container = document.createElement("div");
    container.id = "colmeiaToasts";
    container.className = "colmeia-toasts";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "colmeia-toast" + (tipo === "erro" ? " erro" : "");
  toast.textContent = mensagem;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 4200);
}

/**
 * "Ilha" do topbar — pílula que aparece por cima de tudo (position:
 * fixed, sempre visível, nunca escondida atrás de modal nenhum) pra
 * avisar de um evento rápido: comentário novo, aviso novo, upload no
 * Drive, tarefa recebida via repasse, tarefa entregue, card mãe
 * esperando transferência. Some sozinha depois de alguns segundos —
 * exceto quando tem botões de ação (aí espera a pessoa decidir).
 *
 * Se vários eventos chegarem juntos, entram numa fila e aparecem um de
 * cada vez (nunca dois empilhados ao mesmo tempo).
 *
 * mostrarIlha({
 *   icone: "<svg>...</svg>",
 *   titulo: "texto principal",
 *   subtitulo: "texto secundário (opcional)",
 *   duracaoMs: 5000,               // ignorado se tiver `acoes`
 *   onClick: () => {...},          // clique no corpo (opcional)
 *   acoes: [{ label, principal, onClick }],  // botões (opcional)
 * })
 */
const _ilhaFila = [];
let _ilhaMostrandoAgora = false;
let _ilhaTimeoutAtual = null;
// Guarda o evento que está aparecendo na ilha AGORA (não só os que
// ainda estão esperando na fila) — precisa disso pra poder "migrar" ele
// de volta pra pílula se a aba de tarefa fechar enquanto ele ainda está
// na tela (ver migrarIlhaAmbienteParaPill mais abaixo).
let _ilhaEventoAtual = null;

function mostrarIlha(evento) {
  _ilhaFila.push(evento);
  _processarProximaIlha();
}

function _processarProximaIlha() {
  if (_ilhaMostrandoAgora) return;
  const proxima = _ilhaFila.shift();
  if (!proxima) return;
  _ilhaMostrandoAgora = true;
  _renderIlha(proxima);
}

function _renderIlha(evento) {
  _ilhaEventoAtual = evento;
  const ilha = document.getElementById("topbarIlha");
  if (!ilha) { _ilhaMostrandoAgora = false; _ilhaEventoAtual = null; _processarProximaIlha(); return; }

  ilha.innerHTML = `
    <span class="ilha-icone">${evento.icone || chatIcon}</span>
    <div class="ilha-texto">
      <span class="ilha-titulo">${evento.titulo}</span>
      ${evento.subtitulo ? `<span class="ilha-subtitulo">${evento.subtitulo}</span>` : ""}
    </div>
    ${evento.acoes ? `
      <div class="ilha-acoes">
        ${evento.acoes.map((a, i) => `<button type="button" class="${a.principal ? "ilha-acao-principal" : ""}" data-i="${i}">${a.label}</button>`).join("")}
      </div>
    ` : ""}
  `;
  ilha.hidden = false;
  ilha.classList.remove("ilha-saindo");
  requestAnimationFrame(() => ilha.classList.add("ilha-entrando"));

  // Centraliza verticalmente com a pílula amarela (o CSS usava um
  // "top" fixo que não bate com a altura real da pílula em toda tela/
  // zoom — mede a posição de verdade e alinha os dois centros. Espera
  // o próximo frame pra já ter a altura certa do conteúdo que acabou
  // de entrar no innerHTML.
  const pillWrap = document.getElementById("nowPlayingWrap");
  if (pillWrap) {
    const centroY = pillWrap.getBoundingClientRect().top + pillWrap.getBoundingClientRect().height / 2;
    requestAnimationFrame(() => {
      ilha.style.top = (centroY - ilha.getBoundingClientRect().height / 2) + "px";
    });
  }

  ilha.onclick = evento.onClick
    ? (ev) => { if (ev.target.closest(".ilha-acoes")) return; evento.onClick(); _fecharIlhaAtual(); }
    : null;
  ilha.classList.toggle("clicavel", !!evento.onClick);

  if (evento.acoes) {
    ilha.querySelectorAll(".ilha-acoes button").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const acao = evento.acoes[Number(btn.dataset.i)];
        _fecharIlhaAtual();
        if (acao.onClick) acao.onClick();
      });
    });
  }

  clearTimeout(_ilhaTimeoutAtual);
  // Evento com botões de ação fica até a pessoa decidir — não some
  // sozinho (senão a decisão se perde sem querer).
  if (!evento.acoes) {
    _ilhaTimeoutAtual = setTimeout(_fecharIlhaAtual, evento.duracaoMs || 5000);
  }
}

function _fecharIlhaAtual() {
  const ilha = document.getElementById("topbarIlha");
  if (!ilha) return;
  clearTimeout(_ilhaTimeoutAtual);
  ilha.classList.remove("ilha-entrando");
  ilha.classList.add("ilha-saindo");
  setTimeout(() => {
    ilha.hidden = true;
    _ilhaMostrandoAgora = false;
    _ilhaEventoAtual = null;
    _processarProximaIlha();
  }, 220);
}

/**
 * Chamada quando a aba de tarefa fecha (ver closeDetail em
 * js/detalhe-modal.js) — se tinha alguma notificação ambiente (a única
 * coisa que ainda usa mostrarIlha hoje: comentário, aviso, upload,
 * repasse recebido) mostrando ou esperando na ilha flutuante só porque
 * a pílula estava coberta pelo painel de detalhe, muda ela pra pílula
 * agora que ela ficou livre de novo — em vez de deixar flutuando à toa
 * até o tempo dela acabar sozinho.
 */
function migrarIlhaAmbienteParaPill() {
  const pendentes = _ilhaFila.splice(0, _ilhaFila.length);
  if (_ilhaEventoAtual) pendentes.unshift(_ilhaEventoAtual);
  if (pendentes.length === 0) return;

  if (_ilhaMostrandoAgora) {
    const ilha = document.getElementById("topbarIlha");
    if (ilha) {
      clearTimeout(_ilhaTimeoutAtual);
      ilha.classList.remove("ilha-entrando");
      ilha.classList.add("ilha-saindo");
      setTimeout(() => { ilha.hidden = true; }, 220);
    }
    _ilhaMostrandoAgora = false;
    _ilhaEventoAtual = null;
  }
  pendentes.forEach(ev => _pillNotifFila.push(ev));
  _processarProximaNotifPill();
}

/**
 * Notificação "ambiente" (comentário novo, aviso, upload no Drive,
 * tarefa recebida via repasse) mostrada DENTRO da própria pílula
 * amarela — sobe no lugar da tarefa rodando/ociosa, fica um tempinho, e
 * desce de volta sozinha. Mesma assinatura de mostrarIlha(), sem
 * suporte a `acoes` (a pílula é compacta demais pra botões — eventos
 * que precisam de decisão continuam usando mostrarIlha diretamente).
 *
 * Só funciona quando não tem nenhuma aba de tarefa aberta — o painel de
 * detalhe é fixed e cobre a pílula quando está aberto (ver .task-detail
 * no style.css), então nesse caso cai pra ilha flutuante do topo, que
 * fica sempre visível independente do que estiver na tela.
 */
// Cooldown genérico por "chave de evento" (ex: "repasse::123"), salvo
// no localStorage — usado por notificações que comparam dois polls
// consecutivos (repasse recebido, entrou em Ajustes): sem isso, se o
// campo comparado "piscar" entre dois valores de um poll pro outro
// (glitch pontual da API do Runrun.it), a mesma tarefa fica repetindo
// o mesmo pop-up sem parar. Não serve pra notificação de comentário —
// essa já dedupe por id de comentário, de forma permanente, no próprio
// log (ver js/notificacoes-avisos.js).
const NOTIF_EVENTO_COOLDOWN_MS = 20 * 60 * 1000; // 20 min
const NOTIF_EVENTO_COOLDOWN_KEY = "colmeia_notif_evento_cooldown_v1";
function _jaNotificadoRecentemente(chave) {
  try {
    const mapa = JSON.parse(localStorage.getItem(NOTIF_EVENTO_COOLDOWN_KEY) || "{}");
    return !!mapa[chave] && (Date.now() - mapa[chave]) < NOTIF_EVENTO_COOLDOWN_MS;
  } catch (err) { return false; }
}
function _marcarNotificadoAgora(chave) {
  try {
    const mapa = JSON.parse(localStorage.getItem(NOTIF_EVENTO_COOLDOWN_KEY) || "{}");
    mapa[chave] = Date.now();
    // Aproveita e limpa entradas velhas, senão essa chave cresce pra
    // sempre no localStorage.
    Object.keys(mapa).forEach(k => { if ((Date.now() - mapa[k]) > NOTIF_EVENTO_COOLDOWN_MS) delete mapa[k]; });
    localStorage.setItem(NOTIF_EVENTO_COOLDOWN_KEY, JSON.stringify(mapa));
  } catch (err) { /* sem problema */ }
}

const _pillNotifFila = [];
let _pillNotifMostrandoAgora = false;
let _pillNotifTimeout = null;

function mostrarNotifNaPill(evento) {
  const detalheAberto = document.getElementById("taskDetail")?.classList.contains("visible");
  if (detalheAberto) { mostrarIlha(evento); return; }
  _pillNotifFila.push(evento);
  _processarProximaNotifPill();
}

function _processarProximaNotifPill() {
  if (_pillNotifMostrandoAgora) return;
  const proxima = _pillNotifFila.shift();
  if (!proxima) return;
  _pillNotifMostrandoAgora = true;
  _renderNotifPill(proxima, /* trocaInterna */ false);
}

function _renderNotifPill(evento, trocaInterna) {
  const wrap = document.getElementById("nowPlayingWrap");
  const notif = document.getElementById("pillNotif");
  if (!wrap || !notif) { _pillNotifMostrandoAgora = false; _processarProximaNotifPill(); return; }

  notif.innerHTML = `
    <span class="pill-notif-conteudo">
      <span class="pill-notif-icone">${evento.icone || chatIcon}</span>
      <span class="pill-notif-texto">${evento.titulo}${evento.subtitulo ? ` · ${evento.subtitulo}` : ""}</span>
    </span>
  `;
  notif.hidden = false;
  notif.onclick = evento.onClick ? () => { evento.onClick(); _avancarNotifPill(); } : null;
  notif.classList.toggle("clicavel", !!evento.onClick);

  // Já estava mostrando outra notificação (troca dentro da fila) — o
  // "sobe/desce" da pílula já aconteceu antes, só a animaçãozinha de
  // pop do conteúdo (via CSS, ver .pill-notif-conteudo) já dá o aviso
  // de troca. Só na primeira dispara o carrossel sobe/desce de verdade.
  if (!trocaInterna) wrap.classList.add("pill-notif-ativa");

  clearTimeout(_pillNotifTimeout);
  _pillNotifTimeout = setTimeout(_avancarNotifPill, evento.duracaoMs || 4500);
}

function _avancarNotifPill() {
  clearTimeout(_pillNotifTimeout);
  const proxima = _pillNotifFila.shift();
  if (proxima) {
    _renderNotifPill(proxima, /* trocaInterna */ true);
  } else {
    const wrap = document.getElementById("nowPlayingWrap");
    if (wrap) wrap.classList.remove("pill-notif-ativa"); // desce de volta (mesma transição, sentido contrário)
    setTimeout(() => {
      const notif = document.getElementById("pillNotif");
      if (notif) notif.hidden = true;
      _pillNotifMostrandoAgora = false;
      _processarProximaNotifPill();
    }, 320);
  }
}
