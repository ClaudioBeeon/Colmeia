-- ============================================================
-- PASSO 12 — BeeChat (a conversa com a Bee)
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- Hoje a conversa inteira de uma tarefa (ou de uma conversa livre) mora
-- dentro de UMA célula da aba BeeChat, como um JSON gigante. Isso não
-- muda aqui — a coluna conversa_json continua guardando a lista de
-- mensagens inteira, no mesmo formato. O que muda é só que, junto com a
-- trava única do LockService, toda mensagem trocada com a Bee — em
-- qualquer tarefa, de qualquer designer, ao mesmo tempo — disputava a
-- MESMA fila de gravação que aprovação, prioridade, comentário etc.
-- BeeChat é uma das mais frequentes: cada pergunta feita à Bee grava duas
-- vezes (a pergunta e a resposta).
--
-- A identidade é a coluna "task_id" — que, apesar do nome (herdado da
-- aba), guarda duas coisas: o id de uma tarefa (conversa dentro de um
-- card) OU a chave "livre-<designer>-<carimbo>" (conversa solta da
-- bolinha flutuante). Ver COLUNAS_BEECHAT em Bee.gs.

create table if not exists bee_chat (
  id            bigserial primary key,

  -- Tudo em texto, na ordem exata das colunas da aba (ver COLUNAS_BEECHAT
  -- em Bee.gs) — mexer nela aqui sem mexer lá quebra os dois lados.
  task_id       text not null default '',
  conversa_json text not null default '[]',
  entregue_em   text not null default '',  -- carimbo (getTime()) de quando a tarefa foi entregue PELO Colmeia
  atualizado_em text not null default '',  -- carimbo da última mensagem
  titulo        text not null default ''   -- só usado nas conversas livres
);

-- A IDENTIDADE. É isto que deixa salvarConversaBee virar UM comando
-- (supabaseSalvar, upsert) em vez de "varre a aba procurando a linha e
-- escreve nela" — e o que impede a mesma tarefa ganhar duas linhas.
create unique index if not exists bee_chat_task_idx
  on bee_chat (task_id);

alter table bee_chat enable row level security;
