import { assertNoDot, assertNonEmpty, invariant } from "@zoeskoul/curriculum-core";

export function buildArtifacts(courses: readonly any[]) {
    const subjects: any[] = [];
    const modules: any[] = [];
    const topics: any[] = [];
    const sections: any[] = [];

    const sketches: Record<string, any> = {};
    const reviewTopicsBySlug: Record<string, any> = {};
    const generatorsByTopicSlug: Record<string, any> = {};
    const catalog: Record<string, any> = {};

    const subjectSeen = new Set<string>();
    const moduleSeen = new Set<string>();
    const sectionSeen = new Set<string>();
    const topicSeen = new Set<string>();

    for (const course of courses) {
        const { subject } = course;

        assertNonEmpty(subject.slug, "subject.slug");
        assertNonEmpty(subject.titleKey ?? subject.title, "subject.title/titleKey");
        invariant(!subjectSeen.has(subject.slug), `Duplicate subject.slug "${subject.slug}"`);
        subjectSeen.add(subject.slug);

        subjects.push(subject);

        const TOPIC: Record<string, string> = {};
        const modulesBySlug: Record<string, any> = {};

        for (const mod of course.modules) {
            assertNonEmpty(mod.module.slug, "module.slug");
            assertNonEmpty(
                mod.module.titleKey ?? mod.module.title,
                `module.title/titleKey for "${mod.module.slug}"`,
            );
            assertNonEmpty(mod.prefix, `prefix for module "${mod.module.slug}"`);
            assertNonEmpty(mod.genKey, `genKey for module "${mod.module.slug}"`);
            assertNoDot(mod.prefix, `prefix for module "${mod.module.slug}"`);

            invariant(!moduleSeen.has(mod.module.slug), `Duplicate module.slug "${mod.module.slug}"`);
            moduleSeen.add(mod.module.slug);
            modules.push(mod.module);

            invariant(
                mod.sections.length > 0,
                `Module "${mod.module.slug}" must have at least one section`,
            );

            const firstSection = mod.sections[0];
            const moduleTopicIds: string[] = [];
            const moduleTopicMap: Record<string, string> = {};

            for (const sectionBundle of mod.sections) {
                const sec = sectionBundle.section;

                assertNonEmpty(sec.slug, "section.slug");
                assertNonEmpty(
                    sec.titleKey ?? sec.title,
                    `section.title/titleKey for "${sec.slug}"`,
                );
                invariant(!sectionSeen.has(sec.slug), `Duplicate section.slug "${sec.slug}"`);
                sectionSeen.add(sec.slug);

                const sectionTopicSlugs: string[] = [];

                for (let idx = 0; idx < sectionBundle.topics.length; idx++) {
                    const bundle = sectionBundle.topics[idx];
                    const def = bundle.def;

                    assertNonEmpty(def.id, "topic.id");
                    assertNoDot(def.id, `topic.id "${def.id}"`);

                    const slug = `${mod.prefix}.${def.id}`;
                    invariant(!topicSeen.has(slug), `Duplicate topic slug "${slug}"`);
                    topicSeen.add(slug);

                    const variant = def.variant === undefined ? def.id : def.variant;

                    topics.push({
                        slug,
                        subjectSlug: subject.slug,
                        moduleSlug: mod.module.slug,
                        order: def.order ?? idx,
                        title: def.titleKey ?? `topic.${slug}`,
                        titleKey: def.titleKey,
                        description: def.description,
                        descriptionKey: undefined,
                        genKey: mod.genKey,
                        variant,
                        meta: def.meta,
                    });

                    sectionTopicSlugs.push(slug);
                    moduleTopicIds.push(def.id);
                    moduleTopicMap[def.id] = slug;

                    if (TOPIC[def.id] && TOPIC[def.id] !== slug) {
                        throw new Error(
                            `TOPIC collision for "${def.id}": "${TOPIC[def.id]}" vs "${slug}"`,
                        );
                    }
                    TOPIC[def.id] = slug;

                    if (bundle.review) reviewTopicsBySlug[slug] = bundle.review;
                    if (bundle.generator) {
                        generatorsByTopicSlug[slug] = {
                            ...bundle.generator,
                            genKey: mod.genKey,
                        };
                    }

                    if (bundle.sketches) {
                        for (const [sketchId, entry] of Object.entries(bundle.sketches)) {
                            if (sketches[sketchId]) {
                                throw new Error(`Duplicate sketch id "${sketchId}"`);
                            }
                            sketches[sketchId] = entry;
                        }
                    }
                }

                sections.push({
                    slug: sec.slug,
                    subjectSlug: subject.slug,
                    moduleSlug: mod.module.slug,
                    order: sec.order,
                    title: sec.title,
                    description: sec.description,
                    titleKey: sec.titleKey,
                    descriptionKey: sec.descriptionKey,
                    meta: sec.meta ?? null,
                    topicSlugs: sectionTopicSlugs,
                });
            }

            modulesBySlug[mod.module.slug] = {
                moduleSlug: mod.module.slug,
                sectionSlug: firstSection.section.slug,
                sectionTitle: firstSection.section.title,
                sectionTitleKey: firstSection.section.titleKey,
                sectionOrder: firstSection.section.order,
                genKey: mod.genKey,
                prefix: mod.prefix,
                topicIds: [...new Set(moduleTopicIds)],
                topics: moduleTopicMap,
                runtimeDefaults: mod.module.runtimeDefaults ?? null,
            };
        }

        catalog[subject.slug] = {
            subjectSlug: subject.slug,
            TOPIC,
            modulesBySlug,
        };
    }

    return {
        subjects,
        modules,
        topics,
        sections,
        catalog,
        sketches,
        reviewTopicsBySlug,
        generatorsByTopicSlug,
    };
}