const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.userId;  // ✔️ REQUIRED FOR STATUS
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};