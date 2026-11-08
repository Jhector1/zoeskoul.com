import { Duplex } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runWorkspaceFileWorker } from "./workspaceFileDockerExec.js";
import { docker } from "../docker/dockerClient.js";

vi.mock("../docker/dockerClient.js", () => ({
  docker: {
    getContainer: vi.fn(),
    modem: { demuxStream: vi.fn((raw: Duplex, output: Duplex) => raw.pipe(output)) },
  },
}));
vi.mock("../execution/sandboxProfile.js", () => ({
  resolveSandboxProfile: vi.fn(() => ({ user: "1000:1000" })),
}));

const session: any = {
  id: "session-fixed", containerId: "container-fixed", workspaceDir: "/var/lib/zoeskoul-runner/workspaces/zoeskoul-run-test",
};
const request = { op: "read" as const, path: "main.c", maxBytes: 65536 };
let container: any;

beforeEach(() => {
  vi.clearAllMocks();
  container = {
    inspect: vi.fn(async () => ({
      State: { Running: true },
      Config: { User: "1000:1000", Labels: {
        "com.zoeskoul.runner.session": session.id,
        "com.zoeskoul.runner.purpose": "learn",
      } },
      Mounts: [{ Destination: "/workspace", Type: "bind", RW: true, Source: session.workspaceDir }],
    })),
    exec: vi.fn(async () => ({
      start: async () => {
        const stream = new Duplex({
          read() {},
          write(chunk, _encoding, done) {
            expect(JSON.parse(String(chunk))).toEqual(request);
            setImmediate(() => {
              stream.push(JSON.stringify({ ok: true, data: "YQ==", revision: `sha256:${"a".repeat(64)}` }) + "\n");
              stream.push(null);
            });
            done();
          },
        });
        return stream;
      },
    })),
  };
  vi.mocked(docker.getContainer).mockReturnValue(container);
});

describe("V6A Docker Exec identity and transport", () => {
  it("invokes immutable worker at non-root learner identity", async () => {
    const result = await runWorkspaceFileWorker(session, request);
    expect(result.ok).toBe(true);
    expect(container.exec).toHaveBeenCalledWith(expect.objectContaining({
      Cmd: ["python3", "/opt/runner/workspace-file-worker.py"],
      User: "1000:1000", Tty: false, Privileged: false,
    }));
    expect(JSON.stringify(container.exec.mock.calls)).not.toContain("main.c");
  });
  it("rejects a bind mount for another student", async () => {
    container.inspect.mockResolvedValueOnce({
      State: { Running: true },
      Config: { User: "1000:1000", Labels: {
        "com.zoeskoul.runner.session": session.id,
        "com.zoeskoul.runner.purpose": "learn",
      } },
      Mounts: [{Destination: "/workspace",Type: "bind",RW: true,Source: "/other-student"}],
    });
    await expect(runWorkspaceFileWorker(session, request)).rejects.toThrow("unavailable");
    expect(container.exec).not.toHaveBeenCalled();
  });
  it("rejects a non-running container", async () => {
    container.inspect.mockResolvedValueOnce({State: {Running: false}});
    await expect(runWorkspaceFileWorker(session, request)).rejects.toThrow("unavailable");
    expect(container.exec).not.toHaveBeenCalled();
  });
});
