# Relatório diário dos designers (Painel de Designers)

Data: 2026-08-17
Status: aprovado, indo pro plano de implementação

## Contexto e objetivo

O Cláudio quer, ao clicar num designer dentro do Painel de Designers, abrir um pop-up com o
"relatório do dia" daquela pessoa — inspirado visualmente na aba "Minhas horas" (js/pagina-horas.js).
O objetivo é dar visibilidade diária de produtividade sem depender de olhar o Runrun.it na mão:
quantas tarefas tiveram play, quantas foram entregues (tempo gasto vs. esperado), quantas tarefas
"pra produção" existiam no dia, e o que chegou no meio do caminho (prioridade/repasse depois das
10h, quando o Cláudio termina de organizar o Runrun deles).

Esta é a FASE 1 (relatório diário). Semanal e mensal ficam para fases seguintes, reaproveitando a
mesma base de dados só trocando a janela de tempo.

## Decisões já tomadas (brainstorming)

- **"Tarefas pra produção no dia"** = tarefas com entrega desejada **hoje OU atrasada** (não um
  snapshot travado às 10h — é uma leitura ao vivo do quadro atual).
- **"Tempo médio esperado"** = `tempoMedioMinutos` por cliente (a mesma fonte que já alimenta a
  barra de progresso do card hoje, via painel-designers-beeon). Não usar `estimateMinutes` do
  Runrun.it nesta fase.
- **"Chegou depois das 10h"** = cruza os eventos `recebida` (repasse/sequência) e `prioridade` já
  gravados na aba `FeedEventos` (existe desde 2026-08-04) com o horário de corte das 10h do dia
  local (fuso São Paulo).
- **Quem vê**: só o coordenador, mesma regra de acesso que o Painel de Designers já tem hoje.
- **Navegação**: pop-up abre no dia de hoje, com setas ← → para navegar dias anteriores (mesmo
  padrão de "Minhas horas", que navega por semana).

## Fontes de dado (tudo já existe, nada novo a criar)

| Dado | Fonte | Observação |
|---|---|---|
| Tarefas com play no dia | `buscarPlaysDeHoje` (Planilha.gs) / aba ou tabela `log_plays` | Aceita janela `"hoje"`, mas hoje é sempre "desde meia-noite" — precisa aceitar uma DATA arbitrária pra navegar dias passados |
| Tarefas entregues no dia + tempo trabalhado | `buscarEntreguesDoDesigner` (RunrunLeitura.gs) | Já devolve tempo trabalhado; falta cruzar com `tempoMedioMinutos` do cliente de cada uma |
| Tempo médio esperado por cliente | `buscarTempoMedioClientesPainel`/cache `tempoMedioClientesPainel` (RunrunLeitura.gs) | Já é lido para o card da tarefa (`transformarTarefaParaColmeia`) |
| Fila do dia (entrega hoje ou atrasada) | `getTarefasColmeia()` | Sem busca nova ao Runrun.it — é a mesma varredura em cache do quadro |
| Chegou depois das 10h | `FeedEventos` (Planilha.gs / Supabase), eventos `recebida` e `prioridade` | Precisa de uma leitura por designer e por dia — hoje `buscarFeedEventos` já lê por designer; falta filtrar por data e por horário de corte |

## Arquitetura

### Backend — nova ação `relatorioDiarioDesigner`

Novo arquivo `RelatoriosDesigner.gs` (arquivo próprio, pelo mesmo motivo que `AprovacaoInterna.gs`
é separado — assunto isolado, fácil de achar). Uma função:

```
function relatorioDiarioDesigner(designer, dataISO) { ... }
```

Recebe `designer` (nome) e `dataISO` (`yyyy-MM-dd`, fuso São Paulo). Devolve:

```js
{
  ok: true,
  data: "2026-08-17",
  tocadas: [ { taskId, titulo, primeiroPlay, ultimoPlay } ],       // buscarPlaysDeHoje adaptado p/ data arbitrária
  entregues: [ { taskId, titulo, cliente, workedSeconds, tempoMedioMinutos } ],
  filaDoDia: { total, atrasadas, hojeCerto },                      // getTarefasColmeia() filtrado
  chegaramDepoisDas10h: [ { taskId, titulo, tipo: "recebida"|"prioridade", quando } ],
}
```

Rotas em `Código.gs` (`handleRequest`): `body.acao === 'relatorioDiarioDesigner'` → chama a função
acima com `body.designer`/`body.data`.

**Mudanças pontuais nas funções existentes:**
- `buscarPlaysDeHoje` (Planilha.gs) ganha um 3º parâmetro opcional `dataISO` — quando presente,
  filtra pela coluna `data` (que já existe, formato `yyyy-MM-dd`) em vez da janela relativa a agora.
  Sem o parâmetro, comportamento atual (usado por "Minhas horas") não muda.
- `buscarEntreguesDoDesigner` precisa aceitar filtro por dia específico (hoje provavelmente já
  filtra por "recentes" com limite — checar assinatura real durante o plano) e devolver
  `tempoMedioMinutos` por item, cruzando com `buscarTempoMedioClientesPainel` do mesmo jeito que
  `transformarTarefaParaColmeia` já faz.
- `buscarFeedEventos` ganha um filtro de data (dataISO) e o front-end/backend decide o corte das
  10h comparando o timestamp do evento com `dataISO + "T10:00:00-03:00"`.

### Frontend — pop-up no Painel de Designers

Novo bloco em `js/pagina-painel-designers.js` (mesmo arquivo que já desenha os cards de designer):

- Clique no card de um designer chama `abrirRelatorioDesigner(nomeDoDesigner)`.
- Estrutura visual reaproveita o grid de "Minhas horas" (`.hr-*` classes em css/04-paginas.css) —
  cabeçalho com foto/nome/papel, setas de navegação de dia, cards de número, lista de entregues.
- Estado local: `relatorioDiaAtual` (Date), `relatorioDadosCache` (Map por `designer::dataISO`, com
  teto — mesmo padrão de cache já usado em outros lugares do app).
- Card de números: "Tarefas tocadas", "Entregues", "Na fila hoje" (com subtexto "X atrasadas" se
  houver), "Chegaram depois das 10h".
- Lista de entregues: cada linha com o nome da tarefa, cliente, tempo gasto formatado
  (`formatarHoras`, já existe em pagina-horas.js) vs. tempo médio esperado, e uma barra de
  progresso reaproveitando a lógica de `calcularEstimatePct` (js/pessoas-fotos.js) — verde se
  dentro do esperado, âmbar se passou.
- Lista "chegaram depois das 10h": ícone por tipo (recebida = seta de repasse, prioridade = raio),
  nome da tarefa e horário.

### Fora de escopo nesta fase

- Relatório semanal/mensal (fase 2 e 3) — mesma base de dados, trocando a janela.
- Qualquer alteração no fluxo de play/pause (é assunto separado, tratado pela auditoria de bug).
- Edição de dados pelo pop-up — é só leitura, nenhuma ação de escrita.

## Tratamento de erro

Segue o padrão já estabelecido no app (`chamarBackend`/`caiuARede`): se a rede cair ou o backend
recusar, o pop-up mostra "não consegui carregar o relatório de hoje" com um botão de tentar de
novo, preservando o que já estava desenhado (nunca substitui dado bom por tela vazia).

## Testes

- Validar sintaxe de `.gs`/`.js` depois da implementação (checagem já existe no fluxo do projeto).
- Testar manualmente no navegador: abrir o Painel de Designers, clicar num designer com tarefas
  reais hoje, conferir os 4 números batendo com o que se vê no Runrun.it/no quadro, navegar um dia
  pra trás e conferir que os números mudam.
- Testar o caso vazio (designer sem nenhuma tarefa tocada/entregue no dia) — não pode quebrar,
  mostra "nada por aqui hoje" nesse card.
