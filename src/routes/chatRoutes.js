// src/routes/chatRoutes.js
const express = require('express');
const chatController = require('../controllers/chatController');
const { authenticateToken, requireOrganizationId } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply authentication and organization context middleware to all chat routes
router.use(authenticateToken);
router.use(requireOrganizationId);

router.get('/', chatController.getConversations);
router.post('/', chatController.createConversation);
router.get('/:conversationId/messages', chatController.getMessages);

module.exports = router;