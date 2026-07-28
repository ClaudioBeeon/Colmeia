# Colmeia — contexto do projeto

Ferramenta de Kanban criada para substituir o Runrun.it na Beeon (agência de marketing).
O usuário (Cláudio, coordenador de design) não programa — todo o código foi construído
em conversas guiadas com Claude. Sempre explicar mudanças em português simples, sem jargão
não explicado, e dar um resumo claro no final de cada tarefa.

## Localização real do repositório

IMPORTANTE: o repositório git de verdade fica em
`C:\Users\Usuario\Documents\GitHub\Colmeia` (remote: https://github.com/ClaudioBeeon/Colmeia.git).
A pasta `C:\Users\Usuario\Documents\Colmeia` (sem "GitHub") existe mas está vazia — não é o projeto.
Se uma sessão futura receber acesso a essa pasta vazia, pedir acesso à pasta correta antes de continuar.

## Arquitetura

- `index.html`, `js/*.js` (frontend, separado por assunto em vários arquivos — ver seção
  "Estrutura do frontend (js/)" abaixo), `style.css` = frontend. Publicado automaticamente
  no GitHub Pages a cada push.
- `Código.gs` = backend, roda no Google Apps Script. O nome do arquivo tem que ser exatamente esse
  (com acento) — é o nome real do arquivo dentro do projeto do Apps Script (confirmado via
  `clasp clone`); um arquivo local chamado diferente (ex: sem o acento) faria o clasp criar um SEGUNDO
  arquivo lá dentro, duplicando funções e quebrando tudo. Desde 2026-07-28 o deploy é automático (ver seção
  "Deploy automático" abaixo) — não é mais preciso colar manualmente no editor do Apps Script.
- Backend integra com API do Runrun.it, Google Drive e Google Sheets (a planilha é o "banco de dados").
- Projeto irmão "painel-designers-beeon" (outro Apps Script) fornece tempo médio de criação por
  cliente e vínculos de nomes de cliente. URL dele está em `js/config.js` como `PAINEL_BEEON_API_URL`.
- URL do backend Colmeia está em `js/config.js` como `COLMEIA_API_URL`.

## Estrutura do frontend (index.html)

Páginas trocadas via `hidden` attribute, todas dentro de `<section class="app-page" id="page-...">`:
- `page-kanban` — quadro principal (`#board`)
- `page-clientes`, `page-atendimento`, `page-tipos`, `page-runrun`, `page-hoje`, `page-repasse`

## Estrutura do frontend (js/)

Em 2026-07-28 o antigo `script.js` (~6.000 linhas, um arquivo só) foi separado em 15 arquivos
menores dentro da pasta `js/`, cada um cuidando de um assunto. **Não é um sistema de build** — não
tem bundler, TypeScript, nem npm envolvido no frontend. É só HTML puro: o `index.html` carrega os
15 arquivos com várias tags `<script src="js/...">` seguidas, **na ordem certa**, perto do fim do
`<body>`. Isso funciona porque tags `<script>` comuns (sem `type="module"`) compartilham o mesmo
espaço de variáveis globais do documento — é como se fosse um arquivo só, só que dividido em pedaços.

**Regra de ouro ao editar isso:** a ORDEM das tags `<script>` no `index.html` importa. Um arquivo
que aparece depois pode usar variáveis/funções de um arquivo anterior, mas não o contrário. Se
precisar mover uma função de um arquivo pra outro, verificar se ela usa algo que só existe em
arquivos que vêm depois dela na lista — se sim, ou move os dois juntos, ou ajusta a ordem das tags.

Arquivos, na ordem em que são carregados (`js/`):
1. `config.js` — ícones SVG, `columnsDef`, URLs da API, nomes de meses.
2. `notificacoes-uploads.js` — checagem de upload em segundo plano, prompt de "repetir comentário".
3. `pessoas-fotos.js` — fotos de designers/atendimento, `avatarHTML`, `mapearTarefaDoBackend(t)`
   (normaliza dados vindos do backend), `calcularEstimatePct`.
4. `kanban-polling.js` — `agendarAtualizacaoKanban()`, `atualizarKanbanEmBackground()` (poll do quadro).
5. `painel-pessoas-clientes.js` — painel de Configurações, abas Pessoas e Clientes.
6. `regras-briefing.js` — regras de tarefa, geração de briefing por IA (`gerarBriefingComIA`).
7. `kanban-board.js` — `buildBoard()`, `render()`, `cardHTML()`, drag and drop do quadro.
8. `clientes-hub.js` — links/hub por cliente (Drive, banco de imagens, etc.).
9. `chat-comentarios.js` — chat flutuante (`abrirChatPanel`, `abrirThreadAqui`), comentários,
   edição de entrega desejada.
10. `detalhe-modal.js` — `openDetail(idx)`, `renderDetail()`, `closeDetail()`, `stepDetail(dir)`
    (modal de detalhe da tarefa).
11. `paginas-designers.js` — painel dos designers (tempo médio por cliente), página "Meus clientes"
    e "Clientes por atendimento".
12. `pagina-tipos-runrun.js` — página "Tipos de tarefas" e "Runrun completo".
13. `pagina-repasse.js` — página "Fila de repasse", `mostrarPagina(page)` (troca de página do app).
14. `notificacoes-avisos.js` — notificações de comentário não lido, avisos do coordenador.
15. `login-boot.js` — tela de login, restaurar sessão salva, ponto de partida do app.

É grande ainda mesmo dividido — usar grep dentro de `js/` em vez de ler um arquivo inteiro quando
só precisar achar uma função.

## Bug recorrente conhecido

Nunca comparar tarefas por referência de objeto (`tasks[detailIdx] === task`). A atualização
automática do quadro (`atualizarKanbanEmBackground`) recria os objetos de tarefa periodicamente,
então comparações por referência quebram silenciosamente. Sempre comparar por `task.id`.
Há muitos usos de `tasks[detailIdx]` no código (~38 ocorrências) — ao mexer perto de índice/detalhe,
prestar atenção a esse padrão.

## Decisões/padrões estabelecidos (2026-07-28)

- Preferências por designer (ordem de abas etc.) vão em `localStorage`, não no backend — cada
  designer usa seu próprio navegador/login, então não precisa sincronizar entre dispositivos.
  Convenção de nome de chave: `colmeia_<coisa>_v1`.
- `buscarTarefasRunrun()` (Código.gs) só busca tarefas **abertas** (`is_closed=false`) e **exclui**
  cards mãe (`tarefaEhCardMae`) — por isso `tasksTodas` no front nunca tem essas duas categorias.
  Pra qualquer feature que precise delas (ex: aba "Entregues"/"Card mãe" no Runrun completo), é
  preciso uma busca EXTRA e separada (`buscarExtrasRunrunCompleto`, ação `buscarExtrasRunrunCompleto`),
  chamada só quando a tela que precisa disso é aberta — nunca colocar isso no polling geral de 60s
  (`getTarefasColmeia`), senão fica lento pra todo mundo o tempo todo.
- Runrun.it não tem filtro de data na API de tarefas — pra buscar "coisas dos últimos N dias" sem
  varrer tudo, pede-se ordenado (`sort=updated_at&sortDir=desc`) e para de virar página assim que a
  primeira tarefa fora da janela aparece.
- Padrão de cache já usado em `Código.gs`: `CacheService.getScriptCache()` com `cache.get`/`cache.put`
  (chave string, JSON serializado, TTL em segundos). Usado em `buscarVinculosDoPainel` (10 min) e em
  `buscarUploadsRecentesDoCard` (15s, pra não re-varrer a pasta do Drive a cada poll de 8s do
  front-end enquanto um card fica aberto).
- Campo `createdAt` (data de criação da tarefa no Runrun.it) foi adicionado em `transformarTarefaParaColmeia`
  (Código.gs) e `mapearTarefaDoBackend` (js/pessoas-fotos.js) — usar esse campo pra qualquer ordenação
  "mais antigo pro mais novo".
- Vínculo de apelidos (painel de Pessoas): `pessoasSalvas[i].aliases` agora resulta em remover a
  linha do apelido da planilha (`excluirPessoasPorNomesNoBackend`, chama a ação já existente
  `excluirPessoasPorNomes` do backend) e esconder ele da lista do painel (`chavesDeApelidosAbsorvidos`
  em js/painel-pessoas-clientes.js), mostrando uma barrinha expansível "N vinculados" na pessoa principal. Isso é só
  visual no painel de Pessoas — nomes em cards/comentários/painel de clientes continuam mostrando o
  nome bruto (não foi pedido resolver em todo o app, só no painel).
- Cards do quadro/Runrun completo/Runrun completo usam `data-idx` (índice no array `tasks`/`tasksTodas`)
  pra ligar elementos à tarefa, e os handlers de clique buscam a tarefa fresca (`tasks[idx]`) no
  momento do clique, nunca guardando a referência do objeto de antes — segue o padrão já usado em
  `priority-wrap`/`assignee-wrap`. Isso evita o bug de referência obsoleta mencionado acima.

## Deploy automático do Código.gs (2026-07-28)

O `Código.gs` agora tem deploy 100% automático via GitHub Actions (`.github/workflows/deploy-apps-script.yml`):
a cada push na branch `main` que muda `Código.gs`, o workflow instala o `clasp` (`package.json`, só serve
pra isso — não tem relação com o frontend), restaura o login do clasp a partir do secret
`CLASP_CREDENTIALS`, gera um `.clasp.json` a partir do secret `SCRIPT_ID`, roda `clasp push --force` e
depois `clasp deploy --deploymentId <secret CLASP_DEPLOYMENT_ID>` — **atualiza a implantação de produção
existente, nunca cria uma nova**. Se existir o secret opcional `STAGING_DEPLOYMENT_ID`, também redeploya
lá como rede de segurança.

**IMPORTANTE — isso significa que não há mais revisão manual**: qualquer push que muda `Código.gs` na
`main` vai direto pro Apps Script de produção. Ao propor mudanças em `Código.gs`, ter isso em mente —
o aviso de "cole no Apps Script e crie uma Nova versão" (usado antes disso existir) não se aplica mais;
em vez disso, avisar que o push já publica sozinho.

`.claspignore` restringe o clasp a só enviar `Código.gs` (+ `appsscript.json` se existir) — sem isso ele
tentaria empurrar `index.html`/`js/*.js` (do frontend) pro Apps Script também.

**Coisas que travaram na primeira configuração (2026-07-28), pra não repetir o diagnóstico:**
1. `package.json` tinha que fixar a MESMA versão major do clasp que rodou o `clasp login` local
   (aqui, 3.3.0) — a v2 lê o arquivo de credenciais (`~/.clasprc.json`) num formato diferente
   (`token.access_token`) do da v3 (`tokens.default.access_token`), e dá
   `Cannot read properties of undefined (reading 'access_token')` se não bater.
2. O nome real do arquivo no projeto do Apps Script é **`Código`** (com acento), não `Code` — clasp
   identifica o arquivo remoto pelo nome local (sem extensão), então o arquivo aqui no repo TEM que
   se chamar `Código.gs` exatamente. `.clasp.json` tem `"fileExtension": "gs"` pra manter consistência.
3. `clasp push` exige um `appsscript.json` local pra aceitar enviar qualquer coisa (erro "Project
   contents must include a manifest file named appsscript."). Foi obtido com `clasp clone` numa pasta
   temporária separada (nunca clonar dentro deste repo — sobrescreveria `Código.gs` com a versão antiga
   que ainda estava em produção).
4. A conta Google usada no `clasp login` precisa ter a "Google Apps Script API" habilitada em
   https://script.google.com/home/usersettings, senão `clasp push` falha com "User has not enabled
   the Apps Script API".

Secrets do GitHub em uso: `CLASP_CREDENTIALS` (conteúdo de `~/.clasprc.json`), `SCRIPT_ID`,
`CLASP_DEPLOYMENT_ID` (produção), `STAGING_DEPLOYMENT_ID` (implantação de teste, opcional/rede de
segurança). O ID de qualquer implantação é o trecho entre `/s/` e `/exec` na URL do Web App dela.

## Fluxo de trabalho

- Validar sintaxe de JS depois de qualquer edição.
- Fazer commit e push direto no repo git ao terminar uma alteração testada (sem pedir confirmação
  extra, a menos que a mudança seja arriscada).
- Desde 2026-07-28, push que muda `Código.gs`/`appsscript.json` na `main` publica sozinho em produção
  (ver "Deploy automático" acima) — não pedir mais pra colar manualmente no Apps Script.
