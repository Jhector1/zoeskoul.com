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

  it("accepts Dockerode's exact parsed JSON result for a missing file", async () => {
    const value = { ok: true, failedPaths: ["/workspace/stage4b8m-missing-proof.txt"] };
    expect(JSON.parse(await readAdminVerifierLogOutput(value))).toEqual(value);
  });

  it("accepts the exact parsed JSON response when every check passes", async () => {
    expect(await readAdminVerifierLogOutput({ok: true, failedPaths: []}))
      .toBe('{"ok":true,"failedPaths":[]}');
  });

  it("rejects unexpected or missing structured result fields", async () => {
    for (const value of [
      {ok: true, failedPaths: [], extra: true},
      {ok: true},
      {ok: false, failedPaths: []},
      {ok: 1, failedPaths: []},
      {ok: true, failedPaths: "[]"},
      {ok: true, failedPaths: [], toJSON: () => "sneaky"},
    ]) {
      await expect(readAdminVerifierLogOutput(value)).rejects.toThrow(/unavailable/i);
    }
  });

  it("rejects invalid structured paths, duplicates and arrays over the limit", async () => {
    for (const value of [
      {ok: true, failedPaths: ["/etc/shadow"]},
      {ok: true, failedPaths: [123]},
      {ok: true, failedPaths: ["/workspace/a", "/workspace/a"]},
      {ok: true, failedPaths: Array(9).fill("/workspace/a")},
      {ok: true, failedPaths: ["/workspace/" + "x".repeat(513)]},
      {ok: true, failedPaths: new Array(1)},
      {ok: true, failedPaths: Object.assign(["/workspace/a"], {evil: true})},
    ]) {
      await expect(readAdminVerifierLogOutput(value)).rejects.toThrow(/unavailable/i);
    }
  });

  it("rejects accessors, non-plain objects and symbol properties", async () => {
    const getter = Object.defineProperties({}, {
      ok: { enumerable: true, get() { throw new Error("must not run"); } },
      failedPaths: { value: [], enumerable: true },
    });
    const derived = Object.assign(Object.create({ inherited: true }),
      {ok: true, failedPaths: []});
    const symbolic = {ok: true, failedPaths: [], [Symbol("hidden")]: true};
    for (const value of [getter, derived, symbolic]) {
      await expect(readAdminVerifierLogOutput(value)).rejects.toThrow(/unavailable/i);
    }
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
