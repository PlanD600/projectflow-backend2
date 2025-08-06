// src/services/authService.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/tokenUtils');
const { generateOtp, sendOtp, verifyOtp } = require('../utils/otpUtils');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const otpStore = {}; // { phone: { code: '...', expiresAt: Date } }

const registerUser = async (fullName, phone, organizationName) => {
  // === תיקון 1: ניקוי מספר הטלפון בתחילת הפונקציה ===
  const formattedPhone = phone.replace(/\s/g, '');

  // בדיקה אם משתמש כבר קיים עם המספר הנקי
  let user = await prisma.user.findUnique({ where: { phone: formattedPhone } });

  if (user) {
    throw new Error('User with this phone number already exists.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: organizationName,
      },
    });

    user = await tx.user.create({
      data: {
        fullName,
        phone: formattedPhone, // === תיקון 2: שמירת המספר הנקי במסד הנתונים ===
      },
    });

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'SUPER_ADMIN',
      },
    });

    return { user, organization };
  });

  const otpCode = generateOtp();
  // === תיקון 3: שימוש במספר הנקי כמפתח ובשליחה ===
  otpStore[formattedPhone] = { code: otpCode, expiresAt: new Date(Date.now() + 5 * 60 * 1000) };
  await sendOtp(formattedPhone, otpCode);

  return { message: 'Registration successful. Please verify OTP to log in.' };
};

const sendOtpForLogin = async (phone) => {
  // === תיקון 1: ניקוי מספר הטלפון בתחילת הפונקציה ===
  const formattedPhone = phone.replace(/\s/g, '');

  // חיפוש משתמש עם המספר הנקי
  const user = await prisma.user.findUnique({ where: { phone: formattedPhone } });
  if (!user) {
    throw new Error('אופס, נראה שעדיין לא הכרנו! בואו נתחיל - הירשמו עכשיו כדי להתחיל לנהל פרויקטים.');
  }

  const otpCode = generateOtp();
  // === תיקון 2: שימוש במספר הנקי כמפתח ובשליחה ===
  otpStore[formattedPhone] = { code: otpCode, expiresAt: new Date(Date.now() + 5 * 60 * 1000) };
  await sendOtp(formattedPhone, otpCode);

  return { message: 'OTP sent successfully.' };
};

const verifyOtpAndLogin = async (phone, otpCode) => {
  const formattedPhone = phone.replace(/\s/g, '');

  const user = await prisma.user.findUnique({
    where: { phone: formattedPhone },
    include: { memberships: { include: { organization: true } } },
  });

  if (!user) {
    throw new Error('User not found.');
  }
  
  // כאן היה באג קטן, תיקנתי את שם המשתנה מ-storedOtpdData ל-storedOtpData
  const storedOtpData = otpStore[formattedPhone];
  if (!storedOtpData || storedOtpData.expiresAt < new Date()) {
    throw new Error('OTP expired or not sent. Please request a new one.');
  }

  if (!verifyOtp(otpCode, storedOtpData.code)) {
    throw new Error('Invalid OTP code.');
  }

  delete otpStore[formattedPhone];

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
      phone: user.phone,
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

const getMyProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      phone: true,
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

const updateMyProfile = async (userId, updates) => {
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updates,
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      profilePictureUrl: true,
      jobTitle: true,
      createdAt: true,
      updatedAt: true
    },
  });
  return updatedUser;
};

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
      phone: true,
      email: true,
      profilePictureUrl: true,
      jobTitle: true,
      createdAt: true,
      updatedAt: true
    },
  });

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
  registerUser,
  sendOtpForLogin,
  verifyOtpAndLogin,
  getMyMemberships,
  getMyProfile,
  updateMyProfile,
  updateProfilePicture,
};