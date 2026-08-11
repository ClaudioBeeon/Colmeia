/**
 * MONTAGEM DO FRONT-END — junta e comprime o que o navegador baixa.
 *
 * ---------------------------------------------------------------------
 * O PROBLEMA
 *
 * O navegador baixa 1,8 MB em 37 pedidos toda vez que alguém abre o
 * Colmeia: 29 arquivos de JavaScript e 8 de CSS, com todos os comentários
 * (que aqui são longos e valiosos) e todos os espaços. E o `?v=` que
 * evita cache velho troca em TODAS as tags de uma vez — corrigir uma
 * vírgula fazia cada designer rebaixar os 1,8 MB inteiros.
 *
 * ---------------------------------------------------------------------
 * O QUE ESTE SCRIPT NÃO MUDA
 *
 * O repositório. Os 29 arquivos continuam separados por assunto, com os
 * comentários todos, e o `index.html` continua listando um por um — é ele
 * que diz a ORDEM, e a ordem é lida daqui, nunca escrita à mão duas vezes.
 * O que muda é só o que é PUBLICADO: uma pasta `_site` montada na hora do
 * deploy, que nunca entra no repositório.
 *
 * ---------------------------------------------------------------------
 * ⚠️ POR QUE NÃO USAMOS UM "BUNDLER" DE VERDADE, NEM RENOMEAMOS NADA
 *
 * Duas armadilhas específicas deste projeto, as duas capazes de quebrar
 * produção em silêncio (lembrando que aqui não há revisão antes do
 * deploy):
 *
 * 1. OS ARQUIVOS COMPARTILHAM O MESMO ESPAÇO DE VARIÁVEIS. Tags <script>
 *    comuns são "como se fosse um arquivo só" (ver CLAUDE.md). Um bundler
 *    de verdade envolveria cada arquivo num escopo próprio, e aí
 *    `config.js` deixaria de enxergar o que `bee.js` declarou. Por isso
 *    aqui é CONCATENAÇÃO pura, na ordem exata das tags.
 *
 * 2. EXISTEM 18 HANDLERS ESCRITOS DENTRO DO HTML — coisas como
 *    onclick="buildAprovacaoPage(...)" e onerror="handleAvatarImgError(...)".
 *    Esses nomes vivem dentro de uma STRING: nenhum compressor os enxerga.
 *    Se ele renomeasse `handleAvatarImgError` pra `a`, o HTML continuaria
 *    chamando o nome velho e a foto quebrada deixaria de ter reserva —
 *    sem erro nenhum aparecendo em lugar nenhum.
 *
 *    Daí `minifyIdentifiers: false`. Perde-se uns 15% de compressão e
 *    ganha-se a certeza de que nada muda de comportamento. Como 34% do
 *    peso aqui é comentário, o grosso do ganho vem de graça mesmo assim.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");

const raiz = path.join(__dirname, "..", "..");
const saida = path.join(raiz, "_site");

// Tudo que vai pro ar além do que é montado aqui. As páginas soltas
// (aprovar/ajuste) não passam pela montagem de propósito: cada uma é um
// arquivo único e completo, feito pra abrir sem login e sem depender do
// resto do app.
const ARQUIVOS_SOLTOS = ["aprovar.html", "ajuste.html", "404.html", "CNAME", ".nojekyll"];

/** Os caminhos de js/ e css/ na ORDEM em que o index.html os carrega. */
function lerOrdemDoIndex(html) {
  const js = [...html.matchAll(/<script src="(js\/[^"?]+)[^"]*"><\/script>/g)].map(m => m[1]);
  const css = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)[^"]*">/g)].map(m => m[1]);
  return { js, css };
}

function juntar(arquivos) {
  return arquivos.map(rel => {
    const conteudo = fs.readFileSync(path.join(raiz, rel), "utf8");
    // O marcador sobrevive à compressão e é o que permite achar de qual
    // arquivo veio um trecho quando alguém for olhar o resultado.
    return `\n/* ===== ${rel} ===== */\n${conteudo}\n`;
  }).join("");
}

/** Os 8 primeiros caracteres do resumo do conteúdo — vira o nome do arquivo. */
function digital(texto) {
  return crypto.createHash("sha256").update(texto).digest("hex").slice(0, 8);
}

async function montar() {
  const htmlOriginal = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
  const { js, css } = lerOrdemDoIndex(htmlOriginal);
  if (!js.length || !css.length) {
    console.error("Não achei as tags de js/ ou css/ no index.html — abortando pra não publicar um site quebrado.");
    process.exit(1);
  }
  console.log(`Juntando ${js.length} arquivos de js/ e ${css.length} de css/.`);

  const jsCru = juntar(js);
  const cssCru = juntar(css);

  const jsMin = await esbuild.transform(jsCru, {
    loader: "js",
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false, // ver o aviso grande no topo — não negociável
    legalComments: "none"
  });
  const cssMin = await esbuild.transform(cssCru, { loader: "css", minify: true });

  // O nome carrega a digital do conteúdo: conteúdo novo = nome novo, então
  // o navegador nunca serve o velho por engano. É o que aposenta a regra
  // de trocar o `?v=` na mão em todas as tags a cada mudança.
  const nomeJs = `colmeia.${digital(jsMin.code)}.js`;
  const nomeCss = `colmeia.${digital(cssMin.code)}.css`;

  fs.rmSync(saida, { recursive: true, force: true });
  fs.mkdirSync(path.join(saida, "assets"), { recursive: true });
  fs.writeFileSync(path.join(saida, "assets", nomeJs), jsMin.code);
  fs.writeFileSync(path.join(saida, "assets", nomeCss), cssMin.code);

  // Troca as 37 tags por duas. A primeira tag de cada tipo vira a do
  // pacote; as outras somem.
  let html = htmlOriginal;
  let primeiroCss = true, primeiroJs = true;
  html = html.replace(/[ \t]*<link rel="stylesheet" href="css\/[^"]*">\n?/g, () => {
    if (primeiroCss) { primeiroCss = false; return `<link rel="stylesheet" href="assets/${nomeCss}">\n`; }
    return "";
  });
  html = html.replace(/[ \t]*<script src="js\/[^"]*"><\/script>\n?/g, () => {
    if (primeiroJs) { primeiroJs = false; return `<script src="assets/${nomeJs}"></script>\n`; }
    return "";
  });
  fs.writeFileSync(path.join(saida, "index.html"), html);

  ARQUIVOS_SOLTOS.forEach(nome => {
    const de = path.join(raiz, nome);
    if (fs.existsSync(de)) fs.copyFileSync(de, path.join(saida, nome));
  });
  // O .nojekyll pode não existir no repositório; sem ele o GitHub Pages
  // ignora pastas que começam com "_".
  fs.writeFileSync(path.join(saida, ".nojekyll"), "");

  const antes = Buffer.byteLength(jsCru) + Buffer.byteLength(cssCru);
  const depois = Buffer.byteLength(jsMin.code) + Buffer.byteLength(cssMin.code);
  console.log(`js+css: ${(antes / 1024).toFixed(0)} KB  ->  ${(depois / 1024).toFixed(0)} KB` +
    `  (${(100 - depois / antes * 100).toFixed(0)}% menor)`);
  console.log(`pedidos: ${js.length + css.length}  ->  2`);
  console.log(`Pronto em _site/ — assets/${nomeJs} e assets/${nomeCss}.`);
}

montar().catch(err => {
  console.error("A montagem falhou — nada foi publicado:", err);
  process.exit(1);
});
