import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import type MarkdownIt from 'markdown-it';
import { getRenderer } from './renderer';

// ─── Cache ───────────────────────────────────────────────────────────────
// VGL source → rendered SVG (or error string). Keyed by content hash so
// the same block in multiple files shares one render.
const cache = new Map<string, { ok: true; svg: string } | { ok: false; error: string }>();
const inFlight = new Set<string>();

function hashOf(source: string): string {
    return createHash('sha1').update(source).digest('hex').slice(0, 16);
}

// Debounced preview refresh — many blocks finishing in quick succession
// only triggers one refresh.
let refreshTimer: NodeJS.Timeout | undefined;
function scheduleRefresh(): void {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        // Best-effort: this command exists in VS Code's built-in markdown
        // extension. If it ever goes away, swallow the error silently.
        vscode.commands.executeCommand('markdown.preview.refresh').then(
            () => undefined,
            () => undefined,
        );
    }, 80);
}

async function renderInBackground(key: string, source: string): Promise<void> {
    if (inFlight.has(key) || cache.has(key)) return;
    inFlight.add(key);
    try {
        const render = await getRenderer();
        const svg = render(source);
        cache.set(key, { ok: true, svg });
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        cache.set(key, { ok: false, error });
    } finally {
        inFlight.delete(key);
        scheduleRefresh();
    }
}

// ─── HTML helpers ────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function placeholderHtml(source: string): string {
    return (
        `<div class="vgraph-block vgraph-loading">` +
        `<pre class="vgraph-fallback"><code class="language-vgl">${escapeHtml(source)}</code></pre>` +
        `<div class="vgraph-loading-note">Rendering VGL…</div>` +
        `</div>\n`
    );
}

function svgHtml(svg: string): string {
    // The rendered SVG is trusted output from our own WASM engine.
    return `<div class="vgraph-block vgraph-rendered">${svg}</div>\n`;
}

function errorHtml(source: string, error: string): string {
    return (
        `<div class="vgraph-block vgraph-error-block">` +
        `<pre class="vgraph-error">VGL render error: ${escapeHtml(error)}</pre>` +
        `<pre class="vgraph-fallback"><code class="language-vgl">${escapeHtml(source)}</code></pre>` +
        `</div>\n`
    );
}

// ─── markdown-it plugin ──────────────────────────────────────────────────

function vglPlugin(md: MarkdownIt): void {
    const defaultFence = md.renderer.rules.fence;

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        try {
            const token = tokens[idx];
            const info = (token.info || '').trim().toLowerCase();

            if (info !== 'vgl') {
                return defaultFence
                    ? defaultFence(tokens, idx, options, env, self)
                    : self.renderToken(tokens, idx, options);
            }

            const source = token.content.trim();
            const key = hashOf(source);
            const cached = cache.get(key);

            if (cached?.ok) return svgHtml(cached.svg);
            if (cached && !cached.ok) return errorHtml(source, cached.error);

            // Not in cache — kick off background render, return placeholder.
            void renderInBackground(key, source);
            return placeholderHtml(source);
        } catch (err) {
            // Never break the markdown render because of our plugin.
            try {
                return defaultFence
                    ? defaultFence(tokens, idx, options, env, self)
                    : self.renderToken(tokens, idx, options);
            } catch {
                return '';
            }
        }
    };
}

// ─── Activation ──────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt;
} {
    // Pre-warm the renderer so the first vgl block doesn't pay the full
    // init cost — but don't await it (activation must stay fast).
    void getRenderer().catch(() => undefined);

    context.subscriptions.push({
        dispose() {
            cache.clear();
            inFlight.clear();
            if (refreshTimer) clearTimeout(refreshTimer);
        },
    });

    return {
        extendMarkdownIt(md: MarkdownIt) {
            return md.use(vglPlugin);
        },
    };
}
