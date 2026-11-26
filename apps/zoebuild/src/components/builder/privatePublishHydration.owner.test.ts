import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
const read=(p:string)=>readFileSync(resolve(__dirname,"../../..",p),"utf8");
describe("owner-scoped publishing hydration wiring",()=>{
 const page=read("src/app/[locale]/projects/[buildProjectId]/page.tsx");
 const shell=read("src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
 const provider=read("src/components/builder/PublishProjectButton.tsx");
 it("passes the owner-scoped eligibility rather than exposing environment configuration",()=>{
  expect(page).toContain('privateHydrationAllowed={canHydratePrivatePublishing(project,access.userId) || (process.env.NODE_ENV === "development" && process.env.VERCEL_ENV !== "production" && process.env.ZOEBUILD_PUBLISH_ENABLED === "0" && process.env.ZOEBUILD_HOSTED_PUBLISH_DEV === "1" && process.env.ZOEBUILD_HOSTED_FENCED_DEV === "1" && project.buildProjectId === "cmwvhcusk0002u0dlwhxh9uh2" && process.env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT === project.buildProjectId && !!access.userId && access.userId === process.env.ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER) || (await import("@/lib/build/hostedProductionPolicy")).productionHostedUiAllowed(project.buildProjectId,access.userId,project.stackId,process.env)}');
  expect(shell).toContain("privateHydrationAllowed={props.privateHydrationAllowed}");
  expect(provider).not.toContain("ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER");
 });
 it("gates background hydration and direct private management requests",()=>{
  expect(provider).toContain('props.privateHydrationAllowed===true && (process.env.NODE_ENV==="production" || (process.env.NODE_ENV==="development" && window.location.origin==="http://localhost:3004"))');
  expect(provider).toContain("if (!canReadPrivate()) return null;");
  expect(provider).toContain("if (!canReadPrivate()) {\n      setChecking(false);");
  expect(provider).toContain("if (!canReadPrivate() || operation.current) return;");
  expect(provider).toContain("if (!canReadPrivate() || !history || operation.current) return;");
 });
});
