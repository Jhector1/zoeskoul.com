import { requireAdmin } from "@/lib/admin/requireAdmin";
import {
  StudentCampaignWriteSchema,
  effectiveStudentCampaignEnabled,
} from "@/lib/campaigns/studentCampaignAdmin";
import {
  appCorsJson,
  appCorsPreflight,
  applyAppCorsHeaders,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import { readJsonSafe } from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

async function adminDenied(request: Request) {
  const denied = await requireAdmin(request);
  return denied
    ? applyAppCorsHeaders(request, denied)
    : null;
}

export async function PATCH(
  request: Request,
  context: Context,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const denied = await adminDenied(request);
  if (denied) return denied;

  const { id } = await context.params;
  const existing =
    await prisma.studentCampaign.findUnique({
      where: { id },
      select: { id: true },
    });

  if (!existing) {
    return appCorsJson(
      request,
      { error: "Student campaign not found." },
      { status: 404 },
    );
  }

  const parsed =
    StudentCampaignWriteSchema.safeParse(
      await readJsonSafe(request),
    );

  if (!parsed.success) {
    return appCorsJson(
      request,
      {
        error: "Invalid student campaign.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const campaign =
    await prisma.studentCampaign.update({
      where: { id },
      data: {
        name: data.name,
        title: data.title,
        body: data.body,
        ctaLabel: data.ctaLabel,
        ctaHref: data.ctaHref,
        status: data.status,
        audience: data.audience,
        displayFrequency: data.displayFrequency,
        priority: data.priority,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        enabled:
          effectiveStudentCampaignEnabled(
            data.status,
            data.enabled,
          ),
        tutoringGrantMinutes:
          data.tutoringGrantMinutes,
      },
    });

  return appCorsJson(request, { campaign });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
