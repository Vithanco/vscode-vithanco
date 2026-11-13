// What a vgl fence becomes in the Markdown preview. The zoom controls are in
// this markup rather than added by src/preview.ts: the preview patches its DOM
// back to this markup on every edit, and would take added nodes away again.

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// The graph's id (`vgraph <id>: …`) names the diagram, so src/preview.ts can tell
// which diagram a block shows when the preview reuses the block for another.
function blockTag(source: string, kind: string): string {
    const id = /^\s*vgraph\s+([^\s:]+)\s*:/m.exec(source)?.[1] ?? '';
    return `<div class="vgraph-block ${kind}" data-graph-id="${escapeHtml(id)}">`;
}

export function placeholderHtml(source: string): string {
    return (
        blockTag(source, 'vgraph-loading') +
        `<pre class="vgraph-fallback"><code class="language-vgl">${escapeHtml(source)}</code></pre>` +
        `<div class="vgraph-loading-note">Rendering VGL…</div>` +
        `</div>\n`
    );
}

export function svgHtml(source: string, svg: string): string {
    // The rendered SVG is trusted output from our own WASM engine.
    return (
        blockTag(source, 'vgraph-rendered') +
        `<div class="vithanco-zoom-bar">` +
        `<button type="button" class="vithanco-zoom-out" aria-label="Zoom out" title="Zoom out">−</button>` +
        `<button type="button" class="vithanco-zoom-reset" title="Fit to width">Auto</button>` +
        `<button type="button" class="vithanco-zoom-in" aria-label="Zoom in" title="Zoom in">+</button>` +
        `</div>` +
        `<div class="vithanco-zoom-viewport">${svg}</div>` +
        `</div>\n`
    );
}

export function errorHtml(source: string, error: string): string {
    return (
        blockTag(source, 'vgraph-error-block') +
        `<pre class="vgraph-error">VGL render error: ${escapeHtml(error)}</pre>` +
        `<pre class="vgraph-fallback"><code class="language-vgl">${escapeHtml(source)}</code></pre>` +
        `</div>\n`
    );
}
