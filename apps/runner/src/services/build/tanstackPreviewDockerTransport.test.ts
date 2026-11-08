import { describe, expect, it } from "vitest";
import {
  TanstackPreviewTransportError,
  validateTanstackPreviewWorkerReply,
} from "./tanstackPreviewDockerTransport.js";

function stage(value: unknown) {
  try {
    validateTanstackPreviewWorkerReply(value);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(TanstackPreviewTransportError);
    return (error as TanstackPreviewTransportError).stage;
  }
}

describe("TanStack Docker HTTP worker protocol diagnostics", () => {
  it("accepts a matching success envelope", () => {
    expect(validateTanstackPreviewWorkerReply({ id: 1, status: 200 }))
      .toEqual({ id: 1, status: 200 });
  });

  it.each([
    "loopback_connection",
    "vite_request",
    "vite_response",
    "worker_protocol",
  ] as const)("preserves the bounded %s category", expected => {
    expect(stage({ id: 1, error: expected })).toBe(expected);
  });

  it("maps malformed and worker-controlled errors to the protocol category", () => {
    expect(stage({ id: 2, error: "loopback_connection" })).toBe("worker_protocol");
    expect(stage({ id: 1, error: "capability-token-or-user-source" }))
      .toBe("worker_protocol");
    expect(stage("not-an-envelope")).toBe("worker_protocol");
  });
});
