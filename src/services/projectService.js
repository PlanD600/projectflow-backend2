// src/services/projectService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Retrieves a list of all projects for a given organization, with pagination and sorting.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} userRole - The role of the authenticated user.
 * @param {object} options - Pagination and sorting options.
 * @param {number} options.page - Current page number.
 * @param {number} options.limit - Number of items per page.
 * @param {string} options.sortBy - Field to sort by.
 * @param {string} options.sortOrder - Sort order ('asc' or 'desc').
 * @returns {Promise<object>} Paginated list of projects.
 */
const getAllProjects = async (organizationId, userId, userRole, { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) => {
    const offset = (page - 1) * limit;

    let whereClause = {
        organizationId: organizationId,
        isArchived: false,
    };

    if (userRole === 'EMPLOYEE') {
        whereClause.projectTeamLeads = {
            some: {
                userId: userId,
            },
        };
    }

    const projects = await prisma.project.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: {
            [sortBy]: sortOrder,
        },
        include: {
            monthlyBudgets: true,
            tasks: {
                select: {
                    id: true,
                    title: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                    color: true,
                    displayOrder: true,
                    expense: true,
                    assignees: {
                        select: {
                            user: {
                                select: { id: true, fullName: true }
                            }
                        }
                    }
                },
                orderBy: {
                    displayOrder: 'asc'
                }
            },
            projectTeamLeads: {
                include: {
                    user: {
                        select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
                    }
                }
            },
            financeEntries: true
        },
    });

    const formattedProjects = projects.map(project => {
        const formattedTasks = (project.tasks || []).map(task => ({
            ...task,
            assignees: task.assignees.map(a => a.user)
        }));

        return {
            ...project,
            tasks: formattedTasks,
            teamLeads: project.projectTeamLeads.map(ptl => ptl.user),
            projectTeamLeads: undefined,
            team: []
        };
    });

    const totalProjects = await prisma.project.count({
        where: whereClause,
    });

    const totalPages = Math.ceil(totalProjects / limit);

    return {
        data: formattedProjects,
        totalItems: totalProjects,
        totalPages,
        currentPage: page,
    };
};

/**
 * Creates a new project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} projectData - Data for the new project.
 * @param {string} projectData.title
 * @param {string} [projectData.description]
 * @param {string[]} projectData.teamLeads - Array of user IDs for team leads.
 * @param {string} [projectData.startDate]
 * @param {string} [projectData.endDate]
 * @param {object[]} [projectData.monthlyBudgets] - Array of monthly budget objects.
 * @returns {Promise<object>} The newly created project.
 */
const createProject = async (organizationId, { title, description, teamLeads: teamLeadIds, startDate, endDate, monthlyBudgets }) => {
    if (teamLeadIds && teamLeadIds.length > 0) {
        const existingUsers = await prisma.user.findMany({
            where: {
                id: { in: teamLeadIds },
                memberships: {
                    some: {
                        organizationId: organizationId,
                        userId: { in: teamLeadIds }
                    }
                }
            },
            select: { id: true }
        });
        if (existingUsers.length !== teamLeadIds.length) {
            throw new Error('One or more specified team leads are invalid or not members of this organization.');
        }
    }

    const data = {
        organizationId,
        title,
        description,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        projectTeamLeads: {
            create: teamLeadIds.map(userId => ({ userId }))
        },
    };

    if (monthlyBudgets && monthlyBudgets.length > 0) {
        data.monthlyBudgets = {
            createMany: {
                data: monthlyBudgets.map(budget => ({
                    ...budget,
                    organizationId: organizationId,
                }))
            }
        };
    }

    const newProject = await prisma.project.create({
        data,
        include: {
            organization: {
                select: { id: true, name: true }
            },
            projectTeamLeads: {
                include: {
                    user: {
                        select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
                    }
                }
            },
            tasks: true,
            monthlyBudgets: true
        }
    });

    const formattedProject = {
        ...newProject,
        teamLeads: newProject.projectTeamLeads.map(ptl => ptl.user),
        projectTeamLeads: undefined,
        team: []
    };

    return formattedProject;
};

/**
 * Updates an existing project.
 * @param {string} projectId - The ID of the project to update.
 * @param {string} organizationId - The ID of the organization.
 * @param {object} updateData - Data to update.
 * @returns {Promise<object>} The updated project.
 */
const updateProject = async (projectId, organizationId, updateData) => {
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId },
        include: { projectTeamLeads: true, monthlyBudgets: true }
    });

    if (!project) {
        throw new Error('Project not found in this organization.');
    }

    const { teamLeads: newTeamLeadIds, monthlyBudgets: newMonthlyBudgets, ...dataToUpdate } = updateData;

    if (newTeamLeadIds !== undefined) {
        const existingUsers = await prisma.user.findMany({
            where: {
                id: { in: newTeamLeadIds },
                memberships: {
                    some: {
                        organizationId: organizationId,
                        userId: { in: newTeamLeadIds }
                    }
                }
            },
            select: { id: true }
        });
        if (existingUsers.length !== newTeamLeadIds.length) {
            throw new Error('One or more specified new team leads are invalid or not members of this organization.');
        }

        await prisma.$transaction([
            prisma.projectTeamLead.deleteMany({
                where: { projectId: projectId }
            }),
            prisma.projectTeamLead.createMany({
                data: newTeamLeadIds.map(userId => ({ projectId, userId }))
            })
        ]);
    }
    
    if (newMonthlyBudgets !== undefined) {
        await prisma.monthlyBudget.deleteMany({
            where: { projectId: projectId }
        });
        
        if (newMonthlyBudgets.length > 0) {
             await prisma.monthlyBudget.createMany({
                data: newMonthlyBudgets.map(budget => ({
                    ...budget,
                    projectId: projectId,
                    organizationId: organizationId,
                }))
            });
        }
    }
    
    const updatedProject = await prisma.project.update({
        where: { id: projectId, organizationId },
        data: {
            ...dataToUpdate,
            startDate: dataToUpdate.startDate ? new Date(dataToUpdate.startDate) : undefined,
            endDate: dataToUpdate.endDate ? new Date(dataToUpdate.endDate) : undefined,
        },
        include: {
            organization: {
                select: { id: true, name: true }
            },
            projectTeamLeads: {
                include: {
                    user: {
                        select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
                    }
                }
            },
            tasks: true,
            monthlyBudgets: true
        }
    });

    const formattedProject = {
        ...updatedProject,
        teamLeads: updatedProject.projectTeamLeads.map(ptl => ptl.user),
        projectTeamLeads: undefined,
        team: []
    };

    return formattedProject;
};

const archiveProject = async (projectId, organizationId, isArchived) => {
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId },
    });

    if (!project) {
        throw new Error('Project not found in this organization.');
    }

    const updatedProject = await prisma.project.update({
        where: { id: projectId },
        data: { isArchived },
        include: {
            organization: {
                select: { id: true, name: true }
            },
            projectTeamLeads: {
                include: {
                    user: {
                        select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
                    }
                }
            },
            tasks: true
        }
    });

    const formattedProject = {
        ...updatedProject,
        teamLeads: updatedProject.projectTeamLeads.map(ptl => ptl.user),
        projectTeamLeads: undefined,
        team: []
    };

    return formattedProject;
};

const calculateProjectStatus = (tasks) => {
    if (!tasks || tasks.length === 0) {
        return { status: 'מתוכנן', completionPercentage: 0 };
    }

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.status === 'הושלם').length;
    const stuckTasks = tasks.filter(task => task.status === 'תקוע').length;

    const completionPercentage = Math.round((completedTasks / totalTasks) * 100);

    let status;

    if (stuckTasks > 0) {
        status = 'בסיכון';
    } else if (completionPercentage === 100) {
        status = 'הושלם';
    } else if (completionPercentage === 0 && tasks.every(t => t.status === 'מתוכנן')) {
        status = 'מתוכנן';
    } else {
        status = 'בתהליך';
    }

    return { status, completionPercentage };
};

const deleteProject = async (projectId, organizationId) => {
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId },
    });

    if (!project) {
        throw new Error('Project not found in this organization.');
    }
    
    await prisma.project.delete({
        where: { id: projectId },
    });
};

module.exports = {
    getAllProjects,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    calculateProjectStatus,
};

/**
 * Creates a new finance entry.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} projectId - The ID of the project the entry belongs to.
 * @param {object} entryData - Data for the new finance entry.
 * @param {'INCOME' | 'EXPENSE'} entryData.type
 * @param {number} entryData.amount
 * @param {string} entryData.description
 * @param {string} entryData.date - YYYY-MM-DD
 * @param {string} [entryData.taskId]
 * @returns {Promise<object>} The newly created finance entry.
 */
const createFinanceEntry = async (organizationId, projectId, entryData) => {
    const { type, amount, description, date, taskId } = entryData;
    
    // בודק אם הפרויקט קיים ושייך לארגון הנוכחי
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId: organizationId },
        select: { id: true, title: true }
    });
    if (!project) {
        throw new Error('Project not found or does not belong to this organization.');
    }

    // בודק אם המשימה קיימת ושייכת לפרויקט, אם צוינה
    if (taskId) {
        const task = await prisma.task.findUnique({
            where: { id: taskId, projectId: projectId },
        });
        if (!task) {
            throw new Error('Task not found or does not belong to the specified project.');
        }
    }

    const newEntry = await prisma.financeEntry.create({
        data: {
            organizationId,
            projectId,
            type,
            amount,
            description,
            date: new Date(date),
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

/**
 * Updates an existing finance entry.
 * @param {string} entryId - The ID of the entry to update.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} updateData - Data to update the finance entry.
 * @returns {Promise<object>} The updated finance entry.
 */
const updateFinanceEntry = async (entryId, organizationId, updateData) => {
    const { projectId, taskId, ...dataToUpdate } = updateData;

    // בודק אם הרשומה קיימת ושייכת לארגון הנוכחי
    const existingEntry = await prisma.financeEntry.findUnique({
        where: { id: entryId, organizationId: organizationId },
        select: { id: true, projectId: true }
    });
    if (!existingEntry) {
        throw new Error('Finance entry not found or does not belong to this organization.');
    }

    // ודא שה-projectId ב-updateData זהה ל-projectId הקיים, אם נשלח
    if (projectId && projectId !== existingEntry.projectId) {
        throw new Error('Cannot change project association of a finance entry.');
    }

    // בודק אם המשימה קיימת ושייכת לפרויקט הנכון, אם צוינה
    if (taskId) {
        const task = await prisma.task.findUnique({
            where: { id: taskId, projectId: existingEntry.projectId },
        });
        if (!task) {
            throw new Error('Task not found or does not belong to the specified project.');
        }
    }
    
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
 * Resets all project finances, deleting all monthly budget and finance entries.
 * This is a destructive action.
 * @param {string} organizationId - The ID of the organization.
 * @param {string} projectId - The ID of the project to reset.
 * @returns {Promise<void>}
 */
const resetProjectFinances = async (organizationId, projectId) => {
    // בודק אם הפרויקט קיים ושייך לארגון
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId: organizationId },
    });
    if (!project) {
        throw new Error('Project not found or does not belong to this organization.');
    }
    
    // מחיקת כל רשומות התקציב והכספים של הפרויקט
    await prisma.$transaction([
        prisma.monthlyBudget.deleteMany({ where: { projectId: projectId } }),
        prisma.financeEntry.deleteMany({ where: { projectId: projectId } }),
    ]);
};

/**
 * Restores project finances by creating a new monthly budget from a finance entry.
 * @param {string} organizationId - The ID of the organization.
 * @param {string} projectId - The ID of the project.
 * @param {string} entryId - The ID of the finance entry to use for restoration.
 * @returns {Promise<object>} The restored monthly budget.
 */
const restoreProjectFinances = async (organizationId, projectId, entryId) => {
    // בודק אם הפרויקט קיים ושייך לארגון
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId: organizationId },
    });
    if (!project) {
        throw new Error('Project not found or does not belong to this organization.');
    }

    // מוצא את רשומת הכספים
    const entry = await prisma.financeEntry.findUnique({
        where: { id: entryId, organizationId: organizationId },
    });
    if (!entry) {
        throw new Error('Finance entry not found or does not belong to this organization.');
    }

    // מוחק את כל התקציבים הקיימים ויוצר חדש על בסיס הרשומה
    await prisma.$transaction([
        prisma.monthlyBudget.deleteMany({ where: { projectId: projectId } }),
        prisma.monthlyBudget.create({
            data: {
                projectId,
                organizationId,
                year: entry.date.getFullYear(),
                month: entry.date.getMonth() + 1,
                incomeBudget: entry.type === 'INCOME' ? entry.amount : 0,
                expenseBudget: entry.type === 'EXPENSE' ? entry.amount : 0,
            }
        })
    ]);
    
    return await prisma.monthlyBudget.findMany({ where: { projectId: projectId } });
};

// ... (שאר הקוד הקיים למטה)

module.exports = {
    getAllProjects,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    calculateProjectStatus,
    createFinanceEntry, // 💡 יש לוודא שהפונקציה הזו קיימת
    updateFinanceEntry,
    deleteFinanceEntry,
    resetProjectFinances,
    restoreProjectFinances,
};