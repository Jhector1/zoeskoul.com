export type SavedSketchState = {
    version?: number;
    updatedAt?: string;
    data: unknown; // archetype-owned
};

export type SketchTone = "neutral" | "good" | "info" | "warn" | "danger";
// import {SavedSketchState} from "";

export type CommonProps<S extends { archetype: string; specVersion?: number }> = {
    spec: S;
    value: SavedSketchState;
    onChange: (next: SavedSketchState) => void;
    readOnly?: boolean;
};