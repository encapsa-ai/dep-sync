import { invoke } from "@tauri-apps/api/core";
import type {
  Config,
  GraphResult,
  PackageIdentity,
  PackageInfo,
  SyncPreview,
} from "./types";

function friendlyError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("The desktop command failed unexpectedly");
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw friendlyError(error);
  }
}

export const desktop = {
  loadConfig: () => call<Config>("load_config"),
  saveConfig: (config: Config) => call<void>("save_config", { config }),
  configPath: () => call<string>("config_path"),
  scanAll: () => call<PackageInfo[]>("scan_all"),
  computeGraph: (packages: PackageInfo[]) =>
    call<GraphResult>("compute_graph", { packages }),
  previewSync: (packageName: string) =>
    call<SyncPreview>("preview_sync", { packageName }),
  applySync: (packageName: string) =>
    call<void>("apply_sync", { packageName }),
  bumpPatch: (packageName: string) =>
    call<string>("bump_patch", { packageName }),
  openTerminal: (packageName: string) =>
    call<void>("open_terminal", { packageName }),
  pickFolder: () => call<string | null>("pick_folder"),
  inspectPackage: (path: string) =>
    call<PackageIdentity>("inspect_package", { path }),
  revealConfig: () => call<void>("reveal_config"),
  openPackagePath: (packageName: string) =>
    call<void>("open_package_path", { packageName }),
  exportGraph: (graph: GraphResult) =>
    call<string | null>("export_graph", { graph }),
};
