// src/routes/authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware'); // נבנה אותו בסעיף הבא

const router = express.Router();

router.post('/register', authController.register);
router.post('/otp/send', authController.sendOtp);
router.post('/otp/verify', authController.verifyOtp);

// Private routes - require authentication
router.get('/me/memberships', authMiddleware.authenticateToken, authController.getMyMemberships);
router.get('/me', authMiddleware.authenticateToken, authController.getMyProfile);
router.put('/me', authMiddleware.authenticateToken, authController.updateMyProfile);

module.exports = router;