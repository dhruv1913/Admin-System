// routes/ldapReport.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/ldapReport.controller");
const auth = require("../middlewares/auth");
const role = require("../middlewares/roleCheck");

router.get("/users", ctrl.getAllUsers);
router.get("/users/disabled", ctrl.getDisabledUsers);

router.post("/users", ctrl.addUser);
router.put("/users/:uid", ctrl.updateUser);
router.patch("/users/:uid/disable", ctrl.disableUser);

module.exports = router;
