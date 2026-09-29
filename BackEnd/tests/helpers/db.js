const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let replSet;

const connectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    return;
  }
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
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
