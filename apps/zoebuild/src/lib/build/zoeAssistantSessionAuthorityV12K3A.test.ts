import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

describe("V12K3A session-authority distinction",()=>{
  const routes=["context","intent","answer","edit"];
  it("requires Web-verified identity for every AI request and distinguishes downtime from expiry",()=>{
    for(const routeName of routes){
      const code=source(`../../app/api/build/projects/[buildProjectId]/assistant/${routeName}/route.ts`);
      expect(code).toContain("{requireAuthority:true}");
      expect(code).toContain('code:"SESSION_AUTHORITY_UNAVAILABLE"');
      expect(code).toContain("503");
      expect(code).toMatch(/code:\s*"BUILD_AUTH_REQUIRED"/);
      expect(code).toContain("401");
    }
  });
  it("applies the same verified auth policy to the write endpoint",()=>{
    const code=source("../../app/api/build/projects/[buildProjectId]/assistant/edit/route.ts");
    expect(code.match(/loadCurrentBuildAccessSnapshot\(req, \{requireAuthority:true\}\)/g)).toHaveLength(2);
    expect(code).toContain("saveBuildProjectSourceCommand");
    expect(code).toContain("project.sourceVersion !== body.baseVersion");
  });
  it("never triggers reconnect for transient verification outages",()=>{
    const code=source("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(code).toContain('response.status === 503 && payload?.code === "SESSION_AUTHORITY_UNAVAILABLE"');
    expect(code).toContain('intentResponse.status === 503 && intentResult?.code === "SESSION_AUTHORITY_UNAVAILABLE"');
    expect(code).toContain('answerResponse.status === 503 && failure?.code === "SESSION_AUTHORITY_UNAVAILABLE"');
    expect(code).toContain('editResponse.status === 503 && editResult?.code === "SESSION_AUTHORITY_UNAVAILABLE"');
    expect(code).toContain('setAssistantAuthNeeded(true)');
    expect(code).toContain('assistantRequestInFlight.current');
    expect(code).toContain('Reconnect Zoéskoul session');
  });
  it("preserves model authorization, rate limiting and billing operation identity",()=>{
    for(const routeName of ["intent","answer","edit"]){
      const code=source(`../../app/api/build/projects/[buildProjectId]/assistant/${routeName}/route.ts`);
      expect(code).toContain("enforceSameOriginPost(req)");
      expect(code).toContain("rateLimit(");
      expect(code).toContain("requireZoeAiBillingOperationId(");
    }
  });
});
