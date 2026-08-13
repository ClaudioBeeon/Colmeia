// Por pessoa também (ver chaveLogNotificacoes, js/notificacoes-avisos.js):
// "eu já dispensei esse aviso" é de quem está logado, não do computador.
// Um arquivo é identificado pela pasta + nome + quando entrou. O "quando"
// faz parte de propósito: subir um arquivo com o MESMO nome de novo (o
// caso mais comum aqui — "Feed.png" corrigido) é um upload novo e merece
// aviso novo, mesmo que o anterior tenha sido dispensado.
function chaveDeUmArquivo(pastaUrl, upload) {
  return pastaUrl + "::" + upload.arquivo + "@" + upload.quando;
}

function chaveUploadVisto(link) {
  return "colmeia_upload_visto_" + normalizarParaComparar(DESIGNER_LOGADO || "sem-login") + "_" + link;
}
function uploadJaVisto(link) {
  // "Existe a chave" = já foi visto, não importa o valor guardado nela.
  // marcarUploadVisto guarda a DATA (pra dar pra limpar depois, ver
  // limparLixoAntigoDoNavegador), não mais o texto fixo "1" — esse
  // checagem aqui tinha ficado pra trás comparando com "1" e nunca mais
  // batia com nada, então "Dispensar"/"Adicionar ao comentário" marcava
  // certinho, mas a notificação nunca ficava de fato marcada como vista
  // e voltava sozinha no próximo poll (8s).
  try { return localStorage.getItem(chaveUploadVisto(link)) !== null; } catch (err) { return false; }
}
function marcarUploadVisto(link) {
  // Guarda QUANDO foi dispensado (não só "1") pra dar pra limpar depois —
  // ver limparLixoAntigoDoNavegador. Continua sendo lido como "existe a
  // chave = já foi visto", então valores antigos ("1") seguem valendo.
  try { localStorage.setItem(chaveUploadVisto(link), String(Date.now())); } catch (err) { /* sem problema */ }
}

/**
 * Apaga do navegador as marcações antigas de "upload já dispensado" e de
 * "chat já lido". Essas duas listas nunca eram limpas: nascia uma chave
 * por conjunto de arquivos e uma por tarefa, e elas ficavam ali pra
 * sempre, fazendo o espaço guardado do navegador só crescer.
 *
 * Regras: upload dispensado só interessa por alguns dias (a notificação
 * dele só existe por 3 horas de qualquer forma); "chat já lido" é apagado
 * quando fica muito velho, mantendo um limite de quantidade — se um dia
 * uma tarefa antiga for reaberta, o pior que acontece é o pontinho de
 * "não lido" aparecer uma vez a mais.
 */
const LIXO_UPLOAD_VISTO_MS = 7 * 24 * 60 * 60 * 1000;  // 7 dias
const MAX_CHAVES_CHAT_VISTO = 400;

function limparLixoAntigoDoNavegador() {
  try {
    // Log de notificações da época em que a chave era uma só pro navegador
    // inteiro (sem o nome da pessoa). Agora cada um tem a sua — esse
    // sobrou e não é lido por ninguém, só ocupa espaço.
    localStorage.removeItem("colmeia_notificacoes_log_v2");

    const agora = Date.now();
    const chatVistos = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (!chave) continue;
      if (chave.startsWith("colmeia_upload_visto_")) {
        const quando = Number(localStorage.getItem(chave));
        // Valor antigo ("1") não tem data: conta como velho e sai fora.
        if (!quando || (agora - quando) > LIXO_UPLOAD_VISTO_MS) chatVistos.push(chave);
      }
    }
    chatVistos.forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* segue */ } });

    // "Chat já lido": não tem data guardada (é o id do último comentário
    // visto), então a poda é por quantidade — mantém as mais recentes do
    // fim da lista e descarta o excesso.
    const chaves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave && chave.startsWith("colmeia_chat_visto_")) chaves.push(chave);
    }
    if (chaves.length > MAX_CHAVES_CHAT_VISTO) {
      chaves.slice(0, chaves.length - MAX_CHAVES_CHAT_VISTO)
        .forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* segue */ } });
    }
  } catch (err) {
    // Navegador sem acesso ao armazenamento (aba privada, por exemplo) —
    // não tem lixo pra limpar mesmo.
  }
}

/**
 * Mostra, dentro da aba Comentários, um aviso pra cada pasta onde o
 * designer logado subiu arquivo recentemente pro cliente dessa tarefa
 * — junto com "Copiar link" e "Ver", pra não precisar catar a pasta
 * certa no Drive na mão. Pode aparecer mais de um (ex: PSD numa pasta,
 * PNG em outra).
 *
 * Checa direto a pasta do card (Code.gs > buscarUploadsRecentesDoCard),
 * em vez do cache de 10 minutos do painel-designers-beeon — como o
 * Colmeia já sabe exatamente qual é a pasta dessa tarefa, a checagem é
 * instantânea (olha só 1 pasta, não o Drive inteiro).
 */
/**
 * Antes, a checagem de "você subiu um arquivo na pasta do card" só
 * rodava uma vez, no momento de abrir a tarefa — se o upload no Drive
 * acontecesse só depois (ex: em outra aba), a notificação nunca mais
 * aparecia até fechar e reabrir a tarefa. Agora, enquanto o pop-up da
 * tarefa fica aberto, o Colmeia rechecha sozinho a cada poucos
 * segundos (e também na hora, assim que a aba volta a ficar em foco —
 * o momento mais comum de ter acabado de subir algo no Drive em outra
 * aba/janela e voltado pro Colmeia pra copiar o link).
 */
/**
 * "Há quanto tempo esse arquivo subiu", do jeito que o Cláudio pediu:
 * de 10 em 10 segundos até 1 minuto, depois de minuto em minuto. Passou
 * de JANELA_NOTIFICACAO_UPLOAD_MS (30 min), o arquivo já não conta mais e
 * a notificação some sozinha.
 */
function idadeDoUpload(quando) {
  const segundos = Math.max(0, Math.floor((Date.now() - quando) / 1000));
  if (segundos < 60) return `${Math.floor(segundos / 10) * 10}s`;
  return `${Math.floor(segundos / 60)}min`;
}

/**
 * Mantém os "10s / 20s / 3min" da notificação andando sem redesenhar a
 * notificação inteira — só troca o texto de cada etiqueta. Redesenhar
 * faria a fala da Bee piscar a cada 10 segundos.
 */
let _intervalIdadeUpload = null;
function iniciarRelogioDasIdadesDeUpload() {
  clearInterval(_intervalIdadeUpload);
  _intervalIdadeUpload = setInterval(() => {
    const etiquetas = document.querySelectorAll("#beeUploadAviso .upload-notif-idade");
    if (!etiquetas.length) { clearInterval(_intervalIdadeUpload); _intervalIdadeUpload = null; return; }
    etiquetas.forEach(el => {
      const quando = Number(el.dataset.quando);
      // Passou da janela? A notificação inteira já não vale mais.
      if (Date.now() - quando >= JANELA_NOTIFICACAO_UPLOAD_MS) {
        document.getElementById("beeUploadAviso")?.remove();
        return;
      }
      el.textContent = idadeDoUpload(quando);
    });
  }, 10000);
}

let _intervalChecagemUpload = null;
function iniciarChecagemUploadEmSegundoPlano(task) {
  pararChecagemUploadEmSegundoPlano();
  if (!task.id) return;
  _intervalChecagemUpload = setInterval(() => {
    // Compara por id, não por referência — atualizarKanbanEmBackground()
    // recria os objetos de tarefa periodicamente, então "task" (capturado
    // no momento de abrir o card) deixa de ser === tasks[detailIdx] mesmo
    // continuando sendo a mesma tarefa. Isso fazia a checagem se
    // autodesligar sozinha pouco depois de abrir o card.
    const atual = tasks[detailIdx];
    if (!atual || String(atual.id) !== String(task.id)) { pararChecagemUploadEmSegundoPlano(); return; }
    renderNotificacoesUpload(atual);
  }, 8000);
}
function pararChecagemUploadEmSegundoPlano() {
  clearInterval(_intervalChecagemUpload);
  _intervalChecagemUpload = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && tasks[detailIdx] && tasks[detailIdx].id) {
    renderNotificacoesUpload(tasks[detailIdx]);
  }
});

// Ícone genérico (mesma linha visual dos outros ícones de config.js) pra
// preencher o quadradinho do mosaico enquanto a miniatura de verdade não
// chegou, e pra ficar como está em arquivo que não é imagem (PSD, MP4...)
// — nesses casos não existe miniatura pra buscar, então o ícone fica
// sozinho ali de propósito, em vez de a célula ficar vazia.
const iconeArquivoGenerico = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><path d="M21 15l-5.5-5.5L6 19" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

async function renderNotificacoesUpload(task) {
  const avisos = document.getElementById("beeInlineAvisos");
  if (!avisos || !task.id) return;

  const resultado = await chamarBackend({ acao: "buscarUploadsRecentesDoCard", taskId: task.id, cliente: task.client });
  if (caiuARede(resultado)) return; // não chegou: deixa a tela como está
  // Compara por id, não por referência (mesmo motivo do comentário acima).
  if (!tasks[detailIdx] || String(tasks[detailIdx].id) !== String(task.id)) return; // trocou de tarefa enquanto carregava
  if (!resultado.ok || !resultado.uploads || !resultado.pastaUrl) {
    document.getElementById("beeUploadAviso")?.remove();
    return;
  }

  const agora = Date.now();
  const arquivosRelevantes = resultado.uploads
    .filter(u =>
      // Antes exigia bater o nome de quem subiu com o designer logado —
      // mas em Drives Compartilhados o Google não expõe o dono do
      // arquivo (vem null), então essa checagem falhava sempre e a
      // notificação nunca aparecia. Como essa pasta já é específica
      // dessa tarefa, qualquer upload recente aqui é relevante — só
      // exclui se souber com certeza que foi outra pessoa.
      (u.quem === null || u.quem === undefined || nomesCorrespondem(u.quem, DESIGNER_LOGADO)) &&
      (agora - u.quando) < JANELA_NOTIFICACAO_UPLOAD_MS
    )
    // "Já dispensei" é por ARQUIVO, não pelo conjunto todo.
    //
    // Antes a chave de dispensado era a lista inteira de arquivos junta.
    // Como um arquivo sai da lista sozinho ao completar 30 minutos, o
    // conjunto mudava e virava uma chave nova — que obviamente não estava
    // marcada como dispensada, e a notificação voltava. Era isso que fazia
    // ela "sumir e voltar toda hora" por mais que fosse dispensada.
    //
    // Por arquivo, o tempo passando não ressuscita nada: some quando
    // dispensado e só volta se entrar um arquivo REALMENTE novo na pasta.
    .filter(u => !uploadJaVisto(chaveDeUmArquivo(resultado.pastaUrl, u)));

  if (arquivosRelevantes.length === 0) {
    document.getElementById("beeUploadAviso")?.remove();
    return;
  }

  // Continua existindo uma chave do conjunto, mas só pra saber se o que
  // está desenhado na tela ainda é a mesma coisa (ver `jaMostrando`
  // abaixo) — ela não decide mais nada sobre dispensar.
  const chaveConjunto = resultado.pastaUrl + "::" + arquivosRelevantes
    .map(u => u.arquivo + "@" + u.quando)
    .sort()
    .join("|");

  // Já mostrando esse MESMO conjunto de arquivos? Não redesenha de novo
  // a cada checagem de 8s — só piscaria a tela à toa.
  const jaMostrando = document.getElementById("beeUploadAviso");
  if (jaMostrando && jaMostrando.dataset.chave === chaveConjunto) return;

  const qtd = arquivosRelevantes.length;
  // Miniaturas em mosaico (tipo álbum de foto do WhatsApp) em vez da lista
  // vertical de antes — com upload em lote (4, 5, 9 arquivos de uma vez),
  // a lista esticava a fala e escondia a caixa de comentar embaixo, sem
  // scroll pra compensar. O mosaico tem altura FIXA sempre: até 4
  // miniaturas cabem nele; da 5ª em diante, a última célula vira um "+N"
  // por cima (protótipo aprovado pelo Cláudio em 2026-08-07). Clicar numa
  // miniatura de verdade abre ela ampliada (abrirImagemAmpliadaDoDrive,
  // js/config.js); clicar na célula "+N" abre a pasta inteira no Drive —
  // ela já não representa um arquivo só, então zoom nela não faria sentido.
  const ordenados = arquivosRelevantes.slice().sort((a, b) => (b.quando || 0) - (a.quando || 0));
  const LIMITE_MOSAICO = 4;
  const emMosaico = ordenados.slice(0, LIMITE_MOSAICO);
  const temMais = ordenados.length > LIMITE_MOSAICO;
  // Quando sobra gente de fora, é a partir do 4º arquivo que a célula vira
  // "+N" (os 3 primeiros continuam com miniatura de verdade) — por isso
  // N conta a partir do 3º, não do 4º.
  const escondidos = temMais ? ordenados.length - 3 : 0;
  const classeMosaico = ordenados.length === 1 ? "n1" : ordenados.length === 2 ? "n2" : ordenados.length === 3 ? "n3" : "n4plus";
  const mosaico = `
    <div class="upload-notif-mosaico ${classeMosaico}">
      ${emMosaico.map((u, i) => {
        const ehCelulaDoMais = temMais && i === emMosaico.length - 1;
        return `
          <div class="upload-notif-tile">
            <span class="upload-notif-tile-ic" aria-hidden="true">${iconeArquivoGenerico}</span>
            ${!ehCelulaDoMais && u.id && ehImagemPreviewable(u.mimeType) ? `
              <img class="upload-notif-thumb" data-file-id="${escaparHTML(u.id)}" data-nome="${escaparHTML(u.arquivo)}" alt="Preview de ${escaparHTML(u.arquivo)}">
            ` : ""}
            ${ehCelulaDoMais ? `<span class="upload-notif-tile-mais">+${escondidos}</span>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  `;
  // Um "há quanto tempo" só, do arquivo mais recente do grupo — enquanto
  // ele não passar da janela de 30min, ainda existe pelo menos um arquivo
  // válido aqui, então a fala continua fazendo sentido (ver
  // iniciarRelogioDasIdadesDeUpload, que remove a fala inteira quando essa
  // etiqueta expira).
  const maisRecente = ordenados[0].quando;
  // Nome de verdade da pasta (normalmente o título da tarefa) — o
  // backend não manda mais o texto fixo "pasta do card"; se por algum
  // motivo vier vazio, cai no título da própria tarefa como último recurso.
  const nomeDaPasta = resultado.pastaNome || task.title || "a pasta do card";
  const link = resultado.pastaUrl;

  // A notificação de upload não interrompe mais com pop-up nem com uma
  // caixinha separada — aparece como uma fala da própria Bee, dentro da
  // conversa (mesmo balão branco dos comentários), com "Adicionar ao
  // comentário"/"Ver" como ações dela. Pop-up (ilha) ficou reservado só
  // pra menção em comentário e tarefa recebida, ver pedido do Cláudio em
  // 2026-07-29 na memória "barra_amarela_dynamic_island".
  const corpo = `
    <p>Você adicionou ${qtd} arquivo${qtd > 1 ? "s" : ""} em <strong>${escaparHTML(nomeDaPasta)}</strong>${task.client ? ` <span class="upload-notif-cliente">(${escaparHTML(task.client)})</span>` : ""} <span class="upload-notif-idade" data-quando="${maisRecente}">${idadeDoUpload(maisRecente)}</span></p>
    ${mosaico}
    <div class="bee-pastilhas">
      <button type="button" class="bee-acao principal" data-upload-acao="aprovacao">Enviar para revisão</button>
      <button type="button" class="bee-acao" data-upload-acao="copiar">Adicionar ao comentário</button>
      <a class="bee-acao" href="${escaparHTML(link)}" target="_blank" rel="noopener">Ver</a>
      <button type="button" class="bee-acao" data-upload-acao="dispensar">Dispensar</button>
    </div>
  `;
  jaMostrando?.remove();
  avisos.insertAdjacentHTML("beforeend", `<div id="beeUploadAviso" data-chave="${escaparHTML(chaveConjunto)}">${bolhaDaBee(corpo, -1)}</div>`);

  // Dispensar marca CADA arquivo da lista, um por um — é isso que faz o
  // aviso ficar dispensado de verdade (ver chaveDeUmArquivo acima).
  const dispensarTodos = () => {
    arquivosRelevantes.forEach(u => marcarUploadVisto(chaveDeUmArquivo(resultado.pastaUrl, u)));
  };

  const wrap = document.getElementById("beeUploadAviso");
  wrap.querySelector('[data-upload-acao="dispensar"]').addEventListener("click", () => {
    dispensarTodos();
    wrap.remove();
  });
  wrap.querySelector('[data-upload-acao="copiar"]').addEventListener("click", () => {
    adicionarComentarioDeUpload(task, wrap, link, qtd, dispensarTodos);
  });
  // O caminho AUTOMÁTICO de mandar a peça pra conferência do atendimento:
  // aparece exatamente na hora em que a peça acabou de ficar pronta, sem
  // ninguém precisar lembrar de nada. O caminho manual é o botão "Pedir
  // aprovação do atendimento" no card (js/detalhe-modal.js) — este aviso
  // depende da varredura de 8s e some quando é dispensado, então não pode
  // ser o único jeito.
  //
  // Dispensa o aviso ao dar certo: pedido feito, o lembrete cumpriu o
  // papel. Se der errado, o aviso FICA — some sozinho seria perder o
  // caminho justo quando ele falhou.
  wrap.querySelector('[data-upload-acao="aprovacao"]').addEventListener("click", async (e) => {
    if (typeof pedirAprovacaoDoAtendimento !== "function") return;
    const deuCerto = await pedirAprovacaoDoAtendimento(task, e.currentTarget);
    if (!deuCerto) return;
    dispensarTodos();
    document.getElementById("beeUploadAviso")?.remove();
  });
  wrap.querySelectorAll(".upload-notif-thumb").forEach(img => {
    const fileId = img.dataset.fileId;
    carregarThumbnailDoUpload(fileId, img);
    img.addEventListener("click", () => abrirImagemAmpliadaDoDrive(fileId, img.dataset.nome));
  });
  // A célula "+N" abre a pasta inteira (ela representa vários arquivos,
  // não um só — não tem imagem individual pra ampliar).
  const tileMais = wrap.querySelector(".upload-notif-tile-mais");
  if (tileMais) {
    const tile = tileMais.closest(".upload-notif-tile");
    tile.classList.add("clicavel");
    tile.addEventListener("click", () => window.open(link, "_blank", "noopener"));
  }
  iniciarRelogioDasIdadesDeUpload();
}

/** É uma imagem (PNG/JPG/etc) que vale a pena tentar mostrar em preview? */
function ehImagemPreviewable(mimeType) {
  return !!mimeType && mimeType.indexOf("image/") === 0;
}

/**
 * Busca a miniatura de um arquivo do Drive e desenha ela no lugar do
 * quadradinho vazio que já está na tela. Se não der (sem miniatura,
 * erro, sem rede), o quadradinho some sozinho — não é grave o
 * suficiente pra virar mensagem de erro no meio da fala da Bee.
 */
async function carregarThumbnailDoUpload(fileId, imgEl) {
  const resultado = await chamarBackend({ acao: "buscarThumbnailDrive", fileId });
  if (!resultado || !resultado.ok || caiuARede(resultado)) { imgEl.remove(); return; }
  // O elemento pode ter saído da tela enquanto a miniatura vinha
  // (dispensou o aviso, ou a fala inteira foi redesenhada de novo) —
  // escrever nele nesse caso não aparece pra ninguém, mas não quebra nada.
  if (!imgEl.isConnected) return;
  imgEl.src = `data:${resultado.mimeType};base64,${resultado.base64}`;
  imgEl.classList.add("carregado");
}

/**
 * Põe o texto do link da pasta NA CAIXA de escrever — e só isso.
 *
 * Antes esse botão mandava o comentário direto pro Runrun.it no clique,
 * sem chance de revisar nem de completar a frase. Agora ele prepara a
 * mensagem e deixa o cursor no fim: quem decide enviar (e o que mais
 * escrever antes) é a pessoa. É a mesma regra que já vale pra Bee — nada
 * daqui vai pro Runrun.it sozinho.
 */
function adicionarComentarioDeUpload(task, wrap, link, qtd, dispensarTodos) {
  if (!task.id) return;
  const campo = document.getElementById("commentInput");
  if (!campo) return;

  const texto = `${qtd > 1 ? "Arquivos adicionados" : "Arquivo adicionado"} na pasta: ${link}`;
  // Se já tinha algo escrito, acrescenta em vez de apagar o que a pessoa
  // estava digitando.
  campo.value = campo.value.trim() ? `${campo.value.trim()} ${texto}` : texto;
  campo.focus();
  campo.setSelectionRange(campo.value.length, campo.value.length);

  // A notificação já cumpriu o papel dela — some, e não volta pra esses
  // mesmos arquivos.
  if (typeof dispensarTodos === "function") dispensarTodos();
  wrap?.remove();
}

/**
 * Depois de comentar numa subtarefa, pergunta se quer repetir o mesmo
 * comentário no card mãe também (evita ter que escrever duas vezes a
 * mesma coisa pro atendimento acompanhar).
 */
function mostrarPromptRepetirComentario(task, texto) {
  // Fica em #beeInlineAvisos, FORA da lista de mensagens, pelo mesmo
  // motivo da notificação de upload: a lista é redesenhada sozinha (a
  // cada recarga, a cada checagem) e levava esse aviso junto antes de dar
  // tempo de clicar em qualquer coisa.
  const avisos = document.getElementById("beeInlineAvisos");
  if (!avisos) return;

  const redesenhar = corpoHTML => {
    document.getElementById("beeRepetirPrompt")?.remove();
    avisos.insertAdjacentHTML("beforeend", `<div id="beeRepetirPrompt">${bolhaDaBee(corpoHTML, -1)}</div>`);
    return document.getElementById("beeRepetirPrompt");
  };

  const wrap = redesenhar(`
    <p>Repetir esse comentário no card mãe também?</p>
    <div class="bee-pastilhas">
      <button type="button" class="bee-acao principal" data-repetir="sim">Sim</button>
      <button type="button" class="bee-acao" data-repetir="nao">Não</button>
    </div>
  `);
  wrap.querySelector('[data-repetir="nao"]').addEventListener("click", () => wrap.remove());
  wrap.querySelector('[data-repetir="sim"]').addEventListener("click", async () => {
    redesenhar(`<p>Enviando pro card mãe...</p>`);
    const resultado = await enviarComentarioNoBackend(task.parentTaskId, texto);
    if (resultado.ok && !resultado.enfileirado) {
      // O comentário já foi pro Runrun.it certinho, mas a aba "Card mãe" do
      // chat (js/chat-comentarios.js) guarda os comentários em cache
      // (chatMaeCache) pra não rebuscar toda vez que troca de aba — sem
      // invalidar aqui, o comentário novo só apareceria depois de recarregar
      // a página inteira.
      chatMaeCache.delete(task.id);
      if (chatThreadAtivo === "mae" && tasks[detailIdx] && tasks[detailIdx].id === task.id) {
        recarregarThreadAtiva();
      }
    }
    // ⚠️ "enfileirado" NÃO é falha — é "sem internet agora, vai sozinho
    // quando voltar" (ver fila-offline.js). Dizer "não consegui" ali seria
    // mentira: o comentário está salvo e vai chegar, só não imediatamente.
    const mensagem = resultado.enfileirado
      ? "<p>Sem internet agora — vou repetir no card mãe assim que voltar.</p>"
      : resultado.ok ? "<p>✓ Repetido no card mãe.</p>" : "<p>Não consegui enviar pro card mãe.</p>";
    redesenhar(mensagem);
    setTimeout(() => { document.getElementById("beeRepetirPrompt")?.remove(); }, 2200);
  });
}

// ===== A FOTO DO PAINEL-DESIGNERS-BEEON, GUARDADA NO NAVEGADOR (2026-08-13) =====
//
// O PROBLEMA QUE ISTO RESOLVE, EM DOIS ATOS:
//
// 1. "Meus clientes" ficava preso pra sempre em "Carregando..." — sem
//    erro nenhum na tela, sem saída. `painelBeeonData` começa `null` e só
//    vira alguma coisa quando este fetch termina; se ele nunca terminar
//    (rede engasgada, VPN, proxy — o `fetch` do navegador NÃO tem prazo
//    próprio, ele espera pra sempre por padrão), a tela também espera pra
//    sempre. Não achei o motivo exato do engasgo no ambiente do Cláudio —
//    testado daqui, o mesmo endereço responde normal — mas o app não
//    pode depender de a rede dele nunca falhar.
// 2. "Toda vez que dou refresh demora muuuito" — cada F5 começava do
//    zero, sem nada na tela até a resposta chegar. O quadro do designer
//    já resolveu o mesmo problema com uma foto local (SNAPSHOT_QUADRO_KEY,
//    js/pessoas-fotos.js) — aqui é a mesma ideia, pro mesmo motivo.
//
// A SOLUÇÃO, em três partes:
//   a) PRAZO no fetch (AbortController, mesmo padrão de chamarBackend em
//      js/config.js) — 20s é generoso, mas é um FIM, que é o que faltava.
//   b) FOTO em localStorage, válida por 1 dia (pedido do Cláudio) — a
//      tela mostra ela na hora, e o fetch de verdade atualiza por cima
//      quando chegar. F5 nunca mais começa vazio.
//   c) ATUALIZA SOZINHO a cada 5 minutos (ver o `setInterval` no fim
//      deste arquivo) — pedido do Cláudio: "ir atualizando sozinho".
//
// ⚠️ Erro vira TELA DE ERRO só quando não há NADA pra mostrar (nem
// resposta nova, nem foto guardada) — é exatamente esse o caso que
// ficava preso sem saída. Havendo qualquer coisa pra mostrar, mesmo
// desatualizada, mostrar é sempre melhor que travar (mesma filosofia do
// aviso "Runrun.it fora do ar" no quadro: nunca esconder o que já se tem).
const PAINEL_BEEON_SNAPSHOT_KEY = "colmeia_snapshot_painel_beeon_v1";
const PAINEL_BEEON_SNAPSHOT_VALIDADE_MS = 24 * 60 * 60 * 1000; // 1 dia
const PAINEL_BEEON_TIMEOUT_MS = 20000;
const PAINEL_BEEON_REFRESH_MS = 5 * 60 * 1000;

let painelBeeonCarregando = false;
// true só quando a busca falhou E não sobrou NADA pra mostrar (nem uma
// foto velha) — é o gatilho da tela de erro em buildClientsPage().
let painelBeeonErro = false;

/**
 * A última foto boa, se existir e não estiver velha demais. Chamada antes
 * do fetch, pra a tela nunca abrir vazia.
 */
function restaurarSnapshotDoPainelBeeon() {
  try {
    const salvo = JSON.parse(localStorage.getItem(PAINEL_BEEON_SNAPSHOT_KEY) || "null");
    if (!salvo || !salvo.quando || !salvo.data) return false;
    if (Date.now() - salvo.quando > PAINEL_BEEON_SNAPSHOT_VALIDADE_MS) return false;
    painelBeeonData = salvo.data;
    return true;
  } catch (err) {
    return false;
  }
}

function salvarSnapshotDoPainelBeeon() {
  if (!painelBeeonData) return;
  try {
    localStorage.setItem(PAINEL_BEEON_SNAPSHOT_KEY, JSON.stringify({ quando: Date.now(), data: painelBeeonData }));
  } catch (err) {
    // Espaço do navegador cheio, ou aba privada: sem foto guardada, só
    // volta a abrir do zero da próxima vez — não é motivo pra travar nada.
  }
}

/**
 * Botão "Tentar de novo" da tela de erro — chamado de três lugares
 * (buildClientsPage, buildAtendimentoPage, renderPainelClientes), por
 * isso redesenha os três: só o `onclick` sabe qual botão foi clicado, não
 * qual tela precisa atualizar.
 */
function tentarDeNovoPainelBeeon() {
  painelBeeonErro = false;
  // Volta pro "Carregando..." na hora, sem esperar o fetch.
  buildClientsPage();
  buildAtendimentoPage();
  if (typeof configTabAtiva !== "undefined" && configTabAtiva === "clientes" && typeof renderPainelClientes === "function") {
    renderPainelClientes();
  }
  carregarDadosPainelBeeon();
}

async function carregarDadosPainelBeeon() {
  if (!PAINEL_BEEON_API_URL) return;
  // Chamada de novo enquanto a de antes ainda não voltou (o refresh
  // automático pode cair em cima de um F5 recente) — não empilha pedido.
  if (painelBeeonCarregando) return;
  painelBeeonCarregando = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAINEL_BEEON_TIMEOUT_MS);
  try {
    const res = await fetch(PAINEL_BEEON_API_URL, { signal: controller.signal });
    const resposta = await res.json();
    if (!resposta.ok) {
      console.error("Erro ao buscar dados do painel-designers-beeon:", resposta.error);
      return;
    }
    if (resposta.empty) {
      console.warn("O painel-designers-beeon respondeu, mas o estado está vazio (nada salvo lá ainda).");
      return;
    }

    // Log de diagnóstico — só na primeira carga, pra confirmarmos os
    // nomes exatos dos campos (principalmente onde ficam as fotos).
    console.log("[Colmeia] Estrutura recebida do painel-designers-beeon:", resposta.data);

    painelBeeonData = {
      designers: resposta.data.designers || [],
      roles: resposta.data.roles || {},
      state: resposta.data.state || {},
      photos: resposta.data.photos || {}, // designer -> URL da foto, confirmado no script.js do painel
      // Os dois de baixo só passaram a ser lidos aqui quando a página
      // "Painel de Designers" entrou no Colmeia (2026-08-10) — antes
      // ninguém do Colmeia precisava deles.
      colors: resposta.data.colors || {}, // designer -> {bg, fg}
      homeOffice: resposta.data.homeOffice || {}, // designer -> quantos já usou (0-6)
    };
    painelBeeonErro = false;
    salvarSnapshotDoPainelBeeon();

    // Depois de carregado, atualiza as páginas que dependem desses dados.
    // A bolinha da barra lateral também: a foto de quem está logado pode
    // vir daqui (painelBeeonData.photos), e não só do painel de Pessoas.
    atualizarAvatarDaSidebar();
    precarregarFotosConhecidas();
    buildClientsPage();
    buildAtendimentoPage();
    buildTiposPage();
    if (!document.getElementById("page-horas").hidden && typeof carregarAtividadesRecentesHoras === "function") carregarAtividadesRecentesHoras();
    // A aba "Clientes" das Configurações do coordenador também depende
    // deste dado — mesmo cuidado de "só redesenha se ainda estiver na
    // tela" que carregarPastasDriveSeNecessario já usa logo ali em cima.
    if (typeof configTabAtiva !== "undefined" && configTabAtiva === "clientes" && typeof renderPainelClientes === "function") {
      renderPainelClientes();
    }
    // A Central do Atendimento filtra por cliente→atendimento usando esse
    // mesmo painelBeeonData (ver centralClienteEhDoLogado, js/central-atendimento.js)
    // — se ela já tiver aberto e carregado ANTES desses dados chegarem
    // (corrida normal no login, as duas buscas saem juntas), redesenha
    // agora que o vínculo já existe, em vez de esperar a pessoa trocar de
    // aba pra o filtro valer.
    if (typeof centralAtendimentoAberta === "function" && centralAtendimentoAberta() && typeof centralRenderTudo === "function") {
      centralRenderTudo();
    }
  } catch (err) {
    // `AbortError` é o timeout estourando — mesma causa provável do
    // travamento que isto veio corrigir, só que agora com um fim.
    console.error("Falha ao conectar com o painel-designers-beeon:", err);
    // Só vira ERRO NA TELA se não sobrou nada pra mostrar. Com uma foto
    // (deste boot ou de um F5 anterior), a tela fica como está — desatualizada,
    // mas de pé — e o próximo refresh automático tenta de novo sozinho.
    if (!painelBeeonData) {
      painelBeeonErro = true;
      buildClientsPage();
      buildAtendimentoPage();
      buildTiposPage();
    }
  } finally {
    clearTimeout(timeout);
    painelBeeonCarregando = false;
  }
}

// Atualiza sozinho de tempos em tempos (pedido do Cláudio) — mesmo padrão
// do poll do quadro (js/kanban-polling.js): trava por DESIGNER_LOGADO pra
// uma aba esquecida na tela de login não ficar buscando à toa pra sempre.
setInterval(() => {
  if (!DESIGNER_LOGADO) return;
  carregarDadosPainelBeeon();
}, PAINEL_BEEON_REFRESH_MS);

/**
 * Tenta achar a foto de um designer nos dados vindos do painel-beeon.
 * Confirmado no código-fonte do painel: o campo se chama "photos"
 * (designer -> URL da foto).
 */
