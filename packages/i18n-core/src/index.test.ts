import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  loadMessagesWithFallback,
  mergeMessages,
} from "./index";

describe("mergeMessages", () => {
  it("uses English when a localized nested key is missing", () => {
    const english = {
      course: {
        title: "Python Fundamentals",
        lesson: {
          title: "Working with Lists",
          next: "Next lesson",
        },
      },
    };

    const french = {
      course: {
        title: "Fondamentaux de Python",
        lesson: {
          next: "Leçon suivante",
        },
      },
    };

    expect(
      mergeMessages(english, french),
    ).toEqual({
      course: {
        title: "Fondamentaux de Python",
        lesson: {
          title: "Working with Lists",
          next: "Leçon suivante",
        },
      },
    });
  });

  it("lets localized values override English", () => {
    expect(
      mergeMessages(
        {
          title: "English title",
          count: 1,
          choices: ["One", "Two"],
        },
        {
          title: "Titre français",
          count: 2,
          choices: ["Un", "Deux"],
        },
      ),
    ).toEqual({
      title: "Titre français",
      count: 2,
      choices: ["Un", "Deux"],
    });
  });

  it("does not mutate the English base tree", () => {
    const english = {
      lesson: {
        title: "English lesson",
        description: "English description",
      },
    };

    const localized = {
      lesson: {
        title: "Leçon française",
      },
    };

    mergeMessages(english, localized);

    expect(english).toEqual({
      lesson: {
        title: "English lesson",
        description: "English description",
      },
    });
  });
});

describe("loadMessagesWithFallback", () => {
  it("loads only English when English is selected", async () => {
    const loader = vi.fn(
      async (locale: string) => ({
        title:
          locale === "en"
            ? "English"
            : "Localized",
      }),
    );

    await expect(
      loadMessagesWithFallback({
        locale: "en",
        loadLocaleMessages: loader,
      }),
    ).resolves.toEqual({
      title: "English",
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith("en");
  });

  it("loads English then overlays the selected locale", async () => {
    const loader = vi.fn(
      async (locale: string) => {
        if (locale === "en") {
          return {
            course: {
              title: "English title",
              untranslated:
                "This remains English",
            },
          };
        }

        return {
          course: {
            title: "Titre français",
          },
        };
      },
    );

    await expect(
      loadMessagesWithFallback({
        locale: "fr",
        loadLocaleMessages: loader,
      }),
    ).resolves.toEqual({
      course: {
        title: "Titre français",
        untranslated:
          "This remains English",
      },
    });

    expect(loader.mock.calls).toEqual([
      ["en"],
      ["fr"],
    ]);
  });
});
