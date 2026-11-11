import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readAdminVerifierLogOutput } from "./adminVerifierLogOutput.js";

const evidence = '{"ok":true,"failedPaths":["/workspace/missing.txt"]}\n';

describe("bounded Dockerode administrator verifier log handling", () => {
  it("accepts the historical Buffer-shaped logs response", async () => {
    expect(await readAdminVerifierLogOutput(Buffer.from(evidence))).toBe(evidence.trim());
  });

  it("accepts real Readable logs in multiple chunks", async () => {
    const stream = Readable.from([Buffer.from(evidence.slice(0, 9)), Buffer.from(evidence.slice(9))]);
    expect(await readAdminVerifierLogOutput(stream)).toBe(evidence.trim());
  });

  it("accepts string chunks from a Readable", async () => {
    expect(await readAdminVerifierLogOutput(Readable.from([evidence]))).toBe(evidence.trim());
  });

  it("fails closed on oversized logs and destroys the stream", async () => {
    const stream = Readable.from([Buffer.alloc(8193, "x")]);
    await expect(readAdminVerifierLogOutput(stream)).rejects.toThrow(/unavailable/i);
    expect(stream.destroyed).toBe(true);
  });

  it("fails closed on an invalid logs response shape", async () => {
    await expect(readAdminVerifierLogOutput({ value: evidence })).rejects.toThrow(/unavailable/i);
  });

  it("fails closed on empty or invalid UTF-8 data", async () => {
    await expect(readAdminVerifierLogOutput(Buffer.alloc(0))).rejects.toThrow(/unavailable/i);
    await expect(readAdminVerifierLogOutput(Buffer.from([0xff]))).rejects.toThrow(/unavailable/i);
  });

  it("fails closed on stream errors", async () => {
    const stream = new PassThrough();
    const pending = readAdminVerifierLogOutput(stream);
    stream.destroy(new Error("socket failure"));
    await expect(pending).rejects.toThrow(/unavailable/i);
  });

  it("times out a stalled stream, destroys it, and fails closed", async () => {
    const stream = new PassThrough();
    await expect(readAdminVerifierLogOutput(stream, 25)).rejects.toThrow(/unavailable/i);
    expect(stream.destroyed).toBe(true);
  });

  it("rejects a stream that closes before its end event", async () => {
    const stream = new PassThrough();
    const pending = readAdminVerifierLogOutput(stream);
    stream.write(evidence);
    stream.destroy();
    await expect(pending).rejects.toThrow(/unavailable/i);
  });
});
