import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.argv[2] === 'production';
// `preview` builds only the preview script, which carries no engine: VGraph's
// tests use it without an optimized engine to bundle.
const previewOnly = process.argv[3] === 'preview';

// Refresh the local VGraphWasm.wasm from the monorepo build output, when present.
const wasmSrc = path.join(__dirname, '../website/Package/VGraphWasm.wasm');
const wasmDst = path.join(__dirname, 'VGraphWasm.wasm');
if (!previewOnly && fs.existsSync(wasmSrc)) {
    fs.copyFileSync(wasmSrc, wasmDst);
    console.log('Refreshed VGraphWasm.wasm from ../website/Package/');
}

// Single extension-host bundle. Runs in VS Code's extension host (Node).
// It produces SVG strings that the markdown-it plugin embeds directly
// into the preview HTML — no webview-side WASM, so the markdown preview's
// strict CSP is irrelevant.
//
// .wasm files are inlined as Uint8Array constants via esbuild's binary
// loader. The bundle ends up ~8 MB and ships as one file in the .vsix.
const config = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: isProd ? false : 'inline',
    treeShaking: true,
    outfile: 'out/extension.js',
    // The bridgejs glue at ../website/Package/platforms/browser.js imports
    // @bjorn3/browser_wasi_shim — resolve it from our own node_modules.
    nodePaths: [path.join(__dirname, 'node_modules')],
    loader: {
        '.wasm': 'binary',
    },
    logLevel: 'info',
    logOverride: {
        // BridgeJS-generated quirks (see obsidian-vithanco/esbuild.config.mjs).
        'empty-import-meta': 'silent',
        'duplicate-object-key': 'silent',
    },
};

// Runs in the preview webview, which the extension host cannot reach.
const previewConfig = {
    entryPoints: ['src/preview.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: isProd ? false : 'inline',
    outfile: 'out/preview.js',
    logLevel: 'info',
};

const configs = previewOnly ? [previewConfig] : [config, previewConfig];

if (isProd) {
    await Promise.all(configs.map((c) => esbuild.build(c)));
    console.log('Build complete.');
} else {
    const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('Watching for changes...');
}
