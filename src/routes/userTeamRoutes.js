const express = require('express');
const userTeamController = require('../controllers/userTeamController');
const { authenticateToken, requireOrganizationId, authorizeRoles } = require('../middleware/authMiddleware');
const userValidator = require('../validators/userValidator');
const validateRequest = require('../middleware/validateRequest');

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

// ---------- NEW ROUTES FOR ADMIN EMAIL/PASSWORD MANAGEMENT ----------
// עריכת אימייל ע"י אדמין/סופר-אדמין
router.put(
  '/users/:userId/email',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.updateUserEmail
);

// עריכת סיסמה ע"י אדמין/סופר-אדמין
router.put(
  '/users/:userId/password',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  userTeamController.updateUserPassword
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

router.post(
  '/users/invite',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  validateRequest(userValidator.inviteUserSchema),
  userTeamController.inviteUser
);

// עדכון אימייל:
router.put(
  '/users/:userId/email',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  validateRequest(userValidator.updateUserEmailSchema),
  userTeamController.updateUserEmail
);

// עדכון סיסמה:
router.put(
  '/users/:userId/password',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  validateRequest(userValidator.updateUserPasswordSchema),
  userTeamController.updateUserPassword
);

module.exports = router;