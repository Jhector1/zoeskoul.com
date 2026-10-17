import "server-only";

import type { PrismaClient } from "@zoeskoul/db";

import {
  reconcileStaleCommerceCheckouts,
  type CommerceStaleCheckoutReconciliationResult,
} from "./commerceCheckoutReconciliation";

export type CommerceStaleCheckoutSweepProjectResult =
  | Readonly<{
      buildProjectId: string;
      status: "ok";
      results: readonly CommerceStaleCheckoutReconciliationResult[];
    }>
  | Readonly<{
      buildProjectId: string;
      status: "error";
      errorCode: string;
    }>;

export type CommerceStaleCheckoutSweepResult =
  Readonly<{
    scannedAt: Date;
    projects: readonly CommerceStaleCheckoutSweepProjectResult[];
  }>;

export type CommerceStaleCheckoutSweepSummary =
  Readonly<{
    scannedAt: string;
    projectCount: number;
    successfulProjectCount: number;
    projectErrorCount: number;
    orderCount: number;
    orderErrorCount: number;
    providerRefMissingCount: number;
    actionCounts: Readonly<
      Partial<
        Record<
          CommerceStaleCheckoutReconciliationResult["action"],
          number
        >
      >
    >;
  }>;

type ProjectReconciler =
  typeof reconcileStaleCommerceCheckouts;

function errorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (
      error as Readonly<{ code?: unknown }>
    ).code === "string"
  ) {
    return (
      error as Readonly<{ code: string }>
    ).code;
  }

  return error instanceof Error
    ? error.name
    : "UNKNOWN_ERROR";
}

/**
 * Global recurring owner for stale-checkout reconciliation.
 *
 * It intentionally enumerates the broader set of projects with provider-backed
 * pending orders and delegates every staleness decision to the existing
 * project-scoped reconciler. This avoids duplicating expiry policy here.
 */
export async function sweepStaleCommerceCheckouts(
  client: PrismaClient,
  input: Readonly<{
    now?: Date;
    legacyAgeMs?: number;
    expireOpen?: boolean;
  }> = {},
  options: Readonly<{
    reconcileProject?: ProjectReconciler;
  }> = {},
): Promise<CommerceStaleCheckoutSweepResult> {
  const now =
    input.now ??
    new Date();

  const reconcileProject =
    options.reconcileProject ??
    reconcileStaleCommerceCheckouts;

  const stores =
    await client.commerceStore.findMany({
      where: {
        orders: {
          some: {
            status: "pending",
            paymentStatus: {
              in: [
                "pending",
                "authorized",
              ],
            },
            paymentProvider: {
              not: null,
            },
          },
        },
      },
      orderBy: {
        buildProjectId: "asc",
      },
      select: {
        buildProjectId: true,
      },
    });

  const projects:
    CommerceStaleCheckoutSweepProjectResult[] =
      [];

  for (const store of stores) {
    try {
      const results =
        await reconcileProject(
          client,
          {
            buildProjectId:
              store.buildProjectId,
            now,
            legacyAgeMs:
              input.legacyAgeMs,
            expireOpen:
              input.expireOpen ??
              true,
          },
        );

      projects.push({
        buildProjectId:
          store.buildProjectId,
        status:
          "ok",
        results,
      });
    } catch (error) {
      projects.push({
        buildProjectId:
          store.buildProjectId,
        status:
          "error",
        errorCode:
          errorCode(error),
      });
    }
  }

  return {
    scannedAt: now,
    projects,
  };
}

export function summarizeStaleCommerceCheckoutSweep(
  sweep: CommerceStaleCheckoutSweepResult,
): CommerceStaleCheckoutSweepSummary {
  const actionCounts:
    Partial<
      Record<
        CommerceStaleCheckoutReconciliationResult["action"],
        number
      >
    > =
      {};

  let successfulProjectCount = 0;
  let projectErrorCount = 0;
  let orderCount = 0;
  let orderErrorCount = 0;
  let providerRefMissingCount = 0;

  for (const project of sweep.projects) {
    if (project.status === "error") {
      projectErrorCount += 1;
      continue;
    }

    successfulProjectCount += 1;

    for (const result of project.results) {
      orderCount += 1;

      actionCounts[result.action] =
        (actionCounts[result.action] ?? 0) + 1;

      if (result.action === "error") {
        orderErrorCount += 1;
      }

      if (
        result.action ===
        "provider-ref-missing"
      ) {
        providerRefMissingCount += 1;
      }
    }
  }

  return {
    scannedAt:
      sweep.scannedAt.toISOString(),
    projectCount:
      sweep.projects.length,
    successfulProjectCount,
    projectErrorCount,
    orderCount,
    orderErrorCount,
    providerRefMissingCount,
    actionCounts,
  };
}
