"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolId, ToolsCtx } from "../types";
import { safeGet, safeSet } from "../utils/storage";
import { TOOL_SPECS } from "../registry";

function storageKey(ctx: ToolsCtx) {
    return `learnoir:tools:active:v1:${ctx.subjectSlug}:${ctx.moduleId}:${ctx.locale}`;
}

function pickDefault(ctx: ToolsCtx): ToolId {
    // if there is a default spec and it's enabled, use it
    const defaultSpec = TOOL_SPECS.find((t) => t.isDefault(ctx) && t.enabled(ctx));
    if (defaultSpec) return defaultSpec.id;

    // else first enabled
    const firstEnabled = TOOL_SPECS.find((t) => t.enabled(ctx));
    return (firstEnabled?.id ?? "notes") as ToolId;
}

export function useActiveTool(ctx: ToolsCtx) {
    const key = useMemo(() => storageKey(ctx), [ctx.subjectSlug, ctx.moduleId, ctx.locale]);
    const [active, setActive] = useState<ToolId>(() => pickDefault(ctx));

    // load persisted selection (if still enabled)
    useEffect(() => {
        const raw = safeGet(key);
        const candidate = (raw ?? "") as ToolId;

        const spec = TOOL_SPECS.find((t) => t.id === candidate);
        if (spec && spec.enabled(ctx)) {
            setActive(candidate);
        } else {
            setActive(pickDefault(ctx));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, ctx.codeEnabled]);

    // persist on change
    useEffect(() => {
        safeSet(key, active);
    }, [key, active]);

    // guard: if tool becomes disabled (subject changed), force to default
    useEffect(() => {
        const spec = TOOL_SPECS.find((t) => t.id === active);
        if (spec && !spec.enabled(ctx)) {
            setActive(pickDefault(ctx));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.codeEnabled]);

    return { active, setActive };
}