const { EgressClient, EgressInfo, EgressStatus } = require("livekit-server-sdk");
const videoProvider = require("../src/services/videoProvider");

describe("TIN-05C-P1: Safe LiveKit Provider Implementation Test Suite", () => {
  const originalEnv = process.env;
  let originalStopEgress;
  let originalStartRoomCompositeEgress;

  beforeAll(() => {
    originalStopEgress = EgressClient.prototype.stopEgress;
    originalStartRoomCompositeEgress = EgressClient.prototype.startRoomCompositeEgress;
  });

  afterAll(() => {
    EgressClient.prototype.stopEgress = originalStopEgress;
    EgressClient.prototype.startRoomCompositeEgress = originalStartRoomCompositeEgress;
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LIVEKIT_URL: "http://localhost:7880",
      LIVEKIT_API_KEY: "devkey",
      LIVEKIT_API_SECRET: "secret123456789012345678901234567890",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    EgressClient.prototype.stopEgress = originalStopEgress;
    EgressClient.prototype.startRoomCompositeEgress = originalStartRoomCompositeEgress;
    jest.restoreAllMocks();
  });

  // =========================================================================
  // PROVIDER-01: Valid Egress ID, StopEgress succeeds
  // =========================================================================
  it("PROVIDER-01: Valid Egress ID, StopEgress succeeds returning STOP_REQUEST_ACCEPTED", async () => {
    EgressClient.prototype.stopEgress = async function (egressId) {
      return new EgressInfo({
        egressId,
        status: EgressStatus.EGRESS_ENDING,
      });
    };

    const res = await videoProvider.stopRecording("egress_valid_123");
    expect(res.success).toBe(true);
    expect(res.reason).toBe("STOP_REQUEST_ACCEPTED");
    expect(res.status).toBe("EGRESS_ENDING");
    expect(res.egressId).toBe("egress_valid_123");
  });

  // =========================================================================
  // PROVIDER-02: Invalid or empty ID
  // =========================================================================
  it("PROVIDER-02: Invalid or empty ID returns INVALID_EGRESS_ID without RPC call", async () => {
    let rpcCalled = false;
    EgressClient.prototype.stopEgress = async function () {
      rpcCalled = true;
      return new EgressInfo({});
    };

    const invalidInputs = ["", "   ", null, undefined, 12345, {}, []];
    for (const input of invalidInputs) {
      const res = await videoProvider.stopRecording(input);
      expect(res.success).toBe(false);
      expect(res.reason).toBe("INVALID_EGRESS_ID");
    }
    expect(rpcCalled).toBe(false);
  });

  // =========================================================================
  // PROVIDER-03: LiveKit config missing
  // =========================================================================
  it("PROVIDER-03: LiveKit config missing returns PROVIDER_NOT_CONFIGURED with success=false", async () => {
    delete process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;

    const res = await videoProvider.stopRecording("egress_123");
    expect(res.success).toBe(false);
    expect(res.reason).toBe("PROVIDER_NOT_CONFIGURED");
  });

  // =========================================================================
  // PROVIDER-04: Egress is already terminal, confirmed through provider status
  // =========================================================================
  it("PROVIDER-04: Egress is already terminal, confirmed through provider status", async () => {
    const terminalStatuses = [
      { status: EgressStatus.EGRESS_COMPLETE, name: "EGRESS_COMPLETE" },
      { status: EgressStatus.EGRESS_FAILED, name: "EGRESS_FAILED" },
      { status: EgressStatus.EGRESS_ABORTED, name: "EGRESS_ABORTED" },
    ];

    for (const item of terminalStatuses) {
      EgressClient.prototype.stopEgress = async function (egressId) {
        return new EgressInfo({
          egressId,
          status: item.status,
        });
      };

      const res = await videoProvider.stopRecording("egress_terminal_123");
      expect(res.success).toBe(true);
      expect(res.reason).toBe("ALREADY_TERMINAL_VERIFIED");
      expect(res.status).toBe(item.name);
    }
  });

  // =========================================================================
  // PROVIDER-05: Egress is still ENDING
  // =========================================================================
  it("PROVIDER-05: Egress is still ENDING is distinguished from final termination", async () => {
    EgressClient.prototype.stopEgress = async function (egressId) {
      return new EgressInfo({
        egressId,
        status: EgressStatus.EGRESS_ENDING,
      });
    };

    const res = await videoProvider.stopRecording("egress_ending_123");
    expect(res.success).toBe(true);
    expect(res.reason).toBe("STOP_REQUEST_ACCEPTED");
    expect(res.status).toBe("EGRESS_ENDING");
  });

  // =========================================================================
  // PROVIDER-06: Unrelated NotFound error does not become false success
  // =========================================================================
  it("PROVIDER-06: Unrelated NotFound error does not become false success", async () => {
    EgressClient.prototype.stopEgress = async function () {
      const err = new Error("entity not found on remote cluster");
      err.status = 404;
      err.code = "not_found";
      throw err;
    };

    const res = await videoProvider.stopRecording("egress_missing_404");
    expect(res.success).toBe(false);
    expect(res.reason).toBe("RPC_FAILED");
    expect(res.code).toBe("not_found");
    expect(res.statusCode).toBe(404);
  });

  // =========================================================================
  // PROVIDER-07: RPC timeout or connection reset
  // =========================================================================
  it("PROVIDER-07: RPC timeout returns OUTCOME_UNKNOWN and connection reset returns RPC_FAILED", async () => {
    // 1. Timeout
    EgressClient.prototype.stopEgress = async function () {
      const timeoutErr = new Error("The operation was aborted due to timeout");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    };

    const timeoutRes = await videoProvider.stopRecording("egress_timeout_123");
    expect(timeoutRes.success).toBe(false);
    expect(timeoutRes.reason).toBe("OUTCOME_UNKNOWN");
    expect(timeoutRes.code).toBe("TIMEOUT");

    // 2. Connection reset
    EgressClient.prototype.stopEgress = async function () {
      const connErr = new Error("read ECONNRESET");
      connErr.code = "ECONNRESET";
      throw connErr;
    };

    const resetRes = await videoProvider.stopRecording("egress_reset_123");
    expect(resetRes.success).toBe(false);
    expect(resetRes.reason).toBe("RPC_FAILED");
    expect(resetRes.code).toBe("ECONNRESET");
  });

  // =========================================================================
  // PROVIDER-08: Unknown RPC outcome
  // =========================================================================
  it("PROVIDER-08: Unknown RPC outcome / internal server error", async () => {
    EgressClient.prototype.stopEgress = async function () {
      const internalErr = new Error("Internal cluster error in egress dispatcher");
      internalErr.status = 500;
      internalErr.code = "internal";
      throw internalErr;
    };

    const res = await videoProvider.stopRecording("egress_internal_500");
    expect(res.success).toBe(false);
    expect(res.reason).toBe("RPC_FAILED");
    expect(res.code).toBe("internal");
    expect(res.statusCode).toBe(500);
  });

  // =========================================================================
  // PROVIDER-09: StopRecording never calls DeleteRoom
  // =========================================================================
  it("PROVIDER-09: StopRecording never calls DeleteRoom or touches RoomService", async () => {
    let deleteRoomCalled = false;
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (String(url).includes("DeleteRoom")) {
        deleteRoomCalled = true;
      }
      return originalFetch(url, opts);
    };

    EgressClient.prototype.stopEgress = async function (egressId) {
      return new EgressInfo({
        egressId,
        status: EgressStatus.EGRESS_ENDING,
      });
    };

    try {
      const res = await videoProvider.stopRecording("egress_safety_check");
      expect(res.success).toBe(true);
      expect(deleteRoomCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // PROVIDER-10: Existing provider functions remain unchanged
  // =========================================================================
  it("PROVIDER-10: Existing provider functions remain fully intact and functional", async () => {
    // 1. getProviderName
    expect(videoProvider.getProviderName()).toBe("LIVEKIT");
    delete process.env.LIVEKIT_URL;
    expect(videoProvider.getProviderName()).toBe("EDUNITY_DEV");
    process.env.LIVEKIT_URL = "http://localhost:7880";

    // 2. createJoinToken
    const tokenRes = videoProvider.createJoinToken({
      roomId: "room_test_123",
      sessionId: "session_test_123",
      userId: "user_test_123",
      displayName: "Test User",
      role: "HOST",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
    expect(tokenRes.provider).toBe("LIVEKIT");
    expect(tokenRes.serverUrl).toBe("http://localhost:7880");
    expect(typeof tokenRes.accessToken).toBe("string");

    // 3. startRecording
    EgressClient.prototype.startRoomCompositeEgress = async () => ({ egressId: "eg_started_999" });
    const egressId = await videoProvider.startRecording("room_test_123", "key.mp4");
    expect(egressId).toBe("eg_started_999");

    // 4. closeRoom
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true });
    try {
      const closed = await videoProvider.closeRoom("room_test_123");
      expect(closed).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }

    // 5. processWebhook (supports Bảo's sha256 checksum raw body contract)
    const crypto = require("crypto");
    const jwt = require("jsonwebtoken");
    const fakePayload = { event: "egress_ended", egressInfo: { egressId: "eg_999" } };
    const rawBody = Buffer.from(JSON.stringify(fakePayload));
    const sha256 = crypto.createHash("sha256").update(rawBody).digest("base64");
    const authHeader = jwt.sign({ ...fakePayload, sha256 }, process.env.LIVEKIT_API_SECRET, {
      algorithm: "HS256",
      issuer: process.env.LIVEKIT_API_KEY,
    });
    const parsed = videoProvider.processWebhook(rawBody, fakePayload, authHeader);
    expect(parsed).toEqual(fakePayload);
  });
});
