// src/lib/ui/flowScroll.ts
export type FlowBlock = "start" | "center" | "end" | "nearest";

export function userIsInteracting(): boolean {
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) return true;

    if ((window as any).__flowPointerDown) return true;

    const ae = document.activeElement as HTMLElement | null;
    if (!ae) return false;
    const tag = ae.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (ae.isContentEditable) return true;

    return false;
}

export function findScrollParent(el: HTMLElement): HTMLElement {
    let p: HTMLElement | null = el.parentElement;
    while (p) {
        const st = window.getComputedStyle(p);
        const oy = st.overflowY;
        const canScroll = (oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 2;
        if (canScroll) return p;
        p = p.parentElement;
    }
    return document.documentElement;
}

/**
 * Read bottom inset from CSS var on the scroll container:
 *   --flow-bottom-inset: <px>
 */
export function getBottomInsetPx(container: HTMLElement): number {
    try {
        const v = window.getComputedStyle(container).getPropertyValue("--flow-bottom-inset").trim();
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

export function focusFirst(root: HTMLElement, selector?: string) {
    const preferred =
        (selector ? root.querySelector<HTMLElement>(selector) : null) ??
        root.querySelector<HTMLElement>("[data-flow-focus]") ??
        root.querySelector<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );

    preferred?.focus({ preventScroll: true } as any);
}

export function scrollIntoViewSmart(
    target: HTMLElement,
    opts?: {
        reduceMotion?: boolean;
        block?: FlowBlock;
        /** force scroll even if already visible */
        force?: boolean;
        /** extra offset (px). For block="start" this creates breathing room above. */
        offsetPx?: number;
        focus?: boolean;
        focusSelector?: string;
    },
) {
    if (!target) return;
    if (userIsInteracting()) return;

    const reduceMotion = Boolean(opts?.reduceMotion);
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    const block: FlowBlock = opts?.block ?? "nearest";
    const offsetPx = typeof opts?.offsetPx === "number" ? opts.offsetPx : 12;

    const container = findScrollParent(target);

    // If we didn't find a real container, just use native.
    if (container === document.documentElement) {
        target.scrollIntoView({ behavior, block: block === "nearest" ? "nearest" : block });
        if (opts?.focus) focusFirst(target, opts.focusSelector);
        return;
    }

    const insetBottom = getBottomInsetPx(container);

    const r = target.getBoundingClientRect();
    const c = container.getBoundingClientRect();

    const cTop = c.top;
    const cBottom = c.bottom - insetBottom;

    const deltaTop = r.top - cTop;
    const deltaBottom = r.bottom - cBottom;

    const isFullyVisible = deltaTop >= 0 && deltaBottom <= 0;

    if (isFullyVisible && !opts?.force) {
        if (opts?.focus) focusFirst(target, opts.focusSelector);
        return;
    }

    let nextTop = container.scrollTop;

    if (block === "start") nextTop += deltaTop - offsetPx;
    else if (block === "end") nextTop += deltaBottom + offsetPx;
    else if (block === "center") {
        const centerDelta = deltaTop - (c.height - r.height) / 2;
        nextTop += centerDelta;
    } else {
        // nearest
        if (deltaTop < 0) nextTop += deltaTop - offsetPx;
        else if (deltaBottom > 0) nextTop += deltaBottom + offsetPx;
        else {
            if (opts?.focus) focusFirst(target, opts.focusSelector);
            return;
        }
    }

    // clamp
    nextTop = Math.max(0, Math.min(nextTop, container.scrollHeight - container.clientHeight));

    container.scrollTo({ top: nextTop, behavior });

    if (opts?.focus) {
        window.setTimeout(() => focusFirst(target, opts.focusSelector), reduceMotion ? 0 : 220);
    }
}