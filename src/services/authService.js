// src/services/authService.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/tokenUtils');
const { generateOtp, sendOtp, verifyOtp } = require('../utils/otpUtils');
const fs = require('fs'); // ייבוא חדש
const path = require('path'); // ייבוא חדש

const prisma = new PrismaClient();

// זמני אחסון OTP (לצורך הדגמה בלבד - ביישום אמיתי השתמש במסד נתונים/Redis)
const otpStore = {}; // { phone: { code: '...', expiresAt: Date } }

/**
 * Registers a new user and creates their initial organization.
 * @param {string} fullName
 * @param {string} phone
 * @param {string} organizationName
 * @returns {Promise<object>} Message indicating success.
 */
const registerUser = async (fullName, phone, organizationName) => {
  // Check if user already exists
  let user = await prisma.user.findUnique({ where: { phone } });

  if (user) {
    // If user exists but is not part of an organization, handle accordingly.
    // For simplicity, we'll return an error if phone already registered.
    throw new Error('User with this phone number already exists.');
  }

  

  // Create new organization and user within a transaction
  // Transactions ensure atomicity: either all operations succeed or all fail.
  const result = await prisma.$transaction(async (tx) => {
    organization = await tx.organization.create({
      data: {
        name: organizationName,
      },
    });

    user = await tx.user.create({
      data: {
        fullName,
        phone,
        // For simplicity, we assume an initial role for the first user
        // In a real app, first user of an org would typically be ADMIN/SUPER_ADMIN
      },
    });

    // Create a membership for the new user in the new organization with ADMIN role
    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'SUPER_ADMIN', // The first user to register an organization is an ADMIN
      },
    });

    return { user, organization };
  });

  // Generate and send OTP for immediate login
  const otpCode = generateOtp();
  otpStore[phone] = { code: otpCode, expiresAt: new Date(Date.now() + 5 * 60 * 1000) }; // OTP valid for 5 minutes
  await sendOtp(phone, otpCode);

  return { message: 'Registration successful. Please verify OTP to log in.' };
};

/**
 * Sends an OTP to an existing user for login.
 * @param {string} phone - The user's phone number.
 * @returns {Promise<object>} Message indicating success.
 */
const sendOtpForLogin = async (phone) => {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    throw new Error('User not found.');
  }

  const otpCode = generateOtp();
  otpStore[phone] = { code: otpCode, expiresAt: new Date(Date.now() + 5 * 60 * 1000) }; // OTP valid for 5 minutes
  await sendOtp(phone, otpCode);

  return { message: 'OTP sent successfully.' };
};

/**
 * Verifies OTP and logs in the user, returning JWT and memberships.
 * @param {string} phone - The user's phone number.
 * @param {string} otpCode - The OTP code entered by the user.
 * @returns {Promise<object>} { token, user, memberships }
 */
const verifyOtpAndLogin = async (phone, otpCode) => {
  const user = await prisma.user.findUnique({
    where: { phone },
    include: { memberships: { include: { organization: true } } }, // Include memberships and their organizations
  });

  if (!user) {
    throw new Error('User not found.');
  }

  const storedOtpData = otpStore[phone];
  if (!storedOtpData || storedOtpData.expiresAt < new Date()) {
    throw new Error('OTP expired or not sent. Please request a new one.');
  }

  if (!verifyOtp(otpCode, storedOtpData.code)) {
    throw new Error('Invalid OTP code.');
  }

  // Clear OTP after successful verification (important for security)
  delete otpStore[phone];

  // Assuming user has at least one membership, pick the first for initial token context
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
      // Note: User role itself is not directly on the User model,
      // but through memberships. For simplicity, we'll attach the role from the default membership.
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
 * Fetches memberships for the authenticated user.
 * @param {string} userId - The ID of the authenticated user.
 * @returns {Promise<object[]>} List of memberships.
 */
const getMyMemberships = async (userId) => {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organization: true }, // Include organization details
  });
  return memberships.map(m => ({
    organizationId: m.organizationId,
    role: m.role,
    organization: m.organization
  }));
};

/**
 * Fetches profile of the currently authenticated user.
 * @param {string} userId - The ID of the authenticated user.
 * @returns {Promise<object>} User profile.
 */
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

/**
 * Updates the profile of the authenticated user.
 * @param {string} userId - The ID of the authenticated user.
 * @param {object} updates - Fields to update (fullName, jobTitle, email, profilePictureUrl).
 * @returns {Promise<object>} The updated user profile.
 */
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

/**
 * Updates the profile picture URL of the authenticated user.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} filePath - The path where the new picture is stored.
 * @returns {Promise<object>} The updated user profile.
 */
const updateProfilePicture = async (userId, filePath) => {
    // 1. קבלת נתיב התמונה הנוכחית מהמסד
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { profilePictureUrl: true }
    });

    // 2. עדכון נתיב התמונה החדש במסד הנתונים
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
            profilePictureUrl: `/uploads/${path.basename(filePath)}`, // שמירת הנתיב הציבורי במסד
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

    // 3. מחיקת הקובץ הישן אם קיים
    if (user && user.profilePictureUrl) {
        const oldFilePath = path.join(__dirname, '..', user.profilePictureUrl);
        // לוודא שהקובץ קיים לפני הניסיון למחוק אותו
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