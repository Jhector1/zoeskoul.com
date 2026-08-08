import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  resolveDeepTagged,
} from "./resolveDeepTagged";
import type {
  Values,
} from "./tagged";

describe("resolveDeepTagged", () => {
  it(
    "resolves tagged values recursively while preserving literals",
    () => {
      const values: Values = {
        learner: "Zoe",
      };

      const resolver = vi.fn(
        (
          key: string,
          receivedValues?: Values,
        ) => {
          expect(
            receivedValues,
          ).toBe(values);

          return `resolved:${key}`;
        },
      );

      const result =
        resolveDeepTagged(
          {
            title: "@:course.title",
            literal: "plain text",
            cards: [
              "@:course.cardOne",
              {
                body:
                  "@:course.cardTwo.body",
                count: 2,
              },
            ],
          },
          resolver,
          values,
        );

      expect(result).toEqual({
        title:
          "resolved:course.title",
        literal: "plain text",
        cards: [
          "resolved:course.cardOne",
          {
            body:
              "resolved:course.cardTwo.body",
            count: 2,
          },
        ],
      });

      expect(
        resolver,
      ).toHaveBeenCalledTimes(3);
    },
  );
});
