# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript (`tsc -p ./`) |
| `npm run watch` | Watch mode for TypeScript compilation |
| `npm run lint` | Lint source (`eslint src --ext ts`) |
| `npm run package` | Package into `.vsix` via `vsce package` |
| `npm run install-local` | Build, package, and install the extension locally |
| `npm run release` | Compile and publish to VS Code Marketplace |
| `npm run release:patch` | Bump patch version, compile, and publish |
| `npm run release:minor` | Bump minor version, compile, and publish |

### Debug

Press **F5** in VSCode to launch an Extension Host window with the extension loaded (uses [`.vscode/launch.json`](.vscode/launch.json)). The default pre-launch task runs `tsc -p ./`.

### CI

GitHub Actions in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm ci` → `compile` → `lint` on push/PR to `main`, then packages and optionally publishes (requires `VSCE_PAT` secret).

## Architecture

This is a minimal VSCode extension (the developer's first extension practice project).

### Structure

- [`src/extension.ts`](src/extension.ts) — Single entry point exporting `activate` / `deactivate`. Registers one command (`personal-vscode-helper.helloWorld`) that shows an information message. Uses lazy activation (`activationEvents: []` in package.json).
- [`out/extension.js`](out/extension.js) — Compiled output (gitignored).
- [`package.json`](package.json) — Extension manifest with commands, scripts, and dependencies.

### Key patterns

- **No external deps on runtime** — only `@types/vscode` + TypeScript toolchain as dev dependencies.
- **vsce packaging** — [`.vscodeignore`](.vscodeignore) excludes source, config, node_modules from the `.vsix`.
- **No tests yet** — no test framework is configured. When adding tests, this section should be updated to include the test command and framework.
