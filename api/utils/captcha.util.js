const svgCaptcha = require("svg-captcha");

exports.generateCaptcha = () => {
  return svgCaptcha.create({
    size: 5,
    noise: 0,             // ❌ no distortion
    color: false,         // 🔥 pure black text
    fontSize: 64,         // BIG letters
    width: 200,
    height: 70,
    background: "#ffffff",
    ignoreChars: "0oO1iIl",
  });
};
