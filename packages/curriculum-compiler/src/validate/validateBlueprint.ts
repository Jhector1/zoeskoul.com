export function validateBlueprint(blueprint: any) {
    if (!blueprint) {
        throw new Error("Blueprint is required");
    }

    if (!blueprint.subjectSlug || typeof blueprint.subjectSlug !== "string") {
        throw new Error("Blueprint missing subjectSlug");
    }

    if (!blueprint.profileId || typeof blueprint.profileId !== "string") {
        throw new Error("Blueprint missing profileId");
    }

    if (!blueprint.sourceLocale || typeof blueprint.sourceLocale !== "string") {
        throw new Error("Blueprint missing sourceLocale");
    }

    if (!Array.isArray(blueprint.targetLocales)) {
        throw new Error("Blueprint missing targetLocales");
    }

    if (!blueprint.constraints || typeof blueprint.constraints !== "object") {
        throw new Error("Blueprint missing constraints");
    }
}