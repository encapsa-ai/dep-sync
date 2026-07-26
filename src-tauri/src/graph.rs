use crate::{
    config::PackageKind,
    scanner::{DepField, PackageInfo},
};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub field: DepField,
    pub installed_range: String,
    pub target_version: String,
    pub is_drift: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub name: String,
    pub version: String,
    pub path: String,
    pub kind: PackageKind,
    pub scope: Option<String>,
    pub drift_count: usize,
    pub is_stale_dep: bool,
    pub outdated_by: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphResult {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub update_order: Vec<String>,
    pub cycles: Vec<Vec<String>>,
}

pub fn compute(packages: &[PackageInfo]) -> GraphResult {
    let package_map = packages
        .iter()
        .map(|package| (package.name.clone(), package))
        .collect::<HashMap<_, _>>();
    let mut edges = Vec::new();
    let mut drift_counts = HashMap::<String, usize>::new();
    let mut stale_by = HashMap::<String, BTreeSet<String>>::new();

    for package in packages {
        for (dependency_name, spec) in &package.dependencies {
            let Some(target) = package_map.get(dependency_name) else {
                continue;
            };
            let (is_drift, error) = drift_status(&spec.raw, &target.version);
            if is_drift {
                *drift_counts.entry(package.name.clone()).or_default() += 1;
                stale_by
                    .entry(dependency_name.clone())
                    .or_default()
                    .insert(package.name.clone());
            }
            edges.push(GraphEdge {
                source: package.name.clone(),
                target: dependency_name.clone(),
                field: spec.field.clone(),
                installed_range: spec.raw.clone(),
                target_version: target.version.clone(),
                is_drift,
                error,
            });
        }
    }

    edges.sort_by(|left, right| {
        left.source
            .cmp(&right.source)
            .then(left.target.cmp(&right.target))
    });

    let cycles = detect_cycles(packages, &edges);
    let update_order = if cycles.is_empty() {
        compute_update_order(packages, &edges)
    } else {
        Vec::new()
    };

    let mut nodes = packages
        .iter()
        .map(|package| GraphNode {
            name: package.name.clone(),
            version: package.version.clone(),
            path: package.path.display().to_string(),
            kind: package.kind.clone(),
            scope: package.scope.clone(),
            drift_count: drift_counts.get(&package.name).copied().unwrap_or_default(),
            is_stale_dep: stale_by.contains_key(&package.name),
            outdated_by: stale_by
                .get(&package.name)
                .map(|items| items.iter().cloned().collect())
                .unwrap_or_default(),
            error: package.error.clone(),
        })
        .collect::<Vec<_>>();
    nodes.sort_by(|left, right| left.name.cmp(&right.name));

    GraphResult {
        nodes,
        edges,
        update_order,
        cycles,
    }
}

pub fn drift_status(raw_range: &str, target_version: &str) -> (bool, Option<String>) {
    let normalized = raw_range.strip_prefix("workspace:").unwrap_or(raw_range);
    let version = match Version::parse(target_version) {
        Ok(version) => version,
        Err(error) => {
            return (
                true,
                Some(format!(
                    "Target version '{target_version}' is not valid semver: {error}"
                )),
            )
        }
    };
    if let Ok(exact) = Version::parse(normalized) {
        return (exact != version, None);
    }
    let requirement = match VersionReq::parse(normalized) {
        Ok(requirement) => requirement,
        Err(error) => {
            return (
                true,
                Some(format!(
                    "Dependency range '{raw_range}' is not supported: {error}"
                )),
            )
        }
    };
    (!requirement.matches(&version), None)
}

fn detect_cycles(packages: &[PackageInfo], edges: &[GraphEdge]) -> Vec<Vec<String>> {
    let names = packages
        .iter()
        .map(|package| package.name.clone())
        .collect::<Vec<_>>();
    let mut adjacency = names
        .iter()
        .map(|name| (name.clone(), Vec::<String>::new()))
        .collect::<HashMap<_, _>>();
    for edge in edges {
        adjacency
            .entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
    }
    for neighbors in adjacency.values_mut() {
        neighbors.sort();
        neighbors.dedup();
    }

    let mut index = 0usize;
    let mut indices = HashMap::<String, usize>::new();
    let mut lowlinks = HashMap::<String, usize>::new();
    let mut stack = Vec::<String>::new();
    let mut on_stack = HashSet::<String>::new();
    let mut components = Vec::<Vec<String>>::new();

    struct Tarjan<'a> {
        index: &'a mut usize,
        indices: &'a mut HashMap<String, usize>,
        lowlinks: &'a mut HashMap<String, usize>,
        stack: &'a mut Vec<String>,
        on_stack: &'a mut HashSet<String>,
        adjacency: &'a HashMap<String, Vec<String>>,
        components: &'a mut Vec<Vec<String>>,
    }

    impl Tarjan<'_> {
        fn visit(&mut self, node: &str) {
            let node_index = *self.index;
            *self.index += 1;
            self.indices.insert(node.to_string(), node_index);
            self.lowlinks.insert(node.to_string(), node_index);
            self.stack.push(node.to_string());
            self.on_stack.insert(node.to_string());

            if let Some(neighbors) = self.adjacency.get(node) {
                for neighbor in neighbors {
                    if !self.indices.contains_key(neighbor) {
                        self.visit(neighbor);
                        if let Some(neighbor_low) = self.lowlinks.get(neighbor).copied() {
                            if let Some(node_low) = self.lowlinks.get_mut(node) {
                                *node_low = (*node_low).min(neighbor_low);
                            }
                        }
                    } else if self.on_stack.contains(neighbor) {
                        if let Some(neighbor_index) = self.indices.get(neighbor).copied() {
                            if let Some(node_low) = self.lowlinks.get_mut(node) {
                                *node_low = (*node_low).min(neighbor_index);
                            }
                        }
                    }
                }
            }

            if self.lowlinks.get(node) == self.indices.get(node) {
                let mut component = Vec::new();
                while let Some(member) = self.stack.pop() {
                    self.on_stack.remove(&member);
                    let finished = member == node;
                    component.push(member);
                    if finished {
                        break;
                    }
                }
                self.components.push(component);
            }
        }
    }

    {
        let mut tarjan = Tarjan {
            index: &mut index,
            indices: &mut indices,
            lowlinks: &mut lowlinks,
            stack: &mut stack,
            on_stack: &mut on_stack,
            adjacency: &adjacency,
            components: &mut components,
        };
        for name in &names {
            if !tarjan.indices.contains_key(name) {
                tarjan.visit(name);
            }
        }
    }

    let self_loops = edges
        .iter()
        .filter(|edge| edge.source == edge.target)
        .map(|edge| edge.source.clone())
        .collect::<HashSet<_>>();
    let mut cycles = components
        .into_iter()
        .filter_map(|mut component| {
            if component.len() > 1
                || component
                    .first()
                    .is_some_and(|name| self_loops.contains(name))
            {
                component.sort();
                Some(component)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    cycles.sort();
    cycles
}

fn compute_update_order(packages: &[PackageInfo], edges: &[GraphEdge]) -> Vec<String> {
    let kinds = packages
        .iter()
        .map(|package| (package.name.clone(), package.kind.clone()))
        .collect::<HashMap<_, _>>();
    let mut dependency_to_consumers = HashMap::<String, Vec<String>>::new();
    for edge in edges {
        dependency_to_consumers
            .entry(edge.target.clone())
            .or_default()
            .push(edge.source.clone());
    }

    let roots = edges
        .iter()
        .filter(|edge| edge.is_drift)
        .map(|edge| edge.target.clone())
        .collect::<BTreeSet<_>>();
    let mut relevant = roots.iter().cloned().collect::<HashSet<_>>();
    let mut queue = roots.into_iter().collect::<VecDeque<_>>();
    while let Some(dependency) = queue.pop_front() {
        if let Some(consumers) = dependency_to_consumers.get(&dependency) {
            for consumer in consumers {
                if relevant.insert(consumer.clone()) {
                    queue.push_back(consumer.clone());
                }
            }
        }
    }

    let mut indegree = relevant
        .iter()
        .map(|name| (name.clone(), 0usize))
        .collect::<HashMap<_, _>>();
    for edge in edges {
        if relevant.contains(&edge.source) && relevant.contains(&edge.target) {
            *indegree.entry(edge.source.clone()).or_default() += 1;
        }
    }

    let sort_layer = |layer: &mut Vec<String>| {
        layer.sort_by(|left, right| {
            let left_app = kinds.get(left) == Some(&PackageKind::Application);
            let right_app = kinds.get(right) == Some(&PackageKind::Application);
            left_app.cmp(&right_app).then(left.cmp(right))
        });
        layer.dedup();
    };

    let mut layer = indegree
        .iter()
        .filter_map(|(name, degree)| (*degree == 0).then_some(name.clone()))
        .collect::<Vec<_>>();
    sort_layer(&mut layer);
    let mut order = Vec::new();

    while !layer.is_empty() {
        let mut next = Vec::new();
        for name in layer {
            order.push(name.clone());
            if let Some(consumers) = dependency_to_consumers.get(&name) {
                for consumer in consumers {
                    if !relevant.contains(consumer) {
                        continue;
                    }
                    if let Some(degree) = indegree.get_mut(consumer) {
                        *degree = degree.saturating_sub(1);
                        if *degree == 0 {
                            next.push(consumer.clone());
                        }
                    }
                }
            }
        }
        sort_layer(&mut next);
        layer = next;
    }

    order
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::DepSpec;
    use serde_json::Value;
    use std::{collections::HashMap, path::PathBuf};

    fn package(name: &str, kind: PackageKind, dependencies: &[(&str, &str)]) -> PackageInfo {
        PackageInfo {
            name: name.to_string(),
            version: "1.0.0".to_string(),
            path: PathBuf::from(format!("/tmp/{name}")),
            kind,
            scope: None,
            dependencies: dependencies
                .iter()
                .map(|(target, range)| {
                    (
                        (*target).to_string(),
                        DepSpec {
                            raw: (*range).to_string(),
                            field: DepField::Dependencies,
                            range: (*range).to_string(),
                        },
                    )
                })
                .collect::<HashMap<_, _>>(),
            raw_json: Value::Null,
            error: None,
        }
    }

    #[test]
    fn semver_drift_detection_covers_common_npm_ranges() {
        let cases = [
            ("2.1.0", "2.1.0", false),
            ("2.1.0", "2.2.0", true),
            ("^2.1.0", "2.9.0", false),
            ("^2.1.0", "3.0.0", true),
            ("^0.2.1", "0.2.5", false),
            ("^0.2.1", "0.3.0", true),
            ("^0.0.3", "0.0.3", false),
            ("^0.0.3", "0.0.4", true),
            ("~2.1.0", "2.1.9", false),
            ("~2.1.0", "2.2.0", true),
            (">=0.1.9", "0.5.0", false),
            (">=0.1.9", "0.1.8", true),
            (">=1.0.0, <2.0.0", "1.5.0", false),
            (">=1.0.0, <2.0.0", "2.0.0", true),
            ("*", "9.9.9", false),
            ("1", "1.8.0", false),
            ("1", "2.0.0", true),
            ("1.2", "1.2.9", false),
            ("1.2", "1.3.0", false),
            ("1.0.0-beta.3", "1.0.0-beta.3", false),
            ("1.0.0-beta.3", "1.0.0", true),
            ("workspace:^0.2.1", "0.2.9", false),
            ("workspace:^0.2.1", "0.3.0", true),
        ];
        for (range, version, expected) in cases {
            assert_eq!(
                drift_status(range, version).0,
                expected,
                "range {range}, version {version}"
            );
        }
    }

    #[test]
    fn orders_a_linear_dependency_chain_dependency_first() {
        let packages = vec![
            package("app", PackageKind::Application, &[("ui", "0.9.0")]),
            package("ui", PackageKind::Library, &[("hooks", "0.9.0")]),
            package("hooks", PackageKind::Library, &[]),
        ];
        let result = compute(&packages);
        assert_eq!(result.update_order, vec!["hooks", "ui", "app"]);
    }

    #[test]
    fn orders_a_diamond_stably() {
        let packages = vec![
            package(
                "app",
                PackageKind::Application,
                &[("left", "1.0.0"), ("right", "1.0.0")],
            ),
            package("left", PackageKind::Library, &[("core", "0.9.0")]),
            package("right", PackageKind::Library, &[("core", "0.9.0")]),
            package("core", PackageKind::Library, &[]),
        ];
        let result = compute(&packages);
        assert_eq!(result.update_order, vec!["core", "left", "right", "app"]);
    }

    #[test]
    fn puts_applications_last_within_a_layer() {
        let packages = vec![
            package("z-app", PackageKind::Application, &[("core", "0.9.0")]),
            package("a-lib", PackageKind::Library, &[("core", "0.9.0")]),
            package("core", PackageKind::Library, &[]),
        ];
        let result = compute(&packages);
        assert_eq!(result.update_order, vec!["core", "a-lib", "z-app"]);
    }

    #[test]
    fn detects_cycles_and_disables_update_order() {
        let packages = vec![
            package("a", PackageKind::Library, &[("b", "0.9.0")]),
            package("b", PackageKind::Library, &[("a", "0.9.0")]),
        ];
        let result = compute(&packages);
        assert_eq!(result.cycles, vec![vec!["a".to_string(), "b".to_string()]]);
        assert!(result.update_order.is_empty());
    }
}
