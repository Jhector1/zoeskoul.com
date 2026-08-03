
// src/components/review/sketches/registryTypes.ts
import type React from "react";
import type { SavedSketchState } from "./types";

export type CustomSketchProps = {
    value: SavedSketchState | null;
    onChange: (next: SavedSketchState) => void;
    readOnly?: boolean;
    height?: number;
    title?: string;

    // ✅ allow ReviewCard.props to configure custom sketches too
    props?: Record<string, unknown>;
};

export type SketchEntry =
    | {
    kind: "archetype";
    spec: any; // SketchSpec
    defaultState?: SavedSketchState;
}
    | {
    kind: "custom";
    Component: React.ComponentType<CustomSketchProps>;
    defaultState?: SavedSketchState;
};


// import type React from "react";
// import type { SketchSpec } from "./specTypes";
// import type { SavedSketchState } from "./types";
//
// export type SketchEntryArchetype = {
//     kind: "archetype";
//     spec: SketchSpec;
//     defaultState?: SavedSketchState;
// };
//
// export type SketchEntryCustom = {
//     kind: "custom";
//     Component: React.ComponentType<{
//         spec: SketchSpec | null;
//         value: SavedSketchState | null;
//         onChange: (s: SavedSketchState) => void;
//         readOnly?: boolean;
//         height?: number;
//         title?: string;
//     }>;
//     defaultState?: SavedSketchState;
// };
//
// export type SketchEntry = SketchEntryArchetype | SketchEntryCustom;
