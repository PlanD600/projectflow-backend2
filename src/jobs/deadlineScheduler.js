// src/jobs/deadlineScheduler.js
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const notificationService = require('../services/notificationService'); // ייבוא שירות ההתראות

// הגדרת הזמן (בימים) לפני הדד-ליין לשליחת התראה
const DAYS_BEFORE_DEADLINE = 3;

/**
 * Checks for upcoming task deadlines and sends notifications.
 * This function will be executed by the cron job.
 */
const checkAndSendDeadlineNotifications = async () => {
  console.log('Running deadline check job...');
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day

  const deadlineDate = new Date();
  deadlineDate.setDate(today.getDate() + DAYS_BEFORE_DEADLINE);
  deadlineDate.setHours(23, 59, 59, 999); // Set to end of day

  try {
    // Find tasks that are in progress and whose end date is within the next DAYS_BEFORE_DEADLINE
    const upcomingTasks = await prisma.task.findMany({
      where: {
        status: { in: ['מתוכנן', 'בתהליך', 'תקוע'] }, // Only active tasks
        endDate: {
          lte: deadlineDate, // End date is less than or equal to deadlineDate (e.g., in 3 days)
          gte: today, // End date is greater than or equal to today
        },
      },
      include: {
        project: {
          select: { id: true, title: true } // Include project details for notification context
        },
        assignees: {
          include: {
            user: {
              select: { id: true, fullName: true } // Include assignee user details
            }
          }
        },
      },
    });

    console.log(`Found ${upcomingTasks.length} upcoming tasks.`);

    for (const task of upcomingTasks) {
      // Avoid sending duplicate notifications if the job runs multiple times a day
      // or if notification was already sent for this deadline.
      // A more robust solution might involve a separate NotificationSentLog table
      // or a field on Task indicating last notification date.
      // For simplicity now, we'll just send it.

      const notificationText = `Task "${task?.title}" in project "${task.project.title}" is due on ${task.endDate.toLocaleDateString('he-IL')}.`;
      const notificationLink = `/projects/${task.projectId}/tasks/${task.id}`;

      // Notify all assignees of the task
      for (const assignee of task.assignees) {
        await notificationService.createAndSendNotification(
          assignee.user.id,
          'deadline',
          notificationText,
          notificationLink
        );
      }
      // Optionally, notify project leads as well
    }
  } catch (error) {
    console.error('Error in deadline check job:', error);
  }
};

/**
 * Initializes the cron job for deadline notifications.
 * Runs once every day at 00:00 (midnight).
 */
const startDeadlineScheduler = () => {
  // Cron schedule: '0 0 * * *' means "at 00:00 every day"
  // For testing, you might use '*/1 * * * *' (every minute)
  cron.schedule('0 0 * * *', checkAndSendDeadlineNotifications, {
    scheduled: true,
    timezone: "Asia/Jerusalem" // או אזור זמן רלוונטי לשרת שלך
  });
  console.log('Deadline scheduler started (runs daily at midnight).');
};

module.exports = {
  startDeadlineScheduler,
  checkAndSendDeadlineNotifications // For manual testing if needed
};