export const TUTORING_DOCUMENT_LIMITS = {
  maxKeyLength: 160,
  maxCardKeyLength: 200,
  maxBoardBytes: 512 * 1024,
  maxProgressBytes: 12 * 1024 * 1024,
  maxSharedBoardDocuments: 512,
  maxSharedBoardBytes: 32 * 1024 * 1024,
  maxParticipantProgressDocuments: 64,
  maxParticipantProgressBytes: 64 * 1024 * 1024,
  maxSnapshotBytes: 24 * 1024 * 1024,
  maxSnapshotModules: 64,
  maxBoardKeys: 10_000,
} as const;

export function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export function participantOwnerKey(userId: string) {
  return `user:${userId}`;
}

const BOARD_KEY_SEPARATOR = "\u001f";

export function boardDocumentKey(moduleKey: string, cardKey: string) {
  return `${moduleKey}${BOARD_KEY_SEPARATOR}${cardKey}`;
}

export function isValidModuleKey(moduleKeys: readonly string[], moduleKey: string) {
  return (
    moduleKey.length > 0 &&
    moduleKey.length <= TUTORING_DOCUMENT_LIMITS.maxKeyLength &&
    moduleKeys.includes(moduleKey)
  );
}

export function isValidBoardCardKey(cardKey: string) {
  return (
    cardKey.length > 0 &&
    cardKey.length <= TUTORING_DOCUMENT_LIMITS.maxCardKeyLength &&
    /^card:[A-Za-z0-9._~:/-]+$/.test(cardKey)
  );
}

export function validateBoardDocumentInput(args: {
  moduleKeys: readonly string[];
  scopeAllowed: boolean;
  moduleKey: string;
  cardKey: string;
  toolId: string;
  body: string;
}) {
  if (!isValidModuleKey(args.moduleKeys, args.moduleKey)) {
    return { ok: false as const, status: 404 as const, error: "Module not found" };
  }
  if (
    !isValidBoardCardKey(args.cardKey) ||
    args.toolId !== "board" ||
    !args.scopeAllowed
  ) {
    return { ok: false as const, status: 400 as const, error: "Invalid document key" };
  }
  const byteSize = utf8Bytes(args.body);
  if (byteSize > TUTORING_DOCUMENT_LIMITS.maxBoardBytes) {
    return { ok: false as const, status: 413 as const, error: "Board document is too large" };
  }
  return { ok: true as const, byteSize };
}
