import {
  describe,
  expect,
  it,
} from "vitest";

import {
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "./appCors";

function request(args: {
  origin: string;
  method?: string;
}) {
  return new Request(
    "http://localhost:3000/api/review/progress",
    {
      method: args.method ?? "GET",
      headers: {
        Origin: args.origin,
      },
    },
  );
}

describe("review progress app CORS", () => {
  it("allows credentialed student-app GET responses", () => {
    const incoming = request({
      origin: "http://localhost:3002",
    });

    expect(isAppOriginAllowed(incoming)).toBe(true);

    const response = applyAppCorsHeaders(
      incoming,
      Response.json({ progress: null }),
    );

    expect(
      response.headers.get(
        "Access-Control-Allow-Origin",
      ),
    ).toBe("http://localhost:3002");
    expect(
      response.headers.get(
        "Access-Control-Allow-Credentials",
      ),
    ).toBe("true");
  });

  it("preflights review-progress mutations from the student app", () => {
    const response = appCorsPreflight(
      request({
        origin: "http://localhost:3002",
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);

    const methods =
      response.headers.get(
        "Access-Control-Allow-Methods",
      ) ?? "";

    expect(methods).toContain("PUT");
    expect(methods).toContain("DELETE");
    expect(
      response.headers.get(
        "Access-Control-Allow-Origin",
      ),
    ).toBe("http://localhost:3002");
  });

  it("rejects unknown browser origins", () => {
    const incoming = request({
      origin: "https://untrusted.example",
    });

    expect(isAppOriginAllowed(incoming)).toBe(false);
    expect(appCorsPreflight(incoming).status).toBe(403);
  });
});
