// Colmeia desktop — uma MOLDURA em volta do site de verdade.
//
// De propósito não tem nenhuma tela própria: a janela abre
// https://colmeia.beeon.com.br/ e o site continua se atualizando sozinho
// (publicou no GitHub, todo mundo recebe). Este programa só cuida do que um
// navegador comum não faz: janela própria, uma instância só, lembrar tamanho
// e posição, e mandar links externos pro navegador de verdade.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;
use tauri::{LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WindowEvent};
use tauri_plugin_opener::OpenerExt;

const SITE: &str = "https://colmeia.beeon.com.br/";

// O PONTO (2026-10-05). O site de ponto não pode ser mostrado dentro de uma
// página (manda X-Frame-Options: SAMEORIGIN), então ele vive numa SEGUNDA
// telinha nativa dentro da MESMA janela, encostada à direita. Ela começa
// abaixo da barra do topo (TOPO_PONTO) de propósito: assim o botão que abre
// o painel continua à vista pra fechá-lo.
// Começa na página INICIAL, não em /ponto: o site responde "página não
// encontrada" pra /ponto quando não há login, e a janelinha do ponto começa
// sem login. Depois de entrar, a pessoa vai ao ponto pelo próprio site, e o
// painel só ESCONDE ao fechar (não destrói), então ela continua onde parou.
const PONTO_URL: &str = "https://app.mywork.com.br/";
static PONTO_VISIVEL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
const LARGURA_PONTO: f64 = 460.0;
const TOPO_PONTO: f64 = 84.0;

// Acerta o tamanho das telinhas ao tamanho da janela. A do Colmeia ocupa
// tudo; a do ponto (quando existe) fica à direita.
fn ajustar(window: &tauri::Window) {
    let escala = window.scale_factor().unwrap_or(1.0);
    let Ok(tam) = window.inner_size() else { return };
    let largura = tam.width as f64 / escala;
    let altura = tam.height as f64 / escala;
    let app = window.app_handle();
    if let Some(wv) = app.get_webview("main") {
        let _ = wv.set_position(LogicalPosition::new(0.0, 0.0));
        let _ = wv.set_size(LogicalSize::new(largura, altura));
    }
    if let Some(wv) = app.get_webview("ponto") {
        let _ = wv.set_position(LogicalPosition::new((largura - LARGURA_PONTO).max(0.0), TOPO_PONTO));
        let _ = wv.set_size(LogicalSize::new(LARGURA_PONTO.min(largura), (altura - TOPO_PONTO).max(0.0)));
    }
}

// Abre o painel do ponto, ou esconde se já estiver aberto. `async` é
// obrigatório: criar uma telinha dentro de um comando comum trava o Windows.
// O login do ponto fica guardado (é o mesmo armazenamento do programa), então
// ao reabrir o painel normalmente já está logado.
#[tauri::command]
async fn alternar_ponto(app: tauri::AppHandle) -> Result<bool, String> {
    use std::sync::atomic::Ordering;
    let window = app.get_window("main").ok_or("janela não encontrada")?;
    if let Some(wv) = app.get_webview("ponto") {
        // Já existe: só alterna entre mostrar e esconder (mantém a página).
        if PONTO_VISIVEL.load(Ordering::SeqCst) {
            wv.hide().map_err(|e| e.to_string())?;
            PONTO_VISIVEL.store(false, Ordering::SeqCst);
            return Ok(false);
        }
        ajustar(&window);
        wv.show().map_err(|e| e.to_string())?;
        PONTO_VISIVEL.store(true, Ordering::SeqCst);
        return Ok(true);
    }
    let url: Url = PONTO_URL.parse().map_err(|_| "endereço inválido".to_string())?;
    window
        .add_child(
            WebviewBuilder::new("ponto", WebviewUrl::External(url)),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(LARGURA_PONTO, 400.0),
        )
        .map_err(|e| e.to_string())?;
    ajustar(&window);
    PONTO_VISIVEL.store(true, Ordering::SeqCst);
    Ok(true)
}

// Roda dentro do site, em toda página. O Colmeia abre links com
// window.open(..., "_blank") e <a target="_blank">; numa janela de programa
// isso não tem "outra aba" pra abrir. Aqui vira uma navegação comum, que o
// `on_navigation` logo abaixo intercepta e entrega ao navegador do
// computador — a janela do Colmeia nunca sai do lugar.
//
// ⚠️ window.open devolve um objeto (não `null`): o Colmeia usa o retorno pra
// saber se o navegador BLOQUEOU o popup (chat-comentarios.js) e mostraria um
// aviso falso de bloqueio se recebesse `null`.
const SCRIPT: &str = r#"
(function () {
  function abrir(u) {
    try { window.location.assign(new URL(u, window.location.href).href); } catch (e) {}
  }
  window.open = function (u) {
    if (u) abrir(u);
    return { closed: false, focus: function () {}, close: function () {} };
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && a.target === '_blank') { e.preventDefault(); abrir(a.href); }
  }, true);
})();
"#;

// Fica dentro da janela? Só o próprio Colmeia. As páginas que são do CLIENTE
// (aprovar, ajuste e os links curtos /adn/...) abrem no navegador, porque é
// assim que o cliente vai ver — conferir ali é conferir de verdade.
fn fica_no_app(url: &Url) -> bool {
    match url.scheme() {
        "about" | "blob" | "data" | "tauri" => return true,
        "https" | "http" => {}
        _ => return false, // adbps://, mailto:, etc. → quem abre é o sistema
    }
    match url.host_str() {
        Some("tauri.localhost") => true,
        Some("colmeia.beeon.com.br") => {
            let p = url.path();
            !(p.ends_with("/aprovar.html") || p.ends_with("/ajuste.html") || p.starts_with("/adn/"))
        }
        _ => false,
    }
}

// Abre a janelinha do Windows pra escolher um arquivo (ou pasta) e devolve o
// CAMINHO. É a única forma do Colmeia saber onde um arquivo está no
// computador: o site, sozinho, nunca recebe caminho. Começa no Drive
// (a letra do Drive no computador varia — procura a que tem a pasta
// `.shortcut-targets-by-id`). Devolve `None` se a pessoa cancelar.
#[tauri::command]
async fn escolher_caminho(app: tauri::AppHandle, pasta: bool) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut dialogo = app
        .dialog()
        .file()
        .set_title(if pasta { "Escolha a pasta" } else { "Escolha o arquivo" });
    for letra in 'D'..='Z' {
        let raiz = format!("{}:\\", letra);
        if std::path::Path::new(&format!("{}.shortcut-targets-by-id", raiz)).exists() {
            dialogo = dialogo.set_directory(raiz);
            break;
        }
    }
    let escolhido = if pasta { dialogo.blocking_pick_folder() } else { dialogo.blocking_pick_file() };
    match escolhido {
        None => Ok(None),
        Some(p) => p
            .into_path()
            .map(|c| Some(c.to_string_lossy().to_string()))
            .map_err(|e| e.to_string()),
    }
}

#[derive(serde::Deserialize)]
struct Passo {
    id: String,
    nome: String,
}

// Abre no Explorador de Arquivos a pasta do card, a partir da CADEIA de
// pastas do Drive (da do card até a mais de cima — ver
// `ancestraisDaPastaDoCard`, Drive.gs). Procura, do ancestral mais alto pro
// mais baixo, o primeiro cujo ID existe em `X:\.shortcut-targets-by-id\` e
// monta o resto pelos nomes. Dois formatos já vistos pro mesmo ID: a pasta
// aparece DENTRO do diretório do ID (`<ID>\<Nome>`) ou o próprio diretório do
// ID é a pasta — tenta os dois.
// Acha, no computador, a pasta do card a partir da CADEIA de pastas do Drive.
fn achar_pasta_local(cadeia: &[Passo]) -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    for letra in 'D'..='Z' {
        let base = PathBuf::from(format!("{}:\\.shortcut-targets-by-id", letra));
        if !base.is_dir() {
            continue;
        }
        for i in (0..cadeia.len()).rev() {
            let dir_id = base.join(&cadeia[i].id);
            if !dir_id.is_dir() {
                continue;
            }
            for raiz in [dir_id.join(&cadeia[i].nome), dir_id.clone()] {
                let mut alvo = raiz;
                for passo in cadeia[..i].iter().rev() {
                    alvo = alvo.join(&passo.nome);
                }
                if alvo.is_dir() {
                    return Some(alvo);
                }
            }
        }
    }
    None
}

#[tauri::command]
async fn abrir_pasta_no_computador(app: tauri::AppHandle, cadeia: Vec<Passo>) -> Result<String, String> {
    match achar_pasta_local(&cadeia) {
        Some(alvo) => {
            let texto = alvo.to_string_lossy().to_string();
            app.opener().open_path(texto.clone(), None::<&str>).map_err(|e| e.to_string())?;
            Ok(texto)
        }
        None => Err("Não achei essa pasta no Drive do computador. Ela pode ainda estar sincronizando, ou o Drive não está aberto.".to_string()),
    }
}

// ===== Criar projeto (Photoshop, Illustrator, Premiere...) a partir de um modelo =====
// O programa NÃO cria o arquivo do zero: copia um MODELO da pasta de modelos
// pra pasta do card, com o nome do card, e abre no programa que o Windows
// associa à extensão. Modelos prontos já nascem com tamanho, guias e perfil de
// cor certos — e um projeto do Premiere não dá pra gerar do nada de forma
// confiável.
const EXTENSOES_DE_PROJETO: [&str; 8] = ["psd", "psb", "psdt", "ai", "indd", "prproj", "aep", "mogrt"];

#[derive(serde::Serialize)]
struct Modelo {
    nome: String,
    caminho: String,
    ext: String,
    // Subpasta dentro da pasta de modelos (ex: "Photoshop", "Premiere").
    grupo: String,
}

// Lista os modelos da pasta (e das subpastas, até 2 níveis).
fn varrer_modelos(base: &std::path::Path, dir: &std::path::Path, nivel: u8, saida: &mut Vec<Modelo>) {
    let Ok(itens) = std::fs::read_dir(dir) else { return };
    for item in itens.flatten() {
        let caminho = item.path();
        if caminho.is_dir() {
            if nivel < 2 {
                varrer_modelos(base, &caminho, nivel + 1, saida);
            }
            continue;
        }
        let ext = caminho.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if EXTENSOES_DE_PROJETO.contains(&ext.as_str()) {
            saida.push(Modelo {
                nome: caminho.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_string(),
                caminho: caminho.to_string_lossy().to_string(),
                ext,
                grupo: dir
                    .strip_prefix(base)
                    .map(|r| r.to_string_lossy().replace('\\', " / "))
                    .unwrap_or_default(),
            });
        }
    }
}

// A pasta de modelos mais provável: "Meu Drive\\Modelos" no Drive do computador
// (a letra da unidade varia de máquina pra máquina, então procura em todas).
// Devolve `None` se não achar — aí o site pede pra pessoa escolher.
#[tauri::command]
async fn pasta_de_modelos_padrao() -> Result<Option<String>, String> {
    for letra in 'D'..='Z' {
        for meu_drive in ["Meu Drive", "My Drive"] {
            let candidata = std::path::PathBuf::from(format!("{}:\\{}\\Modelos", letra, meu_drive));
            if candidata.is_dir() {
                return Ok(Some(candidata.to_string_lossy().to_string()));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
async fn listar_modelos(pasta: String) -> Result<Vec<Modelo>, String> {
    let dir = std::path::PathBuf::from(&pasta);
    if !dir.is_dir() {
        return Err("A pasta de modelos não foi encontrada. Escolha de novo.".to_string());
    }
    let mut lista = Vec::new();
    varrer_modelos(&dir, &dir, 0, &mut lista);
    lista.sort_by(|a, b| a.nome.to_lowercase().cmp(&b.nome.to_lowercase()));
    Ok(lista)
}

// Nome de arquivo válido no Windows: troca os caracteres proibidos, tira
// ponto/espaço no fim e limita o tamanho.
fn nome_de_arquivo_seguro(nome: &str) -> String {
    let trocado: String = nome
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '-' } else { c })
        .collect();
    let aparado: String = trocado.trim().trim_end_matches(|c| c == '.' || c == ' ').chars().take(120).collect();
    if aparado.is_empty() { "Projeto".to_string() } else { aparado }
}

// Nunca sobrescreve: se já existe, vira "nome v2", "nome v3"...
fn caminho_livre(pasta: &std::path::Path, nome: &str, ext: &str) -> std::path::PathBuf {
    let primeiro = pasta.join(format!("{}.{}", nome, ext));
    if !primeiro.exists() {
        return primeiro;
    }
    let mut n = 2;
    loop {
        let candidato = pasta.join(format!("{} v{}.{}", nome, n, ext));
        if !candidato.exists() {
            return candidato;
        }
        n += 1;
    }
}

#[tauri::command]
async fn criar_projeto(app: tauri::AppHandle, cadeia: Vec<Passo>, modelo: String, nome: String) -> Result<String, String> {
    let origem = std::path::PathBuf::from(&modelo);
    let ext = origem.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !origem.is_file() || !EXTENSOES_DE_PROJETO.contains(&ext.as_str()) {
        return Err("O modelo não foi encontrado.".to_string());
    }
    let pasta = achar_pasta_local(&cadeia)
        .ok_or("Não achei a pasta do card no Drive do computador. Ela pode ainda estar sincronizando, ou o Drive não está aberto.")?;
    let destino = caminho_livre(&pasta, &nome_de_arquivo_seguro(&nome), &ext);
    std::fs::copy(&origem, &destino).map_err(|e| format!("Não consegui criar o arquivo: {}", e))?;
    let texto = destino.to_string_lossy().to_string();
    app.opener().open_path(texto.clone(), None::<&str>).map_err(|e| format!("O arquivo foi criado, mas não consegui abrir: {}", e))?;
    Ok(texto)
}

// ===== Navegador interno (2026-10-05) =====
// Cada site aberto pelo Acesso rápido vive numa telinha nativa dentro da
// janela do Colmeia (uma por site, criada na primeira vez que a aba é
// ativada). Elas dividem o mesmo armazenamento do programa — o login de cada
// site fica guardado. QUEM manda no tamanho e na posição é o site do Colmeia
// (JS), que mede o espaço livre da tela e avisa pelo `Retangulo`: assim o CSS
// continua sendo a única fonte da disposição, e dividir a tela é só mandar um
// retângulo menor. Os sites NÃO recebem nenhum comando do programa (a
// capability é só da janela do Colmeia).
#[derive(Default)]
struct Navegador {
    titulos: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[derive(serde::Deserialize, Clone, Copy)]
struct Retangulo {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(serde::Serialize)]
struct EstadoAba {
    url: String,
    titulo: String,
}

// Dentro de uma aba não existe "outra aba": links com target=_blank e
// window.open viram navegação na própria aba.
const SCRIPT_ABA: &str = r#"
(function () {
  function ir(u) { try { window.location.assign(new URL(u, window.location.href).href); } catch (e) {} }
  window.open = function (u) { if (u) ir(u); return { closed: false, focus: function () {}, close: function () {} }; };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[target="_blank"]');
    if (a && a.href) { e.preventDefault(); ir(a.href); }
  }, true);
})();
"#;

fn rotulo_aba(id: &str) -> String {
    let limpo: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    format!("aba-{}", limpo)
}

fn endereco_web(texto: &str) -> Result<Url, String> {
    let url: Url = texto.parse().map_err(|_| "Endereço inválido.".to_string())?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err("Só endereços http e https abrem aqui dentro.".to_string()),
    }
}

fn posicionar(wv: &tauri::Webview, r: Retangulo) {
    let _ = wv.set_position(LogicalPosition::new(r.x, r.y));
    let _ = wv.set_size(LogicalSize::new(r.w.max(1.0), r.h.max(1.0)));
}

fn esconder_abas(app: &tauri::AppHandle, menos: Option<&str>) {
    for (rotulo, wv) in app.webviews() {
        if rotulo.starts_with("aba-") && Some(rotulo.as_str()) != menos {
            let _ = wv.hide();
        }
    }
}

// Mostra a aba `id` (criando a telinha na primeira vez, com `url`) e esconde
// as outras.
#[tauri::command]
async fn nav_mostrar(app: tauri::AppHandle, id: String, url: Option<String>, ret: Retangulo) -> Result<(), String> {
    let alvo = rotulo_aba(&id);
    esconder_abas(&app, Some(&alvo));
    if let Some(wv) = app.get_webview(&alvo) {
        posicionar(&wv, ret);
        return wv.show().map_err(|e| e.to_string());
    }
    let window = app.get_window("main").ok_or("janela não encontrada")?;
    let inicial = endereco_web(&url.ok_or("faltou o endereço")?)?;
    let id_titulo = alvo.clone();
    let app_titulo = app.clone();
    let app_nav = app.clone();
    let app_baixar = app.clone();
    let builder = WebviewBuilder::new(&alvo, WebviewUrl::External(inicial))
        .initialization_script(SCRIPT_ABA)
        // Mesmo motivo da janela principal: sem isso o arrastar e soltar
        // DENTRO dos sites (enviar arquivo, mover cartão) não funciona.
        .disable_drag_drop_handler()
        .on_document_title_changed(move |_wv, titulo| {
            if let Ok(mut t) = app_titulo.state::<Navegador>().titulos.lock() {
                t.insert(id_titulo.clone(), titulo);
            }
        })
        .on_navigation(move |url| {
            match url.scheme() {
                "http" | "https" | "about" | "blob" | "data" => true,
                // mailto:, tel:, whatsapp:, adbps:... → quem abre é o sistema
                _ => {
                    let _ = app_nav.opener().open_url(url.as_str(), None::<&str>);
                    false
                }
            }
        })
        .on_download(move |_wv, evento| {
            // Deixa baixar (pasta Downloads) e, ao terminar, mostra o arquivo.
            if let tauri::webview::DownloadEvent::Finished { path: Some(p), success: true, .. } = evento {
                let _ = app_baixar.opener().reveal_item_in_dir(p);
            }
            true
        });
    let wv = window
        .add_child(builder, LogicalPosition::new(ret.x, ret.y), LogicalSize::new(ret.w.max(1.0), ret.h.max(1.0)))
        .map_err(|e| e.to_string())?;
    wv.show().map_err(|e| e.to_string())
}

// Volta pro Colmeia: esconde todas as abas (sem fechar — a página continua).
#[tauri::command]
async fn nav_esconder(app: tauri::AppHandle) -> Result<(), String> {
    esconder_abas(&app, None);
    Ok(())
}

#[tauri::command]
async fn nav_fechar(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let alvo = rotulo_aba(&id);
    if let Some(wv) = app.get_webview(&alvo) {
        wv.close().map_err(|e| e.to_string())?;
    }
    if let Ok(mut t) = app.state::<Navegador>().titulos.lock() {
        t.remove(&alvo);
    }
    Ok(())
}

// A janela mudou de tamanho (ou a tela foi dividida): reacomoda todas.
#[tauri::command]
async fn nav_posicionar(app: tauri::AppHandle, ret: Retangulo) -> Result<(), String> {
    for (rotulo, wv) in app.webviews() {
        if rotulo.starts_with("aba-") {
            posicionar(&wv, ret);
        }
    }
    Ok(())
}

// Endereço e título atuais da aba (o site do Colmeia pergunta de tempos em
// tempos pra mostrar na barra de endereço).
#[tauri::command]
async fn nav_estado(app: tauri::AppHandle, id: String) -> Result<Option<EstadoAba>, String> {
    let alvo = rotulo_aba(&id);
    let Some(wv) = app.get_webview(&alvo) else { return Ok(None) };
    let url = wv.url().map(|u| u.to_string()).unwrap_or_default();
    let titulo = app
        .state::<Navegador>()
        .titulos
        .lock()
        .ok()
        .and_then(|t| t.get(&alvo).cloned())
        .unwrap_or_default();
    Ok(Some(EstadoAba { url, titulo }))
}

// "voltar" | "avancar" | "recarregar" | "ir" (com `url`)
#[tauri::command]
async fn nav_comando(app: tauri::AppHandle, id: String, comando: String, url: Option<String>) -> Result<(), String> {
    let wv = app.get_webview(&rotulo_aba(&id)).ok_or("Essa aba ainda não foi aberta.")?;
    match comando.as_str() {
        "voltar" => wv.eval("history.back()").map_err(|e| e.to_string()),
        "avancar" => wv.eval("history.forward()").map_err(|e| e.to_string()),
        "recarregar" => wv.eval("location.reload()").map_err(|e| e.to_string()),
        "ir" => {
            let destino = endereco_web(&url.ok_or("faltou o endereço")?)?;
            wv.navigate(destino).map_err(|e| e.to_string())
        }
        _ => Err("Comando desconhecido.".to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        // Abrir o programa de novo só traz a janela que já existe pra frente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Navegador::default())
        .invoke_handler(tauri::generate_handler![
            alternar_ponto,
            escolher_caminho,
            abrir_pasta_no_computador,
            nav_mostrar,
            nav_esconder,
            nav_fechar,
            nav_posicionar,
            nav_estado,
            nav_comando,
            listar_modelos,
            criar_projeto,
            pasta_de_modelos_padrao
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let window = WindowBuilder::new(app, "main")
                .title("Colmeia")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1000.0, 650.0)
                .build()?;

            let colmeia = WebviewBuilder::new("main", WebviewUrl::External(SITE.parse().unwrap()))
                .initialization_script(SCRIPT)
                // ⚠️ OBRIGATÓRIO no Windows: com o tratador de arrastar do
                // Tauri ligado (o padrão), o arrastar e soltar do PRÓPRIO site
                // para de funcionar — cards do quadro, clientes entre
                // atendimentos, arquivo solto no card. Ver a documentação de
                // `disable_drag_drop_handler`.
                .disable_drag_drop_handler()
                .on_navigation(move |url| {
                    if fica_no_app(url) {
                        return true;
                    }
                    let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    false
                });
            let escala = window.scale_factor().unwrap_or(1.0);
            let tam = window.inner_size()?;
            window.add_child(
                colmeia,
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(tam.width as f64 / escala, tam.height as f64 / escala),
            )?;

            let w = window.clone();
            window.on_window_event(move |e| {
                if let WindowEvent::Resized(_) = e {
                    ajustar(&w);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao abrir o Colmeia");
}
