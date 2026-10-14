"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolsCtx } from "../types";
import { safeGet, safeSet } from "@zoeskoul/learner-workspace/tools/utils/storage";
import {
    isToolEnabled,
    resolveActiveTool,
    resolveDefaultActiveTool,
    type ActiveToolId,
} from "@zoeskoul/learner-workspace/tools/resolveActiveTool";

function storageKey(ctx: ToolsCtx) {
    return `learnoir:tools:active:v2:${ctx.subjectSlug}:${ctx.moduleId}:${ctx.locale}`;
}

export function useActiveTool(ctx: ToolsCtx) {
    const key = useMemo(() => storageKey(ctx), [ctx.subjectSlug, ctx.moduleId, ctx.locale]);
    const [active, setActive] = useState<ActiveToolId>(() =>
        resolveDefaultActiveTool(ctx),
    );

    // load persisted selection (if still enabled)
    useEffect(() => {
        const raw = safeGet(key);
        setActive(resolveActiveTool({ ctx, persistedTool: raw }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, ctx.codeEnabled, ctx.boardEnabled, ctx.notesEnabled]);

    // persist on change
    useEffect(() => {
        if (active) safeSet(key, active);
    }, [key, active]);

    // guard: if tool becomes disabled (subject changed), force to default
    useEffect(() => {
        if (active && !isToolEnabled(active, ctx)) {
            setActive(resolveDefaultActiveTool(ctx));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.codeEnabled, ctx.boardEnabled, ctx.notesEnabled]);

    return { active, setActive };
}
