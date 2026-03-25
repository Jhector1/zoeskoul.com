// prisma/seed/presets.ts (or inside your seed script)
import { prisma } from "@/lib/prisma";

export async function seedPracticePresets() {
    const quizOnly = await prisma.practiceRunPreset.upsert({
        where: { key: "MODULE_QUIZ_ONLY" },
        update: {
            allowedPurposes: ["quiz"],
            allowedKinds: ["single_choice", "multi_choice", "numeric", "drag_reorder", "code_input"],
        },
        create: {
            key: "MODULE_QUIZ_ONLY",
            allowedPurposes: ["quiz"],
            allowedKinds: ["single_choice", "multi_choice", "numeric", "drag_reorder", "code_input"],
        },
    });

    const mixed = await prisma.practiceRunPreset.upsert({
        where: { key: "MIXED_PRACTICE" },
        update: {
            allowedPurposes: ["quiz", "project"],
            allowedKinds: [], // empty => no kind restriction
        },
        create: {
            key: "MIXED_PRACTICE",
            allowedPurposes: ["quiz", "project"],
            allowedKinds: [],
        },
    });

    return { quizOnly, mixed };
}