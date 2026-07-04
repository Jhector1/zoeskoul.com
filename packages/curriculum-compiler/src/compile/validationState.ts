export type CompileValidationSkipOptions = {
    skipQualityGates?: boolean;
    skipSemantic?: boolean;
    skipGolden?: boolean;
    unsafeSkipValidation?: boolean;
};

export type CompileValidationLayerState = {
    ran: boolean;
    skipped: boolean;
    required: boolean;
    reason?: string;
};

export type CompileValidationState = {
    unsafeSkipValidation: boolean;
    requested: Required<CompileValidationSkipOptions>;
    structural: CompileValidationLayerState;
    qualityGates: CompileValidationLayerState;
    semantic: CompileValidationLayerState;
    golden: CompileValidationLayerState;
};

const DEFAULT_REQUEST: Required<CompileValidationSkipOptions> = {
    skipQualityGates: false,
    skipSemantic: false,
    skipGolden: false,
    unsafeSkipValidation: false,
};

function normalizeRequest(
    request?: CompileValidationSkipOptions,
): Required<CompileValidationSkipOptions> {
    const unsafeSkipValidation = Boolean(request?.unsafeSkipValidation);

    return {
        skipQualityGates: unsafeSkipValidation || Boolean(request?.skipQualityGates),
        skipSemantic: unsafeSkipValidation || Boolean(request?.skipSemantic),
        skipGolden: unsafeSkipValidation || Boolean(request?.skipGolden),
        unsafeSkipValidation,
    };
}

function skippedLayer(reason: string): CompileValidationLayerState {
    return {
        ran: false,
        skipped: true,
        required: false,
        reason,
    };
}

function enforcedLayer(): CompileValidationLayerState {
    return {
        ran: true,
        skipped: false,
        required: true,
    };
}

export function resolveCompileValidationState(
    request?: CompileValidationSkipOptions,
): CompileValidationState {
    const requested = request ? normalizeRequest(request) : DEFAULT_REQUEST;
    const unsafeReason = "implied by --unsafe-skip-validation";

    return {
        unsafeSkipValidation: requested.unsafeSkipValidation,
        requested,
        structural: enforcedLayer(),
        qualityGates: requested.skipQualityGates
            ? skippedLayer(requested.unsafeSkipValidation ? unsafeReason : "requested by --skip-quality-gates")
            : enforcedLayer(),
        semantic: requested.skipSemantic
            ? skippedLayer(requested.unsafeSkipValidation ? unsafeReason : "requested by --skip-semantic")
            : enforcedLayer(),
        golden: requested.skipGolden
            ? skippedLayer(requested.unsafeSkipValidation ? unsafeReason : "requested by --skip-golden")
            : enforcedLayer(),
    };
}

export function hasValidationBypass(request?: CompileValidationSkipOptions): boolean {
    const requested = normalizeRequest(request);
    return (
        requested.skipQualityGates ||
        requested.skipSemantic ||
        requested.skipGolden ||
        requested.unsafeSkipValidation
    );
}

export function formatValidationBypassFlags(
    request?: CompileValidationSkipOptions,
): string {
    const requested = normalizeRequest(request);
    const flags: string[] = [];

    if (requested.unsafeSkipValidation) flags.push("--unsafe-skip-validation");
    if (requested.skipQualityGates && !requested.unsafeSkipValidation) flags.push("--skip-quality-gates");
    if (requested.skipSemantic && !requested.unsafeSkipValidation) flags.push("--skip-semantic");
    if (requested.skipGolden && !requested.unsafeSkipValidation) flags.push("--skip-golden");

    return flags.join(", ");
}

export function assertValidationBypassAllowed(args: {
    validation?: CompileValidationSkipOptions;
    draftOnly?: boolean;
    publishToLive?: boolean;
    publish?: boolean;
}) {
    if (!hasValidationBypass(args.validation)) return;

    const flags = formatValidationBypassFlags(args.validation);

    if (!args.draftOnly) {
        throw new Error(
            `Validation bypass flags require --draft-only. Refusing to compile non-draft output with ${flags}.`,
        );
    }

    if (args.publish !== false && args.publishToLive) {
        throw new Error(
            `Validation bypass flags are not allowed for publish flows. Use --draft-only before ${flags}.`,
        );
    }
}

export function buildUnsafeValidationWarning(
    state: CompileValidationState,
): string | undefined {
    if (!state.unsafeSkipValidation) return undefined;

    return [
        "⚠️  UNSAFE VALIDATION BYPASS ENABLED",
        "Structural authoring/spec validation still runs, but quality gates, semantic validation, and golden validation are skipped for this draft compile.",
        "Do not publish artifacts generated with --unsafe-skip-validation.",
    ].join("\n");
}
