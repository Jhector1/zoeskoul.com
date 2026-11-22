import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {prisma} from "@zoeskoul/platform-server/prisma";
import {createDurablePreviewGrant,digestDurablePreviewGrant,lookupDurablePreviewGrant,
  checkDurablePreviewGrant,renewDurablePreviewGrant,revokeDurablePreviewGrants,
  DURABLE_PREVIEW_GRANT_IDLE_MS,DURABLE_PREVIEW_GRANT_ABSOLUTE_MS} from "./reactPreviewDevelopmentDurableGrant";
vi.mock("server-only",()=>({}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{$executeRaw:vi.fn(),$queryRaw:vi.fn()}}));
const identity={userId:"owner_1",buildProjectId:"project_1",
  previewId:"preview_11111111-1111-4111-8111-111111111111",sourceVersion:7};
const row={id:"f".repeat(64),userId:identity.userId,buildProjectId:identity.buildProjectId,
 previewId:identity.previewId,sourceVersionFloor:7,revokedAt:null,expiresAt:new Date(Date.now()+60_000),
 absoluteExpiresAt:new Date(Date.now()+1_000_000)};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(prisma.$executeRaw).mockResolvedValue(1);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([row]);});
afterEach(()=>vi.unstubAllEnvs());
describe("Phase 4E3C4B2 shared SQL grant persistence",()=>{
 it("issues random opaque bearer, stores only its digest, and bounds lease lifetime",async()=>{
  const a=await createDurablePreviewGrant(identity);
  const b=await createDurablePreviewGrant(identity);
  expect(a).toMatch(/^dpg1\.[A-Za-z0-9_-]{43}$/);
  expect(a).not.toBe(b);
  expect(digestDurablePreviewGrant(a)).toHaveLength(64);
  const values=vi.mocked(prisma.$executeRaw).mock.calls[0].slice(1);
  expect(values[0]).toBe(digestDurablePreviewGrant(a));
  expect(JSON.stringify(values)).not.toContain(a);
  expect(values).toContain(identity.userId);
  expect(DURABLE_PREVIEW_GRANT_IDLE_MS).toBe(120_000);
  expect(DURABLE_PREVIEW_GRANT_ABSOLUTE_MS).toBe(1_800_000);
 });
 it("refuses malformed bearer and identity before DB access",async()=>{
  for(const token of ["", "dpv1."+"a".repeat(100),"dpg1."+"a".repeat(42),"dpg1."+"/".repeat(43)])
   expect(()=>digestDurablePreviewGrant(token)).toThrow();
  await expect(createDurablePreviewGrant({...identity,sourceVersion:0})).rejects.toThrow();
  expect(prisma.$executeRaw).not.toHaveBeenCalled();
 });
 it("only reads active matching owner/project/preview/floor and fails closed if missing",async()=>{
  const token=await createDurablePreviewGrant(identity);
  expect((await lookupDurablePreviewGrant(token)).userId).toBe(identity.userId);
  await checkDurablePreviewGrant(token,{...identity,sourceVersion:8});
  await expect(checkDurablePreviewGrant(token,{...identity,userId:"other"})).rejects.toThrow();
  await expect(checkDurablePreviewGrant(token,{...identity,sourceVersion:6})).rejects.toThrow();
  vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);
  await expect(lookupDurablePreviewGrant(token)).rejects.toThrow();
 });
 it("uses atomic conditional SQL for renewal and scopes revocation",async()=>{
  const token=await createDurablePreviewGrant(identity);
  await renewDurablePreviewGrant(token,{...identity,sourceVersion:8});
  expect(prisma.$queryRaw).toHaveBeenCalled();
  vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);
  await expect(renewDurablePreviewGrant(token,identity)).rejects.toThrow();
  await revokeDurablePreviewGrants(identity);
  const values=vi.mocked(prisma.$executeRaw).mock.calls.at(-1)?.slice(1);
  expect(values).toEqual([identity.userId,identity.buildProjectId,identity.previewId]);
 });
});
