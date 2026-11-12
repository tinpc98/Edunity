require("dotenv").config();

// Optional DNS override (e.g. when the platform resolver cannot resolve mongodb+srv records).
// Not forced: a hard-coded public resolver breaks deployments in private networks / Docker.
if (process.env.DNS_SERVERS) {
  require("dns").setServers(
    process.env.DNS_SERVERS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
// Before anything else loads: a misconfigured deployment must not start at all
require("./config/env").assertEnv();

const app = require("./app");
const connectDB = require("./config/db");
const { startJob } = require("./jobs/expireEnrollmentsJob");
const { startSessionLifecycleJob } = require("./jobs/sessionLifecycleJob");
const { startMaintenanceJob, stopFinancialOutboxWorker } = require("./jobs/maintenanceJob");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  // Mark server as actively running over network to disable test-only header bridges
  process.env.EDUNITY_RUNNING_SERVER = "true";
  try {
    await connectDB();
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }

  startJob();
  startSessionLifecycleJob();
  startMaintenanceJob();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });

  const handleShutdown = () => {
    stopFinancialOutboxWorker();
    server.close(() => {
      process.exit(0);
    });
  };
  process.once("SIGTERM", handleShutdown);
  process.once("SIGINT", handleShutdown);
};

startServer();
