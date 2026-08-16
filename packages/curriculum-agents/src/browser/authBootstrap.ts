import {
  chromium,
} from "@playwright/test";
import {
  mkdir,
} from "node:fs/promises";
import {
  dirname,
} from "node:path";

import {
  isAuthenticatedStudentSession,
  isAuthenticatedWithoutStudentAccess,
} from "./authSession.js";

export type StudentAuthBootstrapOptions = {
  startUrl: string;
  apiOrigin: string;
  storageStatePath: string;
  timeoutMs?: number;
};

async function readAppSession(
  request: {
    get: (
      url: string,
      options?: {
        headers?: Record<string, string>;
        failOnStatusCode?: boolean;
      },
    ) => Promise<{
      ok: () => boolean;
      json: () => Promise<unknown>;
    }>;
  },
  apiOrigin: string,
  studentOrigin: string,
): Promise<unknown> {
  try {
    const response =
      await request.get(
        new URL(
          "/api/app-session",
          apiOrigin,
        ).toString(),
        {
          headers: {
            Origin: studentOrigin,
          },
          failOnStatusCode: false,
        },
      );

    if (!response.ok()) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function bootstrapStudentAuth(
  options: StudentAuthBootstrapOptions,
): Promise<void> {
  const studentOrigin =
    new URL(
      options.startUrl,
    ).origin;

  const browser =
    await chromium.launch({
      headless: false,
    });

  const context =
    await browser.newContext({
      viewport: {
        width: 1440,
        height: 900,
      },
    });

  const page =
    await context.newPage();

  try {
    await page.goto(
      options.startUrl,
      {
        waitUntil:
          "domcontentloaded",
      },
    );

    console.log("");
    console.log(
      "Complete normal ZoeSkoul sign-in in the opened browser.",
    );
    console.log(
      "Choose Google or SSO/Keycloak exactly as a learner would.",
    );
    console.log(
      "This window stays open until /api/app-session confirms authenticated Student access.",
    );
    console.log(
      "Credentials remain inside the browser and are never provided to the Student agent.",
    );
    console.log("");

    const deadline =
      Date.now() +
      (
        options.timeoutMs ??
        10 * 60 * 1000
      );

    while (
      Date.now() < deadline
    ) {
      const session =
        await readAppSession(
          context.request,
          options.apiOrigin,
          studentOrigin,
        );

      if (
        isAuthenticatedStudentSession(
          session,
        )
      ) {
        await mkdir(
          dirname(
            options.storageStatePath,
          ),
          {
            recursive: true,
          },
        );

        await context.storageState({
          path:
            options.storageStatePath,
        });

        console.log(
          "Authenticated Student session confirmed.",
        );
        console.log(
          `Saved learner browser state: ${options.storageStatePath}`,
        );
        return;
      }

      if (
        isAuthenticatedWithoutStudentAccess(
          session,
        )
      ) {
        throw new Error(
          "The signed-in account is authenticated but does not have the student:access capability.",
        );
      }

      await page.waitForTimeout(
        500,
      );
    }

    throw new Error(
      "Authentication timed out before /api/app-session confirmed authenticated Student access.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
