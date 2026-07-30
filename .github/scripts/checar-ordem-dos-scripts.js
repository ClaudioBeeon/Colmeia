/**
 * Confere se o index.html continua carregando TODOS os arquivos da pasta
 * js/ e na ordem certa.
 *
 * Por que isso existe: o frontend do Colmeia não tem bundler nem npm — o
 * index.html carrega os arquivos com várias tags <script> seguidas, e a
 * ORDEM importa (um arquivo pode usar variáveis/funções de um arquivo
 * anterior, mas não de um posterior). É a "regra de ouro" do CLAUDE.md.
 * Dois acidentes fáceis de cometer e difíceis de perceber:
 *
 *   - criar um arquivo novo em js/ e esquecer de carregá-lo no index.html
 *     (o código simplesmente nunca roda, sem erro nenhum na tela);
 *   - apagar/renomear um arquivo e deixar a tag <script> apontando pro
 *     nome antigo (aí dá erro em TODA abertura do app).
 *
 * Se um dia a ordem precisar mudar de verdade, é só atualizar a lista
 * ORDEM_ESPERADA aqui embaixo junto com o index.html e o CLAUDE.md — os
 * três têm que contar a mesma história.
 */

const fs = require("fs");
const path = require("path");

// Ordem documentada no CLAUDE.md, seção "Estrutura do frontend (js/)".
const ORDEM_ESPERADA = [
  "js/config.js",
  "js/notificacoes-uploads.js",
  "js/pessoas-fotos.js",
  "js/kanban-polling.js",
  "js/painel-pessoas-clientes.js",
  "js/regras-briefing.js",
  "js/kanban-board.js",
  "js/clientes-hub.js",
  "js/chat-comentarios.js",
  "js/detalhe-modal.js",
  "js/paginas-designers.js",
  "js/pagina-tipos-runrun.js",
  "js/pagina-repasse.js",
  "js/notificacoes-avisos.js",
  "js/login-boot.js",
];

const raiz = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");

// Pega, em ordem, todo src="js/..." das tags <script> do index.html.
const carregados = [...html.matchAll(/<script\s+src="([^"]+)"\s*>/g)].map(m => m[1]);
const noDisco = fs.readdirSync(path.join(raiz, "js"))
  .filter(nome => nome.endsWith(".js"))
  .map(nome => "js/" + nome)
  .sort();

const problemas = [];

// 1) Tag apontando pra arquivo que não existe mais.
carregados.forEach(src => {
  if (src.startsWith("js/") && !noDisco.includes(src)) {
    problemas.push(`O index.html carrega "${src}", mas esse arquivo não existe na pasta js/.`);
  }
});

// 2) Arquivo em js/ que ninguém carrega (código que nunca roda).
noDisco.forEach(src => {
  if (!carregados.includes(src)) {
    problemas.push(`O arquivo "${src}" existe mas NÃO está sendo carregado no index.html — o código dele nunca roda.`);
  }
});

// 3) Ordem diferente da documentada.
const carregadosDeJs = carregados.filter(src => src.startsWith("js/"));
const ordemBate = carregadosDeJs.length === ORDEM_ESPERADA.length
  && carregadosDeJs.every((src, i) => src === ORDEM_ESPERADA[i]);
if (!ordemBate) {
  problemas.push(
    "A ordem das tags <script> no index.html está diferente da ordem documentada no CLAUDE.md.\n" +
    "  No index.html: " + carregadosDeJs.join(", ") + "\n" +
    "  Esperado:      " + ORDEM_ESPERADA.join(", ") + "\n" +
    "  Se a mudança foi de propósito, atualize também a lista ORDEM_ESPERADA em\n" +
    "  .github/scripts/checar-ordem-dos-scripts.js e a seção correspondente do CLAUDE.md."
  );
}

if (problemas.length) {
  console.error("Problemas encontrados no carregamento dos arquivos de js/:\n");
  problemas.forEach(p => console.error(" - " + p + "\n"));
  process.exit(1);
}

console.log(`ok: os ${carregadosDeJs.length} arquivos de js/ estão todos carregados no index.html, na ordem certa.`);
