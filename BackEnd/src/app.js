const express = require("express");
const cors = require("cors");
const enrollmentRoutes = require("./routes/enrollmentRoutes");
const catalogRoutes = require("./routes/catalogRoutes");
const devAuthRoutes = require("./routes/devAuthRoutes");
const financeRoutes = require("./routes/financeRoutes");

const app = express();
app.use(express.json());

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-user-id", "x-user-role", "Authorization"],
};
app.use(cors(corsOptions));

// Routes
app.use("/api/auth", devAuthRoutes);
app.use("/api", catalogRoutes);
app.use("/api", enrollmentRoutes);
app.use("/api", require("./routes/paymentRoutes"));
app.use("/api", financeRoutes);
app.use("/api", require("./routes/studentRoutes"));

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

  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred"
  });
});

module.exports = app;
