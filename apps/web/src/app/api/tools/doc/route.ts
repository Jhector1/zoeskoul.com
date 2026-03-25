// src/app/api/tools/doc/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------------- helpers -------------------------------- */

function json(body: any, status = 200, setGuestId?: string | null) {
    const res = NextResponse.json(body, { status });
    return attachGuestCookie(res, setGuestId);
}

function jsonErr(message: string, status = 400, detail?: any, setGuestId?: string | null) {
    return json({ message, detail }, status, setGuestId);
}

/* -------------------------------- schemas -------------------------------- */

const KeySchema = z.object({
    subjectSlug: z.string().min(1),
    moduleId: z.string().min(1),
    locale: z.string().min(2),
    toolId: z.string().min(1), // "notes"
    scopeKey: z.string().min(1), // "general" | "exercise:<id>"
});

const PutSchema = KeySchema.extend({
    format: z.enum(["markdown", "plain"]).default("markdown"),
    body: z.string().max(200_000).default(""),
});

/* -------------------------------- GET -------------------------------- */

export async function GET(req: Request) {
    const url = new URL(req.url);

    const parsed = KeySchema.safeParse({
        subjectSlug: url.searchParams.get("subjectSlug") ?? "",
        moduleId: url.searchParams.get("moduleId") ?? "",
        locale: url.searchParams.get("locale") ?? "",
        toolId: url.searchParams.get("toolId") ?? "",
        scopeKey: url.searchParams.get("scopeKey") ?? "",
    });

    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0); // ✅ no await
    const actor = ensured.actor;
    const actorKey = actorKeyOf(actor); // ✅ pass Actor only

    if (!parsed.success) {
        return jsonErr("Invalid query", 400, parsed.error.flatten(), ensured.setGuestId);
    }

    const { subjectSlug, moduleId, locale, toolId, scopeKey } = parsed.data;

    const doc = await prisma.toolDoc.findUnique({
        where: {
            actor_tool_scope: { actorKey, subjectSlug, moduleId, locale, toolId, scopeKey },
        },
        select: { body: true, format: true, updatedAt: true },
    });

    return json(
        {
            body: doc?.body ?? "",
            format: doc?.format ?? "markdown",
            updatedAt: doc?.updatedAt ?? null,
        },
        200,
        ensured.setGuestId,
    );
}

/* -------------------------------- PUT -------------------------------- */

export async function PUT(req: Request) {
    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0); // ✅ no await
    const actor = ensured.actor;
    const actorKey = actorKeyOf(actor); // ✅ pass Actor only

    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return jsonErr("Invalid JSON body", 400, null, ensured.setGuestId);
    }

    const parsed = PutSchema.safeParse(raw);
    if (!parsed.success) {
        return jsonErr("Invalid payload", 400, parsed.error.flatten(), ensured.setGuestId);
    }

    const { subjectSlug, moduleId, locale, toolId, scopeKey, body, format } = parsed.data;

    const saved = await prisma.toolDoc.upsert({
        where: {
            actor_tool_scope: { actorKey, subjectSlug, moduleId, locale, toolId, scopeKey },
        },
        create: { actorKey, subjectSlug, moduleId, locale, toolId, scopeKey, body, format },
        update: { body, format },
        select: { updatedAt: true },
    });

    return json({ ok: true, updatedAt: saved.updatedAt }, 200, ensured.setGuestId);
}