import type { ToolId, ToolsCtx } from "./types";

export type ActiveToolId = ToolId | null;

function isToolId(value: string | null | undefined): value is ToolId {
    return value === "code" || value === "board" || value === "notes";
}

export function isToolEnabled(
    toolId: ToolId,
    ctx: Pick<ToolsCtx, "codeEnabled" | "boardEnabled" | "notesEnabled">,
) {
    if (toolId === "code") return ctx.codeEnabled;
    if (toolId === "board") return ctx.boardEnabled;
    return ctx.notesEnabled;
}

/**
 * Canonical learner-workspace default selection.
 *
 * Returning null is intentional: a context with no enabled tool must not
 * manufacture a Notes workspace. The review rail visibility resolver owns
 * whether a non-required workspace is shown at all.
 */
export function resolveDefaultActiveTool(
    ctx: Pick<ToolsCtx, "codeEnabled" | "boardEnabled" | "notesEnabled">,
): ActiveToolId {
    if (ctx.codeEnabled) return "code";
    if (ctx.boardEnabled) return "board";
    if (ctx.notesEnabled) return "notes";
    return null;
}

export function resolveActiveTool(args: {
    ctx: Pick<ToolsCtx, "codeEnabled" | "boardEnabled" | "notesEnabled">;
    persistedTool?: string | null;
}): ActiveToolId {
    const { ctx } = args;
    const persistedTool = args.persistedTool;

    // A newly available runtime workspace takes precedence over a Notes-only
    // selection persisted while the learner was on explanatory content.
    if (ctx.codeEnabled && persistedTool === "notes") {
        return resolveDefaultActiveTool(ctx);
    }

    if (isToolId(persistedTool) && isToolEnabled(persistedTool, ctx)) {
        return persistedTool;
    }

    return resolveDefaultActiveTool(ctx);
}
