const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
if (process.platform === "win32" && fs.existsSync("D:\\")) {
  if (!fs.existsSync("D:\\temp")) {
    try { fs.mkdirSync("D:\\temp", { recursive: true }); } catch {}
  }
  if (fs.existsSync("D:\\temp")) {
    process.env.TEMP = "D:\\temp";
    process.env.TMP = "D:\\temp";
  }
}
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let replSet;
let testPort;

const ownsConnection = () =>
  process.env.NODE_ENV === "test" && Boolean(replSet) &&
  mongoose.connection.host === "127.0.0.1" && mongoose.connection.port === testPort;

const requireTestConnection = () => {
  if (!ownsConnection()) throw new Error("Expected an isolated MongoDB test connection");
};

const connectDB = async () => {
  if (process.env.NODE_ENV !== "test") throw new Error("MongoDB test fixture requires NODE_ENV=test");
  if (mongoose.connection.readyState !== 0) {
    requireTestConnection();
    return;
  }
  const tmpDir = process.platform === "win32" && fs.existsSync("D:\\temp") ? "D:\\temp" : undefined;
  let dbPath;
  if (tmpDir) {
    dbPath = path.join(tmpDir, `mongo-mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    try { fs.mkdirSync(dbPath, { recursive: true }); } catch {}
  }
  replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
      ...(dbPath ? { dbPath } : {}),
    },
    instanceOpts: dbPath ? [{ dbPath, tmpDir }] : [],
    binary: { version: "7.0.14" },
  });
  const uri = replSet.getUri();
  const address = replSet.servers[0].instanceInfo;
  if (!uri.startsWith(`mongodb://127.0.0.1:${address.port}/`)) {
    await replSet.stop();
    throw new Error("MongoDB test fixture did not start on loopback");
  }
  testPort = address.port;
  await mongoose.connect(uri);
  requireTestConnection();
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    requireTestConnection();
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
    replSet = undefined;
    testPort = undefined;
  }
};

const clearDB = async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  requireTestConnection();
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  try {
    const { clearCache } = require("../../src/services/platformSettingService");
    clearCache();
  } catch {
    // ignore if module not loaded yet
  }
};

const syncIndexes = async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
  requireTestConnection();
  const models = mongoose.models;
  for (const modelName in models) {
    await models[modelName].syncIndexes();
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  clearDB,
  syncIndexes,
  requireTestConnection,
};
