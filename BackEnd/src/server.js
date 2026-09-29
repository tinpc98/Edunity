require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const { startJob } = require("./jobs/expireEnrollmentsJob");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error.message);
    process.exit(1);
  }

  startJob();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
