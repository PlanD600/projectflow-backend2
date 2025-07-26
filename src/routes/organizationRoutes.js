// src/routes/organizationRoutes.js
const express = require('express');
const router = express.Router();
const organizationService = require('../services/organizationService');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware'); 

// POST /api/organizations - Create a new organization
router.post('/', authenticateToken, authorizeRoles(['SUPER_ADMIN']), async (req, res, next) => {
    try {
        const { name } = req.body;
        // **שינוי כאן:** גישה ל-req.user.userId במקום req.user.id
        const userId = req.user.userId; // תיקון כאן!

        if (!name) {
            return res.status(400).json({ message: 'Organization name is required.' });
        }

        const newOrganization = await organizationService.createOrganization(name, userId);
        res.status(201).json(newOrganization);
    } catch (error) {
        console.error('Error creating organization:', error);
        next(error); 
    }
});

module.exports = router;