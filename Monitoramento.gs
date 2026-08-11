/**
 * MONITORAMENTO — saber quando o Colmeia quebra, e quais telas são usadas.
 *
 * ---------------------------------------------------------------------
 * O PROBLEMA QUE ISSO RESOLVE
 *
 * O front-end já capturava erro há tempos (`registrarNoDiagnostico`,
 * js/config.js): erro de console, erro de programação solto e promessa
 * rejeitada, tudo anotado — mas guardado no `localStorage`, ou seja, **no
 * navegador daquela pessoa**. Se o quadro quebrava pra uma designer numa
 * terça de manhã e ela dava F5 e seguia, isso nunca chegava em ninguém.
 *
 * Isso é especialmente arriscado no Colmeia porque não existe revisão
 * antes do deploy: todo push vai direto pra produção, e a única rede é a
 * checagem de sintaxe — que pega erro de digitação, nunca erro de lógica.
 *
 * A metade difícil já estava pronta. Este arquivo só recebe o que já era
 * capturado e guarda num lugar que você consegue olhar.
 * ---------------------------------------------------------------------
 *
 * O PRIMEIRO RECURSO QUE NASCE DIRETO NO BANCO
 *
 * Não tem aba de planilha nenhuma, e por isso não tem
 * `pegarTravaDaPlanilha`: são as duas gravações mais frequentes que o
 * Colmeia pode ter (todo erro de todo mundo, toda troca de tela) e seria
 * um contrassenso pô-las na fila que a migração inteira serviu pra
 * esvaziar. Se o Supabase não estiver configurado, nada é anotado e nada
 * quebra — monitoramento é um extra, nunca pode derrubar o que está sendo
 * monitorado.
 *
 * PRIVACIDADE, de propósito: guarda QUEM (o nome que já aparece em todo
 * card) e QUAL TELA. Não guarda o que a pessoa digitou, nem conteúdo de
 * tarefa, nem endereço de rede. Isso aqui existe pra achar defeito e
 * decidir o que melhorar — não pra saber o que cada um está fazendo.
 */

var ERROS_RETENCAO_DIAS = 30;
var USO_RETENCAO_DIAS = 90;

/**
 * Anota um erro que aconteceu no navegador de alguém.
 * Nunca estoura: quem chama é uma tela que já está com problema.
 */
function registrarErroDoApp(dados) {
  dados = dados || {};
  if (!supabaseConfigurado()) return { ok: true, guardado: false };
  if (!dados.mensagem) return { ok: false, error: 'sem mensagem.' };

  var r = supabaseInserir('erros', {
    quando: new Date().getTime(),
    designer: String(dados.designer || '(sem login)').slice(0, 80),
    tipo: String(dados.tipo || 'erro').slice(0, 30),
    // 800 é o mesmo corte que o painel de diagnóstico já usa no navegador.
    mensagem: String(dados.mensagem).slice(0, 800),
    // Onde a pessoa estava quando quebrou — vale mais que a linha do
    // arquivo pra reproduzir o problema.
    tela: String(dados.tela || '').slice(0, 80),
    navegador: String(dados.navegador || '').slice(0, 200)
  });
  return { ok: true, guardado: !!r.ok };
}

/**
 * Anota que uma tela foi aberta. É o que responde "vale a pena melhorar
 * isso, ou já é hora de tirar?" — uma página que ninguém abre há um mês é
 * código que se mantém de graça.
 */
function registrarTelaAberta(dados) {
  dados = dados || {};
  if (!supabaseConfigurado()) return { ok: true, guardado: false };
  if (!dados.tela) return { ok: false, error: 'sem tela.' };

  var r = supabaseInserir('uso_telas', {
    quando: new Date().getTime(),
    designer: String(dados.designer || '(sem login)').slice(0, 80),
    tela: String(dados.tela).slice(0, 80)
  });
  return { ok: true, guardado: !!r.ok };
}

/**
 * Os erros recentes de TODO MUNDO, pro painel de diagnóstico
 * (Ctrl+Shift+D) — que até aqui só mostrava os do próprio navegador.
 */
function listarErrosRecentes(limite) {
  if (!supabaseConfigurado()) {
    return { ok: false, error: 'O monitoramento ainda não está ligado (falta configurar o Supabase).' };
  }
  var quantos = Math.min(Number(limite) || 50, 200);
  var r = supabaseBuscar('erros', 'select=*&order=quando.desc&limit=' + quantos);
  if (!r.ok) return { ok: false, error: r.erro };
  return {
    ok: true,
    erros: (r.dados || []).map(function (e) {
      return {
        quando: Number(e.quando) || 0,
        designer: String(e.designer || ''),
        tipo: String(e.tipo || ''),
        mensagem: String(e.mensagem || ''),
        tela: String(e.tela || ''),
        navegador: String(e.navegador || '')
      };
    })
  };
}

/**
 * O ranking de telas de um período — quantas aberturas e quantas pessoas
 * diferentes abriram cada uma.
 *
 * "Quantas PESSOAS" existe separado de propósito: uma tela aberta 200
 * vezes por uma pessoa só e uma aberta 200 vezes por seis pessoas contam
 * histórias opostas, e a segunda é a que diz que a tela virou hábito do
 * time.
 */
function listarUsoDasTelas(dias) {
  if (!supabaseConfigurado()) {
    return { ok: false, error: 'O monitoramento ainda não está ligado (falta configurar o Supabase).' };
  }
  var janela = Math.min(Number(dias) || 30, USO_RETENCAO_DIAS);
  var corte = new Date().getTime() - janela * 24 * 60 * 60 * 1000;

  var linhas = supabaseBuscarTudo('uso_telas', 'select=tela,designer&quando=gte.' + corte);
  if (linhas === null) return { ok: false, error: 'Não consegui ler o uso das telas.' };

  var porTela = {};
  linhas.forEach(function (l) {
    var tela = String(l.tela || '');
    if (!porTela[tela]) porTela[tela] = { tela: tela, aberturas: 0, pessoas: {} };
    porTela[tela].aberturas++;
    porTela[tela].pessoas[String(l.designer || '')] = true;
  });

  var lista = Object.keys(porTela).map(function (k) {
    return {
      tela: porTela[k].tela,
      aberturas: porTela[k].aberturas,
      pessoas: Object.keys(porTela[k].pessoas).length
    };
  });
  lista.sort(function (a, b) { return b.aberturas - a.aberturas; });
  return { ok: true, dias: janela, telas: lista };
}

/**
 * Poda as duas tabelas. Roda junto do backup diário, no mesmo lugar das
 * outras limpezas. No banco isso é um comando por tabela — nada de
 * apagar linha por linha de trás pra frente, que é como a planilha
 * precisava fazer.
 */
function limparMonitoramentoAntigo() {
  if (!supabaseConfigurado()) return;
  var agora = new Date().getTime();
  supabaseApagar('erros', 'quando=lt.' + (agora - ERROS_RETENCAO_DIAS * 24 * 60 * 60 * 1000));
  supabaseApagar('uso_telas', 'quando=lt.' + (agora - USO_RETENCAO_DIAS * 24 * 60 * 60 * 1000));
}
