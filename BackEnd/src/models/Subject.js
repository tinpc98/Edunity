const mongoose = require("mongoose");
const { Schema } = mongoose;
const { softDeletePlugin, adminManagedPlugin } = require("./plugins");

const subjectSchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    categoryName: { type: String, required: true }, // denormalized snapshot

    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

subjectSchema.plugin(adminManagedPlugin);
subjectSchema.plugin(softDeletePlugin);

subjectSchema.index({ categoryId: 1 });

module.exports = mongoose.model("Subject", subjectSchema);
