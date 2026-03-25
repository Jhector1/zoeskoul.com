import { defineSection } from "@/lib/subjects/_core/defineSection";
import { COMMENTS_INTRO_TOPIC } from "./topics/comments_intro";
import { EDITOR_WORKSPACE_OVERVIEW_TOPIC } from "./topics/workspace";
import {COMPUTER_INTRO_TOPIC} from "@/lib/subjects/python/modules/module0/topics/computer_intro";
import {PROGRAMMING_INTRO_TOPIC} from "@/lib/subjects/python/modules/module0/topics/programming_intro";
import {SYNTAX_INTRO_TOPIC} from "@/lib/subjects/python/modules/module0/topics/syntax_intro";

export const PY_MODULE0_SECTION = defineSection({
    section: {
        slug: "python-0-foundations",
        order: 0,
        title: "Module 0 — Foundations",
        description: "Workspace + programming basics: IPO model, syntax, and comments.",
        meta: {
            module: 0,
            weeks: "Weeks 0–2",
            bullets: [
                "Workspace tour (editor, run, terminal)",
                "Input → Processing → Output",
                "Syntax rules + SyntaxError",
                "Comments as notes to humans",
            ],
        },
    },
    topics: [
        COMPUTER_INTRO_TOPIC,
        PROGRAMMING_INTRO_TOPIC,
        SYNTAX_INTRO_TOPIC,
        EDITOR_WORKSPACE_OVERVIEW_TOPIC,

        COMMENTS_INTRO_TOPIC,
    ],
});