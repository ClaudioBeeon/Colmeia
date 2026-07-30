/**
 * Confere se TODO arquivo .gs do repositório está liberado no .claspignore.
 *
 * Por que isso existe: o .claspignore ignora tudo por padrão e libera os
 * arquivos um por um. Se alguém criar um arquivo .gs novo e esquecer de
 * liberá-lo ali, o clasp simplesmente NÃO envia esse arquivo pro Apps
 * Script — e o deploy passa "com sucesso", sem erro nenhum, mas as funções
 * daquele arquivo não existem em produção. O sintoma é péssimo de
 * diagnosticar: o Colmeia começa a responder "função não definida" só em
 * algumas ações, e o código no GitHub parece perfeito.
 *
 * O contrário também é conferido: uma linha liberando um arquivo que não
 * existe mais (renomeado ou apagado) fica ali confundindo quem lê.
 */

const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..", "..");

const noDisco = fs.readdirSync(raiz).filter(nome => nome.endsWith(".gs")).sort();

const liberados = fs.readFileSync(path.join(raiz, ".claspignore"), "utf8")
  .split("\n")
  .map(linha => linha.trim())
  .filter(linha => linha.startsWith("!") && linha.endsWith(".gs"))
  .map(linha => linha.slice(1))
  .sort();

const problemas = [];

noDisco.forEach(arquivo => {
  if (!liberados.includes(arquivo)) {
    problemas.push(
      `O arquivo "${arquivo}" existe no repositório mas NÃO está liberado no .claspignore.\n` +
      `   Ele não seria enviado pro Apps Script, e as funções dele não existiriam em produção.\n` +
      `   Conserto: adicione a linha "!${arquivo}" no .claspignore.`
    );
  }
});

liberados.forEach(arquivo => {
  if (!noDisco.includes(arquivo)) {
    problemas.push(
      `O .claspignore libera "${arquivo}", mas esse arquivo não existe mais no repositório.\n` +
      `   Conserto: remova a linha "!${arquivo}" do .claspignore.`
    );
  }
});

// O Código.gs é especial: é o nome do arquivo que JÁ EXISTIA no projeto do
// Apps Script. Se ele desaparecer daqui, o clasp criaria um arquivo novo lá
// e as funções ficariam duplicadas (ver CLAUDE.md).
if (!noDisco.includes("Código.gs")) {
  problemas.push(
    'O arquivo "Código.gs" (com acento) não existe mais no repositório.\n' +
    "   Esse nome tem que ser mantido: é o nome real do arquivo dentro do projeto do\n" +
    "   Apps Script, e o clasp casa os arquivos pelo nome. Um nome diferente criaria um\n" +
    "   arquivo NOVO lá dentro e duplicaria as funções."
  );
}

if (problemas.length) {
  console.error("Problemas nos arquivos .gs do backend:\n");
  problemas.forEach(p => console.error(" - " + p + "\n"));
  process.exit(1);
}

console.log(`ok: os ${noDisco.length} arquivos .gs estão todos liberados no .claspignore (${noDisco.join(", ")}).`);
