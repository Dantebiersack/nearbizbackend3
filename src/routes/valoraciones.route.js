// src/routes/valoraciones.route.js
const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");

const router = Router();

// GET /api/Valoraciones?includeInactive=false
router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    const q = includeInactive
      ? `SELECT "id_valoracion","id_cita","id_cliente","id_negocio","calificacion","comentario","fecha","estado"
         FROM "Valoraciones" ORDER BY "id_valoracion";`
      : `SELECT "id_valoracion","id_cita","id_cliente","id_negocio","calificacion","comentario","fecha","estado"
         FROM "Valoraciones" WHERE "estado"=TRUE ORDER BY "id_valoracion";`;
    const { rows } = await db.query(q);
    const data = rows.map(v => ({
      IdValoracion: v.id_valoracion,
      IdCita: v.id_cita,
      IdCliente: v.id_cliente,
      IdNegocio: v.id_negocio,
      Calificacion: v.calificacion,
      Comentario: v.comentario,
      Fecha: v.fecha,
      Estado: v.estado
    }));
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// GET /api/Valoraciones/{id}
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `SELECT "id_valoracion","id_cita","id_cliente","id_negocio","calificacion","comentario","fecha","estado"
       FROM "Valoraciones" WHERE "id_valoracion"=$1;`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    const v = rows[0];
    return res.json({
      IdValoracion: v.id_valoracion,
      IdCita: v.id_cita,
      IdCliente: v.id_cliente,
      IdNegocio: v.id_negocio,
      Calificacion: v.calificacion,
      Comentario: v.comentario,
      Fecha: v.fecha,
      Estado: v.estado
    });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// POST /api/Valoraciones
router.post("/", async (req, res) => {
  try {
    const dto = req.body; // { IdCita, IdCliente, IdNegocio, Calificacion, Comentario }
    const ins = await db.query(
      `INSERT INTO "Valoraciones"
        ("id_cita","id_cliente","id_negocio","calificacion","comentario","estado")
       VALUES ($1,$2,$3,$4,$5,TRUE)
       RETURNING "id_valoracion","id_cita","id_cliente","id_negocio","calificacion","comentario","fecha","estado";`,
      [dto.IdCita, dto.IdCliente, dto.IdNegocio, dto.Calificacion, dto.Comentario ?? null]
    );
    const v = ins.rows[0];
    return created(res, `/api/Valoraciones/${v.id_valoracion}`, {
      IdValoracion: v.id_valoracion,
      IdCita: v.id_cita,
      IdCliente: v.id_cliente,
      IdNegocio: v.id_negocio,
      Calificacion: v.calificacion,
      Comentario: v.comentario,
      Fecha: v.fecha,
      Estado: v.estado
    });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PUT /api/Valoraciones/{id}
router.put("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dto = req.body; // { Calificacion, Comentario }
    await db.query(
      `UPDATE "Valoraciones" SET "calificacion"=$1,"comentario"=$2 WHERE "id_valoracion"=$3;`,
      [dto.Calificacion, dto.Comentario ?? null, id]
    );
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// DELETE soft
router.delete("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Valoraciones" SET "estado"=FALSE WHERE "id_valoracion"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PATCH restore
router.patch("/:id(\\d+)/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Valoraciones" SET "estado"=TRUE WHERE "id_valoracion"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;
