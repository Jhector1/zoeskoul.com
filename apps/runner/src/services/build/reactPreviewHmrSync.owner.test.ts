import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const s=readFileSync(resolve(process.cwd(),"src/services/build/reactPreviewRuntime.ts"),"utf8");
describe("React preview HMR-friendly sync",()=>{
 it("reuses healthy same-project runtime before cold capacity",()=>{
  const a=s.indexOf("await reuseExistingProjectPreview("),b=s.indexOf("reservePreviewCapacity(",a);
  expect(a).toBeGreaterThan(-1);expect(b).toBeGreaterThan(a);
 });
 it("skips unchanged file writes",()=>{
  const a=s.indexOf("async function syncPreviewSourceFiles(");
  const b=s.indexOf("currentBytes.equals(",a),c=s.indexOf("await fs.writeFile(",b);
  expect(b).toBeGreaterThan(a);expect(c).toBeGreaterThan(b);
 });
 it("still fails closed on dependency changes",()=>{
  expect(s).toContain("Preview dependencies changed. Restart the preview.");
 });
});
