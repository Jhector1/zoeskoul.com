import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {parseZoeSemanticIntent} from "./zoeSemanticIntent";

const intentRoute = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts",import.meta.url),"utf8");

describe("Zoé exploratory conversation dispatch",()=>{
  it("teaches the semantic classifier exploratory versus committed work",()=>{
    expect(intentRoute).toContain("First decide conversationMode independently of action");
    expect(intentRoute).toContain("I'm starting a small online clothing store. Can you help me build it?");
    expect(intentRoute).toContain("Do NOT launch the source-editing or inspection workflow");
    expect(intentRoute).toContain("not a keyword or punctuation rule");
    expect(intentRoute).toContain("responseJsonSchema: zoeSemanticIntentSchema()");
    expect(intentRoute).toContain("parseZoeSemanticIntent(parseAiJsonText");
  });
  it("allows normal conversation without any edit-agent dispatch",()=>{
    const mistaken={action:"edit",pagePath:"none",provider:"",reply:"",runtimeSupport:"not-applicable",conversationMode:"discuss"};
    expect(parseZoeSemanticIntent(mistaken).action).toBe("answer");
    expect(parseZoeSemanticIntent({...mistaken,conversationMode:"act"}).action).toBe("edit");
  });
  it("does not change authorizations or edited-file validation",()=>{
    expect(intentRoute).toContain("enforceSameOriginPost(req)");
    expect(intentRoute).toContain("requireZoeAiBillingOperationId");
    expect(intentRoute).toContain("project.sourceVersion !== baseVersion");
  });
});
