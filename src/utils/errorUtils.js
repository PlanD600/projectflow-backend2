// src/utils/errorUtils.js
const sendErrorResponse = (res, statusCode, message, errors = null) => {
    res.status(statusCode).json({ message, errors });
  };
  
  module.exports = {
    sendErrorResponse,
  };