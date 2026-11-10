import {describe,it,expect} from "vitest";
import {reconcileManifestAndDatabase, type ReconciliationInput} from "./reconcileManifestAndDatabase";
const base:ReconciliationInput={
 manifestCatalogs:[{slug:"python",status:"active",subjects:["python-v1"]}],
 manifestCourses:[{slug:"python-v1",status:"active"}],
 storedCatalogs:[{slug:"python",status:"active"}],
 storedCourses:[{slug:"python-v1",status:"active",catalogSlug:"python"}],
 overrides:[{kind:"course",slug:"python-v1",hidden:true}],
};
const audit=(changes:Partial<ReconciliationInput>={})=>reconcileManifestAndDatabase({...base,...changes});
describe("manifest/database reconciliation audit (read-only)",()=>{
 it("reports a consistent seeded course without counting a hide override as drift",()=>{
  expect(audit().issues).toEqual([]);
 });
 it("flags active unseeded courses separately from optional coming soon content",()=>{
  const result=audit({manifestCourses:[{slug:"python-v1",status:"active"},{slug:"python-v2",status:"coming_soon"}],manifestCatalogs:[{slug:"python",status:"active",subjects:["python-v1","python-v2"]}],storedCourses:[]});
  expect(result.issues.map(x=>x.code)).toContain("active_course_not_seeded");
  expect(result.issues.map(x=>x.code)).toContain("planned_course_not_seeded");
  expect(result.summary.unseededActiveCourses).toBe(1);
 });
 it("preserves old DB-only courses and catalogs for manual review",()=>{
  const result=audit({storedCatalogs:[...base.storedCatalogs,{slug:"retired",status:"disabled"}],storedCourses:[...base.storedCourses,{slug:"retired-v1",status:"disabled",catalogSlug:"retired"}]});
  expect(result.issues.map(x=>x.code)).toContain("stored_course_not_in_manifest");
  expect(result.issues.map(x=>x.code)).toContain("stored_catalog_not_in_manifest");
 });
 it("detects catalog membership drift without changing course records",()=>{
  expect(audit({storedCourses:[{slug:"python-v1",status:"active",catalogSlug:"other"}]}).issues.map(x=>x.code)).toContain("course_catalog_mismatch");
 });
 it("detects both DB and manifest publication mismatches",()=>{
  const result=audit({storedCourses:[{slug:"python-v1",status:"disabled",catalogSlug:"python"}],storedCatalogs:[{slug:"python",status:"disabled"}]});
  expect(result.issues.map(x=>x.code)).toEqual(expect.arrayContaining(["catalog_status_mismatch","course_status_mismatch"]));
 });
 it("identifies removed manifest references but never deletes overrides",()=>{
  const result=audit({overrides:[{kind:"course",slug:"removed",hidden:true}]});
  expect(result.summary.orphanedOverrides).toBe(1);
  expect(result.issues[0].code).toBe("orphaned_override");
 });
 it("flags malformed manifest membership for CI/admin diagnostics",()=>{
  const result=audit({manifestCatalogs:[{slug:"python",status:"active",subjects:["python-v1","python-v1"]}]});
  expect(result.issues.map(x=>x.code)).toContain("duplicate_course_membership");
 });
});
