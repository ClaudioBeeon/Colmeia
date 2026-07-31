let configTabAtiva = "pessoas";

function abrirPainelPessoas() {
  const overlay = document.getElementById("peopleModalOverlay");
  overlay.hidden = false;
  configTabAtiva = "pessoas";
  atualizarAbasConfig();
}

function atualizarAbasConfig() {
  document.getElementById("configTabPessoas").classList.toggle("active", configTabAtiva === "pessoas");
  document.getElementById("configTabClientes").classList.toggle("active", configTabAtiva === "clientes");
  const abaMemorias = document.getElementById("configTabMemorias");
  if (abaMemorias) abaMemorias.classList.toggle("active", configTabAtiva === "memorias");
  const hint = document.getElementById("configHint");
  if (configTabAtiva === "memorias") {
    hint.textContent = "O que a Bee sabe sobre cada cliente. O que você escrever aqui ela usa em toda conversa sobre esse cliente — manias, o que evitar, o que faz aprovar mais rápido.";
    renderPainelMemoriasBee();
    return;
  }
  if (configTabAtiva === "pessoas") {
    hint.textContent = "Todo nome que o Colmeia encontrar (no painel-designers-beeon, no Runrun.it, em subtarefas etc) aparece aqui. Troque a foto ou vincule apelidos à mesma pessoa.";
    renderPainelPessoas();
  } else {
    hint.textContent = "Cadastre os links de cada cliente (Drive, banco de imagens etc) — eles aparecem no Hub do Cliente pros designers.";
    renderPainelClientes();
    carregarPastasDriveSeNecessario().then(() => {
      if (configTabAtiva === "clientes") renderPainelClientes();
    });
  }
}

// Chaves (nome normalizado) de quem tem a "barrinha" de vínculos aberta
// no painel de Pessoas.
const pessoasVinculadasExpandido = new Set();

// Nomes (normalizados) que já são apelido vinculado de outra pessoa
// salva — esses não devem aparecer como linha própria no painel, só
// dentro da pessoa principal deles (é isso que faz o "linkar" parecer
// que funcionou de verdade).
function chavesDeApelidosAbsorvidos() {
  const absorvidos = new Set();
  pessoasSalvas.forEach(p => {
    const chavePrincipal = normalizarParaComparar(p.nome);
    p.aliases.forEach(a => {
      const chaveAlias = normalizarParaComparar(a);
      if (chaveAlias && chaveAlias !== chavePrincipal) absorvidos.add(chaveAlias);
    });
  });
  return absorvidos;
}

// `nomesVistos` (js/pessoas-fotos.js) só cresce enquanto a pessoa navega
// pelo Colmeia NESSA sessão (abre tarefa, vê cliente etc) — começa
// VAZIO a cada vez que a página carrega. Usar só ele como fonte fazia
// esse painel e a aba "Chamadas Discord" do perfil mostrarem "ninguém
// ainda" mesmo com gente já cadastrada/vinculada há tempos em
// `pessoasSalvas` (que veio pronta do backend) — bastava não ter
// clicado em nada ainda nessa aba do navegador. Junta os dois: quem já
// está salvo aparece sempre, e quem só apareceu agora (ainda sem
// cadastro) também, pra dar pra cadastrar na hora.
function nomesConhecidosOuVistos() {
  const absorvidos = chavesDeApelidosAbsorvidos();
  const mapa = new Map();
  pessoasSalvas.forEach(p => {
    const chave = normalizarParaComparar(p.nome);
    if (!absorvidos.has(chave)) mapa.set(chave, { nomeOriginal: p.nome, fotoAtual: p.foto || "" });
  });
  nomesVistos.forEach((info, chave) => {
    if (!absorvidos.has(chave) && !mapa.has(chave)) mapa.set(chave, info);
  });
  return Array.from(mapa.entries()).sort((a, b) => a[1].nomeOriginal.localeCompare(b[1].nomeOriginal));
}

function renderPainelPessoas() {
  const body = document.getElementById("peopleModalBody");
  const nomes = nomesConhecidosOuVistos();

  if (nomes.length === 0) {
    body.innerHTML = `<p class="workflow-seq-empty">Nenhum nome visto ainda nessa sessão — navegue pelo Colmeia (abra tarefas, veja clientes) e volte aqui.</p>`;
    return;
  }

  body.innerHTML = nomes.map(([chave, info]) => {
    const salvo = pessoasSalvas.find(p => normalizarParaComparar(p.nome) === chave);
    const fotoAtual = resolverFotoManual(info.nomeOriginal) || info.fotoAtual || "";
    const aliasesTexto = salvo ? salvo.aliases.join(", ") : "";
    const discordAtual = salvo ? salvo.discord || "" : "";
    const vinculos = salvo ? salvo.aliases : [];
    const aberto = pessoasVinculadasExpandido.has(chave);
    return `
      <div class="people-row" data-chave="${chave}" data-nome-original="${info.nomeOriginal}">
        <div class="people-row-top">
          <div class="people-row-avatar">${avatarPreviewHTML(info.nomeOriginal, fotoAtual)}</div>
          <span class="people-row-name">${info.nomeOriginal}</span>
          ${vinculos.length ? `
            <button type="button" class="people-row-vinculos-toggle" data-chave-toggle="${chave}">
              ${vinculos.length} vinculado${vinculos.length > 1 ? "s" : ""} ${aberto ? "▴" : "▾"}
            </button>
          ` : ""}
        </div>
        ${vinculos.length && aberto ? `
          <div class="people-row-vinculos">
            ${vinculos.map(a => `<span class="people-row-vinculo-chip">${escaparHTML(a)}</span>`).join("")}
          </div>
        ` : ""}
        <input type="text" class="people-row-input" data-campo="foto" placeholder="URL da foto" value="${fotoAtual}">
        <input type="text" class="people-row-input" data-campo="aliases" placeholder="Apelidos, separados por vírgula (ex: Manu, Manuela)" value="${aliasesTexto}">
        <input type="text" class="people-row-input" data-campo="discord" placeholder="Link do Discord (DM dessa pessoa)" value="${discordAtual}">
        <button type="button" class="people-row-save" data-chave="${chave}">Salvar</button>
        <span class="people-row-saved" data-chave-saved="${chave}"></span>
      </div>
    `;
  }).join("");

  body.querySelectorAll(".people-row-vinculos-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const chave = btn.dataset.chaveToggle;
      if (pessoasVinculadasExpandido.has(chave)) pessoasVinculadasExpandido.delete(chave);
      else pessoasVinculadasExpandido.add(chave);
      renderPainelPessoas();
    });
  });

  body.querySelectorAll(".people-row-save").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".people-row");
      const nomeOriginal = row.dataset.nomeOriginal;
      const foto = row.querySelector('[data-campo="foto"]').value.trim();
      const aliasesTexto = row.querySelector('[data-campo="aliases"]').value.trim();
      const aliases = aliasesTexto ? aliasesTexto.split(",").map(s => s.trim()).filter(Boolean) : [];
      const discord = row.querySelector('[data-campo="discord"]').value.trim();

      btn.disabled = true;
      btn.textContent = "Salvando...";
      const ok = await salvarPessoaNoBackend(nomeOriginal, foto, aliases, discord);
      btn.disabled = false;
      btn.textContent = "Salvar";

      if (ok) {
        const idxSalvo = pessoasSalvas.findIndex(p => normalizarParaComparar(p.nome) === normalizarParaComparar(nomeOriginal));
        const novoRegistro = { nome: nomeOriginal, foto, aliases, discord };
        if (idxSalvo !== -1) pessoasSalvas[idxSalvo] = novoRegistro;
        else pessoasSalvas.push(novoRegistro);

        // Apelido que virou vínculo mas já tinha linha própria salva
        // antes: apaga essa linha (local e no backend), senão ele
        // continua existindo separado e a fusão não parece ter feito nada.
        const nomesDeSobra = aliases.filter(a => {
          const chaveAlias = normalizarParaComparar(a);
          return pessoasSalvas.some(p => p !== novoRegistro && normalizarParaComparar(p.nome) === chaveAlias);
        });
        if (nomesDeSobra.length) {
          pessoasSalvas = pessoasSalvas.filter(p =>
            p === novoRegistro || !nomesDeSobra.some(n => normalizarParaComparar(n) === normalizarParaComparar(p.nome))
          );
          excluirPessoasPorNomesNoBackend(nomesDeSobra);
        }

        const avisoEl = row.querySelector(".people-row-saved");
        avisoEl.textContent = aliases.length ? "✓ Vinculado" : "✓ Salvo";

        // Atualiza as fotos em tudo que já está na tela agora — incluindo
        // a bolinha da barra lateral, se a foto trocada foi a de quem
        // está logado.
        atualizarAvatarDaSidebar();
        render();
        buildClientsPage();
        buildAtendimentoPage();
        buildTiposPage();
        if (document.getElementById("taskDetail").classList.contains("visible")) renderDetail();

        // Espera um instante pra pessoa ver o "✓" antes do apelido sumir
        // da lista e virar a barrinha de vínculo na pessoa principal.
        setTimeout(() => renderPainelPessoas(), 900);
      } else {
        row.querySelector(".people-row-saved").textContent = "Erro ao salvar";
      }
    });
  });
}

// Grupos de clientes expandidos no painel de configuração (igual ao
// padrão das outras listas expansíveis do Colmeia).
const clientesConfigExpandido = new Set();
let clientesConfigFiltro = "";

/**
 * Junta os nomes de clientes de todos os designers no painel-beeon,
 * sem duplicar, ordenados de A a Z.
 */
function listarTodosClientesConhecidos() {
  if (!painelBeeonData || !painelBeeonData.state) return [];
  const vistos = new Set();
  const nomes = [];
  Object.values(painelBeeonData.state).forEach(lista => {
    (lista || []).forEach(c => {
      const chave = normalizarParaComparar(c.cliente);
      if (vistos.has(chave)) return;
      vistos.add(chave);
      nomes.push(c.cliente);
    });
  });
  return nomes.sort((a, b) => a.localeCompare(b));
}

/**
 * Busca as pastas de cliente de verdade no Google Drive (mesma
 * estrutura do painel-designers-beeon: Beeon > Clientes > [cliente],
 * com a subpasta Publicações dentro), casa com os clientes já
 * conhecidos pelo nome, e preenche/salva só os campos que ainda
 * estiverem vazios — nunca sobrescreve um link que você já colocou
 * na mão.
 */
async function preencherDriveAutomatico() {
  const btn = document.getElementById("driveAutofillBtn");
  const statusEl = document.getElementById("driveAutofillStatus");
  btn.disabled = true;
  statusEl.textContent = "Lendo o Drive...";

  try {
    await carregarPastasDriveSeNecessario();
    btn.disabled = false;

    if (!pastasDriveCache || pastasDriveCache.length === 0) {
      statusEl.textContent = "Não consegui ler o Drive.";
      return;
    }

    const pastasDrive = pastasDriveCache;
    const todosClientes = listarTodosClientesConhecidos();
    let atualizados = 0;

    for (const cliente of todosClientes) {
      const dadosAtuais = getLinksDoCliente(cliente) || { drive: "", bancoImagens: "", bibliotecaAdobe: "", pastaPublicacoes: "", extras: [], pastaDriveVinculada: "" };

      // Se já tem um vínculo manual escolhido, usa ele — não tenta
      // adivinhar pelo nome nesse caso.
      let pasta = null;
      if (dadosAtuais.pastaDriveVinculada) {
        pasta = pastasDrive.find(p => p.driveUrl === dadosAtuais.pastaDriveVinculada);
      } else {
        pasta = pastasDrive.find(p => normalizarParaComparar(p.nome) === normalizarParaComparar(cliente));
      }
      if (!pasta) continue;

      const precisaDrive = !dadosAtuais.drive && pasta.driveUrl;
      const precisaPublicacoes = !dadosAtuais.pastaPublicacoes && pasta.pastaPublicacoesUrl;
      if (!precisaDrive && !precisaPublicacoes) continue;

      const novosDados = {
        drive: dadosAtuais.drive || pasta.driveUrl || "",
        bancoImagens: dadosAtuais.bancoImagens || "",
        bibliotecaAdobe: dadosAtuais.bibliotecaAdobe || "",
        pastaPublicacoes: dadosAtuais.pastaPublicacoes || pasta.pastaPublicacoesUrl || "",
        pastaDriveVinculada: dadosAtuais.pastaDriveVinculada || "",
        extras: dadosAtuais.extras || [],
      };
      const ok = await salvarLinksClienteNoBackend(cliente, novosDados);
      if (ok) {
        const idxExistente = linksClientes.findIndex(l => normalizarParaComparar(l.cliente) === normalizarParaComparar(cliente));
        const novoRegistro = { cliente, ...novosDados };
        if (idxExistente !== -1) linksClientes[idxExistente] = novoRegistro;
        else linksClientes.push(novoRegistro);
        atualizados++;
      }
    }

    renderPainelClientes();
    const statusDepois = document.getElementById("driveAutofillStatus");
    if (statusDepois) statusDepois.textContent = `✓ ${atualizados} cliente${atualizados === 1 ? "" : "s"} preenchido${atualizados === 1 ? "" : "s"}.`;
  } catch (err) {
    console.error("Falha ao preencher Drive automaticamente:", err);
    btn.disabled = false;
    statusEl.textContent = "Falha de conexão.";
  }
}

// Cache das pastas de cliente lidas do Drive, carregada uma vez ao
// abrir a aba "Links de clientes" — usada pro seletor de vínculo manual.
let pastasDriveCache = null;

async function carregarPastasDriveSeNecessario() {
  if (pastasDriveCache !== null || !COLMEIA_API_URL) return;
  try {
    const data = await chamarBackend({ acao: "listarPastasClientesDrive" });
    pastasDriveCache = data.ok ? (data.clientes || []) : [];
  } catch (err) {
    console.error("Falha ao carregar pastas do Drive:", err);
    pastasDriveCache = [];
  }
}

function renderPainelClientes() {
  const body = document.getElementById("peopleModalBody");

  if (!painelBeeonData) {
    body.innerHTML = `<p class="workflow-seq-empty">Carregando clientes do painel-designers-beeon...</p>`;
    return;
  }

  const todosClientes = listarTodosClientesConhecidos();
  const alvo = normalizarParaComparar(clientesConfigFiltro);
  const clientesFiltrados = alvo ? todosClientes.filter(c => normalizarParaComparar(c).includes(alvo)) : todosClientes;

  body.innerHTML = `
    <div class="drive-autofill-bar">
      <button type="button" id="driveAutofillBtn">🔄 Preencher Drive automaticamente</button>
      <span class="people-row-saved" id="driveAutofillStatus"></span>
    </div>
    <input type="text" class="rule-add-search" id="clientesConfigSearch" placeholder="Buscar cliente..." value="${clientesConfigFiltro}">
    <div class="config-clientes-list">
      ${clientesFiltrados.map(cliente => {
        const dados = getLinksDoCliente(cliente) || { drive: "", bancoImagens: "", bibliotecaAdobe: "", pastaPublicacoes: "", extras: [], pastaDriveVinculada: "", descricao: "" };
        const aberto = clientesConfigExpandido.has(cliente);
        return `
          <div class="atendimento-group ${aberto ? "expanded" : ""}">
            <button type="button" class="atendimento-group-header" data-cliente="${cliente}">
              <span class="atendimento-group-name">${cliente}</span>
            </button>
            ${aberto ? `
              <div class="cliente-links-form" data-cliente-form="${cliente}">
                <label class="cliente-link-field">
                  <span>Descrição (aparece no card de "Meus clientes")</span>
                  <textarea data-campo="descricao" placeholder="Ex: Açougue frigorífico em Passos, Itaú e SSP" rows="2">${dados.descricao || ""}</textarea>
                </label>
                <label class="cliente-link-field">
                  <span>Vincular pasta do Drive (se o nome vier diferente)</span>
                  <select class="cliente-drive-vinculo" data-campo="pastaDriveVinculada">
                    <option value="">— Escolher a pasta certa —</option>
                    ${(pastasDriveCache || []).map(p => `
                      <option value="${p.driveUrl}" data-pub="${p.pastaPublicacoesUrl || ""}" ${dados.pastaDriveVinculada === p.driveUrl ? "selected" : ""}>${p.nome}</option>
                    `).join("")}
                  </select>
                </label>
                <label class="cliente-link-field">
                  <span>Drive do cliente</span>
                  <input type="text" data-campo="drive" value="${dados.drive || ""}" placeholder="https://drive.google.com/...">
                </label>
                <label class="cliente-link-field">
                  <span>Banco de imagens</span>
                  <input type="text" data-campo="bancoImagens" value="${dados.bancoImagens || ""}" placeholder="https://...">
                </label>
                <label class="cliente-link-field">
                  <span>Biblioteca Adobe</span>
                  <input type="text" data-campo="bibliotecaAdobe" value="${dados.bibliotecaAdobe || ""}" placeholder="https://...">
                </label>
                <label class="cliente-link-field">
                  <span>Pasta de publicações</span>
                  <input type="text" data-campo="pastaPublicacoes" value="${dados.pastaPublicacoes || ""}" placeholder="https://...">
                </label>
                <div class="cliente-links-extras" data-extras-lista>
                  ${(dados.extras || []).map((e, i) => `
                    <div class="cliente-link-extra" data-extra-idx="${i}">
                      <input type="text" data-extra-campo="nome" value="${e.nome || ""}" placeholder="Nome do link">
                      <input type="text" data-extra-campo="url" value="${e.url || ""}" placeholder="https://...">
                      <button type="button" class="cliente-link-extra-remove" data-extra-idx="${i}" title="Remover">×</button>
                    </div>
                  `).join("")}
                </div>
                <button type="button" class="cliente-link-add-extra">+ Adicionar link extra</button>
                <div class="cliente-links-footer">
                  <button type="button" class="people-row-save" data-cliente-salvar="${cliente}">Salvar</button>
                  <span class="people-row-saved" data-cliente-saved="${cliente}"></span>
                </div>
              </div>
            ` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;

  document.getElementById("clientesConfigSearch").addEventListener("input", e => {
    clientesConfigFiltro = e.target.value;
    renderPainelClientes();
  });

  document.getElementById("driveAutofillBtn").addEventListener("click", preencherDriveAutomatico);

  body.querySelectorAll(".atendimento-group-header").forEach(btn => {
    btn.addEventListener("click", () => {
      const cliente = btn.dataset.cliente;
      if (clientesConfigExpandido.has(cliente)) clientesConfigExpandido.delete(cliente);
      else clientesConfigExpandido.add(cliente);
      renderPainelClientes();
    });
  });

  body.querySelectorAll(".cliente-link-add-extra").forEach(btn => {
    btn.addEventListener("click", () => {
      const form = btn.closest(".cliente-links-form");
      const lista = form.querySelector("[data-extras-lista]");
      const idx = lista.children.length;
      const div = document.createElement("div");
      div.className = "cliente-link-extra";
      div.dataset.extraIdx = idx;
      div.innerHTML = `
        <input type="text" data-extra-campo="nome" placeholder="Nome do link">
        <input type="text" data-extra-campo="url" placeholder="https://...">
        <button type="button" class="cliente-link-extra-remove" data-extra-idx="${idx}" title="Remover">×</button>
      `;
      lista.appendChild(div);
      div.querySelector(".cliente-link-extra-remove").addEventListener("click", () => div.remove());
    });
  });

  body.querySelectorAll(".cliente-link-extra-remove").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".cliente-link-extra").remove());
  });

  body.querySelectorAll(".cliente-drive-vinculo").forEach(select => {
    select.addEventListener("change", () => {
      const form = select.closest(".cliente-links-form");
      const opcao = select.options[select.selectedIndex];
      if (!opcao.value) return;
      form.querySelector('[data-campo="drive"]').value = opcao.value;
      const pub = opcao.dataset.pub;
      if (pub) form.querySelector('[data-campo="pastaPublicacoes"]').value = pub;
    });
  });

  body.querySelectorAll("[data-cliente-salvar]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cliente = btn.dataset.clienteSalvar;
      const form = body.querySelector(`[data-cliente-form="${CSS.escape(cliente)}"]`);
      const dados = {
        descricao: form.querySelector('[data-campo="descricao"]').value.trim(),
        drive: form.querySelector('[data-campo="drive"]').value.trim(),
        bancoImagens: form.querySelector('[data-campo="bancoImagens"]').value.trim(),
        bibliotecaAdobe: form.querySelector('[data-campo="bibliotecaAdobe"]').value.trim(),
        pastaPublicacoes: form.querySelector('[data-campo="pastaPublicacoes"]').value.trim(),
        pastaDriveVinculada: form.querySelector('[data-campo="pastaDriveVinculada"]').value,
        extras: Array.from(form.querySelectorAll(".cliente-link-extra")).map(div => ({
          nome: div.querySelector('[data-extra-campo="nome"]').value.trim(),
          url: div.querySelector('[data-extra-campo="url"]').value.trim(),
        })).filter(e => e.nome && e.url),
      };

      btn.disabled = true;
      btn.textContent = "Salvando...";
      const ok = await salvarLinksClienteNoBackend(cliente, dados);
      btn.disabled = false;
      btn.textContent = "Salvar";

      const avisoEl = form.querySelector(`[data-cliente-saved="${CSS.escape(cliente)}"]`);
      if (ok) {
        const idxExistente = linksClientes.findIndex(l => normalizarParaComparar(l.cliente) === normalizarParaComparar(cliente));
        const novoRegistro = { cliente, ...dados };
        if (idxExistente !== -1) linksClientes[idxExistente] = novoRegistro;
        else linksClientes.push(novoRegistro);
        avisoEl.textContent = "✓ Salvo";
        setTimeout(() => { avisoEl.textContent = ""; }, 2000);
      } else {
        avisoEl.textContent = "Erro ao salvar";
      }
    });
  });
}

// Avatar simples só pra pré-visualização dentro do painel de pessoas
// (não usa avatarHTML pra não registrar de novo o mesmo nome em loop).
function avatarPreviewHTML(nome, foto) {
  if (foto) {
    return `<img class="avatar avatar-sm" src="${foto}" alt="${nome}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'avatar avatar-sm', textContent:'${initials(nome)}'}))">`;
  }
  return `<div class="avatar avatar-sm">${initials(nome)}</div>`;
}

/**
 * Abre o modal "Ver regra", mostrando a sequência completa da tarefa
 * e a opção de adicionar mais uma pessoa no final dela.
 */
async function abrirModalRegra(task) {
  const overlay = document.getElementById("ruleModalOverlay");
  const body = document.getElementById("ruleModalBody");
  overlay.hidden = false;
  body.innerHTML = `<p class="workflow-seq-empty">Carregando...</p>`;

  // Reaproveita a sequência já carregada no header, ou busca de novo
  // se por algum motivo ainda não tiver.
  if (task.sequencia === undefined) await carregarSequencia(task);

  renderModalRegra(task);
}


// ============================================
// MEMÓRIAS DA BEE (aba de Configurações)
// ============================================
// O que a Bee SABE sobre cada cliente — as manias, o que evitar, o que
// faz aprovar mais rápido. Vira contexto em toda conversa dela sobre
// aquele cliente (ver beeTrechoDoDna em Bee.gs).
//
// Duas fontes, mostradas JUNTAS de propósito (decisão do Cláudio): o que
// alguém escreveu aqui e o que a Bee deduziu lendo as tarefas antigas. A
// origem continua guardada no backend, então dá pra separar um dia sem
// perder nada — a tela é que não separa.

let memoriasClienteSelecionado = null;
let memoriasDnaAtual = null;
let memoriasCarregando = false;

/**
 * Monta o bloco de Memórias da Bee dentro de QUALQUER container.
 *
 * Existe em dois lugares: na aba "Memórias da Bee" das Configurações (só
 * do coordenador) e no perfil do designer (ver abrirPerfilDoDesigner) —
 * porque Gustavo e Erick também alimentam a Bee, não só o Cláudio. O
 * miolo é o mesmo nos dois; muda só a lista de clientes que aparece no
 * seletor e onde ele é desenhado.
 *
 * `redesenhar` é quem chamar de novo quando a pessoa troca de cliente no
 * seletor — cada tela sabe redesenhar a si mesma.
 */
function montarBlocoMemorias(container, clientes, redesenhar) {
  if (!container) return;
  if (!clientes.length) {
    container.innerHTML = `<p class="workflow-seq-empty">Nenhum cliente encontrado pra mostrar memórias.</p>`;
    return;
  }
  // Se o cliente escolhido antes não está nesta lista (ex: o designer vê
  // só os clientes dele), começa no primeiro daqui.
  if (!memoriasClienteSelecionado || !clientes.some(c => c === memoriasClienteSelecionado)) {
    memoriasClienteSelecionado = clientes[0];
    memoriasDnaAtual = null;
  }

  container.innerHTML = `
    <div class="memorias-topo">
      <select id="memoriasCliente" class="memorias-select">
        ${clientes.map(c => `<option value="${escaparHTML(c)}"${c === memoriasClienteSelecionado ? " selected" : ""}>${escaparHTML(c)}</option>`).join("")}
      </select>
      <button type="button" id="memoriasAtualizarBee" title="A Bee lê as tarefas antigas desse cliente de novo. Demora — normalmente ela só faz isso 1x por semana.">🐝 Atualizar o que ela deduziu</button>
    </div>
    <div class="memorias-nova">
      <input type="text" id="memoriasTexto" placeholder="Ex: sempre pede pra aumentar a logo depois da primeira versão">
      <button type="button" id="memoriasAdicionar">Adicionar</button>
    </div>
    <div id="memoriasLista"></div>
  `;

  const select = document.getElementById("memoriasCliente");
  if (select) {
    select.addEventListener("change", () => {
      memoriasClienteSelecionado = select.value;
      memoriasDnaAtual = null;
      redesenhar();
    });
  }

  const btnAdd = document.getElementById("memoriasAdicionar");
  const campo = document.getElementById("memoriasTexto");
  if (btnAdd) btnAdd.addEventListener("click", () => adicionarMemoriaDaBee());
  if (campo) campo.addEventListener("keydown", e => { if (e.key === "Enter") adicionarMemoriaDaBee(); });

  const btnAtualizar = document.getElementById("memoriasAtualizarBee");
  if (btnAtualizar) btnAtualizar.addEventListener("click", () => atualizarMemoriaDeduzida(btnAtualizar));

  desenharListaDeMemorias();
  if (!memoriasDnaAtual) carregarDnaDoCliente();
}

function renderPainelMemoriasBee() {
  montarBlocoMemorias(
    document.getElementById("peopleModalBody"),
    listarTodosClientesConhecidos(),
    renderPainelMemoriasBee
  );
}

async function carregarDnaDoCliente() {
  if (!memoriasClienteSelecionado || memoriasCarregando) return;
  memoriasCarregando = true;
  const cliente = memoriasClienteSelecionado;
  const data = await chamarBackend({ acao: "beeDna", cliente });
  memoriasCarregando = false;
  // Trocou de cliente enquanto carregava? Não escreve por cima.
  if (cliente !== memoriasClienteSelecionado) return;
  memoriasDnaAtual = (data && data.ok) ? data : { itens: [] };
  desenharListaDeMemorias();
}

function desenharListaDeMemorias() {
  const alvo = document.getElementById("memoriasLista");
  if (!alvo) return;
  if (!memoriasDnaAtual) {
    alvo.innerHTML = `<p class="workflow-seq-empty">Carregando o que a Bee sabe...</p>`;
    return;
  }
  const itens = memoriasDnaAtual.itens || [];
  if (!itens.length) {
    alvo.innerHTML = `<p class="workflow-seq-empty">A Bee ainda não sabe nada sobre esse cliente. Escreve a primeira memória aí em cima — ou manda ela ler as tarefas antigas.</p>`;
    return;
  }
  alvo.innerHTML = `
    <div class="memorias-lista">
      ${itens.map(i => `
        <div class="memoria-item">
          <span class="memoria-texto">${escaparHTML(i.texto)}</span>
          ${i.id
            ? `<button type="button" class="memoria-x" data-id="${escaparHTML(i.id)}" title="Apagar essa memória">✕</button>`
            : `<span class="memoria-sugestao">
                 <span class="memoria-tag" title="A Bee viu isso repetir em pelo menos 3 tarefas desse cliente"><span class="bee-selo-mini">${beeIcon}</span>sugestão</span>
                 <button type="button" class="memoria-ok" data-fixar="${escaparHTML(i.texto)}" title="Guardar como memória fixa">✓</button>
                 <button type="button" class="memoria-x" data-descartar="${escaparHTML(i.texto)}" title="Descartar — ela não sugere isso de novo">✕</button>
               </span>`}
        </div>
      `).join("")}
      ${memoriasDnaAtual.observacao ? `<p class="memoria-obs">${escaparHTML(memoriasDnaAtual.observacao)}</p>` : ""}
    </div>
  `;
  alvo.querySelectorAll(".memoria-x[data-id]").forEach(btn => {
    btn.addEventListener("click", () => excluirMemoriaDaBee(btn.dataset.id));
  });
  // Sugestão que a Bee tirou sozinha das tarefas: aceitar vira memória
  // escrita (que ela nunca mais mexe), descartar some pra sempre.
  alvo.querySelectorAll("[data-fixar]").forEach(btn => {
    btn.addEventListener("click", () => fixarSugestaoDaBee(btn.dataset.fixar));
  });
  alvo.querySelectorAll("[data-descartar]").forEach(btn => {
    btn.addEventListener("click", () => descartarSugestaoDaBee(btn.dataset.descartar));
  });
}

async function fixarSugestaoDaBee(texto) {
  if (!texto || !memoriasClienteSelecionado) return;
  const data = await chamarBackend({
    acao: "beeAdicionarMemoria",
    cliente: memoriasClienteSelecionado,
    texto,
    autor: DESIGNER_LOGADO,
  });
  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "Não consegui guardar agora.", "erro");
    return;
  }
  mostrarToast("Guardado. A Bee não mexe mais nessa.");
  memoriasDnaAtual = null;
  carregarDnaDoCliente();
}

async function descartarSugestaoDaBee(texto) {
  if (!texto || !memoriasClienteSelecionado) return;
  if (memoriasDnaAtual) {
    memoriasDnaAtual.itens = (memoriasDnaAtual.itens || []).filter(i => i.texto !== texto);
    desenharListaDeMemorias();
  }
  const data = await chamarBackend({
    acao: "beeDescartarSugestao",
    cliente: memoriasClienteSelecionado,
    texto,
  });
  if (!data || !data.ok) mostrarToast((data && data.error) || "Não consegui descartar agora.", "erro");
}

async function adicionarMemoriaDaBee() {
  const campo = document.getElementById("memoriasTexto");
  if (!campo) return;
  const texto = campo.value.trim();
  if (!texto || !memoriasClienteSelecionado) return;
  campo.value = "";

  // Otimista: aparece na hora e some se o backend recusar.
  if (memoriasDnaAtual) {
    memoriasDnaAtual.itens = [{ id: "novo", texto, escrita: true }].concat(memoriasDnaAtual.itens || []);
    desenharListaDeMemorias();
  }

  const data = await chamarBackend({
    acao: "beeAdicionarMemoria",
    cliente: memoriasClienteSelecionado,
    texto,
    autor: DESIGNER_LOGADO,
  });
  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "Não consegui salvar essa memória agora.", "erro");
    if (campo && !campo.value.trim()) campo.value = texto; // devolve o texto
  }
  memoriasDnaAtual = null;
  carregarDnaDoCliente();
}

async function excluirMemoriaDaBee(id) {
  if (!id || id === "novo") return;
  if (memoriasDnaAtual) {
    memoriasDnaAtual.itens = (memoriasDnaAtual.itens || []).filter(i => i.id !== id);
    desenharListaDeMemorias();
  }
  const data = await chamarBackend({ acao: "beeExcluirMemoria", id });
  if (!data || !data.ok) mostrarToast((data && data.error) || "Não consegui apagar agora.", "erro");
  memoriasDnaAtual = null;
  carregarDnaDoCliente();
}

/**
 * Manda a Bee reler as tarefas antigas do cliente agora, sem esperar a
 * validade de uma semana. É a operação mais cara dela — por isso é um
 * botão, e não algo automático.
 */
async function atualizarMemoriaDeduzida(btn) {
  if (!memoriasClienteSelecionado) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Lendo as tarefas...";

  // Manda os ids das tarefas DESSE cliente que já estão no quadro — o
  // backend não precisa repaginar o Runrun.it inteiro só pra descobrir
  // quais são. Mais recentes primeiro.
  const doCliente = (typeof tasksTodas !== "undefined" ? tasksTodas : tasks)
    .filter(t => t.id && nomesCorrespondem(t.client, memoriasClienteSelecionado))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(t => t.id);

  const data = await chamarBackend({
    acao: "beeMemoriaCliente",
    cliente: memoriasClienteSelecionado,
    taskIds: doCliente,
    forcar: true,
  });
  btn.disabled = false;
  btn.textContent = original;

  if (!data || !data.ok) {
    mostrarToast((data && data.error) || "A Bee não conseguiu ler as tarefas agora.", "erro");
    return;
  }
  if (data.semMaterial) {
    mostrarToast("Não achei conversa nenhuma nas tarefas desse cliente pra tirar padrão.");
    return;
  }
  memoriasDnaAtual = null;
  carregarDnaDoCliente();
}

// ===== Perfil do designer =====
//
// O que Gustavo e Erick veem ao clicar na própria foto na barra lateral.
// O Cláudio, sendo coordenador, cai nas Configurações — quem decide isso
// é o handler do clique (js/notificacoes-avisos.js).
//
// Desenhado a partir do protótipo 3 aprovado pelo Cláudio: capa amarela
// com foto e nome, a linha "agora em" com o cronômetro do que está
// rodando, os clientes em quadradinhos com o atendimento de cada um, e as
// Memórias da Bee no fim — porque eles também alimentam ela, não só o
// coordenador (mesmo bloco das Configurações, ver montarBlocoMemorias).

// Qual aba do perfil está aberta agora — "clientes", "memorias" ou
// "discord". Reseta pra "clientes" toda vez que o perfil é aberto de novo.
let perfilAbaAtiva = "clientes";

function abrirPerfilDoDesigner() {
  const overlay = document.getElementById("perfilModalOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  perfilAbaAtiva = "clientes";
  renderPerfilDoDesigner();
}

function fecharPerfilDoDesigner() {
  const overlay = document.getElementById("perfilModalOverlay");
  if (overlay) overlay.hidden = true;
  pararRelogioDoPerfil();
}

function renderPerfilDoDesigner() {
  const overlay = document.getElementById("perfilModalOverlay");
  if (!overlay || overlay.hidden) return;

  const nomeEl = document.getElementById("perfilNome");
  if (nomeEl) nomeEl.textContent = DESIGNER_LOGADO || "";

  const fotoEl = document.getElementById("perfilFoto");
  if (fotoEl) {
    const foto = resolverFotoManual(DESIGNER_LOGADO) || fotoDoDesigner(DESIGNER_LOGADO);
    if (foto) {
      fotoEl.style.backgroundImage = `url("${foto}")`;
      fotoEl.textContent = "";
      fotoEl.classList.add("com-foto");
    } else {
      fotoEl.style.backgroundImage = "";
      fotoEl.classList.remove("com-foto");
      fotoEl.textContent = initials(DESIGNER_LOGADO);
    }
  }

  atualizarLinhaAgoraDoPerfil();
  iniciarRelogioDoPerfil();

  // --- Abas ---
  const abas = { clientes: "perfilTabClientes", memorias: "perfilTabMemorias", discord: "perfilTabDiscord" };
  Object.entries(abas).forEach(([chave, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle("active", chave === perfilAbaAtiva);
  });

  const corpo = document.getElementById("perfilCorpo");
  if (!corpo) return;

  if (perfilAbaAtiva === "clientes") {
    renderAbaClientesDoPerfil(corpo);
  } else if (perfilAbaAtiva === "memorias") {
    montarBlocoMemorias(corpo, nomesDosMeusClientes(), renderPerfilDoDesigner);
  } else {
    renderAbaDiscordDoPerfil(corpo);
  }
}

function renderAbaClientesDoPerfil(corpo) {
  const meusClientes = nomesDosMeusClientes();
  if (!meusClientes.length) {
    corpo.innerHTML = `<p class="workflow-seq-empty">Nenhum cliente encontrado pra você no painel-designers-beeon.</p>`;
    return;
  }
  corpo.innerHTML = `
    <div class="perfil-clientes">
      ${meusClientes.map(cliente => {
        const atend = getAtendimentoDoCliente(cliente) || "Sem atendimento";
        const servico = servicoDoCliente(cliente);
        return `
          <button type="button" class="perfil-cliente" data-cliente="${escaparHTML(cliente)}">
            <span class="perfil-cliente-txt">
              <span class="perfil-cliente-nome">${escaparHTML(formatarNomeExibicao(cliente))}</span>
              <span class="perfil-cliente-atend">Atendimento: ${escaparHTML(atend)}</span>
            </span>
            ${servico ? `<span class="perfil-cliente-tag" style="background:${mcCorServico(servico)};">${escaparHTML(servico)}</span>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
  corpo.querySelectorAll(".perfil-cliente").forEach(btn => {
    btn.addEventListener("click", () => {
      fecharPerfilDoDesigner();
      abrirHubDoCliente(btn.dataset.cliente, DESIGNER_LOGADO);
    });
  });
}

// ===== Aba "Chamadas Discord" =====
//
// Gustavo e Erick também precisam ligar por voz pra outras pessoas do
// time — coordenador, atendimento, um pro outro. O Discord identifica
// cada conversa por um ID de canal; colado depois desse prefixo, o link
// abre o app direto naquela conversa. Reaproveita o MESMO campo `discord`
// de cada pessoa que já existe (planilha de Pessoas, usado pelo botão
// "Chamar no Discord" dentro da tarefa) — não é um cadastro paralelo.
const PREFIXO_DISCORD_DM = "discord://discord.com/channels/@me/";

function renderAbaDiscordDoPerfil(corpo) {
  const nomes = nomesConhecidosOuVistos();

  corpo.innerHTML = `
    <p class="perfil-discord-hint">
      Pra ligar direto pelo Discord: abra o Discord, entre na conversa com a pessoa,
      clique com o <b>botão direito</b> no nome ou na foto dela na lista à esquerda
      e escolha <b>"Copiar ID do Canal"</b>. Se essa opção não aparecer, ative o
      Modo de Desenvolvedor em Configurações → Avançado, no Discord. Cole o ID
      aqui — o resto do link já está pronto.
    </p>
    ${nomes.length ? `
      <div class="perfil-discord-lista">
        ${nomes.map(([chave, info]) => {
          const salvo = pessoasSalvas.find(p => normalizarParaComparar(p.nome) === chave);
          const idAtual = idDoCanalNoLink(salvo && salvo.discord);
          return `
            <div class="perfil-discord-linha" data-chave="${chave}" data-nome-original="${escaparHTML(info.nomeOriginal)}">
              ${avatarPreviewHTML(info.nomeOriginal, resolverFotoManual(info.nomeOriginal) || info.fotoAtual || "")}
              <span class="perfil-discord-nome">${escaparHTML(info.nomeOriginal)}</span>
              <span class="perfil-discord-campo">
                <span class="perfil-discord-prefixo">${PREFIXO_DISCORD_DM}</span>
                <input type="text" class="perfil-discord-input" placeholder="ID do canal" value="${escaparHTML(idAtual)}">
              </span>
              <button type="button" class="perfil-discord-salvar">Salvar</button>
            </div>
          `;
        }).join("")}
      </div>
    ` : `<p class="workflow-seq-empty">Nenhum nome visto ainda nessa sessão — navegue pelo Colmeia e volte aqui.</p>`}
  `;

  corpo.querySelectorAll(".perfil-discord-linha").forEach(linha => {
    const btn = linha.querySelector(".perfil-discord-salvar");
    const input = linha.querySelector(".perfil-discord-input");
    const salvar = () => salvarDiscordDaPessoa(linha.dataset.nomeOriginal, input.value, btn);
    btn.addEventListener("click", salvar);
    input.addEventListener("keydown", e => { if (e.key === "Enter") salvar(); });
  });
}

// Se o link salvo usa o prefixo padrão, devolve só o ID (o que o campo
// mostra). Se foi configurado de outro jeito (ex: link colado direto nas
// Configurações), devolve vazio — não tenta adivinhar, e salvar aqui sem
// mexer no campo não perde o que já estava lá (só troca quando a pessoa
// realmente aperta Salvar).
function idDoCanalNoLink(link) {
  if (!link || !link.startsWith(PREFIXO_DISCORD_DM)) return "";
  return link.slice(PREFIXO_DISCORD_DM.length);
}

async function salvarDiscordDaPessoa(nomeOriginal, idDigitado, btn) {
  const idLimpo = (idDigitado || "").trim();
  const linkFinal = idLimpo ? PREFIXO_DISCORD_DM + idLimpo : "";

  // Preserva foto e apelidos já cadastrados dessa pessoa — essa aba só
  // mexe no Discord, não pode apagar o resto ao salvar.
  const existente = pessoasSalvas.find(p => normalizarParaComparar(p.nome) === normalizarParaComparar(nomeOriginal));
  const foto = existente ? existente.foto : "";
  const aliases = existente ? existente.aliases : [];

  if (btn) { btn.disabled = true; btn.textContent = "Salvando..."; }
  const ok = await salvarPessoaNoBackend(nomeOriginal, foto, aliases, linkFinal);
  if (btn) { btn.disabled = false; btn.textContent = "Salvar"; }

  if (!ok) {
    mostrarToast("Não consegui salvar agora. Tenta de novo em alguns segundos.", "erro");
    return;
  }
  if (existente) existente.discord = linkFinal;
  else pessoasSalvas.push({ nome: nomeOriginal, foto: "", aliases: [], discord: linkFinal });
  mostrarToast(linkFinal ? "Canal salvo." : "Canal removido.");
}

// Nomes dos clientes do designer logado, sem repetir e sem os que o
// coordenador escondeu. Mesma fonte da página "Meus clientes".
function nomesDosMeusClientes() {
  const lista = clientesDoDesignerNoPainel(DESIGNER_LOGADO) || [];
  const vistos = new Set();
  const nomes = [];
  lista.forEach(c => {
    if (!c || !c.cliente) return;
    if (typeof clienteEstaOculto === "function" && clienteEstaOculto(DESIGNER_LOGADO, c.cliente)) return;
    const chave = normalizarParaComparar(c.cliente);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    nomes.push(c.cliente);
  });
  return nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function servicoDoCliente(cliente) {
  const lista = clientesDoDesignerNoPainel(DESIGNER_LOGADO) || [];
  const achado = lista.find(c => c.cliente && normalizarParaComparar(c.cliente) === normalizarParaComparar(cliente));
  return (achado && achado.servicos && achado.servicos[0]) || "";
}

/**
 * A linha "Agora em <tarefa> · 02:01". Some quando não tem nada rodando —
 * em vez de mostrar "parado", que não acrescenta nada.
 */
function atualizarLinhaAgoraDoPerfil() {
  const el = document.getElementById("perfilAgora");
  if (!el) return;
  const rodando = tasks.find(t => t.running && ehMinhaTarefa(t));
  if (!rodando) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <span class="perfil-ponto-vivo"></span>
    <span>Agora em <b>${escaparHTML(rodando.title)}</b> · <span class="perfil-tempo">${formatTime(rodando.timerSeconds)}</span></span>
  `;
}

// O cronômetro anda de 1 em 1 segundo enquanto o perfil está aberto, e
// para junto com ele — sem isso ficaria um intervalo rodando à toa pelo
// resto da sessão.
let _relogioDoPerfil = null;
function iniciarRelogioDoPerfil() {
  pararRelogioDoPerfil();
  _relogioDoPerfil = setInterval(() => {
    const overlay = document.getElementById("perfilModalOverlay");
    if (!overlay || overlay.hidden) { pararRelogioDoPerfil(); return; }
    atualizarLinhaAgoraDoPerfil();
  }, 1000);
}
function pararRelogioDoPerfil() {
  clearInterval(_relogioDoPerfil);
  _relogioDoPerfil = null;
}
