import type { SketchEntry } from "../subjects/registryTypes";
import ComingSoonSketch from "./ComingSoonSketch";

export const ARCHETYPE_GALLERY_SKETCHES: Record<string, SketchEntry> = {
    // ✅ these are the archetypes you already use in AI_MOD0
    "demo.intro_stepper": {
        kind: "archetype",
        spec: {
            archetype: "intro_stepper",
            specVersion: 1,
            title: "Intro Stepper (demo)",
            hudMarkdown: `**Use when:** you want a short guided sequence.\n\nTap **Next**.`,
            steps: [
                { title: "Step 1", bodyMarkdown: "A short concept explanation." },
                { title: "Step 2", bodyMarkdown: "A concrete example." },
                { title: "Step 3", bodyMarkdown: "A tiny check question." },
            ],
        },
    },

    "demo.checklist": {
        kind: "archetype",
        spec: {
            archetype: "checklist",
            specVersion: 1,
            title: "Checklist (demo)",
            hudMarkdown: "Check items as you do them.",
            items: [
                { id: "a", label: "Open the tool" },
                { id: "b", label: "Try the action once" },
                { id: "c", label: "Confirm the output" },
            ],
        },
    },

    "demo.template_picker": {
        kind: "archetype",
        spec: {
            archetype: "template_picker",
            specVersion: 1,
            title: "Template Picker (demo)",
            outputTitle: "Copyable prompt",
            templates: [
                {
                    id: "email",
                    label: "Draft an email",
                    description: "Tone + length control.",
                    variables: [
                        { key: "to", label: "To", placeholder: "Hiring manager" },
                        { key: "goal", label: "Goal", placeholder: "Request a short meeting" },
                        { key: "tone", label: "Tone", placeholder: "friendly + concise" },
                    ],
                    template:
                        `Write an email to {to}.
Goal: {goal}
Tone: {tone}
Under 120 words.`,
                },
                {
                    id: "explain",
                    label: "Explain something",
                    variables: [
                        { key: "topic", label: "Topic", placeholder: "Vector dot product" },
                        { key: "level", label: "Level", placeholder: "absolute beginner" },
                    ],
                    template:
                        `Explain {topic} to a {level}.
Use 5 bullets, then 1 analogy.`,
                },
            ],
        },
    },

    "demo.pipeline_builder": {
        kind: "archetype",
        spec: {
            archetype: "pipeline_builder",
            specVersion: 1,
            title: "Pipeline Builder (demo)",
            help: "Drag to reorder.",
            steps: [
                { id: "ask", label: "Ask", body: "Say what you want." },
                { id: "refine", label: "Refine", body: "Add constraints + examples." },
                { id: "finalize", label: "Finalize", body: "Request final + verify." },
            ],
        },
    },

    "demo.transform_toggle": {
        kind: "archetype",
        spec: {
            archetype: "transform_toggle",
            specVersion: 1,
            title: "Transform Toggle (demo)",
            sampleInput: "Explain photosynthesis",
            transforms: [
                { id: "bul", label: "Bullets", kind: "bullets", description: "Bullets format." },
                { id: "steps", label: "Steps", kind: "steps", description: "Step-by-step." },
                { id: "short", label: "Shorten", kind: "shorten", description: "Tight output." },
                { id: "table", label: "2-col table", kind: "table_2col", description: "Table layout." },
            ],
            hudMarkdown: "Toggle formats to learn prompt control.",
        },
    },

    "demo.classifier_gate": {
        kind: "archetype",
        spec: {
            archetype: "classifier_gate",
            specVersion: 1,
            title: "Classifier Gate (demo)",
            prompt: "Drag each item into the right bin:",
            bins: [
                { id: "ok", label: "OK", tone: "good" },
                { id: "redact", label: "Redact", tone: "warn" },
                { id: "never", label: "Never", tone: "danger" },
            ],
            items: [
                { id: "i1", label: "Math homework question", correctBinId: "ok", explain: "No private data." },
                { id: "i2", label: "Customer email + order id", correctBinId: "redact", explain: "Remove identifiers." },
                { id: "i3", label: "API key", correctBinId: "never", explain: "Secrets must never be pasted." },
            ],
            hudMarkdown: "Great for safety, policies, or categorization.",
        },
    },

    "demo.ui_path_guide": {
        kind: "archetype",
        spec: {
            archetype: "ui_path_guide",
            specVersion: 1,
            title: "UI Path Guide (demo)",
            goal: "Find a setting in the UI",
            steps: [
                { id: "s1", label: "Open Settings" },
                { id: "s2", label: "Navigate to Privacy" },
                { id: "s3", label: "Toggle the option" },
            ],
            hudMarkdown: "Use for UI labs and “do this in the app” lessons.",
        },
    },

    "demo.lab_runner": {
        kind: "archetype",
        spec: {
            archetype: "lab_runner",
            specVersion: 1,
            title: "Lab Runner (demo)",
            promptText: "Explain X in 3 bullets and ask me 2 questions.",
            checklist: [
                { id: "p", label: "Paste prompt" },
                { id: "c", label: "Check format" },
                { id: "r", label: "Refine once" },
            ],
            submitTitle: "Paste output here",
            submitPlaceholder: "Paste the AI output…",
            hudMarkdown: "Use when learners must *do* something and submit.",
        },
    },

    // -------------------------
    // 🚧 placeholders (you listed these, but you may not have renderers yet)
    // -------------------------
    "demo.flashcards": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.reorder_tokens": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.fill_blank": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.prompt_builder": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.compare_before_after": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.timeline": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.scenario_branch": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.rubric_self_check": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.error_hunt": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.code_trace": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.io_transcript": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.video_lesson": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.diagram_callouts": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.dataset_explorer": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.chart_explorer": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.vocab_match": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.sentence_builder": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.spaced_recall_queue": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.mini_quiz": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.multi_step_form": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.inspector_panel": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.canvas_hud": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.vectorpad_hud": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
    "demo.matrix_hud": {
        kind: "custom",
        Component: ComingSoonSketch as any,
        defaultState: undefined,
    },
};
