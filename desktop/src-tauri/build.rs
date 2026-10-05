fn main() {
    // `alternar_ponto` e `escolher_caminho` são os únicos comandos que o site do
    // Colmeia pode chamar aqui dentro (ver capabilities/main.json) — nada além disso.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["alternar_ponto", "escolher_caminho", "abrir_pasta_no_computador"])),
    )
    .expect("erro ao preparar o Colmeia");
}
