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
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  financeController.getSummary
);

router.get(
  '/entries',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  financeController.getEntries
);

router.post(
  '/entries',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  financeController.createEntry
);

// 💡 תיקון: הסרת הקידומת "/finances" מכיוון שהיא כבר קיימת ב-server.js
// הנתיב צריך להיות "/:projectId/reset" כדי שיתורגם ל- /api/finances/:projectId/reset
router.post(
  '/:projectId/reset',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  financeController.resetProjectFinances
);


router.put('/:entryId', authorizeRoles(['ADMIN', 'SUPER_ADMIN']), financeController.updateEntry);
router.delete('/:entryId', authorizeRoles(['ADMIN', 'SUPER_ADMIN']), financeController.deleteEntry);
router.get('/pdf', authorizeRoles(['ADMIN', 'SUPER_ADMIN', 'TEAM_LEADER']), financeController.generateFinancePDF);

module.exports = router;