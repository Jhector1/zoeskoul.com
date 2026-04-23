import { writeSubjectArtifacts } from "./writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "./writeTopicArtifacts.js";

export async function writeDraft(args: {
  subjectSlug: string;
  subjectManifest: unknown;
  topicPacks: Array<{
    topicBundle: {
      topicId: string;
      moduleSlug: string;
    };
    messagesByLocale: Record<string, Record<string, unknown>>;
  }>;
}) {
  await writeSubjectArtifacts({
    subjectSlug: args.subjectSlug,
    subjectManifest: args.subjectManifest,
  });

  for (const pack of args.topicPacks) {
    const match = pack.topicBundle.moduleSlug.match(/(\d+)$/);
    const moduleOrder = match ? Number(match[1]) : 0;

    await writeTopicArtifacts({
      subjectSlug: args.subjectSlug,
      moduleOrder,
      topicId: pack.topicBundle.topicId,
      topicBundle: pack.topicBundle,
      messagesByLocale: pack.messagesByLocale,
    });
  }
}