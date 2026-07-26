use crate::{
    config::{atomic_write, Config, PackageKind},
    graph::drift_status,
    scanner::{scan, DepField, PackageInfo},
};
use semver::{BuildMetadata, Prerelease, Version, VersionReq};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    fs,
    path::Path,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncChange {
    pub dependency: String,
    pub field: DepField,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncPreview {
    pub package_name: String,
    pub version: String,
    pub changes: Vec<SyncChange>,
    pub downstream: Vec<String>,
    pub can_apply: bool,
    pub warnings: Vec<String>,
}

pub fn preview_sync(config: &Config, package_name: &str) -> Result<SyncPreview, String> {
    let packages = scan(config);
    let package = packages
        .iter()
        .find(|item| item.name == package_name)
        .ok_or_else(|| format!("Package '{package_name}' is not in the config"))?;
    if let Some(error) = &package.error {
        return Err(format!("Cannot sync {package_name}: {error}"));
    }

    let target_versions = packages
        .iter()
        .map(|item| (item.name.clone(), item.version.clone()))
        .collect::<HashMap<_, _>>();
    let manifest_path = package.path.join("package.json");
    let source = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let manifest: Value = serde_json::from_str(&source)
        .map_err(|error| format!("Could not parse {}: {error}", manifest_path.display()))?;

    let mut changes = Vec::new();
    let mut warnings = Vec::new();
    for field_name in &config.settings.dep_fields {
        let Some(field) = DepField::from_key(field_name) else {
            continue;
        };
        let Some(entries) = manifest.get(field_name).and_then(Value::as_object) else {
            continue;
        };
        for (dependency, value) in entries {
            let Some(target_version) = target_versions.get(dependency) else {
                continue;
            };
            let Some(raw) = value.as_str() else {
                warnings.push(format!("{field_name}.{dependency} is not a string"));
                continue;
            };
            if !drift_status(raw, target_version).0 {
                continue;
            }
            match updated_spec(raw, target_version) {
                Ok(updated) if updated != raw => changes.push(SyncChange {
                    dependency: dependency.clone(),
                    field: field.clone(),
                    from: raw.to_string(),
                    to: updated,
                }),
                Ok(_) => {}
                Err(error) => warnings.push(format!("{field_name}.{dependency}: {error}")),
            }
        }
    }
    changes.sort_by(|left, right| {
        left.field
            .as_key()
            .cmp(right.field.as_key())
            .then(left.dependency.cmp(&right.dependency))
    });

    Ok(SyncPreview {
        package_name: package.name.clone(),
        version: package.version.clone(),
        changes,
        downstream: downstream_consumers(&packages, package_name),
        can_apply: warnings.is_empty(),
        warnings,
    })
}

pub fn apply_sync(config: &Config, package_name: &str) -> Result<(), String> {
    let preview = preview_sync(config, package_name)?;
    if !preview.can_apply {
        return Err(format!(
            "Cannot safely sync {package_name}: {}",
            preview.warnings.join("; ")
        ));
    }
    if preview.changes.is_empty() {
        return Ok(());
    }

    let package = config
        .packages
        .iter()
        .find(|item| item.name == package_name)
        .ok_or_else(|| format!("Package '{package_name}' is not in the config"))?;
    let manifest_path = package.path.join("package.json");
    let source = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let mut manifest: Value = serde_json::from_str(&source)
        .map_err(|error| format!("Could not parse {}: {error}", manifest_path.display()))?;

    for change in preview.changes {
        let field_name = change.field.as_key();
        let entry = manifest
            .get_mut(field_name)
            .and_then(Value::as_object_mut)
            .and_then(|entries| entries.get_mut(&change.dependency))
            .ok_or_else(|| {
                format!(
                    "{field_name}.{} disappeared while preparing the write; rescan and try again",
                    change.dependency
                )
            })?;
        *entry = Value::String(change.to);
    }

    write_manifest(&manifest_path, &source, &manifest)
}

pub fn bump_patch(config: &Config, package_name: &str) -> Result<String, String> {
    let package = config
        .packages
        .iter()
        .find(|item| item.name == package_name)
        .ok_or_else(|| format!("Package '{package_name}' is not in the config"))?;
    if package.kind != PackageKind::Library {
        return Err(format!(
            "Only libraries can be version-bumped; {package_name} is an application"
        ));
    }

    let manifest_path = package.path.join("package.json");
    let source = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let mut manifest: Value = serde_json::from_str(&source)
        .map_err(|error| format!("Could not parse {}: {error}", manifest_path.display()))?;
    let old_version = manifest
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{} has no string version field", manifest_path.display()))?;
    let mut version = Version::parse(old_version)
        .map_err(|error| format!("Version '{old_version}' is not valid semver: {error}"))?;
    version.patch = version
        .patch
        .checked_add(1)
        .ok_or_else(|| format!("Patch version overflow for {old_version}"))?;
    version.pre = Prerelease::EMPTY;
    version.build = BuildMetadata::EMPTY;
    let new_version = version.to_string();
    manifest["version"] = Value::String(new_version.clone());
    write_manifest(&manifest_path, &source, &manifest)?;
    Ok(new_version)
}

pub fn updated_spec(raw: &str, target_version: &str) -> Result<String, String> {
    let version = Version::parse(target_version)
        .map_err(|error| format!("target version '{target_version}' is invalid: {error}"))?;
    let (prefix, normalized) = raw
        .strip_prefix("workspace:")
        .map(|value| ("workspace:", value))
        .unwrap_or(("", raw));
    let exact = Version::parse(normalized).ok();
    let satisfies = if let Some(exact) = &exact {
        exact == &version
    } else {
        VersionReq::parse(normalized)
            .map_err(|error| format!("range '{raw}' is unsupported: {error}"))?
            .matches(&version)
    };
    if satisfies {
        return Ok(raw.to_string());
    }

    let updated = if exact.is_some() {
        version.to_string()
    } else if normalized.starts_with('^') {
        format!("^{version}")
    } else if normalized.starts_with('~') {
        format!("~{version}")
    } else if normalized.starts_with(">=")
        && Version::parse(normalized.trim_start_matches(">=").trim()).is_ok()
    {
        format!(">={version}")
    } else {
        return Err(format!(
            "range style '{raw}' needs a manual edit and was not changed"
        ));
    };

    Ok(format!("{prefix}{updated}"))
}

fn write_manifest(path: &Path, original: &str, manifest: &Value) -> Result<(), String> {
    let indent = detect_indent(original);
    let formatter = serde_json::ser::PrettyFormatter::with_indent(indent.as_bytes());
    let mut output = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(&mut output, formatter);
    manifest
        .serialize(&mut serializer)
        .map_err(|error| format!("Could not serialize {}: {error}", path.display()))?;
    if original.ends_with('\n') {
        output.push(b'\n');
    }
    atomic_write(path, &output)
}

fn detect_indent(source: &str) -> String {
    source
        .lines()
        .skip(1)
        .find_map(|line| {
            let trimmed = line.trim_start_matches([' ', '\t']);
            if trimmed.starts_with('"') {
                let width = line.len().saturating_sub(trimmed.len());
                (width > 0).then(|| line[..width].to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "  ".to_string())
}

fn downstream_consumers(packages: &[PackageInfo], package_name: &str) -> Vec<String> {
    let mut dependency_to_consumers = HashMap::<String, Vec<String>>::new();
    for package in packages {
        for dependency in package.dependencies.keys() {
            dependency_to_consumers
                .entry(dependency.clone())
                .or_default()
                .push(package.name.clone());
        }
    }

    let mut seen = BTreeSet::new();
    let mut queue = VecDeque::from([package_name.to_string()]);
    while let Some(dependency) = queue.pop_front() {
        if let Some(consumers) = dependency_to_consumers.get(&dependency) {
            for consumer in consumers {
                if seen.insert(consumer.clone()) {
                    queue.push_back(consumer.clone());
                }
            }
        }
    }
    seen.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_supported_range_styles() {
        let cases = [
            ("2.1.0", "2.2.0", "2.2.0"),
            ("^0.2.1", "0.3.0", "^0.3.0"),
            ("~0.2.1", "0.3.0", "~0.3.0"),
            (">=0.1.9", "0.1.8", ">=0.1.8"),
            ("workspace:^0.2.1", "0.3.0", "workspace:^0.3.0"),
        ];
        for (raw, version, expected) in cases {
            assert_eq!(
                updated_spec(raw, version).expect("range should update"),
                expected
            );
        }
    }

    #[test]
    fn leaves_satisfying_ranges_unchanged() {
        assert_eq!(
            updated_spec("^0.2.1", "0.2.9").expect("range should parse"),
            "^0.2.1"
        );
        assert_eq!(
            updated_spec(">=0.1.9", "0.5.0").expect("range should parse"),
            ">=0.1.9"
        );
    }

    #[test]
    fn rejects_exotic_outdated_ranges() {
        assert!(updated_spec(">=1.0.0, <2.0.0", "2.1.0").is_err());
    }

    #[test]
    fn detects_tab_and_space_indentation() {
        assert_eq!(detect_indent("{\n\t\"name\": \"x\"\n}\n"), "\t");
        assert_eq!(detect_indent("{\n    \"name\": \"x\"\n}\n"), "    ");
        assert_eq!(detect_indent("{}"), "  ");
    }
}
