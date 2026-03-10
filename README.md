<h1 align="center">Continue for VS Code</h1>

Continue for VS Code in this branch is laser-focused on inline autocomplete, next edit suggestions, and status bar controls. All active builds, tests, and documentation now revolve around the `extensions/vscode` experience.

## Getting started

1. Install the pinned Node.js runtime with [fnm](https://fnm.vercel.app/) if needed:

```bash
fnm install 22.22.0
```

2. Select the runtime and install dependencies:

```bash
fnm use 22.22.0
npm install
```

3. Build the retained VS Code extension surface:

```bash
npm --prefix extensions/vscode run rolldown
```

## Features

- **Autocomplete** – inline code suggestions tuned for the current file and cursor position.
- **Next Edit** – contextual recommendations for the next edit, with keyboard shortcuts to accept or dismiss them.
- **Status bar controls** – visibility into the autocomplete state and model selector controls right inside VS Code.

## Verification

```bash
fnm use 22.22.0 && npm --prefix extensions/vscode run rolldown
```

Run that command whenever you need to verify a clean build of the only supported product surface in this branch.

## Documentation

For detailed usage and extension configuration, see [extensions/vscode/README.md](extensions/vscode/README.md).

## License

[Apache 2.0 © 2023-2025 Continue Dev, Inc.](./LICENSE)
