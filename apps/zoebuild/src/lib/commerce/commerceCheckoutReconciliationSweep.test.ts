import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  summarizeStaleCommerceCheckoutSweep,
  sweepStaleCommerceCheckouts,
} from "./commerceCheckoutReconciliationSweep";

function client(
  buildProjectIds: readonly string[],
) {
  const findMany =
    vi.fn(
      async () =>
        buildProjectIds.map(
          (buildProjectId) => ({
            buildProjectId,
          }),
        ),
    );

  return {
    value: {
      commerceStore: {
        findMany,
      },
    } as unknown as PrismaClient,
    findMany,
  };
}

describe(
  "global stale commerce checkout sweep",
  () => {
    it(
      "enumerates provider-backed pending projects and delegates staleness policy to the project reconciler",
      async () => {
        const database =
          client([
            "project_a",
            "project_b",
          ]);

        const now =
          new Date(
            "2026-10-17T15:00:00.000Z",
          );

        const reconcileProject =
          vi.fn(
            async (
              _client:
                PrismaClient,
              input: Readonly<{
                buildProjectId:
                  string;
              }>,
            ) => [
              {
                orderId:
                  `order_${input.buildProjectId}`,
                provider:
                  "stripe",
                environment:
                  "test" as const,
                providerRef:
                  "cs_test_123",
                remoteState:
                  "expired" as const,
                action:
                  "expired-reconciled" as const,
              },
            ],
          );

        const result =
          await sweepStaleCommerceCheckouts(
            database.value,
            {
              now,
              legacyAgeMs:
                1234,
            },
            {
              reconcileProject:
                reconcileProject as never,
            },
          );

        expect(
          database.findMany,
        ).toHaveBeenCalledWith({
          where: {
            orders: {
              some: {
                status:
                  "pending",
                paymentStatus: {
                  in: [
                    "pending",
                    "authorized",
                  ],
                },
                paymentProvider: {
                  not:
                    null,
                },
              },
            },
          },
          orderBy: {
            buildProjectId:
              "asc",
          },
          select: {
            buildProjectId:
              true,
          },
        });

        expect(
          reconcileProject,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          reconcileProject,
        ).toHaveBeenNthCalledWith(
          1,
          database.value,
          {
            buildProjectId:
              "project_a",
            now,
            legacyAgeMs:
              1234,
            expireOpen:
              true,
          },
        );

        expect(
          result.projects.map(
            (project) =>
              project.buildProjectId,
          ),
        ).toEqual([
          "project_a",
          "project_b",
        ]);
      },
    );

    it(
      "continues after one project failure and summarizes retry-worthy errors separately from missing refs",
      async () => {
        const database =
          client([
            "project_a",
            "project_b",
            "project_c",
          ]);

        const reconcileProject =
          vi.fn(
            async (
              _client:
                PrismaClient,
              input: Readonly<{
                buildProjectId:
                  string;
              }>,
            ) => {
              if (
                input.buildProjectId ===
                "project_b"
              ) {
                throw Object.assign(
                  new Error(
                    "temporary failure",
                  ),
                  {
                    code:
                      "TEMPORARY_FAILURE",
                  },
                );
              }

              if (
                input.buildProjectId ===
                "project_c"
              ) {
                return [
                  {
                    orderId:
                      "order_c",
                    provider:
                      "stripe",
                    environment:
                      "test" as const,
                    providerRef:
                      null,
                    remoteState:
                      null,
                    action:
                      "provider-ref-missing" as const,
                    errorCode:
                      "COMMERCE_RECONCILIATION_PROVIDER_REF_MISSING",
                  },
                ];
              }

              return [
                {
                  orderId:
                    "order_a",
                  provider:
                    "stripe",
                  environment:
                    "test" as const,
                  providerRef:
                    "cs_test_a",
                  remoteState:
                    null,
                  action:
                    "error" as const,
                  errorCode:
                    "StripeConnectionError",
                },
              ];
            },
          );

        const sweep =
          await sweepStaleCommerceCheckouts(
            database.value,
            {},
            {
              reconcileProject:
                reconcileProject as never,
            },
          );

        const summary =
          summarizeStaleCommerceCheckoutSweep(
            sweep,
          );

        expect(
          summary.projectCount,
        ).toBe(
          3,
        );

        expect(
          summary.successfulProjectCount,
        ).toBe(
          2,
        );

        expect(
          summary.projectErrorCount,
        ).toBe(
          1,
        );

        expect(
          summary.orderCount,
        ).toBe(
          2,
        );

        expect(
          summary.orderErrorCount,
        ).toBe(
          1,
        );

        expect(
          summary.providerRefMissingCount,
        ).toBe(
          1,
        );

        expect(
          summary.actionCounts,
        ).toEqual({
          error:
            1,
          "provider-ref-missing":
            1,
        });
      },
    );
  },
);
