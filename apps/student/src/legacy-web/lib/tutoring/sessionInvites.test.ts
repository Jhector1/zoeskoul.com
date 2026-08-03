import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { tutoringSessionInviteState } from "./sessionInvites";

const future = new Date("2026-08-25T00:00:00.000Z");
const now = new Date("2026-07-25T00:00:00.000Z");

function invite(overrides: Record<string, unknown> = {}) {
  return {
    expiresAt: future,
    viewedAt: null,
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("tutoringSessionInviteState", () => {
  it("moves from invited to viewed and accepted", () => {
    expect(tutoringSessionInviteState(invite(), now)).toBe("invited");
    expect(
      tutoringSessionInviteState(invite({ viewedAt: new Date() }), now),
    ).toBe("viewed");
    expect(
      tutoringSessionInviteState(
        invite({ viewedAt: new Date(), acceptedAt: new Date() }),
        now,
      ),
    ).toBe("accepted");
  });

  it("keeps terminal states deterministic", () => {
    expect(
      tutoringSessionInviteState(invite({ declinedAt: new Date() }), now),
    ).toBe("declined");
    expect(
      tutoringSessionInviteState(
        invite({ expiresAt: new Date("2026-07-24T00:00:00.000Z") }),
        now,
      ),
    ).toBe("expired");
    expect(
      tutoringSessionInviteState(
        invite({ acceptedAt: new Date(), revokedAt: new Date() }),
        now,
      ),
    ).toBe("cancelled");
  });
});
