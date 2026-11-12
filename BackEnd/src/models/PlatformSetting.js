const mongoose = require("mongoose");
const { Schema } = mongoose;
const { adminManagedPlugin } = require("./plugins");

let cacheChangeListener = null;

const notifyChange = () => {
  if (typeof cacheChangeListener === "function") {
    try {
      cacheChangeListener();
    } catch {
      // ignore cache listener errors during model hooks
    }
  }
};

const platformSettingSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
    valueType: {
      type: String,
      enum: ["NUMBER", "INTEGER", "BOOLEAN", "STRING", "JSON"],
      required: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUPERSEDED", "ROLLED_BACK", "ARCHIVED"],
      default: "ACTIVE",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    changeReason: {
      type: String,
      trim: true,
      default: "",
    },
    rolledBackFromVersion: {
      type: Number,
      default: null,
    },
    rolledBackToVersion: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

platformSettingSchema.plugin(adminManagedPlugin);

platformSettingSchema.index({ key: 1, version: 1 }, { unique: true });
platformSettingSchema.index({ key: 1, status: 1, effectiveFrom: -1, version: -1 });

platformSettingSchema.post("save", notifyChange);
platformSettingSchema.post("findOneAndUpdate", notifyChange);
platformSettingSchema.post("updateOne", notifyChange);
platformSettingSchema.post("updateMany", notifyChange);
platformSettingSchema.post("deleteOne", notifyChange);
platformSettingSchema.post("deleteMany", notifyChange);

platformSettingSchema.statics.registerCacheListener = (fn) => {
  cacheChangeListener = fn;
};

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);

