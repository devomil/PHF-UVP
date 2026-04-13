interface PollOptions {
  initialDelayMs?: number;
  multiplier?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

type PollFn<T> = () => Promise<T>;
type IsDone<T> = (result: T) => boolean;
type IsFailed<T> = (result: T) => { failed: boolean; message?: string };

export async function pollUntilDone<T>(
  fn: PollFn<T>,
  isDone: IsDone<T>,
  isFailed: IsFailed<T>,
  options: PollOptions = {}
): Promise<T> {
  const {
    initialDelayMs = 1000,
    multiplier = 1.5,
    maxDelayMs = 10000,
    timeoutMs = 300000,
  } = options;

  const deadline = Date.now() + timeoutMs;
  let delay = initialDelayMs;

  while (Date.now() < deadline) {
    const result = await fn();

    const failure = isFailed(result);
    if (failure.failed) {
      throw new Error(`Job failed: ${failure.message ?? 'Unknown error'}`);
    }

    if (isDone(result)) {
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * multiplier, maxDelayMs);
  }

  throw new Error(`Job timed out after ${timeoutMs / 1000}s`);
}
