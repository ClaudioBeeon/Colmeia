-- ============================================================
-- PASSO 1 — a primeira tabela do Colmeia no banco de verdade
-- ============================================================
--
-- COMO RODAR: no Supabase, menu da esquerda → "SQL Editor" → "New query"
-- → colar isto tudo → botão "Run". Rodar de novo depois não quebra nada
-- (todo comando aqui tem "if not exists").
--
-- POR QUE ESSA ABA VEM PRIMEIRO
--
-- FeedEventos (o feed da página Bee) é a peça-piloto ideal: é pequena
-- (3 funções em Planilha.gs), ninguém depende dela pra trabalhar, e o
-- dado tem validade de 14 dias — se der errado, ninguém perde nada e o
-- estrago se apaga sozinho. Serve pra exercitar o caminho inteiro
-- (chave, conexão, gravação, leitura, limpeza) antes de encostar em
-- aprovação, que é onde tem trabalho de verdade em jogo.

create table if not exists feed_eventos (
  id       bigserial primary key,

  -- Mesmas colunas da aba, com os mesmos nomes, pra conferência ficar
  -- fácil: dá pra abrir a aba e a tabela lado a lado e comparar.
  quando   bigint      not null,   -- carimbo de tempo (getTime()), igual à planilha
  dono     text        not null,   -- de quem é o feed (quem vai ver isso)
  tipo     text        not null,   -- comentario | prioridade | recebida
  autor    text        not null default '',
  task_id  text        not null default '',
  titulo   text        not null default '',
  detalhe  text        not null default '',

  -- A busca do feed compara nome "sem espaço e em minúsculo"
  -- (buscarFeedEventos, Planilha.gs). Na planilha isso é feito na mão,
  -- linha por linha; aqui o banco calcula e guarda pronto, e o índice
  -- abaixo faz a busca ir direto na linha certa em vez de varrer tudo.
  dono_norm text generated always as (lower(btrim(dono))) stored
);

-- O índice que substitui a varredura: "os eventos DESTA pessoa, dos mais
-- novos pros mais velhos". É isso que faz a busca continuar instantânea
-- com 50 mil linhas — a aba já ficava mais lenta a cada linha nova.
create index if not exists feed_eventos_dono_quando_idx
  on feed_eventos (dono_norm, quando desc);

-- SEGURANÇA: liga a tranca e não cria nenhuma exceção.
-- Sem nenhuma "policy", ninguém de fora lê nem escreve nada, nem com a
-- chave pública (anon). Só a chave service_role — que vive escondida nas
-- propriedades do Apps Script — passa. É a postura certa aqui: quem fala
-- com este banco é o backend, nunca o navegador.
alter table feed_eventos enable row level security;
