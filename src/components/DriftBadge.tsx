import { AlertTriangle, Check, Radio } from "lucide-react";

export function DriftBadge({
  count,
  stale = false,
  compact = false,
  error = false,
}: {
  count: number;
  stale?: boolean;
  compact?: boolean;
  error?: boolean;
}) {
  if (error) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-destructive-muted font-medium text-destructive ${
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
        }`}
      >
        <AlertTriangle className={compact ? "size-2.5" : "size-3"} />
        path error
      </span>
    );
  }
  if (count > 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-warning-muted font-medium text-warning ${
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
        }`}
      >
        <AlertTriangle className={compact ? "size-2.5" : "size-3"} />
        {count} outdated
      </span>
    );
  }
  if (stale) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-info-muted font-medium text-info ${
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
        }`}
      >
        <Radio className={compact ? "size-2.5" : "size-3"} />
        source
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-success-muted font-medium text-success ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
      }`}
    >
      <Check className={compact ? "size-2.5" : "size-3"} />
      clean
    </span>
  );
}
