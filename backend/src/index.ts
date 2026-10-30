import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { assistantRouter } from "./routes/assistant.js";
import { askRouter } from "./routes/ask.js";
import { bodyError, HttpError } from "./lib/http.js";
import { closeMongo, connectMongo, pingMongo } from "./lib/mongo.js";
import { jwtSecret } from "./middleware/auth.js";

const app = express();

function allowedOrigins() {
  const raw = process.env.FRONTEND_URL || "http://localhost:3000";
  return raw
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

if ((process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? "1" : "0")) === "1") {
  app.set("trust proxy", 1);
}
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(cors({ origin: allowedOrigins() }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pingMongo();
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/ask", askRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const badBody = bodyError(err);
  if (badBody) {
    res.status(badBody.status).json({ error: badBody.error });
    return;
  }
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Unexpected server error." });
});

const port = Number(process.env.PORT || 4000);

async function start() {
  jwtSecret();
  await connectMongo();
  const server = app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
  server.requestTimeout = 90_000;
  server.headersTimeout = 95_000;

  function shutdown(signal: string) {
    console.log(`${signal} received. Closing the API.`);
    server.close(() => {
      closeMongo()
        .catch((err) => console.error(err))
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
