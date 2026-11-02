import { describe, expect, it } from "vitest";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
const base: ProductionBuildJobRequestV1 = {
  protocolVersion: 1, operation: "production-build", buildProjectId: "test-project",
  sourceVersion: 1, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
  files: [
    { path: "package.json", content: JSON.stringify({packageManager:"pnpm@10.33.0",scripts:{build:"vite build && tsc --noEmit"}}) },
    { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
    { path: "vite.config.ts", content: "export default {}" },
    { path: "wrangler.jsonc", content: "{}" },
    { path: "src/router.tsx", content: "export {}" },
    { path: "src/routes/__root.tsx", content: "export {}" },
  ],
};
describe("staged TanStack isolated build entry", () => {
  it("accepts only canonical server-capable requests", () => {
    expect(() => assertTanstackWorkerBuildRequest(base)).not.toThrow();
    expect(() => assertTanstackWorkerBuildRequest({...base,stackId:"react-vite-v1"})).toThrow(/canonical/);
    expect(() => assertTanstackWorkerBuildRequest({...base,templateId:"react-vite-v1"})).toThrow(/canonical/);
  });
  it("requires SSR sources and known build scripts", () => {
    expect(() => assertTanstackWorkerBuildRequest({...base,files:base.files.filter(f=>f.path!=="src/router.tsx")})).toThrow(/router/);
    expect(() => assertTanstackWorkerBuildRequest({...base,files:base.files.map(f=>f.path==="package.json"?{...f,content:'{"scripts":{"build":"sh ./malicious.sh"}}'}:f)})).toThrow(/canonical/);
  });
});
