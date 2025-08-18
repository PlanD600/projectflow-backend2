const bcrypt = require('bcrypt'); // ודא ששורה זו קיימת בראש הקובץ
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
 * הודעות שגיאה בעברית
 */
const errorsHe = {
  "Invalid role": "הרשאה לא תקינה.",
  "User is already a member of this organization.": "המשתמש כבר חבר בארגון.",
  "Target user not found in this organization.": "המשתמש לא נמצא בארגון.",
  "You do not have sufficient permissions to modify this user's role.": "אין לך הרשאה לעדכן את המשתמש הזה.",
  "You cannot update your own role using this endpoint.": "אינך יכול לעדכן את ההרשאה שלך בעצמך.",
  "You cannot remove yourself from the organization.": "אינך יכול להסיר את עצמך מהארגון.",
  "You do not have sufficient permissions to remove a user with an equal or higher role.": "אין לך הרשאה להסיר משתמש עם הרשאה שווה או גבוהה.",
  "Email is already in use.": "האימייל כבר בשימוש.",
  "Email format is invalid.": "פורמט אימייל לא תקין.",
  "One or more specified leads or members are invalid or not part of this organization.": "חבר צוות לא שייך לארגון.",
  "Team not found in this organization.": "הצוות לא נמצא בארגון.",
  "One or more specified leads are invalid or not members of this organization.": "ראשי צוות לא תקינים או לא חברים בארגון.",
  "One or more specified members are invalid or not members of this organization.": "חברי צוות לא תקינים או לא חברים בארגון.",
  "Password must be at least 6 characters.": "הסיסמה חייבת לכלול לפחות 6 תווים.",
};

function translateError(message) {
  if (!message) return "התרחשה שגיאה לא ידועה.";
  for (const [key, val] of Object.entries(errorsHe)) {
    if (message.includes(key)) return val;
  }
  return message;
}

/**
 * בדיקת פורמט אימייל
 */
function isValidEmail(email) {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

/**
 * Retrieves a list of all user memberships in the current organization, with pagination and sorting.
 */
const getAllUserMembershipsInOrg = async (organizationId, { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) => {
  const offset = (page - 1) * limit;
  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    skip: offset,
    take: limit,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      user: { select: { id: true, fullName: true, email: true, profilePictureUrl: true, jobTitle: true } },
      organization: { select: { id: true, name: true } }
    }
  });
  const totalMemberships = await prisma.membership.count({ where: { organizationId } });
  const totalPages = Math.ceil(totalMemberships / limit);
  return {
    data: memberships,
    totalItems: totalMemberships,
    totalPages,
    currentPage: page,
  };
};

/**
 * Invites a new user to the organization. If user doesn't exist, creates them.
 * Automatically sends an OTP to their phone.
 * @returns {Promise<object>} The newly created or updated user object (as a Membership).
 */
const inviteUser = async (organizationId, { fullName, phone, jobTitle, email, role, password }) => {
    // 1. ולידציה בסיסית
    if (!ROLE_HIERARCHY.hasOwnProperty(role)) {
        throw new Error("Invalid role");
    }
    if (!email || !isValidEmail(email)) {
        throw new Error("Email format is invalid.");
    }

    // 2. בדיקה אם משתמש עם האימייל הזה כבר קיים
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
        // --- מקרה א': המשתמש קיים במערכת ---
        
        // בודקים אם הוא כבר חבר בארגון הנוכחי
        const membership = await prisma.membership.findUnique({
            where: { userId_organizationId: { userId: existingUser.id, organizationId } }
        });

        if (membership) {
            // אם כן, זורקים שגיאה שהוא כבר חבר
            throw new Error("User is already a member of this organization.");
        } else {
            // אם לא, פשוט מוסיפים את המשתמש הקיים לארגון.
            // חשוב: אנחנו לא נוגעים בסיסמה שלו.
            return prisma.membership.create({
                data: {
                    userId: existingUser.id,
                    organizationId,
                    role,
                },
                include: { user: true, organization: true }
            });
        }
    } else {
        // --- מקרה ב': המשתמש חדש לגמרי ---

        // בודקים שהסיסמה תקינה
        if (!password || password.length < 6) {
            throw new Error("Password must be at least 6 characters.");
        }        

        // מצפינים את הסיסמה לפני השמירה
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // יוצרים את המשתמש והחברות שלו בארגון בתוך טרנזקציה אחת (למניעת חצאי פעולות)
        const newMembership = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    fullName,
                    phone,
                    jobTitle,
                    email,
                    password: hashedPassword, // שמירת הסיסמה המוצפנת
                },
            });
            return tx.membership.create({
                data: {
                    userId: newUser.id,
                    organizationId,
                    role,
                },
                include: { user: true, organization: true }
            });
        });

        // אין יותר צורך ב-OTP, כי קבענו סיסמה
        return newMembership;
    }
};

/**
 * Updates a user's role within an organization.
 */
const updateUserRoleInOrg = async (targetUserId, organizationId, currentUserId, currentUserRole, { role: newRole }) => {
  if (targetUserId === currentUserId) {
    throw new Error(translateError("You cannot update your own role using this endpoint."));
  }
  const targetMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
    include: { user: true, organization: true }
  });
  if (!targetMembership) {
    throw new Error(translateError("Target user not found in this organization."));
  }
  const targetUserRole = targetMembership.role;
  if (!ROLE_HIERARCHY.hasOwnProperty(newRole)) {
    throw new Error(translateError("Invalid role"));
  }
  if (ROLE_HIERARCHY[currentUserRole] <= ROLE_HIERARCHY[targetUserRole] ||
      ROLE_HIERARCHY[currentUserRole] <= ROLE_HIERARCHY[newRole]) {
    throw new Error(translateError("You do not have sufficient permissions to modify this user's role."));
  }
  const updatedMembership = await prisma.membership.update({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
    data: { role: newRole },
    include: { user: true, organization: true }
  });
  return updatedMembership;
};

/**
 * Removes a user from the organization by deleting their membership.
 */
const removeUserFromOrg = async (targetUserId, organizationId, currentUserId, currentUserRole) => {
  if (targetUserId === currentUserId) {
    throw new Error(translateError("You cannot remove yourself from the organization."));
  }
  const targetMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
  });
  if (!targetMembership) {
    throw new Error(translateError("Target user not found in this organization."));
  }
  const targetUserRole = targetMembership.role;
  if (ROLE_HIERARCHY[currentUserRole] <= ROLE_HIERARCHY[targetUserRole]) {
    throw new Error(translateError("You do not have sufficient permissions to remove a user with an equal or higher role."));
  }
  await prisma.$transaction(async (tx) => {
    // ... (כמו בקוד שלך, מחיקת שורות קשורות)
    // מחיקת החברות עצמה
    await tx.membership.delete({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
  });
};

/* ---------- עריכת אימייל למשתמש קיים ---------- */
const updateUserEmail = async (targetUserId, organizationId, email, currentUserId, currentUserRole) => {
  if (!email || !isValidEmail(email)) {
    throw new Error(translateError("Email format is invalid."));
  }
  // הרשאות: רק אדמין/סופר אדמין, ואסור לערוך לעצמך
  if (targetUserId === currentUserId) {
    throw new Error(translateError("permission"));
  }
  const targetMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
  });
  if (!targetMembership) {
    throw new Error(translateError("Target user not found in this organization."));
  }
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    throw new Error(translateError("Target user not found in this organization."));
  }
  // אימייל חייב להיות ייחודי
  const userByEmail = await prisma.user.findUnique({ where: { email } });
  if (userByEmail && userByEmail.id !== targetUserId) {
    throw new Error(translateError("Email is already in use."));
  }
  // עדכון אימייל
  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { email },
  });
  return updatedUser;
};

/* ---------- עריכת סיסמה למשתמש קיים ---------- */
const updateUserPassword = async (targetUserId, organizationId, newPassword, currentUserId, currentUserRole) => {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new Error(translateError("Password must be at least 6 characters."));
  }
  // הרשאות: רק אדמין/סופר אדמין, ואסור לערוך לעצמך
  if (targetUserId === currentUserId) {
    throw new Error(translateError("permission"));
  }
  const targetMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId } },
  });
  if (!targetMembership) {
    throw new Error(translateError("Target user not found in this organization."));
  }
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    throw new Error(translateError("Target user not found in this organization."));
  }
  // הצפנת סיסמה
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  await prisma.user.update({
    where: { id: targetUserId },
    data: { password: hashedPassword },
  });
};

/* --- צוותים --- */
const getAllTeams = async (organizationId, userId, userRole, { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc' }) => {
    const offset = (page - 1) * limit;

    let whereClause = {
        organizationId: organizationId,
    };

    // 💡 תיקון: הוספת לוגיקת הרשאות וסינון
    if (userRole === 'EMPLOYEE' || userRole === 'TEAM_LEADER') {
        whereClause.OR = [
            // צוותים שבהם המשתמש הוא ראש צוות
            { teamLeads: { some: { userId: userId } } },
            // צוותים שבהם המשתמש הוא חבר צוות
            { teamMembers: { some: { userId: userId } } },
        ];
    }

    const teams = await prisma.team.findMany({
        where: whereClause,
        skip: offset,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
            teamLeads: { include: { user: true } },
            teamMembers: { include: { user: true } }
        }
    });


  const formattedTeams = teams.map(team => ({
    ...team,
    leads: team.teamLeads.map(tl => tl.user),
    members: team.teamMembers.map(tm => tm.user),
    leadIds: team.teamLeads.map(tl => tl.userId),
    memberIds: team.teamMembers.map(tm => tm.userId),
    teamLeads: undefined,
    teamMembers: undefined,
  }));
  const totalTeams = await prisma.team.count({ where: { organizationId } });
  const totalPages = Math.ceil(totalTeams / limit);
  return {
    data: formattedTeams,
    totalItems: totalTeams,
    totalPages,
    currentPage: page,
  };
};

const createTeam = async (organizationId, { name, leadIds, memberIds }) => {
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
      throw new Error(translateError("One or more specified leads or members are invalid or not part of this organization."));
    }
  }
  const newTeam = await prisma.team.create({
    data: {
      organizationId,
      name,
      teamLeads: { create: (leadIds || []).map(userId => ({ userId })) },
      teamMembers: { create: (memberIds || []).map(userId => ({ userId })) }
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

const updateTeam = async (teamId, organizationId, updateData) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId, organizationId },
  });
  if (!team) {
    throw new Error(translateError("Team not found in this organization."));
  }
  const { name, leadIds, memberIds } = updateData;
  await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.team.update({ where: { id: teamId }, data: { name } });
    }
    if (leadIds !== undefined) {
      const existingLeads = await tx.user.findMany({
        where: {
          id: { in: leadIds },
          memberships: { some: { organizationId: organizationId, userId: { in: leadIds } } }
        },
        select: { id: true }
      });
      if (existingLeads.length !== leadIds.length) {
        throw new Error(translateError("One or more specified leads are invalid or not members of this organization."));
      }
      await tx.teamLead.deleteMany({ where: { teamId } });
      await tx.teamLead.createMany({ data: leadIds.map(userId => ({ teamId, userId })) });
    }
    if (memberIds !== undefined) {
      const existingMembers = await tx.user.findMany({
        where: {
          id: { in: memberIds },
          memberships: { some: { organizationId: organizationId, userId: { in: memberIds } } }
        },
        select: { id: true }
      });
      if (existingMembers.length !== memberIds.length) {
        throw new Error(translateError("One or more specified members are invalid or not members of this organization."));
      }
      await tx.teamMember.deleteMany({ where: { teamId } });
      await tx.teamMember.createMany({ data: memberIds.map(userId => ({ teamId, userId })) });
    }
  });
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

const deleteTeam = async (teamId, organizationId) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId, organizationId },
  });
  if (!team) {
    throw new Error(translateError("Team not found in this organization."));
  }
  await prisma.$transaction([
    prisma.teamLead.deleteMany({ where: { teamId } }),
    prisma.teamMember.deleteMany({ where: { teamId } }),
    prisma.team.delete({ where: { id: teamId } }),
  ]);
};

module.exports = {
  getAllUserMembershipsInOrg,
  inviteUser,
  updateUserRoleInOrg,
  removeUserFromOrg,
  updateUserEmail,
  updateUserPassword,
  getAllTeams,
  createTeam,
  updateTeam,
  deleteTeam,
};