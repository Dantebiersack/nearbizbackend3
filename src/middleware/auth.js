// src/middleware/auth.js
const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_KEY, {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });
    req.user = payload; // { sub, rol, iat, exp }
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
module.exports = { authRequired };
