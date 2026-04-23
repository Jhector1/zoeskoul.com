import fs from "node:fs/promises";
import path from "node:path";
import type { CoursePlan } from "@zoeskoul/curriculum-contracts";

async function ensureDir(filePath: string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function getPlanPath(subjectSlug: string) {
    return `authoring/${subjectSlug}/course.plan.json`;
}

export async function savePlan(subjectSlug: string, plan: CoursePlan) {
    const filePath = getPlanPath(subjectSlug);
    await ensureDir(filePath);
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2) + "\n", "utf8");
    return filePath;
}