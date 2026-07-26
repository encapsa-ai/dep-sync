<div align="center">

# dep-sync

**A local-first desktop app for visualizing and resolving version drift across internal npm packages.**

No registry lookups. No network calls. Reads your `package.json` files, shows you what changed, and tells you the exact order to update in.

[![CI](https://github.com/encapsa-ai/dep-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/encapsa-ai/dep-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8DB.svg)](https://v2.tauri.app/)
[![Made with Rust](https://img.shields.io/badge/Rust-1.91+-orange.svg)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)

<img width="800" height="452" alt="dep-sync-animation" src="https://github.com/user-attachments/assets/90fa7b4b-3c42-487a-806d-2ae5c8e9f7fe" />

</div>

---

## The problem

If you maintain a family of internal npm packages that depend on each other — think `@yourco/ui` pulling in `@yourco/hooks`, `@yourco/forms`, `@yourco/icons`, all consumed by three or four apps — you already know the pain:

You publish a patch to `@yourco/hooks`. Now which of your other packages need their `package.json` bumped? In what order do you publish them so the graph converges? Which apps are stuck on stale ranges? And you need the answer **right now**, before the npm registry has caught up to what you just published.

Existing tools (`npm-check-updates`, `syncpack`, `manypkg`, `updated`) all hit the registry. That means stale answers when you need them most.

## What dep-sync does

- **Scans local `package.json` files only** — `dependencies`, `devDependencies`, and `peerDependencies`.
- **Filters to internal packages only** — anything not in your config is ignored. This is a tool for *your* graph, not the whole world.
- **Detects drift** using Rust's [`semver::VersionReq`](https://docs.rs/semver/) — the same crate Cargo uses.
- **Renders a left-to-right dependency graph** and a sortable list view.
- **Finds cycles** and refuses to compute an update order until they're resolved.
- **Computes a stable, dependency-first update order** via Kahn's algorithm — libraries first, applications last within each layer.
- **Previews the exact `package.json` changes** before you apply them.
- **Preserves key order, indentation, trailing newline, and range style** (`"2.1.0"` stays exact, `"^0.2.1"` stays caret, `">=0.1.9"` stays a range). Diff-clean.
- **Bumps library patch versions** with a confirmation.
- **Opens Terminal, iTerm, or your file manager** at the selected package.
- **Exports a Markdown context file for AI coding agents** — graph semantics, update order, drift, package paths, and an embedded JSON payload.

## What dep-sync does **not** do

- No git commits, tags, or pushes.
- No `npm`/`pnpm`/`yarn publish`.
- No test/build runs.
- No modifications to external (non-internal) dependencies.
- No telemetry. No network. Ever.

You stay in the driver's seat. dep-sync tells you what needs to happen and prepares your files; you run the commands.

---

## Screenshots

### Dependency Graph View

<img width="3000" height="1694" alt="Dependency Graph View" src="https://github.com/user-attachments/assets/528f523b-0a8e-4dae-ac2a-8f8b8e97037d" />

### Dependency List View

<img width="3000" height="1694" alt="Dependency List View" src="https://github.com/user-attachments/assets/4a314ca0-677a-4632-9d2f-082be6f008fc" />

### Sync Dialog

<img width="3000" height="1694" alt="Sync Dialog" src="https://github.com/user-attachments/assets/e2d0e63b-46a0-49fc-a7ae-c4d5f7b64db5" />


---

## Install

Prebuilt binaries are attached to each [GitHub Release](https://github.com/encapsa-ai/dep-sync/releases):

- **macOS (Apple Silicon / Intel):** `.dmg`
- **Linux:** `.AppImage` and `.deb`

macOS bundles are ad-hoc signed. On first launch, right-click the app → **Open** to bypass Gatekeeper.

**Windows is not currently supported.** Contributions welcome (see [CONTRIBUTING.md](./CONTRIBUTING.md)).

## Build from source

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/) 10 or newer
- [Rust](https://www.rust-lang.org/tools/install) 1.91 or newer
- The [Tauri v2 platform prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (on Linux this means WebKitGTK and friends)

### Build

```bash
git clone https://github.com/encapsa-ai/dep-sync.git
cd dep-sync
pnpm install
pnpm tauri build
```

Universal macOS binary:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
pnpm tauri build --target universal-apple-darwin
```

Linux AppImage + `.deb`:

```bash
pnpm tauri build --bundles appimage,deb
```

### Develop

```bash
pnpm tauri dev
```

Frontend-only checks:

```bash
pnpm test        # Vitest
pnpm build       # tsc --noEmit && vite build
```

Rust checks:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

---

## Configure

dep-sync reads a single TOML config from the OS's per-user config directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/dep-sync/config.toml` |
| Linux | `$XDG_CONFIG_HOME/dep-sync/config.toml` (usually `~/.config/dep-sync/config.toml`) |

Add packages via the in-app **Settings** button (native folder picker auto-fills the name from `package.json`), or copy [`config.example.toml`](./config.example.toml) and edit it by hand.

```toml
[[packages]]
name = "@yourco/ui"
path = "/absolute/path/to/yourco-ui"
kind = "library"          # or "application"
scope = "yourco"          # optional grouping label

[[packages]]
name = "yourco-app"
path = "/absolute/path/to/yourco-app"
kind = "application"
scope = "yourco"

[settings]
dep_fields = ["dependencies", "devDependencies", "peerDependencies"]
terminal_command = ""     # empty = auto-detect; supports {path} placeholder
```

> **The `name` field must exactly match the `name` in the target `package.json`.** It's the join key for the entire graph.

**Empty `terminal_command` triggers auto-detection.** A custom command is spawned directly (no shell), with `{path}` replaced by the target directory.

---

## Use it

1. Publish or edit a package as usual.
2. Click **Rescan** (or press **⌘R** / **Ctrl+R**).
3. Red dashed edges and drift badges show what fell out of sync.
4. Walk the **Update order** panel top-to-bottom.
5. **Sync deps** → review the proposed range changes → apply.
6. Test, commit, and publish in a terminal.
7. Rescan and continue.

### Range-style handling

| Input spec | Behavior |
|---|---|
| `"2.1.0"` (exact) | Rewritten to new exact version |
| `"^0.2.1"` (caret) | Rewritten preserving caret |
| `"~0.2.1"` (tilde) | Rewritten preserving tilde |
| `">=0.1.9"` (lower bound) | Left alone if satisfied; otherwise lower bound updated |
| `"workspace:*"` variants of the above | Handled |
| `"workspace:^"` etc. | Handled |
| Complex ranges (`>=1 <2`, `||`, etc.) | Shown as warning — edit manually |

Satisfying ranges are never rewritten. dep-sync will never widen a range for you.

### AI coding agent context

Click **Export** to save `dep-sync-agent-context.md` — a deterministic Markdown file containing:

- Full node/edge inventory with drift status
- Dependency-first update order
- Forward and reverse dependency indexes
- Package paths on disk
- Errors and cycles
- Embedded JSON payload for structured consumers

Re-export after each publish so the context reflects current disk state. Paste it into Claude Code, Codex, or any agent and it can reason about the entire graph without needing to run scans itself.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  React 19 + Tailwind v4 + React Flow + Zustand           │
│  (src/)                                                  │
├──────────────────────────────────────────────────────────┤
│  Tauri v2 command boundary (typed via serde)             │
├──────────────────────────────────────────────────────────┤
│  Rust engine (src-tauri/src/)                            │
│    scanner   → tolerant local manifest parsing           │
│    graph     → drift, cycles, topological ordering       │
│    mutator   → atomic manifest writes, range-preserving  │
│    config    → TOML load/save                            │
│    terminal  → macOS/Linux terminal & file-manager spawn │
│    export    → Markdown + JSON agent context             │
└──────────────────────────────────────────────────────────┘
```

**Key design choices:**

- **`serde_json` with `preserve_order`** so `package.json` writes never reorder your keys.
- **Temp-file + fsync + atomic rename** for every mutation. A crash mid-write leaves the original untouched.
- **`semver::VersionReq::matches`** for every drift comparison. No hand-rolled range logic.
- **Kahn's algorithm** for update ordering, alphabetical tiebreak within layers, applications sorted last within each layer.
- **Cycles hard-block the update-order computation.** Between internal libraries they're almost always a bug worth surfacing loudly.

Full source under [`src-tauri/src/`](./src-tauri/src/) and [`src/`](./src/).

---

## Comparison with other tools

| Tool | Registry-free | Cross-repo (not monorepo-only) | Update-order DAG | Range-style preservation | Desktop UI |
|---|:---:|:---:|:---:|:---:|:---:|
| **dep-sync** | ✅ | ✅ | ✅ | ✅ | ✅ |
| [`npm-check-updates`](https://github.com/raineorshine/npm-check-updates) | ❌ | Partial | ❌ | Partial | ❌ |
| [`syncpack`](https://github.com/JamieMason/syncpack) | ❌ | Monorepo-focused | ❌ | ✅ | ❌ |
| [`manypkg`](https://github.com/Thinkmill/manypkg) | ❌ | Monorepo-only | ❌ | ✅ | ❌ |
| pnpm workspaces | N/A | Monorepo-only | Partial | ✅ | ❌ |

dep-sync is designed for the case those tools don't cover: **an internal package family spread across multiple independent repos**, where you need to see the drift and update cascade immediately after a fresh publish.

---

## Roadmap

- [ ] Windows support
- [ ] File watcher for automatic rescan
- [ ] Optional npm registry cross-check (for "did I forget to publish?" catches)
- [ ] Minor and major bump modes with pre-release support
- [ ] CLI companion for headless usage in CI
- [ ] Yarn Berry and Bun workspace protocol support
- [ ] Custom color themes

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, commit conventions, and the testing bar. This is a small, focused tool — new features are held to a high correctness standard, but bug fixes and platform ports are eagerly welcomed.

## Security

Found a vulnerability? Please see [SECURITY.md](./SECURITY.md) for disclosure instructions. dep-sync writes to your local `package.json` files, so we take input handling seriously.

## License

[MIT](./LICENSE) © Jordan Hudgens and dep-sync contributors.

---

<div align="center">
<sub>Built with <a href="https://v2.tauri.app/">Tauri</a>, <a href="https://www.rust-lang.org/">Rust</a>, and <a href="https://react.dev/">React</a>. If dep-sync saved you a debugging session, a ⭐ on GitHub is deeply appreciated.</sub>
</div>
