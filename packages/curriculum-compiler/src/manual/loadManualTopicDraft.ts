import fs from "node:fs/promises";
import path from "node:path";
import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import { getAuthoringCourseRoot } from "@zoeskoul/curriculum-core";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";

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

export async function loadManualTopicDraftFile(filePath: string): Promise<TopicAuthoringDraft> {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as TopicAuthoringDraft;
    assertTopicAuthoringDraft(parsed);
    return parsed;
}

export async function loadManualTopicDraft(args: {
    subjectSlug: string;
    courseSlug: string;
    topicId: string;
}): Promise<{ draft: TopicAuthoringDraft; sourcePath: string }> {
    if (!args.topicId || path.basename(args.topicId) !== args.topicId) {
        throw new Error(`Invalid manual topic id: "${args.topicId}"`);
    }

    const contentRoot = path.join(
        getAuthoringCourseRoot(args.subjectSlug, args.courseSlug),
        "content",
    );

    let matches: string[];
    try {
        matches = await collectTopicFiles(contentRoot, `${args.topicId}.json`);
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: unknown }).code === "ENOENT"
        ) {
            throw new Error(`Manual content root does not exist: ${contentRoot}`);
        }
        throw error;
    }

    if (matches.length === 0) {
        throw new Error(`Manual topic "${args.topicId}" was not found under ${contentRoot}`);
    }
    if (matches.length > 1) {
        throw new Error(
            [`Manual topic "${args.topicId}" is ambiguous.`, ...matches.map((m) => `- ${m}`)].join("\n"),
        );
    }

    const sourcePath = matches[0];
    return {
        draft: await loadManualTopicDraftFile(sourcePath),
        sourcePath,
    };
}
