export type TryItPlacement = "first_sketch" | "all_sketches" | "none";

export type PracticeConfig = {
    tryIt?: boolean;
    tryItPlacement?: TryItPlacement;
    tryItSketchIndex?: number;
    tryItExerciseId?: string;
    tryItExerciseIds?: string[];
    projectFlow?: "standalone" | "progressive";
};
