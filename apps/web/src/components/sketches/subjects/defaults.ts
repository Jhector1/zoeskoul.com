import type { SavedSketchState } from "./types";
import type { SketchSpec } from "./specTypes";

export function defaultStateForSpec(spec: SketchSpec): SavedSketchState {
    const now = new Date().toISOString();

    switch (spec.archetype) {
        case "intro_stepper":
            return { version: spec.specVersion, updatedAt: now, data: { step: 0 } };

        case "checklist":
        case "lab_runner":
        case "ui_path_guide":
            return { version: spec.specVersion, updatedAt: now, data: { checked: {} as Record<string, boolean> } };

        case "template_picker":
            return { version: spec.specVersion, updatedAt: now, data: { templateId: spec.templates[0]?.id ?? "", vars: {} } };

        case "transform_toggle":
            return { version: spec.specVersion, updatedAt: now, data: { input: spec.sampleInput ?? "", enabled: {} } };

        case "flashcards":
            return { version: spec.specVersion, updatedAt: now, data: { i: 0, flipped: false, order: spec.cards.map(c => c.id) } };

        case "reorder_tokens":
        case "pipeline_builder":
            return { version: spec.specVersion, updatedAt: now, data: { order: (spec as any).tokens ? (spec as any).tokens.map((t:any)=>t.id) : (spec as any).steps.map((s:any)=>s.id) } };

        case "classifier_gate":
            return { version: spec.specVersion, updatedAt: now, data: { placed: {} as Record<string, string> } };

        case "example_gallery":
            return { version: spec.specVersion, updatedAt: now, data: { selectedId: spec.examples[0]?.id ?? "" } };

        case "compare_table":
            return { version: spec.specVersion, updatedAt: now, data: {} };

        case "glossary":
            return { version: spec.specVersion, updatedAt: now, data: { q: "", open: {} as Record<string, boolean> } };

        default:
            return { version: spec.specVersion, updatedAt: now, data: {} };
    }
}
