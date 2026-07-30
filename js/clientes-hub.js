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

function getLinksDoCliente(nomeCliente) {
  return linksClientes.find(l => normalizarParaComparar(l.cliente) === normalizarParaComparar(nomeCliente)) || null;
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

// (attachments fake removido — agora busca de verdade em carregarAnexos())

