import { describe, expect, it } from "vitest";

import {
  InvalidTutoringAvailabilityError,
  isValidIanaTimeZone,
  normalizeTutoringAvailability,
  tutoringWindowCovers,
} from "./tutoringAvailability";

const NOW = new Date("2026-08-29T05:00:00.000Z");

describe("tutoring availability", () => {
  it("accepts canonical IANA timezones and rejects invented ones", () => {
    expect(isValidIanaTimeZone("America/Chicago")).toBe(true);
    expect(isValidIanaTimeZone("UTC")).toBe(true);
    expect(isValidIanaTimeZone("ZoeSkoul/Mars")).toBe(false);
  });

  it("sorts non-overlapping future windows without changing their instants", () => {
    const result = normalizeTutoringAvailability({
      timeZone: "America/Chicago",
      now: NOW,
      windows: [
        {
          startsAt: new Date("2026-09-02T15:00:00.000Z"),
          endsAt: new Date("2026-09-02T17:00:00.000Z"),
        },
        {
          startsAt: new Date("2026-09-01T14:00:00.000Z"),
          endsAt: new Date("2026-09-01T16:00:00.000Z"),
        },
      ],
    });

    expect(result.windows.map((row) => row.startsAt.toISOString())).toEqual([
      "2026-09-01T14:00:00.000Z",
      "2026-09-02T15:00:00.000Z",
    ]);
  });

  it("rejects overlapping availability windows", () => {
    expect(() =>
      normalizeTutoringAvailability({
        timeZone: "America/Chicago",
        now: NOW,
        windows: [
          {
            startsAt: new Date("2026-09-01T14:00:00.000Z"),
            endsAt: new Date("2026-09-01T16:00:00.000Z"),
          },
          {
            startsAt: new Date("2026-09-01T15:30:00.000Z"),
            endsAt: new Date("2026-09-01T17:00:00.000Z"),
          },
        ],
      }),
    ).toThrow(InvalidTutoringAvailabilityError);
  });

  it("requires windows to extend into the future and stay within the horizon", () => {
    expect(() =>
      normalizeTutoringAvailability({
        timeZone: "UTC",
        now: NOW,
        windows: [
          {
            startsAt: new Date("2026-08-28T03:00:00.000Z"),
            endsAt: new Date("2026-08-28T04:00:00.000Z"),
          },
        ],
      }),
    ).toThrow("must extend into the future");

    expect(() =>
      normalizeTutoringAvailability({
        timeZone: "UTC",
        now: NOW,
        windows: [
          {
            startsAt: new Date("2027-03-01T03:00:00.000Z"),
            endsAt: new Date("2027-03-01T04:00:00.000Z"),
          },
        ],
      }),
    ).toThrow("180 days");
  });

  it("covers a booking only when the entire session fits inside the window", () => {
    expect(
      tutoringWindowCovers({
        availabilityStartsAt: new Date("2026-09-01T14:00:00.000Z"),
        availabilityEndsAt: new Date("2026-09-01T16:00:00.000Z"),
        bookingStartsAt: new Date("2026-09-01T15:00:00.000Z"),
        durationMinutes: 60,
      }),
    ).toBe(true);

    expect(
      tutoringWindowCovers({
        availabilityStartsAt: new Date("2026-09-01T14:00:00.000Z"),
        availabilityEndsAt: new Date("2026-09-01T16:00:00.000Z"),
        bookingStartsAt: new Date("2026-09-01T15:30:00.000Z"),
        durationMinutes: 60,
      }),
    ).toBe(false);
  });
});
