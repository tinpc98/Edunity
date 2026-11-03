const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { createRoomToken } = require("../utils/roomToken");
const { EgressClient, EncodedFileOutput, EgressStatus } = require("livekit-server-sdk");

/**
 * Embedded Live Classroom provider (mục 11.7).
 *
 * LiveKit is used when LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are configured:
 * the frontend connects with the LiveKit SDK using `serverUrl` + `accessToken`.
 * Without that configuration (local dev, tests) the backend falls back to its own signed token
 * so the join flow can still be exercised end to end.
 */
const getLiveKitConfig = () => {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  return { url: LIVEKIT_URL, apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET };
};

const getProviderName = () => (getLiveKitConfig() ? "LIVEKIT" : "EDUNITY_DEV");

// A LiveKit access token is a JWT signed with the API secret carrying a `video` grant
const signLiveKitToken = (config, { identity, name, metadata, grant, ttlSeconds }) =>
  jwt.sign({ name, metadata, video: grant }, config.apiSecret, {
    algorithm: "HS256",
    issuer: config.apiKey,
    subject: identity,
    jwtid: identity,
    notBefore: 0,
    expiresIn: ttlSeconds,
  });

/**
 * Issues the token a user needs to enter the room of a Session.
 * HOST (Teacher) can moderate the room; PARTICIPANT (Student) can publish and subscribe.
 * The token expires when the Session ends (NFR-12).
 */
const createJoinToken = ({ roomId, sessionId, userId, displayName, role, expiresAt }) => {
  const config = getLiveKitConfig();
  if (!config) {
    return {
      provider: "EDUNITY_DEV",
      serverUrl: null,
      accessToken: createRoomToken({ roomId, sessionId, userId, role, expiresAt }),
    };
  }

  const ttlSeconds = Math.max(Math.ceil((expiresAt.getTime() - Date.now()) / 1000), 60);
  return {
    provider: "LIVEKIT",
    serverUrl: config.url,
    accessToken: signLiveKitToken(config, {
      identity: userId,
      name: displayName,
      metadata: JSON.stringify({ role, sessionId }),
      ttlSeconds,
      grant: {
        room: roomId,
        roomJoin: true,
        roomAdmin: role === "HOST",
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    }),
  };
};

/**
 * Closes the room when the Teacher ends the Session, disconnecting everyone still inside.
 * Best effort: the Session is already COMPLETED and tokens expire on their own, so a provider
 * outage must not fail the request.
 */
const closeRoom = async (roomId) => {
  const config = getLiveKitConfig();
  if (!config || !roomId) return false;

  try {
    const token = signLiveKitToken(config, {
      identity: "edunity-backend",
      grant: { roomCreate: true, roomAdmin: true, room: roomId },
      ttlSeconds: 60,
    });
    const httpUrl = config.url.replace(/^ws/, "http").replace(/\/+$/, "");
    const response = await fetch(`${httpUrl}/twirp/livekit.RoomService/DeleteRoom`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomId }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (err) {
    console.error("Failed to close video room:", err.message);
    return false;
  }
};

const startRecording = async (roomId, storageKey) => {
  const config = getLiveKitConfig();
  if (!config || !roomId || !storageKey) return null;

  try {
    const egressClient = new EgressClient(config.url, config.apiKey, config.apiSecret);
    const fileOutput = new EncodedFileOutput({
      filepath: storageKey
    });
    
    const info = await egressClient.startRoomCompositeEgress(roomId, {
      file: fileOutput
    });
    return info.egressId;
  } catch (err) {
    console.error("Failed to start LiveKit recording:", err.message);
    return null;
  }
};

/**
 * Dừng một tiến trình LiveKit Egress cụ thể theo egressId (phục vụ bồi hoàn an toàn khi không thể lưu metadata).
 *
 * YÊU CẦU AN TOÀN:
 * 1. Validate egressId hợp lệ trước khi gửi RPC.
 * 2. Chỉ dừng đúng Egress được chỉ định, TUYỆT ĐỐI KHÔNG gọi DeleteRoom (không ngắt lớp học đang diễn ra).
 * 3. Không log API key hoặc API secret.
 * 4. Thiết lập bounded RPC timeout (5 giây) thông qua EgressClient options.
 * 5. Phân loại lỗi và kết quả chính xác, không dùng regex / substring mơ hồ.
 *
 * @param {string} egressId ID tiến trình Egress cần dừng
 * @returns {Promise<{
 *   success: boolean,
 *   reason: "STOP_REQUEST_ACCEPTED" | "ALREADY_TERMINAL_VERIFIED" | "INVALID_EGRESS_ID" | "PROVIDER_NOT_CONFIGURED" | "RPC_FAILED" | "OUTCOME_UNKNOWN",
 *   status?: string,
 *   egressId?: string,
 *   code?: string,
 *   statusCode?: number,
 *   error?: string
 * }>}
 */
const stopRecording = async (egressId) => {
  const config = getLiveKitConfig();
  if (!config) {
    return {
      success: false,
      reason: "PROVIDER_NOT_CONFIGURED",
    };
  }

  if (!egressId || typeof egressId !== "string" || !egressId.trim()) {
    return {
      success: false,
      reason: "INVALID_EGRESS_ID",
    };
  }

  const trimmedId = egressId.trim();

  try {
    // Sử dụng requestTimeout: 5s để đảm bảo không bị treo RPC vô hạn
    const egressClient = new EgressClient(config.url, config.apiKey, config.apiSecret, {
      requestTimeout: 5,
    });

    const info = await egressClient.stopEgress(trimmedId);

    // Kiểm tra trạng thái trả về từ EgressInfo
    const statusCode = info?.status;
    const statusName =
      EgressStatus && statusCode !== undefined && EgressStatus[statusCode]
        ? EgressStatus[statusCode]
        : String(statusCode);

    // Nếu Egress đã ở trạng thái kết thúc (COMPLETE, FAILED, ABORTED)
    if (
      statusCode === EgressStatus.EGRESS_COMPLETE ||
      statusCode === EgressStatus.EGRESS_FAILED ||
      statusCode === EgressStatus.EGRESS_ABORTED
    ) {
      return {
        success: true,
        reason: "ALREADY_TERMINAL_VERIFIED",
        status: statusName,
        egressId: trimmedId,
      };
    }

    // Nếu Egress đang trong quá trình dừng (EGRESS_ENDING)
    if (statusCode === EgressStatus.EGRESS_ENDING) {
      return {
        success: true,
        reason: "STOP_REQUEST_ACCEPTED",
        status: "EGRESS_ENDING",
        egressId: trimmedId,
      };
    }

    // Trạng thái hợp lệ khác trả về từ RPC
    return {
      success: true,
      reason: "STOP_REQUEST_ACCEPTED",
      status: statusName,
      egressId: trimmedId,
    };
  } catch (err) {
    // Phân loại lỗi mạng / timeout
    const isTimeout =
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      err.code === "deadline_exceeded" ||
      (err.message && err.message.toLowerCase().includes("timeout"));

    if (isTimeout) {
      console.error(`[LiveKit Provider] stopRecording timed out for egress ${trimmedId}:`, {
        reason: "OUTCOME_UNKNOWN",
        code: "TIMEOUT",
      });
      return {
        success: false,
        reason: "OUTCOME_UNKNOWN",
        code: "TIMEOUT",
        egressId: trimmedId,
      };
    }

    // Phân loại lỗi RPC / ServerError (không dùng broad substring)
    const errorCode = err.code || err.name || "RPC_ERROR";
    const httpStatus = err.status || undefined;

    console.error(`[LiveKit Provider] stopRecording RPC failed for egress ${trimmedId}:`, {
      reason: "RPC_FAILED",
      code: errorCode,
      status: httpStatus,
      message: err.message,
    });

    return {
      success: false,
      reason: "RPC_FAILED",
      code: errorCode,
      statusCode: httpStatus,
      error: err.message,
      egressId: trimmedId,
    };
  }
};


/**
 * The Authorization header is a JWT signed with the apiSecret; its `sha256` claim is the hash of the exact
 * bytes LiveKit sent. Checking it binds the signature to this body, so a captured header cannot be replayed
 * with different content. app.js keeps the raw bytes of this route for that purpose.
 */
const processWebhook = (rawBody, parsedBody, authHeader) => {
  const config = getLiveKitConfig();
  if (!config) throw new Error("LiveKit not configured");
  if (!rawBody) throw new Error("Webhook body is missing");

  const claims = jwt.verify(authHeader.replace(/^Bearer /, ""), config.apiSecret, {
    algorithms: ["HS256"],
    issuer: config.apiKey,
  });
  const expected = crypto.createHash("sha256").update(rawBody).digest("base64");
  if (claims.sha256 !== expected) throw new Error("sha256 checksum of body does not match");

  return parsedBody;
};

module.exports = { getProviderName, createJoinToken, closeRoom, startRecording, stopRecording, processWebhook };
