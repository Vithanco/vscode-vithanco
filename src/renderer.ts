// Renders VGL → SVG in the VS Code extension host (Node).
//
// Why the extension host: VS Code's markdown preview webview enforces a
// Content Security Policy that forbids WebAssembly compilation. The
// extension host has no such restriction, so we run both the VGraph WASM
// engine and the Graphviz layout engine here, and the markdown-it plugin
// embeds the resulting SVG as inline HTML.

// @ts-ignore — bundled via esbuild's allowJs.
import { init } from '../../website/Package/index.js';
// @ts-ignore — esbuild's binary loader inlines the WASM bytes as a Uint8Array.
import wasmBinary from '../VGraphWasm.wasm';
import { Graphviz } from '@hpcc-js/wasm-graphviz';

export type RenderFn = (vgl: string) => string;

// The BridgeJS-generated WASM glue calls `window.graphvizLayout(...)` at
// runtime. In Node there's no `window`; alias it to globalThis so the
// global lookups still resolve.
const g = globalThis as any;
if (typeof g.window === 'undefined') g.window = g;

function stripFontnames(dot: string): string {
    return dot
        .replace(/,\s*fontname\s*=\s*"[^"]*"/g, '')
        .replace(/\bfontname\s*=\s*"[^"]*"\s*,?\s*/g, '');
}

function stripClusters(dot: string): string {
    const clusterAttrs =
        /^\s*(label|rankdir|style|color|fillcolor|penwidth|fontsize|bgcolor)\s*=/;
    let result = dot;
    let prev: string;
    do {
        prev = result;
        result = result.replace(
            /\bsubgraph\s+cluster_\w+\s*\{([^{}]*)\}/gs,
            (_, inner: string) =>
                inner.split('\n').filter((line) => !clusterAttrs.test(line)).join('\n'),
        );
    } while (result !== prev);
    return result;
}

let renderPromise: Promise<RenderFn> | null = null;

export function getRenderer(): Promise<RenderFn> {
    if (renderPromise) return renderPromise;
    renderPromise = (async () => {
        const graphviz = await Graphviz.load();

        // Graphviz's TS types are narrower than the underlying binary
        // accepts — json0 is a real format (preserves cluster bounding
        // boxes) but isn't in the Format union. Same with arbitrary
        // engine strings. Cast at the boundary; usage is validated by
        // upstream code that has been calling these for years.
        const layout = graphviz.layout.bind(graphviz) as (
            dot: string,
            format: string,
            engine: string,
        ) => string;

        g.graphvizLayout = (dot: string, engine = 'dot', format = 'svg') =>
            layout(stripFontnames(dot), format, engine);

        g.graphvizLayoutJSON = (dot: string, engine = 'dot') => {
            const sanitised = stripFontnames(dot);
            const hasCluster = /\bsubgraph\s+cluster_/i.test(sanitised);
            const format = hasCluster ? 'json0' : 'json';
            try {
                return JSON.parse(layout(sanitised, format, engine));
            } catch (e) {
                if (!hasCluster) throw e;
                return JSON.parse(layout(stripClusters(sanitised), 'json', engine));
            }
        };

        const { exports } = await init({
            module: wasmBinary,
            getImports: () => ({}),
        });

        return (vgl: string): string => {
            const result: string = exports.renderGraph(vgl);
            if (result.includes('Error:') && result.includes('<text')) {
                const match = result.match(/Error:([^<]+)/);
                throw new Error(match ? match[1].trim() : 'Rendering failed');
            }
            return result;
        };
    })().catch((err) => {
        // Reset so a subsequent call can retry (useful during dev).
        renderPromise = null;
        throw err;
    });
    return renderPromise;
}
