import {describe,expect,it} from "vitest";
import { assertOperatorCanaryEnvironment, canaryBuildRequest, validateOperatorCanarySource } from "./tanstackCanaryPolicy.js";

const pkg = JSON.stringify({packageManager:"pnpm@10.33.0",dependencies:{
  "@tanstack/react-router":"1.170.46","@tanstack/react-start":"1.169.4",react:"19.2.3","react-dom":"19.2.3",
},devDependencies:{
  "@cloudflare/vite-plugin":"1.64.0","@types/react":"19.2.14","@types/react-dom":"19.2.3",
  "@vitejs/plugin-react":"6.0.4",typescript:"6.0.3",vite:"8.1.5",wrangler:"4.156.1",
}});
const names=["vite.config.ts","wrangler.jsonc","tsconfig.json","src/router.tsx",
  "src/routes/__root.tsx","src/routes/index.tsx","src/routes/about.tsx", "src/routes/api.health.ts",
  "src/functions/siteInfo.functions.ts","src/server/siteInfo.server.ts"];
const files=[{path:"package.json",content:pkg},...names.map(path=>({path,content:path.includes("api.health")?"GET: async () => null":path.includes("functions")?"createServerFn": "canonical"}))];
const bundle={format:1,templateId:"tanstack-start-v1",files};
const env={RUNNER_EXECUTION_POOL:"zoebuild",ZOEBUILD_P3B3_OPERATOR_CANARY:"I_ACKNOWLEDGE_MAINTENANCE",
  ZOEBUILD_TANSTACK_PREVIEW_START_ENABLED:"false",ZOEBUILD_DEPENDENCY_APPROVAL_SECRET:"x".repeat(32),
  RUNNER_IMAGE:`ghcr.io/jhector1/zoeskoul-runtime@sha256:${"a".repeat(64)}`};

describe("operator-only P3B3 acceptance policy",()=>{
  it("refuses normal service launch, Learning, startup flag, and mutable runtime",()=>{
    expect(()=>assertOperatorCanaryEnvironment(env)).not.toThrow();
    for(const override of [
      {ZOEBUILD_P3B3_OPERATOR_CANARY:"false"},{RUNNER_EXECUTION_POOL:"zoeskoul-learning"},
      {ZOEBUILD_TANSTACK_PREVIEW_START_ENABLED:"true"},{RUNNER_IMAGE:"ghcr.io/jhector1/zoeskoul-runtime:prod"},
      {ZOEBUILD_DEPENDENCY_APPROVAL_SECRET:"short"},
    ]) expect(()=>assertOperatorCanaryEnvironment({...env,...override})).toThrow();
  });
  it("accepts only the reviewed canonical dependency set",()=>{
    expect(validateOperatorCanarySource(bundle)).toEqual(files);
    const request=canaryBuildRequest("p3b3-owner",[...files,{path:"pnpm-lock.yaml",content:"lock"}]);
    expect(request.buildProjectId).toBe("p3b3-owner");
    expect(request.stackId).toBe("tanstack-start-v1");
    expect(()=>validateOperatorCanarySource({...bundle,files:files.filter(f=>f.path!=="vite.config.ts")})).toThrow();
    expect(()=>validateOperatorCanarySource({...bundle,files:[...files,{path:".npmrc",content:"registry=bad"}]})).toThrow();
    expect(()=>validateOperatorCanarySource({...bundle,files:[...files,{path:"pnpm-lock.yaml",content:"forged"}]})).toThrow();
    expect(()=>validateOperatorCanarySource({...bundle,files:files.map(f=>f.path==="package.json"?{
      ...f,content:f.content.replace('"vite":"8.1.5"','"vite":"8.1.6"')}:f)})).toThrow();
  });
  it("rejects unsupported templates and client-issued approval",()=>{
    expect(()=>validateOperatorCanarySource({...bundle,templateId:"react-vite-v1"})).toThrow();
    expect(()=>validateOperatorCanarySource({...bundle,files:[...files,
      {path:"zoebuild-dependency-approval.json",content:"{}"}]})).toThrow();
  });
});
