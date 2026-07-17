import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "./profileServices.js";

const GENERIC_TITLE = /^(?:(?:understanding|using|practical use of|introduction to|overview of)\b|project overview(?::.*)?$|example$)/i;
const ROBOTIC_OPENING = /^(?:in\s+sql\s*,|the\s+.+?\s+(?:clause|operation)\s+(?:is used|is crucial)|let['’]?s\s+(?:look|say|consider)|for\s+example\s*,?\s+consider|when\s+using\b)/i;
const DEFINITION_SIGNAL = /\b(?:is|means|refers to|describes|names|identifies|preserves|records|keeps|combines|pairs|turns|tells|determines|answers|represents|connects|stores|acts as)\b/i;
const TECHNICAL_MARKER = /`[^`]+`|\*\*[^*]+\*\*/;
const ROBOTIC_PHRASE = /\b(?:in sql,|this query will|in this query:|for example, consider|let['’]?s look at|let['’]?s say)\b/gi;

function normalizeTitle(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function wordCount(value: unknown): number {
    return String(value ?? "")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/[`*_>#|\-]/g, " ")
        .split(/\s+/)
        .filter(Boolean).length;
}

function firstParagraph(value: unknown): string {
    return String(value ?? "")
        .trim()
        .split(/\n\s*\n/, 1)[0]
        ?.trim() ?? "";
}

export function validateTeachingProseQuality(args: {
    profileId: string;
    draft: TopicAuthoringDraft;
    projectLike: boolean;
}): SemanticValidationIssue[] {
    // The hard gate is introduced for SQL first. The shared authoring prompt
    // carries the same prose guidance to every programming-family profile,
    // while other profiles can adopt the validator without breaking existing
    // published courses that predate cardTitle and book-like prose contracts.
    if (String(args.profileId ?? "").trim().toLowerCase() !== "sql") {
        return [];
    }

    const issues: SemanticValidationIssue[] = [];
    const blocks = Array.isArray(args.draft.sketchBlocks)
        ? args.draft.sketchBlocks
        : [];
    const seenCardTitles = new Map<string, string>();
    const seenInnerTitles = new Map<string, string>();

    for (const [index, block] of blocks.entries()) {
        const blockId = String(block.id ?? `sketch-${index}`);
        const cardTitle = String(block.cardTitle ?? "").trim();
        const innerTitle = String(block.title ?? "").trim();
        const body = String(block.bodyMarkdown ?? "").trim();
        const minimumWords = args.projectLike ? 80 : 110;

        if (!args.projectLike && cardTitle.length === 0) {
            issues.push({
                code: "PROGRAMMING_CARD_TITLE_MISSING",
                category: "pedagogy",
                severity: "error",
                message:
                    `Teaching sketch "${blockId}" must provide cardTitle so the lesson navigation title can differ from the inner prose heading.`,
            });
        }

        if (
            cardTitle.length > 0 &&
            normalizeTitle(cardTitle) === normalizeTitle(innerTitle)
        ) {
            issues.push({
                code: "PROGRAMMING_CARD_TITLE_REPEATS_HEADING",
                category: "pedagogy",
                severity: "error",
                message:
                    `Teaching sketch "${blockId}" repeats the same text for cardTitle and title. Use complementary titles so the learner UI does not show the same heading twice.`,
            });
        }

        for (const [field, value, seen] of [
            ["cardTitle", cardTitle, seenCardTitles],
            ["title", innerTitle, seenInnerTitles],
        ] as const) {
            const normalized = normalizeTitle(value);
            const previousBlockId = normalized ? seen.get(normalized) : undefined;
            if (previousBlockId) {
                issues.push({
                    code: "PROGRAMMING_SKETCH_TITLE_REPEATED_ACROSS_CARDS",
                    category: "pedagogy",
                    severity: "error",
                    message:
                        `Teaching sketch "${blockId}" repeats ${field} "${value}" from ` +
                        `"${previousBlockId}". Give each lesson card a distinct narrative role.`,
                });
            } else if (normalized) {
                seen.set(normalized, blockId);
            }
        }

        for (const [field, value] of [
            ["cardTitle", cardTitle],
            ["title", innerTitle],
        ] as const) {
            if (value && GENERIC_TITLE.test(value)) {
                issues.push({
                    code: "PROGRAMMING_SKETCH_TITLE_GENERIC",
                    category: "pedagogy",
                    severity: "error",
                    message:
                        `Teaching sketch "${blockId}" uses generic ${field} "${value}". Name the idea, tension, or reasoning move instead of using Understanding, Using, Introduction, or Project Overview.`,
                });
            }
        }

        if (wordCount(body) < minimumWords) {
            issues.push({
                code: "PROGRAMMING_TEACHING_PROSE_TOO_THIN",
                category: "pedagogy",
                severity: "error",
                message:
                    `Teaching sketch "${blockId}" has ${wordCount(body)} prose word(s); expected at least ${minimumWords} words of connected explanation, interpretation, and context.`,
            });
        }

        if (!args.projectLike) {
            const opening = firstParagraph(body);
            if (
                opening.length < 90 ||
                !DEFINITION_SIGNAL.test(opening) ||
                !TECHNICAL_MARKER.test(opening)
            ) {
                issues.push({
                    code: "PROGRAMMING_CONCEPT_DEFINITION_MISSING",
                    category: "pedagogy",
                    severity: "error",
                    message:
                        `Teaching sketch "${blockId}" must define the named concept in its first paragraph, explain its purpose, and name the technical term before presenting syntax.`,
                });
            }

            if (ROBOTIC_OPENING.test(opening)) {
                issues.push({
                    code: "PROGRAMMING_ROBOTIC_PROSE_DETECTED",
                    category: "pedagogy",
                    severity: "error",
                    message:
                        `Teaching sketch "${blockId}" begins with a mechanical template. Open with the concept's meaning or the learner's problem instead of "In SQL", "The operation is used", "Let's look", or similar boilerplate.`,
                });
            }
        }
    }

    const combined = blocks
        .map((block) => String(block.bodyMarkdown ?? ""))
        .join("\n\n");
    const roboticMatches = combined.match(ROBOTIC_PHRASE) ?? [];
    if (roboticMatches.length >= 3) {
        issues.push({
            code: "PROGRAMMING_ROBOTIC_PROSE_DETECTED",
            category: "pedagogy",
            severity: "error",
            message:
                `Teaching prose repeats mechanical transitions ${roboticMatches.length} times. Vary the narrative and let each sketch advance the explanation rather than following one template.`,
        });
    }

    return issues;
}
