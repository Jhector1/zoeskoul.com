import fs from "node:fs/promises";
import path from "node:path";
import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import {
    getDraftSourceTopicMetadataPath,
    getDraftSourceTopicPath,
    getDraftSourceTopicsRoot,
} from "@zoeskoul/curriculum-core";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";

export type TopicSourceOrigin = "manual" | "generated";

export type TopicSourceMetadata = {
    version: 1;
    origin: TopicSourceOrigin;
    generatedAt?: string;
    generator?: {
        provider?: string;
        model?: string;
    };
};

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function collectTopicFiles(root: string, topicFileName: string): Promise<string[]> {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const matches: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            matches.push(...(await collectTopicFiles(fullPath, topicFileName)));
        } else if (entry.isFile() && entry.name === topicFileName) {
            matches.push(fullPath);
        }
    }
    return matches;
}

export async function loadTopicSourceDraftFile(filePath: string): Promise<TopicAuthoringDraft> {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as TopicAuthoringDraft;
    assertTopicAuthoringDraft(parsed);
    return parsed;
}

export async function findTopicSourceDraft(args: {
    subjectSlug: string;
    courseSlug: string;
    topicId: string;
}): Promise<{ draft: TopicAuthoringDraft; sourcePath: string } | null> {
    if (!args.topicId || path.basename(args.topicId) !== args.topicId) {
        throw new Error(`Invalid topic source id: "${args.topicId}"`);
    }

    const topicsRoot = getDraftSourceTopicsRoot(args.subjectSlug, args.courseSlug);
    if (!(await pathExists(topicsRoot))) return null;

    const matches = await collectTopicFiles(topicsRoot, `${args.topicId}.json`);
    if (matches.length === 0) return null;
    if (matches.length > 1) {
        throw new Error(
            [`Topic source draft "${args.topicId}" is ambiguous.`, ...matches.map((m) => `- ${m}`)].join("\n"),
        );
    }

    const sourcePath = matches[0];
    return {
        draft: await loadTopicSourceDraftFile(sourcePath),
        sourcePath,
    };
}

export async function loadTopicSourceDraft(args: {
    subjectSlug: string;
    courseSlug: string;
    topicId: string;
}) {
    const found = await findTopicSourceDraft(args);
    if (!found) {
        throw new Error(
            `Topic source draft "${args.topicId}" was not found under ${getDraftSourceTopicsRoot(args.subjectSlug, args.courseSlug)}`,
        );
    }
    return found;
}

async function writeJsonAtomic(filePath: string, value: unknown) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
}

export async function writeTopicSourceDraft(args: {
    subjectSlug: string;
    courseSlug: string;
    moduleSlug: string;
    topicId: string;
    draft: TopicAuthoringDraft;
    metadata: TopicSourceMetadata;
}) {
    assertTopicAuthoringDraft(args.draft);
    const sourcePath = getDraftSourceTopicPath(
        args.subjectSlug,
        args.courseSlug,
        args.moduleSlug,
        args.topicId,
    );
    const metadataPath = getDraftSourceTopicMetadataPath(
        args.subjectSlug,
        args.courseSlug,
        args.moduleSlug,
        args.topicId,
    );

    if (await pathExists(sourcePath)) {
        const existing = await loadTopicSourceDraftFile(sourcePath);
        if (JSON.stringify(existing) !== JSON.stringify(args.draft)) {
            throw new Error(
                `Refusing to overwrite canonical topic source draft: ${sourcePath}. Edit the saved draft, or delete it explicitly before regenerating.`,
            );
        }
        return { sourcePath, metadataPath, created: false };
    }

    await writeJsonAtomic(sourcePath, args.draft);
    await writeJsonAtomic(metadataPath, args.metadata);
    return { sourcePath, metadataPath, created: true };
}
