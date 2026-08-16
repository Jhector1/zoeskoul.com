export type StudentSessionProbe = {
  authenticated?: unknown;
  capabilities?: unknown;
};

export function isAuthenticatedStudentSession(
  value: unknown,
): boolean {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const session =
    value as StudentSessionProbe;

  return (
    session.authenticated === true &&
    Array.isArray(
      session.capabilities,
    ) &&
    session.capabilities.includes(
      "student:access",
    )
  );
}

export function isAuthenticatedWithoutStudentAccess(
  value: unknown,
): boolean {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const session =
    value as StudentSessionProbe;

  return (
    session.authenticated === true &&
    (
      !Array.isArray(
        session.capabilities,
      ) ||
      !session.capabilities.includes(
        "student:access",
      )
    )
  );
}
