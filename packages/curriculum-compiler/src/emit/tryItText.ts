import type { TopicSeed } from "@zoeskoul/curriculum-contracts";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function ensureSentence(value: string) {
    const text = normalizeText(value);
    if (!text) return "";
    return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowerFirst(value: string) {
    return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

const GENERIC_TRY_IT_PATTERNS = [
    /^complete the exercise\.?$/i,
    /^complete this exercise\.?$/i,
    /^use the terminal to solve this\.?$/i,
    /^write code to pass the tests\.?$/i,
    /^solve (the )?task\.?$/i,
    /^do the exercise\.?$/i,
    /^finish the activity\.?$/i,
] as const;

export function hasGenericTryItText(text: string) {
    const normalized = normalizeText(text);
    return GENERIC_TRY_IT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function buildTryItTitle(exerciseTitle: string) {
    const title = normalizeText(exerciseTitle);
    return title ? `Try it yourself: ${title}` : "Try it yourself";
}

export function buildTryItPrompt(args: {
    exerciseTitle: string;
    exercisePrompt: string;
    topicTitle: string;
    seed: TopicSeed;
    sketchTitle?: string;
}) {
    const prompt = ensureSentence(args.exercisePrompt);
    const exerciseTitle = normalizeText(args.exerciseTitle);
    const topicTitle = normalizeText(args.topicTitle);
    const lines: string[] = [];

    const sketchTitle = normalizeText(args.sketchTitle);

    if (sketchTitle) {
        lines.push(`Right after the sketch "${sketchTitle}", practice that exact idea with this task.`);
    }

    if (prompt) {
        lines.push(prompt);
    } else if (exerciseTitle) {
        lines.push(`Complete the ${lowerFirst(exerciseTitle)} task.`);
    }

    if (exerciseTitle) {
        lines.push(
            `Produce the result for ${lowerFirst(exerciseTitle)} so it reinforces ${topicTitle || "this topic"}.`,
        );
    } else if (topicTitle) {
        lines.push(`Produce a result that reinforces ${topicTitle}.`);
    }

    if (
        args.seed.practice?.projectFlow === "progressive" ||
        args.seed.sectionRole === "module_project" ||
        args.seed.sectionRole === "capstone" ||
        args.seed.moduleRole === "capstone"
    ) {
        lines.push(
            "Keep this workspace ready for the connected project work that follows.",
        );
    }

    return lines.join(" ");
}
