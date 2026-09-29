const mongoose = require("mongoose");

mongoose.connection.on("connected", () => {
  console.log(`MongoDB connected -> db="${mongoose.connection.name}"`);
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);

  return mongoose.connection;
}

module.exports = connectDB;
