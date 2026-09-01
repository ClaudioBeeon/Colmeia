-- ============================================================
-- PASSO 13 — Tarefas (cópia do quadro, atualizada por gatilho)
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- DIFERENTE DE TODA TABELA ANTERIOR: não vem de uma aba da planilha —
-- vem do Runrun.it. Um gatilho de tempo próprio
-- (sincronizarTarefasParaSupabase, configurado por
-- configurarGatilhoSincronizacaoDeTarefas — RunrunLeitura.gs) varre o
-- Runrun.it sozinho, a cada 2 minutos, e grava aqui. `getTarefasColmeia`
-- (Código.gs) passa a ler DESTA tabela em vez de ligar pro Runrun.it na
-- hora do pedido — é essa ida ao vivo, dentro do pedido da pessoa, que
-- ocupava a fila de execução do Apps Script (compartilhada entre TODO
-- MUNDO) por vários segundos.
--
-- O Runrun.it continua sendo o dono de verdade da tarefa — isto aqui é
-- só um retrato, sempre reescrito por cima, nunca a fonte de decisão.

create table if not exists tarefas (
  id            bigint primary key,   -- o id da tarefa no Runrun.it

  -- O objeto INTEIRO que transformarTarefaParaColmeia (RunrunLeitura.gs)
  -- já produz, sem redesenhar nada — é exatamente o que o front-end
  -- espera receber. getTarefasColmeia remonta o array a partir disto e
  -- ainda aplica por cima as prioridades salvas e os focos ativos (essas
  -- duas continuam lidas na hora, não ficam congeladas no retrato).
  dados         jsonb not null,

  atualizado_em timestamptz not null default now()
);

-- getTarefasColmeia lê tudo de uma vez (select=dados); este índice serve
-- pra depois, se um dia alguém precisar perguntar "as tarefas mais
-- recém-atualizadas" sem varrer a tabela inteira.
create index if not exists tarefas_atualizado_em_idx
  on tarefas (atualizado_em);

alter table tarefas enable row level security;
