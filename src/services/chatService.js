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
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, fullName: true }
          }
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  const formattedConversations = conversations.map(convo => {
    const { participants, ...restOfConvo } = convo;
    return {
      ...restOfConvo,
      participants: participants.map(p => p.user),
      participantIds: participants.map(p => p.userId),
      unreadCount: 0
    };
  });

  return formattedConversations;
};

/**
 * Creates a new private or group conversation.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} creatorId - The ID of the user creating the conversation.
 * @param {'private' | 'group'} type - Type of conversation.
 * @param {string[]} participantIds - Array of user IDs to include in the conversation.
 * @param {string} [name] - Name for group chats.
 * @returns {Promise<object>} The newly created or existing conversation.
 */
const createConversation = async (organizationId, creatorId, { type, participantIds, name }) => {
    if (!['private', 'group'].includes(type)) {
        throw new Error('Invalid conversation type. Must be "private" or "group".');
    }

    if (!participantIds.includes(creatorId)) {
        participantIds.push(creatorId);
    }
    
    const uniqueParticipantIds = [...new Set(participantIds)];

    const existingMemberships = await prisma.membership.findMany({
        where: {
            organizationId: organizationId,
            userId: { in: uniqueParticipantIds }
        },
        select: { userId: true }
    });
    if (existingMemberships.length !== uniqueParticipantIds.length) {
        throw new Error('One or more specified participants are invalid or not members of this organization.');
    }

    if (type === 'private') {
        if (uniqueParticipantIds.length !== 2) {
            throw new Error('Private conversations must have exactly two participants.');
        }

        const existingConversation = await prisma.conversation.findFirst({
            where: {
                organizationId,
                type: 'private',
                AND: [
                    { participants: { some: { userId: uniqueParticipantIds[0] } } },
                    { participants: { some: { userId: uniqueParticipantIds[1] } } }
                ],
                participants: {
                    every: { userId: { in: uniqueParticipantIds } }
                }
            },
            include: {
                participants: { include: { user: { select: { id: true, fullName: true, profilePictureUrl: true } } } },
                messages: { take: 1, orderBy: { createdAt: 'desc' }, include: { sender: true } }
            }
        });

        if (existingConversation) {
            console.log("Found existing private conversation, returning it.");
            const error = new Error('Conversation already exists');
            error.conversation = {
                ...existingConversation,
                participants: existingConversation.participants.map(p => p.user),
                participantIds: existingConversation.participants.map(p => p.userId),
                unreadCount: 0
            };
            throw error;
        }
    } else if (type === 'group' && uniqueParticipantIds.length < 2) {
        throw new Error('Group conversations must have at least two participants.');
    }

    const newConversation = await prisma.conversation.create({
        data: {
            organizationId: organizationId,
            type: type,
            name: name,
            participants: {
                create: uniqueParticipantIds.map(userId => ({ userId }))
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
            messages: {
                include: { sender: true }
            }
        }
    });

    const { participants, ...restOfConvo } = newConversation;
    const formattedConversation = {
        ...restOfConvo,
        participants: participants.map(p => p.user),
        participantIds: participants.map(p => p.userId),
        unreadCount: 0
    };

    return formattedConversation;
};


/**
 * Deletes all messages from a specific conversation.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user requesting the deletion (for permission checks).
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<void>}
 */
const deleteConversationMessages = async (conversationId, userId, organizationId) => {
  // First, verify the user is a participant in the conversation to authorize the deletion
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId: organizationId,
      participants: {
        some: {
          userId: userId,
        },
      },
    },
  });

  if (!conversation) {
    throw new Error('Conversation not found or you do not have permission to modify it.');
  }

  // Delete all messages associated with the conversation
  await prisma.message.deleteMany({
    where: {
      conversationId: conversationId,
    },
  });
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

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId, organizationId: organizationId },
    include: {
      participants: {
        where: { userId: userId }
      }
    }
  });

  if (!conversation) {
    throw new Error('Conversation not found or does not belong to your organization.');
  }

  if (conversation.participants.length === 0) {
    throw new Error('You are not a participant of this conversation.');
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    skip: offset,
    take: limit,
    orderBy: { createdAt: 'desc' },
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
    messages: messages,
    totalItems: totalMessages,
    totalPages,
    currentPage: page,
  };
};

module.exports = {
  getAllConversations,
  createConversation,
  getMessagesForConversation,
  deleteConversationMessages,
};