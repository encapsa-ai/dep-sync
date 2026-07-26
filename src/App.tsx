import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  Download,
  Filter,
  GitBranch,
  LayoutList,
  Network,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { ConfigEditor } from "./components/ConfigEditor";
import {
  emptyFilters,
  FilterMenu,
  type Filters,
} from "./components/FilterMenu";
import { GraphView } from "./components/GraphView";
import { ListView } from "./components/ListView";
import { UpdateOrderList } from "./components/UpdateOrderList";
import { UpdatePanel } from "./components/UpdatePanel";
import { Button, IconButton, Kbd, Modal, Spinner } from "./components/ui";
import { isMac } from "./lib/platform";
import { isRescanShortcut } from "./lib/shortcuts";
import { desktop } from "./lib/tauri";
import { useAppStore } from "./lib/store";
import type { GraphNode, SyncPreview } from "./lib/types";

type ViewMode = "graph" | "list";
const RESCAN_HINT = isMac() ? "⌘R" : "Ctrl+R";

export default function App() {
  const {
    config,
    configPath,
    packages,
    graph,
    selectedName,
    loading,
    mutating,
    error,
    notice,
    lastScannedAt,
    bootstrap,
    rescan,
    saveConfig,
    select,
    syncPackage,
    syncAll,
    bumpPackage,
    openTerminal,
    openPath,
    revealConfig,
    exportGraph,
    clearNotice,
    clearError,
  } = useAppStore();

  const [view, setView] = useState<ViewMode>("graph");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [syncTarget, setSyncTarget] = useState<string | null>(null);
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [bumpTarget, setBumpTarget] = useState<GraphNode | null>(null);
  const [syncAllOpen, setSyncAllOpen] = useState(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (config && config.packages.length === 0 && !loading) setConfigOpen(true);
  }, [config, loading]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 2800);
    return () => window.clearTimeout(timer);
  }, [clearNotice, notice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isRescanShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!loading && !mutating) void rescan();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [loading, mutating, rescan]);

  const visibleNames = useMemo(() => {
    if (!graph) return new Set<string>();
    return new Set(
      graph.nodes
        .filter((node) => {
          const kindMatches =
            filters.kinds.length === 0 || filters.kinds.includes(node.kind);
          const scopeMatches =
            filters.scopes.length === 0 ||
            (node.scope ? filters.scopes.includes(node.scope) : false);
          const statusMatches =
            filters.statuses.length === 0 ||
            filters.statuses.some((status) => {
              if (status === "drift") return node.driftCount > 0;
              if (status === "stale") return node.isStaleDep;
              return (
                node.driftCount === 0 &&
                !node.isStaleDep &&
                !node.error
              );
            });
          return kindMatches && scopeMatches && statusMatches;
        })
        .map((node) => node.name),
    );
  }, [filters, graph]);

  const filterCount =
    filters.kinds.length + filters.scopes.length + filters.statuses.length;
  const driftCount =
    graph?.nodes.filter((node) => node.driftCount > 0).length ?? 0;
  const pathErrorCount =
    graph?.nodes.filter((node) => Boolean(node.error)).length ?? 0;
  const clean =
    Boolean(graph?.nodes.length) &&
    driftCount === 0 &&
    pathErrorCount === 0 &&
    graph?.cycles.length === 0;

  const requestSync = async (name: string) => {
    setSyncTarget(name);
    setSyncPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      setSyncPreview(await desktop.previewSync(name));
    } catch (previewFailure) {
      setPreviewError(
        previewFailure instanceof Error
          ? previewFailure.message
          : String(previewFailure),
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const applyPreview = async () => {
    if (!syncTarget) return;
    try {
      await syncPackage(syncTarget);
      setSyncTarget(null);
      setSyncPreview(null);
    } catch {
      // The store exposes the user-facing error banner.
    }
  };

  const applyBump = async () => {
    if (!bumpTarget) return;
    try {
      await bumpPackage(bumpTarget.name);
      setBumpTarget(null);
    } catch {
      // The store exposes the user-facing error banner.
    }
  };

  const applySyncAll = async () => {
    try {
      await syncAll();
      setSyncAllOpen(false);
    } catch {
      // The store exposes the user-facing error banner.
    }
  };

  if (loading && !config) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Logo />
          <Spinner label="Loading local dependency graph" />
        </div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-8">
        <div className="max-w-lg rounded-2xl border border-destructive/35 bg-card p-6 text-center shadow-xl">
          <AlertOctagon className="mx-auto size-7 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">
            dep-sync could not start
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {error}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => void bootstrap()}>Try again</Button>
            <Button variant="primary" onClick={() => setConfigOpen(true)}>
              Open settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <div className="flex items-center gap-5">
          <Logo />
          <div className="hidden h-6 w-px bg-border sm:block" />
          <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
            <span>
              <strong className="font-semibold text-foreground">
                {graph?.nodes.length ?? 0}
              </strong>{" "}
              packages
            </span>
            <span>
              <strong
                className={`font-semibold ${driftCount > 0 ? "text-warning" : "text-success"}`}
              >
                {driftCount}
              </strong>{" "}
              need sync
            </span>
            {lastScannedAt ? (
              <span className="text-[10px]">
                scanned{" "}
                {new Date(lastScannedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={loading || mutating}
            onClick={() => void rescan()}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Rescan
            <Kbd>{RESCAN_HINT}</Kbd>
          </Button>
          <Button
            size="sm"
            disabled={!graph || loading || mutating}
            onClick={() => void exportGraph()}
          >
            <Download className="size-3.5" />
            Export
          </Button>
          <div className="flex rounded-lg border border-border bg-muted/35 p-0.5">
            <button
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                view === "graph"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setView("graph")}
            >
              <Network className="size-3.5" />
              Graph
            </button>
            <button
              className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
                view === "list"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setView("list")}
            >
              <LayoutList className="size-3.5" />
              List
            </button>
          </div>
          <div className="relative">
            <Button
              size="sm"
              variant={filterCount > 0 ? "primary" : "secondary"}
              onClick={() => setFilterOpen((value) => !value)}
            >
              <SlidersHorizontal className="size-3.5" />
              Filter
              {filterCount > 0 ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary-foreground/15 text-[9px]">
                  {filterCount}
                </span>
              ) : null}
            </Button>
            {graph ? (
              <FilterMenu
                open={filterOpen}
                graph={graph}
                filters={filters}
                onChange={setFilters}
              />
            ) : null}
          </div>
          <IconButton
            label="Package configuration"
            onClick={() => setConfigOpen(true)}
          >
            <Settings className="size-4" />
          </IconButton>
        </div>
      </header>

      {error ? (
        <Banner tone="error" icon={<AlertOctagon className="size-4" />}>
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <IconButton label="Dismiss error" onClick={clearError}>
            <X className="size-3.5" />
          </IconButton>
        </Banner>
      ) : graph && graph.cycles.length > 0 ? (
        <Banner tone="error" icon={<GitBranch className="size-4" />}>
          Dependency cycle detected:{" "}
          {graph.cycles.map((cycle) => cycle.join(" ↔ ")).join("; ")}. Update
          order is disabled.
        </Banner>
      ) : pathErrorCount > 0 ? (
        <Banner tone="warning" icon={<AlertOctagon className="size-4" />}>
          {pathErrorCount} configured package
          {pathErrorCount === 1 ? " has" : "s have"} a manifest or path issue.
          The remaining packages were still scanned.
        </Banner>
      ) : clean ? (
        <Banner tone="success" icon={<CheckCircle2 className="size-4" />}>
          All {graph?.nodes.length ?? 0} packages in sync
        </Banner>
      ) : null}

      <main className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          {graph && graph.nodes.length > 0 ? (
            view === "graph" ? (
              <GraphView
                graph={graph}
                selectedName={selectedName}
                visibleNames={visibleNames}
                onSelect={select}
              />
            ) : (
              <ListView
                graph={graph}
                visibleNames={visibleNames}
                selectedName={selectedName}
                onSelect={select}
                onSync={(name) => void requestSync(name)}
                onTerminal={(name) => void openTerminal(name)}
                onOpenPath={(name) => void openPath(name)}
              />
            )
          ) : (
            <EmptyState onConfigure={() => setConfigOpen(true)} />
          )}
          {graph && graph.nodes.length > 0 && visibleNames.size === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
              <div className="rounded-xl border border-border bg-card px-6 py-5 text-center shadow-xl">
                <Filter className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No matching packages</p>
                <button
                  className="pointer-events-auto mt-2 text-xs text-primary hover:underline"
                  onClick={() => setFilters(emptyFilters)}
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {graph ? (
          <aside className="flex w-[390px] shrink-0 flex-col border-l border-border bg-sidebar">
            <UpdateOrderList
              graph={graph}
              mutating={mutating}
              onSelect={select}
              onSync={(name) => void requestSync(name)}
              onBump={(name) =>
                setBumpTarget(
                  graph.nodes.find((node) => node.name === name) ?? null,
                )
              }
              onTerminal={(name) => void openTerminal(name)}
              onSyncAll={() => setSyncAllOpen(true)}
            />
            <UpdatePanel
              selectedName={selectedName}
              graph={graph}
              packages={packages}
              mutating={mutating}
              onSync={(name) => void requestSync(name)}
              onBump={(name) =>
                setBumpTarget(
                  graph.nodes.find((node) => node.name === name) ?? null,
                )
              }
              onTerminal={(name) => void openTerminal(name)}
              onOpenPath={(name) => void openPath(name)}
            />
          </aside>
        ) : null}
      </main>

      {notice ? (
        <div
          className={`fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-2xl ${
            notice.kind === "success"
              ? "border-success/35 bg-success-muted text-success"
              : notice.kind === "error"
                ? "border-destructive/35 bg-destructive-muted text-destructive"
                : "border-info/35 bg-info-muted text-info"
          }`}
        >
          <Sparkles className="size-3.5" />
          {notice.message}
        </div>
      ) : null}

      <ConfigEditor
        open={configOpen}
        config={config}
        configPath={configPath}
        saving={mutating}
        onClose={() => setConfigOpen(false)}
        onSave={saveConfig}
        onReveal={() => void revealConfig()}
      />

      <SyncModal
        target={syncTarget}
        preview={syncPreview}
        loading={previewLoading}
        error={previewError}
        mutating={mutating}
        onClose={() => {
          setSyncTarget(null);
          setSyncPreview(null);
          setPreviewError(null);
        }}
        onApply={() => void applyPreview()}
      />

      <BumpModal
        target={bumpTarget}
        mutating={mutating}
        onClose={() => setBumpTarget(null)}
        onApply={() => void applyBump()}
      />

      <Modal
        open={syncAllOpen}
        onClose={() => setSyncAllOpen(false)}
        title="Sync all current drift?"
        description="Dependency files will be updated in topological order. Versions are never bumped automatically."
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSyncAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={mutating}
              onClick={() => void applySyncAll()}
            >
              <RefreshCw className="size-3.5" />
              Sync {driftCount} package{driftCount === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          This modifies only outdated internal dependency entries. Formatting,
          key order, indentation, range style, and trailing newline are
          preserved.
        </p>
      </Modal>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="logo-mark">
        <Network className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-[-0.02em]">
          dep-sync
        </span>
        <span className="block text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          local graph
        </span>
      </span>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "success" | "warning" | "error";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = {
    success: "border-success/25 bg-success-muted text-success",
    warning: "border-warning/25 bg-warning-muted text-warning",
    error: "border-destructive/25 bg-destructive-muted text-destructive",
  };
  return (
    <div
      className={`flex min-h-9 shrink-0 items-center gap-2 border-b px-4 text-xs ${styles[tone]}`}
    >
      {icon}
      {children}
    </div>
  );
}

function EmptyState({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-graph p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-card shadow-xl">
          <Network className="size-5 text-primary" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Build your local graph</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Add the libraries and applications you want to track. dep-sync reads
          their package.json files directly and never contacts a registry.
        </p>
        <Button variant="primary" className="mt-5" onClick={onConfigure}>
          <Settings className="size-3.5" />
          Add your first package
        </Button>
      </div>
    </div>
  );
}

function SyncModal({
  target,
  preview,
  loading,
  error,
  mutating,
  onClose,
  onApply,
}: {
  target: string | null;
  preview: SyncPreview | null;
  loading: boolean;
  error: string | null;
  mutating: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={`Sync ${target ?? ""}`}
      description="Review the exact package.json changes before writing."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={
              !preview ||
              !preview.canApply ||
              preview.changes.length === 0 ||
              mutating
            }
            onClick={onApply}
          >
            <RefreshCw className="size-3.5" />
            Apply changes
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner label="Preparing safe preview" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/35 bg-destructive-muted px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      ) : preview ? (
        <div>
          {preview.changes.length === 0 ? (
            <div className="rounded-lg border border-success/35 bg-success-muted px-3 py-3 text-sm text-success">
              No dependency changes are needed.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="grid grid-cols-[1.5fr_1fr_28px_1fr] gap-3 border-b border-border bg-muted/45 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <span>Dependency</span>
                <span>Current</span>
                <span />
                <span>Updated</span>
              </div>
              {preview.changes.map((change) => (
                <div
                  key={`${change.field}:${change.dependency}`}
                  className="grid grid-cols-[1.5fr_1fr_28px_1fr] items-center gap-3 border-b border-border/70 px-3 py-2.5 text-xs last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {change.dependency}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {change.field}
                    </span>
                  </span>
                  <code className="text-warning">{change.from}</code>
                  <span className="text-center text-muted-foreground">→</span>
                  <code className="text-success">{change.to}</code>
                </div>
              ))}
            </div>
          )}
          {preview.warnings.length > 0 ? (
            <div className="mt-3 rounded-lg border border-warning/35 bg-warning-muted px-3 py-2.5 text-xs leading-relaxed text-warning">
              {preview.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          {preview.downstream.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-medium text-foreground">
                Publishing after this change can affect:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {preview.downstream.map((name) => (
                  <span
                    key={name}
                    className="rounded-md border border-border bg-muted px-2 py-1 text-[10px] text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function BumpModal({
  target,
  mutating,
  onClose,
  onApply,
}: {
  target: GraphNode | null;
  mutating: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const next = target ? nextPatch(target.version) : null;
  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={`Bump ${target?.name ?? ""}`}
      description="This changes only the package version. Publishing remains manual."
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!next || mutating}
            onClick={onApply}
          >
            Bump patch
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-center gap-4 rounded-xl border border-border bg-muted/35 px-4 py-7 font-mono">
        <span className="text-muted-foreground">{target?.version}</span>
        <span className="text-primary">→</span>
        <span className="font-semibold text-foreground">
          {next ?? "invalid semver"}
        </span>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Pre-release and build metadata will be removed.
      </p>
    </Modal>
  );
}

function nextPatch(version: string): string | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
