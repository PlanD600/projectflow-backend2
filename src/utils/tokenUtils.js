// src/utils/tokenUtils.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '1d'; // Token expires in 1 day

/**
 * Generates a JSON Web Token (JWT) for a user.
 * @param {string} userId - The ID of the user.
 * @param {string} organizationId - The ID of the currently selected organization.
 * @param {string} role - The role of the user in the selected organization.
 * @returns {string} The generated JWT.
 */
const generateToken = (userId, organizationId, role) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return jwt.sign({ userId, organizationId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Verifies a JWT.
 * @param {string} token - The JWT to verify.
 * @returns {object | null} The decoded payload if valid, null otherwise.
 */
const verifyToken = (token) => {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null; // Token is invalid or expired
  }
};

module.exports = {
  generateToken,
  verifyToken,
};