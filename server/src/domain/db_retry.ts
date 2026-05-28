export function isTransientDbError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("D1_ERROR") && /timeout|reset|temporar|overloaded|queued|busy|locked/i.test(message);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTransientDbRetry<T>(label: string, operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientDbError(error)) throw error;
      console.warn("transient_db_retry", { label, attempt });
      await delay(120 * attempt);
    }
  }
  throw new Error("unreachable_transient_db_retry");
}
