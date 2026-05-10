import type {
    CourseBlueprint,
    CourseSpec,
    CourseSpecRuntimePolicy,
    PlannedModule,
    SqlDialect,
    TopicSeedRuntimeDefaults,
} from "@zoeskoul/curriculum-contracts";
import { getSqlModuleDatasetPolicy } from "@zoeskoul/curriculum-profiles";

function clean(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toSqlDialect(value: unknown): SqlDialect | undefined {
    const v = clean(value);
    if (v === "sqlite" || v === "postgres" || v === "mysql" || v === "mssql") {
        return v;
    }
    return undefined;
}

function toResultShape(value: unknown): "table" | undefined {
    return clean(value) === "table" ? "table" : undefined;
}

export function resolveModuleRuntimePolicy(args: {
    blueprint: CourseBlueprint;
    spec?: CourseSpec | null;
    module: Pick<PlannedModule, "moduleSlug" | "order" | "runtimePolicy">;
}): CourseSpecRuntimePolicy | undefined {
    const moduleSpec = args.spec?.modules.find(
        (m) => m.moduleSlug === args.module.moduleSlug,
    );

    const blueprintPolicy = args.blueprint.runtimePolicy;
    const specPolicy = args.spec?.policy?.runtimePolicy;
    const moduleSpecPolicy = moduleSpec?.runtimePolicy;
    const planModulePolicy = args.module.runtimePolicy;

    const datasetId =
        clean(planModulePolicy?.datasetId) ??
        clean(moduleSpecPolicy?.datasetId) ??
        clean(blueprintPolicy?.moduleDatasetIds?.[args.module.moduleSlug]) ??
        clean(specPolicy?.datasetId) ??
        clean(planModulePolicy?.preferredDatasetId) ??
        clean(moduleSpecPolicy?.preferredDatasetId) ??
        clean(specPolicy?.preferredDatasetId) ??
        clean(blueprintPolicy?.preferredDatasetId) ??
        clean(blueprintPolicy?.datasetId) ??
        (args.blueprint.profileId === "sql"
            ? getSqlModuleDatasetPolicy(Math.max(0, args.module.order - 1)).datasetId
            : undefined);

    const sqlDialect =
        toSqlDialect(planModulePolicy?.sqlDialect) ??
        toSqlDialect(moduleSpecPolicy?.sqlDialect) ??
        toSqlDialect(specPolicy?.sqlDialect) ??
        toSqlDialect(blueprintPolicy?.sqlDialect);

    const datasetStrategy =
        planModulePolicy?.datasetStrategy ??
        moduleSpecPolicy?.datasetStrategy ??
        specPolicy?.datasetStrategy ??
        blueprintPolicy?.datasetStrategy;

    const preferredDatasetId =
        clean(planModulePolicy?.preferredDatasetId) ??
        clean(moduleSpecPolicy?.preferredDatasetId) ??
        clean(specPolicy?.preferredDatasetId) ??
        clean(blueprintPolicy?.preferredDatasetId);

    const resultShape =
        toResultShape(planModulePolicy?.resultShape) ??
        toResultShape(moduleSpecPolicy?.resultShape) ??
        toResultShape(specPolicy?.resultShape) ??
        toResultShape(blueprintPolicy?.resultShape);

    if (
        !sqlDialect &&
        !datasetStrategy &&
        !datasetId &&
        !preferredDatasetId &&
        !resultShape
    ) {
        return undefined;
    }

    return {
        sqlDialect,
        datasetStrategy,
        datasetId,
        preferredDatasetId,
        resultShape,
    };
}

export function runtimePolicyToTopicRuntimeDefaults(args: {
    profileId: string;
    runtimePolicy?: CourseSpecRuntimePolicy;
}): TopicSeedRuntimeDefaults | null {
    const policy = args.runtimePolicy;
    if (!policy) return null;

    if (
        args.profileId === "sql" ||
        policy.sqlDialect ||
        policy.datasetId ||
        policy.preferredDatasetId ||
        policy.datasetStrategy
    ) {
        const fixedSqlDialect: SqlDialect = policy.sqlDialect ?? "sqlite";

        return {
            kind: "sql",
            datasetId: policy.datasetId ?? policy.preferredDatasetId,
            fixedSqlDialect,
            resultShape: "table",
        };
    }

    return null;
}