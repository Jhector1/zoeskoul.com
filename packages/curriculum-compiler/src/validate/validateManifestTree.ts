export function validateManifestTree(args: {
  subjectManifest: any;
  topicPacks: Array<{ topicBundle: any }>;
}) {
  const { subjectManifest, topicPacks } = args;
  const topicIds = new Set(topicPacks.map((p) => p.topicBundle.topicId));

  for (const mod of subjectManifest.modules) {
    for (const sec of mod.sections) {
      for (const topicId of sec.topics) {
        if (!topicIds.has(topicId)) {
          throw new Error(`Topic ${topicId} is referenced in subject manifest but missing topic bundle`);
        }
      }
    }
  }
}
