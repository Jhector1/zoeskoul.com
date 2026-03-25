"use client";

import React, { useMemo, useState } from "react";
import type { SavedSketchState } from "@/components/sketches/subjects/types";
import SketchRenderer from "@/components/sketches/subjects/SketchRenderer";
import { SketchShell } from "@/components/sketches/_shared/shells";
import { cn } from "@/lib/cn";

type Item = { id: string; archetype: string; title: string };

const ITEMS: Item[] = [
    { id: "intro", archetype: "intro_stepper", title: "Intro Stepper" },
    { id: "tpl", archetype: "template_picker", title: "Template Picker" },
    { id: "chk", archetype: "checklist", title: "Checklist" },
    { id: "fc", archetype: "flashcards", title: "Flashcards" },
    { id: "lab", archetype: "lab_runner", title: "Lab Runner" },
    { id: "gate", archetype: "classifier_gate", title: "Classifier Gate" },
    { id: "xform", archetype: "transform_toggle", title: "Transform Toggle" },
    { id: "reorder", archetype: "reorder_tokens", title: "Reorder Tokens" },
    { id: "blank", archetype: "fill_blank", title: "Fill Blank" },
    { id: "pb", archetype: "prompt_builder", title: "Prompt Builder" },
    { id: "cmp", archetype: "compare_before_after", title: "Compare Before/After" },
    { id: "time", archetype: "timeline", title: "Timeline" },
    { id: "branch", archetype: "scenario_branch", title: "Scenario Branch" },
    { id: "rub", archetype: "rubric_self_check", title: "Rubric Self Check" },
    { id: "hunt", archetype: "error_hunt", title: "Error Hunt" },
    { id: "trace", archetype: "code_trace", title: "Code Trace" },
    { id: "io", archetype: "io_transcript", title: "IO Transcript" },
    { id: "vid", archetype: "video_lesson", title: "Video Lesson" },
    { id: "dia", archetype: "diagram_callouts", title: "Diagram Callouts" },
    { id: "data", archetype: "dataset_explorer", title: "Dataset Explorer" },
    { id: "chart", archetype: "chart_explorer", title: "Chart Explorer" },
    { id: "vocab", archetype: "vocab_match", title: "Vocab Match" },
    { id: "sent", archetype: "sentence_builder", title: "Sentence Builder" },
    { id: "sr", archetype: "spaced_recall_queue", title: "Spaced Recall Queue" },
    { id: "quiz", archetype: "mini_quiz", title: "Mini Quiz" },
    { id: "msf", archetype: "multi_step_form", title: "Multi-Step Form" },
    { id: "insp", archetype: "inspector_panel", title: "Inspector Panel" },
    { id: "can", archetype: "canvas_hud", title: "Canvas HUD" },
    { id: "vph", archetype: "vectorpad_hud", title: "VectorPad HUD" },
    { id: "mh", archetype: "matrix_hud", title: "Matrix HUD" },
];

function demoSpec(archetype: string) {
    switch (archetype) {
        case "intro_stepper":
            return {
                archetype,
                specVersion: 1,
                title: "Intro Stepper (demo)",
                steps: [
                    { title: "What", bodyMarkdown: "This is a stepper archetype." },
                    { title: "Why", bodyMarkdown: "Use it for guided micro-lessons." },
                    { title: "Done", bodyMarkdown: "Nice." },
                ],
            };
        case "template_picker":
            return {
                archetype,
                specVersion: 1,
                title: "Template Picker (demo)",
                outputTitle: "Copyable prompt",
                templates: [
                    {
                        id: "email",
                        label: "Draft an email",
                        description: "Fast drafts with tone control.",
                        variables: [
                            { key: "to", label: "To", placeholder: "Hiring manager" },
                            { key: "goal", label: "Goal", placeholder: "Ask for a meeting" },
                        ],
                        template: "Write an email to {to}. Goal: {goal}. Keep it short.",
                    },
                    {
                        id: "explain",
                        label: "Explain",
                        variables: [{ key: "topic", label: "Topic", placeholder: "Dot product" }],
                        template: "Explain {topic} in 5 bullets, then 1 analogy.",
                    },
                ],
            };
        case "checklist":
            return {
                archetype,
                specVersion: 1,
                title: "Checklist (demo)",
                items: [
                    { id: "a", label: "Open the tool" },
                    { id: "b", label: "Try it once" },
                    { id: "c", label: "Confirm output" },
                ],
            };
        case "flashcards":
            return {
                archetype,
                specVersion: 1,
                title: "Flashcards (demo)",
                cards: [
                    { id: "1", frontMarkdown: "**AI**", backMarkdown: "Software that generates useful outputs." },
                    { id: "2", frontMarkdown: "**Prompt**", backMarkdown: "Your instruction: task + context + format." },
                ],
            };
        case "lab_runner":
            return {
                archetype,
                specVersion: 1,
                title: "Lab Runner (demo)",
                promptText: "Explain photosynthesis in 3 bullets. Ask 2 questions.",
                checklist: [
                    { id: "p", label: "Paste prompt" },
                    { id: "c", label: "Check format" },
                    { id: "r", label: "Refine once" },
                ],
                submitTitle: "Paste your output",
                submitPlaceholder: "Paste the response…",
            };
        case "classifier_gate":
            return {
                archetype,
                specVersion: 1,
                title: "Classifier Gate (demo)",
                prompt: "Assign each item to a bin.",
                bins: [
                    { id: "ok", label: "OK", tone: "good" },
                    { id: "redact", label: "Redact", tone: "warn" },
                    { id: "never", label: "Never", tone: "danger" },
                ],
                items: [
                    { id: "i1", label: "Math problem statement", correctBinId: "ok", explain: "No personal data." },
                    { id: "i2", label: "Customer email + order id", correctBinId: "redact", explain: "Remove identifiers." },
                    { id: "i3", label: "API key", correctBinId: "never", explain: "Never paste secrets." },
                ],
            };
        case "transform_toggle":
            return {
                archetype,
                specVersion: 1,
                title: "Transform Toggle (demo)",
                sampleInput: "Explain photosynthesis",
                transforms: [
                    { id: "bul", label: "Bullets", kind: "bullets" },
                    { id: "steps", label: "Steps", kind: "steps" },
                    { id: "short", label: "Shorten", kind: "shorten" },
                ],
            };
        case "reorder_tokens":
            return {
                archetype,
                specVersion: 1,
                title: "Reorder Tokens (demo)",
                goalMarkdown: "Put the sentence in the correct order.",
                tokens: ["I", "love", "linear", "algebra"],
                correct: ["I", "love", "linear", "algebra"],
            };
        case "fill_blank":
            return {
                archetype,
                specVersion: 1,
                title: "Fill Blank (demo)",
                promptMarkdown: "Fill these:",
                blanks: [
                    { id: "b1", label: "2 + 2 =", answer: "4" },
                    { id: "b2", label: "A prompt is:", answer: "instruction" },
                ],
            };
        case "prompt_builder":
            return {
                archetype,
                specVersion: 1,
                title: "Prompt Builder (demo)",
                defaults: { task: "Explain dot product", format: "5 bullets", constraints: "Keep it simple" },
            };
        case "compare_before_after":
            return {
                archetype,
                specVersion: 1,
                title: "Compare (demo)",
                beforeTitle: "Before",
                afterTitle: "After",
                beforeMarkdown: "Explain **AI**.",
                afterMarkdown: "Explain **AI** in 5 bullets, then 1 analogy.",
            };
        case "timeline":
            return {
                archetype,
                specVersion: 1,
                title: "Timeline (demo)",
                items: [
                    { id: "t1", date: "Day 1", title: "Learn basics", bodyMarkdown: "AI / Model / Prompt / ChatGPT." },
                    { id: "t2", date: "Day 2", title: "Practice workflow", bodyMarkdown: "Ask → Refine → Finalize." },
                ],
            };
        case "scenario_branch":
            return {
                archetype,
                specVersion: 1,
                title: "Scenario Branch (demo)",
                startId: "n1",
                nodes: [
                    {
                        id: "n1",
                        title: "You need help",
                        bodyMarkdown: "What do you do?",
                        options: [
                            { id: "o1", label: "Give context", nextId: "n2", feedback: "Better results." },
                            { id: "o2", label: "Be vague", nextId: "n3", feedback: "More randomness." },
                        ],
                    },
                    {
                        id: "n2",
                        title: "Nice",
                        bodyMarkdown: "Now ask for format.",
                        options: [{ id: "o3", label: "Finish", nextId: "n1" }],
                    },
                    {
                        id: "n3",
                        title: "Meh",
                        bodyMarkdown: "Try refining.",
                        options: [{ id: "o4", label: "Back", nextId: "n1" }],
                    },
                ],
            };
        case "rubric_self_check":
            return {
                archetype,
                specVersion: 1,
                title: "Rubric (demo)",
                criteria: [
                    { id: "c1", label: "Clarity", hint: "Is it understandable?" },
                    { id: "c2", label: "Correctness", hint: "Is it accurate?" },
                ],
                scale: 5,
            };
        case "error_hunt":
            return {
                archetype,
                specVersion: 1,
                title: "Error Hunt (demo)",
                code: "print('Hello'\nname = input('Name: ')\n",
                items: [
                    { id: "e1", label: "Missing closing parenthesis", fixMarkdown: "Fix: `print('Hello')`" },
                    { id: "e2", label: "Trailing newline ok", fixMarkdown: "Optional cleanup." },
                ],
            };
        case "code_trace":
            return {
                archetype,
                specVersion: 1,
                title: "Code Trace (demo)",
                steps: [
                    { title: "Start", vars: { i: 0, sum: 0 }, noteMarkdown: "Initialize." },
                    { title: "Loop", vars: { i: 1, sum: 1 }, noteMarkdown: "Add i." },
                ],
            };
        case "io_transcript":
            return {
                archetype,
                specVersion: 1,
                title: "IO Transcript (demo)",
                lines: [
                    { kind: "prompt", text: "Enter name:" },
                    { kind: "input", text: "Mads" },
                    { kind: "output", text: "Hello, Mads!" },
                ],
            };
        case "video_lesson":
            return {
                archetype,
                specVersion: 1,
                title: "Video Lesson (demo)",
                embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
                checkpoints: [
                    { id: "k1", label: "Watched intro" },
                    { id: "k2", label: "Paused and summarized" },
                ],
            };
        case "diagram_callouts":
            return {
                archetype,
                specVersion: 1,
                title: "Diagram Callouts (demo)",
                callouts: [
                    { id: "a", label: "Block A", bodyMarkdown: "This is **A**." },
                    { id: "b", label: "Block B", bodyMarkdown: "This is **B**." },
                ],
            };
        case "dataset_explorer":
            return {
                archetype,
                specVersion: 1,
                title: "Dataset Explorer (demo)",
                columns: ["name", "score"],
                rows: [
                    { name: "Ada", score: 98 },
                    { name: "Linus", score: 88 },
                    { name: "Grace", score: 95 },
                ],
            };
        case "chart_explorer":
            return {
                archetype,
                specVersion: 1,
                title: "Chart Explorer (demo)",
                points: [
                    { label: "A", value: 10 },
                    { label: "B", value: 16 },
                    { label: "C", value: 7 },
                    { label: "D", value: 20 },
                ],
            };
        case "vocab_match":
            return {
                archetype,
                specVersion: 1,
                title: "Vocab Match (demo)",
                pairs: [
                    { id: "p1", term: "Prompt", definition: "Instruction to the model" },
                    { id: "p2", term: "Model", definition: "Engine that generates outputs" },
                ],
            };
        case "sentence_builder":
            return {
                archetype,
                specVersion: 1,
                title: "Sentence Builder (demo)",
                tokens: ["I", "like", "math"],
                target: "I like math",
            };
        case "spaced_recall_queue":
            return {
                archetype,
                specVersion: 1,
                title: "Spaced Recall (demo)",
                items: [
                    { id: "s1", prompt: "Define prompt", answerMarkdown: "A **prompt** is your instruction." },
                    { id: "s2", prompt: "Define model", answerMarkdown: "A **model** generates outputs." },
                ],
            };
        case "mini_quiz":
            return {
                archetype,
                specVersion: 1,
                title: "Mini Quiz (demo)",
                questions: [
                    { id: "q1", prompt: "A prompt is:", choices: ["A password", "An instruction"], correctIndex: 1, explainMarkdown: "Prompt = instruction." },
                ],
            };
        case "multi_step_form":
            return {
                archetype,
                specVersion: 1,
                title: "Multi-step Form (demo)",
                steps: [
                    { id: "s1", title: "Step 1", fields: [{ key: "goal", label: "Goal", placeholder: "Learn prompts" }] },
                    { id: "s2", title: "Step 2", fields: [{ key: "format", label: "Format", placeholder: "Bullets" }] },
                ],
            };
        case "inspector_panel":
            return { archetype, specVersion: 1, title: "Inspector Panel (demo)" };
        case "canvas_hud":
            return { archetype, specVersion: 1, title: "Canvas HUD (demo)" };
        case "vectorpad_hud":
            return { archetype, specVersion: 1, title: "VectorPad HUD (demo)" };
        case "matrix_hud":
            return { archetype, specVersion: 1, title: "Matrix HUD (demo)" };
        default:
            return { archetype, specVersion: 1, title: archetype };
    }
}

export default function ArchetypeGalleryClient() {
    const [q, setQ] = useState("");
    const [active, setActive] = useState<Item>(ITEMS[0]);
    const [state, setState] = useState<SavedSketchState>({
        version: 1,
        updatedAt: new Date().toISOString(),
        data: {},
    });

    const list = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return ITEMS;
        return ITEMS.filter((x) => (x.title + " " + x.archetype).toLowerCase().includes(s));
    }, [q]);

    useMemo(() => {
        // reset state when switching
        setState({ version: 1, updatedAt: new Date().toISOString(), data: {} });
    }, [active.id]);

    const spec = demoSpec(active.archetype);

    return (
        <div className="min-h-screen bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_55%,#f6f7ff_100%)] dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)]">
            <div className="ui-container py-6 grid gap-4 md:grid-cols-[320px_1fr]">
                <aside className="ui-card p-4 h-fit md:sticky md:top-4">
                    <div className="text-lg font-black text-neutral-900 dark:text-white">Archetype Gallery</div>
                    <div className="mt-1 text-sm text-neutral-600 dark:text-white/60">Pick a pattern → reuse its spec anywhere.</div>

                    <input
                        className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04]"
                        placeholder="Search…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />

                    <div className="mt-3 grid gap-2">
                        {list.map((x) => {
                            const is = x.id === active.id;
                            return (
                                <button
                                    key={x.id}
                                    onClick={() => setActive(x)}
                                    className={cn(
                                        "w-full text-left rounded-xl border px-3 py-2 transition",
                                        is
                                            ? "border-emerald-600/25 bg-emerald-500/10 dark:border-emerald-300/30 dark:bg-emerald-300/10"
                                            : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                                    )}
                                >
                                    <div className="text-sm font-extrabold text-neutral-900 dark:text-white">{x.title}</div>
                                    <div className="mt-1 text-xs text-neutral-600 dark:text-white/55 font-mono">{x.archetype}</div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <main>
                    <SketchShell
                        title={(spec as any).title ?? active.title}
                        subtitle={`archetype: ${(spec as any).archetype}`}
                        left={<SketchRenderer spec={spec as any} value={state} onChange={setState} />}
                        rightMarkdown={"**Tip:** copy the spec shape into any module registry entry."}
                    />
                </main>
            </div>
        </div>
    );
}