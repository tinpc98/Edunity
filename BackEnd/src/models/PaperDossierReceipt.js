const mongoose = require("mongoose");
const { Schema } = mongoose;
const { PAPER_RECEIPT_STATUSES, PAPER_RECONCILIATION_ITEM_STATUSES } = require("./constants");

const postalInfoSchema = new Schema(
  {
    deliveryMethod: {
      type: String,
      enum: ["POSTAL_MAIL", "COURIER", "IN_PERSON_DROP_OFF"],
      default: "POSTAL_MAIL",
    },
    carrierName: { type: String, required: true, trim: true },
    trackingNumber: { type: String, trim: true, uppercase: true, default: null },
    senderName: { type: String, required: true, trim: true },
    senderPhone: { type: String, trim: true, default: null },
    senderAddress: { type: String, trim: true, default: null },
    sentAt: { type: Date, default: null },
    postmarkDate: { type: Date, default: null },
    envelopeSealed: { type: Boolean, default: true },
    packageCondition: {
      type: String,
      enum: ["INTACT", "DAMAGED", "TORN", "WET", "PARTIAL"],
      default: "INTACT",
    },
  },
  { _id: false }
);

const reconciledItemSchema = new Schema(
  {
    checklistItemCode: { type: String, required: true, trim: true, uppercase: true },
    itemStatus: { type: String, enum: PAPER_RECONCILIATION_ITEM_STATUSES, required: true },
    documentTitle: { type: String, trim: true, default: null },
    pageCount: { type: Number, min: 0, default: 1 },
    isOriginal: { type: Boolean, default: false },
    hasOfficialStamp: { type: Boolean, default: false },
    note: { type: String, trim: true, default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const receiptHistorySchema = new Schema(
  {
    action: {
      type: String,
      enum: [
        "RECEIPT_LOGGED",
        "APPLICATION_LINKED",
        "RECONCILIATION_STARTED",
        "RECONCILED_MATCHED",
        "DISCREPANCY_REPORTED",
        "RECEIPT_REJECTED",
        "RECEIPT_CANCELLED",
        "ITEMS_UPDATED",
      ],
      required: true,
    },
    actorAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    note: { type: String, trim: true, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const paperDossierReceiptSchema = new Schema(
  {
    receiptCode: { type: String, required: true, trim: true, uppercase: true },
    applicationId: { type: Schema.Types.ObjectId, ref: "ScholarshipApplication", default: null },
    declaredApplicationCode: { type: String, trim: true, uppercase: true, default: null },
    campaignId: { type: Schema.Types.ObjectId, ref: "ScholarshipCampaign", default: null },
    studentId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    postalInfo: { type: postalInfoSchema, required: true },
    trackingKey: { type: String, default: null },

    receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receivedByName: { type: String, trim: true, default: null },
    receivedAt: { type: Date, required: true, default: Date.now },
    receivingLocation: { type: String, trim: true, default: "Central Admission Office" },
    intakeNote: { type: String, trim: true, default: null },

    status: {
      type: String,
      enum: PAPER_RECEIPT_STATUSES,
      default: "RECEIVED",
    },

    reconciledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reconciledAt: { type: Date, default: null },
    reconciliationNote: { type: String, trim: true, default: null },
    discrepancyReason: { type: String, trim: true, default: null },

    reconciledItems: { type: [reconciledItemSchema], default: [] },
    history: { type: [receiptHistorySchema], default: [] },
  },
  { timestamps: true }
);

paperDossierReceiptSchema.index({ receiptCode: 1 }, { unique: true });

paperDossierReceiptSchema.index(
  { trackingKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      trackingKey: { $type: "string" },
      status: { $in: ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"] },
    },
  }
);

paperDossierReceiptSchema.index(
  { applicationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      applicationId: { $type: "objectId" },
      status: { $in: ["RECEIVED", "IN_RECONCILIATION", "DISCREPANCY", "RECONCILED"] },
    },
  }
);

paperDossierReceiptSchema.index({ status: 1, receivedAt: -1 });
paperDossierReceiptSchema.index({ studentId: 1, campaignId: 1, createdAt: -1 });
paperDossierReceiptSchema.index({ declaredApplicationCode: 1 });

module.exports = mongoose.model("PaperDossierReceipt", paperDossierReceiptSchema);
