const userTeamService = require('../services/userTeamService');
const { sendErrorResponse } = require('../utils/errorUtils');

// הודעות שגיאה ללקוח בעברית
const errorsHe = {
  "Failed to retrieve user memberships.": "נכשל בקבלת רשימת משתמשים.",
  "Full name, phone, job title, email, and role are required for invitation.": "נא למלא שם מלא, טלפון, תפקיד, אימייל והרשאה.",
  "User is already a member": "המשתמש כבר חבר בארגון.",
  "Invalid role": "הרשאה לא תקינה.",
  "email": "האימייל כבר בשימוש או לא תקין.",
  "Failed to invite user.": "הזמנת המשתמש נכשלה.",
  "Role is required for user role update.": "יש לבחור הרשאה לעדכון.",
  "not found": "משתמש לא נמצא.",
  "permission": "אין לך הרשאה לבצע פעולה זו.",
  "cannot assign": "אינך יכול להקצות הרשאה זו.",
  "cannot update your own": "אין אפשרות לעדכן את עצמך.",
  "Failed to update user role.": "עדכון ההרשאה נכשל.",
  "cannot remove yourself": "אינך יכול להסיר את עצמך.",
  "Failed to remove user.": "הסרת המשתמש נכשלה.",
  "Email is required for update.": "נא להזין אימייל לעדכון.",
  "Failed to update user email.": "עדכון האימייל נכשל.",
  "Password must be at least 6 characters.": "הסיסמה חייבת לכלול לפחות 6 תווים.",
  "Failed to update user password.": "עדכון הסיסמה נכשל.",
  "Failed to retrieve teams.": "נכשל בקבלת רשימת הצוותים.",
  "Team name, leadIds (array), and memberIds (array) are required.": "יש להזין שם צוות, ראשי צוותים וחברי צוות.",
  "invalid or not part of this organization": "חבר צוות לא שייך לארגון.",
  "Failed to create team.": "יצירת צוות נכשלה.",
  "No valid fields provided for update.": "לא נבחרו שדות תקינים לעדכון.",
  "Team not found": "הצוות לא נמצא.",
  "invalid or not members": "משתמשים לא תקינים או לא חברים בצוות.",
  "Failed to update team.": "עדכון הצוות נכשל.",
  "Failed to delete team.": "מחיקת הצוות נכשלה."
};

function translateError(message) {
  if (!message) return "התרחשה שגיאה לא ידועה.";
  for (const [key, val] of Object.entries(errorsHe)) {
    if (message.includes(key)) return val;
  }
  return message; // fallback: return the English if not mapped
}

/* --- Users --- */
const getUsers = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { page, limit, sortBy, sortOrder } = req.query;
    const users = await userTeamService.getAllUserMembershipsInOrg(organizationId, { page: parseInt(page), limit: parseInt(limit), sortBy, sortOrder });
    res.status(200).json(users);
  } catch (error) {
    sendErrorResponse(res, 500, translateError("Failed to retrieve user memberships."), { details: error.message });
  }
};

const inviteUser = async (req, res) => {
    try {
        const organizationId = req.organizationId;
        // 1. הוסף את password לרשימת המשתנים מה-body
        const { fullName, phone, jobTitle, email, role, password } = req.body; 

        // הולידציה שלך כבר מטפלת בשדות חסרים, אבל נוודא שהסיסמה מועברת
        if (!fullName || !phone || !role || jobTitle === undefined || !email || !password) {
            return sendErrorResponse(res, 400, translateError("Full name, phone, job title, email, and role are required for invitation."));
        }

        // 2. העבר את password לאובייקט שנשלח לסרוויס
        const newMembership = await userTeamService.inviteUser(organizationId, { fullName, phone, jobTitle, email, role, password });
        res.status(201).json(newMembership);
    } catch (error) {
        // פיצול תנאי השגיאה כדי לתת הודעה מדויקת
        if (error.message.includes('User is already a member')) {
            return sendErrorResponse(res, 409, translateError("User is already a member")); // 409 Conflict
        }
        if (error.message.includes('Email format is invalid')) {
            return sendErrorResponse(res, 400, "האימייל שהוזן אינו תקין.");
        }
        if (error.message.includes('Email is already in use')) {
            return sendErrorResponse(res, 409, "משתמש עם אימייל זה כבר קיים במערכת."); // 409 Conflict
        }
        if (error.message.includes('Invalid role')) {
            return sendErrorResponse(res, 400, translateError("Invalid role"));
        }
        
        // הודעת שגיאה כללית לכל מקרה אחר
        sendErrorResponse(res, 500, translateError("Failed to invite user."), { details: error.message });
    }
};

const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organizationId;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;
    const { role } = req.body;

    if (!role) {
      return sendErrorResponse(res, 400, translateError("Role is required for user role update."));
    }

    const updatedMembership = await userTeamService.updateUserRoleInOrg(userId, organizationId, currentUserId, currentUserRole, { role });
    res.status(200).json(updatedMembership);
  } catch (error) {
    if (error.message.includes('not found')) {
      return sendErrorResponse(res, 404, translateError("not found"));
    }
    if (error.message.includes('Invalid role')) {
      return sendErrorResponse(res, 404, translateError("Invalid role"));
    }
    if (error.message.includes('permission')) {
      return sendErrorResponse(res, 403, translateError("permission"));
    }
    if (error.message.includes('cannot assign')) {
      return sendErrorResponse(res, 403, translateError("cannot assign"));
    }
    if (error.message.includes('cannot update your own')) {
      return sendErrorResponse(res, 403, translateError("cannot update your own"));
    }
    sendErrorResponse(res, 500, translateError("Failed to update user role."), { details: error.message });
  }
};

const removeUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organizationId;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;

    await userTeamService.removeUserFromOrg(userId, organizationId, currentUserId, currentUserRole);
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('not found')) {
      return sendErrorResponse(res, 404, translateError("not found"));
    }
    if (error.message.includes('permission')) {
      return sendErrorResponse(res, 403, translateError("permission"));
    }
    if (error.message.includes('cannot remove yourself')) {
      return sendErrorResponse(res, 403, translateError("cannot remove yourself"));
    }
    sendErrorResponse(res, 500, translateError("Failed to remove user."), { details: error.message });
  }
};

/* --- ADMIN/SUPER_ADMIN: Edit Email --- */
const updateUserEmail = async (req, res) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organizationId;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;
    const { email } = req.body;

    if (!email) {
      return sendErrorResponse(res, 400, translateError("Email is required for update."));
    }

    const updatedUser = await userTeamService.updateUserEmail(userId, organizationId, email, currentUserId, currentUserRole);
    res.status(200).json(updatedUser);
  } catch (error) {
    if (error.message.includes('not found')) {
      return sendErrorResponse(res, 404, translateError("not found"));
    }
    if (error.message.includes('email')) {
      return sendErrorResponse(res, 404, translateError("email"));
    }
    if (error.message.includes('permission')) {
      return sendErrorResponse(res, 403, translateError("permission"));
    }
    sendErrorResponse(res, 500, translateError("Failed to update user email."), { details: error.message });
  }
};

/* --- ADMIN/SUPER_ADMIN: Edit Password --- */
const updateUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const organizationId = req.organizationId;
    const currentUserId = req.user.userId;
    const currentUserRole = req.user.role;
    const { password } = req.body;

    if (!password || typeof password !== 'string' || password.length < 6) {
      return sendErrorResponse(res, 400, translateError("Password must be at least 6 characters."));
    }

    await userTeamService.updateUserPassword(userId, organizationId, password, currentUserId, currentUserRole);
    res.status(200).json({ message: "הסיסמה עודכנה בהצלחה." });
  } catch (error) {
    if (error.message.includes('not found')) {
      return sendErrorResponse(res, 404, translateError("not found"));
    }
    if (error.message.includes('permission')) {
      return sendErrorResponse(res, 403, translateError("permission"));
    }
    sendErrorResponse(res, 500, translateError("Failed to update user password."), { details: error.message });
  }
};

/* --- Teams --- */
const getTeams = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { page, limit, sortBy, sortOrder } = req.query;

    const teams = await userTeamService.getAllTeams(organizationId, { page: parseInt(page), limit: parseInt(limit), sortBy, sortOrder });
    res.status(200).json(teams);
  } catch (error) {
    sendErrorResponse(res, 500, translateError("Failed to retrieve teams."), { details: error.message });
  }
};

const createTeam = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const { name, leadIds, memberIds } = req.body;

    if (!name || !Array.isArray(leadIds) || !Array.isArray(memberIds)) {
      return sendErrorResponse(res, 400, translateError("Team name, leadIds (array), and memberIds (array) are required."));
    }

    const newTeam = await userTeamService.createTeam(organizationId, { name, leadIds, memberIds });
    res.status(201).json(newTeam);
  } catch (error) {
    if (error.message.includes('invalid or not part of this organization')) {
      return sendErrorResponse(res, 400, translateError("invalid or not part of this organization"));
    }
    sendErrorResponse(res, 500, translateError("Failed to create team."), { details: error.message });
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
      return sendErrorResponse(res, 400, translateError("No valid fields provided for update."));
    }

    const updatedTeam = await userTeamService.updateTeam(teamId, organizationId, filteredUpdateData);
    res.status(200).json(updatedTeam);
  } catch (error) {
    if (error.message.includes('Team not found')) {
      return sendErrorResponse(res, 404, translateError("Team not found"));
    }
    if (error.message.includes('invalid or not members')) {
      return sendErrorResponse(res, 400, translateError("invalid or not members"));
    }
    sendErrorResponse(res, 500, translateError("Failed to update team."), { details: error.message });
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
      return sendErrorResponse(res, 404, translateError("Team not found"));
    }
    sendErrorResponse(res, 500, translateError("Failed to delete team."), { details: error.message });
  }
};

module.exports = {
  getUsers,
  inviteUser,
  updateUserRole,
  removeUser,
  updateUserEmail,
  updateUserPassword,
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
};