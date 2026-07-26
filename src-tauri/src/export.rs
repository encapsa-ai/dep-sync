use crate::{
    config::PackageKind,
    graph::{GraphNode, GraphResult},
};
use serde_json::json;
use std::{
    collections::{BTreeMap, HashMap},
    fmt::Write,
};

pub fn render_agent_context(graph: &GraphResult) -> Result<String, String> {
    let mut nodes = graph.nodes.clone();
    nodes.sort_by(|left, right| left.name.cmp(&right.name));
    let mut edges = graph.edges.clone();
    edges.sort_by(|left, right| {
        left.source
            .cmp(&right.source)
            .then(left.target.cmp(&right.target))
            .then(left.field.as_key().cmp(right.field.as_key()))
    });

    let node_map = nodes
        .iter()
        .map(|node| (node.name.as_str(), node))
        .collect::<HashMap<_, _>>();
    let library_count = nodes
        .iter()
        .filter(|node| node.kind == PackageKind::Library)
        .count();
    let application_count = nodes.len().saturating_sub(library_count);
    let drift_package_count = nodes.iter().filter(|node| node.drift_count > 0).count();
    let drift_edge_count = edges.iter().filter(|edge| edge.is_drift).count();

    let mut output = String::new();
    writeln!(output, "# dep-sync Agent Context").map_err(format_error)?;
    writeln!(
        output,
        "\nThis file is generated from local `package.json` files. Treat the on-disk versions and ranges below as the source of truth; no registry data was consulted."
    )
    .map_err(format_error)?;

    writeln!(output, "\n## Graph semantics").map_err(format_error)?;
    writeln!(output, "\n- An edge `A -> B` means **A depends on B**.").map_err(format_error)?;
    writeln!(
        output,
        "- Update or publish dependency B before updating consumer A."
    )
    .map_err(format_error)?;
    writeln!(
        output,
        "- `DRIFT` means B's current local version does not satisfy A's declared range."
    )
    .map_err(format_error)?;
    writeln!(
        output,
        "- The update order is dependency-first. Applications are consumers only and are not published."
    )
    .map_err(format_error)?;

    writeln!(output, "\n## Summary").map_err(format_error)?;
    writeln!(output, "\n- Packages: {}", nodes.len()).map_err(format_error)?;
    writeln!(output, "- Libraries: {library_count}").map_err(format_error)?;
    writeln!(output, "- Applications: {application_count}").map_err(format_error)?;
    writeln!(
        output,
        "- Packages with current drift: {drift_package_count}"
    )
    .map_err(format_error)?;
    writeln!(output, "- Drifted dependency edges: {drift_edge_count}").map_err(format_error)?;
    writeln!(output, "- Dependency cycles: {}", graph.cycles.len()).map_err(format_error)?;

    writeln!(output, "\n## Recommended agent workflow").map_err(format_error)?;
    writeln!(
        output,
        "\n1. Work through `Required update order` from top to bottom."
    )
    .map_err(format_error)?;
    writeln!(
        output,
        "2. For a library with drift, update its internal dependency ranges, test it, then bump/publish only when the repository workflow requires it."
    )
    .map_err(format_error)?;
    writeln!(
        output,
        "3. Rescan and re-export after each publish because downstream drift is derived from current local versions."
    )
    .map_err(format_error)?;
    writeln!(
        output,
        "4. Update applications after their upstream libraries; applications do not need a publish step."
    )
    .map_err(format_error)?;
    writeln!(
        output,
        "5. Do not modify unrelated external dependencies or infer versions from a registry."
    )
    .map_err(format_error)?;

    writeln!(output, "\n## Required update order").map_err(format_error)?;
    if !graph.cycles.is_empty() {
        writeln!(
            output,
            "\nUpdate order is unavailable until the cycles listed below are resolved."
        )
        .map_err(format_error)?;
    } else if graph.update_order.is_empty() {
        writeln!(output, "\nNo packages currently require cascading updates.")
            .map_err(format_error)?;
    } else {
        writeln!(output).map_err(format_error)?;
        for (index, name) in graph.update_order.iter().enumerate() {
            let detail = node_map
                .get(name.as_str())
                .map(|node| update_instruction(node))
                .unwrap_or("package metadata unavailable");
            writeln!(
                output,
                "{}. `{}` — {}",
                index + 1,
                markdown_inline(name),
                detail
            )
            .map_err(format_error)?;
        }
    }

    writeln!(output, "\n## Direct dependency edges").map_err(format_error)?;
    writeln!(
        output,
        "\n| Consumer | Dependency | Field | Declared range | Local target version | Status |"
    )
    .map_err(format_error)?;
    writeln!(output, "|---|---|---|---|---|---|").map_err(format_error)?;
    for edge in &edges {
        let status = if edge.is_drift { "DRIFT" } else { "satisfied" };
        let status = match &edge.error {
            Some(error) => format!("{status}: {}", markdown_cell(error)),
            None => status.to_string(),
        };
        writeln!(
            output,
            "| `{}` | `{}` | `{}` | `{}` | `{}` | {} |",
            markdown_cell(&edge.source),
            markdown_cell(&edge.target),
            edge.field.as_key(),
            markdown_cell(&edge.installed_range),
            markdown_cell(&edge.target_version),
            status
        )
        .map_err(format_error)?;
    }

    writeln!(output, "\n## Reverse dependency index").map_err(format_error)?;
    let mut consumers_by_dependency = BTreeMap::<String, Vec<String>>::new();
    for edge in &edges {
        consumers_by_dependency
            .entry(edge.target.clone())
            .or_default()
            .push(edge.source.clone());
    }
    if consumers_by_dependency.is_empty() {
        writeln!(output, "\nNo internal dependency edges were found.").map_err(format_error)?;
    } else {
        writeln!(output).map_err(format_error)?;
        for (dependency, consumers) in &mut consumers_by_dependency {
            consumers.sort();
            consumers.dedup();
            let formatted = consumers
                .iter()
                .map(|consumer| format!("`{}`", markdown_inline(consumer)))
                .collect::<Vec<_>>()
                .join(", ");
            writeln!(
                output,
                "- `{}` is consumed by: {}",
                markdown_inline(dependency),
                formatted
            )
            .map_err(format_error)?;
        }
    }

    writeln!(output, "\n## Package inventory").map_err(format_error)?;
    writeln!(
        output,
        "\n| Package | Kind | Version | Scope | State | Local path |"
    )
    .map_err(format_error)?;
    writeln!(output, "|---|---|---|---|---|---|").map_err(format_error)?;
    for node in &nodes {
        let state = node_state(node);
        writeln!(
            output,
            "| `{}` | {} | `{}` | {} | {} | `{}` |",
            markdown_cell(&node.name),
            kind_label(&node.kind),
            markdown_cell(&node.version),
            markdown_cell(node.scope.as_deref().unwrap_or("unscoped")),
            state,
            markdown_cell(&node.path)
        )
        .map_err(format_error)?;
    }

    writeln!(output, "\n## Cycles and scan errors").map_err(format_error)?;
    if graph.cycles.is_empty() && nodes.iter().all(|node| node.error.is_none()) {
        writeln!(output, "\nNone.").map_err(format_error)?;
    } else {
        writeln!(output).map_err(format_error)?;
        for cycle in &graph.cycles {
            writeln!(
                output,
                "- Cycle: {}",
                cycle
                    .iter()
                    .map(|name| format!("`{}`", markdown_inline(name)))
                    .collect::<Vec<_>>()
                    .join(" -> ")
            )
            .map_err(format_error)?;
        }
        for node in nodes.iter().filter(|node| node.error.is_some()) {
            writeln!(
                output,
                "- `{}`: {}",
                markdown_inline(&node.name),
                node.error.as_deref().unwrap_or("unknown scan error")
            )
            .map_err(format_error)?;
        }
    }

    let payload = json!({
        "schemaVersion": 1,
        "edgeSemantics": "source consumer depends on target dependency",
        "updateOrderSemantics": "dependencies before dependents; applications last within a topological layer",
        "graph": graph,
    });
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Could not serialize the graph export: {error}"))?;
    writeln!(output, "\n## Machine-readable graph").map_err(format_error)?;
    writeln!(
        output,
        "\nThe JSON payload below is authoritative for programmatic use.\n"
    )
    .map_err(format_error)?;
    writeln!(output, "```json\n{json}\n```").map_err(format_error)?;

    Ok(output)
}

fn update_instruction(node: &GraphNode) -> &'static str {
    if node.drift_count > 0 {
        if node.kind == PackageKind::Library {
            "sync outdated internal dependencies, test, then publish if appropriate"
        } else {
            "sync outdated internal dependencies and test; do not publish"
        }
    } else if node.is_stale_dep {
        "current source version that downstream packages must consume"
    } else if node.kind == PackageKind::Library {
        "downstream library; update after its upstream dependencies"
    } else {
        "downstream application; update after its upstream libraries"
    }
}

fn node_state(node: &GraphNode) -> String {
    if let Some(error) = &node.error {
        return format!("ERROR: {}", markdown_cell(error));
    }
    if node.drift_count > 0 {
        return format!("DRIFT ({} dependencies)", node.drift_count);
    }
    if node.is_stale_dep {
        return "source target".to_string();
    }
    "clean".to_string()
}

fn kind_label(kind: &PackageKind) -> &'static str {
    match kind {
        PackageKind::Library => "library",
        PackageKind::Application => "application",
    }
}

fn markdown_cell(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('|', "\\|")
        .replace('\n', " ")
}

fn markdown_inline(value: &str) -> String {
    value.replace('`', "\\`").replace('\n', " ")
}

fn format_error(error: std::fmt::Error) -> String {
    format!("Could not format the graph export: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        graph::{GraphEdge, GraphNode},
        scanner::DepField,
    };

    fn fixture_graph() -> GraphResult {
        GraphResult {
            nodes: vec![
                GraphNode {
                    name: "example-app".to_string(),
                    version: "0.1.0".to_string(),
                    path: "/tmp/example-app".to_string(),
                    kind: PackageKind::Application,
                    scope: Some("example".to_string()),
                    drift_count: 1,
                    is_stale_dep: false,
                    outdated_by: Vec::new(),
                    error: None,
                },
                GraphNode {
                    name: "@example/core".to_string(),
                    version: "2.0.0".to_string(),
                    path: "/tmp/core".to_string(),
                    kind: PackageKind::Library,
                    scope: Some("example".to_string()),
                    drift_count: 0,
                    is_stale_dep: true,
                    outdated_by: vec!["example-app".to_string()],
                    error: None,
                },
            ],
            edges: vec![GraphEdge {
                source: "example-app".to_string(),
                target: "@example/core".to_string(),
                field: DepField::Dependencies,
                installed_range: "^1.0.0".to_string(),
                target_version: "2.0.0".to_string(),
                is_drift: true,
                error: None,
            }],
            update_order: vec!["@example/core".to_string(), "example-app".to_string()],
            cycles: Vec::new(),
        }
    }

    #[test]
    fn export_contains_agent_semantics_order_edges_and_json() {
        let output = render_agent_context(&fixture_graph()).expect("export should render");

        assert!(output.contains("An edge `A -> B` means **A depends on B**"));
        assert!(output.contains("1. `@example/core`"));
        assert!(output.contains("2. `example-app`"));
        assert!(output.contains(
            "| `example-app` | `@example/core` | `dependencies` | `^1.0.0` | `2.0.0` | DRIFT |"
        ));
        assert!(output.contains("\"schemaVersion\": 1"));
        assert!(output.contains("\"updateOrder\""));
    }

    #[test]
    fn export_is_deterministic_for_the_same_graph() {
        let graph = fixture_graph();
        assert_eq!(
            render_agent_context(&graph).expect("first export should render"),
            render_agent_context(&graph).expect("second export should render")
        );
    }
}
