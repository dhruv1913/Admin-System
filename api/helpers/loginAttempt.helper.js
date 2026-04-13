const { LoginAttempt } = require("../models");

const CAPTCHA_THRESHOLD = 1; // first failure ke baad

exports.registerFailedAttempt = async (username, serviceId) => {
  const [record] = await LoginAttempt.findOrCreate({
    where: { username, service_id: serviceId },
    defaults: { attempts: 0 },
  });

  record.attempts += 1;
  record.last_attempt_at = new Date();

  if (record.attempts >= CAPTCHA_THRESHOLD) {
    record.captcha_required = true;
  }

  await record.save();
  return record;
};

exports.clearAttempts = async (username, serviceId) => {
  await LoginAttempt.destroy({
    where: { username, service_id: serviceId },
  });
};

exports.isCaptchaRequired = async (username, serviceId) => {
  const record = await LoginAttempt.findOne({
    where: { username, service_id: serviceId },
  });

  if (!record) return false;

  // ⏳ auto-reset after 15 minutes
  const diff = Date.now() - new Date(record.last_attempt_at).getTime();
  if (diff > 15 * 60 * 1000) {
    await exports.clearAttempts(username, serviceId);
    return false;
  }

  return record.captcha_required;
};
