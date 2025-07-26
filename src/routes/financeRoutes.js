// src/routes/financeRoutes.js
const express = require('express');
const financeController = require('../controllers/financeController');
const { authenticateToken, requireOrganizationId, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply authentication and organization context middleware to all finance routes
router.use(authenticateToken);
router.use(requireOrganizationId);

router.get(
  '/summary',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']), // Requires ADMIN or SUPER_ADMIN role
  financeController.getSummary
);

router.get(
  '/entries',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']), // Requires ADMIN or SUPER_ADMIN role
  financeController.getEntries
);

router.post(
  '/entries',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']), // Requires ADMIN or SUPER_ADMIN role
  financeController.createEntry
);

module.exports = router;