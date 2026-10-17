import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
describe("ZoeBuild React preview route reuse",()=>{
 const hook=read("src/components/builder/useReactVitePreview.ts");
 const shell=read("src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
 it("uses locale-aware client navigation",()=>{
  expect(shell).toContain('import Link from "next/link";');
  expect(shell).toContain('href={`/${encodeURIComponent(props.locale)}/projects`}');
 });
 it("caches descriptors and aligns route reuse grace with runner idle cleanup",()=>{
  expect(hook).toContain("previewSessionCache");
  expect(hook).toContain("PREVIEW_ROUTE_REUSE_GRACE_MS");
  expect(hook).toContain("10 * 60_000");
  expect(hook).toContain("schedulePreviewRelease(");
 });
 it("recovers only expired or incompatible sessions",()=>{
  expect(hook).toContain('"PREVIEW_EXPIRED"');
  expect(hook).toContain('"PREVIEW_RESTART_REQUIRED"');
  expect(hook).toContain("await cancelCurrent();");
  expect(hook).toContain("await start();");
 });
});
