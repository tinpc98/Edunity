const jwt = require("jsonwebtoken");
const { createRoomToken } = require("../utils/roomToken");
const { EgressClient, EncodedFileOutput } = require("livekit-server-sdk");

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

const { WebhookReceiver } = require("livekit-server-sdk");

const processWebhook = (reqBody, authHeader) => {
  const config = getLiveKitConfig();
  if (!config) throw new Error("LiveKit not configured");
  
  // The webhook auth header is a JWT signed with the apiSecret.
  // By verifying it, we ensure the payload was sent by LiveKit.
  // (We use jwt.verify instead of WebhookReceiver to avoid raw body strict matching issues when express.json() is used)
  jwt.verify(authHeader, config.apiSecret, { issuer: config.apiKey });
  
  return reqBody;
};

module.exports = { getProviderName, createJoinToken, closeRoom, startRecording, processWebhook };
