-- ============================================================
-- PASSO 11 — A cópia publicada passa a saber DE QUAL VERSÃO ela é
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- ⚠️ CORRIGE UM ERRO QUE CHEGOU NO CLIENTE (2026-08-11): o designer subiu
-- a alteração no Drive e o link de aprovação continuou mostrando a arte
-- ANTIGA. Não era cache do navegador — era o Colmeia respondendo a versão
-- velha de propósito, por causa de uma premissa errada.
--
-- A premissa estava escrita no próprio código, em urlPublicaDaPeca:
--
--     "o conteúdo daquele caminho nunca muda — versão nova da peça é
--      outro arquivo, com outro UUID"
--
-- Isso não vale pro jeito que a Beeon trabalha: o designer SUBSTITUI o
-- arquivo no Drive, mantendo o mesmo id. Conteúdo novo, id igual. Como a
-- tabela era indexada só por `file_id`, a primeira consulta achava a linha
-- antiga e devolvia a cópia velha — pra sempre, sem nunca reler o Drive.
--
-- O CONSERTO: a identidade da cópia passa a ser `file_id + atualizado_em`
-- (a data de modificação do arquivo no Drive). Arquivo substituído tem
-- data nova, então não casa com nenhuma linha, e o Colmeia publica uma
-- cópia nova, com outro UUID e outro endereço.
--
-- Dois ganhos que vêm de graça:
--   1. o cache de um ano no navegador volta a ser VERDADE — aquele
--      endereço realmente nunca muda, porque versão nova é outro endereço;
--   2. a cópia da versão anterior continua no balde, com a data dela. É o
--      que permite mostrar "v1, v2" no card, que era o que o Cláudio
--      queria: o Drive só guarda a última, o Storage guarda a série.

alter table arquivos_publicados
  add column if not exists atualizado_em bigint not null default 0;

-- O índice único vira o PAR. Sem trocar isto, `supabaseSalvar` continuaria
-- sobrescrevendo a linha da versão antiga em vez de acrescentar a nova —
-- e aí a série de versões nunca existiria.
drop index if exists arquivos_publicados_file_idx;

create unique index if not exists arquivos_publicados_file_versao_idx
  on arquivos_publicados (file_id, atualizado_em);

-- Continua servindo pra achar "todas as versões desta peça, da mais nova
-- pra mais velha" sem varrer a tabela.
create index if not exists arquivos_publicados_file_idx
  on arquivos_publicados (file_id, atualizado_em desc);
