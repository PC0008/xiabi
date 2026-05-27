import { Hono } from "hono";
import { adminRoutes } from "./routes/admin";
import { letterRoutes } from "./routes/letters";
import { orderRoutes } from "./routes/orders";
import { publicRoutes } from "./routes/public";
import { sessionRoutes } from "./routes/sessions";
import { taskRoutes } from "./routes/tasks";
import { webhookRoutes } from "./routes/webhooks";

const app = new Hono();

app.route("/api/public", publicRoutes);
app.route("/api/public/admin", adminRoutes);
app.route("/api/public/session", sessionRoutes);
app.route("/api/public/tasks", taskRoutes);
app.route("/api/public/letters", letterRoutes);
app.route("/api/public/orders", orderRoutes);
app.route("/api/webhooks", webhookRoutes);

export default app;
