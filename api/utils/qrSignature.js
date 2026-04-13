// utils/qrSignature.js
const crypto = require("crypto");
const { getServiceByKey } = require("../services/service.service");

async function signPayload(payloadString, service_key) {
  const svc = await getServiceByKey(service_key);
  if (!svc || !svc.secret_key) throw new Error("Service secret_key missing");

  return crypto
    .createHmac("sha256", svc.secret_key)
    .update(payloadString)
    .digest("hex");
}

async function verifyPayload(payloadString, signature, service_key) {
  const expected = await signPayload(payloadString, service_key);

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { signPayload, verifyPayload };
