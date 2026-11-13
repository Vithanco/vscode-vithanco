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

export function placeholderHtml(source: string): string {
    return (
        `<div class="vgraph-block vgraph-loading">` +
        `<pre class="vgraph-fallback"><code class="language-vgl">${escapeHtml(source)}</code></pre>` +
        `<div class="vgraph-loading-note">Rendering VGL…</div>` +
        `</div>\n`
    );
}

export function svgHtml(svg: string): string {
    // The rendered SVG is trusted output from our own WASM engine.
    return (
        `<div class="vgraph-block vgraph-rendered">` +
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
        `<div class="vgraph-block vgraph-error-block">` +
        `<pre class="vgraph-error">VGL render error: ${escapeHtml(error)}</pre>` +
        `<pre class="vgraph-fallback"><code class="language-vgl">${escapeHtml(source)}</code></pre>` +
        `</div>\n`
    );
}
