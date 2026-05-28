import { db, secret, vars } from "edgespark";
import { Hono } from "hono";
import { getPublicConfig } from "../domain/config";
import { ok } from "../domain/http";
import { optionalSecret, optionalVar } from "../domain/runtime";

export const publicRoutes = new Hono()
  .get("/health", (c) =>
    ok(c, {
      service: "xiabi",
      status: "ok",
      environment: vars.get("PUBLIC_BASE_URL") ? "configured" : "local"
    })
  )
  .get("/config", async (c) => {
    const asrConfigured = !!optionalVar("VOICE_ASR_ENDPOINT") && !!(
      optionalSecret("VOICE_ASR_API_KEY") ||
      String(secret.get("VOICE_API_KEY") || "").trim()
    );
    const asrVerified = asrConfigured && optionalVar("VOICE_ASR_VERIFIED") === "1";
    return ok(c, {
      ...(await getPublicConfig(db)),
      capabilities: {
        voice: {
          ttsConfigured: !!String(secret.get("VOICE_API_KEY") || "").trim() && !!String(vars.get("MINIMAX_VOICE_ID") || "").trim(),
          asrConfigured,
          asrVerified,
          asrPreferred: optionalVar("VOICE_INPUT_MODE").toLowerCase() === "server" ||
            optionalVar("VOICE_ASR_PROVIDER").toLowerCase() === "minimax"
        }
      }
    });
  });
