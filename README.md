# dep-sync

dep-sync is a local-first desktop application for visualizing and resolving
version drift across internal npm libraries and the applications that consume
them. It reads local `package.json` files only—there are no registry lookups or
other network calls.

The desktop shell is Tauri v2, the dependency engine is Rust, and the interface
is React 19, Tailwind CSS v4, React Flow, and Zustand.

## What it does

- Scans configured `dependencies`, `devDependencies`, and `peerDependencies`
- Keeps only dependencies whose names are also present in the config
- Detects drift with Rust's `semver::VersionReq`
- Shows a left-to-right dependency graph and a sortable list
- Finds cycles and disables unsafe update ordering
- Computes a stable, dependency-first cascading update order
- Previews exact `package.json` changes before applying them
- Preserves key order, indentation, trailing newline, and supported range style
- Bumps library patch versions after an explicit confirmation
- Opens the selected package in Terminal/iTerm or the file manager
- Exports a deterministic Markdown context file for AI coding agents

dep-sync does not commit, publish, run package-manager commands, run tests, or
modify external dependencies.

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer
- Rust 1.91 or newer
- The [Tauri v2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)

On Linux, install WebKitGTK and the other Tauri system packages documented for
your distribution.

## Development

```bash
pnpm install
pnpm tauri dev
```

Frontend-only checks:

```bash
pnpm test
pnpm build
```

Rust checks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Configuration

The app uses the operating system's standard per-user config directory:

- macOS: `~/Library/Application Support/dep-sync/config.toml`
- Linux: `$XDG_CONFIG_HOME/dep-sync/config.toml`, normally
  `~/.config/dep-sync/config.toml`

Use the settings button to add packages with the native folder picker, or copy
[`config.example.toml`](./config.example.toml) to that location and edit it.
The `name` value must exactly match the corresponding `package.json` name; it is
the join key for the graph.

```toml
[[packages]]
name = "@example/core"
path = "/absolute/path/to/example-core"
kind = "library"
scope = "example"

[[packages]]
name = "example-app"
path = "/absolute/path/to/example-app"
kind = "application"
scope = "example"

[settings]
dep_fields = ["dependencies", "devDependencies", "peerDependencies"]
terminal_command = ""
```

An empty `terminal_command` enables platform detection. A custom command is
spawned directly without a shell; include `{path}` where its working directory
argument belongs.

Jordan's Mac config is already installed at the macOS config path with 20
active libraries and 5 applications. The pending `page-speed-deck` library
listed in `docs/JORDAN_MAC_PATHS.md` is intentionally excluded for now.

## Using the app

1. Click **Rescan** or press **Command-R** after publishing or editing a
   package.
2. Inspect red dashed graph edges or use the sortable list to find drift.
3. Follow **Update order** from top to bottom.
4. Select **Sync deps** and review every proposed range change.
5. Apply the change, then test, commit, and publish in a terminal yourself.
6. Rescan before moving to the next package in the cascade.

Use **Export** to save `dep-sync-agent-context.md`. The export includes graph
semantics, the dependency-first update order, direct and reverse dependency
indexes, current drift, package paths, errors/cycles, and an embedded JSON
payload for agents that prefer structured input. Re-export after publishing or
changing local versions so the file reflects current disk state.

Exact pins, caret ranges, tilde ranges, single `>=` lower bounds, and their
`workspace:` variants are rewritten safely. A satisfying range is left alone.
An outdated exotic range is shown as a warning and must be edited manually.

## Production builds

Build for the current operating system:

```bash
pnpm tauri build
```

Build a universal macOS app:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm tauri build --target universal-apple-darwin
```

Build Linux AppImage and Debian packages from a Linux host:

```bash
pnpm tauri build --bundles appimage,deb
```

macOS and Linux bundles should be built natively. Local macOS bundles are
ad-hoc signed. Public distribution requires an Apple Developer ID certificate
and notarization.

## Manual smoke test

- Launch with a missing config and add a package with the folder picker
- Confirm all configured packages appear after one rescan
- Verify clean, drift, stale-target, application, missing-path, and cycle states
- Compare a drift edge with both package manifests on disk
- Confirm update order places dependencies before consumers and applications
  last within a layer
- Preview a sync and compare its proposed diff with a manual edit
- Apply a sync and verify only the intended dependency strings changed
- Bump a test library with `0.x.y`, `1.2.3`, and a pre-release version
- Open a terminal and file manager at a selected package path
- Disconnect from the network and confirm every feature still works

## Project layout

- `src-tauri/src/config.rs` — TOML config and atomic config writes
- `src-tauri/src/scanner.rs` — tolerant local manifest scanning
- `src-tauri/src/graph.rs` — drift, cycles, and topological ordering
- `src-tauri/src/mutator.rs` — previews and atomic manifest mutation
- `src-tauri/src/terminal.rs` — macOS/Linux terminal detection
- `src-tauri/src/commands.rs` — typed Tauri command boundary
- `src/components/` — graph, list, config, and update panels
- `src/lib/store.ts` — desktop application state and actions
