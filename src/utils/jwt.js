// utils/jwt.js
const jsonwebtoken = require("jsonwebtoken");

function signJwt(payload) {
  const key = process.env.JWT_KEY;
  const opts = {
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  };
  return jsonwebtoken.sign(payload, key, opts);
}

function decodeJwt(token) {
  return jsonwebtoken.decode(token, { complete: true });
}

module.exports = { signJwt, decodeJwt };
