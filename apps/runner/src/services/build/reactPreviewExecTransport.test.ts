import { Duplex } from "node:stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("../docker/dockerClient.js", () => ({docker: {getContainer: vi.fn()}}));
import { ReactPreviewPersistentHttpChannel, PERSISTENT_PREVIEW_HTTP_WORKER, PREVIEW_HTTP_REQUEST_DEADLINE_MS } from "./reactPreviewPersistentHttp.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

class MockAttachedDockerExec extends Duplex {
  written: string[] = [];
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, cb: (error?: Error | null) => void) {
    this.written.push(chunk.toString("utf8"));
    cb();
  }
  reply(data: Record<string, unknown>) {
    const body = Buffer.from(JSON.stringify(data) + "\n");
    const head = Buffer.alloc(8);
    head[0] = 1;
    head.writeUInt32BE(body.length, 4);
    const framed = Buffer.concat([head, body]);
    // Docker may split header and payload across arbitrary TCP chunks.
    this.push(framed.subarray(0, 3));
    this.push(framed.subarray(3, 11));
    this.push(framed.subarray(11));
  }
}

describe("persistent isolated Vite transport", () => {
  it("serves multiple concurrent assets on one attached exec without mixing replies", async () => {
    const stream = new MockAttachedDockerExec();
    const close = vi.fn();
    const channel = new ReactPreviewPersistentHttpChannel(stream, close);
    const first = channel.request("/src/App.tsx", "GET");
    const second = channel.request("/node_modules/.vite/deps/react.js", "GET");
    expect(stream.written).toHaveLength(2);
    const ids = stream.written.map(text => JSON.parse(text).id as number);
    stream.reply({id: ids[1], status: 200, headers: {"content-type": "text/javascript"}, bodyBase64: "Yg=="});
    stream.reply({id: ids[0], status: 200, headers: {"content-type": "text/javascript"}, bodyBase64: "YQ=="});
    expect((await first).bodyBase64).toBe("YQ==");
    expect((await second).bodyBase64).toBe("Yg==");
    channel.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("preserves HTTP failure statuses and rejects unsafe request paths", async () => {
    const stream = new MockAttachedDockerExec();
    const channel = new ReactPreviewPersistentHttpChannel(stream, () => {});
    const pending = channel.request("/missing", "HEAD");
    stream.reply({id: JSON.parse(stream.written[0]!).id, status: 404, headers: {"content-type": "text/html"}, bodyBase64: ""});
    expect((await pending).status).toBe(404);
    await expect(channel.request("//evil.com/", "GET")).rejects.toThrow("Unsafe preview transport path");
    channel.close();
  });
  it("fails closed on broken Docker multiplexed responses", async () => {
    const stream = new MockAttachedDockerExec();
    const channel = new ReactPreviewPersistentHttpChannel(stream, () => {});
    const waiting = channel.request("/", "GET");
    stream.push(Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]));
    await expect(waiting).rejects.toThrow("Malformed preview Docker frame");
    await expect(channel.request("/", "GET")).rejects.toThrow("unavailable");
  });
  it("isolates an asset deadline without aborting an unrelated healthy fetch", async () => {
    vi.useFakeTimers();
    try {
      const stream = new MockAttachedDockerExec();
      const closed = vi.fn();
      const channel = new ReactPreviewPersistentHttpChannel(stream, closed);
      const slow = channel.request("/src/slow.tsx", "GET");
      const fast = channel.request("/src/fast.tsx", "GET");
      const firstId = JSON.parse(stream.written[0]!).id as number;
      const secondId = JSON.parse(stream.written[1]!).id as number;
      const slowRejection = expect(slow).rejects.toThrow("asset response deadline exceeded");
      stream.reply({id: secondId, status: 200, headers: {"content-type": "text/javascript"}, bodyBase64: "Zg=="});
      expect((await fast).bodyBase64).toBe("Zg==");
      await vi.advanceTimersByTimeAsync(PREVIEW_HTTP_REQUEST_DEADLINE_MS + 1);
      await slowRejection;
      expect(closed).not.toHaveBeenCalled();
      // Late replies from expired operations must never affect a subsequent asset.
      stream.reply({id: firstId, status: 200, headers: {}, bodyBase64: "b2xk"});
      const next = channel.request("/src/next.tsx", "GET");
      const nextId = JSON.parse(stream.written[2]!).id as number;
      stream.reply({id: nextId, status: 200, headers: {"content-type": "text/javascript"}, bodyBase64: "bg=="});
      expect((await next).bodyBase64).toBe("bg==");
      channel.close();
      expect(closed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("reopens a persistently stalled worker after three isolated deadlines", async () => {
    vi.useFakeTimers();
    try {
      const stream = new MockAttachedDockerExec();
      const closed = vi.fn();
      const channel = new ReactPreviewPersistentHttpChannel(stream, closed);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const failure = channel.request(`/stalled-${attempt}`, "GET");
        const rejection = expect(failure).rejects.toThrow("asset response deadline exceeded");
        await vi.advanceTimersByTimeAsync(PREVIEW_HTTP_REQUEST_DEADLINE_MS + 1);
        await rejection;
        expect(closed).toHaveBeenCalledTimes(attempt === 2 ? 1 : 0);
      }
      await expect(channel.request("/after-stall", "GET")).rejects.toThrow("unavailable");
    } finally {
      vi.useRealTimers();
    }
  });
  it("maintains network isolation and bounded concurrency", () => {
    const runtime = readFileSync(resolve(process.cwd(), "src/services/build/reactPreviewRuntime.ts"), "utf8");
    const channel = readFileSync(resolve(process.cwd(), "src/services/build/reactPreviewPersistentHttp.ts"), "utf8");
    expect(runtime).toContain('NetworkMode:\n            "none"');
    expect(runtime).toContain('fetchPersistentPreviewHttp(record.containerId, safePath, input.method)');
    expect(runtime).toContain('stopPersistentPreviewHttp(record.containerId)');
    expect(channel).toContain("AttachStdin: true, Tty: false");
    expect(channel).toContain("MAX_IN_FLIGHT = 16");
    expect(PERSISTENT_PREVIEW_HTTP_WORKER).toContain("ThreadPoolExecutor(max_workers=8)");
    expect(PERSISTENT_PREVIEW_HTTP_WORKER).toContain("opener.open(request_obj, timeout=20)");
    expect(PREVIEW_HTTP_REQUEST_DEADLINE_MS).toBeGreaterThan(40_000);
    expect(runtime).not.toContain("ExposedPorts");
  });
});
