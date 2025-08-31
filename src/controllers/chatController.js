// src/controllers/chatController.js
const chatService = require('../services/chatService');
const { sendErrorResponse } = require('../utils/errorUtils');
//11
const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const organizationId = req.organizationId;
    const conversations = await chatService.getAllConversations(userId, organizationId);
    res.status(200).json(conversations);
  } catch (error) {
    sendErrorResponse(res, 500, 'Failed to retrieve conversations.', { details: error.message });
  }
};

const createConversation = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const creatorId = req.user.userId;
    const { type, participantIds, name } = req.body;

    if (!type || !Array.isArray(participantIds) || participantIds.length === 0) {
      return sendErrorResponse(res, 400, 'Conversation type and at least one participant ID are required.');
    }

    if (type === 'group' && !name) {
        return sendErrorResponse(res, 400, 'Group conversations require a name.');
    }

    const newConversation = await chatService.createConversation(organizationId, creatorId, { type, participantIds, name });
    res.status(201).json(newConversation);
  } catch (error) {
    if (error.message.includes('Invalid conversation type') || error.message.includes('participants are invalid') || error.message.includes('must have exactly two participants') || error.message.includes('must have at least two participants')) {
      return sendErrorResponse(res, 400, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to create conversation.', { details: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;
    const organizationId = req.organizationId;
    const { page, limit } = req.query;

    const messages = await chatService.getMessagesForConversation(conversationId, userId, organizationId, { page: parseInt(page), limit: parseInt(limit) });
    res.status(200).json(messages);
  } catch (error) {
    if (error.message.includes('Conversation not found') || error.message.includes('not a participant')) {
      return sendErrorResponse(res, 404, error.message); // Use 404 for not found/not authorized for specific resource
    }
    sendErrorResponse(res, 500, 'Failed to retrieve messages.', { details: error.message });
  }
};

const deleteMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;
    const organizationId = req.organizationId;

    await chatService.deleteConversationMessages(conversationId, userId, organizationId);
    res.status(204).send(); // 204 No Content is a standard response for successful deletion
  } catch (error) {
    if (error.message.includes('not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to delete messages.', { details: error.message });
  }
};

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  deleteMessages,
};