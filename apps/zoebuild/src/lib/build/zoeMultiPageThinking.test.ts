import {describe, expect, it, vi} from "vitest";
// Pure file-create contract test. Full canonical workspace validation is separately
// owned by buildWorkspaceMutation; browser acceptance exercises the real save path.
vi.mock("./buildWorkspaceMutation", () => ({parseBuildWorkspaceMutation: (value: unknown) => value}));
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import type { ZoeSourceEdit } from "./zoeTargetedSourceEdit";
import {sha256, requestedStaticPage, validateZoeEdits, assertStaticPageProposal,
  applyZoeEditsToWorkspace} from "./zoeTargetedSourceEdit";
import {readZoeEditEventStream} from "./zoeEditEventStream";
import {linkZoeStaticPageInHome} from "./zoeStaticPageLinks";

const home = `<!doctype html><html><head><title>Shop</title></head><body><h1>Shop</h1></body></html>`;
const updated = linkZoeStaticPageInHome(home, "privacy.html");
const privacy = `<!doctype html><html><head><title>Privacy Policy</title></head><body><h1>Privacy Policy</h1><a href="index.html">Home</a></body></html>`;
const workspace = {nodes: [{id:"home",kind:"file",name:"index.html",content:home,parentId:null,
  binary:false,language:"html",createdAt:1,updatedAt:1}],leftPct:50,rightPct:50} as unknown as WorkspaceStateV2;
const edits: readonly ZoeSourceEdit[] = [
  {path:"index.html", content:updated, beforeSha256:sha256(home)},
  {path:"privacy.html",content:privacy,beforeSha256:sha256(""),create:true},
];

describe("ZoeBuild real static pages",()=>{
  it("recognizes real page creation requests including private/privacy typo",()=>{
    expect(requestedStaticPage("add a private policy page")).toBe("privacy.html");
    expect(requestedStaticPage("Create a Privacy Policy page")).toBe("privacy.html");
    expect(requestedStaticPage("put the privacy policy in its own page")).toBe("privacy.html");
    expect(requestedStaticPage("Move the About section to a separate page")).toBe("about.html");
    expect(requestedStaticPage("Separate the contact information into its own page")).toBe("contact.html");
    expect(requestedStaticPage("Please put the FAQ on its own URL")).toBe("faq.html");
    expect(requestedStaticPage("change the hero")).toBeNull();
  });
  it("accepts new privacy.html and homepage link as an atomic reviewed proposal",()=>{
    const valid=validateZoeEdits(workspace,edits);
    expect(valid[1]?.create).toBe(true);
    expect(()=>assertStaticPageProposal("privacy.html",valid,false)).not.toThrow();
    const next=applyZoeEditsToWorkspace(workspace,valid);
    expect(next.nodes.filter(node=>node.kind==="file").map(node=>node.name))
      .toEqual(["index.html","privacy.html"]);
  });
  it("rejects section-only proposals and arbitrary file creation",()=>{
    expect(()=>assertStaticPageProposal("privacy.html",validateZoeEdits(workspace,[edits[0]]),false))
      .toThrow("The proposal must include a real HTML page");
    expect(()=>validateZoeEdits(workspace,[{...edits[1],path:"secrets.ts"}]))
      .toThrow("Edit target or content is invalid");
  });
  it("rejects stale creation, duplicate files, or missing linked home",()=>{
    expect(()=>validateZoeEdits(workspace,[{...edits[1],beforeSha256:sha256("incorrect")}]))
      .toThrow("Project source changed; request a fresh proposal");
    expect(()=>assertStaticPageProposal("privacy.html",[
      {path:"index.html",content:home,beforeSha256:sha256(home)},edits[1]
    ],false)).toThrow("The proposal must include a real HTML page");
  });
});

describe("ZoeBuild authentic reasoning UI stream",()=>{
  it("receives real summary deltas and validated proposal without fabricated text",async()=>{
    const events=[
      'event: status\ndata: {"phase":"model_requested"}\n\n',
      'event: reasoning\ndata: {"delta":"Reviewed the page structure."}\n\n',
      'event: proposal\ndata: {"ok":true,"proposal":{"baseVersion":1,"summary":"Added page","edits":[]}}\n\n',
    ].join("");
    const bytes=new TextEncoder().encode(events);
    const response=new Response(new ReadableStream({start(controller){
      controller.enqueue(bytes.slice(0,37));controller.enqueue(bytes.slice(37));controller.close();
    }}),{headers:{"Content-Type":"text/event-stream"}});
    const deltas:string[]=[];const phases:string[]=[];
    const output=await readZoeEditEventStream({response,onReasoning:delta=>deltas.push(delta),onStatus:phase=>phases.push(phase)});
    expect(phases).toEqual(["model_requested"]);
    expect(deltas).toEqual(["Reviewed the page structure."]);
    expect(output.proposal?.summary).toBe("Added page");
    expect(output.clarification).toBeNull();
  });
  it("accepts a completed clarification without producing a fake source edit",async()=>{
    const response=new Response('event: status\ndata: {"phase":"model_requested"}\n\n'+
      'event: clarification\ndata: {"ok":true,"clarification":"What should change about the header?"}\n\n');
    const output=await readZoeEditEventStream({response,onReasoning:()=>{},onStatus:()=>{}});
    expect(output.proposal).toBeNull();
    expect(output.clarification).toBe("What should change about the header?");
  });
  it("rejects truncated stream without inventing a proposal",async()=>{
    const response=new Response("event: status\ndata: {\"phase\":\"model_requested\"}\n\n");
    await expect(readZoeEditEventStream({response,onReasoning:()=>{},onStatus:()=>{}}))
      .rejects.toThrow("without a validated proposal");
  });
});
