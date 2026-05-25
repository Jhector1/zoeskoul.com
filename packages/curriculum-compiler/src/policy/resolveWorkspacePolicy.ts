import { WORKSPACE_PROFILES } from "@zoeskoul/curriculum-profiles";
import type {
    CourseBlueprint,
    WorkspaceProfile,
    ModulePedagogyPolicy,
    TopicPedagogyPolicy,
} from "@zoeskoul/curriculum-contracts";

export type ResolvedWorkspacePolicy = {
    workspace: WorkspaceProfile;
    workspacePolicyId?: string;
    modulePolicy?: ModulePedagogyPolicy;
    topicPolicy?: TopicPedagogyPolicy;
    preferredActionLanguage: string[];
    forbiddenActionLanguage: string[];
    preferredTerms: Record<string, string>;
    avoidTerms: string[];
    notes: string[];
};
function deepMergeWorkspace<T>(base: T, override?: Partial<T>): T {
    if (!override) return structuredClone(base);

    const out: any = structuredClone(base);

    for (const [key, value] of Object.entries(override as any)) {
        if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            out[key] &&
            typeof out[key] === "object" &&
            !Array.isArray(out[key])
        ) {
            out[key] = deepMergeWorkspace(out[key], value);
        } else if (value !== undefined) {
            out[key] = value;
        }
    }

    return out;
}
export function resolveWorkspacePolicy(args: {
    blueprint: CourseBlueprint;
    moduleNumber?: number;
    topicId?: string;
}): ResolvedWorkspacePolicy {
    const modulePolicy = args.blueprint.modulePolicies?.find(
        (policy) => policy.moduleNumber === args.moduleNumber,
    );
    const baseProfileId =
        modulePolicy?.workspaceProfileId ??
        args.blueprint.workspaceProfileId ??
        "browser-code-runner";
    const base = WORKSPACE_PROFILES[baseProfileId];
    const blueprintWorkspace = deepMergeWorkspace(base, args.blueprint.workspaceOverrides);
    const workspace = deepMergeWorkspace(
        blueprintWorkspace,
        modulePolicy?.workspaceOverrides,
    );

    const topicPolicy =
        args.topicId && args.blueprint.topicPolicies
            ? args.blueprint.topicPolicies[args.topicId]
            : undefined;

    const topicWorkspace = topicPolicy?.workspaceOverrides
        ? deepMergeWorkspace(workspace, topicPolicy.workspaceOverrides)
        : workspace;

    return {
        workspace: topicWorkspace,
        workspacePolicyId: args.blueprint.workspacePolicyId,
        modulePolicy,
        topicPolicy,
        preferredActionLanguage: topicWorkspace.preferredActionLanguage,
        forbiddenActionLanguage: [
            ...topicWorkspace.forbiddenActionLanguage,
            ...(modulePolicy?.forbiddenActions ?? []),
        ],
        preferredTerms: args.blueprint.courseGenerationPolicy?.preferredTerms ?? {},
        avoidTerms: args.blueprint.courseGenerationPolicy?.avoidTerms ?? [],
        notes: [
            ...(args.blueprint.courseGenerationPolicy?.notes ?? []),
            ...(modulePolicy?.notes ?? []),
            ...(topicPolicy?.notes ?? []),
        ],
    };
}
