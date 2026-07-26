import { create } from "zustand";
import { desktop } from "./tauri";
import type { Config, GraphResult, PackageInfo } from "./types";

type NoticeKind = "success" | "error" | "info";

export interface Notice {
  kind: NoticeKind;
  message: string;
}

interface AppStore {
  config: Config | null;
  configPath: string;
  packages: PackageInfo[];
  graph: GraphResult | null;
  selectedName: string | null;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  notice: Notice | null;
  lastScannedAt: number | null;
  bootstrap: () => Promise<void>;
  rescan: (quiet?: boolean) => Promise<void>;
  saveConfig: (config: Config) => Promise<void>;
  select: (name: string | null) => void;
  syncPackage: (name: string) => Promise<void>;
  syncAll: () => Promise<void>;
  bumpPackage: (name: string) => Promise<string>;
  openTerminal: (name: string) => Promise<void>;
  openPath: (name: string) => Promise<void>;
  revealConfig: () => Promise<void>;
  exportGraph: () => Promise<string | null>;
  clearNotice: () => void;
  clearError: () => void;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function scanGraph() {
  const packages = await desktop.scanAll();
  const graph = await desktop.computeGraph(packages);
  return { packages, graph };
}

export const useAppStore = create<AppStore>((set, get) => ({
  config: null,
  configPath: "",
  packages: [],
  graph: null,
  selectedName: null,
  loading: true,
  mutating: false,
  error: null,
  notice: null,
  lastScannedAt: null,

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const [config, configPath] = await Promise.all([
        desktop.loadConfig(),
        desktop.configPath(),
      ]);
      const { packages, graph } =
        config.packages.length > 0
          ? await scanGraph()
          : {
              packages: [],
              graph: {
                nodes: [],
                edges: [],
                updateOrder: [],
                cycles: [],
              },
            };
      const selected = get().selectedName;
      const nextSelected =
        selected && graph.nodes.some((node) => node.name === selected)
          ? selected
          : (graph.nodes.find((node) => node.driftCount > 0)?.name ??
            graph.nodes[0]?.name ??
            null);
      set({
        config,
        configPath,
        packages,
        graph,
        selectedName: nextSelected,
        loading: false,
        lastScannedAt: Date.now(),
      });
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
    }
  },

  rescan: async (quiet = false) => {
    set({ loading: true, error: null });
    try {
      const { packages, graph } = await scanGraph();
      const selected = get().selectedName;
      set({
        packages,
        graph,
        selectedName:
          selected && graph.nodes.some((node) => node.name === selected)
            ? selected
            : (graph.nodes[0]?.name ?? null),
        loading: false,
        lastScannedAt: Date.now(),
        notice: quiet ? get().notice : { kind: "success", message: "Scan complete" },
      });
    } catch (error) {
      set({ loading: false, error: errorMessage(error) });
    }
  },

  saveConfig: async (config) => {
    set({ mutating: true, error: null });
    try {
      await desktop.saveConfig(config);
      set({
        config,
        notice: { kind: "success", message: "Configuration saved" },
      });
      await get().rescan(true);
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  select: (selectedName) => set({ selectedName }),

  syncPackage: async (name) => {
    set({ mutating: true, error: null });
    try {
      await desktop.applySync(name);
      set({
        notice: {
          kind: "success",
          message: `Synced dependency ranges in ${name}`,
        },
      });
      await get().rescan(true);
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  syncAll: async () => {
    const graph = get().graph;
    if (!graph) return;
    const driftNames = new Set(
      graph.nodes
        .filter((node) => node.driftCount > 0)
        .map((node) => node.name),
    );
    set({ mutating: true, error: null });
    try {
      for (const name of graph.updateOrder) {
        if (driftNames.has(name)) await desktop.applySync(name);
      }
      set({
        notice: {
          kind: "success",
          message: `Synced ${driftNames.size} package${driftNames.size === 1 ? "" : "s"}`,
        },
      });
      await get().rescan(true);
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  bumpPackage: async (name) => {
    set({ mutating: true, error: null });
    try {
      const version = await desktop.bumpPatch(name);
      set({
        notice: {
          kind: "success",
          message: `Bumped ${name} to v${version}`,
        },
      });
      await get().rescan(true);
      return version;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  openTerminal: async (name) => {
    try {
      await desktop.openTerminal(name);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  openPath: async (name) => {
    try {
      await desktop.openPackagePath(name);
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  revealConfig: async () => {
    try {
      await desktop.revealConfig();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  exportGraph: async () => {
    const graph = get().graph;
    if (!graph) return null;
    set({ mutating: true, error: null });
    try {
      const path = await desktop.exportGraph(graph);
      if (path) {
        const fileName = path.split(/[/\\]/).pop() ?? path;
        set({
          notice: {
            kind: "success",
            message: `Exported ${fileName}`,
          },
        });
      }
      return path;
    } catch (error) {
      set({ error: errorMessage(error) });
      throw error;
    } finally {
      set({ mutating: false });
    }
  },

  clearNotice: () => set({ notice: null }),
  clearError: () => set({ error: null }),
}));
