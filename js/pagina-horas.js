// ============================================
// PÁGINA "MINHAS HORAS"
//
// Reconstrução do painel de referência aprovado pelo Cláudio: a mesma
// composição (grid de 4 colunas, alturas de linha, radius, escala de
// texto), com dado do Colmeia no lugar do conteúdo original.
//
// O QUE JÁ É DADO DE VERDADE:
//   - foto, nome e papel de quem está logado;
//   - o cronômetro (mesma tarefa rodando do resto do app);
//   - as tarefas entregues (busca própria, mais recentes primeiro);
//   - a agenda da semana (Google Agenda + entregas desejadas do Runrun.it);
//   - as métricas de tarefas concluídas e clientes.
//
//   - as HORAS POR DIA, somadas dos blocos de trabalho do Runrun.it
//     (/work_periods) — a mesma fonte que a aba "Tempo" deles usa;
//   - lançar horas numa tarefa (o "Ajustar" do Runrun.it).
//
// O QUE NÃO DÁ:
//   - JUSTIFICAR O DIA (folga, feriado, atestado). A API do Runrun.it não
//     oferece isso — o diagnóstico varreu 40+ endereços e só existem os
//     blocos de trabalho. Essa aba então explica a situação e leva direto
//     pra tela do Runrun.it, em vez de ter um botão que não faz nada.
// ============================================

const HORAS_DIAS_CURTOS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HORAS_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Segunda-feira da semana que está sendo mostrada (Date). Muda com as
// setas do calendário.
let horasSemanaAtual = null;
let horasDadosSemana = null;   // resposta de buscarHorasDaSemana
let horasAgendaSemana = null;  // resposta de buscarAgendaDaSemana
let horasEntregues = null;     // resposta de buscarEntreguesDoDesigner
let horasSemanaPassada = null; // total em segundos da semana anterior (pro comparativo)
let _relogioDaPaginaHoras = null;

/**
 * Segunda-feira da semana de uma data. Domingo (getDay() === 0) conta
 * como o FIM da semana anterior, não como o começo de uma nova — é assim
 * que o Runrun.it monta a semana dele.
 */
function segundaDaSemana(data) {
  const d = new Date(data.getTime());
  const diaDaSemana = d.getDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  d.setDate(d.getDate() - recuo);
  d.setHours(12, 0, 0, 0);
  return d;
}

function dataISOLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Segundos → "7h21". Devolve "—" quando não sabemos (null). */
function formatarHoras(segundos) {
  if (segundos === null || segundos === undefined) return "—";
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

// ===== Abertura da página =====

function abrirPaginaHoras() {
  if (!horasSemanaAtual) horasSemanaAtual = segundaDaSemana(new Date());
  renderPaginaHoras();
  carregarDadosDaPaginaHoras();
  iniciarRelogioDaPaginaHoras();
}

function fecharPaginaHoras() {
  clearInterval(_relogioDaPaginaHoras);
  _relogioDaPaginaHoras = null;
}

// O cronômetro do topo anda de 1 em 1 segundo enquanto a página está
// aberta, e para junto com ela — mesmo cuidado do perfil do designer.
function iniciarRelogioDaPaginaHoras() {
  clearInterval(_relogioDaPaginaHoras);
  _relogioDaPaginaHoras = setInterval(() => {
    const pagina = document.getElementById("page-horas");
    if (!pagina || pagina.hidden) { fecharPaginaHoras(); return; }
    renderCronometroDeHoje();
  }, 1000);
}

async function carregarDadosDaPaginaHoras() {
  const inicio = dataISOLocal(horasSemanaAtual);

  // As três buscas em paralelo — nenhuma depende da outra, e esperar em
  // fila indiana só deixaria a página lenta à toa.
  const [horas, agenda, entregues] = await Promise.all([
    chamarBackend({ acao: "buscarHorasDaSemana", designer: DESIGNER_LOGADO, inicio }),
    chamarBackend({ acao: "buscarAgendaDaSemana", designer: DESIGNER_LOGADO, inicio }),
    chamarBackend({ acao: "buscarEntreguesDoDesigner", designer: DESIGNER_LOGADO, limite: 12 }),
  ]);

  // Trocou de semana enquanto carregava? Descarta — senão a resposta
  // antiga sobrescreveria a nova.
  if (dataISOLocal(horasSemanaAtual) !== inicio) return;

  if (!caiuARede(horas)) horasDadosSemana = horas;
  if (!caiuARede(agenda)) horasAgendaSemana = agenda;
  if (!caiuARede(entregues)) horasEntregues = entregues;

  renderPaginaHoras();

  // A semana anterior vem DEPOIS, em segundo plano: ela só alimenta o
  // comparativo, e esperar por ela atrasaria a tela inteira à toa.
  const anterior = new Date(horasSemanaAtual.getTime() - 7 * 24 * 60 * 60 * 1000);
  const respostaAnterior = await chamarBackend({
    acao: "buscarHorasDaSemana", designer: DESIGNER_LOGADO, inicio: dataISOLocal(anterior),
  });
  if (dataISOLocal(horasSemanaAtual) !== inicio) return; // trocou de semana enquanto isso
  if (!caiuARede(respostaAnterior) && respostaAnterior.ok) {
    horasSemanaPassada = (respostaAnterior.dias || [])
      .filter(d => d.segundos !== null)
      .reduce((s, d) => s + d.segundos, 0);
    renderComparativo();
    renderMetricas();
  }
}

// ===== Desenho =====

function renderPaginaHoras() {
  const pagina = document.getElementById("page-horas");
  if (!pagina) return;

  const titulo = document.getElementById("hrTitulo");
  if (titulo) titulo.textContent = `Suas informações, ${DESIGNER_LOGADO || ""}`;

  renderFotoDoDesigner();
  renderBarraDeHoje();
  renderMetricas();
  renderProgressoDaSemana();
  renderCronometroDeHoje();
  renderBarraSemanal();
  renderEntregues();
  renderComparativo();
  renderCalendarioDaSemana();
}

function renderFotoDoDesigner() {
  const img = document.getElementById("hrFotoImg");
  const nome = document.getElementById("hrFotoNome");
  const papel = document.getElementById("hrFotoPapel");
  const valor = document.getElementById("hrFotoValor");
  if (!img) return;

  const foto = resolverFotoManual(DESIGNER_LOGADO) || fotoDoDesigner(DESIGNER_LOGADO);
  if (foto) {
    img.style.backgroundImage = `url("${foto}")`;
    img.classList.remove("sem-foto");
    img.textContent = "";
  } else {
    img.style.backgroundImage = "";
    img.classList.add("sem-foto");
    img.textContent = initials(DESIGNER_LOGADO);
  }
  if (nome) nome.textContent = DESIGNER_LOGADO || "";
  if (papel) papel.textContent = PAPEL_LOGADO === "coordenador" ? "Coordenador de Design" : "Designer";

  // No lugar do valor da referência: quantos clientes a pessoa atende.
  const quantos = (typeof nomesDosMeusClientes === "function") ? nomesDosMeusClientes().length : 0;
  if (valor) valor.textContent = quantos ? `${quantos} cliente${quantos > 1 ? "s" : ""}` : "—";
}

/**
 * A barra logo abaixo do nome: as horas de HOJE, divididas em concluídas
 * / em andamento / restante até a meta. Sem a fonte das horas por dia,
 * mostra a faixa hachurada inteira com "conectando" — não inventa número.
 */
function renderBarraDeHoje() {
  const labels = document.getElementById("hrBarraLabels");
  const segs = document.getElementById("hrBarraSegs");
  if (!labels || !segs) return;

  const hoje = diaDeHojeNaSemana();
  if (!hoje || hoje.segundos === null) {
    labels.innerHTML = `<span style="flex:1">Horas de hoje</span>`;
    segs.innerHTML = `<div class="hr-seg hachura" style="flex:1">carregando...</div>`;
    return;
  }

  const meta = 8 * 3600;
  const feito = Math.min(hoje.segundos, meta);
  const restante = Math.max(0, meta - feito);
  const pctFeito = Math.round((feito / meta) * 100);
  const pctRestante = 100 - pctFeito;

  labels.innerHTML = `
    <span style="flex:${Math.max(pctFeito, 12)}">Trabalhadas</span>
    <span style="flex:${Math.max(pctRestante, 12)}">Restante</span>
  `;
  segs.innerHTML = `
    <div class="hr-seg escuro" style="flex:${Math.max(pctFeito, 12)}">${pctFeito}%</div>
    <div class="hr-seg hachura" style="flex:${Math.max(pctRestante, 12)}">${formatarHoras(restante)}</div>
  `;
}

function diaDeHojeNaSemana() {
  if (!horasDadosSemana || !horasDadosSemana.dias) return null;
  const hojeISO = dataISOLocal(new Date());
  return horasDadosSemana.dias.find(d => d.data === hojeISO) || null;
}

function renderMetricas() {
  const alvo = document.getElementById("hrMetricas");
  if (!alvo) return;

  const entregues = (horasEntregues && horasEntregues.ok) ? horasEntregues.entregues.length : null;
  const clientes = (typeof nomesDosMeusClientes === "function") ? nomesDosMeusClientes().length : 0;

  // "Horas no mês" ainda não é o mês inteiro: é o que sabemos com certeza
  // (esta semana + a anterior). Chamar de "mês" um número parcial seria
  // enganoso, então o rótulo diz exatamente o que é.
  const dias = (horasDadosSemana && horasDadosSemana.dias) || [];
  const conhecidos = dias.filter(d => d.segundos !== null);
  const somaAtual = conhecidos.reduce((s, d) => s + d.segundos, 0);
  const temTotal = conhecidos.length > 0;
  const total = somaAtual + (horasSemanaPassada || 0);
  const rotuloTotal = horasSemanaPassada !== null ? "Últimas 2 semanas" : "Nesta semana";
  const horasMostradas = temTotal ? formatarHoras(horasSemanaPassada !== null ? total : somaAtual) : "—";

  const icRelogio = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const icCheck = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const icPessoas = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  alvo.innerHTML = `
    <div class="hr-metrica"><b>${horasMostradas}</b><span>${icRelogio} ${rotuloTotal}</span></div>
    <div class="hr-metrica"><b>${entregues === null ? "—" : entregues}</b><span>${icCheck} Tarefas entregues</span></div>
    <div class="hr-metrica"><b>${clientes || "—"}</b><span>${icPessoas} Clientes</span></div>
  `;
}

/**
 * O gráfico de barras da semana. Clicar numa barra abre o "Ajustar"
 * daquele dia — é o pedido do Cláudio: fazer aqui o que a tela Tempo do
 * Runrun.it faz.
 */
function renderProgressoDaSemana() {
  const graf = document.getElementById("hrProgGraf");
  const total = document.getElementById("hrProgTotal");
  if (!graf) return;

  const dias = (horasDadosSemana && horasDadosSemana.dias) || [];
  if (!dias.length) {
    graf.innerHTML = `<p class="hr-vazio">Carregando...</p>`;
    if (total) total.textContent = "—";
    return;
  }

  const conhecidos = dias.filter(d => d.segundos !== null);
  const somaSemana = conhecidos.reduce((s, d) => s + d.segundos, 0);
  if (total) total.textContent = conhecidos.length ? formatarHoras(somaSemana) : "—";

  // Altura relativa ao maior dia da semana (mínimo 8h, pra um dia curto
  // não virar uma barra cheia e enganar a leitura).
  const teto = Math.max(8 * 3600, ...conhecidos.map(d => d.segundos));
  const hojeISO = dataISOLocal(new Date());

  graf.innerHTML = dias.map((d, i) => {
    const ehHoje = d.data === hojeISO;
    const altura = d.segundos === null ? 0 : Math.max(2, Math.round((d.segundos / teto) * 100));
    const classes = ["hr-prog-barra"];
    if (ehHoje) classes.push("hoje");
    if (d.travado) classes.push("travado");
    return `
      <button type="button" class="hr-prog-dia" data-dia="${d.data}" title="Ajustar ${d.data}">
        ${d.segundos !== null ? `<span class="hr-prog-tip">${formatarHoras(d.segundos)}</span>` : ""}
        <span class="hr-prog-trilho"><span class="${classes.join(" ")}" style="height:${altura}%"></span></span>
        <span class="hr-prog-rot ${ehHoje ? "hoje" : ""}">${HORAS_DIAS_CURTOS[i][0]}</span>
      </button>
    `;
  }).join("");

  graf.querySelectorAll(".hr-prog-dia").forEach(btn => {
    btn.addEventListener("click", () => abrirAjusteDeHoras(btn.dataset.dia));
  });
}

/**
 * O anel do cronômetro: o tempo trabalhado HOJE. Enquanto a fonte das
 * horas por dia não existir, ele mostra o tempo da tarefa que está
 * rodando agora — que o Colmeia já sabe de verdade.
 */
function renderCronometroDeHoje() {
  const horasEl = document.getElementById("hrAnelHoras");
  const arco = document.getElementById("hrAnelArco");
  const botao = document.getElementById("hrTrackPlay");
  if (!horasEl || !arco) return;

  const hoje = diaDeHojeNaSemana();
  const rodando = tasks.find(t => t.running && ehMinhaTarefa(t));

  let segundos = null;
  if (hoje && hoje.segundos !== null) segundos = hoje.segundos;
  else if (rodando) segundos = rodando.timerSeconds || 0;

  horasEl.textContent = segundos === null ? "--:--" : formatTime(segundos);

  const meta = 8 * 3600;
  const pct = segundos === null ? 0 : Math.min(1, segundos / meta);
  const volta = 351.9;
  arco.setAttribute("stroke-dashoffset", String(volta - volta * pct));

  if (botao) {
    botao.innerHTML = rodando ? pauseIcon : playIcon;
    botao.title = rodando ? `Pausar "${rodando.title}"` : "Nenhuma tarefa rodando";
    botao.disabled = !rodando;
  }
}

function renderBarraSemanal() {
  const rots = document.getElementById("hrSemanaRots");
  const barra = document.getElementById("hrSemanaBarra");
  const pctEl = document.getElementById("hrSemanaPct");
  if (!rots || !barra) return;

  const dias = (horasDadosSemana && horasDadosSemana.dias) || [];
  const hojeISO = dataISOLocal(new Date());

  rots.innerHTML = HORAS_DIAS_CURTOS.map((nome, i) => {
    const ehHoje = dias[i] && dias[i].data === hojeISO;
    return `<span class="${ehHoje ? "hoje" : ""}">${nome}</span>`;
  }).join("");

  barra.innerHTML = dias.map(d => {
    const ehHoje = d.data === hojeISO;
    if (d.segundos === null) return `<span class="hr-semana-seg">·</span>`;
    const classe = ehHoje ? "hoje" : (d.segundos > 0 ? "cheia" : "");
    return `<span class="hr-semana-seg ${classe}">${Math.round(d.segundos / 3600)}h</span>`;
  }).join("") || HORAS_DIAS_CURTOS.map(() => `<span class="hr-semana-seg">·</span>`).join("");

  const conhecidos = dias.filter(d => d.segundos !== null);
  if (pctEl) {
    if (!conhecidos.length) { pctEl.textContent = "—"; return; }
    const soma = conhecidos.reduce((s, d) => s + d.segundos, 0);
    pctEl.textContent = Math.round((soma / (40 * 3600)) * 100) + "%";
  }
}

/**
 * Card escuro: histórico de tarefas entregues. Sem checklist e sem
 * contador — a pedido do Cláudio, é só o histórico.
 */
function renderEntregues() {
  const alvo = document.getElementById("hrEntregues");
  if (!alvo) return;

  if (!horasEntregues) {
    alvo.innerHTML = `<p class="hr-esc-vazio">Carregando...</p>`;
    return;
  }
  if (!horasEntregues.ok || !horasEntregues.entregues.length) {
    alvo.innerHTML = `<p class="hr-esc-vazio">Nenhuma tarefa entregue encontrada.</p>`;
    return;
  }

  alvo.innerHTML = horasEntregues.entregues.map(t => {
    const quando = t.quando
      ? new Date(t.quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) +
        " · " + new Date(t.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "";
    const onde = [t.cliente, t.projeto].filter(Boolean).join(" · ");
    return `
      <button type="button" class="hr-esc-item" data-id="${t.id}">
        <span class="hr-esc-ic">${iconeDoTipoDeTarefa(t.tipo)}</span>
        <span class="hr-esc-txt">
          <span class="hr-esc-nome">${escaparHTML(t.titulo)}</span>
          <span class="hr-esc-sub">${escaparHTML(onde)}${onde && quando ? " · " : ""}${quando}</span>
        </span>
      </button>
    `;
  }).join("");

  alvo.querySelectorAll(".hr-esc-item").forEach(btn => {
    btn.addEventListener("click", () => abrirTarefaPorId(Number(btn.dataset.id)));
  });
}

function iconeDoTipoDeTarefa(tipo) {
  if (tipo === "video") return `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="13" height="12" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M16 10.5l5-2.5v8l-5-2.5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  if (tipo === "email") return `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 7l8.5 6 8.5-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  return `<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M8 15l3-4 3 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** A lista sanfona da esquerda: comparativo com a semana passada. */
function renderComparativo() {
  const alvo = document.getElementById("hrComparativo");
  if (!alvo) return;

  const dias = (horasDadosSemana && horasDadosSemana.dias) || [];
  const conhecidos = dias.filter(d => d.segundos !== null);
  const somaSemana = conhecidos.reduce((s, d) => s + d.segundos, 0);
  const travados = dias.filter(d => d.travado).length;
  const previstas = 40 * 3600;

  const seta = `<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const setaCima = `<svg viewBox="0 0 24 24" fill="none"><path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Comparativo com a semana passada. Só aparece quando a semana anterior
  // já foi buscada — não vale inventar uma variação sem ter com o que
  // comparar de verdade.
  let comparativoNome = "Carregando...";
  let comparativoSub = "";
  if (horasSemanaPassada !== null && conhecidos.length) {
    const diferenca = somaSemana - horasSemanaPassada;
    if (horasSemanaPassada === 0) {
      comparativoNome = "Primeira semana com horas lançadas";
      comparativoSub = formatarHoras(somaSemana) + " nesta semana";
    } else {
      const pct = Math.round((diferenca / horasSemanaPassada) * 100);
      const subiu = diferenca >= 0;
      comparativoNome = `<span class="${subiu ? "hr-sobe" : "hr-desce"}">${subiu ? "↑" : "↓"} ${subiu ? "+" : ""}${pct}%</span> vs. semana passada`;
      comparativoSub = `${formatarHoras(somaSemana)} agora · ${formatarHoras(horasSemanaPassada)} antes`;
    }
  }

  alvo.innerHTML = `
    <div class="hr-lis-linha">
      <span class="hr-lis-nome">Horas realizadas</span>
      <span class="hr-lis-valor">${conhecidos.length ? formatarHoras(somaSemana) : "—"}</span>
    </div>
    <div class="hr-lis-linha"><span class="hr-lis-nome">Comparativo semanal</span><span class="hr-lis-seta">${setaCima}</span></div>
    <div class="hr-lis-corpo">
      <span class="hr-lis-thumb">
        <svg viewBox="0 0 24 24" fill="none"><path d="M4 17l5-5 4 3 7-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h5v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <span class="hr-lis-corpo-txt">
        <span class="hr-lis-corpo-nome">${comparativoNome}</span>
        <span class="hr-lis-corpo-sub">${comparativoSub}</span>
      </span>
    </div>
    <div class="hr-lis-linha">
      <span class="hr-lis-nome">Horas previstas</span>
      <span class="hr-lis-valor">${formatarHoras(previstas)}</span>
    </div>
    <div class="hr-lis-linha">
      <span class="hr-lis-nome">Dias travados</span>
      <span class="hr-lis-valor ${travados ? "alerta" : ""}">${conhecidos.length ? travados : "—"}</span>
    </div>
  `;
}

// ===== Calendário da semana =====

const HORAS_LINHAS_CAL = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function renderCalendarioDaSemana() {
  const grade = document.getElementById("hrCalGrade");
  if (!grade) return;

  const inicio = horasSemanaAtual;
  const mesAtual = document.getElementById("hrMesAtual");
  const mesAnt = document.getElementById("hrMesAnterior");
  const mesSeg = document.getElementById("hrMesSeguinte");
  if (mesAtual) mesAtual.textContent = `${HORAS_MESES[inicio.getMonth()]} ${inicio.getFullYear()}`;
  if (mesAnt) mesAnt.textContent = HORAS_MESES[(inicio.getMonth() + 11) % 12];
  if (mesSeg) mesSeg.textContent = HORAS_MESES[(inicio.getMonth() + 1) % 12];

  const hojeISO = dataISOLocal(new Date());
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicio.getTime() + i * 24 * 60 * 60 * 1000);
    dias.push({ data: dataISOLocal(d), numero: d.getDate(), nome: HORAS_DIAS_CURTOS[i] });
  }

  const cabecalho = dias.map(d => `
    <div class="hr-cal-dia-cab ${d.data === hojeISO ? "hoje" : ""}">
      <div class="hr-cal-dia-nome">${d.nome}</div>
      <div class="hr-cal-dia-num">${String(d.numero).padStart(2, "0")}</div>
    </div>
  `).join("");

  const linhas = HORAS_LINHAS_CAL.map(hora => `
    <div class="hr-cal-hora">${hora}:00</div>
    ${dias.map(() => `<div class="hr-cal-cel"></div>`).join("")}
  `).join("");

  grade.innerHTML = `
    <div class="hr-cal-canto"></div>
    ${cabecalho}
    <div class="hr-cal-corpo">
      ${linhas}
      ${montarEventosDoCalendario(dias)}
    </div>
  `;

  grade.querySelectorAll(".hr-cal-evento[data-task-id]").forEach(el => {
    el.addEventListener("click", () => abrirTarefaPorId(Number(el.dataset.taskId)));
  });
}

/**
 * Põe na grade as reuniões do Google e as entregas desejadas das tarefas.
 * Cada evento é posicionado por cima da grade — a coluna vem do dia e a
 * altura, da hora de início.
 */
function montarEventosDoCalendario(dias) {
  const eventos = [];

  // Reuniões do Google Agenda.
  if (horasAgendaSemana && horasAgendaSemana.ok) {
    (horasAgendaSemana.reunioes || []).forEach(r => {
      const coluna = dias.findIndex(d => d.data === r.dia);
      if (coluna === -1) return;
      eventos.push({
        coluna,
        hora: Number((r.horaInicio || "09:00").split(":")[0]),
        minuto: Number((r.horaInicio || "09:00").split(":")[1] || 0),
        classe: "escuro",
        titulo: r.titulo,
        sub: `${r.horaInicio} – ${r.horaFim}`,
        taskId: null,
      });
    });
  }

  // Entregas desejadas das minhas tarefas nesta semana.
  (typeof tasks !== "undefined" ? tasks : []).filter(t => t.id && ehMinhaTarefa(t) && t.due).forEach(t => {
    const coluna = dias.findIndex(d => d.data === t.due);
    if (coluna === -1) return;
    eventos.push({
      coluna,
      hora: 18,
      minuto: 0,
      classe: "claro",
      titulo: t.title,
      sub: t.client || "Entrega desejada",
      taskId: t.id,
    });
  });

  const primeiraHora = HORAS_LINHAS_CAL[0];
  const alturaLinha = 38;

  return eventos.map(ev => {
    const linhasAcima = Math.max(0, (ev.hora - primeiraHora) + ev.minuto / 60);
    const topo = Math.min(linhasAcima, HORAS_LINHAS_CAL.length - 1) * alturaLinha + 3;
    const esq = `calc(52px + ((100% - 52px) / 7) * ${ev.coluna} + 3px)`;
    const larg = `calc(((100% - 52px) / 7) * 1.9)`;
    return `
      <div class="hr-cal-evento ${ev.classe}" style="top:${topo}px; left:${esq}; width:${larg};"
           ${ev.taskId ? `data-task-id="${ev.taskId}"` : ""} title="${escaparHTML(ev.titulo)}">
        <span class="hr-cal-ev-nome">${escaparHTML(ev.titulo)}</span>
        <span class="hr-cal-ev-sub">${escaparHTML(ev.sub)}</span>
      </div>
    `;
  }).join("");
}

// ===== "Ajustar" — o que a tela Tempo do Runrun.it faz =====

let horasDiaEmAjuste = null;
let horasAbaAtiva = "lancar";

function abrirAjusteDeHoras(diaISO) {
  const overlay = document.getElementById("horasModalOverlay");
  if (!overlay) return;
  horasDiaEmAjuste = diaISO;
  horasAbaAtiva = "lancar";
  overlay.hidden = false;

  const titulo = document.getElementById("horasModalTitulo");
  if (titulo) {
    const [ano, mes, dia] = diaISO.split("-").map(Number);
    titulo.textContent = `Ajustar ${String(dia).padStart(2, "0")} de ${HORAS_MESES[mes - 1]}`;
  }
  renderModalDeHoras();
}

function fecharAjusteDeHoras() {
  const overlay = document.getElementById("horasModalOverlay");
  if (overlay) overlay.hidden = true;
  horasDiaEmAjuste = null;
}

function renderModalDeHoras() {
  const body = document.getElementById("horasModalBody");
  if (!body) return;

  document.getElementById("horasAbaLancar")?.classList.toggle("active", horasAbaAtiva === "lancar");
  document.getElementById("horasAbaJustificar")?.classList.toggle("active", horasAbaAtiva === "justificar");

  if (horasAbaAtiva === "justificar") {
    // Sem rodeio: a API do Runrun.it não tem como justificar o dia (ver
    // justificarDiaTimesheet, Agenda.gs). Melhor dizer isso e levar pro
    // lugar certo do que ter um botão que não faz nada.
    body.innerHTML = `
      <p class="hr-modal-hint">
        Justificar o dia (folga, feriado, atestado) só existe na tela do próprio Runrun.it —
        a API deles não abre isso pra fora, então o Colmeia não consegue fazer por você.
      </p>
      <button type="button" id="horasAbrirRunrun" class="hr-modal-botao">Abrir a aba Tempo no Runrun.it</button>
    `;
    document.getElementById("horasAbrirRunrun").addEventListener("click", () => {
      window.open("https://runrun.it/pt-BR/me/timesheet", "_blank", "noopener");
    });
    return;
  }

  // Aba "Lançar horas numa tarefa": só as MINHAS tarefas, que são as
  // únicas em que faz sentido lançar tempo.
  const minhas = (typeof tasks !== "undefined" ? tasks : []).filter(t => t.id && ehMinhaTarefa(t));
  body.innerHTML = `
    <p class="hr-modal-hint">Escolha a tarefa e quanto tempo você trabalhou nela nesse dia.</p>
    <select id="horasTarefa" class="hr-modal-campo">
      ${minhas.length
        ? minhas.map(t => `<option value="${t.id}">${escaparHTML(t.title)}${t.client ? " — " + escaparHTML(t.client) : ""}</option>`).join("")
        : `<option value="">Nenhuma tarefa sua em aberto</option>`}
    </select>
    <div class="hr-modal-dupla">
      <input type="number" id="horasQtdH" class="hr-modal-campo" min="0" max="23" placeholder="Horas">
      <input type="number" id="horasQtdM" class="hr-modal-campo" min="0" max="59" step="5" placeholder="Minutos">
    </div>
    <button type="button" id="horasSalvarLancamento" class="hr-modal-botao">Lançar horas</button>
    <p class="hr-modal-aviso" id="horasAviso" hidden></p>
  `;
  document.getElementById("horasSalvarLancamento").addEventListener("click", salvarLancamentoDeHoras);
}

function mostrarAvisoDoModalDeHoras(texto) {
  const el = document.getElementById("horasAviso");
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
}

async function salvarLancamentoDeHoras() {
  const taskId = document.getElementById("horasTarefa")?.value;
  const h = Number(document.getElementById("horasQtdH")?.value || 0);
  const m = Number(document.getElementById("horasQtdM")?.value || 0);
  if (!taskId) { mostrarAvisoDoModalDeHoras("Escolha uma tarefa."); return; }
  if (h === 0 && m === 0) { mostrarAvisoDoModalDeHoras("Informe quanto tempo você trabalhou."); return; }

  const resposta = await chamarBackend({
    acao: "lancarHoras",
    dados: { taskId, dia: horasDiaEmAjuste, segundos: h * 3600 + m * 60, designer: DESIGNER_LOGADO },
  });

  if (resposta.ok) {
    fecharAjusteDeHoras();
    mostrarToast("Horas lançadas.", "sucesso");
    carregarDadosDaPaginaHoras();
    return;
  }
  mostrarAvisoDoModalDeHoras(resposta.semRede
    ? "Sem internet agora — tenta de novo em alguns segundos."
    : (resposta.error || "Não consegui lançar as horas agora."));
}

// ===== Ligações =====

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("horasModalFechar")?.addEventListener("click", fecharAjusteDeHoras);
  document.getElementById("horasModalOverlay")?.addEventListener("click", e => {
    if (e.target.id === "horasModalOverlay") fecharAjusteDeHoras();
  });
  document.getElementById("horasAbaLancar")?.addEventListener("click", () => {
    horasAbaAtiva = "lancar";
    renderModalDeHoras();
  });
  document.getElementById("horasAbaJustificar")?.addEventListener("click", () => {
    horasAbaAtiva = "justificar";
    renderModalDeHoras();
  });

  // A setinha do card Progresso ajusta o DIA DE HOJE — é o atalho mais
  // provável de quem clica ali.
  document.getElementById("hrProgAjustar")?.addEventListener("click", e => {
    e.stopPropagation();
    abrirAjusteDeHoras(dataISOLocal(new Date()));
  });

  document.getElementById("hrTrackPlay")?.addEventListener("click", () => {
    const rodando = tasks.find(t => t.running && ehMinhaTarefa(t));
    if (!rodando) return;
    rodando.running = false;
    rodando._runningToggleEm = Date.now();
    pausarTarefaNoBackend(rodando.id);
    render();
    updateNowPlaying();
    renderCronometroDeHoje();
  });

  document.getElementById("hrTrackAbrir")?.addEventListener("click", () => {
    const rodando = tasks.find(t => t.running && ehMinhaTarefa(t));
    if (rodando) abrirTarefaPorId(rodando.id);
  });

  document.getElementById("hrTrackRunrun")?.addEventListener("click", () => {
    window.open("https://runrun.it/pt-BR/me/timesheet", "_blank", "noopener");
  });
});
