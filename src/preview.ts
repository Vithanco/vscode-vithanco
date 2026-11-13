// Runs inside VS Code's Markdown preview (contributed as a preview script). The
// preview re-renders the document on every edit, so each diagram's zoom is kept
// here, by its place among the document's vgl blocks.

import { bindZoom, type Zoom } from './zoom';

const zooms: Zoom[] = [];

function bindAll(): void {
    Array.from(document.querySelectorAll<HTMLElement>('.vgraph-block')).forEach((block, i) => {
        if (!block.classList.contains('vgraph-rendered')) return;
        bindZoom(block, zooms[i] ?? 'fit', (zoom) => {
            zooms[i] = zoom;
        });
    });
}

window.addEventListener('vscode.markdown.updateContent', bindAll);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAll);
else bindAll();
