import { withTopicParentContext } from "@zoeskoul/curriculum-core";
import { tag } from "../i18n/resolveManifestMessages.js";
import { defineJsonTopicBundle } from "../generator/defineJsonTopicBundle.js";

export function defineCourseFromManifest(args: {
  manifest: any;
  topicManifests: Record<string, any>;
  profileId: string;
}) {
  const { manifest, topicManifests, profileId } = args;

  const modules = manifest.modules.map((moduleManifest: any) => {
    const sections = moduleManifest.sections.map((sectionManifest: any) => {
      const topics = sectionManifest.topics.map((topicId: string) => {
        const topicManifest = topicManifests[topicId];
        if (!topicManifest) {
          throw new Error(`Missing topic manifest "${topicId}"`);
        }

        return defineJsonTopicBundle(
          withTopicParentContext({
            manifest: topicManifest,
            subjectSlug: manifest.subject.slug,
            moduleSlug: moduleManifest.slug,
            sectionSlug: sectionManifest.slug,
            prefix: moduleManifest.prefix,
            moduleRuntimeDefaults: moduleManifest.runtimeDefaults ?? null,
          }),
          profileId,
        );
      });

      return {
        section: {
          slug: sectionManifest.slug,
          order: sectionManifest.order,
          title: tag(sectionManifest.titleKey),
          description: sectionManifest.descriptionKey
            ? tag(sectionManifest.descriptionKey)
            : undefined,
          titleKey: sectionManifest.titleKey,
          descriptionKey: sectionManifest.descriptionKey ?? undefined,
          meta: sectionManifest.meta ?? null,
        },
        topics,
      };
    });

    return {
      module: {
        slug: moduleManifest.slug,
        subjectSlug: manifest.subject.slug,
        order: moduleManifest.order,
        title: tag(moduleManifest.titleKey),
        description: moduleManifest.descriptionKey
          ? tag(moduleManifest.descriptionKey)
          : undefined,
        titleKey: moduleManifest.titleKey,
        descriptionKey: moduleManifest.descriptionKey ?? undefined,
        runtimeDefaults: moduleManifest.runtimeDefaults ?? null,
        meta: moduleManifest.meta ?? null,
      },
      prefix: moduleManifest.prefix,
      genKey: manifest.subject.genKey,
      sections,
    };
  });

  return {
    subject: {
      slug: manifest.subject.slug,
      order: manifest.subject.order,
      title: tag(manifest.subject.titleKey),
      description: manifest.subject.descriptionKey
        ? tag(manifest.subject.descriptionKey)
        : undefined,
      titleKey: manifest.subject.titleKey,
      descriptionKey: manifest.subject.descriptionKey ?? undefined,
      accessPolicy: manifest.subject.accessPolicy ?? "free",
      status: manifest.subject.status ?? "active",
      meta: manifest.subject.meta ?? null,
    },
    modules,
  };
}
