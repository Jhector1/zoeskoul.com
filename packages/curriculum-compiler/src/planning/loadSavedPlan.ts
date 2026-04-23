import fs from "node:fs/promises";
import type { CoursePlan } from "@zoeskoul/curriculum-contracts";
import { getPlanPath } from "./savePlan.js";

export async function loadSavedPlan(subjectSlug: string): Promise<CoursePlan | null> {
    try {
        const raw = await fs.readFile(getPlanPath(subjectSlug), "utf8");
        return JSON.parse(raw) as CoursePlan;
    } catch {
        return null;
    }
}