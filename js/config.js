// ============================================
// Base do front-end: ícones, definição das colunas do quadro, URLs das
// APIs (Colmeia e painel-designers-beeon), calendário próprio, avisinhos
// (toast/ilha/pílula) e a notificação que sobe dentro da pílula amarela.
// É o primeiro arquivo carregado — todos os outros contam com o que está
// aqui, então nada aqui pode depender deles.
// ============================================

// ============================================
// PAINEL DE DIAGNÓSTICO (atalho Ctrl + Shift + D)
// ============================================
// Guarda os últimos erros que aconteceram no Colmeia, com hora, pra você
// copiar e mandar em vez de descrever "deu erro" — é o que permite achar o
// problema rápido depois.
//
// O truque pra isso não exigir mexer em 100 lugares: todo o Colmeia já
// avisa de falha chamando console.error(...). Aqui a gente "embrulha" o
// console.error UMA vez — ele continua funcionando igual (o texto segue
// aparecendo no console do navegador, F12), e de brinde cada aviso desses
// também é anotado nessa lista. Também captura erro de programação solto e
// promessa rejeitada sem tratamento, que antes não apareciam em lugar
// nenhum. Como este é o primeiro arquivo carregado, pega tudo dos outros.
const DIAGNOSTICO_CHAVE = "colmeia_diagnostico_v1";
const DIAGNOSTICO_MAX = 60;
let _diagnosticoLista = [];
try {
  _diagnosticoLista = JSON.parse(localStorage.getItem(DIAGNOSTICO_CHAVE) || "[]");
} catch (err) { _diagnosticoLista = []; }

function registrarNoDiagnostico(tipo, texto) {
  try {
    _diagnosticoLista.push({ quando: Date.now(), tipo, texto: String(texto).slice(0, 800) });
    if (_diagnosticoLista.length > DIAGNOSTICO_MAX) {
      _diagnosticoLista = _diagnosticoLista.slice(-DIAGNOSTICO_MAX);
    }
    localStorage.setItem(DIAGNOSTICO_CHAVE, JSON.stringify(_diagnosticoLista));
  } catch (err) { /* aba privada / espaço cheio — segue sem anotar */ }
}

(function ligarCapturaDeErros() {
  const consoleErrorOriginal = console.error.bind(console);
  console.error = function () {
    const partes = Array.prototype.slice.call(arguments).map(function (a) {
      if (a instanceof Error) return a.message;
      if (typeof a === "object") { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    });
    registrarNoDiagnostico("erro", partes.join(" "));
    consoleErrorOriginal.apply(console, arguments);
  };
  window.addEventListener("error", ev => {
    registrarNoDiagnostico("quebrou", (ev.message || "erro") + " — " + (ev.filename || "") + ":" + (ev.lineno || ""));
  });
  window.addEventListener("unhandledrejection", ev => {
    const motivo = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason);
    registrarNoDiagnostico("quebrou", "promessa sem tratamento: " + motivo);
  });
})();

function abrirPainelDiagnostico() {
  document.querySelectorAll(".diagnostico-overlay").forEach(el => el.remove());
  const overlay = document.createElement("div");
  overlay.className = "diagnostico-overlay";

  const linhas = _diagnosticoLista.slice().reverse();
  const comoTexto = linhas.map(l =>
    new Date(l.quando).toLocaleString("pt-BR") + " [" + l.tipo + "] " + l.texto
  ).join("\n");

  overlay.innerHTML = `
    <div class="diagnostico-caixa">
      <div class="diagnostico-head">
        <h3>Diagnóstico — últimos erros</h3>
        <div class="diagnostico-head-acoes">
          <button type="button" class="diagnostico-copiar">Copiar tudo</button>
          <button type="button" class="diagnostico-limpar">Limpar</button>
          <button type="button" class="diagnostico-fechar" aria-label="Fechar">✕</button>
        </div>
      </div>
      <p class="diagnostico-dica">Isso fica só no seu navegador. Copie e me mande junto com o que você estava fazendo na hora.</p>
      ${(typeof tamanhoDaFilaOffline === "function" && tamanhoDaFilaOffline() > 0) ? `
        <p class="diagnostico-dica"><strong>${tamanhoDaFilaOffline()} ação(ões) esperando internet pra serem enviadas.</strong>
        Elas vão sozinhas quando a conexão voltar — não precisa refazer.</p>
      ` : ""}
      <div class="diagnostico-corpo">
        ${linhas.length
          ? linhas.map(l => `
              <div class="diagnostico-item">
                <span class="diagnostico-hora">${new Date(l.quando).toLocaleString("pt-BR")}</span>
                <span class="diagnostico-tipo ${l.tipo}">${l.tipo}</span>
                <span class="diagnostico-texto">${escaparHTML(l.texto)}</span>
              </div>
            `).join("")
          : `<p class="quick-access-empty">Nenhum erro registrado. Ótimo sinal.</p>`}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".diagnostico-fechar").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", ev => { if (ev.target === overlay) overlay.remove(); });
  overlay.querySelector(".diagnostico-limpar").addEventListener("click", () => {
    _diagnosticoLista = [];
    try { localStorage.removeItem(DIAGNOSTICO_CHAVE); } catch (e) { /* sem problema */ }
    overlay.remove();
    mostrarToast("Diagnóstico limpo.");
  });
  overlay.querySelector(".diagnostico-copiar").addEventListener("click", () => {
    navigator.clipboard.writeText(comoTexto || "(nenhum erro registrado)").then(
      () => mostrarToast("Copiado. Cola aqui no chat pra eu ver."),
      () => mostrarToast("Não consegui copiar — dá pra selecionar o texto na mão.", "erro")
    );
  });
}

document.addEventListener("keydown", ev => {
  // Ctrl + Shift + D (ou Cmd + Shift + D no Mac) abre o diagnóstico.
  if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === "D" || ev.key === "d")) {
    ev.preventDefault();
    abrirPainelDiagnostico();
  }
});

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

// ============================================
// CHAMADA AO BACKEND — o caminho único de toda ida ao Apps Script
// ============================================
// Antes existiam 56 blocos `fetch(COLMEIA_API_URL, ...)` copiados e
// colados pelo app, cada um com o seu próprio try/catch. Dois problemas
// vinham dessa repetição:
//
//  1. NENHUM tinha prazo máximo. Se o Apps Script travasse, a tela ficava
//     "pensando" pra sempre, sem erro e sem nada.
//  2. Erro de rede virava resposta vazia. Quem chamava não tinha como
//     distinguir "a tarefa não tem comentário" de "não consegui perguntar",
//     e o app apagava da tela dados que estavam certos (ver
//     `caiuARede` logo abaixo).
//
// Agora tudo passa por aqui. O contrato é:
//   - devolve o JSON do backend (com `ok: true/false`) quando a resposta CHEGA;
//   - devolve `{ ok: false, semRede: true }` quando o pedido NÃO chegou
//     (internet fora, servidor mudo, estourou o prazo).
//
// `semRede: true` é o sinal de "não sei", não de "não tem" — quem chama
// deve preservar o que já está na tela nesse caso.
const TIMEOUT_BACKEND_MS = 25000; // Apps Script "acordando" pode levar uns segundos; 25s é folgado sem ser eterno

// Algumas ações são LENTAS por natureza e não podem cair no prazo normal:
// as de IA (Groq/Gemini pensando), as que varrem o Google Drive e as que
// paginam meses de tarefas no Runrun.it. Elas ganham um prazo maior — o
// objetivo do prazo é impedir que a tela fique pendurada PRA SEMPRE, não
// cortar trabalho que legitimamente demora.
const TIMEOUT_LONGO_MS = 90000;
const ACOES_DEMORADAS = [
  "gerarBriefing",        // IA escrevendo o briefing
  "gerarFraseDoDia",      // IA
  "resumoAlteracao",      // IA
  "beeResumo",            // a Bee lendo a tarefa inteira
  "beeConversar",         // a Bee usa o modelo FORTE do Gemini aqui, que é mais lento de propósito
  "beeConversarLivre",
  "beeInspirar",           // IA lendo a tarefa inteira
  "beeConferirEntrega",    // IA + varredura da pasta do card no Drive
  "beeCompararVersoes",    // IA vendo duas imagens (Gemini vision) + varredura do Drive
  "beeMemoriaCliente",     // le os comentarios de ate 15 tarefas do cliente
  "montarIndiceDeLinks",   // so usado manualmente pelo editor do Apps Script
  "buscarExtrasRunrunCompleto", // pagina 15 dias de entregues dos 3 designers
  "listarPastasClientesDrive",  // varre pastas do Drive
  "buscarAtividadesDrive",      // varre arquivos recentes do Drive
  "buscarProgressoClientes",
  "buscarTermometroClientes", // varre todas as tarefas dos 3 designers, igual buscarProgressoClientes
  "baixarAnexo",          // o arquivo vem inteiro dentro da resposta
  "buscarImagemCheiaDrive", // idem, mas pra imagem do Drive ampliada (ver js/notificacoes-uploads.js)
  "beeGerarImagem",       // gera imagem de verdade (Gemini, ver NanoBanana.gs)
  "subirArquivoNoCard",   // arquivo arrastado pro card, sobe pro Drive (ver js/detalhe-modal.js)
];

async function chamarBackend(corpo, opcoes) {
  opcoes = opcoes || {};
  if (!COLMEIA_API_URL) return { ok: false, semRede: true, error: "Backend não configurado." };

  // Quem está pedindo isso, de verdade — vai em TODA chamada, sem
  // precisar lembrar disso em cada um dos ~50 lugares que chamam
  // chamarBackend. É o que resolve o bug de toda ação (play, comentário,
  // entregar etc) aparecer no Runrun.it como se fosse do Cláudio, não
  // importa quem esteja logado no Colmeia — o backend usa isso pra
  // escolher o token de API certo (ver tokenRunrunDoAutor, RunrunLeitura.gs).
  if (!corpo.autor && typeof DESIGNER_LOGADO !== "undefined" && DESIGNER_LOGADO) {
    corpo.autor = DESIGNER_LOGADO;
  }

  // AbortController é o jeito padrão do navegador de cancelar um pedido
  // que demorou demais — sem ele, o fetch fica pendurado indefinidamente.
  const controller = new AbortController();
  const prazo = opcoes.timeoutMs
    || (ACOES_DEMORADAS.indexOf(corpo.acao) !== -1 ? TIMEOUT_LONGO_MS : TIMEOUT_BACKEND_MS);
  const timeout = setTimeout(() => controller.abort(), prazo);
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
    const data = await res.json();
    if (data && data.ok === false && data.error) {
      console.error(`Backend recusou "${corpo.acao}":`, data.error);
    }
    return data;
  } catch (err) {
    // AbortError = estourou o prazo; TypeError = não conseguiu nem sair
    // do navegador. Os dois significam a mesma coisa pra quem chamou: a
    // pergunta não chegou ao servidor, então não sabemos a resposta.
    const motivo = err && err.name === "AbortError" ? "demorou demais" : "falha de conexão";
    console.error(`Não consegui falar com o backend em "${corpo.acao}" (${motivo}):`, err);
    return { ok: false, semRede: true, error: motivo };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * "A resposta não chegou?" — atalho de leitura pra quem chama decidir se
 * preserva o que está na tela. Use sempre isso em vez de checar
 * `data.semRede` na mão, pra o significado ficar explícito no código.
 */
function caiuARede(resposta) {
  return !!(resposta && resposta.semRede);
}

/**
 * Igual ao chamarBackend, mas pra a única leitura que é feita por endereço
 * (GET) em vez de por ação: a varredura do quadro (`?tipo=tarefas`). Mesmo
 * contrato — devolve `{ ok: false, semRede: true }` quando não chega.
 */
async function chamarBackendGet(query, opcoes) {
  opcoes = opcoes || {};
  if (!COLMEIA_API_URL) return { ok: false, semRede: true, error: "Backend não configurado." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opcoes.timeoutMs || TIMEOUT_LONGO_MS);
  try {
    const res = await fetch(COLMEIA_API_URL + query, { signal: controller.signal });
    return await res.json();
  } catch (err) {
    const motivo = err && err.name === "AbortError" ? "demorou demais" : "falha de conexão";
    console.error(`Não consegui buscar o quadro (${motivo}):`, err);
    return { ok: false, semRede: true, error: motivo };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Roda `tarefa(item)` em todos os itens, mas no máximo `tamanhoDoLote` ao
 * mesmo tempo — o meio-termo entre `Promise.all` (dispara TODOS de uma vez,
 * e o Apps Script engasga) e um laço com `await` (um de cada vez, lento à
 * toa). Espera o lote inteiro terminar antes de começar o próximo.
 */
async function emLotes(itens, tamanhoDoLote, tarefa) {
  for (let i = 0; i < itens.length; i += tamanhoDoLote) {
    await Promise.all(itens.slice(i, i + tamanhoDoLote).map(tarefa));
  }
}

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_COMPLETOS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

/**
 * Lê o "mês do projeto" que fica entre colchetes no campo PROJETO da
 * tarefa no Runrun.it (ex: "APsystems > [MAIO26] INBOUND..." → maio/2026)
 * — NÃO é no título da tarefa (título costuma ser genérico, tipo "Video -
 * Criativo 3 -"), é um campo separado (ver "Projeto" no card do Runrun.it,
 * campo `projeto` vindo de extrairNomeProjeto em RunrunLeitura.gs).
 * Usado pra mostrar isso junto do nome do cliente e, mais importante, pra
 * usar como fonte de verdade na hora de criar a pasta automática no Drive
 * (ver confirmarECriarPastaDoCard, js/chat-comentarios.js): uma tarefa
 * atrasada de maio não pode cair na pasta do mês atual só porque a pasta
 * foi CRIADA hoje — tem que ir pra pasta de maio, que é de quando o
 * projeto É. O mês pode vir abreviado (MAI) ou por extenso (MAIO) — por
 * isso confere só as 3 primeiras letras.
 * Mesma lógica espelhada no backend em extrairMesAnoDoProjeto (Drive.gs)
 * — se mudar o formato aqui, mudar lá também.
 */
function extrairMesAnoDoProjeto(projeto) {
  if (!projeto) return null;
  const m = String(projeto).match(/\[\s*([A-Za-zÇç]{3,})\D{0,2}(\d{2,4})\s*\]/);
  if (!m) return null;
  const mesIndex = MESES_ABREV.indexOf(m[1].toLowerCase().slice(0, 3));
  if (mesIndex === -1) return null;
  const anoStr = m[2];
  const ano = anoStr.length === 2 ? 2000 + Number(anoStr) : Number(anoStr);
  return { mesIndex, ano, label: MESES_ABREV[mesIndex].toUpperCase() + " " + ano };
}
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

// Só avisa sobre upload que aconteceu nos últimos 30 minutos — depois
// disso não faz mais sentido como "notificação" do momento, e a fala da
// Bee some sozinha da conversa (era 3 horas, tempo demais pra algo que
// serve pra "acabei de subir o arquivo").
const JANELA_NOTIFICACAO_UPLOAD_MS = 30 * 60 * 1000;

/**
 * Faixa fixa no topo avisando que o Runrun.it (não o Colmeia) está fora
 * do ar. Diferente do toast, ela NÃO some sozinha: enquanto eles estão
 * caídos, play/pause, comentário, entregar e repassar não funcionam — e
 * a pessoa precisa saber disso o tempo todo, não por 4 segundos.
 *
 * Some sozinha assim que a próxima varredura do quadro (a cada 60s)
 * conseguir falar com eles de novo (ver atualizarKanbanEmBackground).
 */
function mostrarAvisoRunrunFora(estaFora) {
  const existente = document.getElementById("avisoRunrunFora");

  if (!estaFora) {
    if (existente) existente.remove();
    document.body.classList.remove("com-aviso-runrun");
    return;
  }
  if (existente) return; // já está na tela, não precisa redesenhar

  const faixa = document.createElement("div");
  faixa.id = "avisoRunrunFora";
  faixa.className = "aviso-runrun-fora";
  faixa.innerHTML = `
    <span class="aviso-runrun-ico">🐝</span>
    <span class="aviso-runrun-txt">
      <b>O Runrun.it está fora do ar.</b>
      Você continua vendo suas tarefas, mas dar play, comentar e entregar não vão funcionar até eles voltarem.
      O Colmeia tenta sozinho de tempos em tempos.
    </span>
    <button type="button" class="aviso-runrun-x" title="Esconder este aviso" aria-label="Esconder">
      <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
  `;
  faixa.querySelector(".aviso-runrun-x").addEventListener("click", () => {
    faixa.remove();
    document.body.classList.remove("com-aviso-runrun");
  });
  document.body.appendChild(faixa);
  document.body.classList.add("com-aviso-runrun");
}

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
  // Em modo foco, os avisos ficam guardados (ver js/modo-foco.js) e só
  // aparecem juntos quando a pessoa sai do foco — é a peça central da
  // funcionalidade, então essa checagem tem que vir ANTES de entrar na
  // fila normal, senão a ilha ia continuar interrompendo do mesmo jeito.
  if (typeof focoEstaAtivo === "function" && focoEstaAtivo() && typeof focoGuardarAviso === "function") {
    focoGuardarAviso(evento);
    return;
  }
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

/**
 * ===================================================================
 * VISUALIZADOR DE IMAGEM DO DRIVE (preview + ampliar)
 * ===================================================================
 *
 * Um pop-up genérico pra mostrar uma imagem que mora no Drive quase em
 * tela cheia — usado primeiro pela fala da Bee que reconhece upload
 * novo (js/notificacoes-uploads.js), e feito pra ser reaproveitado por
 * qualquer outra tela que precise mostrar imagem do Drive (a "parede do
 * cliente" e o "antes e depois" do roteiro de melhorias vão usar o
 * mesmo visualizador, não um pop-up novo cada um).
 *
 * SEMPRE passa pelo backend (nunca linka a URL do Drive direto numa tag
 * <img>): nem todo arquivo tem "qualquer pessoa com o link" habilitado,
 * e a conta do Apps Script já tem acesso à pasta de qualquer jeito —
 * ver buscarThumbnailDrive/buscarImagemCheiaDrive em Drive.gs.
 */

let _visualizadorImagemPedidoAtual = null; // fileId sendo buscado agora, pra ignorar resposta velha se trocar/fechar no meio

function garantirVisualizadorDeImagem() {
  let overlay = document.getElementById("visualizadorImagemOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "visualizadorImagemOverlay";
  overlay.className = "drive-img-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="drive-img-janela">
      <div class="drive-img-topo">
        <span class="drive-img-legenda" id="visualizadorImagemLegenda"></span>
        <button type="button" class="drive-img-fechar" id="visualizadorImagemFechar" aria-label="Fechar">
          <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="drive-img-corpo" id="visualizadorImagemCorpo"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) fecharVisualizadorDeImagem(); });
  document.getElementById("visualizadorImagemFechar").addEventListener("click", fecharVisualizadorDeImagem);
  return overlay;
}

/** Abre o pop-up quase em tela cheia com a imagem CHEIA (não a miniatura) de um arquivo do Drive. */
function abrirImagemAmpliadaDoDrive(fileId, nomeArquivo) {
  if (!fileId) return;
  const overlay = garantirVisualizadorDeImagem();
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("aberto"));
  document.getElementById("visualizadorImagemLegenda").textContent = nomeArquivo || "";
  const corpo = document.getElementById("visualizadorImagemCorpo");
  corpo.innerHTML = `<div class="drive-img-carregando">Carregando imagem...</div>`;

  _visualizadorImagemPedidoAtual = fileId;
  chamarBackend({ acao: "buscarImagemCheiaDrive", fileId }).then(resultado => {
    // A pessoa fechou ou clicou em outra imagem enquanto essa vinha —
    // desenhar agora só confundiria (uma imagem errada aparecendo depois
    // do pop-up já ter mudado de assunto ou fechado).
    if (_visualizadorImagemPedidoAtual !== fileId) return;
    if (!resultado || !resultado.ok) {
      corpo.innerHTML = `<div class="drive-img-erro">${escaparHTML((resultado && resultado.error) || "Não consegui abrir essa imagem.")}</div>`;
      return;
    }
    corpo.innerHTML = `<img src="data:${resultado.mimeType};base64,${resultado.base64}" alt="${escaparHTML(nomeArquivo || "")}">`;
  });
}

function fecharVisualizadorDeImagem() {
  const overlay = document.getElementById("visualizadorImagemOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("aberto");
  _visualizadorImagemPedidoAtual = null;
  setTimeout(() => { overlay.hidden = true; }, 160);
}

// Fase de captura, mesmo padrão da paleta de comando (js/paleta-comando.js):
// se o visualizador está aberto, o Esc fecha ELE, e não o card por trás.
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const overlay = document.getElementById("visualizadorImagemOverlay");
  if (overlay && !overlay.hidden) {
    e.preventDefault();
    e.stopPropagation();
    fecharVisualizadorDeImagem();
  }
}, true);
