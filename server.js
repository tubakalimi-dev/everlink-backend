const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require('dotenv').config({ quiet: true });

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"],
    credentials: true
  }
});

// CORS Configuration - Allow all origins for development
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// --- Check Environment Variables ---
console.log("🧾 Environment Loaded:");
console.log("PORT:", process.env.PORT || 5000);
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "✅ Found" : "❌ Missing");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "✅ Found" : "⚠️ Using default");

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1); // Exit if can't connect to DB
  });

// --- Health Check Route ---
app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "🚀 EverLink Chat Server is running!",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/api/auth",
      admin: "/api/admin"
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime()
  });
});

// --- Routes ---
try {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/admin', require('./routes/admin'));
  console.log("✅ Routes loaded successfully");
} catch (error) {
  console.error("❌ Error loading routes:", error);
  process.exit(1);
}

// --- Socket.io Events ---
io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id);

  // Join a chat room
  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    socket.to(roomId).emit("user_joined", { userId: socket.id });
  });

  // Send message
  socket.on("send_message", (data) => {
    console.log("📩 Message:", data);
    io.to(data.room).emit("receive_message", data);
  });

  // Typing indicator
  socket.on("typing", (data) => {
    socket.to(data.room).emit("user_typing", {
      username: data.username,
      isTyping: data.isTyping
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("👋 User disconnected:", socket.id);
  });
});

// --- 404 Handler ---
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`
  });
});

// --- Global Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry found'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});