const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Fixed admin credentials - CHANGE THESE!
const ADMIN_EMAIL = 'admin@everlink.com';
const ADMIN_PASSWORD = 'admin123456'; // Change this to something secure!

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || '7883b3e8a303917ebea477a919d0faf718d92ef703e0fc60772ade8a4f136407efc2a634447a3212ac78d81f5c469eb6f028673d809f7cc9adfec02c2b48746e',
    { expiresIn: '30d' }
  );
};

// ===================== REGISTER =====================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'This email is reserved',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: 'user',
    });

    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// ===================== LOGIN =====================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Admin login
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      if (password === ADMIN_PASSWORD) {
        let admin = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
        if (!admin) {
          admin = new User({
            name: 'Admin',
            email: ADMIN_EMAIL.toLowerCase(),
            password: ADMIN_PASSWORD,
            role: 'admin',
          });
          await admin.save();
        }

        const token = generateToken(admin._id);
        return res.status(200).json({
          success: true,
          message: 'Login successful',
          token,
          user: {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
          },
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
      }
    }

    // Regular user login
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ===================== GET ALL USERS (Protected) =====================
router.get('/users', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    const users = await User.find({ _id: { $ne: decoded.userId } }).select('-password').lean();

    res.status(200).json({
      success: true,
      users: users.map((user) => ({
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: 'online',
        bio: '',
        profilePicture: user.profilePicture || 'assets/person.svg',
        lastSeen: user.lastSeen || new Date().toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===================== LOGOUT =====================
router.post('/logout', async (req, res) => {
  try {
    // You can add logout logic later (token blacklist, lastSeen update, etc.)
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Server error during logout' });
  }
});

module.exports = router;
