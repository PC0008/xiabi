import { secret, vars } from "edgespark";

export function optionalVar(key: string) {
  return String(vars.get(key as any) || "").trim();
}

export function optionalSecret(key: string) {
  return String(secret.get(key as any) || "").trim();
}
