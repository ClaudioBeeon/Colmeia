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
  "js/fila-offline.js",
  "js/notificacoes-uploads.js",
  "js/pessoas-fotos.js",
  "js/kanban-polling.js",
  "js/painel-pessoas-clientes.js",
  "js/regras-briefing.js",
  "js/kanban-board.js",
  "js/clientes-hub.js",
  "js/chat-comentarios.js",
  "js/detalhe-modal.js",
  "js/detalhe-cardmae.js",
  "js/detalhe-alteracao.js",
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

// Ordem das folhas de estilo. Em CSS, quando duas regras têm o mesmo peso,
// vence a que foi escrita depois — então trocar a ordem desses arquivos (ou
// esquecer de carregar um) muda a aparência do app sem dar erro nenhum.
const ORDEM_CSS_ESPERADA = [
  "css/01-base.css",
  "css/02-quadro.css",
  "css/03-detalhe.css",
  "css/04-paginas.css",
  "css/05-componentes.css",
];

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

// 4) Mesma checagem pras folhas de estilo.
const cssNoDisco = fs.readdirSync(path.join(raiz, "css"))
  .filter(nome => nome.endsWith(".css"))
  .map(nome => "css/" + nome)
  .sort();
const cssCarregados = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g)]
  .map(m => m[1])
  .filter(src => src.startsWith("css/"));

cssNoDisco.forEach(src => {
  if (!cssCarregados.includes(src)) {
    problemas.push(`O arquivo "${src}" existe mas NÃO está sendo carregado no index.html — os estilos dele não valem pra nada.`);
  }
});
cssCarregados.forEach(src => {
  if (!cssNoDisco.includes(src)) {
    problemas.push(`O index.html carrega "${src}", mas esse arquivo não existe na pasta css/.`);
  }
});
const cssOrdemBate = cssCarregados.length === ORDEM_CSS_ESPERADA.length
  && cssCarregados.every((src, i) => src === ORDEM_CSS_ESPERADA[i]);
if (!cssOrdemBate) {
  problemas.push(
    "A ordem das folhas de estilo no index.html está diferente da esperada.\n" +
    "  No index.html: " + cssCarregados.join(", ") + "\n" +
    "  Esperado:      " + ORDEM_CSS_ESPERADA.join(", ") + "\n" +
    "  Em CSS a ordem decide quem vence quando duas regras têm o mesmo peso, então\n" +
    "  isso muda a aparência do app. Se a mudança foi de propósito, atualize a lista\n" +
    "  ORDEM_CSS_ESPERADA neste arquivo."
  );
}

if (problemas.length) {
  console.error("Problemas encontrados no carregamento dos arquivos do frontend:\n");
  problemas.forEach(p => console.error(" - " + p + "\n"));
  process.exit(1);
}

console.log(`ok: ${carregadosDeJs.length} arquivos de js/ e ${cssCarregados.length} de css/ estão todos carregados no index.html, na ordem certa.`);
