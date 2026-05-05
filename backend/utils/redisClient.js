const redis = require("redis");

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  legacyMode: false,  // 🚨 Must be false for the Kill Switch to work
});

redisClient.on("error", (err) => console.error("❌ Redis error:", err));
redisClient.on("connect", () => console.log("✅ Backend Connected to Redis"));
redisClient.on("ready", () => console.log("✅ Backend Redis is ready"));

// 🚨 THE FIX: No 'await' keyword here! Just let it connect in the background.
redisClient.connect().catch((err) => {
  console.error("🔥 Failed to connect to Redis:", err);
});

module.exports = redisClient;