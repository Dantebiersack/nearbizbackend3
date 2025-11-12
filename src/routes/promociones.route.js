// src/routes/promociones.route.js
const { Router } = require("express");
const db = require("../db");
const router = Router();

const mapPromo = (p) => ({
  IdPromocion: p.id_promocion,
  IdNegocio: p.id_negocio,
  Titulo: p.titulo,
  Descripcion: p.descripcion,
  FechaInicio: p.fecha_inicio,
  FechaFin: p.fecha_fin,
  Estado: p.estado,
});

router.get("/", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "false") === "true";
    const idNegocio = req.query.idNegocio ? Number(req.query.idNegocio) : null;

    const cond = [];
    if (!includeInactive) cond.push(`"estado"=TRUE`);
    if (idNegocio) cond.push(`"id_negocio"=${idNegocio}`);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const { rows } = await db.query(
      `SELECT * FROM "Promociones" ${where} ORDER BY "id_promocion" DESC`
    );
    res.json(rows.map(mapPromo));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM "Promociones" WHERE "id_promocion"=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    res.json(mapPromo(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.post("/", async (req, res) => {
  try {
    const { idNegocio, titulo, descripcion, fechaInicio, fechaFin } = req.body;
    const { rows } = await db.query(
      `INSERT INTO "Promociones"
       ("id_negocio","titulo","descripcion","fecha_inicio","fecha_fin","estado")
       VALUES ($1,$2,$3,$4,$5,TRUE)
       RETURNING *`,
      [idNegocio, titulo, descripcion || null, fechaInicio, fechaFin]
    );
    res.status(201).json(mapPromo(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { titulo, descripcion, fechaInicio, fechaFin } = req.body;
    const { rowCount } = await db.query(
      `UPDATE "Promociones"
       SET "titulo"=$1,"descripcion"=$2,"fecha_inicio"=$3,"fecha_fin"=$4
       WHERE "id_promocion"=$5`,
      [titulo, descripcion || null, fechaInicio, fechaFin, req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE "Promociones" SET "estado"=FALSE WHERE "id_promocion"=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.patch("/:id/restore", async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE "Promociones" SET "estado"=TRUE WHERE "id_promocion"=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

module.exports = router;
