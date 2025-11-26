const express = require("express");
const router = express.Router();
const Status = require("../models/Status");
const auth = require("../middleware/auth");
const multer = require("multer");

const { cloudinary, storage } = require("../utils/cloudinary");
const upload = multer({ storage });

// -------------------------
// Upload Image / Video
// -------------------------
router.post("/upload", auth, upload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const status = new Status({
      userId: req.userId,
      type: req.body.type || "image",
      mediaUrl: req.file.path,
      expiresAt
    });

    await status.save();
    
    // ✅ FIX: Populate userId before sending response
    await status.populate('userId', 'name email profilePicture');
    
    res.status(201).json(status);
  } catch (err) {
    console.error("Upload status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// Text Status
// -------------------------
router.post("/text", auth, async (req, res) => {
  try {
    const { textContent, backgroundColor } = req.body;

    if (!textContent)
      return res.status(400).json({ error: "Text content required" });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const status = new Status({
      userId: req.userId,
      type: "text",
      textContent,
      backgroundColor: backgroundColor || '#0288D1', // ✅ FIX: Default color
      expiresAt
    });

    await status.save();
    
    // ✅ FIX: Populate userId before sending response
    await status.populate('userId', 'name email profilePicture');
    
    res.status(201).json(status);
  } catch (err) {
    console.error("Text status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// All statuses grouped by user
// -------------------------
router.get("/all", auth, async (req, res) => {
  try {
    const now = new Date();

    const statuses = await Status.find({
      expiresAt: { $gt: now }
    })
      .populate("userId", "name email profilePicture")
      .sort({ createdAt: -1 });

    const grouped = {};
    statuses.forEach((s) => {
      const user = s.userId._id.toString();

      if (!grouped[user]) {
        grouped[user] = {
          user: s.userId,
          statuses: [],
          isOwn: user === req.userId,
          hasUnviewed: false
        };
      }

      // ✅ FIX: Convert viewedBy ObjectIds to strings for comparison
      const viewed = s.viewedBy.some(id => id.toString() === req.userId);

      grouped[user].statuses.push({
        id: s._id,
        type: s.type,
        mediaUrl: s.mediaUrl,
        textContent: s.textContent,
        backgroundColor: s.backgroundColor,
        isViewed: viewed,
        viewCount: s.viewedBy.length,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        timeRemaining: Math.max(0, s.expiresAt - now) // ✅ FIX: Ensure non-negative
      });

      if (!viewed && user !== req.userId) {
        grouped[user].hasUnviewed = true;
      }
    });

    // ✅ FIX: Sort grouped statuses (own first, then unviewed, then viewed)
    const result = Object.values(grouped).sort((a, b) => {
      if (a.isOwn) return -1;
      if (b.isOwn) return 1;
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return 0;
    });

    res.json(result);
  } catch (err) {
    console.error("Get all statuses error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// My statuses
// -------------------------
router.get("/my", auth, async (req, res) => {
  try {
    const now = new Date();

    const statuses = await Status.find({
      userId: req.userId,
      expiresAt: { $gt: now }
    }).sort({ createdAt: -1 });

    // ✅ FIX: Format response with timeRemaining
    const formattedStatuses = statuses.map(s => ({
      id: s._id,
      type: s.type,
      mediaUrl: s.mediaUrl,
      textContent: s.textContent,
      backgroundColor: s.backgroundColor,
      viewCount: s.viewedBy.length,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      timeRemaining: Math.max(0, s.expiresAt - now)
    }));

    res.json(formattedStatuses);
  } catch (err) {
    console.error("Get my statuses error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// Mark viewed
// -------------------------
router.post("/:id/view", auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);

    if (!status) return res.status(404).json({ error: "Status not found" });

    if (status.userId.toString() === req.userId)
      return res.json({ message: "Cannot view own status" });

    // ✅ FIX: Convert ObjectIds to strings for comparison
    const alreadyViewed = status.viewedBy.some(id => id.toString() === req.userId);
    
    if (!alreadyViewed) {
      status.viewedBy.push(req.userId);
      await status.save();
    }

    res.json({ message: "Viewed", viewCount: status.viewedBy.length });
  } catch (err) {
    console.error("Mark viewed error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// Delete status
// -------------------------
router.delete("/:id", auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);

    if (!status) return res.status(404).json({ error: "Not found" });

    if (status.userId.toString() !== req.userId)
      return res.status(403).json({ error: "Not allowed" });

    // ✅ FIX: Better cloudinary delete with error handling
    if (status.mediaUrl) {
      try {
        const urlParts = status.mediaUrl.split("/");
        const publicIdWithExt = urlParts[urlParts.length - 1];
        const publicId = publicIdWithExt.split(".")[0];
        
        await cloudinary.uploader.destroy(`status_uploads/${publicId}`, {
          resource_type: status.type === 'video' ? 'video' : 'image'
        });
        console.log(`Deleted media from Cloudinary: ${publicId}`);
      } catch (cloudErr) {
        console.error("Cloudinary delete error:", cloudErr);
        // Continue with database deletion even if cloudinary fails
      }
    }

    await Status.findByIdAndDelete(req.params.id);
    res.json({ message: "Status deleted" });
  } catch (err) {
    console.error("Delete status error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;