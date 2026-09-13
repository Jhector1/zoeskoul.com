import { describe, expect, it } from "vitest";
import { resolveFullIdeWorkspaceChangeOrigin } from "./workspaceChangeOrigin";

describe("resolveFullIdeWorkspaceChangeOrigin", () => {
  it("labels the first changed workspace after a learner mutation as user-authored", () => {
    expect(
      resolveFullIdeWorkspaceChangeOrigin({
        pending: { beforeKey: "before", token: 1 },
        currentKey: "after",
      }),
    ).toEqual({
      origin: "user",
      consumePending: true,
    });
  });

  it("does not consume a pending mutation until the workspace actually changes", () => {
    expect(
      resolveFullIdeWorkspaceChangeOrigin({
        pending: { beforeKey: "same", token: 1 },
        currentKey: "same",
      }),
    ).toEqual({
      origin: "sync",
      consumePending: false,
    });
  });

  it("keeps programmatic hydration classified as sync", () => {
    expect(
      resolveFullIdeWorkspaceChangeOrigin({
        pending: null,
        currentKey: "hydrated",
      }),
    ).toEqual({
      origin: "sync",
      consumePending: false,
    });
  });
});
