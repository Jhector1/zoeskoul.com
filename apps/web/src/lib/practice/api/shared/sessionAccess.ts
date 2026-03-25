import { requireEntitledUser } from "@/lib/billing/requireEntitledUser";
import {Actor} from "@/lib/practice/actor";

type SharedSessionShape = {
    id?: string | null;
    userId?: string | null;
    guestId?: string | null;
    assignmentId?: string | null;
};

function makeError(message: string, status: number, code?: string) {
    const err = new Error(message);
    (err as any).status = status;
    if (code) (err as any).code = code;
    return err;
}

export function assertSessionOwnerMatchesActor(
    session: SharedSessionShape | null | undefined,
    actor: Actor,
) {
    if (!session) return;

    if (session.userId) {
        if (!actor.userId || actor.userId !== session.userId) {
            throw makeError("Forbidden.", 403, "SESSION_OWNER_USER_MISMATCH");
        }
        return;
    }

    if (session.guestId) {
        if (!actor.guestId || actor.guestId !== session.guestId) {
            throw makeError("Forbidden.", 403, "SESSION_OWNER_GUEST_MISMATCH");
        }
        return;
    }

    throw makeError("Session has no owner.", 500, "SESSION_HAS_NO_OWNER");
}

export async function enforceSessionAssignmentEntitlement(
    session: SharedSessionShape | null | undefined,
) {
    if (!session?.assignmentId) {
        return { kind: "ok" as const };
    }

    const gate = await requireEntitledUser();
    if (!gate.ok) {
        return { kind: "res" as const, res: gate.res };
    }

    if (!session.userId || session.userId !== gate.userId) {
        throw makeError("Forbidden.", 403, "ASSIGNMENT_ENTITLEMENT_USER_MISMATCH");
    }

    return { kind: "ok" as const };
}