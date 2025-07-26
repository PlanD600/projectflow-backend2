// src/routes/taskRoutes.js
const express = require('express');
const taskController = require('../controllers/taskController');
const { authorizeRoles } = require('../middleware/authMiddleware'); // authMiddleware כבר מופעל ברמת הפרויקט

const router = express.Router({ mergeParams: true }); // mergeParams allows access to projectId from parent route

router.get('/', taskController.getProjectTasks); // EMPLOYEE and up

router.post(
  '/',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN', 'TEAM_LEADER']),
  taskController.createTask
);

router.put(
  '/:taskId',
  // Permissions are handled inside the service (assignees vs. managers)
  // We apply a general authorization that allows anyone who might potentially update a task.
  // The fine-grained logic is in taskService.updateTask.
  authorizeRoles(['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN', 'TEAM_LEADER']),
  taskController.updateTask
);

router.delete(
  '/:taskId',
  authorizeRoles(['ADMIN', 'SUPER_ADMIN', 'TEAM_LEADER']),
  taskController.deleteTask
);

router.post(
  '/:taskId/comments',
  authorizeRoles(['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN', 'TEAM_LEADER']), // Any project member can comment
  taskController.addCommentToTask
);

module.exports = router;