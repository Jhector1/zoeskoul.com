import type { PrismaClient } from "@prisma/client";
import type { NextResponse } from "next/server";
import type { Actor } from "@/lib/practice/actor";

import type { ValidateBody } from "./schemas";
import type { LoadedValidateInstance } from "./repositories/instance.repo";

export type PracticeValidateContext = {
    prisma: PrismaClient;
    req: Request;
    requestId: string;
    body: ValidateBody;
    key: string;
    payload: any;
    actor: Actor;
    setGuestId: string | null;
    instance: LoadedValidateInstance;
    session: LoadedValidateInstance["session"] | null;
    locale: string;
};

export type PracticeValidatePrepResult =
    | { kind: "ok"; ctx: PracticeValidateContext }
    | { kind: "res"; res: NextResponse };