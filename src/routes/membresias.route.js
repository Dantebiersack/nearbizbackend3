// src/routes/membresias.route.js
const { Router } = require("express");
const db = require("../db");
// const { authRequired, allowRoles } = require("../middleware/auth");

const router = Router();

// ---------- helpers ----------
function mapRow(row) {
  // MembresiaReadDto
  return {
    IdMembresia: row.id_membresia,
    PrecioMensual: row.precio_mensual,
    IdNegocio: row.id_negocio,
    Estado: row.estado,
    UltimaRenovacion: row.ultima_renovacion
      ? new Date(row.ultima_renovacion).toISOString()
      : null,
  };
}
function mapAdminRow(row) {
  // MembresiaAdminRowDto (incluye NombreNegocio)
  return {
    IdMembresia: row.id_membresia,
    IdNegocio: row.id_negocio,
    NombreNegocio: row.negocio_nombre,
    PrecioMensual: row.precio_mensual,
    Estado: row.estado,
    UltimaRenovacion: row.ultima_renovacion
      ? new Date(row.ultima_renovacion).toISOString()
      : null,
  };
}

// ===================================================================
// GET /api/Membresias/admin?includeInactive=true|false
// Listado “admin” con join a Negocios (nombre) + filtro por estado
// ===================================================================
router.get(
  "/admin",
  /*authRequired, allowRoles("adminNearbiz"),*/ async (req, res) => {
    try {
      const includeInactive =
        (req.query.includeInactive || "false").toLowerCase() === "true";

      const q = `
        SELECT m."id_membresia", m."precio_mensual", m."estado",
               m."ultima_renovacion",
               n."id_negocio", n."nombre" AS negocio_nombre
        FROM "Membresias" m
        JOIN "Negocios" n ON n."id_negocio" = m."id_negocio"
        ${includeInactive ? "" : `WHERE m."estado"=TRUE`}
        ORDER BY m."id_membresia";
      `;
      const { rows } = await db.query(q);
      return res.json(rows.map(mapAdminRow));
    } catch (e) {
      return res.status(500).json({ message: "Error", detail: String(e) });
    }
  }
);

// ==========================================================
// GET /api/Membresias
// Activas sin join (lista “pública”)
// ==========================================================
router.get("/", /*authRequired,*/ async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT "id_membresia","precio_mensual","id_negocio","estado","ultima_renovacion"
      FROM "Membresias" WHERE "estado"=TRUE
      ORDER BY "id_membresia";
    `);
    return res.json(rows.map(mapRow));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ==========================================================
// GET /api/Membresias/:id
// ==========================================================
router.get("/:id", /*authRequired,*/ async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `
      SELECT "id_membresia","precio_mensual","id_negocio","estado","ultima_renovacion"
      FROM "Membresias" WHERE "id_membresia"=$1
      LIMIT 1;
    `,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "No encontrado" });
    return res.json(mapRow(rows[0]));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ==========================================================
// GET /api/Membresias/negocio/:idNegocio
// (útil para ver la membresía de un negocio concreto)
// ==========================================================
router.get("/negocio/:idNegocio", /*authRequired,*/ async (req, res) => {
  try {
    const idNegocio = Number(req.params.idNegocio);
    const { rows } = await db.query(
      `
      SELECT "id_membresia","precio_mensual","id_negocio","estado","ultima_renovacion"
      FROM "Membresias"
      WHERE "id_negocio"=$1
      ORDER BY "id_membresia" DESC
      LIMIT 1;
    `,
      [idNegocio]
    );
    if (!rows.length) return res.status(404).json({ message: "No encontrado" });
    return res.json(mapRow(rows[0]));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ==========================================================
// POST /api/Membresias
// body: { PrecioMensual?, IdNegocio, UltimaRenovacion? }
// Crea y (si quieres) actualiza el FK en Negocios.id_membresia
// ==========================================================
router.post("/", /*authRequired, allowRoles("adminNearbiz"),*/ async (req, res) => {
  try {
    const { PrecioMensual, IdNegocio, UltimaRenovacion } = req.body || {};

    const insertSql = `
      INSERT INTO "Membresias"
      ("precio_mensual","id_negocio","estado","ultima_renovacion")
      VALUES ($1,$2,TRUE,$3)
      RETURNING "id_membresia","precio_mensual","id_negocio","estado","ultima_renovacion";
    `;
    const { rows } = await db.query(insertSql, [
      PrecioMensual ?? null,
      IdNegocio,
      UltimaRenovacion ? new Date(UltimaRenovacion) : null,
    ]);

    const created = rows[0];

    // (Opcional) reflejar en Negocios.id_membresia
    await db.query(
      `UPDATE "Negocios" SET "id_membresia"=$1 WHERE "id_negocio"=$2;`,
      [created.id_membresia, created.id_negocio]
    );

    return res.status(201).json(mapRow(created));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ==========================================================
// PUT /api/Membresias/:id
// body: { PrecioMensual?, IdNegocio, UltimaRenovacion? }
// ==========================================================
// src/routes/membresias.route.js (PUT /:id)
// src/routes/membresias.route.js
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { PrecioMensual, IdNegocio } = req.body ?? {};

    const { rows } = await db.query(
      `
      UPDATE "Membresias" m
      SET
        "precio_mensual" = COALESCE($1, m."precio_mensual"),
        "id_negocio"     = COALESCE($2, m."id_negocio")
        FROM "Negocios" AS n
      WHERE m."id_membresia" = $3
      RETURNING
        m."id_membresia", m."precio_mensual", m."estado",
        n."id_negocio", n."nombre" AS negocio_nombre
      ;
      `,
      [PrecioMensual ?? null, IdNegocio ?? null, id]
    );

    if (!rows.length) return res.status(404).json({ message: "No encontrado" });
    const r = rows[0];
    res.json({
      IdMembresia: r.id_membresia,
      PrecioMensual: r.precio_mensual,
      Estado: r.estado,
      IdNegocio: r.id_negocio,
      NombreNegocio: r.negocio_nombre,
    });
  } catch (e) {
    res.status(500).json({ message: "Error actualizando", detail: String(e) });
  }
});



// ==========================================================
// DELETE (soft) /api/Membresias/:id  -> estado=false
// ==========================================================
router.delete("/:id", /*authRequired, allowRoles("adminNearbiz"),*/ async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await db.query(
      `UPDATE "Membresias" SET "estado"=FALSE WHERE "id_membresia"=$1;`,
      [id]
    );
    if (!rowCount) return res.status(404).json({ message: "No encontrado" });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ==========================================================
// POST /api/Membresias/:id/restore -> estado=true
// ==========================================================
router.post("/:id/restore", /*authRequired, allowRoles("adminNearbiz"),*/ async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await db.query(
      `UPDATE "Membresias" SET "estado"=TRUE WHERE "id_membresia"=$1;`,
      [id]
    );
    if (!rowCount) return res.status(404).json({ message: "No encontrado" });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ==========================================================
// POST /api/Membresias/:id/renew  (marca UltimaRenovacion)
// body opcional: { Fecha?: ISOString }  (por defecto: now UTC)
// ==========================================================
router.post("/:id/renew", /*authRequired, allowRoles("adminNearbiz"),*/ async (req, res) => {
  try {
    const id = Number(req.params.id);
    const when = req.body?.Fecha ? new Date(req.body.Fecha) : new Date();

    const { rows } = await db.query(
      `
      UPDATE "Membresias"
      SET "ultima_renovacion"=$1
      WHERE "id_membresia"=$2
      RETURNING "id_membresia","precio_mensual","id_negocio","estado","ultima_renovacion";
    `,
      [when, id]
    );
    if (!rows.length) return res.status(404).json({ message: "No encontrado" });
    return res.json(mapRow(rows[0]));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;
