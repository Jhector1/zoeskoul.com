import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { updateTutoringSession } from "@/lib/tutoring/sessionAdminServer";
import { safeParseTutoringSessionUpdate } from "@/lib/validators/tutoringSession";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const parsed = safeParseTutoringSessionUpdate(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await updateTutoringSession(prisma, {
    teachingUser,
    sessionId: id,
    input: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return NextResponse.json({ session: result.session });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.tutoringSession.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.tutoringSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
