export function validateBlueprint(blueprint: any) {
  if (!blueprint.subjectSlug) throw new Error("Blueprint missing subjectSlug");
  if (!blueprint.profileId) throw new Error("Blueprint missing profileId");
  if (!blueprint.sourceLocale) throw new Error("Blueprint missing sourceLocale");
}
