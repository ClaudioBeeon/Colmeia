fn main() {
    // `alternar_ponto` é o único comando que o site do Colmeia pode chamar
    // aqui dentro (ver capabilities/main.json) — nada além disso.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["alternar_ponto"])),
    )
    .expect("erro ao preparar o Colmeia");
}
