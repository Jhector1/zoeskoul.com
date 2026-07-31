import {
  describe,
  expect,
  it,
} from "vitest";

import {
  externalWebsiteHref,
} from "../compat/app-route-ownership";
import {
  resolveStudentLocation,
  resolveStudentShellLocation,
} from "./studentRoutes";

describe(
  "shared platform route ownership in the student app",
  () => {
    it(
      "sends the shared Profile page to Next",
      () => {
        expect(
          resolveStudentLocation(
            "/en/profile",
          ),
        ).toEqual({
          kind: "website",
          locale: "en",
          path: "/en/profile",
        });

        expect(
          externalWebsiteHref({
            rawHref: "/profile",
            locale: "en",
            websiteOrigin:
              "http://localhost:3000",
          }),
        ).toBe(
          "http://localhost:3000/en/profile",
        );
      },
    );

    it(
      "renders a student 404 for an unknown path",
      () => {
        expect(
          resolveStudentLocation(
            "/en/not-a-real-route",
          ),
        ).toEqual({
          kind: "not-found",
          locale: "en",
          path: "/en/not-a-real-route",
        });

        expect(
          resolveStudentShellLocation(
            "/en/not-a-real-route",
          ).kind,
        ).toBe("not-found");
      },
    );

    it(
      "keeps learning pages and localized roots in Vite",
      () => {
        expect(
          resolveStudentLocation(
            "/en",
          ).kind,
        ).toBe("my-learning");

        expect(
          resolveStudentLocation(
            "/en/subjects",
          ).kind,
        ).toBe("my-learning");

        expect(
          resolveStudentLocation(
            "/en/practice/daily",
          ).kind,
        ).toBe("daily-practice");
      },
    );
  },
);
