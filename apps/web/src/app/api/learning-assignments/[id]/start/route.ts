import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { openLearningAssignmentForUser } from "@/lib/learningAssignments/openLearningAssignment";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Context) {
  const actor = await getActor();
  if (!actor.userId) {
    return NextResponse.json(
      { error: "Sign in to open this assigned course." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const result = await openLearningAssignmentForUser(prisma, {
    assignmentId: id,
    userId: actor.userId,
    actorKey: actorKeyOf(actor),
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error:
          result.error === "upcoming"
            ? "This course is not open yet."
            : "This course assignment is closed.",
        availability: result.availability,
      },
      { status: result.status },
    );
  }

  return NextResponse.json(result);
}
