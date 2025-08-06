const authService = require('../services/authService');

// Helper for sending standardized error responses
const sendErrorResponse = (res, statusCode, message, errors = null) => {
  res.status(statusCode).json({ message, errors });
};

// הרשמת משתמש חדש עם אימייל וסיסמה
const register = async (req, res) => {
  try {
    const { fullName, email, password, organizationName } = req.body;
    if (!fullName || !email || !password || !organizationName) {
      return sendErrorResponse(res, 400, 'Full name, email, password and organization name are required for registration.');
    }
    const result = await authService.registerUserWithEmail(fullName, email, password, organizationName);
    res.status(200).json(result); // Using 200 OK for success message
  } catch (error) {
    if (error.message.includes('User with this email already exists')) {
      return sendErrorResponse(res, 409, error.message); // 409 Conflict
    }
    if (error.message.includes('Organization with this name already exists')) {
      return sendErrorResponse(res, 409, error.message); // 409 Conflict
    }
    sendErrorResponse(res, 500, 'Registration failed.', { details: error.message });
  }
};

// התחברות עם אימייל וסיסמה
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return sendErrorResponse(res, 400, 'Email and password are required for login.');
    }
    const result = await authService.loginWithEmail(email, password);
    res.status(200).json(result);
  } catch (error) {
    if (error.message.includes('Invalid email or password') || error.message.includes('User not found')) {
      return sendErrorResponse(res, 401, error.message); // Unauthorized
    }
    sendErrorResponse(res, 500, 'Login failed.', { details: error.message });
  }
};

const getMyMemberships = async (req, res) => {
  try {
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

const sendOtp = async (req, res) => {
  // TODO: לממש לפי הצורך שלך
  res.status(501).json({ message: 'Not implemented' });
};

const verifyOtp = async (req, res) => {
  // TODO: לממש לפי הצורך שלך
  res.status(501).json({ message: 'Not implemented' });
};

module.exports = {
  register,
  login,
  getMyMemberships,
  getMyProfile,
  updateMyProfile,
  uploadProfilePicture,
  sendOtp,
  verifyOtp
};