const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/tokenUtils');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/**
 * הרשמה עם אימייל, סיסמה ושם ארגון:
 * - יוצר משתמש חדש
 * - יוצר ארגון חדש
 * - מוסיף את המשתמש כחבר בארגון (SUPER_ADMIN)
 */
const registerUserWithEmail = async (fullName, email, password, organizationName) => {
  // בדוק אם המשתמש כבר קיים עם אימייל זה
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    throw new Error('User with this email already exists.');
  }
  const hashedPassword = await bcrypt.hash(password, 10);

  // יצירת משתמש, ארגון וחברות בטרנזקציה אחת
  const result = await prisma.$transaction(async (tx) => {
    // צור ארגון חדש
    const organization = await tx.organization.create({
      data: { name: organizationName }
    });

    // צור משתמש חדש
    user = await tx.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword
      }
    });

    // צור חברות (Membership) - המשתמש הוא SUPER_ADMIN בארגון החדש
    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'SUPER_ADMIN',
      }
    });

    return { user, organization };
  });

  return {
    message: 'Registration successful.',
    user: { id: result.user.id, email: result.user.email },
    organization: { id: result.organization.id, name: result.organization.name }
  };
};

/**
 * התחברות עם אימייל וסיסמה בלבד
 * - מחזיר טוקן JWT, פרטי משתמש, והרשאות בכל הארגונים שלו.
 */
const loginWithEmail = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: { include: { organization: true } } },
  });
  if (!user) {
    throw new Error('User not found.');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new Error('Invalid password.');
  }

  if (!user.memberships || user.memberships.length === 0) {
    throw new Error('User has no active memberships. Please contact support.');
  }
  const defaultMembership = user.memberships[0];
  const token = generateToken(user.id, defaultMembership.organizationId, defaultMembership.role);

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      profilePictureUrl: user.profilePictureUrl,
      jobTitle: user.jobTitle,
      role: defaultMembership.role
    },
    memberships: user.memberships.map(m => ({
      organizationId: m.organizationId,
      role: m.role,
      organization: m.organization
    })),
  };
};

/**
 * מחזיר את כל החברות של המשתמש בארגונים
 */
const getMyMemberships = async (userId) => {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: true },
  });
  return memberships.map(m => ({
    organizationId: m.organizationId,
    role: m.role,
    organization: m.organization
  }));
};

/**
 * מחזיר פרופיל משתמש לפי מזהה
 */
const getMyProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      profilePictureUrl: true,
      jobTitle: true,
      createdAt: true,
      updatedAt: true
    },
  });
  if (!user) {
    throw new Error('User profile not found.');
  }
  return user;
};

/**
 * עדכון פרטי משתמש
 */
const updateMyProfile = async (userId, updates) => {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updates,
    select: {
      id: true,
      fullName: true,
      email: true,
      profilePictureUrl: true,
      jobTitle: true,
      createdAt: true,
      updatedAt: true
    },
  });
  return updatedUser;
};

/**
 * עדכון תמונת פרופיל ושמירה של הקובץ החדש
 */
const updateProfilePicture = async (userId, filePath) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePictureUrl: true }
  });

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      profilePictureUrl: `/uploads/${path.basename(filePath)}`,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      profilePictureUrl: true,
      jobTitle: true,
      createdAt: true,
      updatedAt: true
    },
  });

  // מחיקת תמונה ישנה
  if (user && user.profilePictureUrl) {
    const oldFilePath = path.join(__dirname, '..', user.profilePictureUrl);
    if (fs.existsSync(oldFilePath)) {
      fs.unlink(oldFilePath, (err) => {
        if (err) {
          console.error('Error deleting old profile picture:', err);
        } else {
          console.log(`Old file ${oldFilePath} deleted successfully.`);
        }
      });
    }
  }

  return updatedUser;
};

module.exports = {
  registerUserWithEmail,    // הרשמה עם אימייל וסיסמה בלבד ומימוש חברות בארגון
  loginWithEmail,           // התחברות עם אימייל וסיסמה בלבד
  getMyMemberships,
  getMyProfile,
  updateMyProfile,
  updateProfilePicture,
};