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
const PONTO_URL: &str = "https://app.mywork.com.br/ponto";
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

// Abre o painel do ponto, ou fecha se já estiver aberto. `async` é
// obrigatório: criar uma telinha dentro de um comando comum trava o Windows.
// O login do ponto fica guardado (é o mesmo armazenamento do programa), então
// ao reabrir o painel normalmente já está logado.
#[tauri::command]
async fn alternar_ponto(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(wv) = app.get_webview("ponto") {
        wv.close().map_err(|e| e.to_string())?;
        return Ok(false);
    }
    let window = app.get_window("main").ok_or("janela não encontrada")?;
    let url: Url = PONTO_URL.parse().map_err(|_| "endereço inválido".to_string())?;
    window
        .add_child(
            WebviewBuilder::new("ponto", WebviewUrl::External(url)),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(LARGURA_PONTO, 400.0),
        )
        .map_err(|e| e.to_string())?;
    ajustar(&window);
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
        .invoke_handler(tauri::generate_handler![alternar_ponto])
        .setup(|app| {
            let handle = app.handle().clone();
            let window = WindowBuilder::new(app, "main")
                .title("Colmeia")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1000.0, 650.0)
                .build()?;

            let colmeia = WebviewBuilder::new("main", WebviewUrl::External(SITE.parse().unwrap()))
                .initialization_script(SCRIPT)
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
