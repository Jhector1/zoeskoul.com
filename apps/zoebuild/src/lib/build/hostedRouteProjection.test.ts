import assert from "node:assert/strict";
import { test, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { PrismaClient } from "@zoeskoul/db";
import { projectHostedRoutes, HOSTED_ROUTE_LEASE_MS } from "./hostedRouteProjection";
const A = "alpha.sites.zoebuild.test", B = "beta.sites.zoebuild.test";
const scope = {projectIds:["project-alpha", "project-beta"], legacyProjectId:"legacy-project"};
type Row = {id:string; hostedHostname:{hostname:string}|null};
function fixture(rows: Row[]) {
  let calls=0;
  const client = {$transaction: async (fn:(tx:unknown)=>Promise<unknown>, options:unknown) => {
    calls++; assert.deepEqual(options,{isolationLevel:"RepeatableRead"});
    return fn({buildProject:{findMany:async (query:unknown)=>{
      assert.deepEqual(query,{where:{id:{in:scope.projectIds},status:{not:"archived"},stackId:"tanstack-start-v1",codeProject:{archivedAt:null}},select:{id:true,hostedHostname:{select:{hostname:true}}}});
      return rows;
    }}});
  }} as unknown as PrismaClient;
  return {client,calls:()=>calls};
}
function run(name:string, fn:()=>Promise<void>) {
  test(name, async()=>{
    const keys=["NODE_ENV","VERCEL_ENV","ZOEBUILD_PUBLISH_ENABLED","ZOEBUILD_HOSTED_HOSTNAMES_ENABLED","ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED"] as const;
    const old=keys.map(k=>process.env[k]);
    Object.assign(process.env,{NODE_ENV:"development",VERCEL_ENV:"development",ZOEBUILD_PUBLISH_ENABLED:"0",ZOEBUILD_HOSTED_HOSTNAMES_ENABLED:"1",ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED:"1"});
    try {await fn();} finally {keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:Reflect.set(process.env,k,old[i]));}
  });
}
run("projects exact database hostnames with a bounded lease", async()=>{
  const f=fixture([{id:scope.projectIds[0],hostedHostname:{hostname:A}},{id:scope.projectIds[1],hostedHostname:{hostname:B}}]);
  const s=await projectHostedRoutes(f.client,scope);
  assert.deepEqual({...s.routes},{[A]:scope.projectIds[0],[B]:scope.projectIds[1]});
  assert.equal(s.expiresAtMs-s.issuedAtMs,HOSTED_ROUTE_LEASE_MS); assert.equal(f.calls(),1);
});
run("missing or unreserved project has no route",async()=>{
  const s=await projectHostedRoutes(fixture([{id:scope.projectIds[0],hostedHostname:null}]).client,scope); assert.deepEqual({...s.routes},{});
});
run("rejects invalid operator scope before reads",async()=>{
  const f=fixture([]);
  for(const projectIds of [[],["legacy-project"],["project-alpha","project-alpha"],["bad"],["project-alpha","project-beta","project-gamma"]]) await assert.rejects(projectHostedRoutes(f.client,{...scope,projectIds}),/INVALID_HOSTED_ROUTE_SCOPE/);
  assert.equal(f.calls(),0);
});
run("rejects unsafe database hostname or duplicate result",async()=>{
  for(const rows of [[{id:scope.projectIds[0],hostedHostname:{hostname:"admin.sites.zoebuild.test"}}],[{id:"unknown-project",hostedHostname:{hostname:A}}],[{id:scope.projectIds[0],hostedHostname:{hostname:A}},{id:scope.projectIds[1],hostedHostname:{hostname:A}}],[{id:scope.projectIds[0],hostedHostname:null},{id:scope.projectIds[0],hostedHostname:null}]]) await assert.rejects(projectHostedRoutes(fixture(rows).client,scope),/INVALID_HOSTED_ROUTE_ROW/);
});
run("disabled modes never query",async()=>{
  const f=fixture([]);
  process.env.ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED="0";await assert.rejects(projectHostedRoutes(f.client,scope),/DISABLED/);
  process.env.ZOEBUILD_HOSTED_DATABASE_ROUTES_ENABLED="1";process.env.VERCEL_ENV="production";await assert.rejects(projectHostedRoutes(f.client,scope),/DISABLED/);
  assert.equal(f.calls(),0);
});
run("database failure does not yield a route snapshot",async()=>{
  const client={$transaction:async()=>{throw new Error("DB_DOWN")}} as unknown as PrismaClient;
  await assert.rejects(projectHostedRoutes(client,scope),/DB_DOWN/);
});
