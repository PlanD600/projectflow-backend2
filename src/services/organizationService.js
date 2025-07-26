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

module.exports = {
    createOrganization,
};