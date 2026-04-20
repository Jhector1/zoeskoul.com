export function validatePlan(plan: any) {
    if (!plan) {
        throw new Error("Plan is required");
    }

    if (!Array.isArray(plan.modules) || plan.modules.length === 0) {
        throw new Error("Plan must contain at least one module");
    }

    for (const mod of plan.modules) {
        if (!mod.moduleSlug || typeof mod.moduleSlug !== "string") {
            throw new Error("Each module must have a moduleSlug");
        }

        if (!Array.isArray(mod.sections) || mod.sections.length === 0) {
            throw new Error(`Module "${mod.moduleSlug}" must contain at least one section`);
        }

        for (const sec of mod.sections) {
            if (!sec.sectionSlug || typeof sec.sectionSlug !== "string") {
                throw new Error(`Module "${mod.moduleSlug}" has a section missing sectionSlug`);
            }

            if (!Array.isArray(sec.topics) || sec.topics.length === 0) {
                throw new Error(
                    `Section "${sec.sectionSlug}" in module "${mod.moduleSlug}" must contain at least one topic`,
                );
            }

            for (const topic of sec.topics) {
                if (!topic.topicId || typeof topic.topicId !== "string") {
                    throw new Error(
                        `Section "${sec.sectionSlug}" in module "${mod.moduleSlug}" has a topic missing topicId`,
                    );
                }
            }
        }
    }
}