import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cancelHumanTutoringRequest,
} from "./humanTutoringClient";

describe("learner tutoring cancellation client", () => {
  it("calls only the learner-owned cancellation endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "canceled",
          releasedReservedMinutes: false,
          balance: {
            availableMinutes: 120,
            reservedMinutes: 0,
            totalMinutes: 120,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await cancelHumanTutoringRequest(
      {
        apiOrigin: "https://example.test",
        requestId: "request-1",
      },
      fetchImpl as typeof fetch,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/api/tutoring/requests/request-1/cancel",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});
