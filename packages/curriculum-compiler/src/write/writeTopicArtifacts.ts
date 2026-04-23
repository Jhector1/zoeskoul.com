import fs from "node:fs/promises";
import path from "node:path";
import {
    getDraftTopicBundlePath,
    getDraftTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJsonAtomic(filePath: string, data: unknown) {
    const tempPath = `${filePath}.tmp`;
    await ensureDir(filePath);
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    await fs.rename(tempPath, filePath);
}

export async function writeTopicArtifacts(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
    topicBundle: unknown;
    messagesByLocale: Record<string, Record<string, unknown>>;
}) {
    const moduleDir = `module${args.moduleOrder}`;

    await writeJsonAtomic(
        getDraftTopicBundlePath(args.subjectSlug, moduleDir, args.topicId),
        args.topicBundle,
    );

    for (const [locale, messages] of Object.entries(args.messagesByLocale)) {
        await writeJsonAtomic(
            getDraftTopicMessagesPath(locale, args.subjectSlug, moduleDir, args.topicId),
            messages,
        );
    }
}