/**
 * ===================================================================
 * A PALETA DE COMANDO — Ctrl+Espaço (a "janelinha da Bee")
 * ===================================================================
 *
 * Aperta Ctrl+Espaço (ou Cmd+Espaço no Mac) em qualquer tela e abre uma
 * caixinha no meio: digita, acha tarefa/cliente, executa ação, troca de
 * página. Fecha com Esc.
 *
 * POR QUE NÃO É Ctrl+K (a escolha óbvia, e a que a primeira versão
 * deste arquivo usava): tanto o Firefox quanto o Chrome reservam Ctrl+K
 * pra focar a busca da barra de endereço, NO NÍVEL DO NAVEGADOR — antes
 * de a página sequer receber o evento. `preventDefault()` não alcança
 * isso, em nenhum dos dois; não é bug de código, é o navegador
 * ignorando a página de propósito. Testado e confirmado nos dois.
 * Ctrl+Espaço não é reservado por nenhum navegador nem é atalho comum
 * de sistema em teclado português — por isso a troca.
 *
 * COMO ELA DECIDE O QUE MOSTRAR (a parte importante):
 *
 * É HÍBRIDA de propósito. Tudo que aparece na lista é calculado AQUI no
 * navegador, na hora, sem nenhuma ida ao backend — por isso ela responde
 * instantâneo e continua funcionando com a internet fora. A Bee de
 * verdade (que pensa, demora alguns segundos e precisa de internet) só
 * entra quando a pessoa ESCOLHE a última linha da lista, "Perguntar pra
 * Bee". Nunca sozinha.
 *
 * Isso é escolha de projeto, não limitação: mandar tudo pra IA
 * interpretar deixaria "achar uma tarefa" — a coisa mais repetida do dia
 * — dependente de rede e de 2 a 5 segundos de espera.
 *
 * DE ONDE VÊM AS LINHAS:
 *   1. Ações contextuais — só aparecem quando fazem sentido (pausar só
 *      se tem algo rodando; entregar só se tem card aberto).
 *   2. Tarefas — busca em `tasksTodas` por título, cliente e responsável.
 *   3. Ir para — as páginas do app (as mesmas da barra lateral).
 *   4. Perguntar pra Bee — sempre a última, sempre disponível.
 *
 * CUIDADO AO MEXER: este arquivo é carregado por último (só antes do
 * login-boot.js), porque usa função de quase todo mundo — openDetail,
 * abrirTarefaPorId, mostrarPagina, beeAbrirPainel, enviarParaBeeLivre,
 * tocarTarefaNoBackend... Se mover pra cima na lista de <script> do
 * index.html, essas funções ainda não existem e ela quebra.
 */

// Guarda qual linha está destacada agora (a que o Enter vai executar).
let paletaIndiceAtivo = 0;
// Lista de linhas montada no último desenho — o Enter e o clique leem
// daqui, então ela é sempre o espelho do que está na tela.
let paletaLinhas = [];

/**
 * Tira acento e põe em minúsculo, pra busca não depender de digitação
 * exata: "aparecida" acha "Aparecida", "sao paulo" acha "São Paulo".
 */
function paletaNormalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Dá uma nota de 0 a 3 pra "o que foi digitado" contra "o texto do
 * item". Nota 0 = não serve e some da lista.
 *
 * A nota existe pra ordenar o resultado por relevância, não só por
 * "achou": quem começa com o que você digitou aparece antes de quem só
 * contém aquilo no meio de uma palavra.
 */
function paletaNota(alvo, termo) {
  const a = paletaNormalizar(alvo);
  const t = paletaNormalizar(termo).trim();
  if (!t) return 1;

  // Todas as palavras digitadas precisam aparecer — assim "natura post"
  // acha "Post carrossel — Natura" mesmo com as palavras fora de ordem.
  const palavras = t.split(/\s+/).filter(Boolean);
  if (!palavras.every(p => a.includes(p))) return 0;

  if (a.startsWith(t)) return 3;                       // começa igualzinho
  if (new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(a)) return 2; // começo de palavra
  return 1;                                            // só contém
}

/** A tarefa que está com o cronômetro rodando agora, se tiver alguma. */
function paletaTarefaRodando() {
  return tasks.find(t => t.running) || null;
}

/** A tarefa do card que está aberto agora, se tiver algum aberto. */
function paletaTarefaAberta() {
  if (detailIdx === null || detailIdx === undefined) return null;
  const panel = document.getElementById("taskDetail");
  if (!panel || !panel.classList.contains("visible")) return null;
  return tasks[detailIdx] || null;
}

/**
 * Monta a lista inteira de linhas pro texto digitado.
 *
 * Cada linha é { grupo, icone, titulo, subtitulo, atalho, executar }.
 * `executar` é a função que o Enter (ou o clique) chama.
 */
function paletaMontarLinhas(termo) {
  const linhas = [];
  const t = termo.trim();

  // ---------- 1. Ações contextuais ----------
  // Só entram na lista quando existe alvo pra elas. Uma ação que não tem
  // em quem agir não deve aparecer nem apagada: ocupa espaço e confunde.
  const acoes = [];

  const rodando = paletaTarefaRodando();
  if (rodando) {
    acoes.push({
      icone: "pause",
      titulo: "Pausar o cronômetro",
      subtitulo: rodando.title,
      executar: () => {
        const viva = tasks.find(x => String(x.id) === String(rodando.id)) || rodando;
        viva.running = false;
        viva._runningToggleEm = Date.now();
        pausarTarefaNoBackend(viva.id);
        marcarUltimaTarefaPausada(viva.id);
        render();
        updateNowPlaying();
        mostrarToast("Cronômetro pausado.");
      },
    });
  }

  const aberta = paletaTarefaAberta();
  if (aberta) {
    if (!aberta.running) {
      acoes.push({
        icone: "play",
        titulo: "Dar play nesta tarefa",
        subtitulo: aberta.title,
        executar: () => paletaDarPlay(aberta),
      });
    }
    if (aberta.pastaUrlSalva) {
      acoes.push({
        icone: "pasta",
        titulo: "Abrir a pasta no Drive",
        subtitulo: aberta.title,
        executar: () => window.open(aberta.pastaUrlSalva, "_blank", "noopener"),
      });
    }
    if (aberta.link) {
      acoes.push({
        icone: "link",
        titulo: "Abrir esta tarefa no Runrun.it",
        subtitulo: aberta.title,
        executar: () => window.open(aberta.link, "_blank", "noopener"),
      });
    }
  }

  acoes.push({
    icone: "tema",
    titulo: document.documentElement.getAttribute("data-theme") === "dark"
      ? "Voltar pro modo claro"
      : "Mudar pro modo escuro",
    executar: () => {
      const escuro = document.documentElement.getAttribute("data-theme") === "dark";
      aplicarTema(escuro ? "light" : "dark");
      try { localStorage.setItem(TEMA_CHAVE, escuro ? "light" : "dark"); } catch (e) { /* sem localStorage, só não lembra */ }
    },
  });

  acoes.push({
    icone: "bee",
    titulo: "Abrir a Bee",
    subtitulo: "conversa livre, sem tarefa",
    executar: () => beeAbrirPainel(),
  });

  acoes
    .map(a => ({ ...a, _nota: Math.max(paletaNota(a.titulo, t), paletaNota(a.subtitulo || "", t)) }))
    .filter(a => a._nota > 0)
    .sort((a, b) => b._nota - a._nota)
    .forEach(a => linhas.push({ ...a, grupo: "Ações" }));

  // ---------- 2. Tarefas ----------
  // Busca em tasksTodas (mais amplo que o quadro: pega também tarefa que
  // está numa etapa fora das 5 colunas). Abrir usa abrirTarefaPorId, que
  // já sabe buscar avulsa no Runrun.it se ela não estiver carregada.
  if (t) {
    const achadas = (typeof tasksTodas !== "undefined" ? tasksTodas : [])
      .map(tarefa => {
        // SOMA, não "o maior": uma tarefa que bate no título E no cliente
        // tem que vir antes de uma que só bate no cliente. Com Math.max as
        // duas empatavam, e o desempate virava a ordem crua do array — ou
        // seja, aleatória do ponto de vista de quem está buscando.
        const nota =
          paletaNota(tarefa.title, t) * 3 +      // o título pesa mais
          paletaNota(tarefa.client, t) * 2 +     // depois o cliente
          paletaNota(tarefa.assignee, t);        // e por último quem está com ela
        return { tarefa, nota };
      })
      .filter(x => x.nota > 0)
      .sort((a, b) => b.nota - a.nota)
      .slice(0, 8); // teto: lista longa demais deixa de ser escolha e vira leitura

    achadas.forEach(({ tarefa }) => {
      const etapa = (columnsDef.find(c => c.key === tarefa.status) || {}).label || tarefa.runrunStage || "";
      const partes = [tarefa.client, etapa, tarefa.assignee].filter(Boolean);
      linhas.push({
        grupo: "Tarefas",
        icone: tarefa.running ? "play" : "tarefa",
        titulo: tarefa.title,
        subtitulo: partes.join(" · "),
        atalho: "abrir",
        executar: () => paletaAbrirTarefa(tarefa),
      });
    });
  }

  // ---------- 3. Ir para ----------
  const paginas = [
    { page: "kanban", nome: "Quadro" },
    { page: "horas", nome: "Minhas horas" },
    { page: "repasse", nome: "Fila de repasse" },
    { page: "clientes", nome: "Meus clientes" },
    { page: "atendimento", nome: "Clientes por atendimento" },
    { page: "tipos", nome: "Tipos de tarefas" },
    { page: "runrun", nome: "Runrun completo" },
    { page: "bee", nome: "Bee" },
    { page: "painel-designers", nome: "Painel de Designers" },
  ];

  paginas
    .map(p => ({ ...p, _nota: paletaNota(p.nome, t) }))
    .filter(p => p._nota > 0)
    .sort((a, b) => b._nota - a._nota)
    .forEach(p => linhas.push({
      grupo: "Ir para",
      icone: "seta",
      titulo: p.nome,
      executar: () => mostrarPagina(p.page),
    }));

  // ---------- 4. Perguntar pra Bee (sempre por último) ----------
  // A única linha que sai do navegador e vai pro servidor. Fica sempre no
  // fim justamente pra nunca ser a escolha acidental do Enter: quem quer
  // a Bee desce até ela de propósito.
  if (t) {
    linhas.push({
      grupo: "Bee",
      icone: "bee",
      titulo: `Perguntar pra Bee: “${t}”`,
      subtitulo: "ela pensa alguns segundos e responde no painel",
      executar: () => {
        beeAbrirPainel();
        enviarParaBeeLivre(t);
      },
    });
  }

  return linhas;
}

/** Dá play numa tarefa seguindo o mesmo caminho do botão do quadro. */
function paletaDarPlay(tarefa) {
  // Nunca guardar referência de objeto de tarefa (bug recorrente do
  // CLAUDE.md): busca a versão viva pelo id na hora de agir.
  const viva = tasks.find(x => String(x.id) === String(tarefa.id));
  if (!viva) {
    mostrarToast("Essa tarefa não está no quadro agora.", "erro");
    return;
  }
  pararOutrasTarefasRodando(viva);
  viva.running = true;
  viva._runningToggleEm = Date.now();
  tocarTarefaNoBackend(viva.id, viva.title);
  render();
  updateNowPlaying();
  mostrarToast("Cronômetro rodando: " + viva.title);
}

/** Abre o card da tarefa, indo pro quadro antes se estiver em outra página. */
function paletaAbrirTarefa(tarefa) {
  if (document.getElementById("page-kanban").hidden) mostrarPagina("kanban");
  abrirTarefaPorId(tarefa.id);
}

// ===================== A janelinha em si =====================

const PALETA_ICONES = {
  bee: '<svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="14" rx="5" ry="6" stroke="currentColor" stroke-width="1.7"/><path d="M7 12h10M7.4 16h9.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9 6.5 10.8 9M15 6.5 13.2 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  tarefa: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 12l2.4 2.4 4.6-4.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none"><path d="M8 5.6v12.8l10-6.4z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none"><rect x="7" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor"/></svg>',
  pasta: '<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.4h7.4a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none"><path d="M10.5 13.5a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 1 0-5.1-5.1L11.8 7.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M13.5 10.5a3.6 3.6 0 0 0-5.1 0l-2.6 2.6a3.6 3.6 0 1 0 5.1 5.1l1.3-1.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  tema: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h13M13 6.5 18.5 12 13 17.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/** Escapa texto que vai pra dentro de innerHTML (nome de tarefa é dado de fora). */
function paletaEscapar(texto) {
  return String(texto || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cria o HTML da janelinha uma vez só e guarda no fim do <body>. */
function paletaGarantirNoDOM() {
  if (document.getElementById("paletaOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "paletaOverlay";
  overlay.className = "paleta-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="paleta-janela" role="dialog" aria-modal="true" aria-label="Barra de comando">
      <div class="paleta-campo">
        <span class="paleta-campo-ico">${PALETA_ICONES.bee}</span>
        <input id="paletaInput" type="text" autocomplete="off" spellcheck="false"
               placeholder="Buscar tarefa, cliente ou ação…" aria-label="O que você quer fazer?">
        <kbd class="paleta-kbd">esc</kbd>
      </div>
      <div class="paleta-lista" id="paletaLista"></div>
      <div class="paleta-rodape">
        <span><kbd class="paleta-kbd">↑</kbd><kbd class="paleta-kbd">↓</kbd> navegar</span>
        <span><kbd class="paleta-kbd">enter</kbd> escolher</span>
        <span class="paleta-rodape-bee">a Bee só responde se você escolher ela</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Clique no fundo escuro fecha; clique dentro da janela não.
  overlay.addEventListener("mousedown", e => {
    if (e.target === overlay) paletaFechar();
  });

  const input = document.getElementById("paletaInput");
  input.addEventListener("input", () => {
    paletaIndiceAtivo = 0;
    paletaDesenhar();
  });
  input.addEventListener("keydown", paletaTeclaNoCampo);
}

function paletaDesenhar() {
  const input = document.getElementById("paletaInput");
  const lista = document.getElementById("paletaLista");
  if (!input || !lista) return;

  paletaLinhas = paletaMontarLinhas(input.value);

  if (!paletaLinhas.length) {
    lista.innerHTML = `<p class="paleta-vazio">Nada com esse nome. Tenta parte do nome do cliente.</p>`;
    return;
  }

  // Trava o índice ativo dentro do tamanho da lista (ela muda a cada letra).
  if (paletaIndiceAtivo >= paletaLinhas.length) paletaIndiceAtivo = paletaLinhas.length - 1;
  if (paletaIndiceAtivo < 0) paletaIndiceAtivo = 0;

  let html = "";
  let grupoAnterior = null;
  paletaLinhas.forEach((linha, i) => {
    if (linha.grupo !== grupoAnterior) {
      html += `<div class="paleta-grupo">${paletaEscapar(linha.grupo)}</div>`;
      grupoAnterior = linha.grupo;
    }
    html += `
      <button type="button" class="paleta-linha${i === paletaIndiceAtivo ? " ativa" : ""}" data-i="${i}">
        <span class="paleta-linha-ico">${PALETA_ICONES[linha.icone] || PALETA_ICONES.seta}</span>
        <span class="paleta-linha-txt">
          <span class="paleta-linha-titulo">${paletaEscapar(linha.titulo)}</span>
          ${linha.subtitulo ? `<span class="paleta-linha-sub">${paletaEscapar(linha.subtitulo)}</span>` : ""}
        </span>
        ${linha.atalho ? `<span class="paleta-linha-atalho">${paletaEscapar(linha.atalho)}</span>` : ""}
      </button>
    `;
  });
  lista.innerHTML = html;

  lista.querySelectorAll(".paleta-linha").forEach(btn => {
    btn.addEventListener("click", () => paletaExecutar(Number(btn.dataset.i)));
    // Passar o mouse move o destaque, pra teclado e mouse não brigarem
    // pelo "qual é a linha escolhida".
    btn.addEventListener("mousemove", () => {
      const i = Number(btn.dataset.i);
      if (i === paletaIndiceAtivo) return;
      paletaIndiceAtivo = i;
      lista.querySelectorAll(".paleta-linha").forEach(b => b.classList.toggle("ativa", Number(b.dataset.i) === i));
    });
  });

  paletaRolarAteAtiva();
}

function paletaRolarAteAtiva() {
  const ativa = document.querySelector(".paleta-linha.ativa");
  if (ativa && ativa.scrollIntoView) ativa.scrollIntoView({ block: "nearest" });
}

function paletaTeclaNoCampo(e) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    paletaIndiceAtivo = Math.min(paletaIndiceAtivo + 1, paletaLinhas.length - 1);
    paletaDesenhar();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    paletaIndiceAtivo = Math.max(paletaIndiceAtivo - 1, 0);
    paletaDesenhar();
  } else if (e.key === "Enter") {
    e.preventDefault();
    paletaExecutar(paletaIndiceAtivo);
  } else if (e.key === "Escape") {
    e.preventDefault();
    paletaFechar();
  }
}

function paletaExecutar(i) {
  const linha = paletaLinhas[i];
  if (!linha) return;
  // Fecha ANTES de executar: várias ações abrem card/painel/página, e a
  // janelinha ainda aberta por cima roubaria o foco do que abriu.
  paletaFechar();
  try {
    linha.executar();
  } catch (err) {
    mostrarToast("Não consegui fazer isso agora.", "erro");
  }
}

function paletaAbrir() {
  paletaGarantirNoDOM();
  const overlay = document.getElementById("paletaOverlay");
  const input = document.getElementById("paletaInput");
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("aberta"));
  input.value = "";
  paletaIndiceAtivo = 0;
  paletaDesenhar();
  input.focus();
}

function paletaFechar() {
  const overlay = document.getElementById("paletaOverlay");
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove("aberta");
  // Espera a animação de saída antes de esconder de verdade.
  setTimeout(() => { overlay.hidden = true; }, 160);
}

function paletaEstaAberta() {
  const overlay = document.getElementById("paletaOverlay");
  return !!overlay && !overlay.hidden;
}

/**
 * O atalho global. Fica no document em fase de captura (true) pra pegar
 * o Ctrl+Espaço antes de qualquer campo de texto da tela — inclusive o
 * do chat e o da Bee, que também escutam tecla.
 *
 * Checa e.code também (não só e.key) porque "Espaço" é a mesma tecla
 * física em qualquer layout de teclado — diferente de "/", que muda de
 * lugar (e às vezes precisa de Shift) dependendo do layout (ex: ABNT2).
 */
document.addEventListener("keydown", e => {
  const semExtras = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
  const ehCtrlEspaco = semExtras && (e.key === " " || e.code === "Space");
  if (ehCtrlEspaco) {
    e.preventDefault();
    if (paletaEstaAberta()) paletaFechar();
    else paletaAbrir();
    return;
  }
  // Esc fecha a paleta antes de qualquer outra coisa fechar (o card, por
  // exemplo) — senão apertar Esc com a paleta aberta fechava o card atrás
  // dela, que não era o que a pessoa queria.
  if (e.key === "Escape" && paletaEstaAberta()) {
    e.preventDefault();
    e.stopPropagation();
    paletaFechar();
  }
}, true);
