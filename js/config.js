// ============================================
// DADOS FAKE — só para visualização do protótipo.
// Nenhuma conexão real com planilha, Drive ou Runrun.it ainda.
// ============================================

const dueIcon = `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5-11-6.5z"/></svg>`;
const pauseIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const discordIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 6.3a15 15 0 00-3.6-1.1l-.2.4a13 13 0 013.1 1.1 12.6 12.6 0 00-11.9 0 13 13 0 013.1-1.1l-.2-.4A15 15 0 005.6 6.3C3.6 9.3 3 12.2 3.2 15a15 15 0 004.4 2.2l.6-1a9.6 9.6 0 01-1.7-.8l.4-.3a11.3 11.3 0 009.8 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1A15 15 0 0020.8 15c.3-3.2-.5-6.1-1.9-8.7zM9.7 13.4c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5zm4.6 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.4.7 1.3 1.5c0 .8-.6 1.5-1.3 1.5z"/></svg>`;
const chatIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 1112.6 6.5L4 21l1.9-6.1A7.96 7.96 0 014 12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const reopenIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 4v5h5M20 20v-5h-5M4.5 15a8 8 0 0014.5 3.5M19.5 9A8 8 0 005 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const columnsDef = [
  { key: "pendentes", label: "Pendentes", hex: "var(--text-muted)" },
  { key: "prioridades", label: "Prioridades", hex: "var(--danger)" },
  { key: "fazendo", label: "Fazendo", hex: "var(--accent)" },
  { key: "revisao", label: "Revisão", hex: "var(--purple)" },
  { key: "ajustes", label: "Ajustes", hex: "var(--warning)" },
];

// dia 24 = "hoje" na simulação
// (o "hoje" de verdade agora vem de hojeISO(), calculado dinamicamente)

// ============================================
// INTEGRAÇÃO REAL — Google Apps Script (Code.gs) + Runrun.it
// ============================================
// Cole aqui a URL do seu Web App do Apps Script depois de publicar o
// Code.gs (Implantar > Nova implantação > Aplicativo da web).
// Enquanto não colar, o Colmeia continua usando os dados fake abaixo.
const COLMEIA_API_URL = "https://script.google.com/macros/s/AKfycbxSKcto3u-463xmhUm2xGUIylkWzYyeU-L-QHEz0bnFPImsl7Vlum5bZJU5vDT-5gOI/exec";

// URL do Web App do painel-designers-beeon (o outro painel, já publicado).
// O Colmeia só faz leitura aqui — nunca escreve nada nesse painel.
const PAINEL_BEEON_API_URL = "https://script.google.com/macros/s/AKfycbzzWtG4jkVpLvPwOAHaj-h9KK9k_8N6YWGUXfFtUDSXRiCj7ILDPvuSy9VJXhglTrzEQQ/exec";

const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_COMPLETOS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
(function atualizarPillDeData() {
  const el = document.getElementById("topbarDateText");
  if (!el) return;
  const agora = new Date();
  el.textContent = `${agora.getDate()} ${MESES_COMPLETOS[agora.getMonth()]}`;
})();

// Guarda os dados lidos do painel-designers-beeon (designers, clientes,
// atendimento, fotos) depois que carregarDadosPainelBeeon() rodar.
// Formato: { designers: [...], roles: {...}, state: {...}, fotos: {...} }
let painelBeeonData = null;

/**
 * Busca (só leitura, GET) o estado completo do painel-designers-beeon:
 * lista de designers, papel/especialidade de cada um, e o mapa
 * designer -> lista de clientes (com escopo, atendimento, serviços etc).
 *
 * IMPORTANTE: nunca faz POST pra esse painel — só GET. O Colmeia não
 * altera nada lá.
 *
 * Na primeira vez, mostra no console do navegador (F12 > Console) a
 * estrutura crua que veio, pra confirmarmos onde ficam as fotos de
 * cada designer/cliente (o nome exato do campo pode variar).
 */
/**
 * Busca as atividades recentes do Drive (uploads de arquivo) que já
 * existem no painel-designers-beeon — mesmo cache que alimenta o card
 * "Atividade recente" de lá.
 *
 * NÃO é mais usada pela notificação de upload dentro do pop-up de
 * tarefa (ver renderNotificacoesUpload) — aquela agora checa a pasta
 * do próprio card direto pelo Code.gs do Colmeia (instantâneo, sem
 * depender do cache de 10 minutos do painel). Deixada aqui por se um
 * dia precisar de uma visão geral de atividades fora do contexto de
 * uma tarefa específica.
 */
async function buscarAtividadesPainelBeeon() {
  if (!PAINEL_BEEON_API_URL) return [];
  try {
    const res = await fetch(PAINEL_BEEON_API_URL + "?tipo=atividades");
    const data = await res.json();
    return data.ok ? (data.atividades || []) : [];
  } catch (err) {
    console.error("Falha ao buscar atividades do painel-beeon:", err);
    return [];
  }
}

// Só avisa sobre upload que aconteceu nas últimas 3 horas — depois
// disso não faz mais sentido como "notificação" do momento.
const JANELA_NOTIFICACAO_UPLOAD_MS = 3 * 60 * 60 * 1000;

