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
 * @param {'all' | boolean} [options.isArchivedFilter] - Optional: true for archived, false for active, 'all' for both.
 * @returns {Promise<object>} Paginated list of projects.
 */
const getAllProjects = async (organizationId, userId, userRole, { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) => {
    const offset = (page - 1) * limit;

    let whereClause = {
        organizationId: organizationId,
    };

    // If the user is an EMPLOYEE, they should only see projects where they are a team lead
    if (userRole === 'EMPLOYEE') {
        whereClause.projectTeamLeads = {
            some: {
                userId: userId,
            },
        };
    }

    // ---  This part was missing ---
    const projects = await prisma.project.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: {
            [sortBy]: sortOrder,
        },
        include: {
            tasks: { // Include tasks to calculate status
select: {
                    id: true,
                    title: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                    color: true,
                    displayOrder: true,
                    // חשוב לכלול גם את המשתמשים המשויכים כדי שנוכל לבדוק הרשאות
                    assignees: {
                        select: {
                            user: {
                                select: { id: true, fullName: true }
                            }
                        }
                    }
                },
                orderBy: {
                    displayOrder: 'asc' // מיון המשימות לפי הסדר שנקבע
                }
            },            projectTeamLeads: {
                include: {
                    user: {
                        select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
                    }
                }
            },
        },
    });
    // --- End of missing part ---

    // Map to the desired Project interface, populating teamLeads as User[]
  const formattedProjects = projects.map(project => {
        // המרת המבנה של assignees למבנה שטוח יותר שהלקוח מצפה לו
        const formattedTasks = project.tasks.map(task => ({
            ...task,
            assignees: task.assignees.map(a => a.user)
        }));

        return {
            ...project,
            tasks: formattedTasks, // שימוש במשימות המעובדות
            teamLeads: project.projectTeamLeads.map(ptl => ptl.user),
            projectTeamLeads: undefined,
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
 * @param {number} [projectData.budget]
 * @returns {Promise<object>} The newly created project.
 */
const createProject = async (organizationId, { title, description, teamLeads: teamLeadIds, startDate, endDate, budget }) => {
    // Validate teamLeads exist and belong to the organization (optional but good practice)
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

    const newProject = await prisma.project.create({
        data: {
            organizationId,
            title,
            description,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            budget,
            // Default status is 'מתוכנן'
            projectTeamLeads: {
                create: teamLeadIds.map(userId => ({ userId }))
            }
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
            tasks: true // Include tasks, though likely empty initially
        }
    });

    // Map to the desired Project interface
    const formattedProject = {
        ...newProject,
        teamLeads: newProject.projectTeamLeads.map(ptl => ptl.user),
        projectTeamLeads: undefined, // Remove intermediate table
        team: [] // Teams are handled separately, so this array would be populated by a separate fetch if needed
    };

    return formattedProject;
};

/**
 * Updates an existing project's details.
 * @param {string} projectId - The ID of the project to update.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} updateData - Data to update.
 * @param {string[]} [updateData.teamLeads] - Array of user IDs for new team leads.
 * @returns {Promise<object>} The updated project.
 */
const updateProject = async (projectId, organizationId, updateData) => {
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId },
        include: { projectTeamLeads: true }
    });

    if (!project) {
        throw new Error('Project not found in this organization.');
    }

    const { teamLeads: newTeamLeadIds, ...dataToUpdate } = updateData;

    // Handle team leads update: disconnect old, connect new
    if (newTeamLeadIds !== undefined) {
        // Validate new team leads exist and are part of the organization
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
            // Disconnect existing team leads for this project
            prisma.projectTeamLead.deleteMany({
                where: { projectId: projectId }
            }),
            // Connect new team leads
            prisma.projectTeamLead.createMany({
                data: newTeamLeadIds.map(userId => ({ projectId, userId }))
            })
        ]);
    }

    const updatedProject = await prisma.project.update({
        where: { id: projectId, organizationId }, // Ensure project belongs to the organization
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
            tasks: true
        }
    });

    // Map to the desired Project interface
    const formattedProject = {
        ...updatedProject,
        teamLeads: updatedProject.projectTeamLeads.map(ptl => ptl.user),
        projectTeamLeads: undefined,
        team: []
    };

    return formattedProject;
};

/**
 * Archives or unarchives a project.
 * @param {string} projectId - The ID of the project to update.
 * @param {string} organizationId - The ID of the current organization.
 * @param {boolean} isArchived - New archive status.
 * @returns {Promise<object>} The updated project.
 */
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

    // Map to the desired Project interface
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

    let status; // Let's determine the status logically

    if (stuckTasks > 0) {
        status = 'בסיכון'; // Priority: If any task is stuck, the project is at risk
    } else if (completionPercentage === 100) {
        status = 'הושלם';
    } else if (completionPercentage === 0 && tasks.every(t => t.status === 'מתוכנן')) {
        status = 'מתוכנן';
    } else {
        status = 'בתהליך'; // Default for any ongoing work
    }

    return { status, completionPercentage };
};

/**
 * Deletes a project.
 * @param {string} projectId - The ID of the project to delete.
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<void>}
 */
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