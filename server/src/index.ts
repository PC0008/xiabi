import { Hono } from "hono";
import { adminRoutes } from "./routes/admin";
import { entitlementRoutes } from "./routes/entitlements";
import { exportRoutes } from "./routes/exports";
import { feedbackRoutes } from "./routes/feedback";
import { letterRoutes } from "./routes/letters";
import { orderRoutes } from "./routes/orders";
import { publicRoutes } from "./routes/public";
import { sessionRoutes } from "./routes/sessions";
import { smsRoutes } from "./routes/sms";
import { taskRoutes } from "./routes/tasks";
import { userRoutes } from "./routes/users";
import { voiceRoutes } from "./routes/voice";
import { webhookRoutes } from "./routes/webhooks";

const app = new Hono();

app.route("/api/public", publicRoutes);
app.route("/api/public/admin", adminRoutes);
app.route("/api/public/session", sessionRoutes);
app.route("/api/public/sms", smsRoutes);
app.route("/api/public/users", userRoutes);
app.route("/api/public/voice", voiceRoutes);
app.route("/api/public/tasks", taskRoutes);
app.route("/api/public/letters", letterRoutes);
app.route("/api/public/orders", orderRoutes);
app.route("/api/public/entitlements", entitlementRoutes);
app.route("/api/public/exports", exportRoutes);
app.route("/api/public/feedback", feedbackRoutes);
app.route("/api/webhooks", webhookRoutes);

export default app;
