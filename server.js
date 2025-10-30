const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require('dotenv').config({ quiet: true });

const app = express();
app.use(cors());
app.use(express.json());

// --- Check Environment Variables ---
console.log("🧾 Environment Loaded:");
console.log("PORT:", process.env.PORT);
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "✅ Found" : "❌ Missing");

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
  });

// --- Test Route ---
app.get("/", (req, res) => {
  res.send("🚀 Server is running and trying to connect to MongoDB...");
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
