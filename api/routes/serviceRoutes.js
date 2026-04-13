const express = require("express");
const { verifyToken, validateServiceKey } = require("../middlewares/auth");
const serviceController = require("../controllers/serviceController");
const serviceDetailsController = require("../controllers/servicedetail_controller");
const router = express.Router();
router.get("/all", serviceController.getServices);
router.get("/:serviceKey/details", serviceDetailsController.getServiceDetails);
router.get("/:serviceKey/data", verifyToken, validateServiceKey, async (req, res) => {
  const service = req.service;
  const user = req.user;

  res.json({
    status: "success",
    tokenValid: true, // token is valid if middleware passed
    message: `Access granted to service ${service.service_name}`,
  //   user,
  //  service,
    timestamp: new Date(),
  });
});


router.post("/getAllServices", serviceController.getServices);   // 👈 ADD THIS

// Optional: catch invalid token globally (if middleware throws)
router.use((err, req, res, next) => {

  if (err.name === "UnauthorizedError") {
    
    return res.status(401).json({ status: "failure", tokenValid: false });
  }
  next(err);
});

module.exports = router;

