/**
 * ===================================================================
 * MODO FOCO
 * ===================================================================
 *
 * Uma sessão de trabalho concentrado, por tempo marcado: enquanto está
 * ativo, a tela fica limpa (sidebar e os ícones do topo somem), os
 * avisos da "ilha" (comentário novo, aviso do coordenador, upload no
 * Drive) ficam guardados em vez de interromper, e aparecem juntos só
 * quando o foco termina. O resto do time vê "Fulano em foco até 15:40"
 * no card dela no quadro (ver Código.gs/getTarefasColmeia e o selo em
 * js/kanban-board.js).
 *
 * BOTÃO SEPARADO DO PLAY DE PROPÓSITO: o play continua sendo só o
 * cronômetro, do jeito que sempre foi — muita tarefa é rápida demais
 * pra merecer o modo foco. "Focar" é uma escolha à parte, só quando a
 * pessoa realmente quer se isolar por um tempo.
 *
 * CUIDADO AO MEXER: carregado perto do fim (depois de detalhe-modal.js,
 * que chama `focoBotaoHTML()`/`focoWireBotao()` de dentro do
 * renderDetail — sempre atrás de `typeof ... === "function"`, então a
 * ordem exata não quebra nada, só precisa existir até a hora do clique).
 */

// Até quando o foco vale (epoch ms) — null quando não está em foco.
let focoAteQuando = null;
// Avisos que a ilha (js/config.js > mostrarIlha) foi segurando enquanto
// o foco estava ativo — devolvidos um por um assim que ele termina.
let focoAvisosGuardados = [];
let _focoTimeoutSair = null;
let _focoIntervalRelogio = null;

const FOCO_DURACOES = [
  { minutos: 25, label: "25 min" },
  { minutos: 50, label: "50 min" },
  { minutos: 90, label: "1h30" },
];

function focoEstaAtivo() {
  return !!focoAteQuando && focoAteQuando > Date.now();
}

function focoMinutosRestantes() {
  if (!focoEstaAtivo()) return 0;
  return Math.max(1, Math.ceil((focoAteQuando - Date.now()) / 60000));
}

function focoHoraFim() {
  return new Date(focoAteQuando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * HTML do botão "Focar" pro cabeçalho da tarefa — chamado de dentro de
 * renderDetail() (js/detalhe-modal.js). Enquanto o foco já está ativo,
 * devolve vazio: o HUD flutuante (mais abaixo) já cuida de mostrar o
 * status e o botão de sair, então não precisa duplicar aqui.
 */
function focoBotaoHTML() {
  if (focoEstaAtivo()) return "";
  return `
    <div class="foco-wrap">
      <button type="button" class="foco-btn" id="focoBtn" title="Entrar em modo foco" aria-label="Entrar em modo foco">🧠 Focar</button>
      <div class="foco-menu" id="focoMenu">
        ${FOCO_DURACOES.map(d => `<button type="button" data-minutos="${d.minutos}">${escaparHTML(d.label)}</button>`).join("")}
      </div>
    </div>
  `;
}

/** Liga o clique do botão e do menu — chamado depois de todo renderDetail(). */
function focoWireBotao() {
  const btn = document.getElementById("focoBtn");
  const menu = document.getElementById("focoMenu");
  if (!btn || !menu) return;
  btn.addEventListener("click", e => {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  menu.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      menu.classList.remove("open");
      focoIniciar(Number(b.dataset.minutos));
    });
  });
}

// Clicar fora do menu de duração fecha ele — mesmo padrão de qualquer
// outro menu solto do Colmeia (priority-menu, assignee-menu).
document.addEventListener("click", () => {
  document.getElementById("focoMenu")?.classList.remove("open");
});

function focoIniciar(minutos) {
  focoAteQuando = Date.now() + minutos * 60000;
  document.body.classList.add("modo-foco-ativo");
  chamarBackend({ acao: "entrarEmFoco", designer: DESIGNER_LOGADO, ateQuando: focoAteQuando });

  clearTimeout(_focoTimeoutSair);
  _focoTimeoutSair = setTimeout(focoSair, minutos * 60000);
  clearInterval(_focoIntervalRelogio);
  _focoIntervalRelogio = setInterval(focoAtualizarRelogio, 1000);

  focoDesenharHud();
  // O botão "Focar" precisa sumir do cabeçalho agora que o HUD assumiu.
  if (typeof renderDetail === "function" && tasks[detailIdx]) renderDetail();
  mostrarToast(`Modo foco até ${focoHoraFim()}. Os avisos vão esperar você terminar.`);
}

function focoSair() {
  if (!focoAteQuando) return;
  focoAteQuando = null;
  clearTimeout(_focoTimeoutSair);
  clearInterval(_focoIntervalRelogio);
  document.body.classList.remove("modo-foco-ativo");
  document.getElementById("focoHud")?.remove();
  chamarBackend({ acao: "sairDoFoco", designer: DESIGNER_LOGADO });
  if (typeof renderDetail === "function" && tasks[detailIdx]) renderDetail();

  const guardados = focoAvisosGuardados;
  focoAvisosGuardados = [];
  if (guardados.length) {
    mostrarToast(`Você recebeu ${guardados.length} aviso${guardados.length > 1 ? "s" : ""} enquanto estava em foco.`);
    // Chama mostrarIlha (não a fila interna direto) — nesse ponto
    // focoEstaAtivo() já é false, então ela segue o caminho normal e
    // empilha na fila de exibição de sempre, um de cada vez.
    guardados.forEach(evento => mostrarIlha(evento));
  } else {
    mostrarToast("Saiu do modo foco.");
  }
}

/** Chamado por mostrarIlha (js/config.js) enquanto o foco está ativo. */
function focoGuardarAviso(evento) {
  focoAvisosGuardados.push(evento);
}

function focoAtualizarRelogio() {
  if (!focoEstaAtivo()) { focoSair(); return; }
  const el = document.getElementById("focoHudRestante");
  if (el) el.textContent = focoMinutosRestantes() + " min restantes";
}

function focoDesenharHud() {
  document.getElementById("focoHud")?.remove();
  const hud = document.createElement("div");
  hud.className = "foco-hud";
  hud.id = "focoHud";
  hud.innerHTML = `
    <span>🧠 Em foco até ${focoHoraFim()}</span>
    <span class="foco-hud-restante" id="focoHudRestante">${focoMinutosRestantes()} min restantes</span>
    <button type="button" id="focoHudSair">Sair do foco</button>
  `;
  document.body.appendChild(hud);
  document.getElementById("focoHudSair").addEventListener("click", focoSair);
}
