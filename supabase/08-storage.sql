-- ============================================================
-- PASSO 8 — Storage: as imagens das peças saem de dentro do Apps Script
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- O QUE MUDA: hoje toda imagem de peça vira TEXTO (base64) dentro da
-- resposta do Apps Script, toda vez que alguém olha — o navegador não
-- consegue guardar nada disso, e acima de 25 MB simplesmente falha (foi
-- o que quebrou vídeo em 2026-08-04). Com isto, a imagem é copiada UMA
-- vez pro Storage e as telas passam a usar <img src="..."> normal.


-- ------------------------------------------------------------
-- O BALDE onde as cópias ficam
-- ------------------------------------------------------------
-- `public = true` significa "quem tiver o endereço abre" — é o que faz
-- funcionar na página do cliente, que não tem login. Não significa que
-- alguém pode LISTAR o que existe aqui dentro: o caminho de cada arquivo
-- é um UUID sorteado (ver urlPublicaDaPeca, Storage.gs). É a mesma
-- proteção do link de aprovação: o que protege é o código aleatório.
insert into storage.buckets (id, name, public)
values ('pecas', 'pecas', true)
on conflict (id) do update set public = true;


-- ------------------------------------------------------------
-- O ATALHO: qual arquivo do Drive já virou qual endereço
-- ------------------------------------------------------------
-- Sem isto, cada abertura republicaria a imagem do zero. É um atalho, não
-- a fonte da verdade: se a linha sumir, o Apps Script republica na hora.
create table if not exists arquivos_publicados (
  id       bigserial primary key,
  file_id  text   not null,          -- o id do arquivo lá no Drive
  caminho  text   not null default '', -- onde ele ficou dentro do balde
  url      text   not null default '',
  quando   bigint not null
);

-- Um arquivo do Drive tem UMA cópia publicada. O índice único é o que
-- deixa `supabaseSalvar` fazer "atualiza se existe, cria se não" sem
-- procurar nada.
create unique index if not exists arquivos_publicados_file_idx
  on arquivos_publicados (file_id);

-- A limpeza diária pergunta "o que é mais velho que 120 dias".
create index if not exists arquivos_publicados_quando_idx
  on arquivos_publicados (quando);

alter table arquivos_publicados enable row level security;
