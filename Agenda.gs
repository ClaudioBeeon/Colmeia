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
 * Rodada 2 do diagnóstico do timesheet.
 *
 * A rodada 1 deu 404 nos 12 endereços testados — todos abaixo de
 * /api/v1.0. Como /tasks e /users funcionam normalmente por ali, o 404
 * significa mesmo "essa rota não existe", não problema de chave.
 *
 * Esta rodada amplia em três direções:
 *   1. mais nomes possíveis abaixo de /api/v1.0;
 *   2. endereços presos a UMA TAREFA (o tempo pode ser filho dela, não
 *      uma lista solta);
 *   3. endereços FORA de /api/v1.0 — a tela Tempo é do site do Runrun.it
 *      (runrun.it/pt-BR/me/timesheet), e o site pode falar com um
 *      endereço próprio, que não faz parte da API pública.
 *
 * Também mostra o corpo inteiro de qualquer coisa que NÃO seja 404: um
 * 401/403 seria ótima notícia — significa "essa rota existe, só pede
 * outra permissão".
 *
 * SÓ LEITURA. Nenhuma chamada aqui altera nada.
 *
 * Como rodar: no editor do Apps Script, escolha "diagnosticoTimesheet" no
 * seletor ao lado de "Executar", clique em Executar, e copie tudo que
 * aparecer em "Registro de execução".
 */
function diagnosticoTimesheet() {
  var meuId = idDoUsuarioRunrunPorNome('Cláudio');
  var hoje = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
  var seteDiasAtras = Utilities.formatDate(
    new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
    'America/Sao_Paulo', 'yyyy-MM-dd');

  Logger.log('=== DIAGNÓSTICO TIMESHEET — RODADA 2 ===');
  Logger.log('meu id no Runrun.it: ' + meuId);
  Logger.log('janela: ' + seteDiasAtras + ' até ' + hoje);
  Logger.log('');

  // --- Uma tarefa minha de verdade, pra testar os endereços de tarefa ---
  var taskId = null;
  var minhas = runrunFetch('/tasks?responsible_id=' + encodeURIComponent(meuId) + '&limit=1');
  if (Array.isArray(minhas) && minhas.length) taskId = minhas[0].id;
  Logger.log('tarefa usada nos testes por tarefa: ' + taskId);
  Logger.log('');

  // --- PARTE 1: campos de tempo que a tarefa JÁ devolve ---
  // Se algum deles trouxer a quebra por dia, nem precisamos de rota nova.
  Logger.log('--- PARTE 1: o que a própria tarefa já devolve sobre tempo ---');
  if (taskId) {
    var t = runrunFetch('/tasks/' + taskId);
    if (t && !t.erroFetch) {
      Object.keys(t).forEach(function (chave) {
        if (/time|worked|hour|period|played|track/i.test(chave)) {
          Logger.log('   ' + chave + ' = ' + JSON.stringify(t[chave]).substring(0, 200));
        }
      });
      if (Array.isArray(t.assignments) && t.assignments.length) {
        Logger.log('   assignments[0] completo:');
        Logger.log('   ' + JSON.stringify(t.assignments[0]).substring(0, 800));
      }
    }
  }
  Logger.log('');

  // --- PARTE 2: rotas abaixo de /api/v1.0 ---
  Logger.log('--- PARTE 2: rotas novas abaixo de /api/v1.0 ---');
  var candidatos = [
    '/time_worked_entries?user_id=' + meuId,
    '/work_periods?user_id=' + meuId,
    '/workperiods?user_id=' + meuId,
    '/task_time_entries?user_id=' + meuId,
    '/user_worked_times?user_id=' + meuId,
    '/punches?user_id=' + meuId,
    '/time_cards?user_id=' + meuId,
    '/timecards?user_id=' + meuId,
    '/attendances?user_id=' + meuId,
    '/journeys?user_id=' + meuId,
    '/user_journeys?user_id=' + meuId,
    '/timesheet?user_id=' + meuId,
    '/timesheet',
    '/me',
    '/me/timesheet',
    '/reports/time?user_id=' + meuId,
    '/reports/timesheet?user_id=' + meuId,
    '/time_report?user_id=' + meuId,
    '/worked_hours?user_id=' + meuId,
    '/task_works?user_id=' + meuId,
    '/works?user_id=' + meuId,
    '/timers?user_id=' + meuId
  ];
  if (taskId) {
    candidatos = candidatos.concat([
      '/tasks/' + taskId + '/time_entries',
      '/tasks/' + taskId + '/work_periods',
      '/tasks/' + taskId + '/time_worked',
      '/tasks/' + taskId + '/works',
      '/tasks/' + taskId + '/timers',
      '/tasks/' + taskId + '/punches'
    ]);
  }
  candidatos.forEach(function (caminho) { testarEndereco(caminho, null); });

  // --- PARTE 3: fora de /api/v1.0 (o site do Runrun.it) ---
  Logger.log('');
  Logger.log('--- PARTE 3: endereços fora da API pública ---');
  var raiz = 'https://secure.runrun.it';
  var forasDaApi = [
    raiz + '/timesheet.json',
    raiz + '/me/timesheet.json',
    raiz + '/pt-BR/me/timesheet.json',
    raiz + '/api/timesheet?user_id=' + meuId,
    raiz + '/api/v1.0/timesheets/' + meuId,
    raiz + '/api/internal/timesheet?user_id=' + meuId
  ];
  forasDaApi.forEach(function (url) { testarEndereco(null, url); });

  Logger.log('');
  Logger.log('=== FIM. Copie TUDO acima e mande pro Claude. ===');
}

/**
 * Faz uma chamada de LEITURA e registra o resultado de um jeito útil:
 * 404 = a rota não existe; qualquer outra coisa é pista boa e o corpo
 * inteiro é mostrado.
 */
function testarEndereco(caminhoDaApi, urlCompleta) {
  var rotulo = caminhoDaApi || urlCompleta;
  try {
    var res;
    if (caminhoDaApi) {
      res = runrunRequest(caminhoDaApi, 'get');
    } else {
      var bruto = UrlFetchApp.fetch(urlCompleta, {
        method: 'get',
        headers: { 'App-Key': RUNRUN_APP_KEY, 'User-Token': RUNRUN_USER_TOKEN },
        muteHttpExceptions: true,
        followRedirects: false
      });
      var corpo = bruto.getContentText();
      res = { ok: bruto.getResponseCode() >= 200 && bruto.getResponseCode() < 300,
              status: bruto.getResponseCode(), body: corpo.substring(0, 600) };
    }

    if (res.status === 404) { Logger.log('❌ 404   ' + rotulo); return; }

    Logger.log((res.ok ? '✅ FUNCIONOU (' + res.status + ')' : '⚠️  status ' + res.status) + '  ' + rotulo);
    var amostra = '';
    try { amostra = typeof res.body === 'string' ? res.body : JSON.stringify(res.body); }
    catch (e) { amostra = '(não deu pra ler o corpo)'; }
    Logger.log('     corpo: ' + String(amostra).substring(0, 700));
  } catch (err) {
    Logger.log('💥 erro  ' + rotulo + ' — ' + err.message);
  }
}

/**
 * Horas trabalhadas por dia, na semana pedida.
 *
 * `inicioISO` é a segunda-feira da semana (AAAA-MM-DD). Devolve sempre os
 * 7 dias, de segunda a domingo, mesmo os sem trabalho — a tela desenha
 * uma coluna por dia e precisa que a lista tenha tamanho fixo.
 *
 * Enquanto a fonte real não estiver confirmada (ver diagnosticoTimesheet),
 * devolve `semFonte: true`: é o jeito honesto de dizer "ainda não sei",
 * diferente de dizer "trabalhou 0h" — que seria mentira e apareceria como
 * dia travado na tela.
 */
var TIMESHEET_ENDPOINT_CONFIRMADO = null; // preencher depois do diagnóstico

function buscarHorasDaSemana(designer, inicioISO) {
  if (!designer) return { ok: false, error: 'designer não informado.' };
  var dias = montarSemanaVazia(inicioISO);

  if (!TIMESHEET_ENDPOINT_CONFIRMADO) {
    return {
      ok: true,
      semFonte: true,
      dias: dias,
      aviso: 'A fonte das horas por dia ainda não foi confirmada. Rode diagnosticoTimesheet() no editor do Apps Script.'
    };
  }

  // Quando o endpoint for confirmado, a leitura entra aqui e preenche
  // `segundos` de cada dia. Deixado explícito de propósito pra ficar
  // óbvio onde mexer.
  return { ok: true, semFonte: true, dias: dias };
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

/**
 * Lança horas numa tarefa, num dia específico — o "Ajustar" do Runrun.it.
 *
 * Ainda NÃO está ligado: escrever tempo de trabalho no Runrun.it mexe em
 * dado real de horas do time, e o formato certo dessa chamada depende do
 * mesmo endpoint que o diagnóstico vai confirmar. Até lá essa função
 * recusa de forma explícita, em vez de tentar um formato adivinhado e
 * gravar algo errado no histórico de horas de alguém.
 */
function lancarHorasNaTarefa(dados) {
  return {
    ok: false,
    naoConfigurado: true,
    error: 'O lançamento de horas ainda não está ligado — falta confirmar o endereço certo da API (rode diagnosticoTimesheet no editor do Apps Script).'
  };
}

function justificarDiaTimesheet(dados) {
  return {
    ok: false,
    naoConfigurado: true,
    error: 'A justificativa de dia ainda não está ligada — falta confirmar o endereço certo da API (rode diagnosticoTimesheet no editor do Apps Script).'
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
