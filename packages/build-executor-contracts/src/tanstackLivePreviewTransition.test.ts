import { describe, expect, it } from "vitest";
import { classifyTanstackPreviewTransition } from "./tanstackLivePreviewTransition";
import type { ProductionBuildJobRequestV1 } from "./index";

const previous: ProductionBuildJobRequestV1 = {
  protocolVersion: 1, operation: "production-build", buildProjectId: "project-a",
  sourceVersion: 5, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
  files: [
    {path:"package.json", content:"{}"},
    {path:"pnpm-lock.yaml", content:"lock"},
    {path:"zoebuild-dependency-approval.json", content:"signed"},
    {path:"src/routes/index.tsx", content:"old"},
  ],
};
function next(files: ProductionBuildJobRequestV1["files"], sourceVersion=6): ProductionBuildJobRequestV1 {
  return {...previous, files, sourceVersion};
}
const edit = (path:string, value:string) => next(previous.files.map(file =>
  file.path === path ? {...file,content:value}:file));
const classify = (mode:"development"|"immutable", request:ProductionBuildJobRequestV1) =>
  classifyTanstackPreviewTransition({mode, previous, next:request});

describe("V1 isolated TanStack live-preview admission policy", () => {
  it("never modifies immutable versioned preview on a source change", () => {
    expect(classify("immutable",edit("src/routes/index.tsx","new"))).toMatchObject({
      action:"restart",reason:"immutable_lease",
    });
  });
  it("only proposes bounded source edits on an explicit development lease", () => {
    expect(classify("development",edit("src/routes/index.tsx","new"))).toMatchObject({
      action:"live_candidate",reason:"eligible_source_change",changedPaths:["src/routes/index.tsx"],
    });
  });
  it("admits the existing canonical root stylesheet across forward revisions only on development leases", () => {
    const base = {...previous, files:[...previous.files,{path:"src/styles.css",content:"body {color:red}"}]};
    const updated = {...base, sourceVersion:8, files:base.files.map(file => file.path === "src/styles.css" ? {...file,content:"body {color:blue}"} : file)};
    expect(classifyTanstackPreviewTransition({mode:"development",previous:base,next:updated})).toMatchObject({action:"live_candidate",changedPaths:["src/styles.css"]});
    expect(classifyTanstackPreviewTransition({mode:"immutable",previous:base,next:updated})).toMatchObject({action:"restart"});
    for (const pathname of ["src/router.tsx","src/server/secret.ts","src/other.css","src/styles.css.ts","vite.config.ts","wrangler.jsonc"]) {
      expect(classifyTanstackPreviewTransition({mode:"development",previous:base,next:{...updated,files:[...updated.files,{path:pathname,content:"changed"}]}})).toMatchObject({action:"restart",reason:"protected_files_changed"});
    }
  });
  it("never live-updates dependencies, signed approvals or configuration", () => {
    for (const filename of ["package.json","pnpm-lock.yaml","zoebuild-dependency-approval.json"]) {
      expect(classify("development", edit(filename,"changed"))).toMatchObject({
        action:"restart",reason:"dependencies_changed",
      });
    }
    const withConfig=next([...previous.files,{path:"vite.config.ts",content:"changed"}]);
    expect(classify("development",withConfig)).toMatchObject({action:"restart",reason:"protected_files_changed"});
  });
  it("blocks older source revisions, cross-project requests and unsaved drafts", () => {
    expect(classify("development",next(previous.files,4))).toMatchObject({action:"reject",reason:"invalid_revision"});
    expect(classify("development",{...edit("src/routes/index.tsx","new"),buildProjectId:"project-b"}))
      .toMatchObject({action:"reject",reason:"wrong_project"});
    expect(classifyTanstackPreviewTransition({mode:"development",previous,
      next:edit("src/routes/index.tsx","new"),hasUnsavedChanges:true}))
      .toMatchObject({action:"hold",reason:"unsaved_source"});
  });
  it("refuses same-version changed bytes and unsafe or duplicate file paths", () => {
    expect(classify("development",next(edit("src/routes/index.tsx","new").files,5)))
      .toMatchObject({action:"reject",reason:"invalid_revision"});
    for (const pathname of ["../escape.tsx","/absolute.tsx","src/routes/../../escape.tsx","src\\routes\\index.tsx"]) {
      expect(classify("development",next([...previous.files,{path:pathname,content:"x"}])))
        .toMatchObject({action:"reject",reason:"invalid_files"});
    }
    expect(classify("development",next([...previous.files,{path:"SRC/routes/INDEX.tsx",content:"x"}])))
      .toMatchObject({action:"reject",reason:"invalid_files"});
  });
  it("does not rebind an immutable version even when bytes happen to match", () => {
    expect(classify("immutable",next(previous.files))).toMatchObject({action:"restart",reason:"immutable_lease"});
    expect(classify("development",next(previous.files))).toMatchObject({action:"restart",reason:"immutable_lease"});
    expect(classify("development",next(previous.files,5))).toMatchObject({action:"unchanged",reason:"unchanged"});
  });
});

describe("versioned static images use the trusted binary writer, not text HMR", () => {
  const asset={path:"public/images/image.png",encoding:"base64" as const,
    mimeType:"image/png" as const,data:"YWJj",sizeBytes:3,
    checksum:`sha256:${"a".repeat(64)}`};
  const withImage={...previous,binaryFiles:[asset]};
  it("admits image creation, replacement, deletion and source+image changes", () => {
    const replaced={...asset, data:"YWJk"};
    for (const updated of [
      {...withImage,sourceVersion:6},
      {...withImage,sourceVersion:6,binaryFiles:[replaced]},
      {...previous,sourceVersion:6},
      {...edit("src/routes/index.tsx","new"),binaryFiles:[replaced]},
    ]) {
      const previousRequest = updated.binaryFiles?.length &&
        updated.binaryFiles[0].data === asset.data ? previous : withImage;
      const result=classifyTanstackPreviewTransition({mode:"development",previous:previousRequest,next:updated});
      expect(result).toMatchObject({action:"live_candidate",reason:"eligible_public_asset_change"});
    }
  });
  it("requires controlled restart for protected asset locations and immutable previews", () => {
    for (const path of ["src/secret.png","public/docs/note.pdf","public/.hidden.png"]) {
      const changed={...asset,path};
      expect(classifyTanstackPreviewTransition({mode:"development",previous,
        next:{...previous,sourceVersion:6,binaryFiles:[changed]}}))
        .toMatchObject({action:"restart",reason:"protected_files_changed"});
    }
    // Traversal is structurally invalid and must be rejected before any restart.
    expect(classifyTanstackPreviewTransition({mode:"development",previous,
      next:{...previous,sourceVersion:6,binaryFiles:[{...asset,path:"public/../secret.png"}]}}))
      .toMatchObject({action:"reject",reason:"invalid_files"});
    expect(classifyTanstackPreviewTransition({mode:"immutable",previous,
      next:{...withImage,sourceVersion:6}})).toMatchObject({action:"restart",reason:"immutable_lease"});
  });
  it("rejects same-version mutations and case alias collisions", () => {
    expect(classifyTanstackPreviewTransition({mode:"development",previous:withImage,
      next:{...withImage,binaryFiles:[{...asset,data:"YWJk"}]}}))
      .toMatchObject({action:"reject",reason:"invalid_revision"});
    expect(classifyTanstackPreviewTransition({mode:"development",previous:withImage,
      next:{...withImage,sourceVersion:6,binaryFiles:[{...asset,path:"PUBLIC/IMAGES/IMAGE.PNG"}]}}))
      .toMatchObject({action:"reject",reason:"invalid_files"});
  });
});
