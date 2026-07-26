use crate::config::{Config, PackageConfig, PackageKind};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum DepField {
    Dependencies,
    DevDependencies,
    PeerDependencies,
}

impl DepField {
    pub fn from_key(key: &str) -> Option<Self> {
        match key {
            "dependencies" => Some(Self::Dependencies),
            "devDependencies" => Some(Self::DevDependencies),
            "peerDependencies" => Some(Self::PeerDependencies),
            _ => None,
        }
    }

    pub fn as_key(&self) -> &'static str {
        match self {
            Self::Dependencies => "dependencies",
            Self::DevDependencies => "devDependencies",
            Self::PeerDependencies => "peerDependencies",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DepSpec {
    pub raw: String,
    pub field: DepField,
    pub range: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    pub name: String,
    pub version: String,
    pub path: PathBuf,
    pub kind: PackageKind,
    pub scope: Option<String>,
    pub dependencies: HashMap<String, DepSpec>,
    pub raw_json: Value,
    pub error: Option<String>,
}

pub fn scan(config: &Config) -> Vec<PackageInfo> {
    let internal_names = config
        .packages
        .iter()
        .map(|package| package.name.clone())
        .collect::<HashSet<_>>();

    config
        .packages
        .iter()
        .map(|package| scan_one(package, &config.settings.dep_fields, &internal_names))
        .collect()
}

fn scan_one(
    package: &PackageConfig,
    dep_fields: &[String],
    internal_names: &HashSet<String>,
) -> PackageInfo {
    let manifest_path = package.path.join("package.json");
    let fallback = |message: String| PackageInfo {
        name: package.name.clone(),
        version: "unknown".to_string(),
        path: package.path.clone(),
        kind: package.kind.clone(),
        scope: package.scope.clone(),
        dependencies: HashMap::new(),
        raw_json: Value::Null,
        error: Some(message),
    };

    if !package.path.exists() {
        return fallback(format!(
            "Package directory does not exist: {}",
            package.path.display()
        ));
    }
    if !manifest_path.exists() {
        return fallback(format!(
            "No package.json found at {}",
            manifest_path.display()
        ));
    }

    let source = match fs::read_to_string(&manifest_path) {
        Ok(source) => source,
        Err(error) => {
            return fallback(format!(
                "Could not read {}: {error}",
                manifest_path.display()
            ))
        }
    };
    let raw_json: Value = match serde_json::from_str(&source) {
        Ok(value) => value,
        Err(error) => {
            return fallback(format!(
                "Could not parse {}: {error}",
                manifest_path.display()
            ))
        }
    };

    let actual_name = raw_json.get("name").and_then(Value::as_str);
    let name_error = match actual_name {
        Some(name) if name != package.name => Some(format!(
            "Configured name '{}' does not match package.json name '{}'",
            package.name, name
        )),
        None => Some("package.json has no string name field".to_string()),
        _ => None,
    };

    let version = raw_json
        .get("version")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            if package.kind == PackageKind::Application {
                "unversioned".to_string()
            } else {
                "unknown".to_string()
            }
        });

    let version_error = if package.kind == PackageKind::Library && version == "unknown" {
        Some("Library package.json has no string version field".to_string())
    } else {
        None
    };

    let dependencies = extract_internal_dependencies(&raw_json, dep_fields, internal_names);

    PackageInfo {
        name: package.name.clone(),
        version,
        path: package.path.clone(),
        kind: package.kind.clone(),
        scope: package.scope.clone(),
        dependencies,
        raw_json,
        error: name_error.or(version_error),
    }
}

pub fn extract_internal_dependencies(
    manifest: &Value,
    dep_fields: &[String],
    internal_names: &HashSet<String>,
) -> HashMap<String, DepSpec> {
    let mut dependencies = HashMap::new();

    for field_name in dep_fields {
        let Some(field) = DepField::from_key(field_name) else {
            continue;
        };
        let Some(entries) = manifest.get(field_name).and_then(Value::as_object) else {
            continue;
        };

        for (name, value) in entries {
            if !internal_names.contains(name) || dependencies.contains_key(name) {
                continue;
            }
            let Some(raw) = value.as_str() else {
                continue;
            };
            dependencies.insert(
                name.clone(),
                DepSpec {
                    raw: raw.to_string(),
                    field: field.clone(),
                    range: raw.to_string(),
                },
            );
        }
    }

    dependencies
}

pub fn read_package_identity(path: &Path) -> Result<(String, Option<String>), String> {
    let manifest_path = path.join("package.json");
    let source = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let json: Value = serde_json::from_str(&source)
        .map_err(|error| format!("Could not parse {}: {error}", manifest_path.display()))?;
    let name = json
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{} has no string name field", manifest_path.display()))?;
    let version = json
        .get("version")
        .and_then(Value::as_str)
        .map(str::to_string);
    Ok((name.to_string(), version))
}
