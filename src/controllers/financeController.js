// src/controllers/financeController.js
const financeService = require('../services/financeService');
const { sendErrorResponse } = require('../utils/errorUtils');

const getSummary = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { projectId } = req.query; // Can be 'all' or a specific projectId
    // Summary doesn't use page/limit, so no change needed here.
    // The problem was only in functions using pagination parameters.

    const summary = await financeService.getFinanceSummary(organizationId, projectId);
    res.status(200).json(summary);
  } catch (error) {
    if (error.message.includes('Project not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to retrieve finance summary.', { details: error.message });
  }
};

const getEntries = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { projectId } = req.query; // projectId is handled separately
    // Destructure page, limit, sortBy, sortOrder, and provide default values directly
    // This ensures page and limit are always strings if present, then parsed.
    // If not present, they will be undefined, and the service defaults will kick in.
    const page = req.query.page ? parseInt(req.query.page) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;

    const entries = await financeService.getFinanceEntries(organizationId, {
      projectId,
      page,    // העבר אותם כפי שהם (או undefined)
      limit,   // העבר אותם כפי שהם (או undefined)
      sortBy,
      sortOrder
    });
    res.status(200).json(entries);
  } catch (error) {
    if (error.message.includes('Project not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to retrieve finance entries.', { details: error.message });
  }
};

const createEntry = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { type, amount, description, date, projectId, taskId } = req.body;

    // Basic validation
    if (!type || !amount || !description || !date) {
      return sendErrorResponse(res, 400, 'Type, amount, description, and date are required.');
    }
    if (!['INCOME', 'EXPENSE'].includes(type)) {
      return sendErrorResponse(res, 400, 'Type must be INCOME or EXPENSE.');
    }
    if (typeof amount !== 'number' || amount <= 0) {
      return sendErrorResponse(res, 400, 'Amount must be a positive number.');
    }

    const newEntry = await financeService.createFinanceEntry(organizationId, {
      type, amount, description, date, projectId, taskId
    });
    res.status(201).json(newEntry);
  } catch (error) {
    if (error.message.includes('Project not found') || error.message.includes('Task not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to create finance entry.', { details: error.message });
  }
};

module.exports = {
  getSummary,
  getEntries,
  createEntry,
};