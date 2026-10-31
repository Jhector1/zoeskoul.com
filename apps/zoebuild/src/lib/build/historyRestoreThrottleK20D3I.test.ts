import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const route = readFileSync(new URL("../../app/api/build/projects/[buildProjectId]/source-history/route.ts", import.meta.url),"utf8");

describe("K20D3I usable, bounded source-history switches",()=>{
  it("permits regular owner-authorized React version review with burst protection",()=>{
    expect(route).toContain('project.stackId === "react-vite-v1" ? 120 : 6');
    expect(route).toContain('bucket:"zoebuild-source-restore",limit:hourlyLimit,window:"1 h"');
    expect(route).toContain('bucket:"zoebuild-source-restore-burst",limit:12,window:"1 m"');
    expect(route).toContain('rateLimit(guard.key');
  });
  it("keeps authorization and CAS fencing before the limiter, and never retries a restore",()=>{
    const ownerCheck = route.indexOf('const {access, project} = await owner(req, ctx);', route.indexOf('export async function POST'));
    const staleCheck = route.indexOf('project.sourceVersion !== restore.baseVersion', ownerCheck);
    const limiter = route.indexOf('const hourlyLimit = project.stackId', staleCheck);
    expect(ownerCheck).toBeGreaterThan(-1);
    expect(staleCheck).toBeGreaterThan(ownerCheck);
    expect(limiter).toBeGreaterThan(staleCheck);
    expect(route).toContain('restoreSavedReactVersion(prisma');
    expect(route).toContain('if (!limited) return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503)');
  });
  it("returns a human-readable 429 with bounded retry instructions",()=>{
    expect(route).toContain('code:"BUILD_HISTORY_RATE_LIMITED",retryAfterSeconds');
    expect(route).toContain('response.headers.set("Retry-After",String(retryAfterSeconds))');
    expect(route).toContain('No source changed.');
  });
});
