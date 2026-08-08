import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  loadStudentLocaleMessages,
} from "./messages";

describe("loadStudentLocaleMessages", () => {
  it(
    "keeps English course values when French keys are missing",
    async () => {
      const loader = vi.fn(
        async (locale: string) => {
          if (locale === "en") {
            return {
              course: {
                title: "Python Fundamentals",
                description:
                  "Learn Python from the beginning.",
              },
            };
          }

          return {
            course: {
              title: "Fondamentaux de Python",
            },
          };
        },
      );

      await expect(
        loadStudentLocaleMessages(
          "fr",
          loader,
        ),
      ).resolves.toEqual({
        course: {
          title: "Fondamentaux de Python",
          description:
            "Learn Python from the beginning.",
        },
      });

      expect(loader.mock.calls).toEqual([
        ["en"],
        ["fr"],
      ]);
    },
  );

  it(
    "uses the same English fallback for Haitian Creole",
    async () => {
      const loader = vi.fn(
        async (locale: string) => {
          if (locale === "en") {
            return {
              lesson: {
                title: "Working with Lists",
                next: "Next lesson",
              },
            };
          }

          return {
            lesson: {
              next: "Pwochen leson",
            },
          };
        },
      );

      await expect(
        loadStudentLocaleMessages(
          "ht",
          loader,
        ),
      ).resolves.toEqual({
        lesson: {
          title: "Working with Lists",
          next: "Pwochen leson",
        },
      });
    },
  );
});
