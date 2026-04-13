const { verifyToken, validateServiceKey } = require("../middlewares/auth");
const decryptRequest = require("./decryptRequest");

const secureRoute = (controller) => {
  return [
    // verifyToken,
    decryptRequest(),
    controller
  ];
};

module.exports = secureRoute;