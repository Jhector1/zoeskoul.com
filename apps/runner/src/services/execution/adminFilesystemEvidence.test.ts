import {Readable} from "node:stream";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(),
  getActiveSessionsForActor: vi.fn(),
  assertAdminLabSwitch: vi.fn(() => 2),
  adminLabConfiguration: vi.fn(() => ({image: "sha256:" + "a".repeat(64)})),
}));
vi.mock("../docker/dockerClient.js", () => ({docker: {getContainer: mocks.getContainer}}));
vi.mock("../sessions/sessionStore.js", () => ({getActiveSessionsForActor: mocks.getActiveSessionsForActor}));
vi.mock("./learningAdminSwitch.js", () => ({assertAdminLabSwitch: mocks.assertAdminLabSwitch}));
vi.mock("./learningAdminGrant.js", () => ({adminLabConfiguration: mocks.adminLabConfiguration}));
import {parseDockerArchiveHeader, verifyAdminFilesystem} from "./adminFilesystemEvidence.js";

function octal(out: Buffer, start: number, width: number, value: number) {
  const raw = value.toString(8).padStart(width - 1, "0") + "\0";
  out.write(raw, start, width, "ascii");
}
function header({kind="file", mode=0o750, uid=0, gid=1000}: {kind?: "file"|"directory"|"symlink", mode?:number,uid?:number,gid?:number}={}) {
  const out = Buffer.alloc(512);
  out.write("project",0,"ascii");
  octal(out, 100,8,mode); octal(out, 108,8,uid); octal(out,116,8,gid);
  octal(out,124,12,0); octal(out,136,12,0);
  out[156] = kind === "directory" ? 53 : kind === "symlink" ? 50 : 48;
  out.fill(32,148,156);
  octal(out,148,8, [...out].reduce((a,b)=>a+b,0));
  return out;
}
const image = "sha256:" + "a".repeat(64);
const session = {id:"sess-one", ownerKey:"actor", containerId:"container", labMode:"admin", adminTopicSlug:"sudo-root-concepts", state:"waiting_for_input"};
let container: any;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertAdminLabSwitch.mockReturnValue(2);
  mocks.adminLabConfiguration.mockReturnValue({image});
  mocks.getActiveSessionsForActor.mockReturnValue([session]);
  container = {
    inspect: vi.fn(async () => ({
      State: {Running:true}, Config: {Image: image, User:"0:0", Labels: {
        "com.zoeskoul.runner.session":session.id,
        "com.zoeskoul.runner.lab-mode":"admin",
        "com.zoeskoul.runner.purpose":"learn",
      }}, HostConfig: {Privileged:false,NetworkMode:"none",Tmpfs:{"/workspace":"rw","/tmp":"rw"},Binds:[]},
      Mounts:[],
    })),
    infoArchive: vi.fn(async () => ({mode: 0, linkTarget:""})),
    getArchive: vi.fn(async () => Readable.from([header({kind:"directory"})])),
  };
  mocks.getContainer.mockReturnValue(container);
});
describe("trusted administrator filesystem verification", () => {
  it("parses POSIX tar metadata produced by the Docker daemon", () => {
    expect(parseDockerArchiveHeader(header({kind:"file",mode:0o640,uid:10,gid:20})))
      .toEqual({kind:"file",mode:0o640,uid:10,gid:20});
    expect(() => parseDockerArchiveHeader(Buffer.alloc(512))).toThrow();
  });
  it("accepts actual verified directory mode and owner without guest execution", async () => {
    const out = await verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{
      required:[{path:"/workspace/project",kind:"directory",mode:"0750",uid:0,gid:1000}],
    }});
    expect(out).toEqual({passed:true,failedPaths:[]});
    expect(container.exec).toBeUndefined();
    expect(container.getArchive).toHaveBeenCalledWith({path:"/workspace/project"});
  });
  it("reports incorrect ownership and missing paths as learner failures", async () => {
    container.getArchive.mockResolvedValueOnce(Readable.from([header({kind:"directory",uid:1000})]));
    const out = await verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{
      required:[{path:"/workspace/project",kind:"directory",uid:0}],
    }});
    expect(out.passed).toBe(false);
    expect(out.failedPaths).toEqual(["/workspace/project"]);
  });
  it("refuses standard sessions, mismatched lessons and ambiguous sessions", async () => {
    mocks.getActiveSessionsForActor.mockReturnValue([{...session,labMode:"standard"}]);
    await expect(verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{required:[]}})).rejects.toThrow("unavailable");
    mocks.getActiveSessionsForActor.mockReturnValue([session, session]);
    await expect(verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{required:[]}})).rejects.toThrow("unavailable");
    mocks.getActiveSessionsForActor.mockReturnValue([session]);
    await expect(verifyAdminFilesystem({actorKey:"actor",topicSlug:"final-capstone-secure-project",expected:{required:[]}})).rejects.toThrow("unavailable");
  });
  it("rejects symbolic links using Docker's path metadata before following them", async () => {
    container.infoArchive.mockResolvedValueOnce({mode:1<<27,linkTarget:"/etc/passwd"});
    const out = await verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{required:[{path:"/workspace/project",kind:"directory"}]}});
    expect(out.passed).toBe(false);
    expect(container.getArchive).not.toHaveBeenCalled();
  });
  it("fails closed if Docker returns a non-Node archive stream", async () => {
    container.getArchive.mockResolvedValueOnce({on: vi.fn(), destroy: vi.fn()});
    await expect(verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{
      required:[{path:"/workspace/project",kind:"directory"}],
    }})).rejects.toThrow("unavailable");
  });
  it("rejects changed isolation, invalid archive headers and runtime OFF", async () => {
    container.inspect.mockResolvedValueOnce({State:{Running:true},Config:{Image:image,User:"0:0",Labels:{}},HostConfig:{Privileged:false,NetworkMode:"none"},Mounts:[]});
    await expect(verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{required:[]}})).rejects.toThrow("unavailable");
    container.getArchive.mockResolvedValueOnce(Readable.from([Buffer.alloc(512)]));
    await expect(verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{required:[{path:"/workspace/project",kind:"directory"}]}})).rejects.toThrow("unavailable");
    mocks.assertAdminLabSwitch.mockImplementationOnce(() => {throw new Error("off")});
    await expect(verifyAdminFilesystem({actorKey:"actor",topicSlug:"sudo-root-concepts",expected:{required:[]}})).rejects.toThrow("off");
  });
});
