import { describe, expect, it } from "vitest";
import { classifyTanstackPreviewTransition, isTanstackLiveBinaryPath } from "./tanstackLivePreviewTransition";
import type { ProductionBuildJobRequestV1 } from "./index";

const bytes = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const file = (path:string, checksum:string) => ({path,encoding:"base64" as const,data:bytes,
  mimeType:"image/png" as const,sizeBytes:68,checksum});
const digest1 = `sha256:${"a".repeat(64)}`;
const digest2 = `sha256:${"b".repeat(64)}`;
const old:ProductionBuildJobRequestV1 = {protocolVersion:1,operation:"production-build",buildProjectId:"p",
  sourceVersion:1,stackId:"tanstack-start-v1",templateId:"tanstack-start-v1",
  files:[{path:"src/routes/index.tsx",content:"hi"}],
  binaryFiles:[file("public/images/logo.png",digest1)]};
const next = (binaryFiles:ProductionBuildJobRequestV1["binaryFiles"],version=2):ProductionBuildJobRequestV1 =>
  ({...old,sourceVersion:version,binaryFiles});
const classify = (candidate:ProductionBuildJobRequestV1, mode:"development"|"immutable"="development") =>
  classifyTanstackPreviewTransition({mode,previous:old,next:candidate});

describe("saved public image live-preview transition",()=>{
  it("admits verified public PNG replacement without changing the preview lease",()=>{
    expect(classify(next([file("public/images/logo.png",digest2)]))).toMatchObject({
      action:"live_candidate",changedPaths:["public/images/logo.png"]});
  });
  it("admits image rename/move as deletion plus addition",()=>{
    expect(classify(next([file("public/assets/renamed.png",digest1)]))).toMatchObject({
      action:"live_candidate",changedPaths:["public/assets/renamed.png","public/images/logo.png"]});
  });
  it("requires restart for private/non-public binary, immutable lease and protected text",()=>{
    expect(classify(next([file("src/assets/logo.png",digest2)]))).toMatchObject({action:"restart"});
    expect(classify(next([file("public/images/logo.png",digest2)]),"immutable")).toMatchObject({action:"restart"});
    expect(classify({...next([file("public/images/logo.png",digest2)]),files:[
      ...old.files,{path:"package.json",content:'{"new":true}'}]})).toMatchObject({action:"restart"});
  });
  it("rejects non-image and hidden/public traversal destinations",()=>{
    for(const name of ["public/.env", "public/images/.private.png", "public/images/../logo.png",
      "src/assets/logo.png","public/images/x.svg","public/images/x.png/extra"])
      expect(isTanstackLiveBinaryPath(name)).toBe(false);
    expect(isTanstackLiveBinaryPath("public/images/logo.png")).toBe(true);
    expect(isTanstackLiveBinaryPath("public/logo.webp")).toBe(true);
  });
});
