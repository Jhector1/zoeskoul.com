// src/components/review/sketches/specTypes.ts
import type { SketchTone } from "./types";

import {CodeLanguage} from "@/lib/practice/types";

export type ArchetypeId =
    | "intro_stepper"
    | "checklist"
    | "template_picker"
    | "transform_toggle"
    | "lab_runner"
    | "flashcards"
    | "reorder_tokens"
    | "classifier_gate"
    | "example_gallery"
    | "compare_table"
    | "pipeline_builder"
    | "glossary"
    | "ui_path_guide"
    | "code_runner"
    // keep these because you already render them
    | "paragraph"|"video_lesson"
    // NEW
    | "image"
    // backward-compat (you currently have this in CodeSketchSpec)
    | "code_sketch";

export type SketchSpecBase = {
    archetype: ArchetypeId;
    specVersion: number;

    title?: string;
    subtitle?: string;

    /** optional right panel notes */
    hudMarkdown?: string;

    tone?: SketchTone;
};

/** =========================
 * Code Runner / Code Sketch
 * ========================= */
export type CodeSketchSpec = SketchSpecBase & {
    archetype: "code_runner" | "code_sketch"; // support both
    starterCode: string;
    language: CodeLanguage;
    hint: string;
    instructionsMarkdown?: string;
};

/** =========================
 * Paragraph
 * ========================= */
export type ParagraphSpec = SketchSpecBase & {
    archetype: "paragraph";
    bodyMarkdown: string;
};

/** =========================
 * Image
 * ========================= */
export type ImageMarkerSpec = {
    id: string;
    /** normalized (0..1) */
    x: number;
    y: number;
    label?: string;
    dotClassName?: string;
};

export type ImageSketchSpec = SketchSpecBase & {
    archetype: "image";

    src: string;
    alt: string;

    /** Provide either width/height OR aspectRatio */
    width?: number;
    height?: number;
    aspectRatio?: number;

    /** markdown caption shown under image (optional) */
    captionMarkdown?: string;

    markers?: ImageMarkerSpec[];

    initialZoom?: number;
    minZoom?: number;
    maxZoom?: number;
    zoomStep?: number;

    allowPan?: boolean;
    allowWheelZoom?: boolean;
    allowDoubleClickReset?: boolean;
    showControls?: boolean;

    className?: string;

    /**
     * If true, the sketch can store the last zoom/pos in SavedSketchState.
     * (Spec stays serializable; state is where runtime data belongs.)
     */
    rememberTransform?: boolean;
};

export type IntroStepperSpec = SketchSpecBase & {
    archetype: "intro_stepper";
    steps: Array<{ title: string; bodyMarkdown: string }>;
    ctaLabel?: string;
};

export type ChecklistSpec = SketchSpecBase & {
    archetype: "checklist";
    items: Array<{ id: string; label: string; hint?: string }>;
};

export type TemplatePickerSpec = SketchSpecBase & {
    archetype: "template_picker";
    templates: Array<{
        id: string;
        label: string;
        description?: string;
        variables: Array<{ key: string; label: string; placeholder?: string }>;
        template: string; // supports {varKey}
    }>;
    outputTitle?: string;
};

export type TransformToggleSpec = SketchSpecBase & {
    archetype: "transform_toggle";
    inputLabel?: string;
    sampleInput?: string;
    transforms: Array<{
        id: string;
        label: string;
        description?: string;
        kind: "bullets" | "steps" | "shorten" | "expand" | "summarize" | "table_2col";
    }>;
};

export type LabRunnerSpec = SketchSpecBase & {
    archetype: "lab_runner";
    promptTitle?: string;
    promptText: string;
    checklist?: Array<{ id: string; label: string }>;
    submitTitle?: string;
    submitPlaceholder?: string;
};

export type FlashcardsSpec = SketchSpecBase & {
    archetype: "flashcards";
    cards: Array<{ id: string; front: string; back: string }>;
    shuffle?: boolean;
};

export type ReorderTokensSpec = SketchSpecBase & {
    archetype: "reorder_tokens";
    tokens: Array<{ id: string; label: string }>;
    help?: string;
};

export type ClassifierGateSpec = SketchSpecBase & {
    archetype: "classifier_gate";
    prompt: string;
    bins: Array<{ id: string; label: string; tone?: SketchTone }>;
    items: Array<{ id: string; label: string; correctBinId: string; explain?: string }>;
};

export type ExampleGallerySpec = SketchSpecBase & {
    archetype: "example_gallery";
    examples: Array<{ id: string; label: string; bodyMarkdown: string; notesMarkdown?: string }>;
};

export type CompareTableSpec = SketchSpecBase & {
    archetype: "compare_table";
    columns: string[];
    rows: Array<{ id: string; cells: string[] }>;
};

export type PipelineBuilderSpec = SketchSpecBase & {
    archetype: "pipeline_builder";
    steps: Array<{ id: string; label: string; body?: string }>;
    help?: string;
};

export type GlossarySpec = SketchSpecBase & {
    archetype: "glossary";
    terms: Array<{ id: string; term: string; definitionMarkdown: string; tags?: string[] }>;
};

export type UIPathGuideSpec = SketchSpecBase & {
    archetype: "ui_path_guide";
    goal: string;
    steps: Array<{ id: string; label: string; detail?: string }>;
};

export type SketchSpec =
    | IntroStepperSpec
    | ChecklistSpec
    | TemplatePickerSpec
    | TransformToggleSpec
    | LabRunnerSpec
    | FlashcardsSpec
    | ReorderTokensSpec
    | ClassifierGateSpec
    | ExampleGallerySpec
    | CompareTableSpec
    | PipelineBuilderSpec
    | GlossarySpec
    | UIPathGuideSpec
    | CodeSketchSpec
    | ParagraphSpec
    | ImageSketchSpec;
