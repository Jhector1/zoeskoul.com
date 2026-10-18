import { NextResponse } from "next/server";
import { BuildAccessError, getBuildProjectCommand } from "@zoeskoul/build-application";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

/** Owner-authorized preview receipt. Never treat a Stripe redirect as payment proof. */
export async function GET(
  request: Request,
  context: { params: Promise<{ buildProjectId: string; orderId: string }> },
) {
  const { buildProjectId, orderId } = await context.params;
  if (!buildProjectId || !orderId || orderId.length > 128) {
    return reply({ ok: false, message: "Invalid order reference." }, 400);
  }

  try {
    const access = await loadCurrentBuildAccessSnapshot(request);
    if (!access.userId) {
      return reply({ ok: false, message: "Authentication required." }, 401);
    }
    const project = await getBuildProjectCommand({
      access,
      buildProjectId,
      reader: createPrismaBuildProjectReader(prisma),
    });
    if (!project) {
      return reply({ ok: false, message: "Order not found." }, 404);
    }
    const order = await prisma.commerceOrder.findFirst({
      where: {
        id: orderId,
        store: { buildProjectId },
        paymentProvider: "stripe",
        paymentEnvironment: "test",
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentProvider: true,
        paymentEnvironment: true,
        inventoryReservations: { select: { status: true } },
      },
    });
    if (!order) {
      return reply({ ok: false, message: "Order not found." }, 404);
    }

    const reservationCount = order.inventoryReservations.length;
    const committedCount = order.inventoryReservations.filter(
      (reservation) => reservation.status === "committed",
    ).length;
    const inventoryCommitted = reservationCount === committedCount;
    const paymentConfirmed = order.paymentStatus === "paid";
    const confirmed = paymentConfirmed &&
      (order.status === "confirmed" || order.status === "fulfilled") &&
      inventoryCommitted;

    return reply({
      ok: true,
      order: {
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentProvider: order.paymentProvider,
        environment: order.paymentEnvironment,
        reservationCount,
        committedCount,
        paymentConfirmed,
        inventoryCommitted,
        confirmed,
      },
    });
  } catch (error) {
    if (error instanceof BuildAccessError) {
      return reply({ ok: false, message: "Not authorized." },
        error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403);
    }
    console.error("[ZoeBuild checkout confirmation] order read failed", {
      buildProjectId,
      error,
    });
    return reply({ ok: false, message: "Unable to verify this order." }, 500);
  }
}
