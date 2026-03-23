# Orbis

An editor built around flexibility. Orbis lets you arrange your environment the way you actually work, panels go where you put them, workspaces are yours to configure, and everything persists between sessions.

## What it is

Orbis is a standalone editor focused on free-form layouts and AI-assisted workflows. The core idea is that different projects (and different phases of the same project) often need different setups, so the environment should adapt to you, not the other way around.

## Features

- **Free-form panels**: Open any panel at any size, anywhere on screen. Drag, resize, and stack however you like.
- **Multiple workspaces**: Switch between fully independent workspace layouts. Useful when you're juggling more than one project or context at a time.
- **Persistent layouts**: Workspaces are saved to disk. Close and reopen without losing your configuration.
- **AI agentic panels**: First-class support for AI workflows, including panels for running agents like Claude Code, Gemini CLI, and Codex directly inside the editor.
- **Extension support**: Pulls from the [Open VSX](https://open-vsx.org) registry. Themes and extensions with a web view are the most compatible.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+1` – `Ctrl+9` | Switch to workspace by index |
| `Ctrl+Tab` | Cycle through workspaces |

## Development

Requires Node.js 22.16+.

```bash
npm install
npm run electron:dev
```

## Building

```bash
npm run dist        # current platform
npm run dist:win    # Windows
npm run dist:mac    # macOS
```

Output is placed in the `release/` directory.

## Contributing

Fork the repo, make your changes in a branch, and open a pull request against `main`. No strict style rules, just keep things consistent with the surrounding code.
