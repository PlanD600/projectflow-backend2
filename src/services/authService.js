const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/tokenUtils');
const { generateOtp, sendOtp, verifyOtp } = require('../utils/otpUtils');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const otpStore = {}; // { phone: { code: '...', expiresAt: Date } }

// רישום משתמש חדש - אימייל + סיסמה (טלפון אופציונלי)
const registerUserWithEmail = async (fullName, email, password, organizationName) => {
  // בדוק אם המשתמש כבר קיים עם אימייל
  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    throw new Error('User with this email already exists.');
  }
  // צור את הארגון והמשתמש החדש
  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName }
    });

    user = await tx.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        // phone: null (טלפון אופציונלי)
      }
    });

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
    user: { id: result.user.id, email: result.user.email }
  };
};

// התחברות עם אימייל וסיסמה בלבד
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

// --- פונקציות טלפון/OTP נשארות לשימוש עתידי ---
// רישום משתמש עם טלפון (אופציה עתידית)
const registerUser = async (fullName, phone, organizationName) => {
  const formattedPhone = phone.replace(/\s/g, '');
  let user = await prisma.user.findUnique({ where: { phone: formattedPhone } });

  if (user) {
    throw new Error('User with this phone number already exists.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: organizationName }
    });

    user = await tx.user.create({
      data: {
        fullName,
        phone: formattedPhone,
      }
    });

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'SUPER_ADMIN',
      }
    });

    return { user, organization };
  });

  const otpCode = generateOtp();
  otpStore[formattedPhone] = { code: otpCode, expiresAt: new Date(Date.now() + 5 * 60 * 1000) };
  await sendOtp(formattedPhone, otpCode);

  return { message: 'Registration successful. Please verify OTP to log in.' };
};

const sendOtpForLogin = async (phone) => {
  const formattedPhone = phone.replace(/\s/g, '');

  const user = await prisma.user.findUnique({ where: { phone: formattedPhone } });
  if (!user) {
    throw new Error('אופס, נראה שעדיין לא הכרנו! בואו נתחיל - הירשמו עכשיו כדי להתחיל לנהל פרויקטים.');
  }

  const otpCode = generateOtp();
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

// --- פרטי משתמש ומנויים ---

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
  registerUserWithEmail,    // הרשמה עם אימייל וסיסמה
  loginWithEmail,           // התחברות עם אימייל וסיסמה
  registerUser,             // הרשמה עם טלפון (אופציה עתידית)
  sendOtpForLogin,          // התחברות עם טלפון (אופציה עתידית)
  verifyOtpAndLogin,        // אימות OTP (אופציה עתידית)
  getMyMemberships,
  getMyProfile,
  updateMyProfile,
  updateProfilePicture,
};