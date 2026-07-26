# Contributing to dep-sync

Thanks for considering a contribution. dep-sync is a small, focused tool with a high correctness bar — the whole point is that it never corrupts your `package.json` files or misreports drift. That guides how we review changes.

## Ways to contribute

- **Bug reports** — please include your OS, Node/pnpm/Rust versions, a redacted excerpt of your config, and reproduction steps. See our [bug report template](./.github/ISSUE_TEMPLATE/bug_report.yml).
- **Feature requests** — open an issue first with the use case. Small tools stay useful by saying no to things.
- **Documentation** — README improvements, screenshots, tutorial write-ups, translations.
- **Windows support** — see [issue #1](https://github.com/encapsa-ai/dep-sync/issues) (or open one). Terminal spawning and the file manager launcher need Windows implementations.
- **Range style handlers** — if your ecosystem uses a range style dep-sync doesn't yet handle safely (e.g., npm aliases, jsr:, catalog:), issues and PRs are welcome.

## Local setup

```bash
git clone https://github.com/encapsa-ai/dep-sync.git
cd dep-sync
pnpm install
pnpm tauri dev
```

You'll need the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

## Development workflow

Create a topic branch off `master`:

```bash
git checkout -b fix/preserve-crlf-newlines
```

Commit conventions follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new user-facing capability
- `fix:` bug fix
- `refactor:` internal cleanup, no behavior change
- `docs:` documentation only
- `test:` tests only
- `chore:` tooling, deps, CI

## The testing bar

Before opening a PR, please run:

```bash
# Frontend
pnpm test
pnpm build

# Rust
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

**Any PR that touches the graph, mutator, scanner, or semver logic must include tests.** The Rust integration tests under `src-tauri/tests/` are the reference — extend them or add new fixtures.

Manifest-mutation changes specifically must prove:

1. **Key order is preserved.** Compare before/after with `pretty_assertions`.
2. **Indentation, trailing newline, and encoding survive.** Test both 2-space and 4-space inputs.
3. **Range style is preserved.** Exact stays exact, caret stays caret, tilde stays tilde, `>=` stays a range.
4. **Atomic write.** Verify via `tempfile` that a mid-write crash cannot corrupt the target.

## Pull request checklist

- [ ] Tests added or updated (and passing locally)
- [ ] `cargo clippy` clean, `cargo fmt` applied
- [ ] `pnpm test` and `pnpm build` pass
- [ ] README / CHANGELOG updated if user-facing behavior changed
- [ ] No new dependencies added without justification in the PR description
- [ ] No network calls introduced — dep-sync is offline-first by design

## Architecture notes for contributors

- **Rust engine is the source of truth.** The React frontend is a viewer plus action dispatcher. Business logic (drift detection, topological sort, mutation) lives in Rust.
- **Types are generated where possible.** Keep the TypeScript types in `src/lib/types.ts` in lockstep with the Rust `serde` structs. Manual sync is fine; drift is a bug.
- **No `unwrap()` in code paths reachable from a Tauri command.** Return a `Result<T, String>` with a user-friendly message.
- **All manifest writes go through `mutator.rs`.** Do not `fs::write` a `package.json` from anywhere else.
- **The offline guarantee is a hard invariant.** Any PR that introduces a network call will be rejected unless it's an explicit opt-in feature clearly gated behind a config flag and documented as such.

## Getting review attention

This is a spare-time project maintained by a single developer. Small, focused PRs with tests get reviewed fastest. Sprawling PRs that mix refactors, features, and formatting changes will be asked to split up.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

Thanks for making dep-sync better.
