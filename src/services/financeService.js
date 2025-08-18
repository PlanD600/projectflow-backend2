// src/services/financeService.js
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const getBidiString = require('bidi-js');
const PDFDocumentWithTables = require('pdfkit-table');

const prisma = new PrismaClient();

// 💡 פונקציית RTL משופרת ומוגנת
const rtl = (text) => {
    // 💡 לוודא שהטקסט הוא מחרוזת לפני עיבוד, אחרת להחזיר מחרוזת ריקה.
    const safeText = text ? String(text) : '';
    return getBidiString(safeText, { dir: 'rtl', unicode: true });
};

// 💡 פונקציות עזר להבאת נתונים מהמסד - נשארות כפי שהן
const getOrganizationName = async (organizationId) => {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true }
    });
    return org ? org.name : 'שם ארגון לא ידוע';
};

const getProjectName = async (projectId) => {
    if (!projectId || projectId === 'all') return 'כללי';
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { title: true }
    });
    return project ? project.title : 'שם פרויקט לא ידוע';
};


const getDetailedFinanceEntries = async (organizationId, projectId) => {
    const findOptions = {
        where: {
            organizationId: organizationId
        },
        include: {
            project: {
                select: {
                    title: true
                }
            }
        },
        orderBy: {
            date: 'asc'
        }
    };

    if (projectId && projectId !== 'all') {
        findOptions.where.projectId = projectId;
    }

    const entries = await prisma.financeEntry.findMany(findOptions);

    const formattedEntries = entries.map(entry => ({
        date: entry.date,
        description: entry.description,
        projectName: entry.project?.title || 'כללי',
        income: entry.type === 'INCOME' ? entry.amount : 0,
        expenses: entry.type === 'EXPENSE' ? entry.amount : 0,
        vatPercentage: entry.vatPercentage,
        deductions: entry.deductions,
        total: entry.netAmount
    }));

    return formattedEntries;
};
// 💡 פונקציית עזר לחישוב סכום נטו
const calculateNetAmount = (amount, vatPercentage, deductions) => {
    const vatAmount = amount * (vatPercentage / 100 || 0);
    const totalDeductions = (deductions || 0) + vatAmount;
    return amount - totalDeductions;
};


/**
 * Retrieves finance summary (total income, expenses, balance, and total project budget)
 * for an organization, optionally filtered by project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} [projectId] - Optional project ID to filter by. 'all' means no project filter.
 * @returns {Promise<object>} FinanceSummary object.
 */
const getFinanceSummary = async (organizationId, userRole, projectId) => {
    // 💡 תיקון: אם המשתמש אינו אדמין או סופר אדמין, זרוק שגיאת הרשאה
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
        throw new Error('You do not have permission to view financial data.');
    }
    
    // תנאי סינון עבור financeEntry
    const financeEntryWhereClause = {
        organizationId: organizationId,
    };
    if (projectId && projectId !== 'all') {
        financeEntryWhereClause.projectId = projectId;
    }

    // חישוב סך ההכנסות וההוצאות בפועל (עכשיו על בסיס סכום הנטו)
    const incomeAggregate = await prisma.financeEntry.aggregate({
        _sum: { netAmount: true },
        where: { ...financeEntryWhereClause, type: 'INCOME' },
    });

    const expenseAggregate = await prisma.financeEntry.aggregate({
        _sum: { netAmount: true },
        where: { ...financeEntryWhereClause, type: 'EXPENSE' },
    });

    const totalIncomeAmount = incomeAggregate._sum.netAmount || 0;
    const totalExpensesAmount = expenseAggregate._sum.netAmount || 0;
    const balance = totalIncomeAmount - totalExpensesAmount;

    // חישוב סך תקציבי הפרויקטים ממודל MonthlyBudget
    const monthlyBudgetWhereClause = {};
    if (projectId && projectId !== 'all') {
        monthlyBudgetWhereClause.projectId = projectId;
    } else {
        monthlyBudgetWhereClause.organizationId = organizationId;
    }

    const projectBudgetsAggregate = await prisma.monthlyBudget.aggregate({
        _sum: {
            incomeBudget: true,
            expenseBudget: true,
        },
        where: monthlyBudgetWhereClause,
    });

    const totalIncomeBudget = projectBudgetsAggregate._sum.incomeBudget || 0;
    const totalExpenseBudget = projectBudgetsAggregate._sum.expenseBudget || 0;
    const totalProjectBudget = totalIncomeBudget - totalExpenseBudget;

    return {
        totalIncome: totalIncomeAmount,
        totalExpenses: totalExpensesAmount,
        balance,
        totalProjectBudget,
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
const getFinanceEntries = async (organizationId, userRole, { projectId, page = 1, limit = 25, sortBy = 'date', sortOrder = 'desc' }) => {
    // 💡 תיקון: אם המשתמש אינו אדמין או סופר אדמין, זרוק שגיאת הרשאה
    if (userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
        throw new Error('You do not have permission to view financial data.');
    }

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
 * @param {number} [entryData.vatPercentage]
 * @param {number} [entryData.deductions]
 * @param {string} [entryData.status]
 * @param {string} [entryData.notes]
 * @returns {Promise<object>} The newly created finance entry.
 */
const createFinanceEntry = async (organizationId, { type, amount, description, date, projectId, taskId, vatPercentage, deductions, status, notes }) => {
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

    // 💡 חישוב סכום נטו
    const netAmount = calculateNetAmount(amount, vatPercentage, deductions);

    const newEntry = await prisma.financeEntry.create({
        data: {
            organizationId,
            type,
            amount,
            description,
            date: new Date(date),
            projectId,
            taskId,
            vatPercentage,
            deductions,
            status,
            notes,
            netAmount, // הוספת הסכום המחושב
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

// 💡 פונקציות חדשות
/**
 * Updates an existing finance entry.
 * @param {string} entryId - The ID of the entry to update.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} updateData - Data to update the finance entry.
 * @returns {Promise<object>} The updated finance entry.
 */
const updateFinanceEntry = async (entryId, organizationId, updateData) => {
    const existingEntry = await prisma.financeEntry.findUnique({
        where: { id: entryId, organizationId: organizationId },
        select: { id: true, projectId: true, amount: true, vatPercentage: true, deductions: true }
    });
    if (!existingEntry) {
        throw new Error('Finance entry not found or does not belong to this organization.');
    }

    if (updateData.projectId && updateData.projectId !== existingEntry.projectId) {
        throw new Error('Cannot change project association of a finance entry.');
    }

    // יצירת אובייקט לעדכון
    const dataToUpdate = { ...updateData };

    // בדיקה האם צריך לחשב מחדש את הסכום נטו
    const shouldRecalculateNet =
        dataToUpdate.amount !== undefined ||
        dataToUpdate.vatPercentage !== undefined ||
        dataToUpdate.deductions !== undefined;

    if (shouldRecalculateNet) {
        // שימוש בנתונים הקיימים אם לא נשלחו נתונים חדשים
        const finalAmount = dataToUpdate.amount !== undefined ? dataToUpdate.amount : existingEntry.amount;
        const finalVat = dataToUpdate.vatPercentage !== undefined ? dataToUpdate.vatPercentage : existingEntry.vatPercentage;
        const finalDeductions = dataToUpdate.deductions !== undefined ? dataToUpdate.deductions : existingEntry.deductions;

        // חישוב נטו ועדכון הנתונים
        dataToUpdate.netAmount = calculateNetAmount(finalAmount, finalVat, finalDeductions);
    }

    // עדכון הרשומה
    const updatedEntry = await prisma.financeEntry.update({
        where: { id: entryId },
        data: {
            ...dataToUpdate,
            date: dataToUpdate.date ? new Date(dataToUpdate.date) : undefined,
        },
        include: {
            project: {
                select: { title: true }
            }
        }
    });

    const formattedEntry = {
        ...updatedEntry,
        projectTitle: updatedEntry.project ? updatedEntry.project.title : undefined,
        project: undefined
    };

    return formattedEntry;
};

/**
 * Deletes a finance entry.
 * @param {string} entryId - The ID of the entry to delete.
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<void>}
 */
const deleteFinanceEntry = async (entryId, organizationId) => {
    const existingEntry = await prisma.financeEntry.findUnique({
        where: { id: entryId, organizationId: organizationId },
    });
    if (!existingEntry) {
        throw new Error('Finance entry not found or does not belong to this organization.');
    }

    await prisma.financeEntry.delete({
        where: { id: entryId },
    });
};

/**
 * Resets all monthly budgets and finance entries for a specific project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} projectId - The ID of the project to reset.
 * @returns {Promise<void>}
 */
const resetProjectFinances = async (organizationId, projectId) => {
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId: organizationId },
    });
    if (!project) {
        throw new Error('Project not found or does not belong to this organization.');
    }

    await prisma.$transaction([
        prisma.monthlyBudget.deleteMany({ where: { projectId: projectId } }),
        prisma.financeEntry.deleteMany({ where: { projectId: projectId } }),
    ]);
};



/**
 * Restores project finances by creating a new monthly budget from a finance entry.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} projectId - The ID of the project.
 * @param {string} entryId - The ID of the finance entry to use for restoration.
 * @returns {Promise<object>} The restored monthly budget.
 */
const restoreProjectFinances = async (organizationId, projectId, entryId) => {
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId: organizationId },
    });
    if (!project) {
        throw new Error('Project not found or does not belong to this organization.');
    }

    const entry = await prisma.financeEntry.findUnique({
        where: { id: entryId, organizationId: organizationId },
    });
    if (!entry) {
        throw new Error('Finance entry not found or does not belong to this organization.');
    }

    // מוחק את התקציבים הקיימים ויוצר חדש על בסיס הרשומה
    await prisma.monthlyBudget.deleteMany({ where: { projectId: projectId } });

    if (entry.type === 'INCOME') {
        await prisma.monthlyBudget.create({
            data: {
                projectId,
                organizationId,
                year: entry.date.getFullYear(),
                month: entry.date.getMonth() + 1,
                incomeBudget: entry.netAmount,
                expenseBudget: 0,
            }
        });
    } else if (entry.type === 'EXPENSE') {
        await prisma.monthlyBudget.create({
            data: {
                projectId,
                organizationId,
                year: entry.date.getFullYear(),
                month: entry.date.getMonth() + 1,
                incomeBudget: 0,
                expenseBudget: entry.netAmount,
            }
        });
    }

    return await prisma.monthlyBudget.findMany({ where: { projectId: projectId } });
};





// פונקציה לייצוא PDF - נגדיר אותה כפונקציית דמה
const generateFinancePDF = async (organizationId, projectId) => {
    try {
        // 1. איסוף והכנת הנתונים
        const summary = await getFinanceSummary(organizationId, projectId);
        const organizationName = await getOrganizationName(organizationId);
        const projectName = await getProjectName(projectId);
        const tableData = await getDetailedFinanceEntries(organizationId, projectId);

        // 2. הגדרת הפונט העברי
        const fontPath = path.join(__dirname, '../fonts/almoni-neue-black-aaa.otf');
        if (!fs.existsSync(fontPath)) {
            console.error(`Error: Font file not found at ${fontPath}`);
            throw new Error('Font file is missing. Please place "almoni-neue-black-aaa.otf" in the src/fonts directory.');
        }

        // 3. יצירת מסמך PDF חדש
        const doc = new PDFDocumentWithTables({
            size: 'A4',
            autoFirstPage: false,
            font: fontPath,
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const docPromise = new Promise((resolve, reject) => {
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });
            doc.on('error', reject);

            doc.addPage();

            // 4. הוספת תוכן למסמך
            // כותרות כלליות
            doc.fontSize(18).text(rtl('דוח כספים'), { align: 'right' });
            doc.moveDown();
            doc.fontSize(12).text(rtl(`תאריך: ${new Date().toLocaleDateString('he-IL')}`), { align: 'right' });
            doc.text(rtl(`ארגון: ${organizationName}`), { align: 'right' });
            if (projectId && projectId !== 'all') {
                doc.text(rtl(`פרויקט: ${projectName}`), { align: 'right' });
            }
            doc.moveDown(2);

            // סיכום כספים
            doc.fontSize(14).text(rtl('סיכום כספים'), { align: 'right', underline: true });
            doc.moveDown(0.5);

            // 💡 טבלת הסיכום החדשה והמתוקנת
            const summaryTable = {
                headers: [
                    { label: rtl('פרט'), property: 'key', width: 150, align: 'right' },
                    { label: rtl('ערך'), property: 'value', width: 150, align: 'right' }
                ],
                datas: [
                    { key: rtl('סך הכנסות'), value: rtl((summary.totalIncome ?? 0).toFixed(2)) },
                    { key: rtl('סך הוצאות'), value: rtl((summary.totalExpenses ?? 0).toFixed(2)) },
                    { key: rtl('מאזן'), value: rtl((summary.balance ?? 0).toFixed(2)) },
                    { key: rtl('תקציב פרויקט'), value: rtl((summary.totalProjectBudget ?? 0).toFixed(2)) },
                ]
            };
            
            // 💡 בדיקה חדשה: לוודא שהכותרות אינן ריקות
            const filteredSummaryHeaders = summaryTable.headers.filter(h => h && h.label);
            summaryTable.headers = filteredSummaryHeaders;

            doc.table(summaryTable, {
                prepareHeader: () => doc.font(fontPath).fontSize(10),
                prepareRow: () => doc.font(fontPath).fontSize(10),
                align: 'right'
            });

            doc.moveDown(2);

            // פירוט רשומות
            doc.fontSize(14).text(rtl('פירוט רשומות'), { align: 'right', underline: true });
            doc.moveDown(0.5);

            // 💡 טבלת הרשומות המתוקנת עם סדר כותרות הפוך
            const dataTable = {
                headers: [
                    { label: rtl('תאריך'), property: 'date', width: 60, align: 'right', renderer: (value) => rtl(new Date(value).toLocaleDateString('he-IL') || '') },
                    { label: rtl('תיאור'), property: 'description', width: 100, align: 'right', renderer: (value) => rtl(value || '') },
                    { label: rtl('פרויקט'), property: 'projectName', width: 80, align: 'right', renderer: (value) => rtl(value || '') },
                    { label: rtl('הכנסות'), property: 'income', width: 60, align: 'right', renderer: (value) => value > 0 ? rtl((value ?? 0).toFixed(2)) : '' },
                    { label: rtl('הוצאות'), property: 'expenses', width: 60, align: 'right', renderer: (value) => value > 0 ? rtl((value ?? 0).toFixed(2)) : '' },
                    { label: rtl('מע"מ'), property: 'vatPercentage', width: 40, align: 'right', renderer: (value) => rtl(value ? `${value}%` : '0%') },
                    { label: rtl('ניכויים'), property: 'deductions', width: 50, align: 'right', renderer: (value) => rtl((value ?? 0).toFixed(2)) },
                    { label: rtl('סה"כ'), property: 'total', width: 50, align: 'right', renderer: (value) => rtl((value ?? 0).toFixed(2)) }
                ],
                datas: tableData
            };

            // 💡 בדיקה חדשה: לוודא שהכותרות אינן ריקות
            const filteredDataHeaders = dataTable.headers.filter(h => h && h.label);
            dataTable.headers = filteredDataHeaders;

            doc.table(dataTable, {
                prepareHeader: () => doc.font(fontPath).fontSize(8),
                prepareRow: () => doc.font(fontPath).fontSize(8),
                align: 'right'
            });

            doc.end();
        });

        return docPromise;
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
};

module.exports = {
    getFinanceSummary,
    getFinanceEntries,
    createFinanceEntry,
    updateFinanceEntry,
    deleteFinanceEntry,
    resetProjectFinances,
    restoreProjectFinances,
    generateFinancePDF,
};