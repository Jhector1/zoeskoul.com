import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  appCorsJson,
  isAppOriginAllowed,
} from "./appCors";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app CORS configured preview origins", () => {
  it("allows the exact configured Student preview origin", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
      "https://student-preview.zoeskoul.com",
    );

    const request = new Request(
      "https://web-preview.zoeskoul.com/api/app-session",
      {
        headers: {
          Origin:
            "https://student-preview.zoeskoul.com",
        },
      },
    );

    expect(isAppOriginAllowed(request)).toBe(true);

    const response = appCorsJson(request, {
      authenticated: false,
    });

    expect(
      response.headers.get(
        "Access-Control-Allow-Origin",
      ),
    ).toBe(
      "https://student-preview.zoeskoul.com",
    );
    expect(
      response.headers.get(
        "Access-Control-Allow-Credentials",
      ),
    ).toBe("true");
  });

  it("rejects a lookalike preview origin", () => {
    vi.stubEnv(
      "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
      "https://student-preview.zoeskoul.com",
    );

    const request = new Request(
      "https://web-preview.zoeskoul.com/api/app-session",
      {
        headers: {
          Origin:
            "https://student-preview.zoeskoul.com.evil.example",
        },
      },
    );

    expect(isAppOriginAllowed(request)).toBe(false);
  });
});
