const Joi = require('joi');

const inviteUserSchema = Joi.object({
  fullName: Joi.string().min(2).required(),
  phone: Joi.string().min(9).max(20).required(),
  email: Joi.string().email().required(),
  jobTitle: Joi.string().allow('', null),
  role: Joi.string().valid('SUPER_ADMIN', 'ADMIN', 'TEAM_LEADER', 'EMPLOYEE').required(),
  password: Joi.string().min(6).required(), // <-- השורה החדשה והחשובה
});

const updateUserEmailSchema = Joi.object({
  email: Joi.string().email().required(),
});

const updateUserPasswordSchema = Joi.object({
  password: Joi.string().min(6).required(),
});

module.exports = {
  inviteUserSchema,
  updateUserEmailSchema,
  updateUserPasswordSchema,
};