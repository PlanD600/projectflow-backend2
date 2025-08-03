// src/services/taskService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const notificationService = require('./notificationService'); // ייבוא שירות ההתראות



/**
 * Retrieves all tasks for a specific project.
 * @param {string} projectId - The ID of the project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} options - Pagination and sorting options.
 * @param {number} [options.page=1] - Current page number.
 * @param {number} [options.limit=25] - Number of items per page.
 * @param {string} [options.sortBy='displayOrder'] - Field to sort by.
 * @param {string} [options.sortOrder='asc'] - Sort order ('asc' or 'desc').
 * @returns {Promise<object>} Paginated list of tasks.
 */
const getTasksForProject = async (projectId, organizationId, { page = 1, limit = 25, sortBy = 'displayOrder', sortOrder = 'asc' }) => { // Updated defaults
  const offset = (page - 1) * limit;

  // Verify project exists within the organization
  const project = await prisma.project.findUnique({
    where: { id: projectId, organizationId },
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization.');
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    skip: offset,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder, // Use sortBy and sortOrder for displayOrder
    },
    include: {
      assignees: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
          }
        }
      },
      comments: {
        include: {
          author: {
            select: { id: true, fullName: true, profilePictureUrl: true }
          }
        },
        orderBy: {
            createdAt: 'asc' // Comments usually sorted by creation time
        }
      },
    },
  });

  const formattedTasks = tasks.map(task => {
    // שימוש ב-destructuring כדי להפריד את assignees משאר הנתונים
    const { assignees, ...restOfTask } = task;

    return {
      ...restOfTask,
      // Ensure dates are in YYYY-MM-DD format for client, as per requirement
      startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
      endDate: task.endDate ? task.endDate.toISOString().split('T')[0] : null,
      // בניית המערך assignees עם אובייקטים מלאים של משתמשים
      assignees: assignees.map(a => a.user),
      subtasks: [], // Subtasks are not part of this iteration for simplicity, as per model
      assigneesIds: assignees.map(a => a.user.id), // Add assigneesIds for frontend convenience
    };
  });

  const totalTasks = await prisma.task.count({
    where: { projectId },
  });

  const totalPages = Math.ceil(totalTasks / limit);

  return {
    data: formattedTasks,
    totalItems: totalTasks,
    totalPages,
    currentPage: page,
  };
};

/**
 * Creates a new task within a project.
 * @param {string} projectId - The ID of the parent project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} taskData - Data for the new task.
 * @param {string} taskData.title
 * @param {string} [taskData.description]
 * @param {string[]} [taskData.assigneesIds=[]] - Array of user IDs for assignees.
 * @param {string} taskData.startDate // NOW REQUIRED
 * @param {string} taskData.endDate   // NOW REQUIRED
 * @param {number} [taskData.expense]
 * @param {string} taskData.color
 * @returns {Promise<object>} The newly created task.
 */
const createTask = async (projectId, organizationId, { title, description, assigneesIds = [], startDate, endDate, expense, color }) => {
  // Validate required fields (startDate, endDate now mandatory)
  if (!startDate || !endDate) {
      throw new Error('Start date and End date are required for task creation.');
  }

  // Verify project exists within the organization
  const project = await prisma.project.findUnique({
    where: { id: projectId, organizationId },
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization.');
  }

  // Validate assignees exist and belong to the organization
  if (assigneesIds && assigneesIds.length > 0) {
    const existingUsers = await prisma.user.findMany({
      where: {
        id: { in: assigneesIds },
        memberships: {
          some: {
            organizationId: organizationId,
            userId: { in: assigneesIds }
          }
        }
      },
      select: { id: true }
    });
    if (existingUsers.length !== assigneesIds.length) {
      throw new Error('One or more specified assignees are invalid or not members of this organization.');
    }
  }

  // Calculate new displayOrder: N+1 where N is the highest displayOrder in this project
  const highestDisplayOrderTask = await prisma.task.findFirst({
    where: { projectId: projectId },
    orderBy: { displayOrder: 'desc' },
    select: { displayOrder: true }
  });
  const newDisplayOrder = highestDisplayOrderTask ? highestDisplayOrderTask.displayOrder + 1 : 0;


  const newTask = await prisma.task.create({
    data: {
      projectId,
      title,
      description,
      startDate: new Date(startDate), // Ensure it's a Date object
      endDate: new Date(endDate),     // Ensure it's a Date object
      expense,
      color,
      status: 'מתוכנן', // Default status for new task
      displayOrder: newDisplayOrder, // Assign the calculated displayOrder
      assignees: {
        create: assigneesIds.map(userId => ({ userId }))
      }
    },
    include: {
      assignees: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
          }
        }
      },
      comments: { // Include empty comments array for new task
          include: { author: true }
      }
    }
  });

  const formattedTask = {
    ...newTask,
    startDate: newTask.startDate.toISOString().split('T')[0], // Format dates for response
    endDate: newTask.endDate.toISOString().split('T')[0],   // Format dates for response
    assignees: newTask.assignees.map(a => a.user),
    assigneesIds: newTask.assignees.map(a => a.user.id), // Add assigneesIds for frontend convenience
    subtasks: [],
    assignees: undefined, // Remove intermediate table for cleaner response
  };

  return formattedTask;
};

/**
 * Updates an existing task's details.
 * @param {string} taskId - The ID of the task to update.
 * @param {string} projectId - The ID of the parent project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} currentUserId - The ID of the user performing the update.
 * @param {string} currentUserRole - The role of the user performing the update in the organization.
 * @param {object} updateData - Data to update.
 * @returns {Promise<object>} The updated task.
 */
const updateTask = async (taskId, projectId, organizationId, currentUserId, currentUserRole, updateData) => {
  // 1. Verify project exists within the organization
  const project = await prisma.project.findUnique({
    where: { id: projectId, organizationId },
    include: { projectTeamLeads: true } // Include to check team leadership
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization.');
  }

  // 2. Verify task exists within the project
  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId },
    include: { assignees: true } // Include assignees to check if current user is an assignee
  });

  if (!task) {
    throw new Error('Task not found in this project.');
  }

  // Store old values for comparison (for notifications)
  const oldStatus = task.status;
  const oldAssignees = task.assignees.map(a => a.userId);

  // 3. Implement permission logic as per spec:
  // Assignees can update status, managers can update all.
  const isAssignee = task.assignees.some(a => a.userId === currentUserId);
  // Check if current user is a TEAM_LEADER for THIS specific project
  const isProjectTeamLeader = project.projectTeamLeads.some(ptl => ptl.userId === currentUserId) && currentUserRole === 'TEAM_LEADER';
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUserRole);

  const allowedUpdatesForAssignee = ['status'];
  // Added 'displayOrder' to allowedUpdatesForManager and Admin
  const allowedUpdatesForManager = ['title', 'description', 'assigneesIds', 'status', 'startDate', 'endDate', 'expense', 'color', 'displayOrder'];

  let finalUpdateData = {};
  if (isAdmin || isProjectTeamLeader) { // Admins or Team Leaders of THIS project can update all
    // Managers/Admins can update anything allowed
    const { assigneesIds, ...otherUpdates } = updateData;
    finalUpdateData = otherUpdates;

    // Handle assigneesIds update: disconnect old, connect new
    if (assigneesIds !== undefined) {
      // Validate new assignees exist and belong to the organization
      const existingUsers = await prisma.user.findMany({
        where: {
          id: { in: assigneesIds },
          memberships: {
            some: {
              organizationId: organizationId,
              userId: { in: assigneesIds }
            }
          }
        },
        select: { id: true }
      });
      if (existingUsers.length !== assigneesIds.length) {
        throw new Error('One or more specified assignees are invalid or not members of this organization.');
      }

      await prisma.$transaction([
        prisma.taskAssignee.deleteMany({
          where: { taskId: taskId }
        }),
        prisma.taskAssignee.createMany({
          data: assigneesIds.map(userId => ({ taskId, userId }))
        })
      ]);

      // --- NOTIFICATION: Assignment Change ---
      const newAssignees = assigneesIds.filter(id => !oldAssignees.includes(id));
      const removedAssignees = oldAssignees.filter(id => !assigneesIds.includes(id));

      for (const assigneeId of newAssignees) {
          await notificationService.createAndSendNotification(
              assigneeId,
              'assignment',
              `You have been assigned to task "${task?.title}" in project "${project.title}".`,
              `/projects/${projectId}/tasks/${taskId}` // Example link for frontend navigation
          );
      }
      for (const assigneeId of removedAssignees) {
          await notificationService.createAndSendNotification(
              assigneeId,
              'assignment',
              `You have been unassigned from task "${task?.title}" in project "${project.title}".`,
              `/projects/${projectId}/tasks/${taskId}`
          );
      }
    }
  } else if (isAssignee) {
    // Assignees can only update status
    const restrictedUpdates = Object.keys(updateData).filter(key => !allowedUpdatesForAssignee.includes(key));
    if (restrictedUpdates.length > 0) {
      throw new Error(`Assignees can only update 'status'. Attempted to update: ${restrictedUpdates.join(', ')}.`);
    }
    finalUpdateData = { status: updateData.status };
  } else {
    throw new Error('You do not have permission to update this task.');
  }

  // Perform the task update
  const updatedTask = await prisma.task.update({
    where: { id: taskId, projectId }, // Ensure task belongs to the project
    data: {
      ...finalUpdateData,
      startDate: finalUpdateData.startDate ? new Date(finalUpdateData.startDate) : undefined,
      endDate: finalUpdateData.endDate ? new Date(finalUpdateData.endDate) : undefined,
    },
    include: {
      assignees: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
          }
        }
      },
      comments: {
        include: {
          author: {
            select: { id: true, fullName: true, profilePictureUrl: true }
          }
        }
      }
    }
  });

/**
 * Retrieves a single task for a specific project.
 * @param {string} taskId - The ID of the task.
 * @param {string} projectId - The ID of the project.
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<object>} The task object.
 */
const getTaskForProject = async (taskId, projectId, organizationId) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId, organizationId },
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization.');
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId },
    include: {
      assignees: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
          }
        }
      },
      comments: {
        include: {
          author: {
            select: { id: true, fullName: true, profilePictureUrl: true }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
    },
  });

  if (!task) {
      throw new Error('Task not found in this project.');
  }

  const formattedTask = {
    ...task,
    startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
    endDate: task.endDate ? task.endDate.toISOString().split('T')[0] : null,
    assignees: task.assignees.map(a => a.user),
    subtasks: [],
    assigneesIds: task.assignees.map(a => a.user.id),
    assignees: undefined,
  };

  return formattedTask;
};
  

  // --- NOTIFICATION: Status Change ---
  if (updatedTask.status !== oldStatus) {
      // Notify all current assignees and project leads about status change
      const usersToNotify = [
          ...updatedTask.assignees.map(a => a.user.id),
          ...project.projectTeamLeads.map(ptl => ptl.userId)
      ];
      // Filter out duplicates and the user who made the change
      const uniqueUsersToNotify = [...new Set(usersToNotify.filter(id => id !== currentUserId))];

      for (const userIdToNotify of uniqueUsersToNotify) {
          await notificationService.createAndSendNotification(
              userIdToNotify,
              'status_change',
              `Task "${updatedTask?.title}" status changed from "${oldStatus}" to "${updatedTask.status}" in project "${project.title}".`,
              `/projects/${projectId}/tasks/${taskId}`
          );
      }
  }

  const formattedTask = {
    ...updatedTask,
    startDate: updatedTask.startDate.toISOString().split('T')[0], // Format dates for response
    endDate: updatedTask.endDate.toISOString().split('T')[0],   // Format dates for response
    assignees: updatedTask.assignees.map(a => a.user),
    assigneesIds: updatedTask.assignees.map(a => a.user.id),
    subtasks: [], // As per original model, subtasks are not part of this iteration
    assignees: undefined, // Remove intermediate table for cleaner response
  };

  return formattedTask;
};

/**
 * Deletes a task.
 * @param {string} taskId - The ID of the task to delete.
 * @param {string} projectId - The ID of the parent project.
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<void>}
 */
const deleteTask = async (taskId, projectId, organizationId) => {
  // Verify project exists within the organization
  const project = await prisma.project.findUnique({
    where: { id: projectId, organizationId },
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization.');
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId },
  });

  if (!task) {
    throw new Error('Task not found in this project.');
  }

  // Delete related comments and assignees first using transactions
  // This is crucial if cascade delete is not fully configured in schema for all relations
  await prisma.$transaction([
    prisma.comment.deleteMany({
      where: { taskId: taskId }
    }),
    prisma.taskAssignee.deleteMany({
      where: { taskId: taskId }
    }),
    prisma.task.delete({
      where: { id: taskId }
    })
  ]);
};

/**
 * Adds a comment to a task.
 * @param {string} taskId - The ID of the task to comment on.
 * @param {string} projectId - The ID of the parent project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} authorId - The ID of the user making the comment.
 * @param {string} content - The comment content.
 * @returns {Promise<object>} The newly created comment.
 */
const addCommentToTask = async (taskId, projectId, organizationId, authorId, content) => {
  // Verify project and task exist within the organization/project
  const project = await prisma.project.findUnique({
    where: { id: projectId, organizationId },
    include: { projectTeamLeads: true } // Include to get project leads for notification
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization.');
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId },
    include: { assignees: true } // Include assignees for notification
  });

  if (!task) {
    throw new Error('Task not found in this project.');
  }

  const newComment = await prisma.comment.create({
    data: {
      taskId,
      authorId,
      content,
    },
    include: {
      author: { // Include author details as per spec for the response and notification
        select: { id: true, fullName: true, profilePictureUrl: true }
      }
    }
  });

  // --- NOTIFICATION: New Comment ---
  // Notify all current assignees and project leads about the new comment
  const usersToNotify = [
      ...task.assignees.map(a => a.userId),
      ...project.projectTeamLeads.map(ptl => ptl.userId)
  ];
  // Filter out the comment author from notifications to avoid self-notification
  const uniqueUsersToNotify = [...new Set(usersToNotify.filter(id => id !== authorId))];

  for (const userIdToNotify of uniqueUsersToNotify) {
      await notificationService.createAndSendNotification(
          userIdToNotify,
          'comment',
          `New comment on task "${task?.title}" in project "${project.title}" by ${newComment.author.fullName}.`,
          `/projects/${projectId}/tasks/${taskId}` // Link for easy navigation in frontend
      );
  }

  return newComment;
};

/**
 * Reorders tasks within a project by updating their displayOrder.
 * @param {string} projectId - The ID of the project.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string[]} taskIdsInOrder - An ordered array of task IDs.
 * @returns {Promise<void>}
 */
const reorderTasks = async (projectId, organizationId, taskIdsInOrder) => {
    // Verify project exists within the organization
    const project = await prisma.project.findUnique({
        where: { id: projectId, organizationId },
    });

    if (!project) {
        throw new Error('Project not found or does not belong to your organization.');
    }

    // Ensure all task IDs belong to this project and organization
    const existingTasks = await prisma.task.findMany({
        where: {
            id: { in: taskIdsInOrder },
            projectId: projectId
        },
        select: { id: true }
    });

    if (existingTasks.length !== taskIdsInOrder.length) {
        throw new Error('One or more task IDs are invalid or do not belong to this project.');
    }

    // Use a transaction for atomicity to update displayOrder for all tasks
    await prisma.$transaction(
        taskIdsInOrder.map((taskId, index) =>
            prisma.task.update({
                where: { id: taskId },
                data: { displayOrder: index },
            })
        )
    );
};

/**
 * Retrieves a single task for a specific project.
 * @param {string} taskId - The ID of the task.
 * @param {string} projectId - The ID of the project.
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<object>} The task object.
 */
const getTaskForProject = async (taskId, projectId, organizationId) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId, organizationId },
  });

  if (!project) {
    throw new Error('Project not found or does not belong to your organization.');
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId, projectId },
    include: {
      assignees: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
          }
        }
      },
      comments: {
        include: {
          author: {
            select: { id: true, fullName: true, profilePictureUrl: true }
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      },
    },
  });

  if (!task) {
      throw new Error('Task not found in this project.');
  }

  // שימוש ב-destructuring כדי להפריד את assignees משאר הנתונים
  const { assignees, ...restOfTask } = task;

  const formattedTask = {
    ...restOfTask,
    startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
    endDate: task.endDate ? task.endDate.toISOString().split('T')[0] : null,
    // בניית המערך assignees עם אובייקטים מלאים של משתמשים
    assignees: assignees.map(a => a.user),
    subtasks: [],
    assigneesIds: assignees.map(a => a.user.id),
  };

  return formattedTask;
};

module.exports = {
  getTasksForProject,
  createTask,
  updateTask,
  deleteTask,
  addCommentToTask,
  reorderTasks,
  getTaskForProject
};