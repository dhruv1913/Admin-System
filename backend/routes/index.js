const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const directoryRoutes = require('./directory.routes');

router.use('/auth', authRoutes);
router.use('/directory', directoryRoutes);

module.exports = router;