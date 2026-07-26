import { useMemo, useState } from "react";
import {
  Box,
  Check,
  Clipboard,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  SquareTerminal,
} from "lucide-react";
import { displayVersion } from "../lib/semver";
import type { GraphNode, GraphResult, PackageInfo } from "../lib/types";
import { Button } from "./ui";

export function UpdatePanel({
  selectedName,
  graph,
  packages,
  mutating,
  onSync,
  onBump,
  onTerminal,
  onOpenPath,
}: {
  selectedName: string | null;
  graph: GraphResult;
  packages: PackageInfo[];
  mutating: boolean;
  onSync: (name: string) => void;
  onBump: (name: string) => void;
  onTerminal: (name: string) => void;
  onOpenPath: (name: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const selectedNode = graph.nodes.find((node) => node.name === selectedName);
  const selectedPackage = packages.find(
    (item) => item.name === selectedName,
  );
  const targetVersions = useMemo(
    () => new Map(packages.map((item) => [item.name, item.version])),
    [packages],
  );

  if (!selectedNode || !selectedPackage) {
    return (
      <section className="flex min-h-[240px] flex-col items-center justify-center border-t border-border px-6 text-center">
        <Box className="mb-2 size-5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Select a package</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Its dependencies and actions will appear here.
        </p>
      </section>
    );
  }

  const dependencies = Object.entries(selectedPackage.dependencies).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const driftTargets = new Set(
    graph.edges
      .filter(
        (edge) => edge.source === selectedNode.name && edge.isDrift,
      )
      .map((edge) => edge.target),
  );

  const copyPath = async () => {
    await navigator.clipboard.writeText(selectedNode.path);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-border">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Details
          </p>
          <h2
            className="mt-1 truncate text-sm font-semibold text-foreground"
            title={selectedNode.name}
          >
            {selectedNode.name}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {displayVersion(selectedNode.version)}
            <span className="px-1">·</span>
            {selectedNode.kind}
            {selectedNode.scope ? (
              <>
                <span className="px-1">·</span>
                {selectedNode.scope}
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {selectedNode.error ? (
          <div className="mb-3 rounded-lg border border-destructive/35 bg-destructive-muted px-3 py-2.5 text-xs leading-relaxed text-destructive">
            {selectedNode.error}
          </div>
        ) : null}

        <button
          className="group mb-4 flex w-full items-start gap-2 rounded-lg border border-border bg-muted/35 px-2.5 py-2 text-left transition-colors hover:bg-accent"
          onClick={copyPath}
          title="Copy full path"
        >
          {copied ? (
            <Check className="mt-0.5 size-3 shrink-0 text-success" />
          ) : (
            <Clipboard className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 break-all font-mono text-[10px] leading-relaxed text-muted-foreground group-hover:text-foreground">
            {selectedNode.path}
          </span>
        </button>

        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Internal dependencies
          </p>
          <span className="text-[10px] text-muted-foreground">
            {dependencies.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {dependencies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No internal dependencies
            </div>
          ) : (
            dependencies.map(([name, dependency]) => {
              const drift = driftTargets.has(name);
              return (
                <div
                  key={name}
                  className={`rounded-lg border px-2.5 py-2 ${
                    drift
                      ? "border-warning/35 bg-warning-muted"
                      : "border-border bg-muted/25"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-foreground">
                      {name}
                    </span>
                    <span className="rounded bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                      {dependency.field}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                    <span
                      className={
                        drift ? "text-warning" : "text-muted-foreground"
                      }
                    >
                      {dependency.raw}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-foreground">
                      {targetVersions.get(name) ?? "unknown"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/20 p-3">
        <Button
          size="sm"
          variant="primary"
          disabled={
            selectedNode.driftCount === 0 ||
            Boolean(selectedNode.error) ||
            mutating
          }
          onClick={() => onSync(selectedNode.name)}
        >
          <RefreshCw className="size-3" />
          Sync deps
        </Button>
        <Button
          size="sm"
          disabled={
            selectedNode.kind !== "library" ||
            Boolean(selectedNode.error) ||
            mutating
          }
          onClick={() => onBump(selectedNode.name)}
        >
          <ExternalLink className="size-3" />
          Bump patch
        </Button>
        <Button
          size="sm"
          disabled={Boolean(selectedNode.error)}
          onClick={() => onTerminal(selectedNode.name)}
        >
          <SquareTerminal className="size-3" />
          Terminal
        </Button>
        <Button
          size="sm"
          disabled={Boolean(selectedNode.error)}
          onClick={() => onOpenPath(selectedNode.name)}
        >
          <FolderOpen className="size-3" />
          Finder
        </Button>
      </div>
    </section>
  );
}

