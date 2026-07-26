use dep_sync_lib::{
    config::{Config, PackageConfig, PackageKind, Settings},
    graph, scanner,
};
use std::path::PathBuf;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

#[test]
fn scan_build_and_order_fixture_graph() {
    let config = Config {
        packages: vec![
            PackageConfig {
                name: "@fixture/core".to_string(),
                path: fixture("core"),
                kind: PackageKind::Library,
                scope: Some("fixture".to_string()),
            },
            PackageConfig {
                name: "@fixture/hooks".to_string(),
                path: fixture("hooks"),
                kind: PackageKind::Library,
                scope: Some("fixture".to_string()),
            },
            PackageConfig {
                name: "@fixture/img".to_string(),
                path: fixture("img"),
                kind: PackageKind::Library,
                scope: Some("fixture".to_string()),
            },
            PackageConfig {
                name: "@fixture/ui".to_string(),
                path: fixture("ui"),
                kind: PackageKind::Library,
                scope: Some("fixture".to_string()),
            },
            PackageConfig {
                name: "fixture-app".to_string(),
                path: fixture("app"),
                kind: PackageKind::Application,
                scope: Some("fixture".to_string()),
            },
        ],
        settings: Settings::default(),
    };

    let packages = scanner::scan(&config);
    assert_eq!(packages.len(), 5);
    assert!(packages.iter().all(|package| package.error.is_none()));

    let result = graph::compute(&packages);
    assert!(result.cycles.is_empty());
    assert_eq!(
        result.update_order,
        vec![
            "@fixture/core",
            "@fixture/hooks",
            "@fixture/img",
            "@fixture/ui",
            "fixture-app",
        ]
    );
    let ui = result
        .nodes
        .iter()
        .find(|node| node.name == "@fixture/ui")
        .expect("ui node should exist");
    assert_eq!(ui.drift_count, 2);
}
