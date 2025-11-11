// src/middleware/role.js
function allowRoles(...roles) {
  return (req, res, next) => {
    const r = req.user?.rol;
    if (!r || !roles.includes(r)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}
module.exports = { allowRoles };
