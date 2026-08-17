# Relatório Diário dos Designers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pop-up de relatório diário por designer dentro do Painel de Designers do Colmeia, mostrando tarefas tocadas, entregues (tempo gasto vs. tempo médio esperado), fila do dia (entrega hoje ou atrasada) e o que chegou depois das 10h.

**Architecture:** Uma nova ação de backend (`relatorioDiarioDesigner`) junta dado de 4 fontes já existentes (log de plays, entregues do Runrun.it, quadro em cache, FeedEventos) num arquivo `.gs` novo. No front-end, um pop-up novo em `js/pagina-painel-designers.js`, aberto ao clicar no avatar de um designer, com navegação por dia (setas ← →) e visual inspirado em `js/pagina-horas.js`.

**Tech Stack:** Google Apps Script (backend, `.gs`), JavaScript puro sem bundler (frontend, `js/*.js`, tags `<script>` concatenadas na ordem do `index.html`), CSS puro (`css/04-paginas.css`).

**Spec:** [docs/superpowers/specs/2026-08-17-relatorio-diario-designers-design.md](../specs/2026-08-17-relatorio-diario-designers-design.md)

## Global Constraints

- Não é um sistema de build — arquivos `.js` são concatenados na ordem exata das tags `<script>` do `index.html`. Nenhum arquivo novo de JS é criado nesta fase (tudo entra em `js/pagina-painel-designers.js`, que já é carregado depois de tudo que ele usa).
- Todo `.gs` novo precisa ser liberado no `.claspignore`, senão o deploy automático não o envia.
- Todo push que mexe em `.gs` publica sozinho em produção (deploy automático) — sem revisão manual.
- Toda ida ao backend do front-end passa por `chamarBackend`/`chamarBackendGet` (js/config.js), nunca `fetch` direto.
- Comparação de tarefa por `id` (nunca por referência de objeto) — bug documentado no CLAUDE.md.
- Não existe framework de teste automatizado neste projeto (Apps Script + JS sem bundler). "Testar" aqui significa: checar sintaxe com `node --check` e verificar manualmente no navegador (`preview_start`/Browser).
- Sem alterar `Código.gs` além de adicionar UMA linha de roteamento — a lista de ações já tem ~150 entradas; manter o padrão existente (`else if (body.acao === '...')`).

---

### Task 1: Backend — `buscarPlaysDeHoje` aceita uma data arbitrária

**Files:**
- Modify: `Planilha.gs:1855-1894` (`buscarPlaysDeHoje`)

**Interfaces:**
- Consumes: nada novo.
- Produces: `buscarPlaysDeHoje(designer, janela, dataISO)` — quando `dataISO` (formato `"yyyy-MM-dd"`) é passado, ignora `janela` e filtra os plays daquele dia específico (fuso América/São_Paulo), do início ao fim do dia. Sem `dataISO`, comportamento 100% igual ao de hoje (usado por "Minhas horas" e pela ação `buscarTarefasHoje`).

- [ ] **Step 1: Editar a função para aceitar o 3º parâmetro**

Em `Planilha.gs`, dentro de `buscarPlaysDeHoje`, adicionar o parâmetro e o cálculo do corte por dia ANTES do bloco `if (janela === '48h') ...`:

```js
function buscarPlaysDeHoje(designer, janela, dataISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var sheet = getLogPlaysSheet();
  var linhas = sheet.getDataRange().getValues();
  var agora = new Date();
  var corte, corteFim;
  if (dataISO) {
    // Dia específico (navegação do relatório diário): do início ao fim
    // daquele dia, fuso de São Paulo — nunca "desde agora pra trás".
    corte = new Date(dataISO + 'T00:00:00-03:00').getTime();
    corteFim = new Date(dataISO + 'T23:59:59-03:00').getTime();
  } else if (janela === '48h') {
    corte = agora.getTime() - 48 * 60 * 60 * 1000;
  } else if (janela === 'semana') {
    corte = agora.getTime() - 7 * 24 * 60 * 60 * 1000;
  } else {
    // "hoje" (padrão): meia-noite de hoje, horário de Brasília.
    var hojeISO = Utilities.formatDate(agora, 'America/Sao_Paulo', 'yyyy-MM-dd');
    corte = new Date(hojeISO + 'T00:00:00-03:00').getTime();
  }
```

E no laço de agrupamento, trocar `if (Number(quando) < corte) continue;` por:

```js
    if (Number(quando) < corte) continue;
    if (corteFim && Number(quando) > corteFim) continue;
```

O resto da função (busca no Supabase, agrupamento por tarefa) não muda — `buscarPlaysNoSupabase(designer, corte)` já aceita o `corte` calculado acima, e a filtragem de `corteFim` acontece no laço local (a query do Supabase já veio com `quando >= corte`; falta só o teto, que o laço aplica).

- [ ] **Step 2: Checar sintaxe**

Run: `node --check Planilha.gs`
Expected: sem saída (sintaxe válida).

- [ ] **Step 3: Commit**

```bash
git add Planilha.gs
git commit -m "Permite buscarPlaysDeHoje filtrar por um dia específico (relatório diário)"
```

---

### Task 2: Backend — entregues do dia com tempo trabalhado e tempo médio

**Files:**
- Modify: `RunrunLeitura.gs` (nova função, perto de `buscarEntreguesDoDesigner`, linha ~1818-1853)

**Interfaces:**
- Consumes: `idDoUsuarioRunrunPorNome(nome)` (RunrunLeitura.gs:468), `runrunFetch` (RunrunLeitura.gs), `tarefaEhCardMae`, `extrairNomeProjeto`, `extrairTipoTarefa`, `tempoTrabalhadoAoVivo(t)` (RunrunLeitura.gs:685), `buscarTempoMedioDoPainel()` (RunrunLeitura.gs:743), `normalizarNomeParaComparar`, `resolverNomeCanonico`, `buscarVinculosDoPainel()`.
- Produces: `buscarEntreguesDoDiaComTempo(designer, dataISO)` → `{ ok: true, entregues: [{ id, titulo, cliente, projeto, tipo, quando, workedSeconds, tempoMedioMinutos }] }`. Usada só pela Task 4.

- [ ] **Step 1: Escrever a função**

Adicionar logo depois de `buscarEntreguesDoDesigner` em `RunrunLeitura.gs`:

```js
/**
 * Igual a buscarEntreguesDoDesigner, mas filtrado a UM DIA específico
 * (fuso São Paulo) e com o tempo trabalhado + tempo médio do cliente já
 * calculados — é o que o relatório diário usa pra montar "gastou X,
 * esperado Y". Busca até 50 entregues recentes e filtra pelo dia: o
 * Runrun.it não tem filtro de data na API (ver CLAUDE.md), então o corte
 * é sempre feito aqui depois de buscar.
 */
function buscarEntreguesDoDiaComTempo(designer, dataISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  if (!dataISO) return { ok: false, error: 'dataISO não informado.' };

  var runrunId = idDoUsuarioRunrunPorNome(designer);
  if (!runrunId) return { ok: false, error: 'Não achei o id de ' + designer + ' no Runrun.it.' };

  var lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
    '&is_closed=true&sort=close_date&sortDir=desc&limit=50');
  if (!Array.isArray(lote)) {
    lote = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(runrunId) +
      '&is_closed=true&sort=updated_at&sortDir=desc&limit=50');
  }
  if (!Array.isArray(lote)) {
    return { ok: false, error: 'Resposta inesperada do Runrun.it ao buscar entregues do dia.' };
  }

  var mapaVinculos = buscarVinculosDoPainel();
  var mapaTempoMedio = buscarTempoMedioDoPainel();

  var entregues = lote
    .filter(function (t) { return !tarefaEhCardMae(t); })
    .map(function (t) {
      var quandoRaw = t.close_date || t.updated_at || null;
      var quando = quandoRaw ? new Date(quandoRaw).getTime() : null;
      var diaDoFechamento = quando ? Utilities.formatDate(new Date(quando), 'America/Sao_Paulo', 'yyyy-MM-dd') : null;
      var nomeClienteBruto = t.client_name || 'Sem cliente';
      var nomeClienteResolvido = resolverNomeCanonico(nomeClienteBruto, mapaVinculos);
      return {
        id: t.id,
        titulo: t.title || '',
        cliente: nomeClienteResolvido,
        projeto: extrairNomeProjeto(t),
        tipo: extrairTipoTarefa(t),
        quando: quando,
        dia: diaDoFechamento,
        workedSeconds: tempoTrabalhadoAoVivo(t),
        tempoMedioMinutos: mapaTempoMedio[normalizarNomeParaComparar(nomeClienteResolvido)] || 0
      };
    })
    .filter(function (e) { return e.dia === dataISO; });

  return { ok: true, entregues: entregues };
}
```

- [ ] **Step 2: Checar sintaxe**

Run: `node --check RunrunLeitura.gs`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add RunrunLeitura.gs
git commit -m "Adiciona buscarEntreguesDoDiaComTempo (relatório diário dos designers)"
```

---

### Task 3: Backend — eventos do feed filtrados por dia e por corte de horário

**Files:**
- Modify: `Planilha.gs` (nova função, perto de `buscarFeedEventos`, linha ~639-669)

**Interfaces:**
- Consumes: `getFeedEventosSheet()`, `supabaseManda`, `buscarFeedEventosNoSupabase` (mesmo arquivo).
- Produces: `buscarEventosDoDiaAposHorario(designer, dataISO, horaCorte)` → `{ ok: true, eventos: [{ quando, tipo, autor, taskId, titulo, detalhe }] }`, só com `tipo` igual a `"recebida"` ou `"prioridade"`, do dia `dataISO`, com `quando` >= ao horário de corte (formato `"HH:mm"`, ex: `"10:00"`). Usada só pela Task 4.

- [ ] **Step 1: Escrever a função**

Adicionar logo depois de `buscarFeedEventos` em `Planilha.gs`:

```js
/**
 * Eventos "recebida" (repasse/sequência) e "prioridade" de UM designer,
 * num dia específico, que aconteceram DEPOIS de um horário de corte —
 * usado pelo relatório diário pra mostrar "o que chegou no meio do
 * caminho" (ex: prioridade que entrou depois das 10h, quando o
 * coordenador já tinha organizado o Runrun deles). Reaproveita
 * buscarFeedEventos (mesma fonte, mesma janela de retenção) e filtra por
 * cima — o feed já é pouca linha, não vale duplicar a leitura.
 */
function buscarEventosDoDiaAposHorario(designer, dataISO, horaCorte) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  if (!dataISO || !horaCorte) return { ok: false, error: 'dataISO/horaCorte não informado.' };

  var resultado = buscarFeedEventos(designer);
  if (!resultado.ok) return resultado;

  var inicioCorte = new Date(dataISO + 'T' + horaCorte + ':00-03:00').getTime();
  var fimDoDia = new Date(dataISO + 'T23:59:59-03:00').getTime();

  var eventos = resultado.eventos.filter(function (ev) {
    if (ev.tipo !== 'recebida' && ev.tipo !== 'prioridade') return false;
    return ev.quando >= inicioCorte && ev.quando <= fimDoDia;
  });

  return { ok: true, eventos: eventos };
}
```

- [ ] **Step 2: Checar sintaxe**

Run: `node --check Planilha.gs`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add Planilha.gs
git commit -m "Adiciona buscarEventosDoDiaAposHorario (relatório diário dos designers)"
```

---

### Task 4: Backend — a ação que junta tudo (`relatorioDiarioDesigner`)

**Files:**
- Create: `RelatoriosDesigner.gs`
- Modify: `Código.gs` (rota nova em `handleRequest`, perto da linha 490)
- Modify: `.claspignore` (liberar o arquivo novo)

**Interfaces:**
- Consumes: `buscarPlaysDeHoje(designer, null, dataISO)` (Task 1), `buscarEntreguesDoDiaComTempo(designer, dataISO)` (Task 2), `buscarEventosDoDiaAposHorario(designer, dataISO, '10:00')` (Task 3), `getTarefasColmeia()` (Código.gs, já existente).
- Produces: `relatorioDiarioDesigner(designer, dataISO)` → o formato descrito no spec (seção "Backend"), consumido só pelo front-end via a ação `relatorioDiarioDesigner`.

- [ ] **Step 1: Criar `RelatoriosDesigner.gs`**

```js
/**
 * ============================================
 * RELATÓRIO DIÁRIO DOS DESIGNERS
 * ============================================
 * Junta, pra UM designer e UM dia, tudo que o pop-up de relatório do
 * Painel de Designers mostra: tarefas tocadas, entregues (com tempo
 * gasto vs. esperado), a fila do dia (entrega hoje ou atrasada, lida do
 * quadro em cache — sem busca nova ao Runrun.it) e o que chegou depois
 * das 10h (repasse/prioridade, via FeedEventos).
 *
 * Nada aqui GRAVA nada — é só leitura, pensado pra abrir rápido: as
 * quatro fontes já existiam antes deste arquivo, cada uma cuidando do
 * seu próprio cache/custo (ver os comentários em cada uma).
 */

var RELATORIO_HORA_CORTE = '10:00';

function relatorioDiarioDesigner(designer, dataISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  if (!dataISO) return { ok: false, error: 'dataISO não informado.' };

  var tocadasResp = buscarPlaysDeHoje(designer, null, dataISO);
  var entreguesResp = buscarEntreguesDoDiaComTempo(designer, dataISO);
  var eventosResp = buscarEventosDoDiaAposHorario(designer, dataISO, RELATORIO_HORA_CORTE);
  var quadro = getTarefasColmeia();

  var filaDoDia = { total: 0, atrasadas: 0, hojeCerto: 0 };
  if (quadro && quadro.ok && Array.isArray(quadro.tarefas)) {
    quadro.tarefas.forEach(function (t) {
      if (String(t.assignee || '').toLowerCase().trim() !== String(designer).toLowerCase().trim()) return;
      if (!t.due) return;
      var dueISO = String(t.due).substring(0, 10);
      if (dueISO > dataISO) return; // entrega no futuro não conta pra este dia
      filaDoDia.total++;
      if (dueISO < dataISO) filaDoDia.atrasadas++; else filaDoDia.hojeCerto++;
    });
  }

  return {
    ok: true,
    data: dataISO,
    tocadas: tocadasResp.ok ? tocadasResp.tarefas : [],
    entregues: entreguesResp.ok ? entreguesResp.entregues : [],
    filaDoDia: filaDoDia,
    chegaramDepoisDas10h: eventosResp.ok ? eventosResp.eventos : []
  };
}
```

- [ ] **Step 2: Adicionar a rota em `Código.gs`**

Logo depois da linha `} else if (body.acao === 'buscarFeedEventos') { output = buscarFeedEventos(body.designer); }` (por volta da linha 490), adicionar:

```js
      } else if (body.acao === 'relatorioDiarioDesigner') {
        output = relatorioDiarioDesigner(body.designer, body.dataISO);
```

- [ ] **Step 3: Liberar o arquivo novo no `.claspignore`**

Adicionar, junto dos outros `!Arquivo.gs`:

```
!RelatoriosDesigner.gs
```

- [ ] **Step 4: Checar sintaxe dos três arquivos**

Run: `node --check RelatoriosDesigner.gs && node --check Código.gs`
Expected: sem saída nos dois.

- [ ] **Step 5: Commit**

```bash
git add RelatoriosDesigner.gs Código.gs .claspignore
git commit -m "Adiciona a ação relatorioDiarioDesigner (backend do relatório diário)"
```

⚠️ Este commit muda `Código.gs` — o deploy automático publica sozinho em produção ao dar push (ver CLAUDE.md, "Deploy automático"). Não precisa colar nada manualmente no editor do Apps Script.

---

### Task 5: Frontend — busca com cache, no mesmo arquivo do Painel de Designers

**Files:**
- Modify: `js/pagina-painel-designers.js` (novo bloco de estado e função de busca)

**Interfaces:**
- Consumes: `chamarBackend` (js/config.js), `caiuARede` (js/config.js).
- Produces: `buscarRelatorioDiario(designer, dataISO)` → `Promise` que resolve no objeto devolvido pela ação `relatorioDiarioDesigner`, ou `null` quando a rede caiu (nunca lança). Consumida pela Task 6.

- [ ] **Step 1: Escrever o bloco de cache + busca**

Adicionar no fim de `js/pagina-painel-designers.js`:

```js
// ===== Relatório diário — cache com teto (mesmo padrão de outros Map de
// cache do app: cresce sem limite numa aba aberta o dia todo se não tiver
// teto — ver CLAUDE.md, "Caches — todos têm teto ou validade"). =====
const RELATORIO_CACHE_TETO = 60;
const relatorioDiarioCache = new Map();

function relatorioDiarioChave(designer, dataISO) {
  return designer + "::" + dataISO;
}

async function buscarRelatorioDiario(designer, dataISO) {
  const chave = relatorioDiarioChave(designer, dataISO);
  if (relatorioDiarioCache.has(chave)) return relatorioDiarioCache.get(chave);

  const data = await chamarBackend({ acao: "relatorioDiarioDesigner", designer, dataISO });
  if (caiuARede(data) || !data.ok) return null;

  if (relatorioDiarioCache.size >= RELATORIO_CACHE_TETO) {
    const primeiraChave = relatorioDiarioCache.keys().next().value;
    relatorioDiarioCache.delete(primeiraChave);
  }
  relatorioDiarioCache.set(chave, data);
  return data;
}
```

- [ ] **Step 2: Checar sintaxe**

Run: `node --check js/pagina-painel-designers.js`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add js/pagina-painel-designers.js
git commit -m "Adiciona busca do relatório diário com cache (frontend)"
```

---

### Task 6: Frontend — o pop-up (HTML + CSS)

**Files:**
- Modify: `js/pagina-painel-designers.js` (funções de abrir/renderizar/navegar)
- Modify: `css/04-paginas.css` (bloco novo `.reld-*`)
- Modify: `index.html` (bump da versão `?v=` — ver Global Constraints do CLAUDE.md)

**Interfaces:**
- Consumes: `buscarRelatorioDiario` (Task 5), `formatarHoras` (js/pagina-horas.js — já carregado antes deste arquivo), `calcularEstimatePct` (js/pessoas-fotos.js), `escaparHTML` (js/config.js).
- Produces: `abrirRelatorioDesigner(designer)`, `fecharRelatorioDesigner()`, `relatorioDiarioIrParaDia(delta)` — chamadas pela Task 7 (wiring do clique) e pelos botões do próprio pop-up.

- [ ] **Step 1: Estado do pop-up e função de abrir**

```js
// ===== Pop-up "Relatório diário" (Painel de Designers) =====
let relatorioDesignerAtual = null; // nome do designer com o pop-up aberto, ou null
let relatorioDiaAtual = null;      // Date do dia sendo mostrado

function relatorioDataISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function abrirRelatorioDesigner(designer) {
  relatorioDesignerAtual = designer;
  relatorioDiaAtual = new Date();
  document.getElementById("reldOverlay").hidden = false;
  await relatorioDiarioRenderizar();
}

function fecharRelatorioDesigner() {
  relatorioDesignerAtual = null;
  document.getElementById("reldOverlay").hidden = true;
}

async function relatorioDiarioIrParaDia(delta) {
  if (!relatorioDiaAtual) return;
  relatorioDiaAtual.setDate(relatorioDiaAtual.getDate() + delta);
  await relatorioDiarioRenderizar();
}
```

- [ ] **Step 2: A função que busca e desenha**

```js
async function relatorioDiarioRenderizar() {
  const corpo = document.getElementById("reldCorpo");
  if (!corpo || !relatorioDesignerAtual || !relatorioDiaAtual) return;

  corpo.innerHTML = `<div class="reld-carregando">Carregando relatório...</div>`;
  document.getElementById("reldTituloDesigner").textContent = relatorioDesignerAtual;
  document.getElementById("reldDataLabel").textContent =
    relatorioDiaAtual.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  const dataISO = relatorioDataISO(relatorioDiaAtual);
  const dados = await buscarRelatorioDiario(relatorioDesignerAtual, dataISO);

  // O designer/dia pode ter mudado enquanto a busca estava no ar (clicou
  // rápido nas setas, ou fechou o pop-up) — descarta resposta velha.
  if (!relatorioDesignerAtual || relatorioDataISO(relatorioDiaAtual) !== dataISO) return;

  if (!dados) {
    corpo.innerHTML = `
      <div class="reld-erro">
        Não consegui carregar o relatório de hoje.
        <button type="button" onclick="relatorioDiarioRenderizar()">Tentar de novo</button>
      </div>`;
    return;
  }

  corpo.innerHTML = relatorioDiarioCorpoHTML(dados);
}

function relatorioDiarioCorpoHTML(dados) {
  const tocadas = dados.tocadas || [];
  const entregues = dados.entregues || [];
  const fila = dados.filaDoDia || { total: 0, atrasadas: 0, hojeCerto: 0 };
  const chegaram = dados.chegaramDepoisDas10h || [];

  return `
    <div class="reld-numeros">
      <div class="reld-num-card">
        <div class="reld-num">${tocadas.length}</div>
        <div class="reld-num-label">Tarefas tocadas</div>
      </div>
      <div class="reld-num-card">
        <div class="reld-num">${entregues.length}</div>
        <div class="reld-num-label">Entregues</div>
      </div>
      <div class="reld-num-card">
        <div class="reld-num">${fila.total}</div>
        <div class="reld-num-label">Na fila${fila.atrasadas ? ` <span class="reld-num-sub">${fila.atrasadas} atrasada${fila.atrasadas > 1 ? "s" : ""}</span>` : ""}</div>
      </div>
      <div class="reld-num-card">
        <div class="reld-num">${chegaram.length}</div>
        <div class="reld-num-label">Chegaram depois das 10h</div>
      </div>
    </div>

    <div class="reld-secao">
      <div class="reld-secao-titulo">Entregues no dia</div>
      ${entregues.length === 0 ? `<div class="reld-vazio">Nada entregue neste dia.</div>` : `
        <div class="reld-lista">
          ${entregues.map(relatorioDiarioLinhaEntregueHTML).join("")}
        </div>
      `}
    </div>

    <div class="reld-secao">
      <div class="reld-secao-titulo">Chegou depois das 10h</div>
      ${chegaram.length === 0 ? `<div class="reld-vazio">Nada chegou fora da fila original.</div>` : `
        <div class="reld-lista">
          ${chegaram.map(relatorioDiarioLinhaEventoHTML).join("")}
        </div>
      `}
    </div>
  `;
}

function relatorioDiarioLinhaEntregueHTML(e) {
  const pct = calcularEstimatePct(e.workedSeconds || 0, e.tempoMedioMinutos || 0);
  const passouDoEsperado = e.tempoMedioMinutos > 0 && pct > 100;
  const gasto = formatarHoras(e.workedSeconds || 0);
  const esperado = e.tempoMedioMinutos ? formatarHoras(e.tempoMedioMinutos * 60) : "—";
  return `
    <div class="reld-linha">
      <div class="reld-linha-topo">
        <span class="reld-linha-titulo">${escaparHTML(e.titulo)}</span>
        <span class="reld-linha-cliente">${escaparHTML(e.cliente || "")}</span>
      </div>
      <div class="reld-linha-barra-wrap">
        <div class="reld-linha-barra ${passouDoEsperado ? "reld-passou" : ""}" style="width:${Math.min(100, pct)}%"></div>
      </div>
      <div class="reld-linha-tempos">Gastou ${gasto}${e.tempoMedioMinutos ? ` · esperado ${esperado}` : ""}</div>
    </div>
  `;
}

function relatorioDiarioLinhaEventoHTML(ev) {
  const icone = ev.tipo === "prioridade" ? "⚡" : "↪";
  const hora = ev.quando ? new Date(ev.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
  return `
    <div class="reld-linha reld-linha-evento">
      <span class="reld-evento-icone">${icone}</span>
      <span class="reld-linha-titulo">${escaparHTML(ev.titulo || "")}</span>
      <span class="reld-evento-hora">${hora}</span>
    </div>
  `;
}
```

- [ ] **Step 3: Markup do overlay**

Em `index.html`, logo antes do fechamento de `</body>` (perto de onde outros overlays do app já ficam, ex: `#centralAtendimento`), adicionar:

```html
<div id="reldOverlay" class="reld-overlay" hidden>
  <div class="reld-painel">
    <div class="reld-cabecalho">
      <button type="button" class="reld-fechar" onclick="fecharRelatorioDesigner()">✕</button>
      <div class="reld-cabecalho-info">
        <div id="reldTituloDesigner" class="reld-nome"></div>
        <div class="reld-nav">
          <button type="button" onclick="relatorioDiarioIrParaDia(-1)">←</button>
          <span id="reldDataLabel"></span>
          <button type="button" onclick="relatorioDiarioIrParaDia(1)">→</button>
        </div>
      </div>
    </div>
    <div id="reldCorpo" class="reld-corpo"></div>
  </div>
</div>
```

- [ ] **Step 4: CSS**

Em `css/04-paginas.css`, adicionar no fim do arquivo:

```css
/* ===== Relatório diário dos designers (Painel de Designers) ===== */
.reld-overlay {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
}
.reld-painel {
  width: min(640px, 92vw); max-height: 88vh; overflow-y: auto;
  background: var(--bg-card, #fff); border-radius: 20px; padding: 24px;
}
.reld-cabecalho { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.reld-cabecalho-info { flex: 1; }
.reld-nome { font-size: 20px; font-weight: 700; }
.reld-nav { display: flex; align-items: center; gap: 10px; margin-top: 4px; color: var(--text-secondary, #666); }
.reld-nav button { border: none; background: none; cursor: pointer; font-size: 16px; }
.reld-fechar { border: none; background: none; cursor: pointer; font-size: 18px; }
.reld-numeros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
.reld-num-card { background: var(--bg-muted, #f5f5f5); border-radius: 14px; padding: 12px; text-align: center; }
.reld-num { font-size: 22px; font-weight: 700; }
.reld-num-label { font-size: 11px; color: var(--text-secondary, #666); margin-top: 2px; }
.reld-num-sub { display: block; color: #d9480f; font-size: 10px; }
.reld-secao { margin-bottom: 20px; }
.reld-secao-titulo { font-weight: 600; margin-bottom: 8px; }
.reld-vazio { color: var(--text-secondary, #666); font-size: 13px; }
.reld-lista { display: flex; flex-direction: column; gap: 10px; }
.reld-linha { background: var(--bg-muted, #f5f5f5); border-radius: 12px; padding: 10px 12px; }
.reld-linha-topo { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.reld-linha-titulo { font-weight: 600; }
.reld-linha-cliente { color: var(--text-secondary, #666); }
.reld-linha-barra-wrap { height: 6px; background: #e2e2e2; border-radius: 999px; margin: 6px 0; overflow: hidden; }
.reld-linha-barra { height: 100%; background: #2f9e44; }
.reld-linha-barra.reld-passou { background: #d9480f; }
.reld-linha-tempos { font-size: 11px; color: var(--text-secondary, #666); }
.reld-linha-evento { display: flex; align-items: center; gap: 8px; }
.reld-evento-icone { font-size: 14px; }
.reld-evento-hora { margin-left: auto; color: var(--text-secondary, #666); font-size: 12px; }
.reld-carregando, .reld-erro { text-align: center; padding: 40px 0; color: var(--text-secondary, #666); }
.reld-erro button { margin-top: 10px; border: none; background: #000; color: #fff; border-radius: 999px; padding: 8px 16px; cursor: pointer; }
```

- [ ] **Step 5: Bump da versão no `index.html`**

Trocar `?v=AAAA-MM-DDx` (valor atual) por `?v=2026-08-17a` em **todas** as tags `<script>`/`<link>` do `index.html` (mesmo valor em todas — ver CLAUDE.md, "Versão nas tags").

- [ ] **Step 6: Checar sintaxe**

Run: `node --check js/pagina-painel-designers.js`
Expected: sem saída.

- [ ] **Step 7: Commit**

```bash
git add js/pagina-painel-designers.js css/04-paginas.css index.html
git commit -m "Adiciona o pop-up do relatório diário (visual + navegação por dia)"
```

---

### Task 7: Frontend — abrir o pop-up ao clicar no designer

**Files:**
- Modify: `js/pagina-painel-designers.js:521-529` (markup do card) e `pnlLigarEventosDaGrade` (linha ~608)

**Interfaces:**
- Consumes: `abrirRelatorioDesigner(designer)` (Task 6).
- Produces: nada consumido por outra task — é o fim da cadeia.

- [ ] **Step 1: Marcar o avatar como gatilho do relatório**

Em `pnlRenderDesigners`, na linha do avatar (perto da 525), adicionar `data-pnl-relatorio`:

```html
<div class="pnl-dcard-avatar" style="background:${col.bg};color:${col.fg}" data-pnl-relatorio="${escaparHTML(designer)}">${avatarInner}</div>
```

- [ ] **Step 2: Ligar o clique, sem disparar o toggle de expandir**

Em `pnlLigarEventosDaGrade`, junto dos outros `grid.querySelectorAll(...)`, adicionar:

```js
  // Abrir o relatório diário — clicar no avatar, não no card inteiro
  // (o card inteiro já expande/recolhe os clientes via data-pnl-toggle).
  grid.querySelectorAll("[data-pnl-relatorio]").forEach(el => {
    el.addEventListener("click", ev => {
      ev.stopPropagation();
      abrirRelatorioDesigner(el.dataset.pnlRelatorio);
    });
  });
```

- [ ] **Step 3: Checar sintaxe**

Run: `node --check js/pagina-painel-designers.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add js/pagina-painel-designers.js
git commit -m "Liga o clique no avatar do designer pra abrir o relatório diário"
```

---

### Task 8: Verificação manual no navegador

**Files:** nenhum (só verificação).

- [ ] **Step 1: Abrir o app localmente/no preview**

Usar `preview_start` apontando pro `index.html` (ou o servidor estático já configurado), logar como coordenador, abrir a página "Painel de Designers".

- [ ] **Step 2: Clicar no avatar de um designer com tarefas reais hoje**

Esperado: o pop-up abre, mostra o nome do designer, a data de hoje, e os 4 números carregam (sem ficar travado em "Carregando relatório...").

- [ ] **Step 3: Conferir os números contra o que já se vê no app**

Comparar "Na fila hoje" com o que aparece nos cards "Atrasadas"/"Vence hoje" do mesmo designer (já existentes no Painel) — os totais devem bater (fila do dia = atrasadas + vence hoje, olhando só até a data escolhida).

- [ ] **Step 4: Navegar um dia pra trás**

Clicar na seta ←. Esperado: a data muda, os números recarregam pro dia anterior, sem misturar com os de hoje.

- [ ] **Step 5: Testar o caso vazio**

Abrir o relatório de um designer sem nenhuma tarefa tocada/entregue no dia (ou um dia bem no passado). Esperado: os cards mostram "0", as listas mostram "Nada entregue neste dia."/"Nada chegou fora da fila original." — sem erro no console.

- [ ] **Step 6: Checar o console do navegador**

Sem erros JS relacionados a `reld*`/`relatorioDiario*`/`pnl*`.

---

## Fora de escopo deste plano

- Relatório semanal/mensal — fase seguinte, reaproveitando `relatorioDiarioDesigner` como base (troca a janela de 1 dia por 7/30 dias).
- Qualquer correção do bug de play/pause investigado separadamente (ver auditoria já reportada na conversa).
