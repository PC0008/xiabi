import { db, secret, vars } from "edgespark";
import { Hono } from "hono";
import { getPublicConfig } from "../domain/config";
import { ok } from "../domain/http";

export const publicRoutes = new Hono()
  .get("/health", (c) =>
    ok(c, {
      service: "xiabi",
      status: "ok",
      environment: vars.get("PUBLIC_BASE_URL") ? "configured" : "local"
    })
  )
  .get("/config", async (c) => ok(c, {
    ...(await getPublicConfig(db)),
    capabilities: {
      voice: {
        ttsConfigured: !!String(secret.get("VOICE_API_KEY" as any) || "").trim() && !!String(vars.get("MINIMAX_VOICE_ID") || "").trim(),
        asrConfigured: !!String(vars.get("VOICE_ASR_ENDPOINT" as any) || "").trim() && !!(
          String(secret.get("VOICE_ASR_API_KEY" as any) || "").trim() ||
          String(secret.get("VOICE_API_KEY" as any) || "").trim()
        ),
        asrPreferred: String(vars.get("VOICE_INPUT_MODE" as any) || "").trim().toLowerCase() === "server" ||
          String(vars.get("VOICE_ASR_PROVIDER" as any) || "").trim().toLowerCase() === "minimax"
      }
    }
  }));
