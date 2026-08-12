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
  const abaVinculos = document.getElementById("configTabVinculos");
  if (abaVinculos) abaVinculos.classList.toggle("active", configTabAtiva === "vinculos");
  const abaAcessos = document.getElementById("configTabAcessos");
  if (abaAcessos) {
    // Só o coordenador vê: é a tela que decide quem entra no Colmeia.
    abaAcessos.hidden = PAPEL_LOGADO !== "coordenador";
    abaAcessos.classList.toggle("active", configTabAtiva === "acessos");
  }
  // Uma linha por aba, não um parágrafo (2026-08-11). A explicação longa
  // que ficava aqui em cima ninguém lia — e o que ela explicava era o
  // CAMPO, não a aba. Esse texto detalhado virou a dica embaixo de cada
  // campo, que é onde ele é lido na hora de preencher.
  const hint = document.getElementById("configHint");
  if (configTabAtiva === "acessos") {
    hint.textContent = "Quem pode entrar no Colmeia.";
    renderPainelAcessos();
    return;
  }
  if (configTabAtiva === "vinculos") {
    hint.textContent = "Junta nomes diferentes do mesmo cliente.";
    if (typeof renderConfigVinculosClientes === "function") renderConfigVinculosClientes();
    return;
  }
  if (configTabAtiva === "memorias") {
    hint.textContent = "O que a Bee sabe sobre cada cliente.";
    renderPainelMemoriasBee();
    return;
  }
  if (configTabAtiva === "pessoas") {
    hint.textContent = "Quem o Colmeia conhece — foto, apelidos e e-mails de cada pessoa.";
    renderPainelPessoas();
  } else {
    hint.textContent = "Links de cada cliente, que aparecem no Hub do Cliente.";
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

// Texto digitado na busca da aba Pessoas. Uma equipe cresce e a lista
// fica longa — antes só dava pra rolar.
let pessoasConfigFiltro = "";

const chevronConfigSVG = `<svg class="people-row-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * As etiquetas da linha fechada: o que essa pessoa já tem configurado.
 * É o que dá pra ler varrendo a lista, sem abrir ninguém — e é por isso
 * que a linha pode nascer fechada sem esconder informação útil.
 */
function tagsDaPessoaHTML(salvo, fotoAtual) {
  const tags = [];
  if (fotoAtual) tags.push(`<span class="cfg-tag ok">foto</span>`);
  else tags.push(`<span class="cfg-tag falta">sem foto</span>`);

  const apelidos = (salvo && salvo.aliases) || [];
  if (apelidos.length) {
    tags.push(`<span class="cfg-tag">${apelidos.length} apelido${apelidos.length > 1 ? "s" : ""}</span>`);
  }
  const emails = (salvo && salvo.emails) || [];
  if (emails.length) {
    tags.push(`<span class="cfg-tag ok">${emails.length} e-mail${emails.length > 1 ? "s" : ""}</span>`);
  } else {
    tags.push(`<span class="cfg-tag falta">sem e-mail</span>`);
  }
  return tags.join("");
}

function renderPainelPessoas() {
  const body = document.getElementById("peopleModalBody");
  const todos = nomesConhecidosOuVistos();

  if (todos.length === 0) {
    body.innerHTML = `<p class="cfg-vazio">Ninguém por aqui ainda — navegue pelo Colmeia e volte.</p>`;
    return;
  }

  const filtro = normalizarParaComparar(pessoasConfigFiltro);
  const nomes = filtro
    ? todos.filter(([, info]) => normalizarParaComparar(info.nomeOriginal).includes(filtro))
    : todos;

  // O bloco de sugestões de e-mail nasce vazio e é preenchido por
  // renderSugestoesDeVinculo(), logo abaixo — ele depende de uma consulta
  // ao backend e não pode segurar a lista de pessoas esperando por ela.
  body.innerHTML = `
    <div id="pessoasSugestoes"></div>
    <input type="search" class="cfg-busca" id="pessoasBusca"
           placeholder="Buscar pessoa" value="${escaparHTML(pessoasConfigFiltro)}">
    <div class="cfg-lista">
      ${nomes.length === 0
        ? `<p class="cfg-vazio">Ninguém com esse nome.</p>`
        : nomes.map(([chave, info]) => {
    const salvo = pessoasSalvas.find(p => normalizarParaComparar(p.nome) === chave);
    const fotoAtual = resolverFotoManual(info.nomeOriginal) || info.fotoAtual || "";
    const aliasesTexto = salvo ? salvo.aliases.join(", ") : "";
    const discordAtual = salvo ? salvo.discord || "" : "";
    const emailsTexto = salvo ? (salvo.emails || []).join(", ") : "";
    const vinculos = salvo ? salvo.aliases : [];
    const aberto = pessoasVinculadasExpandido.has(chave);
    return `
      <div class="people-row${aberto ? " aberta" : ""}" data-chave="${chave}" data-nome-original="${escaparHTML(info.nomeOriginal)}">
        <button type="button" class="people-row-top" data-chave-toggle="${chave}"
                aria-expanded="${aberto ? "true" : "false"}">
          <div class="people-row-avatar">${avatarPreviewHTML(info.nomeOriginal, fotoAtual)}</div>
          <span class="people-row-name">${escaparHTML(info.nomeOriginal)}</span>
          <span class="people-row-tags">${tagsDaPessoaHTML(salvo, fotoAtual)}</span>
          ${chevronConfigSVG}
        </button>
        ${!aberto ? "" : `
        <div class="people-row-form">
          ${vinculos.length ? `
            <div class="cfg-campo">
              <label>Já vinculados a essa pessoa</label>
              <div class="people-row-vinculos">
                ${vinculos.map(a => `<span class="people-row-vinculo-chip">${escaparHTML(a)}</span>`).join("")}
              </div>
            </div>` : ""}
          <div class="cfg-campo">
            <label for="cfg-foto-${chave}">Foto</label>
            <input type="text" id="cfg-foto-${chave}" class="people-row-input" data-campo="foto"
                   placeholder="https://..." value="${escaparHTML(fotoAtual)}">
          </div>
          <div class="cfg-campo">
            <label for="cfg-apelidos-${chave}">Apelidos</label>
            <span class="cfg-ajuda">Outros nomes dessa mesma pessoa, separados por vírgula. Ex: Manu, Manuela</span>
            <input type="text" id="cfg-apelidos-${chave}" class="people-row-input" data-campo="aliases"
                   value="${escaparHTML(aliasesTexto)}">
          </div>
          <div class="cfg-campo">
            <label for="cfg-emails-${chave}">E-mails</label>
            <span class="cfg-ajuda">É o que liga essa pessoa ao login do Google e ao Runrun.it, mesmo quando o nome vem escrito diferente.</span>
            <input type="text" id="cfg-emails-${chave}" class="people-row-input" data-campo="emails"
                   value="${escaparHTML(emailsTexto)}">
          </div>
          <div class="cfg-campo">
            <label for="cfg-discord-${chave}">Discord</label>
            <input type="text" id="cfg-discord-${chave}" class="people-row-input" data-campo="discord"
                   placeholder="Link da DM" value="${escaparHTML(discordAtual)}">
          </div>
          <div class="people-row-rodape">
            <button type="button" class="people-row-save" data-chave="${chave}">Salvar</button>
            <span class="people-row-saved" data-chave-saved="${chave}"></span>
          </div>
        </div>`}
      </div>
    `;
  }).join("")}
    </div>
  `;

  const busca = document.getElementById("pessoasBusca");
  if (busca) {
    busca.addEventListener("input", () => {
      pessoasConfigFiltro = busca.value;
      renderPainelPessoas();
      // Redesenhar troca o campo por um novo — sem devolver o foco, a
      // pessoa perde o cursor a cada letra digitada.
      const novo = document.getElementById("pessoasBusca");
      if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
    });
  }

  body.querySelectorAll(".people-row-top").forEach(btn => {
    btn.addEventListener("click", () => {
      const chave = btn.dataset.chaveToggle;
      if (pessoasVinculadasExpandido.has(chave)) pessoasVinculadasExpandido.delete(chave);
      // Uma linha aberta por vez: com várias abertas a lista vira de novo
      // a pilha de campos que essa tela deixou de ser.
      else { pessoasVinculadasExpandido.clear(); pessoasVinculadasExpandido.add(chave); }
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
      const emailsTexto = row.querySelector('[data-campo="emails"]').value.trim();
      const emails = emailsTexto
        ? emailsTexto.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
        : [];

      btn.disabled = true;
      btn.textContent = "Salvando...";
      const ok = await salvarPessoaNoBackend(nomeOriginal, foto, aliases, discord, emails);
      btn.disabled = false;
      btn.textContent = "Salvar";

      if (ok) {
        const idxSalvo = pessoasSalvas.findIndex(p => normalizarParaComparar(p.nome) === normalizarParaComparar(nomeOriginal));
        const novoRegistro = { nome: nomeOriginal, foto, aliases, discord, emails };
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
        precarregarFotosConhecidas();
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

  renderSugestoesDeVinculo();
}

/**
 * "De quem é este e-mail?" — os e-mails que o Colmeia conhece (da aba
 * Acessos e do Runrun.it) e que ainda não estão em nenhum perfil.
 *
 * Vincular é o que faz a foto e o nome cadastrados aqui valerem em TODO
 * lugar do app, mesmo quando o nome chega escrito diferente de cada
 * fonte — é o e-mail que amarra as pontas.
 *
 * ⚠️ NADA É VINCULADO SOZINHO. O backend só sugere (ver
 * sugerirVinculosDeEmail, Planilha.gs); quem grava é o clique daqui. Um
 * vínculo errado gruda a foto e o nome de uma pessoa em outra pelo app
 * inteiro, e não teria como desconfiar de onde veio — por isso a sugestão
 * mostra de onde tirou o palpite e o quanto confia nele.
 */
// As sugestões já buscadas. `renderPainelPessoas` roda de novo a cada
// letra digitada na busca — sem guardar isso aqui, cada tecla viraria
// uma consulta ao backend (que ainda por cima varre o Runrun.it inteiro).
// `null` = ainda não buscou nessa sessão; vira `null` de novo quando um
// vínculo é confirmado, porque aí a lista mudou de verdade.
let sugestoesVinculoCache = null;

async function renderSugestoesDeVinculo() {
  if (sugestoesVinculoCache === null) {
    const data = await chamarBackend({ acao: "sugerirVinculosDeEmail" });
    if (!data || !data.ok) return; // sem sugestões a lista de pessoas segue inteira
    sugestoesVinculoCache = data.sugestoes || [];
  }
  const bloco = document.getElementById("pessoasSugestoes");
  // A aba pode ter mudado enquanto a resposta vinha — o cuidado de sempre.
  if (!bloco || configTabAtiva !== "pessoas") return;

  const sugestoes = sugestoesVinculoCache;
  if (!sugestoes.length) return;

  bloco.innerHTML = `
    <div class="cfg-aviso">
      <div>
        <div class="cfg-aviso-titulo">${sugestoes.length} e-mail${sugestoes.length > 1 ? "s" : ""} pra vincular</div>
        <div class="cfg-aviso-sub">Vincular faz a foto e o nome valerem em todo lugar do app.</div>
      </div>
      ${sugestoes.map((s, i) => `
        <div class="cfg-sugestao">
          <div class="cfg-sugestao-texto">
            <div class="cfg-sugestao-email">${escaparHTML(s.email)}</div>
            <div class="cfg-sugestao-de">
              ${s.certeza === "exata" ? "é" : "parece ser"}
              <strong>${escaparHTML(s.pessoa)}</strong> ·
              vem ${s.fontes.includes("acesso") && s.fontes.includes("runrun")
                    ? "do acesso e do Runrun.it"
                    : s.fontes.includes("acesso") ? "do acesso" : "do Runrun.it"}
              como “${escaparHTML(s.nomeNaFonte)}”
            </div>
          </div>
          <button type="button" class="cfg-btn-mini" data-vincular="${i}">Vincular</button>
        </div>`).join("")}
    </div>
  `;

  bloco.querySelectorAll("[data-vincular]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const s = sugestoes[Number(btn.dataset.vincular)];
      btn.disabled = true;
      btn.textContent = "Vinculando...";
      const r = await chamarBackend({
        acao: "vincularEmailAPessoa", pessoa: s.pessoa, email: s.email,
      });
      if (!r || !r.ok) {
        btn.disabled = false;
        btn.textContent = "Vincular";
        alert((r && r.error) || "Não consegui vincular agora.");
        return;
      }
      // Recarrega os perfis antes de redesenhar: é o que faz a foto já
      // aparecer certa na hora, em vez de só no próximo F5. E zera o
      // cache das sugestões, porque essa acabou de sair da lista.
      sugestoesVinculoCache = null;
      await carregarPessoasSalvas();
      renderPainelPessoas();
      render();
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
                  <span>Logo do cliente</span>
                  <span class="cfg-ajuda">É a bolinha redonda no feed da Central do Atendimento. Sem logo, aparecem as iniciais do cliente.</span>
                  <input type="text" data-campo="logo" value="${escaparHTML(dados.logo || "")}" placeholder="https://... (endereço da imagem)">
                </label>
                <label class="cliente-link-field">
                  <span>Sigla do link de aprovação${dados.sigla ? "" : ` (automática: <b>${escaparHTML(siglaAutomaticaDeCliente(cliente))}</b>)`}</span>
                  <input type="text" data-campo="sigla" value="${escaparHTML(dados.sigla || "")}" maxlength="6"
                         placeholder="${escaparHTML(siglaAutomaticaDeCliente(cliente))}"
                         title="Aparece no link que vai pro cliente: colmeia.beeon.com.br/SIGLA/11505-k7m2. Deixa em branco pra usar a automática.">
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
        // Vazia significa "usa a automática", não "cliente sem sigla" — a
        // normalização de verdade (acento, espaço, maiúscula) é feita no
        // backend, na gravação, pra que o que fica guardado seja exatamente
        // o que vai aparecer na URL.
        sigla: form.querySelector('[data-campo="sigla"]').value.trim(),
        logo: form.querySelector('[data-campo="logo"]').value.trim(),
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

// =====================================================================
// ACESSOS — quem entra no Colmeia (2026-08-10)
//
// Entrar e sair gente é rotina de agência, não exceção: até aqui a única
// forma era abrir a planilha e editar a aba Login na mão. Esta aba faz o
// que o Colmeia consegue fazer sozinho — e DIZ, em vez de esconder, o que
// ele não consegue (o token do Runrun.it e a carteira de clientes, que
// mora no painel-designers-beeon).
//
// Só o coordenador vê (ver atualizarAbasConfig).
// =====================================================================

let acessosLista = null;      // null = ainda não buscou
let acessosSubstituindo = ""; // nome de quem está sendo substituído

async function renderPainelAcessos() {
  const corpo = document.getElementById("peopleModalBody");
  if (!corpo) return;

  if (acessosLista === null) {
    corpo.innerHTML = `<p class="quick-access-empty">Carregando quem tem acesso…</p>`;
    const data = await chamarBackend({ acao: "listarPessoasDoLogin" });
    // A aba pode ter mudado enquanto a lista vinha — o cuidado de sempre
    // (ver o "bug recorrente" no CLAUDE.md).
    if (configTabAtiva !== "acessos") return;
    if (!data || !data.ok) {
      corpo.innerHTML = `<p class="quick-access-empty">${escaparHTML((data && data.error) || "Não consegui carregar o cadastro.")}</p>`;
      return;
    }
    acessosLista = data.pessoas || [];
  }

  const corpoAgora = document.getElementById("peopleModalBody");
  if (!corpoAgora || configTabAtiva !== "acessos") return;

  corpoAgora.innerHTML = `
    <div id="acessosDoRunrun"></div>
    <div class="cfg-lista">
      ${acessosLista.map(p => acessoLinhaHTML(p)).join("")}
    </div>
    <details class="cfg-bloco-extra">
      <summary>Adicionar na mão</summary>
      <div class="cfg-bloco-extra-corpo">
        ${acessoFormHTML("novo", { nome: "", papel: "designer", email: "" })}
      </div>
    </details>
  `;
  wireAcessos(corpoAgora);
  renderSugestoesDoRunrun();
}

/**
 * "Adicionar com um clique": quem existe no Runrun.it com e-mail da Beeon
 * e ainda não entra no Colmeia.
 *
 * NÃO cria ninguém sozinho — o papel (designer / atendimento /
 * coordenador) é o que define o que a pessoa enxerga, e isso não dá pra
 * adivinhar do Runrun.it. O que o Colmeia faz é trazer nome e e-mail
 * prontos, pra sobrar só a escolha que é de verdade sua.
 */
async function renderSugestoesDoRunrun() {
  const data = await chamarBackend({ acao: "listarPessoasDoRunrunSemAcesso" });
  const bloco = document.getElementById("acessosDoRunrun");
  if (!bloco || configTabAtiva !== "acessos") return;

  // Sem ninguém pra sugerir (ou com o Runrun.it fora do ar), o bloco
  // simplesmente não existe — antes ele ficava ali dizendo "todo mundo já
  // tem acesso", ocupando espaço pra informar que não havia nada a fazer.
  if (!data || !data.ok) { bloco.innerHTML = ""; return; }
  const pessoas = data.pessoas || [];
  if (!pessoas.length) { bloco.innerHTML = ""; return; }

  bloco.innerHTML = `
    <div class="cfg-aviso">
      <div>
        <div class="cfg-aviso-titulo">${pessoas.length} do Runrun.it sem acesso</div>
        <div class="cfg-aviso-sub">Escolha o papel e adicione. Quem entra por aqui usa o Google, sem chave.</div>
      </div>
      ${pessoas.map((p, i) => `
        <div class="cfg-sugestao" data-sugestao="${i}">
          <div class="cfg-sugestao-texto">
            <div class="cfg-sugestao-email">${escaparHTML(p.nome)}</div>
            <div class="cfg-sugestao-de">${escaparHTML(p.email)}</div>
          </div>
          <select data-campo="papel" class="cfg-select-mini">
            ${["atendimento", "designer", "coordenador"].map(v =>
              `<option value="${v}">${v}</option>`).join("")}
          </select>
          <button type="button" class="cfg-btn-mini" data-sugestao-add="${i}">Adicionar</button>
        </div>`).join("")}
    </div>
  `;

  bloco.querySelectorAll("[data-sugestao-add]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const p = pessoas[Number(btn.dataset.sugestaoAdd)];
      const item = btn.closest(".cfg-sugestao");
      const papel = item.querySelector('[data-campo="papel"]').value;
      btn.disabled = true;
      await acessoChamar(
        { acao: "salvarPessoaDoLogin", nome: p.nome, papel, email: p.email, chave: "" },
        `${p.nome} agora entra pelo Google.`
      );
    });
  });
}

// Quem está com a linha aberta na aba Acessos (mesmo padrão da aba
// Pessoas: fechada por padrão, uma aberta por vez).
let acessoAberto = "";

function acessoLinhaHTML(p) {
  const id = encodeURIComponent(p.nome);
  const aberto = acessoAberto === p.nome;
  // A foto aqui não é enfeite: é a prova de que esta linha de acesso está
  // ligada a um perfil da aba Pessoas. Se aparecerem só as iniciais, é
  // porque o Colmeia ainda não sabe que esta pessoa é aquele perfil — e a
  // foto cadastrada não vai aparecer pra ela em lugar nenhum do app.
  const perfil = resolverPessoa({ nome: p.nome, email: p.email });
  const tags = [
    `<span class="cfg-tag">${escaparHTML(p.papel)}</span>`,
    p.email ? `<span class="cfg-tag ok">Google</span>` : "",
    p.temChave ? `<span class="cfg-tag">chave</span>` : "",
    perfil ? "" : `<span class="cfg-tag falta">sem perfil</span>`,
  ].join("");

  return `
    <div class="people-row${aberto ? " aberta" : ""}" data-nome="${escaparHTML(p.nome)}">
      <button type="button" class="people-row-top" data-acesso-toggle="${escaparHTML(p.nome)}"
              aria-expanded="${aberto ? "true" : "false"}">
        ${avatarHTML(p.nome, "avatar-sm", null, { email: p.email })}
        <span class="people-row-name">${escaparHTML(p.nome)}</span>
        <span class="people-row-tags">${tags}</span>
        ${chevronConfigSVG}
      </button>
      ${!aberto ? "" : `
      <div class="people-row-form">
        ${p.email
          ? ""
          : `<p class="cfg-ajuda">Sem e-mail, essa pessoa só entra pela chave de acesso.</p>`}
        ${perfil
          ? ""
          : `<p class="cfg-ajuda">Sem perfil na aba Pessoas — a foto dela não aparece em lugar nenhum do app.</p>`}
        ${acessoFormHTML(id, p)}
        <div class="acesso-acoes">
          <button type="button" class="people-row-save" data-acao="salvar" data-nome="${escaparHTML(p.nome)}">Salvar</button>
          <button type="button" class="cfg-btn-secundario" data-acao="substituir" data-nome="${escaparHTML(p.nome)}">Substituir pessoa</button>
          <button type="button" class="cfg-btn-secundario acesso-perigo" data-acao="remover" data-nome="${escaparHTML(p.nome)}">Tirar acesso</button>
        </div>
      </div>`}
    </div>`;
}

function acessoFormHTML(id, p) {
  return `
    <div class="acesso-campos" data-form="${id}">
      <div class="cfg-campo">
        <label>Nome</label>
        <input type="text" class="people-row-input" data-campo="nome" value="${escaparHTML(p.nome || "")}">
      </div>
      <div class="cfg-campo">
        <label>Papel</label>
        <span class="cfg-ajuda">É o que decide o que a pessoa enxerga no Colmeia.</span>
        <select class="people-row-input" data-campo="papel">
          ${["designer", "atendimento", "coordenador"].map(v =>
            `<option value="${v}"${(p.papel || "designer") === v ? " selected" : ""}>${v}</option>`).join("")}
        </select>
      </div>
      <div class="cfg-campo">
        <label>E-mail do Google</label>
        <span class="cfg-ajuda">Libera o “Entrar com o Google”. Opcional.</span>
        <input type="email" class="people-row-input" data-campo="email" value="${escaparHTML(p.email || "")}">
      </div>
      <div class="cfg-campo">
        <label>Chave de acesso</label>
        <input type="text" class="people-row-input" data-campo="chave"
               placeholder="${p.nome ? "deixe vazio pra manter a atual" : "opcional"}">
      </div>
    </div>`;
}

function lerCamposDoAcesso(raiz, id) {
  const bloco = raiz.querySelector(`[data-form="${CSS.escape(id)}"]`);
  if (!bloco) return null;
  const pega = campo => (bloco.querySelector(`[data-campo="${campo}"]`) || {}).value || "";
  return { nome: pega("nome").trim(), papel: pega("papel"), email: pega("email").trim(), chave: pega("chave").trim() };
}

function wireAcessos(raiz) {
  raiz.querySelectorAll("[data-acesso-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const nome = btn.dataset.acessoToggle;
      acessoAberto = acessoAberto === nome ? "" : nome;
      renderPainelAcessos();
    });
  });

  raiz.querySelectorAll("[data-acao]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const nome = btn.dataset.nome;
      const acao = btn.dataset.acao;

      if (acao === "remover") {
        if (!confirm(`Tirar o acesso de ${nome}?\n\nO trabalho dela continua tudo lá — ela só deixa de conseguir entrar.`)) return;
        await acessoChamar({ acao: "removerPessoaDoLogin", nome }, `${nome} não entra mais.`);
        return;
      }

      if (acao === "substituir") {
        // Reaproveita o formulário da própria linha: quem substitui já
        // está com os campos na frente, e o papel vem herdado sozinho.
        const dados = lerCamposDoAcesso(raiz, encodeURIComponent(nome));
        if (!dados || !dados.nome || dados.nome === nome) {
          mostrarToast("Escreva o nome de quem ENTRA no campo de cima, depois clique em Substituir.", "erro");
          return;
        }
        if (!confirm(`${nome} sai e ${dados.nome} entra no lugar, com o mesmo papel.\n\nConfirma?`)) return;
        const r = await chamarBackend({
          acao: "substituirPessoaDoLogin", nomeAntigo: nome,
          novos: { nome: dados.nome, email: dados.email, chave: dados.chave, papel: dados.papel }
        });
        if (!r || !r.ok) { mostrarToast((r && r.error) || "Não consegui substituir.", "erro"); return; }
        acessosLista = null;
        renderPainelAcessos();
        // As pendências não são detalhe: uma substituição pela metade é
        // pior que nenhuma, então elas aparecem num aviso que fica.
        alert(`${r.saiu} saiu e ${r.entrou} entrou.\n\nFalta fazer à mão:\n\n• ${r.pendencias.join("\n\n• ")}`);
        return;
      }

      const dados = lerCamposDoAcesso(raiz, nome ? encodeURIComponent(nome) : "novo");
      if (!dados || !dados.nome) { mostrarToast("Falta o nome.", "erro"); return; }
      await acessoChamar({ acao: "salvarPessoaDoLogin", ...dados }, `${dados.nome} salvo.`);
    });
  });

  const formNovo = raiz.querySelector('[data-form="novo"]');
  if (formNovo) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "people-row-save";
    botao.style.marginTop = "14px";
    botao.textContent = "Adicionar";
    botao.addEventListener("click", async () => {
      const dados = lerCamposDoAcesso(raiz, "novo");
      if (!dados || !dados.nome) { mostrarToast("Falta o nome.", "erro"); return; }
      await acessoChamar({ acao: "salvarPessoaDoLogin", ...dados }, `${dados.nome} agora tem acesso.`);
    });
    formNovo.parentElement.appendChild(botao);
  }
}

async function acessoChamar(corpo, mensagemBoa) {
  const r = await chamarBackend(corpo);
  if (!r || !r.ok) { mostrarToast((r && r.error) || "Não consegui salvar.", "erro"); return; }
  mostrarToast(mensagemBoa);
  acessosLista = null; // força buscar de novo: a lista mudou de verdade
  renderPainelAcessos();
}
