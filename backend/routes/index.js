const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const directoryRoutes = require('./directory.routes');

router.use('/auth', authRoutes);
router.use('/directory', directoryRoutes);

router.get('/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

module.exports = router;