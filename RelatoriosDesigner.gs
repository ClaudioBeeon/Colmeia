/**
 * ============================================
 * RELATÓRIO DIÁRIO DOS DESIGNERS
 * ============================================
 * Junta, pra UM designer e UM dia, tudo que o pop-up de relatório do
 * Painel de Designers mostra: tarefas tocadas, entregues (com tempo
 * gasto vs. esperado), tarefas transferidas pra frente, a fila do dia
 * (entrega hoje ou atrasada, lida do quadro em cache — sem busca nova
 * ao Runrun.it) e o que chegou depois das 10h (repasse/prioridade, via
 * FeedEventos).
 *
 * Nada aqui GRAVA nada — é só leitura, pensado pra abrir rápido: as
 * fontes já existiam antes deste arquivo, cada uma cuidando do seu
 * próprio cache/custo (ver os comentários em cada uma).
 */

var RELATORIO_HORA_CORTE = '10:00';

function relatorioDiarioDesigner(designer, dataISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  if (!dataISO) return { ok: false, error: 'dataISO não informado.' };

  var tocadasResp = buscarPlaysDeHoje(designer, null, dataISO);
  var entreguesResp = buscarEntreguesDoDiaComTempo(designer, dataISO);
  var transferidasResp = buscarTransferenciasDoDia(designer, dataISO);
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

  var entregues = entreguesResp.ok ? entreguesResp.entregues : [];
  var transferidas = transferidasResp.ok ? transferidasResp.transferencias : [];

  // Transferida em que o designer deu play conta como entrega de
  // verdade (pedido do Cláudio, 2026-08-17: "essas transferidas pode
  // usar como entregues também, desde que tenha dado play nelas") — é
  // trabalho real, só que passado adiante em vez de fechado no
  // Runrun.it. Some na lista de entregues, sem duplicar caso a mesma
  // tarefa apareça nas duas (ex: foi transferida de manhã e fechada à
  // tarde por quem recebeu — não deveria acontecer no mesmo dia pra o
  // mesmo designer, mas o id protege contra isso de qualquer forma).
  var idsJaEntregues = {};
  entregues.forEach(function (e) { idsJaEntregues[String(e.id)] = true; });
  transferidas
    .filter(function (t) { return t.contouComoEntrega && !idsJaEntregues[String(t.id)]; })
    .forEach(function (t) {
      entregues.push({
        id: t.id, titulo: t.titulo, cliente: t.cliente, tipo: t.tipo,
        quando: t.quando, workedSeconds: t.workedSeconds, tempoMedioMinutos: t.tempoMedioMinutos,
        viaTransferencia: true
      });
      idsJaEntregues[String(t.id)] = true;
    });

  return {
    ok: true,
    data: dataISO,
    tocadas: tocadasResp.ok ? tocadasResp.tarefas : [],
    entregues: entregues,
    transferidas: transferidas,
    filaDoDia: filaDoDia,
    chegaramDepoisDas10h: eventosResp.ok ? eventosResp.eventos : []
  };
}
