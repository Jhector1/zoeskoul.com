import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {previewCapacityRetryDelayMs} from "./previewCapacityRecovery";
const read=(p:string)=>readFileSync(join(process.cwd(),"src",p),"utf8");
describe("V12K12K10 preview capacity backpressure",()=>{
  it("uses a bounded, predictable retry delay",()=>{
    expect(previewCapacityRetryDelayMs("45")).toBe(45000);
    expect(previewCapacityRetryDelayMs("1")).toBe(1000);
    for(const s of [null,"0","61","100000","NaN","-1","2.5",""])
      expect(previewCapacityRetryDelayMs(s)).toBe(45000);
  });
  it("preserves the runner limit as a 429 with Retry-After, not a 502",()=>{
    const route=read("app/api/build/projects/[buildProjectId]/dependency-lock/bootstrap/route.ts");
    expect(route).toContain("isRunnerCapacityError(error.cause)");
    expect(route).toContain('code: "BUILD_RUNNER_CAPACITY_REACHED"');
    expect(route).toContain('response.headers.set("Retry-After", "45")');
    expect(route).toContain("requireRunnerActorKey(userId)");
    expect(route).toContain("executeTrustedDependencyLockBootstrapAtRunner");
  });
  it("waits within a bounded capacity budget while preserving source ownership",()=>{
    const hook=read("components/builder/useReactVitePreview.ts");
    expect(hook).toContain('bootstrapData?.code === "BUILD_RUNNER_CAPACITY_REACHED"');
    expect(hook).toContain("capacityRetries < 4");
    expect(hook).toContain("Date.now() - capacityStartedAt + waitMs > 240_000");
    expect(hook).toContain("if (!mountedRef.current || !bootstrapAllowedRef.current ||");
    expect(hook).toContain("sourceVersionRef.current !== startingVersion) return;");
    expect(hook).toContain("bootstrap = await requestBootstrap()");
    expect(hook).not.toContain("window.sessionStorage.setItem(capacityKey");
    expect(hook).not.toContain("window.sessionStorage.getItem(capacityKey");
    expect(hook).not.toContain("ZoeBuild build capacity reached. Try again later.");
  });
});
