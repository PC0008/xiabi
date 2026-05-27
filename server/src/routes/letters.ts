import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { salesLetters } from "@defs";
import { fail, ok, parseJson } from "../domain/http";

export const letterRoutes = new Hono()
  .get("/:id", async (c) => {
    const [letter] = await db.select().from(salesLetters).where(eq(salesLetters.id, c.req.param("id"))).limit(1);
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    return ok(c, {
      ...letter,
      input: parseJson(letter.inputJson, {}),
      content: parseJson(letter.contentJson, null)
    });
  })
  .post("/:id/claim", async (c) => {
    const [letter] = await db
      .update(salesLetters)
      .set({ status: "claimed", claimedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(salesLetters.id, c.req.param("id")))
      .returning();
    if (!letter) return fail(c, "letter_not_found", "没有找到这封销售信。", 404);
    return ok(c, letter);
  });
