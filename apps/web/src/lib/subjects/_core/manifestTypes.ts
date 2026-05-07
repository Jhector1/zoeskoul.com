import type {
    ExerciseKind,
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
    ManifestProjectStep,
    ManifestRecipe,
    ManifestRuntimeDefaults,
    ManifestSingleChoice,
    ManifestSqlRuntimeDefaults,
    ManifestVarSpec,
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
    ManifestProjectStep,
    ManifestRecipe,
    ManifestRuntimeDefaults,
    ManifestSingleChoice,
    ManifestSqlRuntimeDefaults,
    ManifestVarSpec,
    SqlDialect,
    WorkspaceLanguage,
};

export type ManifestStarterFile = {
    path: string;
    content: string;
    entry?: boolean;
};

export type ManifestStarterFiles = ManifestStarterFile[];

export type ManifestWorkspaceSeed = {
    language?: WorkspaceLanguage;
    activeFileId?: string;
    entryFileId?: string;
    entryFile?: string;
    entryFilePath?: string;
    mainFile?: string;
    mainFilePath?: string;
    openTabs?: string[];
    stdin?: string;
    starterFiles?: ManifestStarterFiles;
};

/**
 * App-side sketch extension.
 *
 * The shared contract should contain the portable fields.
 * This type keeps the app tolerant of older/local sketch shapes.
 */
export type ManifestSketch =
    | {
    id: string;
    archetype: "paragraph";
    titleKey: string;
    bodyKey: string;
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
 * This preserves compatibility with local app fields while still relying on
 * the shared contract for the base portable shape.
 */
export type AppManifestCodeInput = SharedManifestCodeInput & {
    workspace?: ManifestWorkspaceSeed | null;
    starterFiles?: ManifestStarterFiles;
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
 */
export type AppManifestExercise =
    | ManifestSingleChoice
    | ManifestMultiChoice
    | ManifestDragReorder
    | ManifestFillBlankChoice
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
export type ManifestExercise = SharedManifestExercise | AppManifestExercise;
