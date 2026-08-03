/**
 * Backend do Colmeia — Quadro de tarefas Beeon
 * (deploy automático via GitHub Actions + clasp v3, configurado em 2026-07-28 — teste com Apps Script API habilitada)
 * ---------------------------------------------
 * Este script tem duas fontes de dados:
 *
 * 1) RUNRUN.IT (fonte da verdade pra tarefas): título, cliente, etapa
 *    (coluna), data de entrega desejada, tipo de tarefa e responsável
 *    vêm sempre ao vivo da API do Runrun.it. Não guardamos cópia disso
 *    na planilha.
 *
 * 2) PLANILHA "Extras" (só o que o Runrun.it não tem): guarda a
 *    prioridade de cada tarefa (Alta/Média/Baixa), escolhida manualmente
 *    dentro do Colmeia. Cada linha é 1 tarefa: [task_id, prioridade,
 *    atualizado_em].
 *
 * IMPORTANTE — reaproveitado do painel-designers-beeon:
 * As credenciais do Runrun.it (RUNRUN_APP_KEY / RUNRUN_USER_TOKEN) e a
 * lista RUNRUN_USUARIOS são as mesmas de lá. Se mudar o token num dos
 * dois projetos, troque no outro também.
 *
 * CRONÔMETRO E COMENTÁRIOS:
 * O play/pause e os comentários batem de verdade na API do Runrun.it
 * (não são simulados no Colmeia). O endpoint de play/pause foi
 * implementado por inferência (não veio 100% confirmado na
 * documentação) — rode diagnosticoPlayPause(taskId) manualmente pelo
 * editor antes de confiar cegamente nele em produção.
 *
 * TOKEN POR PESSOA (2026-07-31) — corrige um problema sério: até aqui,
 * TODA ação de escrita (play, pause, comentário, entregar, mover etapa
 * etc.) usava sempre o MESMO token — o do Cláudio — não importa quem
 * estivesse logado no Colmeia. Pro Runrun.it, então, tudo que o Gustavo
 * ou o Erick faziam aparecia como se fosse o Cláudio fazendo. Agora cada
 * um tem o PRÓPRIO token (RUNRUN_USER_TOKEN_GUSTAVO/_ERICK), e toda
 * chamada de escrita usa o token de quem está logado de verdade — ver
 * tokenRunrunDoAutor em RunrunLeitura.gs. Sem o token de alguém
 * cadastrado ainda, cai pro token do Cláudio (funciona, só com a
 * atribuição errada de antes) em vez de travar a ação.
 */

// ============ CONFIGURAÇÃO ============

// As chaves/senhas de verdade NÃO ficam mais escritas aqui no código (o
// GitHub bloqueou o envio por isso — chave exposta em texto puro é
// insegura, qualquer um com acesso ao código consegue usá-la). Elas
// ficam guardadas em "Propriedades do Script", uma área separada e
// privada do próprio Apps Script. Pra configurar (só precisa fazer uma
// vez): no editor do Apps Script, vá em "Configurações do projeto" (ícone
// de engrenagem) > "Propriedades do script" > "Adicionar propriedade
// do script", e cadastre cada uma destas com o valor de verdade:
// RUNRUN_APP_KEY, GROQ_API_KEY, GEMINI_API_KEY, RUNRUN_USER_TOKEN,
// RUNRUN_USER_TOKEN_GUSTAVO, RUNRUN_USER_TOKEN_ERICK — as duas últimas
// são o token pessoal de cada um (gerado por ELES, dentro da própria
// conta deles no Runrun.it — o do Cláudio não serve pros dois), ver o
// comentário "TOKEN POR PESSOA" ali em cima. A geração de imagem da Bee
// (NanoBanana.gs) NÃO precisa de chave nova: usa a mesma GEMINI_API_KEY
// dos textos dela.
var RUNRUN_APP_KEY = PropertiesService.getScriptProperties().getProperty('RUNRUN_APP_KEY');
var GROQ_API_KEY = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
var GROQ_MODEL = 'llama-3.3-70b-versatile';
var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
// Modelo RÁPIDO: usado em tudo que é leitura/resumo (briefing, frase do
// dia, a primeira fala da Bee). Essas coisas acontecem enquanto a pessoa
// espera na tela, então velocidade importa mais que profundidade.
var GEMINI_MODEL = 'gemini-3.1-flash-lite';
// Modelo FORTE: só pra CONVERSAR com a Bee, onde ela precisa raciocinar
// (opinar sobre criação, montar prompt de imagem, entender um pedido
// vago). Demora mais, e tudo bem — ali a pessoa fez uma pergunta e está
// esperando uma resposta boa, não uma resposta instantânea.
// Dá pra trocar sem mexer no código: basta criar a propriedade de script
// GEMINI_MODEL_CONVERSA com o nome do modelo. Se o nome não existir, a
// Bee cai sozinha no modelo rápido em vez de dar erro (ver chamarGeminiTexto).
var GEMINI_MODEL_CONVERSA = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL_CONVERSA') || 'gemini-3.1-pro';
var RUNRUN_USER_TOKEN = PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN'); // Cláudio
var RUNRUN_USER_TOKEN_GUSTAVO = PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN_GUSTAVO');
var RUNRUN_USER_TOKEN_ERICK = PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN_ERICK');
var RUNRUN_BASE_URL = 'https://secure.runrun.it/api/v1.0';

// email -> token pessoal, usado por tokenRunrunDoAutor (RunrunLeitura.gs)
// pra escolher qual token entra em cada chamada de ESCRITA no Runrun.it.
var RUNRUN_TOKENS_POR_EMAIL = {
  'claudio@beeon.com.br': RUNRUN_USER_TOKEN,
  'gustavo@beeon.com.br': RUNRUN_USER_TOKEN_GUSTAVO,
  'erick@beeon.com.br': RUNRUN_USER_TOKEN_ERICK
};

// URL do Web App do painel-designers-beeon (o outro painel, já publicado).
// O Colmeia só faz LEITURA aqui — nunca escreve nada nesse painel. Usado
// pra reaproveitar os vínculos manuais de cliente (mesmo cliente com
// nomes diferentes no painel/Runrun.it/Drive) já cadastrados lá, em vez
// de o Colmeia tentar adivinhar por nome parecido de novo.
var PAINEL_BEEON_API_URL = 'https://script.google.com/macros/s/AKfycbzzWtG4jkVpLvPwOAHaj-h9KK9k_8N6YWGUXfFtUDSXRiCj7ILDPvuSy9VJXhglTrzEQQ/exec';

var RUNRUN_USUARIOS = {
  'claudio@beeon.com.br': 'Cláudio',
  'gustavo@beeon.com.br': 'Gustavo',
  'erick@beeon.com.br': 'Erick'
};

var COLUNAS_PRINCIPAIS = {
  pendentes: 'Pendentes',
  prioridades: 'Prioridades',
  fazendo: 'Fazendo',
  revisao: 'Revisão',
  ajustes: 'Ajuste/Refação'
};

var CAMPO_TIPO_TAREFA = 'Tipo';

var COLUNA_STAGE_IDS = {
  pendentes: 1280747,
  prioridades: 2349713,
  fazendo: 1280748,
  revisao: 1296178,
  ajustes: 1296184
};

// ============ ENTRADA (doGet / doPost) ============

// Ações que mexem em algo que aparece no quadro — depois de qualquer uma
// delas, a varredura guardada do quadro é descartada (ver
// invalidarCacheDoQuadro, no fim deste arquivo).
var ACOES_QUE_MUDAM_O_QUADRO = [
  'tocarTarefa', 'pausarTarefa', 'definirPrioridade',
  'avancarWorkflow', 'desfazerWorkflow', 'entregarTarefa', 'reabrirTarefa',
  'reatribuir', 'moverEtapa', 'moverEtapaArbitraria',
  'alterarEntrega', 'alterarPublicacao', 'ajustarEstimativa',
  'criarRegra', 'adicionarNaRegra', 'removerDaRegra', 'criarTarefa'
];

function doGet(e) {
  return handleRequest(e, 'GET');
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function handleRequest(e, method) {
  var output;
  try {
    var tipo = e && e.parameter ? e.parameter.tipo : null;

    if (tipo === 'tarefas') {
      output = getTarefasColmeia();
    } else if (method === 'POST') {
      var body = JSON.parse(e.postData.contents);

      if (body.acao === 'login') {
        output = verificarLogin(body.senha);
      } else if (body.acao === 'gerarFraseDoDia') {
        output = gerarFraseDoDia();
      } else if (body.acao === 'definirPrioridade') {
        output = definirPrioridade(body.taskId, body.prioridade);
      } else if (body.acao === 'tocarTarefa') {
        output = tocarTarefa(body.taskId, body.taskTitle, body.designer);
      } else if (body.acao === 'buscarTarefasHoje') {
        output = buscarPlaysDeHoje(body.designer, body.janela);
      } else if (body.acao === 'pausarTarefa') {
        output = pausarTarefa(body.taskId, body.autor);
      } else if (body.acao === 'listarComentarios') {
        output = listarComentarios(body.taskId);
      } else if (body.acao === 'buscarDescricao') {
        output = buscarDescricao(body.taskId);
      } else if (body.acao === 'salvarDescricao') {
        output = salvarDescricao(body.taskId, body.texto, body.autor);
      } else if (body.acao === 'buscarAnexos') {
        output = buscarAnexosTarefa(body.taskId);
      } else if (body.acao === 'baixarAnexo') {
        output = baixarDocumentoAnexo(body.documentId);
      } else if (body.acao === 'baixarImagemDaDescricao') {
        output = baixarImagemDaDescricao(body.url);
      } else if (body.acao === 'gerarBriefing') {
        output = gerarBriefingDaTarefa(body.taskId);
      } else if (body.acao === 'resumirAlteracao') {
        output = resumirAlteracao(body.taskId, body.idOriginal);
      } else if (body.acao === 'adicionarComentario') {
        output = adicionarComentario(body.taskId, body.texto, body.autor);
      } else if (body.acao === 'excluirComentario') {
        output = excluirComentario(body.commentId, body.autor);
      } else if (body.acao === 'editarComentario') {
        output = editarComentario(body.commentId, body.texto, body.autor);
      } else if (body.acao === 'buscarProjetosRunrun') {
        output = { ok: true, projetos: buscarProjetosRunrun() || [] };
      } else if (body.acao === 'criarTarefa') {
        if (body.dados) body.dados.autor = body.autor;
        output = criarTarefaRunrun(body.dados);
      } else if (body.acao === 'reagirComentario') {
        output = reagirComentario(body.commentId, body.emoji, body.autor);
      } else if (body.acao === 'adicionarComentarioComAnexo') {
        output = adicionarComentarioComAnexo(body.taskId, body.texto, body.nomeArquivo, body.mimeType, body.base64Dados, body.autor);
      } else if (body.acao === 'avancarWorkflow') {
        output = avancarWorkflowTarefa(body.taskId, body.autor);
      } else if (body.acao === 'desfazerWorkflow') {
        output = desfazerWorkflowTarefa(body.taskId, body.autor);
      } else if (body.acao === 'buscarSequencia') {
        output = buscarSequenciaResponsaveis(body.taskId);
      } else if (body.acao === 'buscarCardMae') {
        output = buscarCardMae(body.taskId);
      } else if (body.acao === 'buscarSubtarefasDoCardMae') {
        output = buscarSubtarefasDoCardMae(body.taskId);
      } else if (body.acao === 'buscarTarefaCompleta') {
        output = buscarTarefaCompleta(body.taskId);
      } else if (body.acao === 'abrirTarefa') {
        output = abrirTarefaParaColmeia(body.taskId);
      } else if (body.acao === 'entregarTarefa') {
        output = entregarTarefa(body.taskId, body.autor);
        // Carimba a data de entrega na conversa da Bee, que é o que
        // dispara a contagem dos 15 dias até ela ser apagada (ver
        // marcarEntregaParaBee/limparConversasBeeAntigas em Bee.gs).
        if (output && output.ok) marcarEntregaParaBee(body.taskId);
      } else if (body.acao === 'beeResumo') {
        output = beeResumo(body.taskId, body.idOriginal);
      } else if (body.acao === 'beeConversar') {
        output = beeConversar(body.taskId, body.pergunta, body.idOriginal, body.designer);
      } else if (body.acao === 'beeConversarLivre') {
        output = beeConversarLivre(body.pergunta, body.designer, body.chave);
      } else if (body.acao === 'beeConversasLivres') {
        output = beeListarConversasLivres(body.designer);
      } else if (body.acao === 'beeHistoricoLivre') {
        output = { ok: true, conversa: lerConversaBee(body.chave || beeChaveLivre(body.designer)) };
      } else if (body.acao === 'beeMemoriaCliente') {
        output = beeMemoriaDoCliente(body.cliente, body.taskIds, body.forcar);
      } else if (body.acao === 'beeConferirEntrega') {
        output = beeConferirEntrega(body.taskId, body.idOriginal, body.cliente);
      } else if (body.acao === 'beeMemorias') {
        output = listarMemoriasBee(body.cliente);
      } else if (body.acao === 'beeAdicionarMemoria') {
        output = adicionarMemoriaBee(body.cliente, body.texto, body.autor);
      } else if (body.acao === 'beeExcluirMemoria') {
        output = excluirMemoriaBee(body.id);
      } else if (body.acao === 'beeDna') {
        output = beeDnaDoCliente(body.cliente);
      } else if (body.acao === 'beeInspirar') {
        output = beeInspirar(body.taskId, body.idOriginal);
      } else if (body.acao === 'beeGerarImagem') {
        // Gemini 2.5 Flash Image ("Nano Banana") — ver NanoBanana.gs. O
        // caminho pela Adobe Firefly foi abandonado: o produto que a Beeon
        // tem lá não gera imagem por texto (é edição de template do Express),
        // e a autorização nunca chegou a funcionar.
        output = gerarImagemNanoBanana(body.prompt);
      } else if (body.acao === 'beeDescartarSugestao') {
        output = descartarSugestaoDeMemoria(body.cliente, body.texto);
      } else if (body.acao === 'beeBuscarDrive') {
        output = beeBuscarNoDrive(body.termo, body.cliente);
      } else if (body.acao === 'beeBuscarLink') {
        output = beeBuscarLink(body.termo, body.cliente);
      } else if (body.acao === 'beeAcharCardMae') {
        output = beeAcharCardMae(body.termo, body.cliente);
      } else if (body.acao === 'beeAtualizarMensagem') {
        output = atualizarMensagemBee(body.chave, body.indice, body.texto);
      } else if (body.acao === 'beeExcluirConversaLivre') {
        output = excluirConversaBee(body.chave);
      } else if (body.acao === 'beeHistorico') {
        output = { ok: true, conversa: lerConversaBee(body.taskId) };
      } else if (body.acao === 'reabrirTarefa') {
        output = reabrirTarefa(body.taskId, body.autor);
      } else if (body.acao === 'criarRegra') {
        output = criarWorkflowDaTarefa(body.taskId, body.autor);
      } else if (body.acao === 'adicionarNaRegra') {
        output = adicionarPessoaNaRegra(body.workflowId, body.userId, body.autor);
      } else if (body.acao === 'removerDaRegra') {
        output = removerDaRegra(body.workflowId, body.elementId, body.autor);
      } else if (body.acao === 'reatribuir') {
        output = reatribuirTarefa(body.taskId, body.responsavelId, body.autor);
      } else if (body.acao === 'moverEtapa') {
        output = moverEtapaTarefa(body.taskId, body.chaveColuna, body.autor);
      } else if (body.acao === 'moverEtapaArbitraria') {
        output = moverParaEtapaArbitraria(body.taskId, body.taskStateId, body.autor);
      } else if (body.acao === 'alterarEntrega') {
        output = alterarDataEntregaTarefa(body.taskId, body.novaData, body.autor);
      } else if (body.acao === 'alterarPublicacao') {
        output = alterarDataPublicacaoTarefa(body.taskId, body.novaData, body.autor);
      } else if (body.acao === 'ajustarEstimativa') {
        output = ajustarEstimativaTarefa(body.taskId, body.minutos, body.autor);
      } else if (body.acao === 'buscarExtrasRunrunCompleto') {
        output = buscarExtrasRunrunCompleto();
      } else if (body.acao === 'listarUsuarios') {
        output = listarTodosUsuariosRunrun();
      } else if (body.acao === 'listarPessoas') {
        output = listarPessoasSalvas();
      } else if (body.acao === 'salvarPessoa') {
        output = salvarPessoa(body.nome, body.foto, body.aliases, body.discord);
      } else if (body.acao === 'excluirPessoasPorNomes') {
        output = excluirPessoasPorNomes(body.nomes);
      } else if (body.acao === 'listarLinksClientes') {
        output = listarLinksClientes();
      } else if (body.acao === 'salvarLinksCliente') {
        output = salvarLinksCliente(body.cliente, body.dados);
      } else if (body.acao === 'excluirClientesPorNomes') {
        output = excluirClientesPorNomes(body.nomes);
      } else if (body.acao === 'listarPastasClientesDrive') {
        output = listarPastasDeClientesNoDrive();
      } else if (body.acao === 'criarPastaDoCard') {
        output = criarPastaDoCardNoDrive(body.cliente, body.tituloCard, body.taskId, body.projeto);
      } else if (body.acao === 'buscarPastaCard') {
        output = buscarPastaSalvaDoCard(body.taskId);
      } else if (body.acao === 'buscarOuHerdarPastaCard') {
        output = buscarOuHerdarPastaCard(body.taskId, body.idsRelacionados);
      } else if (body.acao === 'linkarPastaManual') {
        output = linkarPastaManualNoDrive(body.taskId, body.url);
      } else if (body.acao === 'buscarUploadsRecentesDoCard') {
        output = buscarUploadsRecentesDoCard(body.taskId, body.cliente);
      } else if (body.acao === 'buscarThumbnailDrive') {
        output = buscarThumbnailDrive(body.fileId);
      } else if (body.acao === 'buscarImagemCheiaDrive') {
        output = buscarImagemCheiaDrive(body.fileId);
      } else if (body.acao === 'entrarEmFoco') {
        output = entrarEmFoco(body.designer, body.ateQuando);
      } else if (body.acao === 'sairDoFoco') {
        output = sairDoFoco(body.designer);
      } else if (body.acao === 'buscarHistoriaDaTarefa') {
        output = buscarHistoriaDaTarefa(body.taskId);
      } else if (body.acao === 'buscarAtividadesDrive') {
        output = buscarAtividadesDrive(body.designer);
      } else if (body.acao === 'buscarProgressoClientes') {
        output = buscarProgressoMensalClientes();
      } else if (body.acao === 'listarClientesOcultos') {
        output = listarClientesOcultos();
      } else if (body.acao === 'ocultarCliente') {
        output = ocultarClienteDesigner(body.designer, body.cliente);
      } else if (body.acao === 'restaurarCliente') {
        output = restaurarClienteDesigner(body.designer, body.cliente);
      } else if (body.acao === 'listarAcessoRapido') {
        output = listarAcessoRapido(body.designer);
      } else if (body.acao === 'salvarAcessoRapido') {
        output = salvarAcessoRapido(body.designer, body.dados);
      } else if (body.acao === 'excluirAcessoRapido') {
        output = excluirAcessoRapido(body.id, body.designer);
      } else if (body.acao === 'buscarReunioesHoje') {
        output = buscarReunioesDeHoje(body.designer);
      } else if (body.acao === 'responderReuniao') {
        output = responderReuniao(body.designer, body.eventId, body.resposta);
      } else if (body.acao === 'buscarHorasDaSemana') {
        output = buscarHorasDaSemana(body.designer, body.inicio);
      } else if (body.acao === 'buscarAgendaDaSemana') {
        output = buscarAgendaDaSemana(body.designer, body.inicio);
      } else if (body.acao === 'buscarEntreguesDoDesigner') {
        output = buscarEntreguesDoDesigner(body.designer, body.limite);
      } else if (body.acao === 'lancarHoras') {
        output = lancarHorasNaTarefa(body.dados);
      } else if (body.acao === 'justificarDia') {
        output = justificarDiaTimesheet(body.dados);
      } else if (body.acao === 'criarAviso') {
        output = criarAviso(body.autor, body.texto);
      } else if (body.acao === 'listarAvisos') {
        output = listarAvisos();
      } else if (body.acao === 'excluirAviso') {
        output = excluirAviso(body.id);
      } else {
        output = { ok: false, error: 'Ação POST desconhecida: ' + body.acao };
      }

      // Toda ação que muda algo que APARECE no quadro joga fora a
      // varredura guardada (ver invalidarCacheDoQuadro). Sem isso, quem
      // acabou de mover/entregar/repassar uma tarefa podia ver a tela
      // "voltar" ao estado de antes por até 45 segundos, porque a próxima
      // leitura vinha do que foi guardado ANTES da ação.
      if (output && output.ok && ACOES_QUE_MUDAM_O_QUADRO.indexOf(body.acao) !== -1) {
        invalidarCacheDoQuadro();
      }
    } else {
      output = { ok: false, error: 'Use ?tipo=tarefas pra buscar o quadro.' };
    }
  } catch (err) {
    output = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ JUNTA TUDO PRO FRONT-END ============

// ===== Varredura do quadro compartilhada entre quem está logado =====
// Antes, cada navegador aberto pedia a sua própria varredura completa do
// Runrun.it a cada 60s. Com 3 pessoas logadas, o backend varria TUDO três
// vezes por minuto buscando exatamente a mesma coisa — trabalho triplicado
// que competia com as ações de verdade e sobrecarregava o Apps Script.
// Agora o resultado pronto fica guardado por alguns segundos e as outras
// pessoas aproveitam a mesma varredura.
//
// O CacheService tem limite de tamanho por chave, e o quadro do time
// inteiro passa disso — por isso o texto é fatiado em pedaços numeradas e
// remontado na leitura (ver guardarNoCacheEmFatias/lerDoCacheEmFatias).
var CACHE_QUADRO_CHAVE = 'quadroColmeia';
var CACHE_QUADRO_SEGUNDOS = 45;
var CACHE_FATIA_TAMANHO = 90000; // ~90 KB por pedaço, com folga pro limite

function guardarNoCacheEmFatias(cache, chaveBase, texto, segundos) {
  try {
    var fatias = [];
    for (var i = 0; i < texto.length; i += CACHE_FATIA_TAMANHO) {
      fatias.push(texto.substring(i, i + CACHE_FATIA_TAMANHO));
    }
    var mapa = {};
    for (var j = 0; j < fatias.length; j++) mapa[chaveBase + '_' + j] = fatias[j];
    mapa[chaveBase + '_n'] = String(fatias.length);
    cache.putAll(mapa, segundos);
  } catch (e) {
    // Cache indisponível ou pedaço grande demais: não é problema, só
    // significa que essa varredura não vai ser aproveitada por ninguém.
  }
}

function lerDoCacheEmFatias(cache, chaveBase) {
  try {
    var total = Number(cache.get(chaveBase + '_n'));
    if (!total) return null;
    var chaves = [];
    for (var i = 0; i < total; i++) chaves.push(chaveBase + '_' + i);
    var pedacos = cache.getAll(chaves);
    var texto = '';
    for (var j = 0; j < total; j++) {
      // Um pedaço vencido/ausente invalida o conjunto — melhor varrer de
      // novo do que devolver um quadro pela metade.
      if (!pedacos[chaveBase + '_' + j]) return null;
      texto += pedacos[chaveBase + '_' + j];
    }
    return texto;
  } catch (e) {
    return null;
  }
}

function getTarefasColmeia() {
  var cache = CacheService.getScriptCache();
  var cacheado = lerDoCacheEmFatias(cache, CACHE_QUADRO_CHAVE);
  if (cacheado) {
    try { return JSON.parse(cacheado); } catch (e) { /* varre de novo abaixo */ }
  }
  try {
    var tarefas = buscarTarefasRunrun();
    var prioridadesSalvas = getPrioridadesSalvas();
    var focosAtivos = getFocosAtivos();

    tarefas.forEach(function (t) {
      if (prioridadesSalvas.hasOwnProperty(t.id)) {
        t.priority = prioridadesSalvas[t.id];
      } else if (t.status === 'prioridades') {
        t.priority = 'alta';
      } else {
        t.priority = 'media';
      }
      // Pra que o resto do time veja "Fulano em foco até 15:40" no card
      // dela (ver modo foco, js/modo-foco.js) — comparação por NOME de
      // propósito: é o mesmo nome que a pessoa usou pra entrar em foco
      // (DESIGNER_LOGADO), não uma decisão de "de quem é a tarefa".
      if (t.assignee && focosAtivos.hasOwnProperty(t.assignee)) {
        t.assigneeEmFocoAte = focosAtivos[t.assignee];
      }
    });

    var resultado = { ok: true, tarefas: tarefas, colunas: Object.keys(COLUNAS_PRINCIPAIS) };
    // Guarda pra quem pedir nos próximos segundos aproveitar a mesma
    // varredura (nunca guarda resposta de erro — senão o erro ficaria
    // "grudado" por 45s pra todo mundo).
    guardarNoCacheEmFatias(cache, CACHE_QUADRO_CHAVE, JSON.stringify(resultado), CACHE_QUADRO_SEGUNDOS);
    return resultado;
  } catch (err) {
    return { ok: false, error: 'Erro ao buscar tarefas do Runrun.it: ' + err.message };
  }
}

/**
 * Junta os dois pedaços que só o Colmeia sabe (plays e arquivos da
 * pasta do card) pra "História da peça" — a linha do tempo dentro do
 * card (ver js/detalhe-historia.js). Os comentários (que também entram
 * na linha do tempo) o front-end já busca à parte — já estão sendo lidos
 * de qualquer jeito pra aba Comentários, então não faz sentido buscar
 * de novo aqui.
 */
function buscarHistoriaDaTarefa(taskId) {
  if (!taskId) return { ok: false, error: 'taskId não informado.' };
  var plays = buscarHistoricoDePlaysDaTarefa(taskId);
  var arquivos = buscarHistoricoDeArquivosDoCard(taskId);
  return {
    ok: true,
    plays: plays.ok ? plays.plays : [],
    arquivos: arquivos.ok ? arquivos.arquivos : []
  };
}

/**
 * Joga fora a varredura guardada, pra próxima leitura do quadro vir
 * fresquinha do Runrun.it. Chamado depois de qualquer ação que muda o
 * quadro (mover etapa, avançar sequência, entregar, reatribuir...) — sem
 * isso, a pessoa que acabou de agir podia ver a tela "voltar" ao estado
 * anterior por até 45 segundos, guardado do momento antes da ação.
 */
function invalidarCacheDoQuadro() {
  try {
    var cache = CacheService.getScriptCache();
    var total = Number(cache.get(CACHE_QUADRO_CHAVE + '_n')) || 0;
    var chaves = [CACHE_QUADRO_CHAVE + '_n', CACHE_CARD_MAE_ABERTOS];
    for (var i = 0; i < total; i++) chaves.push(CACHE_QUADRO_CHAVE + '_' + i);
    cache.removeAll(chaves);
  } catch (e) { /* sem cache pra limpar, segue */ }
}
