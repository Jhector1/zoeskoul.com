import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";

export function buildTranslationPrompt(args: {
  locale: string;
  sourceLocale: string;
  entries: Array<{ key: string; value: string }>;
  shape: SubjectShapePack;
}) {
  return {
    system: [
      "You translate ZoeSkoul curriculum message entries.",
      "Return JSON only.",
      "Preserve keys exactly.",
      "Translate only values.",
      "Keep code, SQL, Python identifiers, dataset names, and message keys unchanged.",
      "Do not translate fenced code blocks line-by-line in a way that changes code.",
      "Use the provided shape pack only as style/context, not as output structure.",
      'Return: { "entries": [{ "key": "...", "value": "..." }] }',
    ].join("\n"),
    user: JSON.stringify(
        {
          sourceLocale: args.sourceLocale,
          targetLocale: args.locale,
          entries: args.entries,
          shapeProfile: args.shape.profileId,
        },
        null,
        2,
    ),
  };
}