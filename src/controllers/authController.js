// src/controllers/authController.js
const authService = require('../services/authService');

// Helper for sending standardized error responses
const sendErrorResponse = (res, statusCode, message, errors = null) => {
  res.status(statusCode).json({ message, errors });
};

const register = async (req, res) => {
  try {
    const { fullName, phone, organizationName } = req.body;
    if (!fullName || !phone || !organizationName) {
      return sendErrorResponse(res, 400, 'Full name, phone, and organization name are required for registration.');
    }
    const result = await authService.registerUser(fullName, phone, organizationName);
    res.status(200).json(result); // Using 200 OK for success message, as specified by client spec
  } catch (error) {
    if (error.message.includes('User with this phone number already exists')) {
      return sendErrorResponse(res, 409, error.message); // 409 Conflict
    }
    if (error.message.includes('Organization with this name already exists')) {
        return sendErrorResponse(res, 409, error.message); // 409 Conflict
    }
    sendErrorResponse(res, 500, 'Registration failed.', { details: error.message });
  }
};

const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return sendErrorResponse(res, 400, 'Phone number is required.');
    }
    const result = await authService.sendOtpForLogin(phone);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.includes('User not found')) {
      return sendErrorResponse(res, 404, error.message); // 404 Not Found
    }
    sendErrorResponse(res, 500, 'Failed to send OTP.', { details: error.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) {
      return sendErrorResponse(res, 400, 'Phone number and OTP code are required.');
    }
    const result = await authService.verifyOtpAndLogin(phone, otpCode);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.includes('User not found') || error.message.includes('OTP expired or not sent') || error.message.includes('Invalid OTP code') || error.message.includes('User has no active memberships')) {
      return sendErrorResponse(res, 401, error.message); // Unauthorized
    }
    sendErrorResponse(res, 500, 'OTP verification failed.', { details: error.message });
  }
};

const getMyMemberships = async (req, res) => {
    try {
        // userId comes from the authentication middleware (next step)
        const userId = req.user.userId;
        const memberships = await authService.getMyMemberships(userId);
        res.status(200).json(memberships);
    } catch (error) {
        sendErrorResponse(res, 500, 'Failed to fetch memberships.', { details: error.message });
    }
};

const getMyProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await authService.getMyProfile(userId);
        res.status(200).json(user);
    } catch (error) {
        if (error.message.includes('User profile not found')) {
            return sendErrorResponse(res, 404, error.message);
        }
        sendErrorResponse(res, 500, 'Failed to fetch user profile.', { details: error.message });
    }
};

const updateMyProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const updates = req.body;
        // Basic validation: ensure only allowed fields are updated
        const allowedUpdates = ['fullName', 'jobTitle', 'email', 'profilePictureUrl'];
        const filteredUpdates = Object.keys(updates)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
                obj[key] = updates[key];
                return obj;
            }, {});

        if (Object.keys(filteredUpdates).length === 0) {
            return sendErrorResponse(res, 400, 'No valid fields provided for update.');
        }

        const updatedUser = await authService.updateMyProfile(userId, filteredUpdates);
        res.status(200).json(updatedUser);
    } catch (error) {
        sendErrorResponse(res, 500, 'Failed to update user profile.', { details: error.message });
    }
};

const uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user.userId;
    const file = req.file;

    if (!file) {
      return sendErrorResponse(res, 400, 'No file uploaded.');
    }

    const updatedUser = await authService.updateProfilePicture(userId, file.path);
    res.status(200).json(updatedUser);
  } catch (error) {
    sendErrorResponse(res, 500, 'Failed to upload profile picture.', { details: error.message });
  }
};

module.exports = {
  register,
  sendOtp,
  verifyOtp,
  getMyMemberships,
  getMyProfile,
  updateMyProfile,
  uploadProfilePicture,
};