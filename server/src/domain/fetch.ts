export class ExternalRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`external_request_timeout:${timeoutMs}`);
    this.name = "ExternalRequestTimeoutError";
  }
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]> & {
  timeoutMs?: number;
};

export async function fetchWithTimeout(input: FetchInput, init: FetchInit = {}) {
  const { timeoutMs = 15_000, ...fetchInit } = init;
  if (!timeoutMs) return fetch(input, fetchInit);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...fetchInit,
      signal: controller.signal
    });
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") {
      throw new ExternalRequestTimeoutError(timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
