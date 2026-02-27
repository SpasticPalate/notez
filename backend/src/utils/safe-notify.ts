/**
 * Safely execute a fire-and-forget async operation.
 *
 * Wraps the promise in a double try-catch so even if the error handler
 * itself throws (e.g. JSON.stringify on a circular object), the
 * rejection is still caught and never becomes unhandled.
 */
export function safeFireAndForget(
  promise: Promise<unknown>,
  context: string,
): void {
  promise.catch((err: unknown) => {
    try {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(JSON.stringify({
        level: 'error',
        action: context,
        error: message,
      }));
    } catch {
      // JSON.stringify itself can throw (circular refs, BigInt, etc.)
      // Fall back to plain string logging so we never leave an unhandled rejection.
      console.error(`[${context}] notification failed (logging also failed)`);
    }
  });
}
