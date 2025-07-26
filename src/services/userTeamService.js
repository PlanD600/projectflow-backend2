// src/services/userTeamService.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateOtp, sendOtp } = require('../utils/otpUtils');

// Helper for role hierarchy check (Higher role index means higher privilege)
const ROLE_HIERARCHY = {
  'EMPLOYEE': 0,
  'TEAM_LEADER': 1,
  'ADMIN': 2,
  'SUPER_ADMIN': 3,
};

/**
 * Retrieves a list of all user memberships in the current organization, with pagination and sorting.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} options - Pagination and sorting options.
 * @returns {Promise<object>} Paginated list of memberships.
 */
const getAllUserMembershipsInOrg = async (organizationId, { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) => {
  const offset = (page - 1) * limit;

  // We are fetching Memberships, including the related User and Organization objects
  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    skip: offset,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder, // Sort by membership creation date
    },
    include: {
      user: { // Populate the full user object
        select: { id: true, fullName: true, phone: true, email: true, profilePictureUrl: true, jobTitle: true }
      },
      organization: { // Populate the full organization object
        select: { id: true, name: true }
      }
    }
  });

  const totalMemberships = await prisma.membership.count({
    where: { organizationId },
  });

  const totalPages = Math.ceil(totalMemberships / limit);

  return {
    data: memberships, // The data is already formatted as Membership[]
    totalItems: totalMemberships,
    totalPages,
    currentPage: page,
  };
};

/**
 * Invites a new user to the organization. If user doesn't exist, creates them.
 * Automatically sends an OTP to their phone.
 * @param {string} organizationId - The ID of the organization to invite to.
 * @param {object} userData - { fullName, phone, jobTitle, role }
 * @returns {Promise<object>} The newly created or updated user object (as a Membership).
 */
const inviteUser = async (organizationId, { fullName, phone, jobTitle, role }) => {
  if (!ROLE_HIERARCHY.hasOwnProperty(role)) {
    throw new Error(`Invalid role specified: ${role}.`);
  }

  let user = await prisma.user.findUnique({ where: { phone } });
  let membership;

  if (user) {
    // If user exists, check if already a member of this organization
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organizationId,
        },
      },
    });

    if (existingMembership) {
      throw new Error('User is already a member of this organization.');
    }

    // Add existing user to this organization
    membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organizationId,
        role: role,
      },
      include: { user: true, organization: true }
    });
  } else {
    // Create new user and add to organization within a transaction
    membership = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          fullName,
          phone,
          jobTitle, // Include jobTitle here
        },
      });

      const newMembership = await tx.membership.create({
        data: {
          userId: newUser.id,
          organizationId: organizationId,
          role: role,
        },
        include: { user: true, organization: true }
      });
      return newMembership;
    });
  }

  // Send OTP to the invited user (for initial login or future verification)
  const otpCode = generateOtp();
  await sendOtp(phone, otpCode); // In a real app, store this OTP in DB/Redis associated with user ID and expiry

  return membership; // Return the full membership object as per V2 spec request for "User" (which now implies Membership with populated user/org)
};


/**
 * Updates a user's role within an organization.
 * @param {string} targetUserId - The ID of the user whose role is to be updated.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} currentUserId - The ID of the user performing the update.
 * @param {string} currentUserRole - The role of the user performing the update.
 * @param {object} updateData - { role }
 * @returns {Promise<object>} The updated membership.
 */
const updateUserRoleInOrg = async (targetUserId, organizationId, currentUserId, currentUserRole, { role: newRole }) => {
  // 1. Cannot update self's role via this endpoint (should use /auth/me if allowed for profile)
  if (targetUserId === currentUserId) {
    throw new Error('You cannot update your own role using this endpoint.');
  }

  // 2. Get target user's current membership and role in this organization
  const targetMembership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: organizationId,
      },
    },
    include: { user: true, organization: true } // Include for response
  });

  if (!targetMembership) {
    throw new Error('Target user not found in this organization.');
  }

  const targetUserRole = targetMembership.role;

  // 3. Validate new role
  if (!ROLE_HIERARCHY.hasOwnProperty(newRole)) {
    throw new Error(`Invalid role specified: ${newRole}.`);
  }

  // 4. Role hierarchy check for permissions:
  // Current user must have higher privilege than target user AND higher privilege than the NEW role
  if (ROLE_HIERARCHY[currentUserRole] <= ROLE_HIERARCHY[targetUserRole] ||
      ROLE_HIERARCHY[currentUserRole] <= ROLE_HIERARCHY[newRole]) {
    throw new Error('You do not have sufficient permissions to modify this user\'s role.');
  }

  // 5. Update the membership role
  const updatedMembership = await prisma.membership.update({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: organizationId,
      },
    },
    data: { role: newRole },
    include: { user: true, organization: true } // Include for response
  });

  return updatedMembership;
};


/**
 * Removes a user from the organization by deleting their membership.
 * @param {string} targetUserId - The ID of the user to remove.
 * @param {string} organizationId - The ID of the current organization.
 * @param {string} currentUserId - The ID of the user performing the action.
 * @param {string} currentUserRole - The role of the user performing the action.
 * @returns {Promise<void>}
 */
const removeUserFromOrg = async (targetUserId, organizationId, currentUserId, currentUserRole) => {
  // 1. Cannot remove self
  if (targetUserId === currentUserId) {
    throw new Error('You cannot remove yourself from the organization.');
  }

  // 2. Get target user's current membership and role in this organization
  const targetMembership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId: organizationId,
      },
    },
  });

  if (!targetMembership) {
    throw new Error('Target user not found in this organization.');
  }

  const targetUserRole = targetMembership.role;

  // 3. Role hierarchy check for permissions
  if (ROLE_HIERARCHY[currentUserRole] <= ROLE_HIERARCHY[targetUserRole]) {
    throw new Error('You do not have sufficient permissions to remove a user with an equal or higher role.');
  }

  // IMPORTANT: Before deleting a membership, consider cascading deletes for related data.
  // For example, if a user is removed, their tasks, comments, and team memberships might need to be
  // reassigned, nullified, or explicitly deleted.
  // Prisma's onDelete actions in schema.prisma can handle some of this, e.g., CASCADE or SET NULL.
  // If not set up for full cascading, you'd need explicit deleteMany calls here:
  await prisma.$transaction(async (tx) => {
    // Delete related TaskAssignee entries for this user in this organization's projects
    const projectsInOrg = await tx.project.findMany({
      where: { organizationId: organizationId },
      select: { id: true }
    });
    const projectIdsInOrg = projectsInOrg.map(p => p.id);

    await tx.taskAssignee.deleteMany({
      where: {
        userId: targetUserId,
        task: {
          projectId: { in: projectIdsInOrg }
        }
      }
    });

    // Delete related TeamMember entries for this user in this organization's teams
    const teamsInOrg = await tx.team.findMany({
      where: { organizationId: organizationId },
      select: { id: true }
    });
    const teamIdsInOrg = teamsInOrg.map(t => t.id);

    await tx.teamMember.deleteMany({
      where: {
        userId: targetUserId,
        teamId: { in: teamIdsInOrg }
      }
    });

    // Delete related TeamLead entries for this user in this organization's teams
    await tx.teamLead.deleteMany({
      where: {
        userId: targetUserId,
        teamId: { in: teamIdsInOrg }
      }
    });

    // Delete related ProjectTeamLead entries for this user in this organization's projects
    await tx.projectTeamLead.deleteMany({
      where: {
        userId: targetUserId,
        projectId: { in: projectIdsInOrg }
      }
    });

    // Delete ConversationParticipant entries for this user in this organization's conversations
    const conversationsInOrg = await tx.conversation.findMany({
      where: { organizationId: organizationId },
      select: { id: true }
    });
    const conversationIdsInOrg = conversationsInOrg.map(c => c.id);

    await tx.conversationParticipant.deleteMany({
      where: {
        userId: targetUserId,
        conversationId: { in: conversationIdsInOrg }
      }
    });

    // Delete comments made by this user in this organization's tasks
    await tx.comment.deleteMany({
      where: {
        authorId: targetUserId,
        task: {
          projectId: { in: projectIdsInOrg }
        }
      }
    });

    // Delete the membership entry itself
    await tx.membership.delete({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId: organizationId,
        },
      },
    });
  });
};

/**
 * Retrieves all teams in the organization, with pagination and sorting.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} options - Pagination and sorting options.
 * @returns {Promise<object>} Paginated list of teams.
 */
const getAllTeams = async (organizationId, { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) => {
  const offset = (page - 1) * limit;

  const teams = await prisma.team.findMany({
    where: { organizationId },
    skip: offset,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      teamLeads: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
          }
        }
      },
      teamMembers: {
        include: {
          user: {
            select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true }
          }
        }
      }
    }
  });

  const formattedTeams = teams.map(team => ({
    ...team,
    leads: team.teamLeads.map(tl => tl.user),
    members: team.teamMembers.map(tm => tm.user),
    leadIds: team.teamLeads.map(tl => tl.userId),
    memberIds: team.teamMembers.map(tm => tm.userId),
    teamLeads: undefined, // Remove intermediate tables
    teamMembers: undefined, // Remove intermediate tables
  }));

  const totalTeams = await prisma.team.count({
    where: { organizationId },
  });

  const totalPages = Math.ceil(totalTeams / limit);

  return {
    data: formattedTeams,
    totalItems: totalTeams,
    totalPages,
    currentPage: page,
  };
};

/**
 * Creates a new team.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} teamData - { name, leadIds, memberIds }
 * @returns {Promise<object>} The newly created team.
 */
const createTeam = async (organizationId, { name, leadIds, memberIds }) => {
  // Validate leads and members exist and are part of the organization
  const allUserIds = [...new Set([...(leadIds || []), ...(memberIds || [])])];
  if (allUserIds.length > 0) {
    const existingMemberships = await prisma.membership.findMany({
      where: {
        organizationId: organizationId,
        userId: { in: allUserIds }
      },
      select: { userId: true }
    });
    if (existingMemberships.length !== allUserIds.length) {
      throw new Error('One or more specified leads or members are invalid or not part of this organization.');
    }
  }

  const newTeam = await prisma.team.create({
    data: {
      organizationId,
      name,
      teamLeads: {
        create: (leadIds || []).map(userId => ({ userId }))
      },
      teamMembers: {
        create: (memberIds || []).map(userId => ({ userId }))
      }
    },
    include: {
      teamLeads: { include: { user: true } },
      teamMembers: { include: { user: true } }
    }
  });

  const formattedTeam = {
    ...newTeam,
    leads: newTeam.teamLeads.map(tl => tl.user),
    members: newTeam.teamMembers.map(tm => tm.user),
    leadIds: newTeam.teamLeads.map(tl => tl.userId),
    memberIds: newTeam.teamMembers.map(tm => tm.userId),
    teamLeads: undefined,
    teamMembers: undefined,
  };
  return formattedTeam;
};

/**
 * Updates a team's name, leads, or members.
 * @param {string} teamId - The ID of the team to update.
 * @param {string} organizationId - The ID of the current organization.
 * @param {object} updateData - { name?, leadIds?, memberIds? }
 * @returns {Promise<object>} The updated team.
 */
const updateTeam = async (teamId, organizationId, updateData) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId, organizationId },
  });

  if (!team) {
    throw new Error('Team not found in this organization.');
  }

  const { name, leadIds, memberIds } = updateData;

  await prisma.$transaction(async (tx) => {
    // Update team name
    if (name !== undefined) {
      await tx.team.update({
        where: { id: teamId },
        data: { name },
      });
    }

    // Update team leads
    if (leadIds !== undefined) {
      const existingLeads = await tx.user.findMany({
        where: {
          id: { in: leadIds },
          memberships: { some: { organizationId: organizationId, userId: { in: leadIds } } }
        },
        select: { id: true }
      });
      if (existingLeads.length !== leadIds.length) {
        throw new Error('One or more specified leads are invalid or not members of this organization.');
      }
      await tx.teamLead.deleteMany({ where: { teamId } });
      await tx.teamLead.createMany({
        data: leadIds.map(userId => ({ teamId, userId }))
      });
    }

    // Update team members
    if (memberIds !== undefined) {
      const existingMembers = await tx.user.findMany({
        where: {
          id: { in: memberIds },
          memberships: { some: { organizationId: organizationId, userId: { in: memberIds } } }
        },
        select: { id: true }
      });
      if (existingMembers.length !== memberIds.length) {
        throw new Error('One or more specified members are invalid or not members of this organization.');
      }
      await tx.teamMember.deleteMany({ where: { teamId } });
      await tx.teamMember.createMany({
        data: memberIds.map(userId => ({ teamId, userId }))
      });
    }
  });

  // Fetch the updated team with populated relations
  const updatedTeam = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      teamLeads: { include: { user: true } },
      teamMembers: { include: { user: true } }
    }
  });

  const formattedTeam = {
    ...updatedTeam,
    leads: updatedTeam.teamLeads.map(tl => tl.user),
    members: updatedTeam.teamMembers.map(tm => tm.user),
    leadIds: updatedTeam.teamLeads.map(tl => tl.userId),
    memberIds: updatedTeam.teamMembers.map(tm => tm.userId),
    teamLeads: undefined,
    teamMembers: undefined,
  };
  return formattedTeam;
};

/**
 * Deletes a team.
 * @param {string} teamId - The ID of the team to delete.
 * @param {string} organizationId - The ID of the current organization.
 * @returns {Promise<void>}
 */
const deleteTeam = async (teamId, organizationId) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId, organizationId },
  });

  if (!team) {
    throw new Error('Team not found in this organization.');
  }

  // Delete related junction table entries first
  await prisma.$transaction([
    prisma.teamLead.deleteMany({ where: { teamId } }),
    prisma.teamMember.deleteMany({ where: { teamId } }),
    prisma.team.delete({ where: { id: teamId } }),
  ]);
};

module.exports = {
  getAllUserMembershipsInOrg, // Renamed for clarity
  inviteUser,
  updateUserRoleInOrg,       // Renamed and focused
  removeUserFromOrg,
  getAllTeams,
  createTeam,
  updateTeam,
  deleteTeam,
};