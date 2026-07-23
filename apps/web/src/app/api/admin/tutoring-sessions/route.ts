import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { TutoringSessionInputSchema } from "@/lib/validators/tutoringSession";
import { createTutoringSession } from "@/lib/tutoring/sessionAdminServer";

export const runtime = "nodejs";

export async function GET() {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sessions = await prisma.tutoringSession.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: {
      subject: { select: { id: true, slug: true, title: true, visibility: true } },
      _count: { select: { users: true, groups: true, documents: true } },
    },
  });
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = TutoringSessionInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createTutoringSession(prisma, { teachingUser, input: parsed.data });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json({ session: result.session }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Could not create tutoring session." }, { status: 400 });
  }
}
