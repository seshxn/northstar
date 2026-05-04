const failureRetryBaseMs = 10_000;

export function retryDelayMs(attempt: number, maxBackoffMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(maxBackoffMs, failureRetryBaseMs * 2 ** exponent);
}
