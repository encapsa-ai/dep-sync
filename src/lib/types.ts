export type PackageKind = "library" | "application";
export type DepField =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies";

export interface PackageConfig {
  name: string;
  path: string;
  kind: PackageKind;
  scope?: string | null;
}

export interface Settings {
  dep_fields: string[];
  terminal_command: string;
}

export interface Config {
  packages: PackageConfig[];
  settings: Settings;
}

export interface DepSpec {
  raw: string;
  field: DepField;
  range: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  path: string;
  kind: PackageKind;
  scope?: string | null;
  dependencies: Record<string, DepSpec>;
  rawJson: unknown;
  error?: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  field: DepField;
  installedRange: string;
  targetVersion: string;
  isDrift: boolean;
  error?: string | null;
}

export interface GraphNode {
  name: string;
  version: string;
  path: string;
  kind: PackageKind;
  scope?: string | null;
  driftCount: number;
  isStaleDep: boolean;
  outdatedBy: string[];
  error?: string | null;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  updateOrder: string[];
  cycles: string[][];
}

export interface SyncChange {
  dependency: string;
  field: DepField;
  from: string;
  to: string;
}

export interface SyncPreview {
  packageName: string;
  version: string;
  changes: SyncChange[];
  downstream: string[];
  canApply: boolean;
  warnings: string[];
}

export interface PackageIdentity {
  name: string;
  version?: string | null;
}

