<p align="center"><a href="README.md">中文</a> | English</p>

# dsh-shell-card-plus

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](#license)
[![dsh](https://img.shields.io/badge/dsh-%3E%3D0.1.0--rc.5-blue)](https://github.com/deepseek-ai/deepseek-harness)

**Shell command cards** for the DSH web UI — enhanced cards for bash / pwsh calls in the conversation. Replaces the official terminal tool rows with **fully custom React-rendered cards**: every command becomes a collapsible, copyable, reviewable shell card (not a terminal emulator — it only beautifies how command calls are displayed in the chat).

---

## Preview

<!-- TODO: replace with real screenshots. Put them under docs/preview/:
     card-collapsed.png (collapsed summary row), card-expanded.png (expanded head + command + output). -->

![Card collapsed](docs/preview/card-collapsed.png)

![Card expanded](docs/preview/card-expanded.png)

| Collapsed | Expanded |
|---|---|
| Official DisclosureRow-style summary row: status dot + tool name + first command line | Custom head (status + cwd + copy buttons) + command area + output area |

---

## Features

- **Fully custom command cards**: replaces the official bash/pwsh tool rows. The collapsed row keeps the official style; the expanded card has three zones:
  - **HEAD**: run-state dot (StateDot) + cwd (subdirectory name) + error info (only on failure: red `exit N` / `Signal X`, same as official) + two copy buttons (copy command / copy output); state text is screen-reader-only (matches the official "silent when normal, speaks on failure" behavior)
  - **BODY1 command area**: full command with line numbers (`pre-wrap` soft wrap)
  - **BODY2 output area**: `white-space: pre` with horizontal scroll, like the original
- **Covers all states**: running / done / failed (non-zero exit) / signaled / interrupted / tool error / non-terminal
- **Takes over bash/pwsh only**: other tools (read/write/search/web etc.) keep the official default cards
- **Hot-reload dev**: `npm run dev` rebuilds in seconds on save, no browser refresh

---

## Installation

```sh
# Install from GitHub
dsh plugin --profile web add github:antnesswcm/dsh-shell-card-plus

# Local package
dsh plugin --profile web add ./dsh-shell-card-plus

# Refresh the page after install (Ctrl+F5 / Cmd+Shift+R)
```

### Dependencies

| Package | Purpose |
|---|---|
| `@deepseek-ai/dsh` | dsh CLI (≥0.1.0-rc.5) |

Build-time deps (`devDependencies`): `esbuild`, `lightningcss` — only needed by developers, not at install time.

---

## How it works

### Architecture

```
dsh web process
  └─ Loader (cordis)
       └─ shell-card-plus  (host stub, lib/index.js)
            └─ dsh-client-modules scans the dsh.client declaration
                 └─ adds the shell-card-plus entry to window.__DSH_BOOT__
                      └─ browser loads lib/client.js
                           └─ __ModuleLoader__.load({ id: "dsh-shell-card-plus", factory })
                                └─ ctx.slots.inject('tool.call.toolview', { key:'bash', priority:-1 })
                                     └─ ToolCallRow renders
                                          └─ ShellCard (head + 2 body)
```

### Key mechanisms

- **tool.call.toolview keyed slot**: the official `ToolCallTree` dispatches by `toolName` to a keyed slot; `priority: -1` shadows the official `bash-toolview-sample`'s `priority: 0`, so registering replaces it.
- **Data source**: everything comes from the `tool/call` + `tool/result` `ToolCallBlock`, read through the `callView`/`resultView` `card:'terminal'` contract for command/cwd/output/exitCode/signal.
- **Status matrix**: `terminalCardModel()` in `terminal-card-model.ts` derives 7 states.

### Status matrix

| State | Trigger | command | cwd | output | exitCode | signal | Copy cmd | Copy output |
|---|---|---|---|---|---|---|---|---|
| `running` | callView only, no result | ✅ | ✅ | - | - | - | ✅ | ❌ |
| `done` | exitCode=0, no signal | ✅ | ✅ | ✅ | 0 | - | ✅ | ✅ |
| `failed` | exitCode≠0 | ✅ | ✅ | ✅ | ≠0 | - | ✅ | ✅ |
| `signaled` | signal present | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ |
| `interrupted` | turn/step closed, synthesized | ✅ | ✅ | - | - | - | ✅ | ❌ |
| `error` | tool call errored (error field) | ✅ | ✅ | maybe | - | - | ✅ | maybe |
| `non-terminal` | resultView.card is not terminal | ✅ | ✅ | ✅ | - | - | ✅ | ✅ |

---

## Build

This package builds standalone, without the dsh monorepo.

```sh
npm install          # install build dependencies
npm run build        # production build (lib/client.js, dev markers stripped)
npm run dev          # dev mode (watch + hot reload, with HOT markers for verification)
```

The artifact `lib/client.js` is the only file that ships with the package (`lib/index.js` is the host stub).

---

## Development

See [DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## License

MIT
