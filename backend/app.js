const express = require('express');
const cors = require('cors');
const session = require('express-session');
const routes = require('./routes');
const errorMiddleware = require('./middleware/errorMiddleware');
const path = require('path');

const app = express();

// 1. Global Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Session for Captcha
app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secret_fallback',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === "production" ? true : false, // 🔥 Allow HTTP in dev
        httpOnly: true,
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Strict in dev
        domain: process.env.NODE_ENV === "production" ? DOMAIN : undefined,
        maxAge: 15 * 60 * 1000,
    },
}));

// 3. Static Files (Profile Photos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. API Routes
app.use('/api', routes);

// 5. Global Error Handler
app.use(errorMiddleware);

module.exports = app;