// ===== Navegador dentro do Colmeia (programa de desktop) — 2026-10-05 =====
//
// Só existe no programa de desktop (desktop/): `window.__TAURI_INTERNALS__` é
// o que o programa põe na página. No navegador comum este arquivo não faz
// NADA — nem cria elemento, nem registra clique.
//
// O QUE FAZ (protótipo 3, aprovado pelo Cláudio):
//  - cada site do Acesso rápido abre numa ABA, que vira uma bolinha na barra da
//    esquerda (clique troca de site; × ou botão do meio fecha);
//  - com um site ativo, o pill amarelo vira a BARRA DE ENDEREÇO (voltar,
//    avançar, recarregar, endereço) e a tarefa que está rodando vai pra uma
//    cápsula preta no fim dele, com play/pause e o tempo;
//  - TELA DIVIDIDA: o site ocupa 1/2 ou 1/3 da largura e o Colmeia continua
//    usável ao lado (pegar uma informação aqui e colar no site);
//  - clicar na cápsula da tarefa abre um painel COMPACTO da tarefa na lateral
//    direita (mesmo jeito do Acesso rápido e das notificações), em vez da tela
//    inteira da tarefa.
//
// COMO O SITE APARECE: o programa cria uma telinha nativa por site, POR CIMA da
// página (uma página não consegue ficar em cima de uma telinha nativa). Quem
// manda no tamanho e na posição é ESTE arquivo: mede o espaço livre da página
// (`navRect`) e avisa o programa. Por isso, quando um painel lateral abre e
// empurra o resto pra esquerda, o site encolhe sozinho (ResizeObserver no
// `.main`) — nada aqui conhece a largura de painel nenhum.
//
// ⚠️ Os sites NÃO recebem comando nenhum do programa: só esta janela
// (capabilities/main.json). Endereços que não são http/https nunca abrem aqui.

(function () {
  const ponte = window.__TAURI_INTERNALS__;
  if (!ponte) return;

  const CHAVE_ABAS = "colmeia_navegador_abas_v1";   // abas abertas (por computador)
  const CHAVE_MODO = "colmeia_navegador_modo_v1";   // cheia | meio | terco
  const FRACAO = { cheia: 1, meio: 0.5, terco: 0.34 };
  const ORDEM_MODOS = ["cheia", "meio", "terco"];
  const NOME_MODO = { cheia: "Tela cheia", meio: "Dividida ao meio", terco: "Dividida (site menor)" };
  const CORES = ["#3B4BA8", "#0E8F8A", "#C77D1A", "#8A3FA0", "#B4432B", "#2F6FBF", "#5A7D2A", "#A03F63"];

  const invocar = (cmd, args) => ponte.invoke(cmd, args || {});

  let abas = lerAbas();
  let ativa = null;                 // id da aba em primeiro plano; null = Colmeia
  let modo = lerModo();
  let painelTarefaAberto = false;
  let rectEnviando = false;

  // ---------- persistência ----------
  function lerAbas() {
    try {
      const l = JSON.parse(localStorage.getItem(CHAVE_ABAS) || "[]");
      return Array.isArray(l) ? l.filter(a => a && a.id && /^https?:\/\//.test(a.url || "")) : [];
    } catch (e) { return []; }
  }
  function salvarAbas() { try { localStorage.setItem(CHAVE_ABAS, JSON.stringify(abas)); } catch (e) { /* sem armazenamento: segue sem lembrar */ } }
  function lerModo() {
    try { const m = localStorage.getItem(CHAVE_MODO); return FRACAO[m] ? m : "cheia"; } catch (e) { return "cheia"; }
  }

  // ---------- endereços e identidade visual ----------
  function normalizarEndereco(texto) {
    let t = String(texto || "").trim();
    if (!t) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:/i.test(t)) return null; // mailto:, adbps:... não abrem aqui
    if (!/^https?:\/\//i.test(t)) {
      // "algo.com.br/rota" vira endereço; o resto vira busca.
      if (/^[^\s]+\.[^\s]{2,}$/.test(t) && !/\s/.test(t)) t = "https://" + t;
      else return "https://www.google.com/search?q=" + encodeURIComponent(t);
    }
    try { return new URL(t).href; } catch (e) { return null; }
  }
  function idDoSite(url) {
    const host = new URL(url).hostname.replace(/^www\./, "");
    let h = 0;
    for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
    return "s" + h.toString(36);
  }
  function corDoSite(url) {
    const host = new URL(url).hostname;
    let h = 0;
    for (let i = 0; i < host.length; i++) h = (h * 17 + host.charCodeAt(i)) >>> 0;
    return CORES[h % CORES.length];
  }
  function siglaDe(nome) {
    const p = String(nome || "?").trim().split(/\s+/);
    return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
  }
  const esc = s => (typeof escaparHTML === "function" ? escaparHTML(s) : String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const abaDe = id => abas.find(a => a.id === id);

  // ---------- peças da tela (criadas aqui, o index.html não muda) ----------
  const ICONES = {
    voltar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    avancar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    recarregar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5"/></svg>',
    cadeado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
    dividir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    fechar: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  };

  const area = document.createElement("div");           // fundo do espaço do site (aparece enquanto a telinha carrega)
  area.id = "navegadorArea";
  area.hidden = true;
  area.innerHTML = '<span class="nav-area-msg">Abrindo…</span>';
  document.body.appendChild(area);

  const pill = document.createElement("div");           // a barra de endereço (dentro do pill amarelo)
  pill.className = "nav-pill";
  pill.id = "navPill";
  pill.hidden = true;
  pill.innerHTML =
    '<div class="nav-pill-btns">' +
      `<button type="button" data-nav="voltar" title="Voltar" aria-label="Voltar">${ICONES.voltar}</button>` +
      `<button type="button" data-nav="avancar" title="Avançar" aria-label="Avançar">${ICONES.avancar}</button>` +
      `<button type="button" data-nav="recarregar" title="Recarregar" aria-label="Recarregar">${ICONES.recarregar}</button>` +
    '</div>' +
    `<form class="nav-pill-end" id="navEndForm">${ICONES.cadeado}<input type="text" id="navEndInput" spellcheck="false" autocomplete="off" aria-label="Endereço"></form>` +
    `<button type="button" class="nav-pill-dividir" id="navDividirBtn" aria-label="Dividir a tela">${ICONES.dividir}</button>` +
    '<div class="nav-pill-tarefa" id="navPillTarefa" role="button" tabindex="0" title="Abrir a tarefa ao lado">' +
      '<span class="nav-tk-pp" id="navTkPP" role="button" aria-label="Pausar ou retomar"></span>' +
      '<span class="nav-tk-tempo" id="navTkTempo">--:--:--</span>' +
    '</div>';
  const wrap = document.getElementById("nowPlayingWrap");
  if (wrap) wrap.appendChild(pill);

  const bloco = document.createElement("div");          // as abas, dentro da barra da esquerda
  bloco.className = "nav-sites";
  bloco.id = "navSites";
  const navLateral = document.querySelector(".sidebar-nav");
  if (navLateral) navLateral.appendChild(bloco);

  const painel = document.createElement("aside");       // painel compacto da tarefa (irmão do Acesso rápido)
  painel.className = "quick-access-panel nav-tarefa-panel";
  painel.id = "navTarefaPanel";
  painel.innerHTML =
    `<div class="quick-access-header"><h3>Tarefa</h3><button type="button" id="navTarefaFechar" aria-label="Fechar">${ICONES.fechar}</button></div>` +
    '<div class="quick-access-body nav-tarefa-body" id="navTarefaBody"></div>';
  const painelAcesso = document.getElementById("quickAccessPanel");
  if (painelAcesso && painelAcesso.parentNode) painelAcesso.parentNode.insertBefore(painel, painelAcesso.nextSibling);

  // ---------- posição do site ----------
  function navRect() {
    const main = document.querySelector(".page > .main");
    const topo = document.querySelector(".page > .main > .topbar");
    if (!main || !topo) return null;
    const m = main.getBoundingClientRect(), t = topo.getBoundingClientRect();
    const y = Math.round(t.bottom + 12);
    const largura = Math.round(m.width * FRACAO[modo]);
    return { x: Math.round(m.right - largura), y, w: largura, h: Math.max(1, Math.round(m.bottom - y)), esq: Math.round(m.left) };
  }
  // A telinha nativa do site é RETANGULAR e não dá pra arredondar. A moldura
  // (#navegadorArea) é arredondada e o site fica dentro dela, com uma folga de
  // NAV_FOLGA em cada lado — o canto quadrado do site cabe dentro do arredondado.
  const NAV_FOLGA = 8;
  const retDoSite = r => ({ x: r.x + NAV_FOLGA, y: r.y + NAV_FOLGA, w: Math.max(1, r.w - 2 * NAV_FOLGA), h: Math.max(1, r.h - 2 * NAV_FOLGA) });
  function pintarArea(r) {
    area.style.left = r.x + "px"; area.style.top = r.y + "px";
    area.style.width = r.w + "px"; area.style.height = r.h + "px";
    // O card da tarefa (tela grande), no modo dividido, começa ABAIXO do pill.
    document.documentElement.style.setProperty("--nav-topo", r.y + "px");
    document.documentElement.style.setProperty("--nav-esq", r.esq + "px");
    // Reserva da direita pro resto da página (Colmeia) no modo dividido.
    document.documentElement.style.setProperty("--nav-reserva", modo === "cheia" ? "0px" : (r.w + 14) + "px");
  }
  function enviarRect() {
    if (!ativa || rectEnviando) return;
    rectEnviando = true;
    requestAnimationFrame(async () => {
      rectEnviando = false;
      const r = navRect(); if (!r || !ativa) return;
      pintarArea(r);
      try { await invocar("nav_posicionar", { ret: retDoSite(r) }); } catch (e) { /* telinha ainda não existe: o próximo envio acerta */ }
    });
  }
  const mainEl = document.querySelector(".page > .main");
  if (mainEl && typeof ResizeObserver === "function") new ResizeObserver(enviarRect).observe(mainEl);
  window.addEventListener("resize", enviarRect);

  // ---------- abrir, trocar, fechar ----------
  function marcarClasses() {
    const b = document.body.classList;
    b.toggle("nav-ativa", !!ativa);
    ORDEM_MODOS.forEach(m => b.toggle("nav-" + m, !!ativa && modo === m));
    if (wrap) wrap.classList.toggle("nav-ativa", !!ativa);
    pill.hidden = !ativa;
    area.hidden = !ativa;
  }

  async function ativar(id) {
    if (!id) {                                             // volta pro Colmeia
      ativa = null; marcarClasses();
      document.documentElement.style.setProperty("--nav-reserva", "0px");
      try { await invocar("nav_esconder"); } catch (e) { /* nada a esconder */ }
      desenharAbas();
      return;
    }
    const aba = abaDe(id); if (!aba) return;
    ativa = id;
    marcarClasses();
    const r = navRect(); if (r) pintarArea(r);
    const campo = document.getElementById("navEndInput"); if (campo) campo.value = aba.url;
    desenharAbas();
    atualizarTarefa();
    try {
      await invocar("nav_mostrar", { id, url: aba.url, ret: retDoSite(r) });
    } catch (err) {
      console.error("Não consegui abrir o site:", err);
      mostrarToast("Não consegui abrir esse site aqui dentro.", "erro");
      ativa = null; marcarClasses(); desenharAbas();
    }
  }

  function abrirSite(urlBruta, nome) {
    const url = normalizarEndereco(urlBruta);
    if (!url) { mostrarToast("Esse endereço não abre aqui dentro.", "erro"); return; }
    const id = idDoSite(url);
    let aba = abaDe(id);
    if (!aba) {
      aba = { id, url, nome: nome || new URL(url).hostname.replace(/^www\./, ""), cor: corDoSite(url) };
      abas.push(aba); salvarAbas();
    }
    if (typeof fecharPaineisLaterais === "function") fecharPaineisLaterais(null);
    ativar(id);
  }

  async function fechar(id) {
    abas = abas.filter(a => a.id !== id); salvarAbas();
    try { await invocar("nav_fechar", { id }); } catch (e) { /* já não existia */ }
    if (ativa === id) await ativar(null); else desenharAbas();
  }

  // ---------- as bolinhas na barra da esquerda ----------
  function desenharAbas() {
    if (!bloco) return;
    bloco.hidden = abas.length === 0;
    bloco.innerHTML = '<span class="nav-sep"></span>' + abas.map(a =>
      `<a href="#" class="nav-ic nav-site${ativa === a.id ? " active" : ""}" data-nav-id="${esc(a.id)}" title="${esc(a.nome)}">` +
        `<span class="nav-icon-circle" style="background:${esc(a.cor)};color:#fff">${esc(siglaDe(a.nome))}</span>` +
        `<span class="nav-label">${esc(a.nome)}</span>` +
        `<span class="nav-site-x" data-nav-fechar="${esc(a.id)}" title="Fechar" role="button" aria-label="Fechar ${esc(a.nome)}">×</span>` +
      "</a>").join("");
  }
  if (bloco) {
    bloco.addEventListener("click", e => {
      const x = e.target.closest("[data-nav-fechar]");
      if (x) { e.preventDefault(); e.stopPropagation(); fechar(x.dataset.navFechar); return; }
      const a = e.target.closest("[data-nav-id]");
      if (a) { e.preventDefault(); ativar(ativa === a.dataset.navId ? ativa : a.dataset.navId); }
    });
    bloco.addEventListener("auxclick", e => {                // botão do meio fecha
      const a = e.target.closest("[data-nav-id]");
      if (a && e.button === 1) { e.preventDefault(); fechar(a.dataset.navId); }
    });
  }

  // ---------- o pill: endereço, voltar/avançar, tela dividida ----------
  pill.addEventListener("click", async e => {
    const b = e.target.closest("[data-nav]");
    if (!b || !ativa) return;
    try { await invocar("nav_comando", { id: ativa, comando: b.dataset.nav }); } catch (err) { console.warn(err); }
  });
  const form = document.getElementById("navEndForm");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const url = normalizarEndereco(document.getElementById("navEndInput").value);
    if (!url || !ativa) { mostrarToast("Esse endereço não abre aqui dentro.", "erro"); return; }
    try { await invocar("nav_comando", { id: ativa, comando: "ir", url }); document.getElementById("navEndInput").blur(); }
    catch (err) { mostrarToast("Não consegui abrir esse endereço.", "erro"); }
  });
  document.getElementById("navEndInput").addEventListener("focus", ev => ev.target.select());
  const botaoDividir = document.getElementById("navDividirBtn");
  function rotuloDividir() {
    const proximo = ORDEM_MODOS[(ORDEM_MODOS.indexOf(modo) + 1) % ORDEM_MODOS.length];
    botaoDividir.title = `${NOME_MODO[modo]} — clique para: ${NOME_MODO[proximo]}`;
    botaoDividir.classList.toggle("ligado", modo !== "cheia");
  }
  botaoDividir.addEventListener("click", () => {
    modo = ORDEM_MODOS[(ORDEM_MODOS.indexOf(modo) + 1) % ORDEM_MODOS.length];
    try { localStorage.setItem(CHAVE_MODO, modo); } catch (e) { /* ok */ }
    marcarClasses(); rotuloDividir();
    // O resto da página (Colmeia) só encolhe depois que a reserva muda; mede de novo.
    requestAnimationFrame(() => requestAnimationFrame(enviarRect));
  });
  rotuloDividir();

  // ---------- a tarefa na cápsula do pill ----------
  function tarefaEmFoco() {
    const rodando = typeof tasks !== "undefined" ? tasks.find(t => t.running && ehMinhaTarefa(t)) : null;
    if (rodando) return { t: rodando, rodando: true };
    if (typeof ultimaTarefaPausada !== "undefined" && ultimaTarefaPausada && typeof tasks !== "undefined") {
      const t = tasks.find(x => String(x.id) === String(ultimaTarefaPausada.id));
      if (t) return { t, rodando: false };
    }
    return null;
  }
  function alternarTarefa() {                                // reaproveita o que o pill de sempre já faz
    const f = tarefaEmFoco(); if (!f) return;
    const alvo = f.rodando ? document.getElementById("nowPlayingPause") : document.getElementById("retomarBadge");
    if (alvo) alvo.click();
    setTimeout(atualizarTarefa, 60);
  }
  function atualizarTarefa() {
    const pp = document.getElementById("navTkPP"), tempo = document.getElementById("navTkTempo");
    if (!pp || !tempo) return;
    const f = tarefaEmFoco();
    const cap = document.getElementById("navPillTarefa");
    if (cap) cap.classList.toggle("sem-tarefa", !f);
    if (!f) { pp.innerHTML = ""; tempo.textContent = "Sem tarefa"; }
    else { pp.innerHTML = f.rodando ? ICONES.pause : ICONES.play; tempo.textContent = formatTime(f.t.timerSeconds); }
    if (painelTarefaAberto) atualizarTempoDoPainel(f);
  }
  document.getElementById("navTkPP").addEventListener("click", e => { e.stopPropagation(); alternarTarefa(); });
  document.getElementById("navPillTarefa").addEventListener("click", () => abrirPainelTarefa(!painelTarefaAberto));
  document.getElementById("navPillTarefa").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirPainelTarefa(!painelTarefaAberto); } });

  // ---------- o painel compacto da tarefa ----------
  function textoPuro(html) {
    const d = new DOMParser().parseFromString(String(html || ""), "text/html");
    return (d.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  }
  function abrirPainelTarefa(abrir) {
    painelTarefaAberto = abrir;
    if (abrir) {
      if (typeof fecharPaineisLaterais === "function") fecharPaineisLaterais(painel);
      renderPainelTarefa();
    }
    painel.classList.toggle("open", abrir);
  }
  document.getElementById("navTarefaFechar").addEventListener("click", () => abrirPainelTarefa(false));

  function renderPainelTarefa() {
    const corpo = document.getElementById("navTarefaBody");
    const f = tarefaEmFoco();
    if (!f) {
      corpo.innerHTML = '<p class="quick-access-empty">Nenhuma tarefa rodando agora. Dê play em uma tarefa no Colmeia.</p>';
      return;
    }
    const t = f.t;
    corpo.innerHTML =
      '<div class="nt-topo">' +
        `<span class="nt-cliente">${esc(t.client || "Sem cliente")}</span>` +
        (t.due ? `<span class="nt-entrega">Entrega ${esc(t.due)}</span>` : "") +
      "</div>" +
      `<h4 class="nt-titulo">${esc(t.title)}</h4>` +
      '<div class="nt-tempo-linha">' +
        `<button type="button" class="nt-pp" id="ntPP" aria-label="Pausar ou retomar">${f.rodando ? ICONES.pause : ICONES.play}</button>` +
        `<span class="nt-tempo" id="ntTempo">${formatTime(t.timerSeconds)}</span>` +
        (t.temEstimativa ? `<span class="nt-est">de ${formatarHorasCurtas((t.estimateMinutes || 0) * 60)}</span>` : "") +
      "</div>" +
      '<div class="nt-bloco"><div class="nt-rotulo"><span>O que fazer</span><button type="button" id="ntCopiarDesc">Copiar</button></div>' +
        '<div class="nt-texto" id="ntTexto">Carregando…</div></div>' +
      '<div class="nt-acoes">' +
        '<button type="button" id="ntCopiarTitulo">Copiar título</button>' +
        '<button type="button" id="ntCopiarLink">Copiar link</button>' +
        '<button type="button" id="ntPasta">Pasta no computador</button>' +
        '<button type="button" id="ntAbrir" class="principal">Abrir tarefa completa</button>' +
      "</div>" +
      '<div class="nt-comentar"><textarea id="ntComentario" rows="3" placeholder="Comentar nesta tarefa…"></textarea>' +
        '<button type="button" id="ntEnviar">Enviar comentário</button></div>';

    document.getElementById("ntPP").addEventListener("click", alternarTarefa);
    document.getElementById("ntCopiarTitulo").addEventListener("click", async () => { await copiarTexto(t.title, "Copie o título:"); mostrarToast("Título copiado.", "sucesso"); });
    document.getElementById("ntCopiarLink").addEventListener("click", async () => { await copiarTexto(`https://runrun.it/pt-BR/tasks/${t.id}`, "Copie o link:"); mostrarToast("Link da tarefa copiado.", "sucesso"); });
    document.getElementById("ntPasta").addEventListener("click", () => {
      if (typeof abrirPastaDoCardNoComputador === "function") abrirPastaDoCardNoComputador(t);
    });
    document.getElementById("ntAbrir").addEventListener("click", () => {
      abrirPainelTarefa(false);
      ativar(null).then(() => { if (typeof abrirTarefaPorId === "function") abrirTarefaPorId(t.id); });
    });
    document.getElementById("ntEnviar").addEventListener("click", async () => {
      const campo = document.getElementById("ntComentario"), texto = campo.value.trim();
      if (!texto) return;
      const botao = document.getElementById("ntEnviar");
      botao.disabled = true;
      const r = await enviarComentarioNoBackend(t.id, texto);
      botao.disabled = false;
      if (r && r.ok) { campo.value = ""; mostrarToast("Comentário enviado.", "sucesso"); }
      else mostrarToast("Não consegui enviar o comentário agora.", "erro");
    });

    const mostrarDescricao = txt => {
      const el = document.getElementById("ntTexto"); if (!el) return;
      el.textContent = txt || "Sem descrição.";
      const copiar = document.getElementById("ntCopiarDesc");
      if (copiar) copiar.onclick = async () => { await copiarTexto(txt || "", "Copie o texto:"); mostrarToast("Descrição copiada.", "sucesso"); };
    };
    if (t.descricaoTexto) mostrarDescricao(textoPuro(t.descricaoTexto));
    else buscarDescricaoDoBackend(t.id).then(d => mostrarDescricao(d === null ? "Não consegui carregar agora." : textoPuro(d)));
  }
  function atualizarTempoDoPainel(f) {
    const el = document.getElementById("ntTempo");
    if (el && f) el.textContent = formatTime(f.t.timerSeconds);
    const pp = document.getElementById("ntPP");
    if (pp && f) pp.innerHTML = f.rodando ? ICONES.pause : ICONES.play;
  }

  // ---------- endereço atual da aba (o programa responde, a gente pergunta) ----------
  setInterval(async () => {
    if (!ativa) return;
    atualizarTarefa();
    let est;
    try { est = await invocar("nav_estado", { id: ativa }); } catch (e) { return; }
    if (!est) return;
    const campo = document.getElementById("navEndInput");
    if (campo && document.activeElement !== campo && est.url) campo.value = est.url;
    const aba = abaDe(ativa);
    if (aba && est.url && est.url !== aba.url && /^https?:/.test(est.url)) { aba.url = est.url; salvarAbas(); }
  }, 1000);

  // ---------- ligações com o resto do Colmeia ----------
  // Clicou num site do Acesso rápido: abre AQUI (links que não são http — como
  // adbps:// do Photoshop — continuam saindo pro sistema, de propósito).
  // ⚠️ Escuta na JANELA (fase de captura), não no document: o programa tem um
  // atalho no document que manda todo link "nova aba" pro navegador do
  // sistema. A janela vem ANTES do document no caminho do clique, então aqui
  // dá pra tomar o clique primeiro — senão o site abria nos dois lugares.
  window.addEventListener("click", e => {
    const tile = e.target.closest(".acesso-rapido-tile");
    if (!tile || e.target.closest(".acesso-rapido-tile-remover")) return;
    const href = tile.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    const nome = (tile.querySelector(".acesso-rapido-tile-nome") || {}).textContent;
    abrirSite(href, (nome || "").trim());
  }, true);

  // Tela cheia: qualquer navegação do Colmeia (sidebar, paleta, abrir tarefa)
  // devolve a janela pro Colmeia. Dividida: o Colmeia está ao lado, então fica.
  window.navAoMostrarPagina = function () { if (ativa && modo === "cheia") ativar(null); };
  window.navAoAbrirTarefa = function () { if (ativa && modo === "cheia") ativar(null); };
  window.navAtivo = () => !!ativa;                           // outros arquivos podem perguntar
  window.navAbrirSite = abrirSite;                           // e abrir um site daqui

  desenharAbas();
  marcarClasses();
})();
