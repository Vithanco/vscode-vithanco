// Renders VGL → SVG in the VS Code extension host (Node).
//
// Why the extension host: VS Code's markdown preview webview enforces a
// Content Security Policy that forbids WebAssembly compilation. The
// extension host has no such restriction, so we run the VGraph WASM engine
// here (Graphviz layout is compiled into it), and the markdown-it plugin
// embeds the resulting SVG as inline HTML.

// @ts-ignore — bundled via esbuild's allowJs.
import { init } from '../../website/Package/index.js';
import type { Exports } from '../../website/Package/bridge-js.js';
// @ts-ignore — esbuild's binary loader inlines the WASM bytes as a Uint8Array.
import wasmBinary from '../VGraphWasm.wasm';

export type RenderFn = (vgl: string, darkMode?: boolean) => Promise<string>;

let renderPromise: Promise<RenderFn> | null = null;

export function getRenderer(): Promise<RenderFn> {
    if (renderPromise) return renderPromise;
    renderPromise = (async () => {
        const { exports }: { exports: Exports } = await init({
            module: wasmBinary,
            getImports: () => ({}),
        });

        // BEGIN SHARED CORE (keep in lockstep with obsidian-vithanco/src/vgraph-loader.ts — `just parity`)
        return (vgl: string, darkMode = false): Promise<string> => {
            // Graphviz runs in-process inside the WASM module (swiftGraphviz), so this
            // is one synchronous call. It used to be a round trip — VGL→DOT in Swift,
            // DOT→layout JSON in a JS Graphviz, then VGL+layout→SVG in Swift — and the
            // two functions that took the layout back were removed in the engine when
            // that stopped being necessary. `just plugin-api` now catches that class of
            // drift, since the plugins are separate repos and do not notice.
            const result = darkMode ? exports.renderGraphDark(vgl) : exports.renderGraph(vgl);

            // Errors come back embedded as SVG text elements; surface them.
            if (result.includes('Error:') && result.includes('<text')) {
                const match = result.match(/Error:([^<]+)/);
                throw new Error(match ? match[1].trim() : 'Rendering failed');
            }
            return Promise.resolve(result);
        };
        // END SHARED CORE
    })().catch((err) => {
        // Reset so a subsequent call can retry (useful during dev).
        renderPromise = null;
        throw err;
    });
    return renderPromise;
}
