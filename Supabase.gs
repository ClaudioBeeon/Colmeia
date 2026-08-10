// ============================================================
// SUPABASE — o banco de dados de verdade, entrando aos poucos
// ============================================================
//
// POR QUE ISSO EXISTE
//
// Toda gravação na planilha passa por LockService.getScriptLock()
// (`pegarTravaDaPlanilha`, Planilha.gs) — e essa trava NÃO é da linha,
// nem da aba: é do script INTEIRO. Enquanto alguém grava um comentário,
// mais ninguém no Colmeia consegue gravar nada, nem coisa sem relação
// nenhuma (uma prioridade e uma resposta de aprovação disputam a mesma
// fila). Com o time crescendo, é esse o ponto que dói primeiro.
//
// A saída é um banco de verdade (PostgreSQL, hospedado no Supabase, de
// graça no volume do Colmeia), onde duas gravações em linhas diferentes
// simplesmente não se esbarram.
//
// O QUE ESTE ARQUIVO **NÃO** MUDA — de propósito
//
// - O front-end. Nenhuma linha de js/*.js precisa mudar: quem chama o
//   backend continua chamando `chamarBackend({acao: ...})` do mesmo jeito.
// - As rotas do Código.gs. As mesmas ações, os mesmos nomes.
// - O Runrun.it, que continua sendo o dono das tarefas.
// - As abas de cadastro (LinksClientes, Pessoas, AcessoRapido...), que
//   quase não têm escrita concorrente e valem mais como planilha mesmo —
//   dá pra abrir e editar uma linha na mão quando precisa.
//
// Só o MIOLO das funções que gravam muito troca de lugar de guardar.
//
// COMO A TROCA ACONTECE, UMA ABA POR VEZ
//
// A propriedade de script `SUPABASE_TABELAS` lista quais tabelas já
// mandam no Supabase, separadas por vírgula (ex: "feed_eventos").
// `supabaseManda('feed_eventos')` é quem responde essa pergunta.
//
//   1. tabela FORA da lista → grava nos DOIS lugares, lê da planilha.
//      (fase de conferência: dá pra comparar os dois lados sem risco)
//   2. tabela DENTRO da lista → lê do Supabase; a planilha vira cópia.
//
// Trocar de fase é editar UMA propriedade no Apps Script — não é deploy,
// não é push, e voltar atrás é tirar o nome da lista. Se o Supabase cair,
// a planilha continua tendo tudo.
//
// ONDE FICAM AS CHAVES
//
// Em Configurações do projeto → Propriedades do script, igual às chaves
// do Runrun.it/Gemini que já moram lá:
//
//   SUPABASE_URL       https://xxxxxxxx.supabase.co  (Settings → Data API)
//   SUPABASE_KEY       a chave `service_role` — Settings → API Keys, aba
//                      "Legacy anon, service_role API keys". Começa com eyJ.
//   SUPABASE_TABELAS   (começa vazia)
//
// ⚠️ TEM QUE SER A CHAVE LEGADA, e isso é contra-intuitivo (2026-08-10).
//
// O Supabase hoje oferece primeiro as chaves NOVAS (`sb_secret_...` e
// `sb_publishable_...`), e a legada fica escondida numa segunda aba. Só
// que a chave nova é RECUSADA aqui:
//
//   401 — "Forbidden use of secret API key in browser"
//
// Ela se protege barrando pedido com cara de navegador, e o Apps Script
// se identifica assim (o UrlFetchApp manda um User-Agent de navegador, e
// não deixa esse cabeçalho ser trocado). Ou seja: não é configuração
// errada nem falta de permissão — é uma checagem que o Apps Script não
// tem como passar. A chave `service_role` legada não faz essa checagem e
// continua sendo suportada; é a certa pra um backend como este.
//
// A chave `anon`/`publishable` também NÃO serve, por outro motivo: ela é
// feita pra viver no navegador e respeita as regras de permissão do
// banco — como nenhuma tabela nossa tem policy de propósito, ela não
// conseguiria ler nem gravar nada.
//
// ⚠️ A service_role passa por cima de qualquer regra de permissão do
// banco. Ela pode viver aqui porque o Apps Script roda no servidor do
// Google e ninguém de fora lê essas propriedades. Ela NUNCA pode ir
// parar em js/config.js nem em qualquer arquivo do front-end, que é
// público — quem abrisse o Colmeia veria a chave e teria o banco todo.

var SUPABASE_URL = PropertiesService.getScriptProperties().getProperty('SUPABASE_URL');
var SUPABASE_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY');

/** Já dá pra falar com o Supabase? (as duas chaves preenchidas) */
function supabaseConfigurado() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Essa tabela já é a fonte de verdade, ou ainda está em conferência?
 * Lê a propriedade toda vez (é barato e fica em cache do próprio Apps
 * Script) pra que ligar/desligar uma tabela tenha efeito na hora, sem
 * precisar de um deploy novo.
 */
function supabaseManda(tabela) {
  if (!supabaseConfigurado()) return false;
  var lista = PropertiesService.getScriptProperties().getProperty('SUPABASE_TABELAS') || '';
  return lista.split(',').map(function (s) { return s.trim(); }).indexOf(tabela) !== -1;
}

/**
 * A chamada crua. Todo o resto deste arquivo passa por aqui.
 *
 * Devolve sempre { ok, dados, erro } e NUNCA estoura — mesmo contrato do
 * `chamarBackend` do front-end, e pelo mesmo motivo: quem chama precisa
 * poder decidir o que fazer quando não deu, em vez de derrubar a ação
 * inteira que o usuário pediu.
 */
function supabaseFetch(caminho, metodo, corpo, cabecalhosExtras) {
  if (!supabaseConfigurado()) {
    return { ok: false, erro: 'Supabase não configurado (falta SUPABASE_URL ou SUPABASE_KEY).' };
  }
  var cabecalhos = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (cabecalhosExtras) {
    for (var k in cabecalhosExtras) cabecalhos[k] = cabecalhosExtras[k];
  }
  var opcoes = {
    method: metodo || 'get',
    headers: cabecalhos,
    muteHttpExceptions: true
  };
  if (corpo !== undefined && corpo !== null) opcoes.payload = JSON.stringify(corpo);

  try {
    var resposta = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + caminho, opcoes);
    var codigo = resposta.getResponseCode();
    var texto = resposta.getContentText();
    if (codigo < 200 || codigo >= 300) {
      return { ok: false, erro: 'Supabase respondeu ' + codigo + ': ' + texto };
    }
    var dados = null;
    if (texto) {
      try { dados = JSON.parse(texto); } catch (e) { dados = null; }
    }
    return { ok: true, dados: dados };
  } catch (e) {
    // Rede fora, Supabase fora, prazo estourado. Não é erro de quem chamou.
    return { ok: false, erro: 'Não consegui falar com o Supabase: ' + e };
  }
}

/**
 * Insere uma ou várias linhas.
 * `Prefer: return=minimal` pede pro banco NÃO devolver o que foi gravado —
 * é resposta menor e mais rápida, e aqui ninguém precisa do retorno.
 */
function supabaseInserir(tabela, linhas) {
  var corpo = Array.isArray(linhas) ? linhas : [linhas];
  return supabaseFetch(tabela, 'post', corpo, { 'Prefer': 'return=minimal' });
}

/**
 * Busca linhas. `filtros` é o pedaço de query do PostgREST, escrito do
 * jeito que ele entende — ex:
 *   "select=*&dono_norm=eq.laura&quando=gte.123&order=quando.desc"
 * Isso é o equivalente do "onde a coluna X é Y" que a planilha nunca
 * teve: aqui o banco filtra e ordena, em vez de o Apps Script ler a aba
 * inteira e varrer num laço.
 */
function supabaseBuscar(tabela, filtros) {
  return supabaseFetch(tabela + '?' + (filtros || 'select=*'), 'get');
}

/** Atualiza as linhas que casarem com o filtro (mesmo formato do buscar). */
function supabaseAtualizar(tabela, filtros, dados) {
  return supabaseFetch(tabela + '?' + filtros, 'patch', dados, { 'Prefer': 'return=minimal' });
}

/**
 * Grava por CHAVE: se a linha já existe, sobrescreve; se não, cria.
 * É o "salvar" da planilha (procurar a linha, senão appendRow) em uma
 * chamada só. Exige que a tabela tenha um índice único na coluna-chave.
 */
function supabaseSalvar(tabela, linhas) {
  var corpo = Array.isArray(linhas) ? linhas : [linhas];
  return supabaseFetch(tabela, 'post', corpo, {
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  });
}

/** Apaga as linhas que casarem com o filtro (mesmo formato do buscar). */
function supabaseApagar(tabela, filtros) {
  return supabaseFetch(tabela + '?' + filtros, 'delete', null, { 'Prefer': 'return=minimal' });
}

/**
 * Teste de bancada. Rodar direto no editor do Apps Script (escolher esta
 * função e clicar em Executar) pra confirmar que as chaves estão certas
 * ANTES de ligar qualquer tabela na lista. O resultado aparece no
 * "Registro de execução".
 */
function testarSupabase() {
  if (!supabaseConfigurado()) {
    Logger.log('❌ Faltam as propriedades SUPABASE_URL e/ou SUPABASE_KEY.');
    return;
  }
  var r = supabaseBuscar('feed_eventos', 'select=id&limit=1');
  if (r.ok) {
    Logger.log('✅ Falei com o Supabase e a tabela feed_eventos existe.');
  } else {
    Logger.log('❌ ' + r.erro);
    // Traduz o erro mais provável de acontecer na primeira configuração,
    // que é o que menos parece com o que realmente é (ver o aviso grande
    // no topo deste arquivo).
    if (r.erro.indexOf('in browser') !== -1 || r.erro.indexOf('secret API key') !== -1) {
      Logger.log('   ↳ Essa é a chave NOVA (sb_secret_...), que o Apps Script não consegue usar.');
      Logger.log('   ↳ Conserto: Settings → API Keys → aba "Legacy anon, service_role API keys"');
      Logger.log('     → copiar a chave service_role (começa com eyJ) e pôr em SUPABASE_KEY.');
    } else if (r.erro.indexOf('does not exist') !== -1 || r.erro.indexOf('PGRST205') !== -1) {
      Logger.log('   ↳ A conexão funcionou, mas a tabela ainda não existe.');
      Logger.log('   ↳ Conserto: rodar supabase/01-feed-eventos.sql no SQL Editor do Supabase.');
    }
  }
  Logger.log('Tabelas mandando no Supabase agora: "' +
    (PropertiesService.getScriptProperties().getProperty('SUPABASE_TABELAS') || '(nenhuma)') + '"');
}
