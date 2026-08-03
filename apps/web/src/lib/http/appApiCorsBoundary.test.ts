import {
  describe,
  expect,
  it,
} from "vitest";
import { NextRequest } from "next/server";

import {
  handleAppApiCorsBoundary,
} from "./appApiCorsBoundary";

const studentOrigin =
  "https://student.zoeskoul.com";

function request(args: {
  pathname: string;
  method?: string;
  origin?: string;
}) {
  return new NextRequest(
    `https://zoeskoul.com${args.pathname}`,
    {
      method: args.method ?? "GET",
      headers: args.origin
        ? { Origin: args.origin }
        : undefined,
    },
  );
}

describe(
  "Web API cross-application CORS boundary",
  () => {
    it(
      "adds credentialed CORS headers for trusted Student API requests",
      () => {
        const response =
          handleAppApiCorsBoundary(
            request({
              pathname:
                "/api/review/content-version",
              origin: studentOrigin,
            }),
          );

        expect(response).not.toBeNull();
        expect(
          response?.headers.get(
            "Access-Control-Allow-Origin",
          ),
        ).toBe(studentOrigin);
        expect(
          response?.headers.get(
            "Access-Control-Allow-Credentials",
          ),
        ).toBe("true");
        expect(
          response?.headers.get("Vary"),
        ).toContain("Origin");
      },
    );

    it(
      "handles trusted preflight requests before route dispatch",
      () => {
        const response =
          handleAppApiCorsBoundary(
            request({
              pathname:
                "/api/tools/doc",
              method: "OPTIONS",
              origin: studentOrigin,
            }),
          );

        expect(response?.status).toBe(204);
        expect(
          response?.headers.get(
            "Access-Control-Allow-Origin",
          ),
        ).toBe(studentOrigin);
        expect(
          response?.headers.get(
            "Access-Control-Allow-Methods",
          ),
        ).toContain("PUT");
      },
    );

    it(
      "rejects untrusted browser origins without reflecting them",
      async () => {
        const response =
          handleAppApiCorsBoundary(
            request({
              pathname: "/api/practice",
              origin:
                "https://student.zoeskoul.com.evil.example",
            }),
          );

        expect(response?.status).toBe(403);
        expect(
          response?.headers.get(
            "Access-Control-Allow-Origin",
          ),
        ).toBeNull();
        await expect(
          response?.json(),
        ).resolves.toEqual({
          error: "Forbidden",
        });
      },
    );

    it(
      "does not intercept non-API application routes",
      () => {
        expect(
          handleAppApiCorsBoundary(
            request({
              pathname: "/en/catalogs",
              origin: studentOrigin,
            }),
          ),
        ).toBeNull();
      },
    );
  },
);
