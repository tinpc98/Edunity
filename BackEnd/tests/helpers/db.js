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

const connectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
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
  await mongoose.connect(uri);
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
  }
};

const clearDB = async () => {
  if (mongoose.connection.readyState !== 1) {
    return;
  }
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
};
