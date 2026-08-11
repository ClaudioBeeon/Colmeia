-- ============================================================
-- PASSO 5 — Devoluções (etapa 3 de 4 do fluxo de aprovação)
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- O QUE É: o pedido de alteração inteiro — motivo, os pontos marcados com
-- o mouse em cima da peça, e qual arquivo estava sendo conferido. Existe
-- porque isso vai parar no Runrun.it, que não sabe desenhar marcação em
-- imagem; sem guardar aqui, "(alto à esquerda) trocar o logo" era tudo o
-- que sobrava do outro lado.

create table if not exists devolucoes (
  id                bigserial primary key,

  codigo            text not null default '',  -- o UUID que vai no link do ajuste.html
  task_id_alteracao text not null default '',  -- vazio no caminho do projeto fechado
  task_id_origem    text not null default '',
  card_mae_id       text not null default '',
  cliente           text not null default '',

  -- As colunas da PRIMEIRA peça. Continuam existindo pra quem só lê o
  -- formato antigo — o lote inteiro está em pecas_json.
  nome_peca         text not null default '',
  file_id           text not null default '',
  nome_arquivo      text not null default '',
  mime_type         text not null default '',

  motivo            text not null default '',

  -- pins e pecas_json ficam em TEXTO, não jsonb. O ganho do jsonb seria
  -- consultar dentro do JSON, coisa que nada no Colmeia faz; o custo é
  -- que o Postgres reescreve jsonb no formato dele (espaço e ordem das
  -- chaves mudam), e aí supabaseConferir acusaria diferença em toda linha
  -- sem nenhuma diferença existir. Vira jsonb no dia em que alguém
  -- precisar perguntar alguma coisa pro conteúdo.
  pins              text not null default '',
  devolvido_em      text not null default '',
  pecas_json        text not null default ''
);

-- A identidade já existia e é boa. Com ela indexada, abrir um link de
-- ajuste deixa de varrer a aba inteira — e quem abre esse link é o
-- designer, muitas vezes vindo direto do Runrun.it.
create unique index if not exists devolucoes_codigo_idx
  on devolucoes (codigo);

-- "a devolução desta tarefa": pode casar pela subtarefa de alteração ou,
-- quando ela não existe (projeto fechado), pelo card mãe.
create index if not exists devolucoes_alteracao_idx on devolucoes (task_id_alteracao);
create index if not exists devolucoes_card_mae_idx  on devolucoes (card_mae_id);

alter table devolucoes enable row level security;
