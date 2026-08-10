-- ============================================================
-- PASSO 2 — Log de Plays e Pedidos de Atenção
-- ============================================================
--
-- COMO RODAR: Supabase → "SQL Editor" → "New query" → colar tudo → "Run".
-- Rodar de novo depois não quebra nada (tudo tem "if not exists").
--
-- POR QUE ESSAS DUAS JUNTAS: têm exatamente o mesmo formato do feed
-- (anota uma linha, lê por pessoa/período, poda o que passou da validade).
-- Separar seria repetir a mesma conversa três vezes sem aprender nada.
--
-- A diferença pro feed é o VOLUME: o Log de Plays ganha uma linha toda vez
-- que alguém dá play, o dia inteiro, e guarda 60 dias — é a aba que mais
-- cresce do Colmeia. É onde a varredura linear da planilha mais custava.


-- ------------------------------------------------------------
-- LOG DE PLAYS — uma linha por play (aba "Log de Plays")
-- ------------------------------------------------------------
create table if not exists log_plays (
  id       bigserial primary key,

  task_id  text   not null,
  titulo   text   not null default '',
  designer text   not null,
  quando   bigint not null,   -- carimbo de tempo (getTime()), igual à planilha

  -- "AAAA-MM-DD" no fuso de São Paulo. Continua vindo pronta do Apps
  -- Script (Utilities.formatDate) em vez de ser calculada aqui: o
  -- servidor do banco tem o fuso dele, e "que dia é hoje" pra agência é
  -- sempre o de Brasília — a mesma regra que hojeNoFusoDaAgencia segue.
  data     text   not null default '',

  designer_norm text generated always as (lower(btrim(designer))) stored
);

-- "os plays DESTA pessoa, dos mais novos pros mais velhos" —
-- é o que buscarPlaysDeHoje pergunta, nas três janelas (hoje/48h/semana).
create index if not exists log_plays_designer_quando_idx
  on log_plays (designer_norm, quando desc);

-- "todos os plays DESTA tarefa", sem corte de data — a linha do tempo
-- dentro do card (buscarHistoricoDePlaysDaTarefa).
create index if not exists log_plays_task_idx
  on log_plays (task_id);

alter table log_plays enable row level security;


-- ------------------------------------------------------------
-- PEDIDOS DE ATENÇÃO — a cobrança que o atendimento já fez
-- ------------------------------------------------------------
-- Diferente do feed, isso é lido por TODO o atendimento (não por dono) —
-- é justamente o que impede a segunda cobrança na mesma peça.
create table if not exists pedidos_atencao (
  id         bigserial primary key,

  quando     bigint not null,
  task_id    text   not null,
  titulo     text   not null default '',
  cliente    text   not null default '',
  publicacao text   not null default '',  -- "AAAA-MM-DD", a data de postagem da peça
  quem_pediu text   not null default '',
  designer   text   not null default '',
  motivo     text   not null default ''
);

-- A tela sempre pede "os últimos 14 dias, mais novo primeiro" — sem filtro
-- por pessoa, então o índice é só pela data.
create index if not exists pedidos_atencao_quando_idx
  on pedidos_atencao (quando desc);

alter table pedidos_atencao enable row level security;
