
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { waitForAttachOutputDrain } from "./attachOutputDrain.js";

describe("waitForAttachOutputDrain", () => {
  it("does not finalize until trailing readable output has drained", async () => {
    const attach = new PassThrough();
    const output: Buffer[] = [];
    attach.on("data", (chunk) => output.push(Buffer.from(chunk)));

    let drained = false;
    const barrier = waitForAttachOutputDrain(attach).then(() => {
      drained = true;
    });

    attach.write("Hello from Python!\\n");
    await Promise.resolve();

    expect(drained).toBe(false);

    attach.end("[trailing-byte]\\n");
    await barrier;

    expect(drained).toBe(true);
    expect(Buffer.concat(output).toString("utf8")).toBe(
      "Hello from Python!\\n[trailing-byte]\\n",
    );
  });

  it("settles the barrier when the attach stream errors", async () => {
    const attach = new PassThrough();
    const barrier = waitForAttachOutputDrain(attach);

    attach.destroy(new Error("attach failed"));

    await expect(barrier).resolves.toBeUndefined();
  });
});
