import { describe, expect, it } from "vitest";
import { readBoundedRequestBody } from "./readBoundedRequestBody";

describe("bounded raw Stripe webhook request body", () => {
  it("preserves raw bytes for signature verification", async () => {
    const payload = new Uint8Array([0, 1, 128, 255, 65]);
    const response = await readBoundedRequestBody(
      new Request("https://example.test/hook", {
        method: "POST",
        body: payload,
      }),
      5,
    );
    expect([...response!]).toEqual([...payload]);
  });

  it("rejects a stream as soon as it exceeds the limit", async () => {
    let calls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        calls += 1;
        controller.enqueue(new Uint8Array(4));
        if (calls > 10) controller.close();
      },
    });
    const request = new Request("https://example.test/hook", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedRequestBody(request, 7)).toBeNull();
    expect(calls).toBeLessThan(11);
  });

  it("honors Content-Length as an early rejection only", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    });
    const req = new Request("https://example.test/hook", {
      method: "POST",
      body,
      duplex: "half",
      headers: { "content-length": "4" },
    } as RequestInit & { duplex: "half" });
    expect(await readBoundedRequestBody(req, 5)).toBeNull();

    const early = new Request("https://example.test/hook", {
      method: "POST",
      body: "ok",
      headers: { "content-length": "999" },
    });
    expect(await readBoundedRequestBody(early, 5)).toBeNull();
  });

  it("accepts exact-limit and empty payloads", async () => {
    const exact = await readBoundedRequestBody(
      new Request("https://example.test/hook", { method: "POST", body: "abc" }),
      3,
    );
    if (exact === null) {
      throw new Error("Exact-limit webhook payload must be accepted.");
    }
    expect(new TextDecoder().decode(exact)).toBe("abc");
    const empty = await readBoundedRequestBody(
      new Request("https://example.test/hook", { method: "POST" }),
      0,
    );
    expect(empty?.byteLength).toBe(0);
  });
});
