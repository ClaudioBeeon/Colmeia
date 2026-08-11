-- ============================================================
-- PASSO 4 — Conferência Interna (etapa 2 de 4 do fluxo de aprovação)
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- A PRIMEIRA TABELA QUE ATUALIZA LINHA, não só anexa.
--
-- Todas as anteriores (feed, plays, pedidos, histórico) só ganhavam linha
-- nova. Esta muda a MESMA linha várias vezes ao longo da vida da peça:
-- pendente → aprovada → enviada, ou pendente → devolvida → pendente de
-- novo (quando chega versão nova). Por isso ela precisa de uma identidade
-- de verdade, coisa que a planilha nunca teve — lá a identidade era "a
-- linha número 7", e achar essa linha era varrer a aba inteira.
--
-- A identidade é (task_id, nome_peca): um card com Feed e Stories tem duas
-- linhas independentes. É o que `acharLinhaDaConferencia` já procurava.

create table if not exists conferencia_interna (
  id            bigserial primary key,

  -- Tudo em texto, na ordem exata das colunas da aba. A ordem é o
  -- contrato entre os dois lados (ver COLUNAS_CONFERENCIA em
  -- AprovacaoInterna.gs) — mexer nela aqui sem mexer lá quebra os dois.
  task_id       text not null default '',
  cliente       text not null default '',
  titulo_tarefa text not null default '',
  nome_peca     text not null default '',
  designer      text not null default '',
  designer_id   text not null default '',
  file_id       text not null default '',
  nome_arquivo  text not null default '',
  mime_type     text not null default '',

  -- Qual versão estava valendo na hora do pedido. Fica em TEXTO como na
  -- aba (o código sempre lê com Number(...) || 0, e vazio significa
  -- "linha antiga, não sei" — um número não conseguiria dizer isso).
  versao_pedida text not null default '',

  pedido_em     text not null default '',  -- data em texto (toISOString), como na aba
  status        text not null default '',  -- pendente | aprovada | enviada | devolvida | descartada
  decidido_por  text not null default '',
  decidido_em   text not null default '',
  motivo        text not null default '',
  lote_id       text not null default ''   -- agrupa as peças mandadas juntas
);

-- A IDENTIDADE. É isto que deixa "atualiza se já existe, cria se não"
-- virar UM comando (supabaseSalvar) no lugar de varrer a aba procurando a
-- linha certa — e o que impede a mesma peça entrar duas vezes na fila.
create unique index if not exists conferencia_interna_peca_idx
  on conferencia_interna (task_id, nome_peca);

-- A fila do atendimento pergunta "o que está pendente ou aprovado", e as
-- telas do card perguntam "o que tem desta tarefa".
create index if not exists conferencia_interna_status_idx
  on conferencia_interna (status);
create index if not exists conferencia_interna_task_idx
  on conferencia_interna (task_id);

alter table conferencia_interna enable row level security;
