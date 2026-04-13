// routes/auth.js
const fs = require("fs");
const path = require("path");

const publicKey = fs.readFileSync(
  path.join(__dirname, "../keys/public.pem"),
  "utf8"
);

exports.getPublicKey = (req, res) => {
  res.type("text/plain").send(publicKey);
};



