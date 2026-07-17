import { withTopicParentContext } from "@zoeskoul/curriculum-core";
import type {
  SubjectManifest,
  TopicManifestRefMap,
} from "@zoeskoul/curriculum-contracts";
import { defineJsonTopicBundle } from "./defineJsonTopicBundle.js";

export function buildGeneratorTopicsForModule(args: {
  manifest: SubjectManifest;
  topicManifests: TopicManifestRefMap;
  moduleSlug: string;
  profileId: string;
}) {
  const { manifest, topicManifests, moduleSlug, profileId } = args;

  const moduleManifest = manifest.modules.find((m) => m.slug === moduleSlug);
  if (!moduleManifest) {
    throw new Error(`Unknown module slug "${moduleSlug}"`);
  }

  return moduleManifest.sections.flatMap((section) =>
    section.topics.map((topicId) => {
      const topicManifest = topicManifests[topicId];
      if (!topicManifest) {
        throw new Error(
          `Missing topic manifest "${topicId}" for module "${moduleSlug}"`,
        );
      }

      const fullManifest = withTopicParentContext({
        manifest: topicManifest,
        subjectSlug: manifest.subject.slug,
        moduleSlug: moduleManifest.slug,
        sectionSlug: section.slug,
        prefix: moduleManifest.prefix,
        moduleRuntimeDefaults: moduleManifest.runtimeDefaults ?? null,
        subjectTools: manifest.subject.tools ?? null,
        moduleTools: moduleManifest.tools ?? null,
        sectionTools: section.tools ?? null,
      });

      return defineJsonTopicBundle(fullManifest, profileId);
    }),
  );
}
