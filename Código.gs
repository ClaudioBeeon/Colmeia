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
// comentário "TOKEN POR PESSOA" ali em cima. Desde 2026-08-05 o
// ATENDIMENTO também tem os seus, pelo mesmo motivo (elas comentam e
// reatribuem de verdade na tela de conferência): RUNRUN_USER_TOKEN_LAURA,
// RUNRUN_USER_TOKEN_MANU e RUNRUN_USER_TOKEN_GIOVANNA. A geração de imagem da Bee
// (NanoBanana.gs) NÃO precisa de chave nova: usa a mesma GEMINI_API_KEY
// dos textos dela.
var RUNRUN_APP_KEY = PropertiesService.getScriptProperties().getProperty('RUNRUN_APP_KEY');
var GROQ_API_KEY = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
// A Groq aposentou o llama-3.3-70b-versatile em 17/06/2026 (aviso deles:
// https://console.groq.com/docs/deprecations) — trocado pelo substituto
// que a própria Groq recomenda pra quem usava o 70b. Só entra em jogo
// quando o Gemini está fora do ar/sobrecarregado (ver chamarGemini,
// IA.gs) — antes disso era código morto, nunca chamado.
var GROQ_MODEL = 'openai/gpt-oss-120b';
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

// O ATENDIMENTO (2026-08-05). Elas entraram no Colmeia por causa da tela
// de conferência, e daí saem escritas de verdade no Runrun.it: o
// comentário do pedido de alteração, a reatribuição do card. Sem token
// próprio, tudo isso apareceria lá como se fosse o Cláudio fazendo.
//
// POR QUE NÃO ENTRAM EM RUNRUN_USUARIOS: aquela lista não é "as pessoas
// da agência" — é quem tem QUADRO. Ela é varrida a cada atualização do
// quadro (buscarTarefasAbertasSeparadas) pra buscar as tarefas abertas de
// cada uma. Pôr o atendimento lá faria a varredura procurar o dobro de
// gente, mais devagar, atrás de tarefa que não existe.
//
// O nome aqui tem que bater com o nome do LOGIN (aba Login da planilha) —
// é ele que chega como `autor`. Não batendo, cai no token do Cláudio, que
// é o comportamento de sempre pra quem ainda não tem token: funciona, só
// com a autoria errada.
// Esta lista faz DUAS coisas ao mesmo tempo, e é de propósito que seja uma
// só: além de decidir o token, ela é a lista de nomes do "Quem é você?" da
// entrada do atendimento (ver entrarComoAtendimento, AprovacaoInterna.gs).
// Separadas, alguém podia aparecer lá e não ter token aqui — entrando, mas
// comentando no nome do Cláudio sem ninguém perceber.
//
// Quem ainda não tem token cadastrado entra e trabalha normalmente; só a
// AUTORIA no Runrun.it sai como a do Cláudio, que é o comportamento de
// sempre pra quem não tem token (ver "TOKEN POR PESSOA" acima). Pra
// corrigir, é só criar a propriedade correspondente.
/**
 * Os tokens do atendimento — quem aparece na lista "Quem é você?" e com
 * qual conta do Runrun.it cada uma escreve.
 *
 * A LISTA DE BAIXO É SÓ O COMEÇO. `tokensDoAtendimento()` junta ela com
 * TODA propriedade de script chamada `RUNRUN_TOKEN_ATEND_<Nome>` — e é
 * por aí que entra gente nova (2026-08-10).
 *
 * Por que isso importa: antes, cada pessoa nova exigia mexer no código e
 * publicar. Quando a Giovanna sai e entra outra pessoa na carteira dela,
 * ninguém quer esperar deploy — e ninguém deveria precisar abrir o
 * Código.gs pra isso. Agora é adicionar UMA propriedade:
 *
 *     RUNRUN_TOKEN_ATEND_Beatriz  →  o token dela no Runrun.it
 *
 * O nome sai do que vem depois do prefixo, com "_" virando espaço
 * (`RUNRUN_TOKEN_ATEND_Joao_Paulo` → "Joao Paulo"). As linhas escritas à
 * mão aqui embaixo continuam valendo pra não quebrar nada do que já existe.
 */
var RUNRUN_TOKENS_ATENDIMENTO = {
  'Laura': PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN_LAURA'),
  'Manu': PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN_MANU'),
  'Giovanna': PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN_GIOVANNA'),
  'João Paulo': PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN_JOAO_PAULO'),
  'Lucas': PropertiesService.getScriptProperties().getProperty('RUNRUN_USER_TOKEN_LUCAS'),
  // O Cláudio coordena e cobre a conferência quando precisa. O token dele
  // já existe (RUNRUN_USER_TOKEN), então aqui é só pra ele aparecer na
  // lista de "Quem é você?" junto com o resto.
  'Cláudio': RUNRUN_USER_TOKEN
};

var PREFIXO_TOKEN_ATENDIMENTO = 'RUNRUN_TOKEN_ATEND_';

/**
 * O mapa de verdade: o escrito no código + o que estiver nas propriedades.
 *
 * Uma pessoa que apareça nos dois lugares fica com o valor da PROPRIEDADE
 * — assim dá pra corrigir o token de alguém sem publicar código, que é
 * justamente o caso urgente (token vencido, pessoa trocou de conta).
 */
function tokensDoAtendimento() {
  var mapa = {};
  for (var nome in RUNRUN_TOKENS_ATENDIMENTO) {
    if (RUNRUN_TOKENS_ATENDIMENTO[nome]) mapa[nome] = RUNRUN_TOKENS_ATENDIMENTO[nome];
  }
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    for (var chave in props) {
      if (chave.indexOf(PREFIXO_TOKEN_ATENDIMENTO) !== 0) continue;
      if (!props[chave]) continue;
      var nomeDaChave = chave.slice(PREFIXO_TOKEN_ATENDIMENTO.length).replace(/_/g, ' ').trim();
      if (nomeDaChave) mapa[nomeDaChave] = props[chave];
    }
  } catch (e) { /* sem propriedades: fica só o que está no código */ }
  return mapa;
}

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
  'criarRegra', 'adicionarNaRegra', 'removerDaRegra', 'criarTarefa',
  // Devolver pro designer cria a subtarefa de alteração, aloca alguém e
  // move pra Ajustes — três coisas que aparecem no quadro na hora.
  'devolverParaDesigner',
  // Manda o card mãe pra "Aprovação do Cliente" — muda de coluna no quadro.
  'moverCardMaeParaAprovacaoCliente'
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
      } else if (body.acao === 'manterTarefaViva') {
        output = manterTarefaViva(body.taskId, body.designer);
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
      } else if (body.acao === 'subirArquivoNoCard') {
        output = subirArquivoNoCard(body.dados);
      } else if (body.acao === 'avancarWorkflow') {
        output = avancarWorkflowTarefa(body.taskId, body.autor);
      } else if (body.acao === 'desfazerWorkflow') {
        output = desfazerWorkflowTarefa(body.taskId, body.autor);
      } else if (body.acao === 'buscarSequencia') {
        output = buscarSequenciaResponsaveis(body.taskId);
      } else if (body.acao === 'buscarCardMae') {
        output = buscarCardMae(body.taskId);
      } else if (body.acao === 'abrirCardMaeCompleto') {
        output = abrirCardMaeCompleto(body.taskId);
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
      } else if (body.acao === 'beeCompararVersoes') {
        output = compararVersoesDoCard(body.taskId);
      } else if (body.acao === 'beeAvisarUploadNovo') {
        output = beeAvisarUploadNovo(body.taskId, body.nomeArquivo);
      } else if (body.acao === 'beeAvisarLinkDriveNoComentario') {
        output = beeAvisarLinkDriveNoComentario(body.taskId);
      } else if (body.acao === 'listarPecasDaPastaDoCard') {
        output = listarPecasDaPastaDoCard(body.taskId);
      } else if (body.acao === 'gerarLinkDeAprovacao') {
        output = gerarLinkDeAprovacao(body.taskId, body.cliente, body.tituloTarefa, body.autor, body.fileId);
      } else if (body.acao === 'excluirLinkDeAprovacao') {
        output = excluirLinkDeAprovacao(body.codigo);
      } else if (body.acao === 'aprovarAprovacaoPorFora') {
        output = aprovarAprovacaoPorFora(body.dados);
      } else if (body.acao === 'listarLinksDaTarefa') {
        output = listarLinksDaTarefa(body.taskId);
      } else if (body.acao === 'pedirConferenciaInterna') {
        // Aprovação INTERNA do atendimento (AprovacaoInterna.gs) — o passo
        // ANTES de mandar pro cliente. Não confundir com as ações de
        // aprovação logo abaixo, que são do link que o cliente abre.
        output = pedirConferenciaInterna(body);
      } else if (body.acao === 'listarConferenciasPendentes') {
        output = listarConferenciasPendentes();
      } else if (body.acao === 'dadosDaConferencia') {
        output = dadosDaConferencia(body.taskId, body.loteId);
      } else if (body.acao === 'listarVersoesDasPecas') {
        output = listarVersoesDasPecas(body.taskId);
      } else if (body.acao === 'aprovarInternamente') {
        output = aprovarInternamente(body.taskId, body.loteId, body.aprovadoPor);
      } else if (body.acao === 'descartarConferencia') {
        output = descartarConferencia(body.taskId, body.loteId, body.quem);
      } else if (body.acao === 'marcarConferenciaEnviada') {
        output = marcarConferenciaEnviada(body.taskId, body.loteId);
      } else if (body.acao === 'devolverParaDesigner') {
        output = devolverParaDesigner(body);
      } else if (body.acao === 'moverCardMaeParaAprovacaoCliente') {
        output = moverCardMaeParaAprovacaoCliente(body.taskId, body.autor);
      } else if (body.acao === 'briefingDaConferencia') {
        output = briefingDaConferencia(body.taskId);
      } else if (body.acao === 'calendarioDePostagens') {
        output = calendarioDePostagens();
      } else if (body.acao === 'pedirAtencaoNaTarefa') {
        output = registrarPedidoDeAtencao(body.pedido);
      } else if (body.acao === 'listarPedidosDeAtencao') {
        output = listarPedidosDeAtencao();
      } else if (body.acao === 'entrarComoAtendimento') {
        output = entrarComoAtendimento(body.codigo);
      } else if (body.acao === 'buscarConferenciaDaTarefa') {
        output = buscarConferenciaDaTarefa(body.taskId, body.idsRelacionados);
      } else if (body.acao === 'buscarDevolucaoDaTarefa') {
        output = buscarDevolucaoDaTarefa(body.taskId);
      } else if (body.acao === 'buscarDevolucaoPublica') {
        // Ação PÚBLICA — chamada por ajuste.html, a página que mostra os
        // pontos marcados na peça. Sem login, igual à de aprovação: o que
        // protege é o código aleatório do link.
        output = buscarDevolucaoPublica(body.codigo);
      } else if (body.acao === 'buscarAprovacaoPublica') {
        // Ação PÚBLICA — chamada por aprovar.html, sem login nenhum do
        // Colmeia (ver Aprovacao.gs). Só o código aleatório protege.
        output = buscarAprovacaoPublica(body.codigo);
      } else if (body.acao === 'responderAprovacaoPublica') {
        output = responderAprovacaoPublica(body.codigo, body.aprovado, body.respostaTexto, body.pins, body.quemRespondeu);
      } else if (body.acao === 'responderPecaAprovacaoPublica') {
        // M5 (2026-08-05): resposta POR PEÇA, usada quando o link tem mais
        // de uma (ver Aprovacao.gs) — também PÚBLICA, mesmo código protege.
        output = responderPecaAprovacaoPublica(body.codigo, body.indicePeca, body.aprovado, body.respostaTexto, body.pins, body.quemRespondeu);
      } else if (body.acao === 'avisarQueVaiConsultar') {
        // PÚBLICA — chamada por aprovar.html, mesmo modelo das de cima.
        output = avisarQueVaiConsultar(body.codigo);
      } else if (body.acao === 'listarAprovacoesDoCliente') {
        output = listarAprovacoesDoCliente(body.cliente);
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
      } else if (body.acao === 'painelLerEstado') {
        // A página "Painel de Designers" do coordenador (js/pagina-painel-designers.js)
        // — ponte pro Apps Script separado que ainda guarda esse dado. Ver
        // o comentário grande no topo de PainelDesigners.gs.
        output = painelLerEstado();
      } else if (body.acao === 'painelSalvarEstado') {
        output = painelSalvarEstado(body.dados);
      } else if (body.acao === 'painelListarClientesParaVinculo') {
        output = painelListarClientesParaVinculo();
      } else if (body.acao === 'painelLinkarClientes') {
        output = painelLinkarClientes(body.nomes);
      } else if (body.acao === 'painelDesvincularCliente') {
        output = painelDesvincularCliente(body.nomeOrigem);
      } else if (body.acao === 'painelAtividadesRecentes') {
        output = painelAtividadesRecentes();
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
      } else if (body.acao === 'diagnosticoTemp2026_08_20') {
        // TEMPORÁRIO — ver RunrunEscrita.gs. Remover esta rota junto da função.
        output = diagnosticoAlterarDataEntregaHTTP(body.taskId, body.novaData, body.autor);
      } else if (body.acao === 'alterarEntrega') {
        output = alterarDataEntregaTarefa(body.taskId, body.novaData, body.autor);
      } else if (body.acao === 'alterarPublicacao') {
        output = alterarDataPublicacaoTarefa(body.taskId, body.novaData, body.autor);
      } else if (body.acao === 'ajustarEstimativa') {
        output = ajustarEstimativaTarefa(body.taskId, body.minutos, body.autor);
      } else if (body.acao === 'buscarExtrasRunrunCompleto') {
        output = buscarExtrasRunrunCompleto();
      } else if (body.acao === 'listarAprovacoesPendentes') {
        output = listarAprovacoesPendentes();
      } else if (body.acao === 'listarPecasDaAprovacao') {
        output = listarPecasDaAprovacao(body.codigo);
      } else if (body.acao === 'definirPecasOcultas') {
        output = definirPecasOcultas(body.codigo, body.indices);
      } else if (body.acao === 'listarPessoasDoRunrunSemAcesso') {
        output = listarPessoasDoRunrunSemAcesso();
      } else if (body.acao === 'listarPessoasDoLogin') {
        output = listarPessoasDoLogin();
      } else if (body.acao === 'salvarPessoaDoLogin') {
        output = salvarPessoaDoLogin(body);
      } else if (body.acao === 'removerPessoaDoLogin') {
        output = removerPessoaDoLogin(body.nome);
      } else if (body.acao === 'substituirPessoaDoLogin') {
        output = substituirPessoaDoLogin(body.nomeAntigo, body.novos);
      } else if (body.acao === 'loginComGoogle') {
        output = loginComGoogle(body.credential);
      } else if (body.acao === 'registrarErroDoApp') {
        output = registrarErroDoApp(body);
      } else if (body.acao === 'registrarTelaAberta') {
        output = registrarTelaAberta(body);
      } else if (body.acao === 'listarErrosRecentes') {
        output = listarErrosRecentes(body.limite);
      } else if (body.acao === 'listarUsoDasTelas') {
        output = listarUsoDasTelas(body.dias);
      } else if (body.acao === 'buscarFeedEventos') {
        output = buscarFeedEventos(body.designer);
      } else if (body.acao === 'relatorioDiarioDesigner') {
        output = relatorioDiarioDesigner(body.designer, body.dataISO);
      } else if (body.acao === 'listarRepasseIgnorados') {
        output = listarRepasseIgnorados(body.designer);
      } else if (body.acao === 'ignorarNoRepasse') {
        output = ignorarNoRepasseBackend(body.designer, body.taskIds);
      } else if (body.acao === 'desfazerIgnorarNoRepasse') {
        output = desfazerIgnorarNoRepasse(body.designer, body.taskId);
      } else if (body.acao === 'listarUsuarios') {
        output = listarTodosUsuariosRunrun();
      } else if (body.acao === 'listarPessoas') {
        output = listarPessoasSalvas();
      } else if (body.acao === 'salvarPessoa') {
        output = salvarPessoa(body.nome, body.foto, body.aliases, body.discord, body.emails);
      } else if (body.acao === 'excluirPessoasPorNomes') {
        output = excluirPessoasPorNomes(body.nomes);
      } else if (body.acao === 'sugerirVinculosDeEmail') {
        output = sugerirVinculosDeEmail();
      } else if (body.acao === 'vincularEmailAPessoa') {
        output = vincularEmailAPessoa(body.pessoa, body.email);
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
      } else if (body.acao === 'baixarArquivoDrive') {
        output = baixarArquivoDrive(body.fileId);
      } else if (body.acao === 'baixarPecasEmZip') {
        output = baixarPecasEmZip(body.fileIds);
      } else if (body.acao === 'urlsPublicasDasPecas') {
        // `atualizados` (fileId -> data no Drive) é opcional: quem tem o
        // dado manda, e aí a cópia devolvida é garantidamente a da versão
        // certa. Ver o aviso em urlsPublicasDasPecas, Storage.gs.
        output = urlsPublicasDasPecas(body.fileIds, body.atualizados);
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
      } else if (body.acao === 'buscarTermometroClientes') {
        output = buscarTermometroClientes();
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

      // Anota no feed da aba Bee o que acabou de acontecer (ver
      // registrarEventosDoFeed logo abaixo e a explicação em Planilha.gs).
      if (output && output.ok) registrarEventosDoFeed(body, output);
    } else {
      output = { ok: false, error: 'Use ?tipo=tarefas pra buscar o quadro.' };
    }
  } catch (err) {
    output = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Traduz "a ação X acabou de dar certo" em linhas no feed de quem
 * interessa (ver registrarEventoFeed, Planilha.gs).
 *
 * Os dados de contexto (de quem é a tarefa, qual o título) vêm no próprio
 * `body` que o front-end mandou — ele já tem tudo isso na mão na hora do
 * clique, e assim nenhuma função de escrita precisou mudar de assinatura
 * só pra alimentar o feed. Campo que o front-end não mandar simplesmente
 * não vira evento, em vez de gravar linha pela metade.
 *
 * registrarEventoFeed já ignora sozinho o caso "autor == dono" (ninguém
 * precisa ser avisado do que acabou de fazer).
 */
function registrarEventosDoFeed(body, output) {
  try {
    var dono = body.donoDaTarefa;   // de quem é a tarefa (quem vai ver)
    // `autorDoFeed`, e NÃO `autor`: esse último decide com qual conta do
    // Runrun.it a ação é feita (tokenRunrunDoAutor) — mandá-lo em ações
    // que hoje não o mandam trocaria a conta que comenta/repassa de
    // verdade. O feed precisa de um campo só dele, sem efeito colateral.
    var autor = body.autorDoFeed || '';
    var titulo = body.tituloDaTarefa || '';

    if (body.acao === 'definirPrioridade' && dono) {
      registrarEventoFeed(dono, 'prioridade', autor, body.taskId, titulo, body.prioridade || '');

    } else if ((body.acao === 'adicionarComentario' || body.acao === 'adicionarComentarioComAnexo') && dono) {
      // Só um pedaço do texto: o feed mostra a prévia, o comentário
      // inteiro continua sendo lido no card (é lá que ele mora de verdade).
      var previa = String(body.texto || '').substring(0, 220);
      registrarEventoFeed(dono, 'comentario', autor, body.taskId, titulo, previa);

    } else if (body.acao === 'avancarWorkflow') {
      // Quem RECEBEU a tarefa é o novo responsável, e isso quem diz é a
      // resposta do Runrun.it — não o front-end.
      var recebeu = output && output.novoResponsavel;
      if (recebeu) registrarEventoFeed(recebeu, 'recebida', autor, body.taskId, titulo, '');

    } else if (body.acao === 'reatribuir' && body.nomeDoNovoResponsavel) {
      registrarEventoFeed(body.nomeDoNovoResponsavel, 'recebida', autor, body.taskId, titulo, '');
    }
  } catch (e) { /* feed é extra: nunca pode derrubar a resposta da ação */ }
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
    guardarFotoDoQuadro(resultado);
    return resultado;
  } catch (err) {
    // O Runrun.it não respondeu. Antes isso era o fim da linha — tela de
    // erro e pronto. Agora tenta a última foto conhecida: um quadro de
    // alguns minutos atrás, avisando que é isso, é muito mais útil do que
    // nada (ver foto_do_quadro, supabase/09-foto-do-quadro.sql).
    var foto = lerFotoDoQuadro();
    if (foto) {
      return {
        ok: true,
        tarefas: foto.tarefas,
        colunas: foto.colunas,
        // O front usa estes dois pra dizer, na tela, que o que está ali é
        // retrato e de quando — sem isso a foto se passaria por atual, que
        // é justamente o risco que essa escolha de arquitetura evita.
        daFoto: true,
        fotoQuando: foto.quando,
        runrunFora: runrunPareceForaDoAr()
      };
    }
    // `runrunFora` separa "o Runrun.it caiu" de "deu algum outro erro" —
    // é o que deixa o front mostrar a faixa explicando a situação em vez
    // de uma mensagem técnica que ninguém entende (ver
    // runrunPareceForaDoAr, RunrunLeitura.gs).
    return {
      ok: false,
      runrunFora: runrunPareceForaDoAr(),
      error: 'Erro ao buscar tarefas do Runrun.it: ' + err.message
    };
  }
}

// ---------------------------------------------------------------------
// A FOTO DO QUADRO (2026-08-11)
//
// O Colmeia já guardava um retrato do quadro no localStorage de cada
// navegador, pra abrir instantâneo em vez de esperar o Apps Script
// acordar (salvarSnapshotDoQuadro, js/pessoas-fotos.js). O problema é que
// essa foto só existia pra quem JÁ tinha aberto naquele aparelho: quem
// entrava de um computador novo, do celular, ou depois de limpar o
// navegador, continuava esperando — e quando o Runrun.it caía, ninguém
// tinha o que ver.
//
// Agora ela também mora no Supabase, num lugar só, que todo mundo
// alcança. É a MESMA foto, com o mesmo papel: aparece antes do dado real
// e sai de cena assim que ele chega.
//
// ⚠️ ISTO NÃO É UMA CÓPIA DAS TAREFAS. A diferença importa: uma cópia
// seria lida no lugar do Runrun.it e poderia discordar dele sem ninguém
// perceber. Esta foto nunca é lida quando o Runrun.it responde, e quando
// é lida vai sempre marcada com a hora em que foi tirada.
// ---------------------------------------------------------------------

var FOTO_QUADRO_TABELA = 'foto_do_quadro';
var FOTO_QUADRO_ID = 'quadro';
// De quanto em quanto tempo vale regravar. A varredura acontece a cada
// 45s (o cache acima); gravar em todas seria uma escrita por varredura
// pra uma foto que quase não mudou. Dois minutos é fino: é muito menos
// que o tempo em que uma foto ainda é útil.
var FOTO_QUADRO_INTERVALO_MS = 2 * 60 * 1000;

/**
 * Guarda o retrato da varredura que acabou de dar certo.
 *
 * Nunca estoura e nunca atrasa a resposta de propósito: se o Supabase
 * estiver fora, ou nem configurado, o quadro tem que continuar
 * funcionando exatamente como funcionava antes desta função existir.
 */
function guardarFotoDoQuadro(resultado) {
  try {
    if (!supabaseConfigurado()) return;
    if (!resultado || !resultado.tarefas || !resultado.tarefas.length) return;

    var props = PropertiesService.getScriptProperties();
    var ultima = Number(props.getProperty('FOTO_QUADRO_ULTIMA') || 0);
    var agora = new Date().getTime();
    if (agora - ultima < FOTO_QUADRO_INTERVALO_MS) return;
    // Marca ANTES de gravar: se a gravação demorar ou falhar, o que não
    // pode acontecer é toda requisição seguinte tentar de novo em fila.
    props.setProperty('FOTO_QUADRO_ULTIMA', String(agora));

    supabaseSalvar(FOTO_QUADRO_TABELA, {
      id: FOTO_QUADRO_ID,
      quando: agora,
      tarefas: resultado.tarefas,
      colunas: resultado.colunas || []
    });
  } catch (e) {
    // Guardar a foto é um extra. Falhar aqui não pode tirar o quadro do ar.
  }
}

/**
 * A última foto conhecida, ou null se não houver nenhuma (ou se ela for
 * velha demais pra ajudar alguém).
 */
function lerFotoDoQuadro() {
  try {
    if (!supabaseConfigurado()) return null;
    var r = supabaseBuscar(FOTO_QUADRO_TABELA,
      'select=quando,tarefas,colunas&id=eq.' + FOTO_QUADRO_ID);
    if (!r.ok || !r.dados || !r.dados.length) return null;

    var foto = r.dados[0];
    if (!foto.tarefas || !foto.tarefas.length) return null;
    // Quadro de ontem não ajuda ninguém e atrapalha: mostraria tarefas já
    // entregues como se estivessem abertas. Mesma validade da foto que
    // mora no navegador (SNAPSHOT_QUADRO_VALIDADE_MS, js/pessoas-fotos.js).
    if (new Date().getTime() - Number(foto.quando || 0) > 24 * 60 * 60 * 1000) return null;

    return { quando: Number(foto.quando), tarefas: foto.tarefas, colunas: foto.colunas || [] };
  } catch (e) {
    return null;
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
    // O calendário de postagens (AprovacaoInterna.gs) é montado a partir
    // dessa mesma varredura e guardado por 10 min — sem limpar aqui, uma
    // data de publicação recém-mudada continuaria aparecendo no dia velho.
    var chaves = [CACHE_QUADRO_CHAVE + '_n', CACHE_CARD_MAE_ABERTOS, CALENDARIO_CACHE_CHAVE];
    for (var i = 0; i < total; i++) chaves.push(CACHE_QUADRO_CHAVE + '_' + i);
    cache.removeAll(chaves);
  } catch (e) { /* sem cache pra limpar, segue */ }
}
