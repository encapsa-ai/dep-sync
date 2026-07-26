# Security Policy

## Threat model

dep-sync is a local desktop application. It:

- Reads and writes `package.json` files under paths listed in a user-controlled config
- Reads and writes its own TOML config file in the OS's per-user config directory
- Spawns terminal emulators and file managers with a target directory argument
- **Makes no network calls of any kind**

The realistic attack surface is:

1. A malicious `package.json` on disk that triggers a parser bug
2. A malicious config file that triggers path traversal or command injection in terminal spawning
3. A malicious range string in a `package.json` that triggers a semver parser crash
4. A supply-chain attack via one of dep-sync's own dependencies

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, use GitHub's private vulnerability reporting:

- Go to <https://github.com/encapsa-ai/dep-sync/security/advisories/new>
- Or email the maintainer via the address listed on the GitHub profile

Include:

- A description of the vulnerability
- Steps to reproduce (a minimal `package.json` or config file if applicable)
- Your assessment of impact
- Any suggested fix

You should receive an acknowledgment within 5 business days. We aim to have a patch ready within 30 days for high-severity issues, sooner for critical ones.

## Supported versions

Only the latest released version receives security updates. dep-sync is early-stage software — please stay current.

## Coordinated disclosure

Once a fix is available, we will:

1. Release a patched version
2. Publish a GitHub Security Advisory with the CVE (if applicable)
3. Credit the reporter unless they prefer to remain anonymous

Thank you for helping keep dep-sync and its users safe.
