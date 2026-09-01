import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateTutoringPrice,
  isValidTutoringMinutes,
  MAX_TUTORING_MINUTES,
  MIN_TUTORING_MINUTES,
  TUTORING_MINUTE_INCREMENT,
} from "./tutoringPricing";

describe(
  "tutoring any-whole-minute pricing",
  () => {
    it("accepts arbitrary whole-minute durations inside bounds", () => {
      for (const minutes of [
        30,
        31,
        37,
        100,
        101,
        137,
        719,
        720,
      ]) {
        expect(
          isValidTutoringMinutes(
            minutes,
          ),
        ).toBe(true);
      }
    });

    it("rejects invalid durations", () => {
      for (const minutes of [
        0,
        29,
        30.5,
        720.5,
        721,
      ]) {
        expect(
          isValidTutoringMinutes(
            minutes,
          ),
        ).toBe(false);
      }
    });

    it("prices arbitrary whole minutes at the canonical rate", () => {
      expect(
        calculateTutoringPrice(
          100,
        ),
      ).toMatchObject({
        minutes: 100,
        amountMinor: 11000,
        currency: "usd",
      });
      expect(
        calculateTutoringPrice(
          137,
        ).amountMinor,
      ).toBe(15070);
    });

    it("presents one-minute input increments and keeps existing bounds", () => {
      expect(
        TUTORING_MINUTE_INCREMENT,
      ).toBe(1);
      expect(
        MIN_TUTORING_MINUTES,
      ).toBe(30);
      expect(
        MAX_TUTORING_MINUTES,
      ).toBe(720);
    });
  },
);
