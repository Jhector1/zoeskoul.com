import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: mocks.signIn,
}));

import {
  signInWithProvider,
} from "./signInWithProvider";

describe("signInWithProvider", () => {
  const redirectTo =
    "http://localhost:3002/en/subjects/python-data-functions/modules";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue(
      undefined,
    );
  });

  it.each([
    "google",
    "keycloak",
  ] as const)(
    "passes the trusted deep link to %s using the Auth.js v5 option",
    async (providerId) => {
      await signInWithProvider(
        providerId,
        redirectTo,
      );

      expect(
        mocks.signIn,
      ).toHaveBeenCalledWith(
        providerId,
        {
          redirectTo,
        },
      );
    },
  );
});
