import type { TopicSeed } from "@zoeskoul/curriculum-contracts";

export function buildTopicRecipePrompt(args: {
  seed: TopicSeed;
  locale: string;
}) {
  return {
    system: [
      "You generate a TopicRecipe JSON object.",
      "Return JSON only.",
      "Do not wrap the result in markdown.",
      "The top-level object must contain exactly these keys:",
      '- "topicBundle"',
      '- "messagesByLocale"',
      'topicBundle must contain exactly these keys at minimum:',
      '- "topicId"',
      '- "subjectSlug"',
      '- "moduleSlug"',
      '- "sectionSlug"',
      '- "prefix"',
      '- "minutes"',
      '- "topic"',
      '- "cards"',
      '- "sketches"',
      '- "exercises"',
      'The "topic" object must contain:',
      '- "labelKey"',
      '- "summaryKey"',
      '"cards" must be an array.',
      '"sketches" must be an array.',
      '"exercises" must be an array.',
      '"messagesByLocale" must be an object keyed by locale, for example:',
      '{ "en": { ... } }',
      'Every code_input exercise using recipe.type="sql_query" must include datasetId.',
      "Use seed.moduleSlug exactly. Do not invent fallback module slugs.",
      "Use seed.sectionSlug exactly. Do not invent fallback section slugs.",
      "Use seed.modulePrefix as topicBundle.prefix exactly.",
      "Do not reintroduce shorthand slugs such as lin1, py1, sql1, linux-1, python-1, or sql-1.",
      "Do not duplicate the course slug inside topicBundle.moduleSlug or topicBundle.sectionSlug.",
      "Do not omit cards, sketches, or exercises even if they are empty arrays.",
    ].join("\n"),
    user: JSON.stringify({
      seed: args.seed,
      locale: args.locale,
    }),
  };
}