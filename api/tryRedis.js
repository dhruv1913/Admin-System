const redis = require("redis");
(async () => {
  const client = redis.createClient({ url: "redis://127.0.0.1:6380" });
  client.on("error", console.error);
  await client.connect();
  await client.setEx("testkey", 10, "true");
  console.log(await client.get("testkey"));
})();
