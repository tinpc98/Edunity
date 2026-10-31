const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { getAllowedOrigins } = require("./config/env");
const enrollmentRoutes = require("./routes/enrollmentRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const authRoutes = require("./routes/authRoutes");
const financeRoutes = require("./routes/financeRoutes");

const app = express();

// Number of reverse proxies in front of the app; without it every client behind a proxy shares one rate limit
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

app.use(
  helmet({
    // JSON API: nothing here should load resources or be framed. /files/download relaxes framing for the FE viewer.
    contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    frameguard: { action: "deny" },
    // Avatars and cover images are loaded by the FE from another origin
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
// Before the body parser, so a parse error still reaches the browser with CORS headers
app.use(cors(corsOptions));

const LIVEKIT_WEBHOOK_PATH = "/api/sessions/livekit-webhook";
app.use(
  express.json({
    // LiveKit posts application/webhook+json and signs the exact bytes it sent
    type: ["application/json", "application/webhook+json"],
    verify: (req, res, buffer) => {
      if (req.originalUrl === LIVEKIT_WEBHOOK_PATH) req.rawBody = buffer;
    },
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", catalogRoutes);
app.use("/api", enrollmentRoutes);
app.use("/api", require("./routes/paymentRoutes"));
app.use("/api", financeRoutes);
app.use("/api", require("./routes/studentRoutes"));
app.use("/api", require("./routes/courseCatalogRoutes"));
app.use("/api", require("./routes/teachingRoutes"));
app.use("/api", require("./routes/scholarshipRoutes"));
app.use("/api", require("./routes/accountRoutes"));
app.use("/api", require("./routes/communityRoutes"));

// Public storage only (avatars, cover images). Private documents are never served statically.
app.use("/uploads", express.static(require("./services/storageService").getPublicDir(), { index: false }));

const { AppError } = require("./utils/errors");

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {})
    });
  }

  // Rejected by the body parser: a client error, not a server fault
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "VALIDATION_ERROR", message: "Request body is not valid JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ success: false, error: "PAYLOAD_TOO_LARGE", message: "Request body is too large" });
  }

  // Malformed input caught by Mongoose (invalid enum/number/ObjectId...) is a client error, not a server fault
  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: err.message
    });
  }

  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred"
  });
});

module.exports = app;
