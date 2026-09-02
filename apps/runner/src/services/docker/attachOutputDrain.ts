
import { finished } from "node:stream/promises";

/**
 * Docker's container.wait() can resolve before the hijacked attach stream has
 * emitted its final readable bytes. Code-session finalization must therefore
 * wait for the readable side to drain before publishing exit/final status.
 *
 * Stream errors are surfaced independently by the session's attach "error"
 * handler. The drain barrier settles on an error so a dead attach stream cannot
 * wedge session finalization forever.
 */
export async function waitForAttachOutputDrain(
  stream: NodeJS.ReadWriteStream,
): Promise<void> {
  try {
    await finished(stream, {
      readable: true,
      writable: false,
    });
  } catch {
    // The caller's attach error handler owns the user-visible error event.
  }
}
