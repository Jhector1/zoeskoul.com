export type FullIdeWorkspaceChangeOrigin = "user" | "sync";

export type PendingUserWorkspaceMutation = {
  beforeKey: string;
  token: number;
};

export function resolveFullIdeWorkspaceChangeOrigin(args: {
  pending: PendingUserWorkspaceMutation | null;
  currentKey: string;
}): {
  origin: FullIdeWorkspaceChangeOrigin;
  consumePending: boolean;
} {
  if (args.pending && args.pending.beforeKey !== args.currentKey) {
    return {
      origin: "user",
      consumePending: true,
    };
  }

  return {
    origin: "sync",
    consumePending: false,
  };
}
