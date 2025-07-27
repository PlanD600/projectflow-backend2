// src/services/organizationService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Creates a new organization and associates the creating user as SUPER_ADMIN.
 * This function assumes the calling user is already authenticated.
 * @param {string} organizationName - The name of the new organization.
 * @param {string} userId - The ID of the user creating the organization.
 * @returns {Promise<object>} The newly created organization object.
 */
const createOrganization = async (organizationName, userId) => {
    if (!organizationName || organizationName.trim() === '') {
        throw new Error('Organization name cannot be empty.');
    }
    if (!userId) {
        throw new Error('User ID is required to create an organization.');
    }

    // Use a transaction to ensure atomicity:
    // Either the organization and membership are created, or none are.
    const newOrganizationAndMembership = await prisma.$transaction(async (tx) => {
        // 1. Create the new organization
        const newOrg = await tx.organization.create({
            data: {
                name: organizationName,
            },
        });

        // 2. Create a membership for the creating user in the new organization as SUPER_ADMIN
        await tx.membership.create({
            data: {
                userId: userId,
                organizationId: newOrg.id,
                role: 'SUPER_ADMIN', // The user creating the organization is a SUPER_ADMIN
            },
        });

        return newOrg;
    });

    return newOrganizationAndMembership;
};


/**
 * Updates an existing organization.
 * @param {string} organizationId - The ID of the organization to update.
 * @param {object} updates - Fields to update (e.g., { name: 'New Name' }).
 * @returns {Promise<object>} The updated organization object.
 */
const updateOrganization = async (organizationId, updates) => {
    if (!organizationId) {
        throw new Error('Organization ID is required for update.');
    }
    if (!updates || Object.keys(updates).length === 0) {
        throw new Error('No update data provided.');
    }

    const updatedOrg = await prisma.organization.update({
        where: { id: organizationId },
        data: updates,
    });
    return updatedOrg;
};

/**
 * Deletes an organization.
 * This will cascade delete related data if onDelete: Cascade is properly set in schema.prisma.
 * @param {string} organizationId - The ID of the organization to delete.
 * @returns {Promise<object>} Confirmation of deletion.
 */
const deleteOrganization = async (organizationId) => {
    if (!organizationId) {
        throw new Error('Organization ID is required for deletion.');
    }

    // Prisma's onDelete: Cascade should handle related records.
    // Make sure your schema.prisma has onDelete: Cascade on relationships
    // from other models pointing to Organization (e.g., Project, Team, Membership, Conversation).
    const deletedOrg = await prisma.organization.delete({
        where: { id: organizationId },
    });
    return { message: `Organization ${deletedOrg.name} deleted successfully.` };
};

module.exports = {
    createOrganization,
    updateOrganization,
    deleteOrganization,
};