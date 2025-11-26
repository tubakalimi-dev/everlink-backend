const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require('dotenv').config({ quiet: true });

const Message = require('./models/Message');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: 
 {   origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// CORS Configuration
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

console.log("🧾 Environment Loaded:");
console.log("PORT:", process.env.PORT || 5000);
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "✅ Found" : "❌ Missing");

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  });

// Routes
app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "🚀 EverLink Chat Server is running!",
    version: "1.0.0"
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/status', require('./routes/status'));

// Socket.io - Store connected users
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id);

  // User signs in with their userId
  socket.on("signin", (userId) => {
    console.log(`✅ User ${userId} signed in with socket ${socket.id}`);
    connectedUsers.set(userId, socket.id);
    socket.userId = userId;
    
    // Notify others that user is online
    socket.broadcast.emit("user_online", { userId });
  });

  // Send message to specific user
  socket.on("send_message", async (data) => {
    try {
      console.log("\n📤 SEND_MESSAGE event received:");
      console.log("Data:", JSON.stringify(data, null, 2));

      const { senderId, receiverId, content, messageType = 'text' } = data;

      if (!senderId || !receiverId || !content) {
        console.log("❌ Missing required fields");
        socket.emit("message_error", { error: "Missing required fields" });
        return;
      }

      // Save message to database
      const message = new Message({
        senderId,
        receiverId,
        content,
        messageType,
        isDelivered: true
      });

      await message.save();
      await message.populate('senderId', 'name email profilePicture');
      await message.populate('receiverId', 'name email profilePicture');

      console.log(`✅ Message saved to DB: ${message._id}`);

      const messageData = {
        id: message._id,
        senderId: message.senderId._id,
        senderName: message.senderId.name,
        receiverId: message.receiverId._id,
        receiverName: message.receiverId.name,
        content: message.content,
        messageType: message.messageType,
        isRead: message.isRead,
        isDelivered: message.isDelivered,
        createdAt: message.createdAt
      };

      // Send to receiver if online
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receive_message", messageData);
        console.log(`✅ Message sent to receiver socket: ${receiverSocketId}`);
      } else {
        console.log(`⚠️ Receiver ${receiverId} is offline`);
      }

      // Confirm to sender
      socket.emit("message_sent", messageData);
      console.log(`✅ Confirmation sent to sender\n`);

    } catch (error) {
      console.error("❌ Error in send_message:", error);
      socket.emit("message_error", { error: error.message });
    }
  });

  // Typing indicator
  socket.on("typing", (data) => {
    const { receiverId, isTyping, senderName } = data;
    const receiverSocketId = connectedUsers.get(receiverId);
    
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("user_typing", {
        senderId: socket.userId,
        senderName,
        isTyping
      });
    }
  });

  // Mark message as read
  socket.on("mark_read", async (data) => {
    try {
      const { messageId } = data;
      await Message.findByIdAndUpdate(messageId, { isRead: true });
      
      // Notify sender
      const message = await Message.findById(messageId);
      const senderSocketId = connectedUsers.get(message.senderId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("message_read", { messageId });
      }
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (socket.userId) {
      console.log(`👋 User ${socket.userId} disconnected`);
      connectedUsers.delete(socket.userId);
      
      // Notify others that user is offline
      socket.broadcast.emit("user_offline", { userId: socket.userId });
    }
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});