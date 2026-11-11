/**
 * Docker resources may remain inspectable briefly after a successful remove.
 * 404 is the only confirmed-absent result. A persistent object returns false;
 * unexpected daemon errors fail closed and are surfaced to the operator route.
 */
export async function confirmDockerResourceAbsent(
  inspect: () => Promise<unknown>,
  options: {
    attempts?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 20;
  const intervalMs = options.intervalMs ?? 250;
  const sleep = options.sleep ?? ((ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)));
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20 ||
      !Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 1000) {
    throw new Error("Invalid administrator cleanup verification bounds.");
  }

  for (let index = 0; index < attempts; index += 1) {
    try {
      await inspect();
    } catch (error) {
      if ((error as { statusCode?: number })?.statusCode === 404) return true;
      throw error;
    }
    if (index + 1 < attempts) await sleep(intervalMs);
  }
  return false;
}
