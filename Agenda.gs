/**
 * Google Agenda: as reuniões de hoje de cada designer e a resposta de
 * convite (aceitar/recusar) direto pelo Colmeia.
 *
 * ---------------------------------------------------------------------
 * Faz parte do backend do Colmeia, que era um Código.gs único de ~3.000
 * linhas e foi dividido por assunto. TODOS os arquivos .gs do projeto do
 * Apps Script compartilham o mesmo espaço de nomes — é como se ainda fosse
 * um arquivo só, então qualquer função aqui pode ser chamada de qualquer
 * outro arquivo, sem "importar" nada. As rotas (quem responde a qual ação
 * do Colmeia) continuam todas no Código.gs.
 * ---------------------------------------------------------------------
 */
// ============ GOOGLE AGENDA ============

/**
 * Devolve as reuniões de hoje (a partir de agora) do designer informado.
 * Funciona porque o Web App roda com a conta de quem implantou (ver
 * "executeAs": "USER_DEPLOYING" no appsscript.json) — como essa conta
 * corporativa já enxerga a agenda de todo mundo, CalendarApp.getCalendarById
 * consegue ler o calendário de qualquer designer sem precisar de login
 * separado de cada um. Se for a PRIMEIRA vez que o projeto usa
 * CalendarApp, é preciso abrir o editor do Apps Script e rodar essa
 * função uma vez manualmente pra autorizar o escopo novo (Agenda) —
 * depois disso o Web App já implantado passa a funcionar sozinho.
 */
function buscarReunioesDeHoje(designer) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var email = null;
  for (var e in RUNRUN_USUARIOS) {
    if (RUNRUN_USUARIOS[e].toLowerCase().trim() === designer.toLowerCase().trim()) { email = e; break; }
  }
  if (!email) return { ok: false, error: 'E-mail desse designer não configurado em RUNRUN_USUARIOS.' };

  try {
    var agenda = CalendarApp.getCalendarById(email);
    if (!agenda) return { ok: false, error: 'Não consegui acessar a agenda de ' + designer + '.' };

    var agora = new Date();
    var fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59);
    var eventos = agenda.getEvents(agora, fimDoDia);

    var reunioes = eventos
      .filter(function (ev) { return !ev.isAllDayEvent(); })
      .map(function (ev) {
        var criadores = ev.getCreators();
        var organizadorEmail = (criadores && criadores.length) ? criadores[0] : '';
        return {
          id: ev.getId(),
          titulo: ev.getTitle(),
          inicio: ev.getStartTime().getTime(),
          fim: ev.getEndTime().getTime(),
          local: ev.getLocation() || '',
          link: extrairLinkDaReuniao(ev),
          organizador: organizadorEmail,
          organizadorNome: RUNRUN_USUARIOS[organizadorEmail] || organizadorEmail,
          meuStatus: ev.getMyStatus() ? ev.getMyStatus().toString() : ''
        };
      });

    return { ok: true, reunioes: reunioes };
  } catch (err) {
    return { ok: false, error: 'Erro ao ler a agenda: ' + err.message };
  }
}

/**
 * Aceita ou recusa um convite de reunião direto pelo Colmeia (sem
 * precisar abrir o Google Agenda) — usado pelos botões da notificação
 * "Nova reunião" (ver verificarReunioesProximas, js/notificacoes-avisos.js).
 */
function responderReuniao(designer, eventId, resposta) {
  if (!designer || !eventId) return { ok: false, error: 'Parâmetros faltando.' };
  var email = null;
  for (var e in RUNRUN_USUARIOS) {
    if (RUNRUN_USUARIOS[e].toLowerCase().trim() === designer.toLowerCase().trim()) { email = e; break; }
  }
  if (!email) return { ok: false, error: 'E-mail desse designer não configurado em RUNRUN_USUARIOS.' };
  try {
    var agenda = CalendarApp.getCalendarById(email);
    if (!agenda) return { ok: false, error: 'Não consegui acessar a agenda de ' + designer + '.' };
    var evento = agenda.getEventById(eventId);
    if (!evento) return { ok: false, error: 'Não achei esse evento na agenda (pode ter sido cancelado).' };
    evento.setMyStatus(resposta === 'sim' ? CalendarApp.GuestStatus.YES : CalendarApp.GuestStatus.NO);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Erro ao responder o convite: ' + err.message };
  }
}

// O Apps Script não tem um jeito direto de pegar o link do Meet/Zoom de
// um evento (isso só vem pela API avançada do Calendar) — como
// alternativa simples, procura por um link conhecido na descrição ou no
// campo de local do evento (o Google já cola o link do Meet ali quando
// a reunião é criada com videochamada).
function extrairLinkDaReuniao(ev) {
  var texto = (ev.getDescription() || '') + ' ' + (ev.getLocation() || '');
  var match = texto.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i)
    || texto.match(/https:\/\/[a-z0-9.-]*zoom\.us\/\S+/i);
  return match ? match[0] : '';
}

// ============ TIMESHEET (horas trabalhadas por dia) ============
//
// A tela "Tempo" do Runrun.it (runrun.it/pt-BR/me/timesheet) mostra as
// horas trabalhadas DIA A DIA e trava o lançamento quando alguém esquece
// o play ou não trabalha. O Colmeia já sabia o tempo trabalhado TOTAL de
// cada tarefa, mas nunca a quebra por dia — que é justamente o que essa
// tela usa.
//
// IMPORTANTE: qual endereço da API entrega esse dado ainda NÃO está
// confirmado. Rode diagnosticoTimesheet() uma vez pelo editor do Apps
// Script e mande o log — é só LEITURA, não altera nada. Enquanto isso não
// for confirmado, buscarHorasDaSemana devolve `semFonte: true` e o
// front-end mostra "conectando" em vez de inventar número.

/**
 * Rodada 3 — agora que sabemos que a fonte é /work_periods, esta rodada
 * responde COMO pedir só o pedaço certo, em vez de varrer tudo.
 *
 * Três perguntas:
 *   1. O `sortDir` funciona? (compara o 1º registro com asc e com desc)
 *   2. O `page` funciona? (compara a página 1 com a página 2)
 *   3. Existe algum nome de filtro de data que funcione? (testa 6 pares
 *      de nomes e confere se o resultado REALMENTE respeitou a janela)
 *
 * SÓ LEITURA.
 *
 * Como rodar: no editor do Apps Script, escolha "diagnosticoTimesheet" no
 * seletor ao lado de "Executar", clique em Executar, e copie o log.
 */
function diagnosticoTimesheet() {
  var meuId = idDoUsuarioRunrunPorNome('Cláudio');
  var hoje = new Date();
  var segunda = segundaFeiraDaSemana(hoje);
  var iniISO = Utilities.formatDate(segunda, 'America/Sao_Paulo', 'yyyy-MM-dd');
  var fimISO = Utilities.formatDate(new Date(segunda.getTime() + 6 * 86400000), 'America/Sao_Paulo', 'yyyy-MM-dd');

  Logger.log('=== DIAGNÓSTICO /work_periods — RODADA 3 ===');
  Logger.log('id: ' + meuId + ' | semana desta tela: ' + iniISO + ' a ' + fimISO);
  Logger.log('');

  function resumir(rotulo, caminho) {
    var lote = runrunFetch(caminho);
    if (!Array.isArray(lote)) { Logger.log('❌ ' + rotulo + ' — não veio lista'); return null; }
    if (!lote.length) { Logger.log('⚪ ' + rotulo + ' — veio VAZIO'); return lote; }
    var datas = lote.map(function (b) { return b.start ? String(b.start).substring(0, 10) : '?'; });
    var ordenadas = datas.slice().sort();
    Logger.log('   ' + rotulo);
    Logger.log('      qtd=' + lote.length +
               ' | 1º=' + datas[0] + ' | último=' + datas[datas.length - 1] +
               ' | mais antigo=' + ordenadas[0] + ' | mais novo=' + ordenadas[ordenadas.length - 1]);
    Logger.log('      1º id=' + lote[0].id);
    return lote;
  }

  Logger.log('--- 1) O sortDir funciona? ---');
  var asc = resumir('sortDir=asc ', '/work_periods?user_id=' + meuId + '&sort=start&sortDir=asc&limit=100');
  var desc = resumir('sortDir=desc', '/work_periods?user_id=' + meuId + '&sort=start&sortDir=desc&limit=100');
  if (asc && desc && asc.length && desc.length) {
    Logger.log(asc[0].id === desc[0].id
      ? '   >>> IGUAIS: o sortDir é IGNORADO.'
      : '   >>> DIFERENTES: o sortDir FUNCIONA.');
  }

  Logger.log('');
  Logger.log('--- 2) O page funciona? ---');
  var p1 = resumir('page=1', '/work_periods?user_id=' + meuId + '&limit=100&page=1');
  var p2 = resumir('page=2', '/work_periods?user_id=' + meuId + '&limit=100&page=2');
  if (p1 && p2 && p1.length && p2.length) {
    Logger.log(p1[0].id === p2[0].id
      ? '   >>> IGUAIS: o page é IGNORADO (cuidado com laço infinito).'
      : '   >>> DIFERENTES: o page FUNCIONA.');
  }

  Logger.log('');
  Logger.log('--- 3) Algum filtro de data funciona? ---');
  Logger.log('    (só vale se TODAS as datas ficarem dentro de ' + iniISO + '..' + fimISO + ')');
  var pares = [
    ['start_date/end_date', 'start_date=' + iniISO + '&end_date=' + fimISO],
    ['from/to', 'from=' + iniISO + '&to=' + fimISO],
    ['since/until', 'since=' + iniISO + '&until=' + fimISO],
    ['start_at/end_at', 'start_at=' + iniISO + '&end_at=' + fimISO],
    ['start/end', 'start=' + iniISO + '&end=' + fimISO],
    ['date_from/date_to', 'date_from=' + iniISO + '&date_to=' + fimISO]
  ];
  pares.forEach(function (par) {
    var lote = runrunFetch('/work_periods?user_id=' + meuId + '&limit=100&' + par[1]);
    if (!Array.isArray(lote)) { Logger.log('   ❌ ' + par[0] + ' — não veio lista'); return; }
    if (!lote.length) { Logger.log('   ⚪ ' + par[0] + ' — vazio'); return; }
    var fora = lote.filter(function (b) {
      var d = b.start ? String(b.start).substring(0, 10) : '';
      return d < iniISO || d > fimISO;
    }).length;
    Logger.log((fora === 0 ? '   ✅ ' : '   ❌ ') + par[0] +
               ' — qtd=' + lote.length + ', fora da janela=' + fora +
               (fora === 0 ? '  <<< ESSE FUNCIONA' : ''));
  });

  Logger.log('');
  Logger.log('--- 4) Tem hora lançada nesta semana? ---');
  var daSemana = buscarBlocosDeTrabalho(meuId, iniISO, fimISO);
  if (daSemana === null) {
    Logger.log('   não consegui ler.');
  } else {
    var soma = 0;
    daSemana.forEach(function (b) { soma += Number(b.worked_time) || 0; });
    Logger.log('   blocos achados: ' + daSemana.length + ' | total: ' + Math.round(soma / 3600 * 100) / 100 + 'h');
    if (daSemana.length) Logger.log('   exemplo: ' + JSON.stringify(daSemana[0]));
  }

  Logger.log('');
  Logger.log('=== FIM. Copie TUDO acima e mande pro Claude. ===');
}

/**
 * Horas trabalhadas por dia, na semana pedida.
 *
 * FONTE CONFIRMADA (diagnóstico de 2026-08-01): /work_periods. Cada item
 * é um bloco de trabalho:
 *   {id, task_id, start, end, user_id, worked_time}
 * — exatamente o que a aba "Tempo" do Runrun.it soma pra montar o gráfico
 * dela. Somando os blocos por dia, chegamos no mesmo número.
 *
 * `inicioISO` é a segunda-feira da semana (AAAA-MM-DD). Devolve sempre os
 * 7 dias, de segunda a domingo, mesmo os sem trabalho — a tela desenha
 * uma coluna por dia e precisa que a lista tenha tamanho fixo.
 */
function buscarHorasDaSemana(designer, inicioISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };

  var userId = idDoUsuarioRunrunPorNome(designer);
  if (!userId) return { ok: false, error: 'Não achei o id de ' + designer + ' no Runrun.it.' };

  var dias = montarSemanaVazia(inicioISO);
  var primeiroDia = dias[0].data;
  var ultimoDia = dias[dias.length - 1].data;

  var chaveCache = 'workPeriods_' + userId + '_' + primeiroDia;
  var cache = CacheService.getScriptCache();
  var cacheado = cache.get(chaveCache);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* busca de novo abaixo */ }
  }

  var blocos = buscarBlocosDeTrabalho(userId, primeiroDia, ultimoDia);
  if (blocos === null) {
    return { ok: false, error: 'Não consegui ler as horas no Runrun.it agora.' };
  }

  // Soma por dia. O `start` já vem com o fuso (-03:00), então formatar por
  // America/Sao_Paulo devolve o dia certo sem conta de fuso na mão.
  var porDia = {};
  blocos.forEach(function (b) {
    if (!b.start) return;
    var diaDoBloco = Utilities.formatDate(new Date(b.start), 'America/Sao_Paulo', 'yyyy-MM-dd');
    porDia[diaDoBloco] = (porDia[diaDoBloco] || 0) + (Number(b.worked_time) || 0);
  });

  var hojeISO = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  dias.forEach(function (d) {
    d.segundos = porDia[d.data] || 0;
    // "Travado" aqui é uma LEITURA NOSSA, não algo que a API diga: dia de
    // semana já passado e sem nenhuma hora lançada é exatamente o caso que
    // o Runrun.it bloqueia até ser justificado. Fim de semana não conta.
    var diaDaSemana = new Date(d.data + 'T12:00:00-03:00').getDay();
    var ehFimDeSemana = (diaDaSemana === 0 || diaDaSemana === 6);
    d.travado = (!ehFimDeSemana && d.data < hojeISO && d.segundos === 0);
  });

  var resposta = { ok: true, dias: dias, blocos: blocos };
  // 5 minutos: curto o bastante pra um lançamento novo aparecer logo, longo
  // o bastante pra trocar de semana e voltar não custar outra varredura.
  try { cache.put(chaveCache, JSON.stringify(resposta), 300); } catch (e) { /* segue sem guardar */ }
  return resposta;
}

/**
 * Busca os blocos de trabalho de alguém numa janela de datas.
 *
 * Manda os parâmetros de data (caso a API os aceite) MAS peneira de novo
 * aqui dentro de qualquer jeito — na amostra do diagnóstico vieram blocos
 * de fora da janela pedida, sinal de que ela pode ignorar esses
 * parâmetros. Peneirar dos dois lados dá o resultado certo nos dois casos.
 *
 * Vira página até sair da janela, ordenando do mais novo pro mais velho —
 * mesmo padrão já usado pras tarefas (o Runrun.it não tem filtro de data
 * confiável, então pede-se ordenado e para assim que passa do corte).
 */
function buscarBlocosDeTrabalho(userId, primeiroDia, ultimoDia) {
  var corteInicio = new Date(primeiroDia + 'T00:00:00-03:00').getTime();
  var corteFim = new Date(ultimoDia + 'T23:59:59-03:00').getTime();

  var encontrados = [];
  var jaPeguei = {};              // id -> true, evita repetir se a página não avançar
  var assinaturaAnterior = '';
  var ordemDecrescente = null;    // null = ainda não sei em que ordem vem
  var pagina = 1;
  var TETO_PAGINAS = 40;          // rede de segurança: nunca varre sem fim

  while (pagina <= TETO_PAGINAS) {
    var caminho = '/work_periods?user_id=' + encodeURIComponent(userId) +
      '&start_date=' + primeiroDia + '&end_date=' + ultimoDia +
      '&sort=start&sortDir=desc&limit=100&page=' + pagina;

    var lote = runrunFetch(caminho);
    if (!Array.isArray(lote)) return pagina === 1 ? null : encontrados;
    if (lote.length === 0) break;

    // A API pode ignorar `page`. Se a página vier igualzinha à anterior,
    // não adianta continuar pedindo — seria um laço infinito.
    var assinatura = lote.map(function (b) { return b && b.id; }).join(',');
    if (assinatura === assinaturaAnterior) break;
    assinaturaAnterior = assinatura;

    // Descobre a ordem OLHANDO O DADO, em vez de confiar no `sortDir`.
    // Foi exatamente esse palpite que zerou a tela na primeira versão: a
    // API ignora o `sortDir` e devolve do mais VELHO pro mais novo, então
    // o primeiro registro já era anterior à janela e a busca parava ali,
    // sem nunca chegar na semana pedida.
    if (ordemDecrescente === null && lote.length > 1) {
      var primeiro = new Date(lote[0].start).getTime();
      var ultimo = new Date(lote[lote.length - 1].start).getTime();
      if (primeiro !== ultimo) ordemDecrescente = primeiro > ultimo;
    }

    var maisNovoDaPagina = 0;
    var maisVelhoDaPagina = Infinity;
    for (var i = 0; i < lote.length; i++) {
      var b = lote[i];
      if (!b || !b.start) continue;
      var quando = new Date(b.start).getTime();
      if (quando > maisNovoDaPagina) maisNovoDaPagina = quando;
      if (quando < maisVelhoDaPagina) maisVelhoDaPagina = quando;
      if (quando >= corteInicio && quando <= corteFim && !jaPeguei[b.id]) {
        jaPeguei[b.id] = true;
        encontrados.push(b);
      }
    }

    // Só para cedo quando dá pra ter CERTEZA de que o resto não interessa.
    // Sem saber a ordem, continua virando página até o teto.
    if (ordemDecrescente === true && maisNovoDaPagina < corteInicio) break;
    if (ordemDecrescente === false && maisVelhoDaPagina > corteFim) break;
    if (lote.length < 100) break;
    pagina++;
  }

  return encontrados;
}

/**
 * Monta os 7 dias da semana (segunda a domingo) a partir da segunda-feira
 * informada. Se não vier nada, usa a semana de hoje.
 */
function montarSemanaVazia(inicioISO) {
  var base;
  if (inicioISO && /^\d{4}-\d{2}-\d{2}$/.test(inicioISO)) {
    base = new Date(inicioISO + 'T12:00:00-03:00');
  } else {
    base = segundaFeiraDaSemana(new Date());
  }

  var dias = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    dias.push({
      data: Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd'),
      segundos: null,      // null = não sabemos ainda (≠ 0 = não trabalhou)
      travado: false,
      justificativa: ''
    });
  }
  return dias;
}

function segundaFeiraDaSemana(data) {
  var d = new Date(data.getTime());
  // getDay(): 0 = domingo. Queremos voltar até a segunda-feira.
  var diaDaSemana = d.getDay();
  var recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  d.setDate(d.getDate() - recuo);
  d.setHours(12, 0, 0, 0);
  return d;
}

function invalidarCacheDeHoras(userId, primeiroDia) {
  try { CacheService.getScriptCache().remove('workPeriods_' + userId + '_' + primeiroDia); }
  catch (e) { /* segue */ }
}

/**
 * Lança horas numa tarefa, num dia específico — o "Ajustar" do Runrun.it.
 *
 * Um bloco de trabalho tem INÍCIO e FIM (não só uma quantidade), então a
 * gente calcula: começa depois do último bloco daquele dia (ou às 9h, se
 * o dia estiver vazio) e termina na duração pedida. Isso evita encavalar
 * com tempo que já existe, que é o motivo mais provável de o Runrun.it
 * recusar um lançamento.
 *
 * CONFERE DEPOIS DE GRAVAR: lê os blocos do dia de volta e só dá por
 * lançado se o bloco novo estiver mesmo lá. O Runrun.it já respondeu "200"
 * pra coisa que ignorou antes (foi assim com a Entrega Desejada e com a
 * alocação de responsável) — e aqui o estrago seria em hora trabalhada de
 * verdade, então dá pra confiar menos ainda.
 */
function lancarHorasNaTarefa(dados) {
  if (!dados || !dados.taskId || !dados.dia || !dados.segundos) {
    return { ok: false, error: 'Faltam dados (tarefa, dia ou quantidade).' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.dia)) {
    return { ok: false, error: 'Data inválida.' };
  }
  var segundos = Math.round(Number(dados.segundos));
  if (!segundos || segundos <= 0) return { ok: false, error: 'Quantidade de horas inválida.' };
  if (segundos > 12 * 3600) return { ok: false, error: 'Mais de 12 horas num dia só — confere o valor.' };

  var userId = idDoUsuarioRunrunPorNome(dados.designer);
  if (!userId) return { ok: false, error: 'Não achei o id de ' + dados.designer + ' no Runrun.it.' };

  // Onde encaixar: logo depois do último bloco já existente nesse dia.
  var doDia = buscarBlocosDeTrabalho(userId, dados.dia, dados.dia) || [];
  var comecoEmMs;
  if (doDia.length) {
    var ultimoFim = 0;
    doDia.forEach(function (b) {
      var fim = b.end ? new Date(b.end).getTime() : 0;
      if (fim > ultimoFim) ultimoFim = fim;
    });
    comecoEmMs = ultimoFim || new Date(dados.dia + 'T09:00:00-03:00').getTime();
  } else {
    comecoEmMs = new Date(dados.dia + 'T09:00:00-03:00').getTime();
  }
  var fimEmMs = comecoEmMs + segundos * 1000;

  var corpo = {
    task_id: Number(dados.taskId),
    user_id: userId,
    start: formatarParaRunrun(comecoEmMs),
    end: formatarParaRunrun(fimEmMs)
  };

  var quantosAntes = doDia.length;
  var r = runrunRequest('/work_periods', 'post', corpo, tokenRunrunDoAutor(dados.designer));

  // Confere lendo de volta, em vez de acreditar no status.
  invalidarCacheDeHoras(userId, dados.dia);
  var depois = buscarBlocosDeTrabalho(userId, dados.dia, dados.dia) || [];
  if (depois.length > quantosAntes) {
    // Limpa também o cache da SEMANA, senão a tela continuaria mostrando
    // o total antigo por até 5 minutos.
    invalidarCacheDeHoras(userId, Utilities.formatDate(
      segundaFeiraDaSemana(new Date(dados.dia + 'T12:00:00-03:00')),
      'America/Sao_Paulo', 'yyyy-MM-dd'));
    return { ok: true };
  }

  return {
    ok: false,
    error: 'O Runrun.it não registrou o lançamento (status ' + r.status + '). ' +
           'Pode ser que o horário escolhido encavale com tempo que já existe nesse dia.',
    bodyBruto: r.body
  };
}

function formatarParaRunrun(ms) {
  return Utilities.formatDate(new Date(ms), 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * Justificar o dia (folga, feriado, atestado...).
 *
 * NÃO EXISTE endpoint pra isso na API — o diagnóstico varreu 40+ endereços
 * e só apareceram os blocos de trabalho (/work_periods). A justificativa
 * parece viver só na tela do Runrun.it. Em vez de fingir que dá, o Colmeia
 * diz isso e manda direto pro lugar certo — melhor que um botão que some
 * sem fazer nada.
 */
function justificarDiaTimesheet(dados) {
  return {
    ok: false,
    abrirNoRunrun: true,
    url: 'https://runrun.it/pt-BR/me/timesheet',
    error: 'A API do Runrun.it não oferece um jeito de justificar o dia — isso só existe na tela deles. Abre o Runrun.it que eu te levo direto no lugar.'
  };
}

// ============ AGENDA DA SEMANA ============

/**
 * Igual buscarReunioesDeHoje, mas pra SEMANA inteira — é o que alimenta a
 * grade de agenda da página "Minhas horas". Devolve cada reunião com o
 * dia (AAAA-MM-DD) já separado, pra tela não precisar fazer conta de fuso.
 */
function buscarAgendaDaSemana(designer, inicioISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var email = null;
  for (var e in RUNRUN_USUARIOS) {
    if (RUNRUN_USUARIOS[e].toLowerCase().trim() === designer.toLowerCase().trim()) { email = e; break; }
  }
  if (!email) return { ok: false, error: 'E-mail desse designer não configurado em RUNRUN_USUARIOS.' };

  try {
    var agenda = CalendarApp.getCalendarById(email);
    if (!agenda) return { ok: false, error: 'Não consegui acessar a agenda de ' + designer + '.' };

    var inicio = (inicioISO && /^\d{4}-\d{2}-\d{2}$/.test(inicioISO))
      ? new Date(inicioISO + 'T00:00:00-03:00')
      : segundaFeiraDaSemana(new Date());
    inicio.setHours(0, 0, 0, 0);
    var fim = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000);

    var eventos = agenda.getEvents(inicio, fim)
      .filter(function (ev) { return !ev.isAllDayEvent(); })
      .map(function (ev) {
        var inicioEv = ev.getStartTime();
        return {
          id: ev.getId(),
          titulo: ev.getTitle(),
          dia: Utilities.formatDate(inicioEv, 'America/Sao_Paulo', 'yyyy-MM-dd'),
          horaInicio: Utilities.formatDate(inicioEv, 'America/Sao_Paulo', 'HH:mm'),
          horaFim: Utilities.formatDate(ev.getEndTime(), 'America/Sao_Paulo', 'HH:mm'),
          inicio: inicioEv.getTime(),
          fim: ev.getEndTime().getTime(),
          link: extrairLinkDaReuniao(ev)
        };
      });

    return { ok: true, reunioes: eventos };
  } catch (err) {
    return { ok: false, error: 'Erro ao ler a agenda da semana: ' + err.message };
  }
}
