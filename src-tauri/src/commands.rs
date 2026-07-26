use crate::{
    config::{self, Config},
    export,
    graph::{self, GraphResult},
    mutator::{self, SyncPreview},
    scanner::{self, PackageInfo},
    terminal,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageIdentity {
    pub name: String,
    pub version: Option<String>,
}

#[tauri::command]
pub fn load_config() -> Result<Config, String> {
    config::load()
}

#[tauri::command]
pub fn save_config(config: Config) -> Result<(), String> {
    config::save(&config)
}

#[tauri::command]
pub fn config_path() -> Result<String, String> {
    config::config_path().map(|path| path.display().to_string())
}

#[tauri::command]
pub fn scan_all() -> Result<Vec<PackageInfo>, String> {
    let config = config::load()?;
    Ok(scanner::scan(&config))
}

#[tauri::command]
pub fn compute_graph(packages: Vec<PackageInfo>) -> Result<GraphResult, String> {
    Ok(graph::compute(&packages))
}

#[tauri::command]
pub fn preview_sync(package_name: String) -> Result<SyncPreview, String> {
    let config = config::load()?;
    mutator::preview_sync(&config, &package_name)
}

#[tauri::command]
pub fn apply_sync(package_name: String) -> Result<(), String> {
    let config = config::load()?;
    mutator::apply_sync(&config, &package_name)
}

#[tauri::command]
pub fn bump_patch(package_name: String) -> Result<String, String> {
    let config = config::load()?;
    mutator::bump_patch(&config, &package_name)
}

#[tauri::command]
pub fn open_terminal(package_name: String) -> Result<(), String> {
    let config = config::load()?;
    let package = find_package(&config, &package_name)?;
    terminal::open(&package.path, &config.settings)
}

#[tauri::command]
pub fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    picked
        .map(|path| {
            path.into_path()
                .map(|path| path.display().to_string())
                .map_err(|error| format!("Selected folder is not a local filesystem path: {error}"))
        })
        .transpose()
}

#[tauri::command]
pub fn inspect_package(path: String) -> Result<PackageIdentity, String> {
    let (name, version) = scanner::read_package_identity(Path::new(&path))?;
    Ok(PackageIdentity { name, version })
}

#[tauri::command]
pub fn reveal_config(app: AppHandle) -> Result<(), String> {
    let path = config::config_path()?;
    if !path.exists() {
        config::save(&Config::default())?;
    }
    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|error| format!("Could not reveal {}: {error}", path.display()))
}

#[tauri::command]
pub fn open_package_path(app: AppHandle, package_name: String) -> Result<(), String> {
    let config = config::load()?;
    let package = find_package(&config, &package_name)?;
    app.opener()
        .open_path(package.path.display().to_string(), None::<&str>)
        .map_err(|error| format!("Could not open {}: {error}", package.path.display()))
}

#[tauri::command]
pub async fn export_graph(app: AppHandle, graph: GraphResult) -> Result<Option<String>, String> {
    let markdown = export::render_agent_context(&graph)?;
    let selected = app
        .dialog()
        .file()
        .set_file_name("dep-sync-agent-context.md")
        .add_filter("Markdown", &["md"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|error| format!("Export destination is not a local filesystem path: {error}"))?;
    config::atomic_write(&path, markdown.as_bytes())?;
    Ok(Some(path.display().to_string()))
}

fn find_package<'a>(
    config: &'a Config,
    package_name: &str,
) -> Result<&'a config::PackageConfig, String> {
    config
        .packages
        .iter()
        .find(|package| package.name == package_name)
        .ok_or_else(|| format!("Package '{package_name}' is not in the config"))
}

#[allow(dead_code)]
fn normalize_local_path(path: PathBuf) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|error| format!("Could not resolve {}: {error}", path.display()))
}
