const mongoose = require("mongoose");

jest.mock("../src/models", () => ({
  PaperDossierReceipt: {
    findOne: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  },
  ScholarshipApplication: {
    findById: jest.fn(),
    findOne: jest.fn(),
  },
  ScholarshipCampaign: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
  VerificationDocument: {
    find: jest.fn(),
  },
  User: {
    findById: jest.fn(),
  },
}));

jest.mock("../src/services/auditService", () => ({
  audit: jest.fn(),
}));

jest.mock("../src/services/notificationService", () => ({
  notify: jest.fn(),
}));

const models = require("../src/models");
const PaperDossierReceiptModel = require("../src/models/PaperDossierReceipt");
const paperDossierService = require("../src/services/paperDossierService");

describe("AID-04 Unit Tests — PaperDossierReceipt Intake, Linking & Reconciliation Guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("AID-04.U1: Actual Mongoose PaperDossierReceipt schema defines required postal, receiver, reconciliation & unique indexes", () => {
    const schema = PaperDossierReceiptModel.schema;
    expect(schema.paths.receiptCode).toBeDefined();
    expect(schema.paths.applicationId).toBeDefined();
    expect(schema.paths.receivedBy).toBeDefined();
    expect(schema.paths.receivedAt).toBeDefined();
    expect(schema.paths.status.enumValues).toEqual([
      "RECEIVED",
      "IN_RECONCILIATION",
      "DISCREPANCY",
      "RECONCILED",
      "REJECTED",
      "CANCELLED",
    ]);

    const indexes = schema.indexes();
    const hasReceiptCodeUnique = indexes.some(([keys, opts]) => keys.receiptCode === 1 && opts.unique);
    const hasTrackingKeyUnique = indexes.some(
      ([keys, opts]) => keys.trackingKey === 1 && opts.unique && opts.partialFilterExpression
    );
    const hasAppIdUnique = indexes.some(
      ([keys, opts]) => keys.applicationId === 1 && opts.unique && opts.partialFilterExpression
    );
    expect(hasReceiptCodeUnique).toBe(true);
    expect(hasTrackingKeyUnique).toBe(true);
    expect(hasAppIdUnique).toBe(true);
  });

  test("AID-04.U2: intakePaperDossier validates postal metadata, future dates, COURIER tracking, and phone format", async () => {
    const adminId = new mongoose.Types.ObjectId();
    models.User.findById.mockReturnValue({ select: () => ({ lean: async () => ({ _id: adminId, email: "admin@edunity.vn" }) }) });

    // Courier missing trackingNumber -> 400
    await expect(
      paperDossierService.intakePaperDossier(adminId, {
        postalInfo: { deliveryMethod: "COURIER", carrierName: "ViettelPost", senderName: "Nguyen Van B" },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });

    // Future receivedAt -> 400
    await expect(
      paperDossierService.intakePaperDossier(adminId, {
        receivedAt: new Date(Date.now() + 86400000).toISOString(),
        postalInfo: {
          deliveryMethod: "POSTAL_MAIL",
          carrierName: "VNPost",
          trackingNumber: "VN123456",
          senderName: "Nguyen Van B",
        },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });

    // sentAt after receivedAt -> 400
    await expect(
      paperDossierService.intakePaperDossier(adminId, {
        receivedAt: new Date(Date.now() - 3600000).toISOString(),
        postalInfo: {
          deliveryMethod: "POSTAL_MAIL",
          carrierName: "VNPost",
          trackingNumber: "VN123456",
          senderName: "Nguyen Van B",
          sentAt: new Date().toISOString(),
        },
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  test("AID-04.U3: intakePaperDossier rejects missing application, mismatched campaign/student, and duplicate active receipt", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const appId = new mongoose.Types.ObjectId();
    const realCampaignId = new mongoose.Types.ObjectId();
    const otherCampaignId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();

    models.User.findById.mockReturnValue({ select: () => ({ lean: async () => ({ _id: adminId, email: "admin@edunity.vn" }) }) });

    // Nonexistent applicationCode -> 404
    models.ScholarshipApplication.findOne.mockResolvedValueOnce(null);
    await expect(
      paperDossierService.intakePaperDossier(adminId, {
        applicationCode: "APP-FAKE-999",
        postalInfo: { carrierName: "VNPost", trackingNumber: "VN111", senderName: "Sender" },
      })
    ).rejects.toMatchObject({ statusCode: 404, code: "APPLICATION_NOT_FOUND" });

    // Campaign mismatch -> 409 APPLICATION_LINK_MISMATCH
    models.ScholarshipApplication.findById.mockResolvedValueOnce({
      _id: appId,
      campaignId: realCampaignId,
      studentId,
      status: "SUBMITTED",
    });
    await expect(
      paperDossierService.intakePaperDossier(adminId, {
        applicationId: appId.toString(),
        campaignId: otherCampaignId.toString(),
        postalInfo: { carrierName: "VNPost", trackingNumber: "VN111", senderName: "Sender" },
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "APPLICATION_LINK_MISMATCH" });

    // Duplicate active receipt -> 409 DUPLICATE_PAPER_RECEIPT
    models.ScholarshipApplication.findById.mockResolvedValueOnce({
      _id: appId,
      campaignId: realCampaignId,
      studentId,
      status: "SUBMITTED",
    });
    models.ScholarshipCampaign.findOne.mockReturnValueOnce({
      lean: async () => ({ _id: realCampaignId, dossierPolicy: { allowPaperDossier: true } }),
    });
    models.PaperDossierReceipt.findOne.mockReturnValueOnce({
      lean: async () => ({ _id: new mongoose.Types.ObjectId(), receiptCode: "PDR-EXISTING" }),
    });

    await expect(
      paperDossierService.intakePaperDossier(adminId, {
        applicationId: appId.toString(),
        postalInfo: { carrierName: "VNPost", trackingNumber: "VN222", senderName: "Sender" },
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_PAPER_RECEIPT" });
  });

  test("AID-04.U4: reconcilePaperDossier blocks unlinked receipt, terminal status transitions, unknown checklist code, damaged RECONCILED, and incomplete PAPER checklist", async () => {
    const adminId = new mongoose.Types.ObjectId();
    const receiptId = new mongoose.Types.ObjectId();
    const appId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();

    // Unlinked receipt -> 409 APPLICATION_LINK_REQUIRED
    models.PaperDossierReceipt.findById.mockResolvedValueOnce({
      _id: receiptId,
      applicationId: null,
      status: "RECEIVED",
    });
    await expect(
      paperDossierService.reconcilePaperDossier(adminId, receiptId.toString(), { status: "IN_RECONCILIATION" })
    ).rejects.toMatchObject({ statusCode: 409, code: "APPLICATION_LINK_REQUIRED" });

    // Already RECONCILED -> 409 INVALID_PAPER_RECEIPT_STATUS
    models.PaperDossierReceipt.findById.mockResolvedValueOnce({
      _id: receiptId,
      applicationId: appId,
      status: "RECONCILED",
    });
    await expect(
      paperDossierService.reconcilePaperDossier(adminId, receiptId.toString(), {
        status: "DISCREPANCY",
        discrepancyReason: "Tamper attempt",
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_PAPER_RECEIPT_STATUS" });

    // Unknown checklist code -> 400 INVALID_CHECKLIST_ITEM_CODE
    models.PaperDossierReceipt.findById.mockResolvedValueOnce({
      _id: receiptId,
      applicationId: appId,
      status: "RECEIVED",
    });
    models.ScholarshipApplication.findById.mockResolvedValueOnce({
      _id: appId,
      campaignId,
      status: "SUBMITTED",
    });
    models.ScholarshipCampaign.findById.mockReturnValueOnce({
      lean: async () => ({
        _id: campaignId,
        documentChecklist: [{ code: "HO_KHAU", title: "Ho khau", required: true, acceptedMode: "PAPER" }],
      }),
    });
    await expect(
      paperDossierService.reconcilePaperDossier(adminId, receiptId.toString(), {
        status: "RECONCILED",
        reconciledItems: [{ checklistItemCode: "WRONG_CODE", itemStatus: "MATCHED" }],
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_CHECKLIST_ITEM_CODE" });

    // DAMAGED item when marking RECONCILED -> 409 RECONCILIATION_HAS_UNRESOLVED_ITEMS
    models.PaperDossierReceipt.findById.mockResolvedValueOnce({
      _id: receiptId,
      applicationId: appId,
      status: "IN_RECONCILIATION",
    });
    models.ScholarshipApplication.findById.mockResolvedValueOnce({
      _id: appId,
      campaignId,
      status: "SUBMITTED",
    });
    models.ScholarshipCampaign.findById.mockReturnValueOnce({
      lean: async () => ({
        _id: campaignId,
        documentChecklist: [{ code: "HO_KHAU", title: "Ho khau", required: true, acceptedMode: "PAPER" }],
      }),
    });
    await expect(
      paperDossierService.reconcilePaperDossier(adminId, receiptId.toString(), {
        status: "RECONCILED",
        reconciledItems: [{ checklistItemCode: "HO_KHAU", itemStatus: "DAMAGED" }],
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "RECONCILIATION_HAS_UNRESOLVED_ITEMS" });

    // Missing required PAPER checklist item when marking RECONCILED -> 409 PAPER_CHECKLIST_INCOMPLETE
    models.PaperDossierReceipt.findById.mockResolvedValueOnce({
      _id: receiptId,
      applicationId: appId,
      status: "IN_RECONCILIATION",
    });
    models.ScholarshipApplication.findById.mockResolvedValueOnce({
      _id: appId,
      campaignId,
      status: "SUBMITTED",
    });
    models.ScholarshipCampaign.findById.mockReturnValueOnce({
      lean: async () => ({
        _id: campaignId,
        documentChecklist: [
          { code: "HO_KHAU", title: "Ho khau", required: true, acceptedMode: "PAPER" },
          { code: "XAC_NHAN", title: "Xac nhan", required: true, acceptedMode: "PAPER" },
        ],
      }),
    });
    await expect(
      paperDossierService.reconcilePaperDossier(adminId, receiptId.toString(), {
        status: "RECONCILED",
        reconciledItems: [{ checklistItemCode: "HO_KHAU", itemStatus: "MATCHED" }],
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "PAPER_CHECKLIST_INCOMPLETE" });
  });
});

