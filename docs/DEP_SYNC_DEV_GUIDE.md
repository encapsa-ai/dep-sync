# Dependency Sync Tool — Developer Specification

**Owner:** Jordan Hudgens
**Audience:** Local coding agent (Claude Code / Codex CLI) implementing on Jordan's Mac and Linux workstations
**Status:** Ready for implementation
**Version:** 1.0

---

## 1. Purpose

A personal desktop tool that visualizes and manages version drift across ~20 internal npm libraries and ~6 applications that depend on them. When a library is published with a new version, the tool must show — in the correct cascading order — which other libraries and applications need their `package.json` updated to stay in sync.

The tool must read only local `package.json` files (no npm registry lookups) so it reflects reality the moment after `pnpm publish` finishes, before the registry catches up.

**Non-goals:**
- Managing external (non-internal) dependencies
- Automating `git commit` or `pnpm publish` (user does these in terminal)
- Running tests, builds, or CI
- Multi-user or team features

---

## 2. Stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | **Tauri v2** | Native binaries for macOS + Linux, ~10MB bundle, Rust backend, first-class fs/shell plugins |
| Backend | **Rust** (Tauri commands) | Fast package.json parsing, safe file writes, matches Jordan's Octane stack |
| Frontend | **React 19 + Vite + TypeScript** | Matches existing stack |
| Styling | **Tailwind CSS v4** | Matches existing stack |
| Graph rendering | **React Flow (`@xyflow/react`)** | Best-in-class DAG visualization with pan/zoom, minimal setup |
| State | **Zustand** | Small, no ceremony |
| Config format | **TOML** (via `serde` + `toml` crate) | Human-editable, comments supported, better than JSON for hand-editing |
| Package manager | **pnpm** | Matches existing repos |

**Do not use:** Electron (too heavy), NodeGUI (weak ecosystem), any web-only stack (needs local FS).

---

## 3. Project Layout

```
dep-sync/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── config.rs          # TOML config load/save
│   │   ├── scanner.rs         # Read package.json files
│   │   ├── graph.rs           # Build DAG, compute update order
│   │   ├── mutator.rs         # Write package.json changes atomically
│   │   ├── terminal.rs        # Spawn terminal in a directory
│   │   └── commands.rs        # Tauri #[command] exports
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── GraphView.tsx      # React Flow DAG
│   │   ├── ListView.tsx       # Sortable table (alternative view)
│   │   ├── PackageCard.tsx    # Node in graph / row in list
│   │   ├── DriftBadge.tsx     # "3 outdated deps" indicator
│   │   ├── UpdatePanel.tsx    # Sidebar: what will change on click
│   │   ├── ConfigEditor.tsx   # Edit config.toml in-app
│   │   └── UpdateOrderList.tsx # Ordered list of what to publish next
│   ├── lib/
│   │   ├── tauri.ts           # Typed wrappers around invoke()
│   │   ├── types.ts
│   │   └── semver.ts          # Version comparison helpers
│   └── styles.css
├── package.json
├── pnpm-lock.yaml
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 4. Configuration

### 4.1 Config file location

Follow OS conventions via `dirs` crate:
- **macOS:** `~/Library/Application Support/dep-sync/config.toml`
- **Linux:** `~/.config/dep-sync/config.toml`

On first launch, if no config exists, seed with an empty template and open the in-app config editor.

### 4.2 Config schema (`config.toml`)

```toml
# Root paths where package.json files live. Absolute paths.
# The `kind` field distinguishes libraries (publishable) from applications (consumers only).
# The `scope` field is optional and used only for grouping/filtering in the UI.

[[packages]]
name = "@opensite/ui"
path = "/Users/jordan/code/opensite-ai/opensite-ui"
kind = "library"
scope = "opensite"

[[packages]]
name = "@page-speed/pressable"
path = "/Users/jordan/code/opensite-ai/page-speed-pressable"
kind = "library"
scope = "page-speed"

[[packages]]
name = "toastability-app"
path = "/Users/jordan/code/Toastability/app"
kind = "application"
scope = "toastability"

# Optional: which package.json field to treat as the source of truth.
# Default: "dependencies". Also considers "devDependencies" and "peerDependencies".
[settings]
dep_fields = ["dependencies", "devDependencies", "peerDependencies"]
# Terminal command for "Open Terminal Here". Platform-detected default provided.
# macOS default: uses osascript to open Terminal.app
# Linux default: tries $TERMINAL, then falls back to x-terminal-emulator, gnome-terminal, konsole, alacritty, kitty
terminal_command = ""  # empty = auto-detect
```

**Critical:** The `name` field MUST match the `name` in the target `package.json` exactly. This is the join key.

### 4.3 Config editor UI

A simple form-based editor inside the app (settings icon in header):
- Table of packages with columns: name, path, kind, scope, [remove]
- "Add package" button opens a row with a native folder picker (`@tauri-apps/plugin-dialog`)
- When a folder is picked, auto-populate `name` by reading its `package.json`
- "Save" writes atomically to the config path
- "Reveal config file" button opens the config in the OS default editor

---

## 5. Data Model

### 5.1 Rust types (`src-tauri/src/scanner.rs`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub name: String,           // from package.json
    pub version: String,        // from package.json
    pub path: PathBuf,          // config path (dir containing package.json)
    pub kind: PackageKind,      // Library | Application
    pub scope: Option<String>,
    pub dependencies: HashMap<String, DepSpec>,  // internal deps only
    pub raw_json: serde_json::Value,             // full parsed package.json, preserved for writes
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepSpec {
    pub raw: String,            // "^0.2.1", ">=0.1.9", "2.1.0"
    pub field: DepField,        // Dependencies | DevDependencies | PeerDependencies
    pub range: SemverRange,     // parsed
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PackageKind { Library, Application }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DepField { Dependencies, DevDependencies, PeerDependencies }
```

Use the `semver` crate for range parsing. Preserve the original spec string so writes can respect the user's range style (see §7.2).

### 5.2 TypeScript mirror (`src/lib/types.ts`)

Mirror the Rust types 1:1. Generate via `ts-rs` crate on the Rust side to avoid drift — add `#[derive(TS)]` to each type and configure `ts-rs` to emit into `src/lib/types.ts` at build time.

---

## 6. Graph Algorithm

### 6.1 Build

1. Load all packages from config.
2. Read each `package.json`. Extract `name`, `version`, and for each of the three dep fields, only entries whose key matches a `name` in the config. Everything external is discarded from the graph.
3. Build a directed graph: edge `A → B` means "A depends on B". So B must be published/updated before A.
4. Detect cycles. Cycles between libraries are almost certainly a mistake — surface loudly with the cycle path shown in the UI, and refuse to compute an update order until the user resolves or explicitly acknowledges.

### 6.2 Drift detection

For each package `A` and each internal dependency `B` of `A`:

- Let `installed_range = A.dependencies[B].range` (parsed semver range)
- Let `current_version = B.version` (the actual current version on disk)
- **Drift exists if `current_version` does NOT satisfy `installed_range`.**

Examples:
- `A` requires `"@opensite/hooks": "2.1.0"`, `hooks` package.json version is `2.2.0` → **drift** (exact pin, doesn't satisfy)
- `A` requires `"@page-speed/lightbox": "^0.2.1"`, `lightbox` version is `0.2.5` → no drift (caret satisfies)
- `A` requires `"@page-speed/lightbox": "^0.2.1"`, `lightbox` version is `0.3.0` → **drift** (caret doesn't cross minor when major is 0)
- `A` requires `"@page-speed/pdf-viewer": ">=0.1.9"`, `pdf-viewer` version is `0.5.0` → no drift

Use `semver::VersionReq::matches(&Version)` from the `semver` crate. Do not roll your own.

### 6.3 Cascading update order

When the user selects one or more "root" packages that just changed (or when computing "everything that needs updating right now"):

1. Compute the set `S` of packages that transitively depend on any package with drift.
2. **Topologically sort `S`** so dependencies come before dependents.
3. Return the sorted list. This is the order the user should update/publish.

Use Kahn's algorithm (BFS-based topo sort). Ties within a topological layer should be broken alphabetically by name for stable output.

**Application packages always come last within their layer** since they don't get published and updating them doesn't cascade further.

### 6.4 Preview: what changes on click

When the user clicks a node with drift, compute exactly which lines in that package's `package.json` will change:

```
@opensite/ui  (current: 3.2.1)

Changes needed:
  dependencies:
    @opensite/hooks:        2.1.0    → 2.2.0
    @page-speed/lightbox:   ^0.2.1   → ^0.2.5   (range preserved)
    @page-speed/img:        0.4.9    → 0.5.0

After applying, publishing this library will trigger updates in:
  → toastability-app
  → hitting-com
  → 3 other consumers (expand)
```

---

## 7. Actions

### 7.1 Sync deps (click a package with drift)

**Behavior:** Rewrites this package's `package.json` so every internal dep uses a spec that satisfies the current version of the target. Applications and libraries both support this.

**Range preservation rules:**
- Exact pin (`"2.1.0"`) → new exact pin (`"2.2.0"`)
- Caret (`"^0.2.1"`) → new caret at same precision (`"^0.2.5"`)
- Tilde (`"~0.2.1"`) → new tilde (`"~0.2.5"`)
- Range (`">=0.1.9"`) → leave unchanged if current satisfies; otherwise update lower bound to current version (`">=0.5.0"`)
- Anything else exotic → prompt user, don't silently rewrite

**Write safety:**
- Read the full `package.json` as `serde_json::Value` (preserves key order via `preserve_order` feature).
- Modify only the specific dep entries.
- Write to a temp file in the same directory, `fsync`, then atomic `rename` over the original.
- Preserve trailing newline and 2-space indentation (match npm/pnpm convention). Detect existing indentation from the source and reuse it.

### 7.2 Bump version (click a library)

**Behavior:** Increments the `version` field's patch by 1 (e.g., `0.4.9 → 0.4.10`, `2.1.0 → 2.1.1`, `1.0.0-beta.3 → 1.0.1` per semver).

Use `semver::Version::from_str`, then `v.patch += 1; v.pre = Prerelease::EMPTY; v.build = BuildMetadata::EMPTY;` and write back.

Only enabled for `kind = "library"`.

Show a confirmation modal with old → new version. No undo, but Git will save you.

### 7.3 Open terminal here (click any package)

Spawn a native terminal in the package's directory.

**macOS implementation:**
```rust
Command::new("osascript")
    .arg("-e")
    .arg(format!(
        r#"tell application "Terminal" to do script "cd {}""#,
        shell_escape(&path)
    ))
    .spawn()
```
Also support iTerm2 via detection: if `/Applications/iTerm.app` exists, prefer it.

**Linux implementation:**

Try in order:
1. Config-supplied `terminal_command` (if set)
2. `$TERMINAL` env var
3. `x-terminal-emulator` (Debian/Ubuntu)
4. `gnome-terminal --working-directory=<path>`
5. `konsole --workdir <path>`
6. `alacritty --working-directory <path>`
7. `kitty --directory <path>`
8. `xterm -e "cd <path> && $SHELL"`

If none found, show error with instructions to set `terminal_command` in config.

**Never** run shell commands inside the app itself. This is a spawn-and-detach operation.

---

## 8. Tauri Commands

Expose these commands from Rust to the frontend. All return `Result<T, String>` where the error is a user-friendly message.

```rust
#[tauri::command] fn load_config() -> Result<Config, String>
#[tauri::command] fn save_config(config: Config) -> Result<(), String>
#[tauri::command] fn config_path() -> Result<String, String>
#[tauri::command] fn scan_all() -> Result<Vec<PackageInfo>, String>
#[tauri::command] fn compute_graph(packages: Vec<PackageInfo>) -> Result<GraphResult, String>
#[tauri::command] fn preview_sync(package_name: String) -> Result<SyncPreview, String>
#[tauri::command] fn apply_sync(package_name: String) -> Result<(), String>
#[tauri::command] fn bump_patch(package_name: String) -> Result<String, String>  // returns new version
#[tauri::command] fn open_terminal(package_name: String) -> Result<(), String>
#[tauri::command] fn pick_folder() -> Result<Option<String>, String>
```

`GraphResult` shape:
```rust
struct GraphResult {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
    update_order: Vec<String>,  // package names, in order
    cycles: Vec<Vec<String>>,   // any detected cycles
}

struct GraphNode {
    name: String,
    version: String,
    kind: PackageKind,
    drift_count: usize,        // how many of its deps have drift
    is_stale_dep: bool,        // is this package a dep that others need to update to
    outdated_by: Vec<String>,  // names of packages this one is stale relative to
}
```

---

## 9. UI Specification

### 9.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│ dep-sync   [Rescan] [Graph|List] [Filter▾] [Settings⚙]      │
├──────────────────────────────────────────────────────────────┤
│                                       │                      │
│                                       │  Update Order        │
│                                       │  ──────────────      │
│         Graph / List View             │  1. hooks    v2.2.0  │
│                                       │  2. img      v0.5.0  │
│                                       │  3. ui       (sync)  │
│                                       │  4. app      (sync)  │
│                                       │                      │
│                                       │  ──────────────      │
│                                       │  Details             │
│                                       │  [selected package   │
│                                       │   info + actions]    │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Graph view (default)

- React Flow DAG.
- Nodes color-coded:
  - **Green:** no drift, not stale
  - **Yellow:** has outgoing drift (needs to update its deps)
  - **Blue:** is a stale target (other packages need to update to this one) — usually the just-published library
  - **Red:** in a dependency cycle
  - **Gray:** applications (visually distinct from libraries regardless of state)
- Edge style:
  - Solid gray = dep satisfied
  - Red dashed with animation = drift on this edge
- Node label: `@scope/name` on top, `v1.2.3` below, badge with drift count if any.
- Click node → selects it and populates the right sidebar.
- Auto-layout with `dagre` (via `@dagrejs/dagre`). Left-to-right, dependencies flow rightward.

### 9.3 List view (toggle)

Table with columns: Name | Version | Kind | Drift | Deps out of sync | Actions

Sortable by any column. Default sort: drift count desc, then name asc.

### 9.4 Update order panel (right sidebar, top half)

Ordered list of packages to update, in topological order. Each item:
- Number badge
- Package name + current version
- Small action buttons: [Sync deps] [Bump patch] [Open terminal]
- Grayed out once its drift is resolved (post-sync)

Header shows: `N packages need updates` with a `Sync all` button that walks the list top to bottom applying `sync deps` (but never `bump patch` — that's always manual).

### 9.5 Details panel (right sidebar, bottom half)

For the selected package:
- Full path (click to copy)
- Kind, scope
- Full internal dep list with current spec vs. target version, drift highlighted
- Buttons:
  - **Sync deps** (disabled if no drift) — shows preview modal first
  - **Bump patch** (libraries only) — shows confirmation with old → new
  - **Open terminal**
  - **Open in Finder / File Manager** (nice-to-have, uses `tauri-plugin-opener`)

### 9.6 Filter bar

Multi-select filters:
- Kind: library / application
- Scope: (dynamically populated from config)
- Status: has drift / clean / stale target

### 9.7 Empty / error states

- No config: full-screen prompt with "Add your first package" button opening config editor
- No drift anywhere: green banner "All 26 packages in sync"
- Cycle detected: red banner at top listing cycle members, graph highlights them, update order disabled
- Package path missing on disk: show that node as red with error icon, tooltip explains

---

## 10. Cross-Platform Distribution

### 10.1 Build targets

Configure `tauri.conf.json` bundle targets:
- macOS: `dmg` + `app`, both `aarch64-apple-darwin` and `x86_64-apple-darwin` (or universal via `--target universal-apple-darwin`)
- Linux: `appimage` + `deb`

### 10.2 Code signing

- **macOS:** For personal use, unsigned is fine. Include a README note about right-clicking → Open on first launch to bypass Gatekeeper. If Jordan wants to sign, document `APPLE_CERTIFICATE`, `APPLE_SIGNING_IDENTITY`, and notarization env vars.
- **Linux:** No signing needed.

### 10.3 Build commands (in README)

```bash
# Dev
pnpm install
pnpm tauri dev

# Production build (current OS)
pnpm tauri build

# macOS universal
pnpm tauri build --target universal-apple-darwin

# Linux (from Linux host)
pnpm tauri build --bundles appimage,deb
```

Cross-compilation macOS↔Linux is possible but painful. Recommend building on each host natively. Jordan has both (per system context).

### 10.4 Config portability

Config paths differ per OS. The tool ships **without** any preconfigured packages. On first launch, the user adds paths for their current machine. If Jordan wants to sync configs between his Mac and Linux boxes, he can symlink the config file to a Dropbox/iCloud path — document this in the README but don't build it in.

---

## 11. Testing

**Priority: correctness of the graph and version comparison. Everything else is glue.**

### 11.1 Rust unit tests

- `semver` drift detection: 20+ cases covering exact, caret, tilde, range, pre-release, `0.x` special cases
- Topological sort: linear chain, diamond, multiple roots, cycles
- Config load/save round-trip
- Range-preserving version updates (7.1)

### 11.2 Fixtures

Create `src-tauri/tests/fixtures/` with ~5 fake package.json files reproducing the exact dependency structure from Jordan's `@opensite/ui` example in the spec. Integration test: scan → build graph → assert update order matches expected.

### 11.3 Manual smoke test checklist (in README)

- [ ] Fresh install launches without config
- [ ] Adding a package auto-fills name from package.json
- [ ] Rescan picks up an out-of-band `pnpm publish` bumping a version
- [ ] Graph edges turn red when drift is introduced
- [ ] Sync deps writes correct spec (test all 4 range styles)
- [ ] Bump patch increments correctly and shows in graph after rescan
- [ ] Open terminal lands in correct directory (test on both macOS Terminal and iTerm2 if installed)
- [ ] Open terminal on Linux with each fallback

### 11.4 Do NOT test

- React Flow rendering (trust the library)
- Tauri IPC plumbing (trust the framework)

---

## 12. Acceptance Criteria

The tool is done when:

1. **Config:** Jordan can add 26 packages via the in-app editor and see them all appear.
2. **Scan:** A single "Rescan" completes in <500ms for 26 packages on his machine and shows correct versions from disk.
3. **Drift accuracy:** For every drift case in §6.2, the tool matches the expected result. Verified against the actual `@opensite/ui` package.json from the spec.
4. **Order accuracy:** Given a manually-verified scenario (e.g., bump `@page-speed/img` on disk without updating any consumers), the update order list matches what Jordan would derive by hand, with libraries before applications.
5. **Sync deps:** Writes `package.json` preserving key order, indentation, trailing newline, and range style. Diff-clean against a manual edit.
6. **Bump patch:** Increments correctly for `0.x.y`, `1.2.3`, and versions with pre-release tags.
7. **Terminal:** Opens in correct directory on macOS (Terminal or iTerm2) and Linux (whichever emulator is available).
8. **Cross-platform:** Same binary source builds and runs on Jordan's Mac and Linux without code changes.
9. **No network calls:** Verified — the tool works fully offline.

---

## 13. Out-of-scope (do not build)

- npm registry integration
- Git operations
- Running `pnpm publish`
- Monorepo/workspace detection (each package is treated independently even if it lives in a monorepo — Jordan controls the paths)
- Multi-project support (single config, single graph)
- Auto-refresh / file watching (Rescan button is enough)
- Undo history (Git is the undo)

---

## 14. Suggested build order for the agent

1. **Scaffold** Tauri v2 + React + Vite + Tailwind v4 + TypeScript. Verify `pnpm tauri dev` opens a window.
2. **Config module** in Rust with load/save/path. TOML round-trip test.
3. **Scanner + graph** in Rust with fixture-based tests. Get §6 rock-solid before touching UI.
4. **Tauri commands** exposing scan/graph. Verify from a simple React page that dumps JSON.
5. **List view** first — it's simpler than the graph and validates the full data pipeline end-to-end.
6. **Graph view** with React Flow + dagre.
7. **Config editor** UI.
8. **Actions:** sync deps, bump patch, open terminal — in that order.
9. **Polish:** filters, empty states, cycle handling.
10. **Package** for macOS and Linux. Test both.

---

## 15. Notes on Jordan's environment

- Uses **pnpm**, not npm or yarn. All published range styles Jordan uses in the spec example are supported (exact, caret, `>=`).
- Uses **Zed** and **VS Code**. Config editor should just open the TOML in `$EDITOR` or use `tauri-plugin-opener` to launch the OS default — don't build an in-app text editor for the raw file.
- Repos live under paths like `/Users/jordan/code/opensite-ai/*` on Mac and likely `/home/jordan/code/*` on Linux. The tool must not hardcode either.
- Jordan is comfortable editing TOML directly, so the config editor UI is a convenience, not a requirement for MVP. If time-constrained, ship with just "Reveal config file" and skip the form-based editor.

---

## 16. Deliverables

- Working `pnpm tauri build` artifacts for the target OS
- README with install, config, and usage instructions
- Config template committed as `config.example.toml`
- Test suite passing with `cargo test`
