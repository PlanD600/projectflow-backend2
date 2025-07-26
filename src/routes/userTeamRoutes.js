// src/routes/userTeamRoutes.js
const express = require('express');
const userTeamController = require('../controllers/userTeamController');
const { authenticateToken, requireOrganizationId, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply authentication and organization context middleware to all routes
router.use(authenticateToken);
router.use(requireOrganizationId);

// User Routes
router.get(
  '/users',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.getUsers
);

router.post(
  '/users/invite',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.inviteUser
);

// Changed path to /users/:userId/membership for role updates
router.put(
  '/users/:userId/membership', // New path for role updates
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.updateUserRole // Renamed controller function
);

// Changed path to /users/:userId/membership for removing membership
router.delete(
  '/users/:userId/membership', // New path for removing membership
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.removeUser
);


// Team Routes (No changes here)
router.get(
  '/teams',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.getTeams
);

router.post(
  '/teams',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.createTeam
);

router.put(
  '/teams/:teamId',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.updateTeam
);

router.delete(
  '/teams/:teamId',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.deleteTeam
);

module.exports = router;