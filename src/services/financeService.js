// src/services/financeService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Retrieves finance summary (total income, expenses, balance, and total project budget)
 * for an organization, optionally filtered by project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} [projectId] - Optional project ID to filter by. 'all' means no project filter.
 * @returns {Promise<object>} FinanceSummary object.
 */
const getFinanceSummary = async (organizationId, projectId) => {
    const whereClause = {
        organizationId: organizationId,
    };

    if (projectId && projectId !== 'all') {
        whereClause.projectId = projectId;
        const projectExists = await prisma.project.count({
            where: { id: projectId, organizationId: organizationId }
        });
        if (projectExists === 0) {
            throw new Error('Project not found in this organization.');
        }
    }

    const entries = await prisma.financeEntry.findMany({
        where: whereClause,
    });

    const totalIncome = entries
        .filter(entry => entry.type === 'INCOME')
        .reduce((sum, entry) => sum + entry.amount, 0);

    const totalExpenses = entries
        .filter(entry => entry.type === 'EXPENSE')
        .reduce((sum, entry) => sum + entry.amount, 0);

    const balance = totalIncome - totalExpenses;

    // **חדש: חישוב סך תקציבי הפרויקטים**
    let projectBudgetWhereClause = { organizationId: organizationId };
    if (projectId && projectId !== 'all') {
        projectBudgetWhereClause.id = projectId; // אם מסנן לפי פרויקט, סכם רק את תקציבו
    }

    const projectBudgetsAggregate = await prisma.project.aggregate({
        _sum: {
            budget: true,
        },
        where: {
            ...projectBudgetWhereClause,
            isArchived: false, // סכם רק פרויקטים שאינם בארכיון
        },
    });

    const totalProjectBudget = projectBudgetsAggregate._sum.budget || 0;

    return {
        totalIncome,
        totalExpenses,
        balance,
        totalProjectBudget, // **הוספה: החזרת תקציב הפרויקטים**
    };
};

/**
 * Retrieves a list of all financial entries for an organization,
 * optionally filtered by project, with pagination and sorting.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} options - Pagination and sorting options.
 * @param {string} [options.projectId] - Optional project ID to filter by.
 * @param {number} options.page - Current page number.
 * @param {number} options.limit - Number of items per page.
 * @param {string} options.sortBy - Field to sort by.
 * @param {string} options.sortOrder - Sort order ('asc' or 'desc').
 * @returns {Promise<object>} Paginated list of finance entries.
 */
const getFinanceEntries = async (organizationId, { projectId, page = 1, limit = 25, sortBy = 'date', sortOrder = 'desc' }) => {
    const offset = (page - 1) * limit;

    const whereClause = {
        organizationId: organizationId,
    };

    if (projectId && projectId !== 'all') {
        whereClause.projectId = projectId;
        const projectExists = await prisma.project.count({
            where: { id: projectId, organizationId: organizationId }
        });
        if (projectExists === 0) {
            throw new Error('Project not found in this organization.');
        }
    }

    const entries = await prisma.financeEntry.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: {
            [sortBy]: sortOrder,
        },
        include: {
            project: {
                select: { title: true }
            }
        }
    });

    const formattedEntries = entries.map(entry => ({
        ...entry,
        projectTitle: entry.project ? entry.project.title : undefined,
        project: undefined
    }));

    const totalEntries = await prisma.financeEntry.count({
        where: whereClause,
    });

    const totalPages = Math.ceil(totalEntries / limit);

    return {
        data: formattedEntries,
        totalItems: totalEntries,
        totalPages,
        currentPage: page,
    };
};

/**
 * Adds a new income or expense entry.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} entryData - Data for the new finance entry.
 * @param {'INCOME' | 'EXPENSE'} entryData.type
 * @param {number} entryData.amount
 * @param {string} entryData.description
 * @param {string} entryData.date - YYYY-MM-DD
 * @param {string} [entryData.projectId]
 * @param {string} [entryData.taskId]
 * @returns {Promise<object>} The newly created finance entry.
 */
const createFinanceEntry = async (organizationId, { type, amount, description, date, projectId, taskId }) => {
    if (projectId) {
        const project = await prisma.project.findUnique({
            where: { id: projectId, organizationId: organizationId },
            select: { id: true }
        });
        if (!project) {
            throw new Error('Project not found or does not belong to this organization.');
        }
    }

    if (taskId) {
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                project: {
                    select: { id: true, organizationId: true }
                }
            }
        });
        if (!task || task.project.id !== projectId || task.project.organizationId !== organizationId) {
            throw new Error('Task not found or does not belong to the specified project/organization.');
        }
    }

    const newEntry = await prisma.financeEntry.create({
        data: {
            organizationId,
            type,
            amount,
            description,
            date: new Date(date),
            projectId,
            taskId,
        },
        include: {
            project: {
                select: { title: true }
            }
        }
    });

    const formattedEntry = {
        ...newEntry,
        projectTitle: newEntry.project ? newEntry.project.title : undefined,
        project: undefined
    };

    return formattedEntry;
};

module.exports = {
    getFinanceSummary,
    getFinanceEntries,
    createFinanceEntry,
};