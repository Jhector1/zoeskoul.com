import fs from "node:fs/promises";
import path from "node:path";
import type {
    TopicAuthoringDraft,
    TopicBundleManifest,
} from "@zoeskoul/curriculum-contracts";
import {
    getDraftReportsRoot,
    getDraftTopicBundlePath,
    getDraftTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

export type RebuildDraftSourcePreference = "reports" | "current-output";

async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: unknown }).code === "ENOENT"
        ) {
            return undefined;
        }

        throw error;
    }
}

export function getTopicReportDir(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
}) {
    return path.join(
        getDraftReportsRoot(args.subjectSlug),
        `module${args.moduleOrder}`,
        args.topicId,
    );
}

export async function readSavedDraftForRebuild(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
}): Promise<{
    draft: TopicAuthoringDraft;
    source: "repaired-draft.json" | "normalized-draft.json" | "raw-draft.json";
}> {
    const reportDir = getTopicReportDir(args);
    const candidates = [
        "repaired-draft.json",
        "normalized-draft.json",
        "raw-draft.json",
    ] as const;

    for (const fileName of candidates) {
        const value = await readJsonIfExists(path.join(reportDir, fileName));

        if (value !== undefined) {
            return {
                draft: value as TopicAuthoringDraft,
                source: fileName,
            };
        }
    }

    throw new Error(
        [
            `Cannot rebuild topic "${args.topicId}" from saved drafts.`,
            `Expected one of: ${candidates.join(", ")}`,
            `Report dir: ${reportDir}`,
        ].join("\n"),
    );
}

export async function readCurrentDraftOutputForRebuild(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
    sourceLocale: string;
    extraLocales?: string[];
}): Promise<{
    topicBundle: TopicBundleManifest;
    messagesByLocale: Record<string, Record<string, unknown>>;
    source: "current-draft-output";
    sourceBundlePath: string;
    sourceMessagesPaths: Record<string, string>;
}> {
    const moduleDir = `module${args.moduleOrder}`;
    const sourceBundlePath = getDraftTopicBundlePath(
        args.subjectSlug,
        moduleDir,
        args.topicId,
    );
    const sourceMessagesPath = getDraftTopicMessagesPath(
        args.sourceLocale,
        args.subjectSlug,
        moduleDir,
        args.topicId,
    );

    const topicBundle = await readJsonIfExists(sourceBundlePath);
    const sourceMessages = await readJsonIfExists(sourceMessagesPath);

    if (topicBundle === undefined || sourceMessages === undefined) {
        throw new Error(
            [
                `Cannot rebuild topic "${args.topicId}" from current draft output.`,
                `Expected current draft bundle and source-locale messages to exist.`,
                `Bundle path: ${sourceBundlePath}`,
                `Messages path: ${sourceMessagesPath}`,
            ].join("\n"),
        );
    }

    const messagesByLocale: Record<string, Record<string, unknown>> = {
        [args.sourceLocale]: sourceMessages as Record<string, unknown>,
    };
    const sourceMessagesPaths: Record<string, string> = {
        [args.sourceLocale]: sourceMessagesPath,
    };

    for (const locale of args.extraLocales ?? []) {
        const messagesPath = getDraftTopicMessagesPath(
            locale,
            args.subjectSlug,
            moduleDir,
            args.topicId,
        );
        const messages = await readJsonIfExists(messagesPath);

        if (messages !== undefined) {
            messagesByLocale[locale] = messages as Record<string, unknown>;
            sourceMessagesPaths[locale] = messagesPath;
        }
    }

    return {
        topicBundle: topicBundle as TopicBundleManifest,
        messagesByLocale,
        source: "current-draft-output",
        sourceBundlePath,
        sourceMessagesPaths,
    };
}
