import {
  describe,
  expect,
  it,
} from "vitest";

import {
  loadTeacherLocaleMessages,
} from "./messages";

describe("loadTeacherLocaleMessages", () => {
  it("uses the shared base-locale fallback contract", async () => {
    const messages =
      await loadTeacherLocaleMessages(
        "fr",
        async (locale) =>
          locale === "en"
            ? {
                Teacher: {
                  classes: {
                    title: "Base title",
                  },
                },
              }
            : {
                Teacher: {
                  classes: {
                    title: "Titre local",
                  },
                },
              },
      );

    expect(
      (
        messages.Teacher as {
          classes: { title: string };
        }
      ).classes.title,
    ).toBe("Titre local");
  });
});
