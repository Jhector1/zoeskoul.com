import fs from "node:fs/promises";
import path from "node:path";
import {
    getDraftSubjectManifestPath,
    getDraftTopicBundlePath,
    getDraftTopicMessagesPath,
    getSubjectManifestPath,
    getTopicBundlePath,
    getTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function copyFile(src: string, dest: string) {
    await ensureDir(dest);
    await fs.copyFile(src, dest);
}

export async function publishDraft(args: {
    subjectSlug: string;
    topicPacks: Array<{
        topicBundle: any;
        messagesByLocale: Record<string, Record<string, unknown>>;
    }>;
}) {
    await copyFile(
        getDraftSubjectManifestPath(args.subjectSlug),
        getSubjectManifestPath(args.subjectSlug),
    );

    for (const pack of args.topicPacks) {
        await copyFile(
            getDraftTopicBundlePath(
                args.subjectSlug,
                pack.topicBundle.moduleSlug,
                pack.topicBundle.topicId,
            ),
            getTopicBundlePath(
                args.subjectSlug,
                pack.topicBundle.moduleSlug,
                pack.topicBundle.topicId,
            ),
        );

        for (const locale of Object.keys(pack.messagesByLocale)) {
            await copyFile(
                getDraftTopicMessagesPath(
                    locale,
                    args.subjectSlug,
                    pack.topicBundle.moduleSlug,
                    pack.topicBundle.topicId,
                ),
                getTopicMessagesPath(
                    locale,
                    args.subjectSlug,
                    pack.topicBundle.moduleSlug,
                    pack.topicBundle.topicId,
                ),
            );
        }
    }
}