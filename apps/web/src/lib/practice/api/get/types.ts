import type { PrismaClient } from "@prisma/client";
import type { NextResponse } from "next/server";
import type { Actor } from "@/lib/practice/actor";

import type { GetParams } from "./schemas";
import type { PracticeGetSession } from "./repositories/session.repo";

export type PracticeGetContext = {
    prisma: PrismaClient;
    actor: Actor;
    params: GetParams;
    locale?: string;
    session: PracticeGetSession | null;
};

export type PracticeGetResult =
    | { kind: "json"; status: number; body: any }
    | { kind: "res"; res: NextResponse };