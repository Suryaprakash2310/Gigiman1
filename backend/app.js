const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDb = require("./config/db");
const socketConfig = require('./config/socket');
const http = require('http');
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const logger = require("./utils/logger");
// Routers
const singleemployee = require("./router/singleemployee.router");
const multipleemployee = require("./router/multipleempolyee.router");
const shop = require("./router/toolshop.router");
const auth = require("./router/auth.router");
const parts = require("./router/part.router");
const profile = require("./router/profile.router");
const wallet = require("./router/wallet.router");
const adminrouter = require('./router/admin.router');
const user = require('./router/user.router');
const bookingRouter = require('./router/booking.router');
const activestateRouter = require('./router/activestatus.router');
const banner = require("./router/banner.router");
const couponRouter = require("./router/coupon.router");
const ticketRouter = require("./router/ticket.router");
const commissionRouter = require("./router/commission.router");
const notificationRouter = require("./router/notification.router");
const cartRouter = require("./router/cart.router");
const { startScheduler } = require("./services/booking.schedule");
const { startNotificationScheduler } = require("./services/notification.schedule");
const scheduledNotificationRouter = require("./router/scheduledNotification.router");
const errorHandler = require("./middleware/error.middleware");
const setupGracefulShutdown = require("./utils/gracefulShutdown");
const mongoose = require("mongoose");
dotenv.config();
const app = express();
app.set("trust proxy", 1);


// ------------------- MIDDLEWARE -------------------
// CORS configuration should be first
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"]
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));
app.use(helmet());
app.use(compression());
app.use(morgan("combined", { stream: { write: (message) => logger.info(message.trim()) } }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Safe limit for shared public IPs (Nginx / Cloudflare)
  message: "Too many requests, please try again later."
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 OTP attempts per IP per 15 mins to protect costs
  message: "Too many OTP requests from this IP. Please try again after 15 minutes."
});

// Apply strict rate limiting to OTP/Auth endpoints first
app.use("/api/auth/send-otp", authLimiter);
app.use("/api/auth/verify-otp", authLimiter);
app.use("/api/user/send-otp", authLimiter);
app.use("/api/user/verify-otp", authLimiter);

// Apply relaxed rate limiting to all other APIs
app.use("/api/", generalLimiter);

// ------------------- DATABASE -------------------
connectDb();

const server = http.createServer(app);
const io = socketConfig(server);

app.set("io", io);
startScheduler(io);
startNotificationScheduler(io);
// ------------------- ROUTES -------------------
app.get("/", (req, res) => res.send("API is running..."));

app.use("/api/singleemployee", singleemployee);
app.use("/api/multipleemployee", multipleemployee);
app.use("/api/toolshop", shop);
app.use("/api/auth", auth);
app.use("/api/parts", parts);
app.use("/api/profile", profile);
app.use("/api/wallet", wallet);
app.use("/api/admin", adminrouter);
app.use('/api/user', user);
app.use('/api/booking', bookingRouter);
app.use('/api/', activestateRouter);
app.use("/api/banners", banner);
app.use("/api/coupon", couponRouter);
app.use("/api/tickets", ticketRouter);
app.use("/api/commission", commissionRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/cart", cartRouter);
app.use("/api/admin/scheduled-notifications", scheduledNotificationRouter);

// Global Error Handler
app.use(errorHandler);

// ------------------- START SERVER -------------------
  const port = process.env.PORT || 5000;
  server.listen(port, () => console.log(`Server running at http://localhost:${port}`));

  // Graceful Shutdown
  setupGracefulShutdown(server, mongoose);

module.exports = { app, server, io };
