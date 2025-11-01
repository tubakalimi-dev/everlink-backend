const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to verify token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || '7883b3e8a303917ebea477a919d0faf718d92ef703e0fc60772ade8a4f136407efc2a634447a3212ac78d81f5c469eb6f028673d809f7cc9adfec02c2b48746e'
    );
    
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// ===================== GET MESSAGES BETWEEN TWO USERS =====================
router.get('/:otherUserId', verifyToken, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const currentUserId = req.userId;

    console.log(`📨 Fetching messages between ${currentUserId} and ${otherUserId}`);

    // Get messages between these two users
    const messages = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ],
      deletedFor: { $ne: currentUserId } // Exclude deleted messages
    })
    .populate('senderId', 'name email profilePicture')
    .populate('receiverId', 'name email profilePicture')
    .sort({ createdAt: 1 }); // Oldest first

    console.log(`✅ Found ${messages.length} messages`);

    // Mark messages as read
    await Message.updateMany(
      {
        senderId: otherUserId,
        receiverId: currentUserId,
        isRead: false
      },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      messages: messages.map(msg => ({
        id: msg._id,
        senderId: msg.senderId._id,
        senderName: msg.senderId.name,
        receiverId: msg.receiverId._id,
        receiverName: msg.receiverId.name,
        content: msg.content,
        messageType: msg.messageType,
        isRead: msg.isRead,
        isDelivered: msg.isDelivered,
        createdAt: msg.createdAt,
        isMe: msg.senderId._id.toString() === currentUserId.toString()
      }))
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===================== SEND MESSAGE =====================
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { receiverId, content, messageType = 'text' } = req.body;
    const senderId = req.userId;

    console.log(`📤 Sending message from ${senderId} to ${receiverId}`);

    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Receiver ID and content are required'
      });
    }

    // Check if receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    // Create message
    const message = new Message({
      senderId,
      receiverId,
      content,
      messageType,
      isDelivered: true
    });

    await message.save();

    // Populate sender and receiver info
    await message.populate('senderId', 'name email profilePicture');
    await message.populate('receiverId', 'name email profilePicture');

    console.log(`✅ Message saved: ${message._id}`);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
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
      }
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===================== DELETE MESSAGE =====================
router.delete('/:messageId', verifyToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    console.log(`🗑️ Deleting message ${messageId} for user ${userId}`);

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user is sender or receiver
    if (
      message.senderId.toString() !== userId.toString() &&
      message.receiverId.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this message'
      });
    }

    // Add user to deletedFor array
    if (!message.deletedFor.includes(userId)) {
      message.deletedFor.push(userId);
      await message.save();
    }

    // If both users deleted, remove from DB
    if (message.deletedFor.length === 2) {
      await Message.findByIdAndDelete(messageId);
      console.log(`✅ Message ${messageId} permanently deleted`);
    } else {
      console.log(`✅ Message ${messageId} deleted for user ${userId}`);
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===================== GET UNREAD MESSAGE COUNT =====================
router.get('/unread/count', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    const unreadCount = await Message.countDocuments({
      receiverId: userId,
      isRead: false,
      deletedFor: { $ne: userId }
    });

    res.status(200).json({
      success: true,
      unreadCount
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;