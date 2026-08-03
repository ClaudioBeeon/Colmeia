/**
 * ===================================================================
 * EVENTOS DO SISTEMA — usados pela pílula "Linha do tempo" do chat
 * ===================================================================
 *
 * Até 2026-08-03 isso vivia numa aba própria ("História", ao lado de
 * "Descrição"), com o próprio jeito de desenhar (`.historia-item`).
 * Virou uma das pílulas do painel de comentários (js/chat-comentarios.js,
 * `abrirThreadLinha`/`buscarEventosComoComentarios`), que já mistura
 * comentário de verdade + Bee + esses eventos tudo junto por hora, no
 * MESMO formato de bolha de comentário — por isso esse arquivo hoje só
 * monta os EVENTOS (sem comentário nenhum: os comentários de verdade já
 * vêm de outra fonte no merge, incluí-los aqui duplicaria).
 *
 * DE ONDE VÊM OS EVENTOS (nada é buscado igual, cada um tem uma fonte):
 *   - "Tarefa criada" — task.createdAt, já vem no objeto da tarefa.
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
 */

const HISTORIA_ICONES = {
  criada: "🐣",
  play: "▶️",
  arquivo: "📎",
  entregue: "✅",
};

/**
 * SEM comentários de propósito (ver o comentário do topo do arquivo) —
 * é por isso que esse nome é "do sistema", diferente da antiga
 * montarEventosDaHistoria que misturava os dois.
 */
function montarEventosDoSistema(task, dados) {
  const eventos = [];

  if (task.createdAt) {
    eventos.push({ tipo: "criada", quando: new Date(task.createdAt).getTime(), titulo: "Tarefa criada" });
  }

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
