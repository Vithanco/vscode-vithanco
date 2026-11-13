// Runs inside VS Code's Markdown preview (contributed as a preview script). After
// an edit the preview patches its blocks by position, so one may now show another
// diagram: each zoom is kept by the diagram's graph id instead, and which one of
// that id it is. Another note replaces the document and starts afresh.

import { bindZoom, type Zoom } from './zoom';

let zooms = new Map<string, Zoom>();
let shown: Element | null = null;

function bindAll(): void {
    const body = document.querySelector('.markdown-body');
    if (body !== shown) {
        zooms = new Map();
        shown = body;
    }
    const seen = new Map<string, number>();
    document.querySelectorAll<HTMLElement>('.vgraph-block').forEach((block) => {
        const graphId = block.dataset.graphId ?? '';
        const nth = (seen.get(graphId) ?? 0) + 1;
        seen.set(graphId, nth);
        if (!block.classList.contains('vgraph-rendered')) return;
        const key = `${graphId}#${nth}`;
        bindZoom(block, zooms.get(key) ?? 'fit', (zoom) => {
            zooms.set(key, zoom);
        });
    });
}

window.addEventListener('vscode.markdown.updateContent', bindAll);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAll);
else bindAll();
