import fs from "node:fs/promises";
import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";

export async function loadBlueprint(path: string): Promise<CourseBlueprint> {
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw) as CourseBlueprint;
}
