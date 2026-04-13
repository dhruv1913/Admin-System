// routes/dashboardRoutes.js
const express = require("express");
const { verifyToken } = require("../middlewares/auth"); // your current middleware

const router = express.Router();

// Protected dashboard route
router.get("/", verifyToken, async (req, res) => {
  try {
    // req.user is populated by verifyToken
    const user = req.user;

    // Example: return user info or dashboard data
    return res.json({
      status: "success",
      message: "Dashboard data fetched successfully",
      user: {
        id: user.sub,
        name: user.name,
        provider: user.provider,
      },
      data: {
        // any dashboard-specific data
        welcomeMessage: `Welcome, ${user.name}!`,
        stats: {
          projects: 5,
          tasks: 12,
        },
      },
     
    });
     const redirectBase = FRONTEND_URL?.replace(/\/$/, "") || "http://localhost:3000";
    res.json({
      success: true,
      redirectUrl: `${redirectBase}/auth/callback?token=${encodeURIComponent(encryptedToken)}`,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return res.status(500).json({ status: "failure", message: "Failed to fetch dashboard data" });
  }
});

module.exports = router;
