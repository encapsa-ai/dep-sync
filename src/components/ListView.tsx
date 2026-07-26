import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FolderOpen,
  RefreshCw,
  SquareTerminal,
} from "lucide-react";
import { displayVersion } from "../lib/semver";
import type { GraphNode, GraphResult } from "../lib/types";
import { DriftBadge } from "./DriftBadge";
import { IconButton } from "./ui";

type SortKey = "name" | "version" | "kind" | "drift" | "dependencies";

export function ListView({
  graph,
  visibleNames,
  selectedName,
  onSelect,
  onSync,
  onTerminal,
  onOpenPath,
}: {
  graph: GraphResult;
  visibleNames: Set<string>;
  selectedName: string | null;
  onSelect: (name: string) => void;
  onSync: (name: string) => void;
  onTerminal: (name: string) => void;
  onOpenPath: (name: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>(
    { key: "drift", direction: "desc" },
  );
  const driftDeps = useMemo(() => {
    const bySource = new Map<string, string[]>();
    graph.edges
      .filter((edge) => edge.isDrift)
      .forEach((edge) => {
        bySource.set(edge.source, [
          ...(bySource.get(edge.source) ?? []),
          edge.target,
        ]);
      });
    return bySource;
  }, [graph.edges]);

  const rows = useMemo(() => {
    const value = (node: GraphNode, key: SortKey): string | number => {
      if (key === "drift") return node.driftCount;
      if (key === "dependencies") return driftDeps.get(node.name)?.length ?? 0;
      return node[key];
    };
    return graph.nodes
      .filter((node) => visibleNames.has(node.name))
      .sort((left, right) => {
        const a = value(left, sort.key);
        const b = value(right, sort.key);
        const comparison =
          typeof a === "number" && typeof b === "number"
            ? a - b
            : String(a).localeCompare(String(b));
        if (comparison !== 0)
          return sort.direction === "asc" ? comparison : -comparison;
        return left.name.localeCompare(right.name);
      });
  }, [driftDeps, graph.nodes, sort, visibleNames]);

  const toggleSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));

  return (
    <div className="h-full overflow-auto bg-background">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
          <tr className="border-b border-border text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <SortableHead
              label="Name"
              sortKey="name"
              current={sort}
              onSort={toggleSort}
            />
            <SortableHead
              label="Version"
              sortKey="version"
              current={sort}
              onSort={toggleSort}
            />
            <SortableHead
              label="Kind"
              sortKey="kind"
              current={sort}
              onSort={toggleSort}
            />
            <SortableHead
              label="Drift"
              sortKey="drift"
              current={sort}
              onSort={toggleSort}
            />
            <SortableHead
              label="Deps out of sync"
              sortKey="dependencies"
              current={sort}
              onSort={toggleSort}
            />
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((node) => {
            const dependencies = driftDeps.get(node.name) ?? [];
            return (
              <tr
                key={node.name}
                onClick={() => onSelect(node.name)}
                className={`cursor-pointer border-b border-border/70 transition-colors hover:bg-accent/55 ${
                  node.name === selectedName ? "bg-accent" : ""
                }`}
              >
                <td className="max-w-[260px] px-4 py-3">
                  <div className="truncate font-medium text-foreground">
                    {node.name}
                  </div>
                  {node.error ? (
                    <div
                      className="mt-0.5 truncate text-xs text-destructive"
                      title={node.error}
                    >
                      {node.error}
                    </div>
                  ) : (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {node.scope ?? "unscoped"}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {displayVersion(node.version)}
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {node.kind}
                </td>
                <td className="px-4 py-3">
                  <DriftBadge
                    count={node.driftCount}
                    stale={node.isStaleDep}
                    error={Boolean(node.error)}
                  />
                </td>
                <td className="max-w-[280px] px-4 py-3 text-xs text-muted-foreground">
                  {dependencies.length > 0
                    ? dependencies.join(", ")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div
                    className="flex justify-end gap-0.5"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <IconButton
                      label="Sync dependencies"
                      disabled={node.driftCount === 0 || Boolean(node.error)}
                      onClick={() => onSync(node.name)}
                    >
                      <RefreshCw className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label="Open terminal"
                      disabled={Boolean(node.error)}
                      onClick={() => onTerminal(node.name)}
                    >
                      <SquareTerminal className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label="Open package folder"
                      disabled={Boolean(node.error)}
                      onClick={() => onOpenPath(node.name)}
                    >
                      <FolderOpen className="size-3.5" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
          No packages match the current filters.
        </div>
      ) : null}
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = current.key === sortKey;
  const Icon = !active
    ? ArrowUpDown
    : current.direction === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className={`size-3 ${active ? "text-primary" : ""}`} />
      </button>
    </th>
  );
}
