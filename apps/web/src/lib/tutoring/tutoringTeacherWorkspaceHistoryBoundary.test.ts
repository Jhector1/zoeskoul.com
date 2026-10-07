import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd());
const repoRoot = cwd.endsWith("/apps/web")
  ? resolve(cwd, "../..")
  : cwd;
const service = readFileSync(
  resolve(repoRoot, "apps/web/src/lib/tutoring/tutoringRequestService.ts"),
  "utf8",
);
const client = readFileSync(
  resolve(repoRoot, "apps/teacher/src/features/tutoring/teacherTutoringClient.ts"),
  "utf8",
);

describe("Teacher tutoring workspace history boundary", () => {
  it("keeps active queue semantics and adds bounded terminal history", () => {
    expect(service).toContain('const openStatuses = ["requested", "assigned", "scheduled"] as const');
    expect(service).toContain('const terminalStatuses = ["completed", "canceled"] as const');
    expect(service).toContain('take: 100');
    expect(service).toContain('return { pool, requests, history }');
  });

  it("exposes history through the existing Teacher tutoring client", () => {
    expect(client).toContain("history: TeacherTutoringRequest[]");
    expect(client).toContain("history: queue.history ?? []");
    expect(client).not.toContain("prisma");
  });
});
