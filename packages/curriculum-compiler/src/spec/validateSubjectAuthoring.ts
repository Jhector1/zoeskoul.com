import fs from "node:fs/promises";
import path from "node:path";
import type { CourseSpec, SubjectPlan } from "@zoeskoul/curriculum-contracts";
import {
    getAuthoringCatalogPath,
    getAuthoringCourseSpecPath,
    getAuthoringRoot,
    getAuthoringSubjectBlueprintPath,
    getAuthoringSubjectPlanPath,
    getAuthoringSubjectProfilePath,
    getAuthoringSubjectWorkspacePolicyPath,
    getAuthoringSubjectValidationPath,
} from "@zoeskoul/curriculum-core";
import {
    getSqlDatasetById,
    listSqlDatasetIds,
} from "@zoeskoul/curriculum-profiles/sql-datasets";
import { resolveAuthoringPolicyChain } from "../policy/resolveAuthoringPolicyChain.js";
import { normalizeLegacyCourseSpec } from "./normalizeLegacyCourseSpec.js";
import { validateCourseSpec } from "./validateCourseSpec.js";

type ValidateSubjectAuthoringOptions = {
    authoringRoot?: string;
};

type ValidateCourseAuthoringOptions = ValidateSubjectAuthoringOptions;
type CoursePlanShape = {
    moduleOrder?: unknown;
    modules?: unknown;
};
type SqlSchemaTable = {
    columns: Set<string>;
    foreignKeys: DerivedSqlRelationship[];
};
type DerivedSqlRelationship = {
    fromTable: string;
    fromColumns: string[];
    toTable: string;
    toColumns: string[];
};

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

function authoringIndexPath(authoringRoot: string) {
    return path.join(authoringRoot, "authoring.index.json");
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

function arraysEqual(left: string[], right: string[]) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readModuleOrderFromCoursePlan(value: unknown): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];

    const plan = value as CoursePlanShape;
    return Array.isArray(plan.moduleOrder)
        ? plan.moduleOrder.filter(isNonEmptyString)
        : [];
}

function readModuleSlugsFromCoursePlanModules(value: unknown): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];

    const plan = value as CoursePlanShape;
    if (!Array.isArray(plan.modules)) return [];

    return plan.modules
        .map((module) =>
            module && typeof module === "object" && !Array.isArray(module)
                ? (module as { moduleSlug?: unknown }).moduleSlug
                : null,
        )
        .filter(isNonEmptyString);
}

async function validateCoursePlanModuleAlignment(args: {
    authoringRoot: string;
    subjectSlug: string;
    courseSlug: string;
    spec: CourseSpec;
    issues: string[];
}) {
    const planPath = path.join(
        args.authoringRoot,
        "subjects",
        args.subjectSlug,
        "courses",
        args.courseSlug,
        "course.plan.json",
    );

    if (!(await pathExists(planPath))) {
        return;
    }

    try {
        const rawPlan = await readJson(planPath);
        const planModuleOrder = readModuleOrderFromCoursePlan(rawPlan);
        const planModuleSlugs = readModuleSlugsFromCoursePlanModules(rawPlan);
        const specModuleSlugs = args.spec.modules
            .map((module) => module.moduleSlug)
            .filter(isNonEmptyString);

        if (!arraysEqual(planModuleOrder, specModuleSlugs)) {
            args.issues.push(
                `${planPath}: moduleOrder must exactly match course.spec.json modules[].moduleSlug`,
            );
        }

        if (planModuleSlugs.length && !arraysEqual(planModuleSlugs, specModuleSlugs)) {
            args.issues.push(
                `${planPath}: modules[].moduleSlug must exactly match course.spec.json modules[].moduleSlug`,
            );
        }
    } catch (error) {
        args.issues.push(
            `${planPath}: ${
                error instanceof Error ? error.message : "failed to read course plan"
            }`,
        );
    }
}

async function validateAuthoringIndex(args: {
    authoringRoot: string;
    subjectSlug: string;
    subjectPlan: SubjectPlan;
    issues: string[];
}) {
    const indexPath = authoringIndexPath(args.authoringRoot);
    if (!(await pathExists(indexPath))) {
        return;
    }

    try {
        const rawIndex = await readJson(indexPath);
        if (!rawIndex || typeof rawIndex !== "object" || Array.isArray(rawIndex)) {
            args.issues.push(`${indexPath}: authoring index must be an object`);
            return;
        }

        const subjects = (rawIndex as { subjects?: unknown }).subjects;
        if (!Array.isArray(subjects)) {
            args.issues.push(`${indexPath}: subjects must be an array`);
            return;
        }

        const subjectEntry = subjects.find(
            (entry) =>
                entry &&
                typeof entry === "object" &&
                !Array.isArray(entry) &&
                (entry as { subjectSlug?: unknown }).subjectSlug === args.subjectSlug,
        ) as
            | {
                  courseOrder?: unknown;
                  courses?: unknown;
                  path?: unknown;
                  subjectSlug?: unknown;
              }
            | undefined;

        if (!subjectEntry) {
            args.issues.push(`${indexPath}: missing subject entry for "${args.subjectSlug}"`);
            return;
        }

        const planCourseOrder = Array.isArray(args.subjectPlan.courseOrder)
            ? args.subjectPlan.courseOrder.filter(isNonEmptyString)
            : [];
        const indexCourseOrder = Array.isArray(subjectEntry.courseOrder)
            ? subjectEntry.courseOrder.filter(isNonEmptyString)
            : [];

        if (!arraysEqual(indexCourseOrder, planCourseOrder)) {
            args.issues.push(
                `${indexPath}: subject "${args.subjectSlug}" courseOrder must match subject.plan.json`,
            );
        }

        if (!Array.isArray(subjectEntry.courses)) {
            args.issues.push(`${indexPath}: subject "${args.subjectSlug}" courses must be an array`);
            return;
        }

        const expectedCoursePaths = new Map(
            planCourseOrder.map((courseSlug) => [
                courseSlug,
                path.join(
                    "subjects",
                    args.subjectSlug,
                    "courses",
                    courseSlug,
                    "course.spec.json",
                ),
            ]),
        );

        for (const courseEntry of subjectEntry.courses) {
            if (!courseEntry || typeof courseEntry !== "object" || Array.isArray(courseEntry)) {
                args.issues.push(
                    `${indexPath}: subject "${args.subjectSlug}" courses entries must be objects`,
                );
                continue;
            }

            const courseSlug = (courseEntry as { courseSlug?: unknown }).courseSlug;
            const coursePath = (courseEntry as { path?: unknown }).path;

            if (!isNonEmptyString(courseSlug) || !isNonEmptyString(coursePath)) {
                args.issues.push(
                    `${indexPath}: subject "${args.subjectSlug}" course entries require courseSlug and path`,
                );
                continue;
            }

            const expectedPath = expectedCoursePaths.get(courseSlug);
            if (!expectedPath) {
                args.issues.push(
                    `${indexPath}: subject "${args.subjectSlug}" references inactive course "${courseSlug}"`,
                );
                continue;
            }

            if (coursePath !== expectedPath) {
                args.issues.push(
                    `${indexPath}: subject "${args.subjectSlug}" course "${courseSlug}" path must be "${expectedPath}"`,
                );
            }

            const absoluteCoursePath = path.join(args.authoringRoot, coursePath);
            if (!(await pathExists(absoluteCoursePath))) {
                args.issues.push(`${indexPath}: missing referenced course spec "${coursePath}"`);
            }
        }
    } catch (error) {
        args.issues.push(
            `${indexPath}: ${
                error instanceof Error ? error.message : "failed to parse authoring index"
            }`,
        );
    }
}

async function validateUnexpectedActiveCourseFolders(args: {
    authoringRoot: string;
    subjectSlug: string;
    activeCourseSlugs: string[];
    issues: string[];
}) {
    const coursesRoot = path.join(args.authoringRoot, "subjects", args.subjectSlug, "courses");
    if (!(await pathExists(coursesRoot))) {
        return;
    }

    const activeSet = new Set(args.activeCourseSlugs);
    const entries = await fs.readdir(coursesRoot, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (activeSet.has(entry.name)) continue;

        const straySpecPath = path.join(coursesRoot, entry.name, "course.spec.json");
        const strayBlueprintPath = path.join(coursesRoot, entry.name, "course.blueprint.json");
        if ((await pathExists(straySpecPath)) || (await pathExists(strayBlueprintPath))) {
            args.issues.push(
                `${coursesRoot}: unexpected active course folder "${entry.name}" is not listed in subject.plan.json or authoring.index.json`,
            );
        }
    }
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
        } else if (key === "datasets" && isStringArray(child)) {
            child.forEach((datasetId) => datasetIds.add(datasetId));
        } else {
            collectDatasetIds(child, datasetIds);
        }
    }

    return datasetIds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(isNonEmptyString);
}

function normalizeSqlIdentifier(value: string) {
    return value.replace(/["'`]/g, "").trim();
}

function parseSqlIdentifierList(value: string) {
    return value
        .split(",")
        .map((entry) => normalizeSqlIdentifier(entry))
        .filter(isNonEmptyString);
}

function parseSqlSchemaTables(schemaSql: string): Map<string, SqlSchemaTable> {
    const tables = new Map<string, SqlSchemaTable>();
    const createTablePattern = /CREATE TABLE\s+([A-Za-z_][\w]*)\s*\(([\s\S]*?)\);/gi;

    for (const match of schemaSql.matchAll(createTablePattern)) {
        const tableName = normalizeSqlIdentifier(match[1] ?? "");
        const body = match[2] ?? "";
        const table: SqlSchemaTable = {
            columns: new Set<string>(),
            foreignKeys: [],
        };

        for (const rawLine of body.split("\n")) {
            const line = rawLine.trim().replace(/,$/, "");
            if (!line) continue;

            const foreignKeyMatch = line.match(
                /^FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES\s+([A-Za-z_][\w]*)\s*\(([^)]+)\)/i,
            );
            if (foreignKeyMatch) {
                table.foreignKeys.push({
                    fromTable: tableName,
                    fromColumns: parseSqlIdentifierList(foreignKeyMatch[1] ?? ""),
                    toTable: normalizeSqlIdentifier(foreignKeyMatch[2] ?? ""),
                    toColumns: parseSqlIdentifierList(foreignKeyMatch[3] ?? ""),
                });
                continue;
            }

            if (/^PRIMARY KEY\s*\(/i.test(line)) {
                continue;
            }

            const columnMatch = line.match(/^([A-Za-z_][\w]*)\s+/);
            if (columnMatch) {
                table.columns.add(normalizeSqlIdentifier(columnMatch[1] ?? ""));
            }
        }

        tables.set(tableName, table);
    }

    return tables;
}

export function deriveSqlRelationshipsFromSchemaSql(schemaSql: string): DerivedSqlRelationship[] {
    return [...parseSqlSchemaTables(schemaSql).values()].flatMap((table) => table.foreignKeys);
}

function readBooleanFlag(value: unknown, key: string) {
    return isRecord(value) && value[key] === true;
}

function validateCanonicalSqlDatasetRegistry() {
    const issues: string[] = [];

    for (const datasetId of listSqlDatasetIds()) {
        const dataset = getSqlDatasetById(datasetId);
        if (!dataset) {
            issues.push(`canonical SQL dataset registry: "${datasetId}" could not be loaded`);
            continue;
        }

        if (!isNonEmptyString(dataset.id)) {
            issues.push(`canonical SQL dataset registry: "${datasetId}" is missing id`);
        }
        if (dataset.id !== datasetId) {
            issues.push(
                `canonical SQL dataset registry: dataset "${datasetId}" returned id "${dataset.id}"`,
            );
        }
        if (dataset.dialect !== "sqlite") {
            issues.push(
                `canonical SQL dataset registry: "${datasetId}" must declare dialect "sqlite"`,
            );
        }
        if (typeof dataset.schemaSql !== "string") {
            issues.push(`canonical SQL dataset registry: "${datasetId}" is missing schemaSql`);
        }
        if (typeof dataset.seedSql !== "string") {
            issues.push(`canonical SQL dataset registry: "${datasetId}" is missing seedSql`);
        }
        if (!isRecord(dataset.tableSnapshots)) {
            issues.push(
                `canonical SQL dataset registry: "${datasetId}" is missing tableSnapshots`,
            );
            continue;
        }

        const schemaTables = parseSqlSchemaTables(dataset.schemaSql ?? "");
        for (const [tableName, snapshot] of Object.entries(dataset.tableSnapshots)) {
            const schemaTable = schemaTables.get(tableName);
            if (!schemaTable) {
                issues.push(
                    `canonical SQL dataset registry: "${datasetId}" tableSnapshot "${tableName}" is missing from schemaSql`,
                );
                continue;
            }

            const snapshotColumns = Array.isArray(snapshot?.columns) ? snapshot.columns : [];
            for (const column of snapshotColumns) {
                const columnName =
                    isRecord(column) && isNonEmptyString(column.name) ? column.name : null;
                if (!columnName) {
                    issues.push(
                        `canonical SQL dataset registry: "${datasetId}" tableSnapshot "${tableName}" has a column without a valid name`,
                    );
                    continue;
                }

                if (!schemaTable.columns.has(columnName)) {
                    issues.push(
                        `canonical SQL dataset registry: "${datasetId}" tableSnapshot "${tableName}" column "${columnName}" is missing from schemaSql`,
                    );
                }
            }
        }
    }

    return issues;
}

async function validateSqlAuthoringDatasetReferences(args: {
    authoringRoot: string;
    subjectSlug: string;
    courseSlug: string;
}) {
    const courseRoot = path.join(
        args.authoringRoot,
        "subjects",
        args.subjectSlug,
        "courses",
        args.courseSlug,
    );
    const candidateFiles = [
        path.join(courseRoot, "course.spec.json"),
        path.join(courseRoot, "course.plan.json"),
        path.join(courseRoot, "validation.policy.json"),
        path.join(courseRoot, "generation.policy.json"),
    ];
    const issues: string[] = [];
    const canonicalDatasetIds = new Set(listSqlDatasetIds());

    for (const filePath of candidateFiles) {
        if (!(await pathExists(filePath))) continue;

        const raw = await readJson(filePath);
        const datasetIds = collectDatasetIds(raw);
        for (const datasetId of datasetIds) {
            if (!canonicalDatasetIds.has(datasetId)) {
                issues.push(
                    `${filePath}: datasetId "${datasetId}" is not declared in the canonical SQL dataset registry`,
                );
                continue;
            }

            if (!getSqlDatasetById(datasetId)) {
                issues.push(
                    `${filePath}: datasetId "${datasetId}" could not be loaded from the canonical SQL dataset registry`,
                );
            }
        }

        const validationPolicy = isRecord(raw)
            ? (raw.validationPolicy ?? raw.validationRequirements ?? null)
            : null;
        const relationshipHeavy =
            readBooleanFlag(validationPolicy, "requireJoinRelationshipMetadata") ||
            readBooleanFlag(validationPolicy, "requireErdOrTableRelationshipVisuals") ||
            readBooleanFlag(validationPolicy, "requireErdVisuals") ||
            readBooleanFlag(validationPolicy, "requireCrowFootOrRelationshipDiagrams");
        if (!relationshipHeavy) {
            continue;
        }

        for (const datasetId of datasetIds) {
            const dataset = getSqlDatasetById(datasetId);
            if (!dataset) continue;

            if (deriveSqlRelationshipsFromSchemaSql(dataset.schemaSql).length === 0) {
                issues.push(
                    `${filePath}: relationship-focused dataset "${datasetId}" does not expose any FOREIGN KEY relationships in schemaSql`,
                );
            }
        }
    }

    return issues;
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
        await validateCoursePlanModuleAlignment({
            authoringRoot: args.authoringRoot,
            subjectSlug: args.subjectSlug,
            courseSlug: args.courseSlug,
            spec,
            issues,
        });

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

    if (subjectSlug === "sql") {
        issues.push(...validateCanonicalSqlDatasetRegistry());
    }

    const courseSlugsToValidate = new Set(courseOrder);
    if (isNonEmptyString(publishCourseSlug)) {
        courseSlugsToValidate.add(publishCourseSlug);
    }

    await validateAuthoringIndex({
        authoringRoot,
        subjectSlug,
        subjectPlan: plan,
        issues,
    });
    await validateUnexpectedActiveCourseFolders({
        authoringRoot,
        subjectSlug,
        activeCourseSlugs: [...courseSlugsToValidate],
        issues,
    });

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

        if (subjectSlug === "sql") {
            issues.push(
                ...(await validateSqlAuthoringDatasetReferences({
                    authoringRoot,
                    subjectSlug,
                    courseSlug,
                })),
            );
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

    if (subjectSlug === "sql") {
        issues.push(...validateCanonicalSqlDatasetRegistry());
        issues.push(
            ...(await validateSqlAuthoringDatasetReferences({
                authoringRoot,
                subjectSlug,
                courseSlug,
            })),
        );
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
