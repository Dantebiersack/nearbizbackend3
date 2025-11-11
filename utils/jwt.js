// utils/jwt.js
const jwt = require("jsonwebtoken");

function signJwt(payload) {
  const key = process.env.JWT_KEY;
  const opts = {
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
    expiresIn: "1d", // 1 día, como en C#
  };
  return jwt.sign(payload, key, opts);
}

function decodeJwt(token) {
  return jwt.decode(token, { complete: true });
}

module.exports = { signJwt, decodeJwt };
