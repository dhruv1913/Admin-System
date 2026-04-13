const redis = require("redis");

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  legacyMode: true,  // ✅ This enables both callback AND promise APIs
});

redisClient.on("error", (err) => console.error("❌ Redis error:", err));
redisClient.on("connect", () => console.log("✅ Connected to Redis"));
redisClient.on("ready", () => console.log("✅ Redis is ready"));

// ✅ Immediately connect (but don't await - let it happen in background)
redisClient.connect().catch((err) => {
  console.error("🔥 Failed to connect to Redis:", err);
  process.exit(1);
});

module.exports = redisClient;