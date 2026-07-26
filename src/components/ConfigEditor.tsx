import { useEffect, useState } from "react";
import {
  FileCode2,
  FolderSearch,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { desktop } from "../lib/tauri";
import type { Config, PackageConfig, PackageKind } from "../lib/types";
import { Button, IconButton, Modal, Spinner } from "./ui";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
];

export function ConfigEditor({
  open,
  config,
  configPath,
  saving,
  onClose,
  onSave,
  onReveal,
}: {
  open: boolean;
  config: Config | null;
  configPath: string;
  saving: boolean;
  onClose: () => void;
  onSave: (config: Config) => Promise<void>;
  onReveal: () => void;
}) {
  const [draft, setDraft] = useState<Config | null>(config);
  const [localError, setLocalError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(
        config ?? {
          packages: [],
          settings: {
            dep_fields: [...dependencyFields],
            terminal_command: "",
          },
        },
      );
      setLocalError(null);
    }
  }, [config, open]);

  if (!draft) return null;

  const updatePackage = (
    index: number,
    key: keyof PackageConfig,
    value: string,
  ) =>
    setDraft((current) => {
      if (!current) return current;
      const packages = [...current.packages];
      packages[index] = { ...packages[index], [key]: value };
      return { ...current, packages };
    });

  const removePackage = (index: number) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            packages: current.packages.filter((_, itemIndex) => itemIndex !== index),
          }
        : current,
    );

  const addPackage = () =>
    setDraft((current) =>
      current
        ? {
            ...current,
            packages: [
              ...current.packages,
              {
                name: "",
                path: "",
                kind: "library",
                scope: "",
              },
            ],
          }
        : current,
    );

  const chooseFolder = async (index?: number) => {
    setPicking(true);
    setLocalError(null);
    try {
      const path = await desktop.pickFolder();
      if (!path) return;
      const identity = await desktop.inspectPackage(path);
      const packageValue: PackageConfig = {
        name: identity.name,
        path,
        kind: "library",
        scope: identity.name.startsWith("@page-speed/")
          ? "page-speed"
          : identity.name.startsWith("@opensite/")
            ? "opensite"
            : "",
      };
      setDraft((current) => {
        if (!current) return current;
        const packages = [...current.packages];
        if (typeof index === "number") {
          packages[index] = { ...packages[index], ...packageValue };
        } else {
          packages.push(packageValue);
        }
        return { ...current, packages };
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setPicking(false);
    }
  };

  const toggleField = (field: string) =>
    setDraft((current) => {
      if (!current) return current;
      const active = current.settings.dep_fields.includes(field);
      return {
        ...current,
        settings: {
          ...current.settings,
          dep_fields: active
            ? current.settings.dep_fields.filter((item) => item !== field)
            : [...current.settings.dep_fields, field],
        },
      };
    });

  const submit = async () => {
    setLocalError(null);
    try {
      await onSave({
        ...draft,
        packages: draft.packages.map((item) => ({
          ...item,
          name: item.name.trim(),
          path: item.path.trim(),
          scope: item.scope?.trim() || null,
        })),
      });
      onClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Package configuration"
      description="The package name must exactly match its package.json name."
      width="max-w-6xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={saving || draft.settings.dep_fields.length === 0}
            onClick={submit}
          >
            {saving ? (
              <Spinner label="Saving" />
            ) : (
              <>
                <Save className="size-3.5" />
                Save config
              </>
            )}
          </Button>
        </>
      }
    >
      {localError ? (
        <div className="mb-4 rounded-lg border border-destructive/35 bg-destructive-muted px-3 py-2.5 text-xs text-destructive">
          {localError}
        </div>
      ) : null}

      <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-3.5 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Config file</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {configPath || "Operating system config directory"}
          </p>
        </div>
        <Button size="sm" onClick={onReveal}>
          <FileCode2 className="size-3.5" />
          Reveal file
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1.2fr_2fr_120px_140px_44px] gap-2 border-b border-border bg-muted/45 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <span>Name</span>
          <span>Path</span>
          <span>Kind</span>
          <span>Scope</span>
          <span />
        </div>
        <div className="max-h-[330px] overflow-y-auto">
          {draft.packages.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-[1.2fr_2fr_120px_140px_44px] items-center gap-2 border-b border-border/70 px-3 py-2 last:border-b-0"
            >
              <input
                aria-label={`Package ${index + 1} name`}
                className="field"
                value={item.name}
                placeholder="@scope/package"
                onChange={(event) =>
                  updatePackage(index, "name", event.target.value)
                }
              />
              <div className="flex min-w-0 items-center gap-1">
                <input
                  aria-label={`Package ${index + 1} path`}
                  className="field min-w-0 flex-1 font-mono text-[11px]"
                  value={item.path}
                  placeholder="/absolute/path"
                  onChange={(event) =>
                    updatePackage(index, "path", event.target.value)
                  }
                />
                <IconButton
                  label={`Choose folder for ${item.name || `package ${index + 1}`}`}
                  disabled={picking}
                  onClick={() => chooseFolder(index)}
                >
                  <FolderSearch className="size-3.5" />
                </IconButton>
              </div>
              <select
                aria-label={`Package ${index + 1} kind`}
                className="field capitalize"
                value={item.kind}
                onChange={(event) =>
                  updatePackage(
                    index,
                    "kind",
                    event.target.value as PackageKind,
                  )
                }
              >
                <option value="library">Library</option>
                <option value="application">Application</option>
              </select>
              <input
                aria-label={`Package ${index + 1} scope`}
                className="field"
                value={item.scope ?? ""}
                placeholder="optional"
                onChange={(event) =>
                  updatePackage(index, "scope", event.target.value)
                }
              />
              <IconButton
                label={`Remove ${item.name || `package ${index + 1}`}`}
                onClick={() => removePackage(index)}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </IconButton>
            </div>
          ))}
          {draft.packages.length === 0 ? (
            <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
              No packages configured yet.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={addPackage}>
          <Plus className="size-3.5" />
          Add row
        </Button>
        <Button size="sm" onClick={() => chooseFolder()} disabled={picking}>
          <FolderSearch className="size-3.5" />
          {picking ? "Choosing…" : "Add from folder"}
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-5 border-t border-border pt-5">
        <div>
          <p className="text-xs font-medium text-foreground">
            Dependency fields
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Select every package.json section that should participate.
          </p>
          <div className="mt-3 space-y-2">
            {dependencyFields.map((field) => (
              <label
                key={field}
                className="flex cursor-pointer items-center gap-2 text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={draft.settings.dep_fields.includes(field)}
                  onChange={() => toggleField(field)}
                  className="size-4 accent-primary"
                />
                <span className="font-mono">{field}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-foreground">
            Custom terminal command
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Optional. Use {"{path}"} as a placeholder, or leave blank for
            platform auto-detection.
          </span>
          <input
            className="field mt-3 w-full font-mono"
            value={draft.settings.terminal_command}
            placeholder="e.g. wezterm start --cwd {path}"
            onChange={(event) =>
              setDraft({
                ...draft,
                settings: {
                  ...draft.settings,
                  terminal_command: event.target.value,
                },
              })
            }
          />
        </label>
      </div>
    </Modal>
  );
}
