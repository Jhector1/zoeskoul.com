import fs from "node:fs/promises";
import path from "node:path";
import {
    getDraftSubjectManifestPath,
    getDraftTopicBundlePath,
    getDraftTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
    await ensureDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function writeDraft(args: {
    subjectSlug: string;
    subjectManifest: unknown;
    topicPacks: Array<{
        topicBundle: any;
        messagesByLocale: Record<string, Record<string, unknown>>;
    }>;
}) {
    await writeJson(getDraftSubjectManifestPath(args.subjectSlug), args.subjectManifest);

    for (const pack of args.topicPacks) {

        if (!pack.topicBundle.moduleSlug) {
            throw new Error(`Missing moduleSlug for topic "${pack.topicBundle.topicId}"`);
        }

        if (!pack.topicBundle.topicId) {
            throw new Error(`Missing topicId in topic bundle`);
        }
        await writeJson(
            getDraftTopicBundlePath(
                args.subjectSlug,
                pack.topicBundle.moduleSlug,
                pack.topicBundle.topicId,
            ),
            pack.topicBundle,
        );

        for (const [locale, messages] of Object.entries(pack.messagesByLocale)) {
            await writeJson(
                getDraftTopicMessagesPath(
                    locale,
                    args.subjectSlug,
                    pack.topicBundle.moduleSlug,
                    pack.topicBundle.topicId,
                ),
                messages,
            );
        }
    }
}