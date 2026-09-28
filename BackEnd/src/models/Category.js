const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin, adminManagedPlugin } = require("./plugins");

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

categorySchema.plugin(adminManagedPlugin);
categorySchema.plugin(softDeletePlugin);

module.exports = mongoose.model("Category", categorySchema);
