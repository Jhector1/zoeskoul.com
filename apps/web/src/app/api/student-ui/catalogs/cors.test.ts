import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "@/lib/subjects/server/catalogVisibility",
  () => ({
    getAvailableVisibleCatalogsForActor: vi.fn(),
    getAvailableVisibleCatalogForActor: vi.fn(),
  }),
);

vi.mock(
  "@/lib/subjects/catalogImagePresentation",
  () => ({
    withResolvedCatalogImage: vi.fn(
      (catalog: unknown) => catalog,
    ),
  }),
);

import {
  OPTIONS as detailOptions,
} from "./[catalogSlug]/route";
import {
  OPTIONS as listOptions,
} from "./route";

type OptionsHandler = (
  request: Request,
) => Promise<Response>;

const routes: Array<{
  name: string;
  url: string;
  options: OptionsHandler;
}> = [
  {
    name: "catalog list",
    url:
      "https://web-preview.zoeskoul.com" +
      "/api/student-ui/catalogs",
    options: listOptions,
  },
  {
    name: "catalog detail",
    url:
      "https://web-preview.zoeskoul.com" +
      "/api/student-ui/catalogs/core",
    options: detailOptions,
  },
];

function preflight(
  url: string,
  origin: string,
): Request {
  return new Request(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(routes)(
  "Student UI $name CORS",
  ({ url, options }) => {
    it("accepts the canonical production Student origin", async () => {
      const origin =
        "https://student.zoeskoul.com";

      const response = await options(
        preflight(url, origin),
      );

      expect(response.status).toBe(204);
      expect(
        response.headers.get(
          "Access-Control-Allow-Origin",
        ),
      ).toBe(origin);
      expect(
        response.headers.get(
          "Access-Control-Allow-Credentials",
        ),
      ).toBe("true");
    });

    it("accepts the exact configured Student preview origin", async () => {
      vi.stubEnv(
        "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
        "https://student-preview.zoeskoul.com",
      );

      const origin =
        "https://student-preview.zoeskoul.com";

      const response = await options(
        preflight(url, origin),
      );

      expect(response.status).toBe(204);
      expect(
        response.headers.get(
          "Access-Control-Allow-Origin",
        ),
      ).toBe(origin);
    });

    it("preserves the server-only Student origin configuration", async () => {
      vi.stubEnv(
        "STUDENT_APP_ORIGIN",
        "https://student-branch.example.com",
      );

      const origin =
        "https://student-branch.example.com";

      const response = await options(
        preflight(url, origin),
      );

      expect(response.status).toBe(204);
      expect(
        response.headers.get(
          "Access-Control-Allow-Origin",
        ),
      ).toBe(origin);
    });

    it("rejects a configured-preview lookalike origin", async () => {
      vi.stubEnv(
        "NEXT_PUBLIC_ZOESKOUL_ADDITIONAL_TRUSTED_BROWSER_ORIGINS",
        "https://student-preview.zoeskoul.com",
      );

      const response = await options(
        preflight(
          url,
          "https://student-preview.zoeskoul.com.evil.example",
        ),
      );

      expect(response.status).toBe(403);
      expect(
        response.headers.get(
          "Access-Control-Allow-Origin",
        ),
      ).toBeNull();
    });
  },
);
