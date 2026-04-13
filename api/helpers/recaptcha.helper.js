const fetch = require('node-fetch');
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

async function verifyCaptcha(token) {
  if (!token) return false;

  const params = new URLSearchParams();
  params.append('secret', RECAPTCHA_SECRET);
  params.append('response', token);

  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params,
    });
    const data = await res.json();
    return data.success;
  } catch (err) {
    console.error('Captcha verification error:', err);
    return false;
  }
}

module.exports = { verifyCaptcha };
