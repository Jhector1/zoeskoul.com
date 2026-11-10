import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"../../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
describe("admin discovery visibility boundary",()=>{
 it("filters both catalog listings and direct catalog detail",()=>{
  const source=read("apps/web/src/lib/subjects/server/catalogVisibility.ts");
  expect(source).toContain("hidden.catalogs.has(catalogSlug)");
  expect(source).toContain("hidden.courses.has(subject.slug)");
 });
 it("only authenticated admins may mutate visibility",()=>{
  const source=read("apps/web/src/app/api/admin/learning-visibility/route.ts");
  expect(source).toContain("requireAdmin(req)");
  expect(source).toContain("isAppMutationOriginAllowed(req)");
 });
 it("uses existing catalog and course metadata instead of the obsolete table",()=>{
  const source=read("apps/web/src/lib/subjects/server/learningDiscoveryVisibility.ts");
  expect(source).toContain("prisma.practiceCatalog.findMany");
  expect(source).toContain("prisma.practiceSubject.findMany");
  expect(source).not.toContain("prisma.learningDiscoveryVisibility");
  const seeder=read("packages/db/prisma/seed/runSeed.ts");
  expect(seeder).toContain("FOR UPDATE");
  expect(seeder).toContain("seedMetaPreservingDiscoveryFlag");
 });
 it("reuses existing actor-scoped BoardToolPane",()=>{
  const source=read("apps/web/src/app/(public)/[locale]/(playground)/sandbox/board/SandboxBoardClient.tsx");
  expect(source).toContain('scopeKey:"personal"');
  expect(source).toContain('BoardToolPane');
 });
});
