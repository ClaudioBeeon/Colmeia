function iniciarAppPosLogin() {
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("page").hidden = false;

  document.getElementById("sidebarNomeUsuario").textContent = DESIGNER_LOGADO;
  document.getElementById("sidebarAvatarIniciais").textContent = initials(DESIGNER_LOGADO);
  document.getElementById("sidebarProfileLink").title = PAPEL_LOGADO === "coordenador" ? "Configurações" : DESIGNER_LOGADO;

  // Fila de repasse é só do Cláudio (ele que atende os clientes e
  // decide o que repassar) — os outros nem veem o ícone.
  const repasseNav = document.querySelector('.nav-ic[data-page="repasse"]');
  if (repasseNav) repasseNav.hidden = !souClaudio();

  buildBoard();
  render();
  mostrarPagina("kanban");
  carregarTarefasReais();
  carregarDadosPainelBeeon();
  carregarPessoasSalvas();
  carregarLinksClientes();
  carregarProgressoClientes();
  carregarClientesOcultos();
}

// Algumas coisas (Fila de Repasse, lançar Avisos) são só do Cláudio,
// não de qualquer coordenador — centraliza essa checagem aqui pra
// trocar fácil se um dia isso mudar.
function souClaudio() {
  return nomesCorrespondem(DESIGNER_LOGADO, "Claudio");
}

// ===== Login e sessão =====
// Guarda {nome, papel} no navegador depois de logar, pra não pedir
// senha de novo toda vez que abrir o Colmeia nesse computador.
const SESSAO_CHAVE = "colmeia_sessao";

function lerSessaoSalva() {
  try {
    const bruto = localStorage.getItem(SESSAO_CHAVE);
    return bruto ? JSON.parse(bruto) : null;
  } catch (err) {
    return null;
  }
}

function salvarSessao(nome, papel) {
  try {
    localStorage.setItem(SESSAO_CHAVE, JSON.stringify({ nome, papel }));
  } catch (err) {
    console.error("Não consegui salvar a sessão:", err);
  }
}

function sairDoColmeia() {
  try { localStorage.removeItem(SESSAO_CHAVE); } catch (err) { /* sem problema */ }
  location.reload();
}

document.getElementById("sidebarLogout").addEventListener("click", sairDoColmeia);

/**
 * Busca uma frase engraçada gerada pela IA baseada no dia/período de
 * agora, pra mostrar na tela de login. Já deixa uma frase padrão
 * escrita enquanto espera (a tela de login não pode ficar vazia).
 */
async function buscarFraseDoDia() {
  if (!COLMEIA_API_URL) return;
  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "gerarFraseDoDia" }),
    });
    const data = await res.json();
    if (data.ok && data.frase) {
      const el = document.getElementById("loginFrase");
      if (el) el.textContent = data.frase;
    }
  } catch (err) {
    console.error("Falha ao buscar a frase do dia:", err);
  }
}

document.getElementById("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const senha = document.getElementById("loginSenha").value;
  const btn = document.getElementById("loginSubmit");
  const erroEl = document.getElementById("loginErro");
  erroEl.hidden = true;

  if (!senha) return;
  btn.disabled = true;

  try {
    const res = await fetch(COLMEIA_API_URL, {
      method: "POST",
      body: JSON.stringify({ acao: "login", senha }),
    });
    const data = await res.json();
    btn.disabled = false;

    if (!data.ok) {
      erroEl.textContent = data.error || "Não consegui entrar.";
      erroEl.hidden = false;
      return;
    }

    DESIGNER_LOGADO = data.nome;
    PAPEL_LOGADO = data.papel;
    salvarSessao(data.nome, data.papel);
    iniciarAppPosLogin();
  } catch (err) {
    console.error("Falha ao tentar logar:", err);
    btn.disabled = false;
    erroEl.textContent = "Falha de conexão. Tente de novo.";
    erroEl.hidden = false;
  }
});

// Se já tiver uma sessão salva nesse navegador, entra direto sem pedir
// senha de novo.
const sessaoSalva = lerSessaoSalva();
if (sessaoSalva && sessaoSalva.nome && sessaoSalva.papel) {
  DESIGNER_LOGADO = sessaoSalva.nome;
  PAPEL_LOGADO = sessaoSalva.papel;
  iniciarAppPosLogin();
} else {
  buscarFraseDoDia();
}
// Senão, a tela de login (já visível por padrão no HTML) fica esperando
// o formulário ser enviado — o resto acontece no listener do submit acima.
