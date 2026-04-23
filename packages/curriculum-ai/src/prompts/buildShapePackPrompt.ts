import type { TopicSeed } from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";

export function buildShapePackPrompt(args: {
    seed: TopicSeed;
    locale: string;
    shape: SubjectShapePack;
}) {
    return {
        system: [
            "You are generating authoring drafts for ZoeSkoul.",
            "You must follow the subject shape pack exactly.",
            "Do not invent manifest structure.",
            "Do not invent message namespaces.",
            "Do not invent datasets or recipe types.",
            "Return JSON only.",
            "Return a small authoring draft, not the final topic.bundle.json.",
        ].join("\n"),
        user: JSON.stringify(
            {
                locale: args.locale,
                seed: args.seed,
                shape: args.shape,
            },
            null,
            2,
        ),
    };
}