import { describe, expect, it } from "vitest";

import {
  buildReviewModuleBootstrapIdentity,
  canRenderReviewModuleBootstrapData,
} from "./reviewModuleBootstrapIdentity";

describe("Review module bootstrap ownership", () => {
  it("changes identity at a real module boundary", () => {
    const a = buildReviewModuleBootstrapIdentity({
      locale: "en",
      subjectSlug: "sql-v2",
      moduleSlug: "sql-v2-2",
    });
    const b = buildReviewModuleBootstrapIdentity({
      locale: "en",
      subjectSlug: "sql-v2",
      moduleSlug: "sql-v2-3",
    });
    expect(b).not.toBe(a);
  });

  it("rejects ready data owned by the previous module", () => {
    expect(
      canRenderReviewModuleBootstrapData({
        requestIdentity: "en:sql-v2:sql-v2-3",
        stateIdentity: "en:sql-v2:sql-v2-2",
        status: "ready",
      }),
    ).toBe(false);
  });

  it("renders only current ready data", () => {
    expect(
      canRenderReviewModuleBootstrapData({
        requestIdentity: "en:sql-v2:sql-v2-3",
        stateIdentity: "en:sql-v2:sql-v2-3",
        status: "ready",
      }),
    ).toBe(true);
  });
});
