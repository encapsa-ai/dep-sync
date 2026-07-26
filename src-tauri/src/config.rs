use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::fs::File;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PackageKind {
    Library,
    Application,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PackageConfig {
    pub name: String,
    pub path: PathBuf,
    pub kind: PackageKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Settings {
    #[serde(default = "default_dep_fields")]
    pub dep_fields: Vec<String>,
    #[serde(default)]
    pub terminal_command: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            dep_fields: default_dep_fields(),
            terminal_command: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct Config {
    #[serde(default)]
    pub packages: Vec<PackageConfig>,
    #[serde(default)]
    pub settings: Settings,
}

pub fn default_dep_fields() -> Vec<String> {
    vec![
        "dependencies".to_string(),
        "devDependencies".to_string(),
        "peerDependencies".to_string(),
    ]
}

pub fn config_path() -> Result<PathBuf, String> {
    ProjectDirs::from("", "", "dep-sync")
        .map(|dirs| dirs.config_dir().join("config.toml"))
        .ok_or_else(|| "Could not determine the operating system config directory".to_string())
}

pub fn load() -> Result<Config, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Config::default());
    }

    let source = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    let config: Config = toml::from_str(&source)
        .map_err(|error| format!("Could not parse {}: {error}", path.display()))?;
    validate(&config)?;
    Ok(config)
}

pub fn save(config: &Config) -> Result<(), String> {
    validate(config)?;
    let path = config_path()?;
    let source = toml::to_string_pretty(config)
        .map_err(|error| format!("Could not serialize the config: {error}"))?;
    atomic_write(&path, format!("{source}\n").as_bytes())
}

pub fn validate(config: &Config) -> Result<(), String> {
    let mut names = std::collections::HashSet::new();

    for package in &config.packages {
        if package.name.trim().is_empty() {
            return Err("Every package needs a name".to_string());
        }
        if !package.path.is_absolute() {
            return Err(format!(
                "The path for {} must be absolute: {}",
                package.name,
                package.path.display()
            ));
        }
        if !names.insert(package.name.clone()) {
            return Err(format!(
                "Package names must be unique; {} appears more than once",
                package.name
            ));
        }
    }

    let supported = ["dependencies", "devDependencies", "peerDependencies"];
    if config.settings.dep_fields.is_empty() {
        return Err("Select at least one dependency field to scan".to_string());
    }
    for field in &config.settings.dep_fields {
        if !supported.contains(&field.as_str()) {
            return Err(format!(
                "Unsupported dependency field {field}; use dependencies, devDependencies, or peerDependencies"
            ));
        }
    }

    Ok(())
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use tempfile::NamedTempFile;

    let parent = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;

    let mut temp = NamedTempFile::new_in(parent).map_err(|error| {
        format!(
            "Could not create a temp file in {}: {error}",
            parent.display()
        )
    })?;
    temp.write_all(bytes)
        .map_err(|error| format!("Could not write temp file for {}: {error}", path.display()))?;
    temp.as_file()
        .sync_all()
        .map_err(|error| format!("Could not sync temp file for {}: {error}", path.display()))?;

    temp.persist(path)
        .map_err(|error| format!("Could not atomically replace {}: {error}", path.display()))?;

    #[cfg(unix)]
    if let Ok(directory) = File::open(parent) {
        let _ = directory.sync_all();
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_round_trips_through_toml() {
        let config = Config {
            packages: vec![PackageConfig {
                name: "@example/ui".to_string(),
                path: PathBuf::from("/tmp/example-ui"),
                kind: PackageKind::Library,
                scope: Some("example".to_string()),
            }],
            settings: Settings::default(),
        };

        let source = toml::to_string_pretty(&config).expect("config should serialize");
        let decoded: Config = toml::from_str(&source).expect("config should deserialize");
        assert_eq!(decoded, config);
    }

    #[test]
    fn validation_rejects_duplicate_names() {
        let package = PackageConfig {
            name: "@example/ui".to_string(),
            path: PathBuf::from("/tmp/example-ui"),
            kind: PackageKind::Library,
            scope: None,
        };
        let config = Config {
            packages: vec![package.clone(), package],
            settings: Settings::default(),
        };

        assert!(validate(&config).is_err());
    }

    #[test]
    fn atomic_write_replaces_an_existing_file() {
        let directory = tempfile::tempdir().expect("temporary directory should exist");
        let path = directory.path().join("config.toml");
        fs::write(&path, b"before").expect("fixture should be written");

        atomic_write(&path, b"after").expect("atomic replacement should succeed");

        assert_eq!(
            fs::read(&path).expect("replacement should be readable"),
            b"after"
        );
    }
}
