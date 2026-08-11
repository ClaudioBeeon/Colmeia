-- ============================================================
-- PASSO 7 — Monitoramento: erros e uso das telas
-- ============================================================
--
-- COMO RODAR: Supabase → SQL Editor → New query → colar → Run.
--
-- AS DUAS PRIMEIRAS TABELAS QUE NASCEM DIRETO NO BANCO, sem aba de
-- planilha nenhuma por trás — e por isso sem trava de escrita. São as
-- gravações mais frequentes que o Colmeia pode ter (todo erro de todo
-- mundo, toda troca de tela); pô-las na fila que a migração inteira
-- serviu pra esvaziar seria um contrassenso.
--
-- PRIVACIDADE: guarda QUEM (o nome que já aparece em todo card) e QUAL
-- TELA. Não guarda o que a pessoa digitou, nem conteúdo de tarefa, nem
-- endereço de rede. Isso existe pra achar defeito e decidir o que
-- melhorar — não pra saber o que cada um está fazendo.


-- ------------------------------------------------------------
-- ERROS — o que quebrou na tela de alguém
-- ------------------------------------------------------------
-- O front-end já capturava isso há tempos (registrarNoDiagnostico,
-- js/config.js), mas guardava no localStorage: ficava no navegador
-- daquela pessoa e nunca chegava em ninguém. A metade difícil já estava
-- pronta; esta tabela só dá um lugar onde o erro possa ser visto.
create table if not exists erros (
  id        bigserial primary key,
  quando    bigint not null,
  designer  text   not null default '',
  tipo      text   not null default '',  -- erro | quebrou
  mensagem  text   not null default '',  -- cortada em 800, igual ao painel local
  tela      text   not null default '',  -- onde a pessoa estava quando quebrou
  navegador text   not null default ''
);

-- A única pergunta que se faz aqui é "o que aconteceu por último".
create index if not exists erros_quando_idx on erros (quando desc);

alter table erros enable row level security;


-- ------------------------------------------------------------
-- USO DAS TELAS — quais partes do Colmeia alguém abre
-- ------------------------------------------------------------
-- Uma linha por tela por sessão (não por clique): quem vai e volta do
-- quadro dez vezes não deve fazer o quadro parecer dez vezes mais usado
-- que uma página que a pessoa abriu e ficou. O que se mede é "esta tela
-- fez parte do dia de alguém".
create table if not exists uso_telas (
  id       bigserial primary key,
  quando   bigint not null,
  designer text   not null default '',
  tela     text   not null default ''
);

create index if not exists uso_telas_quando_idx on uso_telas (quando desc);

alter table uso_telas enable row level security;
