import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  resolveAuthRedirect,
} from "./resolveAuthRedirect";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configured preview auth redirects", () => {
  it("preserves the exact Student preview deep link", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
      "https://student-preview.zoeskoul.com",
    );

    const callback =
      "https://student-preview.zoeskoul.com/en/" +
      "subjects/python-v2/modules/python-v2-0" +
      "?tab=lesson#card";

    expect(
      resolveAuthRedirect({
        url: callback,
        baseUrl:
          "https://web-preview.zoeskoul.com",
        includeLocalApps: false,
      }),
    ).toBe(callback);
  });

  it("rejects a lookalike callback origin", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
      "https://student-preview.zoeskoul.com",
    );

    expect(
      resolveAuthRedirect({
        url:
          "https://student-preview.zoeskoul.com" +
          ".evil.example/en",
        baseUrl:
          "https://web-preview.zoeskoul.com",
        includeLocalApps: false,
      }),
    ).toBe(
      "https://web-preview.zoeskoul.com/en",
    );
  });
});
