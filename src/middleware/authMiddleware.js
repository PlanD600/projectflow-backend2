// src/middleware/authMiddleware.js
const { verifyToken } = require('../utils/tokenUtils');

/**
 * Middleware to authenticate JWT token from Authorization header.
 * Attaches user payload (userId, organizationId, role) to req.user.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expects 'Bearer TOKEN'

  if (token == null) {
    return res.status(401).json({ message: 'Authentication token is required.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  // Attach the decoded user payload to the request object
  req.user = decoded; // Contains { userId, organizationId, role }
  next(); // Proceed to the next middleware or route handler
};

/**
 * Middleware to ensure the X-Organization-Id header is present.
 * Should be used on all routes requiring organization context.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
const requireOrganizationId = (req, res, next) => {
  const organizationId = req.headers['x-organization-id'];

  if (!organizationId) {
    return res.status(400).json({ message: 'X-Organization-Id header is required.' });
  }

  // Attach organizationId to req for easy access in controllers
  req.organizationId = organizationId;
  next();
};

/**
 * Middleware to check user roles based on their membership in the current organization.
 * @param {string[]} allowedRoles - An array of roles that are allowed to access the route.
 * @returns {function} Express middleware function.
 */
const authorizeRoles = (allowedRoles) => (req, res, next) => {
  // Assuming req.user is populated by authenticateToken middleware
  if (!req.user || !req.user.role) {
    // This should ideally not happen if authenticateToken runs first, but for safety
    return res.status(403).json({ message: 'User role information missing.' });
  }

  const userRole = req.user.role;

  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ message: 'You do not have permission to perform this action.' });
  }

  next();
};


module.exports = {
  authenticateToken,
  requireOrganizationId,
  authorizeRoles
};