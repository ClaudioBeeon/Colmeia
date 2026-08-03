/**
 * ===================================================================
 * A HISTÓRIA DA PEÇA — linha do tempo dentro da tarefa
 * ===================================================================
 *
 * Uma aba nova ao lado de "Descrição": briefing chegou → alguém
 * trabalhou → arquivo subiu → cliente comentou → entregue, cada um com
 * o tempo até o passo seguinte bem visível. Responde "por que
 * demorou?" sem ninguém precisar se defender — quase sempre a resposta
 * é um buraco de espera, não trabalho lento.
 *
 * DE ONDE VÊM OS EVENTOS (nada é buscado igual, cada um tem uma fonte):
 *   - "Tarefa criada" — task.createdAt, já vem no objeto da tarefa.
 *   - Comentários — buscarComentariosDoBackend(task.id): a MESMA busca
 *     que já alimenta a aba Comentários, reaproveitada aqui (não busca
 *     de novo o que já ia buscar de qualquer jeito).
 *   - "Começou a trabalhar" — ação buscarHistoriaDaTarefa (Código.gs),
 *     lendo a aba "Log de Plays" (Planilha.gs) filtrada por esta
 *     tarefa. O log só guarda o INÍCIO de cada play, não quando
 *     pausou — por isso é "começou a trabalhar às HH:MM", não uma
 *     duração de sessão.
 *   - Arquivo adicionado — mesma ação, lendo TODOS os arquivos da
 *     pasta do card no Drive (sem o corte de 30 min que
 *     buscarUploadsRecentesDoCard usa pro aviso da Bee).
 *   - "Entregue" — task.entregue; o horário exato só é preciso se a
 *     entrega aconteceu NESTA sessão (task._entregueEm); senão usa
 *     task.lastActivityAt como aproximação (o Runrun.it não expõe o
 *     instante exato da entrega), e o evento é marcado como tal.
 *
 * CUIDADO AO MEXER: carregado depois de detalhe-alteracao.js (mesma
 * família — "recursos extras do pop-up de detalhe"), mas chamado a
 * partir de detalhe-modal.js sem esperar guarda de `typeof` alguma:
 * assim como carregarDescricaoCardMae (detalhe-cardmae.js, também
 * carregado DEPOIS de detalhe-modal.js), a chamada só acontece dentro
 * de um clique — em tempo de execução, bem depois de todo script já
 * ter carregado, então a ordem entre os arquivos não importa aqui.
 */

// taskId (string) -> eventos já montados, pra reabrir a aba sem buscar
// de novo (mesmo padrão de anexosJaBuscados, js/chat-comentarios.js).
const historiaJaMontada = new Map();

const HISTORIA_ICONES = {
  criada: "🐣",
  comentario: "💬",
  play: "▶️",
  arquivo: "📎",
  entregue: "✅",
};

/** "2h depois" / "3 dias depois" / "poucos minutos depois" — o intervalo desde o evento anterior. */
function formatarIntervaloHistoria(ms) {
  if (ms < 5 * 60000) return "poucos minutos depois";
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return `${minutos}min depois`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas}h depois`;
  const dias = Math.round(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""} depois`;
}

function montarEventosDaHistoria(task, comentarios, dados) {
  const eventos = [];

  if (task.createdAt) {
    eventos.push({ tipo: "criada", quando: new Date(task.createdAt).getTime(), titulo: "Tarefa criada" });
  }

  (comentarios || []).forEach(c => {
    const quando = c.data ? new Date(c.data).getTime() : null;
    if (!quando) return;
    eventos.push({
      tipo: "comentario",
      quando,
      titulo: `${c.autor} comentou`,
      detalhe: (c.texto || "").slice(0, 140),
    });
  });

  (dados.plays || []).forEach(p => {
    if (!p.quando) return;
    eventos.push({ tipo: "play", quando: p.quando, titulo: `${p.designer || "Alguém"} começou a trabalhar` });
  });

  (dados.arquivos || []).forEach(a => {
    if (!a.quando) return;
    eventos.push({ tipo: "arquivo", quando: a.quando, titulo: "Arquivo adicionado", detalhe: a.nome });
  });

  if (task.entregue) {
    const exato = task._entregueEm || null;
    const aproximado = !exato && task.lastActivityAt ? new Date(task.lastActivityAt).getTime() : null;
    const quando = exato || aproximado;
    if (quando) {
      eventos.push({ tipo: "entregue", quando, titulo: "Entregue", aproximado: !exato });
    }
  }

  eventos.sort((a, b) => a.quando - b.quando);
  return eventos;
}

function historiaEventoHTML(evento, anterior) {
  const hora = new Date(evento.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const intervalo = anterior ? formatarIntervaloHistoria(evento.quando - anterior.quando) : "";
  return `
    <div class="historia-item">
      <div class="historia-ponto">${HISTORIA_ICONES[evento.tipo] || "•"}</div>
      <div class="historia-corpo">
        <div class="historia-linha1">
          <span class="historia-titulo">${escaparHTML(evento.titulo)}</span>
          <span class="historia-hora">${hora}${evento.aproximado ? " (aproximado)" : ""}</span>
        </div>
        ${evento.detalhe ? `<p class="historia-detalhe">${escaparHTML(evento.detalhe)}</p>` : ""}
        ${intervalo ? `<span class="historia-intervalo">${intervalo}</span>` : ""}
      </div>
    </div>
  `;
}

function desenharHistoria(eventos) {
  const el = document.getElementById("historiaContent");
  if (!el) return;
  if (!eventos.length) {
    el.innerHTML = `<p class="workflow-seq-empty">Ainda não tem nada pra mostrar aqui.</p>`;
    return;
  }
  el.innerHTML = `<div class="historia-lista">${eventos.map((ev, i) => historiaEventoHTML(ev, eventos[i - 1])).join("")}</div>`;
}

async function carregarHistoriaDaTarefa(task) {
  if (!task || !task.id) return;
  const chave = String(task.id);
  const jaTem = historiaJaMontada.get(chave);
  if (jaTem) { desenharHistoria(jaTem); return; }

  const el = document.getElementById("historiaContent");
  if (el) el.innerHTML = `<p class="workflow-seq-empty">Montando a linha do tempo...</p>`;

  const [comentarios, dados] = await Promise.all([
    buscarComentariosDoBackend(task.id),
    chamarBackend({ acao: "buscarHistoriaDaTarefa", taskId: task.id }),
  ]);

  // Trocou de tarefa (ou fechou o card) enquanto isso vinha — não
  // escreve por cima de uma aba que já é de outra coisa.
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== chave) return;

  if (!dados || !dados.ok) {
    if (el) el.innerHTML = `<p class="workflow-seq-empty">Não consegui montar a linha do tempo agora.</p>`;
    return;
  }

  const eventos = montarEventosDaHistoria(task, comentarios || [], dados);
  historiaJaMontada.set(chave, eventos);
  desenharHistoria(eventos);
}
