type ActiveSessionShape = {
    status?: string | null;
};

function makeError(message: string, status: number, code?: string) {
    const err = new Error(message);
    (err as any).status = status;
    if (code) (err as any).code = code;
    return err;
}

export function assertPracticeSessionActive(
    session: ActiveSessionShape | null | undefined,
) {
    if (!session) return;

    if (session.status !== "active") {
        throw makeError("Session is not active.", 400, "SESSION_NOT_ACTIVE");
    }
}