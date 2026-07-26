import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertOctagon, Box, PanelsTopLeft } from "lucide-react";
import { displayVersion } from "../lib/semver";
import type { GraphNode } from "../lib/types";
import { DriftBadge } from "./DriftBadge";

export type PackageNodeData = GraphNode & {
  selected: boolean;
  inCycle: boolean;
} & Record<string, unknown>;
export type PackageFlowNode = Node<PackageNodeData, "package">;

const statusStyles = {
  error: "border-destructive/70 bg-destructive-muted",
  cycle: "border-destructive bg-destructive-muted",
  application: "border-app/40 bg-app-muted",
  drift: "border-warning/60 bg-warning-muted",
  stale: "border-info/60 bg-info-muted",
  clean: "border-success/45 bg-success-muted",
};

export function PackageCard({ data }: NodeProps<PackageFlowNode>) {
  const status = data.error
    ? "error"
    : data.inCycle
      ? "cycle"
      : data.kind === "application"
        ? "application"
        : data.driftCount > 0
          ? "drift"
          : data.isStaleDep
            ? "stale"
            : "clean";
  const KindIcon = data.kind === "library" ? Box : PanelsTopLeft;

  return (
    <div
      className={`relative w-[218px] rounded-xl border px-3.5 py-3 shadow-lg transition-all ${
        statusStyles[status]
      } ${data.selected ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
      title={data.error ?? data.name}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-2 !border-background !bg-border-strong"
      />
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-current/10 bg-background/35">
          {data.error || data.inCycle ? (
            <AlertOctagon className="size-3.5 text-destructive" />
          ) : (
            <KindIcon className="size-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold tracking-[-0.01em] text-foreground">
            {data.name}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {displayVersion(data.version)}
            </span>
            {data.error ? (
              <span className="text-[10px] font-semibold text-destructive">
                path error
              </span>
            ) : (
              <DriftBadge
                count={data.driftCount}
                stale={data.isStaleDep}
                compact
              />
            )}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-background !bg-border-strong"
      />
    </div>
  );
}
