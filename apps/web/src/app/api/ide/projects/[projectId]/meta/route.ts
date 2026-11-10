// src/app/api/ide/projects/[projectId]/meta/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkIdeCapability } from "@/lib/access/ideCapabilityServer";
import { getActor } from "@/lib/practice/actor";
import { enforceSameOriginPost } from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}

function parseBody(raw: unknown) {
    const body = (raw ?? {}) as Record<string, unknown>;

    const title =
        typeof body.title === "string" && body.title.trim()
            ? body.title.trim()
            : null;

    const description =
        typeof body.description === "string"
            ? body.description
            : body.description === null
                ? null
                : undefined;

    const baseVersion =
        typeof body.baseVersion === "number" &&
        Number.isInteger(body.baseVersion) &&
        body.baseVersion > 0
            ? body.baseVersion
            : null;

    if (!title) {
        throw new Error("Project title is required.");
    }

    return {
        title,
        description,
        baseVersion,
    };
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ projectId: string }> },
) {
    try {
        if (!enforceSameOriginPost(req)) {
            return jsonNoStore({ ok: false, error: "Forbidden." }, 403);
        }
        const actor = await getActor();

        const gate = await checkIdeCapability(prisma, {
            actor,
            capability: "save_cloud",
        });

        if (!gate.ok) {
            return jsonNoStore(
                {
                    ok: false,
                    paywall: true,
                    reason: gate.reason,
                    error:
                        gate.reason === "requires_login"
                            ? "Sign in to manage saved projects."
                            : "Your plan does not include saved projects.",
                },
                gate.reason === "requires_login" ? 401 : 402,
            );
        }

        // Snapshot the authenticated identity after checking it. Unlike a
        // mutable object property, this local string remains narrowed inside
        // the async database transaction closure below.
        const ownerId = actor.userId;
        if (!ownerId) {
            return jsonNoStore(
                { ok: false, error: "Sign in required." },
                401,
            );
        }

        const { projectId } = await ctx.params;
        const body = parseBody(await req.json());

        const existing = await prisma.codeProject.findFirst({
            where: {
                id: projectId,
                ownerId,
                archivedAt: null,
            },
            select: {
                id: true,
                title: true,
                description: true,
                currentVersion: true,
                updatedAt: true,
            },
        });

        if (!existing) {
            return jsonNoStore(
                { ok: false, error: "Project not found." },
                404,
            );
        }

        const nextDescription =
            body.description !== undefined ? body.description : existing.description;

        const hasHeadChanged =
            existing.title !== body.title ||
            existing.description !== nextDescription;

        if (hasHeadChanged && body.baseVersion !== existing.currentVersion) {
            return jsonNoStore(
                {
                    ok: false,
                    code: "PROJECT_CONFLICT",
                    error: "A newer cloud version already exists.",
                    conflict: {
                        projectId: existing.id,
                        clientBaseVersion: body.baseVersion ?? null,
                        serverVersion: existing.currentVersion,
                        serverUpdatedAt: existing.updatedAt.toISOString(),
                        title: existing.title,
                    },
                    project: {
                        id: existing.id,
                        title: existing.title,
                        description: existing.description ?? null,
                        updatedAt: existing.updatedAt.toISOString(),
                        currentVersion: existing.currentVersion,
                    },
                },
                409,
            );
        }

        if (!hasHeadChanged) {
            return jsonNoStore({
                ok: true,
                project: {
                    id: existing.id,
                    title: existing.title,
                    description: existing.description ?? null,
                    updatedAt: existing.updatedAt.toISOString(),
                    currentVersion: existing.currentVersion,
                },
            });
        }

        // A second tab may change this row after our preflight. Compare and
        // increment atomically; never overwrite a newer project revision.
        // Keep the conditional update and its returned revision within one
        // database transaction. An unrelated save cannot race between the
        // successful update and the metadata we acknowledge to the browser.
        const outcome = await prisma.$transaction(async (tx) => {
            const committed = await tx.codeProject.updateMany({
                where: {
                    id: existing.id,
                    ownerId,
                    archivedAt: null,
                    currentVersion: existing.currentVersion,
                },
                data: {
                    title: body.title,
                    ...(body.description !== undefined
                        ? { description: body.description }
                        : {}),
                    currentVersion: { increment: 1 },
                },
            });
            const latest = await tx.codeProject.findFirst({
                where: { id: existing.id, ownerId, archivedAt: null },
                select: {
                    id: true, title: true, description: true,
                    updatedAt: true, currentVersion: true,
                },
            });
            return {updated: committed.count === 1, project: latest};
        });
        if (!outcome.project) return jsonNoStore({ ok: false, error: "Project not found." }, 404);
        if (!outcome.updated) {
            const latest = outcome.project;
            return jsonNoStore({
                ok: false,
                code: "PROJECT_CONFLICT",
                error: "A newer cloud version already exists.",
                conflict: {
                    projectId: latest.id,
                    clientBaseVersion: body.baseVersion,
                    serverVersion: latest.currentVersion,
                    serverUpdatedAt: latest.updatedAt.toISOString(),
                    title: latest.title,
                },
                project: {
                    id: latest.id, title: latest.title,
                    description: latest.description ?? null,
                    updatedAt: latest.updatedAt.toISOString(),
                    currentVersion: latest.currentVersion,
                },
            }, 409);
        }
        const updated = outcome.project;

        return jsonNoStore({
            ok: true,
            project: {
                id: updated.id,
                title: updated.title,
                description: updated.description ?? null,
                updatedAt: updated.updatedAt.toISOString(),
                currentVersion: updated.currentVersion,
            },
        });
    } catch (e: any) {
        return jsonNoStore(
            {
                ok: false,
                error: e?.message ?? "Failed to update project metadata.",
            },
            400,
        );
    }
}