import { describe, expect, it } from "vitest";

import {
  appCorsJson,
  isAppOriginAllowed,
} from "./appCors";

function request(apiUrl: string, origin?: string) {
  return new Request(apiUrl, {
    headers: origin ? { Origin: origin } : undefined,
  });
}

describe("app API CORS", () => {
  it("allows the local student app against the local website API", () => {
    const req = request(
      "http://localhost:3000/api/app-session",
      "http://localhost:3002",
    );

    expect(isAppOriginAllowed(req)).toBe(true);

    const response = appCorsJson(req, { ok: true });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3002",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
  });

  it("allows the production teacher app", () => {
    const req = request(
      "https://zoeskoul.com/api/app-session",
      "https://teacher.zoeskoul.com",
    );

    expect(isAppOriginAllowed(req)).toBe(true);
  });

  it("allows the canonical website origin behind an HTTPS reverse proxy", () => {
    const req = request(
      "http://zoeskoul-web:3000/api/billing/portal",
      "https://zoeskoul.com",
    );

    expect(isAppOriginAllowed(req)).toBe(true);
  });

  it("does not allow localhost against the production API", () => {
    const req = request(
      "https://zoeskoul.com/api/app-session",
      "http://localhost:3002",
    );

    expect(isAppOriginAllowed(req)).toBe(false);
  });

  it("allows same-origin and server-side requests without Origin", () => {
    expect(
      isAppOriginAllowed(
        request("https://zoeskoul.com/api/app-session"),
      ),
    ).toBe(true);
  });
});
