import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { configureZoebuildHttpServer } from "./zoebuildHttpPolicy.js";

describe("ZoeBuild HTTP keep-alive alignment", () => {
  it("extends only the ZoeBuild idle timeout, leaving request/header limits unchanged", () => {
    const server = createServer();
    const before = [server.headersTimeout,server.requestTimeout,server.timeout,server.maxHeadersCount];
    configureZoebuildHttpServer(server,"zoebuild");
    expect(server.keepAliveTimeout).toBe(130_000);
    expect([server.headersTimeout,server.requestTimeout,server.timeout,server.maxHeadersCount]).toEqual(before);
  });
  it("preserves Learning HTTP settings", () => {
    const server = createServer();
    const original = server.keepAliveTimeout;
    configureZoebuildHttpServer(server,"zoeskoul-learning");
    expect(server.keepAliveTimeout).toBe(original);
  });
});
