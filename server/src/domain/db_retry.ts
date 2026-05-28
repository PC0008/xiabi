function errorMessageChain(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) {
    const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    return [error.message, errorMessageChain(cause)].filter(Boolean).join(" ");
  }
  if (typeof error === "object" && "cause" in error) {
    return [String(error), errorMessageChain((error as { cause?: unknown }).cause)].filter(Boolean).join(" ");
  }
  return String(error);
}

export function isTransientDbError(error: unknown) {
  const message = errorMessageChain(error);
  return (message.includes("D1_ERROR") || message.includes("Failed query")) &&
    /timeout|reset|temporar|overloaded|queued|busy|locked/i.test(message);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientDbRetry<T>(label: string, operation: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientDbError(error)) throw error;
      console.warn("transient_db_retry", { label, attempt });
      await delay(300 * attempt);
    }
  }
  throw new Error("unreachable_transient_db_retry");
}
