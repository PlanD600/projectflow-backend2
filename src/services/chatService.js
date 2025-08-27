// src/services/chatService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Retrieves a list of all conversations for the authenticated user within a specific organization.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<object[]>} List of conversations.
 */
const getAllConversations = async (userId, organizationId) => {
  // Find all conversations where the user is a participant AND the conversation belongs to the organization
  const conversations = await prisma.conversation.findMany({
    where: {
      organizationId: organizationId,
      participants: {
        some: {
          userId: userId,
        },
      },
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, fullName: true, profilePictureUrl: true }
          }
        }
      },
      messages: { // Limit messages for conversation list preview
        take: 1, // Only fetch the last message for a preview
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, fullName: true }
          }
        }
      }
      // TODO: Implement unreadCount logic here or in frontend based on 'read' status of messages
    },
    orderBy: {
      updatedAt: 'desc' // Or based on last message timestamp
    }
  });

  const formattedConversations = conversations.map(convo => ({
    ...convo,
    participants: convo.participants.map(p => p.user),
    participantIds: convo.participants.map(p => p.userId), // Add participantIds for frontend convenience
    // Remove intermediate table
    participants: undefined,
    // Add logic to calculate unreadCount if needed (server-side, per user)
    // For now, default to 0 or leave undefined as per spec model.
    unreadCount: 0 // Placeholder
  }));

  return formattedConversations;
};

/**
 * Creates a new private or group conversation.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} creatorId - The ID of the user creating the conversation.
 * @param {'private' | 'group'} type - Type of conversation.
 * @param {string[]} participantIds - Array of user IDs to include in the conversation.
 * @param {string} [name] - Name for group chats.
 * @param {string} [avatarUrl] - Avatar URL for group chats.
 * @returns {Promise<object>} The newly created conversation.
 */
const createConversation = async (organizationId, creatorId, { type, participantIds, name, avatarUrl }) => {
  if (!['private', 'group'].includes(type)) {
    throw new Error('Invalid conversation type. Must be "private" or "group".');
  }

  // Ensure creator is included in participantIds
  if (!participantIds.includes(creatorId)) {
    participantIds.push(creatorId);
  }

  // Validate all participantIds exist and belong to the organization
  const existingMemberships = await prisma.membership.findMany({
    where: {
      organizationId: organizationId,
      userId: { in: participantIds }
    },
    select: { userId: true }
  });
  if (existingMemberships.length !== participantIds.length) {
    throw new Error('One or more specified participants are invalid or not members of this organization.');
  }

  if (type === 'private' && participantIds.length !== 2) {
      throw new Error('Private conversations must have exactly two participants.');
  }
  if (type === 'group' && participantIds.length < 2) {
      throw new Error('Group conversations must have at least two participants.');
  }


  const newConversation = await prisma.conversation.create({
    data: {
      organizationId: organizationId,
      type: type,
      name: name,
      avatarUrl: avatarUrl,
      participants: {
        create: participantIds.map(userId => ({ userId }))
      }
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, fullName: true, profilePictureUrl: true }
          }
        }
      },
      messages: { // Empty messages array for new convo
          include: { sender: true }
      }
    }
  });

  const formattedConversation = {
    ...newConversation,
    participants: newConversation.participants.map(p => p.user),
    participantIds: newConversation.participants.map(p => p.userId),
    unreadCount: 0
  };

  return formattedConversation;
};

/**
 * Fetches all messages for a specific conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the authenticated user (to check participation).
 * @param {string} organizationId - The ID of the current organization (to check convo belongs to org).
 * @param {object} options - Pagination options.
 * @param {number} options.page - Current page number.
 * @param {number} options.limit - Number of items per page.
 * @returns {Promise<object>} Paginated list of messages.
 */
const getMessagesForConversation = async (conversationId, userId, organizationId, { page = 1, limit = 50 }) => {
  const offset = (page - 1) * limit;

  // 1. Verify conversation exists and belongs to the organization
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId, organizationId: organizationId },
    include: {
      participants: {
        where: { userId: userId } // Check if current user is a participant
      }
    }
  });

  if (!conversation) {
    throw new Error('Conversation not found or does not belong to your organization.');
  }

  // 2. Verify current user is a participant of this conversation
  if (conversation.participants.length === 0) {
    throw new Error('You are not a participant of this conversation.');
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    skip: offset,
    take: limit,
    orderBy: { createdAt: 'desc' }, // Messages usually ordered descending (latest first)
    include: {
      sender: {
        select: { id: true, fullName: true, profilePictureUrl: true }
      }
    }
  });

  const totalMessages = await prisma.message.count({
    where: { conversationId },
  });

  const totalPages = Math.ceil(totalMessages / limit);

  return {
    messages: messages, // Return messages directly as per spec
    totalItems: totalMessages, // Adding totalItems for consistency
    totalPages,
    currentPage: page,
  };
};

module.exports = {
  getAllConversations,
  createConversation,
  getMessagesForConversation,
};