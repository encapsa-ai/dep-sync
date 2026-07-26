# Changelog

All notable changes to dep-sync will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] — 2026-07-26

### Changed

- Version tags now publish GitHub Releases automatically after the macOS, Linux, and Windows bundles all build successfully.

### Fixed

- Package name inputs in the configuration dialog retain focus while editing instead of remounting after every keystroke.

## [0.2.0] — 2026-07-25

### Added

- Windows 10/11 support with an NSIS installer and embedded WebView2 bootstrapper.
- Windows Terminal (`wt.exe`) auto-detection for the Open Terminal action, with PowerShell 7, Windows PowerShell, and `cmd.exe` fallbacks in that order.
- Platform-aware keyboard shortcut label: macOS shows `⌘R`; Windows and Linux show `Ctrl+R`.

### Changed

- `atomic_write` now uses `tempfile::NamedTempFile::persist`, improving replacement reliability on every platform and particularly when another Windows process briefly holds the target file open.
- The rescan shortcut now requires Ctrl on non-Mac platforms. It previously required Meta, which maps to the Windows key on Windows and Super on Linux.

### Fixed

- Linux `x-terminal-emulator` alternatives continue to work when the selected terminal is implemented as a shell script.

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

[Unreleased]: https://github.com/encapsa-ai/dep-sync/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/encapsa-ai/dep-sync/releases/tag/v0.2.1
[0.2.0]: https://github.com/encapsa-ai/dep-sync/releases/tag/v0.2.0
[0.1.0]: https://github.com/encapsa-ai/dep-sync/releases/tag/v0.1.0
