/**
 * ============================================
 * RELATÓRIO DIÁRIO DOS DESIGNERS
 * ============================================
 * Junta, pra UM designer e UM dia, tudo que o pop-up de relatório do
 * Painel de Designers mostra: tarefas tocadas, entregues (com tempo
 * gasto vs. esperado), a fila do dia (entrega hoje ou atrasada, lida do
 * quadro em cache — sem busca nova ao Runrun.it) e o que chegou depois
 * das 10h (repasse/prioridade, via FeedEventos).
 *
 * Nada aqui GRAVA nada — é só leitura, pensado pra abrir rápido: as
 * quatro fontes já existiam antes deste arquivo, cada uma cuidando do
 * seu próprio cache/custo (ver os comentários em cada uma).
 */

var RELATORIO_HORA_CORTE = '10:00';

function relatorioDiarioDesigner(designer, dataISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  if (!dataISO) return { ok: false, error: 'dataISO não informado.' };

  var tocadasResp = buscarPlaysDeHoje(designer, null, dataISO);
  var entreguesResp = buscarEntreguesDoDiaComTempo(designer, dataISO);
  var eventosResp = buscarEventosDoDiaAposHorario(designer, dataISO, RELATORIO_HORA_CORTE);
  var quadro = getTarefasColmeia();

  var filaDoDia = { total: 0, atrasadas: 0, hojeCerto: 0 };
  if (quadro && quadro.ok && Array.isArray(quadro.tarefas)) {
    quadro.tarefas.forEach(function (t) {
      if (String(t.assignee || '').toLowerCase().trim() !== String(designer).toLowerCase().trim()) return;
      if (!t.due) return;
      var dueISO = String(t.due).substring(0, 10);
      if (dueISO > dataISO) return; // entrega no futuro não conta pra este dia
      filaDoDia.total++;
      if (dueISO < dataISO) filaDoDia.atrasadas++; else filaDoDia.hojeCerto++;
    });
  }

  return {
    ok: true,
    data: dataISO,
    tocadas: tocadasResp.ok ? tocadasResp.tarefas : [],
    entregues: entreguesResp.ok ? entreguesResp.entregues : [],
    filaDoDia: filaDoDia,
    chegaramDepoisDas10h: eventosResp.ok ? eventosResp.eventos : []
  };
}
