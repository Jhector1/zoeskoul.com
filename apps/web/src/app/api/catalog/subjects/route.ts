import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // adjust import

export async function GET() {
  const subjects = await prisma.practiceSubject.findMany({
    orderBy: { order: "asc" },
    include: {
      modules: { orderBy: { order: "asc" }, select: { slug: true, title: true, order: true } },
      sections: { orderBy: { order: "asc" }, select: { slug: true, title: true, order: true, moduleId: true } },
    },
  });

  return NextResponse.json({ subjects });
}
