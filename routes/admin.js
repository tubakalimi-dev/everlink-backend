const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to verify admin
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('🔍 Admin verification - Token:', token ? 'exists' : 'missing');
    
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
    
    console.log('🔍 Decoded userId:', decoded.userId);
    
    const user = await User.findById(decoded.userId);
    
    console.log('🔍 User found:', user ? `${user.name} (${user.role})` : 'not found');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Admin verification error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// ===================== GET ALL USERS (Admin Only) =====================
router.get('/users', verifyAdmin, async (req, res) => {
  try {
    console.log('📋 Admin fetching all users...');
    
    const users = await User.find().select('-password').lean();

    console.log(`✅ Found ${users.length} users`);

    res.status(200).json({
      success: true,
      users: users.map(user => ({
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || 'offline',
        bio: user.bio || '',
        profilePicture: user.profilePicture || '',
        lastSeen: user.lastSeen || user.createdAt,
        createdAt: user.createdAt
      }))
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===================== GET ADMIN STATS =====================
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const onlineUsers = await User.countDocuments({ status: 'online' });
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('-password')
      .lean();

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalAdmins,
        onlineUsers,
        offlineUsers: totalUsers - onlineUsers,
        recentUsers
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;