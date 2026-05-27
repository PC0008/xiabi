const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hashPassword(password: string, pepper = "") {
  return sha256(`xiabi-password:${password}:${pepper}`);
}

export async function hashToken(token: string) {
  return sha256(`xiabi-session:${token}`);
}

export function createToken() {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
}

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isFuture(value: string) {
  return new Date(value).getTime() > Date.now();
}
