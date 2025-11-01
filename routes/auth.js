const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Fixed admin credentials
const ADMIN_EMAIL = 'admin@everlink.com';
const ADMIN_PASSWORD = 'admin123456';

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

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check if admin email is being used
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'This email is reserved'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Password length check
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Create new user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: 'user',
      status: 'offline'
    });

    await user.save();

    // Generate token
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
        status: user.status
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// ===================== LOGIN =====================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check if it's the admin logging in
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      if (password === ADMIN_PASSWORD) {
        // Find or create admin user
        let admin = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
        
        if (!admin) {
          console.log('🔧 Creating admin user...');
          admin = new User({
            name: 'Admin',
            email: ADMIN_EMAIL.toLowerCase(),
            password: ADMIN_PASSWORD,
            role: 'admin',
            status: 'online',
            lastSeen: new Date(),
            bio: 'System Administrator',
            profilePicture: ''
          });
          await admin.save();
          console.log('✅ Admin user created');
        } else {
          // Update admin status to online when logging in
          admin.status = 'online';
          admin.lastSeen = new Date();
          await admin.save();
          console.log('✅ Admin logged in');
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
            status: admin.status
          }
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
    }

    // Regular user login
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update user status to online
    user.status = 'online';
    user.lastSeen = new Date();
    await user.save();

    // Generate token
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
        status: user.status
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// ===================== GET ALL USERS (Protected) =====================
router.get('/users', async (req, res) => {
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
    
    // Get all users except the current user
    const users = await User.find({ _id: { $ne: decoded.userId } })
      .select('-password')
      .lean();

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
        profilePicture: user.profilePicture || 'assets/person.svg',
        lastSeen: user.lastSeen || new Date().toISOString()
      }))
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ===================== LOGOUT =====================
router.post('/logout', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || '7883b3e8a303917ebea477a919d0faf718d92ef703e0fc60772ade8a4f136407efc2a634447a3212ac78d81f5c469eb6f028673d809f7cc9adfec02c2b48746e'
      );
      
      // Update user status to offline
      await User.findByIdAndUpdate(decoded.userId, {
        status: 'offline',
        lastSeen: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  }
});

module.exports = router;