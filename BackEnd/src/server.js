require("dotenv").config();

// Optional DNS override (e.g. when the platform resolver cannot resolve mongodb+srv records).
// Not forced: a hard-coded public resolver breaks deployments in private networks / Docker.
if (process.env.DNS_SERVERS) {
  require("dns").setServers(process.env.DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean));
}
// Before anything else loads: a misconfigured deployment must not start at all
require("./config/env").assertEnv();

const app = require("./app");
const connectDB = require("./config/db");
const { startJob } = require("./jobs/expireEnrollmentsJob");
const { startSessionLifecycleJob } = require("./jobs/sessionLifecycleJob");
const { startMaintenanceJob } = require("./jobs/maintenanceJob");
const { warmCache: warmSettingsCache } = require("./services/platformSettingService");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
    await warmSettingsCache().catch((err) => {
      console.error("[PlatformSetting] Failed to warm settings cache:", err.message);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }

  startJob();
  startSessionLifecycleJob();
  startMaintenanceJob();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
