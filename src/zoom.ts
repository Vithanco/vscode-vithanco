// How large one rendered diagram is drawn: fitted to the width of the note (the
// default, done by CSS) or a fixed percentage. View state only, never saved, as
// in the VGraph editor (its ADR 0031), whose steps these are.
//
// Identical in obsidian-vithanco and vscode-vithanco (`just parity`). It binds
// controls the host has built rather than building them: Obsidian's review
// wants its own DOM helpers, and VS Code's preview patches its DOM back to the
// extension's markup on every edit.

export type Zoom = 'fit' | number;

const LADDER = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];
const MIN = LADDER[0];
const MAX = LADDER[LADDER.length - 1];

const clamp = (scale: number): number => Math.max(MIN, Math.min(MAX, scale));

function stepped(shown: number, direction: 'in' | 'out'): number {
    if (direction === 'in') return LADDER.find((s) => s > shown * 1.001) ?? MAX;
    return LADDER.slice().reverse().find((s) => s < shown / 1.001) ?? MIN;
}

// A trackpad pinch is many small wheel events and a mouse wheel a few big ones,
// hence proportional and capped.
function wheeled(shown: number, deltaY: number): number {
    return clamp(shown * (1 - Math.max(-50, Math.min(50, deltaY)) * 0.005));
}

function label(zoom: Zoom): string {
    return zoom === 'fit' ? 'Auto' : `${Math.round(zoom * 100)}%`;
}

interface Parts {
    viewport: HTMLElement;
    svg: SVGSVGElement;
    natural: number;
    reset: HTMLElement;
    zoomIn: HTMLElement;
    zoomOut: HTMLElement;
}

// Looked up on every use, not kept: VS Code may swap the SVG inside a block it keeps.
function partsOf(block: HTMLElement): Parts | null {
    const viewport = block.querySelector<HTMLElement>('.vithanco-zoom-viewport');
    const svg = viewport?.querySelector('svg');
    const reset = block.querySelector<HTMLElement>('.vithanco-zoom-reset');
    const zoomIn = block.querySelector<HTMLElement>('.vithanco-zoom-in');
    const zoomOut = block.querySelector<HTMLElement>('.vithanco-zoom-out');
    // The engine sets width and height to the viewBox's, so it is the natural size.
    const natural = svg?.viewBox.baseVal?.width ?? 0;
    if (!viewport || !svg || !reset || !zoomIn || !zoomOut || natural <= 0) return null;
    return { viewport, svg, natural, reset, zoomIn, zoomOut };
}

function apply(block: HTMLElement, parts: Parts, zoom: Zoom): void {
    parts.reset.textContent = label(zoom);
    block.classList.add('vithanco-zoom-ready');
    block.classList.toggle('vithanco-zoom-fixed', zoom !== 'fit');
    if (zoom === 'fit') block.style.removeProperty('--vithanco-zoom-width');
    else block.style.setProperty('--vithanco-zoom-width', `${parts.natural * zoom}px`);
}

function verticalScroller(from: HTMLElement): Element | null {
    const view = from.ownerDocument.defaultView;
    for (let el = from.parentElement; el; el = el.parentElement) {
        const overflow = view?.getComputedStyle(el).overflowY ?? '';
        if (/auto|scroll|overlay/.test(overflow) && el.scrollHeight > el.clientHeight) return el;
    }
    return from.ownerDocument.scrollingElement;
}

const onChanges = new WeakMap<HTMLElement, (zoom: Zoom) => void>();

/**
 * `block` holds the three buttons `.vithanco-zoom-out`, `-reset` and `-in`, and
 * `.vithanco-zoom-viewport` holding the SVG. Binding a block again only applies
 * `zoom`, so a host may rebind after every update.
 */
export function bindZoom(block: HTMLElement, zoom: Zoom = 'fit', onChange: (zoom: Zoom) => void = () => undefined): void {
    const parts = partsOf(block);
    if (!parts) return;
    apply(block, parts, zoom);
    const rebound = onChanges.has(block);
    onChanges.set(block, onChange);
    if (rebound) return;

    // Keeps the point at (x, y) under the same pixel; no y keeps the top still,
    // so a button stays under the pointer.
    const set = (next: Zoom, x?: number, y?: number): void => {
        const now = partsOf(block);
        if (!now) return;
        const before = now.svg.getBoundingClientRect();
        apply(block, now, next);
        onChanges.get(block)?.(next);
        if (x === undefined || before.width === 0) return;
        const after = now.svg.getBoundingClientRect();
        now.viewport.scrollLeft += after.left + ((x - before.left) / before.width) * after.width - x;
        if (y === undefined) return;
        verticalScroller(now.viewport)?.scrollBy(0, after.top + ((y - before.top) / before.height) * after.height - y);
    };
    const shown = (now: Parts): number => now.svg.getBoundingClientRect().width / now.natural || 1;
    const step = (direction: 'in' | 'out') => (): void => {
        const now = partsOf(block);
        if (!now) return;
        const box = now.viewport.getBoundingClientRect();
        set(stepped(shown(now), direction), box.left + box.width / 2);
    };

    parts.zoomIn.addEventListener('click', step('in'));
    parts.zoomOut.addEventListener('click', step('out'));
    parts.reset.addEventListener('click', () => set('fit'));
    // VS Code's preview opens the source on a double click anywhere, so two quick
    // presses on + would leave the preview.
    parts.zoomIn.parentElement?.addEventListener('dblclick', (event) => event.stopPropagation());
    parts.viewport.addEventListener('wheel', (event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const now = partsOf(block);
        if (now) set(wheeled(shown(now), event.deltaY), event.clientX, event.clientY);
    }, { passive: false });
}
