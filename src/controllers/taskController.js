// src/controllers/taskController.js
const taskService = require('../services/taskService');
const { sendErrorResponse } = require('../utils/errorUtils');

const getProjectTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const organizationId = req.organizationId;
    const { page, limit, sortBy, sortOrder } = req.query;

    const tasks = await taskService.getTasksForProject(projectId, organizationId, { page: parseInt(page), limit: parseInt(limit), sortBy, sortOrder });
    res.status(200).json(tasks);
  } catch (error) {
    if (error.message.includes('Project not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to retrieve tasks.', { details: error.message });
  }
};

const createTask = async (req, res) => {
  try {
    const { projectId } = req.params;
    const organizationId = req.organizationId;
    const { title, description, assigneesIds, startDate, endDate, expense, color } = req.body;

    // Enforce startDate and endDate here as well, along with title and color
    if (!title || !color || !startDate || !endDate) {
        return sendErrorResponse(res, 400, 'Title, color, start date, and end date are required for task creation.');
    }

    const newTask = await taskService.createTask(projectId, organizationId, {
      title, description, assigneesIds, startDate, endDate, expense, color
    });
    res.status(201).json(newTask);
  } catch (error) {
    if (error.message.includes('Project not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    if (error.message.includes('invalid or not members') || error.message.includes('Start date and End date are required')) { // Added new error message
        return sendErrorResponse(res, 400, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to create task.', { details: error.message });
  }
};

const updateTask = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const organizationId = req.organizationId;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role; // Role from JWT

    const updateData = req.body;

    // Filter allowed updates based on the spec, including 'displayOrder'
    const allowedFields = ['title', 'description', 'assigneesIds', 'status', 'startDate', 'endDate', 'expense', 'color', 'displayOrder'];
    const filteredUpdateData = Object.keys(updateData)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
          obj[key] = updateData[key];
          return obj;
      }, {});

    if (Object.keys(filteredUpdateData).length === 0) {
        return sendErrorResponse(res, 400, 'No valid fields provided for update.');
    }

    const updatedTask = await taskService.updateTask(taskId, projectId, organizationId, currentUserId, currentUserRole, filteredUpdateData);
    res.status(200).json(updatedTask);
  } catch (error) {
    if (error.message.includes('Project not found') || error.message.includes('Task not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    if (error.message.includes('permission') || error.message.includes('Assignees can only update')) {
        return sendErrorResponse(res, 403, error.message); // Forbidden
    }
    sendErrorResponse(res, 500, 'Failed to update task.', { details: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const organizationId = req.organizationId;
    // Note: The permission for deleting is handled in the route using authorizeRoles
    await taskService.deleteTask(taskId, projectId, organizationId);
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('Project not found') || error.message.includes('Task not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to delete task.', { details: error.message });
  }
};

const addCommentToTask = async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const organizationId = req.organizationId;
    const authorId = req.user.userId; // User ID from authenticated token
    const { content } = req.body;

    if (!content) {
      return sendErrorResponse(res, 400, 'Comment content is required.');
    }

    const newComment = await taskService.addCommentToTask(taskId, projectId, organizationId, authorId, content);
    res.status(201).json(newComment);
  } catch (error) {
    if (error.message.includes('Project not found') || error.message.includes('Task not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to add comment.', { details: error.message });
  }
};

/**
 * Handles reordering of tasks within a project.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
const reorderProjectTasks = async (req, res) => {
    try {
        const { projectId } = req.params;
        const organizationId = req.organizationId;
        const { taskIdsInOrder } = req.body; // Expects an array of task IDs in the new desired order

        if (!Array.isArray(taskIdsInOrder) || taskIdsInOrder.length === 0) {
            return sendErrorResponse(res, 400, 'taskIdsInOrder array is required and must not be empty.');
        }

        await taskService.reorderTasks(projectId, organizationId, taskIdsInOrder);
        res.status(200).json({ message: 'Tasks reordered successfully.' });
    } catch (error) {
        if (error.message.includes('Project not found') || error.message.includes('task IDs are invalid')) {
            return sendErrorResponse(res, 404, error.message);
        }
        sendErrorResponse(res, 500, 'Failed to reorder tasks.', { details: error.message });
    }
};


module.exports = {
  getProjectTasks,
  createTask,
  updateTask,
  deleteTask,
  addCommentToTask,
  reorderProjectTasks, // ייצוא הפונקציה החדשה
};