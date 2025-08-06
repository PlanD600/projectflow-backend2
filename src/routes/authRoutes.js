const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');

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

// ראוטים ציבוריים (ללא אימות)
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/otp/send', authController.sendOtp);          // ודא שקיים ב-controller
router.post('/otp/verify', authController.verifyOtp);      // ודא שקיים ב-controller

// ראוטים פרטיים (דורשים אימות)
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