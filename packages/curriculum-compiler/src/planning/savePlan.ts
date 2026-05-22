import fs from "node:fs/promises";
import path from "node:path";
import type { CoursePlan } from "@zoeskoul/curriculum-contracts";
import { getAuthoringCoursePlanPath } from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function getPlanPath(subjectSlug: string, courseSlug: string) {
    return getAuthoringCoursePlanPath(subjectSlug, courseSlug);
}

export async function savePlan(
    subjectSlug: string,
    courseSlug: string,
    plan: CoursePlan,
) {
    const filePath = getPlanPath(subjectSlug, courseSlug);
    await ensureDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2) + "\n", "utf8");
    return filePath;
}
