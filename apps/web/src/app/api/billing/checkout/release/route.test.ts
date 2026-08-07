
import { beforeEach, describe, expect, it, vi } from "vitest";

const ATTEMPT_ID = "4c37ca16-f26d-4f90-8b12-76b1f387f670";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  release: vi.fn(),
  enforceSameOriginPost: vi.fn(),
  exceedsContentLength: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/billing/billingCheckoutReservation", () => ({
  releaseBillingCheckoutReservation: mocks.release,
}));
vi.mock("@/lib/practice/api/shared/http", () => ({
  enforceSameOriginPost: mocks.enforceSameOriginPost,
  exceedsContentLength: mocks.exceedsContentLength,
  readJsonSafe: (req: Request) => req.json(),
}));

import { POST } from "./route";

function request(checkoutAttemptId: string) {
  return new Request(
    "https://zoeskoul.test/api/billing/checkout/release",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkoutAttemptId }),
    },
  );
}

describe("billing checkout release route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
    mocks.enforceSameOriginPost.mockReturnValue(true);
    mocks.exceedsContentLength.mockReturnValue(false);
    mocks.release.mockResolvedValue(true);
  });

  it("rejects malformed attempt ids without touching the reservation", async () => {
    const response = await POST(request("bad"));

    expect(response.status).toBe(400);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("releases only the authenticated user's matching reservation", async () => {
    const response = await POST(request(ATTEMPT_ID));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      released: true,
    });
    expect(mocks.release).toHaveBeenCalledWith("user_1", ATTEMPT_ID);
  });
});
