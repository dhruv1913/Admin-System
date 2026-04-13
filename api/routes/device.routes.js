// routes/device.routes.js
const router = require("express").Router();
const deviceController = require("../controllers/device.controller");
const secureRoute = require("../middlewares/secureRoute");

router.post(
  "/getAll",
  ...secureRoute(deviceController.getAllDevices)
);
router.post("/check", deviceController.checkDeviceStatus);

module.exports = router;
