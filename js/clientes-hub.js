let linksClientes = []; // [{cliente, drive, bancoImagens, bibliotecaAdobe, pastaPublicacoes, extras:[{nome,url}]}]

async function carregarLinksClientes() {
  if (!COLMEIA_API_URL) return;
  try {
    const data = await chamarBackend({ acao: "listarLinksClientes" });
    if (data.ok) linksClientes = data.links || [];
  } catch (err) {
    console.error("Falha ao carregar links de clientes:", err);
  }
}

async function salvarLinksClienteNoBackend(cliente, dados) {
  if (!COLMEIA_API_URL || !cliente) return false;
  try {
    const data = await chamarBackend({ acao: "salvarLinksCliente", cliente, dados });
    return !!data.ok;
  } catch (err) {
    console.error("Falha ao salvar links do cliente:", err);
    return false;
  }
}

let progressoClientes = []; // [{designer, cliente, entregues, total}]
let clientesOcultos = []; // [{designer, cliente}] — só filtro do Colmeia

async function carregarClientesOcultos() {
  if (!COLMEIA_API_URL) return;
  try {
    const data = await chamarBackend({ acao: "listarClientesOcultos" });
    if (data.ok) clientesOcultos = data.ocultos || [];
  } catch (err) {
    console.error("Falha ao carregar clientes ocultos:", err);
  }
}

function clienteEstaOculto(designer, cliente) {
  return clientesOcultos.some(o => nomesCorrespondem(o.designer, designer) && normalizarParaComparar(o.cliente) === normalizarParaComparar(cliente));
}

async function ocultarClienteNoBackend(designer, cliente) {
  if (!COLMEIA_API_URL) return false;
  try {
    const data = await chamarBackend({ acao: "ocultarCliente", designer, cliente });
    return data.ok;
  } catch (err) {
    console.error("Falha ao ocultar cliente:", err);
    return false;
  }
}

async function carregarProgressoClientes() {
  if (!COLMEIA_API_URL) return;
  try {
    const data = await chamarBackend({ acao: "buscarProgressoClientes" });
    if (data.ok) {
      progressoClientes = data.progresso || [];
      if (!document.getElementById("page-clientes").hidden) buildClientsPage();
    }
  } catch (err) {
    console.error("Falha ao carregar progresso mensal de clientes:", err);
  }
}

function getProgressoCliente(designer, cliente) {
  const reg = progressoClientes.find(p => nomesCorrespondem(p.designer, designer) && normalizarParaComparar(p.cliente) === normalizarParaComparar(cliente));
  return reg ? { entregues: reg.entregues, total: reg.total } : { entregues: 0, total: 0 };
}

/**
 * Acha os links cadastrados desse cliente — pelo nome canônico OU por
 * qualquer apelido (aliases) vinculado a ele (2026-08-14, achado do
 * Cláudio: "tem tudo cadastrado, pasta, pasta publicações, e não
 * aparecem" — a tarefa vem do Runrun.it com um nome, mas o cliente foi
 * cadastrado no Hub com outro, e os dois foram ligados como apelido; só
 * que essa checagem de apelido só existia pra PESSOA, resolverPessoa em
 * js/pessoas-fotos.js — nunca tinha sido copiada pra cliente aqui).
 */
function getLinksDoCliente(nomeCliente) {
  const alvo = normalizarParaComparar(nomeCliente);
  if (!alvo) return null;
  return linksClientes.find(l =>
    normalizarParaComparar(l.cliente) === alvo
    || (l.aliases || []).some(a => normalizarParaComparar(a) === alvo)) || null;
}

const HUB_FIXOS = [
  { chave: "drive", label: "Drive do cliente", cls: "hub-purple" },
  { chave: "bancoImagens", label: "Banco de imagens", cls: "hub-pink" },
  { chave: "bibliotecaAdobe", label: "Biblioteca Adobe", cls: "hub-blue" },
  { chave: "pastaPublicacoes", label: "Pasta publicações", cls: "hub-teal" },
];

/**
 * Desenha o Hub do Cliente com os links reais cadastrados pelo
 * coordenador. Um link só aparece clicável se tiver URL cadastrada —
 * senão some (não mostra pill vazia/quebrada pro designer).
 */
function renderHubDoClienteHTML(nomeCliente) {
  const dados = getLinksDoCliente(nomeCliente);
  if (!dados) {
    return `<span class="hub-empty">Nenhum link cadastrado ainda pra esse cliente.</span>`;
  }
  const fixos = HUB_FIXOS.filter(h => dados[h.chave]).map(h =>
    `<a href="${dados[h.chave]}" target="_blank" rel="noopener" class="hub-pill ${h.cls}">${h.label}</a>`
  );
  const extras = (dados.extras || []).filter(e => e.url).map((e, i) =>
    `<a href="${e.url}" target="_blank" rel="noopener" class="hub-pill ${HUB_FIXOS[i % HUB_FIXOS.length].cls}">${e.nome}</a>`
  );
  const todos = [...fixos, ...extras];
  if (todos.length === 0) {
    return `<span class="hub-empty">Nenhum link cadastrado ainda pra esse cliente.</span>`;
  }
  return todos.join("");
}

// ===== Aprovações enviadas do cliente (2026-08-04) =====
//
// Pedido do Cláudio: dentro do Hub do cliente, ver os links de aprovação
// já mandados pra esse cliente — o que ainda está esperando resposta, o
// que foi aprovado, o que voltou com pedido de ajuste. Busca de novo TODA
// vez que o hub abre (não guarda cache): é informação que muda o tempo
// todo (o cliente pode responder a qualquer momento) e a lista é curta
// (até 30 itens, ver listarAprovacoesDoCliente, Aprovacao.gs).
const APROVACAO_STATUS_INFO = {
  pendente: { texto: "⏳ Aguardando resposta", cls: "aprov-pendente" },
  aprovado: { texto: "✅ Aprovado", cls: "aprov-aprovado" },
  ajuste: { texto: "✏️ Pediu ajuste", cls: "aprov-ajuste" },
};

async function buscarAprovacoesDoCliente(cliente) {
  if (!COLMEIA_API_URL || !cliente) return [];
  try {
    const data = await chamarBackend({ acao: "listarAprovacoesDoCliente", cliente });
    return (data && data.ok) ? data.aprovacoes || [] : [];
  } catch (err) {
    console.error("Falha ao buscar aprovações do cliente:", err);
    return [];
  }
}

function renderAprovacoesDoClienteHTML(lista) {
  if (!lista.length) {
    return `<span class="ch-tarefas-vazio">Nenhum link de aprovação enviado ainda pra esse cliente.</span>`;
  }
  return lista.map(a => {
    const info = APROVACAO_STATUS_INFO[a.status] || APROVACAO_STATUS_INFO.pendente;
    const quando = a.respondidoEm || a.criadoEm;
    const dataTexto = quando ? new Date(quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
    return `
      <div class="ch-aprov-item">
        <div class="ch-aprov-info">
          <span class="ch-aprov-titulo">${escaparHTML(a.tituloTarefa || a.nomeArquivo || "Peça")}</span>
          ${a.respostaTexto ? `<span class="ch-aprov-resposta">“${escaparHTML(a.respostaTexto)}”</span>` : ""}
        </div>
        <div class="ch-aprov-lado">
          <span class="ch-aprov-status ${info.cls}">${info.texto}${a.quemAprovou ? ` · ${escaparHTML(a.quemAprovou)}` : ""}</span>
          <span class="ch-aprov-data">${dataTexto}</span>
          <button type="button" class="ch-aprov-copiar" data-codigo="${a.codigo}" title="Copiar link de novo">🔗</button>
          <button type="button" class="ch-aprov-excluir" data-codigo="${a.codigo}" title="Excluir este link de aprovação">🗑️</button>
        </div>
      </div>
    `;
  }).join("");
}

async function carregarAprovacoesNoHub(cliente) {
  const el = document.getElementById("chModalAprovacoes");
  if (!el) return;
  el.innerHTML = `<span class="ch-tarefas-vazio">Carregando...</span>`;
  const lista = await buscarAprovacoesDoCliente(cliente);
  // O hub pode ter trocado de cliente (ou fechado) enquanto buscava.
  if (document.getElementById("chModalNome")?.textContent !== formatarNomeExibicao(cliente)) return;
  el.innerHTML = renderAprovacoesDoClienteHTML(lista);
  el.querySelectorAll(".ch-aprov-copiar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const url = linkDeAprovacaoDoCliente(btn.dataset.codigo);
      try {
        await navigator.clipboard.writeText(url);
        mostrarToast("Link de aprovação copiado de novo.", "sucesso");
      } catch (err) {
        mostrarToast(`Link (não consegui copiar sozinho): ${url}`);
      }
    });
  });
  // Excluir — pedido do Cláudio (2026-08-06): links de teste ficavam
  // acumulados sem jeito de tirar. É definitivo (some da planilha, o
  // código para de abrir), por isso confirma antes.
  el.querySelectorAll(".ch-aprov-excluir").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este link de aprovação? Não dá pra desfazer.")) return;
      btn.disabled = true;
      const data = await chamarBackend({ acao: "excluirLinkDeAprovacao", codigo: btn.dataset.codigo });
      if (!data.ok) {
        mostrarToast(data.error || "Não consegui excluir agora.", "erro");
        btn.disabled = false;
        return;
      }
      mostrarToast("Link excluído.", "sucesso");
      carregarAprovacoesNoHub(cliente);
    });
  });
}

// (attachments fake removido — agora busca de verdade em carregarAnexos())

