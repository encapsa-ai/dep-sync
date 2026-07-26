pub mod commands;
pub mod config;
pub mod export;
pub mod graph;
pub mod mutator;
pub mod scanner;
pub mod terminal;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_config,
            commands::save_config,
            commands::config_path,
            commands::scan_all,
            commands::compute_graph,
            commands::preview_sync,
            commands::apply_sync,
            commands::bump_patch,
            commands::open_terminal,
            commands::pick_folder,
            commands::inspect_package,
            commands::reveal_config,
            commands::open_package_path,
            commands::export_graph,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dep-sync");
}
