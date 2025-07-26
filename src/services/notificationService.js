// src/services/notificationService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
let io; // נשתמש בזה כדי לאחסן את מופע ה-socket.io server

/**
 * Initializes the notification service with the Socket.IO server instance.
 * This allows the service to emit real-time notifications.
 * @param {object} socketIoInstance - The Socket.IO server instance (io).
 */
const initNotifications = (socketIoInstance) => {
  io = socketIoInstance;
  console.log('Notification service initialized with Socket.IO');
};

/**
 * Creates and sends a new notification.
 * @param {string} userId - The ID of the user who should receive the notification.
 * @param {string} type - Type of notification ('comment' | 'assignment' | 'status_change' | 'deadline').
 * @param {string} text - The content of the notification.
 * @param {string} [link] - Optional URL for the notification (e.g., /projects/1/tasks/2).
 * @returns {Promise<object>} The created notification object.
 */
const createAndSendNotification = async (userId, type, text, link = null) => {
  if (!io) {
    console.warn('Socket.IO not initialized in notification service. Notification will only be saved to DB.');
    // Fallback if io is not initialized, useful for testing or services not using real-time
  }

  // 1. Create the notification in the database
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      text,
      link,
      read: false, // New notifications are unread by default
    },
  });

  // 2. Emit the notification via WebSocket if io is available
  if (io) {
    // We'll emit to a specific user's room.
    // In a real application, when a user connects, they should join a room named after their userId.
    // Example: socket.join(userId);
    io.to(userId).emit('new_notification', {
      id: notification.id,
      type: notification.type,
      text: notification.text,
      timestamp: notification.createdAt.toISOString(),
      read: notification.read,
      link: notification.link,
    });
    console.log(`Notification emitted to user ${userId}: ${text}`);
  }

  return notification;
};

// You might also want endpoints to:
// - Get user's notifications: GET /api/notifications
// - Mark notification as read: PUT /api/notifications/:notificationId/read

module.exports = {
  initNotifications,
  createAndSendNotification,
};