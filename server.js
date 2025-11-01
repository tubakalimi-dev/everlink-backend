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
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// --- Check Environment Variables ---
console.log("🧾 Environment Loaded:");
console.log("PORT:", process.env.PORT || 5000);
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "✅ Found" : "❌ Missing");
console.log("JWT_SECRET:", process.env.JWT_SECRET ? "✅ Found" : "⚠️ Using default");

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
  });

// --- Routes ---
app.get("/", (req, res) => {
  res.json({ 
    message: "🚀 EverLink Chat Server is running!",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      admin: "/api/admin"
    }
  });
});

// Auth Routes
app.use('/api/auth', require('./routes/auth'));

// Admin Routes
app.use('/api/admin', require('./routes/admin'));

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

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
});