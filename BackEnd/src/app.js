const express = require("express");
const enrollmentRoutes = require("./routes/enrollmentRoutes");

const app = express();
app.use(express.json());

// Routes
app.use("/api", enrollmentRoutes);

const { startJob } = require("./jobs/expireEnrollmentsJob");

const { AppError } = require("./utils/errors");

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.code,
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

// Start background jobs if not in test env
if (process.env.NODE_ENV !== "test") {
  startJob();
}

module.exports = app;
