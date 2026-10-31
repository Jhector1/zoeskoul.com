import { Duplex } from "node:stream";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../docker/dockerClient.js", () => ({ docker: { getContainer: vi.fn() } }));
import { ReactPreviewPersistentHttpChannel } from "./reactPreviewPersistentHttp.js";

class MockDockerExec extends Duplex {
  written: string[] = [];
  _read() {}
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.written.push(chunk.toString("utf8"));
    callback();
  }
  replyFragments(data: Record<string, unknown>, frameBytes = 32_768, chunkBytes = 4096) {
    const full = Buffer.from(`${JSON.stringify(data)}\n`);
    for (let i = 0; i < full.length; i += frameBytes) {
      const payload = full.subarray(i, i + frameBytes);
      const header = Buffer.alloc(8);
      header[0] = 1;
      header.writeUInt32BE(payload.length, 4);
      // Splitting inside the Docker frame header and payload must be safe.
      const framed = Buffer.concat([header, payload]);
      for (let j = 0; j < framed.length; j += chunkBytes) {
        this.push(framed.subarray(j, j + chunkBytes));
      }
    }
  }
}

describe("K20D3L1 bounded incremental preview transport", () => {
  it("reassembles a multi-megabyte module from fragmented Docker frames", async () => {
    const stream = new MockDockerExec();
    const channel = new ReactPreviewPersistentHttpChannel(stream, () => {});
    try {
      const pending = channel.request("/node_modules/.vite/deps/react-dom_client.js", "GET");
      const id = JSON.parse(stream.written[0]!).id as number;
      const bodyBase64 = Buffer.alloc(2_800_000, 73).toString("base64");
      stream.replyFragments({ id, status: 200, headers: {"content-type": "text/javascript"}, bodyBase64 });
      const result = await pending;
      expect(result.status).toBe(200);
      expect(result.bodyBase64).toBe(bodyBase64);
    } finally {
      channel.close();
    }
  });

  it("keeps out-of-order concurrent responses paired to their request ids", async () => {
    const stream = new MockDockerExec();
    const channel = new ReactPreviewPersistentHttpChannel(stream, () => {});
    try {
      const one = channel.request("/src/one.tsx", "GET");
      const two = channel.request("/src/two.tsx", "GET");
      const firstId = JSON.parse(stream.written[0]!).id as number;
      const secondId = JSON.parse(stream.written[1]!).id as number;
      stream.replyFragments({ id: secondId, status: 200, headers: {}, bodyBase64: "dHdv" }, 7, 1);
      stream.replyFragments({ id: firstId, status: 200, headers: {}, bodyBase64: "b25l" }, 13, 2);
      expect((await one).bodyBase64).toBe("b25l");
      expect((await two).bodyBase64).toBe("dHdv");
    } finally {
      channel.close();
    }
  });

  it("closes on an oversized stdout reply, preserving its existing fail-closed limit", async () => {
    const stream = new MockDockerExec();
    const channel = new ReactPreviewPersistentHttpChannel(stream, () => {});
    const pending = channel.request("/src/oversize.tsx", "GET");
    const rejection = expect(pending).rejects.toThrow("response overflow");
    const id = JSON.parse(stream.written[0]!).id as number;
    stream.replyFragments({ id, status: 200, headers: {}, bodyBase64: "A".repeat(9 * 1024 * 1024) }, 65_536, 16_384);
    await rejection;
    await expect(channel.request("/after-overflow", "GET")).rejects.toThrow("unavailable");
  });

  it("does not recopy the accumulated stdout on each input fragment", () => {
    const source = readFileSync(resolve(process.cwd(), "src/services/build/reactPreviewPersistentHttp.ts"), "utf8");
    expect(source).toContain("private textChunks: Buffer[] = [];");
    expect(source).toContain("private readonly frameHeader = Buffer.alloc(8);");
    expect(source).toContain("Buffer.concat(this.textChunks, this.textBytes)");
    expect(source).not.toContain("Buffer.concat([this.raw, chunk])");
    expect(source).not.toContain("Buffer.concat([this.text, chunk])");
    expect(source).toContain("const MAX_IN_FLIGHT = 16;");
    expect(source).toContain("const MAX_DOCKER_FRAME = 9 * 1024 * 1024;");
  });
});
