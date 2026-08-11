-- ============================================================
-- PASSO 9 — A foto do quadro
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- ⚠️ ESTA TABELA NÃO É FONTE DE VERDADE, E ISSO É O PONTO.
--
-- O dono da verdade sobre tarefa continua sendo o Runrun.it, sempre.
-- Aqui mora só a ÚLTIMA FOTO conhecida do quadro — o mesmo retrato que o
-- Colmeia já guardava no localStorage de cada navegador
-- (salvarSnapshotDoQuadro, js/pessoas-fotos.js), agora num lugar só, que
-- todo mundo alcança.
--
-- O que isso muda, na prática:
--   1. quem abre o Colmeia num aparelho NOVO (ou depois de limpar o
--      navegador) já vê o quadro na hora, em vez da abelhinha esperando o
--      Apps Script acordar — antes a foto só existia em quem já tinha
--      aberto ali;
--   2. quando o Runrun.it cai, o quadro mostra a última foto com um aviso
--      de quando ela é, em vez de uma tela de erro.
--
-- O que isso DE PROPÓSITO não faz: virar a fonte de leitura do quadro.
-- Essa seria a "cópia local completa" — um segundo lugar com a mesma
-- informação, capaz de discordar do Runrun.it em silêncio. Foi decidido
-- (2026-08-11) não fazer isso enquanto a lentidão do quadro for
-- aceitável. Aqui a foto é sempre substituída pelo dado real assim que
-- ele chega, e sempre chega rotulada com a hora — nunca se passa por
-- atual.
--
-- PRIVACIDADE: guarda o mesmo que o quadro já mostra pra qualquer pessoa
-- logada (título, cliente, responsável, etapa). Nada novo.


-- ------------------------------------------------------------
-- FOTO DO QUADRO — uma linha só, sobrescrita
-- ------------------------------------------------------------
-- `id` existe pra ser sempre 'quadro': o retrato é o MESMO pra todo
-- mundo (o backend devolve o quadro inteiro e é o front que filtra por
-- pessoa), então guardar uma cópia por designer seria multiplicar a
-- mesma coisa e abrir espaço pra versões diferentes conviverem.
create table if not exists foto_do_quadro (
  id      text        primary key,
  quando  bigint      not null,           -- epoch ms de quando a foto foi tirada
  tarefas jsonb       not null,           -- o mesmo formato cru que o Runrun.it devolveu
  colunas jsonb       not null default '[]'::jsonb
);

alter table foto_do_quadro enable row level security;
