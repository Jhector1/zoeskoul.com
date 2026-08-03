import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildStudentAppHref,
  resolveWebDeploymentEnvironment,
  studentAppOrigin,
} from "./studentAppHref";

describe("Student application hrefs", () => {
  it("uses the local Student origin outside production", () => {
    expect(studentAppOrigin("development")).toBe(
      "http://localhost:3002",
    );
    expect(
      buildStudentAppHref({
        pathname: "/catalogs",
        locale: "fr",
        environment: "development",
      }),
    ).toBe("http://localhost:3002/fr/catalogs");
  });

  it("uses the production Student origin in production", () => {
    expect(studentAppOrigin("production")).toBe(
      "https://student.zoeskoul.com",
    );
    expect(
      buildStudentAppHref({
        pathname: "/practice/daily?source=home#today",
        locale: "ht",
        environment: "production",
      }),
    ).toBe(
      "https://student.zoeskoul.com/ht/practice/daily?source=home#today",
    );
  });

  it("uses the configured Student origin in preview", () => {
    expect(
      buildStudentAppHref({
        pathname:
          "/subjects/python-v2/modules?tab=practice#exercise",
        locale: "fr",
        environment: "preview",
        currentOrigin: "https://web-preview.example",
        configuredOrigin: "https://student-preview.example/",
      }),
    ).toBe(
      "https://student-preview.example/fr/subjects/python-v2/modules?tab=practice#exercise",
    );
  });

  it("fails closed on Web preview when Student configuration is missing", () => {
    expect(
      studentAppOrigin({
        environment: "preview",
        currentOrigin: "https://web-preview.example",
        configuredOrigin: null,
      }),
    ).toBe("https://web-preview.example");
  });

  it("rejects an invalid preview origin without using production", () => {
    expect(
      studentAppOrigin({
        environment: "preview",
        currentOrigin: "https://web-preview.example",
        configuredOrigin:
          "https://student-preview.example/path",
      }),
    ).toBe("https://web-preview.example");
  });

  it("detects local, Vercel preview, Cloudflare preview, and production", () => {
    expect(
      resolveWebDeploymentEnvironment({
        currentOrigin: "http://localhost:3000",
      }),
    ).toBe("development");
    expect(
      resolveWebDeploymentEnvironment({
        vercelEnvironment: "preview",
      }),
    ).toBe("preview");
    expect(
      resolveWebDeploymentEnvironment({
        cloudflarePages: "1",
        cloudflareBranch: "feature/student-preview",
      }),
    ).toBe("preview");
    expect(
      resolveWebDeploymentEnvironment({
        currentOrigin: "https://zoeskoul.com",
      }),
    ).toBe("production");
  });
});
