-- ============================================================
-- PASSO 6 — Aprovações (etapa 4 de 4: a última, e a do CLIENTE)
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- ⚠️ AS 17 COLUNAS SAEM DE `linhaParaObjetoDeAprovacao` (Aprovacao.gs),
-- NUNCA DO CABEÇALHO DA ABA. O cabeçalho é escrito com 13 colunas (A:M) e
-- nunca foi corrigido: as outras quatro foram penduradas depois, uma a
-- uma, cada uma com um remendo `if (getLastColumn() < N)`. Quem confiar no
-- cabeçalho perde quatro colunas sem perceber — e três delas guardam
-- resposta de cliente.
--
-- É a última etapa de propósito: é a única tabela que uma pessoa de fora
-- da agência toca, pela página sem login (aprovar.html). As outras três já
-- estão rodando quando esta entra.

create table if not exists aprovacoes (
  id              bigserial primary key,

  codigo          text not null default '',  -- o que vai no link do cliente
  task_id         text not null default '',
  cliente         text not null default '',
  titulo_tarefa   text not null default '',

  -- Várias peças no mesmo link vão separadas por "|" (ver
  -- idsDaLinhaDeAprovacao). Fica como texto, do mesmo jeito que na aba:
  -- virar lista de verdade é melhoria pra depois, não pra agora.
  file_id         text not null default '',
  nome_arquivo    text not null default '',
  mime_type       text not null default '',

  criado_em       text not null default '',
  status          text not null default '',  -- pendente | aprovado | ajuste
  resposta_texto  text not null default '',
  respondido_em   text not null default '',
  autor           text not null default '',

  -- As quatro que foram penduradas na aba depois. Aqui são colunas
  -- normais, sem remendo nenhum — é exatamente o que um banco resolve.
  pins            text not null default '',  -- M
  aviso_pendente  text not null default '',  -- N: "1" enquanto o recado não entrou na tarefa
  quem_aprovou    text not null default '',  -- O: o nome que o CLIENTE digitou
  respostas_pecas text not null default '',  -- P: resposta por peça (JSON, ver a nota das devoluções)
  consultando_em  text not null default ''   -- Q: "vou consultar e te falo" — NÃO é um status
);

-- A identidade. É por ela que a página do cliente acha o link dele —
-- antes disso, cada abertura varria a aba inteira.
create unique index if not exists aprovacoes_codigo_idx on aprovacoes (codigo);

-- "os links desta tarefa" (o card) e "o que está esperando resposta"
-- (a aba Aprovações da Fila de repasse).
create index if not exists aprovacoes_task_idx   on aprovacoes (task_id);
create index if not exists aprovacoes_status_idx on aprovacoes (status);

alter table aprovacoes enable row level security;
