// // src/utils/otpUtils.js
// const otpGenerator = require('otp-generator');

// // ביישום אמיתי, OTPs צריכים להיות מאוחסנים במסד נתונים עם תוקף
// // לצורך הדגמה, נדפיס אותם לקונסול

// /**
//  * Generates a numeric OTP code.
//  * @returns {string} The generated OTP code.
//  */
// const generateOtp = () => {
//   return otpGenerator.generate(6, { digits: true, alphabets: false, upperCaseAlphabets: false, specialChars: false });
// };

// /**
//  * Simulates sending an OTP to a phone number.
//  * In a real application, this would integrate with an SMS service like Twilio.
//  * @param {string} phone - The recipient phone number.
//  * @param {string} otpCode - The OTP code to send.
//  * @returns {Promise<void>}
//  */
// // const sendOtp = async (phone, otpCode) => {
// //   console.log(`--- Sending OTP ---`);
// //   console.log(`To: ${phone}`);
// //   console.log(`OTP Code: ${otpCode}`);
// //   console.log(`-------------------`);
//   // TODO: Integrate with a real SMS service like Twilio here
//   // Example with Twilio (requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env)

// const sendOtp = async (phone, otpCode) => {
// const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
//   try {
//     await client.messages.create({
//       body: `Your ProjectFlow OTP is: ${otpCode}`,
//       from: process.env.TWILIO_PHONE_NUMBER,
//       to: phone
//     });
//     console.log(`OTP sent successfully to ${phone}`);
//   } catch (error) {
//     console.error(`Error sending OTP to ${phone}:`, error);
//     throw new Error('Failed to send OTP.');
//   }
// };

// /**
//  * Simulates OTP storage and verification.
//  * In a real application, this would involve a database lookup for stored OTPs.
//  * @param {string} phone - The phone number.
//  * @param {string} otpCode - The OTP code entered by the user.
//  * @param {string} storedOtp - The OTP code previously stored/sent for this phone.
//  * @returns {boolean} True if the OTP is valid, false otherwise.
//  */
// const verifyOtp = (otpCode, storedOtp) => {
//   // In a real scenario, you'd fetch the stored OTP for the phone number from a database,
//   // check its expiry, and then compare.
//   return otpCode === storedOtp;
// };

// module.exports = {
//   generateOtp,
//   sendOtp,
//   verifyOtp,
// };