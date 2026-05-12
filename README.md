# Vithanco for VS Code

Render [Vithanco Graph Language (VGL)](https://vithanco.com/tools/VGL_GUIDE/index.html) diagrams inside VS Code's built-in Markdown preview.

Any fenced block tagged `vgl` is replaced with the rendered SVG when you open the preview:

````markdown
```vgl
vgraph decision: IBIS "Should we ship?" {
  node q1: Question "Should we ship?";
  node a1: Answer "Yes, soon";
  node p1: Pro "Users have asked for it";
  node c1: Con "Docs are still thin";
  edge q1 -> a1;
  edge a1 -> p1;
  edge a1 -> c1;
}
```
````

## How it works

Two extension points do the heavy lifting:

- `markdown.markdownItPlugins` — a sync plugin in the extension host turns each `vgl` fence into a `<div class="vgraph-block" data-vgl="…">` placeholder.
- `markdown.previewScripts` — a script bundled into the preview webview boots the VGraph WASM module and Graphviz once, then renders every placeholder in place.

The `VGraphWasm.wasm` binary is embedded directly into the preview bundle (esbuild `binary` loader). The Graphviz layout engine (`@hpcc-js/wasm`) is bundled from `node_modules`. **No CDN dependencies, no per-document "allow content" prompts.**

## Build

From the repo root:

```bash
./build.sh               # runs WASM build, then the extension build
```

Or, inside this directory:

```bash
npm install
npm run build            # esbuild → out/extension.js + out/preview.js
npm run package          # → vithanco-x.y.z.vsix
```

## Install locally

```bash
code --install-extension vithanco-*.vsix
```

Reload VS Code, open a markdown file containing a ```vgl block, and run **Markdown: Open Preview to the Side**.

## Layout

```
vscode-vithanco/
├── src/
│   ├── extension.ts     # markdown-it plugin (host side)
│   └── preview.ts       # WASM init + DOM render (webview side)
├── styles.css           # contributed via markdown.previewStyles
├── VGraphWasm.wasm      # refreshed from ../website/Package/ on build
├── esbuild.config.mjs   # bundles host (CJS) and preview (IIFE)
├── release.sh           # cuts a release in the standalone repo
└── package.json
```

## Release workflow

The extension is developed inside the VGraph monorepo and released from a
**separate standalone repo** (mirrors the Obsidian plugin setup).

The monorepo copy at `vscode-vithanco/` is for development. To publish:

1. Sync this folder into the standalone `vscode-vithanco` repo (manual `rsync`
   or `git subtree push` — preserve only tracked files; node_modules/, out/,
   and *.vsix are gitignored).
2. From the standalone repo's root, run:

   ```bash
   VGRAPH_REPO=~/private/swift/VGraph ./release.sh 0.1.1
   ```

   The script refreshes `VGraphWasm.wasm` from the monorepo, bumps the
   version in `package.json`, builds, packages, commits, tags, pushes,
   and creates a GitHub Release with the `.vsix` attached.

3. To also publish to the VS Code Marketplace:

   ```bash
   VGRAPH_REPO=~/private/swift/VGraph PUBLISH=1 ./release.sh 0.1.1
   ```

   Requires a publisher PAT in `$VSCE_PAT` or a logged-in `vsce` session
   (see the [VS Code publishing docs](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)).

## Limitations

- Reading view only. Editing a `vgl` block in source view shows the raw fence; switch to the preview to see the rendered diagram.
- Desktop VS Code only (the Wasm module assumes a desktop runtime, like the sibling Obsidian plugin).
