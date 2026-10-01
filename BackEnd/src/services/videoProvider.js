const jwt = require("jsonwebtoken");
const { createRoomToken } = require("../utils/roomToken");

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

module.exports = { getProviderName, createJoinToken, closeRoom };
