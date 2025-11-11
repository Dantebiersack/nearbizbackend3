// src/routes/membresias.route.js
const { Router } = require("express");
const db = require("../db");
// const { authRequired, allowRoles } = require("../middleware/auth");

const router = Router();

// GET /api/Membresias/admin?includeInactive=true
router.get("/admin", /*authRequired, allowRoles("adminNearbiz"),*/ async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";

    const q = `
      SELECT m."id_membresia", m."precio_mensual", m."estado",
             n."id_negocio", n."nombre" AS negocio_nombre
      FROM "Membresias" m
      JOIN "Negocios" n ON n."id_negocio" = m."id_negocio"
      ${includeInactive ? "" : `WHERE m."estado"=TRUE`}
      ORDER BY m."id_membresia";
    `;
    const { rows } = await db.query(q);

    const data = rows.map(x => ({
      IdMembresia: x.id_membresia,
      PrecioMensual: x.precio_mensual,
      Estado: x.estado,
      IdNegocio: x.id_negocio,
      NombreNegocio: x.negocio_nombre
    }));
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;
