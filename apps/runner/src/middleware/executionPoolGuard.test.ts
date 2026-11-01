import { describe, expect, it } from "vitest";
import { isExecutionPoolPathAllowed } from "./executionPoolGuard.js";

describe("isolated runner execution pools", () => {
  it("restricts ZoeBuild to build routes", () => {
    expect(isExecutionPoolPathAllowed("zoebuild", "POST", "/build/previews/start")).toBe(true);
    expect(isExecutionPoolPathAllowed("zoebuild", "POST", "/sessions/start")).toBe(false);
    expect(isExecutionPoolPathAllowed("zoebuild", "POST", "/buildfoo")).toBe(false);
    expect(isExecutionPoolPathAllowed("zoebuild", "POST", "/sessions/start/build/previews/start")).toBe(false);
  });
  it("restricts Learning to session routes", () => {
    expect(isExecutionPoolPathAllowed("zoeskoul-learning", "POST", "/sessions/start")).toBe(true);
    expect(isExecutionPoolPathAllowed("zoeskoul-learning", "GET", "/sessions/abc/stream")).toBe(true);
    expect(isExecutionPoolPathAllowed("zoeskoul-learning", "POST", "/build/jobs/production-build")).toBe(false);
    expect(isExecutionPoolPathAllowed("zoeskoul-learning", "POST", "/BUILD/previews/start")).toBe(false);
  });
  it("limits health routes to read-only methods", () => {
    for (const pool of ["zoebuild", "zoeskoul-learning"] as const) {
      expect(isExecutionPoolPathAllowed(pool, "GET", "/health")).toBe(true);
      expect(isExecutionPoolPathAllowed(pool, "HEAD", "/healthz")).toBe(true);
      expect(isExecutionPoolPathAllowed(pool, "POST", "/metrics")).toBe(false);
      expect(isExecutionPoolPathAllowed(pool, "POST", "/")).toBe(false);
    }
  });
});
