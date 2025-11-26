const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['image', 'video', 'text'], required: true },

  mediaUrl: { type: String, default: null },
  textContent: { type: String, default: null },
  backgroundColor: { type: String, default: null },

  viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

// Auto delete after expiry
statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Status', statusSchema);
