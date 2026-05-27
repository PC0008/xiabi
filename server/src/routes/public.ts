import { db, vars } from "edgespark";
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
  .get("/config", async (c) => ok(c, await getPublicConfig(db)));
