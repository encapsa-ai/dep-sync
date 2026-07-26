import {
  ArrowRight,
  Box,
  Check,
  RefreshCw,
  SquareTerminal,
  TrendingUp,
} from "lucide-react";
import { displayVersion } from "../lib/semver";
import type { GraphNode, GraphResult } from "../lib/types";
import { Button, IconButton } from "./ui";

export function UpdateOrderList({
  graph,
  mutating,
  onSelect,
  onSync,
  onBump,
  onTerminal,
  onSyncAll,
}: {
  graph: GraphResult;
  mutating: boolean;
  onSelect: (name: string) => void;
  onSync: (name: string) => void;
  onBump: (name: string) => void;
  onTerminal: (name: string) => void;
  onSyncAll: () => void;
}) {
  const nodes = new Map(graph.nodes.map((node) => [node.name, node]));
  const orderedNodes = graph.updateOrder
    .map((name) => nodes.get(name))
    .filter((node): node is GraphNode => Boolean(node));
  const actionable = orderedNodes.filter((node) => node.driftCount > 0).length;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Update order
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {orderedNodes.length === 0
              ? "No cascading updates"
              : `${orderedNodes.length} package${orderedNodes.length === 1 ? "" : "s"} in the cascade`}
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          disabled={actionable === 0 || mutating || graph.cycles.length > 0}
          onClick={onSyncAll}
        >
          <RefreshCw className="size-3" />
          Sync all
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {graph.cycles.length > 0 ? (
          <div className="mx-2 rounded-lg border border-destructive/35 bg-destructive-muted px-3 py-2.5 text-xs text-destructive">
            Resolve dependency cycles before computing an update order.
          </div>
        ) : orderedNodes.length === 0 ? (
          <div className="mx-2 flex h-24 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <Check className="mb-1.5 size-4 text-success" />
            <p className="text-xs font-medium text-foreground">
              Nothing waiting
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              All dependency ranges are satisfied
            </p>
          </div>
        ) : (
          <ol className="space-y-1">
            {orderedNodes.map((node, index) => (
              <li key={node.name}>
                <button
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                  onClick={() => onSelect(node.name)}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    {node.driftCount > 0 ? (
                      <RefreshCw className="size-3 text-warning" />
                    ) : (
                      <Box className="size-3 text-info" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {node.name}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {displayVersion(node.version)}
                      <span className="px-1">·</span>
                      {node.driftCount > 0
                        ? `${node.driftCount} to sync`
                        : node.isStaleDep
                          ? "source version"
                          : "downstream"}
                    </span>
                  </span>
                  <span
                    className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconButton
                      label={`Sync ${node.name}`}
                      disabled={node.driftCount === 0 || mutating}
                      onClick={() => onSync(node.name)}
                    >
                      <RefreshCw className="size-3" />
                    </IconButton>
                    <IconButton
                      label={`Bump ${node.name}`}
                      disabled={node.kind !== "library" || mutating}
                      onClick={() => onBump(node.name)}
                    >
                      <ArrowRight className="size-3" />
                    </IconButton>
                    <IconButton
                      label={`Open terminal for ${node.name}`}
                      disabled={Boolean(node.error)}
                      onClick={() => onTerminal(node.name)}
                    >
                      <SquareTerminal className="size-3" />
                    </IconButton>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

