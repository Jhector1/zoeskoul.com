import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("public challenge AI architecture", () => {
  it("keeps the AI owner course agnostic", () => {
    const ai = read("./publicChallengeAiCopy.ts");
    expect(ai).toContain("resolvePublicChallengeCopyContext");
    expect(ai).not.toContain("getSqlDataset");
    expect(ai).not.toContain("datasetId");
    expect(ai).not.toMatch(/\bSELECT\b/);
    expect(ai).not.toMatch(/\bUPDATE\b/);
  });

  it("keeps SQL enrichment behind the adapter", () => {
    const sql = read("./publicChallengeCopyContextSql.ts");
    expect(sql).toContain("getSqlDataset");
    expect(sql).toContain('id: "runtime-sql"');
  });

  it("owns story variation generically", () => {
    const context = read("./publicChallengeCopyContext.ts");
    const ai = read("./publicChallengeAiCopy.ts");
    expect(context).toContain("STORY_FRAMES");
    expect(context).toContain("stableIndex");
    expect(ai).toContain("Do NOT repeatedly start with 'Imagine you are'");
  });
});
