require("dotenv").config();
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const passport = require("./passportConfig");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");

// Redis import
const RedisStore = require("connect-redis").default;
const redisClient = require("./utils/redisClient"); // jo aapne bheja




/* ROUTES */
const authRoutes = require("./routes/authRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const mobileRoutes = require("./routes/mobile");
const totpRoutes = require("./routes/totpRoutes");
const qrRoutes = require("./routes/qrRoutes");
const getDevice =require("./routes/device.routes");
const loginHistoryRoutes = require("./routes/loginHistoryRoutes");

/* MIDDLEWARES */
const responseMiddleware = require("./middlewares/responseMiddleware");
const errorHandler = require("./middlewares/errorHandler");
const apiLogger = require("./middlewares/apiLogger");
const { activeSessions } = require("./routes/authRoutes");

const captchaRoutes = require("./routes/captcha.routes");

const app = express();
// 🔥🔥 ADD THIS LINE JUST AFTER app creation
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5002;
const DOMAIN = process.env.COOKIE_DOMAIN || "localhost";

/* ------------------------------------------
   ALLOWED ORIGINS
--------------------------------------------*/

const allowedOrigins = [
  `http://${DOMAIN}:5174`,
  `http://${DOMAIN}:5002`,
  "http://localhost:5174",
  "http://localhost:5173",
  "http://localhost:5002",
  "http://localhost:3000",
  "https://authdemo.yuktiapps.in",
  "https://rajkottest.eoffice.gov.in",
  "https://pramaan.yuktihubtechnologies.com",
  "https://authadmin.yuktiapps.in"
];

/* ------------------------------------------
   SECURITY HEADERS
--------------------------------------------*/


/* ------------------------------------------
   CORS (SINGLE SOURCE OF TRUTH)
--------------------------------------------*/


// 2. Set up the dynamic CORS function
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // 🚨 ADD 'x-service-key' TO THIS LIST RIGHT HERE:
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-service-key', 'Accept'], 
  credentials: true 
}));

app.options('*', cors());
app.use(helmet());

/* ------------------------------------------
   RATE LIMITING (AUTH APIs)
--------------------------------------------*/
const ssoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // redirects safe
});

// serve static files
app.use("/public", express.static(path.join(__dirname, "public")));

// Privacy Policy PDF route
app.get("/privacy", (req, res) => {
  const filePath = path.join(
    __dirname,
    "public",
    "docs",
    "privacy-policy.pdf"
  );

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=privacy-policy.pdf");

  res.sendFile(filePath);
});

app.post("/auth/validate-sso", ssoLimiter);
app.post("/auth/token/reads", ssoLimiter);




/* ------------------------------------------
   BODY & COOKIE
--------------------------------------------*/
app.use(bodyParser.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/device", getDevice);



/* ------------------------------------------
   SESSION CONFIG
--------------------------------------------*/

// app.use(session({
//   store: new RedisStore({
//     client: redisClient,
//     prefix: "sess:"
//   }),
//   name: "__Host-auth.sid",
//   secret: process.env.SESSION_SECRET || "keyboard cat",
//   resave: false,
//   saveUninitialized: false,
//   rolling: true,
//   cookie: {
//     secure: process.env.NODE_ENV === "production",
//     httpOnly: true,
//     sameSite: "lax",
//     domain: process.env.NODE_ENV === "production" ? DOMAIN : undefined,
//     maxAge: 15 * 60 * 1000
//   }
// }));


// app.use(session({
//     secret: process.env.SESSION_SECRET || "keyboard cat",
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//         secure: process.env.NODE_ENV === "production", 
//         httpOnly: true,
//         sameSite: "lax",
//         maxAge: 15 * 60 * 1000
//     }
// }));

// app.use(
//   session({
//     name: "connect.sid", // ⭐ IMPORTANT
//     secret: process.env.SESSION_SECRET || "keyboard cat",
//     resave: false,
//     saveUninitialized: true,
//     cookie: {
//       secure: process.env.NODE_ENV === "production",
//       httpOnly: true,
//       sameSite: "lax",
//       maxAge: 15 * 60 * 1000,
//     },
//   })
// );


app.use(
  session({
    store: new RedisStore({
      client: redisClient,
      prefix: "sess:",
    }),
    name: "connect.sid",
    secret: process.env.SESSION_SECRET || "keyboard cat",
    resave: false,
    saveUninitialized: true, // 🔥 Save even empty sessions to create them in Redis
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === "production" ? true : false, // 🔥 Allow HTTP in dev
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Strict in dev
      domain: process.env.NODE_ENV === "production" ? DOMAIN : undefined,
      maxAge: 15 * 60 * 1000,
    },
  })
);

// 📊 Session tracking middleware
app.use((req, res, next) => {
  if (req.path.includes("auth") || req.path.includes("captcha")) {
    console.log(`\n[SESSION] ${req.method} ${req.path}`);
    console.log(`  ID:`, req.sessionID);
    console.log(`  Keys:`, Object.keys(req.session).filter(k => k !== 'cookie'));
    console.log(`  showCaptcha:`, req.session.showCaptcha);
  }
  next();
});

/* ------------------------------------------
   PASSPORT
--------------------------------------------*/
app.use(passport.initialize());
app.use(passport.session());

/* ------------------------------------------
   COMMON MIDDLEWARES
--------------------------------------------*/
app.use(responseMiddleware);
app.use(apiLogger);

/* ------------------------------------------
   LOGOUT COOKIE CLEAN
--------------------------------------------*/
app.use((req, res, next) => {
  if (req.path === "/auth/logout") {
    const opts = {
      path: "/",
      domain: process.env.NODE_ENV === "production" ? DOMAIN : undefined,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    };

    res.clearCookie("sso_token", opts);
    res.clearCookie("auth_token", opts);
  }
  next();
});

/* ------------------------------------------
   DEBUG ENDPOINTS
--------------------------------------------*/
app.get("/debug/session", (req, res) => {
  res.json({
    sessionID: req.sessionID,
    sessionData: {
      failedAttempts: req.session.failedAttempts,
      showCaptcha: req.session.showCaptcha,
      captcha: req.session.captcha ? `[${req.session.captcha.length} chars]` : null,
      captchaAt: req.session.captchaAt,
      cookie: req.session.cookie,
    }
  });
});

/* ------------------------------------------
   ROUTES
--------------------------------------------*/
app.use("/auth", authRoutes);
app.use("/service", serviceRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/mobile", mobileRoutes);
app.use("/totp", totpRoutes);
app.use("/qr", qrRoutes);


app.use("/authVal", captchaRoutes);
app.use("/login-history", loginHistoryRoutes);


// Translation API
app.get("/api/translations/:lang", (req, res) => {
  const lang = req.params.lang; // en, hi, pa
  const filePath = path.join(__dirname, "translations", `${lang}.json`);

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      return res.status(404).json({ error: "Language not found" });
    }
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  });
});


app.get("/", (_, res) => res.json({ message: "Auth backend running pramaan" }));

/* ------------------------------------------
   HTTP + WEBSOCKET SERVER
--------------------------------------------*/
const server = http.createServer(app);

const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  const origin = req.headers.origin;
  if (!allowedOrigins.includes(origin)) {
    ws.close();
    return;
  }

  const params = new URL(req.url, "http://localhost").searchParams;
  const sessionKey = params.get("sessionKey");

  if (!sessionKey || !activeSessions[sessionKey]) {
    ws.close();
    return;
  }

  activeSessions[sessionKey].ws = ws;
});

/* ------------------------------------------
   ERROR HANDLER
--------------------------------------------*/
app.use(errorHandler);

/* ------------------------------------------
   START SERVER
--------------------------------------------*/
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Auth server running on port ${PORT}`);
});
