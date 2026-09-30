import type {
    ExerciseKind,
    LanguageAudioSpec,
    ManifestBaseExercise,
    ManifestCard,
    ManifestCodeInput as SharedManifestCodeInput,
    ManifestCodeInputExpectedExample,
    ManifestCodeRuntimeDefaults,
    ManifestComputedSpec,
    ManifestDragReorder,
    ManifestExercise as SharedManifestExercise,
    ManifestFillBlankChoice,
    ManifestMultiChoice,
    ManifestPseudocodeInput,
    ManifestProjectStep,
    ManifestRecipe,
    ManifestRuntimeDefaults,
    ManifestSingleChoice,
    ManifestSqlRuntimeDefaults,
    ManifestStarterFile,
    ManifestStarterFiles,
    ManifestVarSpec,
    ManifestWorkspaceSeed,
    SqlDialect,
    TopicBundleManifest as SharedTopicBundleManifest,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";

export type {
    ExerciseKind,
    ManifestBaseExercise,
    ManifestCard,
    ManifestCodeInputExpectedExample,
    ManifestCodeRuntimeDefaults,
    ManifestComputedSpec,
    ManifestDragReorder,
    ManifestFillBlankChoice,
    ManifestMultiChoice,
    ManifestPseudocodeInput,
    ManifestProjectStep,
    ManifestRecipe,
    ManifestRuntimeDefaults,
    ManifestSingleChoice,
    ManifestSqlRuntimeDefaults,
    ManifestStarterFile,
    ManifestStarterFiles,
    ManifestVarSpec,
    ManifestWorkspaceSeed,
    SqlDialect,
    WorkspaceLanguage,
};

/**
 * App-side sketch extension.
 *
 * The shared contract contains the portable fields.
 * This type keeps the app tolerant of older/local sketch shapes.
 */
export type ManifestSketch =
    | {
    id: string;
    archetype: "paragraph";
    titleKey: string;
    bodyKey: string;
    audio?: LanguageAudioSpec;
    runtime?: ManifestRuntimeDefaults | null;
    workspace?: ManifestWorkspaceSeed | null;
    images?: Array<{
        id: string;
        publicId: string;
        alt?: string;
        width?: number;
        height?: number;
    }>;
}
    | {
    id: string;
    archetype: "algorithm_animation";
    titleKey: string;
    contextKey?: string;
    runtime?: ManifestRuntimeDefaults | null;
    workspace?: ManifestWorkspaceSeed | null;
    intervalMs?: number;
    autoPlay?: boolean;
    showControls?: boolean;
    showStepCounter?: boolean;
    canvasHeight?: number;
    steps: Array<{
        id: string;
        titleKey: string;
        bodyKey?: string;
        formula?: string;
        code?: string;
        nodes: Array<{
            id: string;
            label: string;
            detail?: string;
            x: number;
            y: number;
            width?: number;
            shape?: "box" | "circle" | "pill";
            tone?: "neutral" | "good" | "info" | "warn" | "danger";
            active?: boolean;
            dimmed?: boolean;
        }>;
        edges?: Array<{
            from: string;
            to: string;
            label?: string;
            tone?: "neutral" | "good" | "info" | "warn" | "danger";
            active?: boolean;
            dashed?: boolean;
        }>;
    }>;
}
    | {
    id: string;
    archetype: "image";
    titleKey: string;
    src?: string;
    publicId?: string;
    altKey?: string;
    captionKey?: string;
    runtime?: ManifestRuntimeDefaults | null;
    workspace?: ManifestWorkspaceSeed | null;
    aspectRatio?: number;
    markers?: Array<{
        id: string;
        x: number;
        y: number;
        labelKey: string;
    }>;
    initialZoom?: number;
    minZoom?: number;
    maxZoom?: number;
    zoomStep?: number;
    allowPan?: boolean;
    allowWheelZoom?: boolean;
    allowDoubleClickReset?: boolean;
    showControls?: boolean;
};

/**
 * App-side code input extension.
 *
 * The portable manifest shape comes from @zoeskoul/curriculum-contracts.
 * This app type only adds legacy/app-only convenience fields.
 */
export type AppManifestCodeInput = SharedManifestCodeInput & {
    workspace?: ManifestWorkspaceSeed | null;
    starterFiles?: ManifestStarterFiles;

    /**
     * App-only compatibility fields.
     */
    initialStdin?: string;
    stdin?: string;
    starterStdin?: string;
    entryFile?: string;
    entryFilePath?: string;
    mainFile?: string;
    mainFilePath?: string;
};

/**
 * App-side exercise union.
 *
 * Keep every portable non-code exercise kind owned by
 * @zoeskoul/curriculum-contracts so new manifest kinds cannot silently drift
 * out of the learner runtime. Replace only the shared code_input branch with
 * the app-enriched compatibility shape below.
 */
type SharedNonCodeManifestExercise = Exclude<
    SharedManifestExercise,
    { kind: "code_input" }
>;

export type AppManifestExercise =
    | SharedNonCodeManifestExercise
    | AppManifestCodeInput;

/**
 * App-side topic bundle.
 *
 * This keeps the shared bundle shape, but allows the app’s enriched sketch
 * and exercise shapes.
 */
export type TopicBundleManifest = Omit<
    SharedTopicBundleManifest,
    "sketches" | "exercises"
> & {
    sketches: ManifestSketch[];
    exercises: AppManifestExercise[];
};

export type ManifestCodeInput = AppManifestCodeInput;

/**
 * Important:
 * Do not union SharedManifestExercise directly back in here.
 *
 * AppManifestExercise intentionally inherits all shared non-code exercise
 * shapes through SharedNonCodeManifestExercise and replaces only code_input
 * with the enriched app compatibility shape. Directly adding
 * SharedManifestExercise would reintroduce the less-specific shared code_input
 * branch and can cause type narrowing issues.
 */
export type ManifestExercise = AppManifestExercise;

/**
 * Kept only as an escape hatch for files that explicitly need the raw shared
 * exercise union.
 */
export type SharedPortableManifestExercise = SharedManifestExercise;