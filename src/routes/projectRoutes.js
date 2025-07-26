// src/routes/projectRoutes.js
const express = require('express');
const projectController = require('../controllers/projectController');
const { authenticateToken, requireOrganizationId, authorizeRoles } = require('../middleware/authMiddleware');
const taskRoutes = require('./taskRoutes'); // ייבוא נתיבי המשימות

const router = express.Router();

// Apply authentication and organization context middleware to all project routes
router.use(authenticateToken);
router.use(requireOrganizationId);

router.get('/', projectController.getProjects);

router.post(
  '/',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  projectController.createProject
);

router.put(
  '/:projectId',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN', 'TEAM_LEADER']),
  projectController.updateProject
);

router.patch(
  '/:projectId',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN', 'TEAM_LEADER']),
  projectController.archiveProject
);

router.delete(
  '/:projectId',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN']),
  projectController.deleteProject
);

// Nested tasks routes
router.use('/:projectId/tasks', taskRoutes); // כל הנתיבים תחת '/api/projects/:projectId/tasks' יופנו ל-taskRoutes

module.exports = router;