// src/routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware'); // נבנה אותו בסעיף הבא
const multer = require('multer'); // ייבוא חדש

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // התיקייה שבה יישמרו הקבצים המועלים
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // יצירת שם קובץ ייחודי על בסיס ה-userId וחותמת זמן
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = file.originalname.split('.').pop();
    cb(null, `${req.user.userId}-${uniqueSuffix}.${fileExtension}`);
  }
});
const upload = multer({ storage: storage });

const router = express.Router();


router.post('/register', authController.register);
router.post('/otp/send', authController.sendOtp);
router.post('/otp/verify', authController.verifyOtp);

// Private routes - require authentication
router.get('/me/memberships', authMiddleware.authenticateToken, authController.getMyMemberships);
router.get('/me', authMiddleware.authenticateToken, authController.getMyProfile);
router.put('/me', authMiddleware.authenticateToken, authController.updateMyProfile);

router.post(
  '/me/profile-picture',
  authMiddleware.authenticateToken,
  upload.single('profilePicture'), // middleware לטיפול בקובץ בודד
  authController.uploadProfilePicture
);

module.exports = router;