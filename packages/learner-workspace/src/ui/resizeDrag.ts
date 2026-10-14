export type ResizeCursor = "row-resize" | "col-resize";

/**
 * Keeps pointer resizing continuous across iframe, Monaco, embed, and other
 * child-surface boundaries. The returned cleanup is idempotent.
 */
export function beginViewportResizeDrag(cursor: ResizeCursor) {
    if (typeof document === "undefined") return () => {};

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    const shield = document.createElement("div");
    let cleaned = false;

    shield.setAttribute("aria-hidden", "true");
    shield.dataset.workspaceResizeDragShield = "imperative";
    Object.assign(shield.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        cursor,
        touchAction: "none",
        userSelect: "none",
        background: "transparent",
    });

    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    document.body.appendChild(shield);

    return () => {
        if (cleaned) return;
        cleaned = true;
        shield.remove();
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
    };
}
