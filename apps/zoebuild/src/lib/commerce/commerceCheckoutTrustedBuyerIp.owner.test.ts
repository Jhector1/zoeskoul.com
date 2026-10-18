import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("checkout trusted request context across surfaces", () => {
  it("threads verified proof into checkout runtime and execution context", () => {
    const runtime = read("apps/zoebuild/src/lib/commerce/commerceRuntime.ts");
    const begin = runtime.split("export async function beginCommerceCheckout(")[1];
    expect(begin).toBeDefined();
    expect(begin).toContain("verifiedBuyerIp?: VerifiedCommerceBuyerIp | null");
    expect(begin).toContain("verifiedBuyerIp: verifiedBuyerIp ?? undefined");
  });

  it("requires signed ingress proof for all three checkout entry points", () => {
    const published = read("apps/zoebuild/src/app/sites/[buildProjectId]/[[...path]]/route.ts");
    const draft = read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts");
    const proxy = read("apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/preview/route.ts");
    expect(published.split("await beginCommerceCheckout(")[1]).toContain("trustedCommerceBuyerIpFromRequest(request)");
    expect(draft.split("await beginCommerceCheckout(")[1]).toContain("trustedCommerceBuyerIpFromRequest(req)");
    expect(proxy.split("return beginCommerceCheckout(")[1]).toContain("verifiedBuyerIp,");
    expect(proxy).toContain("trustedCommerceBuyerIpFromRequest(request)");
  });
});
