-- ============================================================
-- PASSO 3 — Histórico de Conferências (etapa 1 de 4 do fluxo de aprovação)
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- POR QUE ESTA VEM PRIMEIRO DAS QUATRO
--
-- O fluxo de aprovação são quatro abas, e elas foram ordenadas por QUEM
-- mexe em cada uma:
--
--   1. HistoricoConferencias  ← esta. Ninguém mexe: é arquivo morto,
--                                escrito uma vez pela poda diária e lido
--                                só quando dá problema.
--   2. ConferenciaInterna     ← atendimento e designers
--   3. Devolucoes             ← atendimento
--   4. Aprovacoes             ← o CLIENTE, numa página sem login. Última,
--                                com as outras três já rodando.
--
-- Esta é o aquecimento: exercita a conferência automática
-- (supabaseConferir) num lugar onde errar não custa nada.

create table if not exists historico_conferencias (
  id            bigserial primary key,

  task_id       text not null default '',
  cliente       text not null default '',
  titulo_tarefa text not null default '',
  nome_peca     text not null default '',
  decisao       text not null default '',  -- aprovada | devolvida
  quem          text not null default '',

  -- Data em TEXTO, e de propósito: na planilha isso já é uma data escrita
  -- (vem de decidido_em/pedido_em, não de um getTime()), e o resto do
  -- código lê ela com Date.parse. Converter pra timestamp aqui mudaria o
  -- que buscarNoHistoricoDeConferencias devolve — e o combinado desta
  -- fase é trocar onde o dado mora, não o que ele é.
  quando        text not null default ''
);

-- A única pergunta que essa aba responde é "quem decidiu a peça X do
-- cliente Y?", procurando pedaço de nome. Índice de texto pra busca
-- "contém" precisa da extensão pg_trgm; como é consulta rara (feita à mão
-- quando dá problema), não vale ligar extensão nenhuma por ora — só o
-- índice por cliente, que é o filtro mais provável.
create index if not exists historico_conferencias_cliente_idx
  on historico_conferencias (cliente);

alter table historico_conferencias enable row level security;
