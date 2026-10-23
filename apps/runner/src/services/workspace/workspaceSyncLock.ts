/** Serialize runner-managed reads/writes for each workspace. This intentionally
 * does not lock PTY processes: terminal writes are checked optimistically by
 * replaceWorkspaceFiles against the caller's baseline before mutations.
 */
const tails = new Map<string, Promise<void>>();

export async function withWorkspaceSyncLock<T>(
  workspaceDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(workspaceDir) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>((resolve) => { release = resolve; });
  tails.set(workspaceDir, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (tails.get(workspaceDir) === tail) tails.delete(workspaceDir);
  }
}
