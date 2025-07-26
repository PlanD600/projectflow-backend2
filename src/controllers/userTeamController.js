// src/controllers/userTeamController.js
const userTeamService = require('../services/userTeamService');
const { sendErrorResponse } = require('../utils/errorUtils');

// Users
const getUsers = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { page, limit, sortBy, sortOrder } = req.query;

    // Call the renamed service function
    const users = await userTeamService.getAllUserMembershipsInOrg(organizationId, { page: parseInt(page), limit: parseInt(limit), sortBy, sortOrder });
    res.status(200).json(users);
  } catch (error) {
    sendErrorResponse(res, 500, 'Failed to retrieve user memberships.', { details: error.message });
  }
};

const inviteUser = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { fullName, phone, jobTitle, role } = req.body; // Added jobTitle

    if (!fullName || !phone || !role || jobTitle === undefined) { // jobTitle can be empty string or null, but must be present
      return sendErrorResponse(res, 400, 'Full name, phone, job title, and role are required for invitation.');
    }

    const newMembership = await userTeamService.inviteUser(organizationId, { fullName, phone, jobTitle, role });
    // The spec says 'User' object as success response, but it also says 'status pending'.
    // Given the updated Membership model, returning the Membership with populated User seems appropriate.
    // If frontend strictly expects just User, we'd adjust this. For now, sending Membership.
    res.status(201).json(newMembership); // Returning Membership object as per latest spec understanding
  } catch (error) {
    if (error.message.includes('User is already a member') || error.message.includes('Invalid role')) {
      return sendErrorResponse(res, 400, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to invite user.', { details: error.message });
  }
};

const updateUserRole = async (req, res) => { // Renamed for clarity and to match route
  try {
    const { userId } = req.params; // userId to update (target user)
    const organizationId = req.organizationId;
    const currentUserId = req.user.userId; // User performing the action
    const currentUserRole = req.user.role; // Role of user performing the action
    const { role } = req.body; // Only role is expected

    if (!role) {
        return sendErrorResponse(res, 400, 'Role is required for user role update.');
    }

    // Call the renamed service function
    const updatedMembership = await userTeamService.updateUserRoleInOrg(userId, organizationId, currentUserId, currentUserRole, { role });
    res.status(200).json(updatedMembership);
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Invalid role')) {
      return sendErrorResponse(res, 404, error.message);
    }
    if (error.message.includes('permission') || error.message.includes('cannot assign') || error.message.includes('cannot update your own')) {
        return sendErrorResponse(res, 403, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to update user role.', { details: error.message });
  }
};

const removeUser = async (req, res) => {
  try {
    const { userId } = req.params; // userId to remove (target user)
    const organizationId = req.organizationId;
    const currentUserId = req.user.userId; // User performing the action
    const currentUserRole = req.user.role; // Role of user performing the action

    await userTeamService.removeUserFromOrg(userId, organizationId, currentUserId, currentUserRole);
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    if (error.message.includes('permission') || error.message.includes('cannot remove yourself')) {
        return sendErrorResponse(res, 403, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to remove user.', { details: error.message });
  }
};

// Teams (No changes needed here based on the identified V2 document differences)
const getTeams = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { page, limit, sortBy, sortOrder } = req.query;

    const teams = await userTeamService.getAllTeams(organizationId, { page: parseInt(page), limit: parseInt(limit), sortBy, sortOrder });
    res.status(200).json(teams);
  } catch (error) {
    sendErrorResponse(res, 500, 'Failed to retrieve teams.', { details: error.message });
  }
};

const createTeam = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { name, leadIds, memberIds } = req.body;

    if (!name || !Array.isArray(leadIds) || !Array.isArray(memberIds)) {
        return sendErrorResponse(res, 400, 'Team name, leadIds (array), and memberIds (array) are required.');
    }

    const newTeam = await userTeamService.createTeam(organizationId, { name, leadIds, memberIds });
    res.status(201).json(newTeam);
  } catch (error) {
    if (error.message.includes('invalid or not part of this organization')) {
        return sendErrorResponse(res, 400, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to create team.', { details: error.message });
  }
};

const updateTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const organizationId = req.organizationId;
    const updateData = req.body;

    const allowedUpdates = ['name', 'leadIds', 'memberIds'];
    const filteredUpdateData = Object.keys(updateData)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
            obj[key] = updateData[key];
            return obj;
        }, {});

    if (Object.keys(filteredUpdateData).length === 0) {
        return sendErrorResponse(res, 400, 'No valid fields provided for update.');
    }

    const updatedTeam = await userTeamService.updateTeam(teamId, organizationId, filteredUpdateData);
    res.status(200).json(updatedTeam);
  } catch (error) {
    if (error.message.includes('Team not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    if (error.message.includes('invalid or not members')) {
        return sendErrorResponse(res, 400, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to update team.', { details: error.message });
  }
};

const deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const organizationId = req.organizationId;
    await userTeamService.deleteTeam(teamId, organizationId);
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('Team not found')) {
      return sendErrorResponse(res, 404, error.message);
    }
    sendErrorResponse(res, 500, 'Failed to delete team.', { details: error.message });
  }
};


module.exports = {
  getUsers,
  inviteUser,
  updateUserRole, // Renamed
  removeUser,
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
};