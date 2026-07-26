import { Check, Filter, RotateCcw } from "lucide-react";
import type { GraphResult, PackageKind } from "../lib/types";
import { Button } from "./ui";

export type StatusFilter = "drift" | "clean" | "stale";

export interface Filters {
  kinds: PackageKind[];
  scopes: string[];
  statuses: StatusFilter[];
}

export const emptyFilters: Filters = {
  kinds: [],
  scopes: [],
  statuses: [],
};

export function FilterMenu({
  open,
  graph,
  filters,
  onChange,
}: {
  open: boolean;
  graph: GraphResult;
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  if (!open) return null;
  const scopes = [
    ...new Set(
      graph.nodes
        .map((node) => node.scope)
        .filter((scope): scope is string => Boolean(scope)),
    ),
  ].sort();
  const toggle = <T extends string>(items: T[], value: T) =>
    items.includes(value)
      ? items.filter((item) => item !== value)
      : [...items, value];

  return (
    <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-primary" />
          <p className="text-xs font-semibold">Filter packages</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => onChange(emptyFilters)}
        >
          <RotateCcw className="size-3" />
          Reset
        </Button>
      </div>

      <FilterGroup label="Kind">
        {(["library", "application"] as PackageKind[]).map((kind) => (
          <FilterOption
            key={kind}
            label={kind}
            checked={filters.kinds.includes(kind)}
            onClick={() =>
              onChange({ ...filters, kinds: toggle(filters.kinds, kind) })
            }
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Status">
        {(
          [
            ["drift", "Has drift"],
            ["clean", "Clean"],
            ["stale", "Stale target"],
          ] as [StatusFilter, string][]
        ).map(([status, label]) => (
          <FilterOption
            key={status}
            label={label}
            checked={filters.statuses.includes(status)}
            onClick={() =>
              onChange({
                ...filters,
                statuses: toggle(filters.statuses, status),
              })
            }
          />
        ))}
      </FilterGroup>

      {scopes.length > 0 ? (
        <FilterGroup label="Scope">
          <div className="max-h-40 overflow-y-auto pr-1">
            {scopes.map((scope) => (
              <FilterOption
                key={scope}
                label={scope}
                checked={filters.scopes.includes(scope)}
                onClick={() =>
                  onChange({
                    ...filters,
                    scopes: toggle(filters.scopes, scope),
                  })
                }
              />
            ))}
          </div>
        </FilterGroup>
      ) : null}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border py-2.5 first:border-t-0">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterOption({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs capitalize transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <span
        className={`flex size-4 items-center justify-center rounded border ${
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background"
        }`}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      {label}
    </button>
  );
}

