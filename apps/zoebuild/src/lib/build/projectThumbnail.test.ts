import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({owner:vi.fn(),find:vi.fn(),read:vi.fn(),put:vi.fn(),replace:vi.fn(),runner:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./currentBuildAccess",()=>({loadCurrentBuildAccessSnapshot:mocks.owner}));
vi.mock("@zoeskoul/platform-server/prisma",()=>({prisma:{buildProject:{findFirst:mocks.find}}}));
vi.mock("./cloudflareR2MediaServer",()=>({createZoeBuildPrivateR2ThumbnailStore:()=>({read:mocks.read,putIfAbsent:mocks.put,replace:mocks.replace})}));
vi.mock("@/lib/server/runnerActorKey",()=>({requireRunnerActorKey:async()=>"u:"+"a".repeat(64)}));
vi.mock("@zoeskoul/platform-server/server/runnerClient",()=>({runnerPost:mocks.runner}));
vi.mock("./reactPreviewServer",()=>({ReactPreviewRequestError:class extends Error{constructor(readonly code:string,message:string,readonly status:number){super(message);}}}));
import {captureProjectThumbnail,readProjectThumbnail,readProjectThumbnailDisplay,thumbnailKey} from "./projectThumbnail";
const req=new Request("http://localhost:3004");
const jpeg=Buffer.from([255,216,255,192,0,11,8,2,208,5,0,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
const project="project_test", preview="preview_11111111-1111-4111-8111-111111111111";
const capture=()=>captureProjectThumbnail(req,project,preview,3);
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.owner.mockResolvedValue({userId:"owner_a",entitlements:[]});
  mocks.find.mockResolvedValue({codeProject:{currentVersion:3}});
  mocks.read.mockResolvedValue(null);
  mocks.put.mockResolvedValue("created");
  mocks.runner.mockResolvedValue({ok:true,sourceVersion:3,bodyBase64:jpeg.toString("base64")});
});
describe("private homepage thumbnail cache",()=>{
  it("separates owners, projects and saved revisions",()=>{
    const a={userId:"owner_a",buildProjectId:project,sourceVersion:3};
    expect(thumbnailKey(a)).not.toBe(thumbnailKey({...a,userId:"owner_b"}));
    expect(thumbnailKey(a)).not.toBe(thumbnailKey({...a,sourceVersion:4}));
    expect(()=>thumbnailKey({...a,buildProjectId:"../escape"})).toThrow();
  });
  it("denies a foreign/archived project before accessing R2 or Runner",async()=>{
    mocks.find.mockResolvedValue(null);
    await expect(capture()).rejects.toMatchObject({status:404});
    expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({status:{not:"archived"},codeProject:{ownerId:"owner_a",archivedAt:null}})}));
    expect(mocks.read).not.toHaveBeenCalled();expect(mocks.runner).not.toHaveBeenCalled();
  });
  it("reuses a cached thumbnail and never starts a renderer for a cache hit",async()=>{
    mocks.read.mockResolvedValue(jpeg);
    await capture();expect(mocks.runner).not.toHaveBeenCalled();expect(mocks.put).not.toHaveBeenCalled();
  });
  it("rechecks the saved revision before writing the screenshot",async()=>{
    mocks.find.mockResolvedValueOnce({codeProject:{currentVersion:3}}).mockResolvedValueOnce({codeProject:{currentVersion:4}});
    await expect(capture()).rejects.toMatchObject({status:409});expect(mocks.put).not.toHaveBeenCalled();
  });
  it("stores a valid screenshot only for the exact revision",async()=>{
    await capture();expect(mocks.runner).toHaveBeenCalledWith(`/build/previews/${preview}/thumbnail`,expect.any(String),{buildProjectId:project,sourceVersion:3});
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({mimeType:"image/jpeg",bytes:jpeg}));
  });
  it("dashboard reads never invoke Runner or return stale revisions",async()=>{
    mocks.read.mockResolvedValue(jpeg);
    mocks.find.mockResolvedValueOnce({codeProject:{currentVersion:3}}).mockResolvedValueOnce({codeProject:{currentVersion:4}});
    await expect(readProjectThumbnail(req,project,3)).rejects.toMatchObject({status:409});
    expect(mocks.runner).not.toHaveBeenCalled();
  });
});


describe("thumbnail lifecycle",()=>{
  it("returns the newest previous image only through an authorized current-revision display read",async()=>{
    mocks.read.mockResolvedValueOnce(null).mockResolvedValueOnce(jpeg);
    const display=await readProjectThumbnailDisplay(req,project,3);
    expect(display).toMatchObject({version:2,bytes:jpeg,capturing:false});
    expect(mocks.read.mock.calls.map(call=>call[0])).toEqual([3,2].map(sourceVersion=>thumbnailKey({userId:"owner_a",buildProjectId:project,sourceVersion})));
    expect(mocks.runner).not.toHaveBeenCalled();
  });
  it("bounds a missing-image search to four keys and refuses direct historical access",async()=>{
    mocks.find.mockResolvedValue({codeProject:{currentVersion:9}});
    expect(await readProjectThumbnailDisplay(req,project,9)).toMatchObject({bytes:null,version:null});
    expect(mocks.read).toHaveBeenCalledTimes(4);
    await expect(readProjectThumbnail(req,project,8)).rejects.toMatchObject({status:409});
    expect(mocks.read).toHaveBeenCalledTimes(4);
  });
  it("rechecks ownership and current revision even when serving an older JPEG",async()=>{
    mocks.read.mockResolvedValueOnce(null).mockResolvedValueOnce(jpeg);
    mocks.find.mockResolvedValueOnce({codeProject:{currentVersion:3}}).mockResolvedValueOnce(null);
    await expect(readProjectThumbnailDisplay(req,project,3)).rejects.toMatchObject({status:404});
  });
  it("refreshes a cached revision only with a new valid JPEG",async()=>{
    mocks.read.mockResolvedValue(jpeg);
    await captureProjectThumbnail(req,project,preview,3,true);
    expect(mocks.runner).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({key:thumbnailKey({userId:"owner_a",buildProjectId:project,sourceVersion:3}),bytes:jpeg,mimeType:"image/jpeg"}));
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("does not replace the previous JPEG on capture failure or stale revision",async()=>{
    mocks.read.mockResolvedValue(jpeg);
    mocks.runner.mockRejectedValueOnce(new Error("unavailable"));
    await expect(captureProjectThumbnail(req,project,preview,3,true)).rejects.toThrow();
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.find.mockResolvedValueOnce({codeProject:{currentVersion:3}}).mockResolvedValueOnce({codeProject:{currentVersion:4}});
    await expect(captureProjectThumbnail(req,project,preview,3,true)).rejects.toMatchObject({status:409});
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});


describe("authorized thumbnail cache misses",()=>{
  it("rechecks the owner and saved revision before reporting an exact miss",async()=>{
    expect(await readProjectThumbnail(req,project,3)).toBeNull();
    expect(mocks.find).toHaveBeenCalledTimes(2);
    expect(mocks.runner).not.toHaveBeenCalled();
  });
  it("does not report an exact miss after access is revoked or the revision changes",async()=>{
    mocks.find.mockResolvedValueOnce({codeProject:{currentVersion:3}}).mockResolvedValueOnce(null);
    await expect(readProjectThumbnail(req,project,3)).rejects.toMatchObject({status:404});
    mocks.find.mockResolvedValueOnce({codeProject:{currentVersion:3}}).mockResolvedValueOnce({codeProject:{currentVersion:4}});
    await expect(readProjectThumbnail(req,project,3)).rejects.toMatchObject({status:409});
  });
  it("does not report a display miss after access is revoked",async()=>{
    mocks.find.mockResolvedValueOnce({codeProject:{currentVersion:3}}).mockResolvedValueOnce(null);
    await expect(readProjectThumbnailDisplay(req,project,3)).rejects.toMatchObject({status:404});
  });
});
