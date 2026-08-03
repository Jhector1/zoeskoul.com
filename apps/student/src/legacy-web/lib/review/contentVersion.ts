import "server-only";

import crypto from "node:crypto";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import {
    getRawReviewModule,
    getRawReviewModuleRows,
} from "@/lib/subjects/registry";

import type { ReviewContentVersion } from "@/lib/review/contentVersionTypes";

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }

    const obj = value as Record<string, unknown>;

    return `{${Object.keys(obj)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
        .join(",")}}`;
}

function sha256Short(value: unknown) {
    return crypto
        .createHash("sha256")
        .update(stableStringify(value))
        .digest("hex")
        .slice(0, 16);
}
function getCourseTrackVersion(subject: unknown): number | null {
    const meta =
        typeof subject === "object" && subject !== null && "meta" in subject
            ? (subject as { meta?: unknown }).meta
            : null;

    const versioning =
        typeof meta === "object" && meta !== null && "versioning" in meta
            ? (meta as { versioning?: unknown }).versioning
            : null;

    const version =
        typeof versioning === "object" && versioning !== null && "version" in versioning
            ? (versioning as { version?: unknown }).version
            : null;

    return typeof version === "number" ? version : null;
}
/**
 * One source of truth for the currently published review content patch.
 *
 * This is NOT the same as python-v2 vs python-v3.
 * This only tracks edits to the currently published content for this subject/module.
 */
export async function getReviewContentVersion(args: {
    subjectSlug: string;
    moduleSlug: string;
}): Promise<ReviewContentVersion | null> {
    const { subjectSlug, moduleSlug } = args;

    const subject = SUBJECT_ARTIFACTS.subjects.find(
        (item) => item.slug === subjectSlug,
    );

    if (!subject) return null;

    const rawModule = getRawReviewModule(subjectSlug, moduleSlug);
    if (!rawModule) return null;

    const moduleRows = getRawReviewModuleRows(subjectSlug) ?? [];

    /**
     * Subject hash tracks the visible course shell: module list/order/nav.
     * Module hash tracks the current loaded module content.
     */
    const subjectContentHash = sha256Short({
        subjectSlug,
        modules: moduleRows.map((row) => ({
            slug: row.slug,
            order: row.order,
            title: row.title,
        })),
    });

    const moduleContentHash = sha256Short({
        subjectSlug,
        moduleSlug,
        module: rawModule,
    });

    return {
        kind: "review_content_patch",
        subjectSlug,
        moduleSlug,
        contentReleaseId: `${subjectSlug}:${moduleSlug}:${moduleContentHash}`,
        subjectContentHash,
        moduleContentHash,
        generatedAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
        courseTrackVersion: getCourseTrackVersion(subject),
    };
}