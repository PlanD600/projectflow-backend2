// src/routes/organizationRoutes.js
const express = require('express');
const router = express.Router();
const organizationService = require('../services/organizationService');
const { authenticateToken, authorizeRoles, requireOrganizationId } = require('../middleware/authMiddleware'); // הוסף requireOrganizationId אם אתה רוצה לאכוף זאת

// POST /api/organizations - Create a new organization
router.post('/', authenticateToken, authorizeRoles(['SUPER_ADMIN']), async (req, res, next) => {
    try {
        const { name } = req.body;
        const userId = req.user.userId; 

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

router.patch('/:id', authenticateToken, authorizeRoles(['SUPER_ADMIN']), async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body; // יכיל את השם החדש: { name: 'New Org Name' }

        if (!updates.name || updates.name.trim() === '') {
            return res.status(400).json({ message: 'Organization name cannot be empty.' });
        }

        const updatedOrganization = await organizationService.updateOrganization(id, updates);
        res.status(200).json(updatedOrganization);
    } catch (error) {
        console.error('Error updating organization:', error);
        next(error);
    }
});

// DELETE /api/organizations/:id - Delete an organization
router.delete('/:id', authenticateToken, authorizeRoles(['SUPER_ADMIN']), async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await organizationService.deleteOrganization(id);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error deleting organization:', error);
        next(error);
    }
});

module.exports = router;