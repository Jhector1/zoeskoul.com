import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
const read = (relative: string) => readFileSync(new URL(relative,import.meta.url),"utf8");

describe("V12K12J2 removes direct static project publishing",()=>{
  it("accepts only a trusted React/Vite compilation",()=>{
    const api=read("../../app/api/build/projects/[buildProjectId]/publish/route.ts");
    expect(api).toContain("trustedReact");
    expect(api).not.toContain("directStatic");
    expect(api).not.toContain("createPrismaSelfHostedStaticPublisher");
    expect(api).toContain("createRegisteredProductionBuildJob");
  });
  it("serves only pinned compiled dist bytes, not HTML/JS from source revision",()=>{
    const site=read("../../app/sites/[buildProjectId]/[[...path]]/route.ts");
    expect(site).toContain('artifact.outputPath !==');
    expect(site).toContain('"dist"');
    expect(site).toMatch(/compiledFile\s*\.content/);
    expect(site).not.toContain('buildPublishedStaticFileMap');
    expect(existsSync(new URL("./publishBuildProject.ts",import.meta.url))).toBe(false);
  });
});
