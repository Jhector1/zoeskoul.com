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

function filterAvoidTermsForWorkspace(args: {
    workspace: WorkspaceProfile;
    avoidTerms: string[];
}) {
    const { workspace, avoidTerms } = args;
    const allowed = new Set<string>();
    const capabilities = workspace.capabilities;
    const createFilesEnabled = capabilities.createFiles?.enabled === true;
    const createFoldersEnabled = capabilities.createFolders?.enabled === true;

    if (
        capabilities.filesystem.enabled ||
        createFilesEnabled ||
        createFoldersEnabled
    ) {
        allowed.add("file creation");
    }

    if (createFilesEnabled || capabilities.multiFileProjects.enabled) {
        allowed.add(".py");
        allowed.add("Python file");
        allowed.add("save this as main.py");
    }

    if (capabilities.multiFileProjects.enabled) {
        allowed.add("multi-file project");
    }

    if (capabilities.terminal.enabled) {
        allowed.add("terminal");
        allowed.add("command line");
        allowed.add("shell");
    }

    if (capabilities.packageInstall.enabled) {
        allowed.add("pip install");
        allowed.add("package installation");
    }

    return avoidTerms.filter((term) => !allowed.has(term));
}

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

    if (!base) {
        throw new Error(
            `Unknown workspaceProfileId "${baseProfileId}". Known workspace profiles: ${Object.keys(
                WORKSPACE_PROFILES,
            )
                .sort()
                .join(", ")}`,
        );
    }

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
        avoidTerms: filterAvoidTermsForWorkspace({
            workspace: topicWorkspace,
            avoidTerms: args.blueprint.courseGenerationPolicy?.avoidTerms ?? [],
        }),
        notes: [
            ...(args.blueprint.courseGenerationPolicy?.notes ?? []),
            ...(modulePolicy?.notes ?? []),
            ...(topicPolicy?.notes ?? []),
        ],
    };
}
