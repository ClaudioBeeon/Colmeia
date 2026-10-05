// Colmeia desktop — uma MOLDURA em volta do site de verdade.
//
// De propósito não tem nenhuma tela própria: a janela abre
// https://colmeia.beeon.com.br/ e o site continua se atualizando sozinho
// (publicou no GitHub, todo mundo recebe). Este programa só cuida do que um
// navegador comum não faz: janela própria, uma instância só, lembrar tamanho
// e posição, e mandar links externos pro navegador de verdade.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const SITE: &str = "https://colmeia.beeon.com.br/";

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
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(SITE.parse().unwrap()))
                .title("Colmeia")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1000.0, 650.0)
                .initialization_script(SCRIPT)
                .on_navigation(move |url| {
                    if fica_no_app(url) {
                        return true;
                    }
                    let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    false
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao abrir o Colmeia");
}
