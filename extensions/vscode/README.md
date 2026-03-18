# Continue

Continue for VS Code in this branch provides inline autocomplete, next edit suggestions, and status bar controls.

## Features

### Autocomplete

Inline code suggestions appear as you type.

### Next Edit

Predicts the next change near your current cursor position and lets you accept or dismiss it with the keyboard.

### Status bar

Shows the current autocomplete state and model selection controls.

## Getting started

1. Install Node.js 22.22.0 if needed:

```bash
fnm install 22.22.0
```

2. Activate the runtime and install dependencies:

```bash
fnm use 22.22.0
npm install
```

3. Build the extension:

```bash
npm run rolldown
```

## Verification

```bash
fnm use 22.22.0 && npm run rolldown
```

## License

[Apache 2.0 © 2023-2025 Continue Dev, Inc.](./LICENSE)
