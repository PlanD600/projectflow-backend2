// src/controllers/financeController.js
const financeService = require('../services/financeService');
const { sendErrorResponse } = require('../utils/errorUtils');

// (הפונקציות getSummary, getEntries, ו-createEntry שלך, כפי שכתבת אותן)
const getSummary = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { projectId } = req.query;
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
    const { projectId } = req.query;
    const page = req.query.page ? parseInt(req.query.page) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit) : undefined;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;

    const entries = await financeService.getFinanceEntries(organizationId, {
      projectId,
      page,
      limit,
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
    const { type, amount, description, date, projectId, taskId, vatPercentage, deductions, status, notes } = req.body;

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
      type, amount, description, date, projectId, taskId, vatPercentage, deductions, status, notes
    });
    res.status(201).json(newEntry);
  } catch (error) {
    if (error.message.includes('Project not found') || error.message.includes('Task not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to create finance entry.', { details: error.message });
  }
};

// 💡 פונקציה חדשה לעדכון רשומת כספים
const updateEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const organizationId = req.organizationId;
    const updateData = req.body;

    const updatedEntry = await financeService.updateFinanceEntry(entryId, organizationId, updateData);
    res.status(200).json(updatedEntry);
  } catch (error) {
    if (error.message.includes('entry not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to update finance entry.', { details: error.message });
  }
};

// 💡 פונקציה חדשה למחיקת רשומת כספים
const deleteEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const organizationId = req.organizationId;

    await financeService.deleteFinanceEntry(entryId, organizationId);
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('entry not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to delete finance entry.', { details: error.message });
  }
};

// 💡 פונקציה חדשה לאיפוס כספים של פרויקט (כפי שבנינו קודם)
const resetProjectFinances = async (req, res) => {
  try {
    const { projectId } = req.params;
    const organizationId = req.organizationId;
    await financeService.resetProjectFinances(organizationId, projectId);
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('Project not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to reset project finances.', { details: error.message });
  }
};

// 💡 פונקציה חדשה לשחזור כספים של פרויקט
const restoreProjectFinances = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { entryId } = req.body;
    const organizationId = req.organizationId;

    await financeService.restoreProjectFinances(organizationId, projectId, entryId);
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to restore project finances.', { details: error.message });
  }
};

// 💡 פונקציה חדשה ליצירת PDF
const generateFinancePDF = async (req, res) => {
    try {
        const organizationId = req.organizationId;
        const { projectId } = req.query;
        
        // קריאה לפונקציית השירות החדשה
        const pdfBuffer = await financeService.generateFinancePDF(organizationId, projectId);
        
        // הגדרת כותרות התגובה כדי שהדפדפן ידע שמדובר בקובץ PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="finance-report-${new Date().toISOString()}.pdf"`);
        
        // שליחת הקובץ
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Failed to generate finance PDF:', error);
        sendErrorResponse(res, 500, 'Failed to generate finance PDF.', { details: error.message });
    }
};



module.exports = {
  getSummary,
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  resetProjectFinances,
  restoreProjectFinances,
  generateFinancePDF,
};