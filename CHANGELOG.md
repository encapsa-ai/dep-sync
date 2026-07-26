# Changelog

All notable changes to dep-sync will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-07-25

### Added

- Initial public release.
- Local-first scanner for `dependencies`, `devDependencies`, and `peerDependencies`.
- Drift detection via `semver::VersionReq`.
- React Flow graph view with drift highlighting.
- Sortable list view.
- Cycle detection that blocks unsafe update ordering.
- Topological update-order computation (dependencies before consumers, applications last within each layer).
- Preview + atomic apply for `package.json` mutations, preserving key order, indentation, trailing newline, and range style.
- Patch-version bump for libraries with confirmation.
- macOS Terminal/iTerm and Linux terminal-emulator auto-detection.
- File manager launcher for the selected package.
- Markdown + JSON export of the full graph state for AI coding agents.
- In-app config editor with native folder picker.
- TOML config stored in the OS's per-user config directory.

[Unreleased]: https://github.com/encapsa-ai/dep-sync/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/encapsa-ai/dep-sync/releases/tag/v0.1.0
