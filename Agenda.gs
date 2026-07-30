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
