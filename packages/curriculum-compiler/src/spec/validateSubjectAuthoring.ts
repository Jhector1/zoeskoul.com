import fs from "node:fs/promises";
import type { CourseSpec, SubjectPlan } from "@zoeskoul/curriculum-contracts";
import {
    getAuthoringCatalogPath,
    getAuthoringCourseSpecPath,
    getAuthoringRoot,
    getAuthoringSubjectBlueprintPath,
    getAuthoringSubjectDatasetsPath,
    getAuthoringSubjectPlanPath,
    getAuthoringSubjectProfilePath,
    getAuthoringSubjectWorkspacePolicyPath,
    getAuthoringSubjectValidationPath,
} from "@zoeskoul/curriculum-core";
import { resolveAuthoringPolicyChain } from "../policy/resolveAuthoringPolicyChain.js";
import { normalizeLegacyCourseSpec } from "./normalizeLegacyCourseSpec.js";
import { validateCourseSpec } from "./validateCourseSpec.js";

type ValidateSubjectAuthoringOptions = {
    authoringRoot?: string;
};

type ValidateCourseAuthoringOptions = ValidateSubjectAuthoringOptions;

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJson(filePath: string): Promise<unknown> {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function maybeFromAuthoringRoot(
    authoringRoot: string,
    canonicalPath: string,
) {
    const canonicalRoot = getAuthoringRoot();
    return canonicalPath.startsWith(canonicalRoot)
        ? `${authoringRoot}${canonicalPath.slice(canonicalRoot.length)}`
        : canonicalPath;
}

function subjectPlanPath(authoringRoot: string, subjectSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringSubjectPlanPath(subjectSlug),
    );
}

function subjectBlueprintPath(authoringRoot: string, subjectSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringSubjectBlueprintPath(subjectSlug),
    );
}

function subjectValidationPath(authoringRoot: string, subjectSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringSubjectValidationPath(subjectSlug),
    );
}

function sharedProfilePath(authoringRoot: string, subjectSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringSubjectProfilePath(subjectSlug),
    );
}

function sharedDatasetsPath(authoringRoot: string, subjectSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringSubjectDatasetsPath(subjectSlug),
    );
}

function sharedWorkspacePolicyPath(authoringRoot: string, subjectSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringSubjectWorkspacePolicyPath(subjectSlug),
    );
}

function courseSpecPath(authoringRoot: string, subjectSlug: string, courseSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringCourseSpecPath(subjectSlug, courseSlug),
    );
}

function catalogPath(authoringRoot: string, catalogSlug: string) {
    return maybeFromAuthoringRoot(
        authoringRoot,
        getAuthoringCatalogPath(catalogSlug),
    );
}

function collectDuplicateValues(values: string[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
        } else {
            seen.add(value);
        }
    }

    return [...duplicates];
}

function validateCourseIdentity(
    spec: CourseSpec,
    subjectSlug: string,
    courseSlug: string,
    specPath: string,
    issues: string[],
) {
    if (spec.subjectSlug !== subjectSlug) {
        issues.push(
            `${specPath}: subjectSlug must be "${subjectSlug}" but found "${spec.subjectSlug}"`,
        );
    }

    if (spec.courseSlug !== courseSlug) {
        issues.push(
            `${specPath}: courseSlug must be "${courseSlug}" but found "${spec.courseSlug}"`,
        );
    }

    if (!isNonEmptyString(spec.catalogSlug)) {
        issues.push(`${specPath}: catalogSlug is required`);
    }

    if (!isNonEmptyString(spec.profileId)) {
        issues.push(`${specPath}: profileId is required`);
    }
}

function validateCourseDuplicates(
    spec: CourseSpec,
    specPath: string,
    issues: string[],
) {
    for (const duplicate of collectDuplicateValues(
        spec.modules.map((module) => module.moduleSlug).filter(isNonEmptyString),
    )) {
        issues.push(`${specPath}: duplicate moduleSlug "${duplicate}"`);
    }

    const topicIds = spec.modules.flatMap((module) =>
        module.sections.flatMap((section) =>
            section.topics.map((topic) => topic.topicId).filter(isNonEmptyString),
        ),
    );

    for (const duplicate of collectDuplicateValues(topicIds)) {
        issues.push(`${specPath}: duplicate topicId "${duplicate}"`);
    }
}

function collectDatasetIds(value: unknown, datasetIds = new Set<string>()) {
    if (Array.isArray(value)) {
        value.forEach((entry) => collectDatasetIds(entry, datasetIds));
        return datasetIds;
    }

    if (!value || typeof value !== "object") return datasetIds;

    for (const [key, child] of Object.entries(value)) {
        if (key === "datasetId" && isNonEmptyString(child)) {
            datasetIds.add(child);
        } else {
            collectDatasetIds(child, datasetIds);
        }
    }

    return datasetIds;
}

function hasCompatibleVersioning(value: unknown) {
    if (!value || typeof value !== "object") return false;
    const versioning = value as {
        family?: unknown;
        version?: unknown;
        status?: unknown;
    };

    return (
        isNonEmptyString(versioning.family) &&
        typeof versioning.version === "number" &&
        Number.isFinite(versioning.version) &&
        isNonEmptyString(versioning.status)
    );
}

function validateSubjectPlanVersioning(
    plan: SubjectPlan,
    planPath: string,
    issues: string[],
) {
    const versioning = plan.versioning;
    const channel = plan.publishTarget?.channel;
    const status = versioning?.status;
    const defaultForNewEnrollments = versioning?.defaultForNewEnrollments;
    const supersededBy = versioning?.supersededBy;
    const hasSupersededBy =
        typeof supersededBy === "string" ? supersededBy.trim().length > 0 : supersededBy != null;

    if (channel === "current") {
        if (!versioning) {
            issues.push(`${planPath}: publishTarget.channel "current" requires versioning`);
            return;
        }

        if (!isNonEmptyString(versioning.family)) {
            issues.push(`${planPath}: active current release requires versioning.family`);
        }

        if (typeof versioning.version !== "number" || !Number.isFinite(versioning.version)) {
            issues.push(`${planPath}: active current release requires numeric versioning.version`);
        }

        if (status !== "active") {
            issues.push(
                `${planPath}: publishTarget.channel "current" requires versioning.status "active"`,
            );
        }

        if (defaultForNewEnrollments !== true) {
            issues.push(
                `${planPath}: publishTarget.channel "current" requires versioning.defaultForNewEnrollments true`,
            );
        }

        if (hasSupersededBy) {
            issues.push(
                `${planPath}: publishTarget.channel "current" cannot have versioning.supersededBy`,
            );
        }
    }

    if (status === "legacy") {
        if (channel === "current") {
            issues.push(
                `${planPath}: versioning.status "legacy" cannot be used with publishTarget.channel "current"`,
            );
        }

        if (defaultForNewEnrollments === true) {
            issues.push(`${planPath}: legacy versions cannot be defaultForNewEnrollments`);
        }
    }

    if (defaultForNewEnrollments === true) {
        if (status !== "active") {
            issues.push(
                `${planPath}: defaultForNewEnrollments true requires versioning.status "active"`,
            );
        }

        if (channel !== "current") {
            issues.push(
                `${planPath}: defaultForNewEnrollments true requires publishTarget.channel "current"`,
            );
        }
    }

    if (hasSupersededBy) {
        if (status !== "legacy") {
            issues.push(`${planPath}: versioning.supersededBy requires versioning.status "legacy"`);
        }

        if (defaultForNewEnrollments === true) {
            issues.push(
                `${planPath}: versioning.supersededBy cannot be used with defaultForNewEnrollments true`,
            );
        }
    }

    const supersedes =
        typeof versioning?.supersedes === "string" ? versioning.supersedes.trim() : "";
    const liveSubjectSlug = plan.publishTarget?.liveSubjectSlug;
    if (
        channel === "current" &&
        status === "active" &&
        typeof versioning?.version === "number" &&
        versioning.version > 1 &&
        supersedes &&
        liveSubjectSlug === supersedes
    ) {
        issues.push(
            `${planPath}: current active version ${versioning.version} cannot publish into superseded liveSubjectSlug "${supersedes}"`,
        );
    }

    if (
        plan.subjectSlug === "sql" &&
        versioning?.family === "sql" &&
        versioning.version === 2 &&
        !supersedes &&
        liveSubjectSlug !== "sql-v2"
    ) {
        issues.push(
            `${planPath}: SQL version 2 must publish into liveSubjectSlug "sql-v2"`,
        );
    }

    if (
        plan.subjectSlug === "sql" &&
        versioning?.family === "sql" &&
        versioning.version === 2 &&
        supersedes === "sql" &&
        liveSubjectSlug !== "sql-v2"
    ) {
        issues.push(
            `${planPath}: SQL version 2 with supersedes "sql" must publish into liveSubjectSlug "sql-v2"`,
        );
    }
}

async function validateSubjectCatalogVersioning(
    authoringRoot: string,
    plan: SubjectPlan,
    issues: string[],
) {
    const catalogSlug = plan.catalogSlug ?? plan.subjectSlug;
    if (!isNonEmptyString(catalogSlug)) return;

    const filePath = catalogPath(authoringRoot, catalogSlug);
    if (!(await pathExists(filePath))) {
        issues.push(`${filePath}: catalog is required`);
        return;
    }

    try {
        const catalogJson = await readJson(filePath);
        const catalog =
            catalogJson && typeof catalogJson === "object" && !Array.isArray(catalogJson)
                ? (catalogJson as { catalog?: unknown }).catalog
                : null;

        if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
            issues.push(`${filePath}: catalog must be an object`);
            return;
        }

        const subjectSlugs = (catalog as { subjectSlugs?: unknown }).subjectSlugs;
        const defaultSubjectSlug = (catalog as { defaultSubjectSlug?: unknown }).defaultSubjectSlug;
        const liveSubjectSlug = plan.publishTarget?.liveSubjectSlug;
        const supersedes =
            typeof plan.versioning?.supersedes === "string"
                ? plan.versioning.supersedes.trim()
                : "";

        if (!Array.isArray(subjectSlugs)) {
            issues.push(`${filePath}: catalog.subjectSlugs must be an array`);
            return;
        }

        if (isNonEmptyString(liveSubjectSlug) && !subjectSlugs.includes(liveSubjectSlug)) {
            issues.push(
                `${filePath}: catalog.subjectSlugs must include publishTarget.liveSubjectSlug "${liveSubjectSlug}"`,
            );
        }

        if (supersedes && !subjectSlugs.includes(supersedes)) {
            issues.push(
                `${filePath}: catalog.subjectSlugs must include versioning.supersedes "${supersedes}"`,
            );
        }

        if (
            plan.publishTarget?.channel === "current" &&
            plan.versioning?.status === "active" &&
            plan.versioning.defaultForNewEnrollments === true &&
            isNonEmptyString(liveSubjectSlug) &&
            defaultSubjectSlug !== liveSubjectSlug
        ) {
            issues.push(
                `${filePath}: catalog.defaultSubjectSlug must equal publishTarget.liveSubjectSlug "${liveSubjectSlug}" for active default current release`,
            );
        }
    } catch (error) {
        issues.push(
            `${filePath}: ${
                error instanceof Error ? error.message : "failed to parse catalog"
            }`,
        );
    }
}

async function validateCourseSpecFile(args: {
    authoringRoot: string;
    subjectSlug: string;
    courseSlug: string;
    requireVersioning?: boolean;
    subjectPlan?: SubjectPlan;
}) {
    const issues: string[] = [];
    const specPath = courseSpecPath(
        args.authoringRoot,
        args.subjectSlug,
        args.courseSlug,
    );

    if (!(await pathExists(specPath))) {
        return [`${specPath}: course.spec.json is required`];
    }

    try {
        const spec = normalizeLegacyCourseSpec(await readJson(specPath));
        for (const specIssue of validateCourseSpec(spec)) {
            issues.push(`${specPath}: ${specIssue}`);
        }
        validateCourseIdentity(
            spec,
            args.subjectSlug,
            args.courseSlug,
            specPath,
            issues,
        );
        validateCourseDuplicates(spec, specPath, issues);

        if (
            args.requireVersioning &&
            !hasCompatibleVersioning(args.subjectPlan?.versioning) &&
            !hasCompatibleVersioning(spec.versioning)
        ) {
            issues.push(
                `${specPath}: publishTarget course must have versioning in subject.plan.json or course.spec.json`,
            );
        }
    } catch (error) {
        issues.push(
            `${specPath}: ${
                error instanceof Error ? error.message : "failed to read course spec"
            }`,
        );
    }

    return issues;
}

export async function validateSubjectAuthoring(
    subjectSlug: string,
    options: ValidateSubjectAuthoringOptions = {},
): Promise<string[]> {
    const authoringRoot = options.authoringRoot ?? getAuthoringRoot();
    const issues: string[] = [];
    const planPath = subjectPlanPath(authoringRoot, subjectSlug);

    if (!(await pathExists(subjectBlueprintPath(authoringRoot, subjectSlug)))) {
        issues.push(`${subjectBlueprintPath(authoringRoot, subjectSlug)}: subject.blueprint.json is required`);
    }

    if (!(await pathExists(subjectValidationPath(authoringRoot, subjectSlug)))) {
        issues.push(`${subjectValidationPath(authoringRoot, subjectSlug)}: subject.validation.json is required`);
    }

    if (!(await pathExists(planPath))) {
        return [...issues, `${planPath}: subject.plan.json is required`];
    }

    const plan = (await readJson(planPath)) as SubjectPlan;

    if (plan.subjectSlug !== subjectSlug) {
        issues.push(
            `${planPath}: subjectSlug must be "${subjectSlug}" but found "${plan.subjectSlug}"`,
        );
    }

    if (!Array.isArray(plan.courseOrder) || !plan.courseOrder.length) {
        issues.push(`${planPath}: courseOrder must be a non-empty array`);
    }

    if (!plan.publishTarget || typeof plan.publishTarget !== "object") {
        issues.push(`${planPath}: publishTarget is required`);
    } else {
        if (!isNonEmptyString(plan.publishTarget.liveSubjectSlug)) {
            issues.push(`${planPath}: publishTarget.liveSubjectSlug is required`);
        }
        if (!isNonEmptyString(plan.publishTarget.courseSlug)) {
            issues.push(`${planPath}: publishTarget.courseSlug is required`);
        }
    }

    validateSubjectPlanVersioning(plan, planPath, issues);
    await validateSubjectCatalogVersioning(authoringRoot, plan, issues);

    const courseOrder = Array.isArray(plan.courseOrder) ? plan.courseOrder : [];
    for (const duplicate of collectDuplicateValues(courseOrder)) {
        issues.push(`${planPath}: duplicate courseSlug "${duplicate}" in courseOrder`);
    }

    const publishCourseSlug = plan.publishTarget?.courseSlug;
    if (isNonEmptyString(publishCourseSlug) && !courseOrder.includes(publishCourseSlug)) {
        issues.push(
            `${planPath}: publishTarget.courseSlug "${publishCourseSlug}" must be listed in courseOrder`,
        );
    }

    if (!(await pathExists(sharedProfilePath(authoringRoot, subjectSlug)))) {
        issues.push(`${sharedProfilePath(authoringRoot, subjectSlug)}: shared profile is required`);
    }

    if (!(await pathExists(sharedWorkspacePolicyPath(authoringRoot, subjectSlug)))) {
        issues.push(
            `${sharedWorkspacePolicyPath(authoringRoot, subjectSlug)}: shared workspace policy is required`,
        );
    }

    let sqlDatasetIds: Set<string> | null = null;
    if (subjectSlug === "sql") {
        const datasetsPath = sharedDatasetsPath(authoringRoot, subjectSlug);
        if (!(await pathExists(datasetsPath))) {
            issues.push(`${datasetsPath}: SQL datasets are required`);
        } else {
            try {
                const datasetsJson = await readJson(datasetsPath);
                const datasets =
                    datasetsJson &&
                    typeof datasetsJson === "object" &&
                    !Array.isArray(datasetsJson)
                        ? (datasetsJson as { datasets?: unknown }).datasets
                        : null;
                if (!datasets || typeof datasets !== "object" || Array.isArray(datasets)) {
                    issues.push(`${datasetsPath}: datasets must be an object`);
                } else {
                    sqlDatasetIds = new Set(Object.keys(datasets));
                }
            } catch (error) {
                issues.push(
                    `${datasetsPath}: ${
                        error instanceof Error ? error.message : "failed to parse datasets"
                    }`,
                );
            }
        }
    }

    const courseSlugsToValidate = new Set(courseOrder);
    if (isNonEmptyString(publishCourseSlug)) {
        courseSlugsToValidate.add(publishCourseSlug);
    }

    for (const courseSlug of courseSlugsToValidate) {
        issues.push(
            ...(await validateCourseSpecFile({
                authoringRoot,
                subjectSlug,
                courseSlug,
                requireVersioning: courseSlug === publishCourseSlug,
                subjectPlan: plan,
            })),
        );

        const resolvedPolicy = await resolveAuthoringPolicyChain({
            authoringRoot,
            subjectSlug,
            courseSlug,
            includeProjectPolicy: true,
        });
        for (const warning of resolvedPolicy.warnings) {
            issues.push(`policy warning for ${subjectSlug}/${courseSlug}: ${warning}`);
        }

        if (sqlDatasetIds) {
            const specPath = courseSpecPath(authoringRoot, subjectSlug, courseSlug);
            if (await pathExists(specPath)) {
                const rawSpec = await readJson(specPath);
                for (const datasetId of collectDatasetIds(rawSpec)) {
                    if (!sqlDatasetIds.has(datasetId)) {
                        issues.push(
                            `${specPath}: datasetId "${datasetId}" is not declared in shared/datasets.json`,
                        );
                    }
                }
            }
        }
    }

    return issues;
}

export async function validateCourseAuthoring(
    subjectSlug: string,
    courseSlug: string,
    options: ValidateCourseAuthoringOptions = {},
): Promise<string[]> {
    const authoringRoot = options.authoringRoot ?? getAuthoringRoot();
    const issues: string[] = [];
    const planPath = subjectPlanPath(authoringRoot, subjectSlug);
    const plan = (await pathExists(planPath))
        ? ((await readJson(planPath)) as SubjectPlan)
        : null;

    if (!(await pathExists(sharedProfilePath(authoringRoot, subjectSlug)))) {
        issues.push(`${sharedProfilePath(authoringRoot, subjectSlug)}: shared profile is required`);
    }

    if (!(await pathExists(sharedWorkspacePolicyPath(authoringRoot, subjectSlug)))) {
        issues.push(
            `${sharedWorkspacePolicyPath(authoringRoot, subjectSlug)}: shared workspace policy is required`,
        );
    }

    if (
        subjectSlug === "sql" &&
        !(await pathExists(sharedDatasetsPath(authoringRoot, subjectSlug)))
    ) {
        issues.push(`${sharedDatasetsPath(authoringRoot, subjectSlug)}: SQL datasets are required`);
    }

    issues.push(
        ...(await validateCourseSpecFile({
            authoringRoot,
            subjectSlug,
            courseSlug,
            requireVersioning: plan?.publishTarget?.courseSlug === courseSlug,
            subjectPlan: plan ?? undefined,
        })),
    );

    const resolvedPolicy = await resolveAuthoringPolicyChain({
        authoringRoot,
        subjectSlug,
        courseSlug,
        includeProjectPolicy: true,
    });
    for (const warning of resolvedPolicy.warnings) {
        issues.push(`policy warning for ${subjectSlug}/${courseSlug}: ${warning}`);
    }

    return issues;
}

export async function assertSubjectAuthoring(
    subjectSlug: string,
    options: ValidateSubjectAuthoringOptions = {},
) {
    const issues = await validateSubjectAuthoring(subjectSlug, options);

    if (issues.length) {
        throw new Error(`Subject authoring validation failed:\n- ${issues.join("\n- ")}`);
    }
}
