import type {
    BlueprintRuntimePolicy,
    ManifestRuntimeDefaults,
    PlannedModule,
    SqlDialect,
} from "@zoeskoul/curriculum-contracts";
import { getSqlModuleDatasetPolicy } from "./datasetPolicy.js";

export function resolveSqlRuntimeDefaults(args: {
    moduleOrder?: number;
    module?: PlannedModule;
    runtimePolicy?: PlannedModule["runtimePolicy"];
    blueprintRuntimePolicy?: BlueprintRuntimePolicy;
    courseSlug?: string;
}): ManifestRuntimeDefaults {
    const resolvedOrder =
        typeof args.module?.order === "number"
            ? Math.max(0, args.module.order - 1)
            : Math.max(0, (args.moduleOrder ?? 1) - 1);

    const policy = getSqlModuleDatasetPolicy({
        courseSlug: args.courseSlug,
        moduleOrder: resolvedOrder,
    });
    const runtime = args.runtimePolicy ?? args.module?.runtimePolicy;
    const blueprintRuntime = args.blueprintRuntimePolicy;

    const moduleDatasetId =
        args.module?.moduleSlug && blueprintRuntime?.moduleDatasetIds
            ? blueprintRuntime.moduleDatasetIds[args.module.moduleSlug]
            : undefined;

    const fixedSqlDialect: SqlDialect =
        runtime?.sqlDialect ??
        blueprintRuntime?.sqlDialect ??
        "sqlite";

    const resultShape = "table" as const;

    return {
        kind: "sql",
        datasetId:
            runtime?.datasetId ??
            runtime?.preferredDatasetId ??
            moduleDatasetId ??
            blueprintRuntime?.datasetId ??
            blueprintRuntime?.preferredDatasetId ??
            policy.datasetId,
        fixedSqlDialect,
        resultShape,
    };
}